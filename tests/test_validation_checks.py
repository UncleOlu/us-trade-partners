"""VALIDATION checks 1-9 from docs/SPEC.md, recomputed independently.

Each check has:
  - a synthetic unit test (test_c0Xu_*) that exercises the recomputation
    logic in _checks.py against constructed data, so the logic itself is
    verified now, before data/ exists;
  - an integration test (test_c0X_*) that runs the same logic against the
    single discovered data/<snapshot_id>, and reports not run (pytest skip)
    when zero or multiple such directories exist.

Test ids: test_c01_* .. test_c09_*.

Also in this file, added once the contract was finalized (schema/
CONTRACT.md 'Missing-row rule', 'Raw archive layout', 'Published
examples'):
  - test_eu0*: unit tests for the EU calculation helpers in _checks.py
    (parse_census_rows, census_row_value, eu_membership_for_year,
    compute_eu_total_for_year_flow), all runnable now against synthetic
    data and tests/fixtures/eu_members_fixture.json.
  - test_c07a_eu_calculation_full: the real integration test, reading
    raw/<snapshot_id>/partner_totals/ and raw/<snapshot_id>/eu_members/,
    not run until both exist.
  - test_c06_validation_csv_lists_all_five_published_example_identifiers
    and test_c06_partner_data_matches_published_examples_within_rounding:
    check 6 against tests/fixtures/published_examples/, not run until
    validation.csv / data/<snapshot_id>/partner/ exist.
  - test_mrr0*: the missing-row rule (confirmed_zero reasons cite the
    reconciliation, present chapters sum exactly to the partner total).
  - test_kind0*: only kind aggregate partners may have a non-numeric
    code, and EU is the only such code observed.
"""

import csv
import json
import re

import pytest

from _checks import (
    additive_statuses,
    combine_group_sum,
    compute_balance,
    compute_eu_total_for_year_flow,
    compute_total_trade_value,
    census_row_value,
    eu_membership_for_year,
    find_duplicate_chapters,
    flowvalue_integrity_errors,
    parse_census_rows,
    reconciliation_universe_sum,
    walk_flowvalue_like_dicts,
    world_total_check_status,
)
from conftest import (
    RAW_SOURCE_TEST_DIR,
    load_fixture,
    require_snapshot,
    require_validation_csv,
    resolve_raw_dir,
    resolve_validation_csv_path,
)


def fv(status, value, reason):
    return {"status": status, "value": value, "reason": reason}


# ---------------- check 1: unique records ----------------

def test_c01u_duplicate_chapter_detected():
    assert find_duplicate_chapters(["01", "02", "01"]) == ["01"]


def test_c01u_no_duplicates_returns_empty():
    assert find_duplicate_chapters(["01", "02", "03"]) == []


def test_c01_unique_records_per_partner_year(snapshot_dir):
    """One record per (year, partner, chapter, flow): no chapter repeats
    within a partner-year's combined groups list."""
    path = require_snapshot(snapshot_dir)
    partner_dir = path / "partner"
    if not partner_dir.is_dir() or not any(partner_dir.glob("*.json")):
        pytest.skip("not run: data/<snapshot_id>/partner/ has no files yet")
    failures = []
    for f in sorted(partner_dir.glob("*.json")):
        doc = json.loads(f.read_text(encoding="utf-8"))
        for year_entry in doc.get("sections", []):
            chapters = [
                ch["chapter"]
                for group in year_entry.get("groups", [])
                for ch in group.get("chapters", [])
            ]
            dupes = find_duplicate_chapters(chapters)
            if dupes:
                failures.append((f.name, year_entry.get("year"), dupes))
    assert not failures, failures


def test_c01_world_and_group_codes_excluded_from_partner_files(snapshot_dir):
    """Record counts prove total and group rows are excluded: the world
    row (-), documented group code 0001 (SPEC PARTNERS section), and every
    CGP code observed in the source_test sample (fixture_d) must not have
    a data/<snapshot_id>/partner/<code>.json file."""
    path = require_snapshot(snapshot_dir)
    partner_dir = path / "partner"
    if not partner_dir.is_dir():
        pytest.skip("not run: data/<snapshot_id>/partner/ does not exist yet")
    fixture_d = load_fixture("fixture_d_observed_partner_codes.json")
    forbidden = {"0001"} | {c["code"] for c in fixture_d["imports"]["cgp_codes"]}
    forbidden |= {c["code"] for c in fixture_d["exports"]["cgp_codes"]}
    present = {f.stem for f in partner_dir.glob("*.json")}
    violations = sorted(present & forbidden) + (["-"] if (partner_dir / "-.json").exists() else [])
    assert not violations, f"forbidden codes have partner files: {violations}"


def test_c01_world_row_and_wildcard_codes_excluded_from_partners_json(snapshot_dir):
    """Amended schema/CONTRACT.md Identifiers paragraph: 'The Census world
    row - and the wildcard region codes 1XXX to 7XXX cannot be
    represented by the code pattern; they are excluded in
    pipeline/excluded_codes.json and listed in meta.notes instead of
    partners.json.' Unlike the world row and wildcard codes, the numeric
    CGP group codes (0001, 0003, ...) DO fit the PartnerCode pattern and
    still belong in partners.json with resolution excluded, per the
    unmodified sentence later in the same paragraph; this test only
    covers the world row and the wildcard region codes, which schema
    validation would also reject as malformed PartnerCode values if they
    ever appeared, but this test documents the specific amendment
    directly against partners.json content."""
    path = require_snapshot(snapshot_dir)
    partners_file = path / "partners.json"
    if not partners_file.exists():
        pytest.skip("not run: data/<snapshot_id>/partners.json does not exist yet")
    doc = json.loads(partners_file.read_text(encoding="utf-8"))
    codes = {p["code"] for p in doc["partners"]}
    wildcard_codes = {f"{n}XXX" for n in range(1, 8)}  # 1XXX .. 7XXX, per fixture_d cgp_codes
    violations = sorted(codes & ({"-"} | wildcard_codes))
    assert not violations, f"world row or wildcard region codes found in partners.json: {violations}"


# ---------------- check 2: partner totals ----------------

def test_c02u_group_sum_blocks_on_absent_chapter():
    result = combine_group_sum([("01", fv("observed", 10, None)), ("02", fv("absent", None, "no row"))])
    assert result["status"] == "absent"
    assert result["blocking_codes"] == ["02"]


def test_c02u_group_sum_skips_not_applicable_chapter():
    result = combine_group_sum([
        ("01", fv("observed", 10, None)),
        ("99", fv("not_applicable", None, "chapter 99 not in exports chapter set")),
    ])
    assert result == {"status": "observed", "value": 10, "reason": None, "blocking_codes": []}


def test_c02u_group_sum_includes_confirmed_zero():
    result = combine_group_sum([("01", fv("observed", 10, None)), ("02", fv("confirmed_zero", 0, "row returned 0"))])
    assert result["value"] == 10


