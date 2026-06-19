import type { Category, Event } from '../domain/event';
import { combineDateTime } from './datetime';
import { nycLocationFromLatLng } from './nycLocation';

/**
 * Parks category labels grouped into our taxonomy. An item carries several
 * labels, so mapping scans these groups in priority order (music > food >
 * sports) and returns the first taxonomy bucket that matches.
 */
const PARKS_CATEGORY_GROUPS: ReadonlyArray<readonly [Category, ReadonlySet<string>]> = [
  ['music', new Set(['Concerts', 'Free Summer Concerts'])],
  ['food', new Set(['Food', 'Markets'])],
  [
    'kids',
    new Set([
      "Children's Events",
      'Kids',
      'Family',
      'Youth Programs',
      'After School',
      'Junior',
      'Teen Programs',
      'Sports Camps',
      'Summer Sports Experience',
    ]),
  ],
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
export function normalizeParksEvent(raw: any): Event | null {
  const [lat, lon] = (raw.coordinates ?? '').split(',').map((n: string) => parseFloat(n.trim()));
  const loc = nycLocationFromLatLng(lat, lon);
  if (!loc) {
    return null;
  }

  return {
    id: `nyc-parks:${raw.guid}`,
    title: raw.title,
    category: categoryForParks(raw.categories),
    ...loc,
    venue: raw.location,
    start: combineDateTime(raw.startdate, raw.starttime),
    end: combineDateTime(raw.enddate, raw.endtime),
    isFree: true,
    url: raw.link,
    source: 'nyc-parks',
    ...(Number.isFinite(lat) && Number.isFinite(lon) && { lat, lon }),
  };
}
