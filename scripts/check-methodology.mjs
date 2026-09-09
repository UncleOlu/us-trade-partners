#!/usr/bin/env node
// Build-time check: loads the built methodology page in headless Chromium and
// fails the build if any {{ marker was left unfilled, or if the rendered
// snapshot id, fetched_at, latest_period, coverage, or code_commit disagree
// with data/<snapshot_id>/meta.json. Run after `vite build` (and after
// generate-routes.mjs, so dist/methodology/index.html exists).

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function normalizeBasePath(raw) {
  let p = raw.trim();
  if (!p.startsWith('/')) p = '/' + p;
  if (!p.endsWith('/')) p = p + '/';
  return p;
}

const basePath = normalizeBasePath(process.env.VITE_BASE_PATH ?? '/us-trade-partners/');

async function waitForServer(url, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const ok = await new Promise((resolve) => {
      const req = http.get(url, (res) => {
        res.resume();
        resolve(true);
      });
      req.on('error', () => resolve(false));
      req.setTimeout(1000, () => {
        req.destroy();
        resolve(false);
      });
    });
    if (ok) return;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`preview server did not become ready at ${url} within ${timeoutMs}ms`);
}

async function readSnapshotId() {
  const raw = await fs.readFile(path.join(rootDir, 'reports', 'pipeline', 'last_snapshot_id.txt'), 'utf-8');
  return raw.trim();
}

async function main() {
  const snapshotId = await readSnapshotId();
  const meta = JSON.parse(
    await fs.readFile(path.join(rootDir, 'data', snapshotId, 'meta.json'), 'utf-8'),
  );

  const port = 4321 + Math.floor(Math.random() * 500);
  const preview = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], {
    cwd: rootDir,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let exitCode = 0;
  try {
    const baseUrl = `http://localhost:${port}${basePath}`;
    await waitForServer(baseUrl, 20000);

    const browser = await chromium.launch();
    const page = await browser.newPage();
    await page.goto(baseUrl.replace(/\/$/, '') + '/methodology', {
      waitUntil: 'networkidle',
      timeout: 30000,
    });
    await page.waitForTimeout(500);

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

    await browser.close();
  } finally {
    preview.kill();
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
