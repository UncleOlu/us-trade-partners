# US Goods Trade Partner Visualization: Specification

Setup before running: set the orchestrator model in Claude Code settings. Set `model: <sonnet id>` in each file under `.claude/agents/`. Fill both model IDs in CONTEXT AND COST CONTROL. Save this file as docs/SPEC.md.

## ROLE
You are the orchestrator. You plan, write contracts, delegate, and review. You do not write pipeline or UI code. Follow AGENTS.md. CLAUDE.md stays a thin shim. Neither file imports this specification in full. The chief-of-staff audit is the final gate and is read-only.

## GOAL
A static web app that shows US goods trade with every trading partner, by year and by HS category, with the trade balance per partner. Data is Census-basis goods trade in nominal USD.

## USER OUTCOMES
1. World map colored by US goods trade balance for a selected year. Click a country to open its page.
2. Partner page: imports, exports, balance, total trade value by year. Line chart plus table.
3. Partner page: imports and exports by HS section for the selected year, then by 2-digit chapter on click.
4. EU as one partner, computed by historical membership (see EU RULES).
5. Hub page (map of content): links to every partner, section, and year. Every page links back to the hub.
6. Section page: partners ranked by imports, exports, and balance for that section and year, plus a section trend line.

## HARD RULES
- No em dashes anywhere: code, comments, UI text, docs.
- Never guess an API field name, value, or default. Evidence is: variables.json, the official Census API guide, and saved live responses. Metadata alone is not enough for allowed values.
- Unexplained differences fail validation. Never add an "other" bucket to force agreement. Never state a cause you cannot prove. "Not verified" is a valid finding.
- A failed fetch or failed validation leaves the last good snapshot unchanged.
- CENSUS_API_KEY is required. If absent, stop and print setup steps. Never write the key to logs, saved requests, or the repo.
- Stored money values and accounting math are integer USD. Decimals are allowed for chart coordinates, percentages, and display formatting only.
- Compute derived values only from observed inputs. Never treat absent as zero.

## DATA SOURCE
- https://api.census.gov/data/timeseries/intltrade/imports/hs
- https://api.census.gov/data/timeseries/intltrade/exports/hs
- _YR fields are year-to-date. Read at time=YYYY-12 for full-year values. Never sum _YR across months. _MO fields are monthly.
- Imports: general imports, customs value (GEN_VAL_YR / GEN_VAL_MO). Exports: total exports including re-exports, FAS (ALL_VAL_YR / ALL_VAL_MO). Confirm names in variables.json.
- Every dimension not requested must stay at its total setting: DF on exports; DISTRICT, RP (rate provision), CTY_SUBCODE and any other dimension on imports. Prove this in the source test. Never add a total row to its components.
- Omit unused dimensions from get, or pin them with the predicate value -. Never list a dimension in get without a predicate: the API then breaks the row out by every stored value of that dimension (proven in raw/source_test/probe, step 1).
- Chapter detail uses COMM_LVL=HS2 with I_COMMODITY on imports and E_COMMODITY on exports.
- Partner totals and world totals come from separate queries that omit the commodity dimension. They are independent inputs for reconciliation, not sums of detail rows.
- Balance = exports minus imports. Negative is a deficit. total_trade_value = imports plus exports.

## AVAILABILITY
- Documented lower bound: 2010. Check every candidate year from 2010 forward, separately for imports and exports, for partner totals and for HS2 detail. Save the tested range and each response status. Authentication errors, timeouts, and invalid requests are failures, not evidence of unavailability.
- meta.json records three separate things: documented_availability, verified_availability, configured_coverage.
- START_YEAR is a config value, default 2013. Latest year = latest year where December data exists for both flows at both levels.
- LAST_UPDATE returns the literal 0 on both endpoints and is not verified as a date (step 1). Record the observed value but do not rely on it.
- Source fingerprint: the latest available period per flow, plus the world-total _YR value for every year in verified availability, both flows. Read the fingerprint before and after acquisition and store both readings in the raw manifest. A change during acquisition invalidates that snapshot attempt. meta.notes records the residual gap: a partner-level revision that leaves every world total unchanged is not detected.
- Record latest data period and fetched_at as separate fields.

