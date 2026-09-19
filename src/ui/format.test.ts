import { describe, it, expect } from 'vitest';
import { carriedSourcesNote, sourceHealthTitle } from './format';
import type { SourceStatus } from '../domain/event';

const row = (over: Partial<SourceStatus>): SourceStatus =>
  ({ source: 'seatgeek', count: 0, fresh: false, ...over });

describe('sourceHealthTitle', () => {
  it('tells the three down states apart', () => {
    expect(sourceHealthTitle(row({ status: 'missing-key' }))).toMatch(/Not configured/);
    expect(sourceHealthTitle(row({ status: 'skipped' }))).toMatch(/quota/);
    expect(sourceHealthTitle(row({ status: 'error' }))).toMatch(/failed/);
  });

  it('reads as refreshed for a source that fetched', () => {
    expect(sourceHealthTitle(row({ fresh: true, status: 'ok' }))).toBe('Refreshed this run');
  });

  it('falls back to the two-state wording for a payload published without status', () => {
    expect(sourceHealthTitle(row({ fresh: true }))).toBe('Refreshed this run');
    expect(sourceHealthTitle(row({ fresh: false }))).toMatch(/Carried forward/);
  });

  it('says when a carried source last fetched, if the payload knows', () => {
    const title = sourceHealthTitle(row({ status: 'error', asOf: '2026-09-11T00:38:00.000Z' }));
    expect(title).toMatch(/failed/);
    expect(title).toMatch(/last refreshed Sep 1[01]/);
    expect(sourceHealthTitle(row({ status: 'error' }))).not.toMatch(/last refreshed/);
    expect(sourceHealthTitle(row({ fresh: true, status: 'ok', asOf: '2026-09-18T16:00:00.000Z' }))).toBe(
      'Refreshed this run',
    );
  });
});

describe('carriedSourcesNote', () => {
  it('is silent when every source refreshed', () => {
    expect(carriedSourcesNote([row({ fresh: true }), row({ source: 'dice', fresh: true })])).toBeNull();
    expect(carriedSourcesNote([])).toBeNull();
    expect(carriedSourcesNote(undefined)).toBeNull();
  });

  it('counts the sources that did not refresh, whatever the reason', () => {
    expect(
      carriedSourcesNote([
        row({ fresh: true, status: 'ok' }),
        row({ source: 'bpl', status: 'error' }),
        row({ source: 'serpapi', status: 'skipped' }),
        row({ source: 'village-vanguard' }),
      ]),
    ).toBe('3 of 4 sources not refreshed this run');
    expect(carriedSourcesNote([row({ status: 'missing-key' })])).toBe('1 of 1 sources not refreshed this run');
  });
});
