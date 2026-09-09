# Continuation audit

Status: deployed; final read-only review recorded below. This file records the Codex continuation on 2026-09-09. Earlier reports describe earlier builds and are not final verification.

## Approved scope

The owner approved public repository creation under UncleOlu, pushing main, GitHub Pages at /us-trade-partners/, UI and privacy fixes, release storage, deployed checks, and the final read-only audit. Home budget: 250,000 gzip bytes. Partner budget: 300,000 gzip bytes. No new Census acquisition.

## Initial state and preservation

- main had 15 commits and no remote. The worktree held seven modified files and two untracked test helpers.
- Authenticated GitHub account: UncleOlu. The approved repository did not exist when checked with gh. Sandbox authentication failed; the same read-only check outside the sandbox succeeded.
- An existing Vite preview on port 4401 and Claude process were left intact.
- A recoverable backup outside the repository includes Git, raw archives, data, reports, and unfinished edits. It excludes reproducible dependency folders and dist. SHA-256: e62824d4efad09e073bd45d5a98f04a8c5db80ce3aed84c163d629c92fc7ecbd.
- Privacy cleanup ran first on a separate mirror. It kept all author and committer names. All 15 commits identified the owner, Olu O; their personal email became the configured GitHub noreply address. No other contributor was reassigned.
- A mixed reset installed the cleaned history without changing working files. No force push occurred.

## Checks before the final build

- Cleaned history: 15 commits, 255 unique blobs; zero private home paths, personal Gmail addresses, tracked data snapshot paths, or full validation CSV paths.
- Gitleaks history scan: successful, no findings. It reported 13 commits with scanned patches; the separate tree check covered all 15 commits and all 255 blobs.
- Raw acquisition manifest: 4,145 listed files, every saved hash matched. SHA-256: c638aff167ea5ada6f00e7d37b6bd2f81551b3e3bbf2ec2a0fced6d3b585e33f.
- Raw targeted checks: no private home paths, personal Gmail addresses, or nonempty credential URL parameters found.

## Meaning of identities

The snapshot ID identifies the raw acquisition, including its manifest hash. It does not identify a particular build. A release must use an immutable build identity tied to the pipeline commit and archive checksum. The committed release pin must identify the exact artifact and expected checksum.

Built snapshot archives support restoring the site. Full raw archives support rebuilding from saved responses with the recorded pipeline commit. A manifest alone does not support rebuilding.

## Usage

Uncached input, cache writes by duration, cache reads, output, and billed cost are unknown for each phase and agent. No cost estimate is made.

## Final local build and release

- Pipeline commit: e15309d0cf6468d4b4d64d00555aa33711221b89. Two offline builds have 274 identical files. No Census acquisition ran.
- Validation: 219,446 PASS, 28 NOT_COMPARABLE, zero FAIL. The 28 are 26 EU definition comparisons and two absent-value published examples.
- Independent tests: 128 passed, zero skipped. Six existing browser tests and eight local audit groups passed, including all 261 known routes.
- Rotation: 14 temporary-fixture tests passed, including archive, upload, built download, and raw download failures. The current snapshot was not rotated for testing.
- Release pin: reports/pipeline/current_release.json. Built ZIP: 17,928,237 bytes, 276 members. Raw ZIP: 8,263,420 bytes, 4,146 members, including 1,880 JSON responses and 191 text responses (2,071 total).
- Built SHA-256: ad408822949e953f318e88084a06d278ef8b87a899dd108c0264481d47627607.
- Raw SHA-256: fd106b0b71828cb0fc4ef3f2c4fe6de3f46b113666368357a7b9d91b880c7c8b.
- Both archives passed member-path, CRC, and source-hash checks. Targeted privacy and credential-parameter checks found zero findings. Gitleaks scanned their extracted contents successfully with no findings.
- Reviewed source history before publication: 17 commits, 305 unique blobs, zero targeted violations. Gitleaks passed.
- Full TypeScript checking includes src/map. The final rendered build had no unresolved markers and matched all nine checked metadata values.

Trade-offs: the separate full raw archive adds 8.3 MB to release storage but permits offline rebuilding. Exact values can widen cards; each card contains its own horizontal scroll. The hub lists all partners and is long on mobile. The fixed 110m map omits some small shapes; those partners remain in tables, search, and the hub.

## Publication and access

