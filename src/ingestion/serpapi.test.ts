import { describe, it, expect } from 'vitest';
import { normalizeSerpApiEvent, parseGoogleEventDate } from './serpapi';

const NOW = '2026-06-16T12:00:00Z'; // NYC: Tue Jun 16 2026

describe('parseGoogleEventDate', () => {
  it('parses "Dec 9" + a PM range to the range START in NYC-local ISO', () => {
    expect(parseGoogleEventDate('Dec 9', 'Dec 9, 8 – 10 PM', NOW)).toBe('2026-12-09T20:00:00');
  });

  it('parses an AM start in a cross-meridiem range', () => {
    expect(parseGoogleEventDate('Dec 9', 'Dec 9, 11 AM – 2 PM', NOW)).toBe('2026-12-09T11:00:00');
  });

  it('handles a leading weekday ("Mon, Dec 9")', () => {
    expect(parseGoogleEventDate('Mon, Dec 9', 'Mon, Dec 9, 7 – 9 PM', NOW)).toBe('2026-12-09T19:00:00');
  });

  it('resolves "Today" and "Tomorrow" against nowIso', () => {
    expect(parseGoogleEventDate('Today', 'Today, 6 PM', NOW)).toBe('2026-06-16T18:00:00');
    expect(parseGoogleEventDate('Tomorrow', 'Tomorrow, 7:30 PM', NOW)).toBe('2026-06-17T19:30:00');
  });

  it('rolls a past-looking month forward to next year (Dec now → Jan next)', () => {
    expect(parseGoogleEventDate('Jan 5', 'Jan 5, 8 PM', NOW)).toBe('2027-01-05T20:00:00');
  });

  it('defaults to midnight when no time is present', () => {
    expect(parseGoogleEventDate('Dec 9', 'Dec 9', NOW)).toBe('2026-12-09T00:00:00');
  });

  it('returns null for an unparseable date', () => {
    expect(parseGoogleEventDate('whenever', '', NOW)).toBeNull();
    expect(parseGoogleEventDate('', '', NOW)).toBeNull();
  });
});

const comedy = {
  title: 'Stand-Up Comedy Night',
  date: { start_date: 'Dec 9', when: 'Dec 9, 8 – 10 PM' },
  address: ['The Comedy Spot, 101 MacDougal St', 'New York, NY'],
  link: 'https://example.com/comedy',
  venue: { name: 'The Comedy Spot' },
  image: 'https://example.com/img.jpg',
  _q: 'Comedy shows in New York',
  _nowIso: NOW,
};

describe('normalizeSerpApiEvent', () => {
  it('normalizes a Google-Events comedy result into a Manhattan event (no coords yet)', () => {
    expect(normalizeSerpApiEvent(comedy)).toEqual({
      id: 'serpapi:stand-up-comedy-night-the-comedy-spot-2026-12-09',
      title: 'Stand-Up Comedy Night',
      category: 'comedy',
      borough: 'Manhattan',
      venue: 'The Comedy Spot',
      start: '2026-12-09T20:00:00',
      isFree: false,
      url: 'https://example.com/comedy',
      source: 'serpapi',
      image: 'https://example.com/img.jpg',
    });
  });

  it('resolves boroughs from the address text', () => {
    const at = (city: string) =>
      normalizeSerpApiEvent({ ...comedy, address: ['Venue, 1 St', city] })?.borough ?? null;
    expect(at('Brooklyn, NY')).toBe('Brooklyn');
    expect(at('Astoria, NY')).toBe('Queens');
    expect(at('Bronx, NY')).toBe('Bronx');
    expect(at('New York, NY')).toBe('Manhattan');
  });

  it('drops events outside the four boroughs', () => {
    expect(normalizeSerpApiEvent({ ...comedy, address: ['V', 'Staten Island, NY'] })).toBeNull();
    expect(normalizeSerpApiEvent({ ...comedy, address: ['V', 'Newark, NJ'] })).toBeNull();
  });

  it('maps the seeding query to a category', () => {
    expect(normalizeSerpApiEvent({ ...comedy, _q: 'Food festivals in New York', title: 'Taco Fest' })!.category).toBe('food');
    expect(normalizeSerpApiEvent({ ...comedy, _q: 'Family events in New York', title: 'Puppet Show' })!.category).toBe('kids');
  });

  it('flags free events from the title', () => {
    expect(normalizeSerpApiEvent({ ...comedy, title: 'Free Outdoor Movie Night' })!.isFree).toBe(true);
  });

  it('drops records missing a title, a parseable date, or a venue', () => {
    expect(normalizeSerpApiEvent({ ...comedy, title: '' })).toBeNull();
    expect(normalizeSerpApiEvent({ ...comedy, date: { start_date: 'soon', when: '' } })).toBeNull();
    expect(normalizeSerpApiEvent({ ...comedy, venue: {}, address: ['', 'New York, NY'] })).toBeNull();
  });
});
