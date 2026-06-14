import { describe, it, expect, vi } from 'vitest';
import { withRetry } from './retry';

const noSleep = () => Promise.resolve();

describe('withRetry', () => {
  it('returns the result without retrying when the first attempt succeeds', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    await expect(withRetry(fn, { retries: 3, sleep: noSleep })).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on failure and resolves once an attempt succeeds', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValue('ok');
    await expect(withRetry(fn, { retries: 3, sleep: noSleep })).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('throws the last error after exhausting all retries', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('still down'));
    await expect(withRetry(fn, { retries: 2, sleep: noSleep })).rejects.toThrow('still down');
    expect(fn).toHaveBeenCalledTimes(3); // initial + 2 retries
  });

  it('stops immediately when shouldRetry returns false', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('HTTP 404'));
    const shouldRetry = (err: Error) => !err.message.includes('404');
    await expect(
      withRetry(fn, { retries: 5, sleep: noSleep, shouldRetry }),
    ).rejects.toThrow('404');
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
