# Takeover independent tests

The tests use schema/, raw/, fixtures, and published data. This test agent did not read pipeline implementation code.

## Final data checks

Command (from repository root):

```sh
DATA_DIR=reports/pipeline/final_build_a/20260909T091429Z-c638aff167ea DATA_A=reports/pipeline/final_build_a/20260909T091429Z-c638aff167ea DATA_B=reports/pipeline/final_build_b/20260909T091429Z-c638aff167ea .venv-tests/bin/python -m pytest tests -q
```

Result: 128 collected, 128 passed, 0 failures, 0 errors, 0 skips. No warnings reported. Time: 68.99 seconds. Full output: final-pytest.txt. The byte identity test executed against separate final build directories. It rejects identical input paths and empty directories. The prior default-discovery skip now uses temporary fixtures for missing, single, and ambiguous snapshots.

Environment: Python 3.12, pytest 9.1.1, jsonschema 4.26.0, referencing 0.37.0. The runtime .venv lacks schema-test packages; .venv-tests contains them.

## Browser checks

Command: `node tests/e2e/run.mjs`. Six collected, six passed, zero failures and skips. Full output: final-trend-routes.txt. These checks cover four partner trend charts, including absent observations for Norfolk Island, plus hub and section rendering.

Command: `node tests/e2e/audit.mjs`. Eight groups cover home display/search/world totals, URL state and section sorting, map mouse and keyboard selection, methodology metadata, exact values and CSV, all 261 known route HTTP responses, desktop/mobile layouts and screenshots, and cold-load network measurements. Final local result: eight collected, eight passed, zero failures or skips. Results: final-local-audit.txt and local-audit/results.json. All 261 known route HTTP checks passed. Home map size: 1068 x 562 at desktop width. Search and all-row checks found 236 partners. Local measured identity transfers: home 550,993 bytes, partner 1,506,351 bytes. These are not production measurements.

Visual review: inspected full desktop home and full mobile hub, then viewport mobile home, mobile hub, and desktop hub. No horizontal page overflow or clipped content found. The hub is long because it lists all sections and partners; full-page screenshots alone are too tall for useful text review, so viewport screenshots accompany them.

Production command: `BASE_URL=https://uncleolu.github.io/us-trade-partners/ node tests/e2e/audit.mjs`. Source: caa2547, deployment run 34396398376. Result: eight groups collected, eight passed, zero failures and skips. All 261 known routes returned HTTP 200 after canonical redirect and kept query state. The browser checks cover direct entry and refresh for home, partner, section, hub, and methodology, year/rank state, map mouse/Enter/Space, exact values, CSV, missing-data labels, no console errors, numeric no-wrap, and mobile table scrolling.

Production evidence: deployed-audit.txt, deployed/results.json, deployed/network.json, and full plus viewport screenshots for all five page types at 1280 x 900 and 390 x 844. This agent viewed all ten viewport images. The coordinator also viewed all ten. No page overflow or broken layout found. The official section XVI title occupies most of the first mobile screen; content continues below. The hub is long and uses the full official section names. These are display limits, not failed checks. The mobile partner default screenshots were recaptured after the scroll test; mobile-partner-5700-scrolled.png preserves scroll evidence.

Independent measured cold-load transfers: home 133,192 bytes across seven requests; partner 264,032 bytes across seven requests, including a 422-byte canonical redirect. All final resource responses reported gzip; no disk-cache or service-worker responses. The helper did not record encoding for the redirect. A separate HEAD response recorded in deployed/partner-redirect-headers.txt has no Content-Encoding header. The transfer totals come from CDP, not that HEAD request or local compression. The coordinator reports the agreed local gzip calculation separately.

An extra all-route browser run was stopped at the coordinator's request because the primary suite already met route coverage. deployed/extra-interrupted.json labels its browser-closed errors as interrupted work, not application defects or final audit findings.

CDP network measurements use fresh contexts with cache disabled. Each request records URL, encoded transfer bytes, content encoding, status, cache state, and completion. Navigation failures, incomplete responses, and failed assets fail the check. This total includes response headers and differs from the local gzip-budget calculation. Local static-server traffic uses identity encoding and cannot establish deployed transfer size.

## Prior runs

preliminary-pytest.txt records the earlier 126 passed and two skips before final inputs and test updates. preliminary-audit.txt is superseded: it records a methodology mismatch when final data replaced the old build before dist rebuilt. Earlier development runs also exposed incorrect test selectors for legend SVGs and uppercase country names; the final tests use explicit map role and country selectors. These are retained as history, not claimed as final passes.

## Usage

Current Codex model. Uncached input, cache writes by duration, cache reads, output, and cost: unknown. No billing estimate made.
