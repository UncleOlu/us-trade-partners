# Rebuild byte-identity proof

Snapshot: `20260909T091429Z-c638aff167ea`

Owner-authorized correction (no fresh acquisition): rebuilt from
`raw/20260909T091429Z-c638aff167ea/` with no network after the
orchestrator rewrote the pre-push git history to drop `data/` and
`validation.csv` from every commit. Current HEAD is
`2a4d0dd82fae7cbd0b2517b47a9149d357a0a576`, so `meta.code_commit` now
carries that HEAD (read live via `git rev-parse HEAD` in
`pipeline/build.py`'s `get_code_commit()`, never hard-coded).

## Commands run

```
NEW_ID=20260909T091429Z-c638aff167ea
rm -rf reports/pipeline/rebuild_check/$NEW_ID
.venv/bin/python3 pipeline/build.py $NEW_ID --out reports/pipeline/rebuild_check/$NEW_ID

STAGE_DIR=reports/pipeline/staging/$NEW_ID
REBUILD_DIR=reports/pipeline/rebuild_check/$NEW_ID

diff -rq "$STAGE_DIR" "$REBUILD_DIR"

(cd "$STAGE_DIR" && find . -type f -exec shasum -a 256 {} \; | sort) > /tmp/r3_stage_sha256.txt
(cd "$REBUILD_DIR" && find . -type f -exec shasum -a 256 {} \; | sort) > /tmp/r3_rebuild_sha256.txt
diff /tmp/r3_stage_sha256.txt /tmp/r3_rebuild_sha256.txt
```

## Output

```
[build] wrote reports/pipeline/rebuild_check/20260909T091429Z-c638aff167ea

$ diff -rq "$STAGE_DIR" "$REBUILD_DIR"
(no output, exit status 0)

$ diff /tmp/r3_stage_sha256.txt /tmp/r3_rebuild_sha256.txt
(no output, exit status 0)

$ wc -l /tmp/r3_stage_sha256.txt
     274 /tmp/r3_stage_sha256.txt

meta.code_commit (both builds): 2a4d0dd82fae7cbd0b2517b47a9149d357a0a576
```

## Result

274 files in each directory, zero differences from `diff -rq`, every
sha256 checksum matches exactly, and both builds' `meta.code_commit`
equal the current git HEAD. `pipeline/build.py` reads only
`raw/20260909T091429Z-c638aff167ea/`, `pipeline/*.json`, and
`git rev-parse HEAD`; it makes no network calls and never reads the wall
clock (`fetched_at` is copied verbatim from the raw manifest's
`acquisition_start`).
