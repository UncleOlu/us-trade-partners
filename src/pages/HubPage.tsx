import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchMeta, fetchPartners, fetchHsSections } from '../lib/dataClient';
import { useAsyncData } from '../lib/useAsyncData';
import { contextUrl, useUrlState } from '../lib/urlState';
import { periodLabel } from '../lib/aggregate';
import { SECTION_LABELS } from '../lib/sectionLabels';
import { Loading } from '../components/Loading';
import { DataError } from '../components/DataError';
import { UrlNotice } from '../components/UrlNotice';

export function HubPage(): JSX.Element {
  const [query, setQuery] = useState('');
  const [sectionQuery, setSectionQuery] = useState('');
  const meta = useAsyncData(fetchMeta, []);
  const partners = useAsyncData(fetchPartners, []);
  const sections = useAsyncData(fetchHsSections, []);
  const years = meta.status === 'ready' ? meta.data.configured_coverage.years : undefined;
  const { params, year, notice, update } = useUrlState(years);
  const approved = useMemo(() => partners.status === 'ready' ? partners.data.partners.filter((p) => p.resolution === 'approved').sort((a, b) => a.name.localeCompare(b.name)) : [], [partners]);
  const matches = approved.filter((p) => `${p.name} ${p.code}`.toLowerCase().includes(query.trim().toLowerCase()));
  if (meta.status === 'error') return <DataError error={meta.error} />;
  if (partners.status === 'error') return <DataError error={partners.error} />;
  if (sections.status === 'error') return <DataError error={sections.error} />;
  if (meta.status === 'loading' || partners.status === 'loading' || sections.status === 'loading' || !year) return <Loading label="Loading hub" />;
  const matchingSections = sections.data.groups.filter((g) => `${g.id} ${SECTION_LABELS[g.id] ?? ''} ${g.name} ${g.chapters.join(' ')}`.toLowerCase().includes(sectionQuery.trim().toLowerCase()));
  return <div className="hub-page">
    <header className="page-intro"><p className="eyebrow">The data directory</p><h1>Browse partners and products</h1><p className="intro-text">A direct route to every partner, product group and year.</p></header>
    <UrlNotice message={notice} />
    <section className="panel hub-controls" aria-label="Browse controls"><div className="field"><label htmlFor="hub-year-select">Year for all links</label><select id="hub-year-select" value={year} onChange={(e) => update({ year: e.target.value })}><option value="all">{periodLabel('all', years!)}</option>{years?.map((y) => <option key={y}>{y}</option>)}</select></div>
      <nav className="jump-links" aria-label="Hub sections"><a href="#hub-partners">Partners</a><a href="#hub-sections">Product groups</a><a href="#hub-years">Years</a><Link to={contextUrl('/methodology', params)}>Methodology</Link></nav>
    </section>
    <section id="hub-partners" className="panel" aria-labelledby="hub-partner-title"><div className="section-heading-row"><div><p className="eyebrow">Choose a trading partner</p><h2 id="hub-partner-title">Partners</h2></div><span className="count-badge">{approved.length} in this snapshot</span></div>
      <div className="field"><label htmlFor="hub-partner-search">Search partners</label><input id="hub-partner-search" type="search" placeholder="Name or Census code" value={query} onChange={(e) => setQuery(e.target.value)} /></div>
      <p role="status" className="chart-note">Showing {matches.length} of {approved.length} partners.</p>
      {!matches.length && <div className="empty-state"><h3>No matching partners</h3><button onClick={() => setQuery('')}>Clear search</button></div>}
      <ul className="partner-directory">{matches.map((p) => <li key={p.code}><Link to={contextUrl(`/partner/${p.code}`, params)}><span>{p.name}</span><span className="partner-code">{p.code}</span></Link>{p.kind === 'aggregate' && <span className="aggregate-tag">aggregate</span>}</li>)}</ul>
    </section>
    <section id="hub-sections" aria-labelledby="hub-section-title"><div className="section-heading-row"><div><p className="eyebrow">Harmonized System categories</p><h2 id="hub-section-title">Product groups</h2></div><span className="count-badge">22 groups</span></div>
      <div className="field"><label htmlFor="hub-section-search">Search product groups</label><input id="hub-section-search" type="search" value={sectionQuery} onChange={(e) => setSectionQuery(e.target.value)} placeholder="Product name, HS section or chapter code" /></div>
      <p role="status" className="chart-note">Showing {matchingSections.length} of {sections.data.groups.length} product groups.</p>
      {!matchingSections.length && <div className="empty-state"><h3>No matching product groups</h3><button onClick={() => setSectionQuery('')}>Clear product search</button></div>}
      <div className="section-directory">{matchingSections.map((g) => <article className="section-card" key={g.id}><p className="eyebrow">HS {g.id}</p><h3><Link to={contextUrl(`/section/${g.id}`, params)}>{SECTION_LABELS[g.id] ?? g.name}</Link></h3><p className="chart-note">Chapters {g.chapters.join(', ')}</p><details><summary>Full official name</summary><p>{g.name}</p></details></article>)}</div>
    </section>
    <section id="hub-years" className="panel" aria-labelledby="hub-year-title"><h2 id="hub-year-title">Explore by year</h2><ul className="year-links"><li><Link to={contextUrl('/', params, { year: 'all' })}>{periodLabel('all', years!)}</Link></li>{years?.map((y) => <li key={y}><Link to={contextUrl('/', params, { year: String(y) })}>{y}</Link></li>)}</ul></section>
  </div>;
}
