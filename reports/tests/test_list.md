# Test list

127 tests, grouped by file. "Runs now" means the test executes to a real
pass/fail today. "Waits for step 3" means the test body checks for
`data/<snapshot_id>/`, `raw/<snapshot_id>/`, or
`reports/pipeline/validation.csv` at run time and calls `pytest.skip(...)`
with a reason (reported as not run) until Agent A produces them. Command:

```
./.venv-tests/bin/python -m pytest ./tests -q -c ./tests/pytest.ini
```

## Staged-build environment variable overrides

`DATA_DIR`, `RAW_DIR`, `VALIDATION_CSV`: set before invoking pytest to
point the suite at a staged, unpublished build instead of discovering
`data/`, `raw/`, and `reports/pipeline/validation.csv`. Documented fully
in the `tests/conftest.py` module docstring and tests/README.md; the
override mechanism itself is proven by tests/test_config_overrides.py
(below). Example:

```
DATA_DIR=/path/to/staged/data RAW_DIR=/path/to/staged/raw VALIDATION_CSV=/path/to/staged/validation.csv \
./.venv-tests/bin/python -m pytest ./tests -q -c ./tests/pytest.ini
```

## tests/test_schema_validity.py

| id | proves | inputs | status |
|---|---|---|---|
| test_sch01_schema_is_valid_draft_2020_12[common.schema.json] | schema/common.schema.json is a valid draft 2020-12 document | schema/common.schema.json | runs now |
| test_sch01_schema_is_valid_draft_2020_12[hs_sections.schema.json] | same, for hs_sections.schema.json | schema/hs_sections.schema.json | runs now |
| test_sch01_schema_is_valid_draft_2020_12[meta.schema.json] | same, for meta.schema.json | schema/meta.schema.json | runs now |
| test_sch01_schema_is_valid_draft_2020_12[partner.schema.json] | same, for partner.schema.json | schema/partner.schema.json | runs now |
| test_sch01_schema_is_valid_draft_2020_12[partners.schema.json] | same, for partners.schema.json | schema/partners.schema.json | runs now |
| test_sch01_schema_is_valid_draft_2020_12[section.schema.json] | same, for section.schema.json | schema/section.schema.json | runs now |
| test_sch01_schema_is_valid_draft_2020_12[summary.schema.json] | same, for summary.schema.json | schema/summary.schema.json | runs now |
| test_sch02_meta_json_validates_when_present | data/<snapshot_id>/meta.json validates against meta.schema.json via a referencing Registry (cross-file $ref to common.schema.json resolves) | schema/*.schema.json, data/<snapshot_id>/meta.json | waits for step 3 |
| test_sch03_partners_json_validates_when_present | partners.json validates against partners.schema.json | schema/*.schema.json, data/<snapshot_id>/partners.json | waits for step 3 |
| test_sch04_hs_sections_json_validates_when_present | hs_sections.json validates against hs_sections.schema.json | schema/*.schema.json, data/<snapshot_id>/hs_sections.json | waits for step 3 |
| test_sch05_summary_files_validate_when_present | every summary/<year>.json validates against summary.schema.json | schema/*.schema.json, data/<snapshot_id>/summary/*.json | waits for step 3 |
| test_sch06_partner_files_validate_when_present | every partner/<code>.json validates against partner.schema.json | schema/*.schema.json, data/<snapshot_id>/partner/*.json | waits for step 3 |
| test_sch07_section_files_validate_when_present | every section/<id>.json validates against section.schema.json | schema/*.schema.json, data/<snapshot_id>/section/*.json | waits for step 3 |

## tests/test_flowvalue_derivedvalue.py

FlowValue and DerivedValue rules from schema/CONTRACT.md, validated against
the `$defs/FlowValue` and `$defs/DerivedValue` schemas in common.schema.json.
All 23 run now; none need data/.

| id | proves | inputs |
|---|---|---|
| test_fv01_observed_with_integer_and_null_reason_is_valid | observed + integer + null reason is valid | common.schema.json |
| test_fv02_observed_with_negative_integer_is_valid | schema does not forbid negative integers for FlowValue.value (documents actual schema behavior) | common.schema.json |
| test_fv03_confirmed_zero_with_reason_is_valid | confirmed_zero + value 0 + non-empty reason is valid | common.schema.json |
| test_fv04_absent_with_reason_is_valid | absent + null value + non-empty reason is valid | common.schema.json |
| test_fv05_not_applicable_with_reason_is_valid | not_applicable + null value + non-empty reason is valid | common.schema.json |
| test_fv06_observed_with_null_value_is_invalid | observed requires an integer value, not null | common.schema.json |
| test_fv07_observed_with_non_null_reason_is_invalid | observed requires a null reason | common.schema.json |
| test_fv08_confirmed_zero_with_nonzero_value_is_invalid | confirmed_zero requires value exactly 0 | common.schema.json |
| test_fv09_confirmed_zero_with_empty_reason_is_invalid | confirmed_zero requires reason minLength 1 | common.schema.json |
| test_fv10_confirmed_zero_with_null_reason_is_invalid | confirmed_zero requires a string reason, not null | common.schema.json |
| test_fv11_absent_with_integer_value_is_invalid | absent requires a null value | common.schema.json |
| test_fv12_absent_with_null_reason_is_invalid | absent requires a non-empty reason | common.schema.json |
| test_fv13_not_applicable_with_zero_value_is_invalid | not_applicable requires a null value, not 0 | common.schema.json |
| test_fv14_fetch_failed_status_is_invalid | fetch_failed is not a legal FlowValue status (never in published data) | common.schema.json |
| test_fv15_extra_property_is_invalid | additionalProperties: false is enforced | common.schema.json |
| test_fv16_missing_required_field_is_invalid | status/value/reason are all required | common.schema.json |
| test_fv17_float_value_is_invalid | a non-integral value fails the integer type check | common.schema.json |
| test_fv18_derived_observed_is_valid | DerivedValue observed + integer + null reason is valid | common.schema.json |
| test_fv19_derived_absent_with_reason_is_valid | DerivedValue absent + null value + non-empty reason is valid | common.schema.json |
| test_fv20_derived_confirmed_zero_status_is_invalid | DerivedValue only allows observed/absent, never confirmed_zero | common.schema.json |
| test_fv21_derived_observed_with_null_value_is_invalid | DerivedValue observed requires an integer value | common.schema.json |
| test_fv22_derived_absent_with_null_reason_is_invalid | DerivedValue absent requires a non-empty reason | common.schema.json |
| test_fv23_derived_float_value_is_invalid | a non-integral DerivedValue value fails the integer type check | common.schema.json |

## tests/test_validation_checks.py

VALIDATION checks 1-9 from docs/SPEC.md. Each check has a synthetic unit
test (suffix `u`) that runs now and proves the recomputation logic in
tests/_checks.py, and (except where noted) an integration test that runs
the same logic against the real snapshot and waits for step 3.

| id | proves | inputs | status |
|---|---|---|---|
| test_c01u_duplicate_chapter_detected | duplicate-chapter detector flags a repeat | in-memory list | runs now |
| test_c01u_no_duplicates_returns_empty | duplicate-chapter detector is clean on unique input | in-memory list | runs now |
| test_c01_unique_records_per_partner_year | check 1: no chapter repeats within one partner-year's combined groups | data/<snapshot_id>/partner/*.json | waits for step 3 |
| test_c01_world_and_group_codes_excluded_from_partner_files | check 1: world row -, code 0001, and every observed CGP code (fixture_d) have no partner/<code>.json | data/<snapshot_id>/partner/, tests/fixtures/fixture_d | waits for step 3 |
| test_c01_world_row_and_wildcard_codes_excluded_from_partners_json | amended Identifiers paragraph: the world row - and the wildcard region codes 1XXX..7XXX are excluded from partners.json (listed in meta.notes instead); numeric CGP codes like 0001 are unaffected | data/<snapshot_id>/partners.json | waits for step 3 |
| test_c02u_group_sum_blocks_on_absent_chapter | group-sum helper returns absent when a chapter is absent | in-memory FlowValues | runs now |
| test_c02u_group_sum_skips_not_applicable_chapter | group-sum helper treats not_applicable chapters as non-blocking | in-memory FlowValues | runs now |
| test_c02u_group_sum_includes_confirmed_zero | group-sum helper adds confirmed_zero as 0 | in-memory FlowValues | runs now |
| test_c02_partner_totals_equal_chapter_sums | check 2: chapter sum equals the separately fetched partner total, per partner/year/flow, or a validation.csv tolerance row. Amended Check scope notes: applies to Census partners only, EU excluded (EU has no fetched total; covered by check 4 and 7a instead) | data/<snapshot_id>/partner/*.json, reports/pipeline/validation.csv | waits for step 3 |
| test_eu_group_chapter_values_transition_years_require_hs2_observations | Check scope notes: EU group and chapter values for 2013 and 2020 are observed/confirmed_zero when raw/<snapshot_id>/eu_members_hs2/ has every required transition-month file, else absent with reason 'transition-month HS2 observations not acquired'; not_applicable chapters (for example chapter 99 exports) are exempt at the chapter level | data/<snapshot_id>/partner/EU.json, raw/<snapshot_id>/eu_members_hs2/, tests/fixtures/eu_members_fixture.json | waits for step 3 |
| test_c03u_reconciliation_universe_sum_excludes_absent_without_blocking | amended rule: reconciliation_universe_sum excludes an absent partner from the sum instead of blocking it (replaces the old blocking helper/test) | in-memory FlowValues | runs now |
| test_c03u_reconciliation_universe_sum_excludes_eu_aggregate_by_construction | documents that the caller, not the helper, must filter to include_in_world_reconciliation | in-memory FlowValues | runs now |
| test_c03u_world_total_check_status_pass_on_exact_match | check 3 exact-match helper: PASS only when universe sum equals the observed world total exactly | in-memory FlowValue | runs now |
| test_c03u_world_total_check_status_fail_on_mismatch | check 3 exact-match helper: FAIL on any nonzero difference, no tolerance | in-memory FlowValue | runs now |
| test_c03u_world_total_check_status_fail_when_world_not_observed | check 3 exact-match helper: FAIL (not a default pass) when the world total itself is not observed | in-memory FlowValue | runs now |
| test_c03_world_totals_equal_reconciliation_universe_sum | check 3, amended: sum over include_in_world_reconciliation true partners whose value is observed or confirmed_zero (absent partners excluded, not blocking) equals the separately fetched world total exactly, per year/flow | data/<snapshot_id>/summary/*.json | waits for step 3 |
| test_c03_section_universe_matches_check3_pass_fail_state | amended Aggregation rules: section.years[].universe is an observed sum over the SAME observed partners as check 3 when check 3 passes for that flow/year, else absent naming the check 3 row; recomputed independently from summary/ and section/, no validation.csv needed | data/<snapshot_id>/summary/*.json, data/<snapshot_id>/section/*.json | waits for step 3 |
| test_c03_eu_never_in_reconciliation_universe | EU's include_in_world_reconciliation is always false in summary files | data/<snapshot_id>/summary/*.json | waits for step 3 |
| test_c04u_group_level_matches_recomputed_sum | group-sum helper sums plain observed chapters correctly | in-memory FlowValues | runs now |
| test_c04_group_sums_equal_chapter_sums | check 4: group sums equal chapter sums, exact | data/<snapshot_id>/partner/*.json | waits for step 3 |
| test_c05u_balance_observed_when_both_inputs_observed | balance helper computes exports minus imports when both observed | in-memory FlowValues | runs now |
| test_c05u_balance_absent_when_export_absent | balance helper returns absent naming the missing input | in-memory FlowValues | runs now |
| test_c05u_total_trade_value_observed | total_trade_value helper sums imports+exports, confirmed_zero counts as 0 | in-memory FlowValues | runs now |
| test_c05_derived_figures_exact | check 5: balance and total_trade_value status and value match independent recomputation exactly; amended Value rules: for an absent derived value only the presence of the word imports/exports for each missing input in the reason is checked, not the full reason string | data/<snapshot_id>/partner/*.json | waits for step 3 |
| test_c06_published_examples_include_required_identifiers | check 6: validation.csv published_examples rows include Norfolk Island 6022 and the kind special partner 8220 (Census code 8220, 'Unidentified partner'); Kosovo 4803 is kind country now, not the special-code row | reports/pipeline/validation.csv | waits for step 3 |
| test_c06_validation_csv_lists_all_five_published_example_identifiers | check 6: validation.csv has a published_examples row for each of 5700, 1610, 6022, 4280, 8220 | reports/pipeline/validation.csv | waits for step 3 |
| test_c06_special_row_8220_matches_fixture_outcome | check 6: the validation.csv published_examples row(s) for 8220 match tests/fixtures/published_examples/special_8220.json's own outcome field (NOT_COMPARABLE with the URL tried in the reason if not_applicable, else a normal comparable row, never NOT_APPLICABLE when a real Census page exists) | reports/pipeline/validation.csv, tests/fixtures/published_examples/special_8220.json | waits for step 3 |
| test_c06_partner_data_matches_published_examples_within_rounding | check 6: for 5700_2023, 1610_2023, 6022_2023, 4280_2023, special_8220 (the five required identifiers) plus 4803_2023 (kept as an additional comparable example), when the pipeline value is observed/confirmed_zero it must be within rounding_unit of the published fixture; when absent, the validation.csv published_examples row for that code/year/flow must be NOT_COMPARABLE and mention the published display value (per amended Check scope notes), not an observed value; a fixture whose own outcome is not_applicable is skipped here (checked instead by test_c06_special_row_8220_matches_fixture_outcome) | data/<snapshot_id>/partner/*.json, tests/fixtures/published_examples/*.json, reports/pipeline/validation.csv | waits for step 3 |
| test_c07a_eu_calculation_recomputed_from_boundary_fixture | check 7a arithmetic (YTD month-boundary rule) recomputed and verified against fixture_b | tests/fixtures/fixture_b_eu_boundary.json | runs now |
| test_eu01u_parse_census_rows_dedupes_duplicate_header_keys | raw Census API list-of-lists response parser keeps the first occurrence of a duplicated header key (the API echoes predicate columns) | in-memory list-of-lists | runs now |
| test_eu02u_census_row_value_reads_matching_code_as_int | row-value lookup returns the named field as int for a matching CTY_CODE | in-memory rows | runs now |
| test_eu03u_census_row_value_returns_none_for_missing_code | row-value lookup returns None when no row matches | in-memory rows | runs now |
| test_eu04u_membership_full_year_member_before_2013 | membership helper: Germany (4280) is a full-year member in 2013, Croatia (4791) is not | tests/fixtures/eu_members_fixture.json | runs now |
| test_eu05u_membership_croatia_2013_transition_matches_spec | membership helper reproduces SPEC EU RULES exactly: Croatia 2013 transition months are July through December | tests/fixtures/eu_members_fixture.json | runs now |
| test_eu06u_membership_uk_2020_transition_matches_spec | membership helper reproduces SPEC EU RULES exactly: UK 2020 transition month is January only | tests/fixtures/eu_members_fixture.json | runs now |
| test_eu07u_membership_uk_full_year_2019 | membership helper: UK is a full-year member in 2019 (before Brexit) | tests/fixtures/eu_members_fixture.json | runs now |
| test_eu08u_membership_uk_excluded_2021 | membership helper: UK is neither a full nor transition member in 2021 (after Brexit) | tests/fixtures/eu_members_fixture.json | runs now |
| test_eu09u_compute_eu_total_absent_when_raw_dirs_missing | EU-total helper returns absent with a nonempty missing list when raw partner_totals/eu_members directories do not exist | tmp_path (synthetic) | runs now |
| test_eu10u_compute_eu_total_observed_from_synthetic_raw_files | EU-total helper sums 2 full-year members' December _YR rows plus a transition member's 6 monthly _MO rows to the exact expected total | tmp_path (synthetic raw files shaped like real Census API responses) | runs now |
| test_eu11u_compute_eu_total_absent_when_one_transition_month_missing | EU-total helper returns absent and names the missing (code, period) when one transition month file is missing | tmp_path (synthetic) | runs now |
| test_eu12u_compute_eu_total_ignores_a_bare_json_file_missing_the_response_suffix | regression test for the fixed path bug: a file saved as <name>.json (wrong suffix) is treated as absent, never read, per CONTRACT.md 'readers open <name>.response.json' | tmp_path (synthetic) | runs now |
| test_c07a_eu_calculation_full | check 7a: recomputes the EU total per year and flow from raw/<snapshot_id>/partner_totals/<flow>_<year>-12.response.json (full-year members) and raw/<snapshot_id>/eu_members/<flow>_<code>_<YYYY-MM>.response.json (Croatia 4791 2013-07..12, UK 4120 2020-01), membership from tests/fixtures/eu_members_fixture.json (independent europa.eu source), and compares exactly with data/<snapshot_id>/partner/EU.json | raw/<snapshot_id>/partner_totals/, raw/<snapshot_id>/eu_members/, data/<snapshot_id>/partner/EU.json, tests/fixtures/eu_members_fixture.json | waits for step 3 |
| test_c07b_eu_comparability_is_informational_only | check 7b: eu_comparability rows use allowed statuses and NOT_COMPARABLE rows carry a numeric difference | reports/pipeline/validation.csv | waits for step 3 |
| test_c08u_flowvalue_integrity_errors_detects_bad_observed | integrity checker flags an observed value with null value | in-memory dict | runs now |
| test_c08u_flowvalue_integrity_errors_clean_for_valid_absent | integrity checker passes a correct absent value | in-memory dict | runs now |
| test_c08u_flowvalue_integrity_errors_flags_fetch_failed | integrity checker flags fetch_failed | in-memory dict | runs now |
| test_c08_flowvalue_integrity_across_all_data_files | check 8: every FlowValue-shaped dict in data/<snapshot_id>/ obeys the null/reason/integer rules, and no file contains the string fetch_failed | data/<snapshot_id>/**/*.json | waits for step 3 |
| test_c09u_resolution_enum_is_approved_or_excluded | documents the two allowed resolution values | none | runs now |
| test_c09_every_partner_resolved | check 9: every partner in partners.json has resolution approved or excluded, zero unresolved | data/<snapshot_id>/partners.json | waits for step 3 |
| test_mrr01u_confirmed_zero_chapters_do_not_change_the_group_sum | documents why the missing-row reconciliation works: a confirmed_zero chapter contributes 0 to the group sum | in-memory FlowValues | runs now |
| test_mrr02_confirmed_zero_reasons_cite_reconciliation_and_sums_are_exact | missing-row rule (schema/CONTRACT.md): every confirmed_zero chapter's reason cites the reconciliation, and present chapters (observed + confirmed_zero) sum exactly to the partner-year total for that flow | data/<snapshot_id>/partner/*.json | waits for step 3 |
| test_kind01u_partner_code_pattern_permits_only_EU_as_non_numeric | the PartnerCode regex ^([0-9]{4}\|EU)$ only ever admits EU as a non-4-digit code | in-memory regex | runs now |
| test_kind02_only_EU_has_a_non_numeric_code_in_partners_json | only kind aggregate partners have a non-numeric code, and EU is the only such code observed in partners.json | data/<snapshot_id>/partners.json | waits for step 3 |
| test_partner_8220_matches_owner_approved_record | owner decision: 8220 is kind special, name exactly 'Unidentified partner (Census code 8220)', include_in_world_reconciliation true, iso3 null, map_feature_id null, resolution approved, resolution_note contains '2026-09-09' and not 'pending' | data/<snapshot_id>/partners.json | waits for step 3 |
| test_partner_4803_is_kind_country_with_null_iso3 | owner decision / amended CONTRACT.md: Kosovo 4803 is kind country with iso3 null, not kind special | data/<snapshot_id>/partners.json | waits for step 3 |
| test_every_kind_special_partner_has_null_iso3_and_map_feature_id | kind special is reserved for non-geographic codes: every kind special partner has iso3 null and map_feature_id null | data/<snapshot_id>/partners.json | waits for step 3 |
| test_8220_is_the_only_kind_special_partner | owner decision: 8220 is the only kind special partner (Kosovo 4803 moved to kind country) | data/<snapshot_id>/partners.json | waits for step 3 |

