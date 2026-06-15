import { describe, expect, it } from 'vitest';
import { enrichWithNeighborhoods, type CacheStore } from './neighborhoodEnrich';
import type { Event } from '../domain/event';

function makeEvent(overrides: Partial<Event> = {}): Event {
  return {
    id: 'tm:1',
    title: 'Concert',
    category: 'music',
    borough: 'Bronx',
    neighborhood: 'Van Nest-Morris Park-Tremont', // NTA name
    venue: 'Venue',
    start: '2026-08-01T20:00:00',
    isFree: false,
    url: 'https://example.com',
    source: 'ticketmaster',
    lat: 40.8387,
    lon: -73.8607,
    ...overrides,
  };
}

/** In-memory cache store — no filesystem I/O in tests. */
function memStore(initial: Record<string, string | null> = {}): CacheStore {
  const data = { ...initial };
  return {
    load: async () => ({ ...data }),
    save: async (cache) => { Object.assign(data, cache); },
  };
}

// Simulates Google Maps returning the real neighborhood name.
const mockReverse = async (lat: number, _lon: number, _key: string): Promise<string | null> => {
  if (Math.abs(lat - 40.8387) < 0.001) return 'Parkchester';
  if (Math.abs(lat - 40.7505) < 0.001) return 'Midtown West';
  return null;
};

describe('enrichWithNeighborhoods', () => {
  it('returns events unchanged when no API key', async () => {
    const events = [makeEvent()];
    const result = await enrichWithNeighborhoods(events, null, mockReverse, 10, memStore());
    expect(result).toBe(events);
  });

  it('replaces NTA neighborhood with Google Maps name', async () => {
    const events = [makeEvent()];
    const result = await enrichWithNeighborhoods(events, 'key', mockReverse, 10, memStore());
    expect(result[0].neighborhood).toBe('Parkchester');
  });

  it('leaves neighborhood unchanged when Google Maps returns null', async () => {
    const events = [makeEvent({ lat: 99, lon: 99, neighborhood: 'NTA Name' })];
    const result = await enrichWithNeighborhoods(events, 'key', mockReverse, 10, memStore());
    expect(result[0].neighborhood).toBe('NTA Name');
  });

  it('leaves event unchanged when already has the Google Maps name', async () => {
    const events = [makeEvent({ neighborhood: 'Parkchester' })];
    const result = await enrichWithNeighborhoods(events, 'key', mockReverse, 10, memStore());
    expect(result[0]).toBe(events[0]); // exact same reference — no copy made
  });

  it('skips events without coordinates', async () => {
    let calls = 0;
    const counting = async () => { calls++; return 'X'; };
    const events = [makeEvent({ lat: undefined, lon: undefined, neighborhood: 'NTA' })];
    const result = await enrichWithNeighborhoods(events, 'key', counting as any, 10, memStore());
    expect(calls).toBe(0);
    expect(result[0].neighborhood).toBe('NTA');
  });

  it('deduplicates: same location only looked up once', async () => {
    let calls = 0;
    const counting = async (lat: number, lon: number, key: string) => {
      calls++;
      return mockReverse(lat, lon, key);
    };
    const events = [makeEvent(), makeEvent({ id: 'tm:2', title: 'Show 2' })];
    await enrichWithNeighborhoods(events, 'key', counting, 10, memStore());
    expect(calls).toBe(1);
  });

  it('applies the same cached name to both events from the same venue', async () => {
    const events = [makeEvent(), makeEvent({ id: 'tm:2', title: 'Show 2' })];
    const result = await enrichWithNeighborhoods(events, 'key', mockReverse, 10, memStore());
    expect(result[0].neighborhood).toBe('Parkchester');
    expect(result[1].neighborhood).toBe('Parkchester');
  });

  it('uses pre-seeded cache without calling the API', async () => {
    let calls = 0;
    const counting = async () => { calls++; return 'X'; };
    const store = memStore({ '40.8387,-73.8607': 'Parkchester' });
    const events = [makeEvent()];
    const result = await enrichWithNeighborhoods(events, 'key', counting as any, 10, store);
    expect(calls).toBe(0);
    expect(result[0].neighborhood).toBe('Parkchester');
  });
});
