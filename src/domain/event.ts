export type Category =
  | 'sports'
  | 'music'
  | 'comedy'
  | 'theater'
  | 'film'
  | 'food'
  | 'museum'
  | 'social'
  | 'other';

export type Borough = 'Bronx' | 'Queens' | 'Manhattan' | 'Brooklyn';

export interface Event {
  /** Stable identifier, used for deduplication across refreshes. */
  id: string;
  title: string;
  category: Category;
  borough: Borough;
  /** Neighborhood within the borough, when resolvable (e.g. "Harlem", "Bushwick"). */
  neighborhood?: string;
  venue: string;
  /** ISO 8601 start timestamp. */
  start: string;
  /** ISO 8601 end timestamp, when known. */
  end?: string;
  isFree: boolean;
  /** Lowest ticket price in USD, when known. */
  priceMin?: number;
  /** Highest ticket price in USD, when known. */
  priceMax?: number;
  url: string;
  /** Source adapter that produced this event, e.g. 'ticketmaster'. */
  source: string;
  /** Artist image (Spotify) for matched music events. */
  image?: string;
  /** Spotify artist page for matched music events. */
  spotifyUrl?: string;
  /** Venue latitude (WGS-84), when available from the source or geocoded. */
  lat?: number;
  /** Venue longitude (WGS-84), when available from the source or geocoded. */
  lon?: number;
  /** Near-term weather forecast for outdoor events within the 5-day window. */
  weather?: { icon: string; temp: number; description: string; dt?: number };
}

/** Per-source health for the published payload, so silent drops stay visible. */
export interface SourceStatus {
  source: string;
  count: number;
  /** True when the source was fetched successfully this run (not carried forward). */
  fresh: boolean;
}
