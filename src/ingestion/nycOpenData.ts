import type { Borough, Event } from '../domain/event';

/** Landing page for NYC's permitted-event program; individual records have no public URL. */
const NYC_EVENTS_URL = 'https://www.nyc.gov/site/cecm/about/events.page';

/** The four boroughs the dashboard covers. Staten Island is intentionally excluded. */
const TARGET_BOROUGHS: readonly Borough[] = ['Bronx', 'Queens', 'Manhattan', 'Brooklyn'];

function isTargetBorough(value: string): value is Borough {
  return (TARGET_BOROUGHS as readonly string[]).includes(value);
}

export function normalizeNycOpenDataEvent(raw: any): Event | null {
  if (!isTargetBorough(raw.event_borough)) {
    return null;
  }

  return {
    // The permits dataset repeats event_id across date occurrences, so the
    // start makes the id occurrence-unique (and exact-duplicate rows still
    // collapse on dedup).
    id: `nyc-open-data:${raw.event_id}:${raw.start_date_time}`,
    title: raw.event_name,
    category: 'other',
    borough: raw.event_borough,
    venue: raw.event_location,
    start: raw.start_date_time,
    end: raw.end_date_time,
    isFree: true,
    url: NYC_EVENTS_URL,
    source: 'nyc-open-data',
  };
}
