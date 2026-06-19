import type { Event } from '../domain/event';

const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}T/;

/**
 * The Event start contract, stated once. A start must be a string beginning with
 * a real ISO date and a 'T' (e.g. "2026-08-01T20:00:00"). A malformed start like
 * "nullT19:30:00", a bare "2026-08-01", or a non-string is rejected — so it is
 * never published, sorted on, or carried forward. Both the assemble gate and
 * carry-forward share this one predicate instead of re-checking start by hand.
 */
export function hasIsoStart(event: Event): boolean {
  return typeof event.start === 'string' && ISO_DATETIME.test(event.start);
}
