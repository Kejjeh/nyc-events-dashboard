import type { Event, SourceStatus } from '../domain/event';
import { assembleEvents } from './assemble';
import { carryForwardEvents } from './carryForward';
import { deduplicateEvents } from './dedup';
import { partitionEvents, eventCity, eventState } from './partition';
import { summarizeSources } from './sourceSummary';
import {
  authoritativeSources,
  fetchedBatches,
  type SourceOutcome,
} from './sourceOutcome';
import {
  runEnrichmentChain,
  liveEnrichmentStages,
  archiveEnrichmentStages,
  type EnrichmentContext,
  type EnrichmentStage,
  type StageReport,
} from './enrichmentChain';

/** One state's cities and their event counts, for the UI's location selector. */
export interface PlaceGroup {
  state: string;
  cities: { name: string; count: number }[];
}

/** The `public/data/events.json` payload. */
export interface LivePayload {
  generatedAt: string;
  count: number;
  archivedCount: number;
  places: PlaceGroup[];
  sources: SourceStatus[];
  events: Event[];
}

/** The `public/data/archive.json` payload. */
export interface ArchivePayload {
  generatedAt: string;
  count: number;
  events: Event[];
}

/** Where the run's narration goes; console in production, silent in tests. */
export interface PipelineLogger {
  info(message: string): void;
  warn(message: string): void;
}

const SILENT_LOGGER: PipelineLogger = { info: () => {}, warn: () => {} };

/**
 * Everything the orchestration needs from the outside world. `run.ts` supplies
 * the real clock, the real fetchers and the real files; a test supplies fixtures,
 * so the ordering below (assemble → carry-forward → dedup → partition → enrich)
 * can be exercised offline against the same code production runs.
 */
export interface PipelineDeps {
  nowIso: string;
  /** Push runs skip the expensive sources and the costly enrichment stages. */
  onPush: boolean;
  /** Per-source results, already classified into ok / missing-key / skipped / error. */
  outcomes: SourceOutcome[];
  /** Events from the previous `events.json` (also the Spotify enrichment seed). */
  previousLive: Event[];
  /** Events from the previous `archive.json`. */
  previousArchive: Event[];
  /** True when a previous `events.json` exists on disk and must not be blanked. */
  hasExistingOutput: boolean;
  googleMapsKey?: string;
  openWeatherKey?: string;
  spotifyToken?: string | null;
  liveStages?: EnrichmentStage[];
  archiveStages?: EnrichmentStage[];
  log?: PipelineLogger;
}

/**
 * What the run produced. `status: 'kept-existing'` means the run declined to
 * publish (nothing fresh, nothing banked) and the caller must leave the files
 * on disk untouched.
 */
export type PipelineResult =
  | { status: 'kept-existing' }
  | {
      status: 'published';
      live: LivePayload;
      archive: ArchivePayload;
      /** How many events were carried forward from non-authoritative sources. */
      carried: number;
    };

/**
 * The refresh, minus all I/O: classified source outcomes in, published payloads
 * out.
 *
 * The load-bearing rule lives in one line — `authoritativeSources(outcomes)`.
 * Only a source that actually fetched (`health: 'ok'`) is authoritative, so only
 * it can replace what it previously banked. A source with no credential, one
 * skipped to save quota, and one whose fetch threw all keep their last-good
 * events; a source that fetched and genuinely returned zero drops its own events
 * and shows up as a fresh row with count 0, which is how a silently-broken
 * parser stays visible.
 */
