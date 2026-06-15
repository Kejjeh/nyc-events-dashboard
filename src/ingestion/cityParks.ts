import type { Borough, Category, Event } from '../domain/event';
import { boroughFromLatLng } from './borough';
import { neighborhoodFromLatLng } from './neighborhood';

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
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&hellip;/g, '…')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#?39;|&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .trim();
}

const CONCERT_RE = /concert|music|summerstage|performance/i;

export function normalizeCityParksEvent(raw: any): Event | null {
  if (typeof raw.start_date !== 'string') return null; // malformed feed item

  const venue = raw.venue ?? {};
  const lat = parseFloat(venue.geo_lat);
  const lon = parseFloat(venue.geo_lng);
  const borough = boroughFromLatLng(lat, lon) ?? boroughFromName(venue.city, venue.venue);
  if (!borough) return null;
  const neighborhood = neighborhoodFromLatLng(lat, lon);

  const categories: string[] = (raw.categories ?? []).map((c: any) => c?.name ?? '');
  const category: Category = categories.some((name) => CONCERT_RE.test(name)) ? 'music' : 'other';

  // "Free" only when the whole field is free/empty — not when "free" appears in a
  // note like "children under 12 free". Price is the lowest $-anchored amount.
  const cost: string = (raw.cost ?? '').trim();
  const isFree = cost === '' || cost.toLowerCase() === 'free';
  const dollarAmounts = [...cost.matchAll(/\$\s*(\d+(?:\.\d+)?)/g)].map((m) => parseFloat(m[1]));
  const priceMin = !isFree && dollarAmounts.length > 0 ? Math.min(...dollarAmounts) : undefined;

  return {
    id: `cityparks:${raw.id}`,
    title: decodeEntities(raw.title),
    category,
    borough,
    ...(neighborhood && { neighborhood }),
    venue: venue.venue,
    start: raw.start_date.replace(' ', 'T'),
    ...(typeof raw.end_date === 'string' && { end: raw.end_date.replace(' ', 'T') }),
    isFree,
    ...(priceMin !== undefined && { priceMin }),
    url: raw.url,
    source: 'cityparks',
  };
}
