"""
BUILD ORDER step 1 source test for the US goods trade partner visualization.

Confirmed field names (from raw/source_test/variables_imports.response.json,
raw/source_test/variables_exports.response.json, and
raw/source_test/api_guide/guide.txt, all fetched live and saved to disk):

imports (hs): value fields GEN_VAL_YR / GEN_VAL_MO. commodity dimension
  I_COMMODITY (+ I_COMMODITY_SDESC, I_COMMODITY_LDESC), level variable
  COMM_LVL. partner CTY_CODE / CTY_NAME. SUMMARY_LVL present. other
  dimension/predicate-only variables: DISTRICT, RP (not "RATE_PROVISION" -
  the guide and variables.json both name it RP), CTY_SUBCODE.

exports (hs): value fields ALL_VAL_YR / ALL_VAL_MO. commodity dimension
  E_COMMODITY (+ E_COMMODITY_SDESC, E_COMMODITY_LDESC), level variable
  COMM_LVL. partner CTY_CODE / CTY_NAME. SUMMARY_LVL present. other
  dimension variables: DF, DISTRICT.

Each stage below is runnable independently: `python source_test.py <stage>`.
Every request is saved via CensusClient (request/response pair). Stage
"manifest" builds raw/source_test/manifest.json over every file present.
"""

from __future__ import annotations

import csv
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from census_client import CensusClient, load_api_key, sha256_of_file  # noqa: E402

ROOT = Path(".")
OUT = ROOT / "raw" / "source_test"
REPORT_DIR = ROOT / "reports" / "pipeline"

IMPORTS_URL = "https://api.census.gov/data/timeseries/intltrade/imports/hs"
EXPORTS_URL = "https://api.census.gov/data/timeseries/intltrade/exports/hs"

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

TIME_2023_12 = "2023-12"


def get_client() -> CensusClient:
    key = load_api_key()
    return CensusClient(key, OUT)


def parse_rows(body_text: str) -> tuple[list[str], list[list[str]]]:
    data = json.loads(body_text)
    header = data[0]
    rows = data[1:]
    return header, rows


def rows_as_dicts(header: list[str], rows: list[list[str]]) -> list[dict]:
    return [dict(zip(header, row)) for row in rows]


# ---------------------------------------------------------------------------
# Stage 3: all-partner query, both flows, time=2023-12, commodity omitted
#
# IMPORTANT (discovered live, see raw/source_test/probe/probeA_get_only.*):
# a dimension variable placed in "get" WITHOUT a predicate is not collapsed
# to its total; the API instead breaks the result out by every distinct
# stored value of that dimension (it returned 132 rows for one country once
# DF and DISTRICT were added to get with no predicate, because the
# underlying table stores separate summary rows per district/DF
# combination). To keep a dimension at its total ("-") while still proving
# that setting in the response, it must be given an explicit "-" predicate
# (see probeB_dash_predicate.* and probeD_imports_dash.*, both of which
# return a single row with the dimension field literally "-" and a value
# identical to the same query with the dimension omitted entirely, see
# probeC_no_dims_in_get.* and probeE_imports_omit.*).
# ---------------------------------------------------------------------------

def stage3():
    client = get_client()
    summary = {}
    for flow, cfg in FLOWS.items():
        get_fields = ["CTY_CODE", "CTY_NAME", "SUMMARY_LVL", cfg["val_yr"]] + cfg["unused_dims"]
        params = {"get": ",".join(get_fields), "time": TIME_2023_12}
        for dim in cfg["unused_dims"]:
            params[dim] = "-"
        result = client.fetch(f"all_partners_{flow}", cfg["url"], params)
        print(f"{flow}: status={result.status} error={result.error}")
        if not result.is_json:
            summary[flow] = {"error": result.error, "status": result.status}
            continue
        header, rows = parse_rows(result.body_text)
        recs = rows_as_dicts(header, rows)
        summary[flow] = {
            "row_count": len(recs),
            "header": header,
        }
        print(f"{flow}: {len(recs)} rows, header={header}")

    (OUT / "stage3_summary.json").write_text(json.dumps(summary, indent=2, sort_keys=True) + "\n")
    print("stage3 done. Inspect raw/source_test/all_partners_{imports,exports}.response.json")


