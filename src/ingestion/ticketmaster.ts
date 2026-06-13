import type { Category, Event } from '../domain/event';

/** Maps a Ticketmaster classification segment to our category taxonomy. */
function categoryForSegment(segment: string | undefined): Category {
  switch (segment) {
    case 'Sports':
      return 'sports';
    case 'Music':
      return 'music';
    default:
      return 'other';
  }
}

/** Maps a Ticketmaster venue city name to a NYC borough. */
function boroughForCity(city: string): Event['borough'] {
  switch (city) {
    case 'Brooklyn':
      return 'Brooklyn';
    case 'Bronx':
      return 'Bronx';
    case 'Queens':
      return 'Queens';
    case 'New York':
    case 'Manhattan':
    default:
      return 'Manhattan';
  }
}

export function normalizeTicketmasterEvent(raw: any): Event {
  const venue = raw._embedded.venues[0];
  const price = raw.priceRanges?.[0];

  return {
    id: `ticketmaster:${raw.id}`,
    title: raw.name,
    category: categoryForSegment(raw.classifications?.[0]?.segment?.name),
    borough: boroughForCity(venue.city.name),
    venue: venue.name,
    start: raw.dates.start.dateTime,
    isFree: !price,
    ...(price && { priceMin: price.min, priceMax: price.max }),
    url: raw.url,
    source: 'ticketmaster',
  };
}
