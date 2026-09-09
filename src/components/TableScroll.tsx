import { useId, type ReactNode } from 'react';

export function TableScroll({ children, label = 'Trade values' }: { children: ReactNode; label?: string }): JSX.Element {
  const hint = useId();
  return <div className="table-frame">
    <p id={hint} className="table-hint">Scroll horizontally to see all columns. Use Show exact USD to see full dollar amounts.</p>
    <div className="table-scroll" role="region" aria-label={label} aria-describedby={hint} tabIndex={0}>{children}</div>
  </div>;
}
