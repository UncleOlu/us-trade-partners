import type { ReactNode, RefObject } from 'react';
import { capQuery } from '../lib/labels';

/**
 * Shared partner-list search field, feedback span, results toolbar and empty state used by
 * the home and section pages so the toggle labels, Clear search, status text, and empty-state
 * copy exist once. Each page supplies its own id, computed counts and handlers; the rendered
 * markup matches what both pages already rendered before this extraction.
 */

export function PartnerSearchField({
  id,
  value,
  onChange,
  inputRef,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  inputRef: RefObject<HTMLInputElement>;
}): JSX.Element {
  return (
    <div className="field search-field">
      <label htmlFor={id}>Find a partner</label>
      <input id={id} ref={inputRef} type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder="Search any partner by name or code" />
    </div>
  );
}

export function SearchFeedback({ text, children }: { text: string; children?: ReactNode }): JSX.Element {
  return (
    <div className="search-feedback">
      <span role="status">{text}</span>
      {children}
    </div>
  );
}

export function ResultsToolbar({
  showExact,
  onToggleExact,
  displayedCount,
  totalCount,
  periodLabel,
  matchCount,
  hasQuery,
  showAll,
  onToggleShowAll,
  onClearSearch,
}: {
  showExact: boolean;
  onToggleExact: (value: boolean) => void;
  displayedCount: number;
  totalCount: number;
  periodLabel: string;
  matchCount: number;
  hasQuery: boolean;
  showAll: boolean;
  onToggleShowAll: () => void;
  onClearSearch: () => void;
}): JSX.Element {
  return (
    <div className="results-toolbar">
      <label className="exact-toggle">
        <input type="checkbox" checked={showExact} onChange={(e) => onToggleExact(e.target.checked)} />
        Show exact USD
      </label>
      <p role="status">
        Showing <strong>{displayedCount}</strong> of {totalCount} partners for {periodLabel}{hasQuery ? ` (${matchCount} match your search)` : ''}.
      </p>
      {!hasQuery && (
        <button type="button" className="secondary-button" onClick={onToggleShowAll}>
          {showAll ? 'Show first 25' : `Show all ${totalCount}`}
        </button>
      )}
      {hasQuery && (
        <button type="button" onClick={onClearSearch}>
          Clear search
        </button>
      )}
    </div>
  );
}

export function PartnerEmptyState({ query, onClear }: { query: string; onClear: () => void }): JSX.Element {
  return (
    <div className="empty-state">
      <h3>No partners match “{capQuery(query)}”</h3>
      <p>Try another name or a Census partner code.</p>
      <button type="button" onClick={onClear}>
        Clear search
      </button>
    </div>
  );
}
