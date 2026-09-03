# HANDOFF — state of play (2026-09-03)

Read `CLAUDE.md` first. This file is the current status; update it as you work.

## Done and working

- Full pipeline → static JSON → React PWA → GitHub Pages flow, unattended since
  June 19. The cron is alive: `origin/main` gets a data commit twice daily
  (verified: last refresh 2026-09-03 00:48 UTC; local main was 151 data commits
  behind — always `git pull`).
- `npm run check`: typecheck + 330 tests, all green. `npm run build` green.
- Healthy sources in production (from the 2026-09-03 payload's `sources` array):
  nyc-open-data (1068), nyc-greenmarket (717), ticketmaster (397), bpl (239),
  seatgeek (216), todaytix (177), resident-advisor (94), village-vanguard (64),
  smorgasburg (16).
- Live board 3,924 events; archive 9,882 across 13 states (JamBase/Ticketmaster
  multi-state banking).

## In progress

Nothing mid-flight. Last dev work (Jun 19) was refactoring commits
(`refactor: deepen pipeline seams`, `deepen UI filter seams`) — complete and
merged. The repo is at a clean stopping point; pick from Next steps.

## Known bugs / broken sources

Check current source health any time with:
`node -e "const j=require('./public/data/events.json');console.log(j.generatedAt);console.table(j.sources)"`
(`fresh:false` = failing, events carried; absent = failing with nothing left; 0 + `fresh:true` = silent parser break.)

1. **songkick: 0 events, `fresh: true`** — fetch succeeds, zero events survive.
   Either the key/approval is bad (API returns empty) or the normalizer drops
   everything. Repro: run the node one-liner above. Fix in
   `src/pipeline/sources.ts` `fetchSongkick` / `src/ingestion/songkick.ts`.
2. **smallslive broken everywhere** — "calendar template parsed to zero
   records" (fails locally too; site markup changed). `fetchSmalls` in
   `sources.ts` + `src/ingestion/smallslive.ts`.
3. **dice broken everywhere** — "one or more browse filters failed to fetch"
   (fails locally too). `fetchDice` in `sources.ts`.
4. **Failing in CI only** (absent from prod `sources`; work locally):
   nyc-parks (RSS; 1294 records locally — likely datacenter-IP 403),
   eventbrite (10 lanes, mostly 0 counts locally too — markup drift),
   serpapi (needs key; check quota/key validity in repo secrets).
5. **jambase `fresh: false`** — trial key expired ~Jun 30 as planned; 887
   banked events decaying as dates pass. Decision needed: renew/replace key, or
   remove the wiring to silence per-run failures (see docs/API-PLAN.md §11).
6. **cityparks `fresh: false`** — was working; 49 carried events. Investigate.
7. **Keyless `build:data` wipes banked events in the working tree** — see
   CLAUDE.md warning. Root cause: missing-key fetchers return empty batches and
   count as succeeded (docs/DECISIONS.md #9).
8. **MapView** (`src/ui/MapView.tsx`): (a) line ~80 `'circle-color':
   'var(--accent, #6366f1)'` — MapLibre paint props aren't CSS, `var()` is
   invalid; (b) center hardcoded to NYC, never re-fits when you pick Boston/
   Philly, so markers render off-screen; (c) popup `setHTML` interpolates
   scraped title/venue/url unescaped.
9. **Source-filter chips render only for NY/New York** (`App.tsx` ~615) but a
   `?src=` URL param keeps filtering after a city switch with no visible
   control to clear it.
10. **Comment drift**: `sources.ts` says Resident Advisor "area 43" twice;
    `RA_NYC_AREA_ID = 8`. Verify which is NYC before touching.

## Next steps (each ≈ one Sonnet session unless marked Opus)

**P0 — restore data coverage**
- Fix smallslive parser (bug 2). Fetch the live calendar page, update the
  parse + normalizer tests with a current sample. Accept: local `build:data`
  logs `smallslive: N > 0 raw records`; tests green.
- Fix dice fetcher (bug 3). Same approach. Accept: `dice: N > 0 raw records`.
- Diagnose songkick zero (bug 1). Log/inspect the raw response; fix or, if the
  key is dead, document that in this file and remove noise. Accept: either
  events > 0 or a written root cause here.

**P1 — durability**
- (Opus) Make missing-key fetchers count as failed so carry-forward protects
  banked events (bugs 4/7): make them throw (matches API-PLAN.md) OR exclude
  empty keyless batches from `succeededSources` in `run.ts`. Must not break the
  "source succeeded with genuinely zero events" case. Accept: keyless local
  `build:data` leaves archive.json's event count within normal decay of its
  previous value; new unit test covers it.
- Investigate cityparks + eventbrite failures (bugs 4/6). Accept: root cause
  written here, fix if it's a parser/URL change.
- JamBase decision (bug 5): ask the repo owner whether to renew. If no key is
  coming, remove jambase from the `settle()` list to stop failure noise (keep
  normalizer + tests; carry-forward keeps banked events either way).

**P2 — quality**
- MapView fixes (bug 8): real hex color, `fitBounds` to current filtered
  events, escape popup HTML. Accept: map centers on selected city; no style
  errors in console.
- Add eventbrite + residentAdvisor normalizer tests (the only two sources
  without any) using recorded sample payloads. Accept: both have co-located
  `.test.ts` exercising a real record → Event.
- Strengthen `dedup.test.ts` (one test today): richness tie-breaks, alt-link
  construction, hour-excluded key.
- Update `docs/EVENT-SOURCES.md` "Currently integrated" table to the real 17
  sources (banner added marking it stale).

## Open questions (for the repo owner)

- Renew/replace JAMBASE_API_KEY (paid?) or retire the source?
- Songkick: was the API application ever approved / is the key valid?
- A June architecture review (prior session, not in repo) picked a "Candidate 1"
  refactor direction; only the "deepen seams" commits landed. What was the rest,
  and is it still wanted?
- Is `LIVE_CITIES` meant to grow (Boston/Philly live boards), or is archive
  browsing the end state for non-NYC?
- SERPAPI quota/key status — worth checking the account before debugging code.

## Tech debt (known, not urgent)

- `sources.ts` is ~900 lines with no direct tests (fetchers are exercised only
  via live runs); splitting per-source was deliberately deferred.
- Bundle is 1.29 MB (maplibre-gl); build warns. Dynamic-import MapView to fix.
- Venue pages match on exact `event.venue` string; same venue spelled two ways
  = two pages.
- No component/render tests by design (docs/DECISIONS.md #12).
- `docs/SIGNUP-APIS.md` is superseded by API-PLAN.md (banner added); safe to
  delete once nothing links to it.
- Neighborhood coverage ~78%; the accurate lift is a curated BPL branch→NTA map
  (docs/EVENT-SOURCES.md, end).
