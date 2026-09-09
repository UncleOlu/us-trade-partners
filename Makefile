PY := .venv/bin/python3
STAGING := reports/pipeline/staging

.PHONY: data build-only validate rebuild publish-check

# acquire, build (to a staging temp dir), validate, publish only if checks
# 1-9 (excluding eu_comparability) have zero FAIL.
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
