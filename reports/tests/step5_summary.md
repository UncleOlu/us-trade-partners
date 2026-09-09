# Step 5: data-level test, browser-level e2e suite, route tests (Agent D)

Three new pieces of coverage: (1) a pytest data-level test on
years[]/configured_coverage completeness and FlowValue/DerivedValue
consistency, (2) a new Node/Playwright-core browser suite under
tests/e2e/ checking the partner trend chart's rendered point counts,
(3) route tests for /hub and /section/<id>. Kept the plain pytest suite
green; ran both suites and saved outputs.

## 1. Data-level test

`tests/test_data_level_checks.py::test_dl01_partner_years_match_configured_coverage_and_derived_consistency`.
For every `data/<snapshot_id>/partner/<code>.json`: `years[]` has
exactly one entry per `meta.json` `configured_coverage.years`, sorted;
and the set of years where both imports and exports are
observed/confirmed_zero equals the set of years with an observed
balance and total_trade_value (exact equality, checked both directions:
no extra derived-observed years, no missing ones). **PASS** against the
real published snapshot `20260909T091429Z-c638aff167ea`.

## 2. Browser-level e2e suite (tests/e2e/)

New directory, own runner (`node tests/e2e/run.mjs`), not `@playwright/test`
(only the core `playwright` package is a project devDependency; adding
`@playwright/test` would mean editing package.json, out of scope without
asking the orchestrator, per the task). Full rationale, layout, and the
selector discovery writeup are in `tests/README.md`; `package.json` was
not touched.

### Selector used, with evidence

`.recharts-line-dots circle.recharts-dot`, one per rendered (non-null)
data point on a `<Line>`, scoped per series by that line's `<path
class="recharts-curve">` `stroke` color (`#c0392b` imports, `#2980b9`
exports, `#27ae60` balance, quoted from `PartnerPage.tsx`), not by DOM
order.

Key finding during discovery: querying immediately after
`.recharts-wrapper` appears in the DOM returns **0** circles for every
line, for every partner, every time. Recharts' entrance animation
populates `.recharts-line-dots` only after the line-draw animation
finishes (roughly 1.2 to 1.5 seconds in this build). `tests/e2e/lib/chart.mjs`'s
`waitForStableLineDotCounts()` therefore polls (every 200ms, up to 8s)
until the reading is unchanged for 3 consecutive polls, and specifically
refuses to accept an all-zero reading as final until at least half the
wait budget has elapsed (since 0 is also the correct in-flight animation
state, not just a possible final state for an empty chart).

### Point counts, per partner, versus expected

Expected counts computed independently from
`data/<snapshot_id>/partner/<code>.json` (never from the running app),
counting years where imports/exports are observed or confirmed_zero,
and years where balance is observed.

| code | expected (imports/exports/balance) | actual (imports/exports/balance) | of 13 configured years | result |
|---|---|---|---|---|
| 5700 (China) | 13 / 13 / 13 | 13 / 13 / 13 | full coverage | PASS |
| EU | 13 / 13 / 13 | 13 / 13 / 13 | full coverage | PASS |
| 1610 (St Pierre and Miquelon) | 13 / 13 / 13 | 13 / 13 / 13 | full coverage | PASS |
| 6022 (Norfolk Island) | 12 / 10 / 10 | 12 / 10 / 10 | fewer than 13 on every series, as expected (absent years) | PASS |

All four exact matches on the first run after the animation-timing fix
(the fix itself, and the initial all-zero false-fail it corrected, are
described above and in tests/README.md).

### Route tests

- `/hub`: HTTP 200, global label text present, link back to `/hub`
  present. **PASS.**
