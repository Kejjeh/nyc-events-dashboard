import type { Event } from '../domain/event';
import { nycLocationFromLatLng } from './nycLocation';
import { utcToNycLocal } from './datetime';

/** Headliner names, falling back to Songkick's displayName minus its trailing date. */
function songkickTitle(raw: any): string {
  const performances = Array.isArray(raw?.performance) ? raw.performance : [];
  const headliners = performances
    .filter((p: any) => p?.billing === 'headline' && p?.artist?.displayName)
    .map((p: any) => p.artist.displayName as string);
  if (headliners.length > 0) return headliners.join(', ');
  const dn = typeof raw?.displayName === 'string' ? raw.displayName : '';
  // Strip the "(Jul 10, 2026)" date parenthetical Songkick appends to displayName.
  return dn.replace(/\s*\([^)]*\)\s*$/, '').trim();
}

/**
 * Normalizes a Songkick Concert/Festival into an Event. Drops cancelled shows,
 * events without usable coordinates, and anything outside the four boroughs
 * (Songkick's geo search spills past the city line). Songkick exposes no price
 * data, so events are marked paid with no amount. The event `uri` is a real,
 * clickable Songkick page with onward ticket links.
 */
export function normalizeSongkickEvent(raw: any): Event | null {
  if (raw?.status === 'cancelled') return null;
  if (raw?.id == null) return null;

  const venue = raw?.venue ?? {};
  const loc = raw?.location ?? {};
  const lat = typeof venue.lat === 'number' ? venue.lat : typeof loc.lat === 'number' ? loc.lat : NaN;
  const lng = typeof venue.lng === 'number' ? venue.lng : typeof loc.lng === 'number' ? loc.lng : NaN;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const nyc = nycLocationFromLatLng(lat, lng);
  if (!nyc) return null;

  const start = raw?.start ?? {};
  let startIso: string;
  if (typeof start.datetime === 'string' && start.datetime) {
    const d = new Date(start.datetime);
    if (Number.isNaN(d.getTime())) return null;
    startIso = utcToNycLocal(d.toISOString());
  } else if (typeof start.date === 'string' && start.date) {
    startIso = `${start.date}T00:00:00`; // time TBA — date only
  } else {
    return null;
  }

  const title = songkickTitle(raw);
  if (!title) return null;

  return {
    id: `songkick:${raw.id}`,
    title,
    category: 'music',
    ...nyc,
    venue: (typeof venue.displayName === 'string' && venue.displayName) || 'Venue',
    start: startIso,
    isFree: false,
    url: typeof raw.uri === 'string' ? raw.uri : '',
    source: 'songkick',
    lat,
    lon: lng,
  };
}
