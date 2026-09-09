# Rebuild byte-identity proof

Snapshot: `20260909T091429Z-c638aff167ea`

Owner-authorized correction (no fresh acquisition): rebuilt from
`raw/20260909T091429Z-c638aff167ea/` with no network after the commit
that landed the 8220 rename (HEAD
`f964f31308e32d05cd5ca2386ff6ae9323cd2f1e`), so `meta.code_commit` now
carries that HEAD and `partners.json` carries the name "Unidentified
Countries (Census code 8220)" for code 8220.

## Commands run

```
NEW_ID=20260909T091429Z-c638aff167ea
rm -rf reports/pipeline/rebuild_check/$NEW_ID
.venv/bin/python3 pipeline/build.py $NEW_ID --out reports/pipeline/rebuild_check/$NEW_ID

STAGE_DIR=reports/pipeline/staging/$NEW_ID
REBUILD_DIR=reports/pipeline/rebuild_check/$NEW_ID

diff -rq "$STAGE_DIR" "$REBUILD_DIR"

(cd "$STAGE_DIR" && find . -type f -exec shasum -a 256 {} \; | sort) > /tmp/r2_stage_sha256.txt
(cd "$REBUILD_DIR" && find . -type f -exec shasum -a 256 {} \; | sort) > /tmp/r2_rebuild_sha256.txt
diff /tmp/r2_stage_sha256.txt /tmp/r2_rebuild_sha256.txt
```

## Output

```
[build] wrote reports/pipeline/rebuild_check/20260909T091429Z-c638aff167ea

$ diff -rq "$STAGE_DIR" "$REBUILD_DIR"
(no output, exit status 0)

$ diff /tmp/r2_stage_sha256.txt /tmp/r2_rebuild_sha256.txt
(no output, exit status 0)

$ wc -l /tmp/r2_stage_sha256.txt
     274 /tmp/r2_stage_sha256.txt

meta.code_commit (both builds): f964f31308e32d05cd5ca2386ff6ae9323cd2f1e
```

## Result

274 files in each directory, zero differences from `diff -rq`, every
sha256 checksum matches exactly, and both builds' `meta.code_commit`
equal the real git HEAD after the 8220-rename commit.
`pipeline/build.py` reads only `raw/20260909T091429Z-c638aff167ea/`,
`pipeline/*.json`, and `git rev-parse HEAD`; it makes no network calls
and never reads the wall clock (`fetched_at` is copied verbatim from the
raw manifest's `acquisition_start`).
