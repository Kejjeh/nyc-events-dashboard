import { describe, it, expect } from 'vitest';
import type { Event } from '../domain/event';
import { enrichWithSpotify } from './spotifyEnrich';

const ev = (over: Partial<Event>): Event => ({
  id: over.id ?? 'x',
  title: 'Alan Broadbent Trio at Birdland',
  category: 'music',
  borough: 'Manhattan',
  venue: 'Birdland',
  start: '2026-06-20T20:00:00',
  isFree: false,
  url: 'https://x',
  source: 'smallslive',
  ...over,
});

describe('enrichWithSpotify', () => {
  it('is a no-op when there is no token', async () => {
    const events = [ev({})];
    expect(await enrichWithSpotify(events, null)).toBe(events);
  });

  it('attaches image + spotifyUrl to a matched music event', async () => {
    const search = async () => ({ image: 'img://broadbent', spotifyUrl: 'sp://broadbent' });
    const [out] = await enrichWithSpotify([ev({})], 'tok', [], search);
    expect(out.image).toBe('img://broadbent');
    expect(out.spotifyUrl).toBe('sp://broadbent');
  });

  it('skips non-music events and ones that already have an image', async () => {
    let calls = 0;
    const search = async () => {
      calls++;
      return { image: 'i' };
    };
    const events = [
      ev({ id: 'food', category: 'food' }),
      ev({ id: 'hasImg', image: 'existing://img' }),
    ];
    const out = await enrichWithSpotify(events, 'tok', [], search);
    expect(calls).toBe(0);
    expect(out[0].image).toBeUndefined();
    expect(out[1].image).toBe('existing://img');
  });

  it('reuses the previous run and de-dupes within a run (one search per artist)', async () => {
    let calls = 0;
    const search = async () => {
      calls++;
      return { image: 'i' };
    };
    const previous = [ev({ id: 'prev', image: 'cached://img', spotifyUrl: 'sp://x' })];
    const events = [ev({ id: 'a' }), ev({ id: 'b' })]; // same artist title, twice
    const out = await enrichWithSpotify(events, 'tok', previous, search);
    expect(calls).toBe(0); // seeded from previous, never hits the network
    expect(out.every((e) => e.image === 'cached://img')).toBe(true);
  });

  it('leaves an event unenriched when no artist matches', async () => {
    const search = async () => null;
    const [out] = await enrichWithSpotify([ev({ title: 'Generic Jam Night' })], 'tok', [], search);
    expect(out.image).toBeUndefined();
  });
});
