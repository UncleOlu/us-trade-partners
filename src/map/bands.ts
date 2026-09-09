// Fixed USD balance bands for the world map, shared across every year so a
// given color always means the same dollar amount no matter which year is
// on screen. Deficit is red, surplus is blue, near-zero is white, per UI
// RULES. The bands are discrete (a threshold scale), not a continuous
// gradient, so the legend can show a fixed, finite set of swatches.
//
// Basis for the five thresholds (read from every published summary file,
// data/20260909T091429Z-c638aff167ea/summary/2013.json through 2025.json,
// 3,025 approved-partner-year balance observations with status "observed"):
//   - Overall range across all 13 years: -$418.23bn (2018, the largest single
//     deficit) to +$58.98bn (2025, the largest single surplus). The
//     distribution is heavily skewed toward deficit: the 1st percentile
//     across all observations is -$125.34bn but the 99th percentile is only
//     +$18.18bn.
//   - Most partners sit close to balanced trade: 2,066 of 3,025 observations
//     (68%) fall within +/- $1bn, and 1,169 (39%) fall within +/- $100m.
//   - Only 162 observations (5%) reach +/- $25bn or beyond, and only 38 (1%)
//     reach +/- $100bn in either direction.
// A five-step-per-side scale at $100m, $1bn, $5bn, $25bn and $100bn keeps
// the dense near-zero cluster (most partners, most years) visually
// separated into three shades on each side, while still giving the handful
// of extreme-deficit partners (historically China) and extreme-surplus
// partners (historically re-export and finance hubs such as the
// Netherlands) their own top shade. The top band starts at $100bn even
// though the observed surplus max is $58.98bn: the bands are fixed for
// every year including years outside this snapshot, so headroom is left
// deliberately rather than fitting the scale to today's data and having to
// change the legend later.

export const BAND_THRESHOLDS_USD = [
  100_000_000, // $100m
  1_000_000_000, // $1bn
  5_000_000_000, // $5bn
  25_000_000_000, // $25bn
  100_000_000_000, // $100bn
] as const;

// Sequential red and blue ramps, five steps each, light (near the $100m
// threshold) to dark (past the $100bn threshold). Chosen for a light
// background and for being distinguishable from the grey no-data style at a
// glance.
const DEFICIT_COLORS = ['#fcbba1', '#fb6a4a', '#cb181d', '#a50f15', '#67000d'] as const;
const SURPLUS_COLORS = ['#c6dbef', '#6baed6', '#3182bd', '#08519c', '#08306b'] as const;
const ZERO_COLOR = '#ffffff';

// No-data style: partners with a non-observed balance and features with no
// matched partner both use this. It must read as visibly different from the
// white zero band, so it is a mid grey with a diagonal hatch pattern, not a
// pale grey that could be mistaken for a very small balance.
export const NO_DATA_FILL = '#d9d9d9';
export const NO_DATA_HATCH_ID = 'map-no-data-hatch';
export const NO_DATA_HATCH_STROKE = '#9e9e9e';
export const NO_DATA_LABEL = 'No balance or no mapped partner';

export interface Band {
  id: string;
  label: string;
  color: string;
  /** Inclusive lower bound in USD. */
  min: number;
  /** Exclusive upper bound in USD. */
  max: number;
}

function formatThreshold(n: number): string {
  if (n >= 1_000_000_000) return `$${n / 1_000_000_000}bn`;
  if (n >= 1_000_000) return `$${n / 1_000_000}m`;
  return `$${n}`;
}

function buildBands(): Band[] {
  const t = BAND_THRESHOLDS_USD;

  const deficitBands: Band[] = [];
  deficitBands.push({
    id: 'deficit-5',
    label: `Deficit over ${formatThreshold(t[4])}`,
    color: DEFICIT_COLORS[4],
    min: -Infinity,
    max: -t[4],
  });
  deficitBands.push({
    id: 'deficit-4',
    label: `Deficit, ${formatThreshold(t[3])} to ${formatThreshold(t[4])}`,
    color: DEFICIT_COLORS[3],
    min: -t[4],
    max: -t[3],
  });
  deficitBands.push({
    id: 'deficit-3',
    label: `Deficit, ${formatThreshold(t[2])} to ${formatThreshold(t[3])}`,
    color: DEFICIT_COLORS[2],
    min: -t[3],
    max: -t[2],
  });
  deficitBands.push({
    id: 'deficit-2',
    label: `Deficit, ${formatThreshold(t[1])} to ${formatThreshold(t[2])}`,
    color: DEFICIT_COLORS[1],
    min: -t[2],
    max: -t[1],
  });
  deficitBands.push({
    id: 'deficit-1',
    label: `Deficit, up to ${formatThreshold(t[1])}`,
    color: DEFICIT_COLORS[0],
    min: -t[1],
    max: -t[0],
  });

  const zeroBand: Band = {
    id: 'zero',
    label: `Within ${formatThreshold(t[0])} of balanced`,
    color: ZERO_COLOR,
    min: -t[0],
    max: t[0],
  };

  const surplusBands: Band[] = [
    {
      id: 'surplus-1',
      label: `Surplus, up to ${formatThreshold(t[1])}`,
      color: SURPLUS_COLORS[0],
      min: t[0],
      max: t[1],
    },
    {
      id: 'surplus-2',
      label: `Surplus, ${formatThreshold(t[1])} to ${formatThreshold(t[2])}`,
      color: SURPLUS_COLORS[1],
      min: t[1],
      max: t[2],
    },
    {
      id: 'surplus-3',
      label: `Surplus, ${formatThreshold(t[2])} to ${formatThreshold(t[3])}`,
      color: SURPLUS_COLORS[2],
      min: t[2],
      max: t[3],
    },
    {
      id: 'surplus-4',
      label: `Surplus, ${formatThreshold(t[3])} to ${formatThreshold(t[4])}`,
      color: SURPLUS_COLORS[3],
      min: t[3],
      max: t[4],
    },
    {
      id: 'surplus-5',
      label: `Surplus over ${formatThreshold(t[4])}`,
      color: SURPLUS_COLORS[4],
      min: t[4],
      max: Infinity,
    },
  ];

  return [...deficitBands, zeroBand, ...surplusBands];
}

/** Eleven fixed bands, most negative first, most positive last. */
export const BANDS: Band[] = buildBands();

/** Returns the band whose [min, max) range contains value. */
export function bandForBalance(value: number): Band {
  for (const band of BANDS) {
    if (value >= band.min && value < band.max) return band;
  }
  return BANDS[BANDS.length - 1];
}

export interface LegendEntry {
  id: string;
  label: string;
  color: string;
  /** True for the no-data swatch, which renders with the hatch pattern, not a flat fill. */
  isNoData?: boolean;
}

// Signed intervals match the [min, max) scale exactly, including boundaries.
function exactBandLabel(band: Band): string {
  const signed = (value: number) => `${value < 0 ? '-' : '+'}${formatThreshold(Math.abs(value))}`;
  if (band.min === -Infinity) return `Below ${signed(band.max)}`;
  if (band.max === Infinity) return `${signed(band.min)} or more`;
  return `${signed(band.min)} to below ${signed(band.max)}`;
}

/** Legend entries in display order: extreme deficit to extreme surplus, then no-data last. */
export const LEGEND: LegendEntry[] = [
  ...BANDS.map((b) => ({ id: b.id, label: exactBandLabel(b), color: b.color })),
  { id: 'no-data', label: NO_DATA_LABEL, color: NO_DATA_FILL, isNoData: true },
];
