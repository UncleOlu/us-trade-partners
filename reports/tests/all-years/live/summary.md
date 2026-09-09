# All-years production audit

Site: https://uncleolu.github.io/us-trade-partners/?year=all

Source `9aa6990c7b97ad6d05a058d7b5396c2a2d8802fb`, Pages run `34404959040`. Root index and derived all-years file returned HTTP 200 and matched final local SHA256 values. See hash-receipt.json.

Eight production cases passed, zero failed or skipped. No fault injection ran on the live site. Tests covered complete CSV scope and exact values, absent Norfolk values, rank state, world totals independent of filtering, navigation/refresh/Back, map period/value labels and keyboard selection, all partner groups/selected chapters, section annual trend, table centering/scrolling, full period-control text and responsive page layouts. Annual tables and trends retain 13 years.

The nine-case local ledger includes one extra missing-whole-year fault test. It passed locally and was excluded from production on purpose. The six affected annual regressions and independent arithmetic checks remain in ../summary.md and ../ledger.json. No new defects found during this live audit. No app source changed.

## Cold-load measurements

| Route | Computed gzip budget bytes | Measured CDP transferred bytes | Requests |
|---|---:|---:|---:|
| home-all | 137,318 | 141,949 | 7 |
| home-annual | 137,269 | 141,870 | 7 |
| partner-all | 267,246 | 276,054 | 9 |

All budgets pass: home 250,000 bytes, partner 300,000 bytes. The gzip budget sums decoded response bodies compressed locally with Node zlib level 6. It is not measured network traffic. CDP transfer uses fresh contexts, disabled cache and blocked service workers; counts include Chrome-reported response headers and redirects but exclude TLS and transport overhead. Each payload Markdown/JSON lists every requested asset, HTTP status and encoding.

All successful responses use gzip. The partner URL without a trailing slash adds one HTTP 301 with identity encoding. Zero failed/incomplete asset checks and zero console errors occurred. Home all-years requests one derived summary instead of downloading all 13 annual summary files.

Root index SHA256: `8d7f822291346420a31451c58c64ba9b1c3ffa2bfebcab03c6a76e1ea28bd328`.

Derived summary SHA256: `bc55f3b65c66b9d60b1a2d8e7cfa0587d4ddde0526eb6ac6304aa2d113d8fea7`, 87,853 decoded bytes. This matches independent local and clean-source build checks.

## Images and limits

Inspected 15 deployed images: ten desktop/mobile page viewports (home, Hub, partner, section, methodology), two 320px home/Hub viewports, and three home-table close views at 1280px, 390px and 320px. Home full-page captures are also saved. The table headers and numeric cells center; partner labels align left. Full period labels fit their controls.

Accepted limits remain: cumulative nominal values are not annual averages or inflation-adjusted amounts; any absent required year prevents that flow's cumulative value; wider period controls use more room and narrow screens stack controls; home content places the map below controls; tables need horizontal scrolling and edge columns can be partly visible during scrolling; fixed map bands can saturate more in cumulative mode. These checks use Chromium and do not prove complete screen-reader or cross-browser compliance.

Reproduction commands and exit codes: ledger.json. Usage: current Codex model. Input, cache reads/writes, output tokens and cost are unknown.
