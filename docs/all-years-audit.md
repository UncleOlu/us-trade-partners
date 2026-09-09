# All-years view and table alignment

Owner request: add an All years choice to aggregate the covered years, and center figures below the home ranked-partner table headings.

Scope starts from 4068ad9c2a98a99a42d02f6c8a9039f6403e7a50 on branch all-years-view. Preserve the existing app, snapshot, pipeline and release. Use year=all across home, partner, section and hub views so links do not change the chosen period. Single-year behavior and annual trends remain available.

Decisions stated to the owner:

- All years means the sum of 2013-2025 nominal USD, not an annual average or an inflation-adjusted figure.
- A missing required year makes the cumulative flow absent. This may leave partners without an all-years rank, but does not present an incomplete history as a complete total. Structural not_applicable entries contribute no value; all-not_applicable stays not_applicable.
- World totals sum the separately fetched annual world totals. EU follows the membership used in each annual record and does not enter world sums.
- Prepare the home cumulative view during the app build so the browser does not need 13 summary downloads. This adds a small derived app artifact, without changing canonical data or the pinned release.
- Keep the map's fixed USD scale. Cumulative totals may put more countries in the darkest bands.
- Center home rank and money columns as requested. This aligns each value with its heading; right alignment would make digit-length comparisons easier. Partner names stay left-aligned.

Acceptance: independent integer sums and missing-data fixtures; year=all state across navigation/refresh; annual charts retained; exact values and period-labeled CSV; fixed world totals under filtering; map period labels; centered header/value geometry; mobile scrolling; full TypeScript/build; deterministic derived artifact; existing gzip budgets; deployed verification and final read-only audit.

Independent checks: 8 unit cases passed with 3,832 flow values compared using BigInt arithmetic. The built home view passed a separate 948-value comparison. Its 87,853 bytes match across two builds: SHA256 `bc55f3b65c66b9d60b1a2d8e7cfa0587d4ddde0526eb6ac6304aa2d113d8fea7`.

All-years total trade is complete for 228 of 236 partners. Eight partners retain missing totals and no rank: 2390, 5070, 5790, 6022, 6029, 6225, 7370 and 8220. World total trade is $57,121,401,648,177. Search and visible rows do not change this total.

The initial audit found a missing-record defect: partner and section views used years present in their rows as the required range. The fix uses metadata coverage. A browser fault test removes an entire annual record and confirms the period stays 2013-2025 and the total becomes missing. A second visual pass found clipped period controls and a detached section label. The control fix gives the full period more width and keeps each section label with its select. This leaves less desktop space for search; mobile controls still use separate rows.

Evidence is in `reports/tests/all-years/`. Final build, deployment and read-only audit results follow there. No Census acquisition, canonical data, pipeline or release change forms part of this task. Usage and billing metrics are unknown.

Local acceptance passed: full TypeScript including map, production build and rendered methodology; 9 distinct all-years browser cases across the final run and affected control rerun; 6 affected annual regression cases. The annual regression selects the changed URL, navigation, year-control and responsive behavior rather than repeating unchanged failure-injection tests. Root inspected the desktop map/table and mobile home, hub and section images.

Final local gzip budgets use the established sum of response bodies compressed at gzip level 6: home All years 137,318 bytes, home 2025 137,269 bytes, largest partner 1220 All years 267,246 bytes. All pass the 250,000/300,000-byte limits. These are budget calculations, not measured production transfers.

Publication checks: Gitleaks scans of staged publication files and built dist each exited 0 with no findings. Targeted private-path, personal-email and em dash checks found no matches outside exempt saved third-party source evidence.

Clean-source proof passed without copied data or node_modules: npm ci, download and SHA verification of the pinned release, restore of 274 canonical JSON files, and production build. The clean build matches the local index and derived JSON hashes. This pre-commit proof used a clean source export; the Pages workflow provides the committed-checkout proof. npm ci reports four existing dependency findings, three moderate and one high. This task changes no dependencies; dependency remediation remains outside this UI update.

Deployment: implementation commit `eaef5f6`, published source `9aa6990c7b97ad6d05a058d7b5396c2a2d8802fb`. [Pages run 34404959040](https://github.com/UncleOlu/us-trade-partners/actions/runs/34404959040) passed the committed checkout, pinned restore, full build and deployment. [Open All years](https://uncleolu.github.io/us-trade-partners/?year=all).

Production: 8 of 8 browser cases passed with no unexpected console or page errors. The missing-record fault case runs locally only. Live index SHA256 `8d7f822291346420a31451c58c64ba9b1c3ffa2bfebcab03c6a76e1ea28bd328` and the derived JSON SHA256 above match the tested clean build. Root inspected live desktop table and mobile hub screenshots plus the page in Chrome. All assets returned successfully. The reports list each requested asset and content encoding.

| Production route | Gzip budget bytes | Measured cold transfer bytes |
|---|---:|---:|
| Home All years | 137,318 | 141,949 |
| Home 2025 | 137,269 | 141,870 |
| Partner 1220 All years | 267,246 | 276,054 |

Cold transfer uses Chrome encodedDataLength with cache off and service workers blocked, including reported response headers and redirects, excluding TLS and transport overhead. Responses use gzip; redirect responses, where present, use identity encoding. These measurements are separate from the local gzip budget calculation. See `reports/tests/all-years/live/` for screenshots, exact CSV receipts and asset lists.

Final read-only audit: APPROVED. The independent reviewer checked source, workflow and hash receipts, test results, per-asset transfer reports, and desktop/mobile screenshots. Both implementation findings remain closed. Browser coverage uses Chromium. The final evidence-only commit does not change app or build inputs and skips a redundant deployment; the deployed source remains the verified commit above.
