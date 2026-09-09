import { useMemo } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Link } from 'react-router-dom';
import { fetchSection } from '../lib/dataClient';
import { useAsyncData } from '../lib/useAsyncData';
import { Loading } from '../components/Loading';
import { DataError } from '../components/DataError';
import { MoneyCell } from '../components/MoneyCell';

/**
 * Placeholder section route: partners ranked for one HS section and year,
 * plus the reconciliation-universe totals for that section and year. The
 * section trend line is added in a later step.
 */
export function SectionPage(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();

  const state = useAsyncData(() => {
    if (!id) return Promise.reject(new Error('missing section id'));
    return fetchSection(id);
  }, [id]);

  if (state.status === 'loading') return <Loading label={`Loading section ${id}`} />;
  if (state.status === 'error') return <DataError error={state.error} />;

  const section = state.data;
  const years = section.years.map((y) => y.year);
  const yearParam = searchParams.get('year');
  const year = yearParam && years.includes(Number(yearParam)) ? Number(yearParam) : years[years.length - 1];
  const yearEntry = section.years.find((y) => y.year === year);

  const ranked = useMemo(() => {
    if (!yearEntry) return [];
    const list = [...yearEntry.partners];
    list.sort((a, b) => {
      const av = a.total_trade_value.status === 'observed' ? a.total_trade_value.value : -Infinity;
      const bv = b.total_trade_value.status === 'observed' ? b.total_trade_value.value : -Infinity;
      return bv - av;
    });
    return list;
  }, [yearEntry]);

  return (
    <div className="section-page">
      <h1>
        {section.section.id}: {section.section.name}
      </h1>
      <p>Chapters: {section.section.chapters.join(', ')}</p>

      <div className="controls-row">
        <label htmlFor="section-year-select">Year</label>
        <select id="section-year-select" defaultValue={year} onChange={(e) => {
          const url = new URL(window.location.href);
          url.searchParams.set('year', e.target.value);
          window.location.href = url.toString();
        }}>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </div>

      {yearEntry && (
        <section aria-label="Reconciliation universe totals">
          <h2>Universe totals, {year}</h2>
          <p>Sums over the reconciliation universe only, from section.years[].universe. Never a sum of displayed rows.</p>
          <dl className="world-total-grid">
            <dt>Imports</dt>
            <dd>
              <MoneyCell flow={yearEntry.universe.imports} showExact={false} />
            </dd>
            <dt>Exports</dt>
            <dd>
              <MoneyCell flow={yearEntry.universe.exports} showExact={false} />
            </dd>
            <dt>Balance</dt>
            <dd>
              <MoneyCell flow={yearEntry.universe.balance} showExact={false} />
            </dd>
            <dt>Total trade value</dt>
            <dd>
              <MoneyCell flow={yearEntry.universe.total_trade_value} showExact={false} />
            </dd>
          </dl>
        </section>
      )}

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
    </div>
  );
}
