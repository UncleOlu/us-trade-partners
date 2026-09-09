import { Link, useSearchParams } from 'react-router-dom';
import { contextUrl } from '../lib/urlState';

export function NotFoundPage(): JSX.Element {
  const [params] = useSearchParams();
  return (
    <div className="not-found-page">
      <h1>Page not found</h1>
      <p>
        <Link to={contextUrl('/hub', params)}>Go to the hub</Link>
      </p>
    </div>
  );
}
