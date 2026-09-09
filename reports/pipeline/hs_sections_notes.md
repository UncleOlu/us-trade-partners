# hs_sections.json notes

Not stored inside pipeline/hs_sections.json itself because hs_sections.schema.json
sets `additionalProperties: false` with only `version, source, groups, chapter_sets`
allowed (the schema title says it governs both data/<snapshot_id>/hs_sections.json
and pipeline/hs_sections.json), so there is no room for a `notes` field there.

- Chapter 77 is reserved in the HS nomenclature (would fall in Section XV,
  base metals and articles of base metal) and is never observed in Census
  international trade data. It is omitted from the Section XV chapters list
  in pipeline/hs_sections.json per SPEC CATEGORIES ("Chapter 77 is reserved
  and never appears") and checked in validation (77 must never appear).
- The SPECIAL group (chapters 98, 99) is a Census-specific addition, not a
  WCO HS section. SPEC CATEGORIES level 1: "one group Special classification
  for chapters 98 and 99". Chapter 98 (imports and exports) =
  "SPECIAL CLASSIFICATION PROVISIONS, NESOI"; chapter 99 (imports only) =
  "SPECIAL IMPORT PROVISIONS, NESOI", per
  raw/source_test/hs2_imports_large.response.json and
  hs2_exports_large.response.json (source test item 5).
- chapter_sets (valid chapter set observed per flow and year) is populated
  by the build step from acquired data, never hard-coded in the reference
  file. It starts as `{"imports": {}, "exports": {}}` in pipeline/hs_sections.json.
- Source: World Customs Organization, Harmonized System Nomenclature 2022
  Edition, section titles and chapter listing.
  https://www.wcoomd.org/en/topics/nomenclature/instrument-and-tools/hs-nomenclature-2022-edition/hs-nomenclature-2022-edition.aspx
  accessed 2026-09-09, saved at raw/reference/wco_hs_nomenclature_2022.html.
  All 21 section titles and their chapter ranges were parsed directly from
  that saved page (raw/reference/wco_hs_nomenclature_2022.html); the parsed
  chapter ranges match the well-known HS section structure exactly
  (e.g. Section XIV = chapter 71 only, Section XIX = chapter 93 only).