- `/section/I?year=2025`: **FAIL**, not NOT RUN. `SectionPage.tsx`
  throws a React error #310 (hooks called in a different order between
  renders: `useState` is called before two early `return`s, but
  `useMemo` is called after them) before the page ever finishes
  rendering, so the global label check fails and the browser error is
  captured and included in the failure message. This is a genuine
  defect in `src/pages/SectionPage.tsx`, discovered by this suite, not a
  test problem and not something Agent D attempted to fix (`src/` is
  Agent B's ownership). The test was written to check the table and the
  trend chart separately and to report NOT RUN specifically for a
  missing chart (with the chart's own absence cited by source comment as
  the reason) while treating everything else as a real pass/fail; it
  never reached that branch because the page crashes first. If Agent B
  fixes the hook-order bug, this test will re-evaluate the rest
  automatically (PASS if the chart exists, or NOT RUN citing the
  "section trend line is added in a later step" comment if only the
  chart is still missing) with no test change required.

## Two run summaries

### Plain pytest suite

Command:
```
./.venv-tests/bin/python -m pytest tests -v -rs -c tests/pytest.ini
```
Output: `reports/tests/step5_plain_run.txt`.

| collected | passed | failed | errors | warnings | skipped |
|---|---|---|---|---|---|
| 128 | 126 | 0 | 0 | 0 | 2 |

The 2 not-run skips: `DATA_A`/`DATA_B` unset (rebuild byte-identity
comparison), and `test_ovr03_data_dir_no_override_falls_back_to_default_discovery`
(its own guard: `data/` is now published for real, so its
empty-`data/`-fallback assertion no longer applies and it correctly
reports not run instead of asserting something false).

### e2e runner

Command:
```
node ./tests/e2e/run.mjs
```
Output: `reports/tests/step5_e2e_run.txt`. Runner exit code: 1 (one
FAIL; the runner's own exit-code contract is 0 only when nothing FAILs).

| collected | passed | failed | not run |
|---|---|---|---|
| 6 | 5 | 1 | 0 |

## New test ids

- `tests/test_data_level_checks.py::test_dl01_partner_years_match_configured_coverage_and_derived_consistency`
- `tests/e2e/tests/partner-trend.mjs`: "e2e partner trend chart point counts match observed years: 5700", "... EU", "... 1610", "... 6022"
- `tests/e2e/tests/routes.mjs`: "e2e /hub returns 200, shows global label, links back to hub", "e2e /section/I?year=2025 returns 200, shows global label, hub link, table with partner rows, and trend chart"

## Files written or changed

- tests/test_data_level_checks.py (new)
- tests/e2e/playwright.config.mjs (new)
- tests/e2e/lib/server.mjs (new)
- tests/e2e/lib/harness.mjs (new)
- tests/e2e/lib/chart.mjs (new)
- tests/e2e/tests/partner-trend.mjs (new)
- tests/e2e/tests/routes.mjs (new)
- tests/e2e/run.mjs (new)
- tests/README.md (extended: tests/e2e/ section)
- reports/tests/test_list.md (128 pytest tests documented; new tests/e2e/ section)
- reports/tests/step5_plain_run.txt (new)
- reports/tests/step5_e2e_run.txt (new)
- reports/tests/step5_summary.md (this file)

No file outside tests/ and reports/tests/ was written. package.json was
read but never edited.

## Open questions

1. **Real defect found, not fixed by Agent D:** `src/pages/SectionPage.tsx`
   currently crashes with React error #310 on every render past the
   loading state (hooks-order violation: `useState` before two early
   `return`s, `useMemo` after them). This blocks `/section/<id>`
   entirely. Recommend routing this to Agent B directly; Agent D's test
   will pick up the fix automatically on the next run, no test change
   needed.
2. `tests/e2e/lib/server.mjs` always uses the default base path
   (`/us-trade-partners/`, or `VITE_BASE_PATH` if set in the
   environment) and always finds its own free port, so it should not
   collide with a developer's own `npm run dev`/`preview` session, but
   it does run a real `npm run build` if `dist/` is stale, which takes
   real time (tens of seconds) and touches `dist/`, a build output
   directory Agent D does not otherwise own. This mirrors the
   `dist/`-freshness check Agent B's own `vite.config.ts` already
   performs at build time (snapshot id must match); flagging in case the
   orchestrator prefers Agent D never trigger a build itself (i.e.
   always fail with a clear message when `dist/` is stale instead).
3. The animation-timing behavior documented above (0 circles until the
   entrance animation finishes) is specific to Recharts' default
   `isAnimationActive` behavior on `<Line>` in this app (no `dot={false}`
   or `isAnimationActive={false}` prop is set in `PartnerPage.tsx`); if
   Agent B ever adds either prop, `waitForStableLineDotCounts()` still
   works (it just stabilizes immediately), so no test change is
   anticipated, but noting the dependency for the record.

## Usage report

Uncached input, cache writes by duration, cache reads, output: unknown
(not exposed to this agent by the harness in this session; no
token-usage API was available to query). Reporting as unknown per the
instruction not to invent estimates.
