import type { Category, Event } from '../domain/event';
import { utcToNycLocal } from './datetime';
import { boroughFromLatLng } from './borough';
import { neighborhoodFromLatLng } from './neighborhood';

/** Maps a Ticketmaster classification to our taxonomy (segment, refined by genre). */
function categoryFor(classification: any): Category {
  const segment = classification?.segment?.name;
  const genre = classification?.genre?.name;
  if (segment === 'Sports') return 'sports';
  if (segment === 'Music') return 'music';
  if (segment === 'Film') return 'film';
  if (segment === 'Arts & Theatre') {
    if (genre === 'Comedy') return 'comedy';
    if (genre === 'Film') return 'film';
    return 'theater';
  }
  return 'other';
}

/** Fallback borough from a Ticketmaster venue city when coordinates are absent. */
const CITY_BOROUGH: Record<string, Event['borough']> = {
  'New York': 'Manhattan',
  Manhattan: 'Manhattan',
  Brooklyn: 'Brooklyn',
  Bronx: 'Bronx',
  Queens: 'Queens',
};

export function normalizeTicketmasterEvent(raw: any): Event | null {
  // Date-TBA events have no start dateTime; drop them — they can't be placed.
  const dateTime = raw.dates?.start?.dateTime;
  if (!dateTime) return null;

  const venue = raw._embedded?.venues?.[0];
  if (!venue) return null;

  // Prefer venue coordinates: they cover all four boroughs and yield a
  // neighborhood. Fall back to the venue city text, and drop anything that
  // doesn't resolve to one of our four boroughs.
  const lat = parseFloat(venue.location?.latitude);
  const lon = parseFloat(venue.location?.longitude);
  const borough = boroughFromLatLng(lat, lon) ?? CITY_BOROUGH[venue.city?.name];
  if (!borough) return null;
  const neighborhood = neighborhoodFromLatLng(lat, lon, borough) ?? undefined;

  const price = raw.priceRanges?.[0];

  return {
    id: `ticketmaster:${raw.id}`,
    title: raw.name,
    category: categoryFor(raw.classifications?.[0]),
    borough,
    ...(neighborhood && { neighborhood }),
    venue: venue.name,
    // Ticketmaster returns UTC; convert to ET-local so all sources are uniform.
    start: utcToNycLocal(dateTime),
    // No price range means "price not published", not free — only an explicit $0 is free.
    isFree: price ? price.min === 0 : false,
    ...(price && { priceMin: price.min, priceMax: price.max }),
    url: raw.url,
    source: 'ticketmaster',
  };
}
