# Data contract

JSON Schema files in this directory are the source of truth for every published data file. Schema version 1.0.0, draft 2020-12. TypeScript types are generated from these files (Agent B, `npm run gen:types` into src/types/generated.ts) and CI fails if the generated file differs from a fresh generation.

## Files and schemas

| Published path | Schema |
|---|---|
| data/<snapshot_id>/meta.json | meta.schema.json |
| data/<snapshot_id>/partners.json | partners.schema.json |
| data/<snapshot_id>/summary/<year>.json | summary.schema.json |
| data/<snapshot_id>/partner/<code>.json | partner.schema.json |
| data/<snapshot_id>/section/<id>.json | section.schema.json |
| data/<snapshot_id>/hs_sections.json | hs_sections.schema.json |

common.schema.json holds FlowValue, DerivedValue, Partner, Chapter2, identifiers, and the envelope.

## Identifiers

- snapshot_id: `<YYYYMMDD>T<HHMMSS>Z-<12 hex>`. The timestamp is the acquisition start recorded in the raw manifest. The hex is the first 12 characters of the sha256 of the raw manifest. A rebuild reuses both, so the id is deterministic.
- Partner code: the Census CTY_CODE, four digits, or `EU` for the computed aggregate. Only a partner with kind aggregate may use a non-numeric id, and `EU` is the only such id in schema version 1.0.0. The schema enforces this. The Census world row `-` and the wildcard region codes `1XXX` to `7XXX` cannot be represented by the code pattern; they are excluded in pipeline/excluded_codes.json and listed in meta.notes instead of partners.json. partners.json carries every four-digit code observed, approved or excluded. The Census world row `-` and every group code in pipeline/excluded_codes.json are never partners in summary, partner, or section files. Four-digit group codes (0001, 0003, 0014 and the other CGP codes) appear in partners.json with resolution excluded so that check 9 can prove every observed code is resolved; the world row and the wildcard region codes are listed in meta.notes, as the next paragraph says.
- Section id: HS section roman numerals `I` to `XXI`, plus `SPECIAL` for chapters 98 and 99. Exactly 22 groups.
- Chapter: two digits as returned by I_COMMODITY or E_COMMODITY at COMM_LVL=HS2. Chapter 77 never appears.
- Year: integer, the year of the December _YR read (time=YYYY-12).

## Value rules

- Every imports and exports field is a FlowValue. observed: integer USD, reason null. confirmed_zero: value 0 and a reason that cites the evidence (a row returned with 0). absent: null and a reason such as `no row returned for 5790 imports 2023-12`. not_applicable: null and a reason such as `chapter 99 not in exports chapter set`.
- balance and total_trade_value are DerivedValue. observed only when both inputs are observed or confirmed_zero; balance = exports minus imports; total_trade_value = imports plus exports. Otherwise absent with a reason that contains the word imports or exports for each missing input; the rest of the wording is free. Never computed from a null.
- Missing-row rule. A missing chapter row for partner P, year Y, flow F is confirmed_zero only when the present chapter rows for P, Y, F sum exactly to the separately fetched partner total for P, Y, F. The reason cites that reconciliation, for example `no row; present chapters sum to partner total 52359 for 1610 imports 2023`. Otherwise every missing chapter for P, Y, F is absent and validation check 2 fails for that row. Missing partner-level rows stay absent. A missing row is never evidence of zero on its own.
- fetch_failed never appears in published data.
- All money is integer USD. No floats anywhere in data files.

## Aggregation rules

- summary.world holds the separately fetched world totals for that year, never a sum of rows.
- Universe sums (validation check 3 and section.years[].universe) are computed over partners with include_in_world_reconciliation true whose value is observed or confirmed_zero. Partners with no partner-level row for that flow and year stay absent at partner level (never confirmed_zero) and are listed in the validation row's partner_code cell. Check 3 passes only when the universe sum equals the separately fetched world total exactly; an exact match is the evidence that the absent partners contributed nothing to the world total for that flow and year. When check 3 passes for a flow and year, section.years[].universe values for that flow and year are published as observed sums over the same observed partners. When check 3 fails for a flow and year, every section universe value for that flow and year is absent with a reason naming the check 3 row. Never add an other bucket and never impute a value to an absent partner. This rule was ratified by the owner on 2026-09-09.
- EU has kind aggregate and include_in_world_reconciliation false. It appears in summary.partners and section.years[].partners so the UI can rank it with an aggregate label. It never enters any sum.
- partner.sections[].groups[].imports is the sum of that group's observed chapter values for that flow; if any chapter in the group is absent for that flow, the group value is absent with a reason. Chapters that are not in the flow's chapter set for that year are not_applicable and do not block the group sum.

## Ordering and determinism

- Arrays sorted: partners by code, years by year, groups by the order in hs_sections.groups, chapters by chapter, notes as written by the pipeline in a fixed order.
- JSON keys sorted. Two-space indent. Trailing newline. UTF-8. No timestamps other than meta.fetched_at, which is copied from the raw manifest.
- A rebuild from raw/<snapshot_id> must produce byte-identical files.