def test_c02_partner_totals_equal_chapter_sums(snapshot_dir):
    """Chapter sum equals the separately fetched partner total, per
    partner, year, flow. Exact match, or a recorded tolerance row in
    reports/pipeline/validation.csv (check=partner_totals, status=PASS
    with a nonzero difference_usd/difference_pct recorded).

    schema/CONTRACT.md 'Check scope notes': 'Check 2 (partner totals)
    applies to Census partners, whose totals are fetched separately. The
    EU aggregate has no fetched total; its year totals are covered by
    check 7a and its group and chapter consistency by check 4.' EU is
    therefore excluded here; see
    test_eu_group_chapter_values_transition_years_require_hs2_observations
    below for the EU-specific transition-year rule."""
    path = require_snapshot(snapshot_dir)
    partner_dir = path / "partner"
    if not partner_dir.is_dir() or not any(partner_dir.glob("*.json")):
        pytest.skip("not run: data/<snapshot_id>/partner/ has no files yet")

    tolerance_rows = {}
    validation_csv = resolve_validation_csv_path()
    if validation_csv.exists():
        with open(validation_csv, newline="", encoding="utf-8") as fh:
            for row in csv.DictReader(fh):
                if row.get("check") == "partner_totals" and row.get("status") == "PASS":
                    key = (row.get("partner_code"), row.get("year"), row.get("flow"))
                    tolerance_rows[key] = row

    mismatches = []
    for f in sorted(partner_dir.glob("*.json")):
        if f.stem == "EU":
            continue  # check 2 applies to Census partners with a fetched total; EU has none
        doc = json.loads(f.read_text(encoding="utf-8"))
        code = doc["partner"]["code"]
        if code == "EU":
            continue
        years_by_year = {y["year"]: y for y in doc.get("years", [])}
        for year_entry in doc.get("sections", []):
            year = year_entry["year"]
            for flow in ("imports", "exports"):
                chapters = [
                    (ch["chapter"], ch[flow])
                    for group in year_entry.get("groups", [])
                    for ch in group.get("chapters", [])
                ]
                computed = combine_group_sum(chapters)
                claimed = years_by_year.get(year, {}).get(flow)
                if claimed is None:
                    continue
                if computed["status"] == "observed" and claimed.get("status") == "observed":
                    if computed["value"] != claimed["value"]:
                        key = (code, str(year), flow)
                        if key not in tolerance_rows:
                            mismatches.append((code, year, flow, computed["value"], claimed["value"]))
                elif computed["status"] != claimed.get("status"):
                    # one side blocked, the other not: worth flagging unless a
                    # tolerance/NOT_COMPARABLE row explains it
                    key = (code, str(year), flow)
                    if key not in tolerance_rows:
                        mismatches.append((code, year, flow, computed["status"], claimed.get("status")))
    assert not mismatches, mismatches[:10]


# ---------------- EU group/chapter values in transition years (Check scope notes) ----------------

def test_eu_group_chapter_values_transition_years_require_hs2_observations(snapshot_dir):
    """schema/CONTRACT.md 'Check scope notes': 'EU group and chapter
    values in transition years are observed only when eu_members_hs2
    observations exist for every transition month; otherwise absent with
    reason.' schema/CONTRACT.md 'Raw archive layout' names the exact
    reason text for a snapshot acquired without eu_members_hs2:
    'transition-month HS2 observations not acquired'.

    For each transition year present in data/<snapshot_id>/partner/
    EU.json sections (2013 and 2020, per SPEC EU RULES and
    tests/fixtures/eu_members_fixture.json), this test independently
    determines whether raw/<snapshot_id>/eu_members_hs2/<flow>_<code>_
    <YYYY-MM>.response.json exists for every transition member and
    month that year, for both flows, and asserts every group and
    chapter FlowValue for that year is:
      - observed or confirmed_zero, when all required eu_members_hs2
        files are present (confirmed_zero is accepted alongside
        observed as both are additive, non-blocking statuses per
        CONTRACT.md's value rules; the CONTRACT text 'observed' is read
        as 'not absent for lack of HS2 data', not as ruling out a
        genuine confirmed_zero read from that same HS2 data), or
      - absent with a reason containing exactly 'transition-month HS2
        observations not acquired', when any required file is missing.
    A chapter FlowValue with status not_applicable (a chapter not in
    that flow's valid chapter set for the year, per CONTRACT.md
    Aggregation rules, for example chapter 99 for exports) is exempt
    from both branches at the chapter level: that status concerns the
    chapter's existence for the flow, not eu_members_hs2 availability.
    Group-level FlowValues are not exempted the same way: a group whose
    only not_applicable-eligible chapter is excluded still resolves to
    absent when hs2 is missing, as seen in real staged data (SPECIAL
    group, exports, 2013 and 2020: chapter 99 not_applicable, chapter 98
    absent, group absent).
    """
    path = require_snapshot(snapshot_dir)
    eu_file = path / "partner" / "EU.json"
    if not eu_file.exists():
        pytest.skip("not run: data/<snapshot_id>/partner/EU.json does not exist yet")
    raw_snapshot_dir = resolve_raw_dir(path)
    fixture = load_fixture("eu_members_fixture.json")
    doc = json.loads(eu_file.read_text(encoding="utf-8"))

    transition_years_present = [
        year_entry for year_entry in doc.get("sections", []) if year_entry["year"] in (2013, 2020)
    ]
    if not transition_years_present:
        pytest.skip("not run: no 2013 or 2020 section entries in data/<snapshot_id>/partner/EU.json yet")

    required_reason_text = "transition-month HS2 observations not acquired"
    violations = []
    for year_entry in transition_years_present:
        year = year_entry["year"]
        _, transition_members = eu_membership_for_year(fixture, year)
        required_files = [
            raw_snapshot_dir / "eu_members_hs2" / f"{flow}_{m['cty_code']}_{period}.response.json"
            for m in transition_members
            for period in m["months"]
            for flow in ("imports", "exports")
        ]
        hs2_available = bool(required_files) and all(p.exists() for p in required_files)
        missing_files = [str(p) for p in required_files if not p.exists()]

        for group in year_entry.get("groups", []):
            for flow in ("imports", "exports"):
                group_fv = group[flow]
                if hs2_available:
                    if group_fv["status"] not in ("observed", "confirmed_zero"):
                        violations.append((year, "group", group["section_id"], flow, "expected observed/confirmed_zero (hs2 present)", group_fv["status"], group_fv.get("reason")))
                else:
                    if group_fv["status"] != "absent":
                        violations.append((year, "group", group["section_id"], flow, "expected absent (hs2 missing)", group_fv["status"], "missing_files", missing_files[:3]))
                    elif required_reason_text not in (group_fv.get("reason") or ""):
                        violations.append((year, "group", group["section_id"], flow, "reason missing required text", group_fv.get("reason")))
            for chapter in group.get("chapters", []):
                for flow in ("imports", "exports"):
                    chapter_fv = chapter[flow]
                    if chapter_fv["status"] == "not_applicable":
                        # A chapter not in this flow's valid chapter set for
                        # the year (CONTRACT.md Aggregation rules) is
                        # not_applicable regardless of eu_members_hs2
                        # availability: that status is about the chapter's
                        # existence for this flow, not about whether HS2
                        # detail was acquired for the transition months.
                        continue
                    if hs2_available:
                        if chapter_fv["status"] not in ("observed", "confirmed_zero"):
                            violations.append((year, "chapter", chapter["chapter"], flow, "expected observed/confirmed_zero (hs2 present)", chapter_fv["status"]))
                    else:
                        if chapter_fv["status"] != "absent":
                            violations.append((year, "chapter", chapter["chapter"], flow, "expected absent (hs2 missing)", chapter_fv["status"]))
                        elif required_reason_text not in (chapter_fv.get("reason") or ""):
                            violations.append((year, "chapter", chapter["chapter"], flow, "reason missing required text", chapter_fv.get("reason")))
    assert not violations, violations[:10]


# ---------------- check 3: world totals (amended Aggregation rules) ----------------
#
# schema/CONTRACT.md Aggregation rules, as amended: universe sums are
# computed over include_in_world_reconciliation true partners whose
# value is observed or confirmed_zero; a partner with no partner-level
# row stays absent at partner level (never confirmed_zero) and is
# listed in the check 3 validation row's partner_code cell, but does
# NOT block the sum, it is simply excluded. Check 3 passes only on an
# exact match between that sum and the separately fetched world total.
# When check 3 passes for a flow/year, section.years[].universe values
# for that flow/year are observed sums over the SAME observed partners;
# when it fails, every section universe value for that flow/year is
# absent with a reason naming the check 3 row.

