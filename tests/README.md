# tests/

Independent test suite for the US goods trade partner visualization,
owned by Agent D. Never reads pipeline/ implementation code (see
AGENTS.md). Full test list and status: reports/tests/test_list.md.

## Running

```
./.venv-tests/bin/python -m pytest tests -q -c tests/pytest.ini
```

## Staged-build environment variable overrides

By default the suite discovers the published snapshot under
`data/<snapshot_id>/`, its matching `raw/<snapshot_id>/` archive, and
`reports/pipeline/validation.csv`. To run the suite against a staged,
unpublished build instead (for example a local pipeline output that has
not yet been copied into `data/`), set any of:

| Variable | Points to | Used by |
|---|---|---|
| `DATA_DIR` | a `data/<snapshot_id>`-shaped directory | `conftest.discover_snapshot_dir` (the `snapshot_dir` fixture / `require_snapshot`), i.e. every integration test that reads `data/<snapshot_id>/...` |
| `RAW_DIR` | the matching `raw/<snapshot_id>`-shaped directory | `conftest.resolve_raw_dir`, used by `test_c07a_eu_calculation_full` |
| `VALIDATION_CSV` | a `validation.csv`-shaped file | `conftest.require_validation_csv`, used by every check-6/7b/vcsv test |

Example:

```
DATA_DIR=/path/to/staged/data \
RAW_DIR=/path/to/staged/raw \
VALIDATION_CSV=/path/to/staged/validation.csv \
./.venv-tests/bin/python -m pytest tests -q -c tests/pytest.ini
```

Each variable is independent; set any subset. Unsetting one falls back
to the default path it replaces. None of the assertions change: a
staged build still has to match the real schema and contract for these
tests to pass. See the `tests/conftest.py` module docstring for the
exact fallback logic, and `tests/test_config_overrides.py` for the
tests that prove the override mechanism itself.
