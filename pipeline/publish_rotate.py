"""
Publish rotation (BUILD ORDER step 5, owner instruction). Runs after a new
snapshot has already been atomically promoted to data/<new_id>/. Retires
the previous published snapshot from the working tree, archives it, and
attempts to attach that archive to a GitHub Release.

Three things, in order, after the caller has already promoted <new_id>:
  1. Remove data/<old_id>/ from the working tree (never raw/<old_id>/,
     never git history) and record the rotation in
     reports/pipeline/publish_log.csv (published_id, removed_id,
     timestamp_from_manifest, the removed snapshot's own
     manifest.acquisition_start, never the current wall-clock time).
  2. Zip the previous snapshot's published files (data/<old_id>/) together
     with its raw manifest (raw/<old_id>/manifest.json, saved inside the
     zip as raw_manifest.json) to
     reports/pipeline/releases/<old_id>.zip, plus a sha256 sidecar
     (<old_id>.zip.sha256).
  3. Attach that zip to a GitHub Release tagged snapshot-<old_id> via the
     gh CLI, only when a git remote named origin exists and
     `gh auth status` succeeds. Otherwise the zip is left in place and the
     exact gh command to run later is printed; the script still exits 0.

Nothing here writes to data/<new_id>/ or to any raw/ directory (raw/ is
read-only: only raw/<old_id>/manifest.json is read, for the zip contents
and the log timestamp).

Usage:
    .venv/bin/python3 pipeline/publish_rotate.py <new_id> [--dry-run]

--dry-run prints exactly what would be removed, zipped, and released,
performing no filesystem or network changes at all (not even an
os.path.exists probe beyond read-only inspection of data/ and raw/).
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import shutil
import subprocess
import sys
import zipfile
from pathlib import Path

ROOT = Path(".")
DATA_DIR = ROOT / "data"
RAW_DIR = ROOT / "raw"
REPORTS_DIR = ROOT / "reports" / "pipeline"
RELEASES_DIR = REPORTS_DIR / "releases"
PUBLISH_LOG = REPORTS_DIR / "publish_log.csv"


def find_previous_snapshot(new_id: str) -> str | None:
    """The one other directory under data/ besides new_id, if any. Never
    guesses among more than one candidate: an unexpected number of other
    directories is a hard error rather than a silent pick."""
    if not DATA_DIR.is_dir():
        return None
    others = sorted(p.name for p in DATA_DIR.iterdir() if p.is_dir() and p.name != new_id)
    if not others:
        return None
    if len(others) > 1:
        raise RuntimeError(
            f"expected at most one previous snapshot under data/ besides {new_id}, "
            f"found {others}; refusing to guess which one to rotate out")
    return others[0]


def manifest_timestamp(old_id: str) -> str:
    manifest_path = RAW_DIR / old_id / "manifest.json"
    if not manifest_path.exists():
        raise RuntimeError(f"raw manifest not found for {old_id}: {manifest_path}")
    manifest = json.loads(manifest_path.read_text())
    return manifest["acquisition_start"]


def sha256_of_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def build_release_zip(old_id: str, dry_run: bool) -> Path:
    zip_path = RELEASES_DIR / f"{old_id}.zip"
    data_old_dir = DATA_DIR / old_id
    manifest_path = RAW_DIR / old_id / "manifest.json"
    if dry_run:
        file_count = sum(1 for p in data_old_dir.rglob("*") if p.is_file()) if data_old_dir.is_dir() else 0
        print(f"[publish_rotate] DRY RUN would zip {file_count} published files from "
              f"{data_old_dir} plus {manifest_path} (as raw_manifest.json) into {zip_path}, "
              f"with a sha256 sidecar at {zip_path}.sha256")
        return zip_path
    RELEASES_DIR.mkdir(parents=True, exist_ok=True)
    if zip_path.exists():
        zip_path.unlink()
    file_list = sorted(p for p in data_old_dir.rglob("*") if p.is_file())
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for p in file_list:
            zf.write(p, arcname=str(p.relative_to(data_old_dir)))
        zf.write(manifest_path, arcname="raw_manifest.json")
    sha_path = zip_path.parent / f"{zip_path.name}.sha256"
    sha_path.write_text(sha256_of_file(zip_path) + "  " + zip_path.name + "\n")
    return zip_path


def remove_previous(old_id: str, dry_run: bool) -> None:
    data_old_dir = DATA_DIR / old_id
    if dry_run:
        print(f"[publish_rotate] DRY RUN would remove {data_old_dir} from the working tree "
              f"(raw/{old_id}/ and git history are never touched)")
        return
    shutil.rmtree(data_old_dir)


def gh_available() -> bool:
    try:
        remote = subprocess.run(["git", "-C", str(ROOT), "remote", "get-url", "origin"],
                                 capture_output=True, text=True, timeout=10)
        if remote.returncode != 0:
            return False
        auth = subprocess.run(["gh", "auth", "status"], capture_output=True, text=True, timeout=10)
        return auth.returncode == 0
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return False


def gh_create_command(old_id: str, zip_path: Path) -> list[str]:
    return ["gh", "release", "create", f"snapshot-{old_id}", str(zip_path),
            "--title", f"snapshot-{old_id}",
            "--notes", f"US goods trade partner visualization, snapshot {old_id}."]


def gh_upload_command(old_id: str, zip_path: Path) -> list[str]:
    return ["gh", "release", "upload", f"snapshot-{old_id}", str(zip_path), "--clobber"]


def attach_to_release(old_id: str, zip_path: Path, dry_run: bool) -> None:
    if dry_run:
        print(f"[publish_rotate] DRY RUN would check for a git remote named origin and "
              f"`gh auth status`; if both succeed, would run: "
              f"{' '.join(gh_create_command(old_id, zip_path))} (or upload --clobber if the "
              f"release already exists); otherwise would print that command for later use")
        return
    if not gh_available():
        print("[publish_rotate] no git remote named origin, or gh is not authenticated; "
              f"the zip is left at {zip_path}. Run this command later once a remote and "
              "gh auth are set up:")
        print("  " + " ".join(gh_create_command(old_id, zip_path)))
        return
    exists = subprocess.run(["gh", "release", "view", f"snapshot-{old_id}"],
                             capture_output=True, text=True)
    if exists.returncode != 0:
        subprocess.run(gh_create_command(old_id, zip_path), check=True)
    else:
        subprocess.run(gh_upload_command(old_id, zip_path), check=True)


def append_publish_log(new_id: str, old_id: str | None, timestamp: str | None, dry_run: bool) -> None:
    if dry_run:
        print(f"[publish_rotate] DRY RUN would append to {PUBLISH_LOG}: "
              f"published_id={new_id}, removed_id={old_id or ''}, "
              f"timestamp_from_manifest={timestamp or ''}")
        return
    is_new = not PUBLISH_LOG.exists()
    PUBLISH_LOG.parent.mkdir(parents=True, exist_ok=True)
    with open(PUBLISH_LOG, "a", newline="") as f:
        w = csv.writer(f)
        if is_new:
            w.writerow(["published_id", "removed_id", "timestamp_from_manifest"])
        w.writerow([new_id, old_id or "", timestamp or ""])


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("new_id")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    if not args.dry_run and not (DATA_DIR / args.new_id).is_dir():
        raise SystemExit(f"data/{args.new_id}/ does not exist; publish rotation runs only "
                          f"after the new snapshot has already been promoted there")

    old_id = find_previous_snapshot(args.new_id)
    if old_id is None:
        print(f"[publish_rotate] no previous snapshot found under data/ other than the "
              f"current one ({args.new_id}); nothing to remove, zip, or release")
        append_publish_log(args.new_id, None, None, args.dry_run)
        return 0

    print(f"[publish_rotate] rotating out previous snapshot {old_id} (new snapshot: {args.new_id})")
    timestamp = manifest_timestamp(old_id)
    zip_path = build_release_zip(old_id, args.dry_run)
    remove_previous(old_id, args.dry_run)
    attach_to_release(old_id, zip_path, args.dry_run)
    append_publish_log(args.new_id, old_id, timestamp, args.dry_run)
    print(f"[publish_rotate] {'DRY RUN ' if args.dry_run else ''}done: "
          f"published={args.new_id} removed={old_id}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
