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

/** The start/end wall-clock ISO pair, defaulting the end to start + 2h (or +1 day for all-day). */
function span(event: Event): { start: string; end: string; timed: boolean } {
  const start = event.start;
  const timed = isTimed(start);
  if (event.end) return { start, end: event.end, timed: timed && isTimed(event.end) };
  const end = timed
    ? shift(start, { hours: DEFAULT_DURATION_HOURS })
    : shift(start, { days: 1 });
  return { start, end, timed };
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
  ].join('\r\n');
}

/** A data: URI suitable for an <a download> that saves the event as an .ics file. */
export function icsHref(event: Event, dtstampIso?: string): string {
  return `data:text/calendar;charset=utf-8,${encodeURIComponent(toIcs(event, dtstampIso))}`;
}
