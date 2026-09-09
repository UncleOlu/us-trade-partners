# Payload measurement: home route

Route: `/?year=2025`
Mode: local (`vite preview` of the production build), base path `/us-trade-partners/`
Measured with headless Chromium (Playwright): every network response for this navigation.
Gzip bytes are simulated locally (zlib.gzipSync on the decompressed body), not measured over the wire.

| Asset | Raw bytes | Gzip bytes (simulated) |
|---|---:|---:|
| ?year=2025 | 575 | 342 |
| assets/index-DWK-hIXE.js | 206,390 | 69,018 |
| assets/index-MOFDqOIc.css | 3,384 | 1,243 |
| atlas/countries-110m.json | 107,761 | 38,423 |
| data/20260909T091429Z-c638aff167ea/meta.json | 3,514 | 1,718 |
| data/20260909T091429Z-c638aff167ea/partners.json | 88,088 | 7,092 |
| data/20260909T091429Z-c638aff167ea/summary/2025.json | 138,525 | 10,606 |
| **Total** | **548,237** | **128,442** |

