import { useEffect, useState } from 'react';
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
 * Fetches `${basePath}atlas/countries-110m.json` and converts it with
 * topojson-client. Refetches on basePath changes, retry, or StrictMode replay;
 * never on year, selectedCode, partners, or summaryPartners changes.
 */
export function useAtlas(basePath: string, attempt = 0): AtlasState {
  const [state, setState] = useState<AtlasState>({ status: 'loading' });

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: 'loading' });
    const timeout = window.setTimeout(() => {
      if (controller.signal.aborted) return;
      setState({ status: 'error', error: new Error('The map request took more than 30 seconds. Please retry.') });
      controller.abort();
    }, 30_000);

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
        if (!controller.signal.aborted) setState({ status: 'ready', features: collection });
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        const error = err instanceof Error ? err : new Error(`Atlas fetch failed: ${String(err)}`);
        setState({ status: 'error', error });
      })
      .finally(() => window.clearTimeout(timeout));

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [basePath, attempt]);

  return state;
}