# ---------------------------------------------------------------------------
# Stage 3b: analyze the saved all-partner responses (no network)
# ---------------------------------------------------------------------------

def stage3_analyze():
    analysis = {}
    for flow, cfg in FLOWS.items():
        path = OUT / f"all_partners_{flow}.response.json"
        data = json.loads(path.read_text())
        header, rows = data[0], data[1:]
        recs = rows_as_dicts(header, rows)
        val_field = cfg["val_yr"]

        world_rows = [r for r in recs if r["CTY_CODE"] == "-"]
        group_like = [r for r in recs if r["CTY_CODE"] != "-" and (
            r.get("SUMMARY_LVL") == "CGP"
        )]
        det_rows = [r for r in recs if r["CTY_CODE"] != "-" and r.get("SUMMARY_LVL") != "CGP"]

        nonzero_det = [r for r in det_rows if r[val_field] not in (None, "", "0")]
        nonzero_det_sorted = sorted(nonzero_det, key=lambda r: int(r[val_field]))

        analysis[flow] = {
            "total_rows": len(recs),
            "world_rows": world_rows,
            "group_like_count": len(group_like),
            "group_like_examples": group_like[:40],
            "det_row_count": len(det_rows),
            "smallest_nonzero_det": nonzero_det_sorted[:15],
            "all_names_sample": sorted({r["CTY_NAME"] for r in recs})[:400],
        }
    (OUT / "stage3_analysis.json").write_text(json.dumps(analysis, indent=2, sort_keys=True) + "\n")
    for flow in FLOWS:
        a = analysis[flow]
        print(f"=== {flow} ===")
        print("total_rows:", a["total_rows"])
        print("world_rows:", a["world_rows"])
        print("group_like_count:", a["group_like_count"])
        print("smallest_nonzero (top 10):")
        for r in a["smallest_nonzero_det"][:10]:
            print(" ", r)


# ---------------------------------------------------------------------------
# Stage 2: partner total, both flows, commodity omitted, three partners
# ---------------------------------------------------------------------------

def load_selected_partners() -> dict:
    return json.loads((OUT / "selected_partners.json").read_text())


def stage2():
    client = get_client()
    partners = load_selected_partners()
    results = {}
    for flow, cfg in FLOWS.items():
        results[flow] = {}
        get_fields = ["CTY_CODE", "CTY_NAME", "SUMMARY_LVL", cfg["val_yr"]] + cfg["unused_dims"]
        for kind, p in partners.items():
            code = p["code"]
            name = f"partner_total_{flow}_{kind}"
            params = {
                "get": ",".join(get_fields),
                "time": TIME_2023_12,
                "CTY_CODE": code,
            }
            for dim in cfg["unused_dims"]:
                params[dim] = "-"
            result = client.fetch(name, cfg["url"], params)
            print(f"{flow} {kind} ({code}): status={result.status} error={result.error}")
            if result.is_json:
                header, rows = parse_rows(result.body_text)
                recs = rows_as_dicts(header, rows)
                results[flow][kind] = recs
                print("  ->", recs)
            else:
                results[flow][kind] = {"error": result.error}
    (OUT / "stage2_summary.json").write_text(json.dumps(results, indent=2, sort_keys=True) + "\n")


# ---------------------------------------------------------------------------
# Stage 4: world total (separate query) + world HS2 detail row count
# ---------------------------------------------------------------------------

