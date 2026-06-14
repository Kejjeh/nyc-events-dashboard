import { describe, it, expect } from 'vitest';
import { parseTime, combineDateTime, nycDateOf, utcToNycLocal } from './datetime';

describe('parseTime', () => {
  it('parses am/pm into 24-hour HH:MM:SS', () => {
    expect(parseTime('2:00 PM')).toBe('14:00:00');
    expect(parseTime('12:00 am')).toBe('00:00:00');
    expect(parseTime('12:00 pm')).toBe('12:00:00');
  });
});

describe('combineDateTime', () => {
  it('joins a date and time into local ISO', () => {
    expect(combineDateTime('2026-08-23', '3:00 pm')).toBe('2026-08-23T15:00:00');
  });
});

describe('nycDateOf', () => {
  it('returns the America/New_York calendar date for an instant', () => {
    // 03:00 UTC on Jun 15 is still 11pm EDT on Jun 14 in NYC.
    expect(nycDateOf('2026-06-15T03:00:00.000Z')).toBe('2026-06-14');
    // 08:00 UTC is 4am EDT, same calendar day.
    expect(nycDateOf('2026-06-14T08:00:00.000Z')).toBe('2026-06-14');
  });
});

describe('utcToNycLocal', () => {
  it('converts a UTC ISO timestamp to bare America/New_York local ISO', () => {
    // 23:00 UTC = 19:00 EDT.
    expect(utcToNycLocal('2026-06-20T23:00:00Z')).toBe('2026-06-20T19:00:00');
  });
});
