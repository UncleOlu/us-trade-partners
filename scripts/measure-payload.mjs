#!/usr/bin/env node
// Measures the real network payload for a route.
//
// Local mode (default): loads the production `vite preview` build in headless
// Chromium and records every response's raw (decompressed) and gzip-simulated
// size.
//   node scripts/measure-payload.mjs "/?year=2025" reports/app/payload_home.md "home route"
//
// Deployed mode: pass a full http(s) URL as the first argument instead of a
// route path. Measures a cold load (cache disabled, fresh browser context)
// against that URL directly, no local preview server, and records actual
// transferred bytes per asset via the Chrome DevTools Protocol
// (Network.loadingFinished.encodedDataLength) alongside raw decompressed size.
// This is what item 7 of the step-5 follow-up calls for and the orchestrator
// runs at step 6, not this agent.
//   node scripts/measure-payload.mjs "https://user.github.io/us-trade-partners/?year=2025" reports/app/payload_home_deployed.md "home route (deployed)"

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import zlib from 'node:zlib';
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

function fmt(n) {
  return n.toLocaleString('en-US');
}

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

async function measureLocal(routePath, outFile, reportTitle) {
  const port = 4321 + Math.floor(Math.random() * 500);
  const preview = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], {
    cwd: rootDir,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  try {
    const baseUrl = `http://localhost:${port}${basePath}`;
    await waitForServer(baseUrl, 20000);

    const browser = await chromium.launch();
    const page = await browser.newPage();

    const responses = new Map();
    page.on('response', async (res) => {
      try {
        const url = res.url();
        if (responses.has(url)) return;
        const status = res.status();
        if (status < 200 || status >= 400) return;
        const body = await res.body();
        const gzip = zlib.gzipSync(body).length;
        responses.set(url, { url, status, rawBytes: body.length, gzipBytes: gzip });
      } catch {
        // navigation-aborted or opaque responses; ignore
      }
    });

    // routePath is relative to the base path, not the server origin: baseUrl
    // already ends with basePath, so strip its trailing slash and append
    // routePath directly rather than `new URL(routePath, baseUrl)`, which
    // would treat a leading "/" as origin-absolute and drop the base path.
    const target = baseUrl.replace(/\/$/, '') + routePath;
    await page.goto(target, { waitUntil: 'networkidle', timeout: 30000 });
    await new Promise((r) => setTimeout(r, 500));

    await browser.close();

    const rows = [...responses.values()].sort((a, b) => a.url.localeCompare(b.url));

    let totalRaw = 0;
    let totalGzip = 0;
    const lines = [];
    lines.push(`# Payload measurement: ${reportTitle ?? routePath}`);
    lines.push('');
    lines.push(`Route: \`${routePath}\``);
    lines.push(`Mode: local (\`vite preview\` of the production build), base path \`${basePath}\``);
    lines.push('Measured with headless Chromium (Playwright): every network response for this navigation.');
    lines.push('Gzip bytes are simulated locally (zlib.gzipSync on the decompressed body), not measured over the wire.');
    lines.push('');
    lines.push('| Asset | Raw bytes | Gzip bytes (simulated) |');
    lines.push('|---|---:|---:|');
    for (const r of rows) {
      totalRaw += r.rawBytes;
      totalGzip += r.gzipBytes;
      const shortUrl = r.url.replace(baseUrl, '');
      lines.push(`| ${shortUrl} | ${fmt(r.rawBytes)} | ${fmt(r.gzipBytes)} |`);
    }
    lines.push('| **Total** | **' + fmt(totalRaw) + '** | **' + fmt(totalGzip) + '** |');
    lines.push('');

    const outPath = path.join(rootDir, outFile);
    await fs.mkdir(path.dirname(outPath), { recursive: true });
    await fs.writeFile(outPath, lines.join('\n') + '\n', 'utf-8');
    console.log(
      `[measure-payload] (local) wrote ${outFile}: total raw ${fmt(totalRaw)} bytes, total gzip(sim) ${fmt(totalGzip)} bytes`,
    );
  } finally {
    preview.kill();
  }
}

