# Publish byte-identity proof

Snapshot: `20260909T091429Z-c638aff167ea` (republish, same id)

Owner-authorized correction: this replaces the published files for the
same snapshot id (never deployed yet, so replacement was explicitly
approved) with a rebuild that carries `meta.code_commit` =
`f964f31308e32d05cd5ca2386ff6ae9323cd2f1e` (the commit that landed the
8220 display-name rename) and the corrected `partners.json` name
"Unidentified Countries (Census code 8220)".

Republished by copying the staged build to a temp directory under
`data/`, moving the previously published directory aside (kept, not
deleted, until this proof was written), moving the temp directory into
place, then proving byte-identity, and only then removing the old
directory.

## Commands run

```
NEW_ID=20260909T091429Z-c638aff167ea
STAGE_DIR="reports/pipeline/staging/${NEW_ID}"
DATA_DIR="data/${NEW_ID}"
TMP_DIR="data/.republishing_${NEW_ID}"
OLD_KEEP_DIR="data/.old_${NEW_ID}"

rm -rf "$TMP_DIR" "$OLD_KEEP_DIR"
cp -R "$STAGE_DIR" "$TMP_DIR"
mv "$DATA_DIR" "$OLD_KEEP_DIR"      # keep the old published copy for now
mv "$TMP_DIR" "$DATA_DIR"           # swap the new build into place

(cd "$STAGE_DIR" && find . -type f -exec shasum -a 256 {} \; | sort) > /tmp/repub_stage_sha256.txt
(cd "$DATA_DIR" && find . -type f -exec shasum -a 256 {} \; | sort) > /tmp/repub_data_sha256.txt
diff /tmp/repub_stage_sha256.txt /tmp/repub_data_sha256.txt

find "$DATA_DIR" -type f | wc -l
find "$DATA_DIR" -type f -exec stat -f%z {} \; | awk '{s+=$1} END {print s}'
shasum -a 256 "$DATA_DIR/meta.json"

# only after the proof above showed zero differences:
rm -rf "$OLD_KEEP_DIR"
```

## Output

```
$ diff /tmp/repub_stage_sha256.txt /tmp/repub_data_sha256.txt
(no output, exit status 0)

$ find "$DATA_DIR" -type f | wc -l
     274

$ find "$DATA_DIR" -type f -exec stat -f%z {} \; | awk '{s+=$1} END {print s}'
273661635

$ shasum -a 256 "$DATA_DIR/meta.json"
dcfcb91e732bd5a0bf44829bbe0bf216c63aa7797e9182cc70ff49dfc659ca32  data/20260909T091429Z-c638aff167ea/meta.json
```

## Result

`data/20260909T091429Z-c638aff167ea/` republished: 274 files,
273,661,635 bytes (261.0 MiB). Every one of the 274 sha256 checksums
under the republished `data/` matched the staged build exactly (zero
diff lines) before the old directory (`data/.old_20260909T091429Z-c638aff167ea/`)
was removed. `raw/` and every other snapshot were not touched. The
previous published copy is gone now that this proof is written, per the
owner's instruction to keep it only until the proof exists.
