import type { Borough, Category, Event } from '../domain/event';
import { neighborhoodFromLatLng } from './neighborhood';

/**
 * Prospect Park Alliance publishes via "The Events Calendar" REST API (the same
 * platform as City Parks Foundation), but its feed omits per-event venue geo.
 * Every event is in Prospect Park, so we anchor to the park's centroid in
 * Brooklyn and resolve the neighborhood from there.
 */
const PARK_BOROUGH: Borough = 'Brooklyn';
const PARK_LAT = 40.6602;
const PARK_LON = -73.969;
const PARK_VENUE = 'Prospect Park';

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

const KIDS_RE = /kids|children|family|youth|toddler|story\s?time|puppet|lullaby/i;
const SPORTS_RE = /yoga|fitness|workout|\brun\b|running|cycling|tennis|boot\s?camp|wellness/i;
const FOOD_RE = /smorgasburg|food|tasting|brew/i;
// Deliberately excludes the bare word "performance": Prospect Park's arts
// programming (dance, theater, spoken word at the Bandshell) often uses it, and
// with no theater/film bucket here those would be mislabeled music. They fall to
// "other" instead, while genuine concerts still match on the music keywords.
const MUSIC_RE = /concert|\bmusic\b|\bband\b|jazz|\bdj\b|orchestra|symphony/i;

export function normalizeProspectParkEvent(raw: any): Event | null {
  if (typeof raw.start_date !== 'string') return null; // malformed feed item
  if (raw.id == null) return null;

  const title = decodeEntities(raw.title ?? '');
  const categories: string[] = (raw.categories ?? []).map((c: any) => c?.name ?? '');
  const searchable = [...categories, title].join(' ');
  const category: Category = KIDS_RE.test(searchable)
    ? 'kids'
    : SPORTS_RE.test(searchable)
      ? 'sports'
      : FOOD_RE.test(searchable)
        ? 'food'
        : MUSIC_RE.test(searchable)
          ? 'music'
          : 'other';

  // "Free", "Free, Registration Required", and an empty cost all count as free.
  // A "$3 – $13" style range yields the lowest dollar amount as priceMin.
  const cost: string = (raw.cost ?? '').trim();
  const isFree = cost === '' || cost.toLowerCase().startsWith('free');
  const dollarAmounts = [...cost.matchAll(/\$\s*(\d+(?:\.\d+)?)/g)].map((m) => parseFloat(m[1]));
  const priceMin = !isFree && dollarAmounts.length > 0 ? Math.min(...dollarAmounts) : undefined;

  const venueName = decodeEntities(raw.venue?.venue ?? '') || PARK_VENUE;
  const neighborhood = neighborhoodFromLatLng(PARK_LAT, PARK_LON, PARK_BOROUGH);

  return {
    id: `prospectpark:${raw.id}`,
    title,
    category,
    borough: PARK_BOROUGH,
    ...(neighborhood && { neighborhood }),
    venue: venueName,
    start: raw.start_date.replace(' ', 'T'),
    ...(typeof raw.end_date === 'string' && { end: raw.end_date.replace(' ', 'T') }),
    isFree,
    ...(priceMin !== undefined && { priceMin }),
    url: raw.url ?? '',
    source: 'prospectpark',
    lat: PARK_LAT,
    lon: PARK_LON,
  };
}
