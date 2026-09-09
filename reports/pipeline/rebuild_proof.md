# Rebuild byte-identity proof

Snapshot: `20260909T091429Z-c638aff167ea` (fresh full acquisition, includes
eu_members_hs2/ for EU transition-year group and chapter detail).

This snapshot has **not** been published to `data/`: validation shows zero
FAIL in checks 1-9 excluding eu_comparability, but publication remains
blocked on the owner's decision for code 8220 (kept
`resolution=approved`/`kind=special` in `partners.json` only because the
schema has no `unresolved` value; its true status is tracked in
`reports/pipeline/unresolved_codes_20260909T091429Z-c638aff167ea.json`).
The previous staged snapshot (`20260909T013644Z-46e5a70d2c45`) is left
untouched at `reports/pipeline/staging/20260909T013644Z-46e5a70d2c45/`.

## Commands run

```
NEW_ID=20260909T091429Z-c638aff167ea
rm -rf reports/pipeline/rebuild_check/$NEW_ID
.venv/bin/python3 pipeline/build.py $NEW_ID --out reports/pipeline/rebuild_check/$NEW_ID

STAGE_DIR=reports/pipeline/staging/$NEW_ID
REBUILD_DIR=reports/pipeline/rebuild_check/$NEW_ID

diff -rq "$STAGE_DIR" "$REBUILD_DIR"

(cd "$STAGE_DIR" && find . -type f -exec shasum -a 256 {} \; | sort) > /tmp/new_stage_sha256.txt
(cd "$REBUILD_DIR" && find . -type f -exec shasum -a 256 {} \; | sort) > /tmp/new_rebuild_sha256.txt
diff /tmp/new_stage_sha256.txt /tmp/new_rebuild_sha256.txt
```

## Output

```
[build] wrote reports/pipeline/rebuild_check/20260909T091429Z-c638aff167ea

$ diff -rq "$STAGE_DIR" "$REBUILD_DIR"
(no output, exit status 0)

$ diff /tmp/new_stage_sha256.txt /tmp/new_rebuild_sha256.txt
(no output, exit status 0)

$ wc -l /tmp/new_stage_sha256.txt
     274 /tmp/new_stage_sha256.txt
```

## Result

274 files in each directory (meta.json, partners.json, hs_sections.json,
13 summary/<year>.json, 236 partner/<code>.json, 22 section/<id>.json),
zero differences from `diff -rq`, and every sha256 checksum matches
exactly between the staged build and a from-raw, no-network rebuild.
`pipeline/build.py` reads only `raw/20260909T091429Z-c638aff167ea/` and
`pipeline/*.json`, makes no network calls, and never reads the wall clock
(`fetched_at` is copied verbatim from the raw manifest's
`acquisition_start`).

Prior snapshot's rebuild proof (superseded by this file) covered
`20260909T013644Z-46e5a70d2c45`; that snapshot and its staging/rebuild_check
directories remain on disk, unmodified.
