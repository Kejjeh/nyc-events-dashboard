import { XMLParser } from 'fast-xml-parser';
import type { RawBatch } from './assemble';
import { parseSmallsCalendar } from '../ingestion/smallslive';
import { smorgasburgMarketDescriptors } from '../ingestion/smorgasburg';
import { greenmarketDescriptors } from '../ingestion/nycGreenmarket';
import { nycDateOf } from '../ingestion/datetime';
import { withRetry } from './retry';

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

/**
 * Transient statuses worth retrying. NYC Parks (CloudFront origin/WAF) returns a
 * sporadic 403 on cache-miss that a retry recovers; Socrata returns transient
 * 503s. A non-retryable status (e.g. 404) is returned as-is for the caller.
 */
const RETRYABLE_STATUS = new Set([403, 429, 500, 502, 503, 504]);

/** Per-attempt request timeout so a hung connection becomes a retryable error
 *  instead of stalling the whole pipeline forever. */
const REQUEST_TIMEOUT_MS = 20000;

/** Fetch with a per-attempt timeout and bounded exponential-backoff retries. */
function fetchWithRetry(url: string, init?: RequestInit): Promise<Response> {
  return withRetry(
    async () => {
      // A fresh timeout signal per attempt; AbortError rejects (and retries)
      // rather than hanging if the server accepts but never responds.
      const res = await fetch(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
      if (RETRYABLE_STATUS.has(res.status)) {
        throw new Error(`transient HTTP ${res.status}`);
      }
      return res;
    },
    { retries: 3, baseDelayMs: 1000 },
  );
}

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
    const res = await fetchWithRetry(url, {
      headers: { 'User-Agent': BROWSER_UA, Accept: 'application/json' },
    });
    if (!res.ok) {
      throw new Error(`SmallsLIVE fetch failed: HTTP ${res.status}`);
    }
    const body = (await res.json()) as { template?: string; page_range?: number[] };
    const pageRecords = parseSmallsCalendar(body.template ?? '');
    // A substantial template that parses to nothing means the markup changed —
    // fail loudly so carry-forward keeps the last-good data instead of wiping it.
    if (page === 1 && pageRecords.length === 0 && (body.template?.length ?? 0) > 300) {
      throw new Error('SmallsLIVE: calendar template parsed to zero records');
    }
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
  const res = await fetchWithRetry(PARKS_RSS_URL, {
    headers: {
      // nycgovparks.org sits behind CloudFront; on a cache-miss the origin/WAF
      // sporadically 403s datacenter IPs. fetchWithRetry recovers by landing on
      // a warm edge on a subsequent attempt.
      'User-Agent': BROWSER_UA,
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

/** Village Vanguard (SquadUp-ticketed) — discovery + per-event JSON API. */
const VV_HOME = 'https://villagevanguard.com/';
const VV_ARTIST_BASE = 'https://vv.squadup.com/artists/';
const SQUADUP_EVENT_BASE = 'https://www.squadup.com/api/v3/events/';

/**
 * Fetches upcoming Village Vanguard jazz sets. The schedule lives behind SquadUp:
 * the venue homepage lists upcoming artist slugs; the SquadUp SPA's page JS chunk
 * carries a public access token plus a slug -> {name, eventIds} map; each event id
 * resolves to a per-set JSON record. The chunk hash and token are discovered each
 * run (never hardcoded) so SquadUp redeploys/rotations don't break the source.
 */
export async function fetchVillageVanguard(): Promise<RawBatch> {
  const headers = { 'User-Agent': BROWSER_UA };
  const home = await (await fetchWithRetry(VV_HOME, { headers })).text();
  const slugs = [
    ...new Set([...home.matchAll(/vv\.squadup\.com\/artists\/([a-z0-9-]+)/g)].map((m) => m[1])),
  ];
  if (slugs.length === 0) return { source: 'village-vanguard', records: [] };

  // Discover the page chunk (hashed filename), the access token, and the slug map.
  const shell = await (await fetchWithRetry(`${VV_ARTIST_BASE}${slugs[0]}`, { headers })).text();
  const chunkPath = shell.match(
    /\/_next\/static\/chunks\/app\/artists\/%5BartistSlug%5D\/page-[a-f0-9]+\.js/,
  );
  if (!chunkPath) throw new Error('Village Vanguard: SquadUp page chunk not found');
  const chunk = await (await fetchWithRetry(`https://vv.squadup.com${chunkPath[0]}`, { headers })).text();
  const tokenMatch = chunk.match(/access_token=(vv-[0-9a-f]+)/) || chunk.match(/(vv-[0-9a-f]{16,})/);
  if (!tokenMatch) throw new Error('Village Vanguard: SquadUp access token not found');
  const token = tokenMatch[1];

  const acts = slugs
    .map((slug) => {
      const m = chunk.match(
        new RegExp(`"${slug}":\\{artist:\\{name:"([^"]*)"\\},eventIds:\\[([\\d,]+)\\]`),
      );
      return m ? { slug, title: m[1], eventIds: m[2].split(',').filter(Boolean) } : null;
    })
    .filter((a): a is { slug: string; title: string; eventIds: string[] } => a !== null);

  // Homepage had upcoming slugs but none matched the chunk's slug map: the
  // SquadUp bundle shape changed. Fail so carry-forward preserves last-good data
  // rather than silently publishing an empty Village Vanguard.
  if (acts.length === 0) {
    throw new Error('Village Vanguard: SquadUp slug map yielded no acts');
  }

  // Dedup event ids: a set cross-listed under two artist slugs (double-bills)
  // would otherwise produce duplicate Event ids.
  const seen = new Set<string>();
  const jobs = acts
    .flatMap((a) => a.eventIds.map((id) => ({ slug: a.slug, title: a.title, id })))
    .filter((job) => (seen.has(job.id) ? false : seen.add(job.id)));
  const records = (
    await Promise.all(
      jobs.map(async (job) => {
        try {
          const res = await fetchWithRetry(
            `${SQUADUP_EVENT_BASE}${job.id}?include=price_tiers&access_token=${token}`,
            { headers: { ...headers, Accept: 'application/json' } },
          );
          if (!res.ok) return null;
          const event = ((await res.json()) as any)?.events;
          if (!event?.start_at) return null;
          return {
            id: event.id,
            title: job.title,
            slug: job.slug,
            startAt: event.start_at,
            endAt: event.end_at,
            priceTiers: event.price_tiers ?? [],
          };
        } catch {
          return null;
        }
      }),
    )
  ).filter(Boolean);

  return { source: 'village-vanguard', records };
}

/**
 * DICE.fm NYC city slug (the hex is DICE's stable city id). Pinned rather than
 * resolved from the ?location=new-york redirect, which is IP-geolocated and
 * resolves to a non-NYC city from datacenter IPs (e.g. GitHub Actions).
 */
const DICE_NYC_SLUG = 'new_york-5bbf4db0f06331478e9b2c59';
const DICE_BROWSE_URL = `https://dice.fm/browse/${DICE_NYC_SLUG}`;
/** Browse filters to pull; each event self-tags its category via tags_types. */
const DICE_FILTERS = [
  'culture/comedy',
  'culture/theatre',
  'culture/film',
  'culture/sport',
  'music/gig',
  'music/dj',
  'music/party',
];

/**
 * Fetches NYC events from DICE.fm across several browse filters. The browse page
 * embeds a Next.js buildId (rotates on redeploy, so discovered each run) used to
 * hit the keyless per-filter data endpoints for the pinned NYC slug. Each filter
 * is single-page (DICE's nextCursor is broken); events are deduped by id since a
 * show can appear under multiple filters.
 */
export async function fetchDice(): Promise<RawBatch> {
  const headers = { 'User-Agent': BROWSER_UA };
  const browseRes = await fetchWithRetry(DICE_BROWSE_URL, { headers });
  const html = await browseRes.text();

  const nextDataMatch = html.match(
    /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/,
  );
  if (!nextDataMatch) {
    throw new Error('DICE: could not locate __NEXT_DATA__');
  }
  const buildId = JSON.parse(nextDataMatch[1])?.buildId;
  if (!buildId) {
    throw new Error('DICE: no buildId in __NEXT_DATA__');
  }

  const pages = await Promise.all(
    DICE_FILTERS.map(async (filter) => {
      try {
        const res = await fetchWithRetry(
          `https://dice.fm/_next/data/${buildId}/en/browse/${DICE_NYC_SLUG}/${filter}.json`,
          { headers: { ...headers, Accept: 'application/json' } },
        );
        if (!res.ok) return [];
        return (((await res.json()) as any)?.pageProps?.events ?? []) as any[];
      } catch {
        return [];
      }
    }),
  );

  const byId = new Map<string, any>();
  for (const event of pages.flat()) {
    if (event?.id) byId.set(event.id, event);
  }
  const records = [...byId.values()];
  // DICE NYC always has listings; zero across all filters means the shape changed
  // — fail loud so carry-forward keeps the last-good data.
  if (records.length === 0) {
    throw new Error('DICE: all filters parsed to zero events');
  }
  return { source: 'dice', records };
}

/** City Parks Foundation events via the WordPress "The Events Calendar" REST API. */
const CITYPARKS_URL = 'https://cityparksfoundation.org/wp-json/tribe/events/v1/events';
const CITYPARKS_MAX_PAGES = 6;

/**
 * Fetches upcoming City Parks Foundation events (SummerStage concerts + park
 * programming) by paging the Tribe Events REST API. The origin WAF rejects bare
 * requests, so a fuller browser header set (Accept-Language + Referer) is sent.
 */
export async function fetchCityParks(nowIso: string): Promise<RawBatch> {
  const headers = {
    'User-Agent': BROWSER_UA,
    Accept: 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    Referer: 'https://cityparksfoundation.org/events/',
  };
  const startDate = nycDateOf(nowIso);
  const records: any[] = [];

  for (let page = 1; page <= CITYPARKS_MAX_PAGES; page++) {
    const params = new URLSearchParams({ per_page: '50', page: String(page), start_date: startDate });
    const res = await fetchWithRetry(`${CITYPARKS_URL}?${params}`, { headers });
    if (!res.ok) throw new Error(`City Parks fetch failed: HTTP ${res.status}`);
    const body = (await res.json()) as any;
    const events = body?.events ?? [];
    records.push(...events);
    const total = body?.total ?? records.length;
    if (events.length === 0 || records.length >= total) break;
  }
  return { source: 'cityparks', records };
}

/** TodayTix NYC catalog (keyless JSON API; location=1 is the NYC region). */
const TODAYTIX_URL =
  'https://api.todaytix.com/api/v2/shows?location=1&limit=300&fieldset=SHOW_SUMMARY';

/**
 * Fetches the NYC show catalog from TodayTix and tags each show with today's NYC
 * date so the normalizer can clamp run-window shows to "now playing".
 */
export async function fetchTodayTix(nowIso: string): Promise<RawBatch> {
  const res = await fetchWithRetry(TODAYTIX_URL, {
    headers: { 'User-Agent': BROWSER_UA, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`TodayTix fetch failed: HTTP ${res.status}`);
  const shows = ((await res.json()) as any)?.data ?? [];
  if (!Array.isArray(shows) || shows.length === 0) {
    throw new Error('TodayTix: zero shows parsed');
  }
  const today = nycDateOf(nowIso);
  return { source: 'todaytix', records: shows.map((s: any) => ({ ...s, _today: today })) };
}

/** NYC Open Data "NYC Farmers Markets" dataset (Socrata 8vwk-6iz2). */
const GREENMARKET_DATASET_URL = 'https://data.cityofnewyork.us/resource/8vwk-6iz2.json';

/**
 * Fetches the latest-year farmers markets and expands each recurring market into
 * upcoming weekly occurrences. The dataset is an annual snapshot, so the newest
 * year is resolved dynamically rather than hardcoded.
 */
export async function fetchGreenmarket(nowIso: string): Promise<RawBatch> {
  const headers = { 'User-Agent': BROWSER_UA };

  const yearRes = await fetchWithRetry(
    `${GREENMARKET_DATASET_URL}?${new URLSearchParams({ $select: 'max(year)' })}`,
    { headers },
  );
  if (!yearRes.ok) throw new Error(`Greenmarket year fetch failed: HTTP ${yearRes.status}`);
  const latestYear = ((await yearRes.json()) as any[])?.[0]?.max_year;
  if (!latestYear) throw new Error('Greenmarket: could not determine latest year');

  const rowsRes = await fetchWithRetry(
    `${GREENMARKET_DATASET_URL}?${new URLSearchParams({ $where: `year='${latestYear}'`, $limit: '500' })}`,
    { headers },
  );
  if (!rowsRes.ok) throw new Error(`Greenmarket rows fetch failed: HTTP ${rowsRes.status}`);
  const rows = (await rowsRes.json()) as any[];

  return { source: 'nyc-greenmarket', records: greenmarketDescriptors(rows, nowIso) };
}

/** Smorgasburg special-events feed (Squarespace Events collection as JSON). */
const SMORGASBURG_EVENTS_URL = 'https://www.smorgasburg.com/new-events?format=json-pretty';

/**
 * Builds the Smorgasburg batch: the reliable recurring weekend markets (generated
 * locally) plus best-effort themed special events from the Squarespace feed. The
 * special-events fetch is wrapped so the markets always ship even if it fails.
 */
export async function fetchSmorgasburg(nowIso: string): Promise<RawBatch> {
  const records: any[] = smorgasburgMarketDescriptors(nowIso);
  try {
    const res = await fetchWithRetry(SMORGASBURG_EVENTS_URL, { headers: { 'User-Agent': BROWSER_UA } });
    if (res.ok) {
      const body = (await res.json()) as any;
      const upcoming = body?.collection?.upcoming ?? body?.upcoming ?? [];
      for (const ev of upcoming) records.push({ kind: 'special', ...ev });
    }
  } catch {
    // Keep the generated markets even when the special-events feed is unavailable.
  }
  return { source: 'smorgasburg', records };
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
    // The near-term rows are dominated by recurring permits; 1000 truncated to a
    // handful of distinct events. Pull the full upcoming window (deduped later).
    $limit: '10000',
  });

  const res = await fetchWithRetry(`${NYC_DATASET_URL}?${params}`);
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

  const res = await fetchWithRetry(`${TICKETMASTER_URL}?${params}`);
  if (!res.ok) {
    throw new Error(`Ticketmaster fetch failed: HTTP ${res.status}`);
  }
  const body = (await res.json()) as any;
  const records = body?._embedded?.events ?? [];
  return { source: 'ticketmaster', records };
}
