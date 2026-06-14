import type { Borough, Category, Event } from '../domain/event';
import { boroughFromLatLng } from './borough';

const BOROUGH_NAMES: Record<string, Borough> = {
  manhattan: 'Manhattan',
  brooklyn: 'Brooklyn',
  queens: 'Queens',
  bronx: 'Bronx',
};

/** Fallback borough from a free-text venue/city string (e.g. "Queens"). */
function boroughFromName(...values: (string | undefined)[]): Borough | null {
  for (const value of values) {
    const match = BOROUGH_NAMES[(value ?? '').trim().toLowerCase()];
    if (match) return match;
  }
  return null;
}

function decodeEntities(text: string): string {
  return (text ?? '')
    .replace(/&#0?38;|&amp;/g, '&')
    .replace(/&#8217;|&#039;|&#39;/g, "'")
    .replace(/&#8211;/g, '–')
    .replace(/&#8212;/g, '—')
    .replace(/&quot;/g, '"')
    .trim();
}

const CONCERT_RE = /concert|music|summerstage|performance/i;

export function normalizeCityParksEvent(raw: any): Event | null {
  const venue = raw.venue ?? {};
  const borough =
    boroughFromLatLng(parseFloat(venue.geo_lat), parseFloat(venue.geo_lng)) ??
    boroughFromName(venue.city, venue.venue);
  if (!borough) return null;

  const categories: string[] = (raw.categories ?? []).map((c: any) => c?.name ?? '');
  const category: Category = categories.some((name) => CONCERT_RE.test(name)) ? 'music' : 'other';

  const cost: string = (raw.cost ?? '').trim();
  const isFree = cost === '' || /free/i.test(cost);
  const priceMatch = cost.match(/(\d+(?:\.\d+)?)/);

  return {
    id: `cityparks:${raw.id}`,
    title: decodeEntities(raw.title),
    category,
    borough,
    venue: venue.venue,
    start: raw.start_date.replace(' ', 'T'),
    ...(raw.end_date && { end: raw.end_date.replace(' ', 'T') }),
    isFree,
    ...(!isFree && priceMatch && { priceMin: parseFloat(priceMatch[1]) }),
    url: raw.url,
    source: 'cityparks',
  };
}
