#!/usr/bin/env node
// Build-time check: loads the built methodology page in headless Chromium and
// fails the build if any {{ marker was left unfilled, or if the rendered
// snapshot id, fetched_at, latest_period, coverage, or code_commit disagree
// with data/<snapshot_id>/meta.json. Run after `vite build` (and after
// generate-routes.mjs, so dist/methodology/index.html exists).

import { chromium } from 'playwright';
import { preview } from 'vite';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function normalizeBasePath(raw) {
  let p = raw.trim();
  if (!p.startsWith('/')) p = '/' + p;
  if (!p.endsWith('/')) p = p + '/';
  return p;
}

const basePath = normalizeBasePath(process.env.VITE_BASE_PATH ?? '/us-trade-partners/');

async function readSnapshotId() {
  const raw = await fs.readFile(path.join(rootDir, 'reports', 'pipeline', 'last_snapshot_id.txt'), 'utf-8');
  return raw.trim();
}

async function main() {
  const snapshotId = await readSnapshotId();
  const meta = JSON.parse(
    await fs.readFile(path.join(rootDir, 'data', snapshotId, 'meta.json'), 'utf-8'),
  );

  const server = await preview({ preview: { port: 0, host: '127.0.0.1' } });
  let browser;
  let exitCode = 0;
  try {
    const address = server.httpServer.address();
    if (!address || typeof address === 'string') throw new Error('Preview has no TCP address');
    const baseUrl = `http://127.0.0.1:${address.port}${basePath}`;

    browser = await chromium.launch();
    const page = await browser.newPage();
    await page.goto(baseUrl.replace(/\/$/, '') + '/methodology', {
      waitUntil: 'networkidle',
      timeout: 30000,
    });

    const bodyText = await page.evaluate(() => document.body.innerText);

    const remainingMarkers = bodyText.match(/\{\{[^}]*\}\}/g) ?? [];
    if (remainingMarkers.length > 0) {
      console.error(
        `[check-methodology] FAIL: ${remainingMarkers.length} unfilled {{ }} marker(s) remain: ` +
          remainingMarkers.join(', '),
      );
      exitCode = 1;
    } else {
      console.log('[check-methodology] PASS: no unfilled {{ }} markers');
    }

    const checks = [
      ['snapshot_id', meta.snapshot_id],
      ['fetched_at', meta.fetched_at],
      ['latest_period', meta.latest_period],
      ['configured_coverage.start_year', String(meta.configured_coverage.start_year)],
      ['configured_coverage.end_year', String(meta.configured_coverage.end_year)],
      ['verified_availability.from_year', String(meta.verified_availability.from_year)],
      ['verified_availability.to_year', String(meta.verified_availability.to_year)],
      ['documented_availability.from_year', String(meta.documented_availability.from_year)],
      ['code_commit', meta.code_commit],
    ];

    console.log('');
    console.log('field                                | meta.json value                              | found on rendered page');
    console.log('-'.repeat(120));
    for (const [field, expected] of checks) {
      const found = bodyText.includes(expected);
      console.log(`${field.padEnd(37)} | ${expected.padEnd(45)} | ${found ? 'yes' : 'NO'}`);
      if (!found) exitCode = 1;
    }

  } finally {
    await browser?.close();
    await new Promise((resolve, reject) => server.httpServer.close((error) => error ? reject(error) : resolve()));
  }

  if (exitCode !== 0) {
    console.error('[check-methodology] FAIL');
    process.exit(exitCode);
  }
  console.log('');
  console.log('[check-methodology] PASS: rendered methodology page matches meta.json');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
