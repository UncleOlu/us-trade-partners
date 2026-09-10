import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  BarChart,
  Bar,
} from 'recharts';
import { fetchPartner, fetchMeta } from '../lib/dataClient';
import { useAsyncData } from '../lib/useAsyncData';
import { Loading } from '../components/Loading';
import { DataError } from '../components/DataError';
import { MoneyCell } from '../components/MoneyCell';
import { TableScroll } from '../components/TableScroll';
import { isUsable } from '../lib/status';
import { formatAutoUsd, formatExactUsd } from '../lib/units';
import { useTableSort } from '../lib/useTableSort';
import { sortRows, fieldValue, groupOrder } from '../lib/sorting';
import { SortableHeading, SortStatus } from '../components/SortableHeading';
import { toCsv, downloadCsv } from '../lib/csv';
import { SECTION_LABELS } from '../lib/sectionLabels';
import { useUrlState } from '../lib/urlState';
import { UrlNotice } from '../components/UrlNotice';
import { TradeTotals } from '../components/TradeTotals';
import { aggregatePartnerSections, periodTotals, periodLabel, periodCsv, type PartnerView, type Period } from '../lib/aggregate';
import { PeriodNote } from '../components/PeriodNote';
import type { FlowValue, DerivedValue } from '../types/generated';

function chartValue(flow: FlowValue | DerivedValue): number | null {
  return isUsable(flow) ? flow.value : null;
}

