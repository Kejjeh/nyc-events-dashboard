import { useEffect, useMemo, useRef, useState } from 'react';
import type { Borough, Category, Event } from '../domain/event';
import { useEvents } from './useEvents';
import { useArchive } from './useArchive';
import { useTheme } from './useTheme';
import { useBookmarks } from './useBookmarks';
import { useGeolocation } from './useGeolocation';
import { useSavedSearches, type SavedSearch } from './useSavedSearches';
import { filterEvents, sortEvents, type SortKey } from './filters';
import type { DateWindow } from './dateWindow';
import { parseFilters, serializeFilters, type FilterState } from './urlState';
import { sourceLabel } from './format';
import { EventCard } from './EventCard';
import { EventModal } from './EventModal';
import { VenueModal } from './VenueModal';
import { MapView } from './MapView';
import { FilterDropdown } from './FilterDropdown';

/** Cards rendered per page — keeps initial paint fast on large result sets. */
const PAGE_SIZE = 60;

/** Stable empty array so memo dependencies don't churn before data loads. */
const EMPTY_EVENTS: Event[] = [];

/** Two-letter state → display name for the location selector. */
const STATE_NAMES: Record<string, string> = {
  NY: 'New York', NJ: 'New Jersey', CT: 'Connecticut', RI: 'Rhode Island',
  MA: 'Massachusetts', PA: 'Pennsylvania', MD: 'Maryland', DE: 'Delaware',
  DC: 'Washington DC', VA: 'Virginia', NH: 'New Hampshire', VT: 'Vermont', ME: 'Maine',
};
const DEFAULT_PLACES = [{ state: 'NY', cities: [{ name: 'New York', count: 0 }] }];
/** Max city chips shown per state; the long tail is reachable via "All <state>". */
const CITY_CHIP_CAP = 24;

const BOROUGHS: Borough[] = ['Manhattan', 'Brooklyn', 'Queens', 'Bronx'];
const DATE_WINDOWS: { key: DateWindow; label: string }[] = [
  { key: 'all', label: 'Any date' },
  { key: 'today', label: 'Today' },
  { key: 'weekend', label: 'This weekend' },
  { key: 'week', label: 'Next 7 days' },
];
const PICKED_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** A picked date that has already passed is meaningless — treat it as "any date"
 *  so a shared link or saved search never hydrates into a silently-empty board. */
