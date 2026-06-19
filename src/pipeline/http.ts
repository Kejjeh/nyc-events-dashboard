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

/** Fetch with a per-attempt timeout and bounded exponential-backoff retries. */
export function fetchWithRetry(url: string, init?: RequestInit): Promise<Response> {
  return withRetry(
    async () => {
      // A fresh timeout signal per attempt; AbortError rejects (and retries)
      // rather than hanging if the server accepts but never responds.
      const res = await fetch(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
      if (RETRYABLE_STATUS.has(res.status)) {
        throw new Error(`transient HTTP ${res.status}`);
      }
      return res;
    },
    { retries: 3, baseDelayMs: 1000 },
  );
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
  const res = await fetchWithRetry(url, init);
  if (!res.ok) throw new Error(`${label} fetch failed: HTTP ${res.status}`);
  return (await res.json()) as T;
}

/** As {@link fetchJson}, but returns the response body as text (RSS/HTML feeds). */
export async function fetchText(
  url: string,
  init: RequestInit | undefined,
  label: string,
): Promise<string> {
  const res = await fetchWithRetry(url, init);
  if (!res.ok) throw new Error(`${label} fetch failed: HTTP ${res.status}`);
  return res.text();
}
