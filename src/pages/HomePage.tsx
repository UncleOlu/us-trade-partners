import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { fetchMeta, fetchPartners, fetchSummary } from '../lib/dataClient';
import { useAsyncData } from '../lib/useAsyncData';
import { Loading } from '../components/Loading';
import { DataError } from '../components/DataError';
import { MoneyCell } from '../components/MoneyCell';
import { isUsable } from '../lib/status';

/**
 * Placeholder home route for BUILD ORDER step 4: loads summary/<year>.json and
 * partners.json, renders the ranked partner table and search. The world map
 * is Agent C's (src/map/) and is added in a later step.
 */
export function HomePage(): JSX.Element {
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState('');

  const metaState = useAsyncData(() => fetchMeta(), []);

  const yearParam = searchParams.get('year');
  const configuredYears = metaState.status === 'ready' ? metaState.data.configured_coverage.years : null;
  const latestYear = configuredYears ? configuredYears[configuredYears.length - 1] : null;

  useEffect(() => {
    if (!yearParam && latestYear) {
      const next = new URLSearchParams(searchParams);
      next.set('year', String(latestYear));
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yearParam, latestYear]);

  const year = yearParam ? Number(yearParam) : latestYear;

  const summaryState = useAsyncData(() => {
    if (!year) return Promise.reject(new Error('no year selected yet'));
    return fetchSummary(year);
  }, [year]);

  const partnersState = useAsyncData(() => fetchPartners(), []);

  const ranked = useMemo(() => {
    if (summaryState.status !== 'ready') return [];
    const list = [...summaryState.data.partners];
    list.sort((a, b) => {
      const av = a.total_trade_value.status === 'observed' ? a.total_trade_value.value : -Infinity;
      const bv = b.total_trade_value.status === 'observed' ? b.total_trade_value.value : -Infinity;
      return bv - av;
    });
    return list;
  }, [summaryState]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ranked;
    return ranked.filter((p) => p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q));
  }, [ranked, query]);

  if (metaState.status === 'loading' || !year) return <Loading label="Loading" />;
  if (metaState.status === 'error') return <DataError error={metaState.error} />;
  if (summaryState.status === 'loading' || partnersState.status === 'loading') {
    return <Loading label={`Loading ${year}`} />;
  }
  if (summaryState.status === 'error') return <DataError error={summaryState.error} />;
  if (partnersState.status === 'error') return <DataError error={partnersState.error} />;

  const summary = summaryState.data;
  const totalPartnerRecords = partnersState.data.partners.length;

  return (
    <div className="home-page">
      <h1>US goods trade partners</h1>
      <p>
        {filtered.length} of {summary.partners.length} approved partners shown for {year} ({totalPartnerRecords}{' '}
        codes recorded in partners.json, approved and excluded).
      </p>

      <section aria-label="World total" className="world-total-card">
        <h2>World total, {year}</h2>
        <p>From the separately fetched Census world total. Never a sum of partner rows.</p>
        <dl className="world-total-grid">
          <dt>Imports</dt>
          <dd>
            <MoneyCell flow={summary.world.imports} showExact={false} />
          </dd>
          <dt>Exports</dt>
          <dd>
            <MoneyCell flow={summary.world.exports} showExact={false} />
          </dd>
          <dt>Balance</dt>
          <dd>
            <MoneyCell flow={summary.world.balance} showExact={false} />
          </dd>
          <dt>Total trade value</dt>
          <dd>
            <MoneyCell flow={summary.world.total_trade_value} showExact={false} />
          </dd>
        </dl>
      </section>

      <div className="controls-row">
        <label htmlFor="partner-search">Search partners</label>
        <input
          id="partner-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Name or code"
        />
      </div>

      <table>
        <thead>
          <tr>
            <th>Rank</th>
            <th>Partner</th>
            <th>Kind</th>
            <th>Imports</th>
            <th>Exports</th>
            <th>Balance</th>
            <th>Total trade value</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((p, i) => (
            <tr key={p.code}>
              <td>{i + 1}</td>
              <td>
                <Link to={`/partner/${p.code}?year=${year}`}>{p.name}</Link>{' '}
                <span className="partner-code">({p.code})</span>
                {p.kind === 'aggregate' && <span className="aggregate-tag"> aggregate</span>}
              </td>
              <td>{p.kind}</td>
              <td>
                <MoneyCell flow={p.imports} showExact={false} />
              </td>
              <td>
                <MoneyCell flow={p.exports} showExact={false} />
              </td>
              <td>
                <MoneyCell flow={p.balance} showExact={false} />
              </td>
              <td>
                <MoneyCell flow={p.total_trade_value} showExact={false} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {filtered.every((p) => isUsable(p.total_trade_value)) ? null : (
        <p className="chart-note">
          Rows without an observed total trade value sort last; absent is never shown as zero.
        </p>
      )}
    </div>
  );
}
