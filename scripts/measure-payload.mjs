#!/usr/bin/env node
// Sum gzip(level 6) response bodies for the agreed budget. Report actual CDP
// transfer bytes separately. Each run uses a fresh context with cache disabled.
import { chromium } from 'playwright';
import { preview } from 'vite';
import zlib from 'node:zlib';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const [route, output, title] = process.argv.slice(2);
if (!route || !output) throw new Error('Usage: measure-payload.mjs <route or URL> <report.md> [title]');
const deployed = /^https?:\/\//.test(route);
let server;
let browser;
try {
  let url = route;
  if (!deployed) {
    const base = `/${(process.env.VITE_BASE_PATH ?? '/us-trade-partners/').replace(/^\/+|\/+$/g, '')}/`;
    server = await preview({ preview: { host: '127.0.0.1', port: 0 } });
    const address = server.httpServer.address();
    if (!address || typeof address === 'string') throw new Error('Preview has no TCP address');
    url = `http://127.0.0.1:${address.port}${base.replace(/\/$/, '')}${route}`;
  }
  browser = await chromium.launch();
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const page = await context.newPage();
  const client = await context.newCDPSession(page);
  await client.send('Network.enable');
  await client.send('Network.setCacheDisabled', { cacheDisabled: true });
  const requests = new Map();
  const completed = [];
  const bodies = [];
  const consoleErrors = [];
  client.on('Network.requestWillBeSent', (event) => {
    const prior = requests.get(event.requestId);
    if (prior && event.redirectResponse) {
      prior.status = event.redirectResponse.status;
      prior.transferred_bytes = event.redirectResponse.encodedDataLength;
      prior.encoding = 'redirect';
      prior.raw_bytes = 0;
      prior.gzip_bytes = 0;
      completed.push(prior);
    }
    requests.set(event.requestId, { url: event.request.url, status: null, encoding: null, raw_bytes: null, gzip_bytes: null, transferred_bytes: null });
  });
  client.on('Network.responseReceived', (event) => {
    const row = requests.get(event.requestId);
    if (!row) return;
    row.status = event.response.status;
    row.encoding = Object.entries(event.response.headers).find(([key]) => key.toLowerCase() === 'content-encoding')?.[1] ?? 'identity';
  });
  client.on('Network.loadingFailed', (event) => {
    const row = requests.get(event.requestId);
    if (row) row.error = event.errorText;
  });
  client.on('Network.loadingFinished', (event) => {
    const row = requests.get(event.requestId);
    if (!row) return;
    row.transferred_bytes = event.encodedDataLength;
    bodies.push(client.send('Network.getResponseBody', { requestId: event.requestId }).then((result) => {
      const body = Buffer.from(result.body, result.base64Encoded ? 'base64' : 'utf8');
      row.raw_bytes = body.length;
      row.gzip_bytes = zlib.gzipSync(body, { level: 6 }).length;
    }).catch((error) => { row.error = error.message; }));
  });
  page.on('pageerror', (error) => consoleErrors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
  await Promise.all(bodies);
  const rows = [...completed, ...requests.values()].sort((a, b) => a.url.localeCompare(b.url));
  const failures = rows.filter((row) => row.error || row.status === null || row.status >= 400 || row.gzip_bytes === null || row.transferred_bytes === null);
  const total = (key) => rows.reduce((sum, row) => sum + (row[key] ?? 0), 0);
  const budget = new URL(url).pathname.includes('/partner/') ? 300000 : new URL(url).pathname.replace(/\/$/, '').endsWith('/us-trade-partners') ? 250000 : null;
  const report = {
    assets: rows,
    budget_bytes: budget,
    budget_pass: budget === null ? null : total('gzip_bytes') <= budget,
    console_errors: consoleErrors,
    failures: failures.length,
    gzip_level: 6,
    mode: deployed ? 'deployed' : 'local preview',
    totals: { gzip_bytes: total('gzip_bytes'), raw_bytes: total('raw_bytes'), transferred_bytes: total('transferred_bytes') },
    url: deployed ? url : route,
  };
  const lines = [
    `# Payload: ${title ?? route}`, '', `Route: ${report.url}`, `Mode: ${report.mode}; cold context; cache disabled; service workers blocked.`,
    'Gzip budget: sum of each response body compressed locally with Node zlib gzip level 6. This is not a network transfer measurement.',
    'Transfer: Chrome Network.loadingFinished.encodedDataLength, including response headers reported by Chrome. Redirect bytes use response.encodedDataLength. These counts exclude TLS and transport overhead.',
    '', '| Requested asset | Status | Content encoding | Decoded bytes | Gzip budget bytes | CDP transferred bytes |', '|---|---:|---|---:|---:|---:|',
    ...rows.map((row) => `| ${deployed ? row.url : new URL(row.url).pathname + new URL(row.url).search} | ${row.status ?? 'unknown'} | ${row.encoding ?? 'unknown'} | ${row.raw_bytes ?? 'unknown'} | ${row.gzip_bytes ?? 'unknown'} | ${row.transferred_bytes ?? 'unknown'} |`),
    `| Total | | | ${report.totals.raw_bytes} | ${report.totals.gzip_bytes} | ${report.totals.transferred_bytes} |`, '',
    `Budget: ${budget ?? 'not set'} bytes; result: ${report.budget_pass === null ? 'not applicable' : report.budget_pass ? 'PASS' : 'FAIL'}.`,
    `Failed or incomplete asset checks: ${failures.length}. Console errors: ${consoleErrors.length}.`,
  ];
  const out = path.resolve(root, output);
  await fs.mkdir(path.dirname(out), { recursive: true });
  await fs.writeFile(out, lines.join('\n') + '\n');
  const stable = (value) => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])])) : value;
  await fs.writeFile(out.replace(/\.md$/, '') + '.json', JSON.stringify(stable(report), null, 2) + '\n');
  console.log(JSON.stringify({ budget_pass: report.budget_pass, failures: failures.length, output, totals: report.totals }));
  if (failures.length || consoleErrors.length || report.budget_pass === false) process.exitCode = 1;
} finally {
  await browser?.close();
  if (server) await new Promise((resolve, reject) => server.httpServer.close((error) => error ? reject(error) : resolve()));
}
