export type Period = number | 'all';

/**
 * Parse a raw `year` URL param against the configured coverage years.
 * With no coverage the period is undefined (data has not loaded yet).
 * `all` is always valid once coverage exists. A four-digit year is valid
 * only when it is present in coverage. Anything else falls back to the
 * latest coverage year, marked invalid so callers can show a notice.
 */
export function parsePeriod(raw: string | null, coverage?: number[]): { period: Period | undefined; valid: boolean } {
  if (!coverage || !coverage.length) return { period: undefined, valid: false };
  if (raw === 'all') return { period: 'all', valid: true };
  if (raw !== null && /^\d{4}$/.test(raw)) {
    const year = Number(raw);
    if (coverage.includes(year)) return { period: year, valid: true };
  }
  const latest = coverage.reduce((max, year) => (year > max ? year : max), coverage[0]);
  return { period: latest, valid: false };
}
