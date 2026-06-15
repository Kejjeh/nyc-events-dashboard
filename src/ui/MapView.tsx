import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { Event } from '../domain/event';

const MAPTILER_KEY = (import.meta as any).env?.VITE_MAPTILER_API_KEY as string | undefined;

const CATEGORY_COLOR: Record<string, string> = {
  music: '#a78bfa',
  sports: '#60a5fa',
  theater: '#f59e0b',
  food: '#f97316',
  comedy: '#facc15',
  museum: '#818cf8',
  social: '#4ade80',
  kids: '#f472b6',
  film: '#f43f5e',
  other: '#94a3b8',
};

function buildGeoJSON(events: Event[]) {
  return {
    type: 'FeatureCollection' as const,
    features: events
      .filter((e) => e.lat != null && e.lon != null)
      .map((e) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [e.lon!, e.lat!] },
        properties: {
          id: e.id,
          title: e.title,
          url: e.url,
          venue: e.venue,
          color: CATEGORY_COLOR[e.category] ?? CATEGORY_COLOR.other,
        },
      })),
  };
}

interface Props {
  events: Event[];
}

export function MapView({ events }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const loadedRef = useRef(false);
  // Always-current snapshot for the load callback (avoids stale closure).
  const eventsRef = useRef(events);
  eventsRef.current = events;

  // Initialize map once on mount.
  useEffect(() => {
    if (!containerRef.current || !MAPTILER_KEY) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: `https://api.maptiler.com/maps/streets-v2/style.json?key=${MAPTILER_KEY}`,
      center: [-73.97, 40.73],
      zoom: 11,
      attributionControl: false,
    });
    mapRef.current = map;
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');
    map.addControl(new maplibregl.NavigationControl(), 'top-right');

    map.on('load', () => {
      loadedRef.current = true;
      const geojson = buildGeoJSON(eventsRef.current);

      map.addSource('events', { type: 'geojson', data: geojson, cluster: true, clusterRadius: 40 });

      // Cluster circles
      map.addLayer({
        id: 'clusters',
        type: 'circle',
        source: 'events',
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': 'var(--accent, #6366f1)',
          'circle-radius': ['step', ['get', 'point_count'], 18, 10, 24, 50, 30],
          'circle-opacity': 0.85,
          'circle-stroke-width': 2,
          'circle-stroke-color': '#fff',
        },
      });
      map.addLayer({
        id: 'cluster-count',
        type: 'symbol',
        source: 'events',
        filter: ['has', 'point_count'],
        layout: {
          'text-field': '{point_count_abbreviated}',
          'text-size': 12,
          'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
        },
        paint: { 'text-color': '#fff' },
      });

      // Individual event circles
      map.addLayer({
        id: 'unclustered',
        type: 'circle',
        source: 'events',
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-radius': 8,
          'circle-color': ['get', 'color'],
          'circle-opacity': 0.9,
          'circle-stroke-width': 1.5,
          'circle-stroke-color': '#fff',
        },
      });

      // Click cluster → zoom in
      map.on('click', 'clusters', (e) => {
        const feat = e.features?.[0];
        if (!feat) return;
        const src = map.getSource('events') as maplibregl.GeoJSONSource;
        src
          .getClusterExpansionZoom(feat.properties.cluster_id)
          .then((zoom) => {
            map.easeTo({ center: (feat.geometry as any).coordinates, zoom });
          })
          .catch(() => {});
      });

      // Click individual dot → popup
      map.on('click', 'unclustered', (e) => {
        const feat = e.features?.[0];
        if (!feat) return;
        const { title, url, venue } = feat.properties as any;
        const coords = (feat.geometry as any).coordinates.slice() as [number, number];
        new maplibregl.Popup({ maxWidth: '260px' })
          .setLngLat(coords)
          .setHTML(
            `<strong style="display:block;margin-bottom:4px">` +
            `<a href="${url}" target="_blank" rel="noreferrer" style="color:inherit">${title}</a></strong>` +
            `<span style="font-size:0.8em;opacity:.7">${venue}</span>`,
          )
          .addTo(map);
      });

      map.on('mouseenter', 'unclustered', () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', 'unclustered', () => { map.getCanvas().style.cursor = ''; });
      map.on('mouseenter', 'clusters', () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', 'clusters', () => { map.getCanvas().style.cursor = ''; });
    });

    return () => {
      loadedRef.current = false;
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Update marker data whenever the filtered event list changes.
  useEffect(() => {
    if (!loadedRef.current || !mapRef.current) return;
    const src = mapRef.current.getSource('events') as maplibregl.GeoJSONSource | undefined;
    src?.setData(buildGeoJSON(events));
  }, [events]);

  const mappableCount = events.filter((e) => e.lat != null).length;

  if (!MAPTILER_KEY) {
    return <p className="notice">Map view unavailable (VITE_MAPTILER_API_KEY not set).</p>;
  }

  return (
    <div className="map-view">
      <div ref={containerRef} className="map-view__map" />
      <p className="map-view__count">
        {mappableCount.toLocaleString()} of {events.length.toLocaleString()} events have location data
      </p>
    </div>
  );
}
