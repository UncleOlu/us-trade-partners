"""
Publish rotation and release archiving (BUILD ORDER step 5, owner
instruction, hardened). Every function takes an explicit `root: Path` so
tests can point the whole module at a temporary directory and never touch
the real data/ or raw/.

Release archives have fixed ZIP timestamps and sorted names. The built
ZIP holds data at its root, the raw manifest, and validation rows only
when they belong to this snapshot. A separate raw ZIP holds every saved
request and response under raw/<snapshot_id>/. Both get SHA256 sidecars.

The snapshot id identifies raw acquisition. The immutable release tag
adds the pipeline commit and built ZIP checksum. Existing remote assets
are never overwritten. Rotation removes only the prior built snapshot,
and only after both archives pass local and remote download checks.
Raw directories and the new snapshot remain unchanged.

Usage:
    .venv/bin/python3 pipeline/publish_rotate.py <new_id> [--dry-run]
    .venv/bin/python3 pipeline/publish_rotate.py --release <snapshot_id>
"""

from __future__ import annotations

import argparse
import os
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

DEFAULT_ROOT = Path(os.environ.get("US_TRADE_ROOT", str(Path(__file__).resolve().parents[1])))

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

def release_sources(paths: Paths, snapshot_id: str) -> dict[str, Path]:
    snapshot = paths.snapshot_dir(snapshot_id)
    if not snapshot.is_dir() or not paths.raw_manifest(snapshot_id).is_file():
        raise RuntimeError(f"snapshot or raw manifest missing for {snapshot_id}")
    sources = {p.relative_to(snapshot).as_posix(): p
               for p in snapshot.rglob("*") if p.is_file()}
    sources["raw_manifest.json"] = paths.raw_manifest(snapshot_id)
    # The current validation report can belong to a newer snapshot during
    # rotation. Never label that report as evidence for the old snapshot.
    if paths.validation_csv.exists():
        with paths.validation_csv.open(newline="") as f:
            ids = {row["snapshot_id"] for row in csv.DictReader(f)}
        if ids == {snapshot_id}:
            sources["validation.csv"] = paths.validation_csv
    return sources


def raw_sources(paths: Paths, snapshot_id: str) -> dict[str, Path]:
    base = paths.raw_dir / snapshot_id
    manifest = json.loads(paths.raw_manifest(snapshot_id).read_text())
    if not manifest.get("files"):
        raise RuntimeError("raw manifest has no file entries")
    # Validate every manifest entry before claiming full raw preservation.
    for entry in manifest.get("files", []):
        rel = Path(entry["path"])
        if rel.is_absolute() or ".." in rel.parts:
            raise RuntimeError("unsafe raw manifest path")
        source = base / rel
        if not source.is_file() or sha256_of_file(source) != entry["sha256"]:
            raise RuntimeError(f"raw manifest checksum mismatch: {rel.as_posix()}")
    return {p.relative_to(paths.root).as_posix(): p
            for p in base.rglob("*") if p.is_file()}


def write_archive(destination: Path, sources: dict[str, Path]) -> None:
    temporary = destination.with_suffix(destination.suffix + ".tmp")
    try:
        with zipfile.ZipFile(temporary, "w", zipfile.ZIP_DEFLATED) as zf:
            for name, source in sorted(sources.items()):
                info = zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
                info.compress_type = zipfile.ZIP_DEFLATED
                info.external_attr = 0o100644 << 16
                zf.writestr(info, source.read_bytes())
        temporary.replace(destination)
    finally:
        temporary.unlink(missing_ok=True)
    destination.with_suffix(destination.suffix + ".sha256").write_text(
        sha256_of_file(destination) + "  " + destination.name + "\n")


def raw_zip_path(paths: Paths, snapshot_id: str) -> Path:
    return paths.releases_dir / f"{snapshot_id}.raw.zip"


