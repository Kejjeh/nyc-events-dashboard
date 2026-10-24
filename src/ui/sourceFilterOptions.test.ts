import { describe, it, expect } from 'vitest';
import { shouldShowSourceFilter, sourceFilterOptions } from './sourceFilterOptions';

const inData = (...names: string[]) => names.map((source) => ({ source }));

describe('sourceFilterOptions', () => {
  it('offers the sources in the published payload', () => {
    expect(sourceFilterOptions(inData('dice', 'bpl'), [])).toEqual(['dice', 'bpl']);
  });

  it('also offers an active source the payload does not list', () => {
    // ?src=jambase, browsing an archive city whose sources aren't in the live
    // board's `sources` array — the user must still be able to untick it.
    expect(sourceFilterOptions(inData('dice', 'bpl'), ['jambase'])).toEqual([
      'dice',
      'bpl',
      'jambase',
    ]);
  });

  it('does not duplicate an active source that is already listed', () => {
    expect(sourceFilterOptions(inData('dice', 'bpl'), ['dice'])).toEqual(['dice', 'bpl']);
  });

  it('does not mutate the caller’s array', () => {
    const data = inData('dice');
    sourceFilterOptions(data, ['jambase']);
    expect(data).toEqual([{ source: 'dice' }]);
  });
});

describe('shouldShowSourceFilter', () => {
  it('shows on the live board when there is a choice', () => {
    expect(shouldShowSourceFilter(true, ['dice', 'bpl'], [])).toBe(true);
  });

  it('hides on the live board when there is only one source to pick', () => {
    expect(shouldShowSourceFilter(true, ['dice'], [])).toBe(false);
  });

  it('hides off the live board while nothing is filtered', () => {
    expect(shouldShowSourceFilter(false, ['dice', 'bpl'], [])).toBe(false);
  });

  it('stays visible off the live board while a filter is applied', () => {
    // The reported bug: ?src= kept filtering after a city switch with no
    // visible control to clear it.
    expect(shouldShowSourceFilter(false, ['dice', 'bpl'], ['dice'])).toBe(true);
    expect(shouldShowSourceFilter(false, ['jambase'], ['jambase'])).toBe(true);
  });
});
