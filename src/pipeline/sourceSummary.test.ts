import { describe, it, expect } from 'vitest';
import type { Event } from '../domain/event';
import { summarizeSources } from './sourceSummary';
import type { SourceName } from './assemble';
import type { SourceOutcome } from './sourceOutcome';

const ev = (source: string): Event => ({
  id: `${source}:${Math.random()}`,
  title: 't',
  category: 'other',
  borough: 'Manhattan',
  venue: 'v',
  start: '2026-06-15T20:00:00',
  isFree: true,
  url: 'https://x',
  source,
});

const ok = (source: string): SourceOutcome => ({
  source: source as SourceName,
  health: 'ok',
  batch: { source: source as SourceName, records: [] },
});
const down = (source: string, health: SourceOutcome['health']): SourceOutcome => ({
  source: source as SourceName,
  health,
  batch: null,
});

describe('summarizeSources', () => {
  it('counts events per source and sorts by count descending', () => {
    const events = [ev('dice'), ev('dice'), ev('bpl'), ev('dice'), ev('bpl')];
    const summary = summarizeSources(events, [ok('dice'), ok('bpl')]);
    expect(summary).toEqual([
      { source: 'dice', count: 3, fresh: true, status: 'ok' },
      { source: 'bpl', count: 2, fresh: true, status: 'ok' },
    ]);
  });

  it('marks a source as not fresh when it was carried forward', () => {
    const events = [ev('dice'), ev('bpl')];
    const summary = summarizeSources(events, [ok('dice'), down('bpl', 'error')]);
    expect(summary.find((s) => s.source === 'bpl')).toEqual({
      source: 'bpl',
      count: 1,
      fresh: false,
      status: 'error',
    });
  });

  it('surfaces a source that succeeded but returned zero events (silent drop)', () => {
    const events = [ev('dice')];
    const summary = summarizeSources(events, [ok('dice'), ok('todaytix')]);
    expect(summary).toContainEqual({ source: 'todaytix', count: 0, fresh: true, status: 'ok' });
  });

  it('never reports a source without its credential as fresh', () => {
    const summary = summarizeSources([ev('seatgeek')], [down('seatgeek', 'missing-key')]);
    expect(summary).toEqual([
      { source: 'seatgeek', count: 1, fresh: false, status: 'missing-key' },
    ]);
  });

  it('distinguishes a cost-skipped source from a failed one', () => {
    const summary = summarizeSources(
      [ev('serpapi'), ev('cityparks')],
      [down('serpapi', 'skipped'), down('cityparks', 'error')],
    );
    expect(summary.map((s) => [s.source, s.status])).toEqual([
      ['cityparks', 'error'],
      ['serpapi', 'skipped'],
    ]);
    expect(summary.every((s) => s.fresh === false)).toBe(true);
  });

  it('keeps a down source visible even when it had nothing banked to carry', () => {
    const summary = summarizeSources([], [down('songkick', 'missing-key')]);
    expect(summary).toEqual([
      { source: 'songkick', count: 0, fresh: false, status: 'missing-key' },
    ]);
  });

  it('falls back to the fresh flag for a carried source with no outcome this run', () => {
    // Source wiring removed from run.ts, but its banked events still publish.
    const summary = summarizeSources([ev('jambase')], []);
    expect(summary).toEqual([{ source: 'jambase', count: 1, fresh: false }]);
  });

  it('returns no rows when there are neither events nor source outcomes', () => {
    expect(summarizeSources([], [])).toEqual([]);
  });

  describe('as-of provenance', () => {
    const NOW = '2026-09-18T16:00:00.000Z';
    const EARLIER = '2026-09-11T00:38:00.000Z';

    it('stamps a fresh row with this run', () => {
      const [dice] = summarizeSources([ev('dice')], [ok('dice')], NOW);
      expect(dice.asOf).toBe(NOW);
    });

    it('carries the previous as-of for a row that did not fetch', () => {
      const [bpl] = summarizeSources([ev('bpl')], [down('bpl', 'error')], NOW, {
        generatedAt: '2026-09-15T12:00:00.000Z',
        sources: [{ source: 'bpl', count: 3, fresh: false, status: 'error', asOf: EARLIER }],
      });
      expect(bpl.asOf).toBe(EARLIER);
    });

    it('takes the old payload time when the previous row was fresh but carried no as-of', () => {
      const [bpl] = summarizeSources([ev('bpl')], [down('bpl', 'error')], NOW, {
        generatedAt: EARLIER,
        sources: [{ source: 'bpl', count: 3, fresh: true }],
      });
      expect(bpl.asOf).toBe(EARLIER);
    });

    it('leaves as-of out when nothing is known', () => {
      const [bpl] = summarizeSources([ev('bpl')], [down('bpl', 'error')], NOW, {
        generatedAt: EARLIER,
        sources: [{ source: 'bpl', count: 3, fresh: false }],
      });
      expect(bpl).not.toHaveProperty('asOf');
      const [seatgeek] = summarizeSources([], [down('seatgeek', 'missing-key')], NOW);
      expect(seatgeek).not.toHaveProperty('asOf');
    });
  });
});