def test_c03u_reconciliation_universe_sum_excludes_absent_without_blocking():
    """A partner with no partner-level row is excluded from the sum, not
    blocking, per the amended rule (this replaces the old blocking
    behavior)."""
    result = reconciliation_universe_sum([
        ("5700", fv("observed", 10, None)),
        ("1610", fv("absent", None, "no partner-level row for 1610 imports 2023")),
        ("4280", fv("confirmed_zero", 0, "row returned 0")),
    ])
    assert result["status"] == "observed"
    assert result["value"] == 10
    assert result["observed_codes"] == ["4280", "5700"]
    assert result["absent_codes"] == ["1610"]


def test_c03u_reconciliation_universe_sum_excludes_eu_aggregate_by_construction():
    """EU is never in the reconciliation universe (AGGREGATES AND
    ADDITIVE TOTALS): callers must filter to include_in_world_reconciliation
    true before calling reconciliation_universe_sum. This test documents
    that the helper itself sums whatever it is given, so the caller-side
    filter is load-bearing and covered by test_c03_world_totals below."""
    result = reconciliation_universe_sum([("5700", fv("observed", 10, None))])
    assert result["status"] == "observed"
    assert result["value"] == 10
    assert result["observed_codes"] == ["5700"]
    assert result["absent_codes"] == []


def test_c03u_world_total_check_status_pass_on_exact_match():
    status, reason = world_total_check_status(100, fv("observed", 100, None))
    assert status == "PASS"
    assert reason is None


def test_c03u_world_total_check_status_fail_on_mismatch():
    status, reason = world_total_check_status(99, fv("observed", 100, None))
    assert status == "FAIL"
    assert reason is not None


def test_c03u_world_total_check_status_fail_when_world_not_observed():
    """No tolerance and no default-pass when the world total itself is
    not observed, unlike check 2's Census-documented tolerance
    exception: check 3 has no such exception."""
    status, reason = world_total_check_status(100, fv("absent", None, "no data"))
    assert status == "FAIL"


def test_c03_world_totals_equal_reconciliation_universe_sum(snapshot_dir):
    """Check 3, amended: for each summary/<year>.json and flow, the sum
    over include_in_world_reconciliation true partners whose value is
    observed or confirmed_zero (absent partners excluded, not blocking)
    must equal doc['world'][flow] exactly. No tolerance."""
    path = require_snapshot(snapshot_dir)
    summary_dir = path / "summary"
    if not summary_dir.is_dir() or not any(summary_dir.glob("*.json")):
        pytest.skip("not run: data/<snapshot_id>/summary/ has no files yet")
    mismatches = []
    for f in sorted(summary_dir.glob("*.json")):
        doc = json.loads(f.read_text(encoding="utf-8"))
        for flow in ("imports", "exports"):
            universe_partners = [
                (p["code"], p[flow]) for p in doc["partners"] if p.get("include_in_world_reconciliation")
            ]
            computed = reconciliation_universe_sum(universe_partners)
            status, reason = world_total_check_status(computed["value"], doc["world"][flow])
            if status != "PASS":
                mismatches.append((doc["year"], flow, "computed", computed["value"], "world", doc["world"][flow], reason))
    assert not mismatches, mismatches[:10]


def test_c03_section_universe_matches_check3_pass_fail_state(snapshot_dir):
    """Amended Aggregation rules: section.years[].universe for a flow and
    year is an observed sum over the SAME observed partners as check 3
    (recomputed independently here from summary/<year>.json, not from
    per-section completeness) when check 3 passes for that flow and
    year; it is absent with a reason naming the check 3 row when check 3
    fails. This cross-checks data/<snapshot_id>/section/<id>.json
    against data/<snapshot_id>/summary/<year>.json without reading
    reports/pipeline/validation.csv, so it can run as soon as both
    directories exist."""
    path = require_snapshot(snapshot_dir)
    summary_dir = path / "summary"
    section_dir = path / "section"
    if not summary_dir.is_dir() or not any(summary_dir.glob("*.json")):
        pytest.skip("not run: data/<snapshot_id>/summary/ has no files yet")
    if not section_dir.is_dir() or not any(section_dir.glob("*.json")):
        pytest.skip("not run: data/<snapshot_id>/section/ has no files yet")

    check3_by_year_flow = {}
    for f in sorted(summary_dir.glob("*.json")):
        doc = json.loads(f.read_text(encoding="utf-8"))
        year = doc["year"]
        for flow in ("imports", "exports"):
            universe_partners = [
                (p["code"], p[flow]) for p in doc["partners"] if p.get("include_in_world_reconciliation")
            ]
            computed = reconciliation_universe_sum(universe_partners)
            status, reason = world_total_check_status(computed["value"], doc["world"][flow])
            check3_by_year_flow[(year, flow)] = (status, computed["observed_codes"], reason)

    mismatches = []
    for f in sorted(section_dir.glob("*.json")):
        doc = json.loads(f.read_text(encoding="utf-8"))
        section_id = doc["section"]["id"]
        for year_entry in doc.get("years", []):
            year = year_entry["year"]
            for flow in ("imports", "exports"):
                key = (year, flow)
                if key not in check3_by_year_flow:
                    continue  # no summary/<year>.json to compare against for this year
                status, observed_codes, reason = check3_by_year_flow[key]
                universe_fv = year_entry["universe"][flow]
                partners_by_code = {p["code"]: p for p in year_entry.get("partners", [])}
                if status == "PASS":
                    missing_codes = [c for c in observed_codes if c not in partners_by_code]
                    if missing_codes:
                        mismatches.append((section_id, year, flow, "observed codes missing from section partners", missing_codes))
                        continue
                    expected_sum = sum(partners_by_code[c][flow]["value"] for c in observed_codes)
                    if universe_fv.get("status") != "observed":
                        mismatches.append((section_id, year, flow, "expected observed (check3 PASS)", universe_fv.get("status")))
                    elif universe_fv.get("value") != expected_sum:
                        mismatches.append((section_id, year, flow, "value", universe_fv.get("value"), "expected", expected_sum))
                else:  # FAIL
                    if universe_fv.get("status") != "absent":
                        mismatches.append((section_id, year, flow, "expected absent (check3 FAIL)", universe_fv.get("status")))
                    else:
                        reason_text = (universe_fv.get("reason") or "").lower()
                        if not any(kw in reason_text for kw in ("world total", "check 3", "world_totals")):
                            mismatches.append((section_id, year, flow, "reason does not name the check 3 row", universe_fv.get("reason")))
    assert not mismatches, mismatches[:10]


def test_c03_eu_never_in_reconciliation_universe(snapshot_dir):
    path = require_snapshot(snapshot_dir)
    summary_dir = path / "summary"
    if not summary_dir.is_dir() or not any(summary_dir.glob("*.json")):
        pytest.skip("not run: data/<snapshot_id>/summary/ has no files yet")
    violations = []
    for f in sorted(summary_dir.glob("*.json")):
        doc = json.loads(f.read_text(encoding="utf-8"))
        for p in doc["partners"]:
            if p["code"] == "EU" and p.get("include_in_world_reconciliation") is not False:
                violations.append(f.name)
    assert not violations, violations


# ---------------- check 4: category totals ----------------

def test_c04u_group_level_matches_recomputed_sum():
    chapters = [("01", fv("observed", 5, None)), ("02", fv("observed", 7, None))]
    assert combine_group_sum(chapters)["value"] == 12


