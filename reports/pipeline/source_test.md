# Source test (BUILD ORDER step 1)

Agent: A (pipeline). All evidence below is saved under `./raw/source_test/` and quoted exactly from those saved files. No field name, allowed value, or default in this report was guessed; each comes from `variables.json`, the official Census API guide (fetched and saved), or a saved live response. CENSUS_API_KEY was loaded from `~/.config/us-trade-partners/env` and never printed, logged, or written to any saved file.

Environment: `pyproject.toml` created at project root; venv at `./.venv` built with `uv venv --python /opt/homebrew/bin/python3.12`; `requests` and `pandas` installed into it with `uv pip install`.

Code: `./pipeline/census_client.py` (shared HTTP client: 60s timeout, up to 3 bounded retries with backoff on 5xx/timeout only, redirects disabled, ~0.5s polite delay, key stripped before saving) and `./pipeline/source_test.py` (one stage function per evidence item, runnable independently as `python source_test.py <stage>`).

Request/failure counts: 140 request/response pairs are saved in the final evidence set (`find raw/source_test -name "*.request.json" | wc -l` = 140), covering variables.json x2, the API guide fetches, item 2 (8 requests, includes an extra "world" partner beyond the required 3), item 3 (2), item 4 (4), item 5 (6), item 6 (5), item 7 (16), item 8 (68), item 9 (2 LAST_UPDATE + 3 dataset discovery + 9 monthly probes), plus exploratory probes retained as evidence (`raw/source_test/probe/`). Two requests failed after exhausting the client's internal retries and were re-run as separate, successful requests once identified: the first `all_partners_imports` attempt (ReadTimeout, all 3 internal attempts) and `probe2026_imports_2026-03` (ReadTimeout). Both later succeeded (200) on a fresh request; the failed attempt's evidence is described in the relevant section below. No 4xx or redirect-to-missing-key failures occurred at any point.

---

## Item 1: variables.json for both endpoints

Saved: `raw/source_test/variables_imports.response.json` (70 variables), `raw/source_test/variables_exports.response.json` (41 variables). Grouped listing also saved at `raw/source_test/variables_grouped.json`.

Value fields confirmed exactly as named in variables.json:
- imports: `GEN_VAL_YR` = "15-digit Year-to-Date General Imports, Total Value", `GEN_VAL_MO` = "15-digit General Imports, Total Value".
- exports: `ALL_VAL_YR` = "15-digit Year-to-Date Total Value", `ALL_VAL_MO` = "15-digit Total Value".

Commodity dimension and level variable:
- imports: `I_COMMODITY` = "2-, 4-, 6-, or 10-character Import Harmonized Code", `I_COMMODITY_LDESC` = "150-character Import Harmonized Code Description", `I_COMMODITY_SDESC` = "50-character Import Harmonized Code Description". Level variable `COMM_LVL` = "4-character aggregation levels for commodity code. HS2=2-digit HS totals. HS4=4-digit HS totals. HS6=6-digit HS totals. HS10=10-digit HS totals."
- exports: `E_COMMODITY`, `E_COMMODITY_LDESC`, `E_COMMODITY_SDESC` (same digit-count wording, "Export Harmonized Code"). Same `COMM_LVL`.

Partner variables (both endpoints): `CTY_CODE` = "4-character Country Code", `CTY_NAME` = "50-character Country Name".

`SUMMARY_LVL` present on both: "Detail ('DET') or Country Grouping ('CGP') indicator".

Predicate-only / other dimension variables:
- imports: `DISTRICT` = "2-character District Code", `RP` = "2-character Rate Provision Code" (the SPEC calls this "RATE_PROVISION"; the actual field name in both variables.json and the API guide is `RP`, not `RATE_PROVISION` - no variable literally named `RATE_PROVISION` exists on the imports endpoint), `CTY_SUBCODE` = "2-character Country Subcode Code", `DIST_NAME` = "50-character District name".
- exports: `DF` = "1-character Domestic or Foreign Code", `DISTRICT` = "2-character District Code" (present on exports too), `DIST_NAME`.

Full variable list, grouped (value / dimension / other), quoted from `raw/source_test/variables_grouped.json`:

