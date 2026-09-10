import { useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { fetchMeta, fetchPartners, fetchSummary, fetchAllSummary } from '../lib/dataClient';
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
import { periodLabel, periodCsv, type SummaryView } from '../lib/aggregate';
import { PeriodNote } from '../components/PeriodNote';
import { useTableSort } from '../lib/useTableSort';
import { sortRows, fieldValue } from '../lib/sorting';
import { SortableHeading, SortStatus } from '../components/SortableHeading';
import { toCsv, downloadCsv } from '../lib/csv';
import { useSearchParam } from '../lib/useSearchParam';

export function HomePage(): JSX.Element {
  const search = useSearchParam('home_q');
  const query = search.value;
  const searchInputRef = useRef<HTMLInputElement>(null);
  const resetSearch = () => {
    search.clear();
    searchInputRef.current?.focus();
  };
  const [showExact, setShowExact] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const navigate = useNavigate();
  const metaState = useAsyncData(fetchMeta, []);
  const configuredYears = metaState.status === 'ready' ? metaState.data.configured_coverage.years : undefined;
  const { year, rank, params, notice, update } = useUrlState(configuredYears);
  const sort = useTableSort('home', rank, 'desc');
  const summaryState = useAsyncData<SummaryView>(async () => {
    if (!year) throw new Error('Select a year');
    const view = year === 'all' ? await fetchAllSummary() : await fetchSummary(year);
    if (view.year === 'all' && view.years.join(',') !== configuredYears?.join(',')) throw new Error('All-years coverage does not match this snapshot.');
    return view;
  }, [year, configuredYears?.join(',')]);
  const partnersState = useAsyncData(fetchPartners, []);
  const ranked = useMemo(() => {
    if (summaryState.status !== 'ready') return [];
    return sortRows(summaryState.data.partners, (p) => fieldValue(p, rank), 'desc', (p) => p.code);
  }, [summaryState, rank]);
  const ranks = useMemo(() => new Map(ranked.filter((p) => p[rank].value !== null).map((p, i) => [p.code, i + 1])), [ranked, rank]);
  const sorted = useMemo(() => sortRows(ranked, (p) => sort.key === 'rank' ? ranks.get(p.code) : fieldValue(p, sort.key), sort.direction, (p) => p.code), [ranked, ranks, sort.key, sort.direction]);
  const normalizedQuery = query.trim().toLowerCase();
  const matches = useMemo(() => sorted.filter((p) => !normalizedQuery || p.name.toLowerCase().includes(normalizedQuery) || p.code.toLowerCase().includes(normalizedQuery)), [sorted, normalizedQuery]);
  const displayed = normalizedQuery || showAll ? matches : matches.slice(0, 25);
  if (metaState.status === 'error') return <DataError error={metaState.error} />;
  if (metaState.status === 'loading' || !year) return <Loading label="Loading trade data" />;
  const summary = summaryState.status === 'ready' ? summaryState.data : null;
  const partners = partnersState.status === 'ready' ? partnersState.data : null;
  const label = periodLabel(year, configuredYears!);
  const csvPeriod = periodCsv(year, configuredYears!);
  const fields = ['imports', 'exports', 'balance', 'total_trade_value'] as const;
  const download = () => {
    downloadCsv(`partners_${year}.csv`, toCsv(
      [...csvPeriod.headers, 'code', 'name', 'kind', ...fields.flatMap((field) => [`${field}_status`, `${field}_usd`])],
      sorted.map((p) => [...csvPeriod.cells, p.code, p.name, p.kind, ...fields.flatMap((field) => [p[field].status, p[field].value ?? ''])]),
    ));
  };
  const downloadFiltered = () => {
    downloadCsv(`partners_${year}_filtered.csv`, toCsv(
      [...csvPeriod.headers, 'query', 'sort_key', 'sort_direction', 'rank_metric', 'rank', 'code', 'name', 'kind', ...fields.flatMap((field) => [`${field}_status`, `${field}_usd`])],
      matches.map((p) => [...csvPeriod.cells, query.trim(), sort.key, sort.direction, rank, ranks.get(p.code) ?? '', p.code, p.name, p.kind, ...fields.flatMap((field) => [p[field].status, p[field].value ?? ''])]),
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
          <option value="all">{periodLabel('all', configuredYears!)}</option>{configuredYears?.map((y) => <option key={y}>{y}</option>)}
        </select>
      </div>
      <div className="field search-field"><label htmlFor="partner-search">Find a partner</label>
        <input id="partner-search" ref={searchInputRef} type="search" value={query} onChange={(e) => search.setValue(e.target.value)} placeholder="Search any partner by name or code" />
      </div>
      <div className="field rank-field"><label htmlFor="rank-field">Rank partner table by</label>
        <select id="rank-field" value={rank} onChange={(e) => sort.set(e.target.value, 'desc')}>{RANK_FIELDS.map((f) => <option key={f} value={f}>{RANK_LABELS[f]}</option>)}</select>
      </div>
      <div className="year-range"><label htmlFor="year-slider">Move through years</label>
        <span>{configuredYears?.[0]}</span><input id="year-slider" type="range" min={0} max={(configuredYears?.length ?? 1) - 1}
          disabled={year === 'all'} aria-valuetext={year === 'all' ? 'All years selected' : String(year)} value={year === 'all' ? (configuredYears?.length ?? 1) - 1 : configuredYears?.indexOf(year) ?? 0}
          onChange={(e) => update({ year: String(configuredYears?.[Number(e.target.value)]) })} /><span>{configuredYears?.at(-1)}</span>
      </div>
      {year === 'all' && <p className="slider-note chart-note">Select a single year to use the year slider.</p>}
      <div className="search-feedback"><span role="status">{summaryState.status === 'error' || partnersState.status === 'error' ? `Data for ${year} is unavailable` : !summary ? `Loading ${year} data` : normalizedQuery ? `${matches.length} matching partners` : `${ranked.length} partners available`}</span>
        <a href="#partner-results">View results ↓</a>
        {normalizedQuery && matches.length === 1 && <Link to={contextUrl(`/partner/${matches[0].code}`, params)}>Open {matches[0].name}</Link>}
      </div>
    </section>
    {year === 'all' && <PeriodNote />}
    {summaryState.status === 'error' ? <DataError error={summaryState.error} /> : partnersState.status === 'error' ? <DataError error={partnersState.error} /> : !summary || !partners ? <Loading label={`Loading ${year} results`} /> : <>
    <section aria-label="World total" className="world-total-card">
      <div className="section-heading-row"><h2>World total <span className="heading-year">{label}</span></h2><p>All partners. Unchanged by search or ranking.</p></div>
      <TradeTotals values={summary.world} />
    </section>
    <section aria-label="World map" className="home-map-pane panel">
      <div className="section-heading-row"><div><p className="eyebrow">Geographic view</p><h2>Trade balance by partner</h2></div><span className="year-badge">{label}</span></div>
      <MapSlot year={year} periodLabel={label} summaryPartners={summary.partners} partners={partners.partners} selectedCode={null}
        onSelect={(code) => navigate(contextUrl(`/partner/${code}`, params))} basePath={BASE_PATH} />
    </section>
    <section id="partner-results" tabIndex={-1} className="home-table-pane panel" aria-label="Ranked partners">
      <div className="section-heading-row"><div><p className="eyebrow">Partner comparison</p><h2>Partners</h2></div>
        <button type="button" onClick={download}>Download all partners CSV</button>
        {normalizedQuery && <button type="button" onClick={downloadFiltered}>Download filtered results CSV</button>}
      </div>
      <div className="results-toolbar"><label className="exact-toggle"><input type="checkbox" checked={showExact} onChange={(e) => setShowExact(e.target.checked)} />Show exact USD</label><p role="status">Showing <strong>{displayed.length}</strong> of {ranked.length} partners for {label}{normalizedQuery ? ` (${matches.length} match your search)` : ''}.</p>
        {!normalizedQuery && <button type="button" className="secondary-button" onClick={() => setShowAll(!showAll)}>{showAll ? 'Show first 25' : `Show all ${ranked.length}`}</button>}
        {normalizedQuery && <button type="button" onClick={resetSearch}>Clear search</button>}
      </div>
      <SortStatus sort={sort} />
      <p className="chart-note">Rank 1 has the largest {RANK_LABELS[rank].toLowerCase()}, regardless of row order.</p>
      {matches.length === 0 ? <div className="empty-state"><h3>No partners match “{query}”</h3><p>Try another name or a Census partner code.</p><button type="button" onClick={resetSearch}>Clear search</button></div> : <TableScroll label={`Partner ranking for ${label}`}>
        <table className="home-ranking-table"><thead><tr>{['rank', 'name', 'imports', 'exports', 'balance', 'total_trade_value'].map((column) => <SortableHeading key={column} column={column} sort={sort} />)}</tr></thead>
          <tbody>{displayed.map((p) => <tr key={p.code}><td>{ranks.get(p.code) ?? 'Not ranked'}</td><th scope="row"><Link to={contextUrl(`/partner/${p.code}`, params)}>{p.name}</Link> <span className="partner-code">{p.code}</span>{p.kind === 'aggregate' && <span className="aggregate-tag">aggregate</span>}</th>
            <td><MoneyCell flow={p.imports} showExact={showExact} /></td><td><MoneyCell flow={p.exports} showExact={showExact} /></td><td><MoneyCell flow={p.balance} showExact={showExact} /></td><td><MoneyCell flow={p.total_trade_value} showExact={showExact} /></td></tr>)}</tbody>
        </table></TableScroll>}
      <p className="chart-note">Missing values sort last. The EU is an aggregate and overlaps its member countries. Do not add all displayed rows.</p>
    </section>
    </>}
  </div>;
}
