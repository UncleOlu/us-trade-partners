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
3. Bar chart labels. The product-group bar chart shows every section label at every width with horizontal, unrotated text of at least 12px. Below 600px the chart turns into horizontal bars so each section label has a full line. Every label is the exact section id, and selecting a bar still selects its group.
4. Empty states. Home, Hub partners, and Hub product groups share one pattern: a heading that names the query, one guidance sentence, and one action inside the empty state. Every action that clears a search is labeled "Clear search", or "Clear product search" for the Hub product groups. Home keeps its toolbar "Clear search" button as well, so the same action carries the same name in both places. Each action removes the search parameter, restores the full list, and moves focus to its search input.
5. Mobile controls. Partner page jump links are bordered pills with at least 44px height and width. Under 600px, heading-row buttons span the full row width and the partner page has no horizontal document overflow.

## Acceptance evidence

- Browser tests at 1280px and 390px prove each item with independent expectations: computed alignment and text position for a wrapped group label, exact legend text lists, 22 bar labels matching the HS section ids in the data, empty-state structure and focus return on all three pages, jump-link target sizes, full-width buttons, and contained document width.
- P1 suites, sorting and all-years unit suites, TypeScript, build, critical deployment tests, gzip budgets, and the deployed index hash check pass.

Out of scope: section page length on phones (P3 pagination), new chart types, themes, animation changes, saved views, and broad restyling.

## Implementation

Agent B changed src/ only. Group buttons align their text left. Every chart series carries a display name, so legends and tooltips read Imports, Exports, and Balance, and legend text is 0.85rem. The note "Balance is exports minus imports." sits directly under the partner trend chart, as the contract requires; the first build placed it above the chart and the audit caught the mismatch. The product-group bar chart renders all 22 section labels at 12px with no rotation: vertical bars with labels along the bottom at 601px and above, horizontal bars with labels down the left below 600px, switched by a small media query hook in `src/lib/useMediaQuery.ts` on the same breakpoint as the CSS. Legend size is passed through the chart component's own style prop rather than a library class name, and the series names come from one set of strings shared with the table sort labels. Home, Hub partners, and Hub product groups share one empty-state pattern with a heading naming the query, one guidance sentence, and one action; every clear action is named "Clear search" and returns focus to its search input. Partner page jump links are bordered 44px pills. The same rule styles the Hub jump links, which now match the Hub year links; the contract named only the partner page, and this spillover was reviewed and kept. Heading-row buttons on every page span the full row below 600px.

Visual review by the orchestrator found the first bar chart axis unreadable at 390px and needlessly angled at 1280px. The second version used vertical 10px labels and a narrowed value axis. The owner's expert audit rejected that as well: rotated small type is the cheap fix, not the right one. The third version is the horizontal bar layout described above; screenshots at both widths were inspected.

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
| Home 2025 | 139,306 | 250,000 |
| Home all years | 139,355 | 250,000 |
| Partner 1220 all years | 269,749 | 300,000 |

Built index SHA256 for this tree: `1586a2abfbca1f5019ea062b85fd7ee399ddfd41fe2eaa4a34bb24fe4655542e`. The deployed index hash check runs after merge and deployment. Usage and billing metrics are unknown.

The read-only chief-of-staff audit first returned FIX REQUIRED because the note sat above the chart while the contract said under it, and because the Hub jump-link change was undisclosed. Both are corrected above: the note moved below the chart, the P2 test now asserts its position, the Hub change is disclosed, the legend rule no longer uses an importance override, and the media query hook initializes from the current viewport. Every check in the table was rerun on the corrected tree.

## Owner audit, 2026-09-10

The owner asked for every decision to be judged against what the best expert in that field would do. Three decisions failed that test and were reworked:

1. Rotated 10px labels on the phone bar chart. A data visualization expert would use horizontal bars so every label sits on its own line at full size. Done. Trade-off: the phone chart is about 620px tall instead of 340px on a page that is already long.
2. Two labels for one action. The home empty state said "Reset search" while the toolbar said "Clear search", chosen only so test selectors stayed unambiguous. Both now read "Clear search" and the tests scope by container.
3. Styling a library internal class. The legend size now goes through the chart component's style prop, and the series names are defined once. Trade-off disclosed: the single source is the sort label table in `src/lib/sorting.ts`, with `src/lib/labels.ts` deriving the chart names from it, because two unit suites load the sorting module standalone and cannot follow a runtime import. The reverse direction was asked for and is not possible without changing those suites.

Smaller findings left as they are, for a later release: no emphasized zero line on the balance chart, the media query hook uses state plus an effect rather than a store subscription, and the empty-state heading echoes the full query without a length cap. The P2 suite now also asserts non-overlapping, unrotated labels of at least 12px on both axes at both widths, and that selecting a bar at 390px selects its group. Every check in the table above was rerun on the reworked tree, including the 25-case robustness suite.
