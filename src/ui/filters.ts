import type { Borough, Category, Event } from '../domain/event';

export interface FilterCriteria {
  borough?: Borough;
  category?: Category;
  freeOnly?: boolean;
  search?: string;
}

export type SortKey = 'soonest' | 'borough' | 'category';

/** Filters events by borough, category, free-only, and a title/venue search. */
export function filterEvents(events: Event[], criteria: FilterCriteria): Event[] {
  const query = criteria.search?.trim().toLowerCase();

  return events.filter((event) => {
    if (criteria.borough && event.borough !== criteria.borough) return false;
    if (criteria.category && event.category !== criteria.category) return false;
    if (criteria.freeOnly && !event.isFree) return false;
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
