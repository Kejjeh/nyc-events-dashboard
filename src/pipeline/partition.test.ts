import { describe, it, expect } from 'vitest';
import { partitionEvents, eventCity } from './partition';
import type { Event } from '../domain/event';

function ev(o: Partial<Event>): Event {
  return {
    id: 'x', title: 't', category: 'music', venue: 'v',
    start: '2026-07-01T20:00:00', isFree: false, url: 'u', source: 's', ...o,
  };
}
const NOW = '2026-06-17T12:00:00Z'; // +120d cutoff = 2026-10-15

describe('partitionEvents', () => {
  it('keeps near-term NYC events live', () => {
    const { live, archive } = partitionEvents([ev({ city: 'New York', start: '2026-07-01T20:00:00' })], NOW);
    expect(live).toHaveLength(1);
    expect(archive).toHaveLength(0);
  });

  it('archives NYC events beyond the live window (auto-promote later)', () => {
    const { live, archive } = partitionEvents([ev({ city: 'New York', start: '2026-12-01T20:00:00' })], NOW);
    expect(live).toHaveLength(0);
    expect(archive).toHaveLength(1);
  });

  it('archives other-city events even when near-term', () => {
    const { live, archive } = partitionEvents([ev({ city: 'Boston', start: '2026-07-01T20:00:00' })], NOW);
    expect(live).toHaveLength(0);
    expect(archive).toHaveLength(1);
  });

  it('treats a missing city as New York', () => {
    expect(eventCity(ev({}))).toBe('New York');
    const { live } = partitionEvents([ev({ city: undefined, start: '2026-07-01T20:00:00' })], NOW);
    expect(live).toHaveLength(1);
  });

  it('promotes other cities when added to liveCities', () => {
    const events = [ev({ city: 'Boston', start: '2026-07-01T20:00:00' })];
    const { live } = partitionEvents(events, NOW, new Set(['New York', 'Boston']));
    expect(live).toHaveLength(1);
  });
});
