import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { fetchMeta, fetchPartners, fetchHsSections } from '../lib/dataClient';
import { useAsyncData } from '../lib/useAsyncData';
import { Loading } from '../components/Loading';
import { DataError } from '../components/DataError';
import type { Partners } from '../types/generated';

type PartnerRow = Partners['partners'][number];

const KIND_ORDER = ['country', 'territory', 'special', 'aggregate'] as const;
const KIND_LABELS: Record<(typeof KIND_ORDER)[number], string> = {
  country: 'Countries',
  territory: 'Territories',
  special: 'Special codes',
  aggregate: 'Aggregates',
};

/**
 * Hub route (map of content): links to every partner (grouped by kind), every
 * HS section, every year, and the methodology page. Every page links back to
 * the hub.
 */
export function HubPage(): JSX.Element {
  const metaState = useAsyncData(() => fetchMeta(), []);
  const partnersState = useAsyncData(() => fetchPartners(), []);
  const sectionsState = useAsyncData(() => fetchHsSections(), []);

  const grouped = useMemo(() => {
    if (partnersState.status !== 'ready') return null;
    const approved = partnersState.data.partners.filter((p) => p.resolution === 'approved');
    const byKind = new Map<string, PartnerRow[]>();
    for (const kind of KIND_ORDER) byKind.set(kind, []);
    for (const p of approved) {
      const list = byKind.get(p.kind) ?? [];
      list.push(p);
      byKind.set(p.kind, list);
    }
    for (const list of byKind.values()) list.sort((a, b) => a.name.localeCompare(b.name));
    return byKind;
  }, [partnersState]);

  if (metaState.status === 'loading' || partnersState.status === 'loading' || sectionsState.status === 'loading') {
    return <Loading label="Loading hub" />;
  }
  if (metaState.status === 'error') return <DataError error={metaState.error} />;
  if (partnersState.status === 'error') return <DataError error={partnersState.error} />;
  if (sectionsState.status === 'error') return <DataError error={sectionsState.error} />;
  if (!grouped) return <Loading label="Loading hub" />;

  const years = metaState.data.configured_coverage.years;
  const latestYear = years[years.length - 1];
  const totalApproved = [...grouped.values()].reduce((sum, list) => sum + list.length, 0);

  return (
    <div className="hub-page">
      <h1>Hub</h1>
      <p>Every partner, HS section, year, and the methodology page, in snapshot {metaState.data.snapshot_id}.</p>

      <section aria-labelledby="hub-methodology">
        <h2 id="hub-methodology">Methodology</h2>
        <p>
          <Link to="/methodology">Methodology: definitions, EU rules, value status labels, snapshot and source dates</Link>
        </p>
      </section>

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
        <h2 id="hub-sections">HS sections ({sectionsState.data.groups.length})</h2>
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
        <h2 id="hub-partners">Partners ({totalApproved})</h2>
        {KIND_ORDER.map((kind) => {
          const list = grouped.get(kind) ?? [];
          if (list.length === 0) return null;
          return (
            <div key={kind} className="hub-kind-group">
              <h3>
                {KIND_LABELS[kind]} ({list.length})
              </h3>
              <ul className="hub-list-columns">
                {list.map((p) => (
                  <li key={p.code}>
                    <Link to={`/partner/${p.code}?year=${latestYear}`}>
                      {p.name} ({p.code})
                    </Link>
                    {p.kind === 'aggregate' && <span className="aggregate-tag"> aggregate</span>}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </section>
    </div>
  );
}
