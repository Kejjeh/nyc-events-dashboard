import { describe, it, expect } from 'vitest';
import {
  parseMarketDays,
  parseMarketHours,
  parseDayOrdinals,
  greenmarketDescriptors,
  normalizeGreenmarketEvent,
} from './nycGreenmarket';

describe('parseMarketDays', () => {
  it.each([
    ['Thursday', [4]],
    ['Saturday', [6]],
    ['Friday & Saturday', [5, 6]],
    ['Friday, Saturday', [5, 6]],
    ['Mon-Sat', [1, 2, 3, 4, 5, 6]],
    ['Saturdays', [6]],
    ['Wednesday (3rd Wednesday of each month)', [3]],
    ['TBD', []],
  ])('parses "%s"', (input, expected) => {
    expect(parseMarketDays(input)).toEqual(expected);
  });
});

describe('parseMarketHours', () => {
  it.each([
    ['8 a.m. - 4p.m.', { start: '08:00:00', end: '16:00:00' }],
    ['9:30 a.m. - 2:30 p.m.', { start: '09:30:00', end: '14:30:00' }],
    ['noon - 3 p.m.', { start: '12:00:00', end: '15:00:00' }],
    ['1-5 p.m.', { start: '13:00:00', end: '17:00:00' }],
  ])('parses "%s"', (input, expected) => {
    expect(parseMarketHours(input)).toEqual(expected);
  });

  it.each([
    ['8 - 4 p.m.', { start: '08:00:00', end: '16:00:00' }], // morning-to-afternoon: start is AM
    ['11-4 p.m.', { start: '11:00:00', end: '16:00:00' }],
  ])('disambiguates an inherited-meridiem morning start "%s"', (input, expected) => {
    expect(parseMarketHours(input)).toEqual(expected);
  });

  it('returns null for unparseable hours', () => {
    expect(parseMarketHours('TBD')).toBeNull();
  });
});

describe('parseDayOrdinals', () => {
  it.each([
    ['Wednesday', null],
    ['Mon-Sat', null],
    ['Wednesday (1st & 3rd)', [1, 3]],
    ['Monday (1st and 3rd)', [1, 3]],
    ['Wednesday (2nd of each month)', [2]],
    ['Sunday (monthly)', [1]],
  ])('parses week-of-month ordinals from "%s"', (input, expected) => {
    expect(parseDayOrdinals(input)).toEqual(expected);
  });
});

const MANHATTAN_ROW = {
  marketname: '175th Street Greenmarket',
  latitude: '40.845948',
  longitude: '-73.937811',
  daysoperation: 'Thursday',
  hoursoperations: '8 a.m. - 4 p.m.',
  open_year_round: 'No',
  year: '2025',
};

describe('greenmarketDescriptors', () => {
  it('generates upcoming Thursday occurrences in the right borough', () => {
    const ds = greenmarketDescriptors([MANHATTAN_ROW], '2026-07-01T12:00:00Z', 3);
    expect(ds.length).toBeGreaterThanOrEqual(2);
    for (const d of ds) {
      expect(d.borough).toBe('Manhattan');
      expect(d.marketname).toBe('175th Street Greenmarket');
      expect(d.startTime).toBe('08:00:00');
      expect(d.endTime).toBe('16:00:00');
      expect(new Date(`${d.date}T12:00:00Z`).getUTCDay()).toBe(4); // Thursday
    }
  });

  it('drops markets outside the four boroughs and unparseable rows', () => {
    const statenIsland = { ...MANHATTAN_ROW, latitude: '40.5795', longitude: '-74.1502' };
    const noDays = { ...MANHATTAN_ROW, daysoperation: 'TBD' };
    expect(greenmarketDescriptors([statenIsland, noDays], '2026-07-01T12:00:00Z', 3)).toEqual([]);
  });

  it('skips seasonal markets out of season but keeps year-round ones', () => {
    const seasonal = { ...MANHATTAN_ROW, open_year_round: 'No' };
    const yearRound = { ...MANHATTAN_ROW, open_year_round: 'Yes' };
    expect(greenmarketDescriptors([seasonal], '2026-01-15T12:00:00Z', 4)).toEqual([]); // winter
    expect(greenmarketDescriptors([yearRound], '2026-01-15T12:00:00Z', 4).length).toBeGreaterThan(0);
  });

  it('only emits ordinal-qualified markets on their weeks of the month', () => {
    const row = { ...MANHATTAN_ROW, daysoperation: 'Wednesday (1st & 3rd)' };
    const ds = greenmarketDescriptors([row], '2026-07-01T12:00:00Z', 8);
    expect(ds.length).toBeGreaterThan(0);
    for (const d of ds) {
      const weekOfMonth = Math.ceil(parseInt(d.date.slice(8), 10) / 7);
      expect([1, 3]).toContain(weekOfMonth);
    }
  });

  it('seeds the cursor from the NYC date, not UTC, on a late-evening run', () => {
    const daily = { ...MANHATTAN_ROW, daysoperation: 'Mon-Sun', open_year_round: 'Yes' };
    const ds = greenmarketDescriptors([daily], '2026-07-02T03:00:00Z', 1); // 11pm ET Jul 1
    expect(ds[0].date).toBe('2026-07-01');
  });
});

describe('normalizeGreenmarketEvent', () => {
  it('builds a free food Event from a descriptor', () => {
    const event = normalizeGreenmarketEvent({
      marketname: '175th Street Greenmarket',
      borough: 'Manhattan',
      date: '2026-07-02',
      startTime: '08:00:00',
      endTime: '16:00:00',
    });
    expect(event).toEqual({
      id: 'nyc-greenmarket:175th-street-greenmarket:2026-07-02',
      title: '175th Street Greenmarket',
      category: 'food',
      borough: 'Manhattan',
      venue: '175th Street Greenmarket',
      start: '2026-07-02T08:00:00',
      end: '2026-07-02T16:00:00',
      isFree: true,
      url: 'https://www.grownyc.org/greenmarket',
      source: 'nyc-greenmarket',
    });
  });
});
