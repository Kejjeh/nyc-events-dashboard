import type { Borough, Category, Event } from '../domain/event';
import { isInDateWindow, type DateWindow } from './dateWindow';

export interface FilterCriteria {
  borough?: Borough;
  /** One or more neighborhoods to include; absent/empty = no filter. */
  neighborhoods?: string[];
  /** One or more source IDs to include; absent/empty = no filter. */
  sources?: string[];
  category?: Category;
  freeOnly?: boolean;
  search?: string;
  /** A date window ('today' | 'weekend' | 'week' | 'YYYY-MM-DD'); needs `today`. */
  dateWindow?: DateWindow;
  /** Today's date in NYC (YYYY-MM-DD), required to evaluate `dateWindow`. */
  today?: string;
}

export type SortKey = 'soonest' | 'borough' | 'category';

/** Filters events by borough, category, free-only, date window, and a title/venue search. */
export function filterEvents(events: Event[], criteria: FilterCriteria): Event[] {
  const query = criteria.search?.trim().toLowerCase();
  const applyDate = criteria.dateWindow && criteria.dateWindow !== 'all' && criteria.today;

  return events.filter((event) => {
    if (criteria.borough && event.borough !== criteria.borough) return false;
    if (criteria.neighborhoods?.length && !criteria.neighborhoods.includes(event.neighborhood ?? '')) return false;
    if (criteria.sources?.length && !criteria.sources.includes(event.source)) return false;
    if (criteria.category && event.category !== criteria.category) return false;
    if (criteria.freeOnly && !event.isFree) return false;
    if (applyDate && !isInDateWindow(event.start, criteria.dateWindow!, criteria.today!)) {
      return false;
    }
    if (query) {
      const haystack = `${event.title} ${event.venue}`.toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    return true;
  });
}

/** Returns a new array of events sorted by the given key (never mutates input). */
export function sortEvents(events: Event[], key: SortKey): Event[] {
  const sorted = [...events];
  switch (key) {
    case 'soonest':
      return sorted.sort((a, b) => a.start.localeCompare(b.start));
    case 'borough':
      return sorted.sort(
        (a, b) => a.borough.localeCompare(b.borough) || a.start.localeCompare(b.start),
      );
    case 'category':
      return sorted.sort(
        (a, b) => a.category.localeCompare(b.category) || a.start.localeCompare(b.start),
      );
  }
}
