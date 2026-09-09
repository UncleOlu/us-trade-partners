# Payload: home-annual

Route: /?year=2025
Mode: local preview; cold context; cache disabled; service workers blocked.
Gzip budget: sum of each response body compressed locally with Node zlib gzip level 6. This is not a network transfer measurement.
Redirect bodies are excluded from decoded and gzip budget totals (shown as zero); CDP redirect transfer bytes are included in transfer totals.
Transfer: Chrome Network.loadingFinished.encodedDataLength, including response headers reported by Chrome. Redirect bytes use response.encodedDataLength. These counts exclude TLS and transport overhead.

| Requested asset | Status | Content encoding | Decoded bytes | Gzip budget bytes | CDP transferred bytes |
|---|---:|---|---:|---:|---:|
| /us-trade-partners/?year=2025 | 200 | identity | 575 | 341 | 825 |
| /us-trade-partners/assets/index-BQtHDhBp.js | 200 | gzip | 225265 | 75385 | 75808 |
| /us-trade-partners/assets/index-D3av5FEM.css | 200 | gzip | 13745 | 3681 | 4046 |
| /us-trade-partners/atlas/countries-110m.json | 200 | gzip | 107761 | 38423 | 38769 |
| /us-trade-partners/data/20260909T091429Z-c638aff167ea/meta.json | 200 | gzip | 3561 | 1730 | 2049 |
| /us-trade-partners/data/20260909T091429Z-c638aff167ea/partners.json | 200 | gzip | 88097 | 7098 | 7419 |
| /us-trade-partners/data/20260909T091429Z-c638aff167ea/summary/2025.json | 200 | gzip | 138527 | 10611 | 10933 |
| Total | | | 577531 | 137269 | 139849 |

Budget: 250000 bytes; result: PASS.
Failed or incomplete asset checks: 0. Console errors: 0.
