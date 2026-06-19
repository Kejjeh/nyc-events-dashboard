import { useState } from 'react';
import type { Category } from '../domain/event';
import { effectiveWindow, type DateWindow } from './dateWindow';
import type { SortKey } from './filters';
import type { FilterState } from './urlState';

/**
 * The dashboard's non-location filter axis, bundled into one module: the seven
 * fields that are independent toggles (the location axis lives in
 * filterSelection). Hydrated from the parsed URL state; a shared link's expired
 * picked date is collapsed to "all" at hydration so it never opens empty.
 */
export function useFilters(init: FilterState, today: string) {
  const [sources, setSources] = useState<string[]>(init.sources);
  const [categories, setCategories] = useState<Category[]>(init.categories);
  const [freeOnly, setFreeOnly] = useState(init.freeOnly);
  const [maxPrice, setMaxPrice] = useState(init.maxPrice);
  const [search, setSearch] = useState(init.search);
  const [sort, setSort] = useState<SortKey>(init.sort);
  const [dateWindow, setDateWindow] = useState<DateWindow>(effectiveWindow(init.dateWindow, today));

  return {
    sources, setSources,
    categories, setCategories,
    freeOnly, setFreeOnly,
    maxPrice, setMaxPrice,
    search, setSearch,
    sort, setSort,
    dateWindow, setDateWindow,
  };
}
