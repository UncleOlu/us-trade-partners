# Methodology page content

Source text for the /methodology route. Agent B renders it; values marked {{...}} are injected from the snapshot's meta.json at build time. No em dashes. Money shown as published integers or as the page's unit formatter.

## What this site shows

US goods trade with every trading partner, by year and by Harmonized System (HS) category, with the trade balance per partner. Data are US Census Bureau merchandise trade statistics on the Census basis. Services are excluded. Values are nominal US dollars, not adjusted for inflation or seasonality.

## Definitions

- Imports are general imports valued at customs value: the value of goods as appraised by US Customs, excluding US import duties, freight, and insurance. Field GEN_VAL_YR (year to date) and GEN_VAL_MO (month) in the Census API imports/hs dataset.
- Exports are total exports, domestic plus re-exports (foreign goods exported without substantial transformation), valued free alongside ship (FAS) at the US port of export, excluding freight and insurance beyond the port. Field ALL_VAL_YR and ALL_VAL_MO in the exports/hs dataset.
- Balance is exports minus imports. A negative balance is a deficit. Total trade value is imports plus exports.
- Full-year values are the December year-to-date reading (time=YYYY-12). Year-to-date values are never summed across months.
- Census basis versus balance of payments (BOP) basis: the BOP figures published by the Bureau of Economic Analysis adjust Census-basis goods for coverage, valuation, and timing and add services. Figures here are Census basis and do not match BOP totals.

## All years

All years adds the annual values from {{configured_coverage.start_year}} through {{configured_coverage.end_year}}. It is a cumulative sum of nominal dollars, not an annual average or an inflation-adjusted amount. Trend charts still show each year separately.

A missing required year makes its cumulative flow absent. Categories marked not applicable for a year contribute no value; if every year is not applicable, the cumulative value stays not applicable. Balance and total trade require complete cumulative imports and exports. Missing ranking values sort last and do not receive a computed rank in this view.

World totals add the separately fetched annual world totals, not the partner rows. The EU row adds its annual historical-membership totals, so its membership changes within the combined period. It remains separate from world and section totals. The map keeps the same dollar bands, so more cumulative balances may enter its darkest bands.

The app calculates this view from the pinned annual snapshot. It does not replace the source files or change the snapshot's pipeline commit.

## Categories

Level 1 is the 21 HS sections (I to XXI) plus one group, Special classification, for chapters 98 and 99. Level 2 is the HS 2-digit chapter. Chapter 77 is reserved in the HS and never appears. Chapter 99 (special import provisions) appears in imports only. The chapter set for each flow and year is derived from the data, not hard-coded. Section membership follows the World Customs Organization HS 2022 section list ({{hs_sections_version}}).

## Partners

Partners are Census country codes (Schedule C). Country-group rows published by Census (for example the European Union code 0003, USMCA, APEC, and the continent totals) are excluded from every partner list and every total by explicit code list. The Census world total row is fetched separately and used only for reconciliation.

World totals use the separately fetched Census totals. Section totals sum the reconciliation universe: partners flagged include_in_world_reconciliation. That set is non-overlapping by construction and reconciles exactly to the separately fetched Census world total for every year and flow in this snapshot. Aggregate rows, such as the EU, appear in rankings with an aggregate label and never enter sums or shares.

Partners without a map shape (small territories and non-geographic codes) still appear in search, tables, the hub, and section pages.

### Unidentified Countries (Census code 8220)