export async function runPipeline(deps: PipelineDeps): Promise<PipelineResult> {
  const {
    nowIso,
    onPush,
    outcomes,
    previousLive,
    previousArchive,
    hasExistingOutput,
    liveStages = liveEnrichmentStages,
    archiveStages = archiveEnrichmentStages,
    log = SILENT_LOGGER,
  } = deps;

  for (const outcome of outcomes) {
    const detail = outcome.detail ? ` — ${outcome.detail}` : '';
    if (outcome.health === 'ok') log.info(`  ${outcome.source}: ${outcome.detail ?? 'ok'}`);
    else log.warn(`  ${outcome.source}: ${outcome.health.toUpperCase()}${detail}`);
  }

  const succeededSources = authoritativeSources(outcomes);
  const fresh = assembleEvents(fetchedBatches(outcomes));

  // Carry forward last-good events for any source that was NOT authoritative this
  // run, over the FULL superset (live board + offline archive) so banked
  // far-future / other-city events survive a lapsed source (e.g. the JamBase
  // trial) even though only NYC near-term is displayed.
  const previousAll = [...previousLive, ...previousArchive];
  const withCarry = carryForwardEvents(fresh, previousAll, succeededSources, nowIso);

  const carried = withCarry.length - fresh.length;
  if (carried > 0) {
    const succeeded = new Set<string>(succeededSources);
    const downSources = [...new Set(previousAll.map((e) => e.source))].filter((s) => !succeeded.has(s));
    log.warn(`Carried forward ${carried} events from non-authoritative source(s): ${downSources.join(', ')}`);
  }

  // Collapse cross-source duplicates (same show on Ticketmaster + SeatGeek, etc.)
  const superset = deduplicateEvents(withCarry);
  const dedupRemoved = withCarry.length - superset.length;
  if (dedupRemoved > 0) log.info(`  dedup: collapsed ${dedupRemoved} cross-source duplicates`);

  // Never replace a good dataset with nothing: if every source failed and there
  // was nothing to carry forward, keep the existing files rather than blanking them.
  if (superset.length === 0 && hasExistingOutput) {
    log.warn('No events produced and nothing to carry forward — keeping existing data.');
    return { status: 'kept-existing' };
  }

  // Split into the live board (live cities, near-term) and the offline archive
  // (deep future + other cities). Enrichment is expensive and NYC-focused, so it
  // only runs over the live set; archive events keep whatever their normalizer
  // produced (JamBase already ships coordinates + images) until they promote.
  const { live, archive } = partitionEvents(superset, nowIso);
  log.info(`  partition: ${live.length} live, ${archive.length} archived`);

  const enrichCtx: EnrichmentContext = {
    googleMapsKey: deps.googleMapsKey,
    openWeatherKey: deps.openWeatherKey,
    spotifyToken: deps.spotifyToken ?? null,
    previousLive,
    onPush,
  };
  const logStage = (scope: string) => (r: StageReport) => {
    if (r.skipped) log.info(`  ${scope} ${r.name}: skipped (push run)`);
    else if (r.changed > 0) log.info(`  ${scope} ${r.name}: ${r.changed} events updated`);
  };

  const enriched = await runEnrichmentChain(live, liveStages, enrichCtx, logStage('live'));
  const archiveOut = await runEnrichmentChain(archive, archiveStages, enrichCtx, logStage('archive'));

  return {
    status: 'published',
    carried,
    live: {
      generatedAt: nowIso,
      count: enriched.length,
      archivedCount: archiveOut.length,
      places: placesOf([...enriched, ...archiveOut]),
      sources: summarizeSources(enriched, outcomes),
      events: enriched,
    },
    archive: { generatedAt: nowIso, count: archiveOut.length, events: archiveOut },
  };
}

/**
 * State → cities present across the superset, so the UI's location selector
 * knows what's available without loading the archive. NY first; cities sorted
 * by count descending.
 */
function placesOf(events: Event[]): PlaceGroup[] {
  const byState = new Map<string, Map<string, number>>();
  for (const e of events) {
    const st = eventState(e);
    const ci = eventCity(e);
    if (!byState.has(st)) byState.set(st, new Map<string, number>());
    const m = byState.get(st)!;
    m.set(ci, (m.get(ci) ?? 0) + 1);
  }
  return [...byState.entries()]
    .map(([state, cityMap]) => ({
      state,
      cities: [...cityMap.entries()]
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count),
    }))
    .sort((a, b) => (a.state === 'NY' ? -1 : b.state === 'NY' ? 1 : a.state.localeCompare(b.state)));
}
