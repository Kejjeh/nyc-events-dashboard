import { describe, expect, it } from 'vitest';
import { enrichWithWeather } from './weatherEnrich';
import type { Event } from '../domain/event';

const TODAY_MS = new Date('2026-06-15T12:00:00Z').getTime();

const SLOT1_DT = new Date('2026-06-15T15:00:00Z').getTime();
const SLOT2_DT = new Date('2026-06-16T15:00:00Z').getTime();

// Inject a fake Date.now so tests are deterministic.
const realNow = Date.now;
function withNow(ms: number, fn: () => Promise<void>): Promise<void> {
  Date.now = () => ms;
  return fn().finally(() => { Date.now = realNow; });
}

const FORECAST_BODY = {
  list: [
    { dt: Math.floor(SLOT1_DT / 1000), main: { temp: 78 }, weather: [{ icon: '02d', description: 'few clouds' }] },
    { dt: Math.floor(SLOT2_DT / 1000), main: { temp: 82 }, weather: [{ icon: '01d', description: 'clear sky' }] },
  ],
};

function makeFetch(body: any, status = 200) {
  return async (_url: string) =>
    ({ ok: status === 200, json: async () => body } as Response);
}

function makeEvent(overrides: Partial<Event> = {}): Event {
  return {
    id: 'nyc-parks:test',
    title: 'Park Concert',
    category: 'music',
    borough: 'Manhattan',
    venue: 'Central Park',
    start: '2026-06-15T19:00:00',
    isFree: true,
    url: 'https://example.com',
    source: 'nyc-parks',
    ...overrides,
  };
}

describe('enrichWithWeather', () => {
  it('returns events unchanged when no API key', async () => {
    const events = [makeEvent()];
    const result = await enrichWithWeather(events, null);
    expect(result).toBe(events);
  });

  it('attaches weather with dt to an outdoor event within 5 days', () =>
    withNow(TODAY_MS, async () => {
      const events = [makeEvent({ start: '2026-06-15T19:00:00' })];
      const result = await enrichWithWeather(events, 'key', makeFetch(FORECAST_BODY));
      expect(result[0].weather).toEqual({ icon: '02d', temp: 78, description: 'few clouds', dt: SLOT1_DT });
    }));

  it('picks the closest forecast slot by event start time', () =>
    withNow(TODAY_MS, async () => {
      // Event is on June 16 — closer to slot 2.
      const events = [makeEvent({ start: '2026-06-16T18:00:00' })];
      const result = await enrichWithWeather(events, 'key', makeFetch(FORECAST_BODY));
      expect(result[0].weather?.icon).toBe('01d');
      expect(result[0].weather?.dt).toBe(SLOT2_DT);
    }));

  it('uses the event venue lat/lon cluster for the forecast request', () =>
    withNow(TODAY_MS, async () => {
      const calls: string[] = [];
      const trackingFetch = async (url: string) => {
        calls.push(url);
        return { ok: true, json: async () => FORECAST_BODY } as Response;
      };
      // Bronx coords round to 40.8,-73.9 — distinct from NYC center 40.7,-74.0.
      const events = [makeEvent({ lat: 40.8448, lon: -73.904 })];
      await enrichWithWeather(events, 'key', trackingFetch);
      // One call for the Bronx cluster, one for the NYC center fallback.
      expect(calls.length).toBe(2);
      expect(calls.some((u) => u.includes('lat=40.7') && u.includes('lon=-74.0'))).toBe(true);
      expect(calls.some((u) => u.includes('lat=40.8') && u.includes('lon=-73.9'))).toBe(true);
    }));

  it('deduplicates nearby venues into one cluster fetch', () =>
    withNow(TODAY_MS, async () => {
      let callCount = 0;
      const counting = async (_url: string) => {
        callCount++;
        return { ok: true, json: async () => FORECAST_BODY } as Response;
      };
      // Two events less than 10 km apart → same cluster key.
      const events = [
        makeEvent({ lat: 40.7580, lon: -73.9855, source: 'nyc-parks' }),
        makeEvent({ id: 'nyc-parks:2', lat: 40.7600, lon: -73.9800, source: 'cityparks' }),
      ];
      await enrichWithWeather(events, 'key', counting);
      // NYC center + 1 cluster = 2 calls (not 3).
      expect(callCount).toBe(2);
    }));

  it('does not attach weather to non-outdoor sources', () =>
    withNow(TODAY_MS, async () => {
      const events = [makeEvent({ source: 'ticketmaster', start: '2026-06-15T19:00:00' })];
      const result = await enrichWithWeather(events, 'key', makeFetch(FORECAST_BODY));
      expect(result[0].weather).toBeUndefined();
    }));

  it('strips stale weather from events outside the 5-day window', () =>
    withNow(TODAY_MS, async () => {
      const events = [makeEvent({ start: '2026-06-25T19:00:00', weather: { icon: '01d', temp: 80, description: 'old' } })];
      const result = await enrichWithWeather(events, 'key', makeFetch(FORECAST_BODY));
      expect(result[0].weather).toBeUndefined();
    }));

  it('returns events unchanged when forecast fetch fails', () =>
    withNow(TODAY_MS, async () => {
      const events = [makeEvent()];
      const result = await enrichWithWeather(events, 'key', makeFetch({}, 500));
      expect(result[0].weather).toBeUndefined();
    }));
});
