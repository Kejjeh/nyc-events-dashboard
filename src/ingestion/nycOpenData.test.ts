import { describe, it, expect } from 'vitest';
import { normalizeNycOpenDataEvent } from './nycOpenData';

describe('normalizeNycOpenDataEvent', () => {
  it('normalizes a permitted Brooklyn street event into a free Event', () => {
    const raw = {
      event_id: '740679',
      event_name: 'Summer Stroll on Third Avenue',
      start_date_time: '2026-07-10T12:00:00.000',
      end_date_time: '2026-07-10T18:00:00.000',
      event_type: 'Street Event',
      event_borough: 'Brooklyn',
      event_location: '3 Avenue between 86 Street and 95 Street',
    };

    const event = normalizeNycOpenDataEvent(raw);

    expect(event).toEqual({
      id: 'nyc-open-data:740679',
      title: 'Summer Stroll on Third Avenue',
      category: 'other',
      borough: 'Brooklyn',
      venue: '3 Avenue between 86 Street and 95 Street',
      start: '2026-07-10T12:00:00.000',
      end: '2026-07-10T18:00:00.000',
      isFree: true,
      url: 'https://www.nyc.gov/site/cecm/about/events.page',
      source: 'nyc-open-data',
    });
  });

  it('returns null for an event outside the four target boroughs (Staten Island)', () => {
    const raw = {
      event_id: '999001',
      event_name: 'St. George Waterfront Festival',
      start_date_time: '2026-07-12T11:00:00.000',
      end_date_time: '2026-07-12T17:00:00.000',
      event_type: 'Street Event',
      event_borough: 'Staten Island',
      event_location: 'St. George Terminal',
    };

    expect(normalizeNycOpenDataEvent(raw)).toBeNull();
  });
});
