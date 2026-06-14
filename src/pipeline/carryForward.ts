import type { Event } from '../domain/event';
import { nycDateOf } from '../ingestion/datetime';

/** True when an event has a usable ISO start we can compare and sort on. */
function hasValidStart(event: Event): boolean {
  return typeof event.start === 'string' && event.start.length >= 10;
}

/**
 * Merges a freshly-fetched event set with the previous published set so that a
 * source which FAILED this run keeps its last-known-good events instead of
 * vanishing from the dashboard.
 *
 * - Fresh events (from sources that succeeded) are kept as-is.
 * - Previous events are carried forward only when their source is NOT among the
 *   sources that succeeded this run (a succeeded source's data is authoritative,
 *   even when it legitimately returned zero events).
 * - Events that have already passed (start date before today) are dropped from
 *   the whole published set, since even a fresh fetch can return stale ids (e.g.
 *   a weekly residency's past dates), and so carried-forward listings don't
 *   accumulate while a source stays down.
 * - The result is sorted by start time ascending.
 */
export function carryForwardEvents(
  fresh: Event[],
  previous: Event[],
  succeededSources: Iterable<string>,
  nowIso: string,
): Event[] {
  const succeeded = new Set(succeededSources);
  // Compare against the NYC calendar date: every source's start is venue-local,
  // so a UTC date would drop tonight's shows on late-evening / off-schedule runs.
  const today = nycDateOf(nowIso);

  const carried = previous.filter((event) => !succeeded.has(event.source));

  return [...fresh, ...carried]
    .filter((event) => hasValidStart(event) && event.start.slice(0, 10) >= today)
    .sort((a, b) => a.start.localeCompare(b.start));
}
