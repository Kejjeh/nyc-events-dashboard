import type { Category, Event } from '../domain/event';

const MUSIC_RE = /concert|jazz|classical|music|orchestra|symphony|recital|choir/i;

// Brooklyn's ~60 branches publish a very high volume of routine recurring
// programming — early-childhood story/play sessions, language/homework
// instruction, and appointment-style help desks — that would swamp the board.
// We keep the discoverable one-off events (concerts, talks, workshops, crafts,
// watch parties, sales) and drop this routine noise.
const NOISE_RE =
  /\b(?:story\s?time|story\s?play|toddler|babies?|lap\s?sit|rhyme time|mother goose|choo\s?choo|duplo|tiny tots|play\s?time|homework help|study (?:time|hall)|english (?:conversation|class|classes|language)|esol|we speak nyc|citizenship|ged|hse|ask a tech|tech(?:nology)? help|computer (?:basics|help|class)|neighborhood tech|resume|notary|job (?:help|support|search|readiness)|one[\s-]*on[\s-]*one|office hours|by appointment|tax (?:prep|help|assistance)|passport|bookmobile)\b/i;

/**
 * Normalizes a Brooklyn Public Library JSON:API event node. The branch venue is
 * injected as `_venue` by the fetcher (resolved from the field_location include).
 * In-person, free library programming only.
 */
export function normalizeBplEvent(raw: any): Event | null {
  const a = raw.attributes ?? {};
  if (a.field_event_virtual === true) return null; // in-person only

  const start = a.field_date?.value;
  if (typeof start !== 'string') return null;
  // Required fields: a title-less node renders a blank card, and a nid-less node
  // collapses to the id "bpl:undefined", deduping all such records into one.
  if (typeof a.title !== 'string' || a.title.trim() === '') return null;
  if (a.drupal_internal__nid == null) return null;
  if (NOISE_RE.test(a.title)) return null; // skip routine recurring programming

  const category: Category = MUSIC_RE.test(a.title ?? '') ? 'music' : 'other';

  return {
    id: `bpl:${a.drupal_internal__nid}`,
    title: a.title,
    category,
    borough: 'Brooklyn',
    venue: raw._venue || 'Brooklyn Public Library',
    start: start.slice(0, 19), // bare local ISO (the +00:00 offset is nominal)
    ...(typeof a.field_date?.end_value === 'string' && { end: a.field_date.end_value.slice(0, 19) }),
    isFree: true,
    url: `https://www.bklynlibrary.org${a.path?.alias ?? ''}`,
    source: 'bpl',
  };
}
