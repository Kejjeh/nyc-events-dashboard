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
      lat: 40.700486,
      lon: -73.925855,
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
    ['culture:art', 'museum'],
    ['culture:social', 'social'],
    ['culture:talks', 'social'],
    ['culture:wellbeing', 'social'],
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

  it('defaults an unmapped tag to the other category', () => {
    const event = normalizeDiceEvent({
      id: 'unkn0000000000000000000000',
      name: 'Mystery Thing',
      perm_name: 'mystery-thing',
      dates: { event_start_date: '2026-06-20T20:00:00-04:00' },
      price: { amount: 0, amount_from: null },
      tags_types: [{ value: 'culture:somethingnew' }],
      venues: [{ name: 'X', location: { lat: 40.7308, lng: -74.0027 } }],
    });
    expect(event!.category).toBe('other');
  });

  // In ~Aug 2026 DICE's browse payload dropped venues[].location, tags_types,
  // and perm_name. Borough now parses from the street address, category comes
  // from the browse filter the fetcher stamps on, and the URL falls back to the
  // event id (dice.fm/event/<id> 308-redirects to the canonical slug page).
  it('normalizes a current-shape payload (no coords/tags/perm_name)', () => {
    // Faithful to the live music/gig payload of 2026-09-04.
    const raw = {
      id: '6997d5272ec01e00017937d8',
      name: 'Rooftop Gig',
      status: 'on-sale',
      images: { square: 'https://dice-media.imgix.net/x.jpg' },
      dates: {
        timezone: 'America/New_York',
        event_start_date: '2026-09-12T21:00:00-04:00',
        event_end_date: '2026-09-13T01:00:00-04:00',
      },
      venues: [
        {
          id: '12013',
          name: 'Elsewhere',
          address: '63 Grand Street, Brooklyn, New York 11249, United States',
          city: { name: 'New York', location: { lat: 40.7127281, lng: -74.0060152 } },
        },
      ],
      price: { currency: 'USD', amount: null, amount_from: 2500 },
      event_tag: null,
      browse_filter: 'music/gig',
    };

    expect(normalizeDiceEvent(raw)).toEqual({
      id: 'dice:6997d5272ec01e00017937d8',
      title: 'Rooftop Gig',
      category: 'music',
      borough: 'Brooklyn',
      venue: 'Elsewhere',
      start: '2026-09-12T21:00:00',
      end: '2026-09-13T01:00:00',
      isFree: false,
      priceMin: 25,
      url: 'https://dice.fm/event/6997d5272ec01e00017937d8',
      source: 'dice',
    });
  });

  it.each([
    ['30 Rockefeller Plaza, Concourse Level, New York City, New York 10112, United States', 'Manhattan'],
    ['108-10 Rockaway Beach Drive, Queens, New York 11694, United States', 'Queens'],
    ['251 Bushwick Avenue, Brooklyn, New York 11206, United States', 'Brooklyn'],
    ['1 Grand Concourse, The Bronx, New York 10451, United States', 'Bronx'],
    // Abbreviated-state variant, and Queens postal style (neighborhood as city).
    ['325 Franklin Ave, Brooklyn, NY 11238, USA', 'Brooklyn'],
    ['112 W 25th St, New York, NY 10001, USA', 'Manhattan'],
    ['11-01 43rd Avenue, Long Island City, New York 11101, United States', 'Queens'],
    ['68-38 Forest Avenue, Storefront B, Ridgewood, New York 11385, United States', 'Queens'],
    ['52-19 Flushing Ave, Maspeth, NY 11378, USA', 'Queens'],
  ])('parses the borough out of address %s', (address, borough) => {
    const event = normalizeDiceEvent({
      id: 'x',
      name: 'x',
      dates: { event_start_date: '2026-09-20T20:00:00-04:00' },
      price: { amount: 0, amount_from: null },
      venues: [{ name: 'X', address }],
      browse_filter: 'culture/comedy',
    });
    expect(event!.borough).toBe(borough);
  });

  it('drops addresses outside NYC or in Staten Island (no coords to check)', () => {
    for (const address of [
      '100 Main Street, Jersey City, New Jersey 07302, United States',
      '75 Stuyvesant Place, Staten Island, New York 10301, United States',
      undefined,
    ]) {
      const event = normalizeDiceEvent({
        id: 'x',
        name: 'x',
        dates: { event_start_date: '2026-09-20T20:00:00-04:00' },
        price: { amount: 0, amount_from: null },
        venues: [{ name: 'X', address }],
        browse_filter: 'music/gig',
      });
      expect(event).toBeNull();
    }
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
