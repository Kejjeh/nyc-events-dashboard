import { useState, useCallback } from 'react';

export type GeoState =
  | { status: 'idle' }
  | { status: 'pending' }
  | { status: 'ok'; lat: number; lon: number }
  | { status: 'denied' };

export function useGeolocation() {
  const [geo, setGeo] = useState<GeoState>({ status: 'idle' });

  const request = useCallback(() => {
    if (!navigator.geolocation) {
      setGeo({ status: 'denied' });
      return;
    }
    setGeo({ status: 'pending' });
    navigator.geolocation.getCurrentPosition(
      (pos) => setGeo({ status: 'ok', lat: pos.coords.latitude, lon: pos.coords.longitude }),
      () => setGeo({ status: 'denied' }),
      { timeout: 10_000 },
    );
  }, []);

  return { geo, request };
}
