# Publish byte-identity proof

Snapshot: `20260909T091429Z-c638aff167ea`

Owner-approved publish signal from the orchestrator: Agent D's suite passed
125 of 127 against the rebuilt staged snapshot (the two skips are the
DATA_A/DATA_B pair and src/), validation has zero FAIL (checks 1-9
excluding eu_comparability), and `meta.code_commit` equals HEAD
`5998397450456f1e5c407fb44ee43a682402bec4`.

Published by copying the staged build to a temp directory under `data/`
and renaming (atomic within the `data/` filesystem), leaving the staged
copy in place. `raw/` and every other snapshot were not touched.

## Commands run

```
NEW_ID=20260909T091429Z-c638aff167ea
mkdir -p data
rm -rf "data/.publishing_${NEW_ID}"
cp -R "reports/pipeline/staging/${NEW_ID}" "data/.publishing_${NEW_ID}"
test -e "data/${NEW_ID}" && echo "REFUSING: already exists" || mv "data/.publishing_${NEW_ID}" "data/${NEW_ID}"

STAGE_DIR="reports/pipeline/staging/${NEW_ID}"
DATA_DIR="data/${NEW_ID}"
(cd "$STAGE_DIR" && find . -type f -exec shasum -a 256 {} \; | sort) > /tmp/publish_stage_sha256.txt
(cd "$DATA_DIR" && find . -type f -exec shasum -a 256 {} \; | sort) > /tmp/publish_data_sha256.txt
diff /tmp/publish_stage_sha256.txt /tmp/publish_data_sha256.txt

find "$DATA_DIR" -type f | wc -l
du -sb "$DATA_DIR"
shasum -a 256 "$DATA_DIR/meta.json"
```

## Output

```
$ ls data/
20260909T091429Z-c638aff167ea

$ diff /tmp/publish_stage_sha256.txt /tmp/publish_data_sha256.txt
(no output, exit status 0)

$ wc -l /tmp/publish_stage_sha256.txt /tmp/publish_data_sha256.txt
     274 /tmp/publish_stage_sha256.txt
     274 /tmp/publish_data_sha256.txt

$ find "$DATA_DIR" -type f | wc -l
     274

$ du -sb "$DATA_DIR"
273661009  data/20260909T091429Z-c638aff167ea

$ shasum -a 256 "$DATA_DIR/meta.json"
6a14f78c3d03539bdacb6708e395e28772c13c54383204cdfed443c20ee08216  data/20260909T091429Z-c638aff167ea/meta.json
```

## Result

`data/20260909T091429Z-c638aff167ea/` published: 274 files, 273,661,009
bytes (261.0 MiB). Every one of the 274 sha256 checksums under `data/`
matches the corresponding file under
`reports/pipeline/staging/20260909T091429Z-c638aff167ea/` exactly (zero
diff lines). The staged copy was left in place, unmodified. `raw/` and
every other snapshot (including
`reports/pipeline/staging/20260909T013644Z-46e5a70d2c45/`) were not
touched. `reports/pipeline/last_snapshot_id.txt` now reads
`20260909T091429Z-c638aff167ea`.
