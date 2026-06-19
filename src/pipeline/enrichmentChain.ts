import type { Event } from '../domain/event';
import { enrichWithGeocode } from './geocodeEnrich';
import { enrichWithNeighborhoods } from './neighborhoodEnrich';
import { enrichWithWeather } from './weatherEnrich';
import { enrichWithSpotify } from './spotifyEnrich';

/**
 * Everything the enrichment stages need from the outside world: API keys, the
 * Spotify bearer token, the previously-published live events (Spotify seeds from
 * them), and whether this is a push run (cheap-only) versus a full cron run.
 */
export interface EnrichmentContext {
  googleMapsKey: string | undefined;
  openWeatherKey: string | undefined;
  spotifyToken: string | null;
  previousLive: Event[];
  onPush: boolean;
}

/** One ordered step in an enrichment chain: events in, events out. */
export interface EnrichmentStage {
  name: string;
  /** Skip this stage on push runs to spare API quota; the cron run does it. */
  skipOnPush?: boolean;
  run(events: Event[], ctx: EnrichmentContext): Promise<Event[]>;
}

/** What a stage did, reported to the optional progress callback for logging. */
export interface StageReport {
  name: string;
  /** How many events the stage replaced (by reference); 0 for skipped/no-op. */
  changed: number;
  skipped: boolean;
}

/**
 * Runs an ordered list of enrichment stages, threading each stage's output into
 * the next. The stage list and its order are the chain's data, so the same
 * runner drives the real enrichers in production and fakes in tests.
 */
export async function runEnrichmentChain(
  events: Event[],
  stages: EnrichmentStage[],
  ctx: EnrichmentContext,
  onStage: (report: StageReport) => void = () => {},
): Promise<Event[]> {
  let current = events;
  for (const stage of stages) {
    if (stage.skipOnPush && ctx.onPush) {
      onStage({ name: stage.name, changed: 0, skipped: true });
      continue;
    }
    const before = current;
    current = await stage.run(current, ctx);
    const changed = current.reduce((n, e, i) => (e === before[i] ? n : n + 1), 0);
    onStage({ name: stage.name, changed, skipped: false });
  }
  return current;
}

/**
 * The live board's enrichment chain, in dependency order: geocoding must run
 * before neighborhoods (fresh coordinates unlock a neighborhood lookup), and
 * Spotify seeds from the previously-published live set. Every live stage runs
 * on every build — the live board is small and must stay fully enriched.
 */
export const liveEnrichmentStages: EnrichmentStage[] = [
  { name: 'geocode', run: (events, ctx) => enrichWithGeocode(events, ctx.googleMapsKey) },
  { name: 'neighborhood', run: (events, ctx) => enrichWithNeighborhoods(events, ctx.googleMapsKey) },
  { name: 'weather', run: (events, ctx) => enrichWithWeather(events, ctx.openWeatherKey) },
  {
    name: 'spotify',
    run: (events, ctx) => enrichWithSpotify(events, ctx.spotifyToken, ctx.previousLive),
  },
];

/**
 * The offline archive only needs neighborhoods (for the city → neighborhood
 * drill beyond NYC). That is thousands of reverse-geocodes the first time, so
 * it is skipped on push runs — the shared cache is filled by cron/manual runs
 * and carried forward to keep pushes fast.
 */
export const archiveEnrichmentStages: EnrichmentStage[] = [
  {
    name: 'neighborhood',
    skipOnPush: true,
    run: (events, ctx) => enrichWithNeighborhoods(events, ctx.googleMapsKey),
  },
];
