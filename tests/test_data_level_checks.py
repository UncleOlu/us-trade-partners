"""Data-level tests that are not one of the numbered VALIDATION checks
1-9 in docs/SPEC.md, but are directly implied by schema/CONTRACT.md and
the schema files: structural completeness of data/<snapshot_id>/partner/
<code>.json's years[] array against meta.json's configured_coverage, and
consistency between the FlowValue inputs (imports, exports) and the
DerivedValue outputs (balance, total_trade_value) that CONTRACT.md's
Value rules define in terms of them.

Test ids: test_dl01_*
"""

import json

import pytest

from conftest import require_snapshot


def test_dl01_partner_years_match_configured_coverage_and_derived_consistency(snapshot_dir):
    """For every data/<snapshot_id>/partner/<code>.json:

    1. years[] has exactly one entry per year in meta.json's
       configured_coverage.years, sorted (schema/CONTRACT.md Ordering
       and determinism: 'years by year'; DATA CONTRACT: 'one entry per
       configured year, sorted by year' per partner.schema.json).
    2. The set of years whose imports AND exports are both observed or
       confirmed_zero equals the set of years with an observed balance
       and an observed total_trade_value (schema/CONTRACT.md Value
       rules: 'observed only when both inputs are observed or
       confirmed_zero'). This is an exact-set equality in both
       directions: no year should have a derived value observed without
       both inputs being additive, and no year with both inputs additive
       should be missing a derived value.
    """
    path = require_snapshot(snapshot_dir)
    meta_file = path / "meta.json"
    partner_dir = path / "partner"
    if not meta_file.exists():
        pytest.skip("not run: data/<snapshot_id>/meta.json does not exist yet")
    if not partner_dir.is_dir() or not any(partner_dir.glob("*.json")):
        pytest.skip("not run: data/<snapshot_id>/partner/ has no files yet")

    meta = json.loads(meta_file.read_text(encoding="utf-8"))
    configured_years = meta["configured_coverage"]["years"]
    expected_years_sorted = sorted(configured_years)

    years_mismatches = []
    consistency_mismatches = []
    for f in sorted(partner_dir.glob("*.json")):
        doc = json.loads(f.read_text(encoding="utf-8"))
        code = doc["partner"]["code"]
        year_entries = doc.get("years", [])
        actual_years = [y["year"] for y in year_entries]

        if actual_years != expected_years_sorted:
            years_mismatches.append((code, "years", actual_years, "expected", expected_years_sorted))
            continue  # a malformed years[] makes the set comparison below meaningless for this file

        additive_input_years = set()
        observed_derived_years = set()
        for y in year_entries:
            year = y["year"]
            imports_additive = y["imports"]["status"] in ("observed", "confirmed_zero")
            exports_additive = y["exports"]["status"] in ("observed", "confirmed_zero")
            if imports_additive and exports_additive:
                additive_input_years.add(year)
            if y["balance"]["status"] == "observed" and y["total_trade_value"]["status"] == "observed":
                observed_derived_years.add(year)

        only_additive_inputs = sorted(additive_input_years - observed_derived_years)
        only_observed_derived = sorted(observed_derived_years - additive_input_years)
        if only_additive_inputs or only_observed_derived:
            consistency_mismatches.append((
                code,
                "years with additive inputs but no observed derived value", only_additive_inputs,
                "years with an observed derived value but not both inputs additive", only_observed_derived,
            ))

    assert not years_mismatches, years_mismatches[:10]
    assert not consistency_mismatches, consistency_mismatches[:10]
