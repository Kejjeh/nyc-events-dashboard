import type { Event } from '../domain/event';

const OUTDOOR_SOURCES = new Set(['nyc-parks', 'nyc-greenmarket', 'smorgasburg', 'cityparks']);
const FIVE_DAYS_MS = 5 * 24 * 60 * 60 * 1000;
const NYC_LAT = 40.7128;
const NYC_LON = -74.006;

interface ForecastSlot {
  dt: number; // Unix ms
  temp: number;
  icon: string;
  description: string;
}

type FetchFn = (url: string) => Promise<Response>;

/** Round to 1 decimal place (~11 km) to cluster nearby venues together. */
function clusterKey(lat: number, lon: number): string {
  return `${Math.round(lat * 10) / 10},${Math.round(lon * 10) / 10}`;
}

async function fetchForecast(
  lat: number,
  lon: number,
  apiKey: string,
  fetchFn: FetchFn,
): Promise<ForecastSlot[]> {
  try {
    const res = await fetchFn(
      `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&cnt=40&appid=${apiKey}&units=imperial`,
    );
    if (!res.ok) return [];
    const body = (await res.json()) as any;
    return (body?.list ?? []).map((s: any) => ({
      dt: s.dt * 1000,
      temp: Math.round(s.main?.temp ?? 0),
      icon: s.weather?.[0]?.icon ?? '01d',
      description: s.weather?.[0]?.description ?? '',
    }));
  } catch {
    return [];
  }
}

function findSlot(
  slots: ForecastSlot[],
  startIso: string,
  nowMs: number,
): { icon: string; temp: number; description: string; dt: number } | null {
  const eventMs = new Date(startIso).getTime();
  if (Number.isNaN(eventMs) || eventMs < nowMs || eventMs > nowMs + FIVE_DAYS_MS) return null;

  let best: ForecastSlot | null = null;
  let bestDiff = Infinity;
  for (const slot of slots) {
    const diff = Math.abs(slot.dt - eventMs);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = slot;
    }
  }
  if (!best) return null;
  return { icon: best.icon, temp: best.temp, description: best.description, dt: best.dt };
}

/**
 * Attaches a weather forecast to outdoor events (parks, markets) within the
 * 5-day window. Strips stale weather from events outside the window.
 *
 * Events are clustered by lat/lon at ~10 km resolution so one API call covers
 * an entire neighborhood. Events without coordinates use a NYC-center fallback.
 * No-op without an API key or when the forecast fetch fails.
 */
export async function enrichWithWeather(
  events: Event[],
  apiKey: string | null | undefined,
  fetchFn: FetchFn = fetch,
): Promise<Event[]> {
  if (!apiKey) return events;

  const nowMs = Date.now();
  const ncKey = clusterKey(NYC_LAT, NYC_LON);

  // Build unique cluster map. Always include NYC center as fallback.
  const clusters = new Map<string, { lat: number; lon: number }>();
  clusters.set(ncKey, { lat: NYC_LAT, lon: NYC_LON });
  for (const event of events) {
    if (!OUTDOOR_SOURCES.has(event.source)) continue;
    if (event.lat == null || event.lon == null) continue;
    const k = clusterKey(event.lat, event.lon);
    if (!clusters.has(k)) {
      clusters.set(k, { lat: Math.round(event.lat * 10) / 10, lon: Math.round(event.lon * 10) / 10 });
    }
  }

  // Fetch all cluster forecasts in parallel.
  const forecastMap = new Map<string, ForecastSlot[]>();
  await Promise.all(
    [...clusters.entries()].map(async ([k, { lat, lon }]) => {
      const slots = await fetchForecast(lat, lon, apiKey, fetchFn);
      forecastMap.set(k, slots);
    }),
  );

  return events.map((event) => {
    if (!OUTDOOR_SOURCES.has(event.source)) return event;

    const k =
      event.lat != null && event.lon != null ? clusterKey(event.lat, event.lon) : ncKey;
    const slots = forecastMap.get(k) ?? forecastMap.get(ncKey) ?? [];

    const weather = findSlot(slots, event.start, nowMs);
    if (!weather) {
      // Outside the forecast window — strip any stale weather from a prior run.
      if (!event.weather) return event;
      const { weather: _w, ...rest } = event;
      return rest as Event;
    }
    return { ...event, weather };
  });
}
