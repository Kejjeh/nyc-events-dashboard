/**
 * Date-window filtering for the dashboard. Events carry bare ET-local ISO
 * timestamps, so all comparisons are done on the date portion (YYYY-MM-DD)
 * against "today" in New York, computed once by the caller.
 *
 * A window is one of the named windows below, or a literal 'YYYY-MM-DD' for a
 * specific picked day.
 */
export type DateWindow = 'all' | 'today' | 'weekend' | 'week' | (string & {});

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A picked calendar date that has already passed is meaningless as a filter, so
 * collapse it to 'all' — a shared link or saved search never hydrates into a
 * silently-empty board. Named windows and future dates pass through unchanged.
 */
export function effectiveWindow(window: DateWindow, todayIso: string): DateWindow {
  return DATE_RE.test(window) && window < todayIso ? 'all' : window;
}

/** Date math on plain YYYY-MM-DD strings, done in UTC to avoid tz drift. */
function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Day of week for a YYYY-MM-DD string: 0 = Sunday … 6 = Saturday. */
function dayOfWeek(iso: string): number {
  return new Date(`${iso}T00:00:00Z`).getUTCDay();
}

/** The dates of "this weekend" relative to today (future-only, so Sun = just today). */
export function weekendDates(todayIso: string): string[] {
  const dow = dayOfWeek(todayIso);
  if (dow === 0) return [todayIso]; // Sunday: Saturday has passed
  const saturday = addDays(todayIso, 6 - dow);
  return [saturday, addDays(saturday, 1)];
}

/** True when an event's start falls inside the given date window. */
export function isInDateWindow(startIso: string, window: DateWindow, todayIso: string): boolean {
  if (window === 'all') return true;
  const date = startIso.slice(0, 10);
  if (date < todayIso) return false; // the board never shows past days

  switch (window) {
    case 'today':
      return date === todayIso;
    case 'weekend':
      return weekendDates(todayIso).includes(date);
    case 'week':
      return date <= addDays(todayIso, 6); // today + next 6 days
    default:
      // A specific picked day; anything unrecognized is treated as no constraint.
      return DATE_RE.test(window) ? date === window : true;
  }
}
