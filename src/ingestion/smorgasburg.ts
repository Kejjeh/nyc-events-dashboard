import type { Event } from '../domain/event';
import { utcToNycLocal } from './datetime';
import { boroughFromLatLng } from './borough';

/** Smorgasburg runs every weekend, April–October. */
const SEASON_START_MONTH = 4; // April
const SEASON_END_MONTH = 10; // October

/** The two flagship recurring markets — both in Brooklyn, 11am–6pm. */
const MARKETS = {
  williamsburg: {
    weekday: 6, // Saturday
    title: 'Smorgasburg Williamsburg',
    venue: 'Marsha P. Johnson State Park (90 Kent Ave)',
  },
  prospect: {
    weekday: 0, // Sunday
    title: 'Smorgasburg Prospect Park',
    venue: 'Prospect Park (Breeze Hill)',
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
  const start = new Date(nowIso);
  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
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
    venue: market.venue,
    start: `${raw.date}T11:00:00`,
    end: `${raw.date}T18:00:00`,
    isFree: true,
    url: 'https://www.smorgasburg.com/',
    source: 'smorgasburg',
  };
}

/** Normalizes a Squarespace special-event record; null when outside the four boroughs. */
function normalizeSpecial(raw: any): Event | null {
  const loc = raw.location ?? {};
  const borough = boroughFromLatLng(loc.markerLat, loc.markerLng);
  if (!borough) {
    return null;
  }
  return {
    id: `smorgasburg:event:${raw.fullUrl}`,
    title: raw.title,
    category: 'food',
    borough,
    venue: loc.addressTitle || loc.addressLine1 || 'Smorgasburg',
    start: utcToNycLocal(new Date(raw.startDate).toISOString()),
    ...(raw.endDate && { end: utcToNycLocal(new Date(raw.endDate).toISOString()) }),
    isFree: true,
    url: `https://www.smorgasburg.com${raw.fullUrl}`,
    source: 'smorgasburg',
  };
}

export function normalizeSmorgasburgEvent(raw: any): Event | null {
  return raw.kind === 'market' ? normalizeMarket(raw) : normalizeSpecial(raw);
}
