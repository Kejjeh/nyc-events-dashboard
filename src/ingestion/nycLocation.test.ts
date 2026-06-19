import { describe, expect, it } from 'vitest';
import { nycLocationFromLatLng } from './nycLocation';

// A real Bronx point (Parkchester area) used elsewhere in the test suite — it
// falls inside both a borough polygon and an NTA neighborhood polygon.
const BRONX_LAT = 40.8387;
const BRONX_LON = -73.8607;

describe('nycLocationFromLatLng', () => {
  it('resolves an in-NYC point to its borough and neighborhood', () => {
    const loc = nycLocationFromLatLng(BRONX_LAT, BRONX_LON);

    expect(loc?.borough).toBe('Bronx');
    expect(typeof loc?.neighborhood).toBe('string');
  });

  it('returns null for a point outside the four boroughs', () => {
    // Mid-Atlantic ocean — inside no borough polygon, no fallback supplied.
    expect(nycLocationFromLatLng(38.0, -74.0)).toBeNull();
  });

  it('falls back to the supplied borough when the polygon lookup misses', () => {
    const loc = nycLocationFromLatLng(38.0, -74.0, 'Manhattan');

    expect(loc?.borough).toBe('Manhattan');
    // No NTA polygon contains the fallback point, so neighborhood stays absent.
    expect(loc?.neighborhood).toBeUndefined();
  });
});
