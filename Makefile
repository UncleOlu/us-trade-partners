PY := .venv/bin/python3
STAGING := reports/pipeline/staging

.PHONY: help data build-only validate rebuild publish-check publish-rotate-dry-run

help:
	@echo "make data                    acquire, build, validate, publish (see below), and rotate the prior snapshot"
	@echo "make rebuild SNAPSHOT=<id>   build from raw/<id>/ only, no network, into reports/pipeline/rebuild_check/<id>/"
	@echo "make validate SNAPSHOT=<id>  run validation against data/<id>/"
	@echo "make publish-rotate-dry-run  print what the post-publish rotation step would remove, zip, and release, without doing it"
	@echo ""
	@echo "Publish rotation (owner instruction, step 5): after a new snapshot is atomically"
	@echo "promoted to data/<new_id>/, pipeline/publish_rotate.py removes the previous"
	@echo "data/<old_id>/ from the working tree (never raw/, never git history), zips that"
	@echo "old snapshot's published files plus its raw manifest.json to"
	@echo "reports/pipeline/releases/<old_id>.zip with a sha256 sidecar, attaches the zip to"
	@echo "a GitHub Release tagged snapshot-<old_id> when a git remote named origin exists"
	@echo "and gh auth status succeeds (otherwise it prints the gh command to run later), and"
	@echo "logs the rotation to reports/pipeline/publish_log.csv. See reports/pipeline/README.md."

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
