// One-off: fetch NYC borough boundaries, keep the four target boroughs,
// simplify, and write a compact polygon bundle for runtime point-in-polygon.
import { mkdir, writeFile } from 'node:fs/promises';

const SOURCE =
  'https://raw.githubusercontent.com/blackmad/neighborhoods/master/new-york-city-boroughs.geojson';
const TARGET = new Set(['Bronx', 'Queens', 'Manhattan', 'Brooklyn']);
const EPSILON = 0.0015; // ~150m radial-distance simplification

const round = (n) => Math.round(n * 1e5) / 1e5;

// Radial-distance simplification: drop points within EPSILON of the last kept.
function simplifyRing(ring) {
  const out = [ring[0]];
  for (let i = 1; i < ring.length; i++) {
    const [lon, lat] = ring[i];
    const [plon, plat] = out[out.length - 1];
    if (Math.abs(lon - plon) > EPSILON || Math.abs(lat - plat) > EPSILON) {
      out.push([round(lon), round(lat)]);
    }
  }
  // Ensure the ring stays closed.
  const first = out[0];
  const last = out[out.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) out.push([round(first[0]), round(first[1])]);
  return out;
}

const res = await fetch(SOURCE, { headers: { 'User-Agent': 'Mozilla/5.0' } });
if (!res.ok) throw new Error(`fetch failed: HTTP ${res.status}`);
const geo = await res.json();

const polygons = {};
for (const f of geo.features) {
  const name = f.properties?.name;
  if (!TARGET.has(name)) continue;
  // MultiPolygon: [polygon][ring][coord]; keep each polygon's outer ring.
  const outerRings = f.geometry.coordinates.map((poly) => simplifyRing(poly[0]));
  polygons[name] = outerRings;
}

const before = JSON.stringify(geo).length;
const after = JSON.stringify(polygons).length;
const ptCount = Object.values(polygons)
  .flat()
  .reduce((s, r) => s + r.length, 0);

await mkdir('src/ingestion/data', { recursive: true });
await writeFile(
  'src/ingestion/data/borough-polygons.json',
  JSON.stringify(polygons) + '\n',
);
console.log(
  `boroughs: ${Object.keys(polygons).join(', ')}`,
);
console.log(
  `rings: ${Object.values(polygons).flat().length} | points: ${ptCount} | ${before} -> ${after} bytes`,
);
