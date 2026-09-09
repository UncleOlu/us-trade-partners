"""Pure helper functions for recomputing VALIDATION checks 1-9 independently.

Not a test file (pytest will not collect it, it does not match test_*.py).
Imported by test_validation_checks.py both for synthetic unit tests (which
run unconditionally) and for integration tests against a real
data/<snapshot_id> (which run only when that directory exists).

These functions encode only what schema/CONTRACT.md and docs/SPEC.md say.
They never read pipeline/ implementation code.
"""

import json
from datetime import date

FLOWVALUE_STATUSES = {"observed", "confirmed_zero", "absent", "not_applicable"}

# imports use GEN_VAL_YR / GEN_VAL_MO (general imports, customs value);
# exports use ALL_VAL_YR / ALL_VAL_MO (total exports FAS including
# re-exports). SPEC DATA SOURCE.
CENSUS_VALUE_FIELD = {
    "imports": ("GEN_VAL_YR", "GEN_VAL_MO"),
    "exports": ("ALL_VAL_YR", "ALL_VAL_MO"),
}
DERIVEDVALUE_STATUSES = {"observed", "absent"}


def is_flowvalue_shape(obj):
    return (
        isinstance(obj, dict)
        and set(obj.keys()) == {"status", "value", "reason"}
        and obj.get("status") in FLOWVALUE_STATUSES
    )


def is_derivedvalue_shape(obj):
    return (
        isinstance(obj, dict)
        and set(obj.keys()) == {"status", "value", "reason"}
        and obj.get("status") in DERIVEDVALUE_STATUSES
    )


def flowvalue_integrity_errors(obj):
    """Given a FlowValue-shaped dict, return a list of contract violations.
    Empty list means the value satisfies FlowValue rules from CONTRACT.md.
    """
    errors = []
    status = obj.get("status")
    value = obj.get("value")
    reason = obj.get("reason")

    if status == "fetch_failed":
        errors.append("fetch_failed must never appear in published data")
        return errors

    if status not in FLOWVALUE_STATUSES:
        errors.append(f"unknown status {status!r}")
        return errors

    if status == "observed":
        if not isinstance(value, int) or isinstance(value, bool):
            errors.append("observed requires an integer value")
        if reason is not None:
            errors.append("observed requires a null reason")
    elif status == "confirmed_zero":
        if value != 0 or isinstance(value, bool):
            errors.append("confirmed_zero requires value 0")
        if not isinstance(reason, str) or len(reason) < 1:
            errors.append("confirmed_zero requires a non-empty reason")
    else:  # absent, not_applicable
        if value is not None:
            errors.append(f"{status} requires a null value")
        if not isinstance(reason, str) or len(reason) < 1:
            errors.append(f"{status} requires a non-empty reason")

    return errors


def additive_statuses(flowvalue):
    """True if this FlowValue contributes its value to an additive sum
    (observed or confirmed_zero), per AGGREGATES AND ADDITIVE TOTALS and
    the group-sum rule in CONTRACT.md."""
    return flowvalue.get("status") in ("observed", "confirmed_zero")


def combine_group_sum(chapter_flowvalues):
    """Recompute a group-level (or partner-total) additive sum from a list
    of chapter FlowValues for one flow, per CONTRACT.md:
    'partner.sections[].groups[].imports is the sum of that group's
    observed chapter values for that flow; if any chapter in the group is
    absent for that flow, the group value is absent with a reason.
    Chapters that are not in the flow's chapter set for that year are
    not_applicable and do not block the group sum.'

    Returns a dict shaped like {"status": "observed"|"absent", "value": int|None,
    "reason": str|None, "blocking_codes": [...]}.
    """
    blocking = []
    total = 0
    for chapter, fv in chapter_flowvalues:
        status = fv.get("status")
        if status == "absent":
            blocking.append(chapter)
        elif status == "not_applicable":
            continue
        elif status in ("observed", "confirmed_zero"):
            total += fv["value"]
        else:
            blocking.append(chapter)

    if blocking:
        return {
            "status": "absent",
            "value": None,
            "reason": f"absent chapters block the group sum: {sorted(blocking)}",
            "blocking_codes": sorted(blocking),
        }
    return {"status": "observed", "value": total, "reason": None, "blocking_codes": []}