def test_c04_group_sums_equal_chapter_sums(snapshot_dir):
    path = require_snapshot(snapshot_dir)
    partner_dir = path / "partner"
    if not partner_dir.is_dir() or not any(partner_dir.glob("*.json")):
        pytest.skip("not run: data/<snapshot_id>/partner/ has no files yet")
    mismatches = []
    for f in sorted(partner_dir.glob("*.json")):
        doc = json.loads(f.read_text(encoding="utf-8"))
        for year_entry in doc.get("sections", []):
            for group in year_entry.get("groups", []):
                for flow in ("imports", "exports"):
                    chapters = [(ch["chapter"], ch[flow]) for ch in group.get("chapters", [])]
                    computed = combine_group_sum(chapters)
                    claimed = group[flow]
                    if computed["status"] == "observed" and claimed.get("status") == "observed":
                        if computed["value"] != claimed["value"]:
                            mismatches.append((f.name, year_entry["year"], group["section_id"], flow))
                    elif computed["status"] != claimed.get("status"):
                        mismatches.append((f.name, year_entry["year"], group["section_id"], flow, "status mismatch"))
    assert not mismatches, mismatches[:10]


# ---------------- check 5: derived figures ----------------

def test_c05u_balance_observed_when_both_inputs_observed():
    result = compute_balance(fv("observed", 100, None), fv("observed", 60, None))
    assert result == {"status": "observed", "value": -40, "reason": None}


def test_c05u_balance_absent_when_export_absent():
    result = compute_balance(fv("observed", 100, None), fv("absent", None, "no row"))
    assert result["status"] == "absent"
    assert "exports" in result["reason"]


def test_c05u_total_trade_value_observed():
    result = compute_total_trade_value(fv("observed", 100, None), fv("confirmed_zero", 0, "row 0"))
    assert result == {"status": "observed", "value": 100, "reason": None}


def test_c05_derived_figures_exact(snapshot_dir):
    """schema/CONTRACT.md Value rules (amended): 'Otherwise absent with a
    reason that contains the word imports or exports for each missing
    input; the rest of the wording is free.' This test compares status
    and value exactly (never a mismatch there), and for an absent
    derived value checks only that the reason contains the required
    word(s) for whichever input(s) are actually missing, not the full
    reason string: tests/_checks.py's own compute_balance /
    compute_total_trade_value phrasing is not a contract Agent A's
    phrasing must match verbatim."""
    path = require_snapshot(snapshot_dir)
    partner_dir = path / "partner"
    if not partner_dir.is_dir() or not any(partner_dir.glob("*.json")):
        pytest.skip("not run: data/<snapshot_id>/partner/ has no files yet")
    mismatches = []
    for f in sorted(partner_dir.glob("*.json")):
        doc = json.loads(f.read_text(encoding="utf-8"))
        for year_entry in doc.get("years", []):
            imp, exp = year_entry["imports"], year_entry["exports"]
            for field, expected in (
                ("balance", compute_balance(imp, exp)),
                ("total_trade_value", compute_total_trade_value(imp, exp)),
            ):
                actual = year_entry[field]
                if actual.get("status") != expected["status"]:
                    mismatches.append((f.name, year_entry["year"], field, "status", actual.get("status"), "expected", expected["status"]))
                    continue
                if expected["status"] == "observed":
                    if actual.get("value") != expected["value"]:
                        mismatches.append((f.name, year_entry["year"], field, "value", actual.get("value"), "expected", expected["value"]))
                else:  # absent: check the reason names each missing input, full text is free
                    reason = (actual.get("reason") or "").lower()
                    missing_words = []
                    if not additive_statuses(imp):
                        missing_words.append("imports")
                    if not additive_statuses(exp):
                        missing_words.append("exports")
                    for word in missing_words:
                        if word not in reason:
                            mismatches.append((f.name, year_entry["year"], field, "reason missing required word", word, actual.get("reason")))
    assert not mismatches, mismatches[:10]


# ---------------- check 6: published examples ----------------

REQUIRED_FIVE_CODES = {"5700", "1610", "6022", "4280", "8220"}
PUBLISHED_EXAMPLE_STEMS = ["5700_2023", "1610_2023", "6022_2023", "4280_2023", "special_8220"]
ADDITIONAL_PUBLISHED_EXAMPLE_STEMS = ["4803_2023"]


def test_c06_published_examples_include_required_identifiers():
    """The five published examples must include Norfolk Island 6022 and
    the kind special partner 8220 (Census code 8220, 'Unidentified
    partner'). Recomputed against validation.csv, which is Agent A's
    report; D verifies the required identifiers are present, it does
    not re-derive the external Census published tables here (that
    recomputation is
    test_c06_partner_data_matches_published_examples_within_rounding
    below, against data/<snapshot_id>/partner/, not validation.csv).

    schema/CONTRACT.md 'Published examples (check 6)' (amended): kind
    special is reserved for non-geographic codes; Kosovo 4803 is kind
    country with iso3 null, not the special-code row. Code 8220 is the
    owner-approved kind special partner
    (tests/fixtures/published_examples/special_8220.json). Kosovo 4803
    stays in the fixtures as an additional comparable example (checked
    by test_c06_partner_data_matches_published_examples_within_rounding)
    but is no longer one of the required five identifiers here."""
    validation_csv = require_validation_csv()
    rows = []
    with open(validation_csv, newline="", encoding="utf-8") as fh:
        rows = [r for r in csv.DictReader(fh) if r.get("check") == "published_examples"]
    if not rows:
        pytest.skip("not run: no published_examples rows in validation.csv yet")
    codes = {r.get("partner_code") for r in rows}
    assert "6022" in codes, f"Norfolk Island 6022 missing from published_examples rows: {codes}"
    assert "8220" in codes, f"the kind special partner 8220 missing from published_examples rows: {codes}"


def test_c06_validation_csv_lists_all_five_published_example_identifiers():
    """schema/CONTRACT.md 'Published examples (check 6)': the pipeline's
    check 6 reads tests/fixtures/published_examples/ read-only and must
    produce a validation.csv row for each of the five captured
    partner-years: 5700, 1610, 6022, 4280, 8220. If a fixture is missing
    at validation time the row is FAIL with reason 'fixture missing',
    never NOT_APPLICABLE, per CONTRACT.md."""
    validation_csv = require_validation_csv()
    with open(validation_csv, newline="", encoding="utf-8") as fh:
        rows = [r for r in csv.DictReader(fh) if r.get("check") == "published_examples"]
    if not rows:
        pytest.skip("not run: no published_examples rows in validation.csv yet")
    codes_present = {r.get("partner_code") for r in rows}
    missing_codes = REQUIRED_FIVE_CODES - codes_present
    assert not missing_codes, f"published_examples rows missing for codes: {missing_codes}"


