import { describe, expect, it } from 'vitest';
import { normalizeSeatGeekEvent } from './seatgeek';

const BASE = {
  id: 7654321,
  title: 'Jazz Night at MSG',
  type: 'concert',
  datetime_local: '2026-08-20T20:00:00',
  url: 'https://seatgeek.com/jazz-night',
  venue: {
    name: 'Madison Square Garden',
    location: { lat: 40.7505, lon: -73.9934 },
  },
  stats: { lowest_price: 75, highest_price: 350 },
};

describe('normalizeSeatGeekEvent', () => {
  it('produces a well-formed event', () => {
    const e = normalizeSeatGeekEvent(BASE);
    expect(e).not.toBeNull();
    expect(e?.id).toBe('seatgeek:7654321');
    expect(e?.source).toBe('seatgeek');
    expect(e?.title).toBe('Jazz Night at MSG');
    expect(e?.start).toBe('2026-08-20T20:00:00');
  });

  it('maps concert → music', () => {
    expect(normalizeSeatGeekEvent(BASE)?.category).toBe('music');
  });

  it('maps classical_music → music', () => {
    expect(normalizeSeatGeekEvent({ ...BASE, type: 'classical_music' })?.category).toBe('music');
  });

  it('maps sports → sports', () => {
    expect(normalizeSeatGeekEvent({ ...BASE, type: 'sports' })?.category).toBe('sports');
  });

  it('maps theater → theater', () => {
    expect(normalizeSeatGeekEvent({ ...BASE, type: 'theater' })?.category).toBe('theater');
  });

  it('maps comedy → comedy', () => {
    expect(normalizeSeatGeekEvent({ ...BASE, type: 'comedy' })?.category).toBe('comedy');
  });

  it('resolves borough from coordinates', () => {
    expect(normalizeSeatGeekEvent(BASE)?.borough).toBe('Manhattan');
  });

  it('captures price range', () => {
    const e = normalizeSeatGeekEvent(BASE);
    expect(e?.priceMin).toBe(75);
    expect(e?.priceMax).toBe(350);
    expect(e?.isFree).toBe(false);
  });

  it('marks explicit $0 as free', () => {
    const e = normalizeSeatGeekEvent({ ...BASE, stats: { lowest_price: 0, highest_price: 0 } });
    expect(e?.isFree).toBe(true);
    expect(e?.priceMin).toBe(0);
  });

  it('treats missing price as not free', () => {
    const e = normalizeSeatGeekEvent({ ...BASE, stats: {} });
    expect(e?.isFree).toBe(false);
    expect(e?.priceMin).toBeUndefined();
  });

  it('drops event without datetime', () => {
    expect(normalizeSeatGeekEvent({ ...BASE, datetime_local: undefined })).toBeNull();
  });

  it('drops event without venue coordinates', () => {
    const raw = { ...BASE, venue: { name: 'No Coords', location: {} } };
    expect(normalizeSeatGeekEvent(raw)).toBeNull();
  });

  it('drops venue outside NYC boroughs', () => {
    // Hoboken, NJ — close but outside borough polygons
    const raw = { ...BASE, venue: { name: 'NJ Venue', location: { lat: 40.744, lon: -74.032 } } };
    expect(normalizeSeatGeekEvent(raw)).toBeNull();
  });
});
