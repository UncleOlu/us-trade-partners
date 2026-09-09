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

const RANK_FIELDS: RankField[] = ['total_trade_value', 'balance', 'imports', 'exports'];
const DEFAULT_RANK: RankField = 'total_trade_value';
const DEFAULT_PAGE_SIZE = 25;

const RANK_LABELS: Record<RankField, string> = {
  balance: 'Balance',
  imports: 'Imports',
  exports: 'Exports',
  total_trade_value: 'Total trade value',
};

function parseRankField(raw: string | null): RankField {
  return raw && (RANK_FIELDS as string[]).includes(raw) ? (raw as RankField) : DEFAULT_RANK;
}

function rankValue(row: Summary['partners'][number], field: RankField): number {
  const v = row[field];
  return v.status === 'observed' || v.status === 'confirmed_zero' ? v.value : -Infinity;
}

/**
 * Home route: year slider (URL-driven), rank field (URL-driven, ?rank=),
 * partner search, a ranked partner table below a full-width world map, and
 * summary cards from summary.world only (never a client-side sum across
 * partner rows).
 */
export function HomePage(): JSX.Element {
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState('');
  const [showAll, setShowAll] = useState(false);
  const navigate = useNavigate();

  const metaState = useAsyncData(() => fetchMeta(), []);

  const yearParam = searchParams.get('year');
  const rankField = parseRankField(searchParams.get('rank'));
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

  const hasQuery = query.trim().length > 0;

  // Search always matches across every approved partner, regardless of the
  // default top-25 cutoff below.
  const searched = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ranked;
    return ranked.filter((p) => p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q));
  }, [ranked, query]);

  const displayed = hasQuery || showAll ? searched : searched.slice(0, DEFAULT_PAGE_SIZE);

  const rankByCode = useMemo(() => {
    const map = new Map<string, number>();
    ranked.forEach((p, i) => map.set(p.code, i + 1));
    return map;
  }, [ranked]);

  const onYearIndexChange = (index: number) => {
    if (!configuredYears) return;
    const next = new URLSearchParams(searchParams);
    next.set('year', String(configuredYears[index]));
    setSearchParams(next);
  };

  const onRankChange = (field: RankField) => {
    const next = new URLSearchParams(searchParams);
    if (field === DEFAULT_RANK) {
      next.delete('rank');
    } else {
      next.set('rank', field);
    }
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

      <section aria-label="World map" className="home-map-pane">
        <MapSlot
          year={year}
          summaryPartners={summary.partners}
          partners={partnersState.data.partners}
          selectedCode={null}
          onSelect={(code) => navigate(`/partner/${code}?year=${year}`)}
          basePath={BASE_PATH}
        />
      </section>

      <section className="home-table-pane" aria-label="Ranked partners">
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
          <select id="rank-field" value={rankField} onChange={(e) => onRankChange(e.target.value as RankField)}>
            {RANK_FIELDS.map((f) => (
              <option key={f} value={f}>
                {RANK_LABELS[f]}
              </option>
            ))}
          </select>
        </div>
        <p>
          Showing {displayed.length} of {summary.partners.length} approved partners for {year}, ranked by{' '}
          {RANK_LABELS[rankField].toLowerCase()}.
          {!hasQuery && !showAll && searched.length > DEFAULT_PAGE_SIZE && (
            <>
              {' '}
              <button type="button" className="link-button" onClick={() => setShowAll(true)}>
                Show all {searched.length}
              </button>
            </>
          )}
          {!hasQuery && showAll && (
            <>
              {' '}
              <button type="button" className="link-button" onClick={() => setShowAll(false)}>
                Show top {DEFAULT_PAGE_SIZE}
              </button>
            </>
          )}
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
              {displayed.map((p) => (
                <tr key={p.code}>
                  <td>{rankByCode.get(p.code)}</td>
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
      </section>
    </div>
  );
}