def test_c06_special_row_8220_matches_fixture_outcome():
    """schema/CONTRACT.md 'Published examples (check 6)' amended: 'The
    special-code row is NOT_APPLICABLE when no special code is observed
    in any year, or when Census publishes no Trade in Goods page for the
    observed special code; in the second case the reason records the
    URL tried and the HTTP status.'
    tests/fixtures/published_examples/special_8220.json records its own
    outcome field (captured_values, because a real Census page for 8220
    resolved HTTP 200 with 2013-2016 data at the time this fixture was
    built, or not_applicable if that ever changes). This test asserts
    reports/pipeline/validation.csv's published_examples row(s) for
    partner_code 8220 match whichever outcome the fixture actually
    recorded, never assuming one branch."""
    example = load_fixture("published_examples/special_8220.json")
    validation_csv = require_validation_csv()
    with open(validation_csv, newline="", encoding="utf-8") as fh:
        rows = [
            r for r in csv.DictReader(fh)
            if r.get("check") == "published_examples" and r.get("partner_code") == "8220"
        ]
    if not rows:
        pytest.skip("not run: no published_examples row for partner_code 8220 in validation.csv yet")
    if example.get("outcome") == "not_applicable":
        bad = [r for r in rows if r.get("status") != "NOT_APPLICABLE"]
        assert not bad, f"fixture outcome is not_applicable but validation.csv status is not NOT_APPLICABLE: {bad}"
        url = example.get("url_tried", "")
        missing_url = [r for r in rows if url not in f"{r.get('expected', '')} {r.get('actual', '')}"]
        assert not missing_url, f"8220 NOT_APPLICABLE row(s) do not mention the URL tried ({url}): {missing_url}"
    else:
        bad = [r for r in rows if r.get("status") == "NOT_APPLICABLE"]
        assert not bad, (
            "fixture outcome is captured_values (a real Census page exists for 8220 with real data), "
            f"but validation.csv reports NOT_APPLICABLE: {bad}"
        )


def test_c06_partner_data_matches_published_examples_within_rounding(snapshot_dir):
    """Independently recomputed check 6: for the five required
    partner-year fixtures (5700 China, 1610 St Pierre and Miquelon, 6022
    Norfolk Island, 4280 Germany, special_8220 the kind special partner)
    plus Kosovo 4803 kept as an additional comparable example (kind
    country now, per the amended CONTRACT.md Published examples
    paragraph, but still checked here for a rounding match), built by
    Agent D from the public Census 'Trade in Goods with <country>' pages
    (or 'Trade in Goods with Unidentified Countries' for 8220), never
    from pipeline output: the corresponding
    data/<snapshot_id>/partner/<code>.json year entry's imports and
    exports values must be within the fixture's rounding_unit of the
    published, converted values, when the pipeline value is observed or
    confirmed_zero. Fixtures recorded comparable: false are skipped per
    schema/CONTRACT.md ('record comparable: false ... rather than
    forcing a match'); none currently do. A fixture whose own outcome
    field is not_applicable (no captured values to compare) is skipped
    here too, since its correctness is checked separately by
    test_c06_special_row_8220_matches_fixture_outcome.

    schema/CONTRACT.md 'Check scope notes': 'When the pipeline value for
    a published example is absent, no numeric comparison is possible.
    The row is NOT_COMPARABLE with a reason stating the published
    display value and that absent is not evidence of zero.' So when the
    partner file's FlowValue for a captured code/year/flow is absent,
    this test does NOT expect an observed value or attempt its own
    rounding comparison; instead it cross-checks
    reports/pipeline/validation.csv's published_examples row for that
    code/year/flow: status must be NOT_COMPARABLE, and one of the
    expected/actual text columns (there is no dedicated reason column in
    the validation.csv contract) must mention the fixture's displayed
    value string. A row that still reads PASS for an absent pipeline
    value, or a missing row entirely, is reported as a real finding, not
    silently accepted.
    """
    path = require_snapshot(snapshot_dir)
    partner_dir = path / "partner"
    if not partner_dir.is_dir() or not any(partner_dir.glob("*.json")):
        pytest.skip("not run: data/<snapshot_id>/partner/ has no files yet")

    validation_csv = resolve_validation_csv_path()
    published_rows_by_key = {}
    if validation_csv.exists():
        with open(validation_csv, newline="", encoding="utf-8") as fh:
            for row in csv.DictReader(fh):
                if row.get("check") == "published_examples":
                    key = (row.get("partner_code"), row.get("year"), row.get("flow"))
                    published_rows_by_key[key] = row

    mismatches = []
    skipped_not_comparable = []
    skipped_not_applicable = []
    for stem in PUBLISHED_EXAMPLE_STEMS + ADDITIONAL_PUBLISHED_EXAMPLE_STEMS:
        example = load_fixture(f"published_examples/{stem}.json")
        if example.get("outcome") == "not_applicable":
            skipped_not_applicable.append(stem)
            continue
        if example.get("comparable") is False:
            skipped_not_comparable.append(stem)
            continue
        code = example["code"]
        year = example["year"]
        unit = example["rounding_unit"]
        partner_file = partner_dir / f"{code}.json"
        if not partner_file.exists():
            mismatches.append((code, year, "partner file missing"))
            continue
        doc = json.loads(partner_file.read_text(encoding="utf-8"))
        year_entry = next((y for y in doc.get("years", []) if y.get("year") == year), None)
        if year_entry is None:
            mismatches.append((code, year, "year entry missing from partner file"))
            continue
        for flow, value_key, displayed_key in (
            ("imports", "imports_usd", "imports_displayed"),
            ("exports", "exports_usd", "exports_displayed"),
        ):
            fv = year_entry.get(flow, {})
            expected = example["values"][value_key]
            displayed = example["values"].get(displayed_key, "")
            status = fv.get("status")
            if status in ("observed", "confirmed_zero"):
                diff = abs(fv["value"] - expected)
                if diff > unit:
                    mismatches.append((code, year, flow, "value", fv["value"], "expected", expected, "diff", diff, "unit", unit))
            elif status == "absent":
                key = (code, str(year), flow)
                row = published_rows_by_key.get(key)
                if row is None:
                    mismatches.append((code, year, flow, "pipeline value absent but no published_examples validation.csv row found for cross-check"))
                    continue
                if row.get("status") != "NOT_COMPARABLE":
                    mismatches.append((code, year, flow, "validation.csv status", row.get("status"), "expected", "NOT_COMPARABLE", "because pipeline value is absent"))
                    continue
                combined_text = f"{row.get('expected', '')} {row.get('actual', '')}"
                if displayed not in combined_text:
                    mismatches.append((code, year, flow, "NOT_COMPARABLE row does not mention the published display value", "expected substring", displayed, "in", combined_text))
            else:
                mismatches.append((code, year, flow, "unexpected status (neither observed/confirmed_zero nor absent)", status))
    assert not mismatches, mismatches[:10]


# ---------------- check 7: EU calculation and comparability ----------------

def test_c07a_eu_calculation_recomputed_from_boundary_fixture():
    """Exact recomputation of the EU calculation rule (month-boundary
    arithmetic only) using the independently computed fixture_b values.
    Full EU totals for a real snapshot need member-year observations for
    every EU member, which is out of scope for the source_test sample; see
    test_c07a_eu_calculation_full below for the run-time gate and the open
    question about the raw member-data file pattern."""
    fixture_b = load_fixture("fixture_b_eu_boundary.json")
    for check in fixture_b["derived_checks"]:
        assert check["passes"], check


# ---------------- check 7a unit tests: EU calculation helpers ----------------

def test_eu01u_parse_census_rows_dedupes_duplicate_header_keys():
    """raw/source_test/partner_total_imports_large.response.json has
    CTY_CODE twice in its header (the real data column, then the echoed
    predicate). The first occurrence must win."""
    payload = [
        ["CTY_CODE", "CTY_NAME", "GEN_VAL_YR", "time", "CTY_CODE"],
        ["5700", "CHINA", "427234312263", "2023-12", "5700"],
    ]
    rows = parse_census_rows(payload)
    assert rows == [{"CTY_CODE": "5700", "CTY_NAME": "CHINA", "GEN_VAL_YR": "427234312263", "time": "2023-12"}]


def test_eu02u_census_row_value_reads_matching_code_as_int():
    rows = [{"CTY_CODE": "4280", "GEN_VAL_YR": "159169012345"}]
    assert census_row_value(rows, "4280", "GEN_VAL_YR") == 159169012345


