import { useEffect, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';

import { SORT_TABLES, type SortTable } from './sorting';
import { parsePeriod } from './period';

export const SEARCH_PARAMS = ['home_q', 'hub_q', 'hub_sections_q'] as const;

export const RANK_FIELDS = ['total_trade_value', 'imports', 'exports', 'balance'] as const;
export type RankField = typeof RANK_FIELDS[number];
export const RANK_LABELS: Record<RankField, string> = { total_trade_value: 'Total trade', imports: 'Imports', exports: 'Exports', balance: 'Balance' };

export function contextUrl(path: string, params: URLSearchParams, changes: Record<string, string> = {}): string {
  const next = new URLSearchParams();
  for (const key of ['year', 'rank', ...(path.startsWith('/partner/') ? ['section'] : []), ...Object.keys(SORT_TABLES).flatMap((table) => [`${table}_sort`, `${table}_dir`]), ...SEARCH_PARAMS]) {
    const value = params.get(key);
    if (value !== null) next.set(key, value);
  }
  for (const [key, value] of Object.entries(changes)) next.set(key, value);
  const targetTable = path === '/' ? 'home' : path.startsWith('/section/') ? 'section' : null;
  const targetSort = targetTable ? next.get(`${targetTable}_sort`) : null;
  if (RANK_FIELDS.includes(targetSort as RankField)) next.set('rank', targetSort!);
  return `${path}${next.size ? `?${next}` : ''}`;
}

export function useUrlState(years: number[] | undefined, groups?: string[]) {
  const [params, setParams] = useSearchParams();
  const { pathname } = useLocation();
  const [noticeState, setNotice] = useState({ message: '', query: '' });
  const rawYear = params.get('year');
  const rawRank = params.get('rank');
  const rawGroup = params.get('section');
  const { period: year, valid: validYear } = parsePeriod(rawYear, years);
  const activeTable = pathname === '/' ? 'home' : pathname.startsWith('/section/') ? 'section' : null;
  const rawSort = activeTable ? params.get(`${activeTable}_sort`) : null;
  const rank = RANK_FIELDS.includes(rawSort as RankField) ? rawSort as RankField : RANK_FIELDS.includes(rawRank as RankField) ? rawRank as RankField : 'total_trade_value';
  const group = groups?.includes(rawGroup ?? '') ? rawGroup : groups?.[0] ?? null;
  const query = params.toString();
  const yearKey = years?.join(',');
  const groupKey = groups?.join(',');
  useEffect(() => {
    if (!years?.length || year === undefined) return;
    const next = new URLSearchParams(query);
    const notes: string[] = [];
    if (!validYear) {
      next.set('year', String(year));
      if (rawYear !== null) notes.push(`The requested year is not available. Showing ${year}.`);
    }
    if (rawRank !== null && !RANK_FIELDS.includes(rawRank as RankField)) {
      next.set('rank', rank);
      notes.push(`The requested ranking is not available. Showing ${RANK_LABELS[rank].toLowerCase()}.`);
    }
    if (RANK_FIELDS.includes(rawSort as RankField) && rawRank !== rank) {
      next.set('rank', rank);
      if (rawRank !== null) notes.push(`Rank uses ${RANK_LABELS[rank].toLowerCase()} to match the selected numeric sort.`);
    }
    for (const table of Object.keys(SORT_TABLES) as SortTable[]) {
      const key = next.get(`${table}_sort`);
      const direction = next.get(`${table}_dir`);
      if (key !== null && !(SORT_TABLES[table].keys as readonly string[]).includes(key)) {
        next.delete(`${table}_sort`); next.delete(`${table}_dir`);
        notes.push(`${SORT_TABLES[table].label}: the requested sort is not available. Using the default order.`);
      } else if (direction !== null && direction !== 'asc' && direction !== 'desc') {
        next.delete(`${table}_dir`);
        notes.push(`${SORT_TABLES[table].label}: the requested sort direction is not available. Using the default direction.`);
      }
    }
    if (groups && rawGroup !== null && !groups.includes(rawGroup)) {
      if (group) next.set('section', group); else next.delete('section');
      notes.push(`The requested product group is not available.${group ? ` Showing ${group}.` : ''}`);
    }
    if (notes.length) setNotice({ message: notes.join(' '), query: next.toString() });
    else setNotice((previous) => previous.query === query ? previous : { message: '', query });
    if (next.toString() !== query) setParams((previous) => {
      const merged = new URLSearchParams(previous);
      const original = new URLSearchParams(query);
      for (const key of new Set([...original.keys(), ...next.keys()])) {
        if (next.get(key) === original.get(key)) continue;
        const value = next.get(key);
        if (value === null) merged.delete(key); else merged.set(key, value);
      }
      return merged;
    }, { replace: true });
    // String keys avoid rerunning the effect for equivalent input arrays.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, yearKey, groupKey, pathname]);
  const update = (changes: Record<string, string>) => {
    setNotice({ message: '', query: '' });
    setParams((previous) => {
      const next = new URLSearchParams(previous);
      for (const [key, value] of Object.entries(changes)) next.set(key, value);
      return next;
    });
  };
  return { params, year, rank, group, notice: noticeState.message, update };
}
