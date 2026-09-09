// Unit auto-selection: $k, $m, $bn with three significant figures for display.
// Exact integer values are always available too (title attribute plus a visible
// exact column), because hover is never the only path to a value.

export interface UnitFormat {
  /** e.g. "$1.23m" or "-$450k" */
  display: string;
  /** e.g. "$1,234,000" or "-$450,000" */
  exact: string;
}

function roundToSignificantFigures(n: number, sig: number): number {
  if (n === 0) return 0;
  const magnitude = Math.ceil(Math.log10(Math.abs(n)));
  const power = sig - magnitude;
  const factor = Math.pow(10, power);
  return Math.round(n * factor) / factor;
}

function formatSignificand(n: number): string {
  // Avoid exponential notation and trim needless trailing zeros while keeping
  // at least the integer part.
  if (Number.isInteger(n)) return n.toString();
  return n.toFixed(10).replace(/0+$/, '').replace(/\.$/, '');
}

export function formatExactUsd(value: number): string {
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);
  return `${sign}$${abs.toLocaleString('en-US')}`;
}

const UNITS: Array<{ threshold: number; divisor: number; suffix: string }> = [
  { threshold: 1_000_000_000, divisor: 1_000_000_000, suffix: 'bn' },
  { threshold: 1_000_000, divisor: 1_000_000, suffix: 'm' },
  { threshold: 1_000, divisor: 1_000, suffix: 'k' },
  { threshold: 0, divisor: 1, suffix: '' },
];

export function formatAutoUsd(value: number): UnitFormat {
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);

  let unit = UNITS.find((u) => abs >= u.threshold) ?? UNITS[UNITS.length - 1];
  let rounded = roundToSignificantFigures(abs / unit.divisor, 3);

  // Rounding to 3 significant figures can push the scaled value up to the
  // next unit's threshold (e.g. 999,600 -> 1000k); re-select the unit so the
  // display never shows 4+ significant digits like "1000k".
  const currentIndex = UNITS.indexOf(unit);
  if (currentIndex > 0 && rounded * unit.divisor >= UNITS[currentIndex - 1].threshold) {
    unit = UNITS[currentIndex - 1];
    rounded = roundToSignificantFigures(abs / unit.divisor, 3);
  }

  const display = `${sign}$${formatSignificand(rounded)}${unit.suffix}`;
  const exact = formatExactUsd(value);
  return { display, exact };
}
