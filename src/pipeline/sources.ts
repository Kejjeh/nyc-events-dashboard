import type { RawBatch } from './assemble';

/** NYC Open Data — "NYC Permitted Event Information – Current" (Socrata dataset bkfu-528j). */
const NYC_DATASET_URL = 'https://data.cityofnewyork.us/resource/bkfu-528j.json';
const TARGET_BOROUGHS = ['Manhattan', 'Brooklyn', 'Bronx', 'Queens'];

/** Ticketmaster Discovery API — events in the New York City market. */
const TICKETMASTER_URL = 'https://app.ticketmaster.com/discovery/v2/events.json';

/**
 * Fetches upcoming permitted events in the four target boroughs.
 * No API key required (Socrata open endpoint).
 */
export async function fetchNycOpenData(nowIso: string): Promise<RawBatch> {
  // Socrata floating timestamps reject the trailing 'Z' and milliseconds,
  // so compare against a plain YYYY-MM-DDTHH:MM:SS value.
  const floatingNow = nowIso.slice(0, 19);
  const where =
    `start_date_time > '${floatingNow}' ` +
    `AND event_borough in('${TARGET_BOROUGHS.join("','")}')`;
  const params = new URLSearchParams({
    $where: where,
    $order: 'start_date_time ASC',
    $limit: '1000',
  });

  const res = await fetch(`${NYC_DATASET_URL}?${params}`);
  if (!res.ok) {
    throw new Error(`NYC Open Data fetch failed: HTTP ${res.status}`);
  }
  const records = (await res.json()) as any[];
  return { source: 'nyc-open-data', records };
}

/**
 * Fetches upcoming NYC events from Ticketmaster. Requires TICKETMASTER_API_KEY;
 * returns an empty batch when the key is absent so the pipeline still runs.
 */
export async function fetchTicketmaster(apiKey: string | undefined): Promise<RawBatch> {
  if (!apiKey) {
    return { source: 'ticketmaster', records: [] };
  }

  const params = new URLSearchParams({
    apikey: apiKey,
    city: 'New York',
    sort: 'date,asc',
    size: '200',
  });

  const res = await fetch(`${TICKETMASTER_URL}?${params}`);
  if (!res.ok) {
    throw new Error(`Ticketmaster fetch failed: HTTP ${res.status}`);
  }
  const body = (await res.json()) as any;
  const records = body?._embedded?.events ?? [];
  return { source: 'ticketmaster', records };
}
