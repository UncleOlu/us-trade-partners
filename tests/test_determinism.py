"""Determinism rules from docs/SPEC.md ORDERING AND DETERMINISM and RAW
ARCHIVE AND REBUILD: sorted JSON keys, two-space indent, trailing newline,
UTF-8, no floats anywhere in data files, and rebuild byte-identity.

Test ids: test_det01_* .. test_det05_*
"""

import filecmp
import json
import os
from pathlib import Path

import pytest

from _checks import find_float_leaves
from conftest import require_snapshot


def _iter_data_json_files(path):
    return sorted(path.rglob("*.json"))


def test_det01u_find_float_leaves_detects_float():
    doc = {"a": [1, 2.5, {"b": 3}]}
    hits = list(find_float_leaves(doc))
    assert hits == [(("a", 1), 2.5)]


def test_det01u_find_float_leaves_clean_for_ints():
    doc = {"a": [1, 2, {"b": 3}], "c": None, "d": "1.5"}
    assert list(find_float_leaves(doc)) == []


def test_det01_no_floats_in_any_data_file(snapshot_dir):
    path = require_snapshot(snapshot_dir)
    files = _iter_data_json_files(path)
    if not files:
        pytest.skip("not run: data/<snapshot_id>/ has no json files yet")
    failures = []
    for f in files:
        doc = json.loads(f.read_text(encoding="utf-8"))
        hits = list(find_float_leaves(doc))
        if hits:
            failures.append((f.name, hits[:5]))
    assert not failures, failures


def test_det02_two_space_indent_and_sorted_keys(snapshot_dir):
    """Re-serializing each file with json.dumps(sort_keys=True, indent=2)
    must reproduce the file's own key order and whitespace byte-for-byte
    (modulo the trailing newline, checked separately)."""
    path = require_snapshot(snapshot_dir)
    files = _iter_data_json_files(path)
    if not files:
        pytest.skip("not run: data/<snapshot_id>/ has no json files yet")
    failures = []
    for f in files:
        raw = f.read_text(encoding="utf-8")
        body = raw[:-1] if raw.endswith("\n") else raw
        doc = json.loads(raw)
        expected = json.dumps(doc, indent=2, sort_keys=True, ensure_ascii=False)
        if body != expected:
            failures.append(f.name)
    assert not failures, failures


def test_det03_trailing_newline_present(snapshot_dir):
    path = require_snapshot(snapshot_dir)
    files = _iter_data_json_files(path)
    if not files:
        pytest.skip("not run: data/<snapshot_id>/ has no json files yet")
    failures = [f.name for f in files if not f.read_text(encoding="utf-8").endswith("\n")]
    assert not failures, failures


def test_det04_utf8_decodable(snapshot_dir):
    path = require_snapshot(snapshot_dir)
    files = _iter_data_json_files(path)
    if not files:
        pytest.skip("not run: data/<snapshot_id>/ has no json files yet")
    failures = []
    for f in files:
        try:
            f.read_bytes().decode("utf-8", errors="strict")
        except UnicodeDecodeError as exc:
            failures.append((f.name, str(exc)))
    assert not failures, failures


def test_det05_rebuild_byte_identity():
    """Compares two directories given by environment variables DATA_A and
    DATA_B (not run when unset). Per RAW ARCHIVE AND REBUILD: 'Rebuild
    output must be byte-identical to the original.'"""
    data_a = os.environ.get("DATA_A")
    data_b = os.environ.get("DATA_B")
    if not data_a or not data_b:
        pytest.skip("not run: DATA_A and DATA_B environment variables are unset")
    a_path, b_path = Path(data_a), Path(data_b)
    assert a_path.is_dir(), f"DATA_A does not exist or is not a directory: {a_path}"
    assert b_path.is_dir(), f"DATA_B does not exist or is not a directory: {b_path}"

    a_files = {p.relative_to(a_path) for p in a_path.rglob("*") if p.is_file()}
    b_files = {p.relative_to(b_path) for p in b_path.rglob("*") if p.is_file()}
    only_a = sorted(str(p) for p in (a_files - b_files))
    only_b = sorted(str(p) for p in (b_files - a_files))
    assert not only_a, f"files only in DATA_A: {only_a[:20]}"
    assert not only_b, f"files only in DATA_B: {only_b[:20]}"

    mismatches = []
    for rel in sorted(a_files):
        if not filecmp.cmp(a_path / rel, b_path / rel, shallow=False):
            mismatches.append(str(rel))
    assert not mismatches, f"byte-identity mismatches: {mismatches[:20]}"