## EU rules in data

- pipeline/eu_members.json is the membership source. Full member-years use _YR at December. Transition members use _MO for member months only (Croatia 2013 July to December; UK 2020 January).
- If any member observation needed for a year is missing, the EU value for that year and flow is absent with a reason listing the missing member codes and periods.
- partner/EU.json years[].note carries the membership-change note for 2013 and 2020.

## Check scope notes

- Check 2 (partner totals) applies to Census partners, whose totals are fetched separately. The EU aggregate has no fetched total; its year totals are covered by check 7a and its group and chapter consistency by check 4. EU group and chapter values in transition years are observed only when eu_members_hs2 observations exist for every transition month; otherwise absent with reason.
- Check 6 (published examples): when the pipeline value for a published example is absent, no numeric comparison is possible. The row is NOT_COMPARABLE with a reason stating the published display value and that absent is not evidence of zero. NOT_COMPARABLE rows in check 6 do not block publication; FAIL rows do.

## Validation report

reports/pipeline/validation.csv columns, in order: snapshot_id, year, period, flow, check, partner_code, section_id, chapter_code, expected, actual, difference_usd, difference_pct, status. status is PASS, FAIL, NOT_COMPARABLE, or NOT_APPLICABLE. check is one of: unique_records, record_counts, partner_totals, world_totals, category_totals, derived_figures, published_examples, eu_calculation, eu_comparability, flowvalue_integrity, partner_resolution. Empty cells are empty strings, never the word null.

## Raw archive layout

raw/<snapshot_id>/ holds every request and response of one acquisition. Each request saves `<name>.request.json` (url and params with the key removed, fetched_at, http status, elapsed seconds) and `<name>.response.json` (body verbatim). The table below gives `<name>`; readers open `<name>.response.json`. Names:

| Path | Content |
|---|---|
| manifest.json | sha256 of every file, acquisition start and end, fingerprint_before and fingerprint_after, observed LAST_UPDATE literals; immutable after acquisition |
| fingerprint/before.json, fingerprint/after.json | latest available period per flow plus the world-total _YR value for every verified year, both flows |
| variables/imports.json, variables/exports.json | variables.json per endpoint |
| availability/probes.csv | the availability probe table for this acquisition |
| partner_totals/<flow>_<year>-12.json | all-partner query, commodity omitted, dimensions omitted or pinned to -; includes the world row and CGP rows as returned |
| world_totals/<flow>_<year>-12.json | separate query with CTY_CODE=- |
| hs2/<flow>_<year>-12.json | HS2 detail for every partner, one file per flow and year; Agent A may split into hs2/<flow>_<year>-12_part<n>.json if the API requires it |
| eu_members/<flow>_<code>_<YYYY-MM> | monthly partner-level observations (_MO) for transition members only: Croatia 4791 for 2013-07 to 2013-12, United Kingdom 4120 for 2020-01. Full member-years use the December _YR row in partner_totals |
| eu_members_hs2/<flow>_<code>_<YYYY-MM> | monthly HS2 observations (_MO, COMM_LVL=HS2) for the same transition member months, so the EU aggregate has group and chapter detail in transition years. Required from snapshot schema 1.0.0 onward; a snapshot acquired without them publishes EU group and chapter values for 2013 and 2020 as absent with the reason `transition-month HS2 observations not acquired` |

Agent D's EU calculation test reads partner_totals for full member-years and eu_members for transition months.

## Published examples (check 6)

The published Census values for the five partner-years are captured independently by Agent D or the orchestrator into tests/fixtures/published_examples/<code>_<year>.json with fields: code, name, year, flow values as published, url, table name, revision date, rounding unit, accessed date, and the saved page under tests/fixtures/published_examples/sources/. Agent A has no write access there. The pipeline's check 6 reads those fixtures read-only and compares within the recorded rounding only. If a fixture is missing at validation time, the row is FAIL with reason `fixture missing`, never NOT_APPLICABLE. The special-code row is NOT_APPLICABLE when no special code is observed in any year, or when Census publishes no Trade in Goods page for the observed special code; in the second case the reason records the URL tried and the HTTP status. kind special is reserved for non-geographic codes; a geographic partner without an ISO 3166-1 code (Kosovo 4803) is kind country with iso3 null.

## Map interface (Agent B and Agent C)

src/map/index.ts exports a React component WorldMap with props: year (number), summaryPartners (summary.partners for that year), partners (partners.json partners), selectedCode (string or null), onSelect(code), basePath (string). Agent C joins features to partners by partners[].map_feature_id against the TopoJSON feature id only, never by name. The 110m TopoJSON is served at `${basePath}atlas/countries-110m.json`; Agent B's build copies it there from the pinned world-atlas package version, and only the home route loads it. Dependencies d3-geo, topojson-client, world-atlas and their type packages are added by Agent B. Color bands are fixed USD thresholds shared across all years and documented in src/map/bands.ts. The component reports, through a `diagnostics` callback prop, every feature id without a partner and every partner with a map_feature_id that matches no feature; Agent B renders that list on the methodology page.

