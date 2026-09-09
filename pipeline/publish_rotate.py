"""
Publish rotation and release archiving (BUILD ORDER step 5, owner
instruction, hardened). Every function takes an explicit `root: Path` so
tests can point the whole module at a temporary directory and never touch
the real data/ or raw/.

Two independent operations:

- `cmd_release(root, snapshot_id)`: build and verify a release zip for one
  snapshot (published files, raw manifest.json, validation.csv when
  present), write a sha256 sidecar, verify it locally by unzipping to a
  temp dir and comparing every file's sha256 against its source, and (when
  a git remote named origin exists and `gh auth status` succeeds) upload
  it to a GitHub Release tagged snapshot-<id> and verify by downloading
  the asset back and comparing its sha256 against the sidecar. Never
  removes anything. This is `make release SNAPSHOT=<id>`.

- `cmd_rotate(root, new_id)`: after new_id has already been promoted to
  data/<new_id>/, find the one other snapshot under data/ (old_id) and
  retire it. Before removing data/<old_id>/, it must pass BOTH
  verifications above (local zip verification, and the upload plus
  download-back verification). If the zip verification, the upload, or
  the download-back fails, or if there is no remote at all, the previous
  snapshot is preserved, the reason is written to publish_log.csv, and
  the command exits non-zero (the newly published snapshot is unaffected
  either way). Only after both verifications pass is data/<old_id>/
  removed and the rotation logged as removed.

Nothing here ever writes to data/<new_id>/ or to any raw/ directory
(raw/<old_id>/manifest.json is read only, never written).

Usage:
    .venv/bin/python3 pipeline/publish_rotate.py <new_id> [--dry-run]
    .venv/bin/python3 pipeline/publish_rotate.py --release <snapshot_id>
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import shutil
import subprocess
import sys
import tempfile
import zipfile
from dataclasses import dataclass
from pathlib import Path

DEFAULT_ROOT = Path(".")

PUBLISH_LOG_COLUMNS = ["published_id", "removed_id", "timestamp_from_manifest", "status", "reason"]


# ---------------------------------------------------------------------------
# Paths, derived from an explicit root (never a hardcoded global) so tests
# can run entirely inside a temporary directory.
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class Paths:
    root: Path

    @property
    def data_dir(self) -> Path:
        return self.root / "data"

    @property
    def raw_dir(self) -> Path:
        return self.root / "raw"

    @property
    def reports_dir(self) -> Path:
        return self.root / "reports" / "pipeline"

    @property
    def releases_dir(self) -> Path:
        return self.reports_dir / "releases"

    @property
    def publish_log(self) -> Path:
        return self.reports_dir / "publish_log.csv"

    @property
    def validation_csv(self) -> Path:
        return self.reports_dir / "validation.csv"

    def snapshot_dir(self, snapshot_id: str) -> Path:
        return self.data_dir / snapshot_id

    def raw_manifest(self, snapshot_id: str) -> Path:
        return self.raw_dir / snapshot_id / "manifest.json"

    def zip_path(self, snapshot_id: str) -> Path:
        return self.releases_dir / f"{snapshot_id}.zip"

    def sidecar_path(self, snapshot_id: str) -> Path:
        return self.releases_dir / f"{snapshot_id}.zip.sha256"


def sha256_of_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def sha256_of_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


# ---------------------------------------------------------------------------
# Build and verify a release zip for one snapshot
# ---------------------------------------------------------------------------

def build_release_zip(paths: Paths, snapshot_id: str) -> Path:
    """Zip published files (data/<id>/) plus raw/<id>/manifest.json (as
    raw_manifest.json) plus reports/pipeline/validation.csv (as
    validation.csv) when present. Deterministic: files sorted by relative
    path. Writes the sha256 sidecar alongside the zip."""
    snapshot_dir = paths.snapshot_dir(snapshot_id)
    if not snapshot_dir.is_dir():
        raise RuntimeError(f"published snapshot not found: {snapshot_dir}")
    manifest_path = paths.raw_manifest(snapshot_id)
    if not manifest_path.exists():
        raise RuntimeError(f"raw manifest not found: {manifest_path}")

    paths.releases_dir.mkdir(parents=True, exist_ok=True)
    zip_path = paths.zip_path(snapshot_id)
    if zip_path.exists():
        zip_path.unlink()

    file_list = sorted(p for p in snapshot_dir.rglob("*") if p.is_file())
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for p in file_list:
            zf.write(p, arcname=str(p.relative_to(snapshot_dir)))
        zf.write(manifest_path, arcname="raw_manifest.json")
        if paths.validation_csv.exists():
            zf.write(paths.validation_csv, arcname="validation.csv")

    sidecar_path = paths.sidecar_path(snapshot_id)
    sidecar_path.write_text(sha256_of_file(zip_path) + "  " + zip_path.name + "\n")
    return zip_path


def verify_zip_locally(paths: Paths, snapshot_id: str, zip_path: Path) -> tuple[bool, str]:
    """Unzip to a temp dir and compare every file's sha256 against its
    source: published files against data/<id>/, raw_manifest.json against
    raw/<id>/manifest.json, validation.csv against
    reports/pipeline/validation.csv when the zip has one."""
    snapshot_dir = paths.snapshot_dir(snapshot_id)
    manifest_path = paths.raw_manifest(snapshot_id)
    with tempfile.TemporaryDirectory(prefix="us-trade-verify-") as tmp:
        tmp_path = Path(tmp)
        try:
            with zipfile.ZipFile(zip_path) as zf:
                zf.extractall(tmp_path)
        except (zipfile.BadZipFile, OSError) as exc:
            return False, f"zip could not be opened/extracted: {exc}"

        mismatches = []
        published_files = sorted(p for p in snapshot_dir.rglob("*") if p.is_file())
        for src in published_files:
            rel = src.relative_to(snapshot_dir)
            extracted = tmp_path / rel
            if not extracted.exists():
                mismatches.append(f"missing from zip: {rel}")
                continue
            if sha256_of_file(src) != sha256_of_file(extracted):
                mismatches.append(f"sha256 mismatch: {rel}")

        extracted_manifest = tmp_path / "raw_manifest.json"
        if not extracted_manifest.exists():
            mismatches.append("missing from zip: raw_manifest.json")
        elif sha256_of_file(extracted_manifest) != sha256_of_file(manifest_path):
            mismatches.append("sha256 mismatch: raw_manifest.json")

        extracted_validation = tmp_path / "validation.csv"
        if paths.validation_csv.exists():
            if not extracted_validation.exists():
                mismatches.append("missing from zip: validation.csv")
            elif sha256_of_file(extracted_validation) != sha256_of_file(paths.validation_csv):
                mismatches.append("sha256 mismatch: validation.csv")

        if mismatches:
            return False, "local zip verification failed: " + "; ".join(mismatches)
        return True, f"local zip verification passed ({len(published_files)} published files + raw_manifest.json)"


# ---------------------------------------------------------------------------
# GitHub release upload and download-back verification
# ---------------------------------------------------------------------------

def gh_available(paths: Paths) -> bool:
    try:
        remote = subprocess.run(["git", "-C", str(paths.root), "remote", "get-url", "origin"],
                                 capture_output=True, text=True, timeout=10)
        if remote.returncode != 0:
            return False
        auth = subprocess.run(["gh", "auth", "status"], capture_output=True, text=True, timeout=10)
        return auth.returncode == 0
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return False


def gh_create_command(snapshot_id: str, zip_path: Path) -> list[str]:
    return ["gh", "release", "create", f"snapshot-{snapshot_id}", str(zip_path),
            "--title", f"snapshot-{snapshot_id}",
            "--notes", f"US goods trade partner visualization, snapshot {snapshot_id}."]


def gh_upload_command(snapshot_id: str, zip_path: Path) -> list[str]:
    return ["gh", "release", "upload", f"snapshot-{snapshot_id}", str(zip_path), "--clobber"]


def upload_release(paths: Paths, snapshot_id: str, zip_path: Path) -> tuple[bool, str]:
    exists = subprocess.run(["gh", "release", "view", f"snapshot-{snapshot_id}"],
                             capture_output=True, text=True)
    cmd = gh_create_command(snapshot_id, zip_path) if exists.returncode != 0 else gh_upload_command(snapshot_id, zip_path)
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        return False, f"gh upload failed (exit {result.returncode}): {result.stderr.strip() or result.stdout.strip()}"
    return True, f"uploaded to release snapshot-{snapshot_id}"


def download_and_verify(paths: Paths, snapshot_id: str, zip_path: Path, sidecar_path: Path) -> tuple[bool, str]:
    expected_sha = sidecar_path.read_text().split()[0]
    with tempfile.TemporaryDirectory(prefix="us-trade-download-") as tmp:
        tmp_path = Path(tmp)
        result = subprocess.run(
            ["gh", "release", "download", f"snapshot-{snapshot_id}",
             "--pattern", zip_path.name, "--dir", str(tmp_path), "--clobber"],
            capture_output=True, text=True)
        if result.returncode != 0:
            return False, f"gh download failed (exit {result.returncode}): {result.stderr.strip() or result.stdout.strip()}"
        downloaded = tmp_path / zip_path.name
        if not downloaded.exists():
            return False, f"downloaded asset not found at {downloaded}"
        actual_sha = sha256_of_file(downloaded)
        if actual_sha != expected_sha:
            return False, f"downloaded asset sha256 mismatch: expected {expected_sha}, got {actual_sha}"
        return True, "download-back verification passed"


# ---------------------------------------------------------------------------
# publish_log.csv
# ---------------------------------------------------------------------------

def append_publish_log(paths: Paths, published_id: str, removed_id: str, timestamp: str,
                        status: str, reason: str) -> None:
    is_new = not paths.publish_log.exists()
    paths.publish_log.parent.mkdir(parents=True, exist_ok=True)
    with open(paths.publish_log, "a", newline="") as f:
        w = csv.writer(f)
        if is_new:
            w.writerow(PUBLISH_LOG_COLUMNS)
        w.writerow([published_id, removed_id, timestamp, status, reason])


def manifest_timestamp(paths: Paths, snapshot_id: str) -> str:
    manifest_path = paths.raw_manifest(snapshot_id)
    manifest = json.loads(manifest_path.read_text())
    return manifest["acquisition_start"]


def find_previous_snapshot(paths: Paths, new_id: str) -> str | None:
    if not paths.data_dir.is_dir():
        return None
    others = sorted(p.name for p in paths.data_dir.iterdir() if p.is_dir() and p.name != new_id)
    if not others:
        return None
    if len(others) > 1:
        raise RuntimeError(
            f"expected at most one previous snapshot under data/ besides {new_id}, "
            f"found {others}; refusing to guess which one to rotate out")
    return others[0]


# ---------------------------------------------------------------------------
# make release SNAPSHOT=<id>: build and verify only, never removes
# ---------------------------------------------------------------------------

def cmd_release(root: Path, snapshot_id: str) -> int:
    paths = Paths(root)
    print(f"[release] building release zip for {snapshot_id}")
    zip_path = build_release_zip(paths, snapshot_id)
    sidecar_path = paths.sidecar_path(snapshot_id)
    ok, reason = verify_zip_locally(paths, snapshot_id, zip_path)
    print(f"[release] {reason}")
    if not ok:
        print(f"[release] FAILED: {reason}")
        return 1

    if not gh_available(paths):
        print(f"[release] no git remote named origin, or gh is not authenticated; "
              f"the zip is left at {zip_path}. Run this command later once a remote "
              "and gh auth are set up:")
        print("  " + " ".join(gh_create_command(snapshot_id, zip_path)))
        return 0

    up_ok, up_reason = upload_release(paths, snapshot_id, zip_path)
    print(f"[release] {up_reason}")
    if not up_ok:
        return 1
    dl_ok, dl_reason = download_and_verify(paths, snapshot_id, zip_path, sidecar_path)
    print(f"[release] {dl_reason}")
    if not dl_ok:
        return 1
    print(f"[release] {snapshot_id} built, verified locally, uploaded, and verified by download-back")
    return 0


# ---------------------------------------------------------------------------
# rotation: retire the previous snapshot after a new one is promoted
# ---------------------------------------------------------------------------

def cmd_rotate(root: Path, new_id: str, dry_run: bool = False) -> int:
    paths = Paths(root)
    if not dry_run and not paths.snapshot_dir(new_id).is_dir():
        raise SystemExit(f"data/{new_id}/ does not exist; publish rotation runs only "
                          f"after the new snapshot has already been promoted there")

    old_id = find_previous_snapshot(paths, new_id)
    if old_id is None:
        msg = f"no previous snapshot found under data/ other than the current one ({new_id})"
        print(f"[publish_rotate] {msg}; nothing to remove, zip, or release")
        if dry_run:
            print(f"[publish_rotate] DRY RUN would append to {paths.publish_log}: "
                  f"published_id={new_id}, removed_id=, timestamp_from_manifest=, "
                  f"status=none, reason={msg!r}")
        else:
            append_publish_log(paths, new_id, "", "", "none", msg)
        return 0

    print(f"[publish_rotate] rotating out previous snapshot {old_id} (new snapshot: {new_id})")

    if dry_run:
        zip_path = paths.zip_path(old_id)
        sidecar_path = paths.sidecar_path(old_id)
        old_dir = paths.snapshot_dir(old_id)
        file_count = sum(1 for p in old_dir.rglob("*") if p.is_file()) if old_dir.is_dir() else 0
        print(f"[publish_rotate] DRY RUN would zip {file_count} published files from "
              f"data/{old_id}/ plus raw/{old_id}/manifest.json"
              + (" plus reports/pipeline/validation.csv" if paths.validation_csv.exists() else "")
              + f" into {zip_path}, with a sha256 sidecar at {sidecar_path}")
        print(f"[publish_rotate] DRY RUN would verify the zip locally (unzip + sha256 compare "
              f"against data/{old_id}/, raw_manifest.json, and validation.csv)")
        print(f"[publish_rotate] DRY RUN would check for a git remote named origin and "
              f"`gh auth status`; if both succeed, would upload to release snapshot-{old_id} "
              f"and verify by downloading the asset back and comparing its sha256 against the "
              f"sidecar; otherwise removal would NOT proceed (no remote is now a blocking "
              f"condition, not a soft skip)")
        print(f"[publish_rotate] DRY RUN: only if both verifications pass would data/{old_id}/ "
              f"be removed and the rotation logged as removed; otherwise data/{old_id}/ would "
              f"be preserved and the rotation logged as preserved with the reason")
        return 0

    timestamp = manifest_timestamp(paths, old_id)

    zip_path = build_release_zip(paths, old_id)
    sidecar_path = paths.sidecar_path(old_id)

    local_ok, local_reason = verify_zip_locally(paths, old_id, zip_path)
    print(f"[publish_rotate] {local_reason}")
    if not local_ok:
        append_publish_log(paths, new_id, old_id, timestamp, "preserved", local_reason)
        print(f"[publish_rotate] FAILED: {local_reason}. data/{old_id}/ is preserved.")
        return 1

    if not gh_available(paths):
        reason = "no git remote named origin, or gh is not authenticated"
        append_publish_log(paths, new_id, old_id, timestamp, "preserved", reason)
        print(f"[publish_rotate] FAILED: {reason}. data/{old_id}/ is preserved. "
              f"The verified zip is left at {zip_path}; run this command later once a "
              "remote and gh auth are set up, then re-run rotation:")
        print("  " + " ".join(gh_create_command(old_id, zip_path)))
        return 1

    up_ok, up_reason = upload_release(paths, old_id, zip_path)
    print(f"[publish_rotate] {up_reason}")
    if not up_ok:
        append_publish_log(paths, new_id, old_id, timestamp, "preserved", up_reason)
        print(f"[publish_rotate] FAILED: {up_reason}. data/{old_id}/ is preserved.")
        return 1

    dl_ok, dl_reason = download_and_verify(paths, old_id, zip_path, sidecar_path)
    print(f"[publish_rotate] {dl_reason}")
    if not dl_ok:
        append_publish_log(paths, new_id, old_id, timestamp, "preserved", dl_reason)
        print(f"[publish_rotate] FAILED: {dl_reason}. data/{old_id}/ is preserved.")
        return 1

    shutil.rmtree(paths.snapshot_dir(old_id))
    append_publish_log(paths, new_id, old_id, timestamp, "removed",
                        "both verifications passed (local zip, upload+download-back)")
    print(f"[publish_rotate] done: published={new_id} removed={old_id}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("new_id", nargs="?")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--release", metavar="SNAPSHOT_ID",
                         help="build and verify a release zip for one snapshot, no removal")
    parser.add_argument("--root", default=str(DEFAULT_ROOT),
                         help="project root (tests point this at a temp directory)")
    args = parser.parse_args()
    root = Path(args.root)

    if args.release:
        return cmd_release(root, args.release)
    if not args.new_id:
        raise SystemExit("usage: publish_rotate.py <new_id> [--dry-run] | --release SNAPSHOT_ID")
    return cmd_rotate(root, args.new_id, dry_run=args.dry_run)


if __name__ == "__main__":
    sys.exit(main())
