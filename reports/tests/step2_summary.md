# Step 2 test run summary

Command:

```
./.venv-tests/bin/python -m pytest ./tests -q -c ./tests/pytest.ini
```

Full output: `reports/tests/step2_run.txt`.

## Counts

| Metric | Count |
|---|---|
| Expected check count (tests collected) | 88 |
| Executed | 88 |
| Passed | 56 |
| Failed | 0 |
| Errors | 0 |
| Warnings | 0 |
| Skipped (reported as not run) | 32 |

All 88 tests ran (pytest executed every test; "not run" below means the
test body called `pytest.skip(...)` with a reason, which pytest reports as
SKIPPED, not as passed or errored). No test was weakened or removed to
reach a pass.

## Not run, grouped by reason

1. **data/ directory does not exist yet (step 3 not run)** - 24 tests.
   These discover `data/<snapshot_id>/` at run time via `conftest.discover_snapshot_dir()`
   and skip with this reason when zero directories match the SnapshotId
   pattern. Affected tests:
   - test_schema_validity.py: test_sch02, test_sch03, test_sch04, test_sch05, test_sch06, test_sch07
   - test_determinism.py: test_det01, test_det02, test_det03, test_det04
   - test_validation_checks.py: test_c01 (both), test_c02, test_c03 (both), test_c04, test_c05, test_c07a_eu_calculation_full, test_c08, test_c09
   - test_meta_json.py: test_meta02, test_meta03, test_meta04, test_meta05

2. **reports/pipeline/validation.csv does not exist yet (step 3 not run)** - 6 tests.
   - test_validation_csv_contract.py: test_vcsv01, test_vcsv02, test_vcsv03, test_vcsv04
   - test_validation_checks.py: test_c06_published_examples_include_required_identifiers, test_c07b_eu_comparability_is_informational_only

3. **DATA_A and DATA_B environment variables are unset** - 1 test.
   - test_determinism.py::test_det05_rebuild_byte_identity

4. **src/ does not exist yet (step 4 not run)** - 1 test.
   - test_typescript_types_placeholder.py::test_ts01_generated_types_match_fresh_generation

## Failures

None.

## Notes on coverage now vs later

Every check that needs `data/<snapshot_id>/` or `reports/pipeline/validation.csv`
has two forms in this suite: a synthetic unit test (suffix `u`, for example
`test_c02u_group_sum_blocks_on_absent_chapter`) that exercises the exact
recomputation logic in `tests/_checks.py` against constructed inputs and
runs unconditionally now, and an integration test (no `u` suffix, for
example `test_c02_partner_totals_equal_chapter_sums`) that runs the same
logic against the real snapshot once step 3 produces `data/`. This means
the check logic itself is verified today, not only after data exists.

One check (EU calculation, 7a) cannot be fully recomputed even after
`data/<snapshot_id>` exists, because it also needs member-level raw data
under `raw/<snapshot_id>/` for every EU member and configured year, which
is outside the `raw/source_test/` sample (that sample has boundary-month
data for only Croatia and the UK). `test_c07a_eu_calculation_full`
documents the assumed file pattern (open question for the orchestrator,
see final report) and skips until that directory exists.
