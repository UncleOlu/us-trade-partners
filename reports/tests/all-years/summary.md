# All-years test audit

Local checks pass. Final production checks also pass: eight normal-flow cases, matching deployed hashes and all three budgets. See live/summary.md and live/ledger.json.

## Counts and scope

| Check | Result | Evidence |
|---|---|---|
| Independent aggregate helper tests | 8 passed, 0 failed, 0 skipped | unit.txt, unit-results.json |
| Exact annual-to-period comparisons | 3,832 flow values checked | unit-results.json |
| Built derived summary | 948 flow values checked | derived-integrity.json |
| New browser behavior | 9 distinct cases, latest result for each PASS | ledger.json |
| Affected annual behavior | 6 passed, 0 failed, 0 skipped | annual-regression.txt |
| Clean-source build and restore | PASS | clean-build-receipt.json |

The nine browser cases comprise one eight-case run after the required-year fix and four affected checks after control-fit CSS. Three cases overlap. This is not a single nine-case run. The initial eight-case attempt had five passes, two selector failures and one real missing-year coverage failure, followed by a harness cleanup error. All were fixed; initial evidence remains in browser-initial.txt and local/results-initial.json. The real defect shortened the range and produced partial totals when a whole year record was missing. Final fixtures require metadata's full 2013-2025 range and absent totals for both partner and section files.

The six annual regressions cover invalid query normalization, valid navigation context, Back/Forward, stable select and slider controls during racing requests, and responsive layouts. The prior 25-case robustness baseline remains in ../robustness-after/ledger.json. It was not rerun in full because unchanged network-failure paths were outside this change. All current browser runs reported zero unexpected page/console errors.

Independent expected values use BigInt arithmetic on 19 existing annual source files. No pipeline implementation or product helper computes the expectations. Runtime checks cover all 236 summary partners, world totals, Canada/China/EU/Norfolk totals and every group/chapter, plus section XVI universe and every partner. Input hashes and a 12KB bounded fixture preserve evidence without storing a second dataset. Missing record, structural NA, zero, derived dependency, overflow and duplicate fixtures cover edge cases.

## Findings and trade-offs

All-years imports are complete for 229 of 236 partners; exports for 230; total trade for 228. Full missing-code lists are in coverage-counts.json. Incomplete selected metrics display Not ranked and remain last and searchable. World totals sum annual world totals and stay fixed under partner filtering. EU rows use annual historical membership and never enter world totals.

Cumulative world imports are $34,582,057,997,635 and exports $22,539,343,650,542. These are nominal period sums, not annual averages or inflation-adjusted values. Any absent required year makes that flow absent. Structural NA does not block applicable years; all-NA remains NA. Derived values require both flows. Annual trends retain 13 years.

CSV checks compare exact integers and statuses with period/start_year/end_year on selected-period exports. Annual trend CSV retains yearly rows. Only hashes, headers, row counts and bounded CSV examples are saved. Home rank and money headers/cells center at 1280px, 390px and 320px; partner names remain left aligned. Tables scroll in their containers. Controls fit the full period text after the final width fix. Wider controls use more horizontal room; narrow section controls stack. The year slider is disabled for All years and states how to return to a single year.

## Build and budget

Derived file: derived/20260909T091429Z-c638aff167ea/summary-all.json, 87,853 decoded bytes, SHA256 `bc55f3b65c66b9d60b1a2d8e7cfa0587d4ddde0526eb6ac6304aa2d113d8fea7`. Two local builds produced identical bytes. An empty source export with no data/raw/dependencies/dist used npm ci, downloaded the pinned published release, verified its checksum, restored 274 canonical JSON files and built the identical derived file and index. The export manifest identifies copied current source. It was not yet a committed checkout. The unchanged deployment workflow follows the same restore/build order; actual CI proof follows publication.

Final local index SHA256: `8d7f822291346420a31451c58c64ba9b1c3ffa2bfebcab03c6a76e1ea28bd328`.

| Route | Computed gzip bytes | Budget | Result |
|---|---:|---:|---|
| Home all years | 137,318 | 250,000 | PASS |
| Partner 1220 all years | 267,246 | 300,000 | PASS |
| Home 2025 | 137,269 | 250,000 | PASS |

Budget uses the reproducible sum of response bodies compressed with Node zlib level 6. It is not a deployed network transfer measurement. Payload files separately show local server CDP transfer and all assets. Measured production transfer is reported separately in live/summary.md. Clean npm ci reports four dependency advisories (three moderate, one high) in the existing lockfile; this task made no dependency upgrade.

## Images and reproduction

Inspected desktop/mobile page viewports, 320px home/Hub controls and three home-table close views. Final images are in local/. Annual responsive captures are separate in annual/. The primary desktop/mobile screenshots include Hub and section. The desktop full-width map remains available below controls; cumulative values use the existing fixed bands and can saturate more often.

Commands:

- `node tests/e2e/generate-all-years-expected.mjs`
- `node tests/e2e/all-years-unit.mjs`
- `node tests/e2e/all-years.mjs`
- `ALL_FILTER='period control|home rank|screenshots|all period survives' ALL_RUN=control-fit node tests/e2e/all-years.mjs`
- `ROBUST_REPORT_DIR=reports/tests/all-years/annual ROBUST_FILTER='invalid year|valid year|back and forward|select stays|slider stays|responsive layouts' node tests/e2e/robustness.mjs`
- `node tests/e2e/check-all-years-derived.mjs`
- `npm run build`
- `node scripts/measure-payload.mjs '/?year=all' reports/tests/all-years/payload-home-all.md home-all`
- `node scripts/measure-payload.mjs '/partner/1220?year=all' reports/tests/all-years/payload-partner-all.md partner-all`
- `node scripts/measure-payload.mjs '/?year=2025' reports/tests/all-years/payload-home-annual.md home-annual`

Usage: current Codex model. Input, cache reads/writes, output tokens and cost are unknown.
