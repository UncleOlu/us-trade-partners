// P2 visual polish acceptance suite (docs/p2-visual-polish.md). Same harness,
// static server (built dist/, real 404 status), and report pattern as
// tests/e2e/p1-hardening.mjs (read before writing this file).
//
// Independence: every expected value below is computed from the approved
// contract (docs/p2-visual-polish.md), docs/SPEC.md UI RULES, the saved
// snapshot data under data/<snapshot_id>/, and Recharts' own generated DOM
// class names (recharts-legend-item-text, recharts-tooltip-wrapper,
// recharts-line, recharts-bar, recharts-xAxis, recharts-cartesian-axis-tick-value),
// verified once by live DOM inspection against the pre-P2 build (documented
// inline at each selector's first use below). No value here is copied from
// src/.
//
// Selector note (task 3): the task suggested
// '.recharts-bar-chart .recharts-xaxis .recharts-cartesian-axis-tick-value'.
// Live inspection of the rendered chart found no '.recharts-bar-chart'
// wrapper class (Recharts does not add a chart-type class to the wrapper)
// and Recharts' own axis class is camelCase 'recharts-xAxis', not
// 'recharts-xaxis'. This file identifies the bar chart by the presence of a
// '.recharts-bar' element inside a '.recharts-wrapper' (unambiguous: only a
// <Bar> series renders that class) and reads tick text from
// '.recharts-xAxis .recharts-cartesian-axis-tick-value' within that wrapper.
// Both class names are Recharts library output, not app-specific choices,
// so this selector does not depend on Agent B's implementation of the P2
// contract, only on Recharts continuing to be the charting library (already
// fixed by docs/SPEC.md STACK).
//
// Home toolbar "Clear search" evidence (task 4, last item): docs/p2-visual-polish.md
// "Findings from the P1 build" states as of the pre-P2 build "home has a
// heading and guidance but its clear action is elsewhere" -- i.e. a Clear
// search control already exists outside the empty state when a search is
// active. The P2 contract's required behavior 4 says "Home keeps its
// toolbar 'Clear search' button." This suite treats that existing toolbar
// control's accessible name, 'Clear search', as the independent expectation
// for that control, distinct from the new in-empty-state 'Reset search'
// button.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { startStaticServer } from './lib/static-server.mjs';
import { test, runAll, formatResults } from './lib/harness.mjs';
import { read } from './lib/sorting-expected.mjs';
import { waitForStableLineDotCounts, countsBySeries } from './lib/chart.mjs';
import { config } from './playwright.config.mjs';

const output = process.env.TEST_REPORT_DIR ?? 'reports/tests/p2';
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

// --- Independent expected values -------------------------------------------------

// 22 HS section group ids, read directly from the snapshot data file, never
// from src/. Matches docs/SPEC.md CATEGORIES: "Level 1: the 21 HS sections
// plus one group 'Special classification'".
const hsSections = read('hs_sections.json');
const groupIds = hsSections.groups.map((g) => g.id).sort();
assert.equal(groupIds.length, 22, 'independent group id count from hs_sections.json must be 22');

// Coverage years, read from meta.json (start_year/end_year), used for the
// regression-guard 13-dot expectation (2025 - 2013 + 1 = 13 configured
// annual years), independent of any UI code.
const meta = read('meta.json');
const startYear = meta.configured_coverage.start_year;
const endYear = meta.configured_coverage.end_year;
const configuredYearCount = endYear - startYear + 1;

// --- Chart identification helpers (Recharts library classes only) ---------------

/**
 * Returns { trend, bar } Playwright locators for the two Recharts chart
 * wrappers on the partner page, identified by the presence of a
 * '.recharts-line' (trend / LineChart) or '.recharts-bar' (bar chart /
 * BarChart) descendant. Both are Recharts-generated class names, not
 * app-specific ones.
 */
