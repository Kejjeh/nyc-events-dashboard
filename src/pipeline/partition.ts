import type { Event } from '../domain/event';

/** Cities whose events appear on the live board. Add a city here to surface it. */
export const LIVE_CITIES = new Set<string>(['New York']);
/** Events starting further out than this are held in the offline archive. */
export const LIVE_WINDOW_DAYS = 120;

/** The city an event belongs to; legacy/NYC-only sources omit it and default to NY. */
export function eventCity(e: Event): string {
  return e.city ?? 'New York';
}

/** The two-letter state an event is in; NYC-only sources default to NY. */
export function eventState(e: Event): string {
  return e.state ?? 'NY';
}

/**
 * Splits the carried-forward superset into the live board (`events.json`) and the
 * offline archive (`archive.json`). An event is live when it's in a live city AND
 * starts within the window. Re-run every refresh, so far-future events
 * auto-promote to live as their date nears — and other-city events promote the
 * moment a city is added to LIVE_CITIES. The superset (both files) carries
 * forward, so this keeps working after a source (e.g. the JamBase trial) lapses.
 */
export function partitionEvents(
  events: Event[],
  nowIso: string,
  liveCities: Set<string> = LIVE_CITIES,
  windowDays: number = LIVE_WINDOW_DAYS,
): { live: Event[]; archive: Event[] } {
  const cutoff = new Date(new Date(nowIso).getTime() + windowDays * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const live: Event[] = [];
  const archive: Event[] = [];
  for (const e of events) {
    if (liveCities.has(eventCity(e)) && e.start.slice(0, 10) <= cutoff) live.push(e);
    else archive.push(e);
  }
  return { live, archive };
}
