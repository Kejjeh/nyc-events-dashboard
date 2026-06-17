import { describe, it, expect } from 'vitest';
import { normalizeSongkickEvent } from './songkick';

// Coordinates (40.7308, -74.0027) resolve to Manhattan / West Village in the
// neighborhood bundle (see neighborhood.test.ts), so assertions stay stable.
const concert = {
  id: 41170111,
  type: 'Concert',
  uri: 'https://www.songkick.com/concerts/41170111-wombats-at-venue',
  displayName: 'The Wombats at The Venue (July 10, 2026)',
  status: 'ok',
  start: { date: '2026-07-10', time: '20:00:00', datetime: '2026-07-10T20:00:00-0400' },
  performance: [
    { artist: { displayName: 'The Wombats', id: 1 }, billing: 'headline', billingIndex: 1 },
    { artist: { displayName: 'The Opener', id: 2 }, billing: 'support', billingIndex: 2 },
  ],
  venue: { id: 9, displayName: 'The Venue', lat: 40.7308, lng: -74.0027 },
  location: { city: 'New York, NY, US', lat: 40.7308, lng: -74.0027 },
};

describe('normalizeSongkickEvent', () => {
  it('normalizes a concert into a Manhattan music event with the headliner title', () => {
    expect(normalizeSongkickEvent(concert)).toEqual({
      id: 'songkick:41170111',
      title: 'The Wombats',
      category: 'music',
      borough: 'Manhattan',
      neighborhood: 'West Village',
      venue: 'The Venue',
      start: '2026-07-10T20:00:00', // 8pm EDT, converted to bare NYC-local ISO
      isFree: false,
      url: 'https://www.songkick.com/concerts/41170111-wombats-at-venue',
      source: 'songkick',
      lat: 40.7308,
      lon: -74.0027,
    });
  });

  it('joins multiple headliners', () => {
    const event = normalizeSongkickEvent({
      ...concert,
      performance: [
        { artist: { displayName: 'Band A' }, billing: 'headline' },
        { artist: { displayName: 'Band B' }, billing: 'headline' },
      ],
    })!;
    expect(event.title).toBe('Band A, Band B');
  });

  it('falls back to the displayName (minus trailing date) when there is no headliner', () => {
    const event = normalizeSongkickEvent({ ...concert, performance: [] })!;
    expect(event.title).toBe('The Wombats at The Venue');
  });

  it('drops cancelled shows', () => {
    expect(normalizeSongkickEvent({ ...concert, status: 'cancelled' })).toBeNull();
  });

  it('drops events with no usable coordinates', () => {
    expect(normalizeSongkickEvent({ ...concert, venue: {}, location: {} })).toBeNull();
  });

  it('drops events outside the four boroughs (Staten Island)', () => {
    const event = normalizeSongkickEvent({
      ...concert,
      venue: { displayName: 'SI Hall', lat: 40.5795, lng: -74.1502 },
      location: { lat: 40.5795, lng: -74.1502 },
    });
    expect(event).toBeNull();
  });

  it('handles a date-only start (time TBA)', () => {
    const event = normalizeSongkickEvent({
      ...concert,
      start: { date: '2026-07-10', time: null, datetime: null },
    })!;
    expect(event.start).toBe('2026-07-10T00:00:00');
  });
});
