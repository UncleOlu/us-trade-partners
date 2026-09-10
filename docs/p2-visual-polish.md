# P2 visual polish contract

P2 is a polish release for the areas P1 deferred: group-button label alignment, chart legends, empty-state copy, focus refinements, and mobile control polish. It changes no data, no URL state, no sorting, no CSV scope, and no chart data.

## Findings from the P1 build

- Wrapped product-group button labels are centered inside a left-aligned cell on narrow screens.
- Chart legends and tooltips use lowercase data keys (imports, exports, balance) in small type, while tables use Imports, Exports, and Balance.
- The product-group bar chart drops most section labels on narrow screens, so bars cannot be identified without hovering.
- The three empty states differ: home has a heading and guidance but its clear action is elsewhere; both Hub empty states have a heading and a button but no guidance.
- Clear actions do not return focus to the search field.
- Partner page jump links are small text links; heading-row download buttons stack at arbitrary widths on phones.

## Required behavior

1. Group buttons. Label text is left aligned inside the button at every width. The button stays at the left of its cell. Selected and focused states are unchanged.
2. Chart series names. Legend entries and tooltip names read exactly Imports, Exports, and Balance on the partner trend chart; Imports and Exports on the partner product-group bar chart and the section trend chart. Legend text is at least 0.85rem. A chart note under the partner trend chart states that balance is exports minus imports. Colors, series, data, and point counts are unchanged.
3. Bar chart labels. The product-group bar chart shows every section label at every width. Narrow screens may angle the labels and use smaller type. Every label is the exact section id.
4. Empty states. Home, Hub partners, and Hub product groups share one pattern: a heading that names the query, one guidance sentence, and one action inside the empty state. Home's action is labeled "Reset search"; the Hub actions keep their labels "Clear search" and "Clear product search". Home keeps its toolbar "Clear search" button. Each action removes the search parameter, restores the full list, and moves focus to its search input.
5. Mobile controls. Partner page jump links are bordered pills with at least 44px height and width. Under 600px, heading-row buttons span the full row width and the partner page has no horizontal document overflow.

## Acceptance evidence

- Browser tests at 1280px and 390px prove each item with independent expectations: computed alignment and text position for a wrapped group label, exact legend text lists, 22 bar labels matching the HS section ids in the data, empty-state structure and focus return on all three pages, jump-link target sizes, full-width buttons, and contained document width.
- P1 suites, sorting and all-years unit suites, TypeScript, build, critical deployment tests, gzip budgets, and the deployed index hash check pass.

Out of scope: section page length on phones (P3 pagination), new chart types, themes, animation changes, saved views, and broad restyling.

## Implementation

Agent B changed src/ only. Group buttons align their text left. Every chart series carries a display name, so legends and tooltips read Imports, Exports, and Balance, and legend text is 0.85rem. The note "Balance is exports minus imports." sits directly under the partner trend chart, as the contract requires; the first build placed it above the chart and the audit caught the mismatch. The product-group bar chart renders all 22 section labels: horizontal at 600px and above, vertical with a narrower value axis below 600px, switched by a small media query hook in `src/lib/useMediaQuery.ts`. Home, Hub partners, and Hub product groups share one empty-state pattern with a heading naming the query, one guidance sentence, and one action; the home action is "Reset search" and every clear action returns focus to its search input. Partner page jump links are bordered 44px pills. The same rule styles the Hub jump links, which now match the Hub year links; the contract named only the partner page, and this spillover was reviewed and kept. Heading-row buttons on every page span the full row below 600px.

Visual review by the orchestrator found the first bar chart axis unreadable at 390px and needlessly angled at 1280px. The second version fixed both; screenshots at both widths were inspected.

Agent D wrote tests/e2e/p2-polish.mjs with 15 cases covering every contract item plus series and point-count regression guards. Expected values come from the contract, the HS sections file, meta.json, and Recharts DOM class names, not from src/.

## Verification, 2026-09-10

Local, uncommitted working tree on branch p2-visual-polish, pinned snapshot 20260909T091429Z-c638aff167ea.

| Check | Result |
|---|---|
| `npx tsc --noEmit -p tsconfig.json` | clean |
| `npm run build` | 261 routes, methodology check PASS |
| `node tests/e2e/p2-polish.mjs` | 15 passed |
| `node tests/e2e/p1-hardening.mjs` and `p1-unit.mjs` | 8 and 3 passed |
| `node tests/e2e/table-sorting-unit.mjs` and `all-years-unit.mjs` | 5 and 8 passed |
| `node tests/e2e/critical-ci.mjs` | PASS, 28 tests and 948 derived checks |
| `node tests/e2e/robustness.mjs` | 25 passed |
| Em dash scan outside evidence directories | no matches |

Gzip budgets from `scripts/measure-payload.mjs`, level 6 response bodies, not deployed transfers. Reports are in `reports/app/p2/`; test ledgers are in `reports/tests/p2/`.

| Route | Gzip bytes | Limit |
|---|---:|---:|
| Home 2025 | 139,325 | 250,000 |
| Home all years | 139,374 | 250,000 |
| Partner 1220 all years | 269,675 | 300,000 |

Built index SHA256 for this tree: `0b9227aaf15830a612008ca6aa620d158628d6b71cf15210d0139fb46230f9ed`. The deployed index hash check runs after merge and deployment. Usage and billing metrics are unknown.

The read-only chief-of-staff audit first returned FIX REQUIRED because the note sat above the chart while the contract said under it, and because the Hub jump-link change was undisclosed. Both are corrected above: the note moved below the chart, the P2 test now asserts its position, the Hub change is disclosed, the legend rule no longer uses an importance override, and the media query hook initializes from the current viewport. Every check in the table was rerun on the corrected tree.
