import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { Event } from '../domain/event';
import { assembleEvents, type RawBatch } from './assemble';
import { carryForwardEvents } from './carryForward';
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
  fetchNycOpenData,
  fetchParks,
  fetchResidentAdvisor,
  fetchSeatGeek,
  fetchSmalls,
  fetchSmorgasburg,
  fetchTicketmaster,
  fetchTodayTix,
  fetchVillageVanguard,
} from './sources';

const OUTPUT_PATH = 'public/data/events.json';

/** Reads the previously-published events, or [] if there is no prior file. */
async function readPreviousEvents(): Promise<Event[]> {
  if (!existsSync(OUTPUT_PATH)) return [];
  try {
    const payload = JSON.parse(await readFile(OUTPUT_PATH, 'utf8'));
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
      settle('eventbrite', fetchEventbrite(process.env.EVENTBRITE_API_KEY, nowIso)),
      settle('resident-advisor', fetchResidentAdvisor(nowIso)),
    ])
  ).filter((b): b is RawBatch => b !== null);

  const succeededSources = batches.map((b) => b.source);
  const fresh = assembleEvents(batches);

  // Carry forward last-good events for any source that failed this run, so a
  // single source's flakiness doesn't make its events blink out of the dashboard.
  const previous = await readPreviousEvents();
  const events = carryForwardEvents(fresh, previous, succeededSources, nowIso);

  const carried = events.length - fresh.length;
  if (carried > 0) {
    const succeeded = new Set<string>(succeededSources);
    const downSources = [...new Set(previous.map((e) => e.source))].filter((s) => !succeeded.has(s));
    console.warn(`Carried forward ${carried} events from down source(s): ${downSources.join(', ')}`);
  }

  // Never replace a good dataset with nothing: if every source failed and there
  // was nothing to carry forward, keep the existing file rather than blanking it.
  if (events.length === 0 && existsSync(OUTPUT_PATH)) {
    console.warn('No events produced and nothing to carry forward — keeping existing data.');
    return;
  }

  // Geocode venue addresses for events without coordinates so they appear on the
  // map and get proper neighborhoods. No-op without a key; subsequent runs skip
  // any venue already geocoded (lat/lon carries forward).
  const withCoords = await enrichWithGeocode(events, process.env.GOOGLE_MAPS_API_KEY);
  if (process.env.GOOGLE_MAPS_API_KEY) {
    const geocoded = withCoords.filter((e) => e.lat != null).length - events.filter((e) => e.lat != null).length;
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
  const enriched = await enrichWithSpotify(withWeather, token, previous);
  if (token) {
    console.log(`  spotify: ${enriched.filter((e) => e.image).length} music events have an image`);
  }

  const payload = {
    generatedAt: nowIso,
    count: enriched.length,
    sources: summarizeSources(enriched, succeededSources),
    events: enriched,
  };

  await mkdir(dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, JSON.stringify(payload, null, 2) + '\n');
  console.log(`Wrote ${events.length} events to ${OUTPUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
