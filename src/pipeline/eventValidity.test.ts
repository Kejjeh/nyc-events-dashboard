import { describe, expect, it } from 'vitest';
import { hasIsoStart } from './eventValidity';
import type { Event } from '../domain/event';

function ev(start: unknown): Event {
  return {
    id: 'x',
    title: 'T',
    category: 'other',
    borough: 'Manhattan',
    venue: 'V',
    start,
    isFree: false,
    url: 'u',
    source: 'test',
  } as Event;
}

describe('hasIsoStart', () => {
  it('accepts a full ISO datetime start', () => {
    expect(hasIsoStart(ev('2026-08-01T20:00:00'))).toBe(true);
  });

  it('rejects a bare date with no time component', () => {
    expect(hasIsoStart(ev('2026-08-01'))).toBe(false);
  });

  it('rejects a malformed start like "nullT19:30:00"', () => {
    expect(hasIsoStart(ev('nullT19:30:00'))).toBe(false);
  });

  it('rejects a non-string start', () => {
    expect(hasIsoStart(ev(undefined))).toBe(false);
    expect(hasIsoStart(ev(20260801))).toBe(false);
  });
});
