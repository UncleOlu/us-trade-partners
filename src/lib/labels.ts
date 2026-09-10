import { SORT_LABELS } from './sorting';

// SORT_LABELS in sorting.ts holds the literal strings (that file must stay import-free;
// see the note there). FLOW_LABELS reuses those same four strings so chart series names
// and table sort labels never drift apart.
export const FLOW_LABELS = {
  imports: SORT_LABELS.imports,
  exports: SORT_LABELS.exports,
  balance: SORT_LABELS.balance,
  total_trade_value: SORT_LABELS.total_trade_value,
} as const;

/** Caps a free-text query (from the URL) at `limit` grapheme clusters for display in
 * headings, appending a single ellipsis character when it was longer. Uses Intl.Segmenter
 * when available so a multi-code-point grapheme (for example an emoji with a modifier) is
 * never split; falls back to counting code points when Intl.Segmenter is unavailable. The
 * full query stays in the field and the URL; only the heading text is capped. */
export function capQuery(query: string, limit = 60): string {
  const chars = typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function'
    ? Array.from(new Intl.Segmenter('en', { granularity: 'grapheme' }).segment(query), (s) => s.segment)
    : Array.from(query);
  return chars.length <= limit ? query : `${chars.slice(0, limit).join('')}…`;
}
