import type { Event } from '../domain/event';
import { artistQueryFromTitle, bestArtistMatch } from './spotify';

/** What a Spotify lookup yields for a matched artist. */
export interface ArtistInfo {
  image?: string;
  spotifyUrl?: string;
}

type SearchFn = (query: string, token: string) => Promise<ArtistInfo | null>;

interface SpotifyArtist {
  name: string;
  images?: { url: string }[];
  external_urls?: { spotify?: string };
}

/** Client-credentials token, or null if creds are missing or the call fails. */
export async function getSpotifyToken(
  clientId: string | undefined,
  clientSecret: string | undefined,
): Promise<string | null> {
  if (!clientId || !clientSecret) return null;
  try {
    const res = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=client_credentials&client_id=${clientId}&client_secret=${clientSecret}`,
    });
    if (!res.ok) return null;
    const body = (await res.json()) as any;
    return typeof body?.access_token === 'string' ? body.access_token : null;
  } catch {
    return null;
  }
}

/** The real Spotify artist search: top valid name match → image + page URL. */
const searchSpotify: SearchFn = async (query, token) => {
  const res = await fetch(
    `https://api.spotify.com/v1/search?type=artist&limit=5&q=${encodeURIComponent(query)}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) throw new Error(`spotify search ${res.status}`);
  const body = (await res.json()) as any;
  const artist = bestArtistMatch<SpotifyArtist>(query, body?.artists?.items ?? []);
  if (!artist) return null;
  return { image: artist.images?.[0]?.url, spotifyUrl: artist.external_urls?.spotify };
};

/**
 * Attaches a Spotify artist image + page to music events whose title resolves to
 * a confidently-matched artist. Seeds an in-memory cache from the previous run's
 * events (so a recurring artist is searched once, not every build) and skips any
 * event that already has an image. Network failures degrade gracefully — an
 * un-enriched event is simply returned unchanged.
 */
export async function enrichWithSpotify(
  events: Event[],
  token: string | null,
  previous: Event[] = [],
  search: SearchFn = searchSpotify,
  concurrency = 8,
): Promise<Event[]> {
  if (!token) return events;

  // Seed hits from the previous run so a recurring artist isn't re-searched.
  const cache = new Map<string, ArtistInfo | null>();
  for (const p of previous) {
    if (p.category === 'music' && p.image) {
      cache.set(artistQueryFromTitle(p.title).toLowerCase(), {
        image: p.image,
        spotifyUrl: p.spotifyUrl,
      });
    }
  }

  // Collect the distinct artist queries still needing a lookup.
  const needed = new Map<string, string>(); // key → query
  for (const event of events) {
    if (event.category !== 'music' || event.image) continue;
    const query = artistQueryFromTitle(event.title);
    const key = query.toLowerCase();
    if (!cache.has(key) && !needed.has(key)) needed.set(key, query);
  }

  // Resolve them in concurrent chunks; stop early if the API rate-limits us.
  const entries = [...needed];
  let rateLimited = false;
  for (let i = 0; i < entries.length && !rateLimited; i += concurrency) {
    const chunk = entries.slice(i, i + concurrency);
    const results = await Promise.all(
      chunk.map(async ([key, query]): Promise<[string, ArtistInfo | null]> => {
        try {
          return [key, await search(query, token)];
        } catch (err) {
          if (/\b429\b/.test(String(err))) rateLimited = true;
          return [key, null];
        }
      }),
    );
    for (const [key, info] of results) cache.set(key, info);
  }

  return events.map((event) => {
    if (event.category !== 'music' || event.image) return event;
    const info = cache.get(artistQueryFromTitle(event.title).toLowerCase());
    return info ? { ...event, ...info } : event;
  });
}
