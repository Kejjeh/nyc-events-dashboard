import type { Category, Event } from '../domain/event';

const MUSIC_RE = /concert|jazz|classical|music|orchestra|symphony|recital|choir/i;

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
