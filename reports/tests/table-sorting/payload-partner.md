# Payload: partner-all

Route: /partner/1220?year=all
Mode: local preview; cold context; cache disabled; service workers blocked.
Gzip budget: sum of each response body compressed locally with Node zlib gzip level 6. This is not a network transfer measurement.
Redirect bodies are excluded from decoded and gzip budget totals (shown as zero); CDP redirect transfer bytes are included in transfer totals.
Transfer: Chrome Network.loadingFinished.encodedDataLength, including response headers reported by Chrome. Redirect bytes use response.encodedDataLength. These counts exclude TLS and transport overhead.

| Requested asset | Status | Content encoding | Decoded bytes | Gzip budget bytes | CDP transferred bytes |
|---|---:|---|---:|---:|---:|
| /us-trade-partners/assets/index-BvQjJCp3.js | 200 | gzip | 229333 | 76866 | 77289 |
| /us-trade-partners/assets/index-BvXhNnPD.css | 200 | gzip | 15141 | 3925 | 4290 |
| /us-trade-partners/assets/LineChart-D8AzR7L9.js | 200 | gzip | 383752 | 105650 | 106097 |
| /us-trade-partners/assets/PartnerPage-BNHE3aG2.js | 200 | gzip | 11613 | 3598 | 3970 |
| /us-trade-partners/assets/sectionLabels-DNAnCw3g.js | 200 | identity | 673 | 414 | 995 |
| /us-trade-partners/data/20260909T091429Z-c638aff167ea/meta.json | 200 | gzip | 3561 | 1730 | 2049 |
| /us-trade-partners/data/20260909T091429Z-c638aff167ea/partner/1220.json | 200 | gzip | 900513 | 76559 | 76936 |
| /us-trade-partners/partner/1220?year=all | 200 | identity | 575 | 340 | 825 |
| Total | | | 1545161 | 269082 | 272451 |

Budget: 300000 bytes; result: PASS.
Failed or incomplete asset checks: 0. Console errors: 0.
