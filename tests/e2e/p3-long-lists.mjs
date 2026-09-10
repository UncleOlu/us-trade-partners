// P3 long-lists acceptance suite (docs/p3-long-lists.md). Same harness,
// static server (built dist/, real 404 status), and report pattern as
// tests/e2e/p1-hardening.mjs and tests/e2e/p2-polish.mjs (read before
// writing this file).
//
// Independence: every expected value below is computed from the approved
// contract (docs/p3-long-lists.md), docs/SPEC.md UI RULES, and the saved
// snapshot data under data/<snapshot_id>/, read through
// tests/e2e/lib/sorting-expected.mjs and tests/e2e/lib/all-years-expected.mjs.
// No value here is copied from src/. Agent D never reads pipeline/ or the
// application source under src/.
//
// Default-sort assumption used throughout (route has no explicit
// section_sort/section_dir/rank): docs/SPEC.md UI RULES "Keep initial
// defaults: ... other tables by descending total trade." The section
// ranking table is one of the "other tables", so its default sort key is
// total_trade_value descending, and its default rank metric (per UI RULES
// "financial rank remains the descending rank for the selected money
// metric") is also total_trade_value. This mirrors the identical hard-coded
// assumption already used for the home table in tests/e2e/p1-hardening.mjs.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { startStaticServer } from './lib/static-server.mjs';
import { test, runAll, formatResults } from './lib/harness.mjs';
import { annualRows, expectedOrder, flowValue, read } from './lib/sorting-expected.mjs';
import { years as coverageYears, expectedSection, readAnnual as readAllYears } from './lib/all-years-expected.mjs';

const output = process.env.TEST_REPORT_DIR ?? 'reports/tests/p3';
fs.mkdirSync(output, { recursive: true });

const server = await startStaticServer();
const browser = await chromium.launch();

async function pageTest(fn, options = { viewport: { width: 1280, height: 900 } }) {
  const page = await browser.newPage(options);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  try {
    await fn(page);
    assert.deepEqual(errors, []);
  } finally {
    await page.close();
  }
}

const visit = async (page, route) =>
  assert.equal((await page.goto(server.baseUrl + route, { waitUntil: 'networkidle' })).status(), 200);

// --- Shared helpers, duplicated locally per the established convention in
// p1-hardening.mjs / table-sorting.mjs / all-years.mjs (each suite is
// self-contained; there is no shared expectation-computation module beyond
// lib/sorting-expected.mjs and lib/all-years-expected.mjs). ------------------

function matchesSearch(record, query) {
  const q = query.toLowerCase();
  return record.name.toLowerCase().includes(q) || record.code.toLowerCase().includes(q);
}

function financialRankMap(rows, metric) {
  const sorted = expectedOrder(rows, (r) => flowValue(r, metric), (r) => r.code, 'desc');
  return new Map(sorted.map((r, i) => [r.code, flowValue(r, metric) === null ? null : i + 1]));
}

function rankCell(map, code) {
  const rank = map.get(code);
  return rank === null || rank === undefined ? '' : String(rank);
}

function usdCell(flow) {
  return flow.value === null ? '' : String(flow.value);
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let v = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (q && text[i + 1] === '"') {
        v += '"';
        i++;
      } else q = !q;
    } else if (c === ',' && !q) {
      row.push(v);
      v = '';
    } else if (c === '\n' && !q) {
      row.push(v.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      v = '';
    } else v += c;
  }
  const h = rows.shift();
  return rows.map((r) => Object.fromEntries(h.map((k, i) => [k, r[i]])));
}

async function downloadCsv(page, button) {
  const pending = page.waitForEvent('download');
  await button.click();
  const download = await pending;
  const raw = fs.readFileSync(await download.path(), 'utf8');
  return { filename: download.suggestedFilename(), raw, header: raw.split(/\r?\n/)[0], rows: parseCsv(raw) };
}

async function partnerIds(table) {
  return table.locator('tbody a[href*="/partner/"]').evaluateAll((a) =>
    a.map((e) => e.getAttribute('href').match(/partner\/([^/?]+)/)[1]),
  );
}

