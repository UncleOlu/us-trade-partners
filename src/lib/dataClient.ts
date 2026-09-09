import { dataUrl, SNAPSHOT_ID } from './config';
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
  readonly kind: 'not_found' | 'network' | 'parse';
  readonly snapshotId: string;

  constructor(url: string, kind: 'not_found' | 'network' | 'parse', message: string) {
    super(message);
    this.name = 'SnapshotFileError';
    this.url = url;
    this.kind = kind;
    this.snapshotId = SNAPSHOT_ID;
  }
}

async function fetchJson<T>(relativePath: string): Promise<T> {
  const url = dataUrl(relativePath);
  let response: Response;
  try {
    response = await fetch(url, { headers: { Accept: 'application/json' } });
  } catch (err) {
    throw new SnapshotFileError(
      url,
      'network',
      `Could not reach the snapshot data file (network error): ${url}`,
    );
  }
  if (response.status === 404) {
    throw new SnapshotFileError(
      url,
      'not_found',
      `Snapshot data file is missing: ${url}`,
    );
  }
  if (!response.ok) {
    throw new SnapshotFileError(
      url,
      'network',
      `Snapshot data file request failed with status ${response.status}: ${url}`,
    );
  }
  try {
    return (await response.json()) as T;
  } catch (err) {
    throw new SnapshotFileError(url, 'parse', `Snapshot data file is not valid JSON: ${url}`);
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
