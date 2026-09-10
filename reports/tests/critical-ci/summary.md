# Critical CI gate local evidence

`npm run build && npm run test:critical` passed once against the fresh local production build. All five fixed suites completed: 8 aggregation unit tests, 5 sorting unit tests, 10 sorting browser tests and 5 selected all-years browser tests. Total: 28 tests, 0 skips, plus 948 derived-data checks. Aggregation compared 3,832 flow values; sorting checked 54 column/direction orders.

The fixed entry point rejects external URL, filter and output overrides. It checks exact test names and counts, PASS status, local browser target, no browser errors and the starting index hash. Missing, stale or malformed receipts and failed children block the gate. Each browser suite has a 180-second limit; units have 60 seconds; the whole gate has 600 seconds.

Seventeen actual subprocess fixture checks passed. They include nonzero exit, empty results, NOT RUN, wrong names/counts, missing/malformed/stale receipts, timeout, a descendant that ignores TERM, bad browser/integrity receipts and four forbidden overrides. Timeout cleanup sends SIGKILL to the process group even when its leader exits first. The first sandboxed descendant check could not run the process inspection command; the permitted rerun verified cleanup.

Generated diagnostics stay in ignored `reports/tests/ci/`. Existing historical reports remain unchanged. `ledger.json` retains compact receipts and hashes. The workflow run remains for the orchestrator to verify after publication. No data acquisition or app code change occurred in this test work. Usage metrics: unknown.
