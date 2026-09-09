import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { fetchMeta, fetchPartners, fetchSummary } from '../lib/dataClient';
import { useAsyncData } from '../lib/useAsyncData';
import { Loading } from '../components/Loading';
import { DataError } from '../components/DataError';
import { MoneyCell } from '../components/MoneyCell';
import { TableScroll } from '../components/TableScroll';
import { MapSlot } from '../components/MapSlot';
import { BASE_PATH } from '../lib/config';
import type { Summary } from '../types/generated';

type RankField = 'balance' | 'imports' | 'exports' | 'total_trade_value';

const RANK_LABELS: Record<RankField, string> = {
  balance: 'Balance',
  imports: 'Imports',
  exports: 'Exports',
  total_trade_value: 'Total trade value',
};

function rankValue(row: Summary['partners'][number], field: RankField): number {
  const v = row[field];
  return v.status === 'observed' || v.status === 'confirmed_zero' ? v.value : -Infinity;
}

/**
 * Home route: year slider (URL-driven), partner search, a ranked partner
 * table next to the world map, and summary cards from summary.world only
 * (never a client-side sum across partner rows).
 */
export function HomePage(): JSX.Element {
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState('');
  const [rankField, setRankField] = useState<RankField>('total_trade_value');
  const navigate = useNavigate();

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
    list.sort((a, b) => rankValue(b, rankField) - rankValue(a, rankField));
    return list;
  }, [summaryState, rankField]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ranked;
    return ranked.filter((p) => p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q));
  }, [ranked, query]);

  const onYearIndexChange = (index: number) => {
    if (!configuredYears) return;
    const next = new URLSearchParams(searchParams);
    next.set('year', String(configuredYears[index]));
    setSearchParams(next);
  };

  if (metaState.status === 'loading' || !year) return <Loading label="Loading" />;
  if (metaState.status === 'error') return <DataError error={metaState.error} />;
  if (summaryState.status === 'loading' || partnersState.status === 'loading') {
    return <Loading label={`Loading ${year}`} />;
  }
  if (summaryState.status === 'error') return <DataError error={summaryState.error} />;
  if (partnersState.status === 'error') return <DataError error={partnersState.error} />;

  const summary = summaryState.data;
  const yearIndex = configuredYears ? configuredYears.indexOf(year) : 0;

  return (
    <div className="home-page">
      <h1>US goods trade partners</h1>

      <div className="controls-row">
        <label htmlFor="year-slider">
          Year: <strong>{year}</strong>
        </label>
        <input
          id="year-slider"
          type="range"
          min={0}
          max={(configuredYears?.length ?? 1) - 1}
          value={Math.max(yearIndex, 0)}
          onChange={(e) => onYearIndexChange(Number(e.target.value))}
          list="year-slider-ticks"
        />
        <datalist id="year-slider-ticks">
          {configuredYears?.map((y) => (
            <option key={y} value={configuredYears.indexOf(y)} label={String(y)} />
          ))}
        </datalist>
      </div>

      <section aria-label="World total" className="world-total-card">
        <h2>World total, {year}</h2>
        <p>From the separately fetched Census world total (summary.world). Never a sum of partner rows.</p>
        <div className="stat-cards">
          <div className="stat-card">
            <p className="stat-label">Imports</p>
            <p className="stat-value">
              <MoneyCell flow={summary.world.imports} showExact={false} />
            </p>
          </div>
          <div className="stat-card">
            <p className="stat-label">Exports</p>
            <p className="stat-value">
              <MoneyCell flow={summary.world.exports} showExact={false} />
            </p>
          </div>
          <div className="stat-card">
            <p className="stat-label">Balance</p>
            <p className="stat-value">
              <MoneyCell flow={summary.world.balance} showExact={false} />
            </p>
          </div>
          <div className="stat-card">
            <p className="stat-label">Total trade value</p>
            <p className="stat-value">
              <MoneyCell flow={summary.world.total_trade_value} showExact={false} />
            </p>
          </div>
        </div>
      </section>

      <div className="home-layout">
        <div className="home-map-pane">
          <MapSlot
            year={year}
            summaryPartners={summary.partners}
            partners={partnersState.data.partners}
            selectedCode={null}
            onSelect={(code) => navigate(`/partner/${code}?year=${year}`)}
            basePath={BASE_PATH}
          />
        </div>

        <div className="home-table-pane">
          <div className="controls-row">
            <label htmlFor="partner-search">Search partners</label>
            <input
              id="partner-search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Name or code"
            />
            <label htmlFor="rank-field">Rank by</label>
            <select id="rank-field" value={rankField} onChange={(e) => setRankField(e.target.value as RankField)}>
              {(Object.keys(RANK_LABELS) as RankField[]).map((f) => (
                <option key={f} value={f}>
                  {RANK_LABELS[f]}
                </option>
              ))}
            </select>
          </div>
          <p>
            {filtered.length} of {summary.partners.length} approved partners shown for {year}, ranked by{' '}
            {RANK_LABELS[rankField].toLowerCase()}.
          </p>

          <TableScroll>
            <table>
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Partner</th>
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
          </TableScroll>
          <p className="chart-note">
            Rows without an observed value for the chosen rank field sort last; absent is never shown as zero.
          </p>
        </div>
      </div>
    </div>
  );
}
