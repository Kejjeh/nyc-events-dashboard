import type { Category, Event } from '../domain/event';
import { utcToNycLocal } from './datetime';
import { boroughFromLatLng } from './borough';

/**
 * Maps DICE tag values to our taxonomy. The fetcher pulls the comedy filter, so
 * every event carries 'culture:comedy'; anything else defaults to 'other'
 * (DICE NYC has no food taxonomy, so this source never produces 'food').
 */
function categoryForTags(tags: any[]): Category {
  for (const tag of tags ?? []) {
    if (tag?.value === 'culture:comedy') return 'comedy';
  }
  return 'other';
}

export function normalizeDiceEvent(raw: any): Event | null {
  // DICE labels every NYC venue city 'New York', so borough must come from the
  // venue's coordinates, not its address/city.
  const location = raw.venues?.[0]?.location;
  const borough = location ? boroughFromLatLng(location.lat, location.lng) : null;
  if (!borough) {
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
    category: categoryForTags(raw.tags_types),
    borough,
    venue: raw.venues[0].name,
    start: utcToNycLocal(raw.dates.event_start_date),
    ...(raw.dates.event_end_date && { end: utcToNycLocal(raw.dates.event_end_date) }),
    isFree,
    ...(hasPrice && { priceMin: cents / 100 }),
    url: `https://dice.fm/event/${raw.perm_name}`,
    source: 'dice',
  };
}
