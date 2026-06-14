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
