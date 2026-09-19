# NYC Events Dashboard — agent guide

Static events dashboard for NYC (+ banked Northeast cities): a TypeScript pipeline
fetches ~17 event sources, normalizes them into one `Event` model, and commits
`public/data/*.json`; a Vite + React 19 PWA reads that JSON and renders
filter/sort/map views on GitHub Pages. No server, no database. Built June 2026;
since then it runs unattended on a twice-daily GitHub Actions cron (which commits
data refreshes to `origin/main` — **run `git pull` before starting work**, local
main is usually behind). State of play, bugs, and next steps: see `HANDOFF.md`.

## Commands

```bash
npm ci               # install (Node 22)
npm run check        # typecheck + full test suite (~10s) — THE verification command
npm test             # tests only (429 tests, ~3s)
npm run dev          # dashboard at localhost:5173 (or .claude/launch.json "dashboard")
npm run build        # production build (expect a >500kB chunk warning — known, ignore)
npm run build:data   # data pipeline — READ THE WARNING BELOW FIRST
```

**`build:data` note:** a keyless local run no longer wipes the bank — keyed
fetchers (ticketmaster, seatgeek, songkick, serpapi, jambase) throw
`MissingCredentialsError`, so they count as *not configured*, not as a successful
zero, and carry-forward keeps their banked events (see `sourceOutcome.ts`). It
still rewrites `public/data/*.json` with a fresh `generatedAt` and whatever your
network could reach, so **never commit its output from a local run**; restore
with `git checkout -- public/data/`.

## Architecture map (detail: docs/ARCHITECTURE.md)

- `src/pipeline/run.ts` — composition root: reads env, wires the real fetchers into `refresh()`.
- `src/pipeline/refresh.ts` — one refresh end to end: validate both snapshots (fail closed on a corrupt/unreadable existing file; only a missing file is a first run), fetch, run the pipeline, write. Filesystem is an injectable seam.
- `src/pipeline/sources.ts` — every `fetch<Source>()` (HTTP/scrape). 900 lines, no test file.
- `src/ingestion/<source>.ts` — pure `normalize<Source>Event(raw) => Event | null`, one per source, test-first.
- `src/pipeline/assemble.ts` — `SourceName` union + `NORMALIZERS` registry; drops bad records.
- `src/pipeline/sourceOutcome.ts` — per-source outcome: `ok` / `missing-key` / `skipped` / `error`. Only `ok` is authoritative.
- `src/pipeline/runPipeline.ts` — the orchestration itself, I/O-free and injectable (`run.ts` supplies clock, fetchers, files).
- `src/pipeline/carryForward.ts` — keeps last-good events for sources that were not authoritative this run.
- `src/pipeline/dedup.ts` — collapses the same show across ticketing sources into `altTicketLinks`.
- `src/pipeline/partition.ts` — live board (NYC, ≤120 days) vs. lazy-loaded archive (rest).
- `src/pipeline/enrichmentChain.ts` — staged enrichment: geocode → neighborhood → weather → spotify.
- `src/domain/event.ts` — the `Event` model. `city`/`state` absent ⇒ "New York"/"NY" (load-bearing default).
- `src/ui/App.tsx` — the only stateful component; all logic lives in pure modules + hooks beside it.
- `src/ui/filters.ts`, `filterSelection.ts`, `urlState.ts` — filtering, location drill-down transitions, URL sync.
- `.github/workflows/deploy.yml` — test → refresh data → commit data → build → deploy Pages.
- `scripts/ui-smoke/` — offline headless-Chromium run of the built app on a hostile synthetic payload (README there). Not part of `npm run check`; Playwright is not a project dependency.

## Conventions

- New source = 4 edits: normalizer in `src/ingestion/`, `fetch<Src>()` in `sources.ts`,
  register in `assemble.ts` (`SourceName` + `NORMALIZERS`), add `settleSource()` call in `run.ts`.
  Missing the assemble registration silently drops every record (source shows 0, `fresh: true`).