// Compares every column present in a downloaded CSV row against the
// independent original record, dispatching purely on column-name shape
// (`<field>_status`, `<field>_usd`, or the literal names the P3 contract
// names directly: code, name, kind, period, start_year, end_year, query,
// sort_key, sort_direction, rank_metric, rank). Throws on any unrecognized
// column so a header change is a visible failure here, not a silent skip.
function assertRow(row, original, context) {
  for (const key of Object.keys(row)) {
    if (['query', 'sort_key', 'sort_direction', 'rank_metric', 'rank'].includes(key)) continue; // asserted by the caller
    if (key === 'code') assert.equal(row.code, original.code, 'code');
    else if (key === 'name') assert.equal(row.name, original.name, 'name');
    else if (key === 'kind') assert.equal(row.kind, original.kind, 'kind');
    else if (key === 'period') assert.equal(row.period, context.period, 'period');
    else if (key === 'start_year') assert.equal(row.start_year, context.start_year, 'start_year');
    else if (key === 'end_year') assert.equal(row.end_year, context.end_year, 'end_year');
    else if (key.endsWith('_status')) {
      const field = key.slice(0, -'_status'.length);
      assert.equal(row[key], original[field].status, `${row.code ?? ''} ${key}`);
    } else if (key.endsWith('_usd')) {
      const field = key.slice(0, -'_usd'.length);
      assert.equal(row[key], usdCell(original[field]), `${row.code ?? ''} ${key}`);
    } else {
      throw new Error(`unexpected CSV column "${key}" with value "${row[key]}" (no independent comparison rule)`);
    }
  }
}

// --- 1. Default 25 rows, Show all / Show first 25 toggle (1280px) ----------

test('section default view shows 25 of M rows, Show all reveals the independent default order, Show first 25 returns and keeps focus', () =>
  pageTest(async (page) => {
    const rows = annualRows('section', undefined, 2013);
    const M = rows.length;
    await visit(page, 'section/XVI?year=2013');
    const table = page.locator('.section-ranking-table');
    assert.equal(await table.locator('tbody tr').count(), 25, 'default section view must show 25 rows');
    const status = await page.locator('main').innerText();
    assert.match(status, new RegExp(`Showing 25 of ${M} partners for`), status);

    const showAll = page.getByRole('button', { name: `Show all ${M}`, exact: true });
    assert.equal(await showAll.count(), 1, `expected a "Show all ${M}" button`);
    await showAll.click();
    assert.equal(await table.locator('tbody tr').count(), M, 'Show all must reveal every partner');
    const defaultOrder = expectedOrder(rows, (r) => flowValue(r, 'total_trade_value'), (r) => r.code, 'desc').map((r) => r.code);
    assert.deepEqual(await partnerIds(table), defaultOrder, 'Show all order must match the independent default (total_trade_value desc) order');

    const showFirst = page.getByRole('button', { name: 'Show first 25', exact: true });
    assert.equal(await showFirst.count(), 1, 'expected a "Show first 25" button once all rows are shown');
    await showFirst.click();
    assert.equal(await table.locator('tbody tr').count(), 25, 'Show first 25 must return to 25 rows');
    const focused = await page.evaluate(() => ({
      text: document.activeElement && document.activeElement.textContent && document.activeElement.textContent.trim(),
      tag: document.activeElement && document.activeElement.tagName,
    }));
    assert.equal(focused.tag, 'BUTTON', 'focus must remain on a button after Show first 25');
    assert.equal(focused.text, `Show all ${M}`, 'focus must remain on the toggle, now relabeled back to Show all');
  }));

// --- 2. Search: match set, feedback, status counts, toggle absent, URL -----
// persistence (refresh, Back, partner link, Hub round trip). ---------------

