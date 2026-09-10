# Country alignment live audit

Source `b534802ea62f71097518ac8ee81c6eb850b31dd0`, deployment run `34427423249`. Root index returned HTTP 200 and matched SHA256 `40e99aff033b03dd43524e8c330ca8aca70e6058be39e62c35f2b56785cec028`.

- Twelve narrow yearly-table states passed: Nigeria 7530, Canada 1220 and EU, each at 320px/390px, compact/exact USD. Year labels and EU markers stay on one rendered line.
- Six desktop Nigeria table states passed: yearly, product groups and chapters, compact/exact. Numeric headings and values center on the same column. Group names, chapter codes and descriptions stay left aligned.
- No unexpected page or console errors. Mobile table scroll stays contained. The final monetary column is accessible at maximum scroll.
- Inspected eight deployed images: all six Nigeria desktop tables, Canada 390px exact yearly table and EU 320px exact yearly table. Images are table-region crops, so a short table crop can include content below the table.

Canada all-years cold load: computed gzip budget 267,342 bytes against 300,000, PASS. Measured deployed CDP transfer: 276,176 bytes. The two numbers measure different things. The budget locally compresses decoded response bodies with gzip level 6. CDP counts response headers and body bytes reported by Chrome, including the canonical redirect, but excludes TLS and transport overhead. All successful responses use gzip; the HTTP 301 uses identity encoding. Every requested asset is listed in payload-partner.md/json. Zero failed or incomplete assets and zero console errors.

No new defect found. Small screens still require horizontal table scrolling; a partly visible edge column is normal while scrolling. No app source changed during this audit. Prior local evidence remains separate.

Commands, all exit 0:

- `BASE_URL=https://uncleolu.github.io/us-trade-partners/ ALIGN_CODES=7530,1220,EU ALIGN_WIDTH=320,390 ALIGN_TABLE=years ALIGN_RUN=years-narrow node reports/tests/country-alignment/check.mjs`
- `BASE_URL=https://uncleolu.github.io/us-trade-partners/ ALIGN_CODES=7530 ALIGN_WIDTH=1280 ALIGN_RUN=desktop node reports/tests/country-alignment/check.mjs`
- `node scripts/measure-payload.mjs 'https://uncleolu.github.io/us-trade-partners/partner/1220?year=all' reports/tests/country-alignment/live/payload-partner.md partner-all`

Usage metrics and cost are unknown.
