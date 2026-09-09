# Step 3 prep: contract-finalization test summary (Agent D)

Command:

```
./.venv-tests/bin/python -m pytest tests -v -rs -c tests/pytest.ini
```

Full output: reports/tests/step3_prep_run.txt

## Counts

| metric | count |
|---|---|
| expected (collected) | 107 |
| executed (ran to a real pass/fail) | 71 |
| passed | 71 |
| failed | 0 |
| errors | 0 |
| warnings | 0 |
| skipped (not run) | 36 |

71 + 36 = 107. Nothing errored; nothing failed; pytest emitted no warnings.

## Not-run breakdown (36), grouped by reason

| reason | count | tests |
|---|---|---|
| `data/` directory does not exist yet (step 3 not run) | 27 | every `test_c0X_*` / `test_sch0X_*` / `test_mrr02_*` / `test_kind02_*` integration test that reads `data/<snapshot_id>/`, via the shared `snapshot_dir` fixture in `tests/conftest.py` |
| `reports/pipeline/validation.csv` does not exist yet (step 3 not run) | 7 | `test_c06_published_examples_include_required_identifiers`, `test_c06_validation_csv_lists_all_five_published_example_identifiers`, `test_c07b_eu_comparability_is_informational_only`, `test_vcsv01..04` |
| `DATA_A`/`DATA_B` env vars unset (rebuild byte-identity comparison) | 1 | `test_det05_rebuild_byte_identity` |
| `src/` does not exist yet (step 4 not run) | 1 | `test_ts01_generated_types_match_fresh_generation` |

Two of the 27 "data/ does not exist" skips are new in this task:
`test_c06_partner_data_matches_published_examples_within_rounding` and
`test_c07a_eu_calculation_full` (the latter also requires
`raw/<snapshot_id>/partner_totals/` and `raw/<snapshot_id>/eu_members/`,
checked inside the test body after the `data/` gate).

## New test ids added in this task (Task 2)

All listed as "runs now" unless noted; full descriptions in
reports/tests/test_list.md.

EU calculation (2a), in tests/test_validation_checks.py, backed by new
helpers in tests/_checks.py (`parse_census_rows`, `census_row_value`,
`eu_membership_for_year`, `compute_eu_total_for_year_flow`) and the new
independent fixture tests/fixtures/eu_members_fixture.json:
- test_eu01u_parse_census_rows_dedupes_duplicate_header_keys
- test_eu02u_census_row_value_reads_matching_code_as_int
- test_eu03u_census_row_value_returns_none_for_missing_code
- test_eu04u_membership_full_year_member_before_2013
- test_eu05u_membership_croatia_2013_transition_matches_spec
- test_eu06u_membership_uk_2020_transition_matches_spec
- test_eu07u_membership_uk_full_year_2019
- test_eu08u_membership_uk_excluded_2021
- test_eu09u_compute_eu_total_absent_when_raw_dirs_missing
- test_eu10u_compute_eu_total_observed_from_synthetic_raw_files
- test_eu11u_compute_eu_total_absent_when_one_transition_month_missing
- test_c07a_eu_calculation_full (rewritten; waits for raw/<snapshot_id>/partner_totals/, raw/<snapshot_id>/eu_members/, and data/<snapshot_id>/partner/EU.json)

Check 6 against published examples (2b), in tests/test_validation_checks.py:
- test_c06_validation_csv_lists_all_five_published_example_identifiers (waits for validation.csv)
- test_c06_partner_data_matches_published_examples_within_rounding (waits for data/<snapshot_id>/partner/)

Missing-row rule (2c), in tests/test_validation_checks.py:
- test_mrr01u_confirmed_zero_chapters_do_not_change_the_group_sum
- test_mrr02_confirmed_zero_reasons_cite_reconciliation_and_sums_are_exact (waits for data/<snapshot_id>/partner/)

Kind aggregate / non-numeric code (2d), in tests/test_validation_checks.py:
- test_kind01u_partner_code_pattern_permits_only_EU_as_non_numeric
- test_kind02_only_EU_has_a_non_numeric_code_in_partners_json (waits for data/<snapshot_id>/partners.json)

