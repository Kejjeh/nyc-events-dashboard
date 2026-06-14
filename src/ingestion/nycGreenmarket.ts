import type { Borough, Event } from '../domain/event';
import { boroughFromLatLng } from './borough';

const GREENMARKET_URL = 'https://www.grownyc.org/greenmarket';

const DAY_INDEX: Record<string, number> = {
  sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6,
};

/** Maps a day token (full name, abbreviation, or common typo) to 0=Sun..6=Sat. */
function dayToken(token: string): number | null {
  const key = token.trim().toLowerCase().slice(0, 3);
  if (key === 'tus') return 2; // 'Tusday' typo seen in the dataset
  return key in DAY_INDEX ? DAY_INDEX[key] : null;
}

/** Parses free-text operating days ("Mon-Sat", "Friday & Saturday", "Saturdays") to weekday indexes. */
export function parseMarketDays(input: string): number[] {
  const cleaned = input.replace(/\([^)]*\)/g, ' '); // drop "(3rd Wednesday...)" qualifiers
  const days = new Set<number>();

  for (const part of cleaned.split(/[,&]|\band\b/i).map((p) => p.trim()).filter(Boolean)) {
    const range = part.split(/\s*-\s*/);
    if (range.length === 2) {
      const a = dayToken(range[0]);
      const b = dayToken(range[1]);
      if (a !== null && b !== null) {
        for (let i = a; ; i = (i + 1) % 7) {
          days.add(i);
          if (i === b) break;
        }
        continue;
      }
    }
    const single = dayToken(part);
    if (single !== null) days.add(single);
  }
  return [...days].sort((x, y) => x - y);
}

function parseClock(tokenRaw: string): { h: number; m: number; mer: 'am' | 'pm' | null } | null {
  const t = tokenRaw.trim().toLowerCase();
  if (t.startsWith('noon')) return { h: 12, m: 0, mer: 'pm' };
  if (t.startsWith('midnight')) return { h: 0, m: 0, mer: null };
  const m = t.match(/(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?/);
  if (!m) return null;
  return {
    h: parseInt(m[1], 10),
    m: m[2] ? parseInt(m[2], 10) : 0,
    mer: m[3] ? (m[3].startsWith('p') ? 'pm' : 'am') : null,
  };
}

function to24(c: { h: number; m: number }, mer: 'am' | 'pm' | null): string | null {
  let h = c.h;
  if (mer === 'pm' && h !== 12) h += 12;
  if (mer === 'am' && h === 12) h = 0;
  if (h < 0 || h > 23 || c.m < 0 || c.m > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(c.m).padStart(2, '0')}:00`;
}

/** Parses a free-text hours range ("8 a.m. - 4p.m.", "noon - 3 p.m.", "1-5 p.m."). */
export function parseMarketHours(input: string): { start: string; end?: string } | null {
  const [startRaw, endRaw] = input.split(/\s*-\s*/);
  const startC = parseClock(startRaw ?? '');
  if (!startC) return null;
  const endC = endRaw ? parseClock(endRaw) : null;
  // A meridiem-less start ("1-5 p.m.") inherits the end's meridiem.
  const start = to24(startC, startC.mer ?? endC?.mer ?? null);
  if (!start) return null;

  const result: { start: string; end?: string } = { start };
  if (endC) {
    const end = to24(endC, endC.mer ?? startC.mer ?? null);
    if (end) result.end = end;
  }
  return result;
}

export interface GreenmarketDescriptor {
  marketname: string;
  borough: Borough;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:MM:SS
  endTime?: string;
}

const pad = (n: number) => String(n).padStart(2, '0');
const toDateStr = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/**
 * Turns Socrata farmers-market rows (each a recurring weekly schedule) into
 * upcoming dated occurrences. Rows outside the four boroughs or with
 * unparseable days/hours are skipped.
 */
export function greenmarketDescriptors(
  rows: any[],
  nowIso: string,
  weeksAhead = 6,
): GreenmarketDescriptor[] {
  const start = new Date(nowIso);
  const out: GreenmarketDescriptor[] = [];

  for (const row of rows) {
    const borough = boroughFromLatLng(parseFloat(row.latitude), parseFloat(row.longitude));
    if (!borough) continue;
    const days = new Set(parseMarketDays(row.daysoperation ?? ''));
    if (days.size === 0) continue;
    const hours = parseMarketHours(row.hoursoperations ?? '');
    if (!hours) continue;

    const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
    for (let i = 0; i < weeksAhead * 7; i++) {
      if (days.has(cursor.getUTCDay())) {
        out.push({
          marketname: row.marketname,
          borough,
          date: toDateStr(cursor),
          startTime: hours.start,
          ...(hours.end && { endTime: hours.end }),
        });
      }
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
  }
  return out;
}

export function normalizeGreenmarketEvent(raw: GreenmarketDescriptor): Event {
  return {
    id: `nyc-greenmarket:${slugify(raw.marketname)}:${raw.date}`,
    title: raw.marketname,
    category: 'food',
    borough: raw.borough,
    venue: raw.marketname,
    start: `${raw.date}T${raw.startTime}`,
    ...(raw.endTime && { end: `${raw.date}T${raw.endTime}` }),
    isFree: true,
    url: GREENMARKET_URL,
    source: 'nyc-greenmarket',
  };
}
