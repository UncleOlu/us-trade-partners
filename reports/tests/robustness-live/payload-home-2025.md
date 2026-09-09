# Payload: home-2025

Route: https://uncleolu.github.io/us-trade-partners/?year=2025
Mode: deployed; cold context; cache disabled; service workers blocked.
Gzip budget: sum of each response body compressed locally with Node zlib gzip level 6. This is not a network transfer measurement.
Redirect bodies are excluded from decoded and gzip budget totals (shown as zero); CDP redirect transfer bytes are included in transfer totals.
Transfer: Chrome Network.loadingFinished.encodedDataLength, including response headers reported by Chrome. Redirect bytes use response.encodedDataLength. These counts exclude TLS and transport overhead.

| Requested asset | Status | Content encoding | Decoded bytes | Gzip budget bytes | CDP transferred bytes |
|---|---:|---|---:|---:|---:|
| https://uncleolu.github.io/us-trade-partners/?year=2025 | 200 | gzip | 575 | 342 | 758 |
| https://uncleolu.github.io/us-trade-partners/assets/index-DpBObqI5.css | 200 | gzip | 13378 | 3592 | 3798 |
| https://uncleolu.github.io/us-trade-partners/assets/index-DXl5PV71.js | 200 | gzip | 220088 | 73659 | 74371 |
| https://uncleolu.github.io/us-trade-partners/atlas/countries-110m.json | 200 | gzip | 107761 | 38423 | 39936 |
| https://uncleolu.github.io/us-trade-partners/data/20260909T091429Z-c638aff167ea/meta.json | 200 | gzip | 3561 | 1730 | 2036 |
| https://uncleolu.github.io/us-trade-partners/data/20260909T091429Z-c638aff167ea/partners.json | 200 | gzip | 88097 | 7098 | 7409 |
| https://uncleolu.github.io/us-trade-partners/data/20260909T091429Z-c638aff167ea/summary/2025.json | 200 | gzip | 138527 | 10611 | 11478 |
| Total | | | 571987 | 135455 | 139786 |

Budget: 250000 bytes; result: PASS.
Failed or incomplete asset checks: 0. Console errors: 0.
