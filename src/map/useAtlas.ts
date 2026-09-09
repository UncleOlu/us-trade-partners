import { useEffect, useRef, useState } from 'react';
import { feature } from 'topojson-client';
import type { Feature, FeatureCollection, Geometry } from 'geojson';

export interface CountryProperties {
  name: string;
}

export type CountryFeature = Feature<Geometry, CountryProperties>;
export type CountryFeatureCollection = FeatureCollection<Geometry, CountryProperties>;

// Minimal shape of the fetched TopoJSON, just enough to hand off to
// topojson-client. The full Topology type lives in topojson-specification,
// an indirect type dependency we do not import directly here.
interface CountriesTopology {
  type: 'Topology';
  objects: {
    countries: {
      type: 'GeometryCollection';
      geometries: unknown[];
    };
  };
  arcs: number[][][];
}

export type AtlasState =
  | { status: 'loading' }
  | { status: 'error'; error: Error }
  | { status: 'ready'; features: CountryFeatureCollection };

/**
 * Fetches `${basePath}atlas/countries-110m.json` once and converts it with
 * topojson-client. Only refetches when basePath itself changes, never when
 * year, selectedCode, partners, or summaryPartners change.
 */
export function useAtlas(basePath: string): AtlasState {
  const [state, setState] = useState<AtlasState>({ status: 'loading' });
  const requestedFor = useRef<string | null>(null);

  useEffect(() => {
    if (requestedFor.current === basePath) return;
    requestedFor.current = basePath;

    const controller = new AbortController();
    setState({ status: 'loading' });

    const url = `${basePath}atlas/countries-110m.json`;

    fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Atlas fetch failed with status ${response.status}: ${url}`);
        }
        return response.json() as Promise<CountriesTopology>;
      })
      .then((topology) => {
        const collection = feature(
          topology as unknown as Parameters<typeof feature>[0],
          topology.objects.countries as unknown as Parameters<typeof feature>[1],
        ) as unknown as CountryFeatureCollection;
        setState({ status: 'ready', features: collection });
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        const error = err instanceof Error ? err : new Error(`Atlas fetch failed: ${String(err)}`);
        setState({ status: 'error', error });
      });

    return () => controller.abort();
  }, [basePath]);

  return state;
}
