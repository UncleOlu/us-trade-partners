"""
Acquisition for the US goods trade partner visualization (BUILD ORDER step 3,
Agent A). Fetches every raw input under a temporary directory, computes the
snapshot_id from the finished manifest, then renames the directory to
raw/<snapshot_id>/ (or raw/<snapshot_id>.invalid/ if the source fingerprint
changed during acquisition).

Run: .venv/bin/python3 pipeline/acquire.py

Reuses pipeline/census_client.py (CensusClient: 60s timeout, up to 3 bounded
retries on 5xx/timeout only, ~0.5s polite delay, redirects disabled, key
stripped before saving) exactly as built and proven in the source test.

Query shapes below are exactly the shapes proven live in the source test
(reports/pipeline/source_test.md): partner_totals and world_totals omit the
commodity dimension and pin every unused dimension to "-"; hs2 adds the
commodity dimension at COMM_LVL=HS2 and I_COMMODITY/E_COMMODITY in get; no
dimension is ever listed in get without a predicate unless it is the one
dimension the query is breaking out by (CTY_CODE for partner_totals/hs2,
I_COMMODITY/E_COMMODITY for hs2).
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import shutil
import sys
import tempfile
import threading
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from census_client import CensusClient, load_api_key, sha256_of_file  # noqa: E402

ROOT = Path(".")
PIPELINE_DIR = ROOT / "pipeline"
RAW_DIR = ROOT / "raw"
REPORTS_DIR = ROOT / "reports" / "pipeline"

IMPORTS_URL = "https://api.census.gov/data/timeseries/intltrade/imports/hs"
EXPORTS_URL = "https://api.census.gov/data/timeseries/intltrade/exports/hs"

# Field names exactly as confirmed live and quoted in reports/pipeline/source_test.md.
FLOWS = {
    "imports": {
        "url": IMPORTS_URL,
        "val_yr": "GEN_VAL_YR",
        "val_mo": "GEN_VAL_MO",
        "comm": "I_COMMODITY",
        "comm_sdesc": "I_COMMODITY_SDESC",
        "unused_dims": ["DISTRICT", "RP", "CTY_SUBCODE"],
    },
    "exports": {
        "url": EXPORTS_URL,
        "val_yr": "ALL_VAL_YR",
        "val_mo": "ALL_VAL_MO",
        "comm": "E_COMMODITY",
        "comm_sdesc": "E_COMMODITY_SDESC",
        "unused_dims": ["DF", "DISTRICT"],
    },
}

WORLD_CODE = "-"
DOCUMENTED_FROM_YEAR = 2010
AVAILABILITY_SAMPLE_PARTNER_CODE = "5700"  # CHINA, per source test item 8


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def compact_ts(dt: datetime) -> str:
    return dt.strftime("%Y%m%dT%H%M%SZ")


def parse_rows(body_text: str) -> tuple[list[str], list[list[str]]]:
    data = json.loads(body_text)
    return data[0], data[1:]


def rows_as_dicts(header: list[str], rows: list[list[str]]) -> list[dict]:
    return [dict(zip(header, row)) for row in rows]


def load_excluded_codes() -> dict:
    doc = json.loads((PIPELINE_DIR / "excluded_codes.json").read_text())
    excluded = {doc["world_row"]["code"]}
    for g in doc["country_groupings"]:
        excluded.add(g["code"])
    return excluded


def load_eu_members() -> dict:
    return json.loads((PIPELINE_DIR / "eu_members.json").read_text())


# ---------------------------------------------------------------------------
# Availability probes
# ---------------------------------------------------------------------------

def run_availability_probes(client: CensusClient, to_year: int) -> list[dict]:
    """Probe partner-level and HS2-level December data for AVAILABILITY_SAMPLE_PARTNER_CODE,
    both flows, DOCUMENTED_FROM_YEAR..to_year inclusive. Same pattern as
    source_test.py stage8, adapted to write into the acquisition archive."""
    rows = []
    for year in range(DOCUMENTED_FROM_YEAR, to_year + 1):
        for flow, cfg in FLOWS.items():
            time_val = f"{year}-12"

            get_fields = ["CTY_CODE", "CTY_NAME", cfg["val_yr"]]
            params = {"get": ",".join(get_fields), "time": time_val, "CTY_CODE": AVAILABILITY_SAMPLE_PARTNER_CODE}
            result = client.fetch(f"availability/probe_total_{flow}_{year}", cfg["url"], params)
            note, has_data, n_rows = _classify_probe(result, cfg["val_yr"])
            rows.append({"flow": flow, "level": "partner_total", "year": year, "period": time_val,
                         "http_status": result.status, "rows": n_rows, "has_data": has_data, "note": note})

            get_fields2 = ["CTY_CODE", "CTY_NAME", cfg["comm"], "COMM_LVL", cfg["val_yr"]]
            params2 = {"get": ",".join(get_fields2), "time": time_val,
                       "CTY_CODE": AVAILABILITY_SAMPLE_PARTNER_CODE, "COMM_LVL": "HS2"}
            result2 = client.fetch(f"availability/probe_hs2_{flow}_{year}", cfg["url"], params2)
            note2, has_data2, n_rows2 = _classify_probe(result2, cfg["val_yr"])
            rows.append({"flow": flow, "level": "hs2_detail", "year": year, "period": time_val,
                         "http_status": result2.status, "rows": n_rows2, "has_data": has_data2, "note": note2})
    return rows


def _classify_probe(result, val_field: str) -> tuple[str, bool, int]:
    if result.error:
        return f"failure: {result.error}", False, 0
    if result.status == 200 and result.is_json:
        try:
            header, data_rows = parse_rows(result.body_text)
            n_rows = len(data_rows)
            has_data = n_rows > 0 and any(r[header.index(val_field)] not in (None, "") for r in data_rows)
            return "", has_data, n_rows
        except (json.JSONDecodeError, ValueError, IndexError) as exc:
            return f"failure: parse error {exc}", False, 0
    if result.status is not None and 400 <= result.status < 500:
        return "failure: 4xx auth/invalid-request", False, 0
    if result.status == 204:
        return "unavailable: HTTP 204 no content (period not yet published)", False, 0
    return f"failure: status={result.status}", False, 0


def compute_verified_range(probe_rows: list[dict]) -> tuple[int, int]:
    """Latest year where both flows have data at both levels (partner_total
    and hs2_detail), starting from DOCUMENTED_FROM_YEAR."""
    years = sorted({r["year"] for r in probe_rows})
    verified_to = None
    for year in years:
        year_rows = [r for r in probe_rows if r["year"] == year]
        if all(r["has_data"] for r in year_rows):
            verified_to = year
        else:
            # do not skip gaps silently; stop at the first year that fails
            if verified_to is not None:
                break
    if verified_to is None:
        raise RuntimeError("no year in the probed range has data at both flows and both levels")
    return DOCUMENTED_FROM_YEAR, verified_to


def write_probes_csv(path: Path, rows: list[dict]) -> None:
    with open(path, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["flow", "level", "year", "period", "http_status", "rows", "has_data", "note"])
        w.writeheader()
        for r in sorted(rows, key=lambda r: (r["year"], r["flow"], r["level"])):
            out = {k: ("" if v is None else v) for k, v in r.items()}
            w.writerow(out)


# ---------------------------------------------------------------------------
# Fingerprint (uses a scratch CensusClient outside raw/, per CONTRACT's exact
# fingerprint/before.json + after.json layout: these two files are the only
# files under fingerprint/, so individual probe request/response pairs are
# not separately archived; the full url/params/status/value of every probe
# is instead embedded inline in before.json / after.json).
# ---------------------------------------------------------------------------

def probe_latest_period(client: CensusClient, flow: str, cfg: dict, start: datetime, max_months_back: int = 18) -> dict:
    month = start.replace(day=1)
    for i in range(max_months_back):
        period = month.strftime("%Y-%m")
        params = {"get": f"CTY_CODE,{cfg['val_mo']}", "time": period, "CTY_CODE": WORLD_CODE}
        result = client.fetch(f"latest_period_probe_{flow}_{period}_{i}", cfg["url"], params)
        if result.status == 200 and result.is_json:
            try:
                header, rows = parse_rows(result.body_text)
                if rows and rows[0][header.index(cfg["val_mo"])] not in (None, ""):
                    return {"period": period, "url": cfg["url"], "params": {k: v for k, v in params.items()},
                            "http_status": result.status, "fetched_at": result.fetched_at}
            except (json.JSONDecodeError, ValueError, IndexError):
                pass
        # step back one month
        prev_last_day = month - timedelta(days=1)
        month = prev_last_day.replace(day=1)
    raise RuntimeError(f"could not find a latest available period for {flow} within {max_months_back} months")


def probe_world_yr(client: CensusClient, flow: str, cfg: dict, year: int) -> dict:
    time_val = f"{year}-12"
    params = {"get": f"CTY_CODE,{cfg['val_yr']}", "time": time_val, "CTY_CODE": WORLD_CODE}
    result = client.fetch(f"world_yr_probe_{flow}_{year}", cfg["url"], params)
    value = None
    if result.status == 200 and result.is_json:
        try:
            header, rows = parse_rows(result.body_text)
            if rows:
                raw = rows[0][header.index(cfg["val_yr"])]
                value = int(raw) if raw not in (None, "") else None
        except (json.JSONDecodeError, ValueError, IndexError):
            value = None
    return {"year": year, "value": value, "url": cfg["url"], "params": dict(params),
            "http_status": result.status, "fetched_at": result.fetched_at}


def compute_fingerprint(scratch_client: CensusClient, verified_from: int, verified_to: int, at: datetime) -> dict:
    latest_period = {}
    world_probes = {"imports": {}, "exports": {}}
    for flow, cfg in FLOWS.items():
        lp = probe_latest_period(scratch_client, flow, cfg, at)
        latest_period[flow] = lp["period"]
        for year in range(verified_from, verified_to + 1):
            wp = probe_world_yr(scratch_client, flow, cfg, year)
            world_probes[flow][str(year)] = wp["value"]
    world_totals_sha256 = hashlib.sha256(
        json.dumps(world_probes, sort_keys=True).encode("utf-8")
    ).hexdigest()
    return {
        "computed_at": at.isoformat(),
        "latest_period": latest_period,
        "world_totals_yr": world_probes,
        "world_totals_sha256": world_totals_sha256,
    }


def fingerprints_match(before: dict, after: dict) -> bool:
    return (before["latest_period"] == after["latest_period"]
            and before["world_totals_sha256"] == after["world_totals_sha256"])


# ---------------------------------------------------------------------------
# Main archive: variables, partner_totals, world_totals, hs2, eu_members
# ---------------------------------------------------------------------------

def fetch_variables(client: CensusClient) -> dict:
    out = {}
    for flow, cfg in FLOWS.items():
        result = client.fetch(f"variables/{flow}", cfg["url"] + "/variables.json", {})
        out[flow] = {"http_status": result.status, "is_json": result.is_json}
    return out


def fetch_partner_totals(client: CensusClient, flow: str, cfg: dict, year: int, include_last_update: bool):
    fields = ["CTY_CODE", "CTY_NAME", "SUMMARY_LVL", cfg["val_yr"]] + cfg["unused_dims"]
    if include_last_update:
        fields = fields + ["LAST_UPDATE"]
    params = {"get": ",".join(fields), "time": f"{year}-12"}
    for dim in cfg["unused_dims"]:
        params[dim] = "-"
    return client.fetch(f"partner_totals/{flow}_{year}-12", cfg["url"], params)


def fetch_world_totals(client: CensusClient, flow: str, cfg: dict, year: int, include_last_update: bool):
    fields = ["CTY_CODE", "CTY_NAME", "SUMMARY_LVL", cfg["val_yr"]] + cfg["unused_dims"]
    if include_last_update:
        fields = fields + ["LAST_UPDATE"]
    params = {"get": ",".join(fields), "time": f"{year}-12", "CTY_CODE": WORLD_CODE}
    for dim in cfg["unused_dims"]:
        params[dim] = "-"
    return client.fetch(f"world_totals/{flow}_{year}-12", cfg["url"], params)


HS2_CANDIDATE_CHAPTERS = [f"{i:02d}" for i in range(1, 100) if i != 77]
HS2_BATCH_SIZE = 25
HS2_BATCH_TIMEOUT_SECONDS = 180


def fetch_hs2_batch(client: CensusClient, flow: str, cfg: dict, year: int, chapters: list[str],
                     part_index: int, timeout_seconds: float = 60):
    """One HS2 request for a batch (or a single) chapter, all partners
    (CTY_CODE omitted so every partner is returned), using repeated
    I_COMMODITY/E_COMMODITY query parameters (requests expands a list-valued
    param into repeated keys) as an OR filter, proven live to return 200
    with correct rows. Multi-chapter batches can legitimately take longer
    than 60s to generate server-side (observed up to 59.8s for 25 chapters),
    so batches use HS2_BATCH_TIMEOUT_SECONDS; single-chapter fallback
    requests (proven uniformly fast, 1-12s) keep the default 60s."""
    fields = ["CTY_CODE", "CTY_NAME", cfg["comm"], cfg["comm_sdesc"], "COMM_LVL", cfg["val_yr"]] + cfg["unused_dims"]
    params = {"get": ",".join(fields), "time": f"{year}-12", "COMM_LVL": "HS2", cfg["comm"]: list(chapters)}
    for dim in cfg["unused_dims"]:
        params[dim] = "-"
    return client.fetch(f"hs2/{flow}_{year}-12_part{part_index}", cfg["url"], params,
                         timeout_seconds=timeout_seconds)


HS2_BATCH_SIZE_2 = 10

# Orchestrator instruction, evidence-based: exports HS2 batches (both size
# 25 and size 10) failed for every year 2013-2021 in this acquisition while
# imports batches succeeded every time (see reports/pipeline/acquire_<ts>.log).
# For these specific flow-years, skip both batch levels entirely and start
# directly with per-chapter at concurrency 2 (same 429/5xx-drops-to-1 rule).
# Imports keeps batching; this set names only the flow-years affected.
HS2_DIRECT_PER_CHAPTER_FLOW_YEARS: set[tuple[str, int]] = {
    ("exports", y) for y in range(2022, 2026)
}


def fetch_hs2_all_partners_batched(client: CensusClient, flow: str, cfg: dict, year: int, state: dict,
                                    ts: str | None = None) -> tuple[list, str]:
    """Fetch every HS2 chapter, all partners, for one flow-year. Returns
    (results, strategy) where strategy describes what was actually used.

    Per orchestrator instructions (see reports/pipeline/acquire_<ts>.log),
    a three-level cascade, scoped to this flow-year only (the next
    flow-year always starts fresh at level 1; a whole-acquisition revert
    was tried once and found wasteful, forcing later flow-years that would
    have batched cleanly into slow per-chapter fetching for nothing):

    Level 1: HS2_BATCH_SIZE (25) chapters per request, HS2_BATCH_TIMEOUT_SECONDS
    (180s) timeout. On the FIRST failure at this level, stop trying size 25
    for the rest of this flow-year and drop to level 2 (evidence: exports
    endpoints failed 25-chapter batches consistently while imports
    succeeded, so a second 180s attempt at the same size only wastes time).

    Level 2: HS2_BATCH_SIZE_2 (10) chapters per request, same 180s timeout.
    Any single failure at this level gets its own chapters filled in
    immediately via level 3 (per-chapter) without abandoning level 2 for
    the rest of the flow-year. Only after TWO CONSECUTIVE level-2 failures
    does level 2 get abandoned for whatever chapters remain untried, which
    then go straight to level 3.

    Level 3: one chapter per request, 60s timeout (proven uniformly fast
    and reliable throughout this project).
    """
    def log(msg: str) -> None:
        if ts:
            log_line(ts, msg)
        else:
            print(msg)

    results: list = []
    part_counter = 0

    def next_part() -> int:
        nonlocal part_counter
        part_counter += 1
        return part_counter

    # Concurrency state for level 3 (per-chapter), scoped to this flow-year.
    # Per orchestrator instruction: once level 2 (10-chapter batches) has
    # also failed for this flow-year, per-chapter requests run with
    # concurrency 2 (two in flight, each its own 0.5s-paced client, same
    # 180s timeout and bounded retries). Any HTTP 429 or 5xx observed under
    # concurrency counts as a failure; after two such failures in this
    # flow-year, concurrency drops back to 1 for the rest of it.
    conc_state = {"level2_failed": False, "concurrent_failures": 0, "used_concurrency": False}

    def fetch_per_chapter(chapters: list[str]) -> None:
        assignments = [(ch, next_part()) for ch in chapters]
        concurrency = 2 if (conc_state["level2_failed"] and conc_state["concurrent_failures"] < 2) else 1
        timeout = 180 if concurrency == 2 else 60
        if concurrency == 2:
            conc_state["used_concurrency"] = True
            log(f"[acquire] hs2 {flow} {year}: running {len(assignments)} per-chapter requests "
                f"with concurrency=2 (level 2 already failed this flow-year)")
        lock = threading.Lock()
        out: dict[int, object] = {}

        def worker(pairs):
            wc = CensusClient(client.api_key, client.out_dir)
            for ch, part in pairs:
                r = fetch_hs2_batch(wc, flow, cfg, year, [ch], part, timeout_seconds=timeout)
                out[part] = r
                if r.status == 429 or (r.status is not None and 500 <= r.status < 600):
                    with lock:
                        conc_state["concurrent_failures"] += 1
                    log(f"[acquire] hs2 chapter {flow} {year} {ch} concurrent failure "
                        f"(status={r.status} error={r.error}); concurrent_failures="
                        f"{conc_state['concurrent_failures']}")
                elif r.error:
                    log(f"[acquire] hs2 chapter {flow} {year} {ch} failed "
                        f"(status={r.status} error={r.error})")

        if concurrency == 1:
            worker(assignments)
        else:
            groups = [assignments[0::2], assignments[1::2]]
            threads = [threading.Thread(target=worker, args=(g,)) for g in groups if g]
            for t in threads:
                t.start()
            for t in threads:
                t.join()
        for _, part in assignments:
            results.append(out[part])

    chapters = list(HS2_CANDIDATE_CHAPTERS)
    used_level1 = used_level2 = used_level3 = False

    if (flow, year) in HS2_DIRECT_PER_CHAPTER_FLOW_YEARS:
        log(f"[acquire] hs2 {flow} {year}: skipping batch levels (evidence: exports batches "
            f"failed every year 2013-2021 in this acquisition); starting directly with "
            f"per-chapter at concurrency 2")
        conc_state["level2_failed"] = True
        used_level3 = True
        fetch_per_chapter(chapters)
        levels_used = ["per-chapter-direct" + ("+concurrency2" if conc_state["used_concurrency"] else "")]
        strategy = "+".join(levels_used)
        log(f"[acquire] hs2 {flow} {year} done: {part_counter} requests, strategy={strategy}"
            + (f", concurrent_failures={conc_state['concurrent_failures']}" if conc_state["used_concurrency"] else ""))
        return results, strategy

    # Level 1: 25-chapter batches, single failure escalates to level 2
    idx = 0
    level1_ok = True
    while idx < len(chapters):
        batch = chapters[idx:idx + HS2_BATCH_SIZE]
        result = fetch_hs2_batch(client, flow, cfg, year, batch, next_part(),
                                  timeout_seconds=HS2_BATCH_TIMEOUT_SECONDS)
        if result.status == 200 and result.is_json:
            results.append(result)
            used_level1 = True
            idx += HS2_BATCH_SIZE
        else:
            log(f"[acquire] hs2 batch {flow} {year} part{part_counter} ({HS2_BATCH_SIZE}-chapter) "
                f"chapters={batch} FAILED at {HS2_BATCH_TIMEOUT_SECONDS}s "
                f"(status={result.status} error={result.error}); escalating to "
                f"{HS2_BATCH_SIZE_2}-chapter batches for the rest of {flow} {year}")
            level1_ok = False
            break
    remaining = chapters[idx:] if not level1_ok else []

    # Level 2: 10-chapter batches; a single failure gets immediate
    # per-chapter fill without abandoning level 2; two consecutive
    # failures abandon level 2 for whatever is left.
    if remaining:
        idxB = 0
        consecutive_fail = 0
        while idxB < len(remaining):
            if consecutive_fail >= 2:
                break
            batch = remaining[idxB:idxB + HS2_BATCH_SIZE_2]
            result = fetch_hs2_batch(client, flow, cfg, year, batch, next_part(),
                                      timeout_seconds=HS2_BATCH_TIMEOUT_SECONDS)
            if result.status == 200 and result.is_json:
                results.append(result)
                used_level2 = True
                consecutive_fail = 0
            else:
                consecutive_fail += 1
                conc_state["level2_failed"] = True
                log(f"[acquire] hs2 batch {flow} {year} part{part_counter} ({HS2_BATCH_SIZE_2}-chapter) "
                    f"chapters={batch} FAILED at {HS2_BATCH_TIMEOUT_SECONDS}s "
                    f"(status={result.status} error={result.error}); consecutive "
                    f"{HS2_BATCH_SIZE_2}-chapter failures={consecutive_fail}; filling this batch "
                    f"per-chapter")
                used_level3 = True
                fetch_per_chapter(batch)
            idxB += HS2_BATCH_SIZE_2
        if consecutive_fail >= 2:
            tail = remaining[idxB:]
            if tail:
                log(f"[acquire] two consecutive {HS2_BATCH_SIZE_2}-chapter batches timed out at "
                    f"{HS2_BATCH_TIMEOUT_SECONDS}s for {flow} {year}; abandoning "
                    f"{HS2_BATCH_SIZE_2}-chapter batching for the rest of this flow-year "
                    f"({len(tail)} chapters remaining, per-chapter)")
                used_level3 = True
                fetch_per_chapter(tail)

    levels_used = []
    if used_level1:
        levels_used.append(f"batched-{HS2_BATCH_SIZE}")
    if used_level2:
        levels_used.append(f"batched-{HS2_BATCH_SIZE_2}")
    if used_level3:
        levels_used.append("per-chapter" + ("+concurrency2" if conc_state["used_concurrency"] else ""))
    strategy = "+".join(levels_used) if levels_used else "none"

    log(f"[acquire] hs2 {flow} {year} done: {part_counter} requests, strategy={strategy}"
        + (f", concurrent_failures={conc_state['concurrent_failures']}" if conc_state["used_concurrency"] else ""))
    return results, strategy


def fetch_eu_member_month(client: CensusClient, flow: str, cfg: dict, code: str, period: str):
    fields = ["CTY_CODE", "CTY_NAME", cfg["val_mo"]]
    params = {"get": ",".join(fields), "time": period, "CTY_CODE": code}
    return client.fetch(f"eu_members/{flow}_{code}_{period}", cfg["url"], params)


def fetch_eu_member_month_hs2_single(client: CensusClient, flow: str, cfg: dict, code: str, period: str):
    """One request for every chapter of one transition member's month:
    CTY_CODE pinned to the single member code, COMM_LVL=HS2, the commodity
    dimension (I_COMMODITY/E_COMMODITY) in get with NO predicate, so the API
    returns every chapter row for that partner in one response. This exact
    shape was proven live in the source test (raw/source_test/hs2_imports_large
    returned 98 rows for China, one partner, in a single call). Saved as
    eu_members_hs2/<flow>_<code>_<period>.response.json (CONTRACT Raw
    archive layout, no _partN suffix, since one request covers every
    chapter for this narrow a query)."""
    fields = ["CTY_CODE", "CTY_NAME", cfg["comm"], cfg["comm_sdesc"], "COMM_LVL", cfg["val_mo"]] + cfg["unused_dims"]
    params = {"get": ",".join(fields), "time": period, "COMM_LVL": "HS2", "CTY_CODE": code}
    for dim in cfg["unused_dims"]:
        params[dim] = "-"
    return client.fetch(f"eu_members_hs2/{flow}_{code}_{period}", cfg["url"], params, timeout_seconds=120)


def fetch_eu_member_month_hs2(client: CensusClient, flow: str, cfg: dict, code: str, period: str) -> list:
    """Monthly HS2 observations (_MO, COMM_LVL=HS2) for one transition
    member and month, all chapters, one partner (CTY_CODE=code), one
    chapter at a time. Saved as eu_members_hs2/<flow>_<code>_<YYYY-MM>_part<n>
    per CONTRACT Raw archive layout (amended). Superseded as the default
    strategy by fetch_eu_member_month_hs2_single (see its docstring), which
    is much faster; this per-chapter form is kept for any month-flow where
    the single-request form fails, and both forms are valid evidence the
    build reads."""
    fields = ["CTY_CODE", "CTY_NAME", cfg["comm"], cfg["comm_sdesc"], "COMM_LVL", cfg["val_mo"]] + cfg["unused_dims"]
    results = []
    for i, ch in enumerate(HS2_CANDIDATE_CHAPTERS, start=1):
        params = {"get": ",".join(fields), "time": period, "COMM_LVL": "HS2",
                  cfg["comm"]: [ch], "CTY_CODE": code}
        for dim in cfg["unused_dims"]:
            params[dim] = "-"
        result = client.fetch(f"eu_members_hs2/{flow}_{code}_{period}_part{i}", cfg["url"], params)
        results.append(result)
    return results


def result_codes(result, code_field: str = "CTY_CODE") -> set[str]:
    if not (result.status == 200 and result.is_json):
        return set()
    try:
        header, rows = parse_rows(result.body_text)
        idx = header.index(code_field)
        return {r[idx] for r in rows}
    except (json.JSONDecodeError, ValueError, IndexError):
        return set()


def result_row_count(result) -> int:
    if not (result.status == 200 and result.is_json):
        return 0
    try:
        _, rows = parse_rows(result.body_text)
        return len(rows)
    except (json.JSONDecodeError, ValueError, IndexError):
        return 0


# ---------------------------------------------------------------------------
# Manifest and snapshot id
# ---------------------------------------------------------------------------

def hash_directory_files(tmp_dir: Path, exclude_names: set[str]) -> list[dict]:
    entries = []
    for path in sorted(tmp_dir.rglob("*")):
        if path.is_file() and path.name not in exclude_names:
            entries.append({
                "path": str(path.relative_to(tmp_dir)),
                "sha256": sha256_of_file(path),
                "size_bytes": path.stat().st_size,
            })
    return entries


STAGE_ORDER = ["init", "probe", "fingerprint_before", "archive", "eu_members", "fingerprint_after", "finalize"]


def state_path(tmp_dir: Path) -> Path:
    return tmp_dir / "state.json"


def load_state(tmp_dir: Path) -> dict:
    return json.loads(state_path(tmp_dir).read_text())


def save_state(tmp_dir: Path, state: dict) -> None:
    state_path(tmp_dir).write_text(json.dumps(state, indent=2, sort_keys=True) + "\n")


def log_line(ts: str, msg: str) -> None:
    log_path = REPORTS_DIR / f"acquire_{ts}.log"
    with open(log_path, "a") as f:
        f.write(f"{now_utc().isoformat()} {msg}\n")
    print(msg)


def stage_init(args) -> None:
    acquisition_start = now_utc()
    ts = compact_ts(acquisition_start)
    tmp_dir = RAW_DIR / f"_acquiring_{ts}"
    tmp_dir.mkdir(parents=True, exist_ok=False)
    for sub in ["fingerprint", "variables", "availability", "partner_totals", "world_totals", "hs2", "eu_members"]:
        (tmp_dir / sub).mkdir(parents=True, exist_ok=True)
    state = {
        "ts": ts,
        "acquisition_start": acquisition_start.isoformat(),
        "request_counts": {"total": 0, "failed": 0},
        "failures": [],
        "years_done": [],
        "last_update_observed": {},
        "hs2_completeness": [],
        "stage_done": {"init": True},
    }
    save_state(tmp_dir, state)
    log_line(ts, f"[acquire] init: tmp_dir={tmp_dir}")
    print(f"TS={ts}")


def get_client(api_key: str, tmp_dir: Path, state: dict) -> CensusClient:
    client = CensusClient(api_key, tmp_dir)
    return client


def track_into(state: dict, result) -> None:
    state["request_counts"]["total"] += 1
    if result.error:
        state["request_counts"]["failed"] += 1
        state["failures"].append(f"{result.name}: {result.error}")


def stage_probe(args) -> None:
    api_key = load_api_key()
    tmp_dir = RAW_DIR / f"_acquiring_{args.ts}"
    state = load_state(tmp_dir)
    if state["stage_done"].get("probe"):
        print("[acquire] probe already done, skipping")
        return
    client = get_client(api_key, tmp_dir, state)
    to_year = now_utc().year
    probe_rows = run_availability_probes(client, to_year)
    state["request_counts"]["total"] += len(probe_rows)
    write_probes_csv(tmp_dir / "availability" / "probes.csv", probe_rows)
    verified_from, verified_to = compute_verified_range(probe_rows)

    config = json.loads((PIPELINE_DIR / "config.json").read_text())
    start_year = config["START_YEAR"]
    end_year = verified_to
    smoke_years = __import__("os").environ.get("ACQUIRE_SMOKE_YEARS")
    if smoke_years:
        end_year = min(end_year, start_year + int(smoke_years) - 1)
    if start_year > end_year:
        raise RuntimeError(f"START_YEAR {start_year} is after verified end_year {end_year}")

    state["verified_from"] = verified_from
    state["verified_to"] = verified_to
    state["start_year"] = start_year
    state["end_year"] = end_year
    state["stage_done"]["probe"] = True
    save_state(tmp_dir, state)
    log_line(args.ts, f"[acquire] probe done: verified {verified_from}..{verified_to}, "
                       f"configured {start_year}..{end_year}, {len(probe_rows)} probes")


def stage_fingerprint_before(args) -> None:
    api_key = load_api_key()
    tmp_dir = RAW_DIR / f"_acquiring_{args.ts}"
    state = load_state(tmp_dir)
    if state["stage_done"].get("fingerprint_before"):
        print("[acquire] fingerprint_before already done, skipping")
        return
    with tempfile.TemporaryDirectory(prefix="us-trade-fingerprint-") as scratch:
        scratch_client = CensusClient(api_key, Path(scratch))
        fingerprint_before = compute_fingerprint(scratch_client, state["verified_from"], state["verified_to"], now_utc())
    (tmp_dir / "fingerprint" / "before.json").write_text(
        json.dumps(fingerprint_before, indent=2, sort_keys=True) + "\n")
    state["stage_done"]["fingerprint_before"] = True
    save_state(tmp_dir, state)
    log_line(args.ts, "[acquire] fingerprint_before done")


def stage_variables(args) -> None:
    api_key = load_api_key()
    tmp_dir = RAW_DIR / f"_acquiring_{args.ts}"
    state = load_state(tmp_dir)
    if state["stage_done"].get("variables"):
        print("[acquire] variables already done, skipping")
        return
    client = get_client(api_key, tmp_dir, state)
    fetch_variables(client)
    state["stage_done"]["variables"] = True
    save_state(tmp_dir, state)
    log_line(args.ts, "[acquire] variables done")


def stage_archive(args) -> None:
    """Process one chunk of configured years (partner_totals, world_totals,
    hs2). Call repeatedly (each call processes up to --chunk-size years not
    already done) until all configured years are done."""
    api_key = load_api_key()
    tmp_dir = RAW_DIR / f"_acquiring_{args.ts}"
    state = load_state(tmp_dir)
    client = get_client(api_key, tmp_dir, state)
    excluded = load_excluded_codes()

    years_done = set(state["years_done"])
    remaining = [y for y in range(state["start_year"], state["end_year"] + 1) if y not in years_done]
    if not remaining:
        print("[acquire] archive already complete for all configured years, skipping")
        return
    chunk = remaining[: args.chunk_size]
    log_line(args.ts, f"[acquire] archive chunk starting: years {chunk}")

    for year in chunk:
        for flow, cfg in FLOWS.items():
            pt_result = fetch_partner_totals(client, flow, cfg, year, include_last_update=False)
            track_into(state, pt_result)
            wt_result = fetch_world_totals(client, flow, cfg, year, include_last_update=True)
            track_into(state, wt_result)
            if wt_result.status == 200 and wt_result.is_json:
                try:
                    header, rows = parse_rows(wt_result.body_text)
                    if rows and "LAST_UPDATE" in header:
                        state["last_update_observed"][flow] = rows[0][header.index("LAST_UPDATE")]
                except (json.JSONDecodeError, ValueError, IndexError):
                    pass

            pt_codes = result_codes(pt_result)
            hs2_results, hs2_strategy = fetch_hs2_all_partners_batched(client, flow, cfg, year, state, ts=args.ts)
            for r in hs2_results:
                track_into(state, r)
            hs2_codes: set[str] = set()
            hs2_rows = 0
            for r in hs2_results:
                hs2_codes |= result_codes(r)
                hs2_rows += result_row_count(r)
            pt_codes_excl = pt_codes - {WORLD_CODE} - excluded
            hs2_codes_excl = hs2_codes - excluded - {WORLD_CODE}
            missing_in_hs2 = sorted(pt_codes_excl - hs2_codes_excl)
            extra_in_hs2 = sorted(hs2_codes_excl - pt_codes_excl)
            # Completeness is proven by the partner-code set matching
            # partner_totals and by row counts (CONTRACT Raw archive
            # layout), not by whether every individual HS2 request
            # returned 200: a legitimate 204 (no data for one chapter, e.g.
            # chapter 99 on exports) is not an incompleteness, and the
            # fallback path (batched-25+10+per-chapter etc.) is a strategy
            # note, not a defect.
            complete = not missing_in_hs2
            state["hs2_completeness"].append({
                "flow": flow, "year": year, "hs2_batch_count": len(hs2_results),
                "strategy": hs2_strategy, "hs2_rows": hs2_rows,
                "partner_total_codes": len(pt_codes_excl), "hs2_codes": len(hs2_codes_excl),
                "missing_in_hs2": missing_in_hs2, "extra_in_hs2": extra_in_hs2, "complete": complete,
            })
            if complete:
                log_line(args.ts, f"[acquire] hs2 complete for {flow} {year}: strategy={hs2_strategy}, "
                                   f"rows={hs2_rows}, partner_codes={len(pt_codes_excl)}")
            else:
                log_line(args.ts, f"[acquire] hs2 INCOMPLETE for {flow} {year}: strategy={hs2_strategy}, "
                                   f"missing {len(missing_in_hs2)} codes: {missing_in_hs2}")
        years_done.add(year)
        state["years_done"] = sorted(years_done)
        save_state(tmp_dir, state)
        log_line(args.ts, f"[acquire] archive year {year} done ({len(years_done)}/{state['end_year'] - state['start_year'] + 1})")

    remaining_after = [y for y in range(state["start_year"], state["end_year"] + 1) if y not in years_done]
    log_line(args.ts, f"[acquire] archive chunk done. Remaining years: {remaining_after}")


def stage_eu_members(args) -> None:
    api_key = load_api_key()
    tmp_dir = RAW_DIR / f"_acquiring_{args.ts}"
    state = load_state(tmp_dir)
    if state["stage_done"].get("eu_members"):
        print("[acquire] eu_members already done, skipping")
        return
    client = get_client(api_key, tmp_dir, state)
    eu_members = load_eu_members()
    for member in eu_members["transition_rules"]["transition_members"]:
        code = member["census_cty_code"]
        for period in member["member_months"]:
            for flow, cfg in FLOWS.items():
                track_into(state, fetch_eu_member_month(client, flow, cfg, code, period))
    state["stage_done"]["eu_members"] = True
    save_state(tmp_dir, state)
    log_line(args.ts, "[acquire] eu_members done")


def stage_eu_members_hs2(args) -> None:
    """Monthly HS2 detail for the transition members' transition months
    (CONTRACT Raw archive layout, eu_members_hs2/ row, amended). Lets the
    EU aggregate have group and chapter detail in transition years 2013
    and 2020, not just a year-level total."""
    api_key = load_api_key()
    tmp_dir = RAW_DIR / f"_acquiring_{args.ts}"
    state = load_state(tmp_dir)
    if state["stage_done"].get("eu_members_hs2"):
        print("[acquire] eu_members_hs2 already done, skipping")
        return
    client = get_client(api_key, tmp_dir, state)
    eu_members = load_eu_members()
    hs2_dir = tmp_dir / "eu_members_hs2"
    expected_chapters = {"imports": 98, "exports": 97}  # exports lacks chapter 99

    for member in eu_members["transition_rules"]["transition_members"]:
        code = member["census_cty_code"]
        for period in member["member_months"]:
            for flow, cfg in FLOWS.items():
                single_path = hs2_dir / f"{flow}_{code}_{period}.response.json"
                part_files = sorted(hs2_dir.glob(f"{flow}_{code}_{period}_part*.response.json"))
                if single_path.exists():
                    log_line(args.ts, f"[acquire] eu_members_hs2 {flow} {code} {period}: "
                                       f"already fetched (single request), skipping")
                    continue
                if len(part_files) >= expected_chapters.get(flow, 98):
                    log_line(args.ts, f"[acquire] eu_members_hs2 {flow} {code} {period}: "
                                       f"already fetched ({len(part_files)} per-chapter files), skipping")
                    continue

                result = fetch_eu_member_month_hs2_single(client, flow, cfg, code, period)
                track_into(state, result)
                if result.status == 200 and result.is_json:
                    header, rows = parse_rows(result.body_text)
                    log_line(args.ts, f"[acquire] eu_members_hs2 {flow} {code} {period}: "
                                       f"single request returned {len(rows)} chapter rows")
                else:
                    log_line(args.ts, f"[acquire] eu_members_hs2 {flow} {code} {period}: single "
                                       f"request FAILED (status={result.status} error={result.error}); "
                                       f"falling back to per-chapter")
                    results = fetch_eu_member_month_hs2(client, flow, cfg, code, period)
                    for r in results:
                        track_into(state, r)
                    log_line(args.ts, f"[acquire] eu_members_hs2 {flow} {code} {period}: per-chapter "
                                       f"fallback: {sum(1 for r in results if r.status == 200 and r.is_json)}/"
                                       f"{len(results)} chapters returned data")
    state["stage_done"]["eu_members_hs2"] = True
    save_state(tmp_dir, state)
    log_line(args.ts, "[acquire] eu_members_hs2 done")


def stage_fingerprint_after(args) -> None:
    api_key = load_api_key()
    tmp_dir = RAW_DIR / f"_acquiring_{args.ts}"
    state = load_state(tmp_dir)
    if state["stage_done"].get("fingerprint_after"):
        print("[acquire] fingerprint_after already done, skipping")
        return
    with tempfile.TemporaryDirectory(prefix="us-trade-fingerprint-") as scratch:
        scratch_client = CensusClient(api_key, Path(scratch))
        fingerprint_after = compute_fingerprint(scratch_client, state["verified_from"], state["verified_to"], now_utc())
    (tmp_dir / "fingerprint" / "after.json").write_text(
        json.dumps(fingerprint_after, indent=2, sort_keys=True) + "\n")
    state["stage_done"]["fingerprint_after"] = True
    save_state(tmp_dir, state)
    log_line(args.ts, "[acquire] fingerprint_after done")


def stage_finalize(args) -> int:
    tmp_dir = RAW_DIR / f"_acquiring_{args.ts}"
    state = load_state(tmp_dir)
    remaining = [y for y in range(state["start_year"], state["end_year"] + 1) if y not in set(state["years_done"])]
    if (remaining or not state["stage_done"].get("fingerprint_after")
            or not state["stage_done"].get("eu_members")
            or not state["stage_done"].get("eu_members_hs2")):
        raise RuntimeError(f"cannot finalize: remaining years {remaining}, stage_done={state['stage_done']}")

    (REPORTS_DIR / f"hs2_completeness_{args.ts}.json").write_text(
        json.dumps(state["hs2_completeness"], indent=2, sort_keys=True) + "\n")

    fingerprint_before = json.loads((tmp_dir / "fingerprint" / "before.json").read_text())
    fingerprint_after = json.loads((tmp_dir / "fingerprint" / "after.json").read_text())
    match = fingerprints_match(fingerprint_before, fingerprint_after)
    acquisition_end = now_utc()

    # remove the checkpoint file before hashing; it is not part of the
    # CONTRACT raw archive layout
    state_path(tmp_dir).unlink()

    file_entries = hash_directory_files(tmp_dir, exclude_names={"manifest.json"})
    manifest = {
        "acquisition_start": state["acquisition_start"],
        "acquisition_end": acquisition_end.isoformat(),
        "fingerprint_before": fingerprint_before,
        "fingerprint_after": fingerprint_after,
        "fingerprint_match": match,
        "observed_last_update": state["last_update_observed"],
        "configured_coverage": {
            "start_year": state["start_year"], "end_year": state["end_year"],
            "years": list(range(state["start_year"], state["end_year"] + 1)),
        },
        "documented_availability": {"from_year": DOCUMENTED_FROM_YEAR},
        "verified_availability": {"from_year": state["verified_from"], "to_year": state["verified_to"]},
        "request_counts": state["request_counts"],
        "failures": state["failures"],
        "files": file_entries,
    }
    manifest_path = tmp_dir / "manifest.json"
    manifest_text = json.dumps(manifest, indent=2, sort_keys=True) + "\n"
    manifest_path.write_text(manifest_text)
    manifest_hash = hashlib.sha256(manifest_text.encode("utf-8")).hexdigest()

    if not match:
        invalid_dir = RAW_DIR / f"_acquiring_{args.ts}.invalid"
        tmp_dir.rename(invalid_dir)
        log_path = REPORTS_DIR / f"acquire_{args.ts}.log"
        with open(log_path, "a") as f:
            f.write(
                "Acquisition INVALID: source fingerprint changed during acquisition.\n"
                f"before: {json.dumps(fingerprint_before, sort_keys=True)}\n"
                f"after: {json.dumps(fingerprint_after, sort_keys=True)}\n"
                f"Raw directory preserved at: {invalid_dir}\n"
                "data/ left untouched.\n"
            )
        print(f"[acquire] INVALID: fingerprint changed. See {log_path} and {invalid_dir}")
        return 1

    snapshot_id = f"{args.ts}-{manifest_hash[:12]}"
    final_dir = RAW_DIR / snapshot_id
    tmp_dir.rename(final_dir)
    log_line(args.ts, f"[acquire] snapshot_id={snapshot_id}")
    log_line(args.ts, f"[acquire] requests: {state['request_counts']['total']} total, "
                       f"failures: {len(state['failures'])}")
    log_line(args.ts, f"[acquire] wrote {final_dir}")
    (REPORTS_DIR / "last_snapshot_id.txt").write_text(snapshot_id + "\n")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("stage", choices=["init", "probe", "fingerprint_before", "variables",
                                            "archive", "eu_members", "eu_members_hs2",
                                            "fingerprint_after", "finalize"])
    parser.add_argument("--ts", default=None)
    parser.add_argument("--chunk-size", type=int, default=3)
    args = parser.parse_args()
    if args.stage != "init" and not args.ts:
        raise SystemExit("--ts is required for every stage except init")
    if args.stage == "init":
        stage_init(args)
        return 0
    if args.stage == "probe":
        stage_probe(args)
        return 0
    if args.stage == "fingerprint_before":
        stage_fingerprint_before(args)
        return 0
    if args.stage == "variables":
        stage_variables(args)
        return 0
    if args.stage == "archive":
        stage_archive(args)
        return 0
    if args.stage == "eu_members":
        stage_eu_members(args)
        return 0
    if args.stage == "eu_members_hs2":
        stage_eu_members_hs2(args)
        return 0
    if args.stage == "fingerprint_after":
        stage_fingerprint_after(args)
        return 0
    if args.stage == "finalize":
        return stage_finalize(args)
    return 1


if __name__ == "__main__":
    sys.exit(main())
