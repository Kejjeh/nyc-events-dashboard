import type { Event } from '../domain/event';
import { localityFromLatLng } from './locality';
import { neighborhoodFromLatLng } from './neighborhood';

/**
 * Normalizes a JamBase Data API v3 event (schema.org MusicEvent). JamBase gives
 * venue coordinates directly, so borough/neighborhood come from the polygon
 * lookup — no geocoding needed. Drops cancelled shows, events without coordinates,
 * and venues outside the four boroughs. The headliner is used as the title for a
 * clean card and better cross-source dedup; `url` is a JamBase show page with
 * onward ticket links.
 */
export function normalizeJamBaseEvent(raw: any): Event | null {
  if (raw?.eventStatus === 'cancelled') return null;
  const id = typeof raw?.identifier === 'string' ? raw.identifier : '';
  if (!id) return null; // already source-prefixed, e.g. "jambase:15345592"

  const loc = Array.isArray(raw?.location) ? raw.location[0] : raw?.location;
  const lat = Number(loc?.geo?.latitude);
  const lon = Number(loc?.geo?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  const place = localityFromLatLng(lat, lon);
  if (!place) return null;
  const neighborhood = place.borough
    ? (neighborhoodFromLatLng(lat, lon, place.borough) ?? undefined)
    : undefined;

  const startRaw = typeof raw?.startDate === 'string' ? raw.startDate : '';
  if (!startRaw) return null;
  const start = startRaw.includes('T') ? startRaw : `${startRaw}T00:00:00`;

  const performers = Array.isArray(raw?.performer) ? raw.performer : [];
  const headliner = performers.map((p: any) => p?.name).find((n: any) => typeof n === 'string' && n);
  const title = headliner || (typeof raw?.name === 'string' ? raw.name : '');
  if (!title) return null;

  const image = typeof raw?.image === 'string' && raw.image ? raw.image : undefined;

  return {
    id,
    title,
    category: 'music',
    city: place.city,
    ...(place.borough && { borough: place.borough }),
    ...(neighborhood && { neighborhood }),
    venue: (typeof loc?.name === 'string' && loc.name) || 'Venue',
    start,
    isFree: raw?.isAccessibleForFree === true,
    url: typeof raw?.url === 'string' ? raw.url : '',
    source: 'jambase',
    ...(image && { image }),
    lat,
    lon,
  };
}
