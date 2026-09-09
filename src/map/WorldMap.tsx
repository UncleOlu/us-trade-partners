import { useEffect, useMemo, useRef, useState } from 'react';
import { geoNaturalEarth1, geoPath } from 'd3-geo';
import type { GeoPath, GeoPermissibleObjects } from 'd3-geo';
import { LEGEND, NO_DATA_FILL, NO_DATA_HATCH_ID, NO_DATA_HATCH_STROKE, bandForBalance } from './bands';
import { ariaLabelFor, describeFlows } from './describe';
import { useAtlas, type CountryFeature } from './useAtlas';
import { useContainerWidth } from './useContainerWidth';
import { isUsable } from '../lib/status';
import type { MapPartner, MapSummaryPartner, UnmatchedFeature, UnmatchedPartner, WorldMapProps } from './types';

const ASPECT_RATIO = 1.9; // width / height, close to the natural earth projection's own aspect
const FALLBACK_WIDTH = 960;

interface JoinedFeature {
  feature: CountryFeature;
  featureId: number | null;
  partner: MapPartner | null;
  summaryPartner: MapSummaryPartner | null;
}

interface TooltipState {
  code: string;
  x: number;
  y: number;
}

export function WorldMap({
  year,
  summaryPartners,
  partners,
  selectedCode,
  onSelect,
  basePath,
  diagnostics,
}: WorldMapProps): JSX.Element {
  const atlas = useAtlas(basePath);
  const [containerRef, width] = useContainerWidth<HTMLDivElement>(FALLBACK_WIDTH);
  const height = Math.round(width / ASPECT_RATIO);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  const partnerByFeatureId = useMemo(() => {
    const m = new Map<number, MapPartner>();
    for (const p of partners) {
      if (p.map_feature_id !== null && !m.has(p.map_feature_id)) {
        m.set(p.map_feature_id, p);
      }
    }
    return m;
  }, [partners]);

  const summaryByCode = useMemo(() => {
    const m = new Map<string, MapSummaryPartner>();
    for (const sp of summaryPartners) m.set(sp.code, sp);
    return m;
  }, [summaryPartners]);

  // Diagnostics: computed once per atlas load (features identity) or partner
  // list load, independent of year, so it never fires on a year change.
  const reportedFeatures = useRef<unknown>(null);
  const reportedPartners = useRef<unknown>(null);
  useEffect(() => {
    if (atlas.status !== 'ready') return;
    if (reportedFeatures.current === atlas.features && reportedPartners.current === partners) return;
    reportedFeatures.current = atlas.features;
    reportedPartners.current = partners;

    const featureIds = new Map<number, string>();
    const noIdFeatures: UnmatchedFeature[] = [];
    for (const f of atlas.features.features) {
      const rawId = f.id;
      const name = f.properties?.name ?? 'Unknown';
      const numericId = rawId === undefined || rawId === null ? NaN : Number(rawId);
      if (Number.isNaN(numericId)) {
        noIdFeatures.push({ id: null, name });
      } else {
        featureIds.set(numericId, name);
      }
    }

    const matchedFeatureIds = new Set<number>();
    const partnersWithoutFeature: UnmatchedPartner[] = [];
    for (const p of partners) {
      if (p.resolution !== 'approved') continue;
      if (p.map_feature_id !== null && featureIds.has(p.map_feature_id)) {
        matchedFeatureIds.add(p.map_feature_id);
      } else {
        partnersWithoutFeature.push({ code: p.code, name: p.name, map_feature_id: p.map_feature_id });
      }
    }

    const featuresWithoutPartner: UnmatchedFeature[] = [...noIdFeatures];
    for (const [id, name] of featureIds) {
      if (!matchedFeatureIds.has(id)) featuresWithoutPartner.push({ id, name });
    }

    diagnostics?.({ featuresWithoutPartner, partnersWithoutFeature });
    // diagnostics intentionally excluded from deps: it is a callback prop
    // and this effect must run once per data load, not once per render
    // where the caller passed a new function identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [atlas, partners]);

  const joined: JoinedFeature[] = useMemo(() => {
    if (atlas.status !== 'ready') return [];
    return atlas.features.features.map((f) => {
      const rawId = f.id;
      const numericId = rawId === undefined || rawId === null ? NaN : Number(rawId);
      const featureId = Number.isNaN(numericId) ? null : numericId;
      const partner = featureId === null ? null : (partnerByFeatureId.get(featureId) ?? null);
      const summaryPartner = partner ? (summaryByCode.get(partner.code) ?? null) : null;
      return { feature: f, featureId, partner, summaryPartner };
    });
  }, [atlas, partnerByFeatureId, summaryByCode]);

  // The projection and path generator depend only on the feature geometry
  // and the container size, never on year or selection, so panning the year
  // slider never recomputes any path geometry.
  const pathGenerator: GeoPath<unknown, GeoPermissibleObjects> | null = useMemo(() => {
    if (atlas.status !== 'ready' || width <= 0 || height <= 0) return null;
    const projection = geoNaturalEarth1().fitSize([width, height], atlas.features as unknown as GeoPermissibleObjects);
    return geoPath(projection);
  }, [atlas, width, height]);

  const featurePaths = useMemo(() => {
    if (!pathGenerator) return [];
    return joined.map((j) => ({
      ...j,
      d: pathGenerator(j.feature as unknown as GeoPermissibleObjects) ?? '',
    }));
  }, [joined, pathGenerator]);

  if (atlas.status === 'error') {
    return (
      <div className="world-map world-map-error" role="alert">
        Could not load the world map atlas: {atlas.error.message}
      </div>
    );
  }

  if (atlas.status === 'loading' || !pathGenerator) {
    return (
      <div className="world-map world-map-loading" ref={containerRef}>
        Loading map
      </div>
    );
  }

  const activeTooltip =
    tooltip && featurePaths.find((f) => f.partner?.code === tooltip.code && f.summaryPartner);

  return (
    <div className="world-map" ref={containerRef}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        height={height}
        role="img"
        aria-label={`World map of US goods trade balance for ${year}`}
      >
        <defs>
          <pattern
            id={NO_DATA_HATCH_ID}
            width="6"
            height="6"
            patternTransform="rotate(45)"
            patternUnits="userSpaceOnUse"
          >
            <rect width="6" height="6" fill={NO_DATA_FILL} />
            <line x1="0" y1="0" x2="0" y2="6" stroke={NO_DATA_HATCH_STROKE} strokeWidth="2" />
          </pattern>
        </defs>
        <g>
          {featurePaths.map(({ feature, featureId, partner, summaryPartner, d }) => {
            const key = featureId !== null ? String(featureId) : `noid-${feature.properties?.name ?? Math.random()}`;
            const hasData = !!summaryPartner && isUsable(summaryPartner.balance);
            const fill = hasData
              ? bandForBalance((summaryPartner!.balance.value as number)).color
              : `url(#${NO_DATA_HATCH_ID})`;
            const isSelected = !!partner && partner.code === selectedCode;
            const selectable = !!partner && !!summaryPartner;

            const commonProps = {
              d,
              fill,
              stroke: isSelected ? '#111827' : '#ffffff',
              strokeWidth: isSelected ? 2 : 0.5,
            };

            if (!selectable || !partner || !summaryPartner) {
              return <path key={key} {...commonProps} className="world-map-feature" aria-hidden="true" />;
            }

            const label = ariaLabelFor(partner.name, summaryPartner);
            const code = partner.code;

            return (
              <path
                key={key}
                {...commonProps}
                className={`world-map-feature world-map-feature-interactive${isSelected ? ' selected' : ''}`}
                tabIndex={0}
                role="button"
                aria-label={label}
                aria-pressed={isSelected}
                onClick={() => onSelect(code)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelect(code);
                  }
                }}
                onMouseEnter={(e) => setTooltip({ code, x: e.clientX, y: e.clientY })}
                onMouseMove={(e) => setTooltip({ code, x: e.clientX, y: e.clientY })}
                onMouseLeave={() => setTooltip((t) => (t?.code === code ? null : t))}
                onFocus={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  setTooltip({ code, x: rect.left + rect.width / 2, y: rect.top });
                }}
                onBlur={() => setTooltip((t) => (t?.code === code ? null : t))}
              />
            );
          })}
        </g>
      </svg>

      {activeTooltip && activeTooltip.partner && activeTooltip.summaryPartner && (
        <Tooltip
          x={tooltip!.x}
          y={tooltip!.y}
          name={activeTooltip.partner.name}
          flows={describeFlows(activeTooltip.summaryPartner)}
        />
      )}

      <Legend />
    </div>
  );
}