test('section search filters to the independent match set, reports feedback and status counts, hides the toggle, and section_q survives refresh, Back, a partner link and a Hub round trip', () =>
  pageTest(async (page) => {
    const rows = annualRows('section', undefined, 2013);
    const matched = rows.filter((r) => matchesSearch(r, 'an'));
    assert.equal(matched.length, 77, 'independent match count for "an" in section XVI 2013 partner names/codes');
    const filteredOrder = expectedOrder(matched, (r) => flowValue(r, 'total_trade_value'), (r) => r.code, 'desc').map((r) => r.code);

    await visit(page, 'section/XVI?year=2013&section_q=an');
    const table = page.locator('.section-ranking-table');
    assert.equal(await table.locator('tbody tr').count(), matched.length, 'row count must equal the independent match count');
    assert.deepEqual(await partnerIds(table), filteredOrder, 'search results must be in the independent default order');

    const status = await page.locator('main').innerText();
    const pattern = new RegExp(`Showing ${matched.length} of ${rows.length} partners for[\\s\\S]*?\\(${matched.length} match your search\\)\\.`);
    assert.match(status, pattern, status);

    // Feedback beside the field: bounded to a small ancestor of #section-search
    // (not the whole page) so a stray digit elsewhere in the document cannot
    // pass this check by coincidence, mirroring the ancestor-climb technique
    // in tests/e2e/p2-polish.mjs for "a note below the trend chart".
    const feedback = await page.evaluate((count) => {
      const input = document.getElementById('section-search');
      const re = new RegExp(`\\b${count}\\b[^\\d]{0,30}match`, 'i');
      let el = input ? input.parentElement : null;
      for (let i = 0; i < 4 && el; i += 1, el = el.parentElement) {
        if (re.test(el.textContent || '')) return true;
      }
      return false;
    }, matched.length);
    assert.ok(feedback, `expected feedback near #section-search reporting ${matched.length} matches`);

    assert.equal(await page.getByRole('button', { name: /^Show all|^Show first 25/ }).count(), 0, 'toggle must be absent while a search is active');

    // Audit follow-up item 2: exactly one "Clear search" button on the page
    // while the search has matches (the toolbar one; the empty state's own
    // "Clear search" button does not exist yet because there is no empty
    // state), and it lives inside .results-toolbar.
    const toolbarClear = page.locator('.results-toolbar').getByRole('button', { name: 'Clear search', exact: true });
    assert.equal(await toolbarClear.count(), 1, 'expected exactly one "Clear search" button inside .results-toolbar while the search has matches');
    assert.equal(
      await page.getByRole('button', { name: 'Clear search', exact: true }).count(),
      1,
      'expected exactly one "Clear search" button on the page while the search has matches',
    );

    // Refresh and Back preserve section_q, same pattern as the P1 search case
    // (tests/e2e/p1-hardening.mjs "home and both Hub searches survive direct
    // entry refresh and browser Back independently").
    const input = page.locator('#section-search');
    assert.equal(await input.inputValue(), 'an');
    await page.reload({ waitUntil: 'networkidle' });
    assert.equal(await input.inputValue(), 'an');
    await input.fill('China');
    assert.equal(new URL(page.url()).searchParams.get('section_q'), 'China');
    await page.goBack({ waitUntil: 'networkidle' });
    assert.equal(await input.inputValue(), 'an');
    assert.equal(new URL(page.url()).searchParams.get('year'), '2013');

    // A partner link from the section table carries section_q.
    const firstHref = await table.locator('tbody a[href*="/partner/"]').first().getAttribute('href');
    assert.match(firstHref, /section_q=an\b/, `partner link must carry section_q: ${firstHref}`);

    // Navigating to Hub and back via nav preserves it.
    const nav = page.getByRole('navigation', { name: 'Main navigation' });
    await nav.getByRole('link', { name: 'Hub', exact: true }).click();
    await page.waitForURL(/\/hub/);
    assert.equal(new URL(page.url()).searchParams.get('section_q'), 'an', 'section_q must ride along to Hub');
    await page.locator('a[href*="section/XVI?"]').click();
    await page.waitForURL(/section\/XVI/);
    assert.equal(new URL(page.url()).searchParams.get('section_q'), 'an');
    assert.equal(await page.locator('#section-search').inputValue(), 'an');
  }));

// --- 3. Both CSV scopes under search + sort (1280px) ------------------------

