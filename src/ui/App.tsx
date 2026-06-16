import { useEffect, useMemo, useState } from 'react';
import type { Borough, Category } from '../domain/event';
import { useEvents } from './useEvents';
import { useTheme } from './useTheme';
import { useBookmarks } from './useBookmarks';
import { useGeolocation } from './useGeolocation';
import { filterEvents, sortEvents, type SortKey } from './filters';
import type { DateWindow } from './dateWindow';
import { parseFilters, serializeFilters } from './urlState';
import { sourceLabel } from './format';
import { EventCard } from './EventCard';
import { EventModal } from './EventModal';
import { MapView } from './MapView';

/** Cards rendered per page — keeps initial paint fast on large result sets. */
const PAGE_SIZE = 60;

const BOROUGHS: Borough[] = ['Manhattan', 'Brooklyn', 'Queens', 'Bronx'];
const DATE_WINDOWS: { key: DateWindow; label: string }[] = [
  { key: 'all', label: 'Any date' },
  { key: 'today', label: 'Today' },
  { key: 'weekend', label: 'This weekend' },
  { key: 'week', label: 'Next 7 days' },
];
const PICKED_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const CATEGORIES: { key: Category; label: string }[] = [
  { key: 'music', label: 'Music' },
  { key: 'comedy', label: 'Comedy' },
  { key: 'theater', label: 'Theater' },
  { key: 'film', label: 'Film' },
  { key: 'food', label: 'Food' },
  { key: 'sports', label: 'Sports' },
  { key: 'kids', label: 'Kids' },
  { key: 'museum', label: 'Museum' },
  { key: 'social', label: 'Social' },
  { key: 'other', label: 'Other' },
];
const SORTS: { key: SortKey; label: string }[] = [
  { key: 'soonest', label: 'Soonest' },
  { key: 'borough', label: 'Borough' },
  { key: 'category', label: 'Category' },
  { key: 'nearest', label: 'Nearest' },
];
const PRICE_CAPS = [
  { label: 'Any price', value: 0 },
  { label: 'Under $25', value: 25 },
  { label: 'Under $50', value: 50 },
  { label: 'Under $100', value: 100 },
];

