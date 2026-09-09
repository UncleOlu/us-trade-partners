import { useEffect, useRef } from 'react';
import { NavLink, Link, Outlet, useLocation } from 'react-router-dom';
import { GLOBAL_LABEL, SNAPSHOT_ID } from '../lib/config';
import { contextUrl } from '../lib/urlState';
import { RouteBoundary } from './RouteBoundary';

export function Layout(): JSX.Element {
  const location = useLocation();
  const main = useRef<HTMLElement>(null);
  const previous = useRef(location.pathname);
  const params = new URLSearchParams(location.search);
  useEffect(() => {
    const changed = previous.current !== location.pathname;
    previous.current = location.pathname;
    const title = location.pathname.startsWith('/partner/') ? 'Trade partner' : location.pathname.startsWith('/section/') ? 'Product section' : location.pathname.includes('hub') ? 'Browse trade data' : location.pathname.includes('methodology') ? 'Methodology' : 'Explore trade partners';
    document.title = `${title} | US goods trade`;
    if (changed) { main.current?.focus(); window.scrollTo(0, 0); }
  }, [location.pathname]);
  return <div className="app-shell">
    <a className="skip-link" href="#main-content">Skip to content</a>
    <header className="app-header">
      <Link className="brand" to={contextUrl('/', params)}><span className="brand-mark" aria-hidden="true">US</span><span>Goods trade<span className="brand-subtitle">Partners, products and trends</span></span></Link>
      <nav aria-label="Main navigation">
        <NavLink end to={contextUrl('/', params)}>Explore</NavLink>
        <NavLink to={contextUrl('/hub', params)}>Hub</NavLink>
        <NavLink to={contextUrl('/methodology', params)}>Methodology</NavLink>
      </nav>
    </header>
    <main id="main-content" tabIndex={-1} ref={main}>
      <RouteBoundary key={location.pathname} hubUrl={contextUrl('/hub', params)}><Outlet /></RouteBoundary>
    </main>
    <footer className="app-footer">
      <p>{GLOBAL_LABEL} <Link to={contextUrl('/methodology', params)}>Read the methodology</Link></p>
      <p><Link to={contextUrl('/hub', params)}>Browse all trade data</Link> <span className="snapshot-label">Snapshot <code>{SNAPSHOT_ID}</code></span></p>
    </footer>
  </div>;
}
