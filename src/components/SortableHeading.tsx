import type { TableSort } from '../lib/useTableSort';
import { SORT_LABELS, orderDescription } from '../lib/sorting';

export function SortableHeading({ column, sort, label = SORT_LABELS[column] }: { column: string; sort: TableSort; label?: string }): JSX.Element {
  const active = sort.key === column;
  const next = active && sort.direction === 'asc' ? 'desc' : 'asc';
  return <th scope="col" aria-sort={active ? sort.direction === 'asc' ? 'ascending' : 'descending' : 'none'}>
    <button type="button" className={`sort-heading${['name', 'kind', 'description', 'group', 'chapter'].includes(column) ? ' sort-heading-text' : ''}`} onClick={() => sort.choose(column)} aria-label={`${label}: sort ${orderDescription(column, next)}`}>
      <span className="sort-spacer" aria-hidden="true" /><span>{label}</span><span className="sort-indicator" aria-hidden="true">{active ? sort.direction === 'asc' ? '↑' : '↓' : '↕'}</span>
    </button>
  </th>;
}
export function SortStatus({ sort }: { sort: TableSort }): JSX.Element {
  return <p className="sort-status chart-note" role="status">{SORT_LABELS[sort.key]}: {orderDescription(sort.key, sort.direction)}. Missing values last.</p>;
}