## tests/test_determinism.py

| id | proves | inputs | status |
|---|---|---|---|
| test_det01u_find_float_leaves_detects_float | float-finder detects a float leaf in a nested structure | in-memory dict | runs now |
| test_det01u_find_float_leaves_clean_for_ints | float-finder is clean when only ints/strings/None are present | in-memory dict | runs now |
| test_det01_no_floats_in_any_data_file | no floats anywhere in data/<snapshot_id>/**/*.json | data/<snapshot_id>/**/*.json | waits for step 3 |
| test_det02_two_space_indent_and_sorted_keys | re-serializing with json.dumps(sort_keys=True, indent=2) reproduces the file byte-for-byte (minus trailing newline) | data/<snapshot_id>/**/*.json | waits for step 3 |
| test_det03_trailing_newline_present | every published file ends with a trailing newline | data/<snapshot_id>/**/*.json | waits for step 3 |
| test_det04_utf8_decodable | every published file decodes as strict UTF-8 | data/<snapshot_id>/**/*.json | waits for step 3 |
| test_det05_rebuild_byte_identity | rebuild from raw/ produces byte-identical output, comparing two directories named by DATA_A and DATA_B | $DATA_A, $DATA_B (directories) | waits for env vars (set when the orchestrator runs a rebuild comparison) |

