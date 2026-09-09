import { useId, useState } from 'react';
import type { FlowValue, DerivedValue } from '../types/generated';
import { formatAutoUsd, formatExactUsd } from '../lib/units';
import { statusLabel } from '../lib/status';

export function MoneyCell({ flow, showExact, interactive = false }: { flow: FlowValue | DerivedValue; showExact: boolean; interactive?: boolean }): JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const reasonId = useId();
  if (flow.status === 'observed' || flow.status === 'confirmed_zero') {
    const { display, exact } = formatAutoUsd(flow.value);
    const text = showExact || expanded ? exact : display;
    if (!interactive || showExact) return <span className="money-cell" title={exact}>{text}{flow.status === 'confirmed_zero' && <span className="status-tag"> (confirmed zero)</span>}</span>;
    return <button type="button" className="money-cell money-value" title={exact}
      aria-label={`${text}; ${expanded ? 'show short value' : 'show exact value'}`}
      aria-pressed={expanded} onClick={() => setExpanded(!expanded)}>
      {text}{flow.status === 'confirmed_zero' && <span className="status-tag"> (confirmed zero)</span>}
    </button>;
  }
  return <span className="missing-value">
    <button type="button" className="money-cell money-cell-missing" title={flow.reason ?? ''}
      aria-expanded={expanded} aria-controls={reasonId} onClick={() => setExpanded(!expanded)}>
      {statusLabel(flow.status)} <span aria-hidden="true">{expanded ? '−' : '+'}</span>
    </button>
    {expanded && <span id={reasonId} className="missing-reason">{flow.reason}</span>}
  </span>;
}
export function exactCellForCsv(flow: FlowValue | DerivedValue): number | null {
  return flow.status === 'observed' || flow.status === 'confirmed_zero' ? flow.value : null;
}
export { formatExactUsd };
