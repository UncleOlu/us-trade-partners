# Final read-only audit

Verdict: APPROVED for app source caa2547b8e31c5add9883b3c81cfef8fc5297938, pipeline e15309d0cf6468d4b4d64d00555aa33711221b89, and the pinned release. The later redirect-measurement fix also passed review. No required fixes remain.

The independent chief-of-staff reviewer read the owner request, AGENTS.md, docs/SPEC.md, schema/CONTRACT.md, source, release, test, deployment, and image evidence. It changed no files and made no external changes.

| Requirement | Result | Evidence |
|---|---|---|
| Preserve unfinished work | PASS | External backup and retained history |
| Portable pipeline | PASS | Six modules use file-derived roots or configuration |
| Privacy and history cleanup | PASS | 17 commits, 305 blobs; author and committer checked; no private paths or forbidden dataset paths |
| Secret scans | PASS | Successful history, archive, and deployment Gitleaks results |
| Pipeline provenance and offline rebuild | PASS | Reachable e15309d; two 274-file trees identical |
| Full validation and determinism | PASS | 219,446 PASS; 28 NOT_COMPARABLE; 128 tests passed without skips |
| Immutable release and restore | PASS | Pin and checksum-before-extraction helper; clean restore/build |
| Full raw archive and safe rotation | PASS | 4,145 manifest entries matched; 14 fixture tests |
| UI conditions | PASS | Source, eight live audit groups, inspected images |
| Methodology and full TypeScript | PASS | Nine metadata checks, code 8220 source, src/map included |
| Authorized hosted deployment | PASS | Workflow 34396398376 completed successfully |
| Production routes and interactions | PASS | 261 routes; refresh, query, map, CSV, missing labels, no console errors |
| Budgets and transfer measures | PASS | Current payload reports separate gzip and CDP transfer |
| Desktop and mobile visuals | PASS | Home, hub, partner, section and methodology evidence |
| Independent read-only review | PASS | No auditor writes or external actions |

## Closed findings

- Earlier payload reports describe old assets. Current deployed reports supersede them.
- Raw responses total 2,071: 1,880 JSON and 191 text. Reports now state both counts.
- The redirect encoding label now reads the response header, with identity as default. The affected measurement was repeated and passed.

## Verification scope

The auditor independently executed read-only history, private-content, ancestry, rebuild-byte, ZIP CRC/hash, raw manifest, validation-count, and em dash checks. It inspected saved successful test, scan, clean-build, download-back, and deployment results. It viewed deployed desktop/mobile home and hub, plus mobile partner and section images. The orchestrator separately viewed all ten page/viewport combinations.

The auditor did not rerun acquisition, build, tests, deployment, or downloads. One combined inspection failed when an intermediate extra-route file disappeared during report cleanup; final production results remained available. That transient file error did not concern app behavior.

The verdict covers the inspected code and measurement fix. Final evidence-only commits contain no UI, pipeline, schema, or dependency changes. Later changes need review.

## Limits and usage

The 26 EU and two published-example comparisons remain NOT_COMPARABLE. Some small partners have no 110m map shape. Long official section labels and the full hub make mobile pages long. The separate 8.3 MB raw ZIP is the storage cost of offline reproducibility.

Browser and write tools were exposed to the auditor but unused. Read-only restraint followed instructions rather than tool removal. Input, cache, output, and billing metrics are unknown.
