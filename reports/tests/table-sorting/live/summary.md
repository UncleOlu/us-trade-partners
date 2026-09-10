# Sorting production audit

Source `f2c6ea0bfbe447f7c9f2a803d8a519129a4480cc`, Pages run `34428869583`. Root index returned HTTP 200 and matched the reviewed build SHA256 `9eb20ec87aba080e0007de3602d8c6eb9233709cdd83a9c2c479a79b15bd95bb`.

Ten of ten production cases passed. No failures or skips. Across five tables, every sortable column passed in both directions: 54 complete-order comparisons and 6,492 row positions, checked in both rendered tables and CSV exports against independent annual inputs. Exact money and status fields match. Missing values remain last; negative values, zero and identity ties preserve the required order.

Keyboard controls, aria-sort, visible direction, refresh, Back, year changes, invalid URL choices, independent table state through Hub, rank-dropdown synchronization, retained product selection and full export after search all pass. Total cards and chart geometry stay unchanged. Charts use a 1e-8px coordinate tolerance while preserving path commands/count/order; money and order checks are exact.

Actual heading text centers within 1px of its column, targets are at least 44px high, numeric values remain single line, and table scrolling stays contained. The 320px exact yearly-table check passes. Inspected ten deployed screenshots, one desktop and one mobile crop for each table, including exact USD product groups. No new defects or unexpected page/console errors.

| Route | Computed gzip budget bytes | Actual cold CDP transferred bytes | Budget |
|---|---:|---:|---:|
| Home all years | 139,042 | 143,391 | 250,000 |
| Partner 1220 all years | 269,082 | 277,862 | 300,000 |

Both budgets pass. Gzip totals compress decoded response bodies locally at Node zlib level 6; they are not measured transfers. CDP measures fresh-context requests with cache disabled and service workers blocked, including reported response headers and redirects but excluding TLS/transport overhead. Payload Markdown/JSON files list every asset and content encoding. All successful responses use gzip; partner entry adds one identity-encoded HTTP 301. No failed or incomplete assets.

The wider headers require more horizontal scrolling on narrow screens. Names and descriptions can wrap into taller rows; numeric text does not wrap. Local annual regressions were not repeated on production because the deployed hash matched the reviewed build. No app source changed during this audit.

Commands, all exit 0:

- `BASE_URL=https://uncleolu.github.io/us-trade-partners/ node tests/e2e/table-sorting.mjs`
- `node scripts/measure-payload.mjs 'https://uncleolu.github.io/us-trade-partners/?year=all' reports/tests/table-sorting/live/payload-home-all.md home-all`
- `node scripts/measure-payload.mjs 'https://uncleolu.github.io/us-trade-partners/partner/1220?year=all' reports/tests/table-sorting/live/payload-partner.md partner-all`

Usage metrics and cost are unknown. Local evidence remains in ../summary.md and ../ledger.json.