## CATEGORIES
- Level 1: the 21 HS sections plus one group "Special classification" for chapters 98 and 99.
- Level 2: HS 2-digit chapters. Chapter 77 is reserved and never appears.
- Do not hard-code the chapter list. Derive the valid chapter set per flow and year from the data. Every included chapter maps to exactly one group. Store the mapping in pipeline/hs_sections.json with a source citation.

## PARTNERS
- Partner record: {code, name, kind (country | territory | special | aggregate), iso3 or null, map_feature_id or null, include_in_world_reconciliation, valid_from, valid_to, resolution (approved | excluded | unresolved), resolution_note}.
- Every code seen in any response must have a resolution. An exclusion list alone never makes unknown codes eligible. Unresolved codes block publication.
- Exclude world-total and country-group rows by explicit code lists in pipeline/excluded_codes.json: the - world row, every CGP code observed in any year, and documented group codes absent from live data (0001 OPEC). Do not rely on SUMMARY_LVL. Prove exclusion in the record-count check.
- Enumerate every partner code observed across all years and both flows. The kind special set may be empty; a partner may be present in one flow and absent in the other for a year.
- world-atlas TopoJSON uses numeric ISO 3166-1 IDs. Map Census codes to those IDs in pipeline/country_map.json. Never join by name. Report every unmapped code.
- A partner without a map shape still appears in the dataset, search, hub, tables, and section pages.

## AGGREGATES AND ADDITIVE TOTALS
- The reconciliation universe is the set of partners with include_in_world_reconciliation = true. It is non-overlapping by construction.
- Every global or section total, share, table footer, chart total, summary card, and CSV total sums the reconciliation universe only. Never sum displayed rows.
- Aggregate rows (EU) may appear in rankings with a visible "aggregate" label. They never enter additive totals or shares.

## EU RULES
- Definition: historical membership. Trade with countries that were members when the trade occurred.
- pipeline/eu_members.json stores full effective dates with an official EU source.
- Transition contributions: Croatia 2013 = July through December. UK 2020 = January only. All other member-years = full year via _YR at December.
- Transition years use _MO fields for the transition member and sum only member months.
- An incomplete set of member observations must not produce an EU total. Mark the EU value absent with reason.
- Mark 2013 and 2020 on EU charts with a membership-change note.
- Two separate checks:
  a. Calculation check: EU totals equal independently computed sums from member observations under the month rules. Exact. Any unexplained difference fails.
  b. Comparability check: compare with the Census EU aggregate code only after confirming compatible membership, coverage, and release. Otherwise report NOT_COMPARABLE with the numeric difference and the unresolved definition. This check never blocks publication.

## DATA CONTRACT
- JSON Schema in schema/ is the source of truth. Generate TypeScript types from it and test that they agree in CI.
- FlowValue: {status: observed | confirmed_zero | absent | not_applicable, value: integer or null, reason: string or null}. observed requires an integer. confirmed_zero requires value 0. absent and not_applicable require null and a reason. Every imports and exports field at every level (summary, partner year, section, chapter) is a FlowValue.
- fetch_failed lives in fetch logs and validation reports only, never in published data. A failed required fetch blocks publication.
- Paths (one snapshot_id per build):
  - data/<snapshot_id>/meta.json
  - data/<snapshot_id>/partners.json
  - data/<snapshot_id>/summary/<year>.json
  - data/<snapshot_id>/partner/<code>.json
  - data/<snapshot_id>/section/<id>.json
  - data/<snapshot_id>/hs_sections.json
