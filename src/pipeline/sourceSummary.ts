import type { Event } from '../domain/event';

/** Per-source health for the published payload, so silent drops stay visible. */
export interface SourceStatus {
  source: string;
  count: number;
  /** True when the source was fetched successfully this run (not carried forward). */
  fresh: boolean;
}

/**
 * Summarizes how many events each source contributed and whether its data is
 * fresh this run or carried forward from a previous good run. Sorted by count.
 */
export function summarizeSources(events: Event[], succeededSources: string[]): SourceStatus[] {
  const succeeded = new Set(succeededSources);
  const counts = new Map<string, number>();
  for (const e of events) counts.set(e.source, (counts.get(e.source) ?? 0) + 1);

  return [...counts.entries()]
    .map(([source, count]) => ({ source, count, fresh: succeeded.has(source) }))
    .sort((a, b) => b.count - a.count || a.source.localeCompare(b.source));
}
