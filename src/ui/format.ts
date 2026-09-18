import type { Event, SourceStatus } from '../domain/event';

const DAY = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
});
const TIME = new Intl.DateTimeFormat('en-US', {
  hour: 'numeric',
  minute: '2-digit',
});

/** "Fri, Jul 3" — the event's start day. */
export function formatDay(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : DAY.format(d);
}

/** "8:00 PM" — the event's start time. */
export function formatTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : TIME.format(d);
}

/** "Free", "$50", or "$40–$300" depending on what price data exists. */
export function formatPrice(event: Event): string {
  if (event.isFree) return 'Free';
  if (event.priceMin == null) return '—';
  if (event.priceMax == null || event.priceMax === event.priceMin) {
    return `$${Math.round(event.priceMin)}`;
  }
  return `$${Math.round(event.priceMin)}–$${Math.round(event.priceMax)}`;
}

const SOURCE_LABELS: Record<string, string> = {
  ticketmaster: 'Ticketmaster',
  'nyc-open-data': 'NYC Permits',
  'nyc-parks': 'NYC Parks',
  smallslive: 'SmallsLIVE',
  'village-vanguard': 'Village Vanguard',
  dice: 'DICE',
  smorgasburg: 'Smorgasburg',
  'nyc-greenmarket': 'GrowNYC Greenmarket',
  todaytix: 'TodayTix',
  cityparks: 'City Parks Foundation',
  bpl: 'Brooklyn Public Library',
  seatgeek: 'SeatGeek',
  songkick: 'Songkick',
  jambase: 'JamBase',
  serpapi: 'Google Events',
  eventbrite: 'Eventbrite',
  'resident-advisor': 'Resident Advisor',
};

export function sourceLabel(source: string): string {
  return SOURCE_LABELS[source] ?? source;
}

/**
 * The footer tooltip for one source-health row. `fresh` alone can't tell a
 * missing credential from a quota-skipped fetch from an outright failure, so the
 * `status` field says which — when the payload carries it. Payloads published
 * before `status` existed fall back to the old two-state wording.
 */
export function sourceHealthTitle(status: SourceStatus): string {
  switch (status.status) {
    case 'ok':
      return 'Refreshed this run';
    case 'missing-key':
      return 'Not configured — no API key this run; events carried forward';
    case 'skipped':
      return 'Skipped this run to save API quota; events carried forward';
    case 'error':
      return 'Fetch failed this run; events carried forward';
    default:
      return status.fresh
        ? 'Refreshed this run'
        : 'Carried forward — this source was unavailable at the last refresh';
  }
}