## tests/test_validation_csv_contract.py

| id | proves | inputs | status |
|---|---|---|---|
| test_vcsv01_columns_match_contract_in_order | validation.csv header matches CONTRACT.md's 13 columns, in order | reports/pipeline/validation.csv | waits for step 3 |
| test_vcsv02_status_values_are_allowed | every status is PASS/FAIL/NOT_COMPARABLE/NOT_APPLICABLE | reports/pipeline/validation.csv | waits for step 3 |
| test_vcsv03_check_values_are_allowed | every check is one of the 11 named checks in CONTRACT.md | reports/pipeline/validation.csv | waits for step 3 |
| test_vcsv04_empty_cells_are_empty_strings_not_the_word_null | empty cells are empty strings, never the literal word null | reports/pipeline/validation.csv | waits for step 3 |

## tests/test_meta_json.py

| id | proves | inputs | status |
|---|---|---|---|
| test_meta01u_residual_gap_marker_words_are_meaningful | documents the two substrings required in meta.notes | none | runs now |
| test_meta02_source_fingerprint_before_equals_after_true | meta.source_fingerprint.before_equals_after is true | data/<snapshot_id>/meta.json | waits for step 3 |
| test_meta03_configured_coverage_years_within_verified_availability | every configured_coverage year is within [verified_availability.from_year, to_year], and start/end_year match min/max | data/<snapshot_id>/meta.json | waits for step 3 |
| test_meta04_notes_contain_residual_gap_note | meta.notes contains the partner-level-revision / world-total residual-gap note | data/<snapshot_id>/meta.json | waits for step 3 |
| test_meta05_source_last_update_verified_is_false | meta.source_last_update.verified is false | data/<snapshot_id>/meta.json | waits for step 3 |

