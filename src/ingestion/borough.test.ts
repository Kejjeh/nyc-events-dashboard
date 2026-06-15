import { describe, it, expect } from 'vitest';
import { boroughFromLatLng, pointInRing } from './borough';

describe('boroughFromLatLng', () => {
  it.each([
    [40.7308, -74.0027, 'Manhattan'], // West Village
    [40.700486, -73.925855, 'Brooklyn'], // Bushwick
    [40.749869, -73.862726, 'Queens'], // Corona
    [40.8448, -73.8648, 'Bronx'], // West Bronx
  ])('places (%s, %s) in %s', (lat, lon, expected) => {
    expect(boroughFromLatLng(lat, lon)).toBe(expected);
  });

  it('returns null outside the four boroughs and for bad input', () => {
    expect(boroughFromLatLng(40.5795, -74.1502)).toBeNull(); // Staten Island
    expect(boroughFromLatLng(40.7128, -74.456)).toBeNull(); // New Jersey
    expect(boroughFromLatLng(NaN, NaN)).toBeNull();
  });
});

describe('pointInRing', () => {
  // A unit square; the ring takes [lon, lat] vertices.
  const square = [
    [0, 0],
    [2, 0],
    [2, 2],
    [0, 2],
    [0, 0],
  ];

  it('takes (lon, lat) order — a point inside the square is inside', () => {
    expect(pointInRing(1, 1, square)).toBe(true);
  });

  it('reports points outside the ring as outside', () => {
    expect(pointInRing(3, 1, square)).toBe(false);
    expect(pointInRing(-1, 1, square)).toBe(false);
  });
});