def stage4():
    client = get_client()
    partners = load_selected_partners()
    world_code = partners["world"]["code"]
    results = {}
    for flow, cfg in FLOWS.items():
        get_fields = ["CTY_CODE", "CTY_NAME", cfg["val_yr"]]
        params = {"get": ",".join(get_fields), "time": TIME_2023_12, "CTY_CODE": world_code}
        r1 = client.fetch(f"world_total_{flow}", cfg["url"], params)
        print(f"{flow} world total: status={r1.status}")
        world_total_rec = None
        if r1.is_json:
            header, rows = parse_rows(r1.body_text)
            world_total_rec = rows_as_dicts(header, rows)
            print("  ->", world_total_rec)

        get_fields2 = ["CTY_CODE", "CTY_NAME", cfg["comm"], "COMM_LVL", cfg["val_yr"]]
        params2 = {
            "get": ",".join(get_fields2),
            "time": TIME_2023_12,
            "CTY_CODE": world_code,
            "COMM_LVL": "HS2",
        }
        r2 = client.fetch(f"world_hs2_{flow}", cfg["url"], params2)
        print(f"{flow} world HS2 detail: status={r2.status}")
        row_count = None
        if r2.is_json:
            header2, rows2 = parse_rows(r2.body_text)
            row_count = len(rows2)
            print(f"  -> {row_count} rows")

        results[flow] = {"world_total": world_total_rec, "world_hs2_row_count": row_count}

    (OUT / "stage4_summary.json").write_text(json.dumps(results, indent=2, sort_keys=True) + "\n")


# ---------------------------------------------------------------------------
# Stage 5: HS2 detail for the three partners, both flows
# ---------------------------------------------------------------------------

def stage5():
    client = get_client()
    partners = load_selected_partners()
    results = {}
    for flow, cfg in FLOWS.items():
        results[flow] = {}
        get_fields = [
            "CTY_CODE", "CTY_NAME", cfg["comm"], cfg["comm_sdesc"], "COMM_LVL", cfg["val_yr"],
        ] + cfg["unused_dims"]
        for kind, p in partners.items():
            if kind == "world":
                continue
            code = p["code"]
            name = f"hs2_{flow}_{kind}"
            params = {
                "get": ",".join(get_fields),
                "time": TIME_2023_12,
                "CTY_CODE": code,
                "COMM_LVL": "HS2",
            }
            for dim in cfg["unused_dims"]:
                params[dim] = "-"
            result = client.fetch(name, cfg["url"], params)
            print(f"{flow} {kind} HS2 ({code}): status={result.status}")
            if result.is_json:
                header, rows = parse_rows(result.body_text)
                recs = rows_as_dicts(header, rows)
                chapters = sorted({r[cfg["comm"]] for r in recs})
                results[flow][kind] = {
                    "row_count": len(recs),
                    "chapters": chapters,
                    "sample_rows": recs[:5],
                }
                print(f"  -> {len(recs)} rows, chapters sample: {chapters[:10]}")
            else:
                results[flow][kind] = {"error": result.error}

    (OUT / "stage5_summary.json").write_text(json.dumps(results, indent=2, sort_keys=True) + "\n")


# ---------------------------------------------------------------------------
# Stage 6: unused-dimension contrast queries (predicate set to non-total value)
# ---------------------------------------------------------------------------

