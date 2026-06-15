import { describe, it, expect } from 'vitest';
import { isInDateWindow, weekendDates } from './dateWindow';

// 2026-06-15 is a Monday; 2026-06-14 is a Sunday; 2026-06-20/21 are Sat/Sun.
const MON = '2026-06-15';
const SUN = '2026-06-14';
const at = (date: string) => `${date}T20:00:00`;

describe('isInDateWindow', () => {
  it('all always matches', () => {
    expect(isInDateWindow(at('2027-01-01'), 'all', MON)).toBe(true);
  });

  it('today matches only the current NYC date', () => {
    expect(isInDateWindow(at('2026-06-15'), 'today', MON)).toBe(true);
    expect(isInDateWindow(at('2026-06-16'), 'today', MON)).toBe(false);
  });

  it('weekend matches the coming Saturday and Sunday', () => {
    expect(isInDateWindow(at('2026-06-20'), 'weekend', MON)).toBe(true); // Sat
    expect(isInDateWindow(at('2026-06-21'), 'weekend', MON)).toBe(true); // Sun
    expect(isInDateWindow(at('2026-06-19'), 'weekend', MON)).toBe(false); // Fri
  });

  it('on Sunday, weekend is just that Sunday (no jump to next week)', () => {
    expect(isInDateWindow(at('2026-06-14'), 'weekend', SUN)).toBe(true);
    expect(isInDateWindow(at('2026-06-20'), 'weekend', SUN)).toBe(false);
  });

  it('week spans today through the next six days inclusive', () => {
    expect(isInDateWindow(at('2026-06-15'), 'week', MON)).toBe(true);
    expect(isInDateWindow(at('2026-06-21'), 'week', MON)).toBe(true); // day 6
    expect(isInDateWindow(at('2026-06-22'), 'week', MON)).toBe(false); // day 7
  });

  it('a specific YYYY-MM-DD matches only that day', () => {
    expect(isInDateWindow(at('2026-06-18'), '2026-06-18', MON)).toBe(true);
    expect(isInDateWindow(at('2026-06-19'), '2026-06-18', MON)).toBe(false);
  });

  it('never matches a date before today, regardless of window', () => {
    expect(isInDateWindow(at('2026-06-14'), 'today', MON)).toBe(false);
    expect(isInDateWindow(at('2026-06-14'), 'week', MON)).toBe(false);
  });
});

describe('weekendDates', () => {
  it('returns Saturday and Sunday from a weekday', () => {
    expect(weekendDates(MON)).toEqual(['2026-06-20', '2026-06-21']);
  });
  it('returns only Sunday when today is Sunday', () => {
    expect(weekendDates(SUN)).toEqual(['2026-06-14']);
  });
});
