import type { Event } from '../domain/event';

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
  serpapi: 'Google Events',
  eventbrite: 'Eventbrite',
  'resident-advisor': 'Resident Advisor',
};

export function sourceLabel(source: string): string {
  return SOURCE_LABELS[source] ?? source;
}
