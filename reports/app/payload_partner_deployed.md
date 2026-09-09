# Payload: Partner 1220 deployed

Route: https://uncleolu.github.io/us-trade-partners/partner/1220?year=2025
Mode: deployed; cold context; cache disabled; service workers blocked.
Gzip budget: sum of each response body compressed locally with Node zlib gzip level 6. This is not a network transfer measurement.
Redirect bodies are excluded from decoded and gzip budget totals (shown as zero); CDP redirect transfer bytes are included in transfer totals.
Transfer: Chrome Network.loadingFinished.encodedDataLength, including response headers reported by Chrome. Redirect bytes use response.encodedDataLength. These counts exclude TLS and transport overhead.

| Requested asset | Status | Content encoding | Decoded bytes | Gzip budget bytes | CDP transferred bytes |
|---|---:|---|---:|---:|---:|
| https://uncleolu.github.io/us-trade-partners/assets/index-BQkog3VO.js | 200 | gzip | 207333 | 69431 | 70227 |
| https://uncleolu.github.io/us-trade-partners/assets/index-CyHPlMRu.css | 200 | gzip | 3583 | 1286 | 1480 |
| https://uncleolu.github.io/us-trade-partners/assets/LineChart-BGPdWWJq.js | 200 | gzip | 383752 | 105649 | 106287 |
| https://uncleolu.github.io/us-trade-partners/assets/PartnerPage-BcXz1ihj.js | 200 | gzip | 10185 | 2973 | 3214 |
| https://uncleolu.github.io/us-trade-partners/data/20260909T091429Z-c638aff167ea/partner/1220.json | 200 | gzip | 900513 | 76559 | 82344 |
| https://uncleolu.github.io/us-trade-partners/partner/1220?year=2025 | 301 | identity | 0 | 0 | 406 |
| https://uncleolu.github.io/us-trade-partners/partner/1220/?year=2025 | 200 | gzip | 575 | 342 | 578 |
| Total | | | 1505941 | 256240 | 264536 |

Budget: 300000 bytes; result: PASS.
Failed or incomplete asset checks: 0. Console errors: 0.
