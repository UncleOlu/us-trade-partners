#!/usr/bin/env node
// Restore only the built dataset pinned by source control. Raw data stays in its
// separate release asset. The downloaded checksum file is not a trust source.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const snapshot = (await fs.readFile(path.join(root, 'reports/pipeline/last_snapshot_id.txt'), 'utf8')).trim();
if (!/^\d{8}T\d{6}Z-[a-f0-9]{12}$/.test(snapshot)) throw new Error('Invalid snapshot id');
const pin = JSON.parse(await fs.readFile(path.join(root, 'reports/pipeline/current_release.json'), 'utf8'));
if (pin.snapshot_id !== snapshot || !/^[a-f0-9]{64}$/.test(pin.sha256) ||
    !/^[a-f0-9]{40}$/.test(pin.pipeline_commit) || pin.asset !== `${snapshot}.zip` ||
    pin.tag !== `build-${snapshot}-${pin.pipeline_commit.slice(0, 12)}-${pin.sha256.slice(0, 12)}`) {
  throw new Error('Invalid immutable release pin');
}
const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== '--archive')) throw new Error('Usage: restore-snapshot.mjs [--archive ZIP]');
const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'trade-restore-'));
try {
  const archive = args.length ? path.resolve(args[1]) : path.join(temp, pin.asset);
  if (!args.length) {
    const repo = process.env.GITHUB_REPOSITORY;
    if (!repo || !/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error('Set GITHUB_REPOSITORY to owner/repository');
    execFileSync('gh', ['release', 'download', pin.tag, '--repo', repo, '--pattern', pin.asset, '--dir', temp], { stdio: 'inherit' });
  }
  const actual = createHash('sha256').update(await fs.readFile(archive)).digest('hex');
  if (actual !== pin.sha256) throw new Error('Archive SHA-256 differs from the committed release pin');
  const staged = path.join(temp, 'data');
  // Read members into regular files. Never trust ZIP paths, links, or modes.
  const python = process.platform === 'darwin' ? '/opt/homebrew/bin/python3.12' : 'python3';
  execFileSync(python, ['-c', `
import pathlib, re, sys, zipfile
archive, target = sys.argv[1:]
root = pathlib.Path(target)
root.mkdir()
seen = set()
with zipfile.ZipFile(archive) as z:
    for entry in z.infolist():
        name = entry.filename
        if name in seen:
            raise ValueError('duplicate ZIP member')
        seen.add(name)
        if name.startswith('/') or '\\\\' in name or '..' in pathlib.PurePosixPath(name).parts:
            raise ValueError('unsafe ZIP member')
        if not re.fullmatch(r'(meta|partners|hs_sections)\\.json|summary/[0-9]{4}\\.json|partner/([0-9]{4}|EU)\\.json|section/(I|II|III|IV|V|VI|VII|VIII|IX|X|XI|XII|XIII|XIV|XV|XVI|XVII|XVIII|XIX|XX|XXI|SPECIAL)\\.json', name):
            continue
        dest = root / name
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(z.read(entry))
`, archive, staged], { stdio: 'inherit' });
  const meta = JSON.parse(await fs.readFile(path.join(staged, 'meta.json'), 'utf8'));
  if (meta.snapshot_id !== snapshot || meta.code_commit !== pin.pipeline_commit) throw new Error('Restored metadata does not match the release pin');
  for (const required of ['partners.json', 'hs_sections.json', 'summary', 'partner', 'section']) await fs.access(path.join(staged, required));
  const target = path.join(root, 'data', snapshot);
  try {
    await fs.access(target);
    throw new Error('Snapshot directory exists. Restore into a clean checkout to preserve it.');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.cp(staged, target, { recursive: true, errorOnExist: true, force: false });
  console.log(`Verified ${pin.asset}: ${actual}; restored ${snapshot} from ${pin.tag}`);
} finally {
  await fs.rm(temp, { recursive: true, force: true });
}
