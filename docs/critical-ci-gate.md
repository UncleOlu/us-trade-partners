# P0: critical deployment gate

Owner approved P0 from the reliability plan: run existing critical tests in deployment CI and block publication on failure. Scope excludes UI refactoring, dependency upgrades, new data acquisition and the full pipeline audit.

The Pages workflow runs `npm run test:critical` after the build and before the Pages artifact upload. The deploy job depends on the successful build job. Diagnostics upload runs even after a failed test and retains only `reports/tests/ci/` outputs for seven days. These include logs, receipts, screenshots and bounded CSV test evidence. It does not upload canonical snapshot directories or raw responses.

Fixed gate: eight aggregation unit cases, five sorting unit cases, ten sorting browser cases and five selected all-years browser cases. A separate derived-data check verifies 948 values. The runner must reject failed processes, skipped or missing cases, invalid receipts, unexpected names/counts and timeouts. External URLs and test-selection overrides cannot reduce this CI gate.

Trade-offs: CI takes longer, but a failed gate preserves the current live deployment. This gates deployment, not direct commits to main. Short-lived diagnostics limit storage; stable summary evidence stays in the repository. Existing broader data, archive and visual audits remain separate. Expected-case changes require a reviewed manifest update.

Deferred UI note from read-only review: wrapped product-group button text can remain centered inside its left-aligned cell. This pre-existing detail is outside P0 and belongs in the shared-table follow-up. The earlier cell-alignment checks did not establish button-text alignment.

Seventeen subprocess self-tests passed. They cover valid results, child failure, zero tests, skips, wrong names/counts, absent or malformed receipts, stale output, wrong browser target, failed integrity checks, disallowed overrides and timeouts. Review found that an early-exiting parent could cancel the delayed process-group kill. The fix also kills the remaining group when a timed-out parent closes; a descendant that ignores termination now passes the cleanup check.

One fresh local build and full gate passed: 28 tests, 948 derived checks, no skips. This includes 3,832 flow-value comparisons and 54 sort-direction checks. The built index is unchanged at SHA256 `9eb20ec87aba080e0007de3602d8c6eb9233709cdd83a9c2c479a79b15bd95bb`. Runtime outputs stay in ignored run directories; the compact ledger is in `reports/tests/critical-ci/`.

The actual GitHub Actions result will be recorded after execution. Usage and billing metrics are unknown.