- meta.json: schema_version, snapshot_id, code_commit, model_ids, raw_manifest_hash, fetched_at, source_last_update {imports, exports} (observed literal, not verified), source_fingerprint {latest_period {imports, exports}, world_totals_sha256}, latest_period, documented_availability, verified_availability, configured_coverage, eu_definition, country_map_version, hs_sections_version, notes.
- The app bundle contains one snapshot. The build injects snapshot_id. A missing snapshot file produces a visible error with a reload prompt, never a silent switch. Prior snapshots are published as zipped GitHub Release artifacts with their raw manifest.

## RAW ARCHIVE AND REBUILD
- Save every raw response and its request parameters (key removed) under raw/<snapshot_id>/ with a manifest that holds file hashes, acquisition timestamps, and source LAST_UPDATE values. The manifest is immutable after acquisition.
- `make data`: acquire, build, validate, then publish. `make rebuild <snapshot_id>`: build from raw/ with no network, reuse manifest timestamps, never write the current time. Sort all records and JSON keys deterministically. Rebuild output must be byte-identical to the original.

## VALIDATION
Report: reports/pipeline/validation.csv with columns: snapshot_id | year | period | flow | check | partner_code | section_id | chapter_code | expected | actual | difference_usd | difference_pct | status.

1. Unique records: one per year, partner, chapter, flow. Zero duplicates. Record counts prove total and group rows are excluded.
2. Partner totals: chapter sum equals the separately fetched partner total, per partner, year, flow. Exact, or a Census-documented cause with an explicit tolerance recorded in the row.
3. World totals: reconciliation-universe sum equals the separately fetched world total, per year, flow. Same rule.
4. Category totals: group sums equal chapter sums. Exact.
5. Derived figures: balance and total_trade_value exact, and computed only from observed inputs.
6. Published examples: five partner-years with available, comparable published Census tables, matched on definition and revision date. One large, one small, one special code (not_applicable if no special code is observed in any year), Norfolk Island 6022, and one other. Allow only their display rounding. Save URLs. EU is not in this set.
7. EU calculation check (exact) and EU comparability check (informational), as defined above.
8. FlowValue integrity: every null has a reason; every observed has an integer; no fetch_failed in published data.
9. Every partner code has resolution approved or excluded. Zero unresolved.

Run validation on the complete required dataset. Any FAIL in checks 1 to 9 (except 7b) blocks the UI phases.

## STACK
- Pipeline: Python 3, requests with timeouts and bounded retries, pandas.
- App: Vite, React, TypeScript, react-router. D3-geo and world-atlas TopoJSON for the map. Recharts for charts. No backend. No database.
- Routes: /?year=YYYY, /hub, /partner/:code?year=YYYY, /section/:id?year=YYYY, /methodology. Year and section state live in the URL.
- GitHub Pages project site, repository us-trade-partners, base path /us-trade-partners/ (VITE_BASE_PATH default). Configure Vite base, React Router basename, and all data fetch URLs to the same repo base path. Generate one index.html per known route at build time. Copy index.html to 404.html as a fallback only. No hash routing.

## UI RULES
- Global label on every page: "US goods trade, Census basis. Excludes services. Values are nominal USD." Link to /methodology: customs value, FAS, re-exports, Census vs BOP basis, EU definition and month rules, snapshot_id and source dates.
- Map: diverging scale, deficit red, surplus blue, zero white. Fixed dollar bands across all years. Distinct no-data style. Year slider. Click and keyboard select. Hover or focus shows name, imports, exports, balance.
- Partner search and a ranked partner table next to the map. Hover is never the only path to a value.
- Units: auto-select $k, $m, $bn with three significant figures. Exact integer on hover. CSV download per table with exact integers and statuses.
- Partner page: line chart of imports, exports, balance by year. Bar chart of sections by flow for the selected year. Chapter table sorted by total_trade_value. Status label for every non-observed value.
- Load only the selected snapshot files for the current route.
- Payload budgets, set by the owner on 2026-09-09: home route 250 KB gzip, partner route 300 KB gzip, both measured on the production build under the base path at the step 6 audit. The 110m world-atlas file loads only on the home route; a 50m file, if Agent C proposes one, loads lazily on zoom and its cost is reported separately. The agent never sets a budget from the measured value.

