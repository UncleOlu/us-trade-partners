"""reports/pipeline/validation.csv column contract and allowed values,
from schema/CONTRACT.md "Validation report" section.

Test ids: test_vcsv01_* .. test_vcsv04_*
"""

import csv

from conftest import require_validation_csv

EXPECTED_COLUMNS = [
    "snapshot_id",
    "year",
    "period",
    "flow",
    "check",
    "partner_code",
    "section_id",
    "chapter_code",
    "expected",
    "actual",
    "difference_usd",
    "difference_pct",
    "status",
]

ALLOWED_STATUS = {"PASS", "FAIL", "NOT_COMPARABLE", "NOT_APPLICABLE"}

ALLOWED_CHECK = {
    "unique_records",
    "record_counts",
    "partner_totals",
    "world_totals",
    "category_totals",
    "derived_figures",
    "published_examples",
    "eu_calculation",
    "eu_comparability",
    "flowvalue_integrity",
    "partner_resolution",
}


def test_vcsv01_columns_match_contract_in_order():
    path = require_validation_csv()
    with open(path, newline="", encoding="utf-8") as fh:
        reader = csv.reader(fh)
        header = next(reader)
    assert header == EXPECTED_COLUMNS


def test_vcsv02_status_values_are_allowed():
    path = require_validation_csv()
    with open(path, newline="", encoding="utf-8") as fh:
        rows = list(csv.DictReader(fh))
    bad = sorted({r["status"] for r in rows} - ALLOWED_STATUS)
    assert not bad, f"unexpected status values: {bad}"


def test_vcsv03_check_values_are_allowed():
    path = require_validation_csv()
    with open(path, newline="", encoding="utf-8") as fh:
        rows = list(csv.DictReader(fh))
    bad = sorted({r["check"] for r in rows} - ALLOWED_CHECK)
    assert not bad, f"unexpected check values: {bad}"


def test_vcsv04_empty_cells_are_empty_strings_not_the_word_null():
    """CONTRACT.md: 'Empty cells are empty strings, never the word null.'"""
    path = require_validation_csv()
    with open(path, newline="", encoding="utf-8") as fh:
        rows = list(csv.DictReader(fh))
    violations = []
    for i, row in enumerate(rows):
        for col, val in row.items():
            if val is not None and val.strip().lower() == "null":
                violations.append((i, col, val))
    assert not violations, violations[:10]
