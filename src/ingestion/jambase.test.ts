import { describe, it, expect } from 'vitest';
import { normalizeJamBaseEvent } from './jambase';

// Venue coords (40.7308, -74.0027) resolve to Manhattan / West Village.
const concert = {
  '@type': 'Concert',
  identifier: 'jambase:15345592',
  name: 'Rosalía at The Venue',
  url: 'https://www.jambase.com/show/rosalia-the-venue-20260704',
  image: 'https://www.jambase.com/img/rosalia.jpg',
  eventStatus: 'scheduled',
  startDate: '2026-07-04T20:00:00',
  endDate: '2026-07-04',
  isAccessibleForFree: false,
  location: {
    '@type': 'Venue',
    name: 'The Venue',
    geo: { '@type': 'GeoCoordinates', latitude: 40.7308, longitude: -74.0027 },
    address: { addressLocality: 'New York' },
  },
  performer: [
    { '@type': 'MusicGroup', name: 'Rosalía' },
    { '@type': 'MusicGroup', name: 'Support Act' },
  ],
};

describe('normalizeJamBaseEvent', () => {
  it('normalizes a concert into a Manhattan music event titled by the headliner', () => {
    expect(normalizeJamBaseEvent(concert)).toEqual({
      id: 'jambase:15345592',
      title: 'Rosalía',
      category: 'music',
      city: 'New York',
      state: 'NY',
      borough: 'Manhattan',
      neighborhood: 'West Village',
      venue: 'The Venue',
      start: '2026-07-04T20:00:00',
      isFree: false,
      url: 'https://www.jambase.com/show/rosalia-the-venue-20260704',
      source: 'jambase',
      image: 'https://www.jambase.com/img/rosalia.jpg',
      lat: 40.7308,
      lon: -74.0027,
    });
  });

  it('captures a non-NYC metro (Boston) with a city + state and no borough', () => {
    const event = normalizeJamBaseEvent({
      ...concert,
      location: {
        name: 'Boston Venue',
        geo: { latitude: 42.3601, longitude: -71.0589 },
        address: { addressRegion: { alternateName: 'MA' } },
      },
    })!;
    expect(event.city).toBe('Boston');
    expect(event.state).toBe('MA');
    expect(event.borough).toBeUndefined();
    expect(event.neighborhood).toBeUndefined();
    expect(event.venue).toBe('Boston Venue');
  });

  it('captures a non-metro city + state straight from the venue address', () => {
    const event = normalizeJamBaseEvent({
      ...concert,
      location: {
        name: 'The Palladium',
        geo: { latitude: 42.2626, longitude: -71.8023 },
        address: { addressLocality: 'Worcester', addressRegion: { identifier: 'US-MA', alternateName: 'MA' } },
      },
    })!;
    expect(event.city).toBe('Worcester');
    expect(event.state).toBe('MA');
    expect(event.borough).toBeUndefined();
    expect(event.venue).toBe('The Palladium');
  });

  it('maps isAccessibleForFree to isFree', () => {
    expect(normalizeJamBaseEvent({ ...concert, isAccessibleForFree: true })!.isFree).toBe(true);
  });

  it('drops cancelled shows', () => {
    expect(normalizeJamBaseEvent({ ...concert, eventStatus: 'cancelled' })).toBeNull();
  });

  it('drops events whose venue has no coordinates', () => {
    expect(
      normalizeJamBaseEvent({ ...concert, location: { name: 'X', geo: {} } }),
    ).toBeNull();
  });

  it('drops an event with no resolvable city (no borough, no address locality)', () => {
    expect(
      normalizeJamBaseEvent({
        ...concert,
        location: { name: 'Nowhere', geo: { latitude: 40.5795, longitude: -74.1502 } },
      }),
    ).toBeNull();
  });

  it('handles a location delivered as an array', () => {
    const event = normalizeJamBaseEvent({ ...concert, location: [concert.location] })!;
    expect(event.venue).toBe('The Venue');
    expect(event.borough).toBe('Manhattan');
  });

  it('appends a midnight time to a date-only startDate', () => {
    expect(normalizeJamBaseEvent({ ...concert, startDate: '2026-07-04' })!.start).toBe('2026-07-04T00:00:00');
  });

  it('falls back to the event name when there are no performers', () => {
    const event = normalizeJamBaseEvent({ ...concert, performer: [] })!;
    expect(event.title).toBe('Rosalía at The Venue');
  });

  it('drops a record with no identifier', () => {
    const { identifier, ...noId } = concert;
    expect(normalizeJamBaseEvent(noId)).toBeNull();
  });
});
