import { describe, expect, it } from 'vitest';
import {
  runEnrichmentChain,
  liveEnrichmentStages,
  archiveEnrichmentStages,
  type EnrichmentContext,
  type EnrichmentStage,
} from './enrichmentChain';
import type { Event } from '../domain/event';

function makeEvent(overrides: Partial<Event> = {}): Event {
  return {
    id: 'tm:1',
    title: 'Concert',
    category: 'music',
    borough: 'Manhattan',
    venue: 'Venue',
    start: '2026-08-01T20:00:00',
    isFree: false,
    url: 'https://example.com',
    source: 'ticketmaster',
    ...overrides,
  };
}

function makeContext(overrides: Partial<EnrichmentContext> = {}): EnrichmentContext {
  return {
    googleMapsKey: undefined,
    openWeatherKey: undefined,
    spotifyToken: null,
    previousLive: [],
    onPush: false,
    ...overrides,
  };
}

/** A stage that records its invocation order and appends a marker event. */
function recordingStage(name: string, order: string[]): EnrichmentStage {
  return {
    name,
    run: async (events) => {
      order.push(name);
      return [...events, makeEvent({ id: name })];
    },
  };
}

describe('runEnrichmentChain', () => {
  it('runs stages in order, feeding each stage output to the next', async () => {
    const order: string[] = [];
    const stages = [recordingStage('a', order), recordingStage('b', order)];

    const result = await runEnrichmentChain([], stages, makeContext());

    expect(order).toEqual(['a', 'b']);
    expect(result.map((e) => e.id)).toEqual(['a', 'b']);
  });

  it('skips skipOnPush stages on a push run but keeps the rest', async () => {
    const order: string[] = [];
    const stages = [
      recordingStage('cheap', order),
      { ...recordingStage('expensive', order), skipOnPush: true },
    ];

    const result = await runEnrichmentChain([], stages, makeContext({ onPush: true }));

    expect(order).toEqual(['cheap']);
    expect(result.map((e) => e.id)).toEqual(['cheap']);
  });

  it('runs skipOnPush stages on a non-push run', async () => {
    const order: string[] = [];
    const stages = [{ ...recordingStage('expensive', order), skipOnPush: true }];

    await runEnrichmentChain([], stages, makeContext({ onPush: false }));

    expect(order).toEqual(['expensive']);
  });
});

describe('runEnrichmentChain progress reporting', () => {
  it('reports each stage with the count of events it changed', async () => {
    const reports: Array<{ name: string; changed: number; skipped: boolean }> = [];
    const stages: EnrichmentStage[] = [
      {
        name: 'touch-first',
        // Replaces the first event with a new object; one event changed.
        run: async (events) => events.map((e, i) => (i === 0 ? { ...e, lat: 1 } : e)),
      },
      { name: 'noop', run: async (events) => events },
    ];
    const input = [makeEvent({ id: 'a' }), makeEvent({ id: 'b' })];

    await runEnrichmentChain(input, stages, makeContext(), (r) => reports.push(r));

    expect(reports).toEqual([
      { name: 'touch-first', changed: 1, skipped: false },
      { name: 'noop', changed: 0, skipped: false },
    ]);
  });

  it('reports a skipped stage as skipped with zero changes', async () => {
    const reports: Array<{ name: string; changed: number; skipped: boolean }> = [];
    const stages: EnrichmentStage[] = [
      { name: 'expensive', skipOnPush: true, run: async (events) => events.map((e) => ({ ...e })) },
    ];

    await runEnrichmentChain([makeEvent()], stages, makeContext({ onPush: true }), (r) =>
      reports.push(r),
    );

    expect(reports).toEqual([{ name: 'expensive', changed: 0, skipped: true }]);
  });
});

describe('default enrichment stages', () => {
  it('runs the live chain geocode → neighborhood → weather → spotify', () => {
    expect(liveEnrichmentStages.map((s) => s.name)).toEqual([
      'geocode',
      'neighborhood',
      'weather',
      'spotify',
    ]);
  });

  it('never skips a live stage on push (live board must stay enriched)', () => {
    expect(liveEnrichmentStages.every((s) => !s.skipOnPush)).toBe(true);
  });

  it('enriches the archive with neighborhoods only, skipped on push', () => {
    expect(archiveEnrichmentStages.map((s) => s.name)).toEqual(['neighborhood']);
    expect(archiveEnrichmentStages[0].skipOnPush).toBe(true);
  });
});
