"""meta.json business rules from docs/SPEC.md AVAILABILITY and schema/
CONTRACT.md that are not fully expressed by meta.schema.json alone.

Test ids: test_meta01_* .. test_meta04_*
"""

import json

import pytest

from conftest import require_snapshot

RESIDUAL_GAP_PHRASE_MARKERS = ("partner-level revision", "world total")


def test_meta01u_residual_gap_marker_words_are_meaningful():
    """Documents the two substrings this suite requires meta.notes to
    contain (case-insensitive), taken verbatim from SPEC AVAILABILITY:
    'a partner-level revision that leaves every world total unchanged is
    not detected.'"""
    assert RESIDUAL_GAP_PHRASE_MARKERS == ("partner-level revision", "world total")


def _load_meta(snapshot_dir):
    path = require_snapshot(snapshot_dir)
    meta_file = path / "meta.json"
    if not meta_file.exists():
        pytest.skip("not run: data/<snapshot_id>/meta.json does not exist yet")
    return json.loads(meta_file.read_text(encoding="utf-8"))


def test_meta02_source_fingerprint_before_equals_after_true(snapshot_dir):
    meta = _load_meta(snapshot_dir)
    assert meta["source_fingerprint"]["before_equals_after"] is True


def test_meta03_configured_coverage_years_within_verified_availability(snapshot_dir):
    meta = _load_meta(snapshot_dir)
    va = meta["verified_availability"]
    cc = meta["configured_coverage"]
    out_of_range = [y for y in cc["years"] if not (va["from_year"] <= y <= va["to_year"])]
    assert not out_of_range, (
        f"configured_coverage years outside verified_availability "
        f"[{va['from_year']}, {va['to_year']}]: {out_of_range}"
    )
    assert cc["start_year"] == min(cc["years"])
    assert cc["end_year"] == max(cc["years"])


def test_meta04_notes_contain_residual_gap_note(snapshot_dir):
    """SPEC AVAILABILITY: 'meta.notes records the residual gap: a
    partner-level revision that leaves every world total unchanged is not
    detected.'"""
    meta = _load_meta(snapshot_dir)
    notes_text = " ".join(meta.get("notes", [])).lower()
    missing = [m for m in RESIDUAL_GAP_PHRASE_MARKERS if m not in notes_text]
    assert not missing, f"meta.notes is missing the residual-gap note; missing phrases: {missing}"


def test_meta05_source_last_update_verified_is_false(snapshot_dir):
    """SPEC AVAILABILITY: 'LAST_UPDATE returns the literal 0 on both
    endpoints and is not verified as a date.' meta.schema.json already
    enforces verified: false as a const; this test documents the business
    reason and catches a schema/business-rule drift if the const is ever
    loosened."""
    meta = _load_meta(snapshot_dir)
    assert meta["source_last_update"]["verified"] is False
