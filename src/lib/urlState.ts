import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

export const RANK_FIELDS = ['total_trade_value', 'imports', 'exports', 'balance'] as const;
export type RankField = typeof RANK_FIELDS[number];
export const RANK_LABELS: Record<RankField, string> = { total_trade_value: 'Total trade', imports: 'Imports', exports: 'Exports', balance: 'Balance' };

export function contextUrl(path: string, params: URLSearchParams, changes: Record<string, string> = {}): string {
  const next = new URLSearchParams();
  for (const key of ['year', 'rank', ...(path.startsWith('/partner/') ? ['section'] : [])]) {
    const value = params.get(key);
    if (value !== null) next.set(key, value);
  }
  for (const [key, value] of Object.entries(changes)) next.set(key, value);
  return `${path}${next.size ? `?${next}` : ''}`;
}

export function useUrlState(years: number[] | undefined, groups?: string[]) {
  const [params, setParams] = useSearchParams();
  const [noticeState, setNotice] = useState({ message: '', query: '' });
  const rawYear = params.get('year');
  const rawRank = params.get('rank');
  const rawGroup = params.get('section');
  const validYear = rawYear === 'all' || rawYear !== null && /^\d{4}$/.test(rawYear) && years?.includes(Number(rawYear));
  const year = rawYear === 'all' ? (years?.length ? 'all' as const : undefined) : validYear ? Number(rawYear) : years?.[years.length - 1];
  const rank = RANK_FIELDS.includes(rawRank as RankField) ? rawRank as RankField : 'total_trade_value';
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
      next.delete('rank');
      notes.push('The requested ranking is not available. Showing total trade.');
    }
    if (groups && rawGroup !== null && !groups.includes(rawGroup)) {
      if (group) next.set('section', group); else next.delete('section');
      notes.push(`The requested product group is not available.${group ? ` Showing ${group}.` : ''}`);
    }
    if (notes.length) setNotice({ message: notes.join(' '), query: next.toString() });
    else setNotice((previous) => previous.query === query ? previous : { message: '', query });
    if (next.toString() !== query) setParams(next, { replace: true });
    // String keys avoid rerunning the effect for equivalent input arrays.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, yearKey, groupKey]);
  const update = (changes: Record<string, string>) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) next.set(key, value);
    setNotice({ message: '', query: next.toString() });
    setParams(next);
  };
  return { params, year, rank, group, notice: noticeState.message, update };
}