function identifyPartnerCharts(page) {
  const wrappers = page.locator('.recharts-wrapper');
  const trend = wrappers.filter({ has: page.locator('.recharts-line') });
  const bar = wrappers.filter({ has: page.locator('.recharts-bar') });
  return { trend, bar };
}

async function legendTexts(locator) {
  return locator.locator('.recharts-legend-item-text').evaluateAll((els) => els.map((e) => e.textContent));
}

// --- 1. Group button alignment at 390px --------------------------------------------

test('a wrapped group-button label is left aligned and the button stays at the left of its cell (390px)', () =>
  pageTest(
    async (page) => {
      await visit(page, 'partner/1220?year=2025');
      const found = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('.group-button'));
        for (const button of buttons) {
          const range = document.createRange();
          range.selectNodeContents(button);
          const rects = Array.from(range.getClientRects());
          if (rects.length > 1) {
            const buttonRect = button.getBoundingClientRect();
            const cell = button.closest('td') ?? button.parentElement;
            const cellRect = cell.getBoundingClientRect();
            return {
              text: button.textContent,
              rectCount: rects.length,
              textAlign: getComputedStyle(button).textAlign,
              firstRectLeft: rects[0].left,
              buttonLeft: buttonRect.left,
              cellLeft: cellRect.left,
            };
          }
        }
        return null;
      });
      assert.ok(found, 'expected at least one group-button label to wrap to 2+ lines at 390px');
      assert.equal(found.textAlign, 'left', `text-align for wrapped button "${found.text}"`);
      assert.ok(
        Math.abs(found.firstRectLeft - found.buttonLeft) <= 16,
        `first text rect left (${found.firstRectLeft}) not within 16px of button left (${found.buttonLeft}) for "${found.text}"`,
      );
      assert.ok(
        Math.abs(found.buttonLeft - found.cellLeft) <= 16,
        `button left (${found.buttonLeft}) not within 16px of cell left (${found.cellLeft}) for "${found.text}"`,
      );
    },
    { viewport: { width: 390, height: 844 } },
  ));

// --- 2. Chart series names, legend, note, tooltip -----------------------------------

test('partner trend chart legend reads exactly Imports, Exports, Balance', () =>
  pageTest(async (page) => {
    await visit(page, 'partner/1220?year=2025');
    const { trend } = identifyPartnerCharts(page);
    assert.deepEqual(await legendTexts(trend), ['Imports', 'Exports', 'Balance']);
  }));

test('partner product-group bar chart legend reads exactly Imports, Exports', () =>
  pageTest(async (page) => {
    await visit(page, 'partner/1220?year=2025');
    const { bar } = identifyPartnerCharts(page);
    assert.deepEqual(await legendTexts(bar), ['Imports', 'Exports']);
  }));

test('section trend chart legend reads exactly Imports, Exports', () =>
  pageTest(async (page) => {
    await visit(page, 'section/XVI?year=2025');
    const wrapper = page.locator('.recharts-wrapper').filter({ has: page.locator('.recharts-line') });
    assert.deepEqual(await legendTexts(wrapper), ['Imports', 'Exports']);
  }));

test('every legend text on the partner page has computed font-size at least 13.6px', () =>
  pageTest(async (page) => {
    await visit(page, 'partner/1220?year=2025');
    const sizes = await page.locator('.recharts-legend-item-text').evaluateAll((els) =>
      els.map((e) => parseFloat(getComputedStyle(e).fontSize)),
    );
    assert.ok(sizes.length > 0, 'expected at least one legend text element');
    for (const size of sizes) assert.ok(size >= 13.6, `legend font-size ${size}px is below 13.6px (0.85rem)`);
  }));

