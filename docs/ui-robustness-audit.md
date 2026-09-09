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

- `npm run build` passes full TypeScript, including src/map, route generation, and rendered methodology metadata checks. Evidence: reports/tests/robustness-after/final-build-css.txt.
- Gzip level 6 body-sum budgets: home 2025 135,425 bytes; home 2013 135,611 bytes; partner 1220 263,469 bytes. Limits: 250,000 home and 300,000 partner. These are reproducible local compression calculations, not measured deployed transfers. Per-asset reports are in reports/tests/robustness-after/payload-*.md.
- Gitleaks directory scans of src, tests/e2e and dist exited 0 with zero findings. Reports were written outside publication artifacts. Filename-only checks found no private home paths, Gmail addresses or em dashes in changed source and new reports. `git diff --check` passed.
- GitHub authentication resolves to UncleOlu. Origin and the existing Pages target match the approved repository. A remote fetch found no divergent source commits before publication.
- Pipeline, data, schema, dependency files, deployment workflow and the release pin have no changes from b19843c. The snapshot remains 20260909T091429Z-c638aff167ea, built by e15309d0cf6468d4b4d64d00555aa33711221b89. The immutable release and both checksums remain in reports/pipeline/current_release.json. No data validation or raw rebuild was needed for this UI-only change; earlier pipeline evidence remains separate.
- Focused browser coverage: 24 unique cases pass, with zero skips. The initial 19-case receipt is results.json; results-final-affected.json records six affected/new cases and one obsolete selector failure; results-final-css.json passes all four final cases, including the corrected context-link test. Taking the latest result by test name gives 24 passes and no unresolved failures. This is a cumulative ledger with affected reruns, not a claim of one 24-case final run.
- Existing regressions pass: 6 browser tests and 8 audit groups, including all 261 generated routes. Evidence: reports/tests/robustness-after/legacy-browser.txt and legacy-audit.txt. Tests used the pinned dataset and retained exact-value, CSV, missing-data, map and route checks.
- Final local ledger: reports/tests/robustness-after/summary.md and ledger.json. The independent chief-of-staff re-audit approved the local UI changes with no required fixes. It verified the final index SHA-256 as 4bed7d1bb619a035f073c1376e98cf7f6f5fc917059e4c8420e47bde7885852f. This approval does not itself verify deployment. A separate Gitleaks scan of the new after-reports also exited 0.
