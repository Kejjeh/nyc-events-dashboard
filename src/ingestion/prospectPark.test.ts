import { describe, it, expect } from 'vitest';
import { normalizeProspectParkEvent } from './prospectPark';

const base = {
  id: 9001,
  title: 'Celebrate Brooklyn! Opening Night',
  start_date: '2026-07-10 19:30:00',
  end_date: '2026-07-10 22:00:00',
  cost: 'Free',
  url: 'https://www.prospectpark.org/events/opening-night/',
  venue: {},
  categories: [{ name: 'Concerts' }],
};

describe('normalizeProspectParkEvent', () => {
  it('normalizes a free concert into a Brooklyn music event anchored to the park', () => {
    const event = normalizeProspectParkEvent(base)!;
    expect(event).toMatchObject({
      id: 'prospectpark:9001',
      title: 'Celebrate Brooklyn! Opening Night',
      category: 'music',
      borough: 'Brooklyn',
      venue: 'Prospect Park',
      start: '2026-07-10T19:30:00',
      end: '2026-07-10T22:00:00',
      isFree: true,
      url: 'https://www.prospectpark.org/events/opening-night/',
      source: 'prospectpark',
      lat: 40.6602,
      lon: -73.969,
    });
  });

  it('treats "Free, Registration Required" as free', () => {
    const event = normalizeProspectParkEvent({ ...base, cost: 'Free, Registration Required' })!;
    expect(event.isFree).toBe(true);
    expect(event.priceMin).toBeUndefined();
  });

  it('parses the lowest dollar amount from a price range', () => {
    const event = normalizeProspectParkEvent({ ...base, cost: '$3 – $13' })!;
    expect(event.isFree).toBe(false);
    expect(event.priceMin).toBe(3);
  });

  it('maps family/kids programming to the kids category', () => {
    const event = normalizeProspectParkEvent({
      ...base,
      title: 'Lullaby Hour for Toddlers',
      categories: [{ name: 'Family' }],
    })!;
    expect(event.category).toBe('kids');
  });

  it('maps fitness programming to the sports category', () => {
    const event = normalizeProspectParkEvent({
      ...base,
      title: 'Morning Yoga on the Long Meadow',
      categories: [{ name: 'Wellness' }],
    })!;
    expect(event.category).toBe('sports');
  });

  it('does not mislabel a non-musical "performance" as music', () => {
    const event = normalizeProspectParkEvent({
      ...base,
      title: 'Modern Dance Performance',
      categories: [{ name: 'Performances' }],
    })!;
    expect(event.category).toBe('other');
  });

  it('falls back to "other" for general park programming', () => {
    const event = normalizeProspectParkEvent({
      ...base,
      title: 'Volunteer Cleanup Day',
      categories: [{ name: 'Volunteer' }],
    })!;
    expect(event.category).toBe('other');
  });

  it('uses a named sub-venue when the feed provides one', () => {
    const event = normalizeProspectParkEvent({
      ...base,
      venue: { venue: 'LeFrak Center at Lakeside' },
    })!;
    expect(event.venue).toBe('LeFrak Center at Lakeside');
  });

  it('decodes HTML entities in the title', () => {
    const event = normalizeProspectParkEvent({ ...base, title: 'Jazz &#038; Blues &#8211; Night' })!;
    expect(event.title).toBe('Jazz & Blues – Night');
  });

  it('drops a record with a missing start_date instead of crashing', () => {
    const { start_date, ...noStart } = base;
    expect(normalizeProspectParkEvent(noStart)).toBeNull();
  });

  it('drops a record with no id', () => {
    const { id, ...noId } = base;
    expect(normalizeProspectParkEvent(noId)).toBeNull();
  });
});
