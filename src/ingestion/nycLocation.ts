import type { Borough } from '../domain/event';
import { boroughFromLatLng } from './borough';
import { neighborhoodFromLatLng } from './neighborhood';

/** An NYC location: the resolved borough, plus its NTA neighborhood when known. */
export interface NycLocation {
  borough: Borough;
  neighborhood?: string;
}

/**
 * Resolves a venue's coordinates to its NYC borough and neighborhood — the
 * borough/neighborhood dance every NYC-scoped normalizer used to repeat inline.
 * Returns null for points outside the four boroughs (most sources drop those).
 *
 * `fallbackBorough` covers sources that recover a borough from the venue's city
 * name when the point falls just outside the polygons (e.g. cityParks, TM).
 */
export function nycLocationFromLatLng(
  lat: number,
  lon: number,
  fallbackBorough?: Borough | null,
): NycLocation | null {
  const borough = boroughFromLatLng(lat, lon) ?? fallbackBorough ?? null;
  if (!borough) return null;
  const neighborhood = neighborhoodFromLatLng(lat, lon, borough) ?? undefined;
  return { borough, ...(neighborhood && { neighborhood }) };
}
