import { describe, it, expect, vi } from 'vitest';
import type { Event } from '../domain/event';
import { readSnapshot, refresh, type RefreshIo } from './refresh';
import { settleSource, type SourceOutcome } from './sourceOutcome';

/**
 * The composition root's I/O contract, with the filesystem faked in memory so
 * each call can be made to fail. The pipeline underneath is the real one.
 */

const NOW = '2026-09-18T16:00:00.000Z';
const OUT = 'data/events.json';
const ARC = 'data/archive.json';

function memIo(files: Record<string, string | Error>) {
  const writes: Record<string, string> = {};
  const io: RefreshIo = {
    exists: (p) => p in files,
    read: async (p) => {
      const f = files[p];
      if (f instanceof Error) throw f;
      if (f === undefined) throw new Error(`ENOENT: ${p}`);
      return f;
    },
    write: async (p, data) => {
      writes[p] = data;
    },
  };
  return { io, writes };
}

const banked = (source: string, start: string): Event => ({
  id: `${source}:${start}`,
  title: 'show',
  category: 'music',
  venue: 'v',
  start,
  isFree: true,
  url: `https://${source}.example/x`,
  source,
});

const payload = (events: Event[], extra: Record<string, unknown> = {}) =>
  JSON.stringify({ generatedAt: '2026-09-11T00:38:00.000Z', count: events.length, events, ...extra });

const okBpl = (): SourceOutcome => ({
  source: 'bpl',
  health: 'ok',
  batch: {
    source: 'bpl',
    records: [
      {
        _venue: 'Greenpoint Library',
        attributes: {
          drupal_internal__nid: 1,
          title: 'Program 1',
          field_event_virtual: false,
          field_date: { value: '2026-10-02T13:00:00+00:00' },
          path: { alias: '/calendar/program-1' },
        },
      },
    ],
  },
});

function run(io: RefreshIo, outcomes: SourceOutcome[] | (() => Promise<SourceOutcome[]>)) {
  const collect = vi.fn(typeof outcomes === 'function' ? outcomes : async () => outcomes);
  const result = refresh({
    nowIso: NOW,
    onPush: false,
    collect,
    io,
    paths: { output: OUT, archive: ARC },
    liveStages: [],
    archiveStages: [],
  });
  return { result, collect };
}

