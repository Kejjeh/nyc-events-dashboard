import type { Event } from '../domain/event';
import { utcToNycLocal, nycDateOf } from './datetime';
import { boroughFromLatLng } from './borough';
import { neighborhoodFromLatLng } from './neighborhood';

/** Smorgasburg runs every weekend, April–October. */
const SEASON_START_MONTH = 4; // April
const SEASON_END_MONTH = 10; // October

/** The two flagship recurring markets — both in Brooklyn, 11am–6pm. */
const MARKETS = {
  williamsburg: {
    weekday: 6, // Saturday
    title: 'Smorgasburg Williamsburg',
    venue: 'Marsha P. Johnson State Park (90 Kent Ave)',
    neighborhood: 'Williamsburg',
  },
  prospect: {
    weekday: 0, // Sunday
    title: 'Smorgasburg Prospect Park',
    venue: 'Prospect Park (Breeze Hill)',
    neighborhood: 'Prospect Park',
  },
} as const;

type MarketLocation = keyof typeof MARKETS;

export interface MarketDescriptor {
  kind: 'market';
  location: MarketLocation;
  date: string; // YYYY-MM-DD
}

const pad = (n: number) => String(n).padStart(2, '0');
const toDateStr = (d: Date) =>
  `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

/**
 * Generates the upcoming weekend market occurrences (Saturday Williamsburg,
 * Sunday Prospect Park) within `weeksAhead`, limited to the April–October season.
 */
export function smorgasburgMarketDescriptors(nowIso: string, weeksAhead = 8): MarketDescriptor[] {
  // Seed from the NYC calendar date so a late-evening (UTC next-day) run keeps today.
  const [year, month, day] = nycDateOf(nowIso).split('-').map(Number);
  const cursor = new Date(Date.UTC(year, month - 1, day));
  const out: MarketDescriptor[] = [];

  for (let i = 0; i < weeksAhead * 7; i++) {
    const month = cursor.getUTCMonth() + 1;
    if (month >= SEASON_START_MONTH && month <= SEASON_END_MONTH) {
      const weekday = cursor.getUTCDay();
      if (weekday === MARKETS.williamsburg.weekday) {
        out.push({ kind: 'market', location: 'williamsburg', date: toDateStr(cursor) });
      } else if (weekday === MARKETS.prospect.weekday) {
        out.push({ kind: 'market', location: 'prospect', date: toDateStr(cursor) });
      }
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

function normalizeMarket(raw: MarketDescriptor): Event {
  const market = MARKETS[raw.location];
  return {
    id: `smorgasburg:${raw.location}:${raw.date}`,
    title: market.title,
    category: 'food',
    borough: 'Brooklyn',
    neighborhood: market.neighborhood,
    venue: market.venue,
    start: `${raw.date}T11:00:00`,
    end: `${raw.date}T18:00:00`,
    isFree: true,
    url: 'https://www.smorgasburg.com/',
    source: 'smorgasburg',
  };
}

/** Normalizes a Squarespace special-event record; null when unplaceable or undated. */
function normalizeSpecial(raw: any): Event | null {
  const loc = raw.location ?? {};
  const borough = boroughFromLatLng(loc.markerLat, loc.markerLng);
  if (!borough) {
    return null;
  }
  // A draft/malformed feed item can lack a valid startDate — drop rather than crash.
  const startMs = new Date(raw.startDate).getTime();
  if (!Number.isFinite(startMs)) {
    return null;
  }
  const endMs = raw.endDate != null ? new Date(raw.endDate).getTime() : NaN;
  const neighborhood = neighborhoodFromLatLng(loc.markerLat, loc.markerLng);
  return {
    id: `smorgasburg:event:${raw.fullUrl}`,
    title: raw.title,
    category: 'food',
    borough,
    ...(neighborhood && { neighborhood }),
    venue: loc.addressTitle || loc.addressLine1 || 'Smorgasburg',
    start: utcToNycLocal(new Date(startMs).toISOString()),
    ...(Number.isFinite(endMs) && { end: utcToNycLocal(new Date(endMs).toISOString()) }),
    isFree: true,
    url: `https://www.smorgasburg.com${raw.fullUrl}`,
    source: 'smorgasburg',
  };
}

export function normalizeSmorgasburgEvent(raw: any): Event | null {
  return raw.kind === 'market' ? normalizeMarket(raw) : normalizeSpecial(raw);
}
