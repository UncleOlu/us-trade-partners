import { dataUrl, SNAPSHOT_ID } from './config';
import { validateData } from './validateData';
import type {
  Meta,
  Partners,
  PartnerFile,
  Summary,
  Section,
  HsSections,
} from '../types/generated';

// A missing snapshot file must produce a visible error with a reload prompt,
// never a silent switch to another snapshot. This error type carries enough
// information for the UI to render that prompt and for the caller to tell a
// missing file apart from a network or parse failure.
export class SnapshotFileError extends Error {
  readonly url: string;
  readonly kind: 'not_found' | 'network' | 'parse' | 'timeout';
  readonly snapshotId: string;

  constructor(url: string, kind: 'not_found' | 'network' | 'parse' | 'timeout', message: string) {
    super(message);
    this.name = 'SnapshotFileError';
    this.url = url;
    this.kind = kind;
    this.snapshotId = SNAPSHOT_ID;
  }
}

const cache = new Map<string, Promise<unknown>>();

function fetchJson<T>(relativePath: string): Promise<T> {
  const prior = cache.get(relativePath);
  if (prior) return prior as Promise<T>;
  const request = loadJson<T>(relativePath).catch((error) => { cache.delete(relativePath); throw error; });
  cache.set(relativePath, request);
  return request;
}

async function loadJson<T>(relativePath: string): Promise<T> {
  const url = dataUrl(relativePath);
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 30_000);
  let received = false;
  try {
    const response = await fetch(url, { headers: { Accept: 'application/json' }, signal: controller.signal });
    received = true;
    if (!response.ok) throw new SnapshotFileError(url, response.status === 404 ? 'not_found' : 'network', `Data request failed (${response.status}): ${url}`);
    const value: unknown = await response.json();
    validateData(value, relativePath);
    return value as T;
  } catch (error) {
    if (controller.signal.aborted) throw new SnapshotFileError(url, 'timeout', 'The data request took too long. Reload to try again.');
    if (error instanceof SnapshotFileError) throw error;
    throw new SnapshotFileError(url, received ? 'parse' : 'network', received ? `Snapshot data could not be verified: ${url}` : `Could not reach the data: ${url}`);
  } finally {
    window.clearTimeout(timer);
  }
}

export function fetchMeta(): Promise<Meta> {
  return fetchJson<Meta>('meta.json');
}

export function fetchPartners(): Promise<Partners> {
  return fetchJson<Partners>('partners.json');
}

export function fetchHsSections(): Promise<HsSections> {
  return fetchJson<HsSections>('hs_sections.json');
}

export function fetchSummary(year: number): Promise<Summary> {
  return fetchJson<Summary>(`summary/${year}.json`);
}

export function fetchPartner(code: string): Promise<PartnerFile> {
  return fetchJson<PartnerFile>(`partner/${code}.json`);
}

export function fetchSection(id: string): Promise<Section> {
  return fetchJson<Section>(`section/${id}.json`);
}
