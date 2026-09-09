#!/usr/bin/env node
// Per-route index.html generation for GitHub Pages (STACK: "Generate one
// index.html per known route at build time"). The app is client-rendered, so
// every generated file is a byte-identical copy of the built root
// dist/index.html; the client-side router resolves the route from
// location.pathname once the bundle boots. This gives GitHub Pages a real
// file to serve at each known path (better than relying on the 404.html SPA
// fallback for every direct load or crawl).
//
// Known routes (query parameters are not part of the route set):
//   /
//   /hub
//   /methodology
//   /partner/<code>   for every partner in partners.json with resolution "approved"
//   /section/<id>     for the 22 groups in hs_sections.json
//
// Finally copies dist/index.html to dist/404.html as the SPA fallback only
// (never a substitute for the routes above, never a valid route on its own).

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const distDir = path.join(rootDir, 'dist');

async function readSnapshotId() {
  const raw = await fs.readFile(
    path.join(rootDir, 'reports', 'pipeline', 'last_snapshot_id.txt'),
    'utf-8',
  );
  return raw.trim();
}

async function main() {
  const snapshotId = await readSnapshotId();
  const dataDir = path.join(rootDir, 'data', snapshotId);

  const indexHtml = await fs.readFile(path.join(distDir, 'index.html'), 'utf-8');

  const partners = JSON.parse(await fs.readFile(path.join(dataDir, 'partners.json'), 'utf-8'));
  const hsSections = JSON.parse(await fs.readFile(path.join(dataDir, 'hs_sections.json'), 'utf-8'));

  const approvedPartnerCodes = partners.partners
    .filter((p) => p.resolution === 'approved')
    .map((p) => p.code)
    .sort();
  const sectionIds = hsSections.groups.map((g) => g.id);

  if (sectionIds.length !== 22) {
    throw new Error(`expected 22 HS groups, found ${sectionIds.length}`);
  }

  const routes = [
    '/',
    '/hub',
    '/methodology',
    ...approvedPartnerCodes.map((code) => `/partner/${code}`),
    ...sectionIds.map((id) => `/section/${id}`),
  ];

  let written = 0;
  for (const route of routes) {
    if (route === '/') continue; // dist/index.html already exists from the build
    const outPath = path.join(distDir, route.replace(/^\//, ''), 'index.html');
    await fs.mkdir(path.dirname(outPath), { recursive: true });
    await fs.writeFile(outPath, indexHtml, 'utf-8');
    written += 1;
  }

  // 404.html fallback, generated last so it always mirrors the final index.html.
  await fs.writeFile(path.join(distDir, '404.html'), indexHtml, 'utf-8');

  console.log(
    `[generate-routes] ${routes.length} known routes (1 home + 1 hub + 1 methodology + ` +
      `${approvedPartnerCodes.length} partners + ${sectionIds.length} sections); ` +
      `wrote ${written} index.html files plus dist/404.html`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
