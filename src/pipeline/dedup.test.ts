import { describe, expect, it } from 'vitest';
import { deduplicateEvents } from './dedup';
import type { Event } from '../domain/event';

// Same show (title + venue + date) so every record collapses into one group.
function makeEvent(overrides: Partial<Event> = {}): Event {
  return {
    id: 'x:1',
    title: 'Same Show',
    category: 'music',
    borough: 'Manhattan',
    venue: 'The Venue',
    start: '2026-08-01T20:00:00',
    isFree: false,
    url: 'https://example.com/x',
    source: 'seatgeek',
    ...overrides,
  };
}

describe('deduplicateEvents altTicketLinks', () => {
  it('emits at most one alt link per source and never the canonical source', () => {
    const events = [
      // Richest → canonical (has image).
      makeEvent({ id: 'ra:1', source: 'resident-advisor', url: 'u1', image: 'img' }),
      makeEvent({ id: 'ra:2', source: 'resident-advisor', url: 'u2' }),
      makeEvent({ id: 'sg:1', source: 'seatgeek', url: 'u3' }),
    ];

    const out = deduplicateEvents(events);
    expect(out).toHaveLength(1);

    const sources = (out[0].altTicketLinks ?? []).map((l) => l.source);
    // No duplicate keys for the UI's key={link.source}.
    expect(new Set(sources).size).toBe(sources.length);
    // Canonical is already resident-advisor — don't list "Also on" itself.
    expect(sources).not.toContain('resident-advisor');
    expect(sources).toContain('seatgeek');
  });
});
