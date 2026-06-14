import { XMLParser } from 'fast-xml-parser';
import type { RawBatch } from './assemble';
import { parseSmallsCalendar } from '../ingestion/smallslive';

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

/** NYC Open Data — "NYC Permitted Event Information – Current" (Socrata dataset bkfu-528j). */
const NYC_DATASET_URL = 'https://data.cityofnewyork.us/resource/bkfu-528j.json';
const TARGET_BOROUGHS = ['Manhattan', 'Brooklyn', 'Bronx', 'Queens'];

/** Ticketmaster Discovery API — events in the New York City market. */
const TICKETMASTER_URL = 'https://app.ticketmaster.com/discovery/v2/events.json';

/** NYC Parks public events RSS feed (upcoming 14 days, all free). */
const PARKS_RSS_URL = 'https://www.nycgovparks.org/xml/events_300_rss.xml';

/** SmallsLIVE calendar JSON API (Smalls, Mezzrow & the Café — all Manhattan jazz). */
const SMALLS_AJAX_URL = 'https://www.smallslive.com/search/upcoming-ajax/';
const SMALLS_MAX_PAGES = 6;

/**
 * Fetches upcoming SmallsLIVE jazz sets by paging the calendar AJAX endpoint and
 * parsing each page's `template` HTML.
 */
export async function fetchSmalls(nowIso: string): Promise<RawBatch> {
  const startingDate = nowIso.slice(0, 10);
  const records: any[] = [];

  for (let page = 1; page <= SMALLS_MAX_PAGES; page++) {
    const url = `${SMALLS_AJAX_URL}?page=${page}&venue=all&starting_date=${startingDate}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': BROWSER_UA, Accept: 'application/json' },
    });
    if (!res.ok) {
      throw new Error(`SmallsLIVE fetch failed: HTTP ${res.status}`);
    }
    const body = (await res.json()) as { template?: string; page_range?: number[] };
    const pageRecords = parseSmallsCalendar(body.template ?? '');
    if (pageRecords.length === 0) break;
    records.push(...pageRecords);

    const lastPage = Array.isArray(body.page_range) ? Math.max(...body.page_range) : page;
    if (page >= lastPage) break;
  }

  return { source: 'smallslive', records };
}

/**
 * Fetches upcoming NYC Parks events from the RSS feed. The feed namespaces its
 * event fields (event:startdate, etc.); removeNSPrefix strips those so the
 * parsed records match the keys the Parks normalizer expects.
 */
export async function fetchParks(): Promise<RawBatch> {
  const res = await fetch(PARKS_RSS_URL, {
    headers: {
      // nycgovparks.org rejects bare/unknown agents (HTTP 403) from datacenter
      // IPs, so present a complete browser-like header set.
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      Accept: 'application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });
  if (!res.ok) {
    throw new Error(`NYC Parks RSS fetch failed: HTTP ${res.status}`);
  }
  const xml = await res.text();
  const parser = new XMLParser({
    removeNSPrefix: true,
    parseTagValue: false, // keep all values as strings (guid, coordinates, etc.)
    trimValues: true,
  });
  const parsed = parser.parse(xml);
  const items = parsed?.rss?.channel?.item ?? [];
  const records = Array.isArray(items) ? items : [items];
  return { source: 'nyc-parks', records };
}

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
