import { describe, it, expect } from 'vitest';
import { normalizeTicketmasterEvent } from './ticketmaster';

describe('normalizeTicketmasterEvent', () => {
  it('normalizes a Madison Square Garden sports event into a clean Event', () => {
    const raw = {
      id: 'vvG1zZ9abc',
      name: 'New York Knicks vs Boston Celtics',
      url: 'https://www.ticketmaster.com/event/vvG1zZ9abc',
      dates: { start: { dateTime: '2026-06-20T23:00:00Z' } },
      classifications: [{ segment: { name: 'Sports' }, genre: { name: 'Basketball' } }],
      priceRanges: [{ type: 'standard', currency: 'USD', min: 50, max: 350 }],
      _embedded: {
        venues: [
          {
            name: 'Madison Square Garden',
            city: { name: 'New York' },
            address: { line1: '4 Pennsylvania Plaza' },
          },
        ],
      },
    };

    const event = normalizeTicketmasterEvent(raw);

    expect(event).toEqual({
      id: 'ticketmaster:vvG1zZ9abc',
      title: 'New York Knicks vs Boston Celtics',
      category: 'sports',
      borough: 'Manhattan',
      venue: 'Madison Square Garden',
      start: '2026-06-20T19:00:00', // 23:00 UTC -> 19:00 ET, bare local
      isFree: false,
      priceMin: 50,
      priceMax: 350,
      url: 'https://www.ticketmaster.com/event/vvG1zZ9abc',
      source: 'ticketmaster',
    });
  });

  it('classifies a Music-segment event as category music', () => {
    const raw = {
      id: 'vvA2yY8def',
      name: 'Phish at Madison Square Garden',
      url: 'https://www.ticketmaster.com/event/vvA2yY8def',
      dates: { start: { dateTime: '2026-07-04T23:00:00Z' } },
      classifications: [{ segment: { name: 'Music' }, genre: { name: 'Rock' } }],
      priceRanges: [{ type: 'standard', currency: 'USD', min: 75, max: 250 }],
      _embedded: {
        venues: [{ name: 'Madison Square Garden', city: { name: 'New York' } }],
      },
    };

    expect(normalizeTicketmasterEvent(raw)!.category).toBe('music');
  });

  it('classifies a Barclays Center event as Brooklyn', () => {
    const raw = {
      id: 'vvB3xX7ghi',
      name: 'Brooklyn Nets vs Miami Heat',
      url: 'https://www.ticketmaster.com/event/vvB3xX7ghi',
      dates: { start: { dateTime: '2026-08-01T23:00:00Z' } },
      classifications: [{ segment: { name: 'Sports' } }],
      priceRanges: [{ currency: 'USD', min: 40, max: 300 }],
      _embedded: {
        venues: [{ name: 'Barclays Center', city: { name: 'Brooklyn' } }],
      },
    };

    expect(normalizeTicketmasterEvent(raw)!.borough).toBe('Brooklyn');
  });

  it('treats a missing price range as price-unknown, not free', () => {
    const raw = {
      id: 'vvC4wW6jkl',
      name: 'Concert with prices not yet announced',
      url: 'https://www.ticketmaster.com/event/vvC4wW6jkl',
      dates: { start: { dateTime: '2026-08-15T23:00:00Z' } },
      classifications: [{ segment: { name: 'Music' } }],
      _embedded: {
        venues: [{ name: 'Some Hall', city: { name: 'New York' } }],
      },
    };

    const event = normalizeTicketmasterEvent(raw)!;

    expect(event.isFree).toBe(false); // no price ≠ free for a ticketing platform
    expect(event.priceMin).toBeUndefined();
    expect(event.priceMax).toBeUndefined();
  });

  it('marks an explicit $0 price range as free', () => {
    const event = normalizeTicketmasterEvent({
      id: 'vvFree000',
      name: 'Free Show',
      url: 'https://www.ticketmaster.com/event/vvFree000',
      dates: { start: { dateTime: '2026-08-15T23:00:00Z' } },
      classifications: [{ segment: { name: 'Music' } }],
      priceRanges: [{ currency: 'USD', min: 0, max: 0 }],
      _embedded: { venues: [{ name: 'Hall', city: { name: 'New York' } }] },
    })!;
    expect(event.isFree).toBe(true);
  });

  it('resolves borough and neighborhood from venue coordinates', () => {
    const event = normalizeTicketmasterEvent({
      id: 'vvCoord00',
      name: 'Show at a Bushwick venue',
      url: 'https://www.ticketmaster.com/event/vvCoord00',
      dates: { start: { dateTime: '2026-08-15T23:00:00Z' } },
      classifications: [{ segment: { name: 'Music' } }],
      _embedded: {
        venues: [
          {
            name: 'Alphaville',
            city: { name: 'New York' }, // mislabeled "New York" but coords say Brooklyn
            location: { latitude: '40.700486', longitude: '-73.925855' },
          },
        ],
      },
    })!;
    expect(event.borough).toBe('Brooklyn');
    expect(event.neighborhood).toBe('Bushwick (West)');
  });

  it('maps Arts & Theatre to theater, and the Comedy genre to comedy', () => {
    const base = {
      id: 'vvArts000',
      name: 'A Play',
      url: 'https://www.ticketmaster.com/event/vvArts000',
      dates: { start: { dateTime: '2026-08-15T23:00:00Z' } },
      _embedded: { venues: [{ name: 'Theatre', city: { name: 'New York' } }] },
    };
    expect(
      normalizeTicketmasterEvent({ ...base, classifications: [{ segment: { name: 'Arts & Theatre' } }] })!
        .category,
    ).toBe('theater');
    expect(
      normalizeTicketmasterEvent({
        ...base,
        classifications: [{ segment: { name: 'Arts & Theatre' }, genre: { name: 'Comedy' } }],
      })!.category,
    ).toBe('comedy');
  });

  it('drops a date-TBA event that has no start dateTime', () => {
    const raw = {
      id: 'tba1',
      name: 'To Be Announced',
      url: 'https://www.ticketmaster.com/event/tba1',
      dates: { start: { localDate: '2026-09-01' } }, // no dateTime
      classifications: [{ segment: { name: 'Music' } }],
      _embedded: { venues: [{ name: 'TBD', city: { name: 'New York' } }] },
    };
    expect(normalizeTicketmasterEvent(raw)).toBeNull();
  });
});