- Write the normalizer test-first (vitest, co-located `x.test.ts`, real sample payloads).
- Enrichers take their network fn as a defaulted last param — the injectable-seam test idiom. Follow it.
- Component logic goes in pure modules (like `filterSelection.ts`), not component tests — there are none.
- Fetchers throw on failure (so carry-forward saves the source); normalizers return `null` to drop a record.
- The never-blank guard in `runPipeline.ts` fires only when *no* source was authoritative. A source that
  fetched and genuinely found nothing publishes its zero — never re-add "0 events ⇒ keep the file".
- An existing `public/data/*.json` that cannot be read or parsed is not an empty bank: `readSnapshot`
  throws and the run writes nothing. Don't catch-and-default it back to `[]`.
- A keyed fetcher with no credential throws `MissingCredentialsError` — never an empty batch.
  An empty batch means "we asked and there was nothing", and that *does* drop the source's banked events.
- Every `sources[]` row in `events.json` carries `status` and `asOf` (last successful fetch, carried
  from the previous payload when the source didn't fetch). The UI dates carried data from `asOf`
  and never presents it as current — keep that when touching `sourceSummary.ts` or the hero stamp.
- Scraped strings reach the DOM only through React text or `escapeHtml`; scraped URLs become
  links only through `safeHref()` (http(s) only); coordinates are used only when `isPlottable()`.

## Gotchas

- **Never read `public/data/*.json` or `src/ingestion/data/*-polygons.json` into context**
  (3–9 MB, and `.claude/settings.json` denies it). Sample instead, e.g.:
  `node -e "const j=require('./public/data/events.json');console.log(j.count,j.sources)"`.
- **Never hand-edit** `public/data/*` (CI-owned) or `*-polygons.json` (regenerate via `scripts/build-*-polygons.mjs`).
- Event `start` is **bare ET wall-clock ISO with no timezone suffix**; date logic is string
  `YYYY-MM-DD` compares. Don't `new Date(start)` and expect correct UTC math.
- Cost controls: push-triggered CI runs skip ticketmaster/serpapi/jambase (SerpAPI free tier
  is 250 searches/month). Don't remove the `GITHUB_EVENT_NAME === 'push'` gate in `run.ts`.
- `base: '/nyc-events-dashboard/'` is hardcoded in `vite.config.ts` + PWA manifest (4 places).
- Workflow secret `MAPTILER_API_KEY` feeds env var `VITE_MAPTILER_API_KEY` — name mismatch is intentional.
- All secrets are GitHub Actions secrets read via `process.env`. Never write a key into a file.
- Data commits use `[skip ci]` and a reset+reapply push strategy (`deploy.yml`); `events.json`
  has `merge=ours` in `.gitattributes`. Don't "fix" either.
- Only jambase + ticketmaster set `city`/`state`; the whole multi-state archive depends on them.

## Before you finish any task

1. `npm run check` — typecheck + all tests must pass.
2. If you touched UI: `npm run build` must succeed (chunk-size warning is expected).
3. If you touched the pipeline: `npm run build:data`, confirm exit 0 and per-source counts
   look sane, then `git checkout -- public/data/` (do NOT commit data). Without keys/network,
   validate in a throwaway copy instead (copy `src/` + `public/data/*.json` to a temp dir, stub
   `fetchWithRetry` to reject, run `run.ts` with that dir as cwd) — no API spend, no data churn.
4. `git diff` — confirm no secrets, no `public/data/` changes, no unrelated files.

## Model routing

Safe for **Sonnet** (routine, pattern-following):
- New ingestion normalizer + tests copying an existing source pair (e.g. `bpl.ts`).
- Fixing a broken scrape parser when you have a sample of the current payload.
- Adding tests to existing pure modules; doc updates; UI copy/styling tweaks.
- Data sampling/inspection, dependency bumps that keep tests green.

Escalate to **Opus** (subtle invariants, blast radius):
- Anything in `carryForward.ts`, `dedup.ts`, `partition.ts`, `enrichmentChain.ts`, or their
  ordering in `run.ts` — the carry-forward/dedup/partition semantics interact.
- `deploy.yml` data-commit flow, the missing-key/carry-forward wipe fix (HANDOFF P1).
- Date/timezone handling, the dedup key, MapView rewiring, cross-cutting refactors.