def release_descriptor(paths: Paths, snapshot_id: str, zip_path: Path) -> dict:
    meta_path = paths.snapshot_dir(snapshot_id) / "meta.json"
    commit = json.loads(meta_path.read_text())["code_commit"]
    checksum = sha256_of_file(zip_path)
    raw_path = raw_zip_path(paths, snapshot_id)
    return {"snapshot_id": snapshot_id, "pipeline_commit": commit,
            "tag": f"build-{snapshot_id}-{commit[:12]}-{checksum[:12]}",
            "asset": zip_path.name, "sha256": checksum,
            "raw_asset": raw_path.name, "raw_sha256": sha256_of_file(raw_path),
            "archive_scope": "built data plus separate complete raw acquisition"}


def build_release_zip(paths: Paths, snapshot_id: str) -> Path:
    paths.releases_dir.mkdir(parents=True, exist_ok=True)
    built = release_sources(paths, snapshot_id)
    raw = raw_sources(paths, snapshot_id)
    zip_path = paths.zip_path(snapshot_id)
    write_archive(zip_path, built)
    write_archive(raw_zip_path(paths, snapshot_id), raw)
    descriptor = release_descriptor(paths, snapshot_id, zip_path)
    (paths.releases_dir / f"{snapshot_id}.release.json").write_text(
        json.dumps(descriptor, sort_keys=True, indent=2) + "\n")
    return zip_path


def verify_archive(zip_path: Path, sources: dict[str, Path]) -> tuple[bool, str]:
    try:
        with zipfile.ZipFile(zip_path) as zf:
            if len(zf.namelist()) != len(sources) or set(zf.namelist()) != set(sources):
                return False, "zip member list differs from source files"
            for name, source in sorted(sources.items()):
                if sha256_of_bytes(zf.read(name)) != sha256_of_file(source):
                    return False, f"zip checksum mismatch: {name}"
    except (zipfile.BadZipFile, OSError) as exc:
        return False, f"zip verification failed: {type(exc).__name__}"
    return True, f"zip verified: {len(sources)} files"


def verify_zip_locally(paths: Paths, snapshot_id: str, zip_path: Path) -> tuple[bool, str]:
    for archive, sources in [(zip_path, release_sources(paths, snapshot_id)),
                             (raw_zip_path(paths, snapshot_id), raw_sources(paths, snapshot_id))]:
        ok, reason = verify_archive(archive, sources)
        if not ok:
            return ok, reason
    return True, "local built and complete raw zip verification passed"


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
    descriptor = json.loads((zip_path.parent / f"{snapshot_id}.release.json").read_text())
    assets = [zip_path, zip_path.with_suffix(".zip.sha256"),
              zip_path.parent / descriptor["raw_asset"],
              zip_path.parent / (descriptor["raw_asset"] + ".sha256"),
              zip_path.parent / f"{snapshot_id}.release.json"]
    return ["gh", "release", "create", descriptor["tag"], *map(str, assets),
            "--target", descriptor["pipeline_commit"], "--title", descriptor["tag"],
            "--notes", "Built data and complete raw responses. SHA256 sidecars included."]


def upload_release(paths: Paths, snapshot_id: str, zip_path: Path) -> tuple[bool, str]:
    descriptor = release_descriptor(paths, snapshot_id, zip_path)
    exists = subprocess.run(["gh", "release", "view", descriptor["tag"]],
                            cwd=paths.root, capture_output=True, text=True, timeout=60)
    if exists.returncode == 0:
        # Immutable releases are reused only after every downloaded asset
        # matches. Never overwrite any previously published release asset.
        return download_and_verify(paths, snapshot_id, zip_path, paths.sidecar_path(snapshot_id))
    result = subprocess.run(gh_create_command(snapshot_id, zip_path), cwd=paths.root,
                            capture_output=True, text=True, timeout=300)
    if result.returncode != 0:
        return False, f"gh upload failed (exit {result.returncode})"
    return True, f"uploaded to release {descriptor['tag']}"


