/**
 * Pure helpers for matching event titles to Spotify artists. Precision-first:
 * Spotify's search returns *a* result for almost any query, so we only accept a
 * match whose name equals the query (modulo an ensemble suffix like "Trio"),
 * never a fuzzy near-miss — attaching the wrong artist photo is worse than none.
 */

const ENSEMBLE_WORDS = [
  'trio',
  'quartet',
  'quintet',
  'sextet',
  'septet',
  'band',
  'ensemble',
  'orchestra',
  'group',
  'project',
  'collective',
];

/** Extracts the likely artist name from an event title for searching. */
export function artistQueryFromTitle(title: string): string {
  return (title ?? '')
    .split(/\s+(?:at|@|w\/|with|presents|feat\.?|featuring)\s+|\s*[|·]\s*/i)[0]
    .replace(/^[A-Z0-9][A-Z0-9 &']+:\s*/, '') // strip an ALL-CAPS "SECTION:" prefix
    .trim();
}

/** Lowercases, strips diacritics/punctuation, drops a leading "the", collapses spaces. */
export function normalizeArtist(value: string): string {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip combining diacritical marks
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^the /, '');
}

/** True when an artist name equals the query, allowing a trailing ensemble word. */
export function matchesArtist(query: string, artistName: string): boolean {
  const q = normalizeArtist(query);
  const n = normalizeArtist(artistName);
  if (!q || !n) return false;
  if (q === n) return true;
  // "Joe Farnsworth Quartet" should match the artist "Joe Farnsworth".
  return ENSEMBLE_WORDS.some((w) => q === `${n} ${w}`);
}

/** Returns the first search candidate whose name validly matches the query, or null. */
export function bestArtistMatch<T extends { name: string }>(
  query: string,
  candidates: T[],
): T | null {
  for (const c of candidates ?? []) {
    if (matchesArtist(query, c.name)) return c;
  }
  return null;
}