**imports (70 total)**
- value (52): AIR_CHA_MO/YR, AIR_VAL_MO/YR, AIR_WGT_MO/YR, CAL_DUT_MO/YR, CC_MO/YR, CNT_CHA_MO/YR, CNT_VAL_MO/YR, CNT_WGT_MO/YR, CON_CHA_MO/YR, CON_CIF_MO/YR, CON_QY1_MO/YR (+_FLAG), CON_QY2_MO/YR (+_FLAG), CON_VAL_MO/YR, DUT_VAL_MO/YR, GEN_CHA_MO/YR, GEN_CIF_MO/YR, GEN_QY1_MO/YR (+_FLAG), GEN_QY2_MO/YR (+_FLAG), GEN_VAL_MO/YR, VES_CHA_MO/YR, VES_VAL_MO/YR, VES_WGT_MO/YR.
- dimension (13): COMM_LVL, CTY_CODE, CTY_NAME, CTY_SUBCODE, DISTRICT, DIST_NAME, I_COMMODITY, I_COMMODITY_LDESC, I_COMMODITY_SDESC, MONTH, RP, YEAR, time.
- other (5): LAST_UPDATE ("10-character Date of Last Update"), SUMMARY_LVL, SUMMARY_LVL2 ("Variables being summarized. See the appendix of the Guide to International Trade Datasets for a complete list of codes."), UNIT_QY1, UNIT_QY2.

**exports (41 total)**
- value (24): AIR_VAL_MO/YR, AIR_WGT_MO/YR, ALL_VAL_MO/YR, CC_MO/YR, CNT_VAL_MO/YR, CNT_WGT_MO/YR, QTY_1_MO/YR (+_FLAG), QTY_2_MO/YR (+_FLAG), VES_VAL_MO/YR, VES_WGT_MO/YR.
- dimension (12): COMM_LVL, CTY_CODE, CTY_NAME, DF, DISTRICT, DIST_NAME, E_COMMODITY, E_COMMODITY_LDESC, E_COMMODITY_SDESC, MONTH, YEAR, time.
- other (5): LAST_UPDATE, SUMMARY_LVL, SUMMARY_LVL2, UNIT_QY1, UNIT_QY2.

