"""
Tests for pipeline/publish_rotate.py, owned by Agent A. Every test builds
its own temporary fixture root (two fake snapshots, a fake git repo with
an origin remote, and a fake `gh` executable on PATH) and passes that root
explicitly to publish_rotate's functions, so nothing here ever touches the
real project's data/ or raw/.

Run: .venv/bin/python3 -m pytest pipeline/tests_rotation/ -v
"""

from __future__ import annotations

import csv
import json
import os
import stat
import subprocess
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import publish_rotate  # noqa: E402

FAKE_GH_SCRIPT = Path(__file__).resolve().parent / "fake_gh.py"


# ---------------------------------------------------------------------------
# Fixture helpers
# ---------------------------------------------------------------------------

def _write_json(path: Path, obj) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, indent=2, sort_keys=True) + "\n")


def make_fake_snapshot(root: Path, snapshot_id: str, acquisition_start: str, n_files: int = 3) -> None:
    """A minimal published snapshot (data/<id>/) plus its raw manifest
    (raw/<id>/manifest.json), enough for build_release_zip/verify to work
    against."""
    data_dir = root / "data" / snapshot_id
    for i in range(n_files):
        _write_json(data_dir / f"file{i}.json", {"snapshot_id": snapshot_id, "n": i})
    _write_json(root / "raw" / snapshot_id / "manifest.json", {
        "acquisition_start": acquisition_start,
        "acquisition_end": acquisition_start,
        "fingerprint_match": True,
    })


def init_fake_git_remote(root: Path) -> None:
    subprocess.run(["git", "init", "-q", str(root)], check=True)
    subprocess.run(["git", "-C", str(root), "remote", "add", "origin",
                     "https://example.invalid/fake/repo.git"], check=True)


@pytest.fixture
def fake_gh_path(tmp_path):
    """A directory containing an executable named `gh` (a thin wrapper
    around fake_gh.py) to prepend to PATH."""
    bin_dir = tmp_path / "fakebin"
    bin_dir.mkdir()
    gh_path = bin_dir / "gh"
    gh_path.write_text(f"#!/bin/sh\nexec {sys.executable} {FAKE_GH_SCRIPT} \"$@\"\n")
    gh_path.chmod(gh_path.stat().st_mode | stat.S_IEXEC | stat.S_IXGRP | stat.S_IXOTH)
    return bin_dir


@pytest.fixture
def env_with_fake_gh(fake_gh_path, tmp_path, monkeypatch):
    storage = tmp_path / "fake_gh_storage"
    monkeypatch.setenv("PATH", str(fake_gh_path) + os.pathsep + os.environ["PATH"])
    monkeypatch.setenv("FAKE_GH_STORAGE", str(storage))
    monkeypatch.delenv("FAKE_GH_AUTH_FAIL", raising=False)
    monkeypatch.delenv("FAKE_GH_UPLOAD_FAIL", raising=False)
    monkeypatch.delenv("FAKE_GH_DOWNLOAD_FAIL", raising=False)
    return storage


def read_publish_log(root: Path) -> list[dict]:
    path = root / "reports" / "pipeline" / "publish_log.csv"
    if not path.exists():
        return []
    with open(path, newline="") as f:
        return list(csv.DictReader(f))


# ---------------------------------------------------------------------------
# 1. Real rotation: proves zip, sidecar, local verification, remote
#    upload+download-back verification, removal, and the log.
# ---------------------------------------------------------------------------