def test_eu03u_census_row_value_returns_none_for_missing_code():
    rows = [{"CTY_CODE": "4280", "GEN_VAL_YR": "159169012345"}]
    assert census_row_value(rows, "9999", "GEN_VAL_YR") is None


def test_eu04u_membership_full_year_member_before_2013():
    fixture = load_fixture("eu_members_fixture.json")
    full, transitions = eu_membership_for_year(fixture, 2013)
    full_codes = {m["cty_code"] for m in full}
    assert "4280" in full_codes  # Germany, founding member, full year in 2013
    assert "4791" not in full_codes  # Croatia is a transition member in 2013


def test_eu05u_membership_croatia_2013_transition_matches_spec():
    """SPEC EU RULES: 'Croatia 2013 = July through December.'"""
    fixture = load_fixture("eu_members_fixture.json")
    _, transitions = eu_membership_for_year(fixture, 2013)
    croatia = next(t for t in transitions if t["cty_code"] == "4791")
    assert croatia["months"] == ["2013-07", "2013-08", "2013-09", "2013-10", "2013-11", "2013-12"]


def test_eu06u_membership_uk_2020_transition_matches_spec():
    """SPEC EU RULES: 'UK 2020 = January only.'"""
    fixture = load_fixture("eu_members_fixture.json")
    _, transitions = eu_membership_for_year(fixture, 2020)
    uk = next(t for t in transitions if t["cty_code"] == "4120")
    assert uk["months"] == ["2020-01"]


def test_eu07u_membership_uk_full_year_2019():
    fixture = load_fixture("eu_members_fixture.json")
    full, _ = eu_membership_for_year(fixture, 2019)
    assert "4120" in {m["cty_code"] for m in full}


def test_eu08u_membership_uk_excluded_2021():
    fixture = load_fixture("eu_members_fixture.json")
    full, transitions = eu_membership_for_year(fixture, 2021)
    all_codes = {m["cty_code"] for m in full} | {m["cty_code"] for m in transitions}
    assert "4120" not in all_codes


def test_eu09u_compute_eu_total_absent_when_raw_dirs_missing(tmp_path):
    fixture = load_fixture("eu_members_fixture.json")
    status, value, missing = compute_eu_total_for_year_flow(tmp_path, fixture, 2013, "imports")
    assert status == "absent"
    assert value is None
    assert missing


def test_eu10u_compute_eu_total_observed_from_synthetic_raw_files(tmp_path):
    """End-to-end synthetic check of compute_eu_total_for_year_flow against
    hand-built raw files shaped like the real Census API response format,
    for a fixture with exactly two full-year members and one transition
    member, so the arithmetic itself (not real data) is proven."""
    fixture = {
        "members": [
            {"name": "A", "cty_code": "1111", "accession_date": "1958-01-01", "exit_date": None},
            {"name": "B", "cty_code": "2222", "accession_date": "1958-01-01", "exit_date": None},
            {"name": "Transition", "cty_code": "3333", "accession_date": "2013-07-01", "exit_date": None},
        ]
    }
    (tmp_path / "partner_totals").mkdir()
    (tmp_path / "eu_members").mkdir()
    (tmp_path / "partner_totals" / "imports_2013-12.response.json").write_text(json.dumps([
        ["CTY_CODE", "CTY_NAME", "GEN_VAL_YR", "time"],
        ["1111", "A", "100", "2013-12"],
        ["2222", "B", "200", "2013-12"],
    ]))
    for month, value in [("2013-07", "10"), ("2013-08", "10"), ("2013-09", "10"),
                         ("2013-10", "10"), ("2013-11", "10"), ("2013-12", "10")]:
        (tmp_path / "eu_members" / f"imports_3333_{month}.response.json").write_text(json.dumps([
            ["CTY_CODE", "CTY_NAME", "GEN_VAL_MO", "time"],
            ["3333", "Transition", value, month],
        ]))
    status, value, missing = compute_eu_total_for_year_flow(tmp_path, fixture, 2013, "imports")
    assert status == "observed"
    assert value == 100 + 200 + 6 * 10
    assert missing == []


def test_eu11u_compute_eu_total_absent_when_one_transition_month_missing(tmp_path):
    fixture = {
        "members": [
            {"name": "Transition", "cty_code": "3333", "accession_date": "2013-07-01", "exit_date": None},
        ]
    }
    (tmp_path / "partner_totals").mkdir()
    (tmp_path / "eu_members").mkdir()
    (tmp_path / "partner_totals" / "imports_2013-12.response.json").write_text(json.dumps([
        ["CTY_CODE", "CTY_NAME", "GEN_VAL_YR", "time"],
    ]))
    for month in ["2013-07", "2013-08", "2013-09", "2013-10", "2013-11"]:  # 2013-12 missing
        (tmp_path / "eu_members" / f"imports_3333_{month}.response.json").write_text(json.dumps([
            ["CTY_CODE", "CTY_NAME", "GEN_VAL_MO", "time"],
            ["3333", "Transition", "10", month],
        ]))
    status, value, missing = compute_eu_total_for_year_flow(tmp_path, fixture, 2013, "imports")
    assert status == "absent"
    assert ("3333", "2013-12") in missing


def test_eu12u_compute_eu_total_ignores_a_bare_json_file_missing_the_response_suffix(tmp_path):
    """Regression test for the bug found by the orchestrator running this
    suite against a staged build: schema/CONTRACT.md 'Raw archive
    layout' intro says 'the table below gives <name>; readers open
    <name>.response.json.' A file saved as <name>.json instead of
    <name>.response.json (the wrong suffix) must NOT be read: it should
    behave exactly as if the file were absent, so a snapshot with the
    correct .response.json files always computes the right total and a
    snapshot with wrongly-suffixed files always reports absent rather
    than silently reading stale or wrongly-shaped data."""
    fixture = {
        "members": [
            {"name": "A", "cty_code": "1111", "accession_date": "1958-01-01", "exit_date": None},
        ]
    }
    (tmp_path / "partner_totals").mkdir()
    (tmp_path / "eu_members").mkdir()
    # Wrong suffix on purpose: .json instead of .response.json.
    (tmp_path / "partner_totals" / "imports_2013-12.json").write_text(json.dumps([
        ["CTY_CODE", "CTY_NAME", "GEN_VAL_YR", "time"],
        ["1111", "A", "100", "2013-12"],
    ]))
    status, value, missing = compute_eu_total_for_year_flow(tmp_path, fixture, 2013, "imports")
    assert status == "absent"
    assert ("partner_totals_file", str(tmp_path / "partner_totals" / "imports_2013-12.response.json")) in missing


# ---------------- check 7a integration: full EU total recomputation ----------------

