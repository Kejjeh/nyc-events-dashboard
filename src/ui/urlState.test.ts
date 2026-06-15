import { describe, it, expect } from 'vitest';
import { serializeFilters, parseFilters, DEFAULT_FILTERS, type FilterState } from './urlState';

describe('urlState', () => {
  it('serializes nothing when everything is at default', () => {
    expect(serializeFilters(DEFAULT_FILTERS)).toBe('');
  });

  it('round-trips a full filter state', () => {
    const state: FilterState = {
      borough: 'Brooklyn',
      neighborhood: 'Williamsburg',
      category: 'music',
      freeOnly: true,
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

  it('omits the neighborhood when no borough is selected', () => {
    const qs = serializeFilters({ ...DEFAULT_FILTERS, neighborhood: 'Williamsburg' });
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

  it('drops a neighborhood when the borough is absent or invalid', () => {
    expect(parseFilters('n=Williamsburg').neighborhood).toBe('All');
    expect(parseFilters('b=Atlantis&n=Williamsburg').neighborhood).toBe('All');
  });

  it('decodes spaces in search and neighborhood', () => {
    const qs = serializeFilters({
      ...DEFAULT_FILTERS,
      borough: 'Manhattan',
      neighborhood: 'West Village',
      search: 'live music',
    });
    const parsed = parseFilters(qs);
    expect(parsed.neighborhood).toBe('West Village');
    expect(parsed.search).toBe('live music');
  });
});
