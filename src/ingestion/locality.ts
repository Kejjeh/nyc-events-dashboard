import type { Borough } from '../domain/event';
import { boroughFromLatLng } from './borough';

/** A resolved location: a city, plus an NYC borough when the point is in NYC. */
export interface Locality {
  city: string;
  borough?: Borough;
}

/**
 * Northeast metros we capture beyond NYC. NYC itself is resolved precisely by
 * the borough polygons (below), so it is intentionally NOT in this list. Radii
 * are kept modest; overlapping ones (DC/Baltimore) are disambiguated by
 * nearest-center, so a point goes to the closest metro whose radius covers it.
 */
const NE_CITIES: { city: string; lat: number; lon: number; radiusMi: number }[] = [
  { city: 'Philadelphia', lat: 39.9526, lon: -75.1652, radiusMi: 25 },
  { city: 'Washington', lat: 38.9072, lon: -77.0369, radiusMi: 22 },
  { city: 'Boston', lat: 42.3601, lon: -71.0589, radiusMi: 25 },
  { city: 'Baltimore', lat: 39.2904, lon: -76.6122, radiusMi: 20 },
  { city: 'Albany', lat: 42.6526, lon: -73.7562, radiusMi: 20 },
  { city: 'New Haven', lat: 41.3083, lon: -72.9279, radiusMi: 18 },
  { city: 'Providence', lat: 41.824, lon: -71.4128, radiusMi: 18 },
];

function haversineMi(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3958.8; // Earth radius in miles
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/**
 * Resolves a latitude/longitude to a Northeast locality. NYC keeps precise
 * borough classification via point-in-polygon; other metros use
 * nearest-center-within-radius. Returns null for points outside every supported
 * metro (so non-NYC NYC-metro spillover like Newark is dropped, exactly as before).
 */
export function localityFromLatLng(lat: number, lon: number): Locality | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  const borough = boroughFromLatLng(lat, lon);
  if (borough) return { city: 'New York', borough };

  let best: { city: string; d: number } | null = null;
  for (const c of NE_CITIES) {
    const d = haversineMi(lat, lon, c.lat, c.lon);
    if (d <= c.radiusMi && (!best || d < best.d)) best = { city: c.city, d };
  }
  return best ? { city: best.city } : null;
}
