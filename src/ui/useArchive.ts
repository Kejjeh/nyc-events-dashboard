import { useCallback, useRef, useState } from 'react';
import type { Event } from '../domain/event';

type ArchiveState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; events: Event[] };

/**
 * Lazily loads archive.json (other-city + NYC far-future events) the first time
 * the user selects a non-NYC city. Keeps the default NYC load lean — the ~1.8MB
 * archive is fetched once, on demand, then cached for the rest of the session.
 */
export function useArchive() {
  const [archive, setArchive] = useState<ArchiveState>({ status: 'idle' });
  const started = useRef(false);

  const loadArchive = useCallback(() => {
    if (started.current) return;
    started.current = true;
    setArchive({ status: 'loading' });
    fetch(`${import.meta.env.BASE_URL}data/archive.json`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((payload: { events?: Event[] }) =>
        setArchive({ status: 'ready', events: payload.events ?? [] }),
      )
      .catch(() => setArchive({ status: 'error' }));
  }, []);

  return { archive, loadArchive };
}
