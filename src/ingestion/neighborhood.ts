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
 */
export function neighborhoodFromLatLng(lat: number, lon: number): string | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return null;
  }
  for (const feature of FEATURES) {
    if (feature.rings.some((ring) => pointInRing(lon, lat, ring))) {
      return feature.name;
    }
  }
  return null;
}
