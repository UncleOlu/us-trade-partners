import { useMemo, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { useSearchParam } from './useSearchParam';

interface PartnerListItem {
  code: string;
  name: string;
}

export interface PartnerListOptions<T extends PartnerListItem> {
  paramKey: string;
  sorted: T[];
  limit?: number;
}

export interface PartnerListState<T extends PartnerListItem> {
  query: string;
  search: ReturnType<typeof useSearchParam>;
  normalizedQuery: string;
  matches: T[];
  displayed: T[];
  showAll: boolean;
  setShowAll: (value: boolean) => void;
  inputRef: RefObject<HTMLInputElement>;
  resetSearch: () => void;
}

/**
 * Shared partner-list search and pagination state used by the home and section pages: a
 * paramKey-backed search box, a case-insensitive name-or-code filter over the caller's
 * already-ranked-and-sorted rows, the default 25-row slice with a Show all toggle, and a
 * focus-returning reset.
 */
export function usePartnerList<T extends PartnerListItem>(options: PartnerListOptions<T>): PartnerListState<T> {
  const { paramKey, sorted, limit = 25 } = options;
  const search = useSearchParam(paramKey);
  const query = search.value;
  const inputRef = useRef<HTMLInputElement>(null);
  const [showAll, setShowAll] = useState(false);
  const resetSearch = () => {
    search.clear();
    inputRef.current?.focus();
  };
  const normalizedQuery = query.trim().toLowerCase();
  const matches = useMemo(
    () => sorted.filter((p) => !normalizedQuery || p.name.toLowerCase().includes(normalizedQuery) || p.code.toLowerCase().includes(normalizedQuery)),
    [sorted, normalizedQuery],
  );
  const displayed = normalizedQuery || showAll ? matches : matches.slice(0, limit);
  return { query, search, normalizedQuery, matches, displayed, showAll, setShowAll, inputRef, resetSearch };
}
