// One-off: fetch NYC Neighborhood Tabulation Areas (NTAs), keep the four target
// boroughs, simplify, and write a compact polygon bundle for runtime
// point-in-polygon neighborhood lookup.
import { mkdir, writeFile } from 'node:fs/promises';

const SOURCE = 'https://data.cityofnewyork.us/api/geospatial/9nt8-h7nd?method=export&format=GeoJSON';
const TARGET = new Set(['Bronx', 'Queens', 'Manhattan', 'Brooklyn']);
const EPSILON = 0.0008; // ~80m radial simplification

const round = (n) => Math.round(n * 1e5) / 1e5;

function simplifyRing(ring) {
  const out = [ring[0]];
  for (let i = 1; i < ring.length; i++) {
    const [lon, lat] = ring[i];
    const [plon, plat] = out[out.length - 1];
    if (Math.abs(lon - plon) > EPSILON || Math.abs(lat - plat) > EPSILON) {
      out.push([round(lon), round(lat)]);
    }
  }
  const first = out[0];
  const last = out[out.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) out.push([round(first[0]), round(first[1])]);
  return out;
}

const res = await fetch(SOURCE, { headers: { 'User-Agent': 'Mozilla/5.0' } });
if (!res.ok) throw new Error(`fetch failed: HTTP ${res.status}`);
const geo = await res.json();

const features = [];
for (const f of geo.features) {
  const name = f.properties?.ntaname;
  const borough = f.properties?.boroname;
  if (!TARGET.has(borough) || !name) continue;
  const polys = f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : [f.geometry.coordinates];
  const rings = polys.map((poly) => simplifyRing(poly[0])); // outer ring of each part
  features.push({ name, borough, rings });
}

const before = JSON.stringify(geo).length;
const after = JSON.stringify(features).length;
const points = features.flatMap((f) => f.rings).reduce((s, r) => s + r.length, 0);

await mkdir('src/ingestion/data', { recursive: true });
await writeFile('src/ingestion/data/neighborhood-polygons.json', JSON.stringify(features) + '\n');
console.log(`neighborhoods: ${features.length} | rings: ${features.flatMap((f) => f.rings).length} | points: ${points} | ${before} -> ${after} bytes`);
