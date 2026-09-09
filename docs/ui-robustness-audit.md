# UI robustness audit and design decisions

Scope: improve the existing app at /us-trade-partners/ after source b19843c. Keep the current snapshot, pipeline, release pin, data definitions, base path, and 250,000/300,000-byte gzip budgets. No new Census acquisition. User approved UI audit and fixes, with every design trade-off stated.

## Observed defects

- Live /?year=abc shows Loading with no recovery. Source also mishandles year=0.
- Partner and section pages can display a different year from the invalid year in the URL.
- Navigation drops year and rank. Partner chapter-group selection is local state rather than shareable URL state.
- Async state can expose a previous request's data for a render and lacks unmount cleanup invalidation.
- No render error boundary protects the app from malformed data or failed lazy route loading.
- Search and ranking controls follow the large map and 12-row default legend.
- About 170 mapped countries each consume a Tab stop. SVG image semantics can hide interactive descendants.
- Tooltip has no styled surface or viewport limits. Atlas abort/ref logic can strand StrictMode loading.
- Hub has no search and puts 22 long category links before 236 partners.
- Full official section text consumes most of a mobile first screen.
- Table scroll regions lack keyboard access and names. Clickable section rows are not keyboard controls.
- Default controls are small, active navigation is unclear, and implementation terms appear in main user flows.

## Design and trade-offs

1. Use one shared visual system: navy headings, restrained teal actions, warm gray page, white cards, readable system fonts, clear focus rings, generous control targets, and aligned numeric columns. Larger controls consume space; compact data rows remain readable. No new font or UI package is needed.
2. Put year, partner search and rank controls before charts. Keep the full-width map prominent, with a results jump link. Controls push the map down slightly, but users can start a task without scrolling through it.
3. Short section titles improve scanning. Keep the complete official name visible as supporting text or in a clearly labeled disclosure. Do not alter source names in data or CSV.
4. Hub uses distinct partner and section areas, year control, search, and orderly cards/lists. Keep every partner and section accessible. Extra controls replace the dense all-link wall.
5. Map retains direct click/tap to partner, fixed red/blue bands and no-data pattern. One roving keyboard stop uses arrow keys, Home and End, with Enter/Space to select. Alphabetical order is predictable but not geographic. A search/results link covers tiny or missing shapes.
6. Use a reserved in-flow map readout instead of an unbounded floating tooltip. It uses vertical space but prevents overlap and layout shifts. Compact legend labels must state exact band meanings.
7. Normalize invalid year/rank/group URLs with replace navigation and an explicit notice. Valid selections stay in the URL across navigation and refresh. Notices add text but avoid hidden fallback or stuck loading.
8. Loading, empty, failure, and not-found states offer a clear next action. Fail closed on bad data rather than showing stale or invented figures. Extra loading transitions can briefly hide prior content to avoid mixing years.
9. Tables keep exact values, status labels, CSV exports, and contained horizontal scrolling. Named keyboard scroll regions and clear hints make overflow usable. Full columns remain accessible rather than hidden on narrow screens.

## Acceptance checks

- Confirm invalid/missing years, rank and group values do not cause a dead end, false label, or silent wrong data.
- Share/refresh preserves valid year/rank/group; Back/Forward and route navigation preserve context.
- Slow or failed responses cannot overwrite a newer selection. Failed JSON, bad shape, failed atlas, and failed lazy page show recovery.
- Home has 25 rows by default, search covers all partners, all rows remain available, counts are clear, and world totals are invariant under filters.
- Keyboard can skip navigation, enter and leave the map, select a country, select a product group, and scroll a table.
- Desktop, mobile 390px and narrow 320px layouts; 200% zoom/reflow; visible focus and useful controls.
- Methodology has no markers, and all metadata still matches the pinned snapshot.
- Full TypeScript check includes map; meaningful browser regression tests, current payload checks, screenshot review, and final read-only review.

Usage and billing metrics remain unknown. Implementation and final results follow below after verification.

## Additional decisions stated before implementation

- Tables use one Show exact USD switch per view. Numeric table cells are static text with hover titles rather than hundreds of separate keyboard stops. The trade-off is that exact mode changes all table values together. KPI cards retain individual tap controls; missing-value reasons remain accessible disclosures. CSV values do not change.
- Data and atlas fetches time out after 30 seconds, including body reads, and show retry. Very slow connections may need another attempt. This explicit limit prevents an indefinitely pending request from leaving the view with no next action.
- Keep year and rank across routes. Keep section only where it represents a partner product selection; do not produce contradictory section path/query combinations.

