import { refresh } from './refresh';
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

/**
 * The composition root: real clock, real env, real fetchers, real files.
 * Everything else — snapshot validation, the pipeline, the write — is in
 * `refresh.ts`, which is what the tests drive with a faked filesystem.
 */
async function main(): Promise<void> {
  const nowIso = new Date().toISOString();
  console.log(`Refreshing events at ${nowIso}`);

  const onPush = process.env.GITHUB_EVENT_NAME === 'push';
  if (onPush) console.log('  (push run: skipping high-volume Ticketmaster + SerpAPI + JamBase; carrying their events forward)');

  await refresh({
    nowIso,
    onPush,
    collect: collectSources,
    keys: {
      googleMaps: process.env.GOOGLE_MAPS_API_KEY,
      openWeather: process.env.OPENWEATHER_API_KEY,
      // Needs credentials, not events; fetched once the snapshots have been validated.
      spotifyToken: () => getSpotifyToken(process.env.SPOTIFY_CLIENT_ID, process.env.SPOTIFY_CLIENT_SECRET),
    },
    log: {
      info: (m) => console.log(m),
      warn: (m) => console.warn(m),
    },
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
