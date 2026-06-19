import type { Borough } from '../domain/event';

/**
 * The interdependent location/borough selection axis of the dashboard. These
 * four fields constrain each other (a neighborhood only means something inside a
 * borough; a borough only inside NYC), so their legal transitions live here as
 * pure functions rather than scattered across App.tsx event handlers.
 */
export interface LocationSelection {
  stateFilter: string;
  cityFilter: string;
  borough: Borough | 'All';
  neighborhoods: string[];
}

/**
 * The default city for a state: NYC is the app's home, so selecting NY lands on
 * "New York"; every other state opens at "All <state>" until a city is chosen.
 */
export function defaultCityFor(stateFilter: string): string {
  return stateFilter === 'NY' ? 'New York' : 'All';
}

/** Switching borough drops the neighborhood, which only has meaning within it. */
export function selectBorough(
  sel: LocationSelection,
  next: Borough | 'All',
): LocationSelection {
  return { ...sel, borough: next, neighborhoods: [] };
}

/** Switching city invalidates the NYC-only borough → neighborhood drill. */
export function selectCity(sel: LocationSelection, next: string): LocationSelection {
  return { ...sel, cityFilter: next, borough: 'All', neighborhoods: [] };
}

/** Switching state resets the city to that state's default and clears the drill. */
export function selectState(sel: LocationSelection, next: string): LocationSelection {
  return {
    ...sel,
    stateFilter: next,
    cityFilter: defaultCityFor(next),
    borough: 'All',
    neighborhoods: [],
  };
}

/** Multi-select toggle: add the neighborhood if absent, remove it if present. */
export function toggleNeighborhood(sel: LocationSelection, hood: string): LocationSelection {
  const neighborhoods = sel.neighborhoods.includes(hood)
    ? sel.neighborhoods.filter((n) => n !== hood)
    : [...sel.neighborhoods, hood];
  return { ...sel, neighborhoods };
}