def download_and_verify(paths: Paths, snapshot_id: str, zip_path: Path, sidecar_path: Path) -> tuple[bool, str]:
    descriptor = release_descriptor(paths, snapshot_id, zip_path)
    with tempfile.TemporaryDirectory(prefix="us-trade-download-") as tmp:
        for local in [zip_path, raw_zip_path(paths, snapshot_id)]:
            result = subprocess.run(
                ["gh", "release", "download", descriptor["tag"],
                 "--pattern", local.name, "--dir", tmp], cwd=paths.root,
                capture_output=True, text=True, timeout=300)
            if result.returncode != 0:
                return False, f"gh download failed (exit {result.returncode})"
            downloaded = Path(tmp) / local.name
            if not downloaded.is_file() or sha256_of_file(downloaded) != sha256_of_file(local):
                return False, f"downloaded asset sha256 mismatch: {local.name}"
    return True, "built and raw download-back verification passed"


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

def cmd_release(root: Path, snapshot_id: str, local_only: bool = False) -> int:
    paths = Paths(root)
    print(f"[release] building release zip for {snapshot_id}")
    zip_path = build_release_zip(paths, snapshot_id)
    sidecar_path = paths.sidecar_path(snapshot_id)
    ok, reason = verify_zip_locally(paths, snapshot_id, zip_path)
    print(f"[release] {reason}")
    if not ok:
        print(f"[release] FAILED: {reason}")
        return 1

    if local_only:
        return 0

    if not gh_available(paths):
        print(f"[release] no git remote named origin, or gh is not authenticated; "
              f"the zip is left at {zip_path.name}. Run this command later once a remote "
              "and gh auth are set up:")
        print(f"  make release SNAPSHOT={snapshot_id}")
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
            print(f"[publish_rotate] DRY RUN would append to {paths.publish_log.relative_to(paths.root)}: "
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
              f"data/{old_id}/ and a separate full raw/{old_id}/ archive"
              + (" plus reports/pipeline/validation.csv" if paths.validation_csv.exists() else "")
              + f" into {zip_path.name}, with a sha256 sidecar at {sidecar_path.name}")
        print(f"[publish_rotate] DRY RUN would verify the zip locally (unzip + sha256 compare "
              f"against data/{old_id}/, raw_manifest.json, and validation.csv)")
        print(f"[publish_rotate] DRY RUN would check for a git remote named origin and "
              f"`gh auth status`; if both succeed, would upload both archives to an immutable build release "
              f"and verify by downloading the asset back and comparing its sha256 against the "
              f"sidecar; otherwise removal would NOT proceed (no remote is now a blocking "
              f"condition, not a soft skip)")
        print(f"[publish_rotate] DRY RUN: only if both verifications pass would data/{old_id}/ "
              f"be removed and the rotation logged as removed; otherwise data/{old_id}/ would "
              f"be preserved and the rotation logged as preserved with the reason")
        return 0

    timestamp = manifest_timestamp(paths, old_id)

    try:
        zip_path = build_release_zip(paths, old_id)
    except (OSError, RuntimeError, ValueError, KeyError) as exc:
        reason = f"archive build failed: {type(exc).__name__}"
        append_publish_log(paths, new_id, old_id, timestamp, "preserved", reason)
        print(f"[publish_rotate] {reason}; previous snapshot preserved")
        return 1
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
              f"The verified zip is left at {zip_path.name}; run this command later once a "
              "remote and gh auth are set up, then re-run rotation:")
        print(f"  make release SNAPSHOT={old_id}")
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
    parser.add_argument("--local-only", action="store_true", help="build and verify release files without upload")
    parser.add_argument("--release", metavar="SNAPSHOT_ID",
                         help="build and verify a release zip for one snapshot, no removal")
    parser.add_argument("--root", default=str(DEFAULT_ROOT),
                         help="project root (tests point this at a temp directory)")
    args = parser.parse_args()
    root = Path(args.root)

    if args.release:
        return cmd_release(root, args.release, local_only=args.local_only)
    if not args.new_id:
        raise SystemExit("usage: publish_rotate.py <new_id> [--dry-run] | --release SNAPSHOT_ID")
    return cmd_rotate(root, args.new_id, dry_run=args.dry_run)


if __name__ == "__main__":
    sys.exit(main())
