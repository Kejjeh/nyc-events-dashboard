import { useEffect, useMemo, useState } from 'react';
import type { Borough, Category } from '../domain/event';
import { useEvents } from './useEvents';
import { useTheme } from './useTheme';
import { filterEvents, sortEvents, type SortKey } from './filters';
import { EventCard } from './EventCard';

/** Cards rendered per page — keeps initial paint fast on large result sets. */
const PAGE_SIZE = 60;

const BOROUGHS: Borough[] = ['Manhattan', 'Brooklyn', 'Queens', 'Bronx'];
const CATEGORIES: { key: Category; label: string }[] = [
  { key: 'music', label: 'Music' },
  { key: 'comedy', label: 'Comedy' },
  { key: 'theater', label: 'Theater' },
  { key: 'film', label: 'Film' },
  { key: 'food', label: 'Food' },
  { key: 'sports', label: 'Sports' },
  { key: 'museum', label: 'Museum' },
  { key: 'other', label: 'Other' },
];
const SORTS: { key: SortKey; label: string }[] = [
  { key: 'soonest', label: 'Soonest' },
  { key: 'borough', label: 'Borough' },
  { key: 'category', label: 'Category' },
];

export function App() {
  const state = useEvents();
  const { theme, toggle } = useTheme();

  const [borough, setBorough] = useState<Borough | 'All'>('All');
  const [neighborhood, setNeighborhood] = useState<string>('All');
  const [category, setCategory] = useState<Category | 'All'>('All');
  const [freeOnly, setFreeOnly] = useState(false);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortKey>('soonest');

  const allEvents = state.status === 'ready' ? state.payload.events : [];

  // Selecting a borough reveals its neighborhoods; switching borough clears it.
  useEffect(() => setNeighborhood('All'), [borough]);
  const neighborhoods = useMemo(() => {
    if (borough === 'All') return [];
    const set = new Set<string>();
    for (const e of allEvents) if (e.borough === borough && e.neighborhood) set.add(e.neighborhood);
    return [...set].sort();
  }, [allEvents, borough]);

  const visible = useMemo(
    () =>
      sortEvents(
        filterEvents(allEvents, {
          borough: borough === 'All' ? undefined : borough,
          neighborhood: neighborhood === 'All' ? undefined : neighborhood,
          category: category === 'All' ? undefined : category,
          freeOnly,
          search,
        }),
        sort,
      ),
    [allEvents, borough, neighborhood, category, freeOnly, search, sort],
  );

  // Render incrementally; reset to the first page whenever the result set changes.
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  useEffect(
    () => setVisibleCount(PAGE_SIZE),
    [borough, neighborhood, category, freeOnly, search, sort],
  );

  const shown = visible.slice(0, visibleCount);

  return (
    <div className="app">
      <header className="hero">
        <button
          className="theme-toggle"
          onClick={toggle}
          aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
        >
          {theme === 'dark' ? '☀' : '☾'}
        </button>
        <div className="hero__inner">
          <h1 className="hero__title">
            NYC Events<span className="hero__dot">.</span>
          </h1>
          <p className="hero__subtitle">
            Music, food, sports &amp; more across the Bronx, Queens, Manhattan, and Brooklyn —
            refreshed twice daily.
          </p>
          {state.status === 'ready' && (
            <p className="hero__stamp">
              {state.payload.count.toLocaleString()} events · updated{' '}
              {new Date(state.payload.generatedAt).toLocaleString('en-US', {
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
              })}
            </p>
          )}
        </div>
      </header>

      <nav className="tabs">
        <button
          className={`tab ${borough === 'All' ? 'tab--active' : ''}`}
          onClick={() => setBorough('All')}
        >
          All boroughs
        </button>
        {BOROUGHS.map((b) => (
          <button
            key={b}
            className={`tab ${borough === b ? 'tab--active' : ''}`}
            onClick={() => setBorough(b)}
          >
            {b}
          </button>
        ))}
      </nav>

      {borough !== 'All' && neighborhoods.length > 0 && (
        <nav className="hoods">
          <button
            className={`hood ${neighborhood === 'All' ? 'hood--active' : ''}`}
            onClick={() => setNeighborhood('All')}
          >
            All {borough}
          </button>
          {neighborhoods.map((n) => (
            <button
              key={n}
              className={`hood ${neighborhood === n ? 'hood--active' : ''}`}
              onClick={() => setNeighborhood(n)}
            >
              {n}
            </button>
          ))}
        </nav>
      )}

      <div className="toolbar">
        <input
          className="search"
          type="search"
          placeholder="Search events or venues…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <div className="chips">
          <button
            className={`chip-btn ${category === 'All' ? 'chip-btn--active' : ''}`}
            onClick={() => setCategory('All')}
          >
            All
          </button>
          {CATEGORIES.map((c) => (
            <button
              key={c.key}
              className={`chip-btn ${category === c.key ? 'chip-btn--active' : ''}`}
              data-category={c.key}
              onClick={() => setCategory(c.key)}
            >
              {c.label}
            </button>
          ))}
        </div>

        <label className="toggle">
          <input
            type="checkbox"
            checked={freeOnly}
            onChange={(e) => setFreeOnly(e.target.checked)}
          />
          Free only
        </label>

        <label className="sort">
          Sort
          <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
            {SORTS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <main className="results">
        {state.status === 'loading' && <p className="notice">Loading events…</p>}
        {state.status === 'error' && (
          <p className="notice notice--error">Couldn’t load events ({state.message}).</p>
        )}
        {state.status === 'ready' && (
          <>
            <p className="results__count">
              {shown.length < visible.length
                ? `Showing ${shown.length.toLocaleString()} of ${visible.length.toLocaleString()} events`
                : `${visible.length.toLocaleString()} ${visible.length === 1 ? 'event' : 'events'}`}
            </p>
            {visible.length === 0 ? (
              <p className="notice">No events match these filters.</p>
            ) : (
              <>
                <div className="grid">
                  {shown.map((event) => (
                    <EventCard key={event.id} event={event} />
                  ))}
                </div>
                {visibleCount < visible.length && (
                  <div className="more">
                    <button
                      className="more__btn"
                      onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}
                    >
                      Show more
                    </button>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </main>

      <footer className="footer">
        Data: NYC Parks · NYC Open Data · SmallsLIVE · Village Vanguard · Ticketmaster. Built with a
        twice-daily GitHub Actions pipeline.
      </footer>
    </div>
  );
}
