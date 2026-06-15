import type { Event, SourceStatus } from '../domain/event';

export type { SourceStatus };

/**
 * Summarizes how many events each source contributed and whether its data is
 * fresh this run or carried forward from a previous good run. Sorted by count.
 *
 * Every succeeded source is seeded at count 0 first, so a source that fetched
 * successfully but produced zero events (a silently-broken parser) still shows
 * up — that's the most dangerous silent drop to surface.
 */
export function summarizeSources(events: Event[], succeededSources: string[]): SourceStatus[] {
  const succeeded = new Set(succeededSources);
  const counts = new Map<string, number>();
  for (const s of succeededSources) counts.set(s, 0);
  for (const e of events) counts.set(e.source, (counts.get(e.source) ?? 0) + 1);

  return [...counts.entries()]
    .map(([source, count]) => ({ source, count, fresh: succeeded.has(source) }))
    .sort((a, b) => b.count - a.count || a.source.localeCompare(b.source));
}
