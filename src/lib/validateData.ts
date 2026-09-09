import { SNAPSHOT_ID } from './config';

type Row = Record<string, unknown>;
const object = (value: unknown): Row => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected a data object');
  return value as Row;
};
const list = (value: unknown): unknown[] => {
  if (!Array.isArray(value)) throw new Error('Expected a data list');
  return value;
};
const text = (value: unknown) => { if (typeof value !== 'string' || !value.trim()) throw new Error('Expected a data label'); };
const integer = (value: unknown) => { if (!Number.isSafeInteger(value)) throw new Error('Expected an exact integer'); };
const flow = (value: unknown) => {
  const row = object(value);
  if (row.status === 'observed') { integer(row.value); if (row.reason !== null) throw new Error('Invalid observed value'); }
  else if (row.status === 'confirmed_zero') { if (row.value !== 0) throw new Error('Invalid zero value'); text(row.reason); }
  else if (row.status === 'absent' || row.status === 'not_applicable') { if (row.value !== null) throw new Error('Invalid missing value'); text(row.reason); }
  else throw new Error('Invalid value status');
};
const money = (value: unknown, balance = true) => {
  const row = object(value);
  for (const field of ['imports', 'exports', 'total_trade_value', ...(balance ? ['balance'] : [])]) flow(row[field]);
  return row;
};
const partner = (value: unknown) => {
  const row = object(value);
  text(row.code); text(row.name);
  if (!['country', 'territory', 'special', 'aggregate'].includes(String(row.kind))) throw new Error('Invalid partner kind');
  if (typeof row.include_in_world_reconciliation !== 'boolean') throw new Error('Invalid partner membership');
  return row;
};
const years = (value: unknown) => {
  const rows = list(value);
  if (!rows.length) throw new Error('No years in data');
  for (const row of rows) integer(object(row).year);
  return rows;
};

/** Small runtime guards for the fields consumed by the app, not a second schema. */
export function validateData(value: unknown, file: string): void {
  const root = object(value);
  if (file !== 'hs_sections.json' && (root.snapshot_id !== SNAPSHOT_ID || root.schema_version !== '1.0.0')) throw new Error('Unexpected snapshot or schema');
  if (file === 'meta.json') {
    const coverage = object(root.configured_coverage);
    const dates = list(coverage.years);
    if (!dates.length || dates.some((year) => !Number.isSafeInteger(year))) throw new Error('Invalid year coverage');
    integer(coverage.start_year); integer(coverage.end_year);
    if (coverage.start_year !== dates[0] || coverage.end_year !== dates[dates.length - 1]) throw new Error('Inconsistent year coverage');
    for (const key of ['fetched_at', 'latest_period', 'code_commit', 'hs_sections_version']) text(root[key]);
    for (const key of ['documented_availability', 'verified_availability']) integer(object(root[key]).from_year);
    integer(object(root.verified_availability).to_year);
  } else if (file === 'partners.json') {
    if (!list(root.partners).length) throw new Error('No partners in data');
    for (const item of list(root.partners)) {
      const row = partner(item);
      if (!['approved', 'excluded'].includes(String(row.resolution))) throw new Error('Unresolved partner');
    }
  } else if (file === 'hs_sections.json') {
    for (const item of list(root.groups)) { const row = object(item); text(row.id); text(row.name); list(row.chapters).forEach(text); }
    if (list(root.groups).length !== 22) throw new Error('Invalid section count');
  } else if (file === 'summary-all.json') {
    if (root.year !== 'all' || root.view_version !== '1') throw new Error('Invalid all-years view');
    const period = list(root.years);
    if (!period.length || period.some((year, i) => !Number.isSafeInteger(year) || (i > 0 && Number(year) <= Number(period[i - 1])))) throw new Error('Invalid all-years coverage');
    money(root.world);
    if (!list(root.partners).length) throw new Error('No partners in period view');
    for (const item of list(root.partners)) { partner(item); money(item); }
  } else if (file.startsWith('summary/')) {
    integer(root.year);
    if (`summary/${root.year}.json` !== file) throw new Error('Wrong summary year');
    money(root.world);
    if (!list(root.partners).length) throw new Error('No partners in data');
    for (const item of list(root.partners)) { partner(item); money(item); }
  } else if (file.startsWith('partner/')) {
    const info = partner(root.partner);
    if (`partner/${info.code}.json` !== file) throw new Error('Wrong partner');
    years(root.years).forEach((row) => money(row));
    for (const item of years(root.sections)) for (const group of list(object(item).groups)) {
      const row = money(group, false); text(row.section_id);
      for (const chapter of list(row.chapters)) { const c = money(chapter, false); text(c.chapter); }
    }
  } else if (file.startsWith('section/')) {
    const section = object(root.section); text(section.id); text(section.name); list(section.chapters).forEach(text);
    if (`section/${section.id}.json` !== file) throw new Error('Wrong section');
    for (const item of years(root.years)) {
      const row = object(item); money(row.universe);
      for (const item of list(row.partners)) { partner(item); money(item); }
    }
  }
}