test('both CSV scopes stay correct with an active section search and sort on 2013', () =>
  pageTest(
    async (page) => {
      const rows = annualRows('section', undefined, 2013);
      const matched = rows.filter((r) => matchesSearch(r, 'an'));
      const sortKey = 'imports';
      const sortDirection = 'asc';
      const rankMetric = 'imports'; // per task: this route's rank metric is imports, matching its sort key.
      const rankMap = financialRankMap(rows, rankMetric);
      const fullOrder = expectedOrder(rows, (r) => flowValue(r, sortKey), (r) => r.code, sortDirection).map((r) => r.code);
      const filteredOrder = expectedOrder(matched, (r) => flowValue(r, sortKey), (r) => r.code, sortDirection).map((r) => r.code);
      const context = { period: '2013', start_year: '2013', end_year: '2013' };

      // Canonical full-export header, read from a no-search download.
      await visit(page, 'section/XVI?year=2013&section_sort=imports&section_dir=asc');
      const fullBtnNoSearch = page.getByRole('button', { name: 'Download CSV', exact: true });
      const canonical = await downloadCsv(page, fullBtnNoSearch);
      const cols = canonical.header.split(',');
      const codeIndex = cols.indexOf('code');
      assert.ok(codeIndex >= 0, `expected a "code" column in the full export header: ${canonical.header}`);
      const expectedFilteredHeader = [
        ...cols.slice(0, codeIndex),
        'query', 'sort_key', 'sort_direction', 'rank_metric', 'rank',
        ...cols.slice(codeIndex),
      ].join(',');

      await visit(page, 'section/XVI?year=2013&section_q=an&section_sort=imports&section_dir=asc');
      const fullBtn = page.getByRole('button', { name: 'Download CSV', exact: true });
      const filteredBtn = page.getByRole('button', { name: 'Download filtered results CSV', exact: true });
      assert.equal(await filteredBtn.count(), 1, 'filtered CSV button must appear once a search is active');

      const full = await downloadCsv(page, fullBtn);
      assert.equal(full.header, canonical.header, 'full export header must be unchanged by an active search');
      assert.equal(full.rows.length, rows.length, 'full export keeps every partner regardless of the active search');
      assert.deepEqual(full.rows.map((r) => r.code), fullOrder, 'full export keeps the full independently sorted order');
      for (const r of full.rows) {
        const original = rows.find((x) => x.code === r.code);
        assert.ok(original, `full row ${r.code} must exist in the independent partner set`);
        assertRow(r, original, context);
      }

      const filtered = await downloadCsv(page, filteredBtn);
      assert.equal(filtered.filename, 'section_XVI_2013_filtered.csv');
      assert.equal(filtered.header, expectedFilteredHeader, 'filtered header must be the full header with the 5 fields inserted before code');
      assert.equal(filtered.rows.length, matched.length);
      assert.deepEqual(filtered.rows.map((r) => r.code), filteredOrder, 'filtered export matches the sorted table order for matching partners only');
      for (const r of filtered.rows) {
        const original = matched.find((x) => x.code === r.code);
        assert.ok(original, `filtered row ${r.code} must be an "an" match`);
        assert.equal(r.query, 'an');
        assert.equal(r.sort_key, sortKey);
        assert.equal(r.sort_direction, sortDirection);
        assert.equal(r.rank_metric, rankMetric);
        assert.equal(r.rank, rankCell(rankMap, r.code), `${r.code} rank`);
        assertRow(r, original, context);
      }
    },
    { viewport: { width: 1280, height: 900 }, acceptDownloads: true },
  ));

// --- 4. year=all filtered export uses independent all-years section sums ---

test('filtered CSV for year=all uses independent all-years section sums for CANADA (1220)', () =>
  pageTest(
    async (page) => {
      // lib/all-years-expected.mjs exposes per-partner section sums directly
      // via expectedSection(id).partners, so this test reads that rather than
      // recomputing from data/<snapshot_id>/section/XVI.json by hand.
      const expected = expectedSection('XVI');
      const canada = expected.partners['1220'];
      assert.ok(canada, 'independent all-years section sums for partner 1220 must exist');
      const partnerMeta = readAllYears('partners.json').partners.find((p) => p.code === '1220');
      assert.equal(partnerMeta.name, 'CANADA');
      assert.equal(partnerMeta.kind, 'country');

      const rankRows = Object.entries(expected.partners).map(([code, v]) => ({ code, ...v }));
      const rankMap = financialRankMap(rankRows, 'total_trade_value');
      const context = { period: 'all', start_year: String(coverageYears[0]), end_year: String(coverageYears[coverageYears.length - 1]) };
      // recordExpected() (lib/all-years-expected.mjs) returns only the four
      // flow fields; the identity fields (code/name/kind) come from
      // partners.json separately, merged here so the generic assertRow
      // dispatch (by column-name shape) can check every CSV column.
      const original = { code: '1220', name: partnerMeta.name, kind: partnerMeta.kind, ...canada };

      await visit(page, 'section/XVI?year=all&section_q=Canada');
      const filteredBtn = page.getByRole('button', { name: 'Download filtered results CSV', exact: true });
      assert.equal(await filteredBtn.count(), 1);
      const { filename, header, rows: csv } = await downloadCsv(page, filteredBtn);
      assert.equal(filename, 'section_XVI_all_filtered.csv');
      assert.equal(csv.length, 1, 'only CANADA (1220) is expected to match the query "Canada"');
      const row = csv[0];
      assert.equal(row.code, '1220');
      assert.equal(row.query, 'Canada');
      assert.equal(row.sort_key, 'total_trade_value');
      assert.equal(row.sort_direction, 'desc');
      assert.equal(row.rank_metric, 'total_trade_value');
      assert.equal(row.rank, rankCell(rankMap, '1220'));
      assertRow(row, original, context);
      assert.ok(header.includes('code'), header);
    },
    { viewport: { width: 1280, height: 900 }, acceptDownloads: true },
  ));

