import type { Borough, Category, Event } from '../domain/event';
import { nycDateOf } from './datetime';

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * Extracts a start time ("HH:MM:00") from Google Events' `when` string
 * ("Dec 9, 8 – 10 PM", "Tomorrow, 7 PM"). Reads the segment after the last
 * comma (the time part), then takes the first clock number and the first
 * am/pm — which yields the START of a range ("8 – 10 PM" → 8 PM, "11 AM – 2 PM"
 * → 11 AM). Falls back to midnight when no time is present.
 */
function extractTime(when: string): string {
  const tail = (when ?? '').split(',').pop() ?? '';
  const num = tail.match(/(\d{1,2})(?::(\d{2}))?/);
  const mer = tail.match(/(a\.?m\.?|p\.?m\.?)/i);
  if (!num || !mer) return '00:00:00';
  let hour = parseInt(num[1], 10);
  const minute = num[2] ? parseInt(num[2], 10) : 0;
  if (hour > 23 || minute > 59) return '00:00:00';
  const pm = /p/i.test(mer[1]);
  if (pm && hour !== 12) hour += 12;
  if (!pm && hour === 12) hour = 0;
  return `${pad(hour)}:${pad(minute)}:00`;
}

/**
 * Parses Google Events' human date — "Dec 9", "Mon, Dec 9", "Today", "Tomorrow"
 * — plus its `when` time into a bare NYC-local ISO string. Google omits the
 * year, so it's inferred from `nowIso`: a month/day that lands well in the past
 * rolls forward to next year (Dec → Jan). Returns null if unparseable.
 */
export function parseGoogleEventDate(startDate: string, when: string, nowIso: string): string | null {
  if (!nowIso) return null;
  const todayNyc = nycDateOf(nowIso);
  const [ty, tmo, tdy] = todayNyc.split('-').map(Number);
  const todayUtc = Date.UTC(ty, tmo - 1, tdy);
  const time = extractTime(when);
  const sd = (startDate ?? '').trim();

  if (/\btoday\b/i.test(sd)) return `${todayNyc}T${time}`;
  if (/\btomorrow\b/i.test(sd)) {
    const d = new Date(todayUtc + 86_400_000);
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${time}`;
  }

  const m = sd.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})\b/i);
  if (!m) return null;
  const mon = MONTHS[m[1].toLowerCase()];
  const day = parseInt(m[2], 10);
  if (!mon || day < 1 || day > 31) return null;

  let year = ty;
  // Google only lists upcoming events, so a date that looks well past is next year.
  if ((Date.UTC(year, mon - 1, day) - todayUtc) / 86_400_000 < -60) year = ty + 1;
  return `${year}-${pad(mon)}-${pad(day)}T${time}`;
}

const QUEENS_RE =
  /\bqueens\b|astoria|long island city|\blic\b|flushing|jackson heights|\bjamaica\b|\bcorona\b|elmhurst|forest hills|woodside|ridgewood|sunnyside|rego park|bayside|college point|maspeth|kew gardens|far rockaway|ozone park/i;

/** Resolves one of the four target boroughs from the Google Events address text. */
function boroughFromAddress(address: string[]): Borough | null {
  const text = (address ?? []).join(' ').toLowerCase();
  if (/staten island/.test(text)) return null; // outside our coverage
  if (/\bbronx\b/.test(text)) return 'Bronx';
  if (/\bbrooklyn\b/.test(text)) return 'Brooklyn';
  if (QUEENS_RE.test(text)) return 'Queens';
  if (/\bmanhattan\b|harlem|new york, ny|new york, new york|\bnyc\b/.test(text)) return 'Manhattan';
  return null;
}

const COMEDY_RE = /comedy|stand-?up|improv/i;
const KIDS_RE = /kids|children|family|toddler|story\s?time|puppet/i;
const FOOD_RE = /food|festival|tasting|wine|beer|brew|culinary|restaurant week/i;
const MUSIC_RE = /concert|music|\bdj\b|live band|festival/i;

/** Category from the seeding query first, refined by title keywords. */
function categoryFor(query: string, title: string): Category {
  const hay = `${query} ${title}`;
  if (COMEDY_RE.test(hay)) return 'comedy';
  if (KIDS_RE.test(hay)) return 'kids';
  if (FOOD_RE.test(hay)) return 'food';
  if (MUSIC_RE.test(hay)) return 'music';
  return 'other';
}

/**
 * Normalizes a SerpAPI Google-Events result. Drops anything we can't date or
 * place in one of the four boroughs. Coordinates are left undefined — SerpAPI
 * doesn't return them — so 'serpapi' is registered as a geocodeable source and
 * the geocode-enrichment stage resolves the venue's lat/lon (and neighborhood)
 * from the venue + borough. `_q` (seeding query) and `_nowIso` are attached by
 * the fetcher.
 */
export function normalizeSerpApiEvent(raw: any): Event | null {
  const title = typeof raw?.title === 'string' ? raw.title.trim() : '';
  if (!title) return null;

  const start = parseGoogleEventDate(raw?.date?.start_date ?? '', raw?.date?.when ?? '', raw?._nowIso ?? '');
  if (!start) return null;

  const address: string[] = Array.isArray(raw?.address) ? raw.address : [];
  const borough = boroughFromAddress(address);
  if (!borough) return null;

  const venue =
    (typeof raw?.venue?.name === 'string' && raw.venue.name.trim()) ||
    address[0]?.split(',')[0]?.trim() ||
    '';
  if (!venue) return null;

  // A SerpAPI event id isn't stable; derive one from title + venue + date.
  const slug = `${title}-${venue}-${start.slice(0, 10)}`.toLowerCase().replace(/[^a-z0-9]+/g, '-');

  return {
    id: `serpapi:${slug}`,
    title,
    category: categoryFor(raw?._q ?? '', title),
    borough,
    venue,
    start,
    isFree: /\bfree\b/i.test(title),
    url: typeof raw?.link === 'string' ? raw.link : '',
    source: 'serpapi',
    ...(typeof raw?.image === 'string' && raw.image ? { image: raw.image } : {}),
  };
}
