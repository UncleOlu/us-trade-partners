# Step 4 fix round: staged-build failures resolved (Agent D)

The orchestrator ran this suite against the staged build (114 passed, 4
failed) and pinned the contract on each failure. Re-read schema/CONTRACT.md
fresh (Raw archive layout intro, the eu_members and new eu_members_hs2
rows, the derived-value reason rule, and the new Check scope notes
section) and fixed the test side only, per test id below. No check was
weakened; two fixes made a test stricter (item 1's regression test) or
corrected a genuinely wrong assumption in a brand-new test (item 2's
not_applicable exemption), never loosened an existing passing assertion.

## What changed, per test id

### 1. test_c07a_eu_calculation_full (and its helper, compute_eu_total_for_year_flow)

Bug: schema/CONTRACT.md's Raw archive layout intro states every request
saves both `<name>.request.json` and `<name>.response.json`, and "the
table below gives `<name>`; readers open `<name>.response.json`."
`_checks.compute_eu_total_for_year_flow` was opening
`partner_totals/<flow>_<year>-12.json` and
`eu_members/<flow>_<code>_<YYYY-MM>.json` (missing the `.response`
segment), so it never found a real file and computed `absent` for every
year and flow, unconditionally.

Fix: both paths now end in `.response.json`
(`tests/_checks.py::compute_eu_total_for_year_flow`). Updated the three
existing synthetic unit tests (`test_eu10u_*`, `test_eu11u_*`, and the
`partner_totals`/`eu_members` fixture files inside `test_eu09u_*`'s
sibling tests) to write `.response.json` files, since they had
previously been passing by accident (they wrote the same wrongly-suffixed
`.json` files the buggy code read, so the bug and the test agreed with
each other and both were wrong). Added a new regression test,
`test_eu12u_compute_eu_total_ignores_a_bare_json_file_missing_the_response_suffix`,
that writes a file with the wrong suffix on purpose and asserts the
helper treats it as absent, so this exact bug class cannot silently
reappear. Also updated `test_c07a_eu_calculation_full`'s docstring to
name the corrected paths.

Result against the real staged build: **PASS**. The recomputed EU total
matches `data/<snapshot_id>/partner/EU.json` exactly for every year
present. No nonzero difference found; nothing to report as a real
finding here.

### 2. test_c02_partner_totals_equal_chapter_sums, plus a new EU-specific test

schema/CONTRACT.md's new "Check scope notes" section: "Check 2 (partner
totals) applies to Census partners, whose totals are fetched separately.
The EU aggregate has no fetched total; its year totals are covered by
check 7a and its group and chapter consistency by check 4. EU group and
chapter values in transition years are observed only when eu_members_hs2
observations exist for every transition month; otherwise absent with
reason."

Fix: `test_c02_partner_totals_equal_chapter_sums` now skips the `EU`
partner file entirely (both by filename stem and by `partner.code`),
since EU has no separately fetched partner total to compare chapter
sums against.