Fixture self-checks (hardening Task 1 and 2a), in tests/test_fixture_self_checks.py:
- test_fxchk08_published_examples_match_saved_source_html
- test_fxchk09_eu_members_fixture_matches_saved_europa_sources

## Files written or changed in this task

- tests/fixtures/published_examples/special_not_applicable.json (new)
- tests/fixtures/published_examples/5700_2023.json (new)
- tests/fixtures/published_examples/1610_2023.json (new)
- tests/fixtures/published_examples/6022_2023.json (new)
- tests/fixtures/published_examples/4280_2023.json (new)
- tests/fixtures/published_examples/sources/5700_2023.html (new)
- tests/fixtures/published_examples/sources/1610_2023.html (new)
- tests/fixtures/published_examples/sources/6022_2023.html (new)
- tests/fixtures/published_examples/sources/4280_2023.html (new)
- tests/fixtures/eu_members_fixture.json (new)
- tests/fixtures/sources/europa_eu_countries_list_page1.html (new)
- tests/fixtures/sources/europa_eu_countries_list_page2.html (new)
- tests/fixtures/sources/europa_eu_history_1970-79.html (new)
- tests/fixtures/sources/europa_eu_history_2010-19.html (new)
- tests/fixtures/sources/europa_eu_history_2020-today.html (new)
- tests/_checks.py (extended: EU calculation helpers)
- tests/test_validation_checks.py (extended: EU, check-6, missing-row-rule, kind tests)
- tests/test_fixture_self_checks.py (extended: fxchk08, fxchk09)
- reports/tests/test_list.md (updated: 88 -> 107 tests)
- reports/tests/step3_prep_run.txt (this run's full output)
- reports/tests/step3_prep_summary.md (this file)

## Open questions for the orchestrator

1. `test_c07a_eu_calculation_full` assumes `GEN_VAL_YR`/`ALL_VAL_YR` are
   readable from `raw/<snapshot_id>/partner_totals/<flow>_<year>-12.json`
   using the same list-of-lists shape as every raw/source_test/ sample
   (header row then data rows, duplicate header keys resolved by first
   occurrence). This shape is confirmed only for raw/source_test/, not
   yet for a real raw/<snapshot_id>/ acquisition; if Agent A's saved
   format differs, `_checks.parse_census_rows` will need a matching
   update from whoever owns that discovery (D can adjust once the real
   files exist, since the helper lives under tests/).
2. tests/fixtures/eu_members_fixture.json intentionally does not read
   pipeline/eu_members.json (independence rule). If Agent A's membership
   dates differ from europa.eu's stated accession/exit dates (all
   sourced and self-checked against saved europa.eu pages in this task),
   `test_c07a_eu_calculation_full` will fail once data exists; that is
   the intended behavior, not a bug in the test.
3. The published_examples "basis" field could not be confirmed as
   General Imports Customs Value / Total Exports FAS by an inline
   statement on the census.gov "Trade in Goods with <country>" pages
   themselves; the match is inferred from Census's general glossary
   pages the balance pages link to. Recorded as `comparable: true` with
   this caveat in each fixture rather than `false`, since no evidence of
   a differing basis was found. Flagged here per "not verified is a
   valid finding."
4. No revision date is stated per-year on the census.gov balance pages;
   only a site-wide footer boilerplate date was found and recorded
   verbatim, explicitly marked as not a data revision date, in each
   fixture's `revision_date` field.
5. Encountered and fixed during this task: `/tmp` did not reliably
   persist file content between separate Bash tool calls in this
   session (a file fetched to `/tmp` in one call read back with
   different, shorter content in a later call, despite an identical
   reported byte count at one point). All europa.eu source pages were
   re-fetched directly to their final tests/fixtures/sources/ path and
   verified (grep counts for the exact cited phrases) within the same
   tool call before tests/fixtures/eu_members_fixture.json was
   finalized against them; tests/test_fixture_self_checks.py's
   test_fxchk09 now guards against this class of staleness going
   forward. No fixture value in this task was ever asserted without a
   same-call verification against the file it cites.

## Usage report

Uncached input, cache writes by duration, cache reads, output: unknown
(not exposed to this agent by the harness in this session; no
token-usage API was available to query). Reporting as unknown per the
instruction not to invent estimates.
