import type { Borough, Category, Event } from '../domain/event';
import { utcToNycLocal } from './datetime';
import { nycLocationFromLatLng } from './nycLocation';

/**
 * Maps a DICE primary-filter tag value to our taxonomy. Each event self-tags via
 * tags_types, so multi-filter fetches need no per-filter plumbing. DICE NYC has
 * no food tag, so this source never produces 'food'. Art → museum; the community
 * tags (social/talks/wellbeing) → social.
 */
const DICE_TAG_CATEGORY: Record<string, Category> = {
  'culture:comedy': 'comedy',
  'culture:theatre': 'theater',
  'culture:film': 'film',
  'culture:sport': 'sports',
  'culture:art': 'museum',
  'culture:social': 'social',
  'culture:talks': 'social',
  'culture:wellbeing': 'social',
  'culture:family': 'kids',
  'culture:kids': 'kids',
  'music:gig': 'music',
  'music:dj': 'music',
  'music:party': 'music',
  'music:playback': 'music',
  'music:artistsigning': 'music',
};

function diceCategory(raw: any): Category {
  for (const tag of raw.tags_types ?? []) {
    const mapped = tag?.value && DICE_TAG_CATEGORY[tag.value];
    if (mapped) return mapped;
  }
  // Current payloads (since ~Aug 2026) carry no tags_types; fetchDice stamps
  // browse_filter with the filter the event was found under ('music/gig').
  const fromFilter =
    typeof raw.browse_filter === 'string' && DICE_TAG_CATEGORY[raw.browse_filter.replace('/', ':')];
  return fromFilter || 'other';
}

/**
 * NYC zip prefixes → borough. The zip is the one reliable signal: the locality
 * segment is written as "Brooklyn" or "New York City" for some venues but as a
 * neighborhood for others (Queens postal style: "Flushing", "Ridgewood",
 * "Long Island City"), and the state appears as both "New York" and "NY".
 * 103xx (Staten Island) is deliberately unmapped — outside the borough model.
 */
const ZIP_BOROUGHS: Record<string, Borough> = {
  '100': 'Manhattan', '101': 'Manhattan', '102': 'Manhattan',
  '104': 'Bronx',
  '112': 'Brooklyn',
  '111': 'Queens', '113': 'Queens', '114': 'Queens', '116': 'Queens',
};

/** "63 Grand Street, Brooklyn, New York 11249, United States" -> 'Brooklyn'. */
function boroughFromAddress(address: unknown): Borough | null {
  if (typeof address !== 'string') return null;
  const m = address.match(/(?:New York|NY)\s+(\d{5})/);
  return (m && ZIP_BOROUGHS[m[1].slice(0, 3)]) ?? null;
}

export function normalizeDiceEvent(raw: any): Event | null {
  // DICE labels every NYC venue city 'New York', so borough comes from the
  // venue's coordinates when the payload has them (pre-Aug-2026), else is
  // parsed from the street address (the browse payload dropped coordinates;
  // a non-NYC or unparseable address drops the event, which doubles as the
  // NYC-proper filter the polygon check used to provide).
  const venue = raw.venues?.[0];
  const location = venue?.location;
  let loc: { borough: Borough; neighborhood?: string } | null = null;
  if (location) {
    loc = nycLocationFromLatLng(location.lat, location.lng);
  } else {
    const borough = boroughFromAddress(venue?.address);
    if (borough) loc = { borough };
  }
  if (!loc) {
    return null;
  }

  // Prices are in cents: single-price uses amount, multi-tier uses amount_from.
  const price = raw.price ?? {};
  const isFree = price.amount === 0 && price.amount_from == null;
  const cents = price.amount ?? price.amount_from;
  const hasPrice = typeof cents === 'number' && cents > 0;

  return {
    id: `dice:${raw.id}`,
    title: raw.name,
    category: diceCategory(raw),
    ...loc,
    venue: venue.name,
    start: utcToNycLocal(raw.dates.event_start_date),
    ...(raw.dates.event_end_date && { end: utcToNycLocal(raw.dates.event_end_date) }),
    isFree,
    ...(hasPrice && { priceMin: cents / 100 }),
    // perm_name vanished from the browse payload; /event/<id> 308-redirects
    // to the canonical slug page.
    url: `https://dice.fm/event/${raw.perm_name ?? raw.id}`,
    source: 'dice',
    ...(location?.lat != null && location?.lng != null && { lat: location.lat, lon: location.lng }),
  };
}
