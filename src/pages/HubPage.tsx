import { Link } from 'react-router-dom';
import { fetchMeta, fetchPartners, fetchHsSections } from '../lib/dataClient';
import { useAsyncData } from '../lib/useAsyncData';
import { Loading } from '../components/Loading';
import { DataError } from '../components/DataError';

/**
 * Placeholder hub route (map of content): links to every partner, section,
 * and year in this snapshot.
 */
export function HubPage(): JSX.Element {
  const metaState = useAsyncData(() => fetchMeta(), []);
  const partnersState = useAsyncData(() => fetchPartners(), []);
  const sectionsState = useAsyncData(() => fetchHsSections(), []);

  if (metaState.status === 'loading' || partnersState.status === 'loading' || sectionsState.status === 'loading') {
    return <Loading label="Loading hub" />;
  }
  if (metaState.status === 'error') return <DataError error={metaState.error} />;
  if (partnersState.status === 'error') return <DataError error={partnersState.error} />;
  if (sectionsState.status === 'error') return <DataError error={sectionsState.error} />;

  const years = metaState.data.configured_coverage.years;
  const latestYear = years[years.length - 1];
  const approvedPartners = partnersState.data.partners
    .filter((p) => p.resolution === 'approved')
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="hub-page">
      <h1>Hub</h1>
      <p>Every partner, HS section, and year in snapshot {metaState.data.snapshot_id}.</p>

      <section aria-labelledby="hub-years">
        <h2 id="hub-years">Years</h2>
        <ul className="hub-list-inline">
          {years.map((y) => (
            <li key={y}>
              <Link to={`/?year=${y}`}>{y}</Link>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="hub-sections">
        <h2 id="hub-sections">HS sections</h2>
        <ul className="hub-list-inline">
          {sectionsState.data.groups.map((g) => (
            <li key={g.id}>
              <Link to={`/section/${g.id}?year=${latestYear}`}>
                {g.id}: {g.name}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="hub-partners">
        <h2 id="hub-partners">Partners ({approvedPartners.length})</h2>
        <ul className="hub-list-columns">
          {approvedPartners.map((p) => (
            <li key={p.code}>
              <Link to={`/partner/${p.code}?year=${latestYear}`}>
                {p.name} ({p.code})
              </Link>
              {p.kind === 'aggregate' && <span className="aggregate-tag"> aggregate</span>}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