def stage6():
    """Contrast queries only. The total-setting baseline for every unused
    dimension (DF, DISTRICT on exports; DISTRICT, RP, CTY_SUBCODE on
    imports) is already proven in the stage2 (partner total) and stage5
    (HS2 detail) responses, where each is given an explicit "-" predicate.
    This stage requests a non-total value for the dimensions with observed
    allowed-value evidence (DF, DISTRICT, CTY_SUBCODE) and records RP as
    not verified (no allowed-value evidence found)."""
    client = get_client()
    partners = load_selected_partners()
    china_code = partners["large"]["code"]
    results = {}

    # exports DF contrast: DF=1 (Domestic) vs DF=2 (Foreign), per guide.txt
    # line 1041 "DF - Domestic(1) or Foreign(2)" (raw/source_test/api_guide/guide.txt)
    cfg = FLOWS["exports"]
    get_fields = ["CTY_CODE", "CTY_NAME", "DF", cfg["val_yr"]]
    params_df1 = {"get": ",".join(get_fields), "time": TIME_2023_12, "CTY_CODE": china_code, "DF": "1"}
    r_df1 = client.fetch("contrast_exports_DF_1", cfg["url"], params_df1)
    params_df2 = {"get": ",".join(get_fields), "time": TIME_2023_12, "CTY_CODE": china_code, "DF": "2"}
    r_df2 = client.fetch("contrast_exports_DF_2", cfg["url"], params_df2)
    results["exports_DF"] = {
        "DF_1": json.loads(r_df1.body_text) if r_df1.is_json else {"error": r_df1.error},
        "DF_2": json.loads(r_df2.body_text) if r_df2.is_json else {"error": r_df2.error},
    }
    print("exports DF=1:", results["exports_DF"]["DF_1"])
    print("exports DF=2:", results["exports_DF"]["DF_2"])

    # imports DISTRICT contrast: DISTRICT=13 (Baltimore), per the API guide's
    # own live example (guide.txt line ~515, District Exports from Baltimore,
    # DISTRICT=13).
    cfgi = FLOWS["imports"]
    get_fields_i = ["CTY_CODE", "CTY_NAME", "DISTRICT", "DIST_NAME", cfgi["val_yr"]]
    params_d13 = {"get": ",".join(get_fields_i), "time": TIME_2023_12, "CTY_CODE": china_code, "DISTRICT": "13"}
    r_d13 = client.fetch("contrast_imports_DISTRICT_13", cfgi["url"], params_d13)
    results["imports_DISTRICT_13"] = json.loads(r_d13.body_text) if r_d13.is_json else {"error": r_d13.error}
    print("imports DISTRICT=13:", results["imports_DISTRICT_13"])

    # imports RP (Rate Provision) has no allowed-value list in variables.json
    # or the guide (guide.txt only names RP, no code table). No contrast run;
    # recorded as Not verified in the report.
    results["imports_RP_contrast"] = "not_run: no allowed-value evidence found for RP"
    print(results["imports_RP_contrast"])

    # imports CTY_SUBCODE contrast: CTY_SUBCODE=P+ ("P+"), reproducing the
    # API guide's own live example exactly (guide.txt lines 414-422 and
    # 505-506: get=CTY_SUBCODE,GEN_VAL_MO&time=2013-01&CTY_SUBCODE=P+, no
    # CTY_CODE predicate). China+2023-12 with CTY_SUBCODE=P+ returned HTTP
    # 204 (no data for that combination), so this uses the guide's own
    # parameters, which are known to return a nonzero value.
    params_cs = {"get": "CTY_SUBCODE,GEN_VAL_MO", "time": "2013-01", "CTY_SUBCODE": "P+"}
    r_cs = client.fetch("contrast_imports_CTY_SUBCODE_Pplus", cfgi["url"], params_cs)
    results["imports_CTY_SUBCODE_Pplus"] = json.loads(r_cs.body_text) if r_cs.is_json else {"error": r_cs.error}
    print("imports CTY_SUBCODE=P+:", results["imports_CTY_SUBCODE_Pplus"])

    (OUT / "stage6_summary.json").write_text(json.dumps(results, indent=2, sort_keys=True) + "\n")


