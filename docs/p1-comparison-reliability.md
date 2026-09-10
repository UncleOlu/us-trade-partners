# P1 comparison reliability contract

P1 is a reliability release for choosing a period, comparing tables, sorting results, and sharing a view.

## Required behavior

- A period is `year=2013` through `year=2025`, or the explicit period `year=all`.
- `year=all` uses the configured coverage years and independent annual sums. Missing required annual values remain absent. The annual trend stays annual and is not replaced by the aggregate row.
- Table labels stay left aligned. Numeric headers and cells use the same column axis. Numbers stay on one line. Horizontal scrolling stays inside the table region.
- Sortable fields are intentional. Home and section tables support rank, partner, imports, exports, balance, and total trade where those columns exist. Product tables support their identity and numeric fields only where comparison has a clear meaning. Sorting is stable, puts missing values last, and exposes `aria-sort`.
- URL state includes route context, period, partner or section, search, sort column, and sort direction. It survives refresh and browser Back. Invalid values normalize to safe defaults with a visible notice.
- The existing full-partner CSV remains available. When search is active, a separate filtered-results CSV is clearly labeled and includes the active period, query, sort, exact integer values, statuses, and deterministic row order. No export silently changes scope.

## Acceptance evidence

- Unit tests prove independent all-years sums, strict missingness, stable ties, and URL parsing.
- Browser tests prove direct entry, refresh, Back, search persistence, keyboard sorting, mobile contained scrolling, displayed counts, and both CSV scopes.
- TypeScript, build, critical deployment tests, gzip budgets, and deployed index hash checks pass.

P2 owns visual polish, group-button label alignment if it requires shared spacing changes beyond the comparison contract, focus refinements, empty-state copy, chart legends, and mobile control polish. P3 owns new chart types, themes, animation changes, pagination redesign, saved views, new data sources, and broad restyling.

The main trade-off is two CSV actions when search is active. Keeping the existing full export protects compatibility. A separate filtered export makes the active analysis reproducible without silently changing the meaning of the original action.

## Implementation

Agent B changed src/ only: a new period parser in `src/lib/period.ts` replaces the inline year validation in the URL state hook, `SortKey` is a per-table type derived from the sort allowlists, and a new `useSearchParam` hook backs the home partner search (`home_q`) and both Hub searches (`hub_q`, `hub_sections_q`) with URL parameters. Nav and partner links carry those three parameters with the year, rank, and sort parameters. A typing burst produces one history entry: the first change after one second of inactivity pushes, later changes within one second replace. The URL itself updates on every change.

The home page keeps "Download all partners CSV" unchanged. When a search is active it also shows "Download filtered results CSV". That file adds query, sort key, sort direction, rank metric, and rank columns before the code, name, kind, status, and exact integer USD columns, and lists every matching partner in the current table order. Rank follows the active financial sort, as the sorting release defined.

Agent D added four browser cases to the P1 suite: both CSV scopes under an active search and sort, the all-years filtered export against independent per-partner sums, displayed counts, and contained mobile scrolling. Expected values come from the data files and existing independent helpers, not from src/.

## Verification, 2026-09-10

Local, uncommitted working tree on branch p1-comparison-reliability, pinned snapshot 20260909T091429Z-c638aff167ea.

| Check | Result |
|---|---|
| `npx tsc --noEmit -p tsconfig.json` | clean |
| `npm run build` | 261 routes, methodology check PASS |
| `node tests/e2e/p1-unit.mjs` | 3 passed |
| `node tests/e2e/p1-hardening.mjs` | 8 passed |
| `node tests/e2e/table-sorting-unit.mjs` | 5 passed |
| `node tests/e2e/all-years-unit.mjs` | 8 passed |
| `node tests/e2e/critical-ci.mjs` | PASS, 28 tests and 948 derived checks |
| Em dash scan outside evidence directories | no matches |

Gzip budgets from `scripts/measure-payload.mjs`, level 6 response bodies, not deployed transfers. Reports are in `reports/app/p1/`; test ledgers are in `reports/tests/p1/`.

| Route | Gzip bytes | Limit |
|---|---:|---:|
| Home 2025 | 139,245 | 250,000 |
| Home all years | 139,294 | 250,000 |
| Partner 1220 all years | 269,332 | 300,000 |

Built index SHA256 for this tree: `94f641573733ccbc7f5551afbf6192e1c2978b28df812209f4c4fbe852b78a67`. The deployed index hash check runs after merge and deployment. The P1 suite is not part of the critical deployment gate; adding it requires a reviewed manifest update. Usage and billing metrics are unknown.

## Deployment, 2026-09-10

Pull request 1 merged into main as 29ea926. Pages run [34444324320](https://github.com/UncleOlu/us-trade-partners/actions/runs/34444324320) built, passed the critical gate, and deployed. The live index returns HTTP 200 and its SHA256 matches the tested build hash above. The Hub route returns the canonical 301 redirect before loading, as documented in the deployed-site audit. No snapshot, dependency, or pipeline change.
