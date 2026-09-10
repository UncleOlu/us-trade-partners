import type { FlowValue, DerivedValue, Summary, PartnerFile, Section } from '../types/generated';
import type { Period } from './period';

export type { Period } from './period';
export type AllSummary = Omit<Summary, 'year'> & { year: 'all'; years: number[]; view_version: '1' };
export type SummaryView = Summary | AllSummary;
type PartnerSections = PartnerFile['sections'][number];
export type AllPartnerSections = Omit<PartnerSections, 'year'> & { year: 'all'; years: number[] };
export type PartnerView = Omit<PartnerFile, 'sections'> & { sections: (PartnerSections | AllPartnerSections)[]; periodYears: number[] };
export type AllSectionYear = Omit<Section['years'][number], 'year'> & { year: 'all'; years: number[] };

const safe = (value: number): number => {
  if (!Number.isSafeInteger(value)) throw new Error('The period sum exceeds exact integer limits.');
  return value;
};
const absent = (reason: string): FlowValue => ({ status: 'absent', value: null, reason });

/** Every configured year must have a record. Explicit structural NA is not missing data. */
export function sumFlows(entries: { year: number; value: FlowValue | undefined }[], name: string): FlowValue {
  if (!entries.length) return absent(`${name}: no required years provided`);
  const missing = entries.filter((entry) => !entry.value || entry.value.status === 'absent');
  if (missing.length) return absent(`${name}: incomplete period; missing required years ${missing.map((entry) => entry.year).join(', ')}`);
  const applicable = entries.filter((entry) => entry.value?.status !== 'not_applicable');
  if (!applicable.length) return { status: 'not_applicable', value: null, reason: `${name}: not applicable in all selected years` };
  let sum = 0;
  for (const entry of applicable) {
    const value = entry.value!;
    if (value.status !== 'observed' && value.status !== 'confirmed_zero') throw new Error('Unexpected flow status in period sum.');
    sum = safe(sum + safe(value.value));
  }
  return applicable.every((entry) => entry.value?.status === 'confirmed_zero')
    ? { status: 'confirmed_zero', value: 0, reason: `${name}: all applicable selected years report confirmed zero` }
    : { status: 'observed', value: sum, reason: null };
}
export function periodTotals(rows: { year: number; imports: FlowValue; exports: FlowValue }[], years: number[]) {
  const byYear = unique(rows, (row) => String(row.year));
  const imports = sumFlows(years.map((year) => ({ year, value: byYear.get(String(year))?.imports })), 'imports');
  const exports = sumFlows(years.map((year) => ({ year, value: byYear.get(String(year))?.exports })), 'exports');
  const usable = (flow: FlowValue) => flow.status === 'observed' || flow.status === 'confirmed_zero';
  let balance: DerivedValue;
  let total_trade_value: DerivedValue;
  if (usable(imports) && usable(exports)) {
    balance = { status: 'observed', value: safe(exports.value! - imports.value!), reason: null };
    total_trade_value = { status: 'observed', value: safe(imports.value! + exports.value!), reason: null };
  } else {
    const reason = `${!usable(imports) ? 'imports incomplete or not applicable; ' : ''}${!usable(exports) ? 'exports incomplete or not applicable' : ''}`.trim();
    balance = { status: 'absent', value: null, reason };
    total_trade_value = { status: 'absent', value: null, reason };
  }
  return { imports, exports, balance, total_trade_value };
}
function unique<T>(rows: T[], key: (row: T) => string): Map<string, T> {
  const map = new Map<string, T>();
  for (const row of rows) { const id = key(row); if (map.has(id)) throw new Error(`Duplicate period record: ${id}`); map.set(id, row); }
  return map;
}
function requiredYears(years: number[]): number[] {
  const sorted = [...years].sort((a, b) => a - b);
  if (!sorted.length || sorted.some((year, i) => !Number.isInteger(year) || (i > 0 && year === sorted[i - 1]))) throw new Error('Invalid period years.');
  return sorted;
}
export function aggregateSummary(summaries: Summary[], years: number[]): AllSummary {
  const required = requiredYears(years);
  const first = summaries[0];
  if (!first || summaries.some((summary) => summary.snapshot_id !== first.snapshot_id)) throw new Error('Period summaries must share one snapshot.');
  const byYear = unique(summaries, (summary) => String(summary.year));
  const records = required.flatMap((year) => byYear.get(String(year))?.partners ?? []);
  const codes = [...new Set(records.map((row) => row.code))].sort();
  const indexed = new Map(required.map((year) => [year, unique(byYear.get(String(year))?.partners ?? [], (row) => row.code)]));
  return {
    schema_version: first.schema_version, snapshot_id: first.snapshot_id, view_version: '1', year: 'all', years: required,
    world: periodTotals(required.flatMap((year) => { const row = byYear.get(String(year)); return row ? [{ year, ...row.world }] : []; }), required),
    partners: codes.map((code) => {
      const original = records.find((row) => row.code === code)!;
      const rows = required.flatMap((year) => { const row = indexed.get(year)?.get(code); return row ? [{ year, ...row }] : []; });
      return { ...original, ...periodTotals(rows, required) };
    }),
  };
}
export function aggregatePartnerSections(partner: PartnerFile, years: number[]): AllPartnerSections {
  const required = requiredYears(years);
  const annual = unique(partner.sections, (row) => String(row.year));
  const groupIds = [...new Set(required.flatMap((year) => annual.get(String(year))?.groups.map((g) => g.section_id) ?? []))];
  return { year: 'all', years: required, groups: groupIds.map((section_id) => {
    const groups = required.flatMap((year) => { const group = annual.get(String(year))?.groups.find((row) => row.section_id === section_id); return group ? [{ year, ...group }] : []; });
    const chapterCodes = [...new Set(groups.flatMap((group) => group.chapters.map((chapter) => chapter.chapter)))].sort();
    return { section_id, ...periodTotals(groups, required), chapters: chapterCodes.map((chapter) => {
      const rows = groups.flatMap((group) => { const row = group.chapters.find((row) => row.chapter === chapter); return row ? [{ year: group.year, ...row }] : []; });
      const original = rows[0];
      return { chapter: original.chapter, description: original.description, ...periodTotals(rows, required) };
    }) };
  }) };
}
export function aggregateSection(section: Section, years: number[]): AllSectionYear {
  const required = requiredYears(years);
  const annual = unique(section.years, (row) => String(row.year));
  const records = required.flatMap((year) => annual.get(String(year))?.partners ?? []);
  const codes = [...new Set(records.map((row) => row.code))].sort();
  return { year: 'all', years: required,
    universe: periodTotals(required.flatMap((year) => { const row = annual.get(String(year)); return row ? [{ year, ...row.universe }] : []; }), required),
    partners: codes.map((code) => ({ ...records.find((row) => row.code === code)!, ...periodTotals(required.flatMap((year) => {
      const row = annual.get(String(year))?.partners.find((row) => row.code === code); return row ? [{ year, ...row }] : [];
    }), required) })),
  };
}
export function periodLabel(period: Period, years: number[]): string {
  return period === 'all' ? `All years (${years[0]}-${years[years.length - 1]})` : String(period);
}
export function periodCsv(period: Period, years: number[]) {
  return { headers: ['period', 'start_year', 'end_year'], cells: [String(period), period === 'all' ? years[0] : period, period === 'all' ? years[years.length - 1] : period] };
}
