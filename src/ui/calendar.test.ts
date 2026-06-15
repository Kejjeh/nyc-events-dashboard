import { describe, it, expect } from 'vitest';
import type { Event } from '../domain/event';
import { googleCalendarUrl, toIcs } from './calendar';

const base: Event = {
  id: 'dice:123',
  title: 'Jazz Quartet, Live',
  category: 'music',
  borough: 'Brooklyn',
  neighborhood: 'Williamsburg',
  venue: 'Some Club; Backroom',
  start: '2026-06-15T20:00:00',
  isFree: true,
  url: 'https://example.com/e/123',
  source: 'dice',
};

describe('googleCalendarUrl', () => {
  it('defaults the end to two hours after start and tags the NYC timezone', () => {
    const url = new URL(googleCalendarUrl(base));
    expect(url.hostname).toBe('calendar.google.com');
    expect(url.searchParams.get('text')).toBe('Jazz Quartet, Live');
    expect(url.searchParams.get('dates')).toBe('20260615T200000/20260615T220000');
    expect(url.searchParams.get('ctz')).toBe('America/New_York');
    expect(url.searchParams.get('location')).toBe('Some Club; Backroom, Williamsburg, Brooklyn, NY');
  });

  it('uses an explicit end time when present', () => {
    const url = new URL(googleCalendarUrl({ ...base, end: '2026-06-15T23:30:00' }));
    expect(url.searchParams.get('dates')).toBe('20260615T200000/20260615T233000');
  });

  it('treats a date-only event as all-day spanning to the next day', () => {
    const url = new URL(googleCalendarUrl({ ...base, start: '2026-06-15', end: undefined }));
    expect(url.searchParams.get('dates')).toBe('20260615/20260616');
    expect(url.searchParams.get('ctz')).toBeNull();
  });
});

describe('toIcs', () => {
  const ics = toIcs(base, '2026-06-10T12:00:00.000Z');

  it('produces a valid single-event calendar', () => {
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('BEGIN:VEVENT');
    expect(ics).toContain('UID:dice:123@nyc-events');
    expect(ics).toContain('DTSTAMP:20260610T120000Z');
    expect(ics).toContain('DTSTART;TZID=America/New_York:20260615T200000');
    expect(ics).toContain('DTEND;TZID=America/New_York:20260615T220000');
    expect(ics).toContain('URL:https://example.com/e/123');
    expect(ics.endsWith('END:VCALENDAR')).toBe(true);
  });

  it('escapes commas and semicolons in text fields', () => {
    expect(ics).toContain('SUMMARY:Jazz Quartet\\, Live');
    expect(ics).toContain('Some Club\\; Backroom');
  });

  it('emits an all-day VEVENT for a date-only event', () => {
    const allDay = toIcs({ ...base, start: '2026-06-15', end: undefined }, '2026-06-10T12:00:00Z');
    expect(allDay).toContain('DTSTART;VALUE=DATE:20260615');
    expect(allDay).toContain('DTEND;VALUE=DATE:20260616');
  });

  it('keeps a timed start timed when the end is date-only (no invalid VALUE=DATE)', () => {
    const mixed = toIcs({ ...base, end: '2026-06-16' }, '2026-06-10T12:00:00Z');
    expect(mixed).toContain('DTSTART;TZID=America/New_York:20260615T200000');
    // The date-only end is coerced to a timestamp (start + 2h), never VALUE=DATE.
    expect(mixed).toContain('DTEND;TZID=America/New_York:20260615T220000');
    expect(mixed).not.toContain('VALUE=DATE');
  });

  it('folds content lines to 75 octets per RFC 5545', () => {
    const longTitle = 'A Very Long Event Title That Comfortably Exceeds Seventy Five Octets ' + 'x'.repeat(40);
    const ics = toIcs({ ...base, title: longTitle }, '2026-06-10T12:00:00Z');
    const enc = new TextEncoder();
    for (const line of ics.split('\r\n')) {
      expect(enc.encode(line).length).toBeLessThanOrEqual(75);
    }
    // Continuation lines begin with a single space.
    expect(ics).toMatch(/\r\n /);
  });
});
