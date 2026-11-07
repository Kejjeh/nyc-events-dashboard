---
name: refresh-data
description: Run or debug the events data pipeline locally, or check production source health. Use when asked to refresh data, run the pipeline, or investigate why a source is failing or stale.
---

# Refresh / debug the data pipeline

## Check production source health first (no run needed)

```bash
git fetch origin && git show origin/main:public/data/events.json | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);console.log(j.generatedAt);console.table(j.sources)})"
```

- `fresh: false` → source did not fetch that run (`status` says why: `missing-key`, `skipped`, `error`); its events are carried forward and `asOf` is when it last did fetch (absent = unknown).
- Source absent → failing AND no surviving events.
- `count: 0` with `fresh: true` → silent parser break (worst case).

## Run locally

```bash
npm run build:data
```

- Works with no keys: keyed sources (ticketmaster, seatgeek, songkick, serpapi,
  jambase) log `MISSING-KEY` and their banked events are carried forward, not
  deleted. Each source line ends `ok` / `MISSING-KEY` / `SKIPPED` / `ERROR`.
- Read the per-source log lines; `ERROR — <reason>` lines are the leads.
- No keys *and* no network (or nothing may be fetched)? Validate in a throwaway
  copy instead: copy `src/` + `public/data/*.json` to a temp dir, stub
  `fetchWithRetry` in the copy's `http.ts` to reject, run `run.ts` with the copy
  as cwd. Real orchestration, zero spend, zero data churn.
- **Always finish with** `git checkout -- public/data/` — never commit
  locally-built data. CI (deploy.yml) is the only thing that commits data.

## Debug a failing source

0. Read the CI job log first — it has the exact error and needs no run. The
   "Refresh events data" step of the `deploy.yml` job prints one line per
   source (`bpl: ERROR — BPL fetch failed: HTTP 403 on all 4 attempts`), and
   the step's `env:` block shows which secrets are set (`***`) versus blank.
   Bracket *when* it broke by walking `git log -- public/data/events.json` and
   reading each commit's `sources` row for the source (sample with node; never
   load the file into context).
1. Find its `fetch<Src>()` in `src/pipeline/sources.ts`; hit the URL yourself
   (curl/node) to see whether the endpoint or the parsing broke.
2. If markup/schema drifted: update the parser and the normalizer test's sample
   payload together (`src/ingestion/<src>.test.ts`).
3. Sources failing only in CI but working locally are usually datacenter-IP
   blocks (see docs/EVENT-SOURCES.md reachability tables) — not fixable in code;
   note it in HANDOFF.md instead.
4. `npm run check` before finishing.
