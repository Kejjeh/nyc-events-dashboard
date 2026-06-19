import type { Borough, Category, Event } from '../domain/event';
import { isInDateWindow, effectiveWindow, type DateWindow } from './dateWindow';
import type { FilterState } from './urlState';

export interface FilterCriteria {
  borough?: Borough;
  /** One or more neighborhoods to include; absent/empty = no filter. */
  neighborhoods?: string[];
  /** One or more source IDs to include; absent/empty = no filter. */
  sources?: string[];
  /** One or more categories to include; absent/empty = no filter. */
  categories?: Category[];
  freeOnly?: boolean;
  /** If > 0, hide paid events whose priceMin exceeds this; free events always pass. */
  maxPrice?: number;
  search?: string;
  /** A date window ('today' | 'weekend' | 'week' | 'YYYY-MM-DD'); needs `today`. */
  dateWindow?: DateWindow;
  /** Today's date in NYC (YYYY-MM-DD), required to evaluate `dateWindow`. */
  today?: string;
}

export type SortKey = 'soonest' | 'borough' | 'category' | 'nearest';

/**
 * Translates the stored filter state into runtime filter criteria — the shape
 * shift (drop 'All', null-empty arrays, collapse an expired picked date, inject
 * today) that every `filterEvents` call site used to re-type inline.
 */
export function toCriteria(state: FilterState, today: string): FilterCriteria {
  return {
    borough: state.borough === 'All' ? undefined : state.borough,
    neighborhoods: state.neighborhoods.length > 0 ? state.neighborhoods : undefined,
    sources: state.sources.length > 0 ? state.sources : undefined,
    categories: state.categories.length > 0 ? state.categories : undefined,
    freeOnly: state.freeOnly,
    maxPrice: state.maxPrice > 0 ? state.maxPrice : undefined,
    search: state.search,
    dateWindow: effectiveWindow(state.dateWindow, today),
    today,
  };
}

/** Filters events by borough, category, free-only, date window, and a title/venue search. */
export function filterEvents(events: Event[], criteria: FilterCriteria): Event[] {
  const query = criteria.search?.trim().toLowerCase();
  const applyDate = criteria.dateWindow && criteria.dateWindow !== 'all' && criteria.today;

  return events.filter((event) => {
    if (criteria.borough && event.borough !== criteria.borough) return false;
    if (criteria.neighborhoods?.length && !criteria.neighborhoods.includes(event.neighborhood ?? '')) return false;
    if (criteria.sources?.length && !criteria.sources.includes(event.source)) return false;
    if (criteria.categories?.length && !criteria.categories.includes(event.category)) return false;
    if (criteria.maxPrice && criteria.maxPrice > 0) {
      if (!event.isFree && event.priceMin != null && event.priceMin > criteria.maxPrice) return false;
    }
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

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Returns a new array of events sorted by the given key (never mutates input). */
export function sortEvents(
  events: Event[],
  key: SortKey,
  userCoords?: { lat: number; lon: number },
): Event[] {
  const sorted = [...events];
  switch (key) {
    case 'nearest': {
      if (!userCoords) return sorted.sort((a, b) => a.start.localeCompare(b.start));
      return sorted.sort((a, b) => {
        const da =
          a.lat != null && a.lon != null
            ? haversineKm(userCoords.lat, userCoords.lon, a.lat, a.lon)
            : Infinity;
        const db =
          b.lat != null && b.lon != null
            ? haversineKm(userCoords.lat, userCoords.lon, b.lat, b.lon)
            : Infinity;
        return da - db;
      });
    }
    case 'soonest':
      return sorted.sort((a, b) => a.start.localeCompare(b.start));
    case 'borough':
      return sorted.sort(
        (a, b) => (a.borough ?? '').localeCompare(b.borough ?? '') || a.start.localeCompare(b.start),
      );
    case 'category':
      return sorted.sort(
        (a, b) => a.category.localeCompare(b.category) || a.start.localeCompare(b.start),
      );
  }
}
