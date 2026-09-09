# src/map/

The world map for the US goods trade partner visualization. Owned entirely by Agent C. Renders with D3-geo and a
world-atlas 110m TopoJSON, colored by US goods trade balance for a selected year.

## Component

```ts
import { WorldMap } from './map'; // named export
import WorldMap from './map'; // default export, same component
```

Props (`WorldMapProps` in `types.ts`):

| Prop | Type | Notes |
|---|---|---|
| `year` | `number` | Used only for the map's `aria-label` and to key the balance data already filtered into `summaryPartners`. Does not trigger an atlas refetch. |
| `summaryPartners` | `Summary['partners']` | `summary/<year>.json` partners for the given year: approved partners only, with that year's imports, exports, balance, total_trade_value. |
| `partners` | `Partners['partners']` | `partners.json` partners: every code ever observed, approved and excluded, carries `map_feature_id`. Used to look up each partner's atlas feature id and, for excluded and unmapped partners, to build the diagnostics. |
| `selectedCode` | `string \| null` | The partner code to outline as selected. |
| `onSelect` | `(code: string) => void` | Called on click or on Enter/Space while a country is focused. |
| `basePath` | `string` | Repo base path, e.g. `/us-trade-partners/`. The atlas is fetched once from `` `${basePath}atlas/countries-110m.json` ``. |
| `diagnostics` | `(report: WorldMapDiagnostics) => void` (optional) | Called once per atlas or partner-list load (never on a year change) with the join diagnostics. See below. |

## Join rule

Every atlas feature's `id` (the world-atlas numeric ISO 3166-1 code, arriving as a JSON string such as `"242"`) is
compared as a number against `partners[].map_feature_id`. Never by name. A feature whose id has no matching partner,
and a partner whose `map_feature_id` matches no feature, are both reported, never silently dropped.

Three atlas features in the 110m resolution (N. Cyprus, Somaliland, Kosovo) carry no `id` at all in the source
TopoJSON; they are treated as unmatched with `id: null` rather than being skipped.

Only partners with `resolution: "approved"` are considered for the join and for the diagnostics: excluded partners
(the world-total row, country-groupings such as OPEC and the Census EU aggregate row) never have a `map_feature_id`
and never render on the map, so including them in the diagnostics would only add 13 meaningless rows (`partners.json`
has 249 total partners, 236 approved, 13 excluded, in the snapshot used for local testing).

## Band thresholds (`bands.ts`)

Fixed USD bands, shared across every year, deficit red / surplus blue / near-zero white, per UI RULES. Five
thresholds define eleven bands (five deficit shades, one white zero band, five surplus shades):

`$100m, $1bn, $5bn, $25bn, $100bn`

Chosen by reading every published summary file (`data/20260909T091429Z-c638aff167ea/summary/2013.json` through
`2025.json`, 3,025 approved-partner-year balance observations):

- Range across all 13 years: -$418.23bn (2018, largest deficit) to +$58.98bn (2025, largest surplus). Heavily skewed
  toward deficit (1st percentile -$125.34bn, 99th percentile +$18.18bn).
- 68% of observations (2,066 of 3,025) fall within +/- $1bn; 39% (1,169) fall within +/- $100m.
- Only 5% (162) reach +/- $25bn or beyond; only 1% (38) reach +/- $100bn.

The full comment with the exact figures and the reasoning for each threshold lives in `bands.ts`. The top band
starts at $100bn even though the observed surplus max is $58.98bn, deliberately: the bands are fixed for every year,
not refit each time, so headroom is left rather than having to change the legend later.

Partners with a non-observed balance (`status` other than `observed` or `confirmed_zero`) and features with no
matched partner both render with the same no-data style: a mid grey (`#d9d9d9`) diagonal hatch pattern, visibly
different from the white zero band. `bands.ts` exports `LEGEND`, the full list of swatches (eleven bands plus
no-data) that the component renders under the map.

## Interaction

- The SVG is a named group. One matched country is in the Tab order. Arrow keys move focus in country-name order; Home and End reach the first and last. Tab leaves the map. Click, tap, Enter and Space call `onSelect(code)`.
- Country button labels include imports, exports and balance. Hover or focus fills a reserved readout with both compact and exact values. Escape clears the readout. It stays visible after the pointer leaves so users have time to read it.
- A strong country outline and focus ring show keyboard focus.
- Unmatched features remain non-interactive. The coverage note links to the complete partner results, including small territories and aggregates.
- The legend uses exact signed intervals matching the fixed [min, max) color scale. The hatched style means no usable balance or no mapped partner.
- Map loading errors offer a retry button. Fetch cleanup aborts stale requests; retry and StrictMode effect replay start a new request.

## Performance

- Atlas loading starts on `basePath` changes, explicit retry, or StrictMode effect replay (`useAtlas.ts`). It does not restart on `year`, `selectedCode`, `partners`, or `summaryPartners` changes.
- The D3 projection, path generator, and every feature's `d` path string are memoized on feature geometry and
  container size only (`WorldMap.tsx`), so changing the year recolors paths without recomputing any geometry.

## Diagnostics dump

`diagnostics.mjs` is a standalone Node script that independently re-implements the join rule (approved partners
only, numeric `map_feature_id` equality) against the published `partners.json` and the pinned world-atlas TopoJSON
in `node_modules/world-atlas/countries-110m.json` (the same file Agent B's build copies to
`` `${basePath}atlas/countries-110m.json` ``). Run from the project root:

```sh
node src/map/diagnostics.mjs
# or, to check a different published snapshot:
node src/map/diagnostics.mjs data/<snapshot_id>
```

It prints both diagnostics lists in full, with counts, never truncated.
