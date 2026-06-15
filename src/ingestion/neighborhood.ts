import { pointInRing } from './borough';
import neighborhoodPolygons from './data/neighborhood-polygons.json';

interface NeighborhoodFeature {
  name: string;
  borough: string;
  rings: number[][][];
}

const FEATURES = neighborhoodPolygons as NeighborhoodFeature[];

/**
 * Resolves a latitude/longitude to its NYC neighborhood (2020 NTA name) via
 * point-in-polygon, or null when outside the bundled neighborhoods.
 *
 * The borough and neighborhood bundles are simplified independently, so near a
 * borough boundary a point can land in an NTA tagged to a different borough than
 * the one the caller already resolved. Pass `expectedBorough` to constrain the
 * lookup to in-borough NTAs, keeping the displayed "Borough · Neighborhood" pair
 * internally consistent.
 */
export function neighborhoodFromLatLng(
  lat: number,
  lon: number,
  expectedBorough?: string,
): string | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return null;
  }
  for (const feature of FEATURES) {
    if (expectedBorough && feature.borough !== expectedBorough) continue;
    if (feature.rings.some((ring) => pointInRing(lon, lat, ring))) {
      return feature.name;
    }
  }
  return null;
}
