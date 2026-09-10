# Payload: home-all

Route: https://uncleolu.github.io/us-trade-partners/?year=all
Mode: deployed; cold context; cache disabled; service workers blocked.
Gzip budget: sum of each response body compressed locally with Node zlib gzip level 6. This is not a network transfer measurement.
Redirect bodies are excluded from decoded and gzip budget totals (shown as zero); CDP redirect transfer bytes are included in transfer totals.
Transfer: Chrome Network.loadingFinished.encodedDataLength, including response headers reported by Chrome. Redirect bytes use response.encodedDataLength. These counts exclude TLS and transport overhead.

| Requested asset | Status | Content encoding | Decoded bytes | Gzip budget bytes | CDP transferred bytes |
|---|---:|---|---:|---:|---:|
| https://uncleolu.github.io/us-trade-partners/?year=all | 200 | gzip | 575 | 340 | 753 |
| https://uncleolu.github.io/us-trade-partners/assets/index-BvQjJCp3.js | 200 | gzip | 229333 | 76866 | 77577 |
| https://uncleolu.github.io/us-trade-partners/assets/index-BvXhNnPD.css | 200 | gzip | 15141 | 3925 | 4129 |
| https://uncleolu.github.io/us-trade-partners/atlas/countries-110m.json | 200 | gzip | 107761 | 38423 | 39935 |
| https://uncleolu.github.io/us-trade-partners/data/20260909T091429Z-c638aff167ea/meta.json | 200 | gzip | 3561 | 1730 | 2065 |
| https://uncleolu.github.io/us-trade-partners/data/20260909T091429Z-c638aff167ea/partners.json | 200 | gzip | 88097 | 7098 | 7362 |
| https://uncleolu.github.io/us-trade-partners/derived/20260909T091429Z-c638aff167ea/summary-all.json | 200 | gzip | 87853 | 10660 | 11570 |
| Total | | | 532321 | 139042 | 143391 |

Budget: 250000 bytes; result: PASS.
Failed or incomplete asset checks: 0. Console errors: 0.