test('a note below the trend chart, inside the trend chart section, states balance is exports minus imports', () =>
  pageTest(async (page) => {
    await visit(page, 'partner/1220?year=2025');
    // Containment: climb from the jump-link target '#trend-chart-heading'
    // (verified present on the pre-P2 build) to the nearest ancestor whose
    // full text matches /exports minus imports/i. That ancestor is "the
    // trend chart section" for this check, independent of any class name
    // choice B makes for the note element itself.
    const containerHandle = await page.evaluateHandle(({ pattern }) => {
      const heading = document.getElementById('trend-chart-heading');
      if (!heading) return null;
      const re = new RegExp(pattern, 'i');
      let el = heading;
      for (let i = 0; i < 8 && el; i += 1, el = el.parentElement) {
        if (re.test(el.textContent ?? '')) return el;
      }
      return null;
    }, { pattern: 'exports minus imports' });
    const containerExists = await page.evaluate((el) => el !== null, containerHandle);
    assert.ok(containerExists, 'no ancestor of #trend-chart-heading matches /exports minus imports/i');

    // Geometric: contract wording is "under the partner trend chart"
    // (docs/p2-visual-polish.md, Required behavior 2). The note's own
    // bounding box top must sit at or below the trend chart's
    // '.recharts-wrapper' bounding box bottom. The note text node is found
    // only inside the container located above, so it cannot match an
    // unrelated "exports minus imports" phrase elsewhere on the page (a
    // live-DOM check on the pre-P2 build found a second, unrelated match in
    // a '.stat-detail' element well above the chart).
    const { trend } = identifyPartnerCharts(page);
    const chartBox = await trend.first().boundingBox();
    assert.ok(chartBox, 'trend chart must have a bounding box');
    const noteRect = await page.evaluate(
      ({ pattern }) => {
        const heading = document.getElementById('trend-chart-heading');
        const re = new RegExp(pattern, 'i');
        let container = heading;
        for (let i = 0; i < 8 && container; i += 1, container = container.parentElement) {
          if (re.test(container.textContent ?? '')) break;
        }
        if (!container) return null;
        const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
        let node;
        let lowest = null;
        while ((node = walker.nextNode())) {
          if (re.test(node.textContent ?? '')) {
            const range = document.createRange();
            range.selectNodeContents(node);
            const rect = range.getBoundingClientRect();
            if (!lowest || rect.top > lowest.top) lowest = rect.toJSON ? rect.toJSON() : rect;
          }
        }
        return lowest;
      },
      { pattern: 'exports minus imports' },
    );
    assert.ok(noteRect, 'no "exports minus imports" text node found inside the trend chart section');
    const chartBottom = chartBox.y + chartBox.height;
    assert.ok(
      noteRect.top >= chartBottom - 1,
      `note top (${noteRect.top}) must be at or below the trend chart bottom (${chartBottom}); note has not moved under the chart yet`,
    );
  }));

test('hovering the trend chart shows a tooltip with Imports and not lowercase imports', () =>
  pageTest(async (page) => {
    await visit(page, 'partner/1220?year=2025');
    const { trend } = identifyPartnerCharts(page);
    const box = await trend.first().boundingBox();
    assert.ok(box, 'trend chart must have a bounding box');
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await page.mouse.move(x - 5, y);
    await page.mouse.move(x, y, { steps: 5 });
    const tooltip = page.locator('.recharts-tooltip-wrapper').first();
    await tooltip.waitFor({ state: 'visible' });
    const text = await tooltip.innerText();
    assert.ok(text.trim().length > 0, 'tooltip must have visible text after hovering the trend chart');
    assert.ok(text.includes('Imports'), `tooltip text must include "Imports": ${JSON.stringify(text)}`);
    assert.ok(!/\bimports\b/.test(text), `tooltip text must not include standalone lowercase "imports": ${JSON.stringify(text)}`);
  }));

// --- 3. Bar chart labels ------------------------------------------------------------

async function barChartTickTexts(page) {
  const { bar } = identifyPartnerCharts(page);
  return bar
    .first()
    .locator('.recharts-xAxis .recharts-cartesian-axis-tick-value')
    .evaluateAll((els) => els.map((e) => e.textContent));
}

