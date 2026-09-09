import { useMemo } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
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
import { fetchSection } from '../lib/dataClient';
import { useAsyncData } from '../lib/useAsyncData';
import { Loading } from '../components/Loading';
import { DataError } from '../components/DataError';
import { MoneyCell } from '../components/MoneyCell';
import { TableScroll } from '../components/TableScroll';
import { isUsable } from '../lib/status';
import { formatAutoUsd, formatExactUsd } from '../lib/units';
import { toCsv, downloadCsv } from '../lib/csv';
import type { Section, FlowValue, DerivedValue } from '../types/generated';

type RankField = 'imports' | 'exports' | 'balance' | 'total_trade_value';

const RANK_FIELDS: RankField[] = ['total_trade_value', 'imports', 'exports', 'balance'];
const DEFAULT_RANK: RankField = 'total_trade_value';

const RANK_LABELS: Record<RankField, string> = {
  imports: 'Imports',
  exports: 'Exports',
  balance: 'Balance',
  total_trade_value: 'Total trade value',
};

function parseRankField(raw: string | null): RankField {
  return raw && (RANK_FIELDS as string[]).includes(raw) ? (raw as RankField) : DEFAULT_RANK;
}

function chartValue(flow: FlowValue | DerivedValue): number | null {
  return isUsable(flow) ? flow.value : null;
}

function rankValue(row: Section['years'][number]['partners'][number], field: RankField): number {
  const v = row[field];
  return v.status === 'observed' || v.status === 'confirmed_zero' ? v.value : -Infinity;
}

function SectionTrend({ section }: { section: Section }): JSX.Element {
  const data = section.years.map((y) => ({
    year: y.year,
    imports: chartValue(y.universe.imports),
    exports: chartValue(y.universe.exports),
  }));
  return (
    <section aria-labelledby="section-trend-heading">
      <h2 id="section-trend-heading">Universe imports and exports by year</h2>
      <p>
        Reconciliation-universe sums only (section.years[].universe), never a sum of the partner rows shown below.
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
          <Line type="monotone" dataKey="imports" stroke="#c0392b" connectNulls={false} dot={{ r: 3 }} isAnimationActive={false} />
          <Line type="monotone" dataKey="exports" stroke="#2980b9" connectNulls={false} dot={{ r: 3 }} isAnimationActive={false} />
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
  const [searchParams, setSearchParams] = useSearchParams();
  const rankField = parseRankField(searchParams.get('rank'));

  const state = useAsyncData(() => {
    if (!id) return Promise.reject(new Error('missing section id'));
    return fetchSection(id);
  }, [id]);

  // Every hook in this component must run on every render, in the same
  // order, including while `state` is still loading or errored: compute
  // derived values with safe fallbacks first, call useMemo unconditionally,
  // and only branch into the loading/error early returns afterward. Calling
  // useMemo after an early return crashed this page (React error #310,
  // "rendered more hooks than during the previous render") because the first
  // render (loading) skipped it while a later render (ready) reached it.
  const years = state.status === 'ready' ? state.data.years.map((y) => y.year) : [];
  const yearParam = searchParams.get('year');
  const year = yearParam && years.includes(Number(yearParam)) ? Number(yearParam) : years[years.length - 1];
  const yearEntry = state.status === 'ready' ? state.data.years.find((y) => y.year === year) : undefined;

  const ranked = useMemo(() => {
    if (!yearEntry) return [];
    const list = [...yearEntry.partners];
    list.sort((a, b) => rankValue(b, rankField) - rankValue(a, rankField));
    return list;
  }, [yearEntry, rankField]);

  if (state.status === 'loading') return <Loading label={`Loading section ${id}`} />;
  if (state.status === 'error') return <DataError error={state.error} />;

  const section = state.data;

  const onYearChange = (newYear: number) => {
    const next = new URLSearchParams(searchParams);
    next.set('year', String(newYear));
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

  const download = () => {
    if (!yearEntry) return;
    const rows = ranked.map((p) => [
      p.code,
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
        'code',
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
      <h1>
        {section.section.id}: {section.section.name}
      </h1>
      <p>Chapters: {section.section.chapters.join(', ')}</p>

      <SectionTrend section={section} />

      <div className="controls-row">
        <label htmlFor="section-year-select">Year</label>
        <select id="section-year-select" value={year} onChange={(e) => onYearChange(Number(e.target.value))}>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
        <label htmlFor="section-rank-field">Rank by</label>
        <select id="section-rank-field" value={rankField} onChange={(e) => onRankChange(e.target.value as RankField)}>
          {RANK_FIELDS.map((f) => (
            <option key={f} value={f}>
              {RANK_LABELS[f]}
            </option>
          ))}
        </select>
      </div>

      {yearEntry && (
        <section aria-label="Reconciliation universe totals">
          <h2>Universe totals, {year}</h2>
          <p>Sums over the reconciliation universe only, from section.years[].universe. Never a sum of displayed rows.</p>
          <div className="stat-cards">
            <div className="stat-card">
              <p className="stat-label">Imports</p>
              <p className="stat-value">
                <MoneyCell flow={yearEntry.universe.imports} showExact={false} />
              </p>
            </div>
            <div className="stat-card">
              <p className="stat-label">Exports</p>
              <p className="stat-value">
                <MoneyCell flow={yearEntry.universe.exports} showExact={false} />
              </p>
            </div>
            <div className="stat-card">
              <p className="stat-label">Balance</p>
              <p className="stat-value">
                <MoneyCell flow={yearEntry.universe.balance} showExact={false} />
              </p>
            </div>
            <div className="stat-card">
              <p className="stat-label">Total trade value</p>
              <p className="stat-value">
                <MoneyCell flow={yearEntry.universe.total_trade_value} showExact={false} />
              </p>
            </div>
          </div>
        </section>
      )}

      <div className="section-heading-row">
        <h2>Partners ranked by {RANK_LABELS[rankField].toLowerCase()}, {year}</h2>
        <button type="button" onClick={download}>
          Download CSV
        </button>
      </div>
      <TableScroll>
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
            {ranked.map((p, i) => (
              <tr key={p.code}>
                <td>{i + 1}</td>
                <td>
                  <Link to={`/partner/${p.code}?year=${year}`}>{p.name}</Link> ({p.code})
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
      </TableScroll>
    </div>
  );
}
