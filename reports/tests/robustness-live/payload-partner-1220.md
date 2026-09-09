# Payload: partner-1220

Route: https://uncleolu.github.io/us-trade-partners/partner/1220?year=2025
Mode: deployed; cold context; cache disabled; service workers blocked.
Gzip budget: sum of each response body compressed locally with Node zlib gzip level 6. This is not a network transfer measurement.
Redirect bodies are excluded from decoded and gzip budget totals (shown as zero); CDP redirect transfer bytes are included in transfer totals.
Transfer: Chrome Network.loadingFinished.encodedDataLength, including response headers reported by Chrome. Redirect bytes use response.encodedDataLength. These counts exclude TLS and transport overhead.

| Requested asset | Status | Content encoding | Decoded bytes | Gzip budget bytes | CDP transferred bytes |
|---|---:|---|---:|---:|---:|
| https://uncleolu.github.io/us-trade-partners/assets/index-DpBObqI5.css | 200 | gzip | 13378 | 3592 | 3823 |
| https://uncleolu.github.io/us-trade-partners/assets/index-DXl5PV71.js | 200 | gzip | 220088 | 73659 | 74493 |
| https://uncleolu.github.io/us-trade-partners/assets/LineChart-DKJo0-jJ.js | 200 | gzip | 383752 | 105650 | 106263 |
| https://uncleolu.github.io/us-trade-partners/assets/PartnerPage-DWwhpT8h.js | 200 | gzip | 11225 | 3281 | 3518 |
| https://uncleolu.github.io/us-trade-partners/assets/sectionLabels-DNAnCw3g.js | 200 | gzip | 673 | 414 | 573 |
| https://uncleolu.github.io/us-trade-partners/data/20260909T091429Z-c638aff167ea/partner/1220.json | 200 | gzip | 900513 | 76559 | 82491 |
| https://uncleolu.github.io/us-trade-partners/partner/1220?year=2025 | 301 | identity | 0 | 0 | 423 |
| https://uncleolu.github.io/us-trade-partners/partner/1220/?year=2025 | 200 | gzip | 575 | 342 | 568 |
| Total | | | 1530204 | 263497 | 272152 |

Budget: 300000 bytes; result: PASS.
Failed or incomplete asset checks: 0. Console errors: 0.