Additional saved API-guide evidence (`raw/source_test/api_guide/`): `main_guide.html` (Census international-trade developer page), `Guide_to_International_Trade_Datasets.pdf` (linked from COMM_LVL's own label) with `guide.txt` (pdftotext -layout extraction), `imports_hs_examples.html`, `exports_hs_examples.html`. Key guide facts used throughout this report, with line numbers in `guide.txt`:
- Line 770/1002: `RP` is the only rate-provision variable name; no `RATE_PROVISION` variable exists.
- Line 1041: "DF - Domestic(1) or Foreign(2)".
- Lines 226-259: "The default value for all string type parameters is a dash (-). This means that calls that do not apply filtering parameters will return the total value for the specified string parameter." This is the documentary basis for the total-setting behavior tested in items 2, 5, and 6.
- Lines 1129-1148 (Appendix E of the guide, reproduced live in item 3): country-grouping codes 0001 OPEC, 0003 EUROPEAN UNION, 0014 PACIFIC RIM COUNTRIES, 0017 CAFTA-DR, 0020 NAFTA, 0021-0028, and 1XXX-7XXX regional codes.

---

## Item 2: partner total, both flows, commodity omitted, three partners

Query shape (confirmed live, see "Not guessed" note below): `get=CTY_CODE,CTY_NAME,SUMMARY_LVL,<value_field>,<unused dims>&time=2023-12&CTY_CODE=<code>&<each unused dim>=-`. Saved: `raw/source_test/partner_total_{imports,exports}_{large,small,special,world}.{request,response}.json` and `raw/source_test/stage2_summary.json`.

**Not guessed - a design correction found live:** placing an unused dimension variable (DF, DISTRICT, RP, CTY_SUBCODE) in `get` without any predicate does NOT collapse it to a total; the API breaks the result out by every stored value of that dimension. Proven in `raw/source_test/probe/probeA_get_only.response.json` (132 rows for CTY_CODE=5700 exports once DF and DISTRICT were added to get with no predicate). Setting the dimension to an explicit `-` predicate collapses it to a single total row with the field shown literally as `"-"` and a value identical to omitting the dimension from the query entirely: `raw/source_test/probe/probeB_dash_predicate.response.json` and `probeC_no_dims_in_get.response.json` both return `147626505741` for China exports 2023-12; `probeD_imports_dash.response.json` and `probeE_imports_omit.response.json` both return `427234312263` for China imports 2023-12. All four probe files are saved.

Partner selection and reasoning (`raw/source_test/selected_partners.json`):
- large: CHINA, code **5700** (confirmed live).
- small: ST PIERRE AND MIQUELON, code **1610** - the smallest partner with a nonzero value in BOTH flows' all-partner responses (item 3). Norfolk Island (6022, imports GEN_VAL_YR=4048) is smaller in imports alone but absent from the exports all-partner response; Niue (6144, exports ALL_VAL_YR=10397) is smaller in exports alone but absent from imports. Neither can be queried on both flows, so the smallest-in-both partner was used.
- special: EUROPEAN UNION, code **0003** - CTY_NAME indicates a non-geographic special/aggregate category (an international organization, not a place); `SUMMARY_LVL`="CGP" in both all-partner responses.

| flow | partner | CTY_CODE | CTY_NAME | SUMMARY_LVL | value field | value | unused dims shown |
|---|---|---|---|---|---|---|---|
| imports | large | 5700 | CHINA | DET | GEN_VAL_YR | 427234312263 | DISTRICT=-, RP=-, CTY_SUBCODE=- |
| imports | small | 1610 | ST PIERRE AND MIQUELON | DET | GEN_VAL_YR | 52359 | DISTRICT=-, RP=-, CTY_SUBCODE=- |
| imports | special | 0003 | EUROPEAN UNION | CGP | GEN_VAL_YR | 576004187056 | DISTRICT=-, RP=-, CTY_SUBCODE=- |
| exports | large | 5700 | CHINA | DET | ALL_VAL_YR | 147626505741 | DF=-, DISTRICT=- |
| exports | small | 1610 | ST PIERRE AND MIQUELON | DET | ALL_VAL_YR | 139877 | DF=-, DISTRICT=- |
| exports | special | 0003 | EUROPEAN UNION | CGP | ALL_VAL_YR | 368319152177 | DF=-, DISTRICT=- |

(An extra "world" row, CTY_CODE=-, was also fetched in this stage; it matches item 4 exactly and is reported there.)

---

## Item 3: all-partner query, both flows, time=2023-12, commodity omitted

Query: `get=CTY_CODE,CTY_NAME,SUMMARY_LVL,<value_field>,<unused dims>&time=2023-12&<each unused dim>=-` (no `CTY_CODE` predicate). Saved: `raw/source_test/all_partners_{imports,exports}.{request,response}.json`, analysis at `raw/source_test/stage3_analysis.json`.

Row counts: **251 rows in both imports and exports** responses. Breakdown: 1 world-total row + 231 individual-partner (`SUMMARY_LVL`="DET", CTY_CODE != "-") rows + 19 country-grouping (`SUMMARY_LVL`="CGP") rows = 251.

World-total row (identical in both flows' code/name): `CTY_CODE`="-", `CTY_NAME`="TOTAL FOR ALL COUNTRIES". Values: imports GEN_VAL_YR=3076552305624, exports ALL_VAL_YR=2021939261609. Note its `SUMMARY_LVL` is "DET", not "CGP" - confirming the SPEC instruction not to rely on SUMMARY_LVL for exclusion.

19 country-grouping (aggregate) rows observed, identical set in both flows:

| CTY_CODE | CTY_NAME |
|---|---|
| 0003 | EUROPEAN UNION |
| 0014 | PACIFIC RIM COUNTRIES |
| 0017 | CAFTA-DR |
| 0020 | USMCA (NAFTA) |
| 0021 | TWENTY LATIN AMERICAN REPUBLICS |
| 0022 | OECD |
| 0023 | NATO |
| 0024 | LAFTA |
| 0025 | EURO AREA |
| 0026 | APEC |
| 0027 | ASEAN |
| 0028 | CACM |
| 1XXX | NORTH AMERICA |
| 2XXX | CENTRAL AMERICA |
| 3XXX | SOUTH AMERICA |
| 4XXX | EUROPE |
| 5XXX | ASIA |
| 6XXX | AUSTRALIA AND OCEANIA |
| 7XXX | AFRICA |

EU aggregate: `0003 EUROPEAN UNION`, present in both flows. Note: the API guide's Appendix E (guide.txt lines 1129-1148) also lists code `0001 OPEC`, but OPEC does not appear anywhere in either live 2023-12 all-partner response (verified by full scan) - documented in the guide but not observed live for this period.

Also observed: the two flows' partner code sets are not identical. `CTY_CODE 6022 NORFOLK ISLAND` appears only in imports; `CTY_CODE 5790 KOREA, NORTH` appears only in exports. This drove the item 2 "small partner" selection above.

**Failure recorded then repaired:** the first live attempt at this all-partner query included DF and DISTRICT in `get` without predicates and returned 20,619 rows for exports (a real 200 response, not a failure, but the wrong query shape for a partner-level breakdown); the imports side of that same run timed out after exhausting the client's 3 internal retries (`ReadTimeout`, evidence: request recorded `"error": "ReadTimeout: ... read timeout=60"`, `http_status: null`). Both were corrected once the dash-predicate mechanism (see item 2) was identified, and the corrected 251-row responses above are what is saved as final evidence. The failed intermediate files were removed since they were superseded, not needed as separate evidence.

---

## Item 4: world total, both flows, time=2023-12

Saved: `raw/source_test/world_total_{imports,exports}.{request,response}.json`, `world_hs2_{imports,exports}.{request,response}.json`, `raw/source_test/stage4_summary.json`.

World code used: `CTY_CODE=-` (confirmed as the world code from item 3).

| flow | CTY_CODE | CTY_NAME | value field | value |
|---|---|---|---|---|
| imports | - | TOTAL FOR ALL COUNTRIES | GEN_VAL_YR | 3076552305624 |
| exports | - | TOTAL FOR ALL COUNTRIES | ALL_VAL_YR | 2021939261609 |

These match items 2 and 3's world-row values exactly (same numbers), which is expected since all three are independent queries against the same underlying total.

Adding the commodity dimension at COMM_LVL=HS2 for the same world code returns detail rows (not summed, per instructions):
- imports: **98 rows**.
- exports: **97 rows**.

---

## Item 5: HS2 detail, both flows, three partners

Saved: `raw/source_test/hs2_{imports,exports}_{large,small,special}.{request,response}.json`, `raw/source_test/stage5_summary.json`.

| flow | partner | rows | distinct chapters |
|---|---|---|---|
| imports | large (CHINA) | 98 | 01-76, 78-99 (77 absent) |
| imports | small (ST PIERRE AND MIQUELON) | 3 | 82, 90, 99 |
| imports | special (EUROPEAN UNION) | 98 | 01-76, 78-99 (77 absent) |
| exports | large (CHINA) | 97 | 01-76, 78-98 (77 absent, no 99) |
| exports | small (ST PIERRE AND MIQUELON) | 7 | 40, 84, 85, 87, 88, 90, 98 |
| exports | special (EUROPEAN UNION) | 97 | 01-76, 78-98 (77 absent, no 99) |

Chapter 77 confirmed absent in every partner/flow combination observed.

Chapter 98 present in all six combinations with description (`I_COMMODITY_SDESC`/`E_COMMODITY_SDESC`) **"SPECIAL CLASSIFICATION PROVISIONS, NESOI"** (quoted from `raw/source_test/hs2_imports_large.response.json` and `hs2_exports_large.response.json`).

Chapter 99 present only on imports, description **"SPECIAL IMPORT PROVISIONS, NESOI"** (quoted from `raw/source_test/hs2_imports_large.response.json`). Chapter 99 does not appear in either exports HS2 response (large or special).

Three example rows per partner (large partner shown; small/special in the saved JSON files):

imports, CHINA, chapter 01 (`raw/source_test/hs2_imports_large.response.json`):
```
{"CTY_CODE":"5700","CTY_NAME":"CHINA","I_COMMODITY":"01","I_COMMODITY_SDESC":"LIVE ANIMALS","COMM_LVL":"HS2","GEN_VAL_YR":"...","DISTRICT":"-","RP":"-","CTY_SUBCODE":"-","time":"2023-12"}
```
imports, CHINA, chapter 98: `I_COMMODITY_SDESC`="SPECIAL CLASSIFICATION PROVISIONS, NESOI", GEN_VAL_YR=5189477749.
imports, CHINA, chapter 99: `I_COMMODITY_SDESC`="SPECIAL IMPORT PROVISIONS, NESOI", GEN_VAL_YR=4675435801.
exports, CHINA, chapter 98: `E_COMMODITY_SDESC`="SPECIAL CLASSIFICATION PROVISIONS, NESOI", ALL_VAL_YR=2180281692.
(Full row sets, including chapter 01 exact values and all three partners, are in the saved response JSON files; truncated here for size.)

---

## Item 6: unused-dimension proof and contrast

Saved: `raw/source_test/contrast_exports_DF_{1,2}.{request,response}.json`, `contrast_imports_DISTRICT_13.{request,response}.json`, `contrast_imports_CTY_SUBCODE_Pplus.{request,response}.json`, `raw/source_test/stage6_summary.json`.

Total-setting proof for every unused dimension comes from item 2 and item 5 (each unused dimension given an explicit `-` predicate, per the mechanism proven in item 2): exports DF="-" and DISTRICT="-"; imports DISTRICT="-", RP="-", CTY_SUBCODE="-" - all shown literally in those saved responses, e.g. `partner_total_exports_large.response.json`: `{"CTY_CODE":"5700","CTY_NAME":"CHINA","DF":"-","DISTRICT":"-","ALL_VAL_YR":"147626505741", ...}`.

Allowed-value evidence and contrasts:

| dimension | allowed-value source | contrast predicate | contrast result |
|---|---|---|---|
| DF (exports) | guide.txt line 1041: "DF - Domestic(1) or Foreign(2)" | DF=1 vs DF=2, China, 2023-12 | DF=1 (Domestic): ALL_VAL_YR=125650187271. DF=2 (Foreign): ALL_VAL_YR=21976318470. Sum = 147626505741, exactly matching the DF="-" total from item 2. |
| DISTRICT (imports) | guide.txt line ~515, the guide's own live example "District Exports from Baltimore ... DISTRICT=13" | DISTRICT=13, China, 2023-12 | CTY_CODE=5700, DISTRICT=13, DIST_NAME="BALTIMORE, MD", GEN_VAL_YR=3990837571 (a subset of the China total 427234312263, proving DISTRICT breaks out a real subset when given a specific value). |
| CTY_SUBCODE (imports) | guide.txt lines 414-422 and 505-506, the guide's own live example `get=CTY_SUBCODE,GEN_VAL_MO&time=2013-01&CTY_SUBCODE=P+` | Reproduced exactly (no CTY_CODE predicate, time=2013-01, CTY_SUBCODE=P+) | CTY_SUBCODE="P+", GEN_VAL_MO=4345738. (China + 2023-12 + CTY_SUBCODE=P+ returned HTTP 204/no data for that specific combination, so the guide's own example parameters were used instead to get a real nonzero contrast.) |
| RP (imports) | **Verified live (breakout probe, no code-table needed)** | RP in get, no RP predicate, China imports 2023-12 | `raw/source_test/rp_breakout_imports_2023.response.json`: 13 rows returned. 1 row RP="-" (GEN_VAL_YR=427234312263, the same total-setting value proven in item 2). 12 rows with distinct non-dash RP codes (00, 10, 11, 13, 16, 17, 18, 19, 61, 69, 70, 79), summing to exactly 427234312263. So RP="-" is proven to be the sum of every stored RP value, confirming RP is at its total setting whenever omitted or pinned to "-", the same total-setting mechanism proven for DF, DISTRICT, and CTY_SUBCODE in item 2. Summary saved at `raw/source_test/rp_breakout_summary.json` (`total_rows: 13, dash_row_count: 1, dash_value: 427234312263, non_dash_row_count: 12, non_dash_sum: 427234312263, matches_dash: true`). No official Census code list for the 12 RP values themselves was found (still not verified what each RP code means), but the total-setting behavior itself is now verified live. |

---

## Item 7: EU boundary months, Croatia and United Kingdom

Codes confirmed from the item 3 all-partner response (`raw/source_test/eu_boundary_codes.json`): Croatia CTY_CODE=**4791**, CTY_NAME="CROATIA" (same code both flows); United Kingdom CTY_CODE=**4120**, CTY_NAME="UNITED KINGDOM" (same code both flows).

Saved: 16 request/response pairs `raw/source_test/eu_boundary_{imports,exports}_{croatia,united_kingdom}_{period}.{request,response}.json`, table at `raw/source_test/stage7_table.json` / `stage7_table.csv`.

| partner | flow | period | MO value | YR value |
|---|---|---|---|---|
| Croatia | imports | 2013-06 | 32857224 | 220327927 |
| Croatia | imports | 2013-07 | 34382506 | 254710433 |
| Croatia | imports | 2020-01 | 37239937 | 37239937 |
| Croatia | imports | 2020-02 | 33741299 | 70981236 |
| Croatia | exports | 2013-06 | 12383145 | 140367870 |
| Croatia | exports | 2013-07 | 40724466 | 181092336 |
| Croatia | exports | 2020-01 | 47760857 | 47760857 |
| Croatia | exports | 2020-02 | 18979747 | 66740604 |
| United Kingdom | imports | 2013-06 | 4373398048 | 25799450065 |
| United Kingdom | imports | 2013-07 | 4997574418 | 30797024483 |
| United Kingdom | imports | 2020-01 | 4602430446 | 4602430446 |
| United Kingdom | imports | 2020-02 | 4522604380 | 9125034826 |
| United Kingdom | exports | 2013-06 | 4514521052 | 24447949288 |
| United Kingdom | exports | 2013-07 | 3522046028 | 27969995316 |
| United Kingdom | exports | 2020-01 | 5830208879 | 5830208879 |
| United Kingdom | exports | 2020-02 | 6387116675 | 12217325554 |

All 16 requests returned HTTP 200. January YR values equal the January MO value in every case (2020-01 rows), confirming YR is year-to-date and resets each January, consistent with the SPEC's `_YR` definition. Both sides of each boundary (June/July 2013 for Croatia's accession; January/February 2020 for UK's departure) are shown for both flows.

---

## Item 8: availability probes, 2010-2026

Saved: `raw/source_test/availability.csv` (68 data rows + header), plus one request/response pair per probe under `raw/source_test/avail_{total,hs2}_{imports,exports}_{year}.{request,response}.json`.

Result: **every year 2010 through 2025**, both flows, both levels (partner total for China and HS2 detail for China), returned HTTP 200 with data at `time=YYYY-12`. **2026-12 returned HTTP 204** (no content) for all four combinations, classified as `unavailable: HTTP 204 no content (period not yet published)` - not a failure, since December 2026 has not occurred yet as of the fetch date (2026-09-08). No 4xx, timeout, or invalid-request failures occurred in this stage (0 of 68 rows).

- Latest year where December data exists for both flows at both levels: **2025**.
- Earliest year that returned data for all four combinations: **2010** (the full tested range 2010-2025 had data; no earlier years were probed since 2010 is the documented lower bound per SPEC AVAILABILITY).

---

## Item 9: LAST_UPDATE and latest data period

Saved: `raw/source_test/last_update_{imports,exports}.{request,response}.json`, `raw/source_test/dataset_{list_intltrade,imports_hs,exports_hs}.{request,response}.json`, `raw/source_test/probe2026_{imports,exports}_2026-{01..09}.{request,response}.json`, `raw/source_test/probe/probeF_lastupdate_{imports,exports}.{request,response}.json`, `raw/source_test/stage9_summary.json`.

**LAST_UPDATE variable: Not verified as a usable date.** The `LAST_UPDATE` variable ("10-character Date of Last Update" per variables.json) returned the literal string `"0"` in every query shape tried: partner total at time=2023-12 for both flows, and again at time=2026-07 requesting only `LAST_UPDATE` plus the value field. It never returned anything resembling a date. What would prove a real value: a documented query shape or a different Census dataset where this field returns a date string, which was not found in the guide or in any live response.

**Dataset discovery JSON: Not the right evidence either.** `https://api.census.gov/data/timeseries/intltrade/imports/hs.json` and `.../exports/hs.json` both returned HTTP 200 with a `"modified": "2017-05-02"` field on the dataset object, for both endpoints. This is the API's dataset/metadata definition date (unchanged since 2017), not a per-release data update date, so it does not answer "when was the trade data itself last refreshed." `https://api.census.gov/data/timeseries/intltrade.json` also returned 200 (full catalog, not inspected field-by-field beyond confirming it loads).

**HTTP headers: no evidence.** `curl -I` on the imports dataset JSON endpoint returned no `Last-Modified` header (headers captured: Cache-Control, Content-Type, Date, Strict-Transport-Security, Set-Cookie; no last-modified/date-of-update header present).

**What the guide says instead** (guide.txt, "The Trade Datasets in the Census API will be updated with the most recent month of trade statistics, after 8:30AM on the morning of the International Trade in Goods and Services (FT-900) release. You can find the FT-900 release dates in our online release schedule."): the guide points to an external FT-900 release calendar rather than an API field. That calendar page was not fetched in this test; noted under Not verified below.

**Latest data period (both flows), probed live for 2026:**

| period | imports status | imports has data | exports status | exports has data |
|---|---|---|---|---|
| 2026-01 | 200 | true | 200 | true |
| 2026-02 | 200 | true | 200 | true |
| 2026-03 | 200 (after retry; first attempt hit a transient ReadTimeout) | true | 200 | true |
| 2026-04 | 200 | true | 200 | true |
| 2026-05 | 200 | true | 200 | true |
| 2026-06 | 200 | true | 200 | true |
| 2026-07 | 200 | true | 200 | true |
| 2026-08 | 204 | false | 204 | false |
| 2026-09 | 204 | false | 204 | false |

Latest month with data for both flows: **2026-07**. 2026-08 and 2026-09 both returned HTTP 204 (not yet published) as of the fetch time 2026-09-08T22:4x UTC.

---

## Not verified

1. **RP (Rate Provision) meaning of each code (imports).** The total-setting behavior of RP is now verified live (see item 6: 13 rows, 12 non-dash RP codes summing exactly to the RP="-" total of 427234312263 for China imports 2023-12, `raw/source_test/rp_breakout_imports_2023.response.json` and `rp_breakout_summary.json`). What remains not verified is the meaning of the 12 individual RP codes (00, 10, 11, 13, 16, 17, 18, 19, 61, 69, 70, 79): no official Census rate-provision code table was found in variables.json or the API guide. Would be proven by an official Census rate-provision code table, not located.
2. **LAST_UPDATE as a real per-release date.** Returns literal `"0"` in every query shape tried on both endpoints (item 9). Would be proven by a query shape, alternate dataset, or documentation page that returns an actual date string for this field; none found.
3. **FT-900 release schedule page.** The guide references "our online release schedule" for FT-900 releases as the true source of last-update timing; that external calendar page itself was not fetched or saved in this test. Would be proven by fetching and saving that page.
4. **OPEC (code 0001) status.** Documented in the API guide's Appendix E as a country-grouping code, but absent from both live all-partner responses for 2023-12 (item 3). Not verified whether OPEC has been discontinued as a grouping, is present only in other periods, or was never populated in this dataset; would be proven by checking additional periods or Census documentation specifically about that code's retirement.
5. **Availability before 2010.** Per SPEC AVAILABILITY, 2010 is the documented lower bound and is what was tested; whether earlier years exist in this dataset was not probed and is out of scope for this test.
