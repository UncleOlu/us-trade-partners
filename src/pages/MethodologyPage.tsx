import { fetchMeta } from '../lib/dataClient';
import { BASE_PATH, SNAPSHOT_ID } from '../lib/config';
import { useAsyncData } from '../lib/useAsyncData';
import { Loading } from '../components/Loading';
import { DataError } from '../components/DataError';
import { fillTemplate, renderMarkdown } from '../lib/markdown';
import type { Meta } from '../types/generated';

async function loadMethodologyMarkdown(): Promise<string> {
  const url = `${BASE_PATH}methodology-content.md`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Could not load methodology content (status ${response.status}): ${url}`);
  }
  return response.text();
}

function buildTemplateValues(meta: Meta): Record<string, string> {
  return {
    hs_sections_version: meta.hs_sections_version,
    snapshot_id: meta.snapshot_id,
    fetched_at: meta.fetched_at,
    latest_period: meta.latest_period,
    code_commit: meta.code_commit,
    'configured_coverage.start_year': String(meta.configured_coverage.start_year),
    'configured_coverage.end_year': String(meta.configured_coverage.end_year),
    'verified_availability.from_year': String(meta.verified_availability.from_year),
    'verified_availability.to_year': String(meta.verified_availability.to_year),
    'documented_availability.from_year': String(meta.documented_availability.from_year),
    // No field in schema/meta.schema.json carries a Kosovo map note; left
    // unfilled rather than guessed. See PartnerPage/AGENTB report open questions.
  };
}

export function MethodologyPage(): JSX.Element {
  const metaState = useAsyncData(() => fetchMeta(), []);
  const contentState = useAsyncData(() => loadMethodologyMarkdown(), []);

  if (metaState.status === 'loading' || contentState.status === 'loading') return <Loading label="Loading methodology" />;
  if (metaState.status === 'error') return <DataError error={metaState.error} />;
  if (contentState.status === 'error') return <DataError error={contentState.error} />;

  const values = buildTemplateValues(metaState.data);
  const filled = fillTemplate(contentState.data, values);

  return (
    <div className="methodology-page">
      <p className="chart-note">Snapshot {SNAPSHOT_ID}. Source: docs/methodology-content.md.</p>
      {renderMarkdown(filled)}
    </div>
  );
}
