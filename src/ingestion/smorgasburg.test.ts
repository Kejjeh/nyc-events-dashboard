import { describe, it, expect } from 'vitest';
import { normalizeSmorgasburgEvent, smorgasburgMarketDescriptors } from './smorgasburg';

const dayOfWeek = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay();

describe('smorgasburgMarketDescriptors', () => {
  it('generates Saturday Williamsburg and Sunday Prospect Park markets within the horizon', () => {
    const descriptors = smorgasburgMarketDescriptors('2026-07-01T12:00:00Z', 4); // 28 days, in season

    expect(descriptors.length).toBeGreaterThanOrEqual(6); // ~4 Saturdays + ~4 Sundays
    for (const d of descriptors) {
      expect(d.kind).toBe('market');
      expect(d.date >= '2026-07-01' && d.date <= '2026-07-29').toBe(true);
      if (d.location === 'williamsburg') expect(dayOfWeek(d.date)).toBe(6); // Saturday
      else expect(dayOfWeek(d.date)).toBe(0); // Sunday (prospect)
    }
    // sorted by date
    const dates = descriptors.map((d) => d.date);
    expect([...dates].sort()).toEqual(dates);
  });

  it('produces nothing outside the April–October season', () => {
    expect(smorgasburgMarketDescriptors('2026-01-15T12:00:00Z', 4)).toEqual([]);
  });
});

describe('normalizeSmorgasburgEvent', () => {
  it('builds a Williamsburg Saturday market into a free Brooklyn food Event', () => {
    const event = normalizeSmorgasburgEvent({ kind: 'market', location: 'williamsburg', date: '2026-07-04' });
    expect(event).toEqual({
      id: 'smorgasburg:williamsburg:2026-07-04',
      title: 'Smorgasburg Williamsburg',
      category: 'food',
      borough: 'Brooklyn',
      venue: 'Marsha P. Johnson State Park (90 Kent Ave)',
      start: '2026-07-04T11:00:00',
      end: '2026-07-04T18:00:00',
      isFree: true,
      url: 'https://www.smorgasburg.com/',
      source: 'smorgasburg',
    });
  });

  it('builds a Prospect Park Sunday market into a Brooklyn food Event', () => {
    const event = normalizeSmorgasburgEvent({ kind: 'market', location: 'prospect', date: '2026-07-05' });
    expect(event!.id).toBe('smorgasburg:prospect:2026-07-05');
    expect(event!.venue).toBe('Prospect Park (Breeze Hill)');
    expect(event!.borough).toBe('Brooklyn');
  });

  it('normalizes a special event from the Squarespace feed (epoch ms -> ET, borough from coords)', () => {
    const event = normalizeSmorgasburgEvent({
      kind: 'special',
      title: 'Spookysburg',
      fullUrl: '/new-events/2025/10/26/spookysburg',
      startDate: 1761490800363, // 2025-10-26 11:00 ET
      endDate: 1761516000363, // 2025-10-26 18:00 ET
      location: { addressTitle: 'Prospect Park', markerLat: 40.6602037, markerLng: -73.9689558 },
    });
    expect(event).toEqual({
      id: 'smorgasburg:event:/new-events/2025/10/26/spookysburg',
      title: 'Spookysburg',
      category: 'food',
      borough: 'Brooklyn',
      venue: 'Prospect Park',
      start: '2025-10-26T11:00:00',
      end: '2025-10-26T18:00:00',
      isFree: true,
      url: 'https://www.smorgasburg.com/new-events/2025/10/26/spookysburg',
      source: 'smorgasburg',
    });
  });

  it('drops a special event with a missing or invalid start date', () => {
    expect(
      normalizeSmorgasburgEvent({
        kind: 'special',
        title: 'Draft',
        fullUrl: '/x',
        location: { addressTitle: 'Prospect Park', markerLat: 40.6602037, markerLng: -73.9689558 },
      }),
    ).toBeNull();
  });

  it('drops a special event outside the four boroughs (Smorgasburg Miami)', () => {
    const event = normalizeSmorgasburgEvent({
      kind: 'special',
      title: 'Smorgasburg Miami',
      fullUrl: '/new-events/miami',
      startDate: 1761490800363,
      endDate: 1761516000363,
      location: { addressTitle: 'Miami', markerLat: 25.8, markerLng: -80.2 },
    });
    expect(event).toBeNull();
  });
});