// --- 5. Empty state and focus return ----------------------------------------

test('section empty state names the query, has guidance, and its Clear search returns focus and the default 25 rows', () =>
  pageTest(async (page) => {
    await visit(page, 'section/XVI?year=2013&section_q=zzzz');
    const emptyState = page.locator('.empty-state');
    await emptyState.waitFor();
    const heading = await emptyState.locator('h3').innerText();
    assert.ok(heading.includes('zzzz'), `empty-state h3 must contain "zzzz": ${JSON.stringify(heading)}`);
    const guidance = await emptyState.locator('p').innerText();
    assert.ok(guidance.trim().length > 0, 'empty-state p must be non-empty');
    const clearButton = emptyState.getByRole('button', { name: 'Clear search', exact: true });
    assert.equal(await clearButton.count(), 1, 'empty state must contain a button named exactly "Clear search"');

    // Audit follow-up item 2: two "Clear search" buttons total once the
    // empty state appears: the toolbar one (still active) plus the empty
    // state's own one.
    assert.equal(
      await page.getByRole('button', { name: 'Clear search', exact: true }).count(),
      2,
      'expected two "Clear search" buttons total on the empty-state route: one in .results-toolbar, one in .empty-state',
    );

    await clearButton.click();
    assert.equal(
      await page.evaluate(() => document.activeElement && document.activeElement.id),
      'section-search',
      'focus must return to #section-search after Clear search',
    );
    assert.equal(await page.locator('#section-search').inputValue(), '');
    assert.equal(new URL(page.url()).searchParams.has('section_q'), false, 'section_q must be removed from the URL');
    await page.waitForSelector('.section-ranking-table tbody tr');
    assert.equal(await page.locator('.section-ranking-table tbody tr').count(), 25, 'table must show the default 25 rows after reset');
  }));

// --- 6. Mobile height and overflow (390px) ----------------------------------

test('section page at 390px stays under 6,000px tall with no horizontal document overflow and an internally scrolling table region', () =>
  pageTest(
    async (page) => {
      const rows = annualRows('section', undefined, 2013);
      const M = rows.length;
      await visit(page, 'section/XVI?year=2013');
      const dims = await page.evaluate(() => ({
        height: document.documentElement.scrollHeight,
        scrollWidth: document.documentElement.scrollWidth,
        viewport: innerWidth,
      }));
      assert.ok(dims.height < 6000, `document height ${dims.height}px must be under 6,000px`);
      assert.ok(dims.scrollWidth <= dims.viewport + 1, JSON.stringify(dims));
      const region = page.locator('.table-scroll').first();
      await region.waitFor();
      const overflow = await region.evaluate((e) => ({ scrollWidth: e.scrollWidth, clientWidth: e.clientWidth }));
      assert.ok(overflow.scrollWidth > overflow.clientWidth, JSON.stringify(overflow));

      // Audit follow-up item 1: default 25 rows and the Show all / Show
      // first 25 toggle at 390px, same independent expectation as the
      // 1280px case above (M from the data, not from src/).
      const table = page.locator('.section-ranking-table');
      assert.equal(await table.locator('tbody tr').count(), 25, 'default section view must show 25 rows at 390px');
      const showAll = page.getByRole('button', { name: `Show all ${M}`, exact: true });
      assert.equal(await showAll.count(), 1, `expected a "Show all ${M}" button at 390px`);
      await showAll.click();
      assert.equal(await table.locator('tbody tr').count(), M, 'Show all must reveal every partner at 390px');
      const showFirst = page.getByRole('button', { name: 'Show first 25', exact: true });
      assert.equal(await showFirst.count(), 1, 'expected a "Show first 25" button once all rows are shown at 390px');
      await showFirst.click();
      assert.equal(await table.locator('tbody tr').count(), 25, 'Show first 25 must return to 25 rows at 390px');
    },
    { viewport: { width: 390, height: 844 } },
  ));

