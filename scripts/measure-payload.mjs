#!/usr/bin/env node
// Measures the real network payload for a route by loading the production
// `vite preview` build in headless Chromium and recording every response's
// raw and gzip size.
// Usage: node scripts/measure-payload.mjs <routePath> <outFile> [reportTitle]
// Example: node scripts/measure-payload.mjs "/?year=2025" reports/app/payload_home.md "home route"

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

function fmt(n) {
  return n.toLocaleString('en-US');
}

async function main() {
  const [, , routePath, outFile, reportTitle] = process.argv;
  if (!routePath || !outFile) {
    console.error('usage: node scripts/measure-payload.mjs <routePath> <outFile> [reportTitle]');
    process.exit(1);
  }

  const port = 4321 + Math.floor(Math.random() * 500);
  const preview = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], {
    cwd: rootDir,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let previewLog = '';
  preview.stdout.on('data', (d) => (previewLog += d.toString()));
  preview.stderr.on('data', (d) => (previewLog += d.toString()));

  try {
    const baseUrl = `http://localhost:${port}${basePath}`;
    await waitForServer(baseUrl, 20000);

    const browser = await chromium.launch();
    const page = await browser.newPage();

    /** @type {Map<string, {url: string, status: number, rawBytes: number, gzipBytes: number}>} */
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

    // routePath (e.g. "/partner/5700?year=2025") is relative to the base
    // path, not the server origin: baseUrl already ends with basePath, so
    // strip its trailing slash and append routePath directly rather than
    // using `new URL(routePath, baseUrl)`, which would treat a leading "/"
    // as origin-absolute and silently drop the base path prefix.
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
    lines.push(`Measured against: \`vite preview\` of the production build, base path \`${basePath}\``);
    lines.push('Measured with headless Chromium (Playwright): every network response for this navigation.');
    lines.push('');
    lines.push('| Asset | Raw bytes | Gzip bytes |');
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
      `[measure-payload] wrote ${outFile}: total raw ${fmt(totalRaw)} bytes, total gzip ${fmt(totalGzip)} bytes`,
    );
  } finally {
    preview.kill();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
