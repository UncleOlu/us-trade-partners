# tests/

Independent test suite for the US goods trade partner visualization,
owned by Agent D. Never reads pipeline/ implementation code (see
AGENTS.md). Full test list and status: reports/tests/test_list.md.

## Running

```
./.venv-tests/bin/python -m pytest tests -q -c tests/pytest.ini
```

## Staged-build environment variable overrides

By default the suite discovers the published snapshot under
`data/<snapshot_id>/`, its matching `raw/<snapshot_id>/` archive, and
`reports/pipeline/validation.csv`. To run the suite against a staged,
unpublished build instead (for example a local pipeline output that has
not yet been copied into `data/`), set any of:

| Variable | Points to | Used by |
|---|---|---|
| `DATA_DIR` | a `data/<snapshot_id>`-shaped directory | `conftest.discover_snapshot_dir` (the `snapshot_dir` fixture / `require_snapshot`), i.e. every integration test that reads `data/<snapshot_id>/...` |
| `RAW_DIR` | the matching `raw/<snapshot_id>`-shaped directory | `conftest.resolve_raw_dir`, used by `test_c07a_eu_calculation_full` |
| `VALIDATION_CSV` | a `validation.csv`-shaped file | `conftest.require_validation_csv`, used by every check-6/7b/vcsv test |

Example:

```
DATA_DIR=/path/to/staged/data \
RAW_DIR=/path/to/staged/raw \
VALIDATION_CSV=/path/to/staged/validation.csv \
./.venv-tests/bin/python -m pytest tests -q -c tests/pytest.ini
```

Each variable is independent; set any subset. Unsetting one falls back
to the default path it replaces. None of the assertions change: a
staged build still has to match the real schema and contract for these
tests to pass. See the `tests/conftest.py` module docstring for the
exact fallback logic, and `tests/test_config_overrides.py` for the
tests that prove the override mechanism itself.

## tests/e2e/ (browser-level suite)

A separate, Node-based browser suite, also owned by Agent D, independent
of the pytest suite above. It drives a real headless Chromium against
the production build (`dist/`) served by `npm run preview`, and checks
what actually renders in the DOM, not just the published JSON files.

### Why a custom runner, not `@playwright/test`

`package.json`'s devDependencies has the core `playwright` automation
library (used to launch and drive Chromium) but not the separate
`@playwright/test` package (the test runner with its own `test()` /
`expect()` / `playwright.config.ts` format). Adding `@playwright/test`
would mean editing `package.json`, which is out of scope for Agent D
without asking the orchestrator first (per AGENTS.md ownership: `src/`,
`package.json`, and the lockfile belong to Agent B). So `tests/e2e/`
implements a small test collector/runner directly on top of the
`playwright` core package instead: `tests/e2e/lib/harness.mjs` (`test()`,
`skip()`, `runAll()`), not a drop-in replacement for `@playwright/test`
but sufficient for this suite's needs (PASS / FAIL / NOT RUN per named
async check).

### Layout

| Path | Role |
|---|---|
| `tests/e2e/playwright.config.mjs` | Plain config constants: base path, the global label text (quoted from `src/lib/config.ts` `GLOBAL_LABEL`), the trend chart's series stroke colors (quoted from `src/pages/PartnerPage.tsx`), the partner codes checked, timeouts. Not a `@playwright/test` config. |
| `tests/e2e/lib/server.mjs` | Builds `dist/` via the existing `npm run build` script only if it is absent or stale for the current snapshot, then starts `npm run preview` on a free port (found via a bound-and-released `net.createServer()`) and waits for it to answer HTTP requests. Never edits `package.json`. |
| `tests/e2e/lib/harness.mjs` | The minimal test runner described above. |
| `tests/e2e/lib/chart.mjs` | Recharts trend-chart point-count helper; see "Selector used, with evidence" below. |
| `tests/e2e/tests/partner-trend.mjs` | Task: partner trend chart point counts vs. observed years, for 5700, EU, 1610, 6022. |
| `tests/e2e/tests/routes.mjs` | Task: `/hub` and `/section/<id>?year=<latest>` route checks. |
| `tests/e2e/run.mjs` | Entry point: starts the server, launches Chromium, registers and runs every test, prints a summary, exits 0 (nothing failed; NOT RUN is fine), 1 (something failed), or 2 (setup error). |

