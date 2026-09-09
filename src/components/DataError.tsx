import { SnapshotFileError } from '../lib/dataClient';
import { SNAPSHOT_ID } from '../lib/config';

/**
 * Visible error with a reload prompt for a missing or unreadable snapshot
 * file. Never silently falls back to a different snapshot.
 */
export function DataError({ error }: { error: unknown }): JSX.Element {
  const isSnapshotError = error instanceof SnapshotFileError;
  const message = isSnapshotError
    ? error.message
    : error instanceof Error
      ? error.message
      : 'An unknown error occurred while loading data.';

  return (
    <div role="alert" className="data-error">
      <h2>Could not load this page</h2>
      <p>{message}</p>
      {isSnapshotError && (
        <p>
          Snapshot: <code>{SNAPSHOT_ID}</code>
        </p>
      )}
      <p>This page will not switch to a different snapshot. Reload to try again.</p>
      <button type="button" onClick={() => window.location.reload()}>
        Reload
      </button>
    </div>
  );
}
