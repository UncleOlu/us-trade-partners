// Shared filtered-CSV header and row-prefix builders for the home and section pages. Each
// page keeps its own partner headers and partner cell builder (the data shapes and status
// rules differ between the two), but both assemble the filtered export the same way: period
// headers, then query, sort_key, sort_direction, rank_metric, rank, then the partner headers.

import type { CsvCell } from './csv';

export function filteredCsvHeaders(periodHeaders: string[], partnerHeaders: string[]): string[] {
  return [...periodHeaders, 'query', 'sort_key', 'sort_direction', 'rank_metric', 'rank', ...partnerHeaders];
}

export function filteredCsvRowPrefix(
  periodCells: CsvCell[],
  query: string,
  sortKey: string,
  sortDirection: string,
  rankMetric: string,
  rank: CsvCell,
): CsvCell[] {
  return [...periodCells, query, sortKey, sortDirection, rankMetric, rank];
}