// --- 7. Zero reference line on the partner trend chart ----------------------

test('partner trend chart draws a .recharts-reference-line at the value-axis $0 tick', () =>
  pageTest(async (page) => {
    await visit(page, 'partner/1220?year=2025');
    const wrapper = page.locator('.recharts-wrapper').filter({ has: page.locator('.recharts-line') });
    assert.equal(await wrapper.count(), 1, 'expected exactly one trend chart wrapper');
    const ticks = await wrapper.locator('.recharts-yAxis .recharts-cartesian-axis-tick-value').evaluateAll((els) =>
      els.map((e) => {
        const r = e.getBoundingClientRect();
        return { text: (e.textContent || '').trim(), top: r.top, bottom: r.bottom, centerY: (r.top + r.bottom) / 2 };
      }),
    );
    const zeroTick = ticks.find((t) => t.text === '$0');
    assert.ok(zeroTick, `expected a value-axis tick labeled "$0" among: ${JSON.stringify(ticks.map((t) => t.text))}`);

    // Audit follow-up item 4: count on the unfiltered locator, not a
    // tautological count() on a .first() locator (a .first() locator's
    // count() is always 0 or 1 regardless of how many elements actually
    // match, so it can never catch "more than one reference line").
    const referenceLines = wrapper.locator('.recharts-reference-line line');
    assert.equal(await referenceLines.count(), 1, 'expected exactly one <line> element inside .recharts-reference-line');
    const referenceLine = referenceLines.first();
    const box = await referenceLine.boundingBox();
    assert.ok(box, 'reference line must have a bounding box');
    const lineCenterY = box.y + box.height / 2;
    assert.ok(Math.abs(lineCenterY - zeroTick.centerY) <= 1, `reference line y (${lineCenterY}) must equal the $0 tick y (${zeroTick.centerY}) within 1px`);

    // Audit follow-up item 3a: a solid line (no dash pattern).
    const dashArray = await referenceLine.getAttribute('stroke-dasharray');
    assert.ok(
      dashArray === null || dashArray.trim() === '',
      `reference line must be solid (stroke-dasharray absent or empty), got: ${JSON.stringify(dashArray)}`,
    );

    // Audit follow-up item 3b: rendered before the series paths in DOM
    // order, so the series lines paint on top of it. querySelectorAll with
    // a comma-separated selector list returns matches in document (tree)
    // order regardless of the order the selectors are written in, so the
    // first matching element's class identifies whichever kind of element
    // appears earliest in the DOM.
    const order = await wrapper.evaluate((el) =>
      [...el.querySelectorAll('.recharts-reference-line, .recharts-line')].map((n) =>
        n.classList.contains('recharts-reference-line') ? 'reference' : 'series',
      ),
    );
    const firstReferenceIndex = order.indexOf('reference');
    const firstSeriesIndex = order.indexOf('series');
    assert.ok(
      firstReferenceIndex >= 0 && firstSeriesIndex >= 0,
      `expected both a reference line and series lines in DOM order: ${JSON.stringify(order)}`,
    );
    assert.ok(
      firstReferenceIndex < firstSeriesIndex,
      `reference line must be rendered before the series paths in DOM order: ${JSON.stringify(order)}`,
    );
  }));

// --- 8. Empty-state heading cap on home and section -------------------------

