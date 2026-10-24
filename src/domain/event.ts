export type Category =
  | 'sports'
  | 'music'
  | 'comedy'
  | 'theater'
  | 'film'
  | 'food'
  | 'museum'
  | 'social'
  | 'kids'
  | 'other';

export type Borough = 'Bronx' | 'Queens' | 'Manhattan' | 'Brooklyn';

export interface Event {
  /** Stable identifier, used for deduplication across refreshes. */
  id: string;
  title: string;
  category: Category;
  /** City/metro the event is in (e.g. "New York", "Boston"). Absent = "New York". */
  city?: string;
  /** Two-letter state/region (e.g. "NY", "MA", "DC"). Absent = "NY". */
  state?: string;
  /** NYC borough — only set for New York City events. */
  borough?: Borough;
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
  /** Other ticketing sources carrying the same show (added by cross-source dedup). */
  altTicketLinks?: { source: string; url: string }[];
}

/**
 * Why a source did or didn't contribute this run. Mirrors `SourceHealth` in
 * `src/pipeline/sourceOutcome.ts`, which is where the semantics are documented.
 */
export type SourceHealth = 'ok' | 'missing-key' | 'skipped' | 'error';

/** Per-source health for the published payload, so silent drops stay visible. */
export interface SourceStatus {
  source: string;
  count: number;
  /** True when the source was fetched successfully this run (not carried forward). */
  fresh: boolean;
  /**
   * Why, in more detail than `fresh` alone: a missing credential, a
   * cost-skipped fetch and a failed fetch all read as `fresh: false`, and they
   * mean different things. Absent from payloads published before this field
   * existed, so treat `undefined` as "only `fresh` is known".
   */
  status?: SourceHealth;
  /**
   * When this source last fetched successfully (ISO). Equals the payload's
   * `generatedAt` for a fresh row and is older for a carried one, so the UI can
   * say how old carried data is instead of presenting it as current. Absent
   * when unknown: the source has not fetched since the field was introduced.
   */
  asOf?: string;
}
