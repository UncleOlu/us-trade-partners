# Payload: home-2013

Route: /?year=2013
Mode: local preview; cold context; cache disabled; service workers blocked.
Gzip budget: sum of each response body compressed locally with Node zlib gzip level 6. This is not a network transfer measurement.
Redirect bodies are excluded from decoded and gzip budget totals (shown as zero); CDP redirect transfer bytes are included in transfer totals.
Transfer: Chrome Network.loadingFinished.encodedDataLength, including response headers reported by Chrome. Redirect bytes use response.encodedDataLength. These counts exclude TLS and transport overhead.

| Requested asset | Status | Content encoding | Decoded bytes | Gzip budget bytes | CDP transferred bytes |
|---|---:|---|---:|---:|---:|
| /us-trade-partners/?year=2013 | 200 | identity | 575 | 340 | 825 |
| /us-trade-partners/assets/index-BRStPDmu.js | 200 | gzip | 219735 | 73571 | 73994 |
| /us-trade-partners/assets/index-C7LRW71r.css | 200 | gzip | 12935 | 3494 | 3859 |
| /us-trade-partners/atlas/countries-110m.json | 200 | gzip | 107761 | 38423 | 38769 |
| /us-trade-partners/data/20260909T091429Z-c638aff167ea/meta.json | 200 | gzip | 3561 | 1730 | 2049 |
| /us-trade-partners/data/20260909T091429Z-c638aff167ea/partners.json | 200 | gzip | 88097 | 7098 | 7419 |
| /us-trade-partners/data/20260909T091429Z-c638aff167ea/summary/2013.json | 200 | gzip | 138117 | 10797 | 11119 |
| Total | | | 570781 | 135453 | 138034 |

Budget: 250000 bytes; result: PASS.
Failed or incomplete asset checks: 0. Console errors: 0.
