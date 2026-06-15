import { describe, it, expect } from 'vitest';
import { normalizeBplEvent } from './bpl';

const base = {
  _venue: 'Greenpoint Library',
  attributes: {
    drupal_internal__nid: 827198,
    title: 'Repair Cafe NYC',
    field_event_virtual: false,
    field_date: { value: '2026-06-14T13:00:00+00:00', end_value: '2026-06-14T16:00:00+00:00' },
    path: { alias: '/calendar/repair-cafe-nyc-greenpoint-library-20260614-0100pm' },
  },
};

describe('normalizeBplEvent', () => {
  it('normalizes an in-person library program into a free Brooklyn Event', () => {
    expect(normalizeBplEvent(base)).toEqual({
      id: 'bpl:827198',
      title: 'Repair Cafe NYC',
      category: 'other',
      borough: 'Brooklyn',
      venue: 'Greenpoint Library',
      start: '2026-06-14T13:00:00',
      end: '2026-06-14T16:00:00',
      isFree: true,
      url: 'https://www.bklynlibrary.org/calendar/repair-cafe-nyc-greenpoint-library-20260614-0100pm',
      source: 'bpl',
    });
  });

  it('classifies a concert/jazz program as music', () => {
    const event = normalizeBplEvent({
      ...base,
      attributes: { ...base.attributes, title: 'Sunday Jazz Concert' },
    });
    expect(event!.category).toBe('music');
  });

  it('drops virtual (online) programs', () => {
    expect(
      normalizeBplEvent({ ...base, attributes: { ...base.attributes, field_event_virtual: true } }),
    ).toBeNull();
  });

  it('drops a record with no start date', () => {
    expect(
      normalizeBplEvent({ ...base, attributes: { ...base.attributes, field_date: null } }),
    ).toBeNull();
  });

  it('falls back to a generic venue when the branch is unknown', () => {
    const event = normalizeBplEvent({ ...base, _venue: undefined });
    expect(event!.venue).toBe('Brooklyn Public Library');
  });
});
