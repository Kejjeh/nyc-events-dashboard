import { describe, it, expect } from 'vitest';
import { serializeFilters, parseFilters, DEFAULT_FILTERS, type FilterState } from './urlState';

describe('urlState', () => {
  it('serializes nothing when everything is at default', () => {
    expect(serializeFilters(DEFAULT_FILTERS)).toBe('');
  });

  it('round-trips a full filter state', () => {
    const state: FilterState = {
      borough: 'Brooklyn',
      neighborhoods: ['Williamsburg', 'Bushwick'],
      sources: ['ticketmaster', 'dice'],
      categories: ['music'],
      freeOnly: true,
      maxPrice: 50,
      search: 'jazz quartet',
      sort: 'borough',
      dateWindow: 'weekend',
    };
    expect(parseFilters(serializeFilters(state))).toEqual(state);
  });

  it('round-trips a picked date window', () => {
    const state: FilterState = { ...DEFAULT_FILTERS, dateWindow: '2026-06-20' };
    expect(parseFilters(serializeFilters(state))).toEqual(state);
  });

  it('omits neighborhoods when no borough is selected', () => {
    const qs = serializeFilters({ ...DEFAULT_FILTERS, neighborhoods: ['Williamsburg'] });
    expect(qs).toBe('');
  });

  it('ignores invalid values and falls back to defaults', () => {
    const parsed = parseFilters('b=Atlantis&c=opera&sort=loudest&when=someday&free=yes');
    expect(parsed).toEqual(DEFAULT_FILTERS);
  });

  it('rejects a structurally-valid but impossible picked date', () => {
    expect(parseFilters('when=2026-13-45').dateWindow).toBe('all');
    expect(parseFilters('when=9999-99-99').dateWindow).toBe('all');
    expect(parseFilters('when=2026-06-20').dateWindow).toBe('2026-06-20'); // real date still works
  });

  it('drops neighborhoods when the borough is absent or invalid', () => {
    expect(parseFilters('n=Williamsburg').neighborhoods).toEqual([]);
    expect(parseFilters('b=Atlantis&n=Williamsburg').neighborhoods).toEqual([]);
  });

  it('decodes spaces in search and neighborhoods', () => {
    const qs = serializeFilters({
      ...DEFAULT_FILTERS,
      borough: 'Manhattan',
      neighborhoods: ['West Village'],
      search: 'live music',
    });
    const parsed = parseFilters(qs);
    expect(parsed.neighborhoods).toEqual(['West Village']);
    expect(parsed.search).toBe('live music');
  });

  it('round-trips multiple sources without a borough', () => {
    const state: FilterState = { ...DEFAULT_FILTERS, sources: ['dice', 'nyc-parks'] };
    expect(parseFilters(serializeFilters(state))).toEqual(state);
  });
});
