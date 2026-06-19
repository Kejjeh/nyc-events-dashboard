import { describe, expect, it } from 'vitest';
import {
  selectBorough,
  selectCity,
  selectState,
  toggleNeighborhood,
  type LocationSelection,
} from './filterSelection';

function sel(overrides: Partial<LocationSelection> = {}): LocationSelection {
  return {
    stateFilter: 'NY',
    cityFilter: 'New York',
    borough: 'All',
    neighborhoods: [],
    ...overrides,
  };
}

describe('filterSelection', () => {
  it('selecting a borough clears the neighborhood selection', () => {
    const before = sel({ borough: 'Brooklyn', neighborhoods: ['Williamsburg'] });

    const after = selectBorough(before, 'Manhattan');

    expect(after.borough).toBe('Manhattan');
    expect(after.neighborhoods).toEqual([]);
  });

  it('selecting a city resets the borough and neighborhood drill', () => {
    const before = sel({ cityFilter: 'New York', borough: 'Queens', neighborhoods: ['Astoria'] });

    const after = selectCity(before, 'Boston');

    expect(after.cityFilter).toBe('Boston');
    expect(after.borough).toBe('All');
    expect(after.neighborhoods).toEqual([]);
  });

  it('selecting a non-NY state defaults its city to "All" and clears the drill', () => {
    const before = sel({ borough: 'Manhattan', neighborhoods: ['SoHo'] });

    const after = selectState(before, 'MA');

    expect(after.stateFilter).toBe('MA');
    expect(after.cityFilter).toBe('All');
    expect(after.borough).toBe('All');
    expect(after.neighborhoods).toEqual([]);
  });

  it('selecting NY defaults its city to "New York"', () => {
    const before = sel({ stateFilter: 'MA', cityFilter: 'Boston' });

    const after = selectState(before, 'NY');

    expect(after.stateFilter).toBe('NY');
    expect(after.cityFilter).toBe('New York');
  });

  it('toggling a neighborhood adds it when absent, keeping existing ones', () => {
    const before = sel({ borough: 'Brooklyn', neighborhoods: ['Williamsburg'] });

    const after = toggleNeighborhood(before, 'Bushwick');

    expect(after.neighborhoods).toEqual(['Williamsburg', 'Bushwick']);
  });

  it('toggling a selected neighborhood removes it without touching the others', () => {
    const before = sel({ borough: 'Brooklyn', neighborhoods: ['Williamsburg', 'Bushwick'] });

    const after = toggleNeighborhood(before, 'Williamsburg');

    expect(after.neighborhoods).toEqual(['Bushwick']);
  });
});
