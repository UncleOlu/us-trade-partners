#!/usr/bin/env node
// Runner for Agent D's browser-level e2e suite (tests/e2e/). Never
// edits package.json; starts `npm run build` (only if dist/ is stale)
// and `npm run preview` using the scripts already defined there, and
// drives a headless Chromium instance through the `playwright` core
// package (package.json devDependency; @playwright/test is not
// installed, see tests/e2e/lib/harness.mjs for why this suite has its
// own minimal test runner instead).
//
// Usage:
//   node tests/e2e/run.mjs
//   node tests/e2e/run.mjs --force-build   # rebuild dist/ even if fresh
//
// Exit code: 0 if nothing FAILed (NOT RUN and PASS are both fine), 1 if
// any test FAILed, 2 on a setup error (server never started, etc).

import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

import { startPreviewServer, REPO_ROOT } from './lib/server.mjs';
import { test, skip, runAll, clearTests, formatResults } from './lib/harness.mjs';
import { registerPartnerTrendTests } from './tests/partner-trend.mjs';
import { registerRouteTests } from './tests/routes.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function latestConfiguredYear(snapshotId) {
  const metaFile = path.join(REPO_ROOT, 'data', snapshotId, 'meta.json');
  const meta = JSON.parse(fs.readFileSync(metaFile, 'utf-8'));
  const years = meta.configured_coverage.years;
  return years[years.length - 1];
}

function firstSectionId(snapshotId) {
  const hsFile = path.join(REPO_ROOT, 'data', snapshotId, 'hs_sections.json');
  const hs = JSON.parse(fs.readFileSync(hsFile, 'utf-8'));
  return hs.groups[0].id;
}

async function main() {
  const forceBuild = process.argv.includes('--force-build');
  clearTests();

  console.log('Starting preview server (building dist/ first only if stale)...');
  let server;
  try {
    server = await startPreviewServer({ forceBuild });
  } catch (err) {
    console.error(`Setup failed: could not start the preview server: ${err.message}`);
    process.exitCode = 2;
    return;
  }
  console.log(`Preview server ready at ${server.url} (snapshot ${server.snapshotId})`);

  let browser;
  try {
    browser = await chromium.launch();
    const page = await browser.newPage();

    const latestYear = latestConfiguredYear(server.snapshotId);
    const sectionId = firstSectionId(server.snapshotId);
    const ctx = { page, baseUrl: server.baseUrl, snapshotId: server.snapshotId, latestYear, sectionId };

    registerPartnerTrendTests({ test, skip }, ctx);
    registerRouteTests({ test, skip }, ctx);

    const results = await runAll();
    console.log('');
    console.log(formatResults(results));

    const anyFailed = results.some((r) => r.status === 'FAIL');
    process.exitCode = anyFailed ? 1 : 0;
  } catch (err) {
    console.error(`Setup failed after the preview server started: ${err.message}`);
    process.exitCode = 2;
  } finally {
    if (browser) await browser.close();
    await server.stop();
  }
}

main();
