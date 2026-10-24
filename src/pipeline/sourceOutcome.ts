import type { RawBatch, SourceName } from './assemble';

/**
 * Why a source did or didn't contribute records this run. The pipeline must keep
 * these four apart: only `ok` is authoritative, so only `ok` replaces a source's
 * previously-banked events (see carryForward.ts).
 *
 * - `ok`          — fetched successfully. Its records are the truth for this run,
 *                   *including* a genuine zero (a silently-broken parser must stay
 *                   visible rather than be masked by yesterday's data).
 * - `missing-key` — the credential isn't in the environment, so the source was
 *                   never asked. Says nothing about the events it banked.
 * - `skipped`     — deliberately not called this run to control cost/quota
 *                   (the push-run gate on Ticketmaster/SerpAPI/JamBase).
 * - `error`       — the fetch threw: HTTP failure, parse failure, or a partial
 *                   pull abandoned mid-pagination.
 */
export type SourceHealth = 'ok' | 'missing-key' | 'skipped' | 'error';

/** Thrown by a fetcher whose API credential is absent from the environment. */
export class MissingCredentialsError extends Error {
  /** The environment variable that would have carried the credential. */
  readonly envVar: string;

  constructor(envVar: string) {
    super(`no ${envVar} in the environment — source not configured`);
    this.name = 'MissingCredentialsError';
    this.envVar = envVar;
  }
}

/** One source's result for one run. `batch` is non-null exactly when health is `ok`. */
export interface SourceOutcome {
  source: SourceName;
  health: SourceHealth;
  batch: RawBatch | null;
  /** Human-readable reason, for the run log and the published health row. */
  detail?: string;
}

/**
 * Awaits one fetcher and classifies the result. A failing source must never sink
 * the whole refresh, so every rejection becomes an outcome rather than a throw —
 * but, unlike the old `settle()`, a rejection is no longer indistinguishable from
 * "returned nothing", and a missing credential is no longer indistinguishable
 * from a successful empty pull.
 */
export async function settleSource(
  source: SourceName,
  fetching: Promise<RawBatch>,
): Promise<SourceOutcome> {
  try {
    const batch = await fetching;
    return { source, health: 'ok', batch, detail: `${batch.records.length} raw records` };
  } catch (err) {
    if (err instanceof MissingCredentialsError) {
      return { source, health: 'missing-key', batch: null, detail: err.message };
    }
    return { source, health: 'error', batch: null, detail: (err as Error).message };
  }
}

/** A source deliberately not called this run (cost/quota gating). */
export function skippedSource(source: SourceName, reason: string): SourceOutcome {
  return { source, health: 'skipped', batch: null, detail: reason };
}

/**
 * The sources whose data is authoritative this run — the only ones whose banked
 * events carry-forward may replace. Everything else (no key, skipped, failed)
 * keeps what it last published.
 */
export function authoritativeSources(outcomes: SourceOutcome[]): SourceName[] {
  return outcomes.filter((o) => o.health === 'ok').map((o) => o.source);
}

/** The raw batches to assemble — only from sources that actually fetched. */
export function fetchedBatches(outcomes: SourceOutcome[]): RawBatch[] {
  return outcomes.flatMap((o) => (o.health === 'ok' && o.batch ? [o.batch] : []));
}
