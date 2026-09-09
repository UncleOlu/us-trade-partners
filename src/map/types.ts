import type { Partners, Summary } from '../types/generated';

/** One row of partners.json, the full partner registry (approved and excluded). */
export type MapPartner = Partners['partners'][number];

/** One row of summary/<year>.json partners: approved partners only, with that year's flows. */
export type MapSummaryPartner = Summary['partners'][number];

/** A TopoJSON feature id with no matching approved partner. */
export interface UnmatchedFeature {
  /** The numeric ISO 3166-1 feature id, or null when the source feature carries no id at all. */
  id: number | null;
  name: string;
}

/** An approved partner whose map_feature_id matches no feature in the loaded atlas. */
export interface UnmatchedPartner {
  code: string;
  name: string;
  map_feature_id: number | null;
}

export interface WorldMapDiagnostics {
  featuresWithoutPartner: UnmatchedFeature[];
  partnersWithoutFeature: UnmatchedPartner[];
}

export interface WorldMapProps {
  year: number;
  /** summary.partners for the given year: approved partners only, with that year's flows. */
  summaryPartners: MapSummaryPartner[];
  /** partners.json partners: every code ever observed, approved and excluded, carries map_feature_id. */
  partners: MapPartner[];
  selectedCode: string | null;
  onSelect: (code: string) => void;
  /** Repo base path, e.g. "/us-trade-partners/". The atlas is fetched from `${basePath}atlas/countries-110m.json`. */
  basePath: string;
  /** Called once per atlas or partner-list load with the join diagnostics. Never called more than once for the same data. */
  diagnostics?: (report: WorldMapDiagnostics) => void;
}
