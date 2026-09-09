# Pipeline release and rotation

`make release SNAPSHOT=<id>` creates and verifies two deterministic ZIP
files. With an authenticated origin remote, it uploads both to one GitHub
Release and verifies both by download. `pipeline/publish_rotate.py --release
<id> --local-only` creates local artifacts without an upload.

| Asset | Contents | Use |
|---|---|---|
| `<id>.zip` | Built JSON at root, raw manifest, validation.csv if all rows belong to this snapshot | Restore built data for the site |
| `<id>.raw.zip` | Complete `raw/<id>/` tree, including all saved request and response bodies | Rebuild with the recorded pipeline commit |
| Each ZIP `.sha256` | Full SHA256 and asset filename | Verify downloaded bytes |
| `<id>.release.json` | Snapshot, pipeline commit, immutable tag, asset names and checksums | Pin deployment and audit the release |

Snapshot id identifies raw acquisition, as defined in schema/CONTRACT.md.
A built release has tag `build-<id>-<pipeline commit first 12>-<built ZIP
SHA256 first 12>`. The descriptor records full commit and checksums. Each
ZIP fixes entry timestamps to 1980-01-01, sorts names, and sets file modes.
Changed built bytes get a different tag. Existing remote assets cannot be
overwritten by the pipeline. Reuse requires matching download checks.

Deployment pins the built asset and full SHA256 in
`scripts/snapshot-release.json`; it must verify before extracting.
The raw ZIP does not enter the site deployment. Restoring built JSON also
requires the source commit and Node dependencies to build the app.
Rebuilding from raw requires the pipeline commit, Python dependencies,
reference files and independent fixtures in that commit. Never fetch new
Census responses to replace missing historical raw evidence.

Rotation runs only after the new built snapshot exists. It validates every
raw manifest file hash, builds both archives, compares every ZIP member
against local source bytes, uploads, and downloads both archives to check
their SHA256 values. Only then does it delete the prior `data/<id>/`.
Archive, upload, download, authentication, or remote failures preserve the
prior built snapshot. Raw trees are never removed by rotation. Tests use
temporary fixtures and a fake GitHub CLI. They do not rotate working data.

Datasets, raw responses, release ZIPs and the full validation report stay
outside Git history. Small code, reports and release pins remain tracked.
`make test-rotation` covers success and failure paths. Full raw storage adds
release storage and transfer cost, but permits rebuild without another
acquisition. The built ZIP remains separate to limit deployment transfer.

Usage: input, cache writes, cache reads and output tokens are unknown.
