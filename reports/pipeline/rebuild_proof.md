# Rebuild byte-identity proof

Snapshot: `20260909T091429Z-c638aff167ea`

Rebuilt from `raw/20260909T091429Z-c638aff167ea/` with no network after the
first real git commit (`5998397450456f1e5c407fb44ee43a682402bec4` on
`main`), so `meta.code_commit` now carries that real HEAD (read live via
`git rev-parse HEAD` in `pipeline/build.py`'s `get_code_commit()`, never
hard-coded) instead of the 40-zero placeholder used before any commit
existed. This rebuild also carries the owner-approved 8220 record (kind
special, name "Unidentified partner (Census code 8220)") and the
reclassified Kosovo 4803 record (kind country, iso3 null, map_feature_id
null with the world-atlas no-id citation) and the updated
`resolution_note`/`meta.notes` wording.

This snapshot has **not** been published to `data/`: the orchestrator
runs Agent D's suite against these rebuilt staged files first. Staged at
`reports/pipeline/staging/20260909T091429Z-c638aff167ea/`. The other
staged snapshot (`20260909T013644Z-46e5a70d2c45`) is untouched.

## Commands run

```
NEW_ID=20260909T091429Z-c638aff167ea
rm -rf reports/pipeline/rebuild_check/$NEW_ID
.venv/bin/python3 pipeline/build.py $NEW_ID --out reports/pipeline/rebuild_check/$NEW_ID

STAGE_DIR=reports/pipeline/staging/$NEW_ID
REBUILD_DIR=reports/pipeline/rebuild_check/$NEW_ID

diff -rq "$STAGE_DIR" "$REBUILD_DIR"

(cd "$STAGE_DIR" && find . -type f -exec shasum -a 256 {} \; | sort) > /tmp/final_stage_sha256.txt
(cd "$REBUILD_DIR" && find . -type f -exec shasum -a 256 {} \; | sort) > /tmp/final_rebuild_sha256.txt
diff /tmp/final_stage_sha256.txt /tmp/final_rebuild_sha256.txt
```

## Output

```
[build] wrote reports/pipeline/rebuild_check/20260909T091429Z-c638aff167ea

$ diff -rq "$STAGE_DIR" "$REBUILD_DIR"
(no output, exit status 0)

$ diff /tmp/final_stage_sha256.txt /tmp/final_rebuild_sha256.txt
(no output, exit status 0)

$ wc -l /tmp/final_stage_sha256.txt
     274 /tmp/final_stage_sha256.txt

stage meta.code_commit:   5998397450456f1e5c407fb44ee43a682402bec4
rebuild meta.code_commit: 5998397450456f1e5c407fb44ee43a682402bec4
```

## Result

274 files in each directory, zero differences from `diff -rq`, every
sha256 checksum matches exactly, and both builds' `meta.code_commit`
equal the real git HEAD. `pipeline/build.py` reads only
`raw/20260909T091429Z-c638aff167ea/`, `pipeline/*.json`, and `git rev-parse
HEAD`; it makes no network calls and never reads the wall clock
(`fetched_at` is copied verbatim from the raw manifest's
`acquisition_start`).
