"""Tests for the staged-build environment variable overrides documented
in the tests/conftest.py module docstring and reports/tests/test_list.md:
DATA_DIR, RAW_DIR, VALIDATION_CSV. All run now (pure logic against
tmp_path and monkeypatch, no dependency on data/ or reports/pipeline/
existing).

Test ids: test_ovr01_* .. test_ovr08_*
"""

from pathlib import Path

import pytest

import conftest
from conftest import discover_snapshot_dir, require_validation_csv, resolve_raw_dir


def test_ovr01_data_dir_override_used_when_set(tmp_path, monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    path, reason = discover_snapshot_dir()
    assert path == tmp_path
    assert reason is None


def test_ovr02_data_dir_override_missing_directory_reports_reason(tmp_path, monkeypatch):
    missing = tmp_path / "does-not-exist"
    monkeypatch.setenv("DATA_DIR", str(missing))
    path, reason = discover_snapshot_dir()
    assert path is None
    assert "DATA_DIR" in reason
    assert str(missing) in reason


def test_ovr03_data_dir_no_override_falls_back_to_default_discovery(monkeypatch):
    """With DATA_DIR unset, discovery falls back to scanning ROOT/data/,
    which does not exist in this checkout at test-authoring time (step 3
    not run), so this documents the unchanged default-path behavior."""
    monkeypatch.delenv("DATA_DIR", raising=False)
    path, reason = discover_snapshot_dir()
    if conftest.DATA_DIR.is_dir():
        pytest.skip("not run: data/ now exists in this checkout; default-path branch covered elsewhere")
    assert path is None
    assert reason == "data/ directory does not exist yet (step 3 not run)"


def test_ovr04_raw_dir_override_used_regardless_of_data_dir_name(monkeypatch):
    monkeypatch.setenv("RAW_DIR", "/staged/raw/build")
    result = resolve_raw_dir(Path("/anything/20260101T000000Z-0123456789ab"))
    assert result == Path("/staged/raw/build")


def test_ovr05_raw_dir_no_override_derives_from_data_dir_name(monkeypatch):
    monkeypatch.delenv("RAW_DIR", raising=False)
    data_dir_path = conftest.ROOT / "data" / "20260101T000000Z-0123456789ab"
    result = resolve_raw_dir(data_dir_path)
    assert result == conftest.ROOT / "raw" / "20260101T000000Z-0123456789ab"


def test_ovr06_validation_csv_override_used_when_file_exists(tmp_path, monkeypatch):
    staged_csv = tmp_path / "staged_validation.csv"
    staged_csv.write_text("snapshot_id,year\n", encoding="utf-8")
    monkeypatch.setenv("VALIDATION_CSV", str(staged_csv))
    result = require_validation_csv()
    assert result == staged_csv


def test_ovr07_validation_csv_override_missing_file_skips_with_reason(tmp_path, monkeypatch):
    missing_csv = tmp_path / "does-not-exist.csv"
    monkeypatch.setenv("VALIDATION_CSV", str(missing_csv))
    with pytest.raises(pytest.skip.Exception) as excinfo:
        require_validation_csv()
    assert "VALIDATION_CSV" in str(excinfo.value)
    assert str(missing_csv) in str(excinfo.value)


def test_ovr08_validation_csv_no_override_falls_back_to_default_path(monkeypatch):
    """With VALIDATION_CSV unset, behavior is unchanged: reads
    ROOT/reports/pipeline/validation.csv if present, else skips with the
    original reason."""
    monkeypatch.delenv("VALIDATION_CSV", raising=False)
    default_path = conftest.ROOT / "reports" / "pipeline" / "validation.csv"
    if default_path.exists():
        result = require_validation_csv()
        assert result == default_path
    else:
        with pytest.raises(pytest.skip.Exception) as excinfo:
            require_validation_csv()
        assert "reports/pipeline/validation.csv" in str(excinfo.value)
