import type { Period } from '../../../src/lib/period';
import type { SortKey } from '../../../src/lib/sorting';
const period: Period = 'all';
const year: Period = 2013;
const home: SortKey<'home'> = 'name';
const section: SortKey<'section'> = 'kind';
const years: SortKey<'years'> = 'year';
const groups: SortKey<'groups'> = 'group';
const chapters: SortKey<'chapters'> = 'description';
// @ts-expect-error Annual years cannot be string sentinels.
const badPeriod: Period = '2013';
// @ts-expect-error Period has exactly one string sentinel.
const badSentinel: Period = 'ALL';
// @ts-expect-error Year is not a home sorting key.
const badHome: SortKey<'home'> = 'year';
// @ts-expect-error Chapter belongs to a different table.
const badSection: SortKey<'section'> = 'chapter';
// @ts-expect-error Partner names are absent from annual rows.
const badYears: SortKey<'years'> = 'name';
// @ts-expect-error Balance is not a displayed group column.
const badGroups: SortKey<'groups'> = 'balance';
// @ts-expect-error Partner kind is absent from chapter rows.
const badChapters: SortKey<'chapters'> = 'kind';
void [period,year,home,section,years,groups,chapters,badPeriod,badSentinel,badHome,badSection,badYears,badGroups,badChapters];
