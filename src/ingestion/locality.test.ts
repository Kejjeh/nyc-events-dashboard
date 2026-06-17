import { describe, it, expect } from 'vitest';
import { localityFromLatLng } from './locality';

describe('localityFromLatLng', () => {
  it('resolves an NYC point to New York + its borough (precise polygon)', () => {
    expect(localityFromLatLng(40.7308, -74.0027)).toEqual({ city: 'New York', borough: 'Manhattan' });
  });

  it('resolves each Northeast metro center to that city with no borough', () => {
    expect(localityFromLatLng(39.9526, -75.1652)).toEqual({ city: 'Philadelphia' });
    expect(localityFromLatLng(38.9072, -77.0369)).toEqual({ city: 'Washington' });
    expect(localityFromLatLng(42.3601, -71.0589)).toEqual({ city: 'Boston' });
    expect(localityFromLatLng(39.2904, -76.6122)).toEqual({ city: 'Baltimore' });
    expect(localityFromLatLng(42.6526, -73.7562)).toEqual({ city: 'Albany' });
    expect(localityFromLatLng(41.3083, -72.9279)).toEqual({ city: 'New Haven' });
    expect(localityFromLatLng(41.824, -71.4128)).toEqual({ city: 'Providence' });
  });

  it('disambiguates DC/Baltimore overlap by nearest center', () => {
    // A point right at Baltimore's Inner Harbor is within ~its radius and closer
    // to Baltimore than DC, so it must resolve to Baltimore, not Washington.
    expect(localityFromLatLng(39.2854, -76.6083)?.city).toBe('Baltimore');
  });

  it('drops NYC-metro spillover that is not an actual borough (Newark)', () => {
    expect(localityFromLatLng(40.7357, -74.1724)).toBeNull();
  });

  it('returns null far outside every supported metro and for bad input', () => {
    expect(localityFromLatLng(39.0, -80.0)).toBeNull();
    expect(localityFromLatLng(NaN, -74)).toBeNull();
  });
});
