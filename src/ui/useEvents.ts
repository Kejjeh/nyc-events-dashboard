import { useEffect, useState } from 'react';
import type { Event, SourceStatus } from '../domain/event';

export type { SourceStatus };

export interface EventsPayload {
  generatedAt: string;
  count: number;
  /** Count of events held in the offline archive (other cities + far future). */
  archivedCount?: number;
  /** State → cities (with counts, desc) across the dataset, for the location selector. NY first. */
  places?: { state: string; cities: { name: string; count: number }[] }[];
  /** Per-source health summary (absent in older published data). */
  sources?: SourceStatus[];
  events: Event[];
}

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; payload: EventsPayload };

/** Loads the statically-built events.json produced by the ingestion pipeline. */
export function useEvents(): State {
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    const url = `${import.meta.env.BASE_URL}data/events.json`;
    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((payload: EventsPayload) => setState({ status: 'ready', payload }))
      .catch((err: Error) => setState({ status: 'error', message: err.message }));
  }, []);

  return state;
}
