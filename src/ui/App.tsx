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
import { FilterDropdown } from './FilterDropdown';

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
  const [categories, setCategories] = useState<Category[]>(init.categories);
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
  const [filtersOpen, setFiltersOpen] = useState(false);
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
    const qs = serializeFilters({ borough, neighborhoods, sources, categories, freeOnly, maxPrice, search, sort, dateWindow });
    const p = qs ? new URLSearchParams(qs) : new URLSearchParams();
    if (selectedEventId) p.set('event', selectedEventId);
    const str = p.toString();
    const url = `${window.location.pathname}${str ? `?${str}` : ''}`;
    window.history.replaceState(null, '', url);
  }, [borough, neighborhoods, sources, categories, freeOnly, maxPrice, search, sort, dateWindow, selectedEventId]);

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

  function toggleCategory(key: Category) {
    setCategories((prev) =>
      prev.includes(key) ? prev.filter((c) => c !== key) : [...prev, key],
    );
  }

  // Only offer neighborhood chips that survive the other active filters, so no
  // chip leads to an empty result set. The current selection is always kept
  // visible so it stays highlighted and can be toggled off.
  const hoodOptions = useMemo(() => {
    if (borough === 'All') return [];
    const inScope = filterEvents(allEvents, {
      borough,
      categories: categories.length > 0 ? categories : undefined,
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
  }, [allEvents, borough, categories, freeOnly, search, dateWindow, today, neighborhoods, sources]);

  const userCoords = geo.status === 'ok' ? { lat: geo.lat, lon: geo.lon } : undefined;

  const visible = useMemo(() => {
    let results = filterEvents(allEvents, {
      borough: borough === 'All' ? undefined : borough,
      neighborhoods: neighborhoods.length > 0 ? neighborhoods : undefined,
      sources: sources.length > 0 ? sources : undefined,
      categories: categories.length > 0 ? categories : undefined,
      freeOnly,
      maxPrice: maxPrice > 0 ? maxPrice : undefined,
      search,
      dateWindow,
      today,
    });
    if (savedOnly) results = results.filter((e) => saved.has(e.id));
    return sortEvents(results, sort, userCoords);
  }, [allEvents, borough, neighborhoods, sources, categories, freeOnly, maxPrice, search, sort, dateWindow, today, savedOnly, saved, userCoords]);

  // Render incrementally; reset to the first page whenever the result set changes.
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  useEffect(
    () => setVisibleCount(PAGE_SIZE),
    [borough, neighborhoods, sources, categories, freeOnly, maxPrice, search, sort, dateWindow, savedOnly],
  );

  // Resolve the selected event from the loaded data (null while loading or not found).
  const selectedEvent = useMemo(
    () => (selectedEventId ? (allEvents.find((e) => e.id === selectedEventId) ?? null) : null),
    [selectedEventId, allEvents],
  );

  const shown = visible.slice(0, visibleCount);

  // Badge count shown on the mobile Filters button.
  const totalActiveFilters =
    (dateWindow !== 'all' ? 1 : 0) +
    categories.length +
    sources.length +
    (maxPrice > 0 || freeOnly ? 1 : 0) +
    (sort !== 'soonest' ? 1 : 0);

  const sourcesInData = state.status === 'ready' ? (state.payload.sources ?? []) : [];

  function sortLabel(key: SortKey) {
    if (key === 'nearest' && geo.status === 'pending') return 'Locating…';
    if (key === 'nearest' && geo.status === 'denied') return 'Nearest (denied)';
    return SORTS.find((s) => s.key === key)!.label;
  }

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
        <div className="toolbar__top">
          <input
            className="search"
            type="search"
            placeholder="Search events or venues…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className={`toolbar__filters ${filtersOpen ? 'toolbar__filters--open' : ''}`}>
          <FilterDropdown label="Date" activeCount={dateWindow !== 'all' ? 1 : 0}>
            <div className="fdd__options">
              {DATE_WINDOWS.map((d) => (
                <label key={d.key} className="fdd__option">
                  <input
                    type="radio"
                    name="dateWindow"
                    checked={dateWindow === d.key}
                    onChange={() => setDateWindow(d.key)}
                  />
                  {d.label}
                </label>
              ))}
              <div className="fdd__option fdd__option--datepicker">
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
            </div>
          </FilterDropdown>

          <FilterDropdown label="Category" activeCount={categories.length}>
            <div className="fdd__options">
              <label className="fdd__option">
                <input
                  type="checkbox"
                  checked={categories.length === 0}
                  onChange={() => setCategories([])}
                />
                All categories
              </label>
              {CATEGORIES.map((c) => (
                <label key={c.key} className="fdd__option">
                  <input
                    type="checkbox"
                    checked={categories.includes(c.key)}
                    onChange={() => toggleCategory(c.key)}
                  />
                  {c.label}
                </label>
              ))}
            </div>
          </FilterDropdown>

          {sourcesInData.length > 1 && (
            <FilterDropdown label="Source" activeCount={sources.length}>
              <div className="fdd__options">
                <label className="fdd__option">
                  <input
                    type="checkbox"
                    checked={sources.length === 0}
                    onChange={() => setSources([])}
                  />
                  All sources
                </label>
                {sourcesInData.map((s) => (
                  <label key={s.source} className="fdd__option">
                    <input
                      type="checkbox"
                      checked={sources.includes(s.source)}
                      onChange={() =>
                        setSources((prev) =>
                          prev.includes(s.source)
                            ? prev.filter((x) => x !== s.source)
                            : [...prev, s.source],
                        )
                      }
                    />
                    {sourceLabel(s.source)}
                  </label>
                ))}
              </div>
            </FilterDropdown>
          )}

          <FilterDropdown label="Price" activeCount={maxPrice > 0 || freeOnly ? 1 : 0}>
            <div className="fdd__options">
              {PRICE_CAPS.map((p) => (
                <label key={p.value} className="fdd__option">
                  <input
                    type="radio"
                    name="maxPrice"
                    checked={maxPrice === p.value}
                    onChange={() => setMaxPrice(p.value)}
                  />
                  {p.label}
                </label>
              ))}
              <hr className="fdd__divider" />
              <label className="fdd__option">
                <input
                  type="checkbox"
                  checked={freeOnly}
                  onChange={(e) => setFreeOnly(e.target.checked)}
                />
                Free events only
              </label>
            </div>
          </FilterDropdown>

          <FilterDropdown label={`Sort: ${sortLabel(sort)}`} activeCount={sort !== 'soonest' ? 1 : 0}>
            <div className="fdd__options">
              {SORTS.map((s) => (
                <label key={s.key} className="fdd__option">
                  <input
                    type="radio"
                    name="sort"
                    checked={sort === s.key}
                    onChange={() => {
                      if (s.key === 'nearest' && geo.status === 'idle') requestGeo();
                      setSort(s.key);
                    }}
                  />
                  {sortLabel(s.key)}
                </label>
              ))}
            </div>
          </FilterDropdown>

          <button
            className={`chip-btn ${savedOnly ? 'chip-btn--active chip-btn--heart' : 'chip-btn--heart'}`}
            aria-pressed={savedOnly}
            onClick={() => setSavedOnly((v) => !v)}
          >
            {savedOnly ? '♥' : '♡'} Saved{saved.size > 0 ? ` (${saved.size})` : ''}
          </button>
        </div>
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
              <div className="view-toggle desktop-only" role="group" aria-label="View mode">
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

      {/* Mobile-only sticky bottom navigation */}
      <nav className="bottom-nav" aria-label="Main navigation">
        <button
          className={`bottom-nav__btn ${viewMode === 'list' && !savedOnly ? 'bottom-nav__btn--active' : ''}`}
          onClick={() => { setViewMode('list'); setSavedOnly(false); }}
        >
          <span className="bottom-nav__icon">☰</span>
          <span className="bottom-nav__label">Events</span>
        </button>
        <button
          className={`bottom-nav__btn ${viewMode === 'map' ? 'bottom-nav__btn--active' : ''}`}
          onClick={() => setViewMode('map')}
        >
          <span className="bottom-nav__icon">⊙</span>
          <span className="bottom-nav__label">Map</span>
        </button>
        <button
          className={`bottom-nav__btn ${savedOnly ? 'bottom-nav__btn--active' : ''}`}
          onClick={() => { setSavedOnly((v) => !v); setViewMode('list'); }}
        >
          <span className="bottom-nav__icon">{savedOnly ? '♥' : '♡'}</span>
          <span className="bottom-nav__label">
            Saved{saved.size > 0 ? ` (${saved.size})` : ''}
          </span>
        </button>
        <button
          className={`bottom-nav__btn ${filtersOpen ? 'bottom-nav__btn--active' : ''}`}
          onClick={() => setFiltersOpen((v) => !v)}
        >
          <span className="bottom-nav__icon">⚙</span>
          <span className="bottom-nav__label">
            Filters{totalActiveFilters > 0 ? ` (${totalActiveFilters})` : ''}
          </span>
        </button>
      </nav>

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
