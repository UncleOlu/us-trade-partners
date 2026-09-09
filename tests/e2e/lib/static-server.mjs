// A minimal static file server for dist/ that reproduces the one piece
// of GitHub Pages behavior `npm run preview` cannot: a genuinely unknown
// path returns real HTTP 404 with 404.html's body, not HTTP 200 with
// index.html's body. `npm run preview` (vite's dev-oriented preview
// server) always applies its SPA history fallback and answers every
// unmatched path with 200, which cannot prove the deployed-site audit's
// "404.html fallback must not count as a valid route" requirement
// locally. This server never edits package.json or vite.config.ts; it
// is a plain Node http.Server reading files already built into dist/ by
// the existing `npm run build` script (via lib/server.mjs's
// ensureFreshBuild, reused here).
//
// Known routes resolve correctly because the project's route-generation
// script already writes one real <route>/index.html per known route
// into dist/ at build time (docs/SPEC.md STACK: "Generate one index.html
// per known route at build time"), so this server's job for a known
// route is just "serve the real file," identical to what GitHub Pages
// itself does; the only behavior this server adds on top of a bare
// static file read is the directory/index.html and unknown-path/404.html
// resolution described above.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { REPO_ROOT, currentSnapshotId, basePath, ensureFreshBuild } from './server.mjs';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
};

function contentTypeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_TYPES[ext] || 'application/octet-stream';
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const address = srv.address();
      const port = typeof address === 'object' && address ? address.port : null;
      srv.close(() => (port ? resolve(port) : reject(new Error('no free port'))));
    });
  });
}

/**
 * Resolves a URL pathname (already stripped of the base path and query
 * string) to a file under dist/, GitHub-Pages-style: an exact file,
 * else "<path>/index.html", else "<path>.html", else not found.
 */
function resolveDistFile(distDir, pathname) {
  const clean = pathname.replace(/^\/+/, '');
  const candidates = clean === ''
    ? [path.join(distDir, 'index.html')]
    : [
        path.join(distDir, clean),
        path.join(distDir, clean, 'index.html'),
        path.join(distDir, `${clean}.html`),
      ];
  for (const candidate of candidates) {
    const resolved = path.resolve(candidate);
    if (!resolved.startsWith(path.resolve(distDir) + path.sep)) continue; // path traversal guard
    if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
      return resolved;
    }
  }
  return null;
}

export async function startStaticServer({ forceBuild = false, handleRequest } = {}) {
  await ensureFreshBuild({ forceBuild });

  const snapshotId = currentSnapshotId();
  const bp = basePath();
  const distDir = path.join(REPO_ROOT, 'dist');
  const notFoundFile = path.join(distDir, '404.html');

  const server = http.createServer((req, res) => {
    if (handleRequest?.(req, res)) return;
    const parsed = new URL(req.url, 'http://internal.invalid');
    let pathname = decodeURIComponent(parsed.pathname);
    // Strip the base path prefix, same as GitHub Pages project-site routing.
    if (pathname.startsWith(bp)) {
      pathname = '/' + pathname.slice(bp.length);
    } else if (pathname === bp.slice(0, -1)) {
      pathname = '/';
    } else {
      // A path outside the base path entirely: still a 404 in this app's world.
      pathname = '/__outside_base_path__';
    }

    const file = resolveDistFile(distDir, pathname);
    res.setHeader('Cache-Control', 'no-store');
    if (file) {
      res.statusCode = 200;
      res.setHeader('Content-Type', contentTypeFor(file));
      fs.createReadStream(file).pipe(res);
      return;
    }
    // Unknown route: real 404 status, 404.html body, exactly like GitHub
    // Pages serving a custom 404 page for a project site.
    res.statusCode = 404;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    if (fs.existsSync(notFoundFile)) {
      fs.createReadStream(notFoundFile).pipe(res);
    } else {
      res.end('404 not found (dist/404.html is missing)');
    }
  });

  const port = await getFreePort();
  await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));

  const url = `http://127.0.0.1:${port}${bp}`;
  return {
    url,
    baseUrl: url,
    snapshotId,
    port,
    stop() {
      return new Promise((resolve) => server.close(() => resolve()));
    },
  };
}
