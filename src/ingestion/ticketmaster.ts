import type { Category, Event } from '../domain/event';
import { utcToNycLocal } from './datetime';
import { boroughFromLatLng } from './borough';
import { neighborhoodFromLatLng } from './neighborhood';

/** Maps a Ticketmaster classification to our taxonomy (segment, refined by genre). */
function categoryFor(classification: any): Category {
  const segment = classification?.segment?.name;
  const genre = classification?.genre?.name;
  if (segment === 'Family') return 'kids';
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

  const lat = parseFloat(venue.location?.latitude);
  const lon = parseFloat(venue.location?.longitude);

  // NYC stays borough-precise (coords → borough + neighborhood); other states and
  // cities come straight from the TM venue, so Ticketmaster covers the whole
  // region. After JamBase's trial lapses, this is the permanent multi-state source.
  const borough = boroughFromLatLng(lat, lon) ?? CITY_BOROUGH[venue.city?.name];
  let city: string;
  let state: string | undefined;
  let neighborhood: string | undefined;
  if (borough) {
    city = 'New York';
    state = 'NY';
    neighborhood = neighborhoodFromLatLng(lat, lon, borough) ?? undefined;
  } else {
    city = typeof venue.city?.name === 'string' ? venue.city.name.trim() : '';
    state = typeof venue.state?.stateCode === 'string' ? venue.state.stateCode : undefined;
  }
  if (!city) return null;

  const price = raw.priceRanges?.[0];

  return {
    id: `ticketmaster:${raw.id}`,
    title: raw.name,
    category: categoryFor(raw.classifications?.[0]),
    city,
    ...(state && { state }),
    ...(borough && { borough }),
    ...(neighborhood && { neighborhood }),
    venue: venue.name,
    // Ticketmaster returns UTC; convert to ET-local so all sources are uniform.
    start: utcToNycLocal(dateTime),
    // No price range means "price not published", not free — only an explicit $0 is free.
    isFree: price ? price.min === 0 : false,
    ...(price && { priceMin: price.min, priceMax: price.max }),
    url: raw.url,
    source: 'ticketmaster',
    ...(Number.isFinite(lat) && Number.isFinite(lon) && { lat, lon }),
  };
}
