# Table sorting local audit

All ten distinct browser cases have a latest PASS result. Five unit cases, six affected annual regressions and one all-years navigation case also pass. No skips. See ledger.json for separate run counts and source hashes.

## Coverage

The browser compares each of 27 sortable columns in both directions across home partners, section partners, partner yearly values, product groups and chapters: 54 complete-order comparisons, covering 6,492 row positions. Both rendered table and CSV order match independent annual JSON expectations. CSV exact integers and statuses also match the input. Natural Norfolk data tests absent years; negative balances, zero values, blank descriptions and numeric ties occur in the samples. Unit fixtures add near-limit exact integers, mixed-case text, stable identity ties and missing/NA rules. Expected ordering does not import the product comparator.

Keyboard headers expose aria-sort and a visible direction. Tests cover URL sort keys/directions, refresh, Back, year changes, invalid choices, rank-dropdown synchronization, independent remembered home/section sorts through Hub, retained group selection, full home export after search and first-25 limits. Financial rank remains the descending rank of the selected money metric even when row order differs. Sorting does not change total cards or chart geometry.

Geometry checks compare the actual heading text Range center, not only header/cell boxes. Final centered labels are within 1px of the column center, targets are at least 44px high, numbers stay on one line, and scroll stays within containers. Exact USD product groups and a 320px exact yearly table receive extra checks. Ten representative table screenshots cover all five tables at 1280px and 390px; all were inspected. The extra yearly check confirms each year stays on one rendered line.

## Findings resolved

Initial browser run: five passed, five failed. One real CSS defect compressed the header grid so Rank text sat 14.664px off center at narrow width. The fix gives header text its full required width. Three chart assertions found only floating-point SVG coordinate differences near 1e-14; tests now require the same path count, commands, coordinate count and order with an explicit 1e-8px numeric tolerance. Exact data, sort and CSV checks use no tolerance. The remaining failure came from checking Show first 25 before expanding the list; the test now expands then checks the truthful collapse label.

A four-case diagnostic run retained three chart false failures before the tolerance fix. The final four affected cases pass, including all partner column pairs and geometry. Combined with retained passing cases, all ten distinct cases pass. This is not one ten-case final run. Prior reasons are bounded in published reports; full diagnostic text remains outside publication. No full datasets or CSV bodies are duplicated in these reports.

Six annual checks cover URL normalization/context, Back, stable select/slider during racing requests, and responsive behavior. The separate all-years check covers navigation, refresh and Back. No pipeline or acquisition tests were rerun for this UI change.

## Build and budgets

Final local index SHA256: `9eb20ec87aba080e0007de3602d8c6eb9233709cdd83a9c2c479a79b15bd95bb`.

| Route | Computed gzip bytes | Budget | Result |
|---|---:|---:|---|
| Home 2025 | 138,993 | 250,000 | PASS |
| Home all years | 139,042 | 250,000 | PASS |
| Partner 1220 all years | 269,082 | 300,000 | PASS |

Budget uses response bodies compressed locally with Node zlib gzip level 6. Local payload reports list assets and separate local transfer counts. Production checks now pass ten of ten cases; measured deployed transfer is in live/summary.md. Build.txt records the final successful build supplied by the app agent. No app source was edited by the test agent.

Wider, accessible headers require more horizontal scrolling on narrow screens. Text names and descriptions can wrap into taller rows; numeric values remain single line. These are the main layout trade-offs.

## Reproduction

- `node tests/e2e/table-sorting-unit.mjs`
- `node tests/e2e/table-sorting.mjs`
- `TABLE_FILTER='years:|groups:|chapters:|sort controls preserve' TABLE_RUN=final-affected node tests/e2e/table-sorting.mjs`
- `ROBUST_REPORT_DIR=reports/tests/table-sorting/annual ROBUST_FILTER='invalid year|valid year|back and forward|select stays|slider stays|responsive layouts' node tests/e2e/robustness.mjs`
- `ALL_FILTER='all period survives' ALL_RUN=sorting-navigation node tests/e2e/all-years.mjs`

Use BASE_URL for production; reports go to live/ without replacing local evidence. Usage metrics and cost are unknown.
