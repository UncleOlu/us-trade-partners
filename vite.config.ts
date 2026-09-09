import { defineConfig, type Plugin, type Connect } from 'vite';
import { aggregateSummary } from './src/lib/aggregate';
import type { Meta, Summary } from './src/types/generated';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

// Base path: every data fetch URL, the Vite base, and the React Router basename
// all read this one value. Default matches the GitHub Pages project path.
const basePath = normalizeBasePath(process.env.VITE_BASE_PATH ?? '/us-trade-partners/');

function normalizeBasePath(raw: string): string {
  let p = raw.trim();
  if (!p.startsWith('/')) p = '/' + p;
  if (!p.endsWith('/')) p = p + '/';
  return p;
}

// snapshot_id comes from reports/pipeline/last_snapshot_id.txt at build/dev time.
// Agent B never hard-codes a snapshot id in source; the build injects this constant.
function readSnapshotId(): string {
  const snapshotFile = path.join(rootDir, 'reports', 'pipeline', 'last_snapshot_id.txt');
  const raw = fs.readFileSync(snapshotFile, 'utf-8').trim();
  if (!raw) {
    throw new Error(`reports/pipeline/last_snapshot_id.txt is empty; cannot determine snapshot_id`);
  }
  return raw;
}

const snapshotId = readSnapshotId();

async function copyDir(src: string, dest: string): Promise<number> {
  let count = 0;
  await fsp.mkdir(dest, { recursive: true });
  const entries = await fsp.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      count += await copyDir(s, d);
    } else if (entry.isFile()) {
      await fsp.copyFile(s, d);
      count += 1;
    }
  }
  return count;
}

// Deterministic UI-only view. Canonical snapshot files and release assets stay unchanged.
async function buildAllYearsSummary(): Promise<string> {
  const dir = path.join(rootDir, 'data', snapshotId);
  const meta: Meta = JSON.parse(await fsp.readFile(path.join(dir, 'meta.json'), 'utf8'));
  const summaries: Summary[] = await Promise.all(meta.configured_coverage.years.map(async (year) => JSON.parse(await fsp.readFile(path.join(dir, 'summary', `${year}.json`), 'utf8'))));
  const view = aggregateSummary(summaries, meta.configured_coverage.years);
  const stable = (value: unknown): unknown => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object'
    ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, stable(item)])) : value;
  return JSON.stringify(stable(view)) + '\n';
}

// Serves data/<snapshot_id>/ under the same base path used in production,
// and (on build) copies only the current snapshot into dist/data/<snapshot_id>/.
function snapshotDataPlugin(): Plugin {
  const dataUrlPrefix = `${basePath}data/${snapshotId}/`;
  const snapshotDir = path.join(rootDir, 'data', snapshotId);
  const allUrl = `${basePath}derived/${snapshotId}/summary-all.json`;
  let derived: Promise<string> | undefined;

  return {
    name: 'snapshot-data',
    configureServer(server) {
      const middleware: Connect.NextHandleFunction = (req, res, next) => {
        if (!req.url) return next();
        const urlPath = req.url.split('?')[0] ?? '';
        if (urlPath === allUrl) {
          derived ??= buildAllYearsSummary().catch((error) => { derived = undefined; throw error; });
          derived.then((body) => { res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(body); }, () => { res.statusCode = 500; res.end('Could not build the all-years view.'); });
          return;
        }
        if (!urlPath.startsWith(dataUrlPrefix)) return next();
        const rel = decodeURIComponent(urlPath.slice(dataUrlPrefix.length));
        if (rel.includes('..')) {
          res.statusCode = 400;
          res.end('bad request');
          return;
        }
        const filePath = path.join(snapshotDir, rel);
        fs.readFile(filePath, (err, data) => {
          if (err) {
            res.statusCode = 404;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'snapshot file not found', path: rel }));
            return;
          }
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(data);
        });
      };
      server.middlewares.use(middleware);
    },
    async closeBundle() {
      // Only runs for `vite build`, not `vite dev`.
      if (!fs.existsSync(snapshotDir)) {
        throw new Error(`snapshot directory missing at build time: ${snapshotDir}`);
      }
      const outDir = path.join(rootDir, 'dist', 'data', snapshotId);
      const count = await copyDir(snapshotDir, outDir);
      const derivedDir = path.join(rootDir, 'dist', 'derived', snapshotId);
      await fsp.mkdir(derivedDir, { recursive: true });
      await fsp.writeFile(path.join(derivedDir, 'summary-all.json'), await buildAllYearsSummary());
      // eslint-disable-next-line no-console
      console.log(`[snapshot-data] copied ${count} files from data/${snapshotId} to dist/data/${snapshotId}`);
      // Per-route index.html generation and the 404.html SPA fallback copy
      // happen after this, in scripts/generate-routes.mjs (npm run build).
    },
  };
}

