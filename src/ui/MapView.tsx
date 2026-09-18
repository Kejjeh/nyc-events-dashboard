import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { Event } from '../domain/event';
import { popupHtml } from './mapPopup';
import {
  DEFAULT_CENTER,
  DEFAULT_ZOOM,
  FIT_PADDING,
  MAX_FIT_ZOOM,
  boundsOf,
  shouldRefit,
  type Bounds,
} from './mapBounds';

const MAPTILER_KEY = (import.meta as any).env?.VITE_MAPTILER_API_KEY as string | undefined;

/**
 * The dashboard's accent, as a literal. MapLibre paint values are evaluated by
 * the GL renderer, not CSS, so `var(--accent)` never resolved — keep this in
 * step with `--accent` in styles.css (the dark/default theme value).
 */
const CLUSTER_COLOR = '#7c5cff';

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
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
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
          'circle-color': CLUSTER_COLOR,
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
        // Titles, venues and URLs are scraped third-party strings — popupHtml
        // escapes them and refuses to link anything that isn't http(s).
        new maplibregl.Popup({ maxWidth: '260px' })
          .setLngLat(coords)
          .setHTML(popupHtml({ title, venue, url }))
          .addTo(map);
      });

      // Frame whatever is already filtered in — the board can open on an
      // archive city, and the default NYC view would show an empty map.
      const initial = boundsOf(eventsRef.current);
      if (initial) {
        map.fitBounds(initial, { padding: FIT_PADDING, maxZoom: MAX_FIT_ZOOM, duration: 0 });
      }

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

  // Update marker data whenever the filtered event list changes, and re-frame
  // the map when the new events fall outside what's on screen — otherwise
  // switching the city filter to Boston leaves the view pinned on NYC with
  // every marker off-screen. A view that still contains events is left alone,
  // so panning and zooming survive an ordinary filter change.
  useEffect(() => {
    if (!loadedRef.current || !mapRef.current) return;
    const map = mapRef.current;
    const src = map.getSource('events') as maplibregl.GeoJSONSource | undefined;
    src?.setData(buildGeoJSON(events));

    const target = boundsOf(events);
    const view = map.getBounds();
    const current: Bounds | null = view
      ? [
          [view.getWest(), view.getSouth()],
          [view.getEast(), view.getNorth()],
        ]
      : null;
    if (target && shouldRefit(current, target)) {
      map.fitBounds(target, { padding: FIT_PADDING, maxZoom: MAX_FIT_ZOOM, duration: 600 });
    }
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
