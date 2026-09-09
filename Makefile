PY := .venv/bin/python3
STAGING := reports/pipeline/staging

.PHONY: help data build-only validate rebuild publish-check publish-rotate-dry-run release test-rotation

help:
	@echo "make data                    acquire, build, validate, publish (see below), and rotate the prior snapshot"
	@echo "make rebuild SNAPSHOT=<id>   build from raw/<id>/ only, no network, into reports/pipeline/rebuild_check/<id>/"
	@echo "make validate SNAPSHOT=<id>  run validation against data/<id>/"
	@echo "make release SNAPSHOT=<id>   build and verify a release zip for one snapshot (published files,"
	@echo "                             raw manifest, validation.csv) and upload it with gh when a remote"
	@echo "                             and auth exist, verifying the download-back; removes nothing"
	@echo "make publish-rotate-dry-run  print what the post-publish rotation step would remove, zip, and release, without doing it"
	@echo "make test-rotation           run pipeline/tests_rotation/ with .venv (never touches the real data/ or raw/)"
	@echo ""
	@echo "Publish rotation (owner instruction, step 5, hardened): after a new snapshot is"
	@echo "atomically promoted to data/<new_id>/, pipeline/publish_rotate.py retires the"
	@echo "previous data/<old_id>/ (never raw/, never git history) ONLY after two"
	@echo "verifications both pass: (1) the release zip (published files, raw manifest.json,"
	@echo "validation.csv when present, sha256 sidecar at"
	@echo "reports/pipeline/releases/<old_id>.zip.sha256) is verified locally by unzipping to"
	@echo "a temp dir and comparing every file's sha256 against its source, and (2), when a"
	@echo "git remote named origin exists and gh auth status succeeds, the zip is uploaded to"
	@echo "a GitHub Release tagged snapshot-<old_id> and verified by downloading the asset"
	@echo "back and comparing its sha256 against the sidecar. If either verification fails, or"
	@echo "there is no remote at all, data/<old_id>/ is preserved, the reason is logged to"
	@echo "reports/pipeline/publish_log.csv, and the command exits non-zero (the newly"
	@echo "published snapshot is never affected either way). See reports/pipeline/README.md."

# acquire, build (to a staging temp dir), validate, publish only if checks
# 1-9 (excluding eu_comparability) have zero FAIL, then rotate out the
# previous snapshot (pipeline/publish_rotate.py; see help and
# reports/pipeline/README.md).
data:
	$(PY) pipeline/acquire.py
	@SNAPSHOT_ID=$$(cat reports/pipeline/last_snapshot_id.txt); \
	echo "[make data] snapshot_id=$$SNAPSHOT_ID"; \
	rm -rf $(STAGING)/$$SNAPSHOT_ID; \
	$(PY) pipeline/build.py $$SNAPSHOT_ID --out $(STAGING)/$$SNAPSHOT_ID; \
	$(PY) pipeline/validate.py $$SNAPSHOT_ID --data-dir $(STAGING)/$$SNAPSHOT_ID; \
	VALIDATE_STATUS=$$?; \
	if [ $$VALIDATE_STATUS -eq 0 ]; then \
		test ! -e data/$$SNAPSHOT_ID || (echo "refusing to overwrite existing data/$$SNAPSHOT_ID" && exit 1); \
		mkdir -p data; \
		mv $(STAGING)/$$SNAPSHOT_ID data/$$SNAPSHOT_ID; \
		echo "[make data] published data/$$SNAPSHOT_ID"; \
		$(PY) pipeline/publish_rotate.py $$SNAPSHOT_ID; \
	else \
		echo "[make data] validation FAILED (checks 1-9 excl. eu_comparability); not published. Staging kept at $(STAGING)/$$SNAPSHOT_ID for inspection."; \
		exit 1; \
	fi

# build from raw/<SNAPSHOT>/ only, no network, into reports/pipeline/rebuild_check/<SNAPSHOT>/
rebuild:
	@test -n "$(SNAPSHOT)" || (echo "usage: make rebuild SNAPSHOT=<id>" && exit 1)
	rm -rf reports/pipeline/rebuild_check/$(SNAPSHOT)
	$(PY) pipeline/build.py $(SNAPSHOT) --out reports/pipeline/rebuild_check/$(SNAPSHOT)

# validate an already-published (or staged) snapshot
validate:
	@test -n "$(SNAPSHOT)" || (echo "usage: make validate SNAPSHOT=<id>" && exit 1)
	$(PY) pipeline/validate.py $(SNAPSHOT) --data-dir data/$(SNAPSHOT)

# print what the post-publish rotation step would remove, zip, and
# release, without doing it; uses the currently published snapshot
# (reports/pipeline/last_snapshot_id.txt) as the "new" id.
publish-rotate-dry-run:
	@SNAPSHOT_ID=$$(cat reports/pipeline/last_snapshot_id.txt); \
	$(PY) pipeline/publish_rotate.py $$SNAPSHOT_ID --dry-run

# build and verify a release zip for one already-published snapshot
# (published files, raw manifest, validation.csv when present), upload it
# with gh when a remote and auth exist, and verify the download-back.
# Never removes anything. Run after the first push for a snapshot that
# predates the rotation step.
release:
	@test -n "$(SNAPSHOT)" || (echo "usage: make release SNAPSHOT=<id>" && exit 1)
	$(PY) pipeline/publish_rotate.py --release $(SNAPSHOT)

# run pipeline/tests_rotation/ with .venv; every test uses its own
# temporary fixture root and never touches the real data/ or raw/.
test-rotation:
	$(PY) -m pytest pipeline/tests_rotation/ -v
