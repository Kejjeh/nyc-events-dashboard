import type { Borough, Category, Event } from '../domain/event';
import boroughPolygons from './data/borough-polygons.json';

/** Outer rings ([lon, lat]) for each target borough, keyed by borough name. */
const BOROUGH_RINGS = boroughPolygons as Record<Borough, number[][][]>;

/** Ray-casting point-in-polygon test for a [lon, lat] point against one ring. */
function pointInRing(lon: number, lat: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersects =
      yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

/** Parses a Parks RSS time like "3:00 pm" into a 24-hour "HH:MM:SS" string. */
function parseTime(time: string): string {
  const match = time.trim().match(/^(\d{1,2}):(\d{2})\s*(am|pm)$/i);
  if (!match) {
    throw new Error(`Unrecognized Parks time: "${time}"`);
  }
  let hour = parseInt(match[1], 10);
  const minute = match[2];
  const meridiem = match[3].toLowerCase();
  if (meridiem === 'pm' && hour !== 12) hour += 12;
  if (meridiem === 'am' && hour === 12) hour = 0;
  return `${String(hour).padStart(2, '0')}:${minute}:00`;
}

/** Combines a Parks date ("2026-08-23") and time ("3:00 pm") into a local ISO timestamp. */
function combineDateTime(date: string, time: string): string {
  return `${date}T${parseTime(time)}`;
}

/**
 * Parks category labels grouped into our taxonomy. An item carries several
 * labels, so mapping scans these groups in priority order (music > food >
 * sports) and returns the first taxonomy bucket that matches.
 */
const PARKS_CATEGORY_GROUPS: ReadonlyArray<readonly [Category, ReadonlySet<string>]> = [
  ['music', new Set(['Concerts', 'Free Summer Concerts'])],
  ['food', new Set(['Food', 'Markets'])],
  [
    'sports',
    new Set([
      'Sports',
      'Fitness',
      'Exercise Classes',
      'Shape Up NYC',
      'Outdoor Fitness',
      'Yoga & Pilates Classes',
      'Running/Jogging',
      'Basketball/Netball',
      'Football',
      'Soccer',
      'Pickleball',
      'Volleyball',
      'Handball',
      'Baseball/Softball',
      'Track & Field',
      'Swimming/Aquatics',
      'Martial Arts',
      'Strength Training/Weightlifting',
      'Social Sports',
      'Sports Camps',
      'Summer Sports Experience',
    ]),
  ],
];

/** Maps a Parks pipe-delimited category string to our taxonomy. */
function categoryForParks(categories: string): Category {
  const list = categories.split('|').map((c) => c.trim());
  for (const [category, labels] of PARKS_CATEGORY_GROUPS) {
    if (list.some((c) => labels.has(c))) {
      return category;
    }
  }
  return 'other';
}

/**
 * Derives the borough from a "lat, lon" coordinate string via point-in-polygon
 * against the four target boroughs. Returns null for points outside them
 * (Staten Island, New Jersey, bad data).
 */
function boroughFromCoordinates(coordinates: string): Borough | null {
  const [lat, lon] = coordinates.split(',').map((n) => parseFloat(n.trim()));
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return null;
  }
  for (const borough of Object.keys(BOROUGH_RINGS) as Borough[]) {
    if (BOROUGH_RINGS[borough].some((ring) => pointInRing(lon, lat, ring))) {
      return borough;
    }
  }
  return null;
}

export function normalizeParksEvent(raw: any): Event | null {
  const borough = boroughFromCoordinates(raw.coordinates);
  if (!borough) {
    return null;
  }

  return {
    id: `nyc-parks:${raw.guid}`,
    title: raw.title,
    category: categoryForParks(raw.categories),
    borough,
    venue: raw.location,
    start: combineDateTime(raw.startdate, raw.starttime),
    end: combineDateTime(raw.enddate, raw.endtime),
    isFree: true,
    url: raw.link,
    source: 'nyc-parks',
  };
}
