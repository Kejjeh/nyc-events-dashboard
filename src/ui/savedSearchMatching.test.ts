import { describe, expect, it } from 'vitest';
import { matchesFor } from './savedSearchMatching';
import type { SavedSearch } from './useSavedSearches';
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
  ev({ id: 'a', category: 'music' }),
  ev({ id: 'b', category: 'comedy' }),
];

describe('matchesFor', () => {
  it('returns the matching event ids for a saved search query', () => {
    const searches: SavedSearch[] = [{ id: 's1', name: 'Music', qs: 'c=music', seenIds: [] }];

    const result = matchesFor(searches, events, '2026-06-01');

    expect(result.get('s1')?.matchIds).toEqual(['a']);
    expect(result.get('s1')?.newCount).toBe(1);
  });

  it('excludes already-seen ids from newCount but keeps them matched', () => {
    const searches: SavedSearch[] = [{ id: 's1', name: 'Music', qs: 'c=music', seenIds: ['a'] }];

    const result = matchesFor(searches, events, '2026-06-01');

    expect(result.get('s1')?.matchIds).toEqual(['a']);
    expect(result.get('s1')?.newCount).toBe(0);
  });

  it('collapses an expired picked date so the search does not go silently empty', () => {
    // The saved query pins a date that has since passed; effectiveWindow must
    // collapse it to "all" instead of filtering every event out.
    const searches: SavedSearch[] = [{ id: 's1', name: 'Music', qs: 'c=music&when=2020-01-01', seenIds: [] }];

    const result = matchesFor(searches, events, '2026-06-01');

    expect(result.get('s1')?.matchIds).toEqual(['a']);
  });
});
