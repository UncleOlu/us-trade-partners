import { Link } from 'react-router-dom';

export function NotFoundPage(): JSX.Element {
  return (
    <div className="not-found-page">
      <h1>Page not found</h1>
      <p>
        <Link to="/hub">Go to the hub</Link>
      </p>
    </div>
  );
}