def test_real_rotation_removes_and_logs(tmp_path, env_with_fake_gh):
    root = tmp_path / "proj"
    init_fake_git_remote(root)
    make_fake_snapshot(root, "OLD1", "2026-01-01T00:00:00+00:00")
    make_fake_snapshot(root, "NEW1", "2026-02-01T00:00:00+00:00")

    exit_code = publish_rotate.cmd_rotate(root, "NEW1")

    assert exit_code == 0
    # new snapshot untouched
    assert (root / "data" / "NEW1").is_dir()
    assert (root / "raw" / "NEW1").is_dir()
    # old snapshot removed from data/, raw/ untouched
    assert not (root / "data" / "OLD1").exists()
    assert (root / "raw" / "OLD1" / "manifest.json").exists()
    # zip and sidecar exist
    zip_path = root / "reports" / "pipeline" / "releases" / "OLD1.zip"
    sidecar_path = root / "reports" / "pipeline" / "releases" / "OLD1.zip.sha256"
    assert zip_path.exists()
    assert sidecar_path.exists()
    recorded_sha = sidecar_path.read_text().split()[0]
    assert recorded_sha == publish_rotate.sha256_of_file(zip_path)
    # log has one "removed" row
    rows = read_publish_log(root)
    assert len(rows) == 1
    assert rows[0]["published_id"] == "NEW1"
    assert rows[0]["removed_id"] == "OLD1"
    assert rows[0]["status"] == "removed"
    assert rows[0]["timestamp_from_manifest"] == "2026-01-01T00:00:00+00:00"


# ---------------------------------------------------------------------------
# 2. Archive (local zip) failure: preserves, exits non-zero, logs the
#    reason. Corrupts the built zip before verification runs.
# ---------------------------------------------------------------------------

def test_archive_failure_preserves(tmp_path, env_with_fake_gh, monkeypatch):
    root = tmp_path / "proj"
    init_fake_git_remote(root)
    make_fake_snapshot(root, "OLD2", "2026-01-02T00:00:00+00:00")
    make_fake_snapshot(root, "NEW2", "2026-02-02T00:00:00+00:00")

    real_build = publish_rotate.build_release_zip

    def corrupting_build(paths, snapshot_id):
        zip_path = real_build(paths, snapshot_id)
        with open(zip_path, "r+b") as f:
            f.truncate(5)  # not a valid zip anymore
        return zip_path

    monkeypatch.setattr(publish_rotate, "build_release_zip", corrupting_build)

    exit_code = publish_rotate.cmd_rotate(root, "NEW2")

    assert exit_code == 1
    assert (root / "data" / "OLD2").is_dir()  # preserved
    assert (root / "data" / "NEW2").is_dir()  # new snapshot unaffected
    rows = read_publish_log(root)
    assert len(rows) == 1
    assert rows[0]["status"] == "preserved"
    assert "zip" in rows[0]["reason"].lower() or "extract" in rows[0]["reason"].lower()


# ---------------------------------------------------------------------------
# 3. Upload failure (fake gh returns non-zero): preserves, exits non-zero.
# ---------------------------------------------------------------------------

def test_upload_failure_preserves(tmp_path, env_with_fake_gh, monkeypatch):
    root = tmp_path / "proj"
    init_fake_git_remote(root)
    make_fake_snapshot(root, "OLD3", "2026-01-03T00:00:00+00:00")
    make_fake_snapshot(root, "NEW3", "2026-02-03T00:00:00+00:00")
    monkeypatch.setenv("FAKE_GH_UPLOAD_FAIL", "1")

    exit_code = publish_rotate.cmd_rotate(root, "NEW3")

    assert exit_code == 1
    assert (root / "data" / "OLD3").is_dir()  # preserved
    rows = read_publish_log(root)
    assert len(rows) == 1
    assert rows[0]["status"] == "preserved"
    assert "upload" in rows[0]["reason"].lower()


def test_download_back_failure_preserves(tmp_path, env_with_fake_gh, monkeypatch):
    root = tmp_path / "proj"
    init_fake_git_remote(root)
    make_fake_snapshot(root, "OLD3B", "2026-01-03T00:00:00+00:00")
    make_fake_snapshot(root, "NEW3B", "2026-02-03T00:00:00+00:00")
    monkeypatch.setenv("FAKE_GH_DOWNLOAD_FAIL", "1")

    exit_code = publish_rotate.cmd_rotate(root, "NEW3B")

    assert exit_code == 1
    assert (root / "data" / "OLD3B").is_dir()  # preserved
    rows = read_publish_log(root)
    assert rows[-1]["status"] == "preserved"
    assert "download" in rows[-1]["reason"].lower()