def test_c07a_eu_calculation_full(snapshot_dir):
    """Full EU calculation check (SPEC EU RULES 7a): EU totals must equal
    independently computed sums from every EU member's observations under
    the month rules (full-year _YR for stable members, _MO transition
    months for Croatia 2013 and the UK 2020).

    Reads raw/<snapshot_id>/partner_totals/<flow>_<year>-12.response.json
    for full-year members and raw/<snapshot_id>/eu_members/<flow>_<code>_
    <YYYY-MM>.response.json for transition months, per schema/CONTRACT.md
    'Raw archive layout' ('the table below gives <name>; readers open
    <name>.response.json'). Membership comes from tests/fixtures/
    eu_members_fixture.json, built independently by Agent D from
    europa.eu (see that file's citation field), never from
    pipeline/eu_members.json. Compares the recomputed total exactly
    against data/<snapshot_id>/partner/EU.json for every year present
    there. Not run until raw/<snapshot_id>/ and data/<snapshot_id>/
    partner/EU.json both exist.
    """
    path = require_snapshot(snapshot_dir)
    raw_snapshot_dir = resolve_raw_dir(path)
    eu_file = path / "partner" / "EU.json"
    partner_totals_dir = raw_snapshot_dir / "partner_totals"
    eu_members_dir = raw_snapshot_dir / "eu_members"
    if not eu_file.exists():
        pytest.skip("not run: data/<snapshot_id>/partner/EU.json does not exist yet")
    if not partner_totals_dir.is_dir() or not eu_members_dir.is_dir():
        pytest.skip(
            "not run: raw/<snapshot_id>/partner_totals/ and/or raw/<snapshot_id>/eu_members/ "
            "do not exist yet"
        )
    fixture = load_fixture("eu_members_fixture.json")
    doc = json.loads(eu_file.read_text(encoding="utf-8"))
    mismatches = []
    for year_entry in doc.get("years", []):
        year = year_entry["year"]
        for flow in ("imports", "exports"):
            computed_status, computed_value, missing = compute_eu_total_for_year_flow(
                raw_snapshot_dir, fixture, year, flow
            )
            claimed = year_entry[flow]
            if computed_status == "observed" and claimed.get("status") == "observed":
                if computed_value != claimed["value"]:
                    mismatches.append((year, flow, "value", computed_value, claimed["value"]))
            elif computed_status != claimed.get("status"):
                mismatches.append((year, flow, "status", computed_status, claimed.get("status"), "missing", missing[:5]))
    assert not mismatches, mismatches[:10]


def test_c07b_eu_comparability_is_informational_only(snapshot_dir):
    """Check 7b never blocks publication (SPEC VALIDATION: 'Any FAIL in
    checks 1 to 9 (except 7b) blocks the UI phases'). This test only
    verifies that when an eu_comparability row exists in validation.csv,
    its status is one of the allowed values and, if NOT_COMPARABLE, that a
    numeric difference is recorded."""
    validation_csv = require_validation_csv()
    rows = []
    with open(validation_csv, newline="", encoding="utf-8") as fh:
        rows = [r for r in csv.DictReader(fh) if r.get("check") == "eu_comparability"]
    if not rows:
        pytest.skip("not run: no eu_comparability rows in validation.csv yet")
    bad = [r for r in rows if r.get("status") not in ("PASS", "FAIL", "NOT_COMPARABLE", "NOT_APPLICABLE")]
    assert not bad, bad
    not_comparable_missing_diff = [
        r for r in rows if r.get("status") == "NOT_COMPARABLE" and not r.get("difference_usd")
    ]
    assert not not_comparable_missing_diff, not_comparable_missing_diff


# ---------------- check 8: FlowValue integrity ----------------

def test_c08u_flowvalue_integrity_errors_detects_bad_observed():
    errors = flowvalue_integrity_errors(fv("observed", None, None))
    assert errors


def test_c08u_flowvalue_integrity_errors_clean_for_valid_absent():
    errors = flowvalue_integrity_errors(fv("absent", None, "no row returned"))
    assert errors == []


def test_c08u_flowvalue_integrity_errors_flags_fetch_failed():
    errors = flowvalue_integrity_errors(fv("fetch_failed", None, "timeout"))
    assert errors == ["fetch_failed must never appear in published data"]


def test_c08_flowvalue_integrity_across_all_data_files(snapshot_dir):
    path = require_snapshot(snapshot_dir)
    files = sorted(path.rglob("*.json"))
    if not files:
        pytest.skip("not run: data/<snapshot_id>/ has no json files yet")
    failures = []
    fetch_failed_hits = []
    for f in files:
        text = f.read_text(encoding="utf-8")
        if "fetch_failed" in text:
            fetch_failed_hits.append(f.name)
        doc = json.loads(text)
        for jpath, candidate in walk_flowvalue_like_dicts(doc):
            errors = flowvalue_integrity_errors(candidate)
            if errors:
                failures.append((f.name, jpath, errors))
    assert not fetch_failed_hits, f"fetch_failed found in published data: {fetch_failed_hits}"
    assert not failures, failures[:10]


# ---------------- check 9: partner resolution ----------------

def test_c09u_resolution_enum_is_approved_or_excluded():
    assert {"approved", "excluded"} == {"approved", "excluded"}  # documents the two allowed values


def test_c09_every_partner_resolved(snapshot_dir):
    path = require_snapshot(snapshot_dir)
    partners_file = path / "partners.json"
    if not partners_file.exists():
        pytest.skip("not run: data/<snapshot_id>/partners.json does not exist yet")
    doc = json.loads(partners_file.read_text(encoding="utf-8"))
    unresolved = [p["code"] for p in doc["partners"] if p.get("resolution") not in ("approved", "excluded")]
    assert not unresolved, f"unresolved partner codes: {unresolved}"


# ---------------- missing-row rule (schema/CONTRACT.md) ----------------

def test_mrr01u_confirmed_zero_chapters_do_not_change_the_group_sum():
    """A confirmed_zero chapter contributes 0, so the group sum with and
    without it is identical when its value really is 0 (documents why
    the reconciliation in CONTRACT.md's missing-row rule works: adding
    the backfilled zero rows never changes the total)."""
    with_zero = combine_group_sum([
        ("01", fv("observed", 100, None)),
        ("02", fv("confirmed_zero", 0, "no row; present chapters sum to partner total 100 for X imports 2023")),
    ])
    without_zero = combine_group_sum([("01", fv("observed", 100, None))])
    assert with_zero["value"] == without_zero["value"] == 100


def test_mrr02_confirmed_zero_reasons_cite_reconciliation_and_sums_are_exact(snapshot_dir):
    """schema/CONTRACT.md Missing-row rule: 'A missing chapter row ... is
    confirmed_zero only when the present chapter rows ... sum exactly to
    the separately fetched partner total ... The reason cites that
    reconciliation.' For every partner/year/flow with at least one
    confirmed_zero chapter: (1) each confirmed_zero chapter's reason
    text cites the reconciliation (mentions summing to the partner
    total), and (2) the chapters actually present (observed plus
    confirmed_zero, per combine_group_sum) sum exactly to the partner
    year total for that flow, when that total is itself observed."""
    path = require_snapshot(snapshot_dir)
    partner_dir = path / "partner"
    if not partner_dir.is_dir() or not any(partner_dir.glob("*.json")):
        pytest.skip("not run: data/<snapshot_id>/partner/ has no files yet")

    reconciliation_keywords = ("sum", "reconcil", "partner total")
    reason_failures = []
    sum_failures = []
    for f in sorted(partner_dir.glob("*.json")):
        doc = json.loads(f.read_text(encoding="utf-8"))
        code = doc["partner"]["code"]
        years_by_year = {y["year"]: y for y in doc.get("years", [])}
        for year_entry in doc.get("sections", []):
            year = year_entry["year"]
            for flow in ("imports", "exports"):
                chapters = [
                    (ch["chapter"], ch[flow])
                    for group in year_entry.get("groups", [])
                    for ch in group.get("chapters", [])
                ]
                confirmed_zero_chapters = [(c, v) for c, v in chapters if v["status"] == "confirmed_zero"]
                if not confirmed_zero_chapters:
                    continue
                for chapter, v in confirmed_zero_chapters:
                    reason = (v.get("reason") or "").lower()
                    if not any(kw in reason for kw in reconciliation_keywords):
                        reason_failures.append((code, year, flow, chapter, v.get("reason")))
                claimed_total = years_by_year.get(year, {}).get(flow)
                if claimed_total and claimed_total.get("status") == "observed":
                    computed = combine_group_sum(chapters)
                    if computed["status"] == "observed" and computed["value"] != claimed_total["value"]:
                        sum_failures.append((code, year, flow, computed["value"], claimed_total["value"]))
    assert not reason_failures, f"confirmed_zero reasons missing reconciliation citation: {reason_failures[:10]}"
    assert not sum_failures, f"present chapters do not sum exactly to partner total: {sum_failures[:10]}"


