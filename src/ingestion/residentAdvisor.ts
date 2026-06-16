import type { Event } from '../domain/event';
import { utcToNycLocal } from './datetime';
import { boroughFromLatLng } from './borough';
import { neighborhoodFromLatLng } from './neighborhood';

export function normalizeResidentAdvisorEvent(raw: any): Event | null {
  // Each raw item is an eventListing; the actual event fields are nested.
  const event = raw?.event ?? raw;
  const startTime: string | undefined = event.startTime;
  if (!startTime) return null;

  const venue = event.venue;
  const lat = parseFloat(venue?.lat);
  const lon = parseFloat(venue?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  const borough = boroughFromLatLng(lat, lon);
  if (!borough) return null;

  const neighborhood = neighborhoodFromLatLng(lat, lon, borough) ?? undefined;

  // RA returns UTC timestamps (Z suffix); convert to NYC local.
  const start = utcToNycLocal(startTime);
  const end = event.endTime ? utcToNycLocal(event.endTime) : undefined;

  const contentUrl: string = event.contentUrl ?? '';
  const url = contentUrl.startsWith('http') ? contentUrl : `https://ra.co${contentUrl}`;

  return {
    id: `ra:${event.id}`,
    title: event.title ?? '',
    category: 'music',
    borough,
    ...(neighborhood && { neighborhood }),
    venue: venue?.name ?? '',
    start,
    ...(end && { end }),
    isFree: false,
    url,
    source: 'resident-advisor',
    lat,
    lon,
  };
}
