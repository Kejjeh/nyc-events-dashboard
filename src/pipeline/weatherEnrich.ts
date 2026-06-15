import type { Event } from '../domain/event';

const OUTDOOR_SOURCES = new Set(['nyc-parks', 'nyc-greenmarket', 'smorgasburg', 'cityparks']);
const FIVE_DAYS_MS = 5 * 24 * 60 * 60 * 1000;

interface ForecastSlot {
  dt: number; // Unix ms
  temp: number;
  icon: string;
  description: string;
}

type FetchFn = (url: string) => Promise<Response>;

async function fetchForecast(apiKey: string, fetchFn: FetchFn): Promise<ForecastSlot[]> {
  try {
    const res = await fetchFn(
      `https://api.openweathermap.org/data/2.5/forecast?lat=40.7128&lon=-74.0060&cnt=40&appid=${apiKey}&units=imperial`,
    );
    if (!res.ok) return [];
    const body = (await res.json()) as any;
    return (body?.list ?? []).map((s: any) => ({
      dt: s.dt * 1000,
      temp: s.main?.temp ?? 0,
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
): { icon: string; temp: number; description: string } | null {
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
  return { icon: best.icon, temp: Math.round(best.temp), description: best.description };
}

/**
 * Attaches a weather forecast to outdoor events (parks, markets) within the
 * 5-day window. Strips stale weather from events outside the window. No-op
 * without an API key or when the forecast fetch fails.
 */
export async function enrichWithWeather(
  events: Event[],
  apiKey: string | null | undefined,
  fetchFn: FetchFn = fetch,
): Promise<Event[]> {
  if (!apiKey) return events;

  const nowMs = Date.now();
  const slots = await fetchForecast(apiKey, fetchFn);
  if (slots.length === 0) return events;

  return events.map((event) => {
    if (!OUTDOOR_SOURCES.has(event.source)) return event;

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