def stage6_rp_breakout():
    """RP breakout probe (TASK 0). Query China imports 2023-12 with RP in
    get and no RP predicate, to see whether RP has an allowed-value
    breakdown and whether it sums back to the RP="-" total from stage2.
    Saved as raw/source_test/rp_breakout_imports_2023.{request,response}.json.
    """
    client = get_client()
    partners = load_selected_partners()
    china_code = partners["large"]["code"]
    cfgi = FLOWS["imports"]
    get_fields = ["CTY_CODE", "CTY_NAME", "RP", cfgi["val_yr"]]
    params = {"get": ",".join(get_fields), "time": TIME_2023_12, "CTY_CODE": china_code}
    r = client.fetch("rp_breakout_imports_2023", cfgi["url"], params)
    if not r.is_json:
        print("rp_breakout fetch failed:", r.error)
        return
    header, rows = parse_rows(r.body_text)
    records = rows_as_dicts(header, rows)

    dash_rows = [rec for rec in records if rec["RP"] == "-"]
    non_dash_rows = [rec for rec in records if rec["RP"] != "-"]
    non_dash_sum = sum(int(rec[cfgi["val_yr"]]) for rec in non_dash_rows)
    dash_value = int(dash_rows[0][cfgi["val_yr"]]) if dash_rows else None

    summary = {
        "total_rows": len(records),
        "dash_row_count": len(dash_rows),
        "dash_value": dash_value,
        "non_dash_row_count": len(non_dash_rows),
        "non_dash_rp_codes": sorted(rec["RP"] for rec in non_dash_rows),
        "non_dash_sum": non_dash_sum,
        "matches_dash": non_dash_sum == dash_value,
    }
    (OUT / "rp_breakout_summary.json").write_text(json.dumps(summary, indent=2, sort_keys=True) + "\n")
    print("rp_breakout:", summary)


# ---------------------------------------------------------------------------
# Stage 7: EU boundary months for Croatia and UK
# ---------------------------------------------------------------------------

def stage7_find_codes():
    """Find CTY_CODE for Croatia and United Kingdom from the saved
    all-partner response (item 3), no new network call."""
    codes = {}
    for flow in FLOWS:
        path = OUT / f"all_partners_{flow}.response.json"
        data = json.loads(path.read_text())
        header, rows = data[0], data[1:]
        recs = rows_as_dicts(header, rows)
        for r in recs:
            name = r["CTY_NAME"].upper()
            if "CROATIA" in name:
                codes.setdefault("croatia", {})[flow] = {"code": r["CTY_CODE"], "name": r["CTY_NAME"]}
            if "UNITED KINGDOM" in name:
                codes.setdefault("united_kingdom", {})[flow] = {"code": r["CTY_CODE"], "name": r["CTY_NAME"]}
    (OUT / "eu_boundary_codes.json").write_text(json.dumps(codes, indent=2, sort_keys=True) + "\n")
    print(json.dumps(codes, indent=2, sort_keys=True))
    return codes


