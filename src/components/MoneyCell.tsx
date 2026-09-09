import { useState } from 'react';
import type { FlowValue, DerivedValue } from '../types/generated';
import { formatAutoUsd, formatExactUsd } from '../lib/units';
import { statusLabel } from '../lib/status';

interface MoneyCellProps {
  flow: FlowValue | DerivedValue;
  /** When true, shows the exact integer instead of the auto-scaled unit. */
  showExact: boolean;
}

/**
 * Renders one FlowValue/DerivedValue. Usable values show the auto-scaled
 * amount with the exact integer always available via a title attribute (hover
 * or focus) and, when showExact is set, as the visible text too. Non-usable
 * values always show a visible status label and never a numeric 0.
 */
export function MoneyCell({ flow, showExact }: MoneyCellProps): JSX.Element {
  const [expanded, setExpanded] = useState(false);
  if (flow.status === 'observed' || flow.status === 'confirmed_zero') {
    const { display, exact } = formatAutoUsd(flow.value);
    const text = showExact || expanded ? exact : display;
    return (
      <button type="button" className="money-cell money-value" title={exact}
        aria-label={`${text}; ${expanded ? 'show short value' : 'show exact value'}`}
        onClick={() => setExpanded(!expanded)}>
        {text}
        {flow.status === 'confirmed_zero' && <span className="status-tag"> (confirmed zero)</span>}
      </button>
    );
  }

  const reason = flow.reason ?? '';
  return (
    <span className="money-cell money-cell-missing" title={reason} tabIndex={0}>
      {statusLabel(flow.status)}
    </span>
  );
}

export function exactCellForCsv(flow: FlowValue | DerivedValue): number | null {
  return flow.status === 'observed' || flow.status === 'confirmed_zero' ? flow.value : null;
}

export { formatExactUsd };
