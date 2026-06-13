import { useEffect, useState } from 'react';
import type { Event } from '../domain/event';

export interface EventsPayload {
  generatedAt: string;
  count: number;
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
