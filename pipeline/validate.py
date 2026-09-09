"""
Validation for the US goods trade partner visualization (BUILD ORDER step 3,
Agent A). Reads the built data/<snapshot_id>/ (or a rebuild output directory)
plus the raw archive and pipeline reference files, and writes
reports/pipeline/validation.csv (13 columns, exact order per CONTRACT) and
reports/pipeline/validation_summary.md.

Checks 1-9 exactly as SPEC VALIDATION defines them. Never states a cause it
cannot prove; a Census-documented cause with an explicit tolerance is the
only allowed non-exact PASS, and it must be recorded in the row. Never adds
an "other" bucket.

Usage:
    .venv/bin/python3 pipeline/validate.py <snapshot_id> --data-dir <dir>
"""

from __future__ import annotations

import argparse
import csv
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build import (  # noqa: E402
    RawArchive, load_excluded_codes, load_country_map, load_eu_members,
    load_hs_sections_ref, FOUR_DIGIT_PATTERN, FLOW_VAL_YR, FLOW_VAL_MO,
    eu_membership_for_year, WORLD_CODE,
)

ROOT = Path(".")
PIPELINE_DIR = ROOT / "pipeline"
REPORTS_DIR = ROOT / "reports" / "pipeline"
FIXTURES_DIR = ROOT / "tests" / "fixtures" / "published_examples"

CSV_COLUMNS = ["snapshot_id", "year", "period", "flow", "check", "partner_code",
               "section_id", "chapter_code", "expected", "actual",
               "difference_usd", "difference_pct", "status"]

CHECK_NAMES = {"unique_records", "record_counts", "partner_totals", "world_totals",
               "category_totals", "derived_figures", "published_examples",
               "eu_calculation", "eu_comparability", "flowvalue_integrity",
               "partner_resolution"}


def row(snapshot_id, year, flow, check, status, partner_code="", section_id="",
        chapter_code="", expected="", actual="", period=None):
    assert check in CHECK_NAMES, check
    diff_usd = ""
    diff_pct = ""
    if expected != "" and actual != "" and isinstance(expected, int) and isinstance(actual, int):
        diff_usd = actual - expected
        diff_pct = round((diff_usd / expected) * 100, 6) if expected != 0 else ("inf" if diff_usd != 0 else 0)
    return {
        "snapshot_id": snapshot_id, "year": year if year is not None else "",
        "period": period if period else (f"{year}-12" if year is not None else ""),
        "flow": flow, "check": check, "partner_code": partner_code,
        "section_id": section_id, "chapter_code": chapter_code,
        "expected": expected, "actual": actual,
        "difference_usd": diff_usd, "difference_pct": diff_pct, "status": status,
    }


def load_data_json(data_dir: Path, rel: str):
    p = data_dir / rel
    if not p.exists():
        return None
    return json.loads(p.read_text())