### Running

```
node ./tests/e2e/run.mjs
```

Add `--force-build` to rebuild `dist/` even if it looks fresh for the
current snapshot (`reports/pipeline/last_snapshot_id.txt`).

### Selector used, with evidence

`src/pages/PartnerPage.tsx`'s trend chart is one Recharts `<LineChart>`
with three `<Line dataKey="imports"|"exports"|"balance" connectNulls={false}>`
children; `chartValue()` in that file maps a FlowValue/DerivedValue to
`null` unless its status is `observed` (or `confirmed_zero` for the two
flow inputs), via `src/lib/status.ts`'s `isUsable()`. `connectNulls={false}`
means a null year is a genuine gap, not interpolated.

Live DOM inspection (headless Chromium, this build) found that each
`<Line>` renders as `<g class="recharts-line">` containing a `<path
class="recharts-curve recharts-line-curve">` (the drawn curve) and,
**only after Recharts' entrance animation finishes**, a sibling `<g
class="recharts-line-dots">` holding one `<circle class="recharts-dot
recharts-line-dot">` per rendered (non-null) point. Querying
immediately after `.recharts-wrapper` appears in the DOM reads 0
circles for every line; waiting roughly 1.2 to 1.5 seconds (or polling
until the count stops changing) is required. This was the first
concrete finding of this task and is why
`tests/e2e/lib/chart.mjs`'s `waitForStableLineDotCounts()` polls for a
stable, non-transient reading instead of querying once or sleeping a
fixed short delay: an all-zero reading is a legitimate mid-animation
state, so the helper does not accept "stable at 0" until at least half
its wait budget has elapsed.

**Stable selector:** `.recharts-line-dots circle.recharts-dot`, scoped
per series by that line's `<path>` `stroke` color (`#c0392b` imports,
`#2980b9` exports, `#27ae60` balance, quoted from `PartnerPage.tsx` and
`playwright.config.mjs`), not by DOM order. DOM order happens to match
the three `<Line>` elements' JSX declaration order today, but the color
is the more explicit identifier and is what `chart.mjs` actually keys
on.

Cross-checked against `data/<snapshot_id>/partner/<code>.json` (never
against the app's own computation): counts matched exactly for all four
required partners on the first fix-verified run (see
`reports/tests/step5_e2e_run.txt`).

### Route tests and "not run while placeholders"

`src/pages/HubPage.tsx` and `src/pages/SectionPage.tsx` both carry a
"Placeholder" doc comment; `SectionPage.tsx` additionally says "The
section trend line is added in a later step." Rather than hard-coding
both route tests to a blanket not-run, `tests/e2e/tests/routes.mjs`
runs every check it can and only reports NOT RUN for the specific piece
still missing (the section trend chart, via a `.recharts-wrapper`
count), citing that source comment. Everything else (HTTP 200, the
global label text, a link back to `/hub`, and, for the section page,
partner table rows) is a real PASS or FAIL, not a skip.

At the time this suite was first run, `/section/<id>` genuinely FAILs
(not NOT RUN): `SectionPage.tsx` throws a React error #310 (hooks
called in a different order between renders, because `useState` is
called before two early `return`s but `useMemo` is called after them),
which crashes the page before the trend-chart check is ever reached.
The route test captures `pageerror` and `console.error` events during
navigation and includes them in its failure message specifically so
this kind of root cause is not obscured as a generic "text not found"
failure. This is a real defect in `src/pages/SectionPage.tsx`, not a
test issue; Agent D does not own `src/` and has not attempted to fix
it. See `reports/tests/step5_e2e_run.txt` for the exact captured error.
