import type { Event } from '../domain/event';

/** Sources where the same concert is often listed on multiple platforms. */
const TICKETING_SOURCES = new Set([
  'ticketmaster',
  'seatgeek',
  'dice',
  'todaytix',
  'eventbrite',
  'resident-advisor',
  'songkick',
]);

function normalizeStr(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function dedupeKey(event: Event): string {
  // Match on normalized title + venue + calendar date.
  // Intentionally not using the hour: different ticketing sites sometimes
  // differ by 30 minutes on the same show.
  return `${normalizeStr(event.title)}|${normalizeStr(event.venue)}|${event.start.slice(0, 10)}`;
}

function richness(event: Event): number {
  return (
    (event.image ? 4 : 0) +
    (event.priceMin != null ? 2 : 0) +
    (event.neighborhood ? 1 : 0) +
    (event.lat != null ? 1 : 0)
  );
}

/**
 * Collapses cross-source duplicates (same show listed on Ticketmaster AND
 * SeatGeek, etc.) into a single event.  The richest record wins; the others
 * are attached as `altTicketLinks` so the UI can offer multiple ticket options.
 * Non-ticketing sources (parks, markets, BPL…) are never merged.
 */
export function deduplicateEvents(events: Event[]): Event[] {
  const ticketingGroups = new Map<string, Event[]>();
  const passThrough: Event[] = [];

  for (const event of events) {
    if (!TICKETING_SOURCES.has(event.source)) {
      passThrough.push(event);
      continue;
    }
    const key = dedupeKey(event);
    const group = ticketingGroups.get(key) ?? [];
    group.push(event);
    ticketingGroups.set(key, group);
  }

  const deduped: Event[] = [...passThrough];

  for (const group of ticketingGroups.values()) {
    if (group.length === 1) {
      deduped.push(group[0]);
      continue;
    }
    const [canonical, ...rest] = [...group].sort((a, b) => richness(b) - richness(a));
    const altTicketLinks = rest
      .filter((e) => e.url)
      .map((e) => ({ source: e.source, url: e.url }));

    deduped.push({ ...canonical, ...(altTicketLinks.length > 0 && { altTicketLinks }) });
  }

  return deduped.sort((a, b) => a.start.localeCompare(b.start));
}
