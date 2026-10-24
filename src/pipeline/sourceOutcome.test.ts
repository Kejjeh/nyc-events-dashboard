import { describe, it, expect } from 'vitest';
import {
  MissingCredentialsError,
  authoritativeSources,
  fetchedBatches,
  settleSource,
  skippedSource,
  type SourceOutcome,
} from './sourceOutcome';
import type { RawBatch } from './assemble';

describe('settleSource', () => {
  it('classifies a successful fetch as ok and keeps its batch', async () => {
    const batch: RawBatch = { source: 'bpl', records: [{ a: 1 }, { a: 2 }] };
    const outcome = await settleSource('bpl', Promise.resolve(batch));
    expect(outcome).toEqual({
      source: 'bpl',
      health: 'ok',
      batch,
      detail: '2 raw records',
    });
  });

  it('classifies a successful but empty fetch as ok — a genuine zero is authoritative', async () => {
    const outcome = await settleSource('todaytix', Promise.resolve({ source: 'todaytix', records: [] }));
    expect(outcome.health).toBe('ok');
    expect(outcome.batch).toEqual({ source: 'todaytix', records: [] });
  });

  it('classifies a missing credential as missing-key, not as a zero result', async () => {
    const outcome = await settleSource(
      'seatgeek',
      Promise.reject(new MissingCredentialsError('SEATGEEK_CLIENT_ID')),
    );
    expect(outcome.health).toBe('missing-key');
    expect(outcome.batch).toBeNull();
    expect(outcome.detail).toContain('SEATGEEK_CLIENT_ID');
  });

  it('classifies any other rejection as error and keeps the message', async () => {
    const outcome = await settleSource('dice', Promise.reject(new Error('DICE fetch failed: HTTP 429')));
    expect(outcome.health).toBe('error');
    expect(outcome.batch).toBeNull();
    expect(outcome.detail).toBe('DICE fetch failed: HTTP 429');
  });

  it('never rejects — one failing source must not sink the refresh', async () => {
    await expect(settleSource('cityparks', Promise.reject(new Error('boom')))).resolves.toMatchObject({
      health: 'error',
    });
  });
});

describe('skippedSource', () => {
  it('records a deliberate non-fetch with its reason', () => {
    expect(skippedSource('serpapi', 'quota')).toEqual({
      source: 'serpapi',
      health: 'skipped',
      batch: null,
      detail: 'quota',
    });
  });
});

describe('authoritativeSources', () => {
  const outcomes: SourceOutcome[] = [
    { source: 'bpl', health: 'ok', batch: { source: 'bpl', records: [] } },
    { source: 'seatgeek', health: 'missing-key', batch: null },
    { source: 'serpapi', health: 'skipped', batch: null },
    { source: 'dice', health: 'error', batch: null },
  ];

  it('includes only sources that actually fetched', () => {
    expect(authoritativeSources(outcomes)).toEqual(['bpl']);
  });

  it('excludes missing-key, skipped and errored sources so carry-forward protects them', () => {
    const authoritative = new Set(authoritativeSources(outcomes));
    expect(authoritative.has('seatgeek')).toBe(false);
    expect(authoritative.has('serpapi')).toBe(false);
    expect(authoritative.has('dice')).toBe(false);
  });

  it('returns the batches of ok outcomes only', () => {
    expect(fetchedBatches(outcomes)).toEqual([{ source: 'bpl', records: [] }]);
  });
});
