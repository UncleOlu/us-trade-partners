export type SortDirection = 'asc' | 'desc';
export type SortValue = number | string | null | undefined;
export const SORT_TABLES = {
  home: { label: 'Partner table', keys: ['rank', 'name', 'imports', 'exports', 'balance', 'total_trade_value'] },
  section: { label: 'Section partner table', keys: ['rank', 'name', 'kind', 'imports', 'exports', 'balance', 'total_trade_value'] },
  years: { label: 'Trade by year', keys: ['year', 'imports', 'exports', 'balance', 'total_trade_value'] },
  groups: { label: 'Product groups', keys: ['group', 'imports', 'exports', 'total_trade_value'] },
  chapters: { label: 'Chapter details', keys: ['chapter', 'description', 'imports', 'exports', 'total_trade_value'] },
} as const;
export type SortTable = keyof typeof SORT_TABLES;
export const SORT_LABELS: Record<string, string> = {
  rank: 'Rank', name: 'Partner', kind: 'Kind', year: 'Year', group: 'Group order', chapter: 'Chapter', description: 'Description',
  imports: 'Imports', exports: 'Exports', balance: 'Balance', total_trade_value: 'Total trade value',
};
const textOrder = new Intl.Collator('en', { sensitivity: 'base', usage: 'sort' });
const missing = (value: SortValue) => value === null || value === undefined || (typeof value === 'string' && !value.trim());
export function compareValues(a: SortValue, b: SortValue, direction: SortDirection): number {
  if (missing(a) || missing(b)) return missing(a) === missing(b) ? 0 : missing(a) ? 1 : -1;
  const result = typeof a === 'number' && typeof b === 'number' ? (a < b ? -1 : a > b ? 1 : 0) : textOrder.compare(String(a), String(b));
  return direction === 'asc' ? result : -result;
}
export function sortRows<T>(rows: readonly T[], value: (row: T) => SortValue, direction: SortDirection, identity: (row: T) => string): T[] {
  return [...rows].sort((a, b) => compareValues(value(a), value(b), direction) || (identity(a) < identity(b) ? -1 : identity(a) > identity(b) ? 1 : 0));
}
const HS_ORDER = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX', 'XXI', 'SPECIAL'];
export function groupOrder(id: string): number | null { const index = HS_ORDER.indexOf(id); return index < 0 ? null : index; }
export function orderDescription(key: string, direction: SortDirection): string {
  if (['name', 'kind', 'description'].includes(key)) return direction === 'asc' ? 'A to Z' : 'Z to A';
  if (key === 'group') return direction === 'asc' ? 'first to last HS section' : 'last to first HS section';
  return direction === 'asc' ? 'lowest to highest' : 'highest to lowest';
}
export function fieldValue(row: object, key: string): SortValue {
  const value = (row as Record<string, unknown>)[key];
  if (typeof value === 'number' || typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'status' in value && 'value' in value) {
    return (value.status === 'observed' || value.status === 'confirmed_zero') && typeof value.value === 'number' ? value.value : null;
  }
  return null;
}
