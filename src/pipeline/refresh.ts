import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { Event, SourceStatus } from '../domain/event';
import { runPipeline, type PipelineLogger, type PipelineResult } from './runPipeline';
import type { EnrichmentStage } from './enrichmentChain';
import type { SourceOutcome } from './sourceOutcome';
import type { PreviousProvenance } from './sourceSummary';

export const OUTPUT_PATH = 'public/data/events.json';
export const ARCHIVE_PATH = 'public/data/archive.json';

/** The filesystem calls a refresh makes, so a test can fail any one of them. */
export interface RefreshIo {
  exists(path: string): boolean;
  read(path: string): Promise<string>;
  write(path: string, data: string): Promise<void>;
}

export const NODE_IO: RefreshIo = {
  exists: existsSync,
  read: (path) => readFile(path, 'utf8'),
  write: async (path, data) => {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, data);
  },
};

/** A previously published data file as read back from disk. */
export interface Snapshot {
  events: Event[];
  /** `generatedAt` + `sources` of the previous payload, when it had them. */
  provenance?: PreviousProvenance;
  /** True only when the file does not exist at all — a first run. */
  absent: boolean;
}

/** An existing snapshot that could not be read or does not look like one. */
export class SnapshotError extends Error {
  constructor(
    readonly path: string,
    problem: string,
  ) {
    super(`Existing snapshot ${path} ${problem} — refusing to run, so it is not overwritten`);
    this.name = 'SnapshotError';
  }
}

/**
 * Reads one published data file. A file that does not exist is a first run
 * and reads as empty. A file that exists but cannot be read, is not JSON, or
 * has no `events` array is NOT empty: it is the bank in an unknown state, and
 * treating it as empty would let this run's fresh sources publish over it.
 * That case throws, and the caller must not write anything.
 */
export async function readSnapshot(path: string, io: RefreshIo = NODE_IO): Promise<Snapshot> {
  if (!io.exists(path)) return { events: [], absent: true };

  let text: string;
  try {
    text = await io.read(path);
  } catch (err) {
    throw new SnapshotError(path, `cannot be read (${(err as Error).message})`);
  }

  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new SnapshotError(path, 'is not valid JSON');
  }

  if (!payload || typeof payload !== 'object' || !Array.isArray((payload as { events?: unknown }).events)) {
    throw new SnapshotError(path, 'has no events array');
  }
  const p = payload as { events: Event[]; sources?: unknown; generatedAt?: unknown };
  if (p.sources !== undefined && !Array.isArray(p.sources)) {
    throw new SnapshotError(path, 'has a malformed sources array');
  }

  const provenance =
    Array.isArray(p.sources) && typeof p.generatedAt === 'string'
      ? { generatedAt: p.generatedAt, sources: p.sources as SourceStatus[] }
      : undefined;
  return { events: p.events, provenance, absent: false };
}

export interface RefreshOptions {
  nowIso: string;
  onPush: boolean;
  /** Fetches and classifies every source (`collectSources` in run.ts). */
  collect: (nowIso: string, onPush: boolean) => Promise<SourceOutcome[]>;
  keys?: {
    googleMaps?: string;
    openWeather?: string;
    /** Lazy, so no request is made before the snapshots have been validated. */
    spotifyToken?: () => Promise<string | null>;
  };
  paths?: { output: string; archive: string };
  io?: RefreshIo;
  liveStages?: EnrichmentStage[];
  archiveStages?: EnrichmentStage[];
  log?: PipelineLogger;
}

/**
 * One refresh, end to end: read the previous snapshots, fetch, run the
 * pipeline, write. Both snapshots are read and validated BEFORE any source is
 * fetched, so a corrupt or unreadable file aborts the run with nothing spent
 * and nothing written.
 */
export async function refresh(opts: RefreshOptions): Promise<PipelineResult> {
  const io = opts.io ?? NODE_IO;
  const output = opts.paths?.output ?? OUTPUT_PATH;
  const archivePath = opts.paths?.archive ?? ARCHIVE_PATH;
  const log = opts.log ?? { info: () => {}, warn: () => {} };

  const previous = await readSnapshot(output, io);
  const previousArchive = await readSnapshot(archivePath, io);

  const outcomes = await opts.collect(opts.nowIso, opts.onPush);
  const spotifyToken = (await opts.keys?.spotifyToken?.()) ?? null;

  const result = await runPipeline({
    nowIso: opts.nowIso,
    onPush: opts.onPush,
    outcomes,
    previousLive: previous.events,
    previousArchive: previousArchive.events,
    hasExistingOutput: !previous.absent,
    previousProvenance: previous.provenance,
    googleMapsKey: opts.keys?.googleMaps,
    openWeatherKey: opts.keys?.openWeather,
    spotifyToken,
    liveStages: opts.liveStages,
    archiveStages: opts.archiveStages,
    log,
  });

  if (result.status === 'kept-existing') return result;

  await io.write(output, JSON.stringify(result.live, null, 2) + '\n');
  await io.write(archivePath, JSON.stringify(result.archive, null, 2) + '\n');
  log.info(`Wrote ${result.live.count} live events to ${output} + ${result.archive.count} archived to ${archivePath}`);
  return result;
}
