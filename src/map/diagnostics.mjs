#!/usr/bin/env node
// Standalone diagnostics dump for the WorldMap join. Loads the published
// partners.json and the pinned world-atlas 110m TopoJSON straight from
// node_modules (the same file Agent B's build copies to
// `${basePath}atlas/countries-110m.json`), replicates the join rule in
// src/map/WorldMap.tsx (partners[].map_feature_id equal to the numeric
// TopoJSON feature id, approved partners only, never by name), and prints
// both diagnostics lists with counts.
//
// Run from the project root:
//   node src/map/diagnostics.mjs [snapshotDir]
// snapshotDir defaults to the snapshot published for local testing.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..', '..');

const snapshotDir =
  process.argv[2] ?? path.join(projectRoot, 'data', '20260909T091429Z-c638aff167ea');

const partnersPath = path.join(snapshotDir, 'partners.json');
const atlasPath = path.join(projectRoot, 'node_modules', 'world-atlas', 'countries-110m.json');

function readJson(p) {
  return JSON.parse(readFileSync(p, 'utf-8'));
}

const partnersFile = readJson(partnersPath);
const atlas = readJson(atlasPath);

const geometries = atlas.objects.countries.geometries;

// Every feature id in the atlas, plus features that carry no id at all (a
// small number of disputed-territory shapes in the 110m resolution, e.g.
// Kosovo and Somaliland, ship with no numeric ISO code).
const featureIdToName = new Map();
const featuresWithNoId = [];
for (const g of geometries) {
  const name = g.properties?.name ?? 'Unknown';
  if (g.id === undefined || g.id === null) {
    featuresWithNoId.push({ id: null, name });
    continue;
  }
  const numericId = Number(g.id);
  if (Number.isNaN(numericId)) {
    featuresWithNoId.push({ id: null, name });
    continue;
  }
  featureIdToName.set(numericId, name);
}

// Only approved partners are ever candidates for the map: excluded partners
// (world-total row, country-groupings such as OPEC and the Census EU
// aggregate) never render, so they are not meaningful entries in either
// diagnostics list. This mirrors the filter in WorldMap.tsx's diagnostics
// effect.
const approvedPartners = partnersFile.partners.filter((p) => p.resolution === 'approved');

const matchedFeatureIds = new Set();
const partnersWithoutFeature = [];
for (const p of approvedPartners) {
  if (p.map_feature_id !== null && featureIdToName.has(p.map_feature_id)) {
    matchedFeatureIds.add(p.map_feature_id);
  } else {
    partnersWithoutFeature.push({ code: p.code, name: p.name, map_feature_id: p.map_feature_id });
  }
}

const featuresWithoutPartner = [...featuresWithNoId];
for (const [id, name] of featureIdToName) {
  if (!matchedFeatureIds.has(id)) featuresWithoutPartner.push({ id, name });
}

console.log(`Atlas: ${atlasPath}`);
console.log(`Partners: ${partnersPath}`);
console.log(`Total partners in partners.json: ${partnersFile.partners.length}`);
console.log(`Approved partners: ${approvedPartners.length}`);
console.log(`Atlas features total: ${geometries.length} (${featureIdToName.size} with a numeric id, ${featuresWithNoId.length} with no id)`);
console.log('');
console.log(`partnersWithoutFeature: ${partnersWithoutFeature.length}`);
for (const p of partnersWithoutFeature) {
  console.log(`  ${p.code}\t${p.name}\tmap_feature_id=${p.map_feature_id}`);
}
console.log('');
console.log(`featuresWithoutPartner: ${featuresWithoutPartner.length}`);
for (const f of featuresWithoutPartner) {
  console.log(`  ${f.id}\t${f.name}`);
}
