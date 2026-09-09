# Payload: partner-1220

Route: /partner/1220?year=2025
Mode: local preview; cold context; cache disabled; service workers blocked.
Gzip budget: sum of each response body compressed locally with Node zlib gzip level 6. This is not a network transfer measurement.
Redirect bodies are excluded from decoded and gzip budget totals (shown as zero); CDP redirect transfer bytes are included in transfer totals.
Transfer: Chrome Network.loadingFinished.encodedDataLength, including response headers reported by Chrome. Redirect bytes use response.encodedDataLength. These counts exclude TLS and transport overhead.

| Requested asset | Status | Content encoding | Decoded bytes | Gzip budget bytes | CDP transferred bytes |
|---|---:|---|---:|---:|---:|
| /us-trade-partners/assets/index-BxjP7JUB.js | 200 | gzip | 220088 | 73658 | 74081 |
| /us-trade-partners/assets/index-D1ls8H9p.css | 200 | gzip | 13283 | 3564 | 3929 |
| /us-trade-partners/assets/LineChart-DfQH5aHF.js | 200 | gzip | 383752 | 105651 | 106098 |
| /us-trade-partners/assets/PartnerPage-DJqtPjLK.js | 200 | gzip | 11225 | 3282 | 3654 |
| /us-trade-partners/assets/sectionLabels-DNAnCw3g.js | 200 | identity | 673 | 414 | 995 |
| /us-trade-partners/data/20260909T091429Z-c638aff167ea/partner/1220.json | 200 | gzip | 900513 | 76559 | 76936 |
| /us-trade-partners/partner/1220?year=2025 | 200 | identity | 575 | 341 | 825 |
| Total | | | 1530109 | 263469 | 266518 |

Budget: 300000 bytes; result: PASS.
Failed or incomplete asset checks: 0. Console errors: 0.
