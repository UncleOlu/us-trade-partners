import { Link, Outlet } from 'react-router-dom';
import { GLOBAL_LABEL, SNAPSHOT_ID } from '../lib/config';

export function Layout(): JSX.Element {
  return (
    <div className="app-shell">
      <header className="app-header">
        <nav>
          <Link to="/">Home</Link>
          <Link to="/hub">Hub</Link>
          <Link to="/methodology">Methodology</Link>
        </nav>
      </header>
      <main>
        <Outlet />
      </main>
      <footer className="app-footer">
        <p>
          {GLOBAL_LABEL} <Link to="/methodology">Methodology</Link>
        </p>
        <p>
          <Link to="/hub">Back to hub</Link> &middot; snapshot <code>{SNAPSHOT_ID}</code>
        </p>
      </footer>
    </div>
  );
}
