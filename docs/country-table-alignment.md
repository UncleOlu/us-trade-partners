# Country table alignment

Owner reported that country table figures did not align with their headings. The earlier change centered the home ranking table only.

This fix centers the Year column and monetary headings and cells in Trade by year. It also centers monetary columns in the country product group and chapter tables. Names, chapter codes and descriptions remain left-aligned. The trade-off stated to the owner: centered values match the requested layout, while right alignment better supports digit-length comparison.

The implementation adds three scoped table classes and CSS rules. It changes no values, data files, sorting, exports, snapshot, release or pipeline. Full TypeScript checking and the production build passed, including the rendered methodology check. Source secret scan exited 0 with no findings.

Desktop/mobile visual checks and production evidence are stored in reports/tests/country-alignment/. Usage and billing metrics are unknown.

Local checks: 24 initial table states passed for Nigeria and Canada, three tables, desktop/mobile, short/exact values. Image review then found a wrapped Year in mobile exact mode, which the initial money-only no-wrap checks missed. A separate fix keeps Year cells on one line. Six affected table states and 12 year-specific states passed after that fix, including EU markers at 320px and 390px. Root inspected corrected desktop and mobile images. Final partner gzip budget: 267,342 bytes against 300,000. Final tested index SHA256: `40e99aff033b03dd43524e8c330ca8aca70e6058be39e62c35f2b56785cec028`.
