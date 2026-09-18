import { describe, it, expect } from 'vitest';
import { sourceHealthTitle } from './format';
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
});
