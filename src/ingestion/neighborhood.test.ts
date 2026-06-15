import { describe, it, expect } from 'vitest';
import { neighborhoodFromLatLng } from './neighborhood';

describe('neighborhoodFromLatLng', () => {
  it.each([
    [40.700486, -73.925855, 'Bushwick (West)'], // Alphaville, Brooklyn
    [40.7308, -74.0027, 'West Village'], // Manhattan
    [40.749869, -73.862726, 'Corona'], // Queens
  ])('resolves (%s, %s) to %s', (lat, lon, expected) => {
    expect(neighborhoodFromLatLng(lat, lon)).toBe(expected);
  });

  it('returns null outside the four boroughs and for bad input', () => {
    expect(neighborhoodFromLatLng(40.5795, -74.1502)).toBeNull(); // Staten Island
    expect(neighborhoodFromLatLng(NaN, NaN)).toBeNull();
  });

  it('constrains to in-borough NTAs when an expected borough is given', () => {
    const [lat, lon] = [40.700486, -73.925855]; // Alphaville → Bushwick (West), Brooklyn
    expect(neighborhoodFromLatLng(lat, lon, 'Brooklyn')).toBe('Bushwick (West)');
    // The same point must not resolve to a neighborhood tagged to another borough.
    expect(neighborhoodFromLatLng(lat, lon, 'Queens')).toBeNull();
  });
});
