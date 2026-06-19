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

  it('fetchText returns the body text on a 200', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<rss>ok</rss>', { status: 200 })));

    const text = await fetchText('https://x.test', {}, 'Parks');

    expect(text).toBe('<rss>ok</rss>');
  });
});