The public repository and release were created under the authenticated UncleOlu account. Initial source commit: caa2547b8e31c5add9883b3c81cfef8fc5297938. Both published archives were downloaded again; their hashes and release descriptor matched the pin. A clean local checkout restored all 274 built files and passed the full production build. Deployment files also passed targeted privacy checks and Gitleaks (546 files, no findings).

Automatic approval review rejected a combined command because it included a broad allowed-actions policy change. That command did not run. The next approved command enabled Actions without changing the allowed-actions policy, created Pages, and started the deployment workflow. No permission blocker remains.

## Live production checks

Site: https://uncleolu.github.io/us-trade-partners/
Repository: https://github.com/UncleOlu/us-trade-partners
Release: https://github.com/UncleOlu/us-trade-partners/releases/tag/build-20260909T091429Z-c638aff167ea-e15309d0cf64-ad408822949e

The live audit passed all eight groups, with zero failed or skipped groups. Every one of the 261 known routes returned HTTP 200 after its canonical redirect and retained the query. Browser direct entry and refresh covered home, partner, section, hub, and methodology. Tests exercised map mouse, Enter and Space selection; year and rank state; CSV exact values and statuses; missing-data labels; numeric no-wrap; contained mobile scrolling; and zero console errors. Evidence: reports/tests/deployed-audit.txt, deployed/results.json, and takeover-audit.md.

### Payloads

| Route | Gzip budget bytes | Limit | Measured cold transfer bytes |
|---|---:|---:|---:|
| Home 2025 | 128,921 | 250,000 | 133,187 |
| Home 2013, largest summary | 129,107 | 250,000 | 133,562 |
| Canada 1220, largest partner | 256,240 | 300,000 | 264,536 |

Gzip budget bytes are the sum of decoded response bodies compressed with Node zlib gzip level 6. They are not measured network bytes. Redirect bodies are excluded from this file-payload budget. Transfers use Chrome CDP encodedDataLength in fresh contexts with cache disabled and service workers blocked. They include reported HTTP response headers and redirects, and exclude TLS and transport overhead. Content bodies used gzip; the partner redirect used identity. Each report under reports/app/payload_*_deployed.md lists every requested URL, status, encoding, decoded size, gzip size, and transfer size. Separate browser runs can differ in header bytes.

All 236 partner JSON files and 13 yearly summaries were checked to find the largest gzip inputs. Canada 1220 and year 2013 are the largest. See route-data-maximums.json.

### Screenshots and visual review

Both the orchestrator and read-only reviewer inspected deployed screenshots. The orchestrator inspected all ten page/viewport combinations: home, partner, section, hub, and methodology at desktop 1280 x 900 and mobile 390 x 844. Full-page and viewport images are saved under reports/tests/deployed/. No page overflow or clipped normal text was found. Table overflow stays inside scroll containers. Full official section names and the complete hub list make mobile pages long.

- Desktop home: reports/tests/deployed/desktop-home-viewport.png
- Mobile home: reports/tests/deployed/mobile-home-viewport.png
- Desktop hub: reports/tests/deployed/desktop-hub-viewport.png
- Mobile hub: reports/tests/deployed/mobile-hub-viewport.png

### Remaining limits

- Coverage stops at full year 2025; meta.latest_period 2026-07 is the latest source month observed at acquisition, not a complete 2026 annual dataset.
- The 26 EU comparisons remain NOT_COMPARABLE because matching source membership/release definitions are not verified. Numerical agreement or differences do not prove that definition.
- Two published-example flow comparisons remain NOT_COMPARABLE because the API value is absent; printed 0.0 million is not evidence of exact zero.
- Partner-level source revisions that leave world totals unchanged can evade the acquisition fingerprint.
- Some small territories have no 110m map shape. Search, tables, and the hub still include them.
- Full raw storage adds 8.3 MB per release; it is separate from the site payload.
- A redundant remote clone stalled and was stopped. It is not counted as a successful check. The independent local clean checkout build and actual GitHub clean-checkout workflow both passed.

### Final audit correction

The read-only reviewer found that the measurement helper used the word redirect as a content-encoding label. A separate implementation pass now reads the redirect response encoding and states the gzip-budget exclusion. The affected Canada measurement was repeated successfully: seven requests, zero failed/incomplete checks, zero console errors. UI and pipeline files did not change.

## Final read-only verdict

APPROVED. No required fixes remain. See final-read-only-audit.md for all 15 requirement checks, independent checks executed, saved results inspected, closed findings, and audit limits. Final evidence changes do not alter app, pipeline, schema, or dependencies.