def test_no_remote_preserves(tmp_path, monkeypatch):
    # no git remote initialized at all, and no fake gh on PATH beyond
    # whatever real gh may or may not exist; gh_available() must return
    # False because there is no origin remote, regardless of gh itself.
    root = tmp_path / "proj"
    subprocess.run(["git", "init", "-q", str(root)], check=True)
    make_fake_snapshot(root, "OLD4", "2026-01-04T00:00:00+00:00")
    make_fake_snapshot(root, "NEW4", "2026-02-04T00:00:00+00:00")

    exit_code = publish_rotate.cmd_rotate(root, "NEW4")

    assert exit_code == 1
    assert (root / "data" / "OLD4").is_dir()  # preserved
    rows = read_publish_log(root)
    assert rows[-1]["status"] == "preserved"
    assert "remote" in rows[-1]["reason"].lower() or "auth" in rows[-1]["reason"].lower()


# ---------------------------------------------------------------------------
# 4. Dry run: no filesystem changes at all, reports what it would do.
# ---------------------------------------------------------------------------

def test_dry_run_no_changes(tmp_path, env_with_fake_gh, capsys):
    root = tmp_path / "proj"
    init_fake_git_remote(root)
    make_fake_snapshot(root, "OLD5", "2026-01-05T00:00:00+00:00")
    make_fake_snapshot(root, "NEW5", "2026-02-05T00:00:00+00:00")

    exit_code = publish_rotate.cmd_rotate(root, "NEW5", dry_run=True)

    assert exit_code == 0
    assert (root / "data" / "OLD5").is_dir()  # untouched
    assert (root / "data" / "NEW5").is_dir()
    assert not (root / "reports" / "pipeline" / "releases").exists()
    assert not (root / "reports" / "pipeline" / "publish_log.csv").exists()
    out = capsys.readouterr().out
    assert "DRY RUN" in out


def test_dry_run_nothing_to_rotate(tmp_path, env_with_fake_gh):
    root = tmp_path / "proj"
    init_fake_git_remote(root)
    make_fake_snapshot(root, "ONLY1", "2026-01-06T00:00:00+00:00")

    exit_code = publish_rotate.cmd_rotate(root, "ONLY1", dry_run=True)

    assert exit_code == 0
    assert (root / "data" / "ONLY1").is_dir()
    assert not (root / "reports" / "pipeline" / "publish_log.csv").exists()


# ---------------------------------------------------------------------------
# make release (cmd_release): build, verify, upload, verify download-back,
# never removes anything.
# ---------------------------------------------------------------------------

def test_release_builds_and_verifies_without_removing(tmp_path, env_with_fake_gh):
    root = tmp_path / "proj"
    init_fake_git_remote(root)
    make_fake_snapshot(root, "REL1", "2026-01-07T00:00:00+00:00")

    exit_code = publish_rotate.cmd_release(root, "REL1")

    assert exit_code == 0
    assert (root / "data" / "REL1").is_dir()  # never removed
    zip_path = root / "reports" / "pipeline" / "releases" / "REL1.zip"
    assert zip_path.exists()
    assert (root / "reports" / "pipeline" / "releases" / "REL1.zip.sha256").exists()


def test_release_no_remote_still_builds_locally(tmp_path):
    root = tmp_path / "proj"
    subprocess.run(["git", "init", "-q", str(root)], check=True)
    make_fake_snapshot(root, "REL2", "2026-01-08T00:00:00+00:00")

    exit_code = publish_rotate.cmd_release(root, "REL2")

    assert exit_code == 0  # no remote is not a failure for the non-destructive release command
    zip_path = root / "reports" / "pipeline" / "releases" / "REL2.zip"
    assert zip_path.exists()
    assert (root / "data" / "REL2").is_dir()
