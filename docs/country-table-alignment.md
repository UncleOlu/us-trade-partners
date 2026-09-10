# Country table alignment

Owner reported that country table figures did not align with their headings. The earlier change centered the home ranking table only.

This fix centers the Year column and monetary headings and cells in Trade by year. It also centers monetary columns in the country product group and chapter tables. Names, chapter codes and descriptions remain left-aligned. The trade-off stated to the owner: centered values match the requested layout, while right alignment better supports digit-length comparison.

The implementation adds three scoped table classes and CSS rules. It changes no values, data files, sorting, exports, snapshot, release or pipeline. Full TypeScript checking and the production build passed, including the rendered methodology check. Source secret scan exited 0 with no findings.

Desktop/mobile visual checks and production evidence are stored in reports/tests/country-alignment/. Usage and billing metrics are unknown.

Local checks: 24 initial table states passed for Nigeria and Canada, three tables, desktop/mobile, short/exact values. Image review then found a wrapped Year in mobile exact mode, which the initial money-only no-wrap checks missed. A separate fix keeps Year cells on one line. Six affected table states and 12 year-specific states passed after that fix, including EU markers at 320px and 390px. Root inspected corrected desktop and mobile images. Final partner gzip budget: 267,342 bytes against 300,000. Final tested index SHA256: `40e99aff033b03dd43524e8c330ca8aca70e6058be39e62c35f2b56785cec028`.

The independent read-only local audit approved the fix. [Pages run 34427423249](https://github.com/UncleOlu/us-trade-partners/actions/runs/34427423249) built and deployed source `b534802ea62f71097518ac8ee81c6eb850b31dd0` successfully. The workflow restored the same pinned snapshot. [Nigeria table](https://uncleolu.github.io/us-trade-partners/partner/7530?year=all#years-table-heading).

Production checks passed: six desktop table states and 12 narrow year states, with no console or page errors. The deployed index hash matches the tested build. Root inspected the live Nigeria desktop and 320px exact-value images. Partner cold transfer measured 276,176 bytes through Chrome encodedDataLength, separately from the 267,342-byte gzip budget. The per-asset report records content encoding and requests. No data acquisition or release changes were needed.

Final independent read-only audit: APPROVED, no required fixes remain. The final evidence-only commit skips deployment because app and build inputs have not changed. Chromium is the tested browser engine.