async function measureDeployed(url, outFile, reportTitle) {
  const browser = await chromium.launch();
  // A fresh context with no storage state is already cold; setCacheDisabled
  // on top of that removes any HTTP cache reuse within this one measurement.
  const context = await browser.newContext();
  const page = await context.newPage();
  const client = await context.newCDPSession(page);
  await client.send('Network.enable');
  await client.send('Network.setCacheDisabled', { cacheDisabled: true });

  /** @type {Map<string, {url: string, encodedDataLength: number}>} */
  const transferred = new Map();
  const requestIdToUrl = new Map();

  client.on('Network.requestWillBeSent', (event) => {
    requestIdToUrl.set(event.requestId, event.request.url);
  });
  client.on('Network.loadingFinished', (event) => {
    const u = requestIdToUrl.get(event.requestId);
    if (!u) return;
    const prior = transferred.get(u)?.encodedDataLength ?? 0;
    transferred.set(u, { url: u, encodedDataLength: prior + event.encodedDataLength });
  });

  const rawByUrl = new Map();
  page.on('response', async (res) => {
    try {
      const u = res.url();
      if (rawByUrl.has(u)) return;
      const status = res.status();
      if (status < 200 || status >= 400) return;
      const body = await res.body();
      rawByUrl.set(u, body.length);
    } catch {
      // opaque or aborted; ignore
    }
  });

  await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
  await new Promise((r) => setTimeout(r, 500));
  await browser.close();

  const urls = new Set([...transferred.keys(), ...rawByUrl.keys()]);
  const rows = [...urls]
    .map((u) => ({
      url: u,
      rawBytes: rawByUrl.get(u) ?? 0,
      transferredBytes: transferred.get(u)?.encodedDataLength ?? 0,
    }))
    .sort((a, b) => a.url.localeCompare(b.url));

  let totalRaw = 0;
  let totalTransferred = 0;
  const lines = [];
  lines.push(`# Payload measurement: ${reportTitle ?? url}`);
  lines.push('');
  lines.push(`URL: \`${url}\``);
  lines.push('Mode: deployed (cold load, cache disabled, fresh browser context).');
  lines.push(
    'Transferred bytes are actual over-the-wire bytes from Chrome DevTools Protocol Network.loadingFinished.encodedDataLength (headers plus whatever encoding the server actually used, gzip/brotli/none).',
  );
  lines.push('');
  lines.push('| Asset | Raw bytes (decompressed) | Transferred bytes (actual, CDP) |');
  lines.push('|---|---:|---:|');
  for (const r of rows) {
    totalRaw += r.rawBytes;
    totalTransferred += r.transferredBytes;
    const shortUrl = r.url.replace(url.split('?')[0].replace(/\/[^/]*$/, '/'), '');
    lines.push(`| ${shortUrl || r.url} | ${fmt(r.rawBytes)} | ${fmt(r.transferredBytes)} |`);
  }
  lines.push('| **Total** | **' + fmt(totalRaw) + '** | **' + fmt(totalTransferred) + '** |');
  lines.push('');

  const outPath = path.join(rootDir, outFile);
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, lines.join('\n') + '\n', 'utf-8');
  console.log(
    `[measure-payload] (deployed) wrote ${outFile}: total raw ${fmt(totalRaw)} bytes, total transferred ${fmt(totalTransferred)} bytes`,
  );
}

async function main() {
  const [, , first, outFile, reportTitle] = process.argv;
  if (!first || !outFile) {
    console.error(
      'usage:\n' +
        '  local:    node scripts/measure-payload.mjs <routePath> <outFile> [reportTitle]\n' +
        '  deployed: node scripts/measure-payload.mjs <fullUrl> <outFile> [reportTitle]',
    );
    process.exit(1);
  }

  if (/^https?:\/\//.test(first)) {
    await measureDeployed(first, outFile, reportTitle);
  } else {
    await measureLocal(first, outFile, reportTitle);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
