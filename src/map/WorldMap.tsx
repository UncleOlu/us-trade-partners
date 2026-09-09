import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { geoNaturalEarth1, geoPath } from 'd3-geo';
import type { GeoPath, GeoPermissibleObjects } from 'd3-geo';
import { LEGEND, NO_DATA_FILL, NO_DATA_HATCH_ID, NO_DATA_HATCH_STROKE, bandForBalance } from './bands';
import { ariaLabelFor, describeFlows } from './describe';
import { formatExactUsd } from '../lib/units';
import './map.css';
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

export function WorldMap({
  year,
  summaryPartners,
  partners,
  selectedCode,
  onSelect,
  basePath,
  diagnostics,
}: WorldMapProps): JSX.Element {
  const [attempt, setAttempt] = useState(0);
  const atlas = useAtlas(basePath, attempt);
  const descriptionId = useId();
  const countryRefs = useRef(new Map<string, SVGPathElement>());
  const [focusCode, setFocusCode] = useState<string | null>(selectedCode);
  const [containerRef, width] = useContainerWidth<HTMLDivElement>(FALLBACK_WIDTH);
  const height = Math.round(width / ASPECT_RATIO);
  const [readoutCode, setReadoutCode] = useState<string | null>(null);

  const partnerByFeatureId = useMemo(() => {
    const m = new Map<number, MapPartner>();
    for (const p of partners) {
      if (p.resolution === 'approved' && p.map_feature_id !== null && !m.has(p.map_feature_id)) {
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

  const selectableFeatures = useMemo(() => featurePaths
    .filter((f) => f.partner && f.summaryPartner)
    .sort((a, b) => a.partner!.name.localeCompare(b.partner!.name, 'en')), [featurePaths]);
  const tabCode = selectableFeatures.some((f) => f.partner!.code === focusCode)
    ? focusCode : selectableFeatures[0]?.partner?.code;

  if (atlas.status === 'error') {
    return (
      <div className="world-map world-map-error" ref={containerRef} role="alert">
        <p>Could not load the world map. You can still use the partner list.</p>
        <button type="button" onClick={() => setAttempt((value) => value + 1)}>Retry map</button>
        <a href="#partner-results">Go to partner results</a>
      </div>
    );
  }

  if (atlas.status === 'loading' || !pathGenerator) {
    return (
      <div className="world-map world-map-loading" ref={containerRef} role="status">
        Loading map
      </div>
    );
  }

  const activeReadout = featurePaths.find((f) => f.partner?.code === readoutCode && f.summaryPartner);

  return (
    <div className="world-map" ref={containerRef}>
      <p className="world-map-instructions" id={descriptionId}>
        Select a country to open its trade details. Keyboard: arrow keys move by country name;
        Home and End jump to the first and last; Enter or Space opens details. Tab leaves the map.
      </p>
      <svg
        className="world-map-canvas"
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        height={height}
        role="group"
        aria-describedby={descriptionId}
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
          {featurePaths.map(({ featureId, partner, summaryPartner, d }, index) => {
            const key = featureId !== null ? String(featureId) : `noid-${index}`;
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
                ref={(element) => {
                  if (element) countryRefs.current.set(code, element);
                  else countryRefs.current.delete(code);
                }}
                tabIndex={code === tabCode ? 0 : -1}
                role="button"
                aria-label={label}
                onClick={() => onSelect(code)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setReadoutCode(null);
                  } else if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelect(code);
                  } else if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) {
                    e.preventDefault();
                    const current = selectableFeatures.findIndex((f) => f.partner!.code === code);
                    const count = selectableFeatures.length;
                    const next = e.key === 'Home' ? 0 : e.key === 'End' ? count - 1
                      : (current + (e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 1) + count) % count;
                    const nextCode = selectableFeatures[next].partner!.code;
                    setFocusCode(nextCode);
                    countryRefs.current.get(nextCode)?.focus();
                  }
                }}
                onMouseEnter={() => setReadoutCode(code)}
                onFocus={() => {
                  setFocusCode(code);
                  setReadoutCode(code);
                }}
              />
            );
          })}
        </g>
      </svg>

      <div className="world-map-readout" aria-label="Country trade readout">
        {activeReadout?.partner && activeReadout.summaryPartner ? (
          <>
            <strong>{activeReadout.partner.name}</strong>
            <dl>
              {(['imports', 'exports', 'balance'] as const).map((flow) => {
                const value = activeReadout.summaryPartner![flow];
                return <div key={flow}><dt>{flow[0].toUpperCase() + flow.slice(1)}</dt>
                  <dd>{describeFlows(activeReadout.summaryPartner!)[flow]}</dd>
                  <dd className="world-map-exact">{isUsable(value) ? formatExactUsd(value.value) : value.reason}</dd>
                </div>;
              })}
            </dl>
          </>
        ) : <>
          <strong>Reading the map</strong>
          <ul className="world-map-guide">
            <li>Red bands: imports exceed exports.</li>
            <li>Blue bands: exports exceed imports.</li>
            <li>White: within $100m of balance.</li>
            <li>Hatching: no balance or no mapped partner.</li>
          </ul>
        </>}
      </div>
      <p className="world-map-coverage">
        {selectableFeatures.length} of {summaryPartners.length} partners appear on this map.
        {' '}<a href="#partner-results">Search all partners</a>, including small territories and aggregates.
      </p>
      <Legend />
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
