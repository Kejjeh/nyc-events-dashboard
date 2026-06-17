import { useState, useCallback } from 'react';

const STORAGE_KEY = 'nyc-events-searches';

/** A filter view the user saved to track new matching events over time. */
export interface SavedSearch {
  id: string;
  name: string;
  /** Serialized filter query string (from serializeFilters). */
  qs: string;
  /** Event ids already seen for this search, used to detect new matches. */
  seenIds: string[];
}

function load(): SavedSearch[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? (arr as SavedSearch[]) : [];
  } catch {
    return [];
  }
}

function persist(list: SavedSearch[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // Storage full or unavailable (private mode) — non-fatal.
  }
}

export function useSavedSearches() {
  const [searches, setSearches] = useState<SavedSearch[]>(load);

  const save = useCallback((name: string, qs: string, currentIds: string[]) => {
    setSearches((prev) => {
      const id = `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
      const next = [...prev, { id, name, qs, seenIds: currentIds }];
      persist(next);
      return next;
    });
  }, []);

  const remove = useCallback((id: string) => {
    setSearches((prev) => {
      const next = prev.filter((s) => s.id !== id);
      persist(next);
      return next;
    });
  }, []);

  /** Records the current matching ids as "seen" so they stop counting as new. */
  const markSeen = useCallback((id: string, currentIds: string[]) => {
    setSearches((prev) => {
      const next = prev.map((s) => (s.id === id ? { ...s, seenIds: currentIds } : s));
      persist(next);
      return next;
    });
  }, []);

  return { searches, save, remove, markSeen };
}
