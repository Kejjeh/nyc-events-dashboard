import type { Event } from '../domain/event';
import { combineDateTime, parseTime } from './datetime';

export interface SmallsRecord {
  id: string;
  title: string;
  venue: string;
  date: string;
  startTime: string;
  endTime: string | undefined;
  url: string;
}

const MONTHS: Record<string, string> = {
  January: '01', February: '02', March: '03', April: '04', May: '05', June: '06',
  July: '07', August: '08', September: '09', October: '10', November: '11', December: '12',
};

/** "June 14, 2026" -> "2026-06-14" (null if unrecognized). */
function parseDateHeader(text: string): string | null {
  const m = text.trim().match(/^(\w+)\s+(\d{1,2}),\s+(\d{4})$/);
  const month = m && MONTHS[m[1]];
  return m && month ? `${m[3]}-${month}-${m[2].padStart(2, '0')}` : null;
}

function decodeEntities(text: string): string {
  return text
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .trim();
}

/**
 * Splits a SmallsLIVE set-time string into a start and (optional) end.
 * "6:00 PM & 7:30 PM" -> two set starts, no clean end.
 * "2:00 PM - 5:15 PM" -> a range; the end is kept only when it lands later the
 * same day (late-night sets that cross midnight drop the end rather than lie).
 */
function splitTimes(times: string): { startTime?: string; endTime?: string } {
  let startTime: string;
  let endTime: string | undefined;
  if (times.includes(' & ')) {
    startTime = times.split(' & ')[0].trim();
  } else if (times.includes(' - ')) {
    const [a, b] = times.split(' - ').map((s) => s.trim());
    startTime = a;
    try {
      if (parseTime(b) > parseTime(a)) endTime = b;
    } catch {
      // unparseable end — leave it off
    }
  } else {
    startTime = times.trim();
  }
  try {
    parseTime(startTime);
  } catch {
    return {};
  }
  return { startTime, endTime };
}

const TOKEN =
  /data-date="([^"]+)"|class="[a-z]+-color text2">\s*([^<]+?)\s*<\/div>|href="(\/events\/(\d+)-[^"]*)"[^>]*>\s*<div class="text-grey text2">\s*([^<]+?)\s*<\/div>\s*<div class="text2 day_event_title">\s*([^<]+?)\s*</g;

/**
 * Parses the `template` HTML from /search/upcoming-ajax/ into flat records.
 * Date and venue arrive as section headers, so they are threaded through to the
 * events that follow them.
 */
export function parseSmallsCalendar(html: string): SmallsRecord[] {
  const records: SmallsRecord[] = [];
  let date: string | null = null;
  let venue: string | null = null;

  for (const m of html.matchAll(TOKEN)) {
    if (m[1] !== undefined) {
      date = parseDateHeader(m[1]);
    } else if (m[2] !== undefined) {
      venue = decodeEntities(m[2]);
    } else if (m[3] !== undefined) {
      if (!date || !venue) continue;
      const { startTime, endTime } = splitTimes(decodeEntities(m[5]));
      if (!startTime) continue;
      records.push({
        id: m[4],
        title: decodeEntities(m[6]),
        venue,
        date,
        startTime,
        endTime,
        url: `https://www.smallslive.com${m[3]}`,
      });
    }
  }
  return records;
}

/** SmallsLIVE network venues — all in Manhattan's West Village — to display names. */
const VENUE_NAMES: Record<string, string> = {
  Smalls: 'Smalls Jazz Club',
  Mezzrow: 'Mezzrow',
  Jazzcultural: 'The Jazz Cultural Theater',
};

export function normalizeSmallsEvent(raw: any): Event {
  return {
    id: `smallslive:${raw.id}`,
    title: raw.title,
    category: 'music',
    borough: 'Manhattan',
    venue: VENUE_NAMES[raw.venue] ?? raw.venue,
    start: combineDateTime(raw.date, raw.startTime),
    ...(raw.endTime && { end: combineDateTime(raw.date, raw.endTime) }),
    isFree: false,
    url: raw.url,
    source: 'smallslive',
  };
}
