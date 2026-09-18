import type { Event, SourceStatus } from '../domain/event';
import type { SourceOutcome } from './sourceOutcome';

export type { SourceStatus };

/**
 * Summarizes how many events each source contributed and how it fared this run.
 * Sorted by count descending, then name.
 *
 * Every source with an outcome is seeded at count 0 first, so nothing goes
 * invisible: a source that fetched successfully but produced zero events (a
 * silently-broken parser) still shows up — the most dangerous silent drop — and
 * so does one that was never asked (no credential), deliberately skipped, or
 * failed outright with nothing banked to carry.
 *
 * `fresh` is true only for an authoritative fetch (`health: 'ok'`). A source
 * without a key never reports fresh, so "0 events, fresh" keeps meaning exactly
 * one thing: we asked, and there was nothing there.
 */
export function summarizeSources(events: Event[], outcomes: SourceOutcome[]): SourceStatus[] {
  const health = new Map<string, SourceOutcome['health']>();
  const counts = new Map<string, number>();
  for (const o of outcomes) {
    health.set(o.source, o.health);
    counts.set(o.source, 0);
  }
  for (const e of events) counts.set(e.source, (counts.get(e.source) ?? 0) + 1);

  return [...counts.entries()]
    .map(([source, count]) => {
      const status = health.get(source);
      return {
        source,
        count,
        fresh: status === 'ok',
        // Absent for a source with carried events but no outcome this run (its
        // wiring was removed); the UI falls back to the `fresh` flag.
        ...(status ? { status } : {}),
      };
    })
    .sort((a, b) => b.count - a.count || a.source.localeCompare(b.source));
}
