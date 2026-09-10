# P3 long lists contract

P3 chooses one item from the deferred P3 menu: the pagination redesign. It also closes the three small findings left open by the P2 audit. Themes, animation changes, saved views, new chart types, and new data sources are not included. No evidence shows a user need for them, and new data sources require acquisition and owner approval at the specification's STOP gates.

## Findings from the P2 build

- The section page renders every partner in one table with no search and no limit. At 390px the page is about 19,000px tall. Home solved the same problem in step 5 with a top 25, a Show all toggle, and search.
- The partner trend chart draws the balance line across zero without an emphasized zero line, so the surplus to deficit crossing is easy to miss.
- The media query hook subscribes with state plus an effect rather than a store subscription.
- Empty-state headings echo the whole query, which comes from the URL and has no length bound.

## Required behavior

1. Section partner list uses the home pattern. A search field labeled "Find a partner" with id `section-search` filters by name or code and stores its text in the URL parameter `section_q`, carried by every link the way `home_q` is. Feedback beside the field reports the match count. Without a search the table shows the first 25 rows of the current sort with a "Show all N" and "Show first 25" toggle using those exact labels. A status line reads "Showing N of M partners for <label>" with "(K match your search)" appended when a search is active. When nothing matches, the P2 empty-state pattern appears with a "Clear search" action that returns focus to the field, and a toolbar "Clear search" button is present while a search is active. Financial rank, sorting, the trend chart, the all-partner totals, and the existing "Download CSV" scope and order are unchanged. When a search is active a second button "Download filtered results CSV" downloads `section_<id>_<period>_filtered.csv` whose header line is the full export's header line with `query,sort_key,sort_direction,rank_metric,rank` inserted immediately before `code`, listing every matching partner in the current table order with exact integers and statuses.
2. The partner trend chart draws a solid neutral zero reference line so the balance crossing is visible. Chart data, series, dots, and colors are unchanged.
3. The media query hook uses React's external store subscription and returns the current match on first render.
4. Empty-state headings show at most 60 characters of the query followed by an ellipsis character when it is longer. The full query stays in the field and the URL.

## Acceptance evidence

- Browser tests prove the section list at 1280px and 390px: default 25 rows and the toggle, search filtering with independent match counts, `section_q` surviving refresh, Back, and navigation, both CSV scopes with independent expected rows, the empty state and focus return, the zero line at the value-axis zero, the heading cap, and that the section page at 390px is under 6,000px tall without a search.
- Existing sorting and all-years section tests are updated to reveal all rows before reading them, keeping their case names and comparison counts so the critical manifest is unchanged.
- P1 and P2 suites, TypeScript, build, the critical gate, robustness, gzip budgets, and the deployed index hash check pass.

## Implementation

Agent B changed src/ only. The section page and the home page now share one implementation of the partner list pattern: a `usePartnerList` hook for the search parameter, filter, 25-row limit, and focus-returning reset; a `PartnerListControls` module for the search field, feedback, results toolbar, and empty state; and a `partnerCsv` helper for the filtered export header and row prefix. The section page uses it as follows: a "Find a partner" field bound to `section_q`, which every link now carries with the other search parameters, feedback beside the field, the first 25 rows of the current sort with "Show all N" and "Show first 25", a status line with displayed, total, and match counts, the P2 empty state with a "Clear search" action that returns focus, the unchanged full "Download CSV", and a "Download filtered results CSV" while a search is active whose header is the full header with query, sort key, direction, rank metric, and rank inserted before the code column. The search field grows to fill the controls row at desktop and spans the row on phones. The partner trend chart draws a solid neutral zero line. The media query hook subscribes through React's external store API with memoized callbacks. Empty-state headings cap the echoed query at 60 code points followed by an ellipsis.

Orchestrator review found the first section search field too narrow at both widths and the hook resubscribing on every render; both were fixed before verification. The read-only audit then found the home and section pages carrying about 35 duplicated lines; rather than disclose that as an accepted trade-off, the shared modules above were extracted, and the rank note now says the rank spans all partners regardless of the visible limit. The audit's smaller notes were also applied: the zero line uses the muted color token, the media query list is created once per query, and the query cap counts grapheme clusters through Intl.Segmenter with a code point fallback.

Agent D wrote tests/e2e/p3-long-lists.mjs with 8 cases, later extended with the 25-row default and toggle at 390px, the toolbar and empty-state Clear search counts, a solid zero line drawn beneath the series, and non-ASCII query caps, and updated one line each in the sorting browser suite and the P1 keyboard case to reveal all section rows before reading them. Case names and comparison counts are unchanged, so the critical manifest is untouched. Expected values come from the section, summary, partner, and metadata files through the existing independent helpers, not from src/.

## Verification, 2026-09-10

Local, uncommitted working tree on branch p3-long-lists, pinned snapshot 20260909T091429Z-c638aff167ea.

| Check | Result |
|---|---|
| `npx tsc --noEmit -p tsconfig.json` | clean |
| `npm run build` | 261 routes, methodology check PASS |
| `node tests/e2e/p3-long-lists.mjs` | 8 passed |
| `node tests/e2e/p2-polish.mjs` | 15 passed |
| `node tests/e2e/p1-hardening.mjs` and `p1-unit.mjs` | 8 and 3 passed |
| `node tests/e2e/table-sorting-unit.mjs` and `all-years-unit.mjs` | 5 and 8 passed |
| `node tests/e2e/critical-ci.mjs` | PASS, 28 tests and 948 derived checks |
| `node tests/e2e/robustness.mjs` | 25 passed, receipt in `reports/tests/p3/robustness/results.json` |
| `node tests/e2e/run.mjs` | 6 passed |
| Em dash scan outside evidence directories | no matches |

Section page height at 390px without a search: 3,930px, down from about 19,000px.

Gzip budgets from `scripts/measure-payload.mjs`, level 6 response bodies, not deployed transfers. Reports are in `reports/app/p3/`; test ledgers are in `reports/tests/p3/`.

| Route | Gzip bytes | Limit |
|---|---:|---:|
| Home 2025 | 139,871 | 250,000 |
| Home all years | 139,920 | 250,000 |
| Partner 1220 all years | 270,333 | 300,000 |
| Section XVI all years | 323,194 | not set |

The section route has no owner budget. Its size comes from the section data file, which P3 does not change; the number is recorded so the owner can decide whether to set one.

Built index SHA256 for this tree: `0631c7ecdd49cabaa53c1c8960449377c323f84559173e42f39ddf87db8c15fa`. The deployed index hash check runs after merge and deployment. Usage and billing metrics are unknown.

## Audit, 2026-09-10

The read-only chief-of-staff audit returned APPROVED WITH NOTES with three medium items: duplicated list code on two pages, a robustness count without a receipt on disk, and three missing assertions. All three were closed as described above rather than absorbed: the code was extracted into shared modules, the robustness suite was rerun with its receipt written into the P3 ledger, and the assertions were added. One CSV concern stays open for the owner: the query cell of a filtered export is user text and carries no spreadsheet formula guard, as first noted in P1.
