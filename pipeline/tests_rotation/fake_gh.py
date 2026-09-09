#!/usr/bin/env python3
"""Fake `gh` CLI for pipeline/tests_rotation tests. Never calls the real
GitHub API. Controlled entirely by environment variables so tests can
simulate success and each specific failure mode without touching the
network:

  FAKE_GH_STORAGE       required: a directory this script uses to stand in
                         for GitHub's asset storage (copies zips in and out).
  FAKE_GH_AUTH_FAIL=1    make `gh auth status` fail (exit 1).
  FAKE_GH_UPLOAD_FAIL=1  make `gh release create` / `gh release upload` fail.
  FAKE_GH_DOWNLOAD_FAIL=1 make `gh release download` fail.

Made executable and placed first on PATH by the tests so
subprocess.run(["gh", ...]) in pipeline/publish_rotate.py finds this
instead of any real gh binary.
"""

from __future__ import annotations

import os
import shutil
import sys
from pathlib import Path


def main() -> int:
    args = sys.argv[1:]
    storage = os.environ.get("FAKE_GH_STORAGE")
    if not storage:
        print("fake_gh: FAKE_GH_STORAGE not set", file=sys.stderr)
        return 2
    storage_dir = Path(storage)
    storage_dir.mkdir(parents=True, exist_ok=True)

    if args[:2] == ["auth", "status"]:
        return 1 if os.environ.get("FAKE_GH_AUTH_FAIL") == "1" else 0

    if args[:2] == ["release", "view"]:
        tag = args[2]
        marker = storage_dir / f"{tag}.marker"
        return 0 if marker.exists() else 1

    if args[:2] == ["release", "create"]:
        tag = args[2]
        zip_arg = args[3]
        if os.environ.get("FAKE_GH_UPLOAD_FAIL") == "1":
            print("fake_gh: simulated upload failure", file=sys.stderr)
            return 1
        for asset in args[3:]:
            if asset.startswith("--"):
                break
            shutil.copyfile(asset, storage_dir / f"{tag}__{Path(asset).name}")
        (storage_dir / f"{tag}.marker").touch()
        return 0

    if args[:2] == ["release", "upload"]:
        tag = args[2]
        zip_arg = args[3]
        if os.environ.get("FAKE_GH_UPLOAD_FAIL") == "1":
            print("fake_gh: simulated upload failure", file=sys.stderr)
            return 1
        shutil.copyfile(zip_arg, storage_dir / f"{tag}__{Path(zip_arg).name}")
        return 0

    if args[:2] == ["release", "download"]:
        tag = args[2]
        rest = args[3:]
        pattern = None
        dest = None
        i = 0
        while i < len(rest):
            if rest[i] == "--pattern":
                pattern = rest[i + 1]
                i += 2
            elif rest[i] == "--dir":
                dest = rest[i + 1]
                i += 2
            elif rest[i] == "--clobber":
                i += 1
            else:
                i += 1
        if os.environ.get("FAKE_GH_DOWNLOAD_FAIL") == "1":
            print("fake_gh: simulated download failure", file=sys.stderr)
            return 1
        if os.environ.get("FAKE_GH_RAW_DOWNLOAD_FAIL") == "1" and pattern.endswith(".raw.zip"):
            return 1
        src = storage_dir / f"{tag}__{pattern}"
        if not src.exists():
            print(f"fake_gh: no stored asset for {tag}__{pattern}", file=sys.stderr)
            return 1
        Path(dest).mkdir(parents=True, exist_ok=True)
        shutil.copyfile(src, Path(dest) / pattern)
        return 0

    print(f"fake_gh: unhandled args: {args}", file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main())
