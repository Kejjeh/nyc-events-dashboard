import { describe, it, expect } from 'vitest';
import { normalizeVillageVanguardEvent } from './villageVanguard';

describe('normalizeVillageVanguardEvent', () => {
  it('normalizes a SquadUp set into a priced Manhattan jazz Event', () => {
    // Shape the fetcher produces per set: SquadUp event + homepage title/slug.
    const raw = {
      id: 135489,
      title: 'Renee Rosnes Quartet', // proper-case from villagevanguard.com <h1>
      slug: 'renee-rosnes-quartet',
      startAt: '2026-06-09T20:00:00-04:00',
      endAt: '2026-06-09T21:30:00-04:00',
      priceTiers: [
        { name: 'General Admission', price: '45.0' },
        { name: 'Door Sale', price: '45.0' },
      ],
    };

    expect(normalizeVillageVanguardEvent(raw)).toEqual({
      id: 'village-vanguard:135489',
      title: 'Renee Rosnes Quartet',
      category: 'music',
      borough: 'Manhattan',
      neighborhood: 'West Village',
      venue: 'Village Vanguard',
      start: '2026-06-09T20:00:00',
      end: '2026-06-09T21:30:00',
      isFree: false,
      priceMin: 45,
      priceMax: 45,
      url: 'https://vv.squadup.com/artists/renee-rosnes-quartet',
      source: 'village-vanguard',
    });
  });

  it('spans the price range when tiers differ', () => {
    const event = normalizeVillageVanguardEvent({
      id: 1,
      title: 'x',
      slug: 's',
      startAt: '2026-06-16T22:00:00-04:00',
      endAt: '2026-06-16T23:30:00-04:00',
      priceTiers: [
        { name: 'Advance', price: '40.0' },
        { name: 'Door Sale', price: '50.0' },
      ],
    });
    expect(event.priceMin).toBe(40);
    expect(event.priceMax).toBe(50);
  });

  it('title-cases an uppercase act name from the SquadUp data', () => {
    const event = normalizeVillageVanguardEvent({
      id: 3,
      title: 'FRED HERSCH / DREW GRESS / PETER ERSKINE',
      slug: 'fred-hersch',
      startAt: '2026-06-16T20:00:00-04:00',
      endAt: '2026-06-16T21:30:00-04:00',
      priceTiers: [],
    });
    expect(event.title).toBe('Fred Hersch / Drew Gress / Peter Erskine');
  });

  it('omits price fields when no tiers are present', () => {
    const event = normalizeVillageVanguardEvent({
      id: 2,
      title: 'x',
      slug: 's',
      startAt: '2026-06-16T22:00:00-04:00',
      endAt: '2026-06-16T23:30:00-04:00',
      priceTiers: [],
    });
    expect(event.isFree).toBe(false);
    expect(event.priceMin).toBeUndefined();
    expect(event.priceMax).toBeUndefined();
  });
});
