import type { Event } from '../domain/event';

/** A west/south/east/north box, in the order MapLibre's `fitBounds` takes. */
export type Bounds = [[number, number], [number, number]];

/** Where the map opens before any data arrives: midtown Manhattan. */
export const DEFAULT_CENTER: [number, number] = [-73.97, 40.73];
export const DEFAULT_ZOOM = 11;

/** Leave room for the popup and the controls when fitting. */
export const FIT_PADDING = 56;
/** Don't zoom past neighborhood level, even for a single event. */
export const MAX_FIT_ZOOM = 14;

/**
 * Whether an event can be put on the map: both coordinates present, numeric
 * (a scraped "40.7" string is not), finite, and inside the WGS-84 range.
 */
export function isPlottable(e: Event): boolean {
  return (
    typeof e.lat === 'number' &&
    typeof e.lon === 'number' &&
    Number.isFinite(e.lat) &&
    Number.isFinite(e.lon) &&
    Math.abs(e.lat) <= 90 &&
    Math.abs(e.lon) <= 180
  );
}

/**
 * The box containing every plottable event, or null when none can be plotted.
 * A single event yields a degenerate box, which `fitBounds` centers on (capped
 * by MAX_FIT_ZOOM).
 */
export function boundsOf(events: Event[]): Bounds | null {
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  let found = false;

  for (const e of events) {
    if (!isPlottable(e)) continue;
    found = true;
    west = Math.min(west, e.lon!);
    east = Math.max(east, e.lon!);
    south = Math.min(south, e.lat!);
    north = Math.max(north, e.lat!);
  }

  return found ? [[west, south], [east, north]] : null;
}

/** Do two boxes overlap at all? */
export function boundsIntersect(a: Bounds, b: Bounds): boolean {
  const [[aw, as], [ae, an]] = a;
  const [[bw, bs], [be, bn]] = b;
  return aw <= be && bw <= ae && as <= bn && bs <= an;
}

/**
 * Whether the map should jump to `target`.
 *
 * Re-fitting on every filter change would yank the viewport away from a user
 * who has just panned somewhere, so the map only moves when it would otherwise
 * show nothing: when the current viewport and the events don't overlap at all.
 * That is exactly the reported bug — switching the city filter to Boston left
 * the map pinned on NYC with every marker off-screen.
 */
export function shouldRefit(current: Bounds | null, target: Bounds | null): boolean {
  if (!target) return false;
  if (!current) return true;
  return !boundsIntersect(current, target);
}
