# reports/pipeline/

Agent A's reports, logs, and (as of the publish rotation step) release
archives. This directory is owned by Agent A.

## Publish rotation (owner instruction, BUILD ORDER step 5)

`make data` publishes a new snapshot atomically to `data/<new_id>/`, then
runs `pipeline/publish_rotate.py <new_id>` to retire the previous
snapshot. Only one published snapshot is ever kept under `data/` at a
time (the app bundle serves exactly one snapshot; SPEC DATA CONTRACT:
"The app bundle contains one snapshot"). Rotation does three things, in
order, and never touches `data/<new_id>/` or any `raw/` directory except
to read `raw/<old_id>/manifest.json`:

1. **Remove.** Deletes `data/<old_id>/` from the working tree only.
   `raw/<old_id>/` and git history are never touched; the raw archive
   stays available locally and is what the release zip is built from.
   Logs the rotation to `reports/pipeline/publish_log.csv`, columns
   `published_id, removed_id, timestamp_from_manifest`. The timestamp is
   the removed snapshot's own `raw/<old_id>/manifest.json`
   `acquisition_start`, never the current wall-clock time, so the log
   stays reproducible.
2. **Zip.** Archives the previous snapshot's published files
   (everything under `data/<old_id>/`) together with its raw manifest
   (`raw/<old_id>/manifest.json`, stored in the zip as
   `raw_manifest.json`) to `reports/pipeline/releases/<old_id>.zip`, with
   a `reports/pipeline/releases/<old_id>.zip.sha256` sidecar.
3. **Release.** Attaches the zip to a GitHub Release tagged
   `snapshot-<old_id>` via the `gh` CLI, creating the release if it does
   not exist yet. This only runs when a git remote named `origin` exists
   and `gh auth status` succeeds; otherwise the zip is left in place
   under `reports/pipeline/releases/` and the exact `gh` command to run
   later is printed. Either way the script exits 0 (success); a missing
   remote or missing `gh` auth is not a pipeline failure.

`raw/` itself is never committed (see the repo's `.gitignore`); this
rotation is how a superseded snapshot's raw evidence stays reachable
after `data/<old_id>/` is removed from the working tree, via the
GitHub Release zip (which bundles the raw manifest alongside the
published files) rather than via git history.

### Dry run

`make publish-rotate-dry-run` (or
`.venv/bin/python3 pipeline/publish_rotate.py <new_id> --dry-run`) prints
exactly what would be removed, zipped, and released, with no filesystem
or network changes. Useful to preview a rotation before running `make
data` again, or to audit what the next publish will retire.

### No previous snapshot

If `data/` holds only the current snapshot (nothing else to rotate out,
as when a project has just published its first snapshot), the script
prints that there is nothing to remove, zip, or release, and still
appends a `publish_log.csv` row with an empty `removed_id` and empty
`timestamp_from_manifest` so the log has one row per publish regardless.

### Files this step owns

- `reports/pipeline/publish_log.csv`, one row per publish, columns
  `published_id, removed_id, timestamp_from_manifest`.
- `reports/pipeline/releases/<old_id>.zip` and `<old_id>.zip.sha256`,
  the retired snapshot's published files plus its raw manifest, kept
  locally regardless of whether the GitHub Release attach succeeded.

### Rules this step keeps

- No CENSUS_API_KEY or other secret ever appears in
  `pipeline/publish_rotate.py`'s output, the zip, or `publish_log.csv`
  (the script makes no Census API calls at all).
- No em dashes anywhere in this step's code, output, or docs.
- Deterministic output: the zip's file list is sorted, `publish_log.csv`
  rows are appended in publish order with a fixed column order, and the
  logged timestamp always comes from the retired snapshot's own raw
  manifest, never the current time.
