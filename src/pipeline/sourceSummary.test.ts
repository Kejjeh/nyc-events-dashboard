import { describe, it, expect } from 'vitest';
import type { Event } from '../domain/event';
import { summarizeSources } from './sourceSummary';

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

describe('summarizeSources', () => {
  it('counts events per source and sorts by count descending', () => {
    const events = [ev('dice'), ev('dice'), ev('bpl'), ev('dice'), ev('bpl')];
    const summary = summarizeSources(events, ['dice', 'bpl']);
    expect(summary).toEqual([
      { source: 'dice', count: 3, fresh: true },
      { source: 'bpl', count: 2, fresh: true },
    ]);
  });

  it('marks a source as not fresh when it was carried forward', () => {
    const events = [ev('dice'), ev('bpl')];
    const summary = summarizeSources(events, ['dice']); // bpl failed this run
    expect(summary.find((s) => s.source === 'bpl')).toEqual({
      source: 'bpl',
      count: 1,
      fresh: false,
    });
  });

  it('returns an empty array for no events', () => {
    expect(summarizeSources([], ['dice'])).toEqual([]);
  });
});
