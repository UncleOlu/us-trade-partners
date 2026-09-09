# Final deployed UI audit

Source: `26d08bddf47e1e5eb4dc04976e1ed77ca74f0f26`. Pages run: `34401062519`. Site: https://uncleolu.github.io/us-trade-partners/.

Root index returned HTTP 200 and matched final local SHA256 `ea825b4bfa5a1d35b5bde3b8ac6ae63028a979cae8d143466abcd2f2f5879c9e`. See index-receipt.json. Snapshot remains `20260909T091429Z-c638aff167ea`.

## Results

- Normal production flow: 12 collected, 12 passed, 0 failed, 0 skipped. See normal-flow.txt and results.json. No fault injection ran on production.
- Existing behavior audit: 8 collected, 8 passed, 0 failed, 0 skipped. Includes HTTP 200 and query preservation for all 261 known routes, browser entry and refresh for each route class, CSV/status values, methodology, map mouse/keyboard selection and responsive layouts. See legacy-audit.txt and legacy-audit/results.json.
- New live checks cover invalid query recovery, Back/Forward, year/rank navigation context, product-section state on refresh, missing reason tap/keyboard access, Hub partner/product search, search/export scope, map roving keyboard focus, exact KPI fit and table geometry.
- At 320px and 390px, fixed year header and body both start at x=34px. Product names and their header scroll together. The last product numeric column remains fully visible at maximum scroll. Exact KPI values fit at 320px, 390px, 640px and 1280px with keyboard focus retained.
- No unexpected page errors, console errors, failed assets or incomplete assets in the live checks.

## Cold-load bytes

Fresh Chromium context, cache disabled, service workers blocked. Each payload JSON and Markdown lists every requested asset, HTTP status and content encoding. Decoded response bodies use local Node zlib gzip level 6 for the agreed budget. This computed gzip sum is separate from measured network transfer.

| Route | Computed gzip bytes | Budget | Measured CDP transfer bytes | Requests |
|---|---:|---:|---:|---:|
| home-2025 | 135,455 | 250,000 | 139,786 | 7 |
| home-2013 | 135,641 | 250,000 | 139,937 | 7 |
| partner-1220 | 263,497 | 300,000 | 272,152 | 8 |

All three budgets pass. Successful responses use gzip. Partner entry includes one HTTP 301 with identity encoding before the canonical trailing-slash URL. CDP transfer counts include response headers and redirect bytes reported by Chrome; they exclude TLS and transport overhead. Small header variation between independent cold runs is expected. The separate legacy cold sample measured home 139,782 bytes and China 271,661 bytes; it is not the partner1220 budget sample.

## Screenshots and limits

Captured five page classes (home, partner, Hub, section, methodology): desktop/mobile full pages and viewport images at 1280px, 390px, 320px and 640px. Inspected all 20 viewport images, both map close views and four table max-scroll images. Full pages preserve additional evidence; long Hub screenshots need zoom to read. Screenshot names use desktop-, mobile-, narrow- and reflow- prefixes.

No new defect found in these checks. Accepted trade-offs remain: controls place the map below the first screen; the map readout reserves space to prevent movement; the Hub is long; exact KPI cards expand; product-group names scroll; short year/ID columns remain fixed. At intermediate scroll offsets, a column at the container edge can appear partly clipped. Each column can be viewed by changing scroll position. Small map countries also have search/keyboard access. The 640px case is an equivalent reduced viewport reflow test, not a browser 200% zoom measurement. Chromium checks do not prove full screen-reader or cross-browser compliance.

Local fault tests remain separate in ../robustness-after/ledger.json: 25 unique cases with latest results passing, including request errors, race cleanup, header/body timeouts and reload recovery. That ledger preserves earlier results and affected reruns. Production did not repeat faults. Data tests were not rerun for this UI-only deployment.

Commands and exit codes: commands.json. No app source changed during this audit. A test-only screenshot refinement clips the visible table region; it does not change geometry checks or app assets.

Usage: current Codex model. Uncached input, cache writes, cache reads, output and cost are unknown.
