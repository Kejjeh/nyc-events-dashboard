import { describe, it, expect } from 'vitest';
import { carryForwardEvents } from './carryForward';
import type { Event } from '../domain/event';

function ev(source: string, start: string, id = `${source}:${start}`): Event {
  return {
    id,
    title: 't',
    category: 'music',
    borough: 'Manhattan',
    venue: 'v',
    start,
    isFree: true,
    url: 'u',
    source,
  };
}

const NOW = '2026-06-14T08:00:00.000Z';

describe('carryForwardEvents', () => {
  it('keeps fresh events and carries forward previous events from FAILED sources', () => {
    const fresh = [ev('nyc-open-data', '2026-06-15T10:00:00'), ev('smallslive', '2026-06-14T20:00:00')];
    const previous = [
      ev('nyc-parks', '2026-06-16T12:00:00'), // failed this run -> carry forward
      ev('nyc-open-data', '2026-06-20T10:00:00'), // succeeded -> drop stale copy
    ];
    const result = carryForwardEvents(fresh, previous, ['nyc-open-data', 'smallslive'], NOW);

    expect(result.map((e) => `${e.source}@${e.start}`)).toEqual([
      'smallslive@2026-06-14T20:00:00',
      'nyc-open-data@2026-06-15T10:00:00',
      'nyc-parks@2026-06-16T12:00:00',
    ]);
  });

  it('drops carried-forward events that are now in the past', () => {
    const previous = [
      ev('nyc-parks', '2026-06-10T12:00:00'), // past -> drop
      ev('nyc-parks', '2026-06-14T12:00:00'), // today -> keep
      ev('nyc-parks', '2026-06-18T12:00:00'), // future -> keep
    ];
    const result = carryForwardEvents([], previous, [], NOW);

    expect(result.map((e) => e.start)).toEqual([
      '2026-06-14T12:00:00',
      '2026-06-18T12:00:00',
    ]);
  });

  it('returns just the fresh events (sorted) when there is nothing to carry', () => {
    const fresh = [ev('a', '2026-07-02T10:00:00'), ev('b', '2026-07-01T10:00:00')];
    const result = carryForwardEvents(fresh, [], ['a', 'b'], NOW);
    expect(result.map((e) => e.source)).toEqual(['b', 'a']);
  });

  it('drops fresh events that have already passed (a source can return stale ids)', () => {
    const fresh = [
      ev('village-vanguard', '2026-05-11T20:00:00'), // past residency set -> drop
      ev('village-vanguard', '2026-06-22T20:00:00'), // upcoming -> keep
    ];
    const result = carryForwardEvents(fresh, [], ['village-vanguard'], NOW);
    expect(result.map((e) => e.start)).toEqual(['2026-06-22T20:00:00']);
  });
});
