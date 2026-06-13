import { describe, it, expect } from 'vitest';
import { assembleEvents } from './assemble';

describe('assembleEvents', () => {
  it('normalizes batches by source, drops dropped records, and sorts by start', () => {
    const batches = [
      {
        source: 'ticketmaster' as const,
        records: [
          {
            id: 'tmLate',
            name: 'Late Show',
            url: 'https://tm/late',
            dates: { start: { dateTime: '2026-09-01T23:00:00Z' } },
            classifications: [{ segment: { name: 'Music' } }],
            priceRanges: [{ currency: 'USD', min: 20, max: 80 }],
            _embedded: { venues: [{ name: 'MSG', city: { name: 'New York' } }] },
          },
        ],
      },
      {
        source: 'nyc-open-data' as const,
        records: [
          {
            event_id: 'early',
            event_name: 'Morning Market',
            start_date_time: '2026-08-15T12:00:00.000',
            end_date_time: '2026-08-15T16:00:00.000',
            event_type: 'Street Event',
            event_borough: 'Queens',
            event_location: 'Roosevelt Ave',
          },
          {
            event_id: 'siDropped',
            event_name: 'Staten Island Fair',
            start_date_time: '2026-08-01T12:00:00.000',
            event_type: 'Street Event',
            event_borough: 'Staten Island',
            event_location: 'St. George',
          },
        ],
      },
    ];

    const events = assembleEvents(batches);

    expect(events.map((e) => e.id)).toEqual([
      'nyc-open-data:early',
      'ticketmaster:tmLate',
    ]);
  });
});
