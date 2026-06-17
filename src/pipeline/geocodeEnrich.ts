import type { Event } from '../domain/event';
import { boroughFromLatLng } from '../ingestion/borough';
import { neighborhoodFromLatLng } from '../ingestion/neighborhood';

// Sources whose venue names are stable, descriptive, and geocodeable.
const GEOCODEABLE_SOURCES = new Set(['bpl', 'smallslive', 'village-vanguard', 'todaytix', 'cityparks', 'serpapi']);

type GeocodeFn = (query: string, key: string) => Promise<{ lat: number; lon: number } | null>;

const geocodeViaGoogle: GeocodeFn = async (query, key) => {
  try {
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)}&key=${key}`,
    );
    if (!res.ok) return null;
    const body = (await res.json()) as any;
    const loc = body?.results?.[0]?.geometry?.location;
    if (loc?.lat == null || loc?.lng == null) return null;
    return { lat: loc.lat, lon: loc.lng };
  } catch {
    return null;
  }
};

/**
 * Resolves venue lat/lon for events that don't have coordinates, using the
 * Google Maps Geocoding API. Deduplicates by venue name so each physical
 * location is geocoded at most once per run. Events whose lat/lon was set by
 * a previous run (carried forward) are skipped — the API is only hit for
 * genuinely new venues. Geocoded coordinates also trigger a fresh neighborhood
 * lookup so previously neighborhood-less events (e.g. BPL branches) get one.
 */
export async function enrichWithGeocode(
  events: Event[],
  apiKey: string | null | undefined,
  geocode: GeocodeFn = geocodeViaGoogle,
  concurrency = 10,
): Promise<Event[]> {
  if (!apiKey) return events;

  // Collect unique venue keys that still need coordinates.
  const needed = new Map<string, string>(); // venueKey → geocode query
  for (const e of events) {
    if (e.lat != null || !GEOCODEABLE_SOURCES.has(e.source)) continue;
    const key = `${e.venue}||${e.borough}`;
    if (!needed.has(key)) {
      needed.set(key, `${e.venue}, ${e.borough}, New York City, NY`);
    }
  }
  if (needed.size === 0) return events;

  // Resolve in concurrent chunks.
  const cache = new Map<string, { lat: number; lon: number } | null>();
  const entries = [...needed];
  for (let i = 0; i < entries.length; i += concurrency) {
    const chunk = entries.slice(i, i + concurrency);
    const results = await Promise.all(
      chunk.map(async ([key, query]) => [key, await geocode(query, apiKey)] as const),
    );
    for (const [key, coords] of results) cache.set(key, coords);
  }

  return events.map((event) => {
    if (event.lat != null || !GEOCODEABLE_SOURCES.has(event.source)) return event;
    const key = `${event.venue}||${event.borough}`;
    const coords = cache.get(key);
    if (!coords) return event;

    // Sanity-check: the geocoded point must fall within the event's own borough.
    if (boroughFromLatLng(coords.lat, coords.lon) !== event.borough) return event;

    const neighborhood =
      neighborhoodFromLatLng(coords.lat, coords.lon, event.borough) ?? event.neighborhood;
    return { ...event, lat: coords.lat, lon: coords.lon, ...(neighborhood && { neighborhood }) };
  });
}
