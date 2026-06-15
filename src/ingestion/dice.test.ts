import { describe, it, expect } from 'vitest';
import { normalizeDiceEvent } from './dice';

describe('normalizeDiceEvent', () => {
  it('normalizes a free DICE comedy event into a Brooklyn comedy Event', () => {
    const raw = {
      id: '6a0262ac3f4f0c0001e380b8',
      name: 'SWer Open Mic Pride',
      perm_name: 'swer-open-mic-pride',
      dates: {
        timezone: 'America/New_York',
        event_start_date: '2026-06-14T21:00:00-04:00',
        event_end_date: '2026-06-15T01:00:00-04:00',
      },
      price: { currency: 'USD', amount: 0, amount_from: null },
      tags_types: [{ name: 'comedy', value: 'culture:comedy', title: 'Comedy' }],
      venues: [
        {
          name: 'ALPHAVILLE',
          address: '140 Wilson Ave, New York, New York 11237', // label says "New York" but it's Brooklyn
          location: { lat: 40.700486, lng: -73.925855 },
          city: { name: 'New York' },
        },
      ],
    };

    expect(normalizeDiceEvent(raw)).toEqual({
      id: 'dice:6a0262ac3f4f0c0001e380b8',
      title: 'SWer Open Mic Pride',
      category: 'comedy',
      borough: 'Brooklyn',
      neighborhood: 'Bushwick (West)',
      venue: 'ALPHAVILLE',
      start: '2026-06-14T21:00:00',
      end: '2026-06-15T01:00:00',
      isFree: true,
      url: 'https://dice.fm/event/swer-open-mic-pride',
      source: 'dice',
    });
  });

  it('reads the lowest tier price for a multi-tier event (amount null, amount_from set)', () => {
    const event = normalizeDiceEvent({
      id: '6b1373bd4a5a1d0002f491c9',
      name: 'SOMEWHERE FUNNY, NOWHERE SERIOUS!',
      perm_name: 'somewhere-funny-nowhere-serious',
      dates: { event_start_date: '2026-06-20T19:30:00-04:00', event_end_date: '2026-06-20T21:00:00-04:00' },
      price: { currency: 'USD', amount: null, amount_from: 2656 },
      tags_types: [{ name: 'comedy', value: 'culture:comedy', title: 'Comedy' }],
      venues: [
        {
          name: 'The Grisly Pear',
          address: '107 MacDougal St, New York, New York 10012',
          location: { lat: 40.7308, lng: -74.0027 },
          city: { name: 'New York' },
        },
      ],
    });

    expect(event).not.toBeNull();
    expect(event!.borough).toBe('Manhattan');
    expect(event!.isFree).toBe(false);
    expect(event!.priceMin).toBe(26.56);
  });

  it('reads the single price (amount set, amount_from null)', () => {
    const event = normalizeDiceEvent({
      id: 'singleprice00000000000000',
      name: 'Paid Showcase',
      perm_name: 'paid-showcase',
      dates: { event_start_date: '2026-06-20T20:00:00-04:00' },
      price: { currency: 'USD', amount: 2000, amount_from: null },
      tags_types: [{ value: 'culture:comedy' }],
      venues: [{ name: 'X', location: { lat: 40.7308, lng: -74.0027 } }],
    });
    expect(event!.isFree).toBe(false);
    expect(event!.priceMin).toBe(20);
    expect(event!.end).toBeUndefined();
  });

  it.each([
    ['culture:comedy', 'comedy'],
    ['culture:theatre', 'theater'],
    ['culture:film', 'film'],
    ['culture:sport', 'sports'],
    ['music:gig', 'music'],
    ['music:dj', 'music'],
    ['music:party', 'music'],
    ['culture:art', 'other'],
    ['culture:talks', 'other'],
  ])('maps DICE tag %s to category %s', (tagValue, expected) => {
    const event = normalizeDiceEvent({
      id: 'x',
      name: 'x',
      perm_name: 'x',
      dates: { event_start_date: '2026-06-20T20:00:00-04:00' },
      price: { amount: 0, amount_from: null },
      tags_types: [{ value: tagValue }],
      venues: [{ name: 'X', location: { lat: 40.7308, lng: -74.0027 } }],
    });
    expect(event!.category).toBe(expected);
  });

  it('defaults a non-comedy tag to the other category', () => {
    const event = normalizeDiceEvent({
      id: 'arttag000000000000000000',
      name: 'Gallery Thing',
      perm_name: 'gallery-thing',
      dates: { event_start_date: '2026-06-20T20:00:00-04:00' },
      price: { amount: 0, amount_from: null },
      tags_types: [{ value: 'culture:art' }],
      venues: [{ name: 'X', location: { lat: 40.7308, lng: -74.0027 } }],
    });
    expect(event!.category).toBe('other');
  });

  it('skips events outside the four target boroughs (Staten Island / missing location)', () => {
    const staten = normalizeDiceEvent({
      id: 'si0000000000000000000000',
      name: 'SI Show',
      perm_name: 'si-show',
      dates: { event_start_date: '2026-06-20T20:00:00-04:00' },
      price: { amount: 0, amount_from: null },
      tags_types: [{ value: 'culture:comedy' }],
      venues: [{ name: 'X', location: { lat: 40.5795, lng: -74.1502 } }],
    });
    expect(staten).toBeNull();

    const noLoc = normalizeDiceEvent({
      id: 'noloc00000000000000000000',
      name: 'No Location',
      perm_name: 'no-location',
      dates: { event_start_date: '2026-06-20T20:00:00-04:00' },
      price: { amount: 0, amount_from: null },
      tags_types: [{ value: 'culture:comedy' }],
      venues: [{ name: 'X' }],
    });
    expect(noLoc).toBeNull();
  });
});