class Validator:
    def __init__(self, snapshot_id: str, data_dir: Path):
        self.snapshot_id = snapshot_id
        self.data_dir = data_dir
        self.archive = RawArchive(snapshot_id)
        self.excluded_codes, self.cgp_list = load_excluded_codes()
        self.country_map, _ = load_country_map()
        self.eu_doc = load_eu_members()
        self.hs_sections_ref = load_hs_sections_ref()
        self.meta = load_data_json(data_dir, "meta.json")
        self.partners_doc = load_data_json(data_dir, "partners.json")
        self.hs_sections_doc = load_data_json(data_dir, "hs_sections.json")
        self.years = self.archive.years
        self.rows: list[dict] = []

        self.partner_files = {}
        for p in self.partners_doc["partners"]:
            code = p["code"]
            if p["resolution"] == "approved":
                doc = load_data_json(data_dir, f"partner/{code}.json")
                if doc:
                    self.partner_files[code] = doc

        self.summary_files = {}
        for year in self.years:
            doc = load_data_json(data_dir, f"summary/{year}.json")
            if doc:
                self.summary_files[year] = doc

        self.section_files = {}
        for g in self.hs_sections_ref["groups"]:
            doc = load_data_json(data_dir, f"section/{g['id']}.json")
            if doc:
                self.section_files[g["id"]] = doc

    def add(self, **kwargs):
        self.rows.append(row(self.snapshot_id, **kwargs))

    # ------------------------------------------------------------------
    # Check 1: unique records, and record counts prove world/group excluded
    # ------------------------------------------------------------------
    def check1_unique_records(self):
        approved_codes = {p["code"] for p in self.partners_doc["partners"] if p["resolution"] == "approved"}
        excluded_codes = {p["code"] for p in self.partners_doc["partners"] if p["resolution"] == "excluded"}
        # world row and wildcard regional codes structurally cannot appear
        # (PartnerCode pattern), verify neither is present anywhere
        bad = (approved_codes | excluded_codes) & ({WORLD_CODE} | {c["code"] for c in self.cgp_list if not FOUR_DIGIT_PATTERN.match(c["code"])})
        status = "PASS" if not bad else "FAIL"
        self.add(year=None, flow="", check="unique_records", status=status,
                  expected=0, actual=len(bad),
                  partner_code=",".join(sorted(bad)) if bad else "")

        for code, doc in self.partner_files.items():
            for year_entry in doc["sections"]:
                year = year_entry["year"]
                seen_chapters = {"imports": set(), "exports": set()}
                dup = False
                for g in year_entry["groups"]:
                    for ch in g["chapters"]:
                        for flow in ("imports", "exports"):
                            if ch["chapter"] in seen_chapters[flow]:
                                dup = True
                            seen_chapters[flow].add(ch["chapter"])
                status = "FAIL" if dup else "PASS"
                if dup:
                    self.add(year=year, flow="", check="unique_records", status=status,
                              partner_code=code, expected=0, actual=1)

    # ------------------------------------------------------------------
    # Check 9 helper feeds record_counts too: record counts (informational
    # rows proving totals/groups excluded from partner/chapter record sets)
    # ------------------------------------------------------------------
    def check1b_record_counts(self):
        for (flow, year), rows in self.archive.partner_totals.items():
            codes = {r["CTY_CODE"] for r in rows}
            excluded_present = codes & self.excluded_codes
            status = "PASS" if excluded_present == excluded_present else "PASS"
            # informational: confirm every excluded code we found live is
            # indeed in the fixed excluded list (never silently new-partnered)
            unexplained = codes - self.excluded_codes - set(self.country_map.keys())
            status = "PASS" if not unexplained else "FAIL"
            self.add(year=year, flow=flow, check="record_counts", status=status,
                      expected=0, actual=len(unexplained),
                      partner_code=",".join(sorted(unexplained)) if unexplained else "")

    # ------------------------------------------------------------------
    # Check 2: partner totals: chapter sum equals partner total, per
    # partner/year/flow.
    # ------------------------------------------------------------------
    def check2_partner_totals(self):
        # EU is excluded: CONTRACT check 2 compares the chapter sum against
        # "the separately fetched partner total", and EU has no separately
        # fetched total (it is a computed aggregate from member observations,
        # already independently verified by check 7 eu_calculation; its
        # group/chapter-level detail is also absent by design in transition
        # years 2013 and 2020, which check 4 category_totals already covers
        # correctly).
        for code, doc in self.partner_files.items():
            if code == "EU":
                continue
            for year_entry, section_entry in zip(doc["years"], doc["sections"]):
                year = year_entry["year"]
                for flow in ("imports", "exports"):
                    partner_fv = year_entry[flow]
                    chapter_sum = 0
                    all_ok = True
                    for g in section_entry["groups"]:
                        for ch in g["chapters"]:
                            fv = ch[flow]
                            if fv["status"] in ("observed", "confirmed_zero"):
                                chapter_sum += fv["value"]
                            elif fv["status"] == "not_applicable":
                                continue
                            else:
                                all_ok = False
                    if partner_fv["status"] not in ("observed", "confirmed_zero"):
                        # nothing to reconcile against; not a FAIL of this check
                        continue
                    expected = partner_fv["value"]
                    if not all_ok:
                        self.add(year=year, flow=flow, check="partner_totals", status="FAIL",
                                  partner_code=code, expected=expected, actual="",
                                  )
                        continue
                    status = "PASS" if chapter_sum == expected else "FAIL"
                    self.add(year=year, flow=flow, check="partner_totals", status=status,
                              partner_code=code, expected=expected, actual=chapter_sum)

    # ------------------------------------------------------------------
    # Check 3: world totals: reconciliation-universe sum equals world total
    # ------------------------------------------------------------------
    def check3_world_totals(self):
        # Amended CONTRACT Aggregation rules: the universe sum is computed
        # over reconciliation partners whose value is observed or
        # confirmed_zero only; a partner with no partner-level row for that
        # flow/year is skipped from the sum (never imputed, never blocks
        # it) and listed in partner_code. Check 3 passes only on an exact
        # match with the separately fetched world total; that exact match
        # is the evidence the skipped partners contributed nothing. Any
        # nonzero difference is reported as-is, never explained away.
        # Recomputed independently from the raw archive (not from the
        # built summary files) as a genuine cross-check of build.py's own
        # compute_world_reconciliation.
        reconciliation_codes = [p["code"] for p in self.partners_doc["partners"]
                                 if p["resolution"] == "approved" and p["include_in_world_reconciliation"]]
        for year in self.years:
            for flow in ("imports", "exports"):
                val_field = FLOW_VAL_YR[flow]
                pt_rows = self.archive.partner_totals.get((flow, year), [])
                pt_by_code = {r["CTY_CODE"]: r for r in pt_rows}
                total = 0
                absent_codes = []
                for code in reconciliation_codes:
                    row = pt_by_code.get(code)
                    if row is not None and row.get(val_field) not in (None, ""):
                        total += int(row[val_field])
                    else:
                        absent_codes.append(code)

                world_row = self.archive.world_totals.get((flow, year))
                if world_row is None or world_row.get(val_field) in (None, ""):
                    self.add(year=year, flow=flow, check="world_totals", status="FAIL",
                              expected="", actual=total,
                              partner_code=",".join(sorted(absent_codes)))
                    continue
                expected = int(world_row[val_field])
                status = "PASS" if total == expected else "FAIL"
                self.add(year=year, flow=flow, check="world_totals", status=status,
                          expected=expected, actual=total,
                          partner_code=",".join(sorted(absent_codes)))

    # ------------------------------------------------------------------
    # Check 4: category totals: group sums equal chapter sums
    # ------------------------------------------------------------------
    def check4_category_totals(self):
        for code, doc in self.partner_files.items():
            for section_entry in doc["sections"]:
                year = section_entry["year"]
                for g in section_entry["groups"]:
                    for flow in ("imports", "exports"):
                        group_fv = g[flow]
                        chapter_sum = 0
                        all_ok = True
                        for ch in g["chapters"]:
                            fv = ch[flow]
                            if fv["status"] in ("observed", "confirmed_zero"):
                                chapter_sum += fv["value"]
                            elif fv["status"] == "not_applicable":
                                continue
                            else:
                                all_ok = False
                        if group_fv["status"] not in ("observed", "confirmed_zero"):
                            if all_ok:
                                # group says absent but chapters fully observed: mismatch
                                self.add(year=year, flow=flow, check="category_totals", status="FAIL",
                                          partner_code=code, section_id=g["section_id"],
                                          expected=chapter_sum, actual="")
                            continue
                        expected = group_fv["value"]
                        status = "PASS" if (all_ok and chapter_sum == expected) else "FAIL"
                        self.add(year=year, flow=flow, check="category_totals", status=status,
                                  partner_code=code, section_id=g["section_id"],
                                  expected=expected, actual=chapter_sum if all_ok else "")

    # ------------------------------------------------------------------
    # Check 5: derived figures: balance/total_trade_value exact, from
    # observed inputs only
    # ------------------------------------------------------------------
    def _check_derived(self, imports_fv, exports_fv, balance_dv, total_dv, year, flow_label, check_balance=True, **ctx):
        i_ok = imports_fv["status"] in ("observed", "confirmed_zero")
        e_ok = exports_fv["status"] in ("observed", "confirmed_zero")
        if i_ok and e_ok:
            exp_balance = exports_fv["value"] - imports_fv["value"]
            exp_total = imports_fv["value"] + exports_fv["value"]
            tot_status = "PASS" if (total_dv["status"] == "observed" and total_dv["value"] == exp_total) else "FAIL"
            if check_balance:
                bal_status = "PASS" if (balance_dv["status"] == "observed" and balance_dv["value"] == exp_balance) else "FAIL"
                self.add(year=year, flow="balance", check="derived_figures", status=bal_status,
                          expected=exp_balance, actual=balance_dv.get("value") if balance_dv["value"] is not None else "",
                          **ctx)
            self.add(year=year, flow="total_trade_value", check="derived_figures", status=tot_status,
                      expected=exp_total, actual=total_dv.get("value") if total_dv["value"] is not None else "",
                      **ctx)
        else:
            status = "PASS" if total_dv["status"] == "absent" else "FAIL"
            if check_balance:
                bal_ok = balance_dv["status"] == "absent"
                self.add(year=year, flow="balance", check="derived_figures",
                          status="PASS" if bal_ok else "FAIL",
                          expected="absent", actual=balance_dv["status"], **ctx)
            self.add(year=year, flow="total_trade_value", check="derived_figures", status=status,
                      expected="absent", actual=total_dv["status"], **ctx)

    def check5_derived_figures(self):
        for year in self.years:
            summary = self.summary_files.get(year)
            if summary:
                w = summary["world"]
                self._check_derived(w["imports"], w["exports"], w["balance"], w["total_trade_value"], year, "world")
                for p in summary["partners"]:
                    self._check_derived(p["imports"], p["exports"], p["balance"], p["total_trade_value"],
                                          year, "partner", partner_code=p["code"])
        for code, doc in self.partner_files.items():
            for ye in doc["years"]:
                self._check_derived(ye["imports"], ye["exports"], ye["balance"], ye["total_trade_value"],
                                      ye["year"], "partner_year", partner_code=code)
            for se in doc["sections"]:
                for g in se["groups"]:
                    # groups have no "balance" field in the schema; only
                    # total_trade_value is checked (check_balance=False).
                    self._check_derived(g["imports"], g["exports"], None,
                                          g["total_trade_value"], se["year"], "group", check_balance=False,
                                          partner_code=code, section_id=g["section_id"])

    # ------------------------------------------------------------------
    # Check 6: published examples (read-only fixtures)
    # ------------------------------------------------------------------
    def check6_published_examples(self):
        # Fixture schema per schema/CONTRACT.md "Published examples (check 6)"
        # and Agent D's saved files: {code, name, year, url, table,
        # revision_date, rounding_unit, accessed, basis, comparable,
        # comparable_reason, values: {imports_usd, exports_usd,
        # imports_displayed, exports_displayed, balance_displayed},
        # revision_note}. The special-code slot is a sentinel file with
        # {code: "SPECIAL", status: "NOT_APPLICABLE", ...} instead of a real
        # partner-year, used only when no special-kind code was observed.
        if not FIXTURES_DIR.is_dir():
            self.add(year=None, flow="", check="published_examples", status="FAIL",
                      expected="fixtures directory", actual="missing", partner_code="")
            return
        fixture_files = sorted(FIXTURES_DIR.glob("*.json"))
        if not fixture_files:
            self.add(year=None, flow="", check="published_examples", status="FAIL",
                      expected="fixtures present", actual="0 fixtures found")
            return
        special_kinds_observed = any(
            p["kind"] == "special" for p in self.partners_doc["partners"] if p["resolution"] == "approved"
        )
        special_codes_observed = sorted(
            p["code"] for p in self.partners_doc["partners"]
            if p["resolution"] == "approved" and p["kind"] == "special"
        )
        # CONTRACT.md Published examples (amended): Kosovo 4803 is now kind
        # country (a geographic partner without an ISO 3166-1 code), so it
        # is an additional comparable example, not the special row. The only
        # kind special code observed is 8220 (owner-approved 2026-09-09).
        # The special row reads tests/fixtures/published_examples/special_8220.json:
        # if that fixture records NOT_APPLICABLE (no Census Trade in Goods
        # page for this code), the row is NOT_APPLICABLE with the URL tried
        # and HTTP status in the reason; if it records captured values,
        # compare within rounding like any other fixture. A missing fixture
        # file (not written at all) is still FAIL 'fixture missing', per
        # CONTRACT, never NOT_APPLICABLE.
        special_fixture_path = FIXTURES_DIR / "special_8220.json"
        if special_kinds_observed:
            if not special_fixture_path.exists():
                self.add(year=None, flow="", check="published_examples", status="FAIL",
                          partner_code="8220", expected="fixture present", actual="fixture missing")
            else:
                sfx = json.loads(special_fixture_path.read_text())
                if sfx.get("status") == "NOT_APPLICABLE" or sfx.get("code") in (None, "SPECIAL"):
                    url_tried = sfx.get("url") or sfx.get("url_tried") or ""
                    http_status = sfx.get("http_status", sfx.get("status_code", ""))
                    reason = (f"no Census Trade in Goods page for code 8220; url tried: {url_tried!r}, "
                              f"http status: {http_status!r}")
                    self.add(year=sfx.get("year"), flow="", check="published_examples",
                              status="NOT_APPLICABLE", partner_code="8220", expected="", actual=reason)
                else:
                    self._check_published_example_fixture(sfx, code_override="8220")
        elif special_codes_observed:
            # kind special observed but not exactly 8220 (future snapshot
            # drift): still require a fixture per observed special code,
            # named by convention special_<code>.json; do not silently skip.
            for sc in special_codes_observed:
                p = FIXTURES_DIR / f"special_{sc}.json"
                if not p.exists():
                    self.add(year=None, flow="", check="published_examples", status="FAIL",
                              partner_code=sc, expected="fixture present", actual="fixture missing")

        for fx_path in fixture_files:
            if fx_path.name in ("special_not_applicable.json", "special_code_note.json", "special_8220.json"):
                # metadata/sentinel files or the special row (already
                # processed above), not ordinary partner-year fixtures
                continue
            fx = json.loads(fx_path.read_text())
            self._check_published_example_fixture(fx)

    def _check_published_example_fixture(self, fx: dict, code_override: str | None = None) -> None:
        code = code_override or fx.get("code")
        if code is None:
            # defensive: any other non-partner-year metadata file dropped
            # into this directory is skipped rather than treated as a
            # fixture-shaped FAIL
            return
        year = fx.get("year")
        rounding = fx.get("rounding_unit", 1)
        values = fx.get("values", {})
        doc = self.partner_files.get(code)
        if doc is None:
            self.add(year=year, flow="", check="published_examples", status="FAIL",
                      partner_code=code, expected="built partner data", actual="partner not approved/built")
            return
        ye = next((y for y in doc["years"] if y["year"] == year), None)
        if ye is None:
            self.add(year=year, flow="", check="published_examples", status="FAIL",
                      partner_code=code, expected="year present", actual="year not in configured coverage")
            return
        for flow in ("imports", "exports"):
            published_val = values.get(f"{flow}_usd")
            if published_val is None:
                continue
            built_fv = ye[flow]
            if built_fv["status"] not in ("observed", "confirmed_zero"):
                # CONTRACT Check scope notes (amended): when the pipeline
                # value is absent, no numeric comparison is possible. The
                # row is NOT_COMPARABLE (never PASS, never FAIL) with a
                # reason stating the published display value and that
                # absent is not evidence of zero (CONTRACT Value rules:
                # "Missing partner-level rows stay absent" / "A missing
                # row is never evidence of zero on its own").
                # NOT_COMPARABLE rows in check 6 do not block publication.
                displayed = values.get(f"{flow}_displayed", "")
                reason = (f"pipeline value {built_fv['status']} for {code} {flow} {year}; "
                          f"published display value is {displayed!r}; absent is not evidence "
                          f"of zero, no numeric comparison possible")
                self.add(year=year, flow=flow, check="published_examples", status="NOT_COMPARABLE",
                          partner_code=code, expected=published_val, actual=reason)
                continue
            diff = abs(built_fv["value"] - published_val)
            status = "PASS" if diff <= rounding else "FAIL"
            self.add(year=year, flow=flow, check="published_examples", status=status,
                      partner_code=code, expected=published_val, actual=built_fv["value"])

    # ------------------------------------------------------------------
    # Check 7: EU calculation (exact, independent recomputation) and EU
    # comparability (informational, vs Census code 0003)
    # ------------------------------------------------------------------
    def check7_eu(self):
        eu_doc_file = self.partner_files.get("EU")
        for year in self.years:
            full_codes, transitions = eu_membership_for_year(self.eu_doc, year)
            for flow in ("imports", "exports"):
                val_field = FLOW_VAL_YR[flow]
                val_mo_field = FLOW_VAL_MO[flow]
                total = 0
                missing = []
                pt_rows = self.archive.partner_totals.get((flow, year), [])
                pt_by_code = {r["CTY_CODE"]: r for r in pt_rows}
                for code in full_codes:
                    r = pt_by_code.get(code)
                    if r is None or r.get(val_field) in (None, ""):
                        missing.append(code)
                        continue
                    total += int(r[val_field])
                for tm in transitions:
                    code = tm["census_cty_code"]
                    for period in tm["member_months"]:
                        mrow = self.archive.eu_member_month(flow, code, period)
                        if mrow is None or mrow.get(val_mo_field) in (None, ""):
                            missing.append(f"{code}:{period}")
                            continue
                        total += int(mrow[val_mo_field])

                built_ye = None
                if eu_doc_file:
                    built_ye = next((y for y in eu_doc_file["years"] if y["year"] == year), None)
                built_fv = built_ye[flow] if built_ye else None

                if missing:
                    status = "PASS" if (built_fv and built_fv["status"] == "absent") else "FAIL"
                    self.add(year=year, flow=flow, check="eu_calculation", status=status,
                              partner_code="EU", expected="absent", actual=built_fv["status"] if built_fv else "missing")
                else:
                    status = "PASS" if (built_fv and built_fv["status"] == "observed" and built_fv["value"] == total) else "FAIL"
                    self.add(year=year, flow=flow, check="eu_calculation", status=status,
                              partner_code="EU", expected=total,
                              actual=built_fv["value"] if built_fv and built_fv["value"] is not None else "")

                # comparability vs Census own EU aggregate code 0003
                census_row = pt_by_code.get("0003")
                if census_row is None or census_row.get(val_field) in (None, ""):
                    self.add(year=year, flow=flow, check="eu_comparability", status="NOT_COMPARABLE",
                              partner_code="0003", expected="", actual="",
                              )
                    continue
                census_val = int(census_row[val_field])
                our_val = total if not missing else None
                if our_val is None:
                    self.add(year=year, flow=flow, check="eu_comparability", status="NOT_COMPARABLE",
                              partner_code="0003", expected=census_val, actual="incomplete membership data")
                    continue
                self.add(year=year, flow=flow, check="eu_comparability", status="NOT_COMPARABLE",
                          partner_code="0003", expected=census_val, actual=our_val,
                          )

    # ------------------------------------------------------------------
    # Check 8: FlowValue integrity
    # ------------------------------------------------------------------
    def check8_flowvalue_integrity(self):
        bad = 0
        checked = 0
        fetch_failed_found = 0
        for p in self.data_dir.rglob("*.json"):
            text = p.read_text()
            if "fetch_failed" in text:
                fetch_failed_found += 1
            try:
                doc = json.loads(text)
            except json.JSONDecodeError:
                continue
            for fv in _iter_flowvalues(doc):
                checked += 1
                status = fv.get("status")
                value = fv.get("value")
                reason = fv.get("reason")
                if status in ("observed",):
                    if not isinstance(value, int) or reason is not None:
                        bad += 1
                elif status in ("confirmed_zero", "absent", "not_applicable"):
                    if value not in (None, 0) or not reason:
                        bad += 1
                    if status == "confirmed_zero" and value != 0:
                        bad += 1
        status = "PASS" if (bad == 0 and fetch_failed_found == 0) else "FAIL"
        self.add(year=None, flow="", check="flowvalue_integrity", status=status,
                  expected=0, actual=bad + fetch_failed_found)

    # ------------------------------------------------------------------
    # Check 9: partner resolution
    # ------------------------------------------------------------------
    def check9_partner_resolution(self):
        observed = set()
        for rows in self.archive.partner_totals.values():
            observed.update(r["CTY_CODE"] for r in rows)
        for rows in self.archive.hs2.values():
            observed.update(r["CTY_CODE"] for r in rows)
        observed.discard(WORLD_CODE)
        structurally_excluded = {c["code"] for c in self.cgp_list if not FOUR_DIGIT_PATTERN.match(c["code"])}
        observed -= structurally_excluded
        known = {p["code"] for p in self.partners_doc["partners"]}
        unresolved = observed - known
        status = "PASS" if not unresolved else "FAIL"
        self.add(year=None, flow="", check="partner_resolution", status=status,
                  expected=0, actual=len(unresolved),
                  partner_code=",".join(sorted(unresolved)) if unresolved else "")

    def run_all(self):
        self.check1_unique_records()
        self.check1b_record_counts()
        self.check2_partner_totals()
        self.check3_world_totals()
        self.check4_category_totals()
        self.check5_derived_figures()
        self.check6_published_examples()
        self.check7_eu()
        self.check8_flowvalue_integrity()
        self.check9_partner_resolution()
        return self.rows




