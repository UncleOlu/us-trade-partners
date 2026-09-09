"""
Build data/<snapshot_id>/ from raw/<snapshot_id>/ (BUILD ORDER step 3, Agent A).

Pure function of the raw archive plus pipeline/*.json reference files. Never
touches the network and never reads the current wall-clock time: fetched_at
is copied verbatim from the raw manifest's acquisition_start, so `make
rebuild SNAPSHOT=<id>` (which calls this module the same way) reproduces
byte-identical output.

Usage:
    .venv/bin/python3 pipeline/build.py <snapshot_id> --out <dir> [--publish]

--publish builds into a sibling temp directory then renames it to --out
atomically, refusing to overwrite an existing directory. Without --publish
(used for the rebuild proof) the build writes directly into --out.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from model import (  # noqa: E402
    fv_observed, fv_confirmed_zero, fv_absent, fv_not_applicable,
    dv_observed, dv_absent, derive_balance, derive_total_trade_value,
    sum_flowvalues, write_json_sorted, sha256_hex,
)

ROOT = Path(".")
PIPELINE_DIR = ROOT / "pipeline"
RAW_DIR = ROOT / "raw"
REPORTS_DIR = ROOT / "reports" / "pipeline"

SCHEMA_VERSION = "1.0.0"
WORLD_CODE = "-"
RESERVED_CHAPTER = "77"

FLOW_VAL_YR = {"imports": "GEN_VAL_YR", "exports": "ALL_VAL_YR"}
FLOW_VAL_MO = {"imports": "GEN_VAL_MO", "exports": "ALL_VAL_MO"}
FLOW_COMM = {"imports": "I_COMMODITY", "exports": "E_COMMODITY"}
FLOW_COMM_SDESC = {"imports": "I_COMMODITY_SDESC", "exports": "E_COMMODITY_SDESC"}


# ---------------------------------------------------------------------------
# Raw archive loading
# ---------------------------------------------------------------------------

def load_json(path: Path):
    return json.loads(path.read_text())


def load_census_rows(path: Path) -> list[dict]:
    """Census timeseries API JSON: [header, row1, row2, ...] -> list of dicts."""
    if not path.exists():
        return []
    data = load_json(path)
    if not data:
        return []
    header = data[0]
    return [dict(zip(header, row)) for row in data[1:]]


class RawArchive:
    def __init__(self, snapshot_id: str):
        self.snapshot_id = snapshot_id
        self.dir = RAW_DIR / snapshot_id
        if not self.dir.is_dir():
            raise FileNotFoundError(f"raw archive not found: {self.dir}")
        self.manifest = load_json(self.dir / "manifest.json")
        self.years = self.manifest["configured_coverage"]["years"]
        self.start_year = self.manifest["configured_coverage"]["start_year"]
        self.end_year = self.manifest["configured_coverage"]["end_year"]

        self.partner_totals: dict[tuple[str, int], list[dict]] = {}
        self.world_totals: dict[tuple[str, int], dict | None] = {}
        self.hs2: dict[tuple[str, int], list[dict]] = {}

        for year in self.years:
            for flow in ("imports", "exports"):
                pt_path = self.dir / "partner_totals" / f"{flow}_{year}-12.response.json"
                self.partner_totals[(flow, year)] = load_census_rows(pt_path)

                wt_path = self.dir / "world_totals" / f"{flow}_{year}-12.response.json"
                wt_rows = load_census_rows(wt_path)
                self.world_totals[(flow, year)] = wt_rows[0] if wt_rows else None

                hs2_rows = self._load_hs2(flow, year)
                self.hs2[(flow, year)] = hs2_rows

    def _load_hs2(self, flow: str, year: int) -> list[dict]:
        base = self.dir / "hs2" / f"{flow}_{year}-12.response.json"
        rows = load_census_rows(base)
        # Every hs2/<flow>_<year>-12_part<n>.response.json present is loaded,
        # by glob rather than by probing sequential part numbers: a batch
        # request that failed (timeout or non-JSON error body) writes only a
        # <name>.response.txt, not a <name>.response.json, for that part
        # number, leaving a gap in the numbering that a later, successful
        # part number still follows. Stopping at the first missing .json (as
        # an earlier version of this method did) silently truncated all
        # data after any such gap, e.g. treating an entire flow-year as
        # empty because part1 alone failed. Globbing avoids that.
        part_dir = self.dir / "hs2"
        part_files = sorted(
            part_dir.glob(f"{flow}_{year}-12_part*.response.json"),
            key=lambda p: int(p.name.split("_part")[1].split(".response.json")[0]),
        )
        for part_path in part_files:
            rows.extend(load_census_rows(part_path))
        return rows

    def eu_member_month(self, flow: str, code: str, period: str) -> dict | None:
        path = self.dir / "eu_members" / f"{flow}_{code}_{period}.response.json"
        rows = load_census_rows(path)
        return rows[0] if rows else None

    def has_eu_members_hs2(self) -> bool:
        """Whether this snapshot acquired eu_members_hs2/ at all (CONTRACT
        Raw archive layout, amended, required from schema 1.0.0 onward). A
        snapshot acquired before this stage existed has no such directory
        or an empty one."""
        d = self.dir / "eu_members_hs2"
        return d.is_dir() and any(d.glob("*.response.json"))

    def _load_eu_member_month_hs2_rows(self, flow: str, code: str, period: str) -> dict[str, dict]:
        """All chapter rows for one transition member/month, keyed by
        chapter. Reads either form (CONTRACT: "both are valid evidence and
        the build must read either form"): a single consolidated
        eu_members_hs2/<flow>_<code>_<period>.response.json (no commodity
        predicate, every chapter in one response), or the per-chapter
        eu_members_hs2/<flow>_<code>_<period>_part<n>.response.json files.
        Cached per (flow, code, period) since this is looked up once per
        chapter (up to 98 times) for the same month-flow."""
        cache = self.__dict__.setdefault("_eu_member_month_hs2_cache", {})
        key = (flow, code, period)
        if key in cache:
            return cache[key]
        comm_field = FLOW_COMM[flow]
        hs2_dir = self.dir / "eu_members_hs2"
        rows_by_chapter: dict[str, dict] = {}
        single_path = hs2_dir / f"{flow}_{code}_{period}.response.json"
        if single_path.exists():
            for row in load_census_rows(single_path):
                ch = row.get(comm_field)
                if ch:
                    rows_by_chapter[ch] = row
        else:
            for part_path in sorted(hs2_dir.glob(f"{flow}_{code}_{period}_part*.response.json")):
                for row in load_census_rows(part_path):
                    ch = row.get(comm_field)
                    if ch:
                        rows_by_chapter[ch] = row
        cache[key] = rows_by_chapter
        return rows_by_chapter

    def eu_member_month_hs2(self, flow: str, code: str, period: str, chapter: str) -> dict | None:
        """One chapter's monthly HS2 row for one transition member/month."""
        return self._load_eu_member_month_hs2_rows(flow, code, period).get(chapter)


# ---------------------------------------------------------------------------
# Reference data
# ---------------------------------------------------------------------------

def load_excluded_codes() -> tuple[set[str], list[dict]]:
    doc = load_json(PIPELINE_DIR / "excluded_codes.json")
    world = doc["world_row"]["code"]
    cgp = doc["country_groupings"]
    all_excluded_from_reconciliation = {world} | {g["code"] for g in cgp}
    return all_excluded_from_reconciliation, cgp


def load_country_map() -> dict[str, dict]:
    doc = load_json(PIPELINE_DIR / "country_map.json")
    return {p["census_code"]: p for p in doc["partners"]}, doc["version"]


def load_eu_members() -> dict:
    return load_json(PIPELINE_DIR / "eu_members.json")


def load_hs_sections_ref() -> dict:
    return load_json(PIPELINE_DIR / "hs_sections.json")


# ---------------------------------------------------------------------------
# Partner universe and resolution
# ---------------------------------------------------------------------------

FOUR_DIGIT_PATTERN = __import__("re").compile(r"^[0-9]{4}$")


def collect_observed_codes(archive: RawArchive) -> set[str]:
    codes = set()
    for rows in archive.partner_totals.values():
        codes.update(r["CTY_CODE"] for r in rows)
    for rows in archive.hs2.values():
        codes.update(r["CTY_CODE"] for r in rows)
    return codes


def compute_valid_range(archive: RawArchive, code: str) -> tuple[int | None, int | None]:
    years_seen = []
    for (flow, year), rows in archive.partner_totals.items():
        for r in rows:
            if r["CTY_CODE"] == code:
                val_field = FLOW_VAL_YR[flow]
                raw = r.get(val_field)
                if raw not in (None, ""):
                    years_seen.append(year)
    if not years_seen:
        return None, None
    return min(years_seen), max(years_seen)


def resolve_partners(archive: RawArchive, country_map: dict, excluded_codes: set[str], cgp_list: list[dict]):
    """Returns (approved_country_codes, excluded_partner_entries, unresolved_codes)."""
    observed = collect_observed_codes(archive)
    observed.discard(WORLD_CODE)

    unresolved = []
    approved_codes = []
    excluded_entries = []

    cgp_by_code = {g["code"]: g for g in cgp_list}

    for code in sorted(observed):
        if code in excluded_codes:
            if FOUR_DIGIT_PATTERN.match(code):
                cgp = cgp_by_code.get(code)
                name = cgp["name"] if cgp else "TOTAL FOR ALL COUNTRIES"
                reason = cgp["reason"] if cgp else "world total row"
                vf, vt = compute_valid_range(archive, code)
                excluded_entries.append({
                    "code": code, "name": name, "kind": "aggregate",
                    "iso3": None, "map_feature_id": None,
                    "include_in_world_reconciliation": False,
                    "valid_from": vf, "valid_to": vt,
                    "resolution": "excluded", "resolution_note": reason,
                })
            # non-4-digit excluded codes (world row "-", and wildcard regional
            # codes "1XXX".."7XXX") cannot satisfy PartnerCode's pattern
            # ^([0-9]{4}|EU)$ and so cannot be written to partners.json at
            # all; documented as a CONTRACT/schema tension in the final report.
            continue
        entry = country_map.get(code)
        if entry is None:
            unresolved.append(code)
            continue
        approved_codes.append(code)

    return approved_codes, excluded_entries, unresolved


def build_partner_record(archive: RawArchive, code: str, country_map: dict) -> dict:
    entry = country_map[code]
    # prefer the live CTY_NAME (most current, exactly as returned by the API,
    # never joined by name) over the reference file's Schedule C name
    live_name = None
    for (flow, year), rows in archive.partner_totals.items():
        for r in rows:
            if r["CTY_CODE"] == code:
                live_name = r["CTY_NAME"]
                break
        if live_name:
            break
    name = live_name or entry["census_name"]
    vf, vt = compute_valid_range(archive, code)
    return {
        "code": code,
        "name": name,
        "kind": entry["kind_hint"],
        "iso3": entry["iso3"],
        "map_feature_id": entry["map_feature_id"],
        "include_in_world_reconciliation": True,
        "valid_from": vf,
        "valid_to": vt,
        "resolution": "approved",
        "resolution_note": entry.get("note"),
    }


# ---------------------------------------------------------------------------
# EU aggregate
# ---------------------------------------------------------------------------

def eu_membership_for_year(eu_doc: dict, year: int):
    transitions_this_year = [
        tm for tm in eu_doc["transition_rules"]["transition_members"] if tm["year"] == year
    ]
    transition_codes = {tm["census_cty_code"] for tm in transitions_this_year}
    full_codes = []
    for m in eu_doc["members"]:
        code = m["census_cty_code"]
        if code in transition_codes:
            continue
        from_year = int(m["member_from"][:4])
        to_year = int(m["member_to"][:4]) if m["member_to"] else 9999
        if from_year <= year <= to_year:
            full_codes.append(code)
    return full_codes, transitions_this_year


def eu_flow_value(archive: RawArchive, eu_doc: dict, flow: str, year: int) -> dict:
    full_codes, transitions = eu_membership_for_year(eu_doc, year)
    val_field = FLOW_VAL_YR[flow]
    val_mo_field = FLOW_VAL_MO[flow]
    total = 0
    missing = []

    pt_rows = archive.partner_totals.get((flow, year), [])
    pt_by_code = {r["CTY_CODE"]: r for r in pt_rows}
    for code in full_codes:
        row = pt_by_code.get(code)
        if row is None or row.get(val_field) in (None, ""):
            missing.append(f"{code} {flow} {year}-12 (full member, partner-level row missing)")
            continue
        total += int(row[val_field])

    for tm in transitions:
        code = tm["census_cty_code"]
        for period in tm["member_months"]:
            month_row = archive.eu_member_month(flow, code, period)
            if month_row is None or month_row.get(val_mo_field) in (None, ""):
                missing.append(f"{code} {flow} {period} (transition member month missing)")
                continue
            total += int(month_row[val_mo_field])

    if missing:
        return fv_absent("EU value absent for " + flow + " " + str(year) + ": missing " + "; ".join(missing))
    return fv_observed(total)


EU_NOTE_2013 = "Croatia joined the EU on 1 July 2013; the EU figure for 2013 includes Croatia for July-December only (member months), not the full year."
EU_NOTE_2020 = "The United Kingdom left the EU on 31 January 2020; the EU figure for 2020 includes the United Kingdom for January only (member month), not the full year."


def eu_note_for_year(year: int) -> str | None:
    if year == 2013:
        return EU_NOTE_2013
    if year == 2020:
        return EU_NOTE_2020
    return None


def build_eu_chapters(archive: "RawArchive", partner_chapters_all: dict, eu_doc: dict,
                       flow: str, year: int, chapter_set: list[str], eu_year_total_fv: dict) -> dict:
    """EU chapter-level detail for one flow/year, every chapter in chapter_set.

    Full-year (no transition member that year): straightforward sum of full
    members' chapter values; all full members always resolve cleanly in
    this dataset (check 2 is 100% pass), but a defensive absent path exists.

    Transition year (2013, 2020): per CONTRACT Check scope notes (amended),
    EU group and chapter values are observed only when eu_members_hs2
    observations exist for every transition month; otherwise absent with
    the exact reason 'transition-month HS2 observations not acquired'.
    When eu_members_hs2 data exists, each chapter's value is full members'
    chapter sum plus the transition member's summed monthly HS2 values
    (CONTRACT Raw archive layout, eu_members_hs2/ row); the missing-row
    rule is then applied per chapter against the EU year total (check 7a):
    if the sum of every chapter's best-available value (treating any gap
    optimistically as 0) equals the EU year total exactly, every chapter
    with a gap is resolved (confirmed_zero if its running sum is 0,
    otherwise observed at its summed value, since the exact total match is
    the proof every gap contributed nothing); otherwise every chapter that
    has any gap is absent, naming the reconciliation failure.
    """
    full_codes, transitions = eu_membership_for_year(eu_doc, year)

    if not transitions:
        result = {}
        for ch in chapter_set:
            total = 0
            missing = []
            for code in full_codes:
                entry = partner_chapters_all.get(code, {}).get(year, {}).get(flow, {}).get(ch)
                if entry is not None and entry["fv"]["status"] in ("observed", "confirmed_zero"):
                    total += entry["fv"]["value"]
                else:
                    missing.append(code)
            if missing:
                result[ch] = {"fv": fv_absent(
                    f"EU chapter {ch} {flow} {year} absent: missing member chapter value(s) for "
                    + ", ".join(sorted(missing))), "description": None}
            else:
                result[ch] = {"fv": fv_observed(total), "description": None}
        return result

    if not archive.has_eu_members_hs2():
        reason = "transition-month HS2 observations not acquired"
        return {ch: {"fv": fv_absent(reason), "description": None} for ch in chapter_set}

    val_mo_field = FLOW_VAL_MO[flow]
    partial_sum: dict[str, int] = {}
    has_gap: dict[str, bool] = {}
    for ch in chapter_set:
        total = 0
        gap = False
        for code in full_codes:
            entry = partner_chapters_all.get(code, {}).get(year, {}).get(flow, {}).get(ch)
            if entry is not None and entry["fv"]["status"] in ("observed", "confirmed_zero"):
                total += entry["fv"]["value"]
            else:
                gap = True
        for tm in transitions:
            code = tm["census_cty_code"]
            for period in tm["member_months"]:
                row = archive.eu_member_month_hs2(flow, code, period, ch)
                if row is not None and row.get(val_mo_field) not in (None, ""):
                    total += int(row[val_mo_field])
                else:
                    gap = True
        partial_sum[ch] = total
        has_gap[ch] = gap

    usable_total = sum(partial_sum.values())
    reconciles = (eu_year_total_fv["status"] in ("observed", "confirmed_zero")
                  and usable_total == eu_year_total_fv["value"])

    result = {}
    for ch in chapter_set:
        value = partial_sum[ch]
        if not has_gap[ch]:
            result[ch] = {"fv": fv_observed(value), "description": None}
        elif reconciles:
            reason = (f"resolved by reconciliation: all EU {flow} {year} chapter components sum "
                      f"exactly to the EU year total {eu_year_total_fv['value']} (check 7a), so "
                      f"every gap in transition-member monthly HS2 data contributed zero")
            if value == 0:
                result[ch] = {"fv": fv_confirmed_zero(reason), "description": None}
            else:
                result[ch] = {"fv": fv_observed(value), "description": None}
        else:
            reason = (f"EU chapter {ch} {flow} {year} absent: transition member monthly HS2 data "
                      f"incomplete for this chapter, and the sum of all chapters' best-available "
                      f"values ({usable_total}) does not reconcile exactly against the EU year "
                      f"total ({eu_year_total_fv.get('value')}), so no confirmed_zero inference is "
                      f"possible")
            result[ch] = {"fv": fv_absent(reason), "description": None}
    return result


# ---------------------------------------------------------------------------
# Chapter sets, chapters, groups
# ---------------------------------------------------------------------------

def observed_chapter_set(archive: RawArchive, flow: str, year: int) -> list[str]:
    comm_field = FLOW_COMM[flow]
    chapters = set()
    for r in archive.hs2.get((flow, year), []):
        ch = r.get(comm_field)
        if ch and ch != RESERVED_CHAPTER and ch != "-":
            chapters.add(ch)
    assert RESERVED_CHAPTER not in chapters, "chapter 77 observed in data; must never appear"
    return sorted(chapters)


def chapter_group_map(hs_sections_ref: dict) -> dict[str, str]:
    m = {}
    for g in hs_sections_ref["groups"]:
        for ch in g["chapters"]:
            m[ch] = g["id"]
    return m


def partner_chapter_rows(archive: RawArchive, flow: str, year: int, code: str) -> dict[str, dict]:
    comm_field = FLOW_COMM[flow]
    val_field = FLOW_VAL_YR[flow]
    desc_field = FLOW_COMM_SDESC[flow]
    out = {}
    for r in archive.hs2.get((flow, year), []):
        if r.get("CTY_CODE") == code:
            ch = r.get(comm_field)
            if ch and ch != RESERVED_CHAPTER and ch != "-":
                out[ch] = r
    return out


def build_partner_chapters(
    archive: RawArchive, flow: str, year: int, code: str, chapter_set: list[str],
    partner_total_fv: dict,
) -> dict[str, dict]:
    """Returns {chapter: Chapter2-style FlowValue for this flow}. Applies the
    CONTRACT missing-row rule: a missing chapter is confirmed_zero only if the
    present chapters for this partner/year/flow sum exactly to the partner
    total; otherwise absent."""
    rows = partner_chapter_rows(archive, flow, year, code)
    desc_field = FLOW_COMM_SDESC[flow]
    val_field = FLOW_VAL_YR[flow]

    present_values = {}
    for ch in chapter_set:
        r = rows.get(ch)
        if r is not None and r.get(val_field) not in (None, ""):
            present_values[ch] = int(r[val_field])

    missing_chapters = [ch for ch in chapter_set if ch not in present_values]
    reconciles = False
    if missing_chapters and partner_total_fv["status"] in ("observed", "confirmed_zero"):
        present_sum = sum(present_values.values())
        if present_sum == partner_total_fv["value"]:
            reconciles = True

    result = {}
    for ch in chapter_set:
        if ch in present_values:
            result[ch] = {
                "fv": fv_observed(present_values[ch]),
                "description": rows[ch].get(desc_field),
            }
        elif reconciles:
            reason = (f"no row; present chapters sum to partner total {partner_total_fv['value']} "
                      f"for {code} {flow} {year}")
            result[ch] = {"fv": fv_confirmed_zero(reason), "description": None}
        else:
            if partner_total_fv["status"] not in ("observed", "confirmed_zero"):
                reason = f"no row for {code} {flow} {year}-12 chapter {ch}; partner total not observed"
            else:
                present_sum = sum(present_values.values())
                reason = (f"no row for {code} {flow} {year}-12 chapter {ch}; present chapters sum "
                          f"{present_sum} does not equal partner total {partner_total_fv['value']}")
            result[ch] = {"fv": fv_absent(reason), "description": None}
    return result


# ---------------------------------------------------------------------------
# World reconciliation (CONTRACT Aggregation rules, amended): universe sums
# (check 3 and section.years[].universe) are computed over reconciliation
# partners whose value is observed or confirmed_zero; partners with no
# partner-level row for that flow/year stay absent at partner level (never
# imputed) and are simply skipped from the sum. Check 3 passes only when
# that sum equals the separately fetched world total exactly; an exact
# match is the evidence that every skipped (absent) partner contributed
# nothing that flow/year, since all values are non-negative integers.
# ---------------------------------------------------------------------------

def compute_world_reconciliation(archive: "RawArchive", reconciliation_codes: list[str],
                                  flow: str, year: int) -> dict:
    val_field = FLOW_VAL_YR[flow]
    pt_rows = archive.partner_totals.get((flow, year), [])
    pt_by_code = {r["CTY_CODE"]: r for r in pt_rows}
    total = 0
    absent_codes = []
    for code in reconciliation_codes:
        row = pt_by_code.get(code)
        if row is not None and row.get(val_field) not in (None, ""):
            total += int(row[val_field])
        else:
            absent_codes.append(code)
    world_row = archive.world_totals.get((flow, year))
    world_total = None
    if world_row is not None and world_row.get(val_field) not in (None, ""):
        world_total = int(world_row[val_field])
    passed = world_total is not None and total == world_total
    return {
        "status": "PASS" if passed else "FAIL",
        "universe_sum": total,
        "world_total": world_total,
        "absent_codes": sorted(absent_codes),
        "difference": (total - world_total) if world_total is not None else None,
    }


# ---------------------------------------------------------------------------
# Main build
# ---------------------------------------------------------------------------

def build(snapshot_id: str, out_dir: Path, publish: bool) -> Path:
    archive = RawArchive(snapshot_id)
    excluded_codes, cgp_list = load_excluded_codes()
    country_map, country_map_version = load_country_map()
    eu_doc = load_eu_members()
    hs_sections_ref = load_hs_sections_ref()
    ch_to_group = chapter_group_map(hs_sections_ref)

    approved_codes, excluded_entries, unresolved = resolve_partners(
        archive, country_map, excluded_codes, cgp_list)

    if unresolved:
        report_path = REPORTS_DIR / f"unresolved_codes_{snapshot_id}.json"
        write_json_sorted(report_path, {"snapshot_id": snapshot_id, "unresolved_codes": sorted(unresolved)})
        raise RuntimeError(
            f"{len(unresolved)} unresolved partner code(s), publication blocked: "
            f"{sorted(unresolved)}. See {report_path}")

    partner_records = {code: build_partner_record(archive, code, country_map) for code in approved_codes}

    eu_record = {
        "code": "EU", "name": "European Union", "kind": "aggregate",
        "iso3": None, "map_feature_id": None,
        "include_in_world_reconciliation": False,
        "valid_from": None, "valid_to": None,
        "resolution": "approved",
        "resolution_note": "Computed aggregate: historical EU membership, not a Census partner code. See pipeline/eu_members.json.",
    }

    # chapter sets per flow/year, derived from data
    chapter_sets = {"imports": {}, "exports": {}}
    for year in archive.years:
        for flow in ("imports", "exports"):
            chapter_sets[flow][str(year)] = observed_chapter_set(archive, flow, year)
            for ch in chapter_sets[flow][str(year)]:
                if ch not in ch_to_group:
                    raise RuntimeError(f"chapter {ch} ({flow} {year}) does not map to any hs_sections group")

    # per-partner, per-year, per-flow: partner-total FlowValue, chapter FlowValues, group FlowValues
    # eu_group_cache[code][year][section_id] = {"imports": fv, "exports": fv}
    partner_year_totals: dict[str, dict[int, dict[str, dict]]] = {}
    partner_group_values: dict[str, dict[int, dict[str, dict[str, dict]]]] = {}
    partner_chapters_all: dict[str, dict[int, dict[str, dict[str, dict]]]] = {}

    all_codes_for_years = approved_codes + ["EU"]

    for code in approved_codes:
        partner_year_totals[code] = {}
        partner_group_values[code] = {}
        partner_chapters_all[code] = {}
        for year in archive.years:
            flow_totals = {}
            flow_chapters = {}
            for flow in ("imports", "exports"):
                val_field = FLOW_VAL_YR[flow]
                pt_rows = archive.partner_totals.get((flow, year), [])
                row = next((r for r in pt_rows if r["CTY_CODE"] == code), None)
                if row is not None and row.get(val_field) not in (None, ""):
                    total_fv = fv_observed(int(row[val_field]))
                else:
                    total_fv = fv_absent(f"no partner-level row returned for {code} {flow} {year}-12")
                flow_totals[flow] = total_fv
                chapter_set = chapter_sets[flow][str(year)]
                flow_chapters[flow] = build_partner_chapters(archive, flow, year, code, chapter_set, total_fv)
            partner_year_totals[code][year] = flow_totals
            partner_chapters_all[code][year] = flow_chapters

            # groups for this partner/year
            groups_this_year = {}
            for g in hs_sections_ref["groups"]:
                gid = g["id"]
                group_flow_fv = {}
                for flow in ("imports", "exports"):
                    chapter_set = set(chapter_sets[flow][str(year)])
                    member_fvs = []
                    for ch in g["chapters"]:
                        if ch in chapter_set:
                            member_fvs.append(flow_chapters[flow][ch]["fv"])
                        else:
                            member_fvs.append(fv_not_applicable(f"chapter {ch} not in {flow} chapter set for {year}"))
                    group_flow_fv[flow] = sum_flowvalues(member_fvs, not_applicable_ok=True,
                                                          context=f"{code} {gid} {flow} {year}")
                groups_this_year[gid] = group_flow_fv
            partner_group_values[code][year] = groups_this_year

    # EU aggregate per-year totals, per-year per-chapter values, and
    # per-year per-group values (group values are the sum of the same
    # per-chapter EU values, exactly like a real partner's groups).
    partner_year_totals["EU"] = {}
    partner_group_values["EU"] = {}
    eu_chapters_all: dict[int, dict[str, dict]] = {}
    for year in archive.years:
        flow_totals = {}
        for flow in ("imports", "exports"):
            flow_totals[flow] = eu_flow_value(archive, eu_doc, flow, year)
        partner_year_totals["EU"][year] = flow_totals

        eu_chapters_all[year] = {}
        for flow in ("imports", "exports"):
            eu_chapters_all[year][flow] = build_eu_chapters(
                archive, partner_chapters_all, eu_doc, flow, year,
                chapter_sets[flow][str(year)], flow_totals[flow])

        groups_this_year = {}
        for g in hs_sections_ref["groups"]:
            gid = g["id"]
            group_flow_fv = {}
            for flow in ("imports", "exports"):
                chapter_set = set(chapter_sets[flow][str(year)])
                member_fvs = []
                for ch in g["chapters"]:
                    if ch in chapter_set:
                        member_fvs.append(eu_chapters_all[year][flow][ch]["fv"])
                    else:
                        member_fvs.append(fv_not_applicable(f"chapter {ch} not in {flow} chapter set for {year}"))
                group_flow_fv[flow] = sum_flowvalues(member_fvs, not_applicable_ok=True,
                                                      context=f"EU {gid} {flow} {year}")
            groups_this_year[gid] = group_flow_fv
        partner_group_values["EU"][year] = groups_this_year

    # ------------------------------------------------------------------
    # Assemble output files
    # ------------------------------------------------------------------
    build_root = out_dir
    if publish:
        build_root = out_dir.parent / f".building_{out_dir.name}"
        if build_root.exists():
            import shutil
            shutil.rmtree(build_root)

    manifest = archive.manifest
    fetched_at = manifest["acquisition_start"]

    def partner_summary_entry(code: str, year: int) -> dict:
        rec = partner_records.get(code, eu_record if code == "EU" else None)
        totals = partner_year_totals[code][year]
        balance = derive_balance(totals["imports"], totals["exports"], f"{code} {year}")
        total = derive_total_trade_value(totals["imports"], totals["exports"], f"{code} {year}")
        return {
            "code": code, "name": rec["name"], "kind": rec["kind"],
            "include_in_world_reconciliation": rec["include_in_world_reconciliation"],
            "imports": totals["imports"], "exports": totals["exports"],
            "balance": balance, "total_trade_value": total,
        }

    # summary/<year>.json
    for year in archive.years:
        world_row = archive.world_totals.get(("imports", year))
        world_totals = {}
        for flow in ("imports", "exports"):
            row = archive.world_totals.get((flow, year))
            val_field = FLOW_VAL_YR[flow]
            if row is not None and row.get(val_field) not in (None, ""):
                world_totals[flow] = fv_observed(int(row[val_field]))
            else:
                world_totals[flow] = fv_absent(f"no world-total row returned for {flow} {year}-12")
        world_balance = derive_balance(world_totals["imports"], world_totals["exports"], f"world {year}")
        world_total_tv = derive_total_trade_value(world_totals["imports"], world_totals["exports"], f"world {year}")
        summary_doc = {
            "schema_version": SCHEMA_VERSION,
            "snapshot_id": snapshot_id,
            "year": year,
            "world": {"imports": world_totals["imports"], "exports": world_totals["exports"],
                      "balance": world_balance, "total_trade_value": world_total_tv},
            "partners": sorted(
                [partner_summary_entry(code, year) for code in all_codes_for_years],
                key=lambda p: p["code"]),
        }
        write_json_sorted(build_root / "summary" / f"{year}.json", summary_doc)

    # partner/<code>.json
    for code in approved_codes + ["EU"]:
        rec = partner_records.get(code, eu_record)
        years_arr = []
        sections_arr = []
        for year in archive.years:
            totals = partner_year_totals[code][year]
            balance = derive_balance(totals["imports"], totals["exports"], f"{code} {year}")
            total = derive_total_trade_value(totals["imports"], totals["exports"], f"{code} {year}")
            note = eu_note_for_year(year) if code == "EU" else None
            years_arr.append({
                "year": year, "imports": totals["imports"], "exports": totals["exports"],
                "balance": balance, "total_trade_value": total, "note": note,
            })

            groups_out = []
            for g in hs_sections_ref["groups"]:
                gid = g["id"]
                gv = partner_group_values[code][year][gid]
                g_total = derive_total_trade_value(gv["imports"], gv["exports"], f"{code} {gid} {year}")
                chapters_out = []
                for ch in g["chapters"]:
                    imp_set = ch in chapter_sets["imports"][str(year)]
                    exp_set = ch in chapter_sets["exports"][str(year)]
                    if code != "EU":
                        imp_entry = partner_chapters_all[code][year]["imports"].get(ch)
                        exp_entry = partner_chapters_all[code][year]["exports"].get(ch)
                        imp_fv = imp_entry["fv"] if imp_set else fv_not_applicable(
                            f"chapter {ch} not in imports chapter set for {year}")
                        exp_fv = exp_entry["fv"] if exp_set else fv_not_applicable(
                            f"chapter {ch} not in exports chapter set for {year}")
                        description = None
                        if imp_set and imp_entry and imp_entry["description"]:
                            description = imp_entry["description"]
                        elif exp_set and exp_entry and exp_entry["description"]:
                            description = exp_entry["description"]
                    else:
                        imp_fv = (eu_chapters_all[year]["imports"][ch]["fv"] if imp_set
                                  else fv_not_applicable(f"chapter {ch} not in imports chapter set for {year}"))
                        exp_fv = (eu_chapters_all[year]["exports"][ch]["fv"] if exp_set
                                  else fv_not_applicable(f"chapter {ch} not in exports chapter set for {year}"))
                        description = None
                    ch_total = derive_total_trade_value(imp_fv, exp_fv, f"{code} {ch} {year}")
                    chapters_out.append({
                        "chapter": ch, "description": description,
                        "imports": imp_fv, "exports": exp_fv, "total_trade_value": ch_total,
                    })
                groups_out.append({
                    "section_id": gid, "imports": gv["imports"], "exports": gv["exports"],
                    "total_trade_value": g_total,
                    "chapters": sorted(chapters_out, key=lambda c: c["chapter"]),
                })
            sections_arr.append({"year": year, "groups": groups_out})

        partner_doc = {
            "schema_version": SCHEMA_VERSION,
            "snapshot_id": snapshot_id,
            "partner": rec,
            "years": years_arr,
            "sections": sections_arr,
        }
        write_json_sorted(build_root / "partner" / f"{code}.json", partner_doc)

    # section/<id>.json
    reconciliation_codes = [c for c in approved_codes if partner_records[c]["include_in_world_reconciliation"]]

    # Precompute the check-3-equivalent world reconciliation once per
    # (flow, year), shared by every section: this is the amended CONTRACT
    # Aggregation rule, computed the same way validate.py's check 3
    # independently recomputes it from the raw archive.
    world_reconciliation: dict[tuple[str, int], dict] = {}
    for year in archive.years:
        for flow in ("imports", "exports"):
            world_reconciliation[(flow, year)] = compute_world_reconciliation(
                archive, reconciliation_codes, flow, year)

    for g in hs_sections_ref["groups"]:
        gid = g["id"]
        years_out = []
        for year in archive.years:
            universe_flow = {}
            for flow in ("imports", "exports"):
                wr = world_reconciliation[(flow, year)]
                if wr["status"] != "PASS":
                    universe_flow[flow] = fv_absent(
                        f"universe absent for {gid} {flow} {year}: check 3 world_totals FAILED for "
                        f"{flow} {year} (reports/pipeline/validation.csv check=world_totals "
                        f"year={year} flow={flow}); universe_sum={wr['universe_sum']} "
                        f"world_total={wr['world_total']} difference={wr['difference']}")
                    continue
                contributing_codes = [c for c in reconciliation_codes if c not in wr["absent_codes"]]
                group_sum = 0
                all_group_ok = True
                unresolved_group_codes = []
                for code in contributing_codes:
                    gv = partner_group_values[code][year][gid][flow]
                    if gv["status"] in ("observed", "confirmed_zero"):
                        group_sum += gv["value"]
                    else:
                        all_group_ok = False
                        unresolved_group_codes.append(code)
                if all_group_ok:
                    universe_flow[flow] = fv_observed(group_sum)
                else:
                    # Defensive only: empirically every partner whose overall
                    # total reconciles (check 2, 100% pass in this dataset)
                    # also has every group resolved. If that ever breaks,
                    # never impute; mark absent with the anomaly named.
                    universe_flow[flow] = fv_absent(
                        f"universe absent for {gid} {flow} {year}: check 3 world_totals passed but "
                        f"group value not observed for contributing partner(s) "
                        + ", ".join(sorted(unresolved_group_codes)))
            universe_balance = derive_balance(universe_flow["imports"], universe_flow["exports"], f"{gid} universe {year}")
            universe_total = derive_total_trade_value(universe_flow["imports"], universe_flow["exports"], f"{gid} universe {year}")

            partners_out = []
            for code in all_codes_for_years:
                rec = partner_records.get(code, eu_record)
                gv = partner_group_values[code][year][gid]
                p_balance = derive_balance(gv["imports"], gv["exports"], f"{code} {gid} {year}")
                p_total = derive_total_trade_value(gv["imports"], gv["exports"], f"{code} {gid} {year}")
                partners_out.append({
                    "code": code, "name": rec["name"], "kind": rec["kind"],
                    "include_in_world_reconciliation": rec["include_in_world_reconciliation"],
                    "imports": gv["imports"], "exports": gv["exports"],
                    "balance": p_balance, "total_trade_value": p_total,
                })
            years_out.append({
                "year": year,
                "universe": {"imports": universe_flow["imports"], "exports": universe_flow["exports"],
                             "balance": universe_balance, "total_trade_value": universe_total},
                "partners": sorted(partners_out, key=lambda p: p["code"]),
            })
        section_doc = {
            "schema_version": SCHEMA_VERSION,
            "snapshot_id": snapshot_id,
            "section": {"id": gid, "name": g["name"], "chapters": g["chapters"]},
            "years": years_out,
        }
        write_json_sorted(build_root / "section" / f"{gid}.json", section_doc)

    # hs_sections.json (published copy, chapter_sets populated)
    hs_sections_out = {
        "version": hs_sections_ref["version"],
        "source": hs_sections_ref["source"],
        "groups": hs_sections_ref["groups"],
        "chapter_sets": chapter_sets,
    }
    write_json_sorted(build_root / "hs_sections.json", hs_sections_out)

    # partners.json
    all_partner_entries = list(partner_records.values()) + [eu_record] + excluded_entries
    partners_doc = {
        "schema_version": SCHEMA_VERSION,
        "snapshot_id": snapshot_id,
        "partners": sorted(all_partner_entries, key=lambda p: p["code"]),
    }
    write_json_sorted(build_root / "partners.json", partners_doc)

    # meta.json
    code_commit = get_code_commit()
    notes = []
    if code_commit == "0" * 40:
        notes.append("code_commit is 40 zeros: no git commit exists yet in this repository at build time.")
    notes.append(
        "Residual gap (SPEC AVAILABILITY): a partner-level revision that leaves every world total "
        "unchanged is not detected by the source fingerprint or by validation checks 2/3, since both "
        "compare against the same Census-reported partner and world totals at acquisition time.")
    notes.append(
        "Per CONTRACT.md Identifiers (amended): the Census world row '-' and the wildcard region "
        "codes 1XXX, 2XXX, 3XXX, 4XXX, 5XXX, 6XXX, 7XXX cannot be represented by PartnerCode's "
        "schema pattern ^([0-9]{4}|EU)$, so they are excluded in pipeline/excluded_codes.json and "
        "listed here instead of in partners.json: world row '-' (TOTAL FOR ALL COUNTRIES) and "
        "region codes 1XXX (NORTH AMERICA), 2XXX (CENTRAL AMERICA), 3XXX (SOUTH AMERICA), 4XXX "
        "(EUROPE), 5XXX (ASIA), 6XXX (AUSTRALIA AND OCEANIA), 7XXX (AFRICA), all observed live in "
        f"raw/{snapshot_id}/partner_totals/. partners.json carries every four-digit code observed, "
        f"approved or excluded; {len(excluded_entries)} four-digit CGP codes are written with "
        "resolution excluded.")
    if "8220" in approved_codes:
        notes.append(
            "Code 8220 (kind=special; see partners.json resolution_note): the API returns a "
            "null CTY_NAME for this code, and it is absent from Schedule C and the API guide. "
            "Census does publish a page for it, titled 'Trade in Goods with Unidentified "
            "Countries' (https://www.census.gov/foreign-trade/balance/c8220.html; captured "
            "page saved at tests/fixtures/published_examples/sources/8220_attempt.txt). Owner "
            "approved the display name 'Unidentified Countries (Census code 8220)' on "
            "2026-09-09, citing that captured page (Census's own page title, 'Unidentified "
            f"Countries', plus the code). See reports/pipeline/unresolved_codes_{snapshot_id}.json "
            "for the record of that approval.")

    latest_periods = manifest["fingerprint_after"]["latest_period"]
    top_latest_period = min(latest_periods.values())

    meta_doc = {
        "schema_version": SCHEMA_VERSION,
        "snapshot_id": snapshot_id,
        "code_commit": code_commit,
        "model_ids": {"orchestrator": "claude-fable-5-1", "subagents": "claude-sonnet-5"},
        "raw_manifest_hash": sha256_hex((archive.dir / "manifest.json").read_text()),
        "fetched_at": fetched_at,
        "source_last_update": {
            "imports": manifest["observed_last_update"].get("imports", "0"),
            "exports": manifest["observed_last_update"].get("exports", "0"),
            "verified": False,
        },
        "source_fingerprint": {
            "latest_period": latest_periods,
            "world_totals_sha256": manifest["fingerprint_after"]["world_totals_sha256"],
            "before_equals_after": manifest["fingerprint_match"],
        },
        "latest_period": top_latest_period,
        "documented_availability": {
            "from_year": manifest["documented_availability"]["from_year"],
            "source": ("SPEC AVAILABILITY documented lower bound (2010); no independent Census "
                       "publication was found stating this lower bound, so it is the project's "
                       "operating assumption, empirically confirmed by successful live probes back "
                       "to 2010 (raw/" + snapshot_id + "/availability/probes.csv)."),
        },
        "verified_availability": {
            "from_year": manifest["verified_availability"]["from_year"],
            "to_year": manifest["verified_availability"]["to_year"],
            "probes_file": f"raw/{snapshot_id}/availability/probes.csv",
        },
        "configured_coverage": manifest["configured_coverage"],
        "eu_definition": ("Historical membership: trade with countries that were members of the EU "
                           "when the trade occurred, per pipeline/eu_members.json (source: "
                           "https://european-union.europa.eu/principles-countries-history/eu-countries_en)."),
        "country_map_version": country_map_version,
        "hs_sections_version": hs_sections_ref["version"],
        "notes": notes,
    }
    if not manifest["fingerprint_match"]:
        raise RuntimeError("fingerprint mismatch recorded in manifest; this archive must not be built/published")
    write_json_sorted(build_root / "meta.json", meta_doc)

    if publish:
        if out_dir.exists():
            raise RuntimeError(f"refusing to overwrite existing snapshot directory {out_dir}")
        build_root.rename(out_dir)
        return out_dir
    return build_root


def get_code_commit() -> str:
    import subprocess
    try:
        result = subprocess.run(["git", "-C", str(ROOT), "rev-parse", "HEAD"],
                                 capture_output=True, text=True, timeout=10)
        sha = result.stdout.strip()
        if result.returncode == 0 and len(sha) == 40:
            return sha
    except Exception:
        pass
    return "0" * 40


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("snapshot_id")
    parser.add_argument("--out", required=True)
    parser.add_argument("--publish", action="store_true")
    args = parser.parse_args()
    result = build(args.snapshot_id, Path(args.out), args.publish)
    print(f"[build] wrote {result}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
