import type { Borough } from '../domain/event';
import boroughPolygons from './data/borough-polygons.json';

/** Outer rings ([lon, lat]) for each target borough, keyed by borough name. */
const BOROUGH_RINGS = boroughPolygons as Record<Borough, number[][][]>;

/** Ray-casting point-in-polygon test for a [lon, lat] point against one ring. */
export function pointInRing(lon: number, lat: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersects =
      yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

/**
 * Resolves a latitude/longitude to one of the four target boroughs via
 * point-in-polygon against bundled boundaries. Returns null for points outside
 * them (Staten Island, New Jersey, bad data).
 */
export function boroughFromLatLng(lat: number, lon: number): Borough | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return null;
  }
  for (const borough of Object.keys(BOROUGH_RINGS) as Borough[]) {
    if (BOROUGH_RINGS[borough].some((ring) => pointInRing(lon, lat, ring))) {
      return borough;
    }
  }
  return null;
}