The Census API returns a detail-level partner row with code 8220 and a null name. It appears in exports only, in three years: 2013 (179,871,109 USD), 2014 (101,833 USD), and 2016 (1,771,484 USD). The code is not in the Census Schedule C country list or the API documentation. The Census published page for the code (https://www.census.gov/foreign-trade/balance/c8220.html) is titled "Trade in Goods with Unidentified Countries" and shows 179.9 million USD of exports for 2013, consistent with the API value. It is kept as a partner named "Unidentified Countries (Census code 8220)", the name Census uses on that page, because the exports world total for those years reconciles exactly only with it included. No country identity is assumed. The captured copy of the Census page is kept in the repository at tests/fixtures/published_examples/sources/8220_attempt.txt.

### Kosovo (4803)

Kosovo has no ISO 3166-1 code. It is treated as a country partner with no ISO code and no map shape, because the world-atlas file used for the map carries no numeric id for its Kosovo feature and features are never matched by name.

## The European Union as one partner

The EU figure is computed here from member countries, not taken from the Census EU aggregate code. Membership is historical: trade counts toward the EU only for the months a country was a member.

- Croatia joined on 1 July 2013. Its 2013 contribution is July through December, from monthly values.
- The United Kingdom left on 31 January 2020. Its 2020 contribution is January only, from monthly values.
- All other member-years use the December year-to-date value.
- If any member observation needed for a year is missing, the EU value for that year is shown as absent, never estimated.

EU charts mark 2013 and 2020 with a membership-change note.

### Comparison with the Census EU aggregate (code 0003)

The Census aggregate and this calculation are marked not comparable because compatible membership and release definitions have not been verified. The observed differences equal these member contributions; this numerical match does not establish the Census method:

- 2013: the Census aggregate is larger by 220,327,927 USD in imports and 140,367,870 USD in exports, exactly Croatia's January to June trade.
- 2019: the Census aggregate is smaller by 63,272,043,613 USD in imports and 69,079,944,687 USD in exports, exactly the UK's 2019 trade.
- 2020: the Census aggregate is smaller by 4,602,430,446 USD in imports and 5,830,208,879 USD in exports, exactly the UK's January 2020 trade.
- 2014 to 2018 and 2021 to 2025: the two agree exactly.

## Value status labels

Every imports and exports value carries a status:

- observed: a value returned by the Census API, or a total computed from complete usable inputs.
- confirmed zero: Census returned zero, or no row was returned for that chapter and the present chapters sum exactly to the separately fetched partner total. The value reason states the evidence.
- absent: no row was returned and no reconciliation proves it is zero. Absent values are never treated as zero, and totals that depend on them are also absent.
- not applicable: the category does not exist for that flow (for example chapter 99 in exports).

Example: Norfolk Island exports in 2023 are absent. The Census API returns no row, while the Census Trade in Goods page prints 0.0 million. Absence is not evidence of zero, so the value is shown as absent rather than 0.

## Validation

Before publication the snapshot passed: unique records per year, partner, chapter, and flow; chapter sums equal to separately fetched partner totals for every partner, year, and flow; reconciliation-universe sums equal to the Census world total for every year and flow; section sums equal to chapter sums; balances and totals derived only from observed inputs; comparison with published Census Trade in Goods pages for China, Germany, St Pierre and Miquelon, Norfolk Island, and Kosovo (2023), plus Unidentified Countries (2013), where observed values permit comparison within display rounding; the EU calculation check; status integrity; and partner resolution. Two published-example flow comparisons are not comparable because the API value is absent. All 26 EU aggregate comparisons are marked not comparable. The full validation.csv ships with the built snapshot release; the repository holds its summary.

## Snapshot and source dates

- Snapshot: {{snapshot_id}}
- Data acquired: {{fetched_at}}
- Latest data period available at acquisition: {{latest_period}}
- Coverage: {{configured_coverage.start_year}} to {{configured_coverage.end_year}}, of a verified availability of {{verified_availability.from_year}} to {{verified_availability.to_year}} (documented lower bound {{documented_availability.from_year}})
- Pipeline code commit: {{code_commit}}

The Census API's LAST_UPDATE field returns the literal 0 for these datasets and is not a usable date. Instead the pipeline fingerprints the source (latest available period per flow plus the world total for every verified year) before and after acquisition; a change invalidates the attempt. Residual gap: a Census revision at partner level that leaves every world total unchanged is not detected by this fingerprint.

Every raw request and response is archived with a hash manifest, and the published files rebuild byte for byte from that archive.