def reconciliation_universe_sum(partner_flowvalues):
    """Recompute a reconciliation-universe sum (validation check 3 and,
    when check 3 passes, section.years[].universe) from a list of
    (partner_code, FlowValue) pairs restricted to
    include_in_world_reconciliation == true partners, per the amended
    schema/CONTRACT.md Aggregation rules: 'Universe sums ... are computed
    over partners with include_in_world_reconciliation true whose value
    is observed or confirmed_zero. Partners with no partner-level row
    for that flow and year stay absent at partner level (never
    confirmed_zero) and are listed in the validation row's partner_code
    cell.'

    A partner whose value is not observed/confirmed_zero (status absent)
    is simply excluded from the sum, never blocking: this differs from
    combine_group_sum, where an absent chapter blocks the whole group.
    The sum returned here is always computable; whether it may be
    published as the world total or a section universe value depends on
    a separate exact-match test against the world total, done by
    world_total_check_status below, not on completeness of this sum.

    Returns {"status": "observed", "value": int, "observed_codes": [...],
    "absent_codes": [...]}.
    """
    observed_codes = []
    absent_codes = []
    total = 0
    for code, fv in partner_flowvalues:
        if fv.get("status") in ("observed", "confirmed_zero"):
            total += fv["value"]
            observed_codes.append(code)
        else:
            absent_codes.append(code)
    return {
        "status": "observed",
        "value": total,
        "observed_codes": sorted(observed_codes),
        "absent_codes": sorted(absent_codes),
    }


def world_total_check_status(universe_value, world_flowvalue):
    """Validation check 3 (amended schema/CONTRACT.md Aggregation rules):
    'Check 3 passes only when the universe sum equals the separately
    fetched world total exactly.' No Census-documented tolerance
    exception, unlike check 2. world_flowvalue must itself be observed
    for the check to pass (a non-observed world total is a FAIL, not a
    NOT_APPLICABLE or a pass by default).

    Returns (status, reason) where status is 'PASS' or 'FAIL' and reason
    is None on PASS.
    """
    if world_flowvalue.get("status") != "observed":
        return "FAIL", f"world total status is {world_flowvalue.get('status')!r}, not observed"
    if world_flowvalue["value"] != universe_value:
        return "FAIL", f"universe sum {universe_value} does not equal world total {world_flowvalue['value']}"
    return "PASS", None


def compute_balance(imports_fv, exports_fv):
    """balance = exports - imports, DerivedValue rules from CONTRACT.md:
    observed only when both inputs are observed or confirmed_zero."""
    if additive_statuses(imports_fv) and additive_statuses(exports_fv):
        return {"status": "observed", "value": exports_fv["value"] - imports_fv["value"], "reason": None}
    missing = []
    if not additive_statuses(imports_fv):
        missing.append("imports")
    if not additive_statuses(exports_fv):
        missing.append("exports")
    return {"status": "absent", "value": None, "reason": f"missing input(s): {', '.join(missing)}"}


def compute_total_trade_value(imports_fv, exports_fv):
    """total_trade_value = imports + exports, same rule as balance."""
    if additive_statuses(imports_fv) and additive_statuses(exports_fv):
        return {"status": "observed", "value": imports_fv["value"] + exports_fv["value"], "reason": None}
    missing = []
    if not additive_statuses(imports_fv):
        missing.append("imports")
    if not additive_statuses(exports_fv):
        missing.append("exports")
    return {"status": "absent", "value": None, "reason": f"missing input(s): {', '.join(missing)}"}


def find_duplicate_chapters(chapter_codes):
    """Given a list of chapter code strings for one (year, partner, flow),
    return the codes that appear more than once (check 1: unique records)."""
    seen = set()
    dupes = set()
    for c in chapter_codes:
        if c in seen:
            dupes.add(c)
        seen.add(c)
    return sorted(dupes)


def walk_flowvalue_like_dicts(obj, path=()):
    """Yield (path, dict) for every dict in a nested structure that has
    exactly the keys status/value/reason (FlowValue or DerivedValue
    shape), for the flowvalue_integrity and no-floats-anywhere checks."""
    if isinstance(obj, dict):
        if set(obj.keys()) == {"status", "value", "reason"}:
            yield path, obj
        for k, v in obj.items():
            yield from walk_flowvalue_like_dicts(v, path + (k,))
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            yield from walk_flowvalue_like_dicts(v, path + (i,))


def find_float_leaves(obj, path=()):
    """Yield (path, value) for every float leaf anywhere in a JSON
    structure loaded by the standard json module (HARD RULES: no floats
    anywhere in data files)."""
    if isinstance(obj, float):
        yield path, obj
    elif isinstance(obj, dict):
        for k, v in obj.items():
            yield from find_float_leaves(v, path + (k,))
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            yield from find_float_leaves(v, path + (i,))


# ---------------- EU calculation (check 7a), independent recomputation ----------------