## FILE OWNERSHIP
- Orchestrator: schema/, docs/SPEC.md, .claude/agents/, AGENTS.md, CLAUDE.md, README.
- A pipeline: pipeline/, raw/, data/, reports/pipeline/, Makefile, Python environment files.
- B app: src/ except src/map/, package.json, lockfile, vite config, route-generation script, deployment workflow.
- C map: src/map/.
- D tests: tests/, test configuration, reports/tests/, fixtures with independent expected values. D never reads A's implementation code.

No agent edits outside its ownership. The orchestrator merges.

## CONTEXT AND COST CONTROL
- Pinned model IDs: orchestrator claude-fable-5-1, subagents claude-sonnet-5. Record them in meta.json and every usage report.
- Keep one canonical specification in docs/SPEC.md. Keep startup instructions short. Do not automatically import the full specification into every agent.
- Give each agent the shared block (HARD RULES, DATA CONTRACT, AGGREGATES AND ADDITIVE TOTALS, FILE OWNERSHIP, its acceptance criteria) plus its task-specific sections. Each agent may read further sections when needed.
- Save full responses, logs, and reports to disk. Default to at most 8,000 characters per routine tool result. Print file paths, counts, key findings, and bounded examples. State when output is truncated.
- Output limits never reduce validation coverage.
- Test summaries include expected and executed check counts, failures, errors, warnings, skips, and checks not run. Group repeated failures and show examples with record identifiers. Retain complete reports for inspection.
- Prefer targeted reads. Read complete functions, schemas, or files when necessary to understand dependencies or diagnose a failure. No blanket file-length ban.
- After three unsuccessful repair attempts on the same issue, stop that repair loop. Report the evidence, attempted fixes, and remaining hypotheses to the orchestrator. Do not weaken acceptance criteria. Preserve all user approval gates.
- Report usage per phase at each STOP: uncached input, cache writes by duration, cache reads, output. Mark unavailable metrics as unknown. Do not invent estimates.
- Preserve required desktop, mobile, and final visual checks. Limit repeated diagnosis without new evidence, not required QA.

## BUILD ORDER
1. Source test (orchestrator plus A). Save real requests and responses for: partner total and world total for both flows with the commodity dimension omitted; HS2 detail for one large partner, one small partner, one special code; the DF total setting on exports; DISTRICT, RP, CTY_SUBCODE total settings on imports; monthly EU boundary months 2013-06, 2013-07, 2020-01, 2020-02 for Croatia and the UK; availability probes from 2010 forward. Quote exact field names and values. STOP. Show me.
   Approval condition: separate partner-total and world-total queries work for both flows, unused dimensions are proven at total, both sides of each EU boundary are shown.
2. Contract (orchestrator) and independent tests (D) from the approved contract and saved samples. STOP. Show me the schema and D's test list.
3. Full pipeline (A) until validation passes. Show me reports/pipeline/validation.csv summary and the rebuild byte-identity proof. STOP.
4. One complete partner page with real snapshot data (B). Show me a screenshot and the measured home-route payload. I approve the payload budget here. STOP.
5. Remaining pages, hub, section pages, map (B and C).
6. Deployed-site audit: every known route returns HTTP 200 after canonical redirect, preserves query parameters, and loads data under the repo base path. 404.html fallback does not count as a valid route. Browser tests. Desktop and mobile screenshots. Attach validation, test, usage, and payload reports.
7. Chief-of-staff audit, read-only, against this specification and AGENTS.md.

## REPORTING
- At each STOP: command output, files, screenshots, usage report. A written PASS is not evidence.
- At the end: every assumption not in this specification, every trade-off taken, every NOT_COMPARABLE and unresolved finding.