for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  test(`bar chart shows every section label at ${viewport.width}px`, () =>
    pageTest(
      async (page) => {
        await visit(page, 'partner/1220?year=2025');
        const texts = await barChartTickTexts(page);
        assert.equal(texts.length, groupIds.length, `expected ${groupIds.length} bar x-axis tick labels, got ${texts.length}: ${JSON.stringify(texts)}`);
        assert.deepEqual([...texts].sort(), groupIds, `bar x-axis tick label set must equal the HS section group ids: ${JSON.stringify(texts)}`);
      },
      { viewport },
    ));
}

// --- 4. Empty states and focus return ------------------------------------------------

test('home empty state names the query, has guidance, and Reset search returns focus and the full list', () =>
  pageTest(async (page) => {
    await visit(page, '?year=2025&home_q=zzzz');
    const emptyState = page.locator('.empty-state');
    await emptyState.waitFor();
    const heading = await emptyState.locator('h3').innerText();
    assert.ok(heading.includes('zzzz'), `empty-state h3 must contain "zzzz": ${JSON.stringify(heading)}`);
    const guidance = await emptyState.locator('p').innerText();
    assert.ok(guidance.trim().length > 0, 'empty-state p must be non-empty');
    const resetButton = emptyState.getByRole('button', { name: 'Reset search', exact: true });
    assert.equal(await resetButton.count(), 1, 'empty state must contain a button named exactly "Reset search"');
    await resetButton.click();
    assert.equal(
      await page.evaluate(() => document.activeElement && document.activeElement.id),
      'partner-search',
      'focus must return to #partner-search after Reset search',
    );
    assert.equal(await page.locator('#partner-search').inputValue(), '');
    assert.equal(new URL(page.url()).searchParams.has('home_q'), false, 'home_q must be removed from the URL');
    await page.waitForSelector('.home-ranking-table tbody tr');
    assert.equal(await page.locator('.home-ranking-table tbody tr').count(), 25, 'table must show the default 25 rows after reset');
  }));

test('home toolbar Clear search still exists while a search is active', () =>
  pageTest(async (page) => {
    await visit(page, '?year=2025&home_q=Canada');
    const toolbarClear = page.getByRole('button', { name: 'Clear search', exact: true });
    assert.equal(await toolbarClear.count(), 1, 'home toolbar Clear search button must exist with an active search');
  }));

test('hub empty states name each query, have guidance, and their clear actions return focus', () =>
  pageTest(async (page) => {
    await visit(page, 'hub?hub_q=zzzz&hub_sections_q=zzzz');
    const emptyStates = page.locator('.empty-state');
    await emptyStates.first().waitFor();
    assert.equal(await emptyStates.count(), 2, 'both hub empty states must be present');
    for (let i = 0; i < 2; i += 1) {
      const state = emptyStates.nth(i);
      const heading = await state.locator('h3').innerText();
      assert.ok(heading.includes('zzzz'), `hub empty-state[${i}] h3 must contain "zzzz": ${JSON.stringify(heading)}`);
      const guidance = await state.locator('p').innerText();
      assert.ok(guidance.trim().length > 0, `hub empty-state[${i}] p must be non-empty`);
    }
    const clearPartners = page.getByRole('button', { name: 'Clear search', exact: true });
    await clearPartners.click();
    assert.equal(
      await page.evaluate(() => document.activeElement && document.activeElement.id),
      'hub-partner-search',
      'focus must move to #hub-partner-search after Clear search',
    );
    assert.equal(new URL(page.url()).searchParams.has('hub_q'), false, 'hub_q must be removed from the URL');

    await visit(page, 'hub?hub_q=zzzz&hub_sections_q=zzzz');
    const clearSections = page.getByRole('button', { name: 'Clear product search', exact: true });
    await clearSections.click();
    assert.equal(
      await page.evaluate(() => document.activeElement && document.activeElement.id),
      'hub-section-search',
      'focus must move to #hub-section-search after Clear product search',
    );
    assert.equal(new URL(page.url()).searchParams.has('hub_sections_q'), false, 'hub_sections_q must be removed from the URL');
  }));

