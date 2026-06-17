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

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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
  'culture/art',
  'culture/social',
  'culture/talks',
  'culture/wellbeing',
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
        if (!res.ok) return { failed: true, events: [] as any[] };
        return { failed: false, events: (((await res.json()) as any)?.pageProps?.events ?? []) as any[] };
      } catch {
        return { failed: true, events: [] as any[] };
      }
    }),
  );

  // If any filter failed (after retries), fail the whole source so carry-forward
  // preserves that category's last-good data instead of silently dropping it.
  if (pages.some((p) => p.failed)) {
    throw new Error('DICE: one or more browse filters failed to fetch');
  }

  const byId = new Map<string, any>();
  for (const event of pages.flatMap((p) => p.events)) {
    if (event?.id) byId.set(event.id, event);
  }
  const records = [...byId.values()];
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

/** Prospect Park Alliance events via the WordPress "The Events Calendar" REST API. */
const PROSPECTPARK_URL = 'https://www.prospectpark.org/wp-json/tribe/events/v1/events';
const PROSPECTPARK_MAX_PAGES = 6;

/**
 * Fetches upcoming Prospect Park Alliance events (Celebrate Brooklyn!, nature
 * walks, kids programming). Same Tribe REST shape as City Parks; the origin sits
 * behind Cloudflare and serves a managed challenge to bare requests, so the
 * fuller browser header set (Accept-Language + Referer) is sent — identical to
 * the City Parks fetch — to land real JSON.
 */
export async function fetchProspectPark(nowIso: string): Promise<RawBatch> {
  const headers = {
    'User-Agent': BROWSER_UA,
    Accept: 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    Referer: 'https://www.prospectpark.org/events/',
  };
  const startDate = nycDateOf(nowIso);
  const records: any[] = [];

  for (let page = 1; page <= PROSPECTPARK_MAX_PAGES; page++) {
    const params = new URLSearchParams({ per_page: '50', page: String(page), start_date: startDate });
    const res = await fetchWithRetry(`${PROSPECTPARK_URL}?${params}`, { headers });
    if (!res.ok) throw new Error(`Prospect Park fetch failed: HTTP ${res.status}`);
    const body = (await res.json()) as any;
    const events = body?.events ?? [];
    records.push(...events);
    const total = body?.total ?? records.length;
    if (events.length === 0 || records.length >= total) break;
  }
  return { source: 'prospectpark', records };
}

/** Brooklyn Public Library events (Drupal JSON:API). */
const BPL_URL = 'https://www.bklynlibrary.org/jsonapi/node/event';
const BPL_MAX_PAGES = 8; // 50/page — enough headroom for the full upcoming window

/**
 * Fetches upcoming in-person Brooklyn Public Library programs, following
 * JSON:API `links.next` so far-future programs aren't capped at one page. The
 * branch venue lives in the field_location include, so each page's includes are
 * merged into a name map and attached to every event record for the normalizer.
 */
