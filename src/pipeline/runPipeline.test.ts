import { describe, it, expect } from 'vitest';
import type { Event } from '../domain/event';
import { runPipeline, type PipelineDeps } from './runPipeline';
import { settleSource, skippedSource, type SourceOutcome } from './sourceOutcome';
import type { EnrichmentStage } from './enrichmentChain';
import {
  fetchJamBase,
  fetchSeatGeek,
  fetchSerpApi,
  fetchSongkick,
  fetchTicketmaster,
} from './sources';

/**
 * Offline integration fixtures for the refresh. Everything below the fetchers is
 * the real thing — assemble (real normalizers), carry-forward, dedup, partition
 * and the source-health summary — so these exercise the actual orchestration and
 * its ordering, not a re-implementation of it.
 *
 * Nothing here touches the network or the filesystem: the keyed fetchers are
 * called with no credential (they reject before issuing a request), the other
 * sources are fed recorded raw records, and enrichment runs as no-op stages
 * (the chain's own ordering has its own tests in enrichmentChain.test.ts).
 */

const NOW = '2026-09-18T16:00:00.000Z'; // noon ET
const LIVE_CUTOFF_NOTE = 'partition window is 120 days → 2027-01-16';

/** A recorded Brooklyn Public Library record — a healthy, keyless source. */
const bplRecord = (nid: number, start: string, title = `Program ${nid}`) => ({
  _venue: 'Greenpoint Library',
  attributes: {
    drupal_internal__nid: nid,
    title,
    field_event_virtual: false,
    field_date: { value: `${start}+00:00` },
    path: { alias: `/calendar/program-${nid}` },
  },
});

/** An already-published event, as read back from events.json / archive.json. */
const banked = (source: string, start: string, over: Partial<Event> = {}): Event => ({
  id: `${source}:${start}:${over.title ?? 'show'}`,
  title: 'show',
  category: 'music',
  venue: 'Bowery Ballroom',
  start,
  isFree: false,
  url: `https://${source}.example/x`,
  source,
  ...over,
});

function deps(over: Partial<PipelineDeps> = {}): PipelineDeps {
  return {
    nowIso: NOW,
    onPush: false,
    outcomes: [],
    previousLive: [],
    previousArchive: [],
    hasExistingOutput: true,
    liveStages: [],
    archiveStages: [],
    ...over,
  };
}

/** Every keyed fetcher, called exactly as run.ts calls it with no credential set. */
function keylessOutcomes(): Promise<SourceOutcome[]> {
  return Promise.all([
    settleSource('ticketmaster', fetchTicketmaster(undefined, NOW)),
    settleSource('seatgeek', fetchSeatGeek(undefined)),
    settleSource('songkick', fetchSongkick(undefined, NOW)),
    settleSource('serpapi', fetchSerpApi(undefined, NOW)),
    settleSource('jambase', fetchJamBase(undefined, NOW)),
  ]);
}

const okBatch = (source: string, records: any[]): SourceOutcome =>
  ({ source, health: 'ok', batch: { source, records }, detail: `${records.length} raw records` }) as SourceOutcome;

function published(result: Awaited<ReturnType<typeof runPipeline>>) {
  if (result.status !== 'published') throw new Error(`expected a published run, got ${result.status}`);
  return result;
}

const countsBySource = (events: Event[]) =>
  events.reduce<Record<string, number>>((acc, e) => ({ ...acc, [e.source]: (acc[e.source] ?? 0) + 1 }), {});

