// Starts `npm run preview` (vite preview, serving dist/) on a free port
// against the production build, building first only if dist/ is absent
// or stale for the current snapshot. Never edits package.json: uses the
// existing "build" and "preview" scripts already defined there.

import net from 'node:net';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(__dirname, '../../..');

export function currentSnapshotId() {
  const file = path.join(REPO_ROOT, 'reports', 'pipeline', 'last_snapshot_id.txt');
  return fs.readFileSync(file, 'utf-8').trim();
}

export function basePath() {
  const raw = process.env.VITE_BASE_PATH ?? '/us-trade-partners/';
  let p = raw.trim();
  if (!p.startsWith('/')) p = '/' + p;
  if (!p.endsWith('/')) p = p + '/';
  return p;
}

function distIsFreshFor(snapshotId) {
  const indexHtml = path.join(REPO_ROOT, 'dist', 'index.html');
  const snapshotDataDir = path.join(REPO_ROOT, 'dist', 'data', snapshotId);
  return fs.existsSync(indexHtml) && fs.existsSync(snapshotDataDir);
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const address = srv.address();
      const port = typeof address === 'object' && address ? address.port : null;
      srv.close(() => {
        if (port) resolve(port);
        else reject(new Error('could not determine a free port'));
      });
    });
  });
}

function waitForHttp200(url, { timeoutMs = 20000, intervalMs = 300 } = {}) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const req = http.get(url, (res) => {
        res.resume();
        if (res.statusCode && res.statusCode < 500) {
          resolve();
        } else if (Date.now() - start > timeoutMs) {
          reject(new Error(`preview server never returned <500 at ${url} (last status ${res.statusCode})`));
        } else {
          setTimeout(attempt, intervalMs);
        }
      });
      req.on('error', () => {
        if (Date.now() - start > timeoutMs) {
          reject(new Error(`preview server did not become reachable at ${url} within ${timeoutMs}ms`));
        } else {
          setTimeout(attempt, intervalMs);
        }
      });
    };
    attempt();
  });
}

/**
 * Ensures dist/ is a fresh build for the current snapshot (runs `npm run
 * build` if absent or stale), starts `npx vite preview` on a free port,
 * and resolves once it answers HTTP requests. Returns
 * { url, baseUrl, snapshotId, stop() }. Caller must call stop() when done.
 */
export async function startPreviewServer({ forceBuild = false } = {}) {
  const snapshotId = currentSnapshotId();
  const bp = basePath();

  if (forceBuild || !distIsFreshFor(snapshotId)) {
    const buildResult = spawnSync('npm', ['run', 'build'], {
      cwd: REPO_ROOT,
      stdio: 'inherit',
      env: process.env,
    });
    if (buildResult.status !== 0) {
      throw new Error(`npm run build failed with exit code ${buildResult.status}`);
    }
    if (!distIsFreshFor(snapshotId)) {
      throw new Error('dist/ still not fresh for the current snapshot after npm run build');
    }
  }

  const port = await getFreePort();
  const previewArgs = ['run', 'preview', '--', '--port', String(port), '--strictPort', '--host', '127.0.0.1'];
  const proc = spawn('npm', previewArgs, {
    cwd: REPO_ROOT,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stdout = '';
  let stderr = '';
  proc.stdout.on('data', (d) => {
    stdout += d.toString();
  });
  proc.stderr.on('data', (d) => {
    stderr += d.toString();
  });

  const url = `http://127.0.0.1:${port}${bp}`;
  try {
    await waitForHttp200(url, { timeoutMs: 20000 });
  } catch (err) {
    proc.kill();
    throw new Error(`${err.message}\n--- preview stdout ---\n${stdout}\n--- preview stderr ---\n${stderr}`);
  }

  return {
    url,
    baseUrl: url,
    snapshotId,
    port,
    stop() {
      return new Promise((resolve) => {
        if (proc.exitCode !== null || proc.killed) {
          resolve();
          return;
        }
        proc.once('exit', () => resolve());
        proc.kill();
        // Fallback: force after a grace period, in case the child ignores SIGTERM.
        setTimeout(() => {
          try {
            proc.kill('SIGKILL');
          } catch {
            // already exited
          }
          resolve();
        }, 3000);
      });
    },
  };
}