export function App() {
  const state = useEvents();
  const { theme, toggle } = useTheme();
  const { saved, toggle: toggleSave } = useBookmarks();
  const { geo, request: requestGeo } = useGeolocation();

  // Today's date in NYC, used to evaluate the date-window filter.
  const today = useMemo(
    () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date()),
    [],
  );

  // Hydrate initial filters from the shareable URL (parsed once).
  const [init] = useState(() => parseFilters(window.location.search));
  const [borough, setBorough] = useState<Borough | 'All'>(init.borough);
  const [neighborhoods, setNeighborhoods] = useState<string[]>(init.neighborhoods);
  const [sources, setSources] = useState<string[]>(init.sources);
  const [category, setCategory] = useState<Category | 'All'>(init.category);
  const [freeOnly, setFreeOnly] = useState(init.freeOnly);
  const [maxPrice, setMaxPrice] = useState(init.maxPrice);
  const [search, setSearch] = useState(init.search);
  const [sort, setSort] = useState<SortKey>(init.sort);
  // A shared link can carry a picked date that has since passed — fall back to
  // "Any date" rather than hydrate into a silently-empty board.
  const [dateWindow, setDateWindow] = useState<DateWindow>(
    PICKED_DATE_RE.test(init.dateWindow) && init.dateWindow < today ? 'all' : init.dateWindow,
  );
  const [savedOnly, setSavedOnly] = useState(false);
  const [copied, setCopied] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');
  // Selected event id drives the detail modal; also synced into ?event= URL param.
  const [selectedEventId, setSelectedEventId] = useState<string | null>(
    () => new URLSearchParams(window.location.search).get('event'),
  );

  const allEvents = state.status === 'ready' ? state.payload.events : [];

  // Auto-request geolocation when the "Nearest" sort is active.
  useEffect(() => {
    if (sort === 'nearest' && geo.status === 'idle') requestGeo();
  }, [sort, geo.status, requestGeo]);

  // Keep the URL in sync with the filters so the current view is shareable.
  useEffect(() => {
    const qs = serializeFilters({ borough, neighborhoods, sources, category, freeOnly, maxPrice, search, sort, dateWindow });
    const p = qs ? new URLSearchParams(qs) : new URLSearchParams();
    if (selectedEventId) p.set('event', selectedEventId);
    const str = p.toString();
    const url = `${window.location.pathname}${str ? `?${str}` : ''}`;
    window.history.replaceState(null, '', url);
  }, [borough, neighborhoods, sources, category, freeOnly, maxPrice, search, sort, dateWindow, selectedEventId]);

  // Copy the current (filtered) view's URL so it can be shared with a friend.
  function copyLink() {
    navigator.clipboard
      ?.writeText(window.location.href)
      .then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => {});
  }

  // Switching borough must clear the neighborhood in the same render, or the
  // stale neighborhood briefly filters the new borough to an empty set.
  function selectBorough(next: Borough | 'All') {
    setBorough(next);
    setNeighborhoods([]);
  }

  // Only offer neighborhood chips that survive the other active filters, so no
  // chip leads to an empty result set. The current selection is always kept
  // visible so it stays highlighted and can be toggled off.
  const hoodOptions = useMemo(() => {
    if (borough === 'All') return [];
    const inScope = filterEvents(allEvents, {
      borough,
      category: category === 'All' ? undefined : category,
      freeOnly,
      search,
      dateWindow,
      today,
      sources: sources.length > 0 ? sources : undefined,
    });
    const set = new Set<string>();
    for (const e of inScope) if (e.neighborhood) set.add(e.neighborhood);
    for (const n of neighborhoods) set.add(n);
    return [...set].sort();
  }, [allEvents, borough, category, freeOnly, search, dateWindow, today, neighborhoods, sources]);

  const userCoords = geo.status === 'ok' ? { lat: geo.lat, lon: geo.lon } : undefined;

  const visible = useMemo(() => {
    let results = filterEvents(allEvents, {
      borough: borough === 'All' ? undefined : borough,
      neighborhoods: neighborhoods.length > 0 ? neighborhoods : undefined,
      sources: sources.length > 0 ? sources : undefined,
      category: category === 'All' ? undefined : category,
      freeOnly,
      maxPrice: maxPrice > 0 ? maxPrice : undefined,
      search,
      dateWindow,
      today,
    });
    if (savedOnly) results = results.filter((e) => saved.has(e.id));
    return sortEvents(results, sort, userCoords);
  }, [allEvents, borough, neighborhoods, sources, category, freeOnly, maxPrice, search, sort, dateWindow, today, savedOnly, saved, userCoords]);

  // Render incrementally; reset to the first page whenever the result set changes.
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  useEffect(
    () => setVisibleCount(PAGE_SIZE),
    [borough, neighborhoods, sources, category, freeOnly, maxPrice, search, sort, dateWindow, savedOnly],
  );

  // Resolve the selected event from the loaded data (null while loading or not found).
  const selectedEvent = useMemo(
    () => (selectedEventId ? (allEvents.find((e) => e.id === selectedEventId) ?? null) : null),
    [selectedEventId, allEvents],
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
          <button className="share-btn" onClick={copyLink}>
            {copied ? '✓ Link copied' : '🔗 Copy link to this view'}
          </button>
        </div>
      </header>

      <nav className="tabs" aria-label="Filter by borough">
        <button
          className={`tab ${borough === 'All' ? 'tab--active' : ''}`}
          aria-pressed={borough === 'All'}
          onClick={() => selectBorough('All')}
        >
          All boroughs
        </button>
        {BOROUGHS.map((b) => (
          <button
            key={b}
            className={`tab ${borough === b ? 'tab--active' : ''}`}
            aria-pressed={borough === b}
            onClick={() => selectBorough(b)}
          >
            {b}
          </button>
        ))}
      </nav>

      {borough !== 'All' && hoodOptions.length > 0 && (
        <nav className="hoods" aria-label={`Filter by neighborhood in ${borough}`}>
          <button
            className={`hood ${neighborhoods.length === 0 ? 'hood--active' : ''}`}
            aria-pressed={neighborhoods.length === 0}
            onClick={() => setNeighborhoods([])}
          >
            All {borough}
          </button>
          {hoodOptions.map((n) => (
            <button
              key={n}
              className={`hood ${neighborhoods.includes(n) ? 'hood--active' : ''}`}
              aria-pressed={neighborhoods.includes(n)}
              onClick={() =>
                setNeighborhoods((prev) =>
                  prev.includes(n) ? prev.filter((x) => x !== n) : [...prev, n],
                )
              }
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

        <div className="dates" role="group" aria-label="Filter by date">
          {DATE_WINDOWS.map((d) => (
            <button
              key={d.key}
              className={`chip-btn ${dateWindow === d.key ? 'chip-btn--active' : ''}`}
              aria-pressed={dateWindow === d.key}
              onClick={() => setDateWindow(d.key)}
            >
              {d.label}
            </button>
          ))}
          <input
            className={`date-input ${PICKED_DATE_RE.test(dateWindow) ? 'date-input--active' : ''}`}
            type="date"
            min={today}
            value={PICKED_DATE_RE.test(dateWindow) ? dateWindow : ''}
            onChange={(e) => setDateWindow(e.target.value || 'all')}
            aria-label={
              PICKED_DATE_RE.test(dateWindow) ? `Filtering by ${dateWindow}` : 'Pick a specific date'
            }
          />
        </div>

        <div className="chips" role="group" aria-label="Filter by category">
          <button
            className={`chip-btn ${category === 'All' ? 'chip-btn--active' : ''}`}
            aria-pressed={category === 'All'}
            onClick={() => setCategory('All')}
          >
            All
          </button>
          {CATEGORIES.map((c) => (
            <button
              key={c.key}
              className={`chip-btn ${category === c.key ? 'chip-btn--active' : ''}`}
              aria-pressed={category === c.key}
              data-category={c.key}
              onClick={() => setCategory(c.key)}
            >
              {c.label}
            </button>
          ))}
        </div>

        {state.status === 'ready' && (state.payload.sources?.length ?? 0) > 1 && (
          <div className="chips" role="group" aria-label="Filter by source">
            <button
              className={`chip-btn ${sources.length === 0 ? 'chip-btn--active' : ''}`}
              aria-pressed={sources.length === 0}
              onClick={() => setSources([])}
            >
              All sources
            </button>
            {state.payload.sources.map((s) => (
              <button
                key={s.source}
                className={`chip-btn ${sources.includes(s.source) ? 'chip-btn--active' : ''}`}
                aria-pressed={sources.includes(s.source)}
                onClick={() =>
                  setSources((prev) =>
                    prev.includes(s.source) ? prev.filter((x) => x !== s.source) : [...prev, s.source],
                  )
                }
              >
                {sourceLabel(s.source)}
              </button>
            ))}
          </div>
        )}

        <div className="chips" role="group" aria-label="Filter by price">
          {PRICE_CAPS.map((p) => (
            <button
              key={p.value}
              className={`chip-btn ${maxPrice === p.value ? 'chip-btn--active' : ''}`}
              aria-pressed={maxPrice === p.value}
              onClick={() => setMaxPrice(p.value)}
            >
              {p.label}
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

        <button
          className={`chip-btn ${savedOnly ? 'chip-btn--active chip-btn--heart' : 'chip-btn--heart'}`}
          aria-pressed={savedOnly}
          onClick={() => setSavedOnly((v) => !v)}
        >
          {savedOnly ? '♥' : '♡'} Saved{saved.size > 0 ? ` (${saved.size})` : ''}
        </button>

        <label className="sort">
          Sort
          <select
            value={sort}
            onChange={(e) => {
              const next = e.target.value as SortKey;
              if (next === 'nearest' && geo.status === 'idle') requestGeo();
              setSort(next);
            }}
          >
            {SORTS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.key === 'nearest' && geo.status === 'pending'
                  ? 'Locating…'
                  : s.key === 'nearest' && geo.status === 'denied'
                    ? 'Nearest (denied)'
                    : s.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <main className="results">
        {state.status === 'loading' && <p className="notice">Loading events…</p>}
        {state.status === 'error' && (
          <p className="notice notice--error">Couldn't load events ({state.message}).</p>
        )}
        {state.status === 'ready' && (
          <>
            <div className="view-bar">
              <p className="results__count">
                {shown.length < visible.length
                  ? `Showing ${shown.length.toLocaleString()} of ${visible.length.toLocaleString()} events`
                  : `${visible.length.toLocaleString()} ${visible.length === 1 ? 'event' : 'events'}`}
              </p>
              <div className="view-toggle" role="group" aria-label="View mode">
                <button
                  className={`view-btn ${viewMode === 'list' ? 'view-btn--active' : ''}`}
                  aria-pressed={viewMode === 'list'}
                  onClick={() => setViewMode('list')}
                >
                  ☰ List
                </button>
                <button
                  className={`view-btn ${viewMode === 'map' ? 'view-btn--active' : ''}`}
                  aria-pressed={viewMode === 'map'}
                  onClick={() => setViewMode('map')}
                >
                  ⊙ Map
                </button>
              </div>
            </div>
            {visible.length === 0 ? (
              <p className="notice">No events match these filters.</p>
            ) : viewMode === 'map' ? (
              <MapView events={visible} />
            ) : (
              <>
                <div className="grid">
                  {shown.map((event) => (
                    <EventCard
                      key={event.id}
                      event={event}
                      saved={saved.has(event.id)}
                      onToggleSave={() => toggleSave(event.id)}
                      onExpand={() => setSelectedEventId(event.id)}
                    />
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
        {state.status === 'ready' && state.payload.sources?.length ? (
          <p className="footer__sources">
            {state.payload.sources.map((s) => (
              <span
                key={s.source}
                className={`src ${s.fresh ? '' : 'src--stale'}`}
                title={
                  s.fresh
                    ? 'Refreshed this run'
                    : 'Carried forward — this source was unavailable at the last refresh'
                }
              >
                {sourceLabel(s.source)} <span className="src__count">{s.count.toLocaleString()}</span>
                {!s.fresh && ' ⚠'}
              </span>
            ))}
          </p>
        ) : (
          <p className="footer__sources">
            Data from NYC Parks, NYC Open Data, and more.
          </p>
        )}
        <p className="footer__note">Free NYC events, refreshed twice daily by a GitHub Actions pipeline.</p>
      </footer>

      {selectedEvent && (
        <EventModal
          event={selectedEvent}
          saved={saved.has(selectedEvent.id)}
          onClose={() => setSelectedEventId(null)}
          onToggleSave={() => toggleSave(selectedEvent.id)}
        />
      )}
    </div>
  );
}