def stage7():
    client = get_client()
    codes = json.loads((OUT / "eu_boundary_codes.json").read_text())
    periods = ["2013-06", "2013-07", "2020-01", "2020-02"]
    table_rows = []
    for partner_key, partner_label in [("croatia", "Croatia"), ("united_kingdom", "United Kingdom")]:
        for flow, cfg in FLOWS.items():
            code = codes[partner_key][flow]["code"]
            for period in periods:
                get_fields = ["CTY_CODE", "CTY_NAME", cfg["val_mo"], cfg["val_yr"]]
                params = {"get": ",".join(get_fields), "time": period, "CTY_CODE": code}
                name = f"eu_boundary_{flow}_{partner_key}_{period}"
                result = client.fetch(name, cfg["url"], params)
                rec = None
                if result.is_json:
                    header, rows = parse_rows(result.body_text)
                    recs = rows_as_dicts(header, rows)
                    rec = recs[0] if recs else None
                row = {
                    "partner": partner_label,
                    "flow": flow,
                    "period": period,
                    "mo_value": rec.get(cfg["val_mo"]) if rec else None,
                    "yr_value": rec.get(cfg["val_yr"]) if rec else None,
                    "status": result.status,
                }
                table_rows.append(row)
                print(row)

    (OUT / "stage7_table.json").write_text(json.dumps(table_rows, indent=2, sort_keys=True) + "\n")
    with open(OUT / "stage7_table.csv", "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["partner", "flow", "period", "mo_value", "yr_value", "status"])
        w.writeheader()
        for row in table_rows:
            w.writerow(row)


# ---------------------------------------------------------------------------
# Stage 8: availability probes 2010-2026
# ---------------------------------------------------------------------------

def stage8():
    client = get_client()
    china_code_by_flow = {}
    partners = load_selected_partners()
    china_code = partners["large"]["code"]

    rows = []
    for year in range(2010, 2027):
        for flow, cfg in FLOWS.items():
            time_val = f"{year}-12"

            # partner total
            get_fields = ["CTY_CODE", "CTY_NAME", cfg["val_yr"]]
            params = {"get": ",".join(get_fields), "time": time_val, "CTY_CODE": china_code}
            name = f"avail_total_{flow}_{year}"
            result = client.fetch(name, cfg["url"], params)
            note = ""
            has_data = False
            n_rows = 0
            if result.error:
                note = f"failure: {result.error}"
            elif result.status == 200 and result.is_json:
                try:
                    header, data_rows = parse_rows(result.body_text)
                    n_rows = len(data_rows)
                    has_data = n_rows > 0 and any(
                        r[header.index(cfg["val_yr"])] not in (None, "") for r in data_rows
                    )
                except (json.JSONDecodeError, ValueError, IndexError) as exc:
                    note = f"failure: parse error {exc}"
            elif result.status is not None and 400 <= result.status < 500:
                note = "failure: 4xx auth/invalid-request"
            elif result.status == 204:
                note = "unavailable: HTTP 204 no content (period not yet published)"
            else:
                note = f"failure: status={result.status}"

            rows.append({
                "flow": flow, "level": "partner_total", "year": year, "period": time_val,
                "http_status": result.status, "rows": n_rows, "has_data": has_data, "note": note,
            })

            # HS2 detail
            get_fields2 = ["CTY_CODE", "CTY_NAME", cfg["comm"], "COMM_LVL", cfg["val_yr"]]
            params2 = {
                "get": ",".join(get_fields2), "time": time_val, "CTY_CODE": china_code, "COMM_LVL": "HS2",
            }
            name2 = f"avail_hs2_{flow}_{year}"
            result2 = client.fetch(name2, cfg["url"], params2)
            note2 = ""
            has_data2 = False
            n_rows2 = 0
            if result2.error:
                note2 = f"failure: {result2.error}"
            elif result2.status == 200 and result2.is_json:
                try:
                    header2, data_rows2 = parse_rows(result2.body_text)
                    n_rows2 = len(data_rows2)
                    has_data2 = n_rows2 > 0
                except (json.JSONDecodeError, ValueError, IndexError) as exc:
                    note2 = f"failure: parse error {exc}"
            elif result2.status is not None and 400 <= result2.status < 500:
                note2 = "failure: 4xx auth/invalid-request"
            elif result2.status == 204:
                note2 = "unavailable: HTTP 204 no content (period not yet published)"
            else:
                note2 = f"failure: status={result2.status}"

            rows.append({
                "flow": flow, "level": "hs2_detail", "year": year, "period": time_val,
                "http_status": result2.status, "rows": n_rows2, "has_data": has_data2, "note": note2,
            })
            print(rows[-2])
            print(rows[-1])

    with open(OUT / "availability.csv", "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["flow", "level", "year", "period", "http_status", "rows", "has_data", "note"])
        w.writeheader()
        for row in rows:
            w.writerow(row)
    print(f"wrote {OUT / 'availability.csv'} with {len(rows)} rows")


# ---------------------------------------------------------------------------
# Stage 9: LAST_UPDATE and latest 2026 period with data for both flows
# ---------------------------------------------------------------------------

def stage9():
    client = get_client()
    partners = load_selected_partners()
    china_code = partners["large"]["code"]
    results = {}

    for flow, cfg in FLOWS.items():
        get_fields = ["CTY_CODE", "CTY_NAME", "LAST_UPDATE", cfg["val_yr"]]
        params = {"get": ",".join(get_fields), "time": TIME_2023_12, "CTY_CODE": china_code}
        name = f"last_update_{flow}"
        result = client.fetch(name, cfg["url"], params)
        rec = None
        if result.is_json:
            header, rows = parse_rows(result.body_text)
            recs = rows_as_dicts(header, rows)
            rec = recs[0] if recs else None
        results[f"{flow}_last_update"] = rec
        print(flow, "LAST_UPDATE row:", rec)

    # dataset discovery JSON, as additional candidate evidence
    for name, url in [
        ("dataset_list_intltrade", "https://api.census.gov/data/timeseries/intltrade.json"),
        ("dataset_imports_hs", "https://api.census.gov/data/timeseries/intltrade/imports/hs.json"),
        ("dataset_exports_hs", "https://api.census.gov/data/timeseries/intltrade/exports/hs.json"),
    ]:
        result = client.fetch(name, url, {})
        print(name, "status", result.status, "is_json", result.is_json)

    # probe months of 2026 Jan..Sep for latest period with data both flows
    months_2026 = [f"2026-{m:02d}" for m in range(1, 10)]
    probe_rows = []
    for month in months_2026:
        row = {"period": month}
        for flow, cfg in FLOWS.items():
            get_fields = ["CTY_CODE", "CTY_NAME", cfg["val_mo"]]
            params = {"get": ",".join(get_fields), "time": month, "CTY_CODE": china_code}
            name = f"probe2026_{flow}_{month}"
            result = client.fetch(name, cfg["url"], params)
            has_data = False
            if result.is_json:
                try:
                    header, rows = parse_rows(result.body_text)
                    has_data = len(rows) > 0 and rows[0][header.index(cfg["val_mo"])] not in (None, "")
                except (json.JSONDecodeError, ValueError, IndexError):
                    has_data = False
            row[f"{flow}_status"] = result.status
            row[f"{flow}_has_data"] = has_data
        probe_rows.append(row)
        print(row)

    results["probe_2026"] = probe_rows
    (OUT / "stage9_summary.json").write_text(json.dumps(results, indent=2, sort_keys=True) + "\n")


# ---------------------------------------------------------------------------
# Manifest
# ---------------------------------------------------------------------------

def stage_manifest():
    entries = []
    for path in sorted(OUT.rglob("*")):
        if path.is_file() and path.name != "manifest.json":
            entries.append({
                "path": str(path.relative_to(ROOT)),
                "sha256": sha256_of_file(path),
                "size_bytes": path.stat().st_size,
            })
    # last_update evidence, if stage9 has run
    last_update_evidence = {}
    stage9_path = OUT / "stage9_summary.json"
    if stage9_path.exists():
        s9 = json.loads(stage9_path.read_text())
        for flow in FLOWS:
            rec = s9.get(f"{flow}_last_update")
            if rec:
                last_update_evidence[flow] = rec.get("LAST_UPDATE")

    manifest = {
        "file_count": len(entries),
        "files": entries,
        "last_update_evidence": last_update_evidence,
    }
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n")
    print(f"manifest written with {len(entries)} files")


STAGES = {
    "3": stage3,
    "3analyze": stage3_analyze,
    "2": stage2,
    "4": stage4,
    "5": stage5,
    "6": stage6,
    "6rp": stage6_rp_breakout,
    "7codes": stage7_find_codes,
    "7": stage7,
    "8": stage8,
    "9": stage9,
    "manifest": stage_manifest,
}

if __name__ == "__main__":
    if len(sys.argv) != 2 or sys.argv[1] not in STAGES:
        print(f"usage: python source_test.py <{'|'.join(STAGES.keys())}>")
        sys.exit(1)
    STAGES[sys.argv[1]]()
