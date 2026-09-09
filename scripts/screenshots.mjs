#!/usr/bin/env node
// Screenshots against `vite preview` of the production build, served under
// the repo base path. Saves to reports/app/.

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

const targets = [
  { route: '/partner/5700?year=2025', name: 'china_5700' },
  { route: '/partner/EU?year=2013', name: 'eu_2013' },
];

const viewports = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
];

async function main() {
  const port = 4321 + Math.floor(Math.random() * 500);
  const preview = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], {
    cwd: rootDir,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  try {
    const baseUrl = `http://localhost:${port}${basePath}`;
    await waitForServer(baseUrl, 20000);

    const browser = await chromium.launch();
    const outDir = path.join(rootDir, 'reports', 'app');
    await fs.mkdir(outDir, { recursive: true });

    const written = [];
    for (const vp of viewports) {
      const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
      for (const t of targets) {
        const url = baseUrl.replace(/\/$/, '') + t.route;
        await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
        await page.waitForTimeout(500);
        const filePath = path.join(outDir, `${t.name}_${vp.name}.png`);
        await page.screenshot({ path: filePath, fullPage: true });
        written.push(filePath);
      }
      await page.close();
    }

    await browser.close();
    for (const f of written) {
      console.log(`[screenshots] wrote ${path.relative(rootDir, f)}`);
    }
  } finally {
    preview.kill();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
