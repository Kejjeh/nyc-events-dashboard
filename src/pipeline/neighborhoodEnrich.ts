import { readFile, writeFile } from 'node:fs/promises';
import type { Event } from '../domain/event';

const CACHE_PATH = 'public/data/neighborhood-cache.json';

type Cache = Record<string, string | null>;
type ReverseFn = (lat: number, lon: number, key: string) => Promise<string | null>;

export interface CacheStore {
  load(): Promise<Cache>;
  save(cache: Cache): Promise<void>;
}

const fileStore: CacheStore = {
  load: async () => {
    try {
      return JSON.parse(await readFile(CACHE_PATH, 'utf8')) as Cache;
    } catch {
      return {};
    }
  },
  save: (cache) => writeFile(CACHE_PATH, JSON.stringify(cache, null, 2) + '\n'),
};

/** Round to 4 decimal places (~11 m precision) for a stable cache key. */
function cacheKey(lat: number, lon: number): string {
  return `${lat.toFixed(4)},${lon.toFixed(4)}`;
}

/** Extract the Google Maps "neighborhood" component from a reverse-geocode result. */
function extractNeighborhood(results: any[]): string | null {
  for (const result of results ?? []) {
    for (const component of result.address_components ?? []) {
      if ((component.types ?? []).includes('neighborhood')) {
        return component.long_name ?? null;
      }
    }
  }
  return null;
}

const reverseGeocode: ReverseFn = async (lat, lon, key) => {
  try {
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lon}&key=${key}`,
    );
    if (!res.ok) return null;
    const body = (await res.json()) as any;
    return extractNeighborhood(body?.results ?? []);
  } catch {
    return null;
  }
};

/**
 * Replaces NTA-derived neighborhood names with real Google Maps neighborhood
 * names for every event that has lat/lon. Results are persisted to a JSON
 * cache file so each venue is looked up at most once across all pipeline runs.
 *
 * Events without coordinates keep whatever neighborhood the adapter assigned
 * (NTA or none). Events where Google Maps returns no neighborhood also keep
 * their NTA name. The cache stores null for locations with no neighborhood
 * so they are not retried on subsequent builds.
 */
export async function enrichWithNeighborhoods(
  events: Event[],
  apiKey: string | null | undefined,
  reverseFn: ReverseFn = reverseGeocode,
  concurrency = 10,
  store: CacheStore = fileStore,
): Promise<Event[]> {
  if (!apiKey) return events;

  const cache = await store.load();

  // Collect unique coordinates not yet in cache.
  const needed = new Set<string>();
  for (const e of events) {
    if (e.lat == null || e.lon == null) continue;
    const k = cacheKey(e.lat, e.lon);
    if (!(k in cache)) needed.add(k);
  }

  // Resolve cache misses in concurrent chunks.
  const keys = [...needed];
  for (let i = 0; i < keys.length; i += concurrency) {
    const chunk = keys.slice(i, i + concurrency);
    const results = await Promise.all(
      chunk.map(async (k) => {
        const [lat, lon] = k.split(',').map(Number);
        return [k, await reverseFn(lat, lon, apiKey)] as const;
      }),
    );
    for (const [k, name] of results) cache[k] = name;
  }

  // Persist the updated cache.
  if (needed.size > 0) {
    await store.save(cache);
  }

  // Apply: Google Maps name wins; fall back to existing neighborhood (NTA).
  return events.map((event) => {
    if (event.lat == null || event.lon == null) return event;
    const gmaps = cache[cacheKey(event.lat, event.lon)];
    if (!gmaps) return event; // null means "no neighborhood returned"
    if (gmaps === event.neighborhood) return event;
    return { ...event, neighborhood: gmaps };
  });
}