## tests/test_fixture_self_checks.py

Assert every tests/fixtures/*.json value against a fresh, independent
recomputation from the cited raw/source_test/ or tests/fixtures/sources/
file, so a stale fixture fails. All 9 run now.

| id | proves | inputs |
|---|---|---|
| test_fxchk01_fixture_a_partner_world_totals_match_raw | fixture_a's 8 values match GEN_VAL_YR/ALL_VAL_YR in the 8 cited partner_total/world_total response files | raw/source_test/partner_total_*.response.json, world_total_*.response.json |
| test_fxchk02_fixture_b_eu_boundary_matches_raw | fixture_b's 16 MO/YR values match the 16 cited eu_boundary response files | raw/source_test/eu_boundary_*.response.json |
| test_fxchk03_fixture_c_df_proof_matches_raw | fixture_c's DF=1, DF=2, and DF=- values match the cited files and DF1+DF2 equals the total | raw/source_test/contrast_exports_DF_*.response.json, partner_total_exports_large.response.json |
| test_fxchk04_fixture_d_observed_partner_codes_match_raw | fixture_d's DET code lists and only-in-one-flow sets match all_partners_*.response.json, including 6022/5790 | raw/source_test/all_partners_imports.response.json, all_partners_exports.response.json |
| test_fxchk05_fixture_e_chapter_sets_match_raw | fixture_e's chapter lists match hs2_*_large.response.json, and the 77/98/99 assertions hold | raw/source_test/hs2_imports_large.response.json, hs2_exports_large.response.json |
| test_fxchk06_fixture_g_availability_matches_raw_csv | fixture_g's years-with-data list and the 2026-12 has_data=False claim match availability.csv | raw/source_test/availability.csv |
| test_fxchk07_hs_sections_fixture_covers_every_chapter_once_except_77 | hs_sections_fixture.json has 22 groups and every chapter 01-99 except 77 maps to exactly one group | tests/fixtures/hs_sections_fixture.json |
| test_fxchk08_published_examples_match_saved_source_html | the published_examples/<code>_<year>.json fixtures' (5700, 1610, 4803, 6022, 4280 for 2023; special_8220 for 2013) displayed and converted exports/imports figures match the TOTAL <year> row parsed fresh from the saved census.gov page HTML/response text; a not_applicable-outcome fixture is skipped | tests/fixtures/published_examples/sources/{5700,1610,4803,6022,4280}_2023.html, tests/fixtures/published_examples/sources/8220_attempt.txt |
| test_fxchk09_eu_members_fixture_matches_saved_europa_sources | eu_members_fixture.json's accession/exit dates match the saved europa.eu current-members and history pages, and its Census CTY_CODE per member matches all_partners_imports.response.json | tests/fixtures/sources/europa_eu_*.html, raw/source_test/all_partners_imports.response.json |

## tests/test_config_overrides.py

Proves the DATA_DIR / RAW_DIR / VALIDATION_CSV staged-build override
mechanism itself (see "Staged-build environment variable overrides"
above), using monkeypatch and tmp_path so no real data/, raw/, or
reports/pipeline/ is touched. All 8 run now.

| id | proves | inputs |
|---|---|---|
| test_ovr01_data_dir_override_used_when_set | discover_snapshot_dir returns the DATA_DIR path directly, no scan | tmp_path, monkeypatch |
| test_ovr02_data_dir_override_missing_directory_reports_reason | discover_snapshot_dir reports a not-run reason naming DATA_DIR when the override path is not a directory | tmp_path, monkeypatch |
| test_ovr03_data_dir_no_override_falls_back_to_default_discovery | with DATA_DIR unset, the original data/ scan behavior is unchanged | monkeypatch |
| test_ovr04_raw_dir_override_used_regardless_of_data_dir_name | resolve_raw_dir returns the RAW_DIR path regardless of the data dir's name | monkeypatch |
| test_ovr05_raw_dir_no_override_derives_from_data_dir_name | with RAW_DIR unset, resolve_raw_dir derives ROOT/raw/<data_dir_path.name>, unchanged | monkeypatch |
| test_ovr06_validation_csv_override_used_when_file_exists | require_validation_csv reads the VALIDATION_CSV path directly when it exists | tmp_path, monkeypatch |
| test_ovr07_validation_csv_override_missing_file_skips_with_reason | require_validation_csv skips (pytest.skip.Exception) with a reason naming VALIDATION_CSV and the missing path | tmp_path, monkeypatch |
| test_ovr08_validation_csv_no_override_falls_back_to_default_path | with VALIDATION_CSV unset, original reports/pipeline/validation.csv behavior is unchanged | monkeypatch |

Also smoke-tested end to end outside the suite (not a persisted test, to
avoid depending on scratch files): `DATA_DIR=<a minimal staged
partners.json directory>` was set and
`test_c09_every_partner_resolved`, normally skipped as not run, executed
and passed against that staged directory, confirming the override wires
through a real integration test, not just conftest's own functions.

## tests/test_typescript_types_placeholder.py

| id | proves | inputs | status |
|---|---|---|---|
| test_ts01_generated_types_match_fresh_generation | src/types/generated.ts matches a fresh `npm run gen:types` run | src/types/generated.ts, package.json | waits for step 4 (src/ does not exist yet) |
