import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { fetchMeta, fetchPartners, fetchSummary } from '../lib/dataClient';
import { useAsyncData } from '../lib/useAsyncData';
import { Loading } from '../components/Loading';
import { DataError } from '../components/DataError';
import { MoneyCell } from '../components/MoneyCell';
import { TableScroll } from '../components/TableScroll';
import { MapSlot } from '../components/MapSlot';
import { TradeTotals } from '../components/TradeTotals';
import { UrlNotice } from '../components/UrlNotice';
import { BASE_PATH, GLOBAL_LABEL } from '../lib/config';
import { contextUrl, RANK_FIELDS, RANK_LABELS, useUrlState } from '../lib/urlState';
import { toCsv, downloadCsv } from '../lib/csv';

export function HomePage(): JSX.Element {
  const [query, setQuery] = useState('');
  const [showExact, setShowExact] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const navigate = useNavigate();
  const metaState = useAsyncData(fetchMeta, []);
  const configuredYears = metaState.status === 'ready' ? metaState.data.configured_coverage.years : undefined;
  const { year, rank, params, notice, update } = useUrlState(configuredYears);
  const summaryState = useAsyncData(() => year ? fetchSummary(year) : Promise.reject(new Error('Select a year')), [year]);
  const partnersState = useAsyncData(fetchPartners, []);
  const ranked = useMemo(() => {
    if (summaryState.status !== 'ready') return [];
    const value = (p: typeof summaryState.data.partners[number]) => p[rank].value ?? -Infinity;
    return [...summaryState.data.partners].sort((a, b) => value(b) - value(a) || a.code.localeCompare(b.code));
  }, [summaryState, rank]);
  const normalizedQuery = query.trim().toLowerCase();
  const matches = useMemo(() => ranked.filter((p) => !normalizedQuery || p.name.toLowerCase().includes(normalizedQuery) || p.code.toLowerCase().includes(normalizedQuery)), [ranked, normalizedQuery]);
  const displayed = normalizedQuery || showAll ? matches : matches.slice(0, 25);
  const ranks = useMemo(() => new Map(ranked.map((p, i) => [p.code, i + 1])), [ranked]);
  if (metaState.status === 'error') return <DataError error={metaState.error} />;
  if (metaState.status === 'loading' || !year) return <Loading label="Loading trade data" />;
  const summary = summaryState.status === 'ready' ? summaryState.data : null;
  const partners = partnersState.status === 'ready' ? partnersState.data : null;
  const download = () => {
    const fields = ['imports', 'exports', 'balance', 'total_trade_value'] as const;
    downloadCsv(`partners_${year}.csv`, toCsv(
      ['code', 'name', 'kind', ...fields.flatMap((field) => [`${field}_status`, `${field}_usd`])],
      ranked.map((p) => [p.code, p.name, p.kind, ...fields.flatMap((field) => [p[field].status, p[field].value ?? ''])]),
    ));
  };
  return <div className="home-page">
    <header className="page-intro"><p className="eyebrow">US trade with the world</p><h1>Explore goods trade</h1>
      <p className="intro-text">Compare trading partners, see the balance, and explore what moves between countries.</p>
      <p className="scope-label">{GLOBAL_LABEL}</p>
    </header>
    <UrlNotice message={notice} />
    <section className="explore-controls panel" aria-label="Explore controls">
      <div className="field year-field"><label htmlFor="home-year-select">Year</label>
        <select id="home-year-select" value={year} onChange={(e) => update({ year: e.target.value })}>
          {configuredYears?.map((y) => <option key={y}>{y}</option>)}
        </select>
      </div>
      <div className="field search-field"><label htmlFor="partner-search">Find a partner</label>
        <input id="partner-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search any partner by name or code" />
      </div>
      <div className="field rank-field"><label htmlFor="rank-field">Rank partner table by</label>
        <select id="rank-field" value={rank} onChange={(e) => update({ rank: e.target.value })}>{RANK_FIELDS.map((f) => <option key={f} value={f}>{RANK_LABELS[f]}</option>)}</select>
      </div>
      <div className="year-range"><label htmlFor="year-slider">Move through years</label>
        <span>{configuredYears?.[0]}</span><input id="year-slider" type="range" min={0} max={(configuredYears?.length ?? 1) - 1}
          aria-valuetext={String(year)} value={configuredYears?.indexOf(year) ?? 0}
          onChange={(e) => update({ year: String(configuredYears?.[Number(e.target.value)]) })} /><span>{configuredYears?.at(-1)}</span>
      </div>
      <div className="search-feedback"><span role="status">{summaryState.status === 'error' || partnersState.status === 'error' ? `Data for ${year} is unavailable` : !summary ? `Loading ${year} data` : normalizedQuery ? `${matches.length} matching partners` : `${ranked.length} partners available`}</span>
        <a href="#partner-results">View results ↓</a>
        {normalizedQuery && matches.length === 1 && <Link to={contextUrl(`/partner/${matches[0].code}`, params)}>Open {matches[0].name}</Link>}
      </div>
    </section>
    {summaryState.status === 'error' ? <DataError error={summaryState.error} /> : partnersState.status === 'error' ? <DataError error={partnersState.error} /> : !summary || !partners ? <Loading label={`Loading ${year} results`} /> : <>
    <section aria-label="World total" className="world-total-card">
      <div className="section-heading-row"><h2>World total <span className="heading-year">{year}</span></h2><p>All partners. Unchanged by search or ranking.</p></div>
      <TradeTotals values={summary.world} />
    </section>
    <section aria-label="World map" className="home-map-pane panel">
      <div className="section-heading-row"><div><p className="eyebrow">Geographic view</p><h2>Trade balance by partner</h2></div><span className="year-badge">{year}</span></div>
      <MapSlot year={year} summaryPartners={summary.partners} partners={partners.partners} selectedCode={null}
        onSelect={(code) => navigate(contextUrl(`/partner/${code}`, params))} basePath={BASE_PATH} />
    </section>
    <section id="partner-results" tabIndex={-1} className="home-table-pane panel" aria-label="Ranked partners">
      <div className="section-heading-row"><div><p className="eyebrow">Partner comparison</p><h2>Partners ranked by {RANK_LABELS[rank].toLowerCase()}</h2></div><button type="button" onClick={download}>Download all partners CSV</button></div>
      <div className="results-toolbar"><label className="exact-toggle"><input type="checkbox" checked={showExact} onChange={(e) => setShowExact(e.target.checked)} />Show exact USD</label><p role="status">Showing <strong>{displayed.length}</strong> of {ranked.length} partners for {year}{normalizedQuery ? ` (${matches.length} match your search)` : ''}.</p>
        {!normalizedQuery && <button type="button" className="secondary-button" onClick={() => setShowAll(!showAll)}>{showAll ? 'Show top 25' : `Show all ${ranked.length}`}</button>}
        {normalizedQuery && <button type="button" onClick={() => setQuery('')}>Clear search</button>}
      </div>
      {matches.length === 0 ? <div className="empty-state"><h3>No partners match “{query}”</h3><p>Try another name or a Census partner code.</p></div> : <TableScroll label={`Partner ranking for ${year}`}>
        <table><thead><tr><th scope="col">Rank</th><th scope="col">Partner</th><th scope="col">Imports</th><th scope="col">Exports</th><th scope="col">Balance</th><th scope="col">Total trade</th></tr></thead>
          <tbody>{displayed.map((p) => <tr key={p.code}><td>{ranks.get(p.code)}</td><th scope="row"><Link to={contextUrl(`/partner/${p.code}`, params)}>{p.name}</Link> <span className="partner-code">{p.code}</span>{p.kind === 'aggregate' && <span className="aggregate-tag">aggregate</span>}</th>
            <td><MoneyCell flow={p.imports} showExact={showExact} /></td><td><MoneyCell flow={p.exports} showExact={showExact} /></td><td><MoneyCell flow={p.balance} showExact={showExact} /></td><td><MoneyCell flow={p.total_trade_value} showExact={showExact} /></td></tr>)}</tbody>
        </table></TableScroll>}
      <p className="chart-note">Missing values sort last. The EU is an aggregate and overlaps its member countries. Do not add all displayed rows.</p>
    </section>
    </>}
  </div>;
}
