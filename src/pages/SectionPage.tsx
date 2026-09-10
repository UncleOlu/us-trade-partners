import { useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { fetchSection, fetchMeta } from '../lib/dataClient';
import { useAsyncData } from '../lib/useAsyncData';
import { Loading } from '../components/Loading';
import { DataError } from '../components/DataError';
import { MoneyCell } from '../components/MoneyCell';
import { TableScroll } from '../components/TableScroll';
import { isUsable } from '../lib/status';
import { formatAutoUsd, formatExactUsd } from '../lib/units';
import { aggregateSection, periodLabel, periodCsv } from '../lib/aggregate';
import { PeriodNote } from '../components/PeriodNote';
import { useTableSort } from '../lib/useTableSort';
import { sortRows, fieldValue } from '../lib/sorting';
import { SortableHeading, SortStatus } from '../components/SortableHeading';
import { toCsv, downloadCsv } from '../lib/csv';
import { contextUrl, useUrlState, RANK_FIELDS, RANK_LABELS } from '../lib/urlState';
import { SECTION_LABELS } from '../lib/sectionLabels';
import { UrlNotice } from '../components/UrlNotice';
import { TradeTotals } from '../components/TradeTotals';
import type { Section, FlowValue, DerivedValue } from '../types/generated';

function chartValue(flow: FlowValue | DerivedValue): number | null {
  return isUsable(flow) ? flow.value : null;
}

function SectionTrend({ section }: { section: Section }): JSX.Element {
  const data = section.years?.map((y) => ({
    year: y.year,
    imports: chartValue(y.universe.imports),
    exports: chartValue(y.universe.exports),
  }));
  return (
    <section aria-labelledby="section-trend-heading">
      <h2 id="section-trend-heading">Imports and exports over time</h2>
      <p className="chart-note">Each chart point is one year, including when All years is selected.</p>
      <p>
        Totals cover all individual partners. The EU aggregate is excluded to avoid counting its members twice.
      </p>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data} margin={{ top: 16, right: 24, left: 8, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="year" padding={{ left: 12, right: 12 }} />
          <YAxis tickFormatter={(v: number) => formatAutoUsd(v).display} width={80} />
          <Tooltip
            formatter={(value: number | string | Array<number | string>, name: string) => [
              typeof value === 'number' ? formatExactUsd(value) : 'absent',
              name,
            ]}
          />
          <Legend />
          <Line type="monotone" dataKey="imports" name="Imports" stroke="#c0392b" connectNulls={false} dot={{ r: 3 }} isAnimationActive={false} />
          <Line type="monotone" dataKey="exports" name="Exports" stroke="#2980b9" connectNulls={false} dot={{ r: 3 }} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </section>
  );
}

/**
 * Section route: partners ranked by imports, exports, and balance for one HS
 * section and year (one table, sortable by rank field), plus the
 * reconciliation-universe totals for that section/year and a section trend
 * line across years.
 */
export function SectionPage(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const [showExact, setShowExact] = useState(false);
  const meta = useAsyncData(fetchMeta, []);

  const state = useAsyncData(() => {
    if (!id) return Promise.reject(new Error('missing section id'));
    return fetchSection(id);
  }, [id]);

  const years = meta.status === 'ready' ? meta.data.configured_coverage.years : undefined;
  const { year, rank: rankField, params, notice, update } = useUrlState(years);
  const sort = useTableSort('section', rankField, 'desc');
  const yearEntry = useMemo(() => state.status === 'ready' && years ? year === 'all' ? aggregateSection(state.data, years) : state.data.years.find((y) => y.year === year) : undefined, [state, years, year]);

  const ranked = useMemo(() => sortRows(yearEntry?.partners ?? [], (p) => fieldValue(p, rankField), 'desc', (p) => p.code), [yearEntry, rankField]);
  const ranks = useMemo(() => new Map(ranked.filter((p) => p[rankField].value !== null).map((p, i) => [p.code, i + 1])), [ranked, rankField]);
  const sorted = useMemo(() => sortRows(ranked, (p) => sort.key === 'rank' ? ranks.get(p.code) : fieldValue(p, sort.key), sort.direction, (p) => p.code), [ranked, ranks, sort.key, sort.direction]);

  if (meta.status === 'error') return <DataError error={meta.error} />;
  if (state.status === 'error') return <DataError error={state.error} />;
  if (state.status === 'loading' || meta.status === 'loading' || !years || !year) return <Loading label={`Loading section ${id}`} />;

  const section = state.data;
  const label = periodLabel(year, years);
  const csvPeriod = periodCsv(year, years);

  const download = () => {
    if (!yearEntry) return;
    const rows = sorted.map((p) => [
      ...csvPeriod.cells, p.code,
      p.name,
      p.kind,
      p.imports.status,
      p.imports.status === 'observed' || p.imports.status === 'confirmed_zero' ? p.imports.value : '',
      p.exports.status,
      p.exports.status === 'observed' || p.exports.status === 'confirmed_zero' ? p.exports.value : '',
      p.balance.status,
      p.balance.status === 'observed' ? p.balance.value : '',
      p.total_trade_value.status,
      p.total_trade_value.status === 'observed' ? p.total_trade_value.value : '',
    ]);
    const csv = toCsv(
      [
        ...csvPeriod.headers, 'code',
        'name',
        'kind',
        'imports_status',
        'imports_usd',
        'exports_status',
        'exports_usd',
        'balance_status',
        'balance_usd',
        'total_trade_value_status',
        'total_trade_value_usd',
      ],
      rows,
    );
    downloadCsv(`section_${section.section.id}_${year}.csv`, csv);
  };

  return (
    <div className="section-page">
      <header className="page-intro"><p className="eyebrow">HS section {section.section.id}</p>
        <h1>{SECTION_LABELS[section.section.id] ?? `Product group ${section.section.id}`}</h1>
        <details className="official-name"><summary>Full official name and chapters</summary><p>{section.section.name}</p><p>Chapters: {section.section.chapters.join(', ')}</p></details>
      </header>
      <UrlNotice message={notice} />
      <div className="controls-row">
        <div className="field control-field">
        <label htmlFor="section-year-select">Year</label>
        <select id="section-year-select" value={year} onChange={(e) => update({ year: e.target.value })}>
          <option value="all">{periodLabel('all', years)}</option>{years?.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
        </div>
        <div className="field control-field">
        <label htmlFor="section-rank-field">Rank by</label>
        <select id="section-rank-field" value={rankField} onChange={(e) => sort.set(e.target.value, 'desc')}>
          {RANK_FIELDS.map((f) => (
            <option key={f} value={f}>
              {RANK_LABELS[f]}
            </option>
          ))}
        </select>
        </div>
      </div>

      {year === 'all' && <PeriodNote />}
      {yearEntry && <section aria-label="Reconciliation universe totals" className="world-total-card">
        <div className="section-heading-row"><h2>All-partner totals <span className="heading-year">{label}</span></h2><p>EU aggregate excluded to avoid double counting.</p></div>
        <TradeTotals values={yearEntry.universe} />
      </section>}
      <div className="panel"><SectionTrend section={section} /></div>
      <section className="panel" aria-label="Section partner ranking">
      <div className="section-heading-row">
        <h2>Partners, {label}</h2>
        <button type="button" onClick={download}>
          Download CSV
        </button>
      </div>
      <label className="exact-toggle"><input type="checkbox" checked={showExact} onChange={(e) => setShowExact(e.target.checked)} />Show exact USD</label>
      <SortStatus sort={sort} />
      <p className="chart-note">Rank 1 has the largest {RANK_LABELS[rankField].toLowerCase()}, regardless of row order.</p>
      <TableScroll label={`Partners in section ${section.section.id} for ${label}`}>
        <table className="section-ranking-table">
          <thead>
            <tr>
              {['rank', 'name', 'kind', 'imports', 'exports', 'balance', 'total_trade_value'].map((column) => <SortableHeading key={column} column={column} sort={sort} />)}
            </tr>
          </thead>
          <tbody>
            {sorted.map((p) => (
              <tr key={p.code}>
                <td>{ranks.get(p.code) ?? 'Not ranked'}</td>
                <td>
                  <Link to={contextUrl(`/partner/${p.code}`, params, { section: section.section.id })}>{p.name}</Link> ({p.code})
                  {p.kind === 'aggregate' && <span className="aggregate-tag"> aggregate</span>}
                </td>
                <td>{p.kind}</td>
                <td>
                  <MoneyCell flow={p.imports} showExact={showExact} />
                </td>
                <td>
                  <MoneyCell flow={p.exports} showExact={showExact} />
                </td>
                <td>
                  <MoneyCell flow={p.balance} showExact={showExact} />
                </td>
                <td>
                  <MoneyCell flow={p.total_trade_value} showExact={showExact} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableScroll>
      </section>
    </div>
  );
}
