// Single source of truth for the repo base path and snapshot id. Vite base,
// React Router basename, and every data fetch URL all read these two values so
// they can never drift apart.

export const BASE_PATH: string = __BASE_PATH__;
export const SNAPSHOT_ID: string = __SNAPSHOT_ID__;

// react-router basename must not have a trailing slash.
export const ROUTER_BASENAME: string = BASE_PATH.endsWith('/') ? BASE_PATH.slice(0, -1) : BASE_PATH;

export function dataUrl(relativePath: string): string {
  const clean = relativePath.startsWith('/') ? relativePath.slice(1) : relativePath;
  return `${BASE_PATH}data/${SNAPSHOT_ID}/${clean}`;
}

/** The pinned world-atlas 110m TopoJSON, served under the base path. Only the
 * home route (WorldMap) loads it. */
export const ATLAS_URL = `${BASE_PATH}atlas/countries-110m.json`;

export const GLOBAL_LABEL = 'US goods trade, Census basis. Excludes services. Values are nominal USD.';
