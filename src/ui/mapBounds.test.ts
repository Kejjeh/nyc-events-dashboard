import { describe, it, expect } from 'vitest';
import type { Event } from '../domain/event';
import { boundsIntersect, boundsOf, shouldRefit, type Bounds } from './mapBounds';

const at = (lat?: number, lon?: number, over: Partial<Event> = {}): Event => ({
  id: `${lat},${lon}`,
  title: 't',
  category: 'music',
  venue: 'v',
  start: '2026-10-01T20:00:00',
  isFree: true,
  url: 'https://x.example',
  source: 'dice',
  lat,
  lon,
  ...over,
});

// Real-ish coordinates for the cities the archive actually holds.
const NYC = at(40.7308, -73.9973);
const BROOKLYN = at(40.6782, -73.9442);
const BOSTON = at(42.3467, -71.0972);
const CAMBRIDGE = at(42.3736, -71.1097);
const NYC_VIEWPORT: Bounds = [[-74.1, 40.6], [-73.8, 40.85]];

describe('boundsOf', () => {
  it('boxes every plottable event', () => {
    expect(boundsOf([NYC, BROOKLYN])).toEqual([[-73.9973, 40.6782], [-73.9442, 40.7308]]);
  });

  it('returns a degenerate box for a single event', () => {
    expect(boundsOf([BOSTON])).toEqual([[-71.0972, 42.3467], [-71.0972, 42.3467]]);
  });

  it('returns null when nothing can be plotted', () => {
    expect(boundsOf([])).toBeNull();
    expect(boundsOf([at(undefined, undefined)])).toBeNull();
  });

  it('ignores events with missing or impossible coordinates', () => {
    const bounds = boundsOf([
      NYC,
      at(undefined, -73.9),
      at(40.7, undefined),
      at(NaN, NaN),
      at(999, 999),
      at(40.5, -200),
    ]);
    expect(bounds).toEqual([[-73.9973, 40.7308], [-73.9973, 40.7308]]);
  });
});

describe('boundsIntersect', () => {
  it('sees an overlap', () => {
    expect(boundsIntersect(NYC_VIEWPORT, boundsOf([NYC, BROOKLYN])!)).toBe(true);
  });

  it('sees no overlap between NYC and Boston', () => {
    expect(boundsIntersect(NYC_VIEWPORT, boundsOf([BOSTON, CAMBRIDGE])!)).toBe(false);
  });

  it('counts a shared edge as an overlap', () => {
    expect(boundsIntersect([[0, 0], [1, 1]], [[1, 1], [2, 2]])).toBe(true);
  });
});

describe('shouldRefit', () => {
  it('re-fits when the city switches and every marker is off-screen', () => {
    // The reported bug: picking Boston left the map pinned on NYC.
    expect(shouldRefit(NYC_VIEWPORT, boundsOf([BOSTON, CAMBRIDGE]))).toBe(true);
  });

  it('leaves the viewport alone when the events are still in view', () => {
    // A user who panned or zoomed within NYC keeps their view across a filter change.
    expect(shouldRefit(NYC_VIEWPORT, boundsOf([NYC, BROOKLYN]))).toBe(false);
  });

  it('fits on the first data load, when there is no viewport yet', () => {
    expect(shouldRefit(null, boundsOf([BOSTON]))).toBe(true);
  });

  it('does nothing when there is nothing to fit to', () => {
    expect(shouldRefit(NYC_VIEWPORT, null)).toBe(false);
    expect(shouldRefit(null, null)).toBe(false);
  });
});
