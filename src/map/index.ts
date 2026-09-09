// src/map/index.ts: the Map interface entry point per schema/CONTRACT.md.
// Exported both as the default export and as the named export WorldMap so
// either import style resolves to the same component.
export { WorldMap } from './WorldMap';
export { WorldMap as default } from './WorldMap';

export type {
  WorldMapProps,
  WorldMapDiagnostics,
  UnmatchedFeature,
  UnmatchedPartner,
  MapPartner,
  MapSummaryPartner,
} from './types';

export { BANDS, BAND_THRESHOLDS_USD, LEGEND, bandForBalance, NO_DATA_FILL, NO_DATA_LABEL } from './bands';
