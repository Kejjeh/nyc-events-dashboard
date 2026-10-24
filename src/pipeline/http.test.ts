import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchJson, fetchText } from './http';

afterEach(() => vi.unstubAllGlobals());

describe('fetchJson / fetchText', () => {
  it('returns parsed JSON on a 200', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"hello":"world"}', { status: 200 })));

    const body = await fetchJson('https://x.test', {}, 'Test');

    expect(body).toEqual({ hello: 'world' });
  });

  it('throws a labelled error on a non-ok status', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 404 })));

    await expect(fetchJson('https://x.test', {}, 'Songkick')).rejects.toThrow(
      'Songkick fetch failed: HTTP 404',
    );
  });

  it('names the source and the attempt count when a retryable status never clears', async () => {
    // The case BPL hit in CI: a 403 on every attempt. The old message was the
    // per-attempt "transient HTTP 403", which is wrong after the fourth one.
    const fetchMock = vi.fn(async () => new Response('blocked', { status: 403 }));
    vi.stubGlobal('fetch', fetchMock);
    vi.useFakeTimers();
    try {
      const pending = fetchJson('https://x.test', {}, 'BPL');
      const rejection = expect(pending).rejects.toThrow('BPL fetch failed: HTTP 403 on all 4 attempts');
      await vi.runAllTimersAsync();
      await rejection;
      expect(fetchMock).toHaveBeenCalledTimes(4); // initial + 3 retries
    } finally {
      vi.useRealTimers();
    }
  });

  it('fetchText returns the body text on a 200', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<rss>ok</rss>', { status: 200 })));

    const text = await fetchText('https://x.test', {}, 'Parks');

    expect(text).toBe('<rss>ok</rss>');
  });
});