describe('runPipeline — a run with no API credentials', () => {
  it('keeps every banked event from the keyed sources instead of wiping them', async () => {
    // The bank: 3 keyed sources with banked events, plus a healthy keyless source.
    const previousLive = [
      banked('ticketmaster', '2026-10-05T20:00:00'),
      banked('ticketmaster', '2026-11-12T20:00:00'),
      banked('seatgeek', '2026-10-20T19:00:00'),
      banked('bpl', '2026-10-02T13:00:00'),
    ];
    const previousArchive = [
      banked('jambase', '2027-03-01T20:00:00', { city: 'Boston', state: 'MA' }),
      banked('songkick', '2027-02-14T20:00:00'),
    ];

    const result = published(
      await runPipeline(
        deps({
          outcomes: [
            ...(await keylessOutcomes()),
            okBatch('bpl', [bplRecord(1, '2026-10-02T13:00:00')]),
          ],
          previousLive,
          previousArchive,
        }),
      ),
    );

    const all = [...result.live.events, ...result.archive.events];
    // Nothing banked was lost: 5 keyed events carried + 1 fresh bpl (which
    // replaces its own banked copy, same id).
    expect(countsBySource(all)).toEqual({
      ticketmaster: 2,
      seatgeek: 1,
      songkick: 1,
      jambase: 1,
      bpl: 1,
    });
    expect(result.carried).toBe(5);
  });

  it('reports each keyless source as missing-key, never as a fresh zero', async () => {
    const result = published(
      await runPipeline(deps({ outcomes: await keylessOutcomes(), hasExistingOutput: false })),
    );

    const rows = result.live.sources;
    expect(rows.map((r) => r.source).sort()).toEqual([
      'jambase',
      'seatgeek',
      'serpapi',
      'songkick',
      'ticketmaster',
    ]);
    for (const row of rows) {
      expect(row).toMatchObject({ count: 0, fresh: false, status: 'missing-key' });
    }
  });

  it('leaves the archive bank whole — the regression that emptied it locally', async () => {
    // A stand-in for the real bank: 900 banked keyed events across two sources.
    const previousArchive = Array.from({ length: 900 }, (_, i) =>
      banked('jambase', `2027-0${(i % 3) + 1}-1${i % 10}T20:00:00`, {
        title: `banked ${i}`,
        city: 'Philadelphia',
        state: 'PA',
      }),
    );

    const result = published(
      await runPipeline(deps({ outcomes: await keylessOutcomes(), previousArchive })),
    );

    expect(result.archive.events).toHaveLength(900);
    expect(result.live.events).toHaveLength(0);
  });
});

describe('runPipeline — the four source outcomes stay distinct', () => {
  const bank = [banked('serpapi', '2026-10-09T18:00:00'), banked('cityparks', '2026-10-11T18:00:00')];

  it('a cost-skipped source keeps its events and is labelled skipped', async () => {
    const result = published(
      await runPipeline(
        deps({
          onPush: true,
          outcomes: [skippedSource('serpapi', 'not called on push runs (API cost control)')],
          previousLive: bank.slice(0, 1),
        }),
      ),
    );

    expect(result.live.events.map((e) => e.source)).toEqual(['serpapi']);
    expect(result.live.sources).toEqual([
      { source: 'serpapi', count: 1, fresh: false, status: 'skipped' },
    ]);
  });

  it('a failed fetch keeps its events and is labelled error', async () => {
    const result = published(
      await runPipeline(
        deps({
          outcomes: [await settleSource('cityparks', Promise.reject(new Error('HTTP 503')))],
          previousLive: bank.slice(1),
        }),
      ),
    );

    expect(result.live.events.map((e) => e.source)).toEqual(['cityparks']);
    expect(result.live.sources[0]).toMatchObject({ fresh: false, status: 'error' });
  });

  it('a fresh source that genuinely returns zero drops its own events (documented policy)', async () => {
    // todaytix fetched fine and found nothing: its data is authoritative, so the
    // stale copy goes and the health row shows the silent drop as 0 + fresh.
    const result = published(
      await runPipeline(
        deps({
          outcomes: [okBatch('todaytix', []), okBatch('bpl', [bplRecord(7, '2026-10-02T13:00:00')])],
          previousLive: [banked('todaytix', '2026-10-25T19:30:00')],
        }),
      ),
    );

    expect(result.live.events.map((e) => e.source)).toEqual(['bpl']);
    expect(result.live.sources).toContainEqual({
      source: 'todaytix',
      count: 0,
      fresh: true,
      status: 'ok',
    });
    expect(result.carried).toBe(0);
  });

  it('a fresh source with records replaces its banked copies', async () => {
    const result = published(
      await runPipeline(
        deps({
          outcomes: [okBatch('bpl', [bplRecord(42, '2026-10-02T13:00:00', 'New program')])],
          previousLive: [banked('bpl', '2026-10-30T13:00:00', { title: 'Old program' })],
        }),
      ),
    );

    expect(result.live.events.map((e) => e.title)).toEqual(['New program']);
  });
});

