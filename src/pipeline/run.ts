import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { Event } from '../domain/event';
import { assembleEvents, type RawBatch } from './assemble';
import { carryForwardEvents } from './carryForward';
import { deduplicateEvents } from './dedup';
import { partitionEvents, eventCity } from './partition';
import { summarizeSources } from './sourceSummary';
import { enrichWithSpotify, getSpotifyToken } from './spotifyEnrich';
import { enrichWithWeather } from './weatherEnrich';
import { enrichWithGeocode } from './geocodeEnrich';
import { enrichWithNeighborhoods } from './neighborhoodEnrich';
import {
  fetchBpl,
  fetchCityParks,
  fetchDice,
  fetchEventbrite,
  fetchGreenmarket,
  fetchJamBase,
  fetchNycOpenData,
  fetchParks,
  fetchResidentAdvisor,
  fetchSeatGeek,
  fetchSerpApi,
  fetchSmalls,
  fetchSmorgasburg,
  fetchSongkick,
  fetchTicketmaster,
  fetchTodayTix,
  fetchVillageVanguard,
} from './sources';

const OUTPUT_PATH = 'public/data/events.json';
const ARCHIVE_PATH = 'public/data/archive.json';

/** Reads previously-published events from a data file, or [] if absent/unreadable. */
async function readPreviousEvents(path: string): Promise<Event[]> {
  if (!existsSync(path)) return [];
  try {
    const payload = JSON.parse(await readFile(path, 'utf8'));
    return Array.isArray(payload.events) ? payload.events : [];
  } catch {
    return [];
  }
}

async function settle(label: string, p: Promise<RawBatch>): Promise<RawBatch | null> {
  try {
    const batch = await p;
    console.log(`  ${label}: ${batch.records.length} raw records`);
    return batch;
  } catch (err) {
    // One failing source must not sink the whole refresh.
    console.error(`  ${label}: FAILED — ${(err as Error).message}`);
    return null;
  }
}

