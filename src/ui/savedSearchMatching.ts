import type { Event } from '../domain/event';
import { filterEvents, toCriteria } from './filters';
import { parseFilters } from './urlState';
import type { SavedSearch } from './useSavedSearches';

/** What a saved search currently matches: its event ids and how many are new. */
export interface SearchMatch {
  matchIds: string[];
  newCount: number;
}

/**
 * For each saved search, which event ids it currently matches and how many of
 * those are new (matching but not yet seen). This is the whole point of a saved
 * search, so it lives behind the saved-search seam — pure, and testable without
 * a render. Expired picked dates are collapsed via toCriteria's effectiveWindow.
 */
export function matchesFor(
  searches: SavedSearch[],
  events: Event[],
  today: string,
): Map<string, SearchMatch> {
  const map = new Map<string, SearchMatch>();
  for (const s of searches) {
    const matchIds = filterEvents(events, toCriteria(parseFilters(s.qs), today)).map((e) => e.id);
    const seen = new Set(s.seenIds);
    map.set(s.id, { matchIds, newCount: matchIds.filter((id) => !seen.has(id)).length });
  }
  return map;
}