# ---------------- kind aggregate / non-numeric partner code ----------------

def test_kind01u_partner_code_pattern_permits_only_EU_as_non_numeric():
    """schema/common.schema.json PartnerCode: '^([0-9]{4}|EU)$'. The
    pattern itself only ever admits the literal string EU as a
    non-4-digit code; this documents that the schema, not just
    convention, is what CONTRACT.md means by 'EU is the only such id in
    schema version 1.0.0. The schema enforces this.'"""
    pattern = re.compile(r"^([0-9]{4}|EU)$")
    assert pattern.match("EU")
    assert not pattern.match("US")
    assert not pattern.match("Eu")
    assert not pattern.match("EUR")
    assert pattern.match("0001")  # matches the numeric shape; excluded from partners by other means (SPEC PARTNERS), not by this pattern


def test_kind02_only_EU_has_a_non_numeric_code_in_partners_json(snapshot_dir):
    """SPEC AGGREGATES AND ADDITIVE TOTALS / schema/CONTRACT.md
    Identifiers: only a partner with kind aggregate may use a
    non-numeric code, and EU is the only such code."""
    path = require_snapshot(snapshot_dir)
    partners_file = path / "partners.json"
    if not partners_file.exists():
        pytest.skip("not run: data/<snapshot_id>/partners.json does not exist yet")
    doc = json.loads(partners_file.read_text(encoding="utf-8"))
    numeric_pattern = re.compile(r"^[0-9]{4}$")
    non_numeric = [p["code"] for p in doc["partners"] if not numeric_pattern.match(p["code"])]
    assert non_numeric == ["EU"], f"expected only EU to have a non-numeric code, found: {non_numeric}"
    non_aggregate_non_numeric = [
        p["code"] for p in doc["partners"]
        if not numeric_pattern.match(p["code"]) and p.get("kind") != "aggregate"
    ]
    assert not non_aggregate_non_numeric, (
        f"non-numeric codes with kind other than aggregate: {non_aggregate_non_numeric}"
    )


# ---------------- owner-approved records: 8220 kind special, 4803 kind country ----------------
#
# Owner decisions relayed by the orchestrator: code 8220 is approved as
# kind special, name exactly "Unidentified Countries (Census code 8220)"
# (updated by a later owner decision from the original "Unidentified
# partner (Census code 8220)"; docs/methodology-content.md's "Unidentified
# Countries (Census code 8220)" heading and body text are the current
# source of truth for this string), in the reconciliation universe, no
# map shape. Kosovo 4803 is kind
# country (schema/CONTRACT.md amended Published examples paragraph:
# "kind special is reserved for non-geographic codes; a geographic
# partner without an ISO 3166-1 code (Kosovo 4803) is kind country with
# iso3 null"). These tests read data/<snapshot_id>/partners.json and are
# expected to fail against any staged build that predates this owner
# decision, until Agent A rebuilds with the new classification.

def _find_partner(partners, code):
    return next((p for p in partners if p["code"] == code), None)


def test_partner_8220_matches_owner_approved_record(snapshot_dir):
    """Owner decision (updated): 8220 is kind special, name exactly
    'Unidentified Countries (Census code 8220)' (this superseded the
    original 'Unidentified partner (Census code 8220)'; the current
    string matches the heading in docs/methodology-content.md and the
    Census page's own title 'Unidentified Countries'),
    include_in_world_reconciliation true, iso3 null, map_feature_id null
    (no map shape), resolution approved, resolution_note containing
    '2026-09-09' (the approval date) and not containing 'pending'."""
    path = require_snapshot(snapshot_dir)
    partners_file = path / "partners.json"
    if not partners_file.exists():
        pytest.skip("not run: data/<snapshot_id>/partners.json does not exist yet")
    doc = json.loads(partners_file.read_text(encoding="utf-8"))
    p = _find_partner(doc["partners"], "8220")
    assert p is not None, "8220 not found in partners.json"
    failures = []
    if p.get("kind") != "special":
        failures.append(("kind", p.get("kind"), "expected", "special"))
    if p.get("name") != "Unidentified Countries (Census code 8220)":
        failures.append(("name", p.get("name"), "expected", "Unidentified Countries (Census code 8220)"))
    if p.get("include_in_world_reconciliation") is not True:
        failures.append(("include_in_world_reconciliation", p.get("include_in_world_reconciliation"), "expected", True))
    if p.get("iso3") is not None:
        failures.append(("iso3", p.get("iso3"), "expected", None))
    if p.get("map_feature_id") is not None:
        failures.append(("map_feature_id", p.get("map_feature_id"), "expected", None))
    if p.get("resolution") != "approved":
        failures.append(("resolution", p.get("resolution"), "expected", "approved"))
    note = p.get("resolution_note") or ""
    if "2026-09-09" not in note:
        failures.append(("resolution_note missing '2026-09-09'", note))
    if "pending" in note.lower():
        failures.append(("resolution_note contains 'pending'", note))
    assert not failures, failures


def test_partner_4803_is_kind_country_with_null_iso3(snapshot_dir):
    """Owner decision / amended schema/CONTRACT.md: Kosovo 4803 is kind
    country with iso3 null, not kind special. Kosovo has no ISO 3166-1
    alpha code, hence iso3 null even as a country."""
    path = require_snapshot(snapshot_dir)
    partners_file = path / "partners.json"
    if not partners_file.exists():
        pytest.skip("not run: data/<snapshot_id>/partners.json does not exist yet")
    doc = json.loads(partners_file.read_text(encoding="utf-8"))
    p = _find_partner(doc["partners"], "4803")
    assert p is not None, "4803 not found in partners.json"
    failures = []
    if p.get("kind") != "country":
        failures.append(("kind", p.get("kind"), "expected", "country"))
    if p.get("iso3") is not None:
        failures.append(("iso3", p.get("iso3"), "expected", None))
    assert not failures, failures


def test_every_kind_special_partner_has_null_iso3_and_map_feature_id(snapshot_dir):
    """kind special is reserved for non-geographic codes (amended
    schema/CONTRACT.md); every such partner has no ISO 3166-1 code and
    no map shape."""
    path = require_snapshot(snapshot_dir)
    partners_file = path / "partners.json"
    if not partners_file.exists():
        pytest.skip("not run: data/<snapshot_id>/partners.json does not exist yet")
    doc = json.loads(partners_file.read_text(encoding="utf-8"))
    special_partners = [p for p in doc["partners"] if p.get("kind") == "special"]
    if not special_partners:
        pytest.skip("not run: no kind special partners in partners.json yet")
    violations = [
        (p["code"], "iso3", p.get("iso3"), "map_feature_id", p.get("map_feature_id"))
        for p in special_partners
        if p.get("iso3") is not None or p.get("map_feature_id") is not None
    ]
    assert not violations, violations


def test_8220_is_the_only_kind_special_partner(snapshot_dir):
    """Owner decision: 8220 is the only kind special partner. Kosovo
    4803 moved to kind country, so it must not appear here; kind special
    is reserved for non-geographic codes."""
    path = require_snapshot(snapshot_dir)
    partners_file = path / "partners.json"
    if not partners_file.exists():
        pytest.skip("not run: data/<snapshot_id>/partners.json does not exist yet")
    doc = json.loads(partners_file.read_text(encoding="utf-8"))
    special_codes = sorted(p["code"] for p in doc["partners"] if p.get("kind") == "special")
    assert special_codes == ["8220"], f"expected only 8220 to be kind special, found: {special_codes}"
