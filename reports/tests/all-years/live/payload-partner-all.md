# Payload: partner-all

Route: https://uncleolu.github.io/us-trade-partners/partner/1220?year=all
Mode: deployed; cold context; cache disabled; service workers blocked.
Gzip budget: sum of each response body compressed locally with Node zlib gzip level 6. This is not a network transfer measurement.
Redirect bodies are excluded from decoded and gzip budget totals (shown as zero); CDP redirect transfer bytes are included in transfer totals.
Transfer: Chrome Network.loadingFinished.encodedDataLength, including response headers reported by Chrome. Redirect bytes use response.encodedDataLength. These counts exclude TLS and transport overhead.

| Requested asset | Status | Content encoding | Decoded bytes | Gzip budget bytes | CDP transferred bytes |
|---|---:|---|---:|---:|---:|
| https://uncleolu.github.io/us-trade-partners/assets/index-BQtHDhBp.js | 200 | gzip | 225265 | 75385 | 76252 |
| https://uncleolu.github.io/us-trade-partners/assets/index-D3av5FEM.css | 200 | gzip | 13745 | 3681 | 3945 |
| https://uncleolu.github.io/us-trade-partners/assets/LineChart-D1iIHiTH.js | 200 | gzip | 383752 | 105650 | 106348 |
| https://uncleolu.github.io/us-trade-partners/assets/PartnerPage-B79rYeyP.js | 200 | gzip | 11769 | 3486 | 3687 |
| https://uncleolu.github.io/us-trade-partners/assets/sectionLabels-DNAnCw3g.js | 200 | gzip | 673 | 414 | 546 |
| https://uncleolu.github.io/us-trade-partners/data/20260909T091429Z-c638aff167ea/meta.json | 200 | gzip | 3561 | 1730 | 2053 |
| https://uncleolu.github.io/us-trade-partners/data/20260909T091429Z-c638aff167ea/partner/1220.json | 200 | gzip | 900513 | 76559 | 82285 |
| https://uncleolu.github.io/us-trade-partners/partner/1220?year=all | 301 | identity | 0 | 0 | 407 |
| https://uncleolu.github.io/us-trade-partners/partner/1220/?year=all | 200 | gzip | 575 | 341 | 531 |
| Total | | | 1539853 | 267246 | 276054 |

Budget: 300000 bytes; result: PASS.
Failed or incomplete asset checks: 0. Console errors: 0.
