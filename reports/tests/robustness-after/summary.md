# Final local UI regression ledger

Final status: 24 distinct focused cases have passing latest results. The six earlier chart/route cases and eight behavior groups also passed. The behavior suite includes all 261 known HTTP routes. No active test failure or skip remains.

The 24-case result combines retained checks and affected reruns. It does not claim one 24-case run against the last CSS build. Source work started from b19843c. Snapshot and pipeline metadata stayed unchanged. Final build: final-build-css.txt. Final index SHA-256: `4bed7d1bb619a035f073c1376e98cf7f6f5fc917059e4c8420e47bde7885852f`. Index file time: 2026-09-09T20:13:22.662Z.

## Run ledger

| Evidence | Completed UTC | Collected | Passed | Failed | Skipped |
|---|---|---:|---:|---:|---:|
| results.json | 2026-09-09T20:05:37.406953+00:00 | 19 | 19 | 0 | 0 |
| results-final-affected.json | 2026-09-09T20:10:33.433779+00:00 | 6 | 5 | 1 | 0 |
| results-final-css.json | 2026-09-09T20:14:23.859234+00:00 | 4 | 4 | 0 | 0 |

The first run passed 19 cases. The next run added two methodology timeouts and a recovery-link check, and repeated three affected checks. Its single failure came from a test selector that required a trailing slash in the root link. The link retained the correct year/rank; the test now selects the named home-page link. The final four-case run passed that corrected check, both new geometry checks, and final responsive checks.

The retained cases cover unchanged behavior. Sixteen first-run cases were not repeated. The stricter wrong-shape check and map guide check passed in the affected run. Both actual methodology header/body timeout fixtures passed there. Final CSS geometry and screenshots passed after the last app edit. There were 29 focused case executions across these runs: 28 passes and one superseded selector failure. Zero pageerror events appeared in all three reports. The lazy-page case deliberately blocks a page file to test its error boundary; failed resource requests in fault tests are intentional.

Legacy evidence: legacy-browser.txt has 6 collected, 6 passed, 0 failed, 0 skipped. legacy-audit.txt has 8 collected, 8 passed, 0 failed, 0 skipped, including 261 route HTTP/query checks. Those results predate the last two CSS fixes; the final geometry and responsive cases cover those CSS changes. Do not add repeated case executions to the count of distinct focused cases.

## Setup failures retained as evidence

- legacy-browser-setup-failed.txt: source map.css changed 1.627 seconds after dist/index.html during a build. Metadata was byte-identical. The freshness guard correctly refused the mixed build. A stable rebuild then passed all six checks. No guard or pipeline metadata changed.
- build-sandbox-blocked.txt: the sandbox denied the local HTTP listener needed by build verification. The approved build reran with local-server access and passed.

Neither setup failure is a passing test or a current product defect.

## Final gzip budgets

| Route | Local gzip body sum, bytes | Budget | Result |
|---|---:|---:|---|
| /?year=2025 | 135425 | 250000 | PASS |
| /?year=2013 | 135611 | 250000 | PASS |
| /partner/1220?year=2025 | 263469 | 300000 | PASS |

Evidence: payload-home-2025.md, payload-home-2013.md, payload-partner-1220.md and matching JSON files. Each uses gzip level 6 on response bodies in a cold browser context. This is not a deployed network transfer measurement. Initial payload reports remain under initial-payload-* and are superseded by the final files. Each final scan has zero incomplete assets and zero console errors.

## Visual evidence and limits

Final screenshots cover home, partner, hub, section, and methodology at 1280, 390, 320, and 640 CSS pixels. Desktop and mobile also have full-page images. The 640-pixel view is an equivalent reduced viewport for reflow review, not an actual browser zoom measurement. Keyboard table-scroll evidence has its own narrow-partner-table-focus.png image. Default narrow partner and map-detail images supplement the overview shots.

The test agent inspected desktop/mobile/320 overview images, plus reduced-viewport images and separate map views. Tests verify no horizontal page overflow; tables retain their own scroll areas. At maximum horizontal scroll, three hit-test points prove the last product-group value is fully uncovered at 320/390. Expanded world exact values fit inside their card at 320/390/640/1280 and keep keyboard focus. Bigger controls, the controls-before-map layout, nonsticky product names, and expanded KPI cards use more space; these are the approved design trade-offs.

This is a bounded browser and visual audit, not an accessibility certification. No data or pipeline tests reran because this work changed UI and its tests only. Earlier data validation and 128-test results remain separate evidence.

## Case list

| Case | Latest result | Evidence |
|---|---|---|
| atlas failure offers retry and keeps table usable | PASS | results.json |
| back and forward restore year with matching values | PASS | results.json |
| data failure 404: visible recovery restores pinned snapshot | PASS | results.json |
| data failure 500: visible recovery restores pinned snapshot | PASS | results.json |
| data failure invalid JSON: visible recovery restores pinned snapshot | PASS | results.json |
| data failure wrong shape: visible recovery restores pinned snapshot | PASS | results-final-affected.json |
| data failure wrong snapshot: visible recovery restores pinned snapshot | PASS | results.json |
| data timeout is bounded and retry restores the page | PASS | results.json |
| exact KPI values fit the card and keep keyboard focus | PASS | results-final-css.json |
| failed lazy page shows recovery rather than a blank app | PASS | results.json |
| home filtered search preserves totals and full-export scope | PASS | results.json |
| hub search keeps all partners and sections reachable | PASS | results.json |
| invalid year/rank query recovery agrees with visible state | PASS | results.json |
| map has one tab stop, arrow navigation, escape and keyboard selection | PASS | results-final-affected.json |
| methodology body timeout is bounded and retry restores content | PASS | results-final-affected.json |
| methodology headers timeout is bounded and retry restores content | PASS | results-final-affected.json |
| methodology normal and boundary recovery links keep context | PASS | results-final-css.json |
| missing reasons are available by tap and keyboard | PASS | results.json |
| product group max scroll reveals the full last numeric column | PASS | results-final-css.json |
| responsive layouts, focus and keyboard table scroll | PASS | results-final-css.json |
| section choice survives share/refresh and exact-value clicks are separate | PASS | results.json |
| select stays mounted and focused during rapid year changes; latest response wins | PASS | results.json |
| slider stays mounted and focused during rapid year changes; latest response wins | PASS | results.json |
| valid year/rank, header and hub navigation keep context | PASS | results.json |

## Reproduction

`node tests/e2e/robustness.mjs` runs all current focused cases against the local static build. `ROBUST_FILTER` selects affected case names; `ROBUST_RUN` writes a separately named result file. No subset overwrites the first result. `node tests/e2e/run.mjs` runs the six legacy cases. `AUDIT_REPORT_DIR=reports/tests/robustness-after/legacy-audit node tests/e2e/audit.mjs` runs the eight behavior groups.

Production normal-flow checks use BASE_URL and write robustness-live. The runner explicitly excludes all fault-injection cases in that mode. Production results are pending and are not included above.

Usage: current Codex model. Uncached input, cache writes by duration, cache reads, output, and cost are unknown.
