import type { Borough, Event } from '../domain/event';

/**
 * Off-Broadway venues are nearly all in Manhattan; only the handful of known
 * non-Manhattan houses need an override (TodayTix exposes no coordinates).
 */
const BROOKLYN_VENUE_HINTS = ["st. ann's warehouse", 'bam', 'brooklyn academy', 'theatre for a new audience', 'polonsky', 'st. ann'];

function boroughForVenue(venue: string): Borough {
  const v = (venue ?? '').toLowerCase();
  return BROOKLYN_VENUE_HINTS.some((hint) => v.includes(hint)) ? 'Brooklyn' : 'Manhattan';
}

/**
 * Normalizes a TodayTix show (run-window, no single performance time) into a
 * "now playing" theater Event. `_today` (NYC calendar date) is injected by the
 * fetcher so the start clamps to today for shows already in their run.
 */
export function normalizeTodayTixShow(raw: any): Event | null {
  const isOffBroadway = (raw.subcategories ?? []).some((s: any) => s?.slug === 'off-broadway');
  if (!isOffBroadway) return null;

  const today: string = raw._today;
  // endDate arrives as the literal string "null" for open-ended runs.
  const endDate = raw.endDate && raw.endDate !== 'null' ? raw.endDate.slice(0, 10) : null;
  if (endDate && endDate < today) return null; // run already ended

  const runStart = raw.startDate?.slice(0, 10) ?? today;
  const date = runStart > today ? runStart : today;

  const price = raw.lowPriceForRegularTickets?.value;
  const hasPrice = typeof price === 'number' && price > 0;

  return {
    id: `todaytix:${raw.id}`,
    title: raw.displayName,
    category: 'theater',
    borough: boroughForVenue(raw.venue),
    venue: raw.venue,
    start: `${date}T19:30:00`, // representative evening curtain; exact times on TodayTix
    isFree: false,
    ...(hasPrice && { priceMin: price }),
    url: raw.slug ? `https://www.todaytix.com/nyc/shows/${raw.slug}` : 'https://www.todaytix.com/nyc',
    source: 'todaytix',
  };
}
