import { describe, it, expect } from 'vitest';
import { normalizeCityParksEvent } from './cityParks';

const concert = {
  id: 30111,
  title: 'SummerStage: Jazz at Marcus Garvey',
  start_date: '2026-07-04 19:00:00',
  end_date: '2026-07-04 21:00:00',
  cost: 'Free',
  url: 'https://cityparksfoundation.org/events/summerstage-jazz/',
  venue: { venue: 'Marcus Garvey Park', geo_lat: '40.80230', geo_lng: '-73.94209', city: 'New York' },
  categories: [{ name: 'SummerStage' }, { name: 'Concerts' }],
};

describe('normalizeCityParksEvent', () => {
  it('normalizes a free SummerStage concert into a Manhattan music Event', () => {
    expect(normalizeCityParksEvent(concert)).toEqual({
      id: 'cityparks:30111',
      title: 'SummerStage: Jazz at Marcus Garvey',
      category: 'music',
      borough: 'Manhattan',
      venue: 'Marcus Garvey Park',
      start: '2026-07-04T19:00:00',
      end: '2026-07-04T21:00:00',
      isFree: true,
      url: 'https://cityparksfoundation.org/events/summerstage-jazz/',
      source: 'cityparks',
    });
  });

  it('falls back to the venue city/name for borough when coordinates are missing', () => {
    const event = normalizeCityParksEvent({
      ...concert,
      categories: [{ name: 'Volunteer' }],
      venue: { venue: 'Forest Park', city: 'Queens' },
    });
    expect(event!.borough).toBe('Queens');
    expect(event!.category).toBe('other'); // non-concert park program
  });

  it('decodes HTML entities in the title and parses a paid cost', () => {
    const event = normalizeCityParksEvent({
      ...concert,
      title: 'Shakespeare &#038; Co. &#8211; Family Night',
      cost: '$25',
    });
    expect(event!.title).toBe('Shakespeare & Co. – Family Night');
    expect(event!.isFree).toBe(false);
    expect(event!.priceMin).toBe(25);
  });

  it('drops events that cannot be placed in one of the four boroughs', () => {
    const event = normalizeCityParksEvent({
      ...concert,
      venue: { venue: 'Somewhere', geo_lat: '40.5795', geo_lng: '-74.1502', city: 'Staten Island' },
    });
    expect(event).toBeNull();
  });
});
