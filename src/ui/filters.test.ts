import { describe, it, expect } from 'vitest';
import { filterEvents, sortEvents } from './filters';
import type { Event } from '../domain/event';

function ev(overrides: Partial<Event>): Event {
  return {
    id: 'x',
    title: 'Untitled',
    category: 'other',
    borough: 'Manhattan',
    venue: 'Somewhere',
    start: '2026-07-01T12:00:00',
    isFree: false,
    url: 'https://example.com',
    source: 'test',
    ...overrides,
  };
}

const events: Event[] = [
  ev({ id: 'a', title: 'Jazz Night', borough: 'Brooklyn', neighborhood: 'Williamsburg', category: 'music', isFree: true, venue: 'Smalls', start: '2026-07-03T20:00:00' }),
  ev({ id: 'b', title: 'Food Fair', borough: 'Queens', neighborhood: 'Flushing', category: 'food', isFree: true, venue: 'Flushing Meadows', start: '2026-07-01T11:00:00' }),
  ev({ id: 'c', title: 'Knicks Game', borough: 'Manhattan', neighborhood: 'Midtown', category: 'sports', isFree: false, priceMin: 50, venue: 'MSG', start: '2026-07-02T19:00:00' }),
];

describe('filterEvents', () => {
  it('returns everything when no criteria are set', () => {
    expect(filterEvents(events, {}).map((e) => e.id)).toEqual(['a', 'b', 'c']);
  });

  it('filters by borough', () => {
    expect(filterEvents(events, { borough: 'Brooklyn' }).map((e) => e.id)).toEqual(['a']);
  });

  it('filters by category', () => {
    expect(filterEvents(events, { category: 'food' }).map((e) => e.id)).toEqual(['b']);
  });

  it('filters by neighborhood', () => {
    expect(filterEvents(events, { neighborhoods: ['Williamsburg'] }).map((e) => e.id)).toEqual(['a']);
  });

  it('filters by multiple neighborhoods', () => {
    expect(filterEvents(events, { neighborhoods: ['Williamsburg', 'Flushing'] }).map((e) => e.id)).toEqual(['a', 'b']);
  });

  it('filters by source', () => {
    const mixed = [
      ev({ id: 'a', source: 'ticketmaster' }),
      ev({ id: 'b', source: 'nyc-parks' }),
      ev({ id: 'c', source: 'dice' }),
    ];
    expect(filterEvents(mixed, { sources: ['ticketmaster'] }).map((e) => e.id)).toEqual(['a']);
    expect(filterEvents(mixed, { sources: ['ticketmaster', 'dice'] }).map((e) => e.id)).toEqual(['a', 'c']);
  });

  it('filters to free events only', () => {
    expect(filterEvents(events, { freeOnly: true }).map((e) => e.id)).toEqual(['a', 'b']);
  });

  it('searches title and venue case-insensitively', () => {
    expect(filterEvents(events, { search: 'smalls' }).map((e) => e.id)).toEqual(['a']);
    expect(filterEvents(events, { search: 'GAME' }).map((e) => e.id)).toEqual(['c']);
  });

  it('combines criteria', () => {
    expect(filterEvents(events, { borough: 'Queens', freeOnly: true }).map((e) => e.id)).toEqual(['b']);
    expect(filterEvents(events, { category: 'music', borough: 'Manhattan' })).toEqual([]);
  });
});

describe('sortEvents', () => {
  it('sorts by soonest start ascending', () => {
    expect(sortEvents(events, 'soonest').map((e) => e.id)).toEqual(['b', 'c', 'a']);
  });

  it('does not mutate the input array', () => {
    const before = events.map((e) => e.id);
    sortEvents(events, 'soonest');
    expect(events.map((e) => e.id)).toEqual(before);
  });
});