def parse_census_rows(payload):
    """Parse a raw Census timeseries API JSON response (a header row
    followed by data rows, both plain lists, per every raw/source_test/
    *.response.json sample) into a list of dicts keyed by the header.
    The API echoes predicate dimensions as extra columns with the same
    header name as the real data column (see raw/source_test/
    partner_total_imports_large.response.json, which has CTY_CODE twice);
    the first occurrence is always the actual data value in every sample
    inspected, so later duplicates are dropped."""
    header = payload[0]
    rows = []
    for values in payload[1:]:
        row = {}
        for key, value in zip(header, values):
            if key not in row:
                row[key] = value
        rows.append(row)
    return rows


def census_row_value(rows, code, value_field, code_field="CTY_CODE"):
    """Return the integer value_field for the row whose code_field equals
    code, or None if no such row exists or the field is absent."""
    for row in rows:
        if row.get(code_field) == code:
            raw = row.get(value_field)
            return int(raw) if raw is not None else None
    return None


def eu_membership_for_year(fixture, year):
    """Given tests/fixtures/eu_members_fixture.json and a year, return
    (full_year_members, transition_members) per the fixture's own
    derivation_rule: a member with accession_date on or before Jan 1 of
    year and (no exit_date or exit_date after Dec 31 of year) is a
    full-year member; a member whose accession_date or exit_date falls
    inside the year is a transition member for the months it held
    membership that year; a member not yet acceded or already exited
    before the year starts is excluded entirely.

    full_year_members: list of {"name", "cty_code"}.
    transition_members: list of {"name", "cty_code", "months": [...]}.
    """
    year_start = date(year, 1, 1)
    year_end = date(year, 12, 31)
    full = []
    transitions = []
    for m in fixture["members"]:
        accession = date.fromisoformat(m["accession_date"])
        exit_ = date.fromisoformat(m["exit_date"]) if m["exit_date"] else None
        if accession > year_end or (exit_ is not None and exit_ < year_start):
            continue
        if accession <= year_start and (exit_ is None or exit_ > year_end):
            full.append({"name": m["name"], "cty_code": m["cty_code"]})
            continue
        start_bound = accession if accession > year_start else year_start
        end_bound = exit_ if (exit_ is not None and exit_ < year_end) else year_end
        months = []
        y, mo = start_bound.year, start_bound.month
        while (y, mo) <= (end_bound.year, end_bound.month):
            months.append(f"{y:04d}-{mo:02d}")
            mo += 1
            if mo > 12:
                mo = 1
                y += 1
        transitions.append({"name": m["name"], "cty_code": m["cty_code"], "months": months})
    return full, transitions


def compute_eu_total_for_year_flow(raw_snapshot_dir, fixture, year, flow):
    """Recompute the EU total for one year and flow from raw
    partner_totals (full-year members, December _YR row) and raw
    eu_members (transition members, monthly _MO rows), per
    schema/CONTRACT.md 'Raw archive layout' and 'EU rules in data'.

    schema/CONTRACT.md 'Raw archive layout' intro: 'Each request saves
    <name>.request.json ... and <name>.response.json (body verbatim).
    The table below gives <name>; readers open <name>.response.json.'
    So partner_totals/<flow>_<year>-12.response.json and
    eu_members/<flow>_<code>_<YYYY-MM>.response.json are the files to
    open here, not <name>.json.

    Returns (status, value, missing): status is 'observed' or 'absent';
    missing lists the (code_or_marker, period_or_path) pairs that could
    not be read, which is empty when status is 'observed'.
    """
    yr_field, mo_field = CENSUS_VALUE_FIELD[flow]
    full_members, transition_members = eu_membership_for_year(fixture, year)
    missing = []
    total = 0

    partner_totals_path = raw_snapshot_dir / "partner_totals" / f"{flow}_{year}-12.response.json"
    partner_rows = None
    if partner_totals_path.exists():
        partner_rows = parse_census_rows(json.loads(partner_totals_path.read_text(encoding="utf-8")))
    elif full_members:
        missing.append(("partner_totals_file", str(partner_totals_path)))

    for m in full_members:
        value = census_row_value(partner_rows, m["cty_code"], yr_field) if partner_rows else None
        if value is None:
            missing.append((m["cty_code"], f"{year}-12"))
        else:
            total += value

    for m in transition_members:
        for period in m["months"]:
            eu_member_path = raw_snapshot_dir / "eu_members" / f"{flow}_{m['cty_code']}_{period}.response.json"
            if not eu_member_path.exists():
                missing.append((m["cty_code"], period))
                continue
            rows = parse_census_rows(json.loads(eu_member_path.read_text(encoding="utf-8")))
            value = census_row_value(rows, m["cty_code"], mo_field)
            if value is None:
                missing.append((m["cty_code"], period))
            else:
                total += value

    if missing:
        return "absent", None, missing
    return "observed", total, []