Review refinement: changing year must keep the year controls mounted and focused while only the result region shows loading or failure. This prevents a slider drag or keyboard change from losing its target. Old figures must not appear beneath the new year label. A pending request shows loading feedback rather than a false zero-result count.

Visual review refinement: the default mobile map readout left too much blank space. It now shows a short guide to the map colors until a country has focus. This adds help text in the reserved area and keeps the layout still when values appear. The 244px mobile reserve accommodates long country names and exact values. The map uses alphabetical keyboard travel rather than geographic travel; small or missing shapes remain available through search.

Independent review found three issues in the first implementation pass: product-button accessible names omitted visible product names; methodology markdown requests lacked the same timeout as data requests; and two internal recovery/diagnostic links lost year and rank. These require a separate fix and affected tests before publication.

Test scope: responsive captures at 640px represent the available width of a 1280px window at 200% zoom. They do not prove actual browser zoom or screen-reader operation. Keyboard, touch targets, names, focus and contained table overflow have direct browser checks. Runtime guards protect fields used by the UI; the existing full schema and data checks remain part of snapshot production. The UI adds no schema-validation package.

Narrow-screen review found that the sticky product-name column could cover numeric columns: at 320px the scroll region was 254px wide while the sticky name column was about 309px. The fix lets product names scroll with their values. The stated trade-off is that names can leave view during horizontal scrolling. Short rank/year/chapter columns can remain sticky. Acceptance includes actual uncovered numeric-cell width at maximum scroll, not just evidence that scrollLeft changed.

Exact-value review found a second clipping issue: at 320px an exact world-total button was about 201px wide inside a 140px card. Keyboard arrows did not reveal the clipped digits. An expanded exact-value card now uses two grid columns and returns to its normal width when closed. The stated trade-off is that later cards move while a value is open. This preserves readable text, one-line numbers, and focus. Acceptance checks the button bounds against the card, including narrow and desktop layouts.

## Final local build and publication checks

- `npm run build` passes full TypeScript, including src/map, route generation, and rendered methodology metadata checks. Final heading-fix evidence: reports/tests/robustness-after/header-fix-build.txt.
- Gzip level 6 body-sum budgets after the heading fix: home 2025 135,455 bytes; home 2013 135,641 bytes; partner 1220 263,497 bytes. Limits: 250,000 home and 300,000 partner. These are reproducible local compression calculations, not measured deployed transfers. Per-asset reports are in reports/tests/robustness-after/payload-*.md.
- Gitleaks directory scans of src, tests/e2e and dist exited 0 with zero findings. Reports were written outside publication artifacts. Filename-only checks found no private home paths, Gmail addresses or em dashes in changed source and new reports. `git diff --check` passed.
- GitHub authentication resolves to UncleOlu. Origin and the existing Pages target match the approved repository. A remote fetch found no divergent source commits before publication.
- Pipeline, data, schema, dependency files, deployment workflow and the release pin have no changes from b19843c. The snapshot remains 20260909T091429Z-c638aff167ea, built by e15309d0cf6468d4b4d64d00555aa33711221b89. The immutable release and both checksums remain in reports/pipeline/current_release.json. No data validation or raw rebuild was needed for this UI-only change; earlier pipeline evidence remains separate.
- Focused browser coverage: 24 unique cases pass, with zero skips. The initial 19-case receipt is results.json; results-final-affected.json records six affected/new cases and one obsolete selector failure; results-final-css.json passes all four final cases, including the corrected context-link test. Taking the latest result by test name gives 24 passes and no unresolved failures. This is a cumulative ledger with affected reruns, not a claim of one 24-case final run.
- Existing regressions pass: 6 browser tests and 8 audit groups, including all 261 generated routes. Evidence: reports/tests/robustness-after/legacy-browser.txt and legacy-audit.txt. Tests used the pinned dataset and retained exact-value, CSV, missing-data, map and route checks.
- Local ledger: reports/tests/robustness-after/summary.md and ledger.json. The independent chief-of-staff re-audit approved the first UI commit before the heading issue below was found. Its index SHA-256 was 4bed7d1bb619a035f073c1376e98cf7f6f5fc917059e4c8420e47bde7885852f. The later heading fix needs its own affected review. A separate Gitleaks scan of the new after-reports also exited 0.

## Final table-heading correction

