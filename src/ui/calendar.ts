import type { Event } from '../domain/event';

const TZID = 'America/New_York';
const DEFAULT_DURATION_HOURS = 2;

/** "2026-06-15T20:00:00" → "20260615T200000"; "2026-06-15" → "20260615". */
function compact(iso: string): string {
  return iso.replace(/[-:]/g, '');
}

function isTimed(iso: string): boolean {
  return iso.includes('T');
}

/** Adds whole days/hours to a wall-clock ISO using UTC math (runner-tz independent). */
function shift(iso: string, { days = 0, hours = 0 }: { days?: number; hours?: number }): string {
  const [d, t = '00:00:00'] = iso.split('T');
  const [y, mo, da] = d.split('-').map(Number);
  const [h, mi, s] = t.split(':').map(Number);
  const dt = new Date(Date.UTC(y, mo - 1, da, h, mi, s || 0));
  dt.setUTCDate(dt.getUTCDate() + days);
  dt.setUTCHours(dt.getUTCHours() + hours);
  const p = (n: number) => String(n).padStart(2, '0');
  const date = `${dt.getUTCFullYear()}-${p(dt.getUTCMonth() + 1)}-${p(dt.getUTCDate())}`;
  if (!iso.includes('T')) return date; // date-only in, date-only out
  return `${date}T${p(dt.getUTCHours())}:${p(dt.getUTCMinutes())}:${p(dt.getUTCSeconds())}`;
}

/**
 * The start/end wall-clock ISO pair. Whether the event is timed is decided by the
 * START alone, and the end is coerced to the same precision so we never mix a
 * timestamp into an all-day VALUE=DATE (which is invalid per RFC 5545):
 *  - timed start  → end must be a timestamp (a date-only/absent end → start + 2h)
 *  - date-only    → end must be a date (any time is stripped; absent → next day)
 */
function span(event: Event): { start: string; end: string; timed: boolean } {
  const start = event.start;
  const timed = isTimed(start);

  if (timed) {
    const end =
      event.end && isTimed(event.end)
        ? event.end
        : shift(start, { hours: DEFAULT_DURATION_HOURS });
    return { start, end, timed: true };
  }

  const end = event.end ? event.end.slice(0, 10) : shift(start, { days: 1 });
  return { start, end, timed: false };
}

/** A Google Calendar "add event" URL for the given event. */
export function googleCalendarUrl(event: Event): string {
  const { start, end, timed } = span(event);
  const dates = `${compact(start)}/${compact(end)}`;
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    dates,
    details: `${event.url}\n\nFree event via NYC Events.`,
    location: locationOf(event),
  });
  if (timed) params.set('ctz', TZID);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function locationOf(event: Event): string {
  const parts = [event.venue, event.neighborhood, event.borough, 'NY'].filter(Boolean);
  return parts.join(', ');
}

/** Escapes a value for an iCalendar text property (RFC 5545). */
function escIcs(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/**
 * Folds a content line to <=75 octets per RFC 5545 §3.1: continuation lines are
 * a CRLF followed by a single space. Counts UTF-8 octets (not JS chars) and
 * never splits a multi-byte sequence across a fold.
 */
function foldLine(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;

  const decoder = new TextDecoder();
  const chunks: string[] = [];
  let start = 0;
  let limit = 75; // first line 75 octets; continuations 74 (1 reserved for the leading space)
  while (start < bytes.length) {
    let endByte = Math.min(start + limit, bytes.length);
    // Back off so we cut on a character boundary, not mid multi-byte sequence.
    while (endByte < bytes.length && (bytes[endByte] & 0xc0) === 0x80) endByte--;
    chunks.push(decoder.decode(bytes.subarray(start, endByte)));
    start = endByte;
    limit = 74;
  }
  return chunks.join('\r\n ');
}

/** A minimal single-event VCALENDAR (.ics) string for the given event. */
export function toIcs(event: Event, dtstampIso: string = new Date().toISOString()): string {
  const { start, end, timed } = span(event);
  const dtstamp = `${compact(dtstampIso.slice(0, 19))}Z`;
  const dtStart = timed
    ? `DTSTART;TZID=${TZID}:${compact(start)}`
    : `DTSTART;VALUE=DATE:${compact(start)}`;
  const dtEnd = timed
    ? `DTEND;TZID=${TZID}:${compact(end)}`
    : `DTEND;VALUE=DATE:${compact(end)}`;

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//NYC Events//Dashboard//EN',
    'BEGIN:VEVENT',
    `UID:${event.id}@nyc-events`,
    `DTSTAMP:${dtstamp}`,
    dtStart,
    dtEnd,
    `SUMMARY:${escIcs(event.title)}`,
    `LOCATION:${escIcs(locationOf(event))}`,
    `DESCRIPTION:${escIcs(`${event.url}\n\nFree event via NYC Events.`)}`,
    `URL:${event.url}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ]
    .map(foldLine)
    .join('\r\n');
}

/** A data: URI suitable for an <a download> that saves the event as an .ics file. */
export function icsHref(event: Event, dtstampIso?: string): string {
  return `data:text/calendar;charset=utf-8,${encodeURIComponent(toIcs(event, dtstampIso))}`;
}
