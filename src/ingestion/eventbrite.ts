import type { Category, Event } from '../domain/event';
import { utcToNycLocal } from './datetime';
import { boroughFromLatLng } from './borough';
import { neighborhoodFromLatLng } from './neighborhood';

const CATEGORY_MAP: Record<string, Category> = {
  '103': 'music',    // Music
  '105': 'theater',  // Performing & Visual Arts
  '108': 'sports',   // Sports & Fitness
  '110': 'food',     // Food & Drink
  '113': 'social',   // Community & Culture
  '115': 'kids',     // Family & Education
  '119': 'film',     // Film, Media & Entertainment
};

export function normalizeEventbriteEvent(raw: any): Event | null {
  const start = raw.start?.utc;
  if (!start) return null;

  const venue = raw.venue;
  // Eventbrite exposes lat/lon both on the venue root and inside address.
  const lat = parseFloat(venue?.latitude ?? venue?.address?.latitude);
  const lon = parseFloat(venue?.longitude ?? venue?.address?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  const borough = boroughFromLatLng(lat, lon);
  if (!borough) return null;

  const neighborhood = neighborhoodFromLatLng(lat, lon, borough) ?? undefined;
  const category: Category = CATEGORY_MAP[String(raw.category_id)] ?? 'other';

  const ta = raw.ticket_availability;
  // ticket_availability price values are in minor currency units (cents for USD).
  const minCents = ta?.minimum_ticket_price?.value;
  const maxCents = ta?.maximum_ticket_price?.value;

  return {
    id: `eventbrite:${raw.id}`,
    title: raw.name?.text ?? '',
    category,
    borough,
    ...(neighborhood && { neighborhood }),
    venue: venue?.name ?? '',
    start: utcToNycLocal(start),
    ...(raw.end?.utc && { end: utcToNycLocal(raw.end.utc) }),
    isFree: raw.is_free === true || minCents === 0,
    ...(typeof minCents === 'number' && minCents > 0 && { priceMin: minCents / 100 }),
    ...(typeof maxCents === 'number' && maxCents > 0 && { priceMax: maxCents / 100 }),
    url: raw.url,
    source: 'eventbrite',
    lat,
    lon,
  };
}