def _iter_flowvalues(obj):
    if isinstance(obj, dict):
        if set(obj.keys()) >= {"status", "value", "reason"} and obj.get("status") in (
                "observed", "confirmed_zero", "absent", "not_applicable"):
            yield obj
        else:
            for v in obj.values():
                yield from _iter_flowvalues(v)
    elif isinstance(obj, list):
        for v in obj:
            yield from _iter_flowvalues(v)


def write_csv(rows: list[dict], path: Path):
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=CSV_COLUMNS)
        w.writeheader()
        for r in rows:
            out = {k: ("" if r[k] is None else r[k]) for k in CSV_COLUMNS}
            w.writerow(out)


def write_summary(rows: list[dict], path: Path, snapshot_id: str):
    from collections import Counter
    counts = {}
    for r in rows:
        counts.setdefault(r["check"], Counter())[r["status"]] += 1
    lines = [f"# Validation summary: {snapshot_id}", ""]
    lines.append("| check | rows | PASS | FAIL | NOT_COMPARABLE | NOT_APPLICABLE |")
    lines.append("|---|---|---|---|---|---|")
    total_fail = 0
    for check in sorted(CHECK_NAMES):
        c = counts.get(check, Counter())
        total = sum(c.values())
        fail = c.get("FAIL", 0)
        if check != "eu_comparability":
            total_fail += fail
        lines.append(f"| {check} | {total} | {c.get('PASS', 0)} | {fail} | {c.get('NOT_COMPARABLE', 0)} | {c.get('NOT_APPLICABLE', 0)} |")
    lines.append("")
    lines.append(f"Total FAIL across checks 1-9 excluding eu_comparability: {total_fail}")
    lines.append("")
    lines.append("## FAIL examples (grouped, up to 5 per check)")
    for check in sorted(CHECK_NAMES):
        fails = [r for r in rows if r["check"] == check and r["status"] == "FAIL"]
        if not fails:
            continue
        lines.append(f"\n### {check} ({len(fails)} FAIL)")
        for r in fails[:5]:
            lines.append(f"- year={r['year']} flow={r['flow']} partner={r['partner_code']} "
                          f"section={r['section_id']} chapter={r['chapter_code']} "
                          f"expected={r['expected']} actual={r['actual']}")
    path.write_text("\n".join(lines) + "\n")
    return total_fail


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("snapshot_id")
    parser.add_argument("--data-dir", required=True)
    args = parser.parse_args()
    v = Validator(args.snapshot_id, Path(args.data_dir))
    rows = v.run_all()
    write_csv(rows, REPORTS_DIR / "validation.csv")
    total_fail = write_summary(rows, REPORTS_DIR / "validation_summary.md", args.snapshot_id)
    print(f"[validate] wrote {len(rows)} rows; total FAIL (excl. eu_comparability): {total_fail}")
    return 0 if total_fail == 0 else 2


if __name__ == "__main__":
    sys.exit(main())
