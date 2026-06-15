import type { Category, Event } from '../domain/event';
import { utcToNycLocal } from './datetime';
import { boroughFromLatLng } from './borough';
import { neighborhoodFromLatLng } from './neighborhood';

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

function categoryForTags(tags: any[]): Category {
  for (const tag of tags ?? []) {
    const mapped = tag?.value && DICE_TAG_CATEGORY[tag.value];
    if (mapped) return mapped;
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
  const neighborhood = neighborhoodFromLatLng(location.lat, location.lng, borough);

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
    ...(neighborhood && { neighborhood }),
    venue: raw.venues[0].name,
    start: utcToNycLocal(raw.dates.event_start_date),
    ...(raw.dates.event_end_date && { end: utcToNycLocal(raw.dates.event_end_date) }),
    isFree,
    ...(hasPrice && { priceMin: cents / 100 }),
    url: `https://dice.fm/event/${raw.perm_name}`,
    source: 'dice',
    ...(location?.lat != null && location?.lng != null && { lat: location.lat, lon: location.lng }),
  };
}
