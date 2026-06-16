import type { Category, Event } from '../domain/event';
import { boroughFromLatLng } from './borough';
import { neighborhoodFromLatLng } from './neighborhood';

// Eventbrite category IDs (from EventbriteCategory/<id> tags in web-scraped data).
const CATEGORY_MAP: Record<string, Category> = {
  '103': 'music',    // Music
  '104': 'film',     // Film & Media
  '105': 'theater',  // Performing & Visual Arts
  '108': 'sports',   // Sports & Fitness
  '110': 'food',     // Food & Drink
  '113': 'social',   // Community & Culture
  '115': 'kids',     // Family & Education
};

export function normalizeEventbriteEvent(raw: any): Event | null {
  // start_date is "YYYY-MM-DD HH:MM" (already NYC local) or "YYYY-MM-DD".
  const startRaw: string = raw.start_date ?? '';
  if (!startRaw) return null;
  const start = startRaw.includes(' ')
    ? startRaw.replace(' ', 'T') + ':00'
    : `${startRaw}T${raw.start_time ?? '00:00'}:00`;

  const venue = raw.primary_venue;
  const lat = parseFloat(venue?.address?.latitude);
  const lon = parseFloat(venue?.address?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  const borough = boroughFromLatLng(lat, lon);
  if (!borough) return null;

  const neighborhood = neighborhoodFromLatLng(lat, lon, borough) ?? undefined;

  const catTag = (raw.tags ?? []).find(
    (t: any) => typeof t?.tag === 'string' && t.tag.startsWith('EventbriteCategory/'),
  );
  const catCode = catTag?.tag?.split('/')?.[1] ?? '';
  const category: Category = CATEGORY_MAP[catCode] ?? 'other';

  const endRaw: string | undefined = raw.end_date;
  const end = endRaw
    ? endRaw.includes(' ')
      ? endRaw.replace(' ', 'T') + ':00'
      : `${endRaw}T${raw.end_time ?? '00:00'}:00`
    : undefined;

  const id = raw.eid ?? raw.eventbrite_event_id;
  if (!id) return null;

  return {
    id: `eventbrite:${id}`,
    title: raw.name ?? '',
    category,
    borough,
    ...(neighborhood && { neighborhood }),
    venue: venue?.name ?? '',
    start,
    ...(end && { end }),
    isFree: raw.is_free === true,
    url: raw.url ?? '',
    source: 'eventbrite',
    lat,
    lon,
  };
}
