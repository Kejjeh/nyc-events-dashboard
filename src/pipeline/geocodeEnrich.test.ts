import { describe, expect, it } from 'vitest';
import { enrichWithGeocode } from './geocodeEnrich';
import type { Event } from '../domain/event';

function makeEvent(overrides: Partial<Event> = {}): Event {
  return {
    id: 'bpl:test',
    title: 'Story Time',
    category: 'social',
    borough: 'Brooklyn',
    venue: 'Brooklyn Public Library - Flatbush Branch',
    start: '2026-08-10T11:00:00',
    isFree: true,
    url: 'https://bklynlibrary.org',
    source: 'bpl',
    ...overrides,
  };
}

const mockGeocode = async (query: string, _key: string) => {
  if (query.includes('Flatbush')) return { lat: 40.6501, lon: -73.9613 };
  return null;
};

describe('enrichWithGeocode', () => {
  it('returns events unchanged when no API key', async () => {
    const events = [makeEvent()];
    const result = await enrichWithGeocode(events, null);
    expect(result).toBe(events);
  });

  it('attaches lat/lon to a BPL event', async () => {
    const events = [makeEvent()];
    const result = await enrichWithGeocode(events, 'key', mockGeocode);
    expect(result[0].lat).toBeCloseTo(40.6501);
    expect(result[0].lon).toBeCloseTo(-73.9613);
  });

  it('also resolves a neighborhood once coordinates are known', async () => {
    const events = [makeEvent()];
    const result = await enrichWithGeocode(events, 'key', mockGeocode);
    // Should resolve to a Brooklyn neighborhood — not null.
    expect(result[0].neighborhood).toBeDefined();
  });

  it('skips events that already have coordinates', async () => {
    let calls = 0;
    const countingGeocode = async (q: string, k: string) => { calls++; return mockGeocode(q, k); };
    const events = [makeEvent({ lat: 40.65, lon: -73.96 })];
    await enrichWithGeocode(events, 'key', countingGeocode);
    expect(calls).toBe(0);
  });

  it('deduplicates: same venue geocoded only once across multiple events', async () => {
    let calls = 0;
    const countingGeocode = async (q: string, k: string) => { calls++; return mockGeocode(q, k); };
    const events = [makeEvent(), makeEvent({ id: 'bpl:test2', title: 'Book Club' })];
    await enrichWithGeocode(events, 'key', countingGeocode);
    expect(calls).toBe(1);
  });

  it('skips non-geocodeable sources (e.g. ticketmaster already has coords)', async () => {
    let calls = 0;
    const countingGeocode = async (q: string, k: string) => { calls++; return mockGeocode(q, k); };
    const events = [makeEvent({ source: 'ticketmaster' })];
    await enrichWithGeocode(events, 'key', countingGeocode);
    expect(calls).toBe(0);
  });

  it('drops geocode result whose point falls outside the expected borough', async () => {
    // Return a point in Manhattan, but event expects Brooklyn.
    const wrongBorough = async () => ({ lat: 40.7505, lon: -73.9934 });
    const events = [makeEvent()];
    const result = await enrichWithGeocode(events, 'key', wrongBorough);
    expect(result[0].lat).toBeUndefined();
  });

  it('leaves event unchanged when geocode returns null', async () => {
    const events = [makeEvent({ venue: 'Unknown Branch' })];
    const result = await enrichWithGeocode(events, 'key', async () => null);
    expect(result[0].lat).toBeUndefined();
    expect(result[0]).toEqual(events[0]);
  });
});
