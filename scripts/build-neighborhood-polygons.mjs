// One-off: fetch NYC Neighborhood Tabulation Areas (NTAs), keep the four target
// boroughs, simplify, and write a compact polygon bundle for runtime
// point-in-polygon neighborhood lookup.
import { mkdir, writeFile } from 'node:fs/promises';

const SOURCE = 'https://data.cityofnewyork.us/api/geospatial/9nt8-h7nd?method=export&format=GeoJSON';
const TARGET = new Set(['Bronx', 'Queens', 'Manhattan', 'Brooklyn']);
const EPSILON = 0.0008; // ~80m radial simplification

const round = (n) => Math.round(n * 1e5) / 1e5;

function simplifyRing(ring) {
  if (!Array.isArray(ring) || ring.length === 0) return [];
  const out = [[round(ring[0][0]), round(ring[0][1])]];
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
  // A small MultiPolygon part (island/sliver) can collapse below the 4 points a
  // closed ring needs, producing a ring point-in-polygon can never hit — silent
  // data loss. Keep the full-resolution ring instead of shipping a dead one.
  if (out.length < 4) return ring.map(([lon, lat]) => [round(lon), round(lat)]);
  return out;
}

const res = await fetch(SOURCE, { headers: { 'User-Agent': 'Mozilla/5.0' } });
if (!res.ok) throw new Error(`fetch failed: HTTP ${res.status}`);
const geo = await res.json();

const features = [];
let dropped = 0;
for (const f of geo.features) {
  const name = f.properties?.ntaname;
  const borough = f.properties?.boroname;
  if (!TARGET.has(borough) || !name) continue;
  const geom = f.geometry;
  if (!geom || !Array.isArray(geom.coordinates)) continue; // null/empty geometry
  const polys = geom.type === 'MultiPolygon' ? geom.coordinates : [geom.coordinates];
  const rings = polys
    .map((poly) => simplifyRing(poly?.[0] ?? [])) // outer ring of each part
    .filter((r) => {
      if (r.length >= 4) return true;
      dropped++;
      return false;
    });
  if (rings.length === 0) continue;
  features.push({ name, borough, rings });
}
if (dropped > 0) console.warn(`warning: dropped ${dropped} degenerate ring(s) below 4 points`);

const before = JSON.stringify(geo).length;
const after = JSON.stringify(features).length;
const points = features.flatMap((f) => f.rings).reduce((s, r) => s + r.length, 0);

await mkdir('src/ingestion/data', { recursive: true });
await writeFile('src/ingestion/data/neighborhood-polygons.json', JSON.stringify(features) + '\n');
console.log(`neighborhoods: ${features.length} | rings: ${features.flatMap((f) => f.rings).length} | points: ${points} | ${before} -> ${after} bytes`);
