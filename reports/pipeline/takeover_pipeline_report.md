# Pipeline takeover implementation

Completed before final source commit and data rebuild.

- Portable roots derive from each file location, with US_TRADE_ROOT override.
- Build and acquisition reports use relative paths. External build output labels show only the final directory name.
- Tracked pipeline report paths have private home paths removed.
- Build model metadata states Codex with the exact model ID unavailable.
- ZIP entries use fixed timestamps, modes and sorted names. Separate full raw ZIP checks every recorded raw file hash first.
- Immutable release tag binds raw snapshot id, pipeline commit and built ZIP SHA256. Existing assets cannot be overwritten. Reuse requires successful download checks.
- Rotation waits for both built and raw archives to pass local and download checks. Prior data survives archive, upload and download failures.
- Archive validation.csv only if every row belongs to the archived snapshot.
- make data stops when its build fails.

Tests: `.venv/bin/python3 -m pytest pipeline/tests_rotation/ -q` executed
14 tests, 14 passed, zero skipped, 1.94 seconds. Full output:
`reports/pipeline/rotation_final_test.log`. Tests use temporary roots and a
fake GitHub CLI. They cover actual removal after verified storage, archive
corruption, upload failure, built download failure, raw download failure,
missing remote, two dry-run cases, local release, remote release, fixed ZIP
bytes after file timestamp changes, full raw response restoration, raw hash
failure, existing immutable release reuse, and exclusion of another
snapshot's validation report. Multiple assertions occur in some tests.

`.venv/bin/python3 -m compileall -q pipeline` exited 0.
Python source scan found zero private home paths and zero em dash characters.
No Census acquisition, final data rebuild, working snapshot rotation,
commit, or real GitHub upload ran in this implementation pass.

Release interface: `pipeline/publish_rotate.py --release <id> --local-only`
creates `<id>.zip`, `<id>.raw.zip`, their `.sha256` files, and
`<id>.release.json` in reports/pipeline/releases/. Descriptor fields are
snapshot_id, pipeline_commit, tag, asset, sha256, raw_asset, raw_sha256,
archive_scope. The orchestrator will copy the final descriptor to
reports/pipeline/current_release.json for the deployment pin.

Trade-off: the complete raw ZIP increases release storage and transfer, but
it supports raw rebuilds without new acquisition. The separate built ZIP
keeps raw files out of deployment downloads. Matching source code and
package dependencies remain necessary to restore the site or rebuild data.

Usage: uncached input, cache writes by duration, cache reads and output
metrics are unknown. Billing cost is unknown.
