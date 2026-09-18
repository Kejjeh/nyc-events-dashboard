import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { Event } from '../domain/event';
import { runPipeline } from './runPipeline';
import { settleSource, skippedSource, type SourceOutcome } from './sourceOutcome';
import { getSpotifyToken } from './spotifyEnrich';
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

// SerpAPI's free tier is 250 searches/month, and Ticketmaster/JamBase are deep
// multi-state pulls. The pipeline runs on every push (not just the 2x/day cron),
// so frequent dev pushes would burn the budget. On push runs these three are
// skipped — recorded as `skipped`, never as a successful empty fetch — so
// carry-forward keeps their last-good events and the health footer says why.
const PUSH_SKIP_REASON = 'not called on push runs (API cost control)';

/** Fetches every source and classifies each result; one failure never sinks the run. */
function collectSources(nowIso: string, onPush: boolean): Promise<SourceOutcome[]> {
  return Promise.all<SourceOutcome>([
    settleSource('nyc-open-data', fetchNycOpenData(nowIso)),
    settleSource('nyc-parks', fetchParks()),
    settleSource('smallslive', fetchSmalls(nowIso)),
    settleSource('village-vanguard', fetchVillageVanguard()),
    settleSource('dice', fetchDice()),
    settleSource('smorgasburg', fetchSmorgasburg(nowIso)),
    settleSource('nyc-greenmarket', fetchGreenmarket(nowIso)),
    settleSource('todaytix', fetchTodayTix(nowIso)),
    settleSource('cityparks', fetchCityParks(nowIso)),
    settleSource('bpl', fetchBpl(nowIso)),
    settleSource('seatgeek', fetchSeatGeek(process.env.SEATGEEK_CLIENT_ID)),
    settleSource('songkick', fetchSongkick(process.env.SONGKICK_API_KEY, nowIso)),
    settleSource('eventbrite', fetchEventbrite(nowIso)),
    settleSource('resident-advisor', fetchResidentAdvisor(nowIso)),
    ...(onPush
      ? [
          skippedSource('ticketmaster', PUSH_SKIP_REASON),
          skippedSource('serpapi', PUSH_SKIP_REASON),
          skippedSource('jambase', PUSH_SKIP_REASON),
        ]
      : [
          settleSource('ticketmaster', fetchTicketmaster(process.env.TICKETMASTER_API_KEY, nowIso)),
          settleSource('serpapi', fetchSerpApi(process.env.SERPAPI_KEY, nowIso)),
          settleSource('jambase', fetchJamBase(process.env.JAMBASE_API_KEY, nowIso)),
        ]),
  ]);
}

async function main(): Promise<void> {
  const nowIso = new Date().toISOString();
  console.log(`Refreshing events at ${nowIso}`);

  const onPush = process.env.GITHUB_EVENT_NAME === 'push';
  if (onPush) console.log('  (push run: skipping high-volume Ticketmaster + SerpAPI + JamBase; carrying their events forward)');

  const [outcomes, previousLive, previousArchive] = await Promise.all([
    collectSources(nowIso, onPush),
    readPreviousEvents(OUTPUT_PATH),
    readPreviousEvents(ARCHIVE_PATH),
  ]);

  // The Spotify token needs credentials, not events, so fetch it up front.
  const spotifyToken = await getSpotifyToken(
    process.env.SPOTIFY_CLIENT_ID,
    process.env.SPOTIFY_CLIENT_SECRET,
  );

  const result = await runPipeline({
    nowIso,
    onPush,
    outcomes,
    previousLive,
    previousArchive,
    hasExistingOutput: existsSync(OUTPUT_PATH),
    googleMapsKey: process.env.GOOGLE_MAPS_API_KEY,
    openWeatherKey: process.env.OPENWEATHER_API_KEY,
    spotifyToken,
    log: {
      info: (m) => console.log(m),
      warn: (m) => console.warn(m),
    },
  });

  if (result.status === 'kept-existing') return;

  await mkdir(dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, JSON.stringify(result.live, null, 2) + '\n');
  await writeFile(ARCHIVE_PATH, JSON.stringify(result.archive, null, 2) + '\n');
  console.log(
    `Wrote ${result.live.count} live events to ${OUTPUT_PATH} + ${result.archive.count} archived to ${ARCHIVE_PATH}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