describe('runPipeline — existing semantics are preserved', () => {
  it(`keeps the live/archive split for carried events (${LIVE_CUTOFF_NOTE})`, async () => {
    const result = published(
      await runPipeline(
        deps({
          outcomes: await keylessOutcomes(),
          previousLive: [banked('ticketmaster', '2026-10-05T20:00:00')], // NYC, near term
          previousArchive: [
            banked('ticketmaster', '2027-06-01T20:00:00'), // NYC, beyond the window
            banked('jambase', '2026-10-06T20:00:00', { city: 'Boston', state: 'MA' }), // near term, not a live city
          ],
        }),
      ),
    );

    expect(result.live.events.map((e) => e.start)).toEqual(['2026-10-05T20:00:00']);
    expect(result.archive.events.map((e) => e.start).sort()).toEqual([
      '2026-10-06T20:00:00',
      '2027-06-01T20:00:00',
    ]);
  });

  it('still expires carried events whose date has passed', async () => {
    const result = published(
      await runPipeline(
        deps({
          outcomes: await keylessOutcomes(),
          previousLive: [
            banked('ticketmaster', '2026-09-01T20:00:00'), // past → drop
            banked('ticketmaster', '2026-09-18T20:00:00'), // tonight → keep
            banked('ticketmaster', '2026-09-30T20:00:00'), // upcoming → keep
          ],
        }),
      ),
    );

    expect(result.live.events.map((e) => e.start)).toEqual([
      '2026-09-18T20:00:00',
      '2026-09-30T20:00:00',
    ]);
  });

  it('keeps tonight’s carried show on a late-evening run (ET wall clock, not UTC)', async () => {
    // 02:00 UTC Sep 19 is 10pm ET Sep 18 — tonight's shows must survive.
    const result = published(
      await runPipeline(
        deps({
          nowIso: '2026-09-19T02:00:00.000Z',
          outcomes: await keylessOutcomes(),
          previousLive: [banked('ticketmaster', '2026-09-18T22:30:00')],
        }),
      ),
    );

    expect(result.live.events.map((e) => e.start)).toEqual(['2026-09-18T22:30:00']);
  });

  it('still collapses cross-source duplicates among carried events', async () => {
    const result = published(
      await runPipeline(
        deps({
          outcomes: await keylessOutcomes(),
          previousLive: [
            banked('ticketmaster', '2026-10-05T20:00:00', { title: 'The Band', priceMin: 45 }),
            banked('seatgeek', '2026-10-05T20:30:00', { title: 'The Band!' }),
          ],
        }),
      ),
    );

    expect(result.live.events).toHaveLength(1);
    expect(result.live.events[0]).toMatchObject({
      source: 'ticketmaster',
      altTicketLinks: [{ source: 'seatgeek', url: 'https://seatgeek.example/x' }],
    });
  });

  it('publishes provenance: generatedAt, counts and the places index', async () => {
    const result = published(
      await runPipeline(
        deps({
          outcomes: await keylessOutcomes(),
          previousLive: [banked('ticketmaster', '2026-10-05T20:00:00')],
          previousArchive: [banked('jambase', '2026-10-06T20:00:00', { city: 'Boston', state: 'MA' })],
        }),
      ),
    );

    expect(result.live.generatedAt).toBe(NOW);
    expect(result.archive.generatedAt).toBe(NOW);
    expect(result.live.count).toBe(1);
    expect(result.live.archivedCount).toBe(1);
    expect(result.live.places).toEqual([
      { state: 'NY', cities: [{ name: 'New York', count: 1 }] },
      { state: 'MA', cities: [{ name: 'Boston', count: 1 }] },
    ]);
  });

  it('routes live and archive events to their own enrichment chains', async () => {
    const tag = (name: string): EnrichmentStage => ({
      name,
      run: async (events) => events.map((e) => ({ ...e, title: `${name}:${e.title}` })),
    });

    const result = published(
      await runPipeline(
        deps({
          outcomes: await keylessOutcomes(),
          previousLive: [banked('ticketmaster', '2026-10-05T20:00:00')],
          previousArchive: [banked('jambase', '2027-06-01T20:00:00')],
          liveStages: [tag('live')],
          archiveStages: [tag('archive')],
        }),
      ),
    );

    expect(result.live.events[0].title).toBe('live:show');
    expect(result.archive.events[0].title).toBe('archive:show');
  });

  it('keeps the existing files rather than blanking them when there is nothing at all', async () => {
    const result = await runPipeline(deps({ outcomes: await keylessOutcomes() }));
    expect(result.status).toBe('kept-existing');
  });

  it('publishes an empty set on a first-ever run with nothing on disk', async () => {
    const result = await runPipeline(deps({ outcomes: [], hasExistingOutput: false }));
    expect(result.status).toBe('published');
  });
});
