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
      'nyc-open-data:early:2026-08-15T12:00:00.000',
      'ticketmaster:tmLate',
    ]);
  });

  it('deduplicates events by id (sources can repeat ids)', () => {
    const batches = [
      {
        source: 'nyc-open-data' as const,
        records: [
          {
            event_id: 'dup',
            event_name: 'Repeated Permit',
            start_date_time: '2026-08-01T12:00:00.000',
            event_type: 'Street Event',
            event_borough: 'Queens',
            event_location: 'Somewhere',
          },
          {
            event_id: 'dup',
            event_name: 'Repeated Permit',
            start_date_time: '2026-08-01T12:00:00.000',
            event_type: 'Street Event',
            event_borough: 'Queens',
            event_location: 'Somewhere',
          },
        ],
      },
    ];
    const events = assembleEvents(batches);
    expect(events).toHaveLength(1);
  });

  it('skips records that normalize to an unusable start instead of throwing', () => {
    const batches = [
      {
        source: 'nyc-open-data' as const,
        records: [
          { event_id: 'ok', event_name: 'Good', start_date_time: '2026-08-01T12:00:00.000', event_type: 'x', event_borough: 'Queens', event_location: 'p' },
          { event_id: 'bad', event_name: 'No Start', event_type: 'x', event_borough: 'Queens', event_location: 'p' },
        ],
      },
    ];
    const events = assembleEvents(batches);
    expect(events.map((e) => e.id)).toEqual(['nyc-open-data:ok:2026-08-01T12:00:00.000']);
  });
});
