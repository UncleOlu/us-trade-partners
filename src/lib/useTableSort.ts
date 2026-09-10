import { useSearchParams } from 'react-router-dom';
import { SORT_TABLES, type SortDirection, type SortTable, type SortKey } from './sorting';

export function useTableSort<T extends SortTable>(table: T, defaultKey: SortKey<T>, defaultDirection: SortDirection) {
  const [params, setParams] = useSearchParams();
  const rawKey = params.get(`${table}_sort`);
  const key = (rawKey && (SORT_TABLES[table].keys as readonly string[]).includes(rawKey) ? rawKey : defaultKey) as SortKey<T>;
  const rawDirection = params.get(`${table}_dir`);
  const direction = rawDirection === 'asc' || rawDirection === 'desc' ? rawDirection : defaultDirection;
  const set = (nextKey: string, nextDirection: SortDirection) => {
    setParams((previous) => {
      const next = new URLSearchParams(previous);
      next.set(`${table}_sort`, nextKey); next.set(`${table}_dir`, nextDirection);
      if ((table === 'home' || table === 'section') && ['imports', 'exports', 'balance', 'total_trade_value'].includes(nextKey)) next.set('rank', nextKey);
      return next;
    });
  };
  const choose = (nextKey: string) => set(nextKey, nextKey === key && direction === 'asc' ? 'desc' : 'asc');
  return { key, direction, choose, set };
}
export type TableSort = ReturnType<typeof useTableSort>;