describe('readSnapshot', () => {
  it('reads a file that does not exist as an empty first run', async () => {
    const { io } = memIo({});
    await expect(readSnapshot(OUT, io)).resolves.toEqual({ events: [], absent: true });
  });

  it('refuses an existing file that is not valid JSON', async () => {
    const { io } = memIo({ [OUT]: '{"count": 3, "events": [' });
    await expect(readSnapshot(OUT, io)).rejects.toThrow(/data\/events\.json is not valid JSON/);
  });

  it('refuses an existing file that cannot be read', async () => {
    const { io } = memIo({ [ARC]: new Error('EIO: i/o error, read') });
    await expect(readSnapshot(ARC, io)).rejects.toThrow(/archive\.json cannot be read \(EIO/);
  });

  it('refuses an existing file with no events array', async () => {
    const { io } = memIo({ [OUT]: '{"count": 3}', [ARC]: '[]' });
    await expect(readSnapshot(OUT, io)).rejects.toThrow(/has no events array/);
    await expect(readSnapshot(ARC, io)).rejects.toThrow(/has no events array/);
  });

  it('refuses a malformed sources array rather than dropping provenance', async () => {
    const { io } = memIo({ [OUT]: payload([], { sources: 'bpl' }) });
    await expect(readSnapshot(OUT, io)).rejects.toThrow(/malformed sources array/);
  });

  it('reads events and provenance from a healthy file', async () => {
    const row = { source: 'bpl', count: 1, fresh: true, status: 'ok' };
    const { io } = memIo({ [OUT]: payload([banked('bpl', '2026-10-11T18:00:00')], { sources: [row] }) });
    await expect(readSnapshot(OUT, io)).resolves.toEqual({
      events: [banked('bpl', '2026-10-11T18:00:00')],
      provenance: { generatedAt: '2026-09-11T00:38:00.000Z', sources: [row] },
      absent: false,
    });
  });
});

describe('refresh — an existing snapshot that cannot be trusted stops the run', () => {
  it('a corrupt events.json: nothing fetched, nothing written', async () => {
    const { io, writes } = memIo({ [OUT]: '{"events": [', [ARC]: payload([banked('jambase', '2027-01-05T20:00:00')]) });
    const { result, collect } = run(io, [okBpl()]);

    await expect(result).rejects.toThrow(/events\.json is not valid JSON/);
    expect(collect).not.toHaveBeenCalled();
    expect(writes).toEqual({});
  });

  it('an unreadable archive.json: the healthy live source cannot publish over the bank', async () => {
    // The reported hole: a read failure used to become [], and a source that
    // fetched fine then published a payload with the archive gone.
    const { io, writes } = memIo({ [OUT]: payload([]), [ARC]: new Error('EIO: i/o error, read') });
    const { result, collect } = run(io, [okBpl()]);

    await expect(result).rejects.toThrow(/archive\.json cannot be read/);
    expect(collect).not.toHaveBeenCalled();
    expect(writes).toEqual({});
  });

  it('a snapshot with the wrong shape is not an empty snapshot', async () => {
    const { io, writes } = memIo({ [OUT]: payload([]), [ARC]: '{"generatedAt": "x", "count": 900}' });
    const { result } = run(io, [okBpl()]);

    await expect(result).rejects.toThrow(/archive\.json has no events array/);
    expect(writes).toEqual({});
  });
});

describe('refresh — files that are genuinely absent or healthy', () => {
  it('publishes on a first run with no files at all', async () => {
    const { io, writes } = memIo({});
    const { result } = run(io, [okBpl()]);

    await expect(result).resolves.toMatchObject({ status: 'published' });
    expect(Object.keys(writes).sort()).toEqual([ARC, OUT]);
    expect(JSON.parse(writes[OUT])).toMatchObject({ generatedAt: NOW, count: 1 });
    expect(JSON.parse(writes[ARC])).toMatchObject({ generatedAt: NOW, count: 0 });
  });

  it('keeps both files untouched when every source failed and nothing was banked', async () => {
    const { io, writes } = memIo({ [OUT]: payload([]), [ARC]: payload([]) });
    const { result } = run(io, () =>
      Promise.all([settleSource('bpl', Promise.reject(new Error('HTTP 403 on all 4 attempts')))]),
    );

    await expect(result).resolves.toEqual({ status: 'kept-existing' });
    expect(writes).toEqual({});
  });

  it('carries the bank and its provenance through a down run', async () => {
    const row = { source: 'bpl', count: 1, fresh: false, status: 'error', asOf: '2026-09-11T00:38:00.000Z' };
    const { io, writes } = memIo({
      [OUT]: payload([banked('bpl', '2026-10-11T18:00:00')], { sources: [row] }),
      [ARC]: payload([banked('jambase', '2027-03-01T20:00:00')]),
    });
    const { result } = run(io, () =>
      Promise.all([settleSource('bpl', Promise.reject(new Error('HTTP 403 on all 4 attempts')))]),
    );

    await expect(result).resolves.toMatchObject({ status: 'published', carried: 2 });
    const live = JSON.parse(writes[OUT]);
    expect(live.events.map((e: Event) => e.id)).toEqual(['bpl:2026-10-11T18:00:00']);
    expect(live.sources).toEqual([{ source: 'bpl', count: 1, fresh: false, status: 'error', asOf: row.asOf }]);
    expect(JSON.parse(writes[ARC]).events.map((e: Event) => e.id)).toEqual(['jambase:2027-03-01T20:00:00']);
  });
});
