// Task 2: for each of 5700, EU, 1610, 6022, the partner trend chart on
// /partner/<code>?year=<latest> must render one point per year whose
// value is observed/confirmed_zero (imports, exports) or observed
// (balance), independently recomputed from
// data/<snapshot_id>/partner/<code>.json, never from the running app's
// own computation.

import fs from 'node:fs';
import path from 'node:path';
import { REPO_ROOT } from '../lib/server.mjs';
import { waitForStableLineDotCounts, countsBySeries } from '../lib/chart.mjs';
import { config } from '../playwright.config.mjs';

function expectedCounts(snapshotId, code) {
  const file = path.join(REPO_ROOT, 'data', snapshotId, 'partner', `${code}.json`);
  const doc = JSON.parse(fs.readFileSync(file, 'utf-8'));
  const years = doc.years;
  const isAdditive = (fv) => fv.status === 'observed' || fv.status === 'confirmed_zero';
  return {
    totalYears: years.length,
    imports: years.filter((y) => isAdditive(y.imports)).length,
    exports: years.filter((y) => isAdditive(y.exports)).length,
    balance: years.filter((y) => y.balance.status === 'observed').length,
  };
}

export function registerPartnerTrendTests({ test, skip }, ctx) {
  const { page, baseUrl, snapshotId, latestYear } = ctx;

  for (const code of config.chartCheckPartnerCodes) {
    test(`e2e partner trend chart point counts match observed years: ${code}`, async () => {
      const dataFile = path.join(REPO_ROOT, 'data', snapshotId, 'partner', `${code}.json`);
      if (!fs.existsSync(dataFile)) {
        return skip(`not run: data/${snapshotId}/partner/${code}.json does not exist`);
      }
      const expected = expectedCounts(snapshotId, code);

      const url = `${baseUrl}partner/${code}?year=${latestYear}`;
      const response = await page.goto(url, { waitUntil: 'networkidle', timeout: config.navigationTimeoutMs });
      if (!response || response.status() !== 200) {
        throw new Error(`navigation to ${url} did not return 200 (got ${response ? response.status() : 'no response'})`);
      }
      await page.waitForSelector('.recharts-wrapper', { timeout: config.navigationTimeoutMs });
      const counts = await waitForStableLineDotCounts(page, {
        pollMs: config.chartStabilizePollMs,
        maxWaitMs: config.chartStabilizeMaxWaitMs,
      });
      const actual = countsBySeries(counts, config.seriesStrokeColors);

      const mismatches = [];
      for (const series of ['imports', 'exports', 'balance']) {
        if (actual[series] !== expected[series]) {
          mismatches.push(`${series} actual=${actual[series]} expected=${expected[series]}`);
        }
      }
      if (code === '6022') {
        // Norfolk Island has absent years, per the task: every series
        // must render fewer points than total configured years.
        for (const series of ['imports', 'exports', 'balance']) {
          if (typeof actual[series] === 'number' && actual[series] >= expected.totalYears) {
            mismatches.push(
              `${series} expected fewer than totalYears=${expected.totalYears} for Norfolk Island (absent years), got ${actual[series]}`,
            );
          }
        }
      }
      if (mismatches.length > 0) {
        throw new Error(`${code}: ${mismatches.join('; ')} (raw dom counts: ${JSON.stringify(counts)})`);
      }
      return { code, url, expected, actual };
    });
  }
}
