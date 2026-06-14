/** Parses a 12-hour clock time like "3:00 pm" / "2:00 PM" into "HH:MM:SS". */
export function parseTime(time: string): string {
  const match = time.trim().match(/^(\d{1,2}):(\d{2})\s*(am|pm)$/i);
  if (!match) {
    throw new Error(`Unrecognized time: "${time}"`);
  }
  let hour = parseInt(match[1], 10);
  const minute = match[2];
  const meridiem = match[3].toLowerCase();
  if (meridiem === 'pm' && hour !== 12) hour += 12;
  if (meridiem === 'am' && hour === 12) hour = 0;
  return `${String(hour).padStart(2, '0')}:${minute}:00`;
}

/** Combines an ISO date ("2026-08-23") and a 12-hour time into a local ISO timestamp. */
export function combineDateTime(date: string, time: string): string {
  return `${date}T${parseTime(time)}`;
}

const NYC_TZ = 'America/New_York';

/** The America/New_York calendar date ("YYYY-MM-DD") for a given instant. */
export function nycDateOf(iso: string): string {
  // 'en-CA' formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone: NYC_TZ }).format(new Date(iso));
}

/**
 * Converts a timezone-aware ISO timestamp (e.g. UTC "…Z") to bare
 * America/New_York local ISO ("YYYY-MM-DDTHH:MM:SS") so every source's start
 * uses one consistent, comparable representation.
 */
export function utcToNycLocal(iso: string): string {
  // 'sv-SE' formats as "YYYY-MM-DD HH:MM:SS".
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: NYC_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
    .format(new Date(iso))
    .replace(' ', 'T');
}
