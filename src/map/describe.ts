import { formatAutoUsd } from '../lib/units';
import { statusLabel, isUsable } from '../lib/status';
import type { FlowValue, DerivedValue } from '../types/generated';
import type { MapSummaryPartner } from './types';

function describeValue(v: FlowValue | DerivedValue): string {
  if (isUsable(v)) return formatAutoUsd(v.value).display;
  return statusLabel(v.status);
}

/** One line of text per flow, shared by the tooltip body and the aria-label. */
export function describeFlows(sp: MapSummaryPartner): { imports: string; exports: string; balance: string } {
  return {
    imports: describeValue(sp.imports),
    exports: describeValue(sp.exports),
    balance: describeValue(sp.balance),
  };
}

/**
 * aria-label text for a focusable country: name, imports, exports, balance.
 * Hover is never the only path to a value, so this string carries the same
 * information as the tooltip.
 */
export function ariaLabelFor(name: string, sp: MapSummaryPartner): string {
  const { imports, exports, balance } = describeFlows(sp);
  return `${name}. Imports ${imports}. Exports ${exports}. Balance ${balance}.`;
}
