import type { FlowValue, DerivedValue } from '../types/generated';
import { MoneyCell } from './MoneyCell';
type Totals = { imports: FlowValue; exports: FlowValue; balance: DerivedValue; total_trade_value: DerivedValue };
export function TradeTotals({ values }: { values: Totals }): JSX.Element {
  return <div className="stat-cards">{([
    ['imports', 'Imports'], ['exports', 'Exports'], ['balance', 'Balance'], ['total_trade_value', 'Total trade'],
  ] as const).map(([field, label]) => <div className={`stat-card stat-${field}`} key={field}>
    <p className="stat-label">{label}</p><p className="stat-value"><MoneyCell flow={values[field]} showExact={false} interactive /></p>
    {field === 'balance' && <p className="stat-detail">Exports minus imports</p>}
  </div>)}</div>;
}
