# Payload: partner-1220

Route: /partner/1220?year=2025
Mode: local preview; cold context; cache disabled; service workers blocked.
Gzip budget: sum of each response body compressed locally with Node zlib gzip level 6. This is not a network transfer measurement.
Redirect bodies are excluded from decoded and gzip budget totals (shown as zero); CDP redirect transfer bytes are included in transfer totals.
Transfer: Chrome Network.loadingFinished.encodedDataLength, including response headers reported by Chrome. Redirect bytes use response.encodedDataLength. These counts exclude TLS and transport overhead.

| Requested asset | Status | Content encoding | Decoded bytes | Gzip budget bytes | CDP transferred bytes |
|---|---:|---|---:|---:|---:|
| /us-trade-partners/assets/index-BRStPDmu.js | 200 | gzip | 219735 | 73571 | 73994 |
| /us-trade-partners/assets/index-C7LRW71r.css | 200 | gzip | 12935 | 3494 | 3859 |
| /us-trade-partners/assets/LineChart-CXEiP8l9.js | 200 | gzip | 383752 | 105649 | 106096 |
| /us-trade-partners/assets/PartnerPage-Cuh2zPTV.js | 200 | gzip | 11191 | 3273 | 3645 |
| /us-trade-partners/assets/sectionLabels-DNAnCw3g.js | 200 | identity | 673 | 414 | 995 |
| /us-trade-partners/data/20260909T091429Z-c638aff167ea/partner/1220.json | 200 | gzip | 900513 | 76559 | 76936 |
| /us-trade-partners/partner/1220?year=2025 | 200 | identity | 575 | 340 | 825 |
| Total | | | 1529374 | 263300 | 266350 |

Budget: 300000 bytes; result: PASS.
Failed or incomplete asset checks: 0. Console errors: 0.