Added: `test_eu_group_chapter_values_transition_years_require_hs2_observations`
in `tests/test_validation_checks.py`. For each of 2013 and 2020 present
in `partner/EU.json`, it independently determines (from
`tests/fixtures/eu_members_fixture.json`'s transition-member/month list)
whether every required `raw/<snapshot_id>/eu_members_hs2/<flow>_<code>_
<YYYY-MM>.response.json` file exists, then asserts every group and
chapter FlowValue for that year is observed/confirmed_zero when all
required files are present, or absent with a reason containing exactly
`transition-month HS2 observations not acquired` when any are missing.

While developing this test against the real staged build (which has no
`eu_members_hs2/` directory at all, so every 2013/2020 group and chapter
value is expected absent), one legitimate case needed a fix in the test
itself, not the pipeline: chapter 99 for exports is correctly
`not_applicable` (chapter 99 is not in the exports chapter set at all,
per `fixture_e_chapter_sets`), not `absent`, regardless of HS2
availability. The test now exempts `not_applicable` chapters from the
hs2-availability branches at the chapter level (group-level FlowValues
are not exempted the same way, and real data confirms the group itself
is still absent when hs2 is missing, since chapter 98 in the same group
is legitimately absent). This was a bug in my new test's model, not a
weakening of any existing check.

Result against the real staged build: **PASS** for both tests. Every
non-EU partner's chapter sums equal their separately fetched totals
(within existing tolerance handling); every EU group/chapter value for
2013 and 2020 is absent with the exact required reason text, consistent
with there being no `eu_members_hs2/` directory in this staged snapshot.

### 3. test_c05_derived_figures_exact

schema/CONTRACT.md Value rules (amended): "Otherwise absent with a
reason that contains the word imports or exports for each missing
input; the rest of the wording is free." The old test compared the
entire `{status, value, reason}` dict for equality, which required
Agent A's actual reason text to match `tests/_checks.py`'s own
`compute_balance`/`compute_total_trade_value` phrasing verbatim.

Fix: now compares `status` exactly, `value` exactly when `observed`,
and for `absent` checks only that the reason contains the required
word (`imports` and/or `exports`, case-insensitively) for each actually
missing input, using `_checks.additive_statuses` to determine which
input(s) are missing. No change was needed in `_checks.py` itself: its
own reason text already contained those words, so it already satisfied
the amended rule; only the test's over-strict comparison was wrong.

Result against the real staged build: **PASS**. Every partner-year's
balance and total_trade_value status and value (where observed) match
the independent recomputation, and every absent one names the missing
input(s) in its reason.

### 4. test_c06_partner_data_matches_published_examples_within_rounding

schema/CONTRACT.md Check scope notes: "When the pipeline value for a
published example is absent, no numeric comparison is possible. The
row is NOT_COMPARABLE with a reason stating the published display value
and that absent is not evidence of zero." The old test treated any
non-observed/confirmed_zero pipeline status as a hard mismatch.

Fix: when the pipeline FlowValue for a captured code/year/flow is
`absent`, the test now looks up the matching
`reports/pipeline/validation.csv` `published_examples` row (by
partner_code, year, flow) instead of expecting an observed value, and
asserts: (a) a row exists, (b) its status is `NOT_COMPARABLE`, and (c)
the fixture's displayed value string appears in that row's `expected`
or `actual` cell (validation.csv has no dedicated reason column per its
13-column contract; Agent A's real data confirms the free text lives in
the `actual` cell for a NOT_COMPARABLE row). A row that still reads
`PASS` for an absent pipeline value, or a missing row, is still reported
as a real finding, never silently accepted.

Checked for the specific pending-mismatch scenario the orchestrator
flagged (Agent A concurrently changing these rows to NOT_COMPARABLE):
at the time of this run, `reports/pipeline/validation.csv`'s row for
`6022` exports (the one absent pipeline value among the five identifiers)
already reads:
```
...,exports,published_examples,6022,,,0,"pipeline value absent for 6022 exports 2023; published display value is '0.0'; absent is not evidence of zero, no numeric comparison possible",,,NOT_COMPARABLE
```
Status NOT_COMPARABLE and the display value `'0.0'` (matching the
fixture's `exports_displayed`) is present. No pending mismatch to
report; the row had already been updated by the time this test ran.

Result against the real staged build: **PASS**.

### Also fixed (found while working the above, not separately assigned)

`test_c02_partner_totals_equal_chapter_sums` read
`reports/pipeline/validation.csv` via a hardcoded
`path.parent.parent / "reports" / "pipeline" / "validation.csv"`, which
does not honor the VALIDATION_CSV override and resolves to a
nonexistent path when `DATA_DIR` points outside `ROOT/data/` (as the
staged build does: `reports/pipeline/staging/<snapshot_id>`). Added
`conftest.resolve_validation_csv_path()` (override-aware, non-skipping)
and switched this test to use it, so its tolerance-row cross-reference
actually reads the real file under the staged-build override instead of
silently finding nothing.

## Three suite runs

Command (plain):
```
./.venv-tests/bin/python -m pytest tests -v -rs -c tests/pytest.ini
```

Command (staged):
```
DATA_DIR=./reports/pipeline/staging/20260909T013644Z-46e5a70d2c45 \
RAW_DIR=./raw/20260909T013644Z-46e5a70d2c45 \
VALIDATION_CSV=./reports/pipeline/validation.csv \
./.venv-tests/bin/python -m pytest tests -v -rs -c tests/pytest.ini
```

| run | output file | collected | passed | failed | errors | warnings | skipped |
|---|---|---|---|---|---|---|---|
| 1. plain (no overrides) | reports/tests/step4_fix_plain_run.txt | 122 | 90 | 0 | 0 | 0 | 32 |
| 2. staged, first pass | reports/tests/step4_fix_staged_run1.txt | 122 | 120 | 0 | 0 | 0 | 2 |
| 3. staged, second pass | reports/tests/step4_fix_staged_run2.txt | 122 | 120 | 0 | 0 | 0 | 2 |

All three: 0 failed, 0 errors, 0 warnings. The plain run's 32 not-run
skips are all `data/` (30, staged build lives outside `ROOT/data/` so
the unoverridden default discovery correctly finds nothing),
`DATA_A`/`DATA_B` unset (1), and `src/` absent (1). Both staged runs'
2 not-run skips are `DATA_A`/`DATA_B` unset and `src/` absent only,
since DATA_DIR/RAW_DIR/VALIDATION_CSV made every data-gated test
runnable.

## Remaining failures

None in the final three saved runs. One transient failure was observed
and resolved during this task, reported here for completeness rather
than hidden:

- An intermediate (unsaved) staged run failed
  `tests/test_schema_validity.py::test_sch06_partner_files_validate_when_present`
  with `FileNotFoundError` on `partner/7670.json`, then on a repeat with
  `partner/4279.json`. This is Agent A actively writing the staging
  directory concurrently with this suite's `glob()` + `read_text()`
  (TOCTOU race on a live, in-progress build), not a defect in this
  suite's logic and not one of the four assigned items. It resolved on
  its own once Agent A's write pass to that directory settled; both
  saved staged runs above (after that point) are clean. Not modified to
  paper over this: no retry/catch was added, since that could mask a
  real future FileNotFoundError elsewhere.

## Open questions

1. `test_c06_partner_data_matches_published_examples_within_rounding`
   checks the display value substring against `row['expected'] + '
   ' + row['actual']` combined, rather than a fixed column, because
   validation.csv's 13-column contract has no dedicated reason field.
   Confirmed against the one real NOT_COMPARABLE row in this build that
   the text lives in `actual`; if Agent A's convention differs for a
   future row (for example puts it in `expected` instead, or splits it
   differently), this test will still pass since it checks the
   concatenation of both columns, but flagging the assumption in case a
   stricter single-column contract is intended.
2. The transient `FileNotFoundError` race described above suggests
   `reports/pipeline/staging/<snapshot_id>` is written non-atomically
   while Agent A's pipeline run is in progress. Not a test-side issue,
   but worth the orchestrator's awareness if the staged-build override
   is used for CI or repeated automated runs while a build is still in
   flight.
3. `test_eu_group_chapter_values_transition_years_require_hs2_observations`
   requires the reason text to contain exactly `transition-month HS2
   observations not acquired` (schema/CONTRACT.md's literal quoted
   string). If Agent A's phrasing ever differs even slightly (e.g.
   punctuation), this test will correctly fail; that is intended
   behavior since CONTRACT.md quotes this reason verbatim, unlike the
   free-wording rule for derived-value reasons in item 3.

## Files written or changed in this fix round

- tests/_checks.py (compute_eu_total_for_year_flow: `.response.json` paths)
- tests/conftest.py (new `resolve_validation_csv_path()`)
- tests/test_validation_checks.py: test_c07a_eu_calculation_full docstring;
  test_eu10u/test_eu11u synthetic files renamed to `.response.json`; new
  test_eu12u regression test; test_c02_partner_totals_equal_chapter_sums
  (EU excluded, validation.csv path fixed); new
  test_eu_group_chapter_values_transition_years_require_hs2_observations;
  test_c05_derived_figures_exact (status/value exact, reason substring
  only); test_c06_partner_data_matches_published_examples_within_rounding
  (NOT_COMPARABLE cross-check for absent pipeline values); import list
  updated (`additive_statuses`, `resolve_validation_csv_path`)
- reports/tests/test_list.md (122 tests, per-row updates for the five
  changed/added test ids)
- reports/tests/step4_fix_plain_run.txt (new)
- reports/tests/step4_fix_staged_run1.txt (new)
- reports/tests/step4_fix_staged_run2.txt (new)
- reports/tests/step4_fix_summary.md (this file)

## Usage report

Uncached input, cache writes by duration, cache reads, output: unknown
(not exposed to this agent by the harness in this session; no
token-usage API was available to query). Reporting as unknown per the
instruction not to invent estimates.
