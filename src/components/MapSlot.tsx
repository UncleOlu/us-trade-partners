import { WorldMap } from '../map';
import type { WorldMapProps } from '../map';
import { setMapDiagnostics } from '../lib/mapDiagnosticsStore';

// Direct integration of Agent C's src/map/ WorldMap component, per
// schema/CONTRACT.md's Map interface. Agent B never edits src/map/; this
// file only consumes its exported component and types.
export function MapSlot(props: WorldMapProps): JSX.Element {
  return <WorldMap {...props} diagnostics={props.diagnostics ?? setMapDiagnostics} />;
}
