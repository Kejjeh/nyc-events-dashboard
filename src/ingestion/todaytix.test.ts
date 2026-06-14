import { describe, it, expect } from 'vitest';
import { normalizeTodayTixShow } from './todaytix';

const base = {
  id: 14790,
  displayName: 'The Play That Goes Wrong',
  slug: 'the-play-that-goes-wrong',
  venue: 'New World Stages',
  subcategories: [{ slug: 'off-broadway', name: 'Off Broadway' }, { slug: 'comedy' }],
  startDate: '2026-05-01',
  endDate: '2026-08-30',
  lowPriceForRegularTickets: { value: 88, display: '$88' },
  _today: '2026-06-14',
};

describe('normalizeTodayTixShow', () => {
  it('normalizes a running off-Broadway show into a Manhattan theater Event', () => {
    expect(normalizeTodayTixShow(base)).toEqual({
      id: 'todaytix:14790',
      title: 'The Play That Goes Wrong',
      category: 'theater',
      borough: 'Manhattan',
      venue: 'New World Stages',
      start: '2026-06-14T19:30:00', // run already open -> clamp to today
      isFree: false,
      priceMin: 88,
      url: 'https://www.todaytix.com/nyc/shows/the-play-that-goes-wrong',
      source: 'todaytix',
    });
  });

  it('uses the run start when the show opens in the future', () => {
    const event = normalizeTodayTixShow({ ...base, startDate: '2026-07-10' });
    expect(event!.start).toBe('2026-07-10T19:30:00');
  });

  it('drops shows whose run has already ended', () => {
    expect(normalizeTodayTixShow({ ...base, endDate: '2026-06-01' })).toBeNull();
  });

  it('drops shows not tagged off-Broadway', () => {
    expect(normalizeTodayTixShow({ ...base, subcategories: [{ slug: 'broadway' }] })).toBeNull();
  });

  it('places a known Brooklyn venue in Brooklyn', () => {
    const event = normalizeTodayTixShow({ ...base, venue: "St. Ann's Warehouse" });
    expect(event!.borough).toBe('Brooklyn');
  });

  it('omits price when no ticket price is available', () => {
    const event = normalizeTodayTixShow({ ...base, lowPriceForRegularTickets: null });
    expect(event!.isFree).toBe(false);
    expect(event!.priceMin).toBeUndefined();
  });

  it('keeps open-ended runs (endDate is the string "null")', () => {
    const event = normalizeTodayTixShow({ ...base, startDate: '2022-04-01', endDate: 'null' });
    expect(event).not.toBeNull();
    expect(event!.start).toBe('2026-06-14T19:30:00');
  });

  it('falls back to the TodayTix NYC page when the slug is missing', () => {
    const event = normalizeTodayTixShow({ ...base, slug: null });
    expect(event!.url).toBe('https://www.todaytix.com/nyc');
  });
});
