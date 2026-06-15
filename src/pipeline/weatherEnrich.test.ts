import { describe, expect, it } from 'vitest';
import { enrichWithWeather } from './weatherEnrich';
import type { Event } from '../domain/event';

const TODAY_MS = new Date('2026-06-15T12:00:00Z').getTime();

// Inject a fake Date.now so tests are deterministic.
const realNow = Date.now;
function withNow(ms: number, fn: () => Promise<void>): Promise<void> {
  Date.now = () => ms;
  return fn().finally(() => { Date.now = realNow; });
}

const FORECAST_BODY = {
  list: [
    { dt: Math.floor(new Date('2026-06-15T15:00:00Z').getTime() / 1000), main: { temp: 78 }, weather: [{ icon: '02d', description: 'few clouds' }] },
    { dt: Math.floor(new Date('2026-06-16T15:00:00Z').getTime() / 1000), main: { temp: 82 }, weather: [{ icon: '01d', description: 'clear sky' }] },
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

  it('attaches weather to an outdoor event within 5 days', () =>
    withNow(TODAY_MS, async () => {
      const events = [makeEvent({ start: '2026-06-15T19:00:00' })];
      const result = await enrichWithWeather(events, 'key', makeFetch(FORECAST_BODY));
      expect(result[0].weather).toEqual({ icon: '02d', temp: 78, description: 'few clouds' });
    }));

  it('picks the closest forecast slot', () =>
    withNow(TODAY_MS, async () => {
      // Event is on June 16 — closer to the second slot.
      const events = [makeEvent({ start: '2026-06-16T18:00:00' })];
      const result = await enrichWithWeather(events, 'key', makeFetch(FORECAST_BODY));
      expect(result[0].weather?.icon).toBe('01d');
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
