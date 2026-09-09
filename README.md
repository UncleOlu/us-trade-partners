# US goods trade partners

US Census goods trade by partner, year, and HS category. Nominal USD, Census basis. Services excluded. Coverage: 2013 to 2025.

- [Live site](https://UncleOlu.github.io/us-trade-partners/)
- [Repository](https://github.com/UncleOlu/us-trade-partners)
- [Specification](docs/SPEC.md)
- [Data contract](schema/CONTRACT.md)
- [Continuation audit](docs/continuation-audit.md)

## Build the pinned site

Use Node 20, npm 10, Python 3, and the GitHub CLI. On macOS the restore helper uses Homebrew Python 3.12. In a clean checkout:

```sh
npm ci
GITHUB_REPOSITORY=UncleOlu/us-trade-partners node scripts/restore-snapshot.mjs
npm run build
```

The restore helper downloads the exact built archive in `reports/pipeline/current_release.json` and checks its SHA-256 before extraction. It refuses to replace an existing snapshot directory. The Pages workflow uses the same helper and serves `/us-trade-partners/`.

## Data and reproducibility

Datasets and the full validation CSV are release assets, not Git content. The snapshot ID identifies the raw acquisition. The release tag also includes the pipeline commit and built archive checksum. The release pin records both built and full raw archive checksums.

The built ZIP restores the site. The separate raw ZIP holds the saved requests, responses, and manifest required for an offline rebuild. Verify its SHA-256 before extracting it at the repository root. Use the `pipeline_commit` in the release pin for a byte-identical rebuild, because `meta.code_commit` records the checked-out commit.

Python uses a uv-managed `.venv` with Python 3.12. The source head holds tested version pins; save `requirements.txt` before switching to the recorded pipeline commit. Install and rebuild:

```sh
uv venv --python 3.12 .venv
uv pip install --python .venv/bin/python -r requirements.txt
make rebuild SNAPSHOT=20260909T091429Z-c638aff167ea
```

The rebuild uses saved data and makes no Census request. New acquisition requires `CENSUS_API_KEY` from the environment or the private mode-600 file `~/.config/us-trade-partners/env`. Never commit that file or print the key.

## Checks

```sh
npm run gen:types
npm run build
.venv-tests/bin/python -m pytest tests -c tests/pytest.ini
make test-rotation
node tests/e2e/run.mjs
```

Set `DATA_A` and `DATA_B` to distinct builds to run the byte-identity test. See the audit for final test counts, known data limits, archive evidence, screenshots, and separately measured gzip budgets and network transfers.
