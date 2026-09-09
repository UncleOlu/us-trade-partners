# reports/pipeline/

Agent A's reports, logs, release archives, and tests (`tests_rotation/`
lives under `pipeline/`, but the artifacts it exercises live here). This
directory is owned by Agent A.

## Publish rotation (owner instruction, BUILD ORDER step 5, hardened)

`make data` publishes a new snapshot atomically to `data/<new_id>/`, then
runs `pipeline/publish_rotate.py <new_id>` to retire the previous
snapshot. Only one published snapshot is ever kept under `data/` at a
time (the app bundle serves exactly one snapshot; SPEC DATA CONTRACT:
"The app bundle contains one snapshot"). Every function in
`pipeline/publish_rotate.py` takes an explicit `root: Path` (a
`publish_rotate.Paths` dataclass derives every other path from it), so
`pipeline/tests_rotation/` can point the whole module at a temporary
directory and never touch the real `data/` or `raw/`.

Rotation never removes `data/<old_id>/` until it has proven the old
snapshot is safely archived somewhere other than that one working-tree
copy. Two verifications, both required:

1. **Local zip verification.** Builds `reports/pipeline/releases/<old_id>.zip`
   from the previous snapshot's published files (everything under
   `data/<old_id>/`) plus its raw manifest (`raw/<old_id>/manifest.json`,
   stored in the zip as `raw_manifest.json`) plus
   `reports/pipeline/validation.csv` when present (stored as
   `validation.csv`), writes a sha256 sidecar
   (`reports/pipeline/releases/<old_id>.zip.sha256`), then unzips to a
   temp directory and compares every file's sha256 against its source.
2. **Remote round-trip verification.** Only when a git remote named
   `origin` exists and `gh auth status` succeeds: uploads the zip to a
   GitHub Release tagged `snapshot-<old_id>` (creating the release if it
   does not exist), then downloads that asset back to a temp directory
   and compares its sha256 against the sidecar.

`data/<old_id>/` is removed only after BOTH verifications pass. If the
zip verification fails, the upload fails, the download-back fails, or
there is no remote at all (no `origin`, or `gh auth status` fails), the
previous snapshot is preserved, the reason is written to
`reports/pipeline/publish_log.csv`, and the command exits non-zero with a
clear message. The newly published snapshot (`data/<new_id>/`) and every
`raw/` directory are never touched by any outcome of this step;
`raw/<old_id>/manifest.json` is read, never written.

### Dry run

`make publish-rotate-dry-run` (or
`.venv/bin/python3 pipeline/publish_rotate.py <new_id> --dry-run`) prints
exactly what would be removed, zipped, and verified, with no filesystem
or network changes at all. Useful to preview a rotation before running
`make data` again, or to audit what the next publish will retire.

### make release (build and verify only, never removes)

`make release SNAPSHOT=<id>` (`pipeline/publish_rotate.py --release <id>`)
runs the same build-and-verify-locally step for one already-published
snapshot, and the same upload-and-verify-download-back step when a
remote and `gh` auth exist, but never removes anything. This is for
snapshots published before the rotation step existed (the orchestrator
runs it once, after the first push, for the current snapshot) or for
manually re-archiving a snapshot on demand. A missing remote is not a
failure here (nothing is at risk of deletion): the zip is still built and
verified locally, and the manual `gh release create` command is printed.

### No previous snapshot

