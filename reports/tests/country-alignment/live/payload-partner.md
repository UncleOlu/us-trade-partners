# Payload: partner-all

Route: https://uncleolu.github.io/us-trade-partners/partner/1220?year=all
Mode: deployed; cold context; cache disabled; service workers blocked.
Gzip budget: sum of each response body compressed locally with Node zlib gzip level 6. This is not a network transfer measurement.
Redirect bodies are excluded from decoded and gzip budget totals (shown as zero); CDP redirect transfer bytes are included in transfer totals.
Transfer: Chrome Network.loadingFinished.encodedDataLength, including response headers reported by Chrome. Redirect bytes use response.encodedDataLength. These counts exclude TLS and transport overhead.

| Requested asset | Status | Content encoding | Decoded bytes | Gzip budget bytes | CDP transferred bytes |
|---|---:|---|---:|---:|---:|
| https://uncleolu.github.io/us-trade-partners/assets/index-BZNocHYM.js | 200 | gzip | 225265 | 75383 | 76282 |
| https://uncleolu.github.io/us-trade-partners/assets/index-CvJ6hmRI.css | 200 | gzip | 14314 | 3764 | 3999 |
| https://uncleolu.github.io/us-trade-partners/assets/LineChart-DSqb7EmM.js | 200 | gzip | 383752 | 105650 | 106262 |
| https://uncleolu.github.io/us-trade-partners/assets/PartnerPage-BmAcdO8d.js | 200 | gzip | 11869 | 3499 | 3718 |
| https://uncleolu.github.io/us-trade-partners/assets/sectionLabels-DNAnCw3g.js | 200 | gzip | 673 | 414 | 550 |
| https://uncleolu.github.io/us-trade-partners/data/20260909T091429Z-c638aff167ea/meta.json | 200 | gzip | 3561 | 1730 | 2088 |
| https://uncleolu.github.io/us-trade-partners/data/20260909T091429Z-c638aff167ea/partner/1220.json | 200 | gzip | 900513 | 76559 | 82321 |
| https://uncleolu.github.io/us-trade-partners/partner/1220?year=all | 301 | identity | 0 | 0 | 422 |
| https://uncleolu.github.io/us-trade-partners/partner/1220/?year=all | 200 | gzip | 575 | 343 | 534 |
| Total | | | 1540522 | 267342 | 276176 |

Budget: 300000 bytes; result: PASS.
Failed or incomplete asset checks: 0. Console errors: 0.
