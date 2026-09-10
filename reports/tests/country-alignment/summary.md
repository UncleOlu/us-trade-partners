# Country-table alignment audit

Nigeria is Census code 7530, verified from the current partners metadata. Canada 1220 supplies a larger-value case.

Initial checks passed 24 table states: two partners, two widths (1280px/390px), compact/exact USD and three tables (years, product groups, chapters). They checked aligned header/body column centers, centered numeric values, left-aligned text, one-line monetary values, contained scrolling and full last-value access. This first check omitted year wrapping. Root image review found Canada year text wrapped in 390px exact mode despite that pass.

After the year nowrap CSS fix, six affected mobile/exact table states passed. A further 12 focused year states passed: Nigeria, Canada and EU at 320px/390px, compact/exact. Every year cell occupies one rendered text line, including EU membership markers. All checked runs had zero unexpected page or console errors. No data changed.

Evidence is local/results.json, local/results-year-nowrap.json and local/results-years-narrow.json. These are separate runs with index hashes; they are not one full final 42-case run. Existing unrelated tests were not repeated for the CSS change. Build.txt preserves the initial build output; final browser checks used the fresh final production build.

Final index SHA256: `40e99aff033b03dd43524e8c330ca8aca70e6058be39e62c35f2b56785cec028`.

Final Canada all-years gzip budget: 267,342 bytes against 300,000, PASS. See payload-partner.md/json. This is the reproducible local gzip sum, not deployed network traffic. Live checks follow deployment.

Screenshots are in local/. Inspected Nigeria desktop compact/exact yearly tables, Nigeria mobile tables, Canada compact/exact group tables and mobile chapters, then final Canada 390px exact, Nigeria 320px exact and EU 320px exact yearly tables. Final years stay on one line. Exact values need more width, so small screens retain horizontal table scrolling; edge columns may be partly visible while scrolling.

Reproduction:

- `node reports/tests/country-alignment/check.mjs`
- `ALIGN_WIDTH=390 ALIGN_EXACT=1 ALIGN_RUN=year-nowrap node reports/tests/country-alignment/check.mjs`
- `ALIGN_CODES=7530,1220,EU ALIGN_WIDTH=320,390 ALIGN_TABLE=years ALIGN_RUN=years-narrow node reports/tests/country-alignment/check.mjs`
- `node scripts/measure-payload.mjs '/partner/1220?year=all' reports/tests/country-alignment/payload-partner.md partner-all`

Usage metrics and cost are unknown. No commits made by the test agent.