export async function fetchBpl(nowIso: string): Promise<RawBatch> {
  const params = new URLSearchParams({
    'filter[fd][condition][path]': 'field_date.value',
    'filter[fd][condition][operator]': '>',
    'filter[fd][condition][value]': `${nycDateOf(nowIso)}T00:00:00`,
    sort: 'field_date.value',
    'page[limit]': '50',
    include: 'field_location',
  });

  const branchById = new Map<string, string>();
  const records: any[] = [];
  let next: string | null = `${BPL_URL}?${params}`;

  for (let page = 0; next && page < BPL_MAX_PAGES; page++) {
    const res = await fetchWithRetry(next, {
      headers: { 'User-Agent': BROWSER_UA, Accept: 'application/vnd.api+json' },
    });
    if (!res.ok) throw new Error(`BPL fetch failed: HTTP ${res.status}`);
    const body = (await res.json()) as any;

    for (const inc of body?.included ?? []) {
      const name = inc?.attributes?.name ?? inc?.attributes?.title;
      if (inc?.id && name) branchById.set(inc.id, name);
    }
    for (const node of body?.data ?? []) {
      records.push({ ...node, _venue: branchById.get(node?.relationships?.field_location?.data?.id) });
    }
    next = typeof body?.links?.next?.href === 'string' ? body.links.next.href : null;
  }

  if (records.length === 0) throw new Error('BPL: zero events parsed');
  return { source: 'bpl', records };
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
  // The catalog always has off-Broadway shows; zero matches means the subcategory
  // slug drifted — fail loud so carry-forward keeps the last-good theater data.
  const offBroadway = shows.filter((s: any) =>
    (s.subcategories ?? []).some((x: any) => x?.slug === 'off-broadway'),
  );
  if (offBroadway.length === 0) {
    throw new Error('TodayTix: zero off-Broadway shows (schema drift?)');
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

/** SeatGeek v2 events API — geo-radius query centered on NYC. */
const SEATGEEK_URL = 'https://api.seatgeek.com/2/events';
const SEATGEEK_MAX_PAGES = 3;

/**
 * Fetches upcoming NYC events from SeatGeek using a 20-mile geo-radius query.
 * Requires SEATGEEK_CLIENT_ID; returns an empty batch when the key is absent.
 * The borough polygon check in the normalizer filters to NYC proper.
 */
export async function fetchSeatGeek(clientId: string | undefined): Promise<RawBatch> {
  if (!clientId) return { source: 'seatgeek', records: [] };

  const records: any[] = [];
  for (let page = 1; page <= SEATGEEK_MAX_PAGES; page++) {
    const params = new URLSearchParams({
      client_id: clientId,
      lat: '40.7308',
      lon: '-73.9973',
      range: '20mi',
      per_page: '200',
      page: String(page),
      sort: 'datetime_local.asc',
    });
    const res = await fetchWithRetry(`${SEATGEEK_URL}?${params}`);
    if (!res.ok) throw new Error(`SeatGeek fetch failed: HTTP ${res.status}`);
    const body = (await res.json()) as any;
    const events = body?.events ?? [];
    records.push(...events);
    const total = body?.meta?.total ?? records.length;
    if (events.length === 0 || records.length >= total) break;
  }
  return { source: 'seatgeek', records };
}

/**
 * Eventbrite NYC browse — scrapes the public event listing pages and extracts
 * the embedded `"events":[...]` array from the server-rendered HTML. No API
 * key required; the events are the same ones shown on eventbrite.com.
 *
 * A single browse lane plateaus quickly (each deeper page repeats earlier
 * results), so we sweep several lanes — one per borough plus a handful of
 * city-wide category lanes — and dedup by event id into one batch. Each lane
 * surfaces a different slice of the catalog, multiplying coverage far beyond
 * what paging the generic front page alone would yield.
 */
const EVENTBRITE_BASE = 'https://www.eventbrite.com/d';
const EVENTBRITE_LANES: string[] = [
  // Per-borough, all categories.
  'ny--new-york/events',
  'ny--brooklyn/events',
  'ny--queens/events',
  'ny--bronx/events',
  // City-wide category lanes deepen coverage for our main taxonomy buckets.
  'ny--new-york/music--events',
  'ny--new-york/food-and-drink--events',
  'ny--new-york/arts--events',
  'ny--new-york/film-and-media--events',
  'ny--new-york/sports-and-fitness--events',
  'ny--new-york/family-and-education--events',
];
const EVENTBRITE_MAX_PAGES = 8; // up to 8 pages per lane (breaks early when dry)
// Require most lanes to succeed. A more-degraded run is a partial catalog, not an
// authoritative refresh, so we treat it as a failure (below) and let carry-forward
// restore last-good Eventbrite data instead of publishing a fraction of it.
const EVENTBRITE_MIN_LANES = 7;
// Gentle pacing between same-host requests to avoid tripping Eventbrite's 429s
// during the sequential sweep.
const EVENTBRITE_REQ_DELAY_MS = 250;

/**
 * Extracts top-level JSON objects from the best `"events":[...]` array
 * embedded in Eventbrite's server-rendered HTML. The page embeds several
 * arrays (carousels, recommendations, etc.); we pick the largest one that
 * contains real event listings (items with a primary_venue).
 */
function parseEventbriteHtml(html: string): any[] {
  const marker = '"events":[{';
  let searchFrom = 0;
  let best: any[] = [];

  while (searchFrom < html.length) {
    const startIdx = html.indexOf(marker, searchFrom);
    if (startIdx === -1) break;
    searchFrom = startIdx + 1;

    const raw = html.slice(startIdx + '"events":['.length);
    const events: any[] = [];
    let depth = 0;
    let objStart = 0;

    for (let i = 0; i < raw.length; i++) {
      const c = raw[i];
      if (c === '{') {
        if (depth === 0) objStart = i;
        depth++;
      } else if (c === '}') {
        depth--;
        if (depth === 0) {
          try {
            events.push(JSON.parse(raw.slice(objStart, i + 1)));
          } catch {
            // Skip malformed individual event records.
          }
        }
      } else if (c === ']' && depth === 0) {
        break;
      }
    }

    // Keep the array that looks most like real listings (has the most items
    // with a primary_venue, which carousel/image arrays don't have).
    const realCount = events.filter((e) => e?.primary_venue || e?.name).length;
    const bestReal = best.filter((e) => e?.primary_venue || e?.name).length;
    if (realCount > bestReal) best = events;
  }

  return best;
}

/**
 * Pages one Eventbrite browse lane, appending newly-seen events to `records`.
 * Breaks as soon as a page yields no events we haven't already collected (the
 * lane has gone dry / started repeating). Returns the number of fresh events.
 */
async function scrapeEventbriteLane(
  lanePath: string,
  headers: Record<string, string>,
  seen: Set<string>,
  records: any[],
): Promise<number> {
  const base = `${EVENTBRITE_BASE}/${lanePath}/`;
  let added = 0;
  for (let page = 1; page <= EVENTBRITE_MAX_PAGES; page++) {
    if (page > 1) await sleep(EVENTBRITE_REQ_DELAY_MS);
    const url = page === 1 ? base : `${base}?page=${page}`;
    const res = await fetchWithRetry(url, { headers });
    if (!res.ok) throw new Error(`Eventbrite lane ${lanePath} failed: HTTP ${res.status}`);
    const events = parseEventbriteHtml(await res.text());
    if (events.length === 0) break;

    let fresh = 0;
    for (const e of events) {
      const id = String(e.eid ?? e.eventbrite_event_id ?? '');
      if (id && !seen.has(id)) {
        seen.add(id);
        records.push(e);
        fresh++;
      }
    }
    added += fresh;
    if (fresh === 0) break; // Reached repeat content — no new events this page.
  }
  return added;
}

/**
 * Fetches upcoming NYC events from Eventbrite's public browse pages. The
 * v3 API's /events/search/ endpoint is unavailable on the free tier, so we
 * scrape the server-rendered HTML instead (same data, no API key needed).
 *
 * Each lane (borough or category) is swept independently and deduped into a
 * single batch. A single bad lane is tolerated, but a run where too many lanes
 * failed — or where every lane parsed to zero (markup drift) — is treated as a
 * source failure so carry-forward restores last-good data rather than
 * publishing a partial or empty catalog as if it were authoritative.
 */
export async function fetchEventbrite(_nowIso: string): Promise<RawBatch> {
  const headers = {
    'User-Agent': BROWSER_UA,
    Accept: 'text/html',
    'Accept-Language': 'en-US,en;q=0.9',
  };

  const seen = new Set<string>();
  const records: any[] = [];
  const laneCounts: string[] = [];
  const failedLanes: string[] = [];

  for (const lane of EVENTBRITE_LANES) {
    try {
      const added = await scrapeEventbriteLane(lane, headers, seen, records);
      laneCounts.push(`${lane}:${added}`);
    } catch {
      // A single bad lane (e.g. a category slug that 404s) shouldn't sink the
      // whole source on its own; we account for it in the thresholds below.
      failedLanes.push(lane);
    }
    await sleep(EVENTBRITE_REQ_DELAY_MS);
  }

  const lanesOk = laneCounts.length;
  console.log(
    `  eventbrite: ${lanesOk}/${EVENTBRITE_LANES.length} lanes ok` +
      (failedLanes.length ? `, failed=[${failedLanes.join(', ')}]` : '') +
      `, counts=[${laneCounts.join(', ')}]`,
  );

  // Every lane parsed to zero events. Either a wholesale outage or a markup
  // change that moved the embedded JSON — fail loud so carry-forward republishes
  // last-good Eventbrite data instead of blanking the source.
  if (records.length === 0) {
    throw new Error('Eventbrite: every lane parsed to zero events (outage or markup drift)');
  }
  // Too many lanes failed: what survived is a partial catalog, not an
  // authoritative refresh. Fail so carry-forward preserves the dropped events.
  if (lanesOk < EVENTBRITE_MIN_LANES) {
    throw new Error(`Eventbrite: only ${lanesOk}/${EVENTBRITE_LANES.length} lanes succeeded`);
  }
  return { source: 'eventbrite', records };
}

/** Resident Advisor GraphQL endpoint — NYC (area 43) club and concert listings. */
const RA_GRAPHQL_URL = 'https://ra.co/graphql';
const RA_NYC_AREA_ID = 8; // RA's stable ID for the New York City area
const RA_MAX_PAGES = 3;
const RA_PAGE_SIZE = 50;

const RA_QUERY = `
  query EventListings($filters: FilterInputDtoInput, $pageSize: Int, $page: Int, $sort: SortInputDtoInput) {
    eventListings(
      filters: $filters
      pageSize: $pageSize
      page: $page
      sort: $sort
    ) {
      data {
        id
        event {
          id
          title
          startTime
          endTime
          contentUrl
          venue {
            id
            name
            address
            location {
              latitude
              longitude
            }
          }
        }
      }
      totalResults
    }
  }
`;

/**
 * Fetches upcoming NYC club/concert listings from Resident Advisor's unofficial
 * GraphQL API. No API key required; the NYC area ID (43) is stable.
 */
export async function fetchResidentAdvisor(nowIso: string): Promise<RawBatch> {
  const headers = {
    'User-Agent': BROWSER_UA,
    'Content-Type': 'application/json',
    Referer: 'https://ra.co',
  };

  const startDate = nowIso.slice(0, 10);
  const endDate = new Date(new Date(nowIso).getTime() + 30 * 24 * 60 * 60 * 1000)
    .toISOString().slice(0, 10);

  const records: any[] = [];
  for (let page = 1; page <= RA_MAX_PAGES; page++) {
    const res = await fetchWithRetry(RA_GRAPHQL_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        query: RA_QUERY,
        variables: {
          filters: {
            areas: { eq: RA_NYC_AREA_ID },
            listingDate: { gte: startDate, lte: endDate },
          },
          sort: { listingDate: { order: 'ASCENDING' } },
          pageSize: RA_PAGE_SIZE,
          page,
        },
      }),
    });
    if (!res.ok) throw new Error(`Resident Advisor fetch failed: HTTP ${res.status}`);
    const body = (await res.json()) as any;
    const listings = body?.data?.eventListings?.data ?? [];
    records.push(...listings);
    const total = body?.data?.eventListings?.totalResults ?? 0;
    if (listings.length === 0 || records.length >= total) break;
  }
  return { source: 'resident-advisor', records };
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
    // All four boroughs (Brooklyn/Bronx/Queens venues use their own city name,
    // not "New York"); the normalizer drops anything outside them by coordinates.
    city: 'New York,Brooklyn,Bronx,Queens',
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