test('empty-state headings on home and section cap the query at 60 characters plus an ellipsis while the field and URL keep the full query', () =>
  pageTest(async (page) => {
    const query = 'a'.repeat(80);
    const cappedHeading = 'a'.repeat(60) + '…';
    const overrun = 'a'.repeat(61);

    await visit(page, `?year=2025&home_q=${query}`);
    const homeHeading = await page.locator('.empty-state h3').innerText();
    assert.ok(homeHeading.includes(cappedHeading), `home empty-state h3 must contain 60 a's plus ellipsis: ${JSON.stringify(homeHeading)}`);
    assert.ok(!homeHeading.includes(overrun), `home empty-state h3 must not contain 61 a's: ${JSON.stringify(homeHeading)}`);
    assert.equal(await page.locator('#partner-search').inputValue(), query, 'home search field must keep the full 80-character query');

    await visit(page, `section/XVI?year=2025&section_q=${query}`);
    const sectionHeading = await page.locator('.empty-state h3').innerText();
    assert.ok(sectionHeading.includes(cappedHeading), `section empty-state h3 must contain 60 a's plus ellipsis: ${JSON.stringify(sectionHeading)}`);
    assert.ok(!sectionHeading.includes(overrun), `section empty-state h3 must not contain 61 a's: ${JSON.stringify(sectionHeading)}`);
    assert.equal(await page.locator('#section-search').inputValue(), query, 'section search field must keep the full 80-character query');

    // Audit follow-up item 5a: 70 copies of a two-code-unit (surrogate pair)
    // character must cap at 60 whole characters, not 30 (a naive
    // str.slice(0,60) on UTF-16 code units would keep only 30 whole
    // characters here since each one is 2 code units) and not a broken
    // half-pair. Tested on home only; section shares the same cap logic
    // already exercised by the ASCII case above.
    const globe = '\u{1F30D}';
    const globeQuery = globe.repeat(70);
    await visit(page, `?year=2025&home_q=${encodeURIComponent(globeQuery)}`);
    const globeHeading = await page.locator('.empty-state h3').innerText();
    const loneSurrogate = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:^|[^\uD800-\uDBFF])[\uDC00-\uDFFF]/;
    assert.ok(!loneSurrogate.test(globeHeading), `heading must not contain a broken (lone) surrogate: ${JSON.stringify(globeHeading)}`);
    assert.ok(
      globeHeading.includes(globe.repeat(60) + '…'),
      `heading must contain exactly 60 whole globe characters immediately followed by the ellipsis: ${JSON.stringify(globeHeading)}`,
    );
    assert.ok(!globeHeading.includes(globe.repeat(61)), `heading must not contain 61 whole globe characters: ${JSON.stringify(globeHeading)}`);
    assert.equal(await page.locator('#partner-search').inputValue(), globeQuery, 'home search field must keep the full 70-character astral query');

    // Audit follow-up item 5b: a combining sequence (base character plus a
    // combining mark) straddling the 60/61 boundary must not be split, i.e.
    // the base character must not appear alone immediately before the
    // ellipsis with its mark dropped. What this can verify in the DOM: only
    // the literal rendered text at the boundary (whether "e" directly
    // precedes the ellipsis without "e"+U+0301 together); it cannot inspect
    // any internal segmentation logic the app may or may not use.
    const combiningMark = '\u0301'; // combining acute accent, decomposed form
    const combiningQuery = 'a'.repeat(59) + 'e' + combiningMark + 'z'.repeat(10);
    await visit(page, `?year=2025&home_q=${encodeURIComponent(combiningQuery)}`);
    const combiningHeading = await page.locator('.empty-state h3').innerText();
    // A "split" is a bare "e" (no combining mark attached) immediately
    // followed by the ellipsis. Written with an explicit \u escape, not a
    // literal special character, so there is no ambiguity between the
    // decomposed sequence "e"+U+0301 and the precomposed character U+00E9.
    const bareEPattern = new RegExp(`e(?!${combiningMark})\u2026`);
    const markedEPattern = new RegExp(`e${combiningMark}\u2026`);
    const bareEBeforeEllipsis = bareEPattern.test(combiningHeading) && !markedEPattern.test(combiningHeading);
    assert.ok(
      !bareEBeforeEllipsis,
      `combining sequence must not split at the truncation boundary (bare "e" before the ellipsis, mark dropped): ${JSON.stringify(combiningHeading)}`,
    );
    assert.equal(await page.locator('#partner-search').inputValue(), combiningQuery, 'home search field must keep the full combining-sequence query');
  }));

try {
  const results = await runAll();
  console.log(formatResults(results));
  fs.writeFileSync(path.join(output, 'browser-results.json'), JSON.stringify({ results }, null, 2) + '\n');
  if (results.some((r) => r.status !== 'PASS')) process.exitCode = 1;
} finally {
  await browser.close();
  await server.stop();
}
