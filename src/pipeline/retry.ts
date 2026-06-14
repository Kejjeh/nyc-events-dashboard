export interface RetryOptions {
  /** Number of retries after the initial attempt. */
  retries?: number;
  /** Base delay in ms; grows exponentially (base * 2^attempt). */
  baseDelayMs?: number;
  /** Decides whether a given error is worth retrying. Defaults to always. */
  shouldRetry?: (err: Error) => boolean;
  /** Injectable delay (overridden in tests to avoid real waits). */
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Runs an async function with exponential-backoff retries. Throws the last
 * error once retries are exhausted or shouldRetry rejects the error.
 */
export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const { retries = 2, baseDelayMs = 500, shouldRetry = () => true, sleep = defaultSleep } = opts;

  let lastError: Error;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err as Error;
      if (attempt === retries || !shouldRetry(lastError)) break;
      await sleep(baseDelayMs * 2 ** attempt);
    }
  }
  throw lastError!;
}
