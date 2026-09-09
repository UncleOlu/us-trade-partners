import type { ReactNode } from 'react';

/**
 * Wraps a <table> in its own horizontal-scroll container. A table must never
 * be clipped at the viewport edge on mobile: it scrolls inside this box
 * instead of the columns being squeezed to fit (which was the earlier,
 * broken behavior). Applies to every table on every page.
 */
export function TableScroll({ children }: { children: ReactNode }): JSX.Element {
  return <div className="table-scroll">{children}</div>;
}
