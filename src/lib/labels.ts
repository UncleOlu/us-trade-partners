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