function effectiveWindow(dw: DateWindow, today: string): DateWindow {
  return PICKED_DATE_RE.test(dw) && dw < today ? 'all' : dw;
}
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
  const { searches, save: saveSearch, remove: removeSearch, markSeen } = useSavedSearches();
  const { archive, loadArchive } = useArchive();

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
  const [dateWindow, setDateWindow] = useState<DateWindow>(effectiveWindow(init.dateWindow, today));
  const [savedOnly, setSavedOnly] = useState(false);
  const [copied, setCopied] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');
  const [filtersOpen, setFiltersOpen] = useState(false);
  // Selected event id drives the detail modal; also synced into ?event= URL param.
  const [selectedEventId, setSelectedEventId] = useState<string | null>(
    () => new URLSearchParams(window.location.search).get('event'),
  );
  // Selected venue name drives the venue "page" modal; synced into ?venue=.
  const [selectedVenue, setSelectedVenue] = useState<string | null>(
    () => new URLSearchParams(window.location.search).get('venue'),
  );
  // Selected location: a state (NY default) + a city within it. The NYC default
  // (NY + New York) uses only the lean live file; everything else lazy-loads the archive.
  const [stateFilter, setStateFilter] = useState<string>(
    () => new URLSearchParams(window.location.search).get('state') || 'NY',
  );
  const [cityFilter, setCityFilter] = useState<string>(() => {
    const sp = new URLSearchParams(window.location.search);
    return sp.get('city') || ((sp.get('state') || 'NY') === 'NY' ? 'New York' : 'All');
  });

  const liveEvents = state.status === 'ready' ? state.payload.events : EMPTY_EVENTS;
  const archiveEvents = archive.status === 'ready' ? archive.events : EMPTY_EVENTS;
  const places = state.status === 'ready' ? (state.payload.places ?? DEFAULT_PLACES) : DEFAULT_PLACES;
  const stateCities = useMemo(
    () => places.find((p) => p.state === stateFilter)?.cities ?? [],
    [places, stateFilter],
  );
  // Top cities by event count for the chip drill-down; always keep the selected
  // one visible even if it's in the long tail.
  const cityChips = useMemo(() => {
    const top = stateCities.slice(0, CITY_CHIP_CAP);
    if (cityFilter !== 'All' && !top.some((c) => c.name === cityFilter)) {
      const sel = stateCities.find((c) => c.name === cityFilter);
      if (sel) return [...top, sel];
    }
    return top;
  }, [stateCities, cityFilter]);

  // Only the NYC default lives entirely in the live file; anything else needs the archive.
  const isNycDefault = stateFilter === 'NY' && cityFilter === 'New York';
  useEffect(() => {
    if (!isNycDefault) loadArchive();
  }, [isNycDefault, loadArchive]);

  // The event set for the selected state + city. NYC default = live file only;
  // otherwise filter the full superset by state and (optionally) city.
  const allEvents = useMemo(() => {
    if (isNycDefault) return liveEvents;
    const pool = [...liveEvents, ...archiveEvents];
    return pool.filter((e) => {
      if (stateFilter !== 'All' && (e.state ?? 'NY') !== stateFilter) return false;
      if (cityFilter !== 'All' && (e.city ?? 'New York') !== cityFilter) return false;
      return true;
    });
  }, [isNycDefault, stateFilter, cityFilter, liveEvents, archiveEvents]);

  // Auto-request geolocation when the "Nearest" sort is active.
  useEffect(() => {
    if (sort === 'nearest' && geo.status === 'idle') requestGeo();
  }, [sort, geo.status, requestGeo]);

  // Keep the URL in sync with the filters so the current view is shareable.
  useEffect(() => {
    const qs = serializeFilters({ borough, neighborhoods, sources, categories, freeOnly, maxPrice, search, sort, dateWindow });
    const p = qs ? new URLSearchParams(qs) : new URLSearchParams();
    if (selectedEventId) p.set('event', selectedEventId);
    if (selectedVenue) p.set('venue', selectedVenue);
    if (stateFilter !== 'NY') p.set('state', stateFilter);
    if (cityFilter !== (stateFilter === 'NY' ? 'New York' : 'All')) p.set('city', cityFilter);
    const str = p.toString();
    const url = `${window.location.pathname}${str ? `?${str}` : ''}`;
    window.history.replaceState(null, '', url);
  }, [borough, neighborhoods, sources, categories, freeOnly, maxPrice, search, sort, dateWindow, selectedEventId, selectedVenue, stateFilter, cityFilter]);

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

  // Switching location resets the NYC-only borough/neighborhood sub-filters.
  function selectState(next: string) {
    setStateFilter(next);
    setCityFilter(next === 'NY' ? 'New York' : 'All');
    setBorough('All');
    setNeighborhoods([]);
  }
  function selectCityFilter(next: string) {
    setCityFilter(next);
    setBorough('All');
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

  // Memoized so its identity is stable across renders; otherwise a fresh object
  // literal each render would defeat the `visible` memo and re-sort every time.
  const userCoords = useMemo(
    () => (geo.status === 'ok' ? { lat: geo.lat, lon: geo.lon } : undefined),
    [geo],
  );

  // Events matching the current filter criteria (no savedOnly, no sort). This is
  // the set a saved search captures, so it's computed once and reused below.
  const filtered = useMemo(
    () =>
      filterEvents(allEvents, {
        borough: borough === 'All' ? undefined : borough,
        neighborhoods: neighborhoods.length > 0 ? neighborhoods : undefined,
        sources: sources.length > 0 ? sources : undefined,
        categories: categories.length > 0 ? categories : undefined,
        freeOnly,
        maxPrice: maxPrice > 0 ? maxPrice : undefined,
        search,
        dateWindow,
        today,
      }),
    [allEvents, borough, neighborhoods, sources, categories, freeOnly, maxPrice, search, dateWindow, today],
  );

  const visible = useMemo(() => {
    const results = savedOnly ? filtered.filter((e) => saved.has(e.id)) : filtered;
    return sortEvents(results, sort, userCoords);
  }, [filtered, savedOnly, saved, sort, userCoords]);

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

  // All upcoming events at the selected venue, soonest first (drives VenueModal).
  const venueEvents = useMemo(
    () =>
      selectedVenue
        ? sortEvents(
            allEvents.filter((e) => e.venue === selectedVenue),
            'soonest',
          )
        : [],
    [selectedVenue, allEvents],
  );

  // For each saved search, which event ids currently match and how many are new
  // (matching but not yet seen). Recomputed whenever the dataset changes.
  const searchStatus = useMemo(() => {
    const map = new Map<string, { matchIds: string[]; newCount: number }>();
    for (const s of searches) {
      const fs = parseFilters(s.qs);
      const matchIds = filterEvents(allEvents, {
        borough: fs.borough === 'All' ? undefined : fs.borough,
        neighborhoods: fs.neighborhoods.length > 0 ? fs.neighborhoods : undefined,
        sources: fs.sources.length > 0 ? fs.sources : undefined,
        categories: fs.categories.length > 0 ? fs.categories : undefined,
        freeOnly: fs.freeOnly,
        maxPrice: fs.maxPrice > 0 ? fs.maxPrice : undefined,
        search: fs.search,
        dateWindow: effectiveWindow(fs.dateWindow, today),
        today,
      }).map((e) => e.id);
      const seen = new Set(s.seenIds);
      map.set(s.id, { matchIds, newCount: matchIds.filter((id) => !seen.has(id)).length });
    }
    return map;
  }, [searches, allEvents, today]);

  const totalNew = useMemo(
    () => [...searchStatus.values()].reduce((sum, s) => sum + s.newCount, 0),
    [searchStatus],
  );

  // Fire a single browser notification per load when saved searches have new
  // matches and the user has granted permission. Guarded so it runs once.
  const notifiedRef = useRef(false);
  useEffect(() => {
    if (notifiedRef.current || state.status !== 'ready' || totalNew === 0) return;
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    notifiedRef.current = true;
    try {
      new Notification('NYC Events', {
        body: `${totalNew} new event${totalNew === 1 ? '' : 's'} match your saved searches.`,
      });
    } catch {
      // Some browsers throw unless invoked from a service worker — non-fatal.
    }
  }, [state.status, totalNew]);

  // A shared ?venue= link whose venue has no upcoming events (all passed) should
  // fall back to the board rather than leave a dead modal reference around.
  useEffect(() => {
    if (selectedVenue && state.status === 'ready' && venueEvents.length === 0) {
      setSelectedVenue(null);
    }
  }, [selectedVenue, state.status, venueEvents.length]);

  // Symmetric cleanup for a stale ?event= id that resolves to no loaded event
  // (e.g. a shared link to an event that has since passed), so the orphaned
  // param doesn't linger in the URL behind the venue board.
  useEffect(() => {
    if (selectedEventId && state.status === 'ready' && !selectedEvent) {
      setSelectedEventId(null);
    }
  }, [selectedEventId, state.status, selectedEvent]);

  // Apply a saved search's filters to the live state and mark its matches seen.
  function applySearch(s: SavedSearch) {
    const fs: FilterState = parseFilters(s.qs);
    setBorough(fs.borough);
    setNeighborhoods(fs.neighborhoods);
    setSources(fs.sources);
    setCategories(fs.categories);
    setFreeOnly(fs.freeOnly);
    setMaxPrice(fs.maxPrice);
    setSearch(fs.search);
    setSort(fs.sort);
    setDateWindow(effectiveWindow(fs.dateWindow, today));
    setSavedOnly(false);
    setFiltersOpen(false);
    markSeen(s.id, searchStatus.get(s.id)?.matchIds ?? []);
  }

  // Capture the current filters as a named saved search.
  function saveCurrentSearch() {
    const name = window.prompt('Name this search (e.g. "Free jazz in Brooklyn"):');
    if (!name?.trim()) return;
    const qs = serializeFilters({
      borough, neighborhoods, sources, categories, freeOnly, maxPrice, search, sort, dateWindow,
    });
    saveSearch(name.trim(), qs, filtered.map((e) => e.id));
    // First save is a good moment to ask for notification permission (optional).
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
  }

  function openVenue(name: string) {
    setSelectedEventId(null);
    setSelectedVenue(name);
  }

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

      {places.length > 1 && (
        <nav className="cities" aria-label="Select state">
          {places.map((p) => (
            <button
              key={p.state}
              className={`city-tab ${stateFilter === p.state ? 'city-tab--active' : ''}`}
              aria-pressed={stateFilter === p.state}
              onClick={() => selectState(p.state)}
            >
              {STATE_NAMES[p.state] ?? p.state}
            </button>
          ))}
          <button
            className={`city-tab ${stateFilter === 'All' ? 'city-tab--active' : ''}`}
            aria-pressed={stateFilter === 'All'}
            onClick={() => selectState('All')}
          >
            All states
          </button>
        </nav>
      )}

      {stateFilter !== 'All' && cityChips.length > 1 && (
        <nav className="hoods" aria-label={`Select a city in ${STATE_NAMES[stateFilter] ?? stateFilter}`}>
          <button
            className={`hood ${cityFilter === 'All' ? 'hood--active' : ''}`}
            aria-pressed={cityFilter === 'All'}
            onClick={() => selectCityFilter('All')}
          >
            All {STATE_NAMES[stateFilter] ?? stateFilter}
          </button>
          {cityChips.map((c) => (
            <button
              key={c.name}
              className={`hood ${cityFilter === c.name ? 'hood--active' : ''}`}
              aria-pressed={cityFilter === c.name}
              onClick={() => selectCityFilter(c.name)}
            >
              {c.name}
            </button>
          ))}
        </nav>
      )}

      {stateFilter === 'NY' && cityFilter === 'New York' && (
        <>
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
        </>
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

          {stateFilter === 'NY' && cityFilter === 'New York' && sourcesInData.length > 1 && (
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

          <FilterDropdown label="🔔 Searches" activeCount={totalNew} align="right">
            <div className="fdd__searches">
              {searches.length === 0 ? (
                <p className="fdd__empty">
                  No saved searches yet. Filter the board the way you like, then save it to track new
                  matching events.
                </p>
              ) : (
                <ul className="saved-search-list">
                  {searches.map((s) => {
                    const st = searchStatus.get(s.id);
                    const n = st?.newCount ?? 0;
                    return (
                      <li key={s.id} className="saved-search">
                        <button
                          className="saved-search__apply"
                          onClick={() => applySearch(s)}
                          title="Apply this search"
                        >
                          <span className="saved-search__name">{s.name}</span>
                          <span className="saved-search__count">
                            {st?.matchIds.length ?? 0} events
                            {n > 0 && <span className="saved-search__new"> · {n} new</span>}
                          </span>
                        </button>
                        <button
                          className="saved-search__remove"
                          onClick={() => removeSearch(s.id)}
                          aria-label={`Delete saved search ${s.name}`}
                          title="Delete"
                        >
                          ×
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
              <button className="saved-search__add" onClick={saveCurrentSearch}>
                ＋ Save current filters
              </button>
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
        {state.status === 'ready' && !isNycDefault && archive.status === 'loading' && (
          <p className="notice">Loading events…</p>
        )}
        {state.status === 'ready' && !isNycDefault && archive.status === 'error' && (
          <p className="notice notice--error">Couldn't load archived events.</p>
        )}
        {state.status === 'ready' && (isNycDefault || archive.status === 'ready') && (
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
                      onOpenVenue={() => openVenue(event.venue)}
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
          onOpenVenue={() => openVenue(selectedEvent.venue)}
        />
      )}

      {selectedVenue && !selectedEvent && venueEvents.length > 0 && (
        <VenueModal
          venue={selectedVenue}
          events={venueEvents}
          saved={saved}
          onClose={() => setSelectedVenue(null)}
          onSelectEvent={(id) => {
            setSelectedVenue(null);
            setSelectedEventId(id);
          }}
        />
      )}
    </div>
  );
}