function Tooltip({
  x,
  y,
  name,
  flows,
}: {
  x: number;
  y: number;
  name: string;
  flows: { imports: string; exports: string; balance: string };
}): JSX.Element {
  return (
    <div
      className="world-map-tooltip"
      role="tooltip"
      style={{ position: 'fixed', left: x + 12, top: y + 12, pointerEvents: 'none' }}
    >
      <strong>{name}</strong>
      <div>Imports {flows.imports}</div>
      <div>Exports {flows.exports}</div>
      <div>Balance {flows.balance}</div>
    </div>
  );
}

function Legend(): JSX.Element {
  return (
    <ul className="world-map-legend" aria-label="Trade balance color legend">
      {LEGEND.map((entry) => (
        <li key={entry.id} style={{ display: 'flex', alignItems: 'center', gap: '0.4em' }}>
          {/* An SVG swatch, not a CSS background, because the no-data entry
              fills with the same SVG pattern used on the map (fill="url(#id)"
              is SVG syntax and has no equivalent as a plain CSS background). */}
          <svg width="14" height="14" aria-hidden="true" className="world-map-legend-swatch">
            <rect
              width="14"
              height="14"
              fill={entry.isNoData ? `url(#${NO_DATA_HATCH_ID})` : entry.color}
              stroke="#9ca3af"
              strokeWidth="0.5"
            />
          </svg>
          {entry.label}
        </li>
      ))}
    </ul>
  );
}
