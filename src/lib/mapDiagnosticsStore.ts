import { useSyncExternalStore } from 'react';
import type { WorldMapDiagnostics } from '../map';

// Module-scoped store so the methodology page can render the map's
// diagnostics list (per schema/CONTRACT.md Map interface) even though it is
// reported from a different route (home) than it is displayed on (methodology).
let current: WorldMapDiagnostics | null = null;
const listeners = new Set<() => void>();

export function setMapDiagnostics(d: WorldMapDiagnostics): void {
  current = d;
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): WorldMapDiagnostics | null {
  return current;
}

export function useMapDiagnostics(): WorldMapDiagnostics | null {
  return useSyncExternalStore(subscribe, getSnapshot);
}