If `data/` holds only the current snapshot (nothing else to rotate out,
as right after a project's first publish), the script prints that there
is nothing to remove, zip, or release, and still appends a
`publish_log.csv` row (`status=none`) so the log has one row per publish
regardless.

### Tests

`pipeline/tests_rotation/` (pytest, run with `.venv`: `make test-rotation`
or `.venv/bin/python3 -m pytest pipeline/tests_rotation/ -v`). Every test
builds its own temporary fixture root: two fake snapshots, a `git init`
repo with a fake `origin` remote, and a fake `gh` executable
(`pipeline/tests_rotation/fake_gh.py`, controlled by environment
variables `FAKE_GH_AUTH_FAIL`, `FAKE_GH_UPLOAD_FAIL`,
`FAKE_GH_DOWNLOAD_FAIL`) placed first on `PATH`. Covers: a real rotation
(zip, sidecar, both verifications, removal, log); a corrupted-zip local
verification failure (preserves, exits non-zero); an upload failure and a
download-back failure via the fake `gh` (each preserves, exits non-zero);
no remote at all (preserves, exits non-zero); a dry run (no filesystem
changes); and `make release`'s build/verify/no-removal behavior, with and
without a remote. Output saved to `reports/pipeline/rotation_tests.txt`.

### Files this step owns

- `reports/pipeline/publish_log.csv`, one row per publish, columns
  `published_id, removed_id, timestamp_from_manifest, status, reason`.
  `status` is `removed`, `preserved`, or `none` (nothing to rotate).
- `reports/pipeline/releases/<id>.zip` and `<id>.zip.sha256`, a
  snapshot's published files plus its raw manifest and (when present)
  its validation.csv, kept locally regardless of whether the GitHub
  Release upload succeeded.

### Rules this step keeps

- No CENSUS_API_KEY or other secret ever appears in
  `pipeline/publish_rotate.py`'s output, the zip, or `publish_log.csv`
  (the script makes no Census API calls at all).
- No em dashes anywhere in this step's code, output, or docs.
- Deterministic output: the zip's file list is sorted, `publish_log.csv`
  rows are appended in publish order with a fixed column order, and the
  logged timestamp always comes from the retired snapshot's own raw
  manifest, never the current time.

## History-growth design (owner instruction)

`data/` and `reports/pipeline/validation.csv` are no longer tracked in
git; the orchestrator is rewriting the pre-push history to drop them.
Going forward:

- Every published snapshot lives as a GitHub Release asset
  (`snapshot-<id>`, the zip built by this rotation step) carrying its
  sha256 sidecar and its raw manifest (`raw_manifest.json` inside the
  zip). That release asset, not git, is the durable, addressable copy of
  a snapshot once it is no longer the currently published one.
- The deploy workflow fetches the currently published snapshot's asset
  by id (from `reports/pipeline/last_snapshot_id.txt`, the snapshot id
  pointer) rather than reading `data/<id>/` out of a git checkout.
- Git holds only code, small reports (`validation_summary.md`, the
  rebuild and publish proofs, `acquire_<ts>.log`,
  `hs2_completeness_<ts>.json`, `rotation_tests.txt`, this README, and so
  on), and the snapshot id pointer (`reports/pipeline/last_snapshot_id.txt`).
  `data/<id>/` itself (hundreds of published JSON files, on the order of
  250-300 MB per snapshot in this project) and the full-precision
  `validation.csv` (hundreds of thousands of rows) are excluded.

**Consequence: repository history does not grow with snapshots.** Each
new `make data` run replaces the working-tree `data/<id>/` and
`validation.csv` in place (neither is committed), and the retired
snapshot moves to a GitHub Release asset instead of a git blob, so the
git object store never accumulates one multi-hundred-megabyte `data/`
tree and one huge `validation.csv` per historical snapshot.

**What still grows in git, and how much:** `validation_summary.md` (the
per-check pass/fail counts and grouped FAIL examples, not the full
row-by-row `validation.csv`) and the small logs
(`reports/pipeline/acquire_<ts>.log`, `hs2_completeness_<ts>.json`,
`publish_log.csv`, `rotation_tests.txt`, the rebuild/publish proof `.md`
files) are committed each time. Each of these is on the order of a few
kilobytes to low tens of kilobytes per snapshot (`validation_summary.md`
itself is well under 5 KB; the logs are typically similar or smaller),
so repository growth from a snapshot cycle is on the order of kilobytes,
not the hundreds of megabytes `data/<id>/` and `validation.csv` would
otherwise add.

**Raw archive retention policy:** `raw/<id>/` (the full request/response
archive an acquisition produces, tens to low hundreds of MB) is kept
locally on disk (never committed, per `.gitignore`) for as long as local
storage allows, and is also reachable indefinitely as the
`raw_manifest.json` bundled inside that snapshot's GitHub Release zip
(the manifest alone, not the full raw archive: the release asset is the
published files plus the manifest, not every raw request/response pair).
A full raw archive re-fetch (`make rebuild` needs only the manifest and
the raw responses; a byte-identical rebuild is only possible from the
complete local `raw/<id>/`, not from the manifest alone) is the fallback
if a local `raw/<id>/` is ever deleted to reclaim space; the release
asset's manifest still proves what was fetched (hashes, timestamps,
LAST_UPDATE literals, fingerprint before/after) even after the full raw
directory is gone.
