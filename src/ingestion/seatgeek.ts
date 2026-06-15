import type { Category, Event } from '../domain/event';
import { boroughFromLatLng } from './borough';
import { neighborhoodFromLatLng } from './neighborhood';

const TYPE_CATEGORY: Partial<Record<string, Category>> = {
  concert: 'music',
  classical_music: 'music',
  festival: 'music',
  sports: 'sports',
  theater: 'theater',
  broadway_tickets_national: 'theater',
  ballet_opera_dance: 'theater',
  comedy: 'comedy',
  film: 'film',
  family_fun_kids: 'kids',
  family: 'kids',
};

export function normalizeSeatGeekEvent(raw: any): Event | null {
  const dateTime = raw.datetime_local as string | undefined;
  if (!dateTime) return null;

  const venue = raw.venue;
  const lat = venue?.location?.lat as number | undefined;
  const lon = venue?.location?.lon as number | undefined;
  if (lat == null || lon == null || Number.isNaN(lat) || Number.isNaN(lon)) return null;

  const borough = boroughFromLatLng(lat, lon);
  if (!borough) return null;

  const neighborhood = neighborhoodFromLatLng(lat, lon, borough) ?? undefined;

  const lowestPrice = raw.stats?.lowest_price as number | null | undefined;
  const highestPrice = raw.stats?.highest_price as number | null | undefined;

  return {
    id: `seatgeek:${raw.id}`,
    title: raw.title,
    category: TYPE_CATEGORY[raw.type as string] ?? 'other',
    borough,
    ...(neighborhood && { neighborhood }),
    venue: venue.name,
    start: dateTime,
    // Null/missing price means unknown, not free — only explicit $0 is free.
    isFree: lowestPrice === 0,
    ...(lowestPrice != null && { priceMin: lowestPrice }),
    ...(highestPrice != null && { priceMax: highestPrice }),
    url: raw.url,
    source: 'seatgeek',
    lat,
    lon,
  };
}