// --- 5. Mobile controls at 390px -----------------------------------------------------

test('jump links are at least 44x44, heading-row buttons span their cell width, and the document has no horizontal overflow (390px)', () =>
  pageTest(
    async (page) => {
      await visit(page, 'partner/1220?year=2025');
      const jumpLinkSizes = await page.locator('.jump-links a').evaluateAll((els) =>
        els.map((e) => e.getBoundingClientRect()).map((r) => ({ width: r.width, height: r.height })),
      );
      assert.ok(jumpLinkSizes.length > 0, 'expected at least one .jump-links a element');
      for (const size of jumpLinkSizes) {
        assert.ok(size.height >= 44, `jump link height ${size.height} below 44px`);
        assert.ok(size.width >= 44, `jump link width ${size.width} below 44px`);
      }
      const headingRowButtons = await page.locator('.section-heading-row > button').evaluateAll((els) =>
        els.map((e) => {
          const parent = e.parentElement;
          const style = getComputedStyle(parent);
          const contentWidth =
            parent.clientWidth - parseFloat(style.paddingLeft || '0') - parseFloat(style.paddingRight || '0');
          return { buttonWidth: e.getBoundingClientRect().width, contentWidth };
        }),
      );
      assert.ok(headingRowButtons.length > 0, 'expected at least one .section-heading-row > button');
      for (const { buttonWidth, contentWidth } of headingRowButtons) {
        assert.ok(
          Math.abs(buttonWidth - contentWidth) <= 2,
          `heading-row button width ${buttonWidth} not within 2px of parent content width ${contentWidth}`,
        );
      }
      const dims = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, viewport: innerWidth }));
      assert.equal(dims.doc, dims.viewport, JSON.stringify(dims));
    },
    { viewport: { width: 390, height: 844 } },
  ));

// --- 6. Regression guard --------------------------------------------------------------

test('partner trend chart still has 3 line series with 13 dots each, bar chart still has 2 bar series', () =>
  pageTest(async (page) => {
    await visit(page, 'partner/1220?year=2025');
    const counts = await waitForStableLineDotCounts(page, {
      pollMs: config.chartStabilizePollMs,
      maxWaitMs: config.chartStabilizeMaxWaitMs,
    });
    assert.equal(counts.length, 3, `expected 3 .recharts-line series, got ${counts.length}`);
    const bySeries = countsBySeries(counts, config.seriesStrokeColors);
    for (const series of ['imports', 'exports', 'balance']) {
      assert.equal(bySeries[series], configuredYearCount, `${series} dot count must equal ${configuredYearCount} configured years, got ${bySeries[series]}`);
    }
    const { bar } = identifyPartnerCharts(page);
    const barSeriesCount = await bar.first().locator('.recharts-bar').count();
    assert.equal(barSeriesCount, 2, `expected 2 .recharts-bar series, got ${barSeriesCount}`);
  }));

test('section trend chart still has 2 line series', () =>
  pageTest(async (page) => {
    await visit(page, 'section/XVI?year=2025');
    const lineCount = await page.locator('.recharts-line').count();
    assert.equal(lineCount, 2, `expected 2 .recharts-line series on the section trend chart, got ${lineCount}`);
  }));

// -------------------------------------------------------------------------------------

try {
  const results = await runAll();
  console.log(formatResults(results));
  fs.writeFileSync(path.join(output, 'browser-results.json'), JSON.stringify({ results }, null, 2) + '\n');
  if (results.some((r) => r.status !== 'PASS')) process.exitCode = 1;
} finally {
  await browser.close();
  await server.stop();
}
