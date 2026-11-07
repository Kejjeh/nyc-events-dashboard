import { withRetry } from './retry';

/**
 * Transient statuses worth retrying. NYC Parks (CloudFront origin/WAF) returns a
 * sporadic 403 on cache-miss that a retry recovers; Socrata returns transient
 * 503s. A non-retryable status (e.g. 404) is returned as-is for the caller.
 */
const RETRYABLE_STATUS = new Set([403, 429, 500, 502, 503, 504]);

/** Per-attempt request timeout so a hung connection becomes a retryable error
 *  instead of stalling the whole pipeline forever. */
const REQUEST_TIMEOUT_MS = 20000;
const RETRIES = 3;

/** A status worth retrying, carried through withRetry so the final error can name it. */
class RetryableStatusError extends Error {
  constructor(readonly status: number) {
    super(`HTTP ${status} (retryable)`);
    this.name = 'RetryableStatusError';
  }
}

/**
 * Fetch with a per-attempt timeout and bounded exponential-backoff retries.
 *
 * When every attempt fails on a retryable status, the error says so — "HTTP 403
 * on all 4 attempts" — rather than re-throwing the per-attempt "transient"
 * wording. BPL sat on a persistent 403 for a week while the run log kept calling
 * it transient.
 */
export async function fetchWithRetry(url: string, init?: RequestInit): Promise<Response> {
  try {
    return await withRetry(
      async () => {
        // A fresh timeout signal per attempt; AbortError rejects (and retries)
        // rather than hanging if the server accepts but never responds.
        const res = await fetch(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
        if (RETRYABLE_STATUS.has(res.status)) throw new RetryableStatusError(res.status);
        return res;
      },
      { retries: RETRIES, baseDelayMs: 1000 },
    );
  } catch (err) {
    if (err instanceof RetryableStatusError) {
      throw new Error(`HTTP ${err.status} on all ${RETRIES + 1} attempts`);
    }
    throw err;
  }
}

/**
 * The shared fetch → status-check step: any failure, including one that
 * survived the retries, carries the source label so the run log names who broke.
 */
async function fetchOk(url: string, init: RequestInit | undefined, label: string): Promise<Response> {
  let res: Response;
  try {
    res = await fetchWithRetry(url, init);
  } catch (err) {
    throw new Error(`${label} fetch failed: ${(err as Error).message}`);
  }
  if (!res.ok) throw new Error(`${label} fetch failed: HTTP ${res.status}`);
  return res;
}

/**
 * Fetch JSON with retry, failing loud with a labelled error on a non-ok status —
 * the fetch → status-check → parse triplet every JSON source used to hand-roll.
 * `label` names the source so a failure carries forward the right last-good data.
 */
export async function fetchJson<T = any>(
  url: string,
  init: RequestInit | undefined,
  label: string,
): Promise<T> {
  const res = await fetchOk(url, init, label);
  return (await res.json()) as T;
}

/** As {@link fetchJson}, but returns the response body as text (RSS/HTML feeds). */
export async function fetchText(
  url: string,
  init: RequestInit | undefined,
  label: string,
): Promise<string> {
  const res = await fetchOk(url, init, label);
  return res.text();
}
