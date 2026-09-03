---
name: refresh-data
description: Run or debug the events data pipeline locally, or check production source health. Use when asked to refresh data, run the pipeline, or investigate why a source is failing or stale.
---

# Refresh / debug the data pipeline

## Check production source health first (no run needed)

```bash
git fetch origin && git show origin/main:public/data/events.json | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);console.log(j.generatedAt);console.table(j.sources)})"
```

- `fresh: false` → source failed that run; its events are carried forward.
- Source absent → failing AND no surviving events.
- `count: 0` with `fresh: true` → silent parser break (worst case).

## Run locally

```bash
npm run build:data
```

- Works with no keys, BUT keyed sources (ticketmaster, seatgeek, songkick,
  serpapi, jambase) then "succeed" with 0 records and their banked events are
  DELETED from the working-tree JSON. This is expected local behavior, not a
  production bug.
- Read the per-source log lines; `FAILED — <reason>` lines are the leads.
- **Always finish with** `git checkout -- public/data/` — never commit
  locally-built data. CI (deploy.yml) is the only thing that commits data.

## Debug a failing source

1. Find its `fetch<Src>()` in `src/pipeline/sources.ts`; hit the URL yourself
   (curl/node) to see whether the endpoint or the parsing broke.
2. If markup/schema drifted: update the parser and the normalizer test's sample
   payload together (`src/ingestion/<src>.test.ts`).
3. Sources failing only in CI but working locally are usually datacenter-IP
   blocks (see docs/EVENT-SOURCES.md reachability tables) — not fixable in code;
   note it in HANDOFF.md instead.
4. `npm run check` before finishing.
