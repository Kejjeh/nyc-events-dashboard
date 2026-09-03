---
name: add-event-source
description: Add a new event source to the pipeline (normalizer + fetcher + registration). Use when asked to add, integrate, or wire up a new event source or API.
---

# Add an event source

Exactly four edits, in this order. Copy an existing pair as the template:
`src/ingestion/bpl.ts` (keyless JSON API) or `src/ingestion/jambase.ts` (keyed).

1. **Normalizer, test-first**: `src/ingestion/<src>.test.ts` then
   `src/ingestion/<src>.ts` exporting `normalize<Src>Event(raw: any): Event | null`.
   - Use a REAL sample record from the source in the test (fetch one first).
   - Return `null` to drop a record. Namespace the id (`<src>:${rawId}`).
   - Coordinates → `nycLocationFromLatLng(lat, lon)` for NYC, or
     `localityFromLatLng` for non-NYC. No coords → borough only, never guess
     a neighborhood.
   - `start` must be bare ET wall-clock ISO (`YYYY-MM-DDTHH:mm:ss`, no Z/offset).
     Use helpers in `src/ingestion/datetime.ts`.
2. **Fetcher**: `fetch<Src>()` in `src/pipeline/sources.ts` returning
   `Promise<RawBatch>` (`{source: '<src>', records}`). Use `fetchJson`/`fetchText`
   (they retry + timeout) and `BROWSER_UA` for scrapes. THROW on failure or
   zero-parse — carry-forward then keeps last-good data. If it needs a key:
   read `process.env.<NAME>`, add the secret to the `Refresh events data` env
   block in `.github/workflows/deploy.yml`, and note the quota. Never write the
   key value into any file.
3. **Register in `src/pipeline/assemble.ts`**: add to the `SourceName` union AND
   the `NORMALIZERS` record. Skipping this silently drops every record.
4. **Register in `src/pipeline/run.ts`**: add a `settle('<src>', fetch<Src>(...))`
   entry. If the source is expensive/quota-limited, put it in the
   `onPush ? [] : [...]` block so push runs skip it.

Verify: `npm run check`, then `npm run build:data` — the log must show
`<src>: N raw records` with a sane N. Then `git checkout -- public/data/`
(never commit locally-built data).