// Serves the pinned world-atlas 110m TopoJSON under the base path (dev) and
// copies it into dist/ (build). Only the home route (WorldMap) loads it.
function worldAtlasPlugin(): Plugin {
  const urlPath = `${basePath}atlas/countries-110m.json`;
  const sourceFile = path.join(rootDir, 'node_modules', 'world-atlas', 'countries-110m.json');

  return {
    name: 'world-atlas',
    configureServer(server) {
      const middleware: Connect.NextHandleFunction = (req, res, next) => {
        if (!req.url) return next();
        const reqPath = req.url.split('?')[0];
        if (reqPath !== urlPath) return next();
        fs.readFile(sourceFile, (err, data) => {
          if (err) {
            res.statusCode = 404;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'countries-110m.json not found' }));
            return;
          }
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(data);
        });
      };
      server.middlewares.use(middleware);
    },
    async closeBundle() {
      if (!fs.existsSync(sourceFile)) {
        throw new Error('node_modules/world-atlas/countries-110m.json missing at build time; run npm install');
      }
      const outFile = path.join(rootDir, 'dist', 'atlas', 'countries-110m.json');
      await fsp.mkdir(path.dirname(outFile), { recursive: true });
      await fsp.copyFile(sourceFile, outFile);
      // eslint-disable-next-line no-console
      console.log('[world-atlas] copied countries-110m.json to dist/atlas/countries-110m.json');
    },
  };
}

// Serves docs/methodology-content.md under the base path (dev) and copies it
// into dist/ (build), so the methodology page reads content from its one
// source of truth in docs/ instead of a duplicated copy under src/.
function methodologyContentPlugin(): Plugin {
  const urlPath = `${basePath}methodology-content.md`;
  const sourceFile = path.join(rootDir, 'docs', 'methodology-content.md');

  return {
    name: 'methodology-content',
    configureServer(server) {
      const middleware: Connect.NextHandleFunction = (req, res, next) => {
        if (!req.url) return next();
        const reqPath = req.url.split('?')[0];
        if (reqPath !== urlPath) return next();
        fs.readFile(sourceFile, 'utf-8', (err, data) => {
          if (err) {
            res.statusCode = 404;
            res.end('methodology-content.md not found');
            return;
          }
          res.statusCode = 200;
          res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
          res.end(data);
        });
      };
      server.middlewares.use(middleware);
    },
    async closeBundle() {
      if (!fs.existsSync(sourceFile)) {
        throw new Error(`docs/methodology-content.md missing at build time`);
      }
      const outFile = path.join(rootDir, 'dist', 'methodology-content.md');
      await fsp.copyFile(sourceFile, outFile);
      // eslint-disable-next-line no-console
      console.log('[methodology-content] copied docs/methodology-content.md to dist/methodology-content.md');
    },
  };
}

export default defineConfig({
  base: basePath,
  define: {
    __SNAPSHOT_ID__: JSON.stringify(snapshotId),
    __BASE_PATH__: JSON.stringify(basePath),
  },
  plugins: [react(), snapshotDataPlugin(), methodologyContentPlugin(), worldAtlasPlugin()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
