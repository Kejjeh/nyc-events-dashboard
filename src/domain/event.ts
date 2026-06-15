export type Category =
  | 'sports'
  | 'music'
  | 'comedy'
  | 'theater'
  | 'film'
  | 'food'
  | 'museum'
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
}