function YearsTable({
  partner,
  showExact,
}: {
  partner: PartnerView;
  showExact: boolean;
}): JSX.Element {
  const sort = useTableSort('years', 'year', 'asc');
  const sorted = useMemo(() => sortRows(partner.years, (row) => fieldValue(row, sort.key), sort.direction, (row) => String(row.year)), [partner.years, sort.key, sort.direction]);
  const download = () => {
    const rows = sorted.map((y) => [
      y.year,
      y.imports.status,
      y.imports.status === 'observed' || y.imports.status === 'confirmed_zero' ? y.imports.value : '',
      y.exports.status,
      y.exports.status === 'observed' || y.exports.status === 'confirmed_zero' ? y.exports.value : '',
      y.balance.status,
      y.balance.status === 'observed' ? y.balance.value : '',
      y.total_trade_value.status,
      y.total_trade_value.status === 'observed' ? y.total_trade_value.value : '',
      y.note ?? '',
    ]);
    const csv = toCsv(
      [
        'year',
        'imports_status',
        'imports_usd',
        'exports_status',
        'exports_usd',
        'balance_status',
        'balance_usd',
        'total_trade_value_status',
        'total_trade_value_usd',
        'note',
      ],
      rows,
    );
    downloadCsv(`partner_${partner.partner.code}_years.csv`, csv);
  };

  return (
    <section className="panel" aria-labelledby="years-table-heading">
      <div className="section-heading-row">
        <h2 id="years-table-heading">Trade by year</h2>
        <button type="button" onClick={download}>
          Download CSV
        </button>
      </div>
      <SortStatus sort={sort} />
      <TableScroll label="Trade by year">
        <table className="partner-years-table">
          <thead>
            <tr>
              {['year', 'imports', 'exports', 'balance', 'total_trade_value'].map((column) => <SortableHeading key={column} column={column} sort={sort} />)}
            </tr>
          </thead>
          <tbody>
            {sorted.map((y) => (
              <tr key={y.year}>
                <td>
                  {y.year}
                  {y.note && <span title={y.note}> *</span>}
                </td>
                <td>
                  <MoneyCell flow={y.imports} showExact={showExact} />
                </td>
                <td>
                  <MoneyCell flow={y.exports} showExact={showExact} />
                </td>
                <td>
                  <MoneyCell flow={y.balance} showExact={showExact} />
                </td>
                <td>
                  <MoneyCell flow={y.total_trade_value} showExact={showExact} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableScroll>
      {partner.years.some((y) => y.note) && (
        <p className="chart-note">* See the membership-change notes above the chart.</p>
      )}
    </section>
  );
}

function TrendChart({ partner }: { partner: PartnerView }): JSX.Element {
  const data = partner.years?.map((y) => ({
    year: y.year,
    imports: chartValue(y.imports),
    exports: chartValue(y.exports),
    balance: chartValue(y.balance),
  }));
  const isEu = partner.partner.code === 'EU';
  const noteYears = isEu ? partner.years.filter((y) => (y.year === 2013 || y.year === 2020) && y.note) : [];

  return (
    <section className="panel" aria-labelledby="trend-chart-heading">
      <h2 id="trend-chart-heading">Imports, exports, and balance by year</h2>
      <p className="chart-note">Each chart point is one year, including when All years is selected.</p>
      {isEu && (
        <p className="chart-note">
          Membership-change years are marked on the chart. Gaps in a line mean the value is absent for that
          year, not zero.
        </p>
      )}
      <ResponsiveContainer width="100%" height={360}>
        <LineChart data={data} margin={{ top: 36, right: 32, left: 8, bottom: 8 }}>
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
          {noteYears.map((y) => (
            <ReferenceLine
              key={y.year}
              x={y.year}
              stroke="#888"
              strokeDasharray="4 4"
              label={{
                value: 'membership change',
                position: 'insideTopRight',
                offset: 8,
                fontSize: 9,
                fill: '#666',
              }}
            />
          ))}
          {/* Explicit dot markers prove every observed year renders a point,
              including the last one (chartValue returns null only for a
              non-usable status, and connectNulls=false only breaks the line
              at those points; it never drops a real trailing point). */}
          <Line
            type="monotone"
            dataKey="imports"
            stroke="#c0392b"
            connectNulls={false}
            dot={{ r: 3 }}
            activeDot={{ r: 5 }}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="exports"
            stroke="#2980b9"
            connectNulls={false}
            dot={{ r: 3 }}
            activeDot={{ r: 5 }}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="balance"
            stroke="#27ae60"
            connectNulls={false}
            dot={{ r: 3 }}
            activeDot={{ r: 5 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
      {isEu && noteYears.length > 0 && (
        <ul className="eu-notes">
          {noteYears.map((y) => (
            <li key={y.year}>
              {y.year}: {y.note}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function GroupsSection({
  partner,
  year,
  selectedGroup,
  onSelectGroup,
  showExact,
}: {
  partner: PartnerView;
  year: Period;
  selectedGroup: string | null;
  onSelectGroup: (id: string) => void;
  showExact: boolean;
}): JSX.Element {
  const sort = useTableSort('groups', 'group', 'asc');
  const yearSections = partner.sections.find((s) => s.year === year);
  const sorted = useMemo(() => sortRows(yearSections?.groups ?? [], (row) => sort.key === 'group' ? groupOrder(row.section_id) : fieldValue(row, sort.key), sort.direction, (row) => row.section_id), [yearSections, sort.key, sort.direction]);
  const label = periodLabel(year, partner.periodYears);
  const csvPeriod = periodCsv(year, partner.periodYears);

  const download = () => {
    if (!yearSections) return;
    const rows = sorted.map((g) => [
      ...csvPeriod.cells, g.section_id,
      g.imports.status,
      g.imports.status === 'observed' || g.imports.status === 'confirmed_zero' ? g.imports.value : '',
      g.exports.status,
      g.exports.status === 'observed' || g.exports.status === 'confirmed_zero' ? g.exports.value : '',
      g.total_trade_value.status,
      g.total_trade_value.status === 'observed' ? g.total_trade_value.value : '',
    ]);
    const csv = toCsv(
      [...csvPeriod.headers, 'section_id', 'imports_status', 'imports_usd', 'exports_status', 'exports_usd', 'total_trade_value_status', 'total_trade_value_usd'],
      rows,
    );
    downloadCsv(`partner_${partner.partner.code}_groups_${year}.csv`, csv);
  };

  if (!yearSections) {
    return (
      <section>
        <h2>HS sections for {label}</h2>
        <p>No section data for {label} in this snapshot.</p>
      </section>
    );
  }

  const chartData = yearSections.groups.map((g) => ({
    section_id: g.section_id,
    imports: chartValue(g.imports),
    exports: chartValue(g.exports),
  }));

  return (
    <section className="panel" aria-labelledby="groups-heading">
      <div className="section-heading-row">
        <h2 id="groups-heading">HS sections, {label}</h2>
        <button type="button" onClick={download}>
          Download CSV
        </button>
      </div>
      <p>Select a chart bar or a product-group button to see its chapters below. <a href="#chapters-heading">View selected chapters ↓</a></p>
      <ResponsiveContainer width="100%" height={320}>
        <BarChart
          data={chartData}
          margin={{ top: 8, right: 24, left: 8, bottom: 8 }}
          onClick={(state) => {
            const label = state?.activeLabel;
            if (typeof label === 'string') onSelectGroup(label);
          }}
        >
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="section_id" />
          <YAxis tickFormatter={(v: number) => formatAutoUsd(v).display} width={80} />
          <Tooltip
            formatter={(value: number | string | Array<number | string>, name: string) => [
              typeof value === 'number' ? formatExactUsd(value) : 'absent',
              name,
            ]}
          />
          <Legend />
          <Bar dataKey="imports" fill="#c0392b" cursor="pointer" />
          <Bar dataKey="exports" fill="#2980b9" cursor="pointer" />
        </BarChart>
      </ResponsiveContainer>
      <SortStatus sort={sort} />
      <TableScroll label="Product groups">
        <table className="partner-groups-table">
          <thead>
            <tr>
              {['group', 'imports', 'exports', 'total_trade_value'].map((column) => <SortableHeading key={column} column={column} sort={sort} />)}
            </tr>
          </thead>
          <tbody>
            {sorted.map((g) => (
              <tr
                key={g.section_id}
                className={g.section_id === selectedGroup ? 'selected-row' : undefined}
              >
                <td><button type="button" className="group-button" aria-label={`View chapters in section ${g.section_id}: ${SECTION_LABELS[g.section_id] ?? g.section_id}`} aria-pressed={g.section_id === selectedGroup} onClick={() => onSelectGroup(g.section_id)}>{g.section_id}: {SECTION_LABELS[g.section_id] ?? g.section_id}</button></td>
                <td>
                  <MoneyCell flow={g.imports} showExact={showExact} />
                </td>
                <td>
                  <MoneyCell flow={g.exports} showExact={showExact} />
                </td>
                <td>
                  <MoneyCell flow={g.total_trade_value} showExact={showExact} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableScroll>
    </section>
  );
}

function ChapterTable({
  partner,
  year,
  groupId,
  showExact,
}: {
  partner: PartnerView;
  year: Period;
  groupId: string;
  showExact: boolean;
}): JSX.Element {
  const sort = useTableSort('chapters', 'total_trade_value', 'desc');
  const yearSections = partner.sections.find((s) => s.year === year);
  const label = periodLabel(year, partner.periodYears);
  const csvPeriod = periodCsv(year, partner.periodYears);
  const group = yearSections?.groups.find((g) => g.section_id === groupId);

  const sorted = useMemo(() => sortRows(group?.chapters ?? [], (row) => fieldValue(row, sort.key), sort.direction, (row) => row.chapter), [group, sort.key, sort.direction]);

  const download = () => {
    const rows = sorted.map((c) => [
      ...csvPeriod.cells, c.chapter,
      c.description ?? '',
      c.imports.status,
      c.imports.status === 'observed' || c.imports.status === 'confirmed_zero' ? c.imports.value : '',
      c.exports.status,
      c.exports.status === 'observed' || c.exports.status === 'confirmed_zero' ? c.exports.value : '',
      c.total_trade_value.status,
      c.total_trade_value.status === 'observed' ? c.total_trade_value.value : '',
    ]);
    const csv = toCsv(
      [
        ...csvPeriod.headers, 'chapter',
        'description',
        'imports_status',
        'imports_usd',
        'exports_status',
        'exports_usd',
        'total_trade_value_status',
        'total_trade_value_usd',
      ],
      rows,
    );
    downloadCsv(`partner_${partner.partner.code}_chapters_${groupId}_${year}.csv`, csv);
  };

  if (!group) {
    return (
      <section>
        <h2>Chapters</h2>
        <p>No chapter data for group {groupId} in {label}.</p>
      </section>
    );
  }

  return (
    <section className="panel" aria-labelledby="chapters-heading">
      <div className="section-heading-row">
        <h2 id="chapters-heading">
          Chapters in group {groupId}, {label}
        </h2>
        <button type="button" onClick={download}>
          Download CSV
        </button>
      </div>
      <SortStatus sort={sort} />
      <TableScroll label="Chapter details">
        <table className="partner-chapters-table">
          <thead>
            <tr>
              {['chapter', 'description', 'imports', 'exports', 'total_trade_value'].map((column) => <SortableHeading key={column} column={column} sort={sort} />)}
            </tr>
          </thead>
          <tbody>
            {sorted.map((c) => (
              <tr key={c.chapter}>
                <td>{c.chapter}</td>
                <td>{c.description ?? ''}</td>
                <td>
                  <MoneyCell flow={c.imports} showExact={showExact} />
                </td>
                <td>
                  <MoneyCell flow={c.exports} showExact={showExact} />
                </td>
                <td>
                  <MoneyCell flow={c.total_trade_value} showExact={showExact} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableScroll>
    </section>
  );
}

export function PartnerPage(): JSX.Element {
  const { code } = useParams<{ code: string }>();
  const [showExact, setShowExact] = useState(false);
  const meta = useAsyncData(fetchMeta, []);

  const state = useAsyncData(() => {
    if (!code) return Promise.reject(new Error('missing partner code'));
    return fetchPartner(code);
  }, [code]);

  const years = meta.status === 'ready' ? meta.data.configured_coverage.years : undefined;
  const groups = state.status === 'ready' ? state.data.sections[0]?.groups.map((g) => g.section_id) : undefined;
  const { year, group: effectiveGroup, notice, update } = useUrlState(years, groups);
  useEffect(() => {
    if (state.status === 'ready') document.title = `${state.data.partner.name} | US goods trade`;
  }, [state]);
  if (meta.status === 'error') return <DataError error={meta.error} />;
  if (state.status === 'error') return <DataError error={state.error} />;
  if (state.status === 'loading' || meta.status === 'loading' || !year || !years) return <Loading label={`Loading ${code}`} />;
  const partner: PartnerView = { ...state.data, periodYears: years, sections: year === 'all' ? [aggregatePartnerSections(state.data, years)] : state.data.sections };
  const yearEntry = year === 'all' ? periodTotals(partner.years, years) : partner.years.find((y) => y.year === year);
  const label = periodLabel(year, years);

  const { partner: info } = partner;

  return (
    <div className="partner-page">
      <header className="partner-header">
        <h1>
          {info.name}
          {info.kind === 'aggregate' && <span className="aggregate-tag"> (aggregate)</span>}
        </h1>
        <p className="partner-meta">{info.kind} <span aria-hidden="true">·</span> Census code {info.code}{info.iso3 ? ` · ${info.iso3}` : ''}</p>
      </header>
      <UrlNotice message={notice} />
      <nav className="jump-links" aria-label="Partner page sections"><a href="#trend-chart-heading">Trend</a><a href="#years-table-heading">Yearly values</a><a href="#groups-heading">Product groups</a><a href="#chapters-heading">Chapters</a></nav>

      <div className="controls-row">
        <label htmlFor="year-select">Year</label>
        <select id="year-select" value={year} onChange={(e) => update({ year: e.target.value })}>
          <option value="all">{periodLabel('all', years)}</option>{years?.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
        <label className="exact-toggle">
          <input type="checkbox" checked={showExact} onChange={(e) => setShowExact(e.target.checked)} />
          Show exact USD in tables
        </label>
      </div>

      {year === 'all' && <PeriodNote />}
      {yearEntry && <section aria-label="Partner totals" className="world-total-card"><h2>Trade in {label}</h2><TradeTotals values={yearEntry} /></section>}
      <TrendChart partner={partner} />
      <YearsTable partner={partner} showExact={showExact} />
      <GroupsSection
        partner={partner}
        year={year}
        selectedGroup={effectiveGroup}
        onSelectGroup={(section) => update({ section })}
        showExact={showExact}
      />
      {effectiveGroup && (
        <ChapterTable partner={partner} year={year} groupId={effectiveGroup} showExact={showExact} />
      )}
    </div>
  );
}
