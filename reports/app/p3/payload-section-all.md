# Payload: section-all

Route: /section/XVI?year=all
Mode: local preview; cold context; cache disabled; service workers blocked.
Gzip budget: sum of each response body compressed locally with Node zlib gzip level 6. This is not a network transfer measurement.
Redirect bodies are excluded from decoded and gzip budget totals (shown as zero); CDP redirect transfer bytes are included in transfer totals.
Transfer: Chrome Network.loadingFinished.encodedDataLength, including response headers reported by Chrome. Redirect bytes use response.encodedDataLength. These counts exclude TLS and transport overhead.

| Requested asset | Status | Content encoding | Decoded bytes | Gzip budget bytes | CDP transferred bytes |
|---|---:|---|---:|---:|---:|
| /us-trade-partners/assets/index-CKZ4k9Xb.css | 200 | gzip | 15433 | 3976 | 4341 |
| /us-trade-partners/assets/index-CTQ9jUFw.js | 200 | gzip | 231724 | 77691 | 78114 |
| /us-trade-partners/assets/LineChart-7r9UwV82.js | 200 | gzip | 383752 | 105652 | 106099 |
| /us-trade-partners/assets/sectionLabels-DNAnCw3g.js | 200 | identity | 673 | 414 | 995 |
| /us-trade-partners/assets/SectionPage-BhVc29XG.js | 200 | gzip | 7089 | 2772 | 3143 |
| /us-trade-partners/data/20260909T091429Z-c638aff167ea/meta.json | 200 | gzip | 3561 | 1730 | 2049 |
| /us-trade-partners/data/20260909T091429Z-c638aff167ea/section/XVI.json | 200 | gzip | 2111296 | 130617 | 131041 |
| /us-trade-partners/section/XVI?year=all | 200 | identity | 575 | 342 | 825 |
| Total | | | 2754103 | 323194 | 326607 |

Budget: not set bytes; result: not applicable.
Failed or incomplete asset checks: 0. Console errors: 0.