async function main(): Promise<void> {
  const nowIso = new Date().toISOString();
  console.log(`Refreshing events at ${nowIso}`);

  // SerpAPI's free tier is 250 searches/month. The pipeline runs on every push
  // (not just the 2x/day cron), so frequent dev pushes would burn the budget.
  // Only spend quota on scheduled cron + manual dispatch; on push runs SerpAPI is
  // skipped entirely (absent from succeededSources) so carry-forward keeps its
  // last-good events. A local run (no GITHUB_EVENT_NAME) is treated as eligible.
  const onPush = process.env.GITHUB_EVENT_NAME === 'push';
  if (onPush) console.log('  (push run: skipping quota-limited SerpAPI; carrying its events forward)');

  const batches = (
    await Promise.all([
      settle('nyc-open-data', fetchNycOpenData(nowIso)),
      settle('nyc-parks', fetchParks()),
      settle('smallslive', fetchSmalls(nowIso)),
      settle('village-vanguard', fetchVillageVanguard()),
      settle('dice', fetchDice()),
      settle('smorgasburg', fetchSmorgasburg(nowIso)),
      settle('nyc-greenmarket', fetchGreenmarket(nowIso)),
      settle('todaytix', fetchTodayTix(nowIso)),
      settle('cityparks', fetchCityParks(nowIso)),
      settle('bpl', fetchBpl(nowIso)),
      settle('ticketmaster', fetchTicketmaster(process.env.TICKETMASTER_API_KEY)),
      settle('seatgeek', fetchSeatGeek(process.env.SEATGEEK_CLIENT_ID)),
      settle('songkick', fetchSongkick(process.env.SONGKICK_API_KEY, nowIso)),
      settle('jambase', fetchJamBase(process.env.JAMBASE_API_KEY, nowIso)),
      settle('eventbrite', fetchEventbrite(nowIso)),
      settle('resident-advisor', fetchResidentAdvisor(nowIso)),
      ...(onPush ? [] : [settle('serpapi', fetchSerpApi(process.env.SERPAPI_KEY, nowIso))]),
    ])
  ).filter((b): b is RawBatch => b !== null);

  const succeededSources = batches.map((b) => b.source);
  const fresh = assembleEvents(batches);

  // Carry forward last-good events for any source that failed this run, over the
  // FULL superset (live board + offline archive) so banked far-future / other-city
  // events survive a lapsed source (e.g. the JamBase trial) even though only NYC
  // near-term is displayed.
  const previousLive = await readPreviousEvents(OUTPUT_PATH);
  const previousArchive = await readPreviousEvents(ARCHIVE_PATH);
  const previousAll = [...previousLive, ...previousArchive];
  const withCarry = carryForwardEvents(fresh, previousAll, succeededSources, nowIso);

  const carried = withCarry.length - fresh.length;
  if (carried > 0) {
    const succeeded = new Set<string>(succeededSources);
    const downSources = [...new Set(previousAll.map((e) => e.source))].filter((s) => !succeeded.has(s));
    console.warn(`Carried forward ${carried} events from down source(s): ${downSources.join(', ')}`);
  }

  // Collapse cross-source duplicates (same show on Ticketmaster + SeatGeek, etc.)
  const superset = deduplicateEvents(withCarry);
  const dedupRemoved = withCarry.length - superset.length;
  if (dedupRemoved > 0) console.log(`  dedup: collapsed ${dedupRemoved} cross-source duplicates`);

  // Never replace a good dataset with nothing: if every source failed and there
  // was nothing to carry forward, keep the existing files rather than blanking them.
  if (superset.length === 0 && existsSync(OUTPUT_PATH)) {
    console.warn('No events produced and nothing to carry forward — keeping existing data.');
    return;
  }

  // Split into the live board (live cities, near-term) and the offline archive
  // (deep future + other cities). Enrichment is expensive and NYC-focused, so it
  // only runs over the live set; archive events keep whatever their normalizer
  // produced (JamBase already ships coordinates + images) until they promote.
  const { live, archive } = partitionEvents(superset, nowIso);
  console.log(`  partition: ${live.length} live, ${archive.length} archived`);

  // Geocode venue addresses for live events without coordinates so they appear on
  // the map and get proper neighborhoods. No-op without a key; subsequent runs
  // skip any venue already geocoded (lat/lon carries forward).
  const withCoords = await enrichWithGeocode(live, process.env.GOOGLE_MAPS_API_KEY);
  if (process.env.GOOGLE_MAPS_API_KEY) {
    const geocoded = withCoords.filter((e) => e.lat != null).length - live.filter((e) => e.lat != null).length;
    if (geocoded > 0) console.log(`  geocode: +${geocoded} venues resolved`);
  }

  // Replace NTA census neighborhood names with community-recognized names from
  // Google Maps reverse geocoding. Results are cached in neighborhood-cache.json
  // so each unique lat/lon is only ever looked up once across all pipeline runs.
  const withNeighborhoods = await enrichWithNeighborhoods(withCoords, process.env.GOOGLE_MAPS_API_KEY);
  if (process.env.GOOGLE_MAPS_API_KEY) {
    const overridden = withNeighborhoods.filter(
      (e, i) => e.neighborhood !== withCoords[i].neighborhood,
    ).length;
    if (overridden > 0) console.log(`  neighborhoods: ${overridden} events updated with Google Maps names`);
  }

  // Attach near-term weather forecast to outdoor events (parks, markets) within
  // the next 5 days. Stale weather is stripped on events now outside the window.
  const withWeather = await enrichWithWeather(withNeighborhoods, process.env.OPENWEATHER_API_KEY);
  if (process.env.OPENWEATHER_API_KEY) {
    const weatherCount = withWeather.filter((e) => e.weather).length;
    if (weatherCount > 0) console.log(`  weather: ${weatherCount} outdoor events have a forecast`);
  }

  // Enrich music events with a Spotify artist image/link (no-op without creds);
  // seed from the previous file so recurring artists aren't re-searched.
  const token = await getSpotifyToken(
    process.env.SPOTIFY_CLIENT_ID,
    process.env.SPOTIFY_CLIENT_SECRET,
  );
  const enriched = await enrichWithSpotify(withWeather, token, previousLive);
  if (token) {
    console.log(`  spotify: ${enriched.filter((e) => e.image).length} music events have an image`);
  }

  // Cities present across the whole superset, so the UI's city selector knows
  // what's available (the non-NYC ones live in archive.json, lazy-loaded on pick).
  const cities = [...new Set([...live, ...archive].map(eventCity))].sort((a, b) =>
    a === 'New York' ? -1 : b === 'New York' ? 1 : a.localeCompare(b),
  );

  const payload = {
    generatedAt: nowIso,
    count: enriched.length,
    archivedCount: archive.length,
    cities,
    sources: summarizeSources(enriched, succeededSources),
    events: enriched,
  };

  await mkdir(dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, JSON.stringify(payload, null, 2) + '\n');
  await writeFile(
    ARCHIVE_PATH,
    JSON.stringify({ generatedAt: nowIso, count: archive.length, events: archive }, null, 2) + '\n',
  );
  console.log(
    `Wrote ${enriched.length} live events to ${OUTPUT_PATH} + ${archive.length} archived to ${ARCHIVE_PATH}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
