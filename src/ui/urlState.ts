import type { Borough, Category } from '../domain/event';
import type { SortKey } from './filters';
import type { DateWindow } from './dateWindow';

/** The full filter state the dashboard serializes into a shareable URL. */
export interface FilterState {
  borough: Borough | 'All';
  neighborhood: string;
  category: Category | 'All';
  freeOnly: boolean;
  search: string;
  sort: SortKey;
  dateWindow: DateWindow;
}

export const DEFAULT_FILTERS: FilterState = {
  borough: 'All',
  neighborhood: 'All',
  category: 'All',
  freeOnly: false,
  search: '',
  sort: 'soonest',
  dateWindow: 'all',
};

const BOROUGHS: readonly string[] = ['Manhattan', 'Brooklyn', 'Queens', 'Bronx'];
const CATEGORIES: readonly string[] = [
  'music',
  'comedy',
  'theater',
  'film',
  'food',
  'sports',
  'museum',
  'social',
  'other',
];
const SORTS: readonly string[] = ['soonest', 'borough', 'category'];
const NAMED_WINDOWS: readonly string[] = ['all', 'today', 'weekend', 'week'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** True for a real calendar date (rejects shapes like 2026-13-45 from crafted links). */
function isRealDate(s: string): boolean {
  if (!DATE_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** Serializes filter state to a query string, omitting anything left at default. */
export function serializeFilters(s: FilterState): string {
  const p = new URLSearchParams();
  if (s.borough !== 'All') p.set('b', s.borough);
  if (s.borough !== 'All' && s.neighborhood !== 'All') p.set('n', s.neighborhood);
  if (s.category !== 'All') p.set('c', s.category);
  if (s.freeOnly) p.set('free', '1');
  if (s.search.trim()) p.set('q', s.search.trim());
  if (s.sort !== 'soonest') p.set('sort', s.sort);
  if (s.dateWindow !== 'all') p.set('when', s.dateWindow);
  return p.toString();
}

/** Parses a query string back into a full, validated filter state. */
export function parseFilters(search: string): FilterState {
  const p = new URLSearchParams(search);
  const out: FilterState = { ...DEFAULT_FILTERS };

  const b = p.get('b');
  if (b && BOROUGHS.includes(b)) out.borough = b as Borough;
  const c = p.get('c');
  if (c && CATEGORIES.includes(c)) out.category = c as Category;
  if (p.get('free') === '1') out.freeOnly = true;
  const q = p.get('q');
  if (q) out.search = q;
  const sort = p.get('sort');
  if (sort && SORTS.includes(sort)) out.sort = sort as SortKey;
  const when = p.get('when');
  if (when && (NAMED_WINDOWS.includes(when) || isRealDate(when))) out.dateWindow = when;

  // A neighborhood only has meaning inside a chosen borough.
  const n = p.get('n');
  if (n && out.borough !== 'All') out.neighborhood = n;

  return out;
}