Source 02393fc55297d265f3bd28bcb6c5c45beef3455e passed GitHub Pages run 34400235244. A final horizontal-scroll review then found that fixed year values could remain below a different column's heading after the Year heading scrolled away. A separate CSS correction pins the matching first heading for tables with fixed first body cells. Product-group headings and names both remain free to scroll. This makes the existing fixed-column choice consistent without changing data or interactions. At 320px and 390px, the corrected Year heading and body cell share the same bounds; the last numeric column remains visible. The final production audit must cover this correction too.

The fixed identifier column uses some available width. Intermediate edge columns can be partly visible at a given scroll position, including maximum scroll. This is a stated horizontal-scroll trade-off, not a claim that all columns fit at once. Users can move the table to read each column; wide product labels do not stay fixed. The header regression passes at both narrow widths after replacing an ambiguous test region locator with the table's named scroll region. The geometry assertions did not change.

The independent read-only re-audit approved the CSS correction. The final cumulative ledger now has 25 unique cases, all latest results PASS, with zero skips. The final index SHA-256 is ea825b4bfa5a1d35b5bde3b8ac6ae63028a979cae8d143466abcd2f2f5879c9e. Header evidence: header-fix-build.txt, header-check.txt, results-header-check.json and the 320/390 table-maxscroll screenshots under reports/tests/robustness-after/. No required local fixes remain.

## Production result

Live app: https://uncleolu.github.io/us-trade-partners/?year=2025

Repository: https://github.com/UncleOlu/us-trade-partners

Audited UI source: 26d08bddf47e1e5eb4dc04976e1ed77ca74f0f26. GitHub Pages run 34401062519 completed successfully. The production index returned HTTP 200 and its SHA-256 matches the final local index above. The workflow used a clean checkout, verified the pinned snapshot archive, checked type drift, built the app, and checked rendered methodology metadata.

- Production normal-flow checks: 12/12 PASS, zero skips and zero page errors.
- Production audit: 8/8 groups PASS, including all 261 routes. This covers direct entry and refresh, URL state, keyboard selection, exports, missing values, metadata and responsive behavior.
- Fault injection ran locally only. The local cumulative count remains 25 passing focused cases, plus 6 legacy browser tests and 8 legacy audit groups.
- No app source changed after the audited UI commit. The later screenshot-helper change only crops test evidence to the visible table area; it does not change geometry assertions or deployed assets.

| Cold route | Gzip body-sum budget bytes | Limit | Measured CDP transfer bytes |
|---|---:|---:|---:|
| Home 2025 | 135,455 | 250,000 | 139,786 |
| Home 2013, largest home payload | 135,641 | 250,000 | 139,937 |
| Partner 1220, largest partner payload | 263,497 | 300,000 | 272,152 |

All requested assets completed. Successful responses used gzip. The partner canonical-path redirect used identity encoding. CDP transfer counts include response headers as reported by Chrome and redirect bytes, but exclude TLS and transport overhead. Gzip body sums use local gzip level 6 and are a separate budget calculation. Per-asset URLs, encodings and sizes are in [production payload reports](../reports/tests/robustness-live/summary.md).

The orchestrator inspected production desktop and mobile viewport images for home, partner, section, hub and methodology, plus both map captures. Agent D also inspected all 20 viewport states and four maximum-scroll proofs. Selected evidence: [desktop map](../reports/tests/robustness-live/desktop-map.png), [mobile home](../reports/tests/robustness-live/mobile-home-viewport.png), [desktop hub](../reports/tests/robustness-live/desktop-hub-viewport.png), [mobile hub](../reports/tests/robustness-live/mobile-hub-viewport.png).

No known blocking UI defects remain in the tested flows. Limits: browser checks used Chromium; no screen-reader session, Safari audit or actual browser zoom test ran. The 640px captures test equivalent layout width. Small shapes and 66 partners without a map shape require the search/list path. Wide tables require horizontal scrolling, and exact summary cards expand when opened. Slow requests time out after 30 seconds and may need a retry. Full names remain in disclosures, and exact table mode affects the whole table. No billing or token-cost estimate is available.

Data storage and reproducibility remain unchanged. The [release pin](../reports/pipeline/current_release.json) records snapshot, pipeline commit, immutable built/raw release identity and both SHA-256 checksums. The earlier archive/rotation and data-validation results remain in [the continuation audit](continuation-audit.md); this UI pass did not rerun or alter that pipeline.

Final independent read-only verdict: APPROVED for the deployed UI, with no unresolved material findings. The auditor inspected deployment, index hash, commands, results, payload encodings and production screenshots. It did not rerun the browser tests itself. Later evidence-only commits can be verified with a successful deployment receipt and the same index hash; any app change requires affected tests again.
