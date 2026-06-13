import { describe, it, expect } from 'vitest';
import { normalizeParksEvent } from './nycParks';

describe('normalizeParksEvent', () => {
  it('normalizes a Parks concert RSS item into a free music Event', () => {
    // Shape produced by parsing one <item> of the NYC Parks events RSS feed.
    const raw = {
      guid: '2200001',
      title: 'Charlie Parker Jazz Festival',
      link: 'http://www.nycgovparks.org/events/2026/08/23/charlie-parker-jazz-festival',
      startdate: '2026-08-23',
      enddate: '2026-08-23',
      starttime: '3:00 pm',
      endtime: '7:00 pm',
      location: 'Marcus Garvey Park',
      categories: 'Best for Kids | Concerts | Free Summer Concerts',
      coordinates: '40.80230, -73.94209', // Harlem, Manhattan
    };

    const event = normalizeParksEvent(raw);

    expect(event).toEqual({
      id: 'nyc-parks:2200001',
      title: 'Charlie Parker Jazz Festival',
      category: 'music',
      borough: 'Manhattan',
      venue: 'Marcus Garvey Park',
      start: '2026-08-23T15:00:00',
      end: '2026-08-23T19:00:00',
      isFree: true,
      url: 'http://www.nycgovparks.org/events/2026/08/23/charlie-parker-jazz-festival',
      source: 'nyc-parks',
    });
  });

  function eventWithCategories(categories: string) {
    return normalizeParksEvent({
      guid: '1',
      title: 'x',
      link: 'x',
      startdate: '2026-08-23',
      enddate: '2026-08-23',
      starttime: '1:00 pm',
      endtime: '2:00 pm',
      location: 'x',
      categories,
      coordinates: '40.80230, -73.94209',
    });
  }

  it.each([
    ['Markets | Best for Kids', 'food'],
    ['Food | Festivals', 'food'],
    ['Basketball/Netball | Sports', 'sports'],
    ['Fitness | Exercise Classes', 'sports'],
    ['Best for Kids | Arts & Crafts', 'other'],
    ['Sports | Concerts', 'music'], // music outranks sports
    ['Markets | Free Summer Concerts', 'music'], // music outranks food
    ['Sports | Food', 'food'], // food outranks sports
  ])('maps categories "%s" to %s', (categories, expected) => {
    expect(eventWithCategories(categories)!.category).toBe(expected);
  });

  function eventAt(coordinates: string) {
    return normalizeParksEvent({
      guid: '1',
      title: 'x',
      link: 'x',
      startdate: '2026-08-23',
      enddate: '2026-08-23',
      starttime: '1:00 pm',
      endtime: '2:00 pm',
      location: 'x',
      categories: 'Nature',
      coordinates,
    });
  }

  it.each([
    ['40.67820, -73.97720', 'Brooklyn'],
    ['40.74980, -73.79760', 'Queens'],
    ['40.82960, -73.92620', 'Bronx'],
  ])('places coordinates %s in %s', (coordinates, expected) => {
    expect(eventAt(coordinates)!.borough).toBe(expected);
  });

  it.each([
    ['Staten Island', '40.57950, -74.15020'],
    ['outside NYC (Newark)', '40.73570, -74.17240'],
  ])('drops events outside the four boroughs (%s)', (_label, coordinates) => {
    expect(eventAt(coordinates)).toBeNull();
  });
});
