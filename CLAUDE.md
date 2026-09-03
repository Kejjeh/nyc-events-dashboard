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
npm test             # tests only (330 tests, ~2s)
npm run dev          # dashboard at localhost:5173 (or .claude/launch.json "dashboard")
npm run build        # production build (expect a >500kB chunk warning — known, ignore)
npm run build:data   # data pipeline — READ THE WARNING BELOW FIRST
```

**`build:data` warning:** without API keys in env, keyed fetchers (ticketmaster,
seatgeek, songkick, serpapi, jambase) "succeed" with 0 records, so carry-forward
**deletes their banked events from your working tree** (archive drops from ~10k
events to ~20). It exits 0 and looks fine. Never commit its output from a local
run; restore with `git checkout -- public/data/`.

## Architecture map (detail: docs/ARCHITECTURE.md)

- `src/pipeline/run.ts` — orchestrator: fetch all sources → assemble → carry-forward → dedup → partition → enrich → write JSON.
- `src/pipeline/sources.ts` — every `fetch<Source>()` (HTTP/scrape). 900 lines, no test file.
- `src/ingestion/<source>.ts` — pure `normalize<Source>Event(raw) => Event | null`, one per source, test-first.
- `src/pipeline/assemble.ts` — `SourceName` union + `NORMALIZERS` registry; drops bad records.
- `src/pipeline/carryForward.ts` — keeps last-good events for sources that failed this run.
- `src/pipeline/dedup.ts` — collapses the same show across ticketing sources into `altTicketLinks`.
- `src/pipeline/partition.ts` — live board (NYC, ≤120 days) vs. lazy-loaded archive (rest).
- `src/pipeline/enrichmentChain.ts` — staged enrichment: geocode → neighborhood → weather → spotify.
- `src/domain/event.ts` — the `Event` model. `city`/`state` absent ⇒ "New York"/"NY" (load-bearing default).
- `src/ui/App.tsx` — the only stateful component; all logic lives in pure modules + hooks beside it.
- `src/ui/filters.ts`, `filterSelection.ts`, `urlState.ts` — filtering, location drill-down transitions, URL sync.
- `.github/workflows/deploy.yml` — test → refresh data → commit data → build → deploy Pages.

## Conventions

- New source = 4 edits: normalizer in `src/ingestion/`, `fetch<Src>()` in `sources.ts`,
  register in `assemble.ts` (`SourceName` + `NORMALIZERS`), add `settle()` call in `run.ts`.
  Missing the assemble registration silently drops every record (source shows 0, `fresh: true`).
- Write the normalizer test-first (vitest, co-located `x.test.ts`, real sample payloads).
- Enrichers take their network fn as a defaulted last param — the injectable-seam test idiom. Follow it.
- Component logic goes in pure modules (like `filterSelection.ts`), not component tests — there are none.
- Fetchers throw on failure (so carry-forward saves the source); normalizers return `null` to drop a record.

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
   look sane, then `git checkout -- public/data/` (do NOT commit data).
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
