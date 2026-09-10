# Critical CI gate local evidence

`npm run build && npm run test:critical` passed once against the fresh local production build. All five fixed suites completed: 8 aggregation unit tests, 5 sorting unit tests, 10 sorting browser tests and 5 selected all-years browser tests. Total: 28 tests, 0 skips, plus 948 derived-data checks. Aggregation compared 3,832 flow values; sorting checked 54 column/direction orders.

The fixed entry point rejects external URL, filter and output overrides. It checks exact test names and counts, PASS status, local browser target, no browser errors and the starting index hash. Missing, stale or malformed receipts and failed children block the gate. Each browser suite has a 180-second limit; units have 60 seconds; the whole gate has 600 seconds.

Seventeen actual subprocess fixture checks passed. They include nonzero exit, empty results, NOT RUN, wrong names/counts, missing/malformed/stale receipts, timeout, a descendant that ignores TERM, bad browser/integrity receipts and four forbidden overrides. Timeout cleanup sends SIGKILL to the process group even when its leader exits first. The first sandboxed descendant check could not run the process inspection command; the permitted rerun verified cleanup.

Generated diagnostics stay in ignored `reports/tests/ci/`. Existing historical reports remain unchanged. `ledger.json` retains compact receipts and hashes. The workflow run remains for the orchestrator to verify after publication. No data acquisition or app code change occurred in this test work. Usage metrics: unknown.

## First Linux run and chart timing fix

Run 34434140746 failed three partner sorting cases. The gate blocked Pages artifact upload and kept diagnostics. `linux-failure.json` preserves the failed results. The original local pass did not prove Linux timing was safe.

The three line series disable animation, but bars use the installed Recharts 400 ms default. A direct browser observation with CPU throttling showed the first bar path change for about 400 ms before settling (`chart-motion.json`). The failed coordinate was on that first bar. This supports an animation timing cause; the original failed run did not capture coordinate values.

The test now waits up to 5 seconds for all chart paths to stay unchanged for 600 ms. It then retains the original 1e-8 coordinate tolerance, path order and command checks. Failure text now includes actual, expected and delta. Exact row and CSV assertions remain unchanged. This adds bounded test time, with no app change.

Only the three affected local cases reran: 3 passed, 0 failed, 0 skipped, 28 column/direction orders. Results are in `chart-fix/results.json`. The next Linux workflow must run the full fixed gate before publication.
