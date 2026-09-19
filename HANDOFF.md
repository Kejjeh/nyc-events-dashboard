# HANDOFF — state of play (2026-09-19)

Read `CLAUDE.md` first. This file is the current status; update it as you work.

## Done and working

- Full pipeline → static JSON → React PWA → GitHub Pages flow, unattended since
  June 19. The cron is alive: `origin/main` gets a data commit twice daily
  (verified: last refresh 2026-09-18 00:52 UTC — always `git pull`).
- `npm run check`: typecheck + 429 tests, all green. `npm run build` green.
- Healthy sources in production (from the 2026-09-18 payload's `sources` array):
  nyc-open-data (745), nyc-greenmarket (717), smallslive (403), ticketmaster (394),
  todaytix (195), seatgeek (195), dice (165), cityparks (91),
  resident-advisor (82), village-vanguard (54), smorgasburg (13).
- Live board 3,778 events; archive 9,364 (JamBase/Ticketmaster multi-state
  banking). jambase carries 724 banked events on an expired key.

## In progress

Nothing mid-flight. PR #1 (`claude/funny-turing-n08l22`, draft) holds all the
2026-09-18/19 work below and is waiting on an independent review. Exact
commits are listed in the PR body. The repo is at a clean stopping point; pick
from Next steps.

**How the 2026-09-19 slice was verified, so a reviewer can repeat it**

- Pipeline: `runPipeline.test.ts` now has 20 offline fixtures through the real
  assemble → carry-forward → dedup → partition path, including a 429-on-every-
  attempt source driven through the real `http.ts` retry layer (fake timers)
  and a 900-event archive compared **by id** across a keyless run.
- Sandbox re-run against the real 2026-09-18 00:52 bank (copy of `src/` +
  `public/data/`, `fetchWithRetry` stubbed to reject, no keys): exit 0;
  13,142 → 12,894 events; **all 248 dropped events had a start date before
  today (ET), 0 gained, every surviving archive id was present before**
  (9,293 of 9,364 retained; the other 71 were expired). 16 of 17 sources
  reported non-fresh; only smorgasburg (static descriptors) was `ok`.
- Review repairs (bugs 13–14, from Astra's independent review of `7f3c025`):
  `runPipeline.test.ts` carries the exact probe (one banked bpl event, bpl
  `ok` with zero records, existing output) and it was red on the old guard;
  `refresh.test.ts` fakes the filesystem so a corrupt, unreadable (EIO) or
  wrong-shaped snapshot can be shown to abort before any fetch and before any
  write. Sandbox, network stubbed: with `archive.json` truncated mid-object the
  **old** `run.ts` exited 0 and rewrote it with 0 archived events (9,364 lost);
  the **new** one exits 1 with `SnapshotError: Existing snapshot
  public/data/archive.json is not valid JSON — refusing to run`, both data
  files byte-identical (sha256) afterwards and zero network attempts logged.
  The intact bank still publishes: 3,260 live + 8,965 archived on 2026-09-19 ET
  (13,142 banked − 917 whose date had passed; all 917 lost events were expired,
  0 gained — the same identity check as the 09-18 run, one day later).
- Browser: `scripts/ui-smoke/` (README there) drove the built app in headless
  Chromium at 1280×900 and as an iPhone 13, on a synthetic payload with hostile
  strings, string/out-of-range/half coordinates, an empty search, a
  status-mixed `sources` array and an archive city. Before/after reports were
  kept outside the repo; the after-state is what the README describes.

## Known bugs / broken sources

Check current source health any time with:
`node -e "const j=require('./public/data/events.json');console.log(j.generatedAt);console.table(j.sources)"`
Each row now carries a `status`: `ok` (fetched; `count: 0` here is a genuine zero
or a silent parser break — the dangerous one), `missing-key` (never asked),
`skipped` (cost-gated push run), `error` (fetch failed). `fresh` is true only for
`ok`. Since 2026-09-18 every wired source gets a row, so a source that is down
*and* has nothing banked is visible as `count: 0` instead of vanishing from the
list — the footer is correspondingly longer on a bad run.

1. **songkick: 0 events** — ROOT CAUSE FOUND 2026-09-18, from the CI job log:
   the "Refresh events data" step prints `SONGKICK_API_KEY:` **blank** where every
   other secret prints `***`. The repo secret is unset or empty, so Songkick is
   never called; the fetcher's missing-key path returned an empty batch, which the
   old code counted as `fresh: true`. Nothing is wrong with the normalizer. Once
   PR #1 lands the row will read `status: 'missing-key'`. Owner action: set
   `SONGKICK_API_KEY` in Actions secrets if an approved key exists (open question
   below), or drop songkick from `collectSources()` to end the noise.
2. ~~smallslive broken~~ **FIXED 2026-09-04**: the site renders Django-style
   month abbreviations ("Sept. 3, 2026"); parser only accepted full names.
   Worked in June/July (spelled out), broke Aug 1. `parseDateHeader` now
   accepts both. Verify next cron shows `smallslive` fresh.
3. ~~dice broken~~ **FIXED 2026-09-04, confirmed in CI** (173 fresh in prod).
   Two stacked breaks: (a) the 11-filter parallel burst tripped DICE
   throttling — now sequential with 250ms gaps + per-filter error detail;
   (b) the browse payload dropped venues[].location / tags_types / perm_name —
   normalizer now parses borough from the address zip, takes category from the
   stamped browse filter, and dice joined GEOCODEABLE_SOURCES for coords.
4. **Failing in CI** (`status: 'error'` in prod `sources`). Exact statuses from
   the 2026-09-18 00:52 UTC job log, so nobody has to guess:
   - **bpl — HTTP 403 on every attempt since 2026-09-11** (INVESTIGATED
     2026-09-18). Fresh with 258 events in the 00:38 UTC run that day; `FAILED —
     transient HTTP 403` in the 14:40 UTC run and in all 13 runs since; the bank
     decayed 258 → 155 → 87 → 40 → 36 → gone by 09-15 (library programs are
     near-term, so expiry is fast). Each failure takes ~7.7 s = four immediate
     403s across the 1+2+4 s backoff, i.e. the server answers instantly with a
     block, not a timeout or a flaky origin. That signature, on a Drupal site,
     points to a WAF/bot-protection rule that now rejects GitHub Actions IPs;
     nothing in this repo changed around 09-11. Not confirmed from a residential
     IP — one manual `curl` of `BPL_URL` from a laptop settles it: 200 there means
     a CI-IP block (not fixable in code; needs a different network path or a
     different endpoint), 403 there means the JSON:API itself is gone. The
     "transient" wording was the retry layer's per-attempt message leaking
     through; fixed in `http.ts` ("HTTP 403 on all 4 attempts").
   - nyc-parks — HTTP 405 (RSS; 1294 records locally, so a CI-IP block).
   - eventbrite — every lane parses to zero (markup drift; 0 locally too).
   - serpapi — HTTP 400 with the key set (`***` in the log): a bad request, so
     check the key's validity/quota on the SerpAPI account, not the code.
   - jambase — HTTP 401 (expired trial; see bug 5).
5. **jambase `fresh: false`** — trial key expired ~Jun 30 as planned; 724
   banked events (2026-09-18) decaying as dates pass. Decision needed:
   renew/replace key, or remove the wiring to silence per-run failures (see
   docs/API-PLAN.md §11). Owner has ruled out renewal for now.
6. ~~cityparks `fresh: false`~~ — recovered on its own; fresh with 91 events in
   the 2026-09-18 payload. No action; re-check if it lapses again.
7. ~~Keyless `build:data` wipes banked events~~ **FIXED 2026-09-18.** Root cause:
   missing-key fetchers returned empty batches, which counted as a successful
   fetch, so carry-forward treated the source as authoritative and dropped its
   bank. Now every fetch settles into one of four outcomes — `ok`, `missing-key`,
   `skipped`, `error` (`src/pipeline/sourceOutcome.ts`) — and only `ok` is
   authoritative. Measured offline against the real 2026-09-18 bank (13,142
   banked events, no keys, no network): **before 2,345 events / archive 20;
   after 12,894 events / archive 9,293**, the rest being normal expiry + dedup.
   A source that fetches and genuinely returns zero is unchanged: still
   authoritative, still `count: 0, fresh: true`.
8. ~~MapView~~ **FIXED 2026-09-18.** (a) `'circle-color': 'var(--accent,…)'` →
   a literal `#7c5cff` (MapLibre paint values are GL-evaluated, not CSS).
   (b) The map now re-fits to the filtered events, but only when the current
   viewport contains none of them — so a Boston/Philly switch re-frames while an
   ordinary filter change leaves a user's pan/zoom alone (`mapBounds.ts`).
   (c) The popup no longer interpolates scraped strings: `popupHtml()` escapes
   title/venue and links only http(s) URLs, dropping the anchor entirely for
   anything else (`mapPopup.ts`). Verified against hostile input — an
   `<img onerror=…>` title, a `</span><script>` venue and a `javascript:` URL
   now produce only `<strong>`/`<span>` with no event handlers and no link.
   No CSP change and no external image fetching was introduced.
9. ~~Source-filter chips render only for NY/New York~~ **FIXED 2026-09-18.**
   The control now stays on screen whenever a source filter is actually applied,
   wherever you are, and lists any active source the live board's `sources`
   array doesn't mention — so a `?src=` param surviving a city switch can always
   be cleared (`sourceFilterOptions.ts`).
10. **Comment drift**: `sources.ts` says Resident Advisor "area 43" twice;
    `RA_NYC_AREA_ID = 8`. Verify which is NYC before touching.
11. ~~List view links any scraped URL; malformed coordinates count as located~~
    **FIXED 2026-09-19** (found by the browser smoke, not by the unit tests).
    A `javascript:` event/alt-ticket/Spotify URL rendered as an anchor in the
    card and the modal — React 19 rewrites it to a stub that throws on click,
    so nothing ran, but the user got a dead "Get tickets" button. Both now go
    through `safeHref()` (http(s) only; the title falls back to plain text, the
    buttons disappear), and artwork `src` too. Separately, a string `"40.7"`,
    a `999,999` and a lat-without-lon all counted as "has location data",
    produced Directions links to nowhere and were pushed into the map source;
    `isPlottable()` (numeric, finite, in range) now gates the marker set, the
    map count, and every Directions link. Measured in Chromium on the synthetic
    payload: 7 anchors → 6, 5 Directions → 3, "6 of 7 have location data" →
    "3 of 7"; hostile title/venue in the popup render as inert text; no
    injected flag was ever set, before or after.
12. ~~Carried-forward data advertised as current~~ **FIXED 2026-09-19.** The
    hero stamp said "N events · updated <time>" even when most sources were
    carried forward. The payload's `sources[]` rows now carry `asOf` — the time
    of that source's last *successful* fetch, taken from the previous payload
    when the source did not fetch this run, so it survives any number of down
    runs and dates the data, not the run. The stamp appends "N of M sources not
    refreshed this run" whenever any row is not fresh, and each stale footer
    row's tooltip ends with "(last refreshed <date>)" when known. A previous row
    from before the field existed counts as that payload's `generatedAt` old if
    it was fresh then, and as unknown (no `asOf`) otherwise — e.g. jambase,
    which was already carried before 09-18, shows no date until it next
    fetches.
13. ~~Never-blank guard kept a stale bank a genuine zero should remove~~
    **FIXED 2026-09-19** (review finding). The guard fired on "0 events and an
    existing output file", which cannot tell *every source failed* from *a
    source fetched fine and the truthful result is empty*. With one banked bpl
    event and a healthy bpl returning zero records, the run returned
    `kept-existing` and the stale event stayed on disk — the opposite of the
    documented policy. The guard now also requires that **no** source was
    authoritative this run (`succeededSources.length === 0`); a fresh, genuine
    zero publishes like any other run. Regressions: the probe above (red on the
    old code), plus the all-failed-and-all-expired case still keeps the files.
14. ~~A corrupt or unreadable snapshot read as empty, so a healthy source could
    publish over the bank~~ **FIXED 2026-09-19** (review finding). `run.ts`
    caught every read/parse error on `events.json`/`archive.json` and returned
    `[]`, so a truncated archive plus one `ok` source produced a valid payload
    with the archive gone (reproduced in the sandbox: 9,364 → 0). The read now
    lives in `src/pipeline/refresh.ts` behind an injectable filesystem seam and
    **fails closed**: only a file that does not exist counts as a first run; an
    existing file that cannot be read, is not JSON, has no `events` array or a
    malformed `sources` array throws `SnapshotError` and nothing is fetched or
    written. Both snapshots are validated *before* any source is fetched, so a
    bad file also costs no API quota. `run.ts` is now only env + fetchers.

## Next steps (each ≈ one Sonnet session unless marked Opus)

**P0 — restore data coverage**
- ~~Fix smallslive parser~~ DONE 2026-09-04, confirmed in prod (357 fresh).
- ~~Fix dice fetcher + normalizer~~ DONE 2026-09-04, confirmed in prod
  (173 fresh after dedup).
- ~~Diagnose songkick zero (bug 1)~~ **DONE 2026-09-18** — root cause written
  in bug 1 (the secret is blank in CI). Remaining decision is the owner's.
- bpl (bug 4): one manual curl from a residential IP to tell "CI blocked" from
  "endpoint gone"; then either find another path to the JSON:API or retire the
  source. Its bank is already gone, so there is nothing to protect meanwhile.

**P1 — durability**
- ~~(Opus) Make missing-key fetchers count as failed~~ **DONE 2026-09-18** — see
  bug 7 above. Landed: `sourceOutcome.ts` (the four-state vocabulary),
  `runPipeline.ts` (orchestration lifted out of `run.ts` behind injectable seams
  so it can be tested offline), `runPipeline.test.ts` (15 integration fixtures
  driving the real assemble/carry-forward/dedup/partition path), plus
  `sourceOutcome.test.ts`. 373 tests green.
- Investigate cityparks + eventbrite failures (bugs 4/6). Accept: root cause
  written here, fix if it's a parser/URL change.
- JamBase decision (bug 5): ask the repo owner whether to renew. If no key is
  coming, remove jambase from the `collectSources()` list to stop the per-run
  noise (keep normalizer + tests; carry-forward keeps banked events either way).
  Not urgent now: a lapsed key reads as `missing-key`, which is honest and
  non-destructive.

**P2 — quality**
- ~~MapView fixes (bug 8)~~ **DONE 2026-09-18** — see bug 8. Landed
  `mapPopup.ts` + `mapBounds.ts` (+ tests) and `sourceFilterOptions.ts` for
  bug 9; MapView itself stays a thin wiring layer, per the no-component-tests
  convention. **Seen rendered 2026-09-19** in headless Chromium via
  `scripts/ui-smoke/`: the popup shows the hostile title/venue as text, the
  Massachusetts switch re-frames so the Boston marker sits at the map centre
  (its popup opens on a centre click), and `?src=` keeps the Source control on
  screen after the switch — on desktop and on an iPhone-13 viewport. Not yet
  seen with real MapTiler tiles (the smoke answers the style inline); a quick
  look at the deployed map after merge is still worth a minute.
- Add eventbrite + residentAdvisor normalizer tests (the only two sources
  without any) using recorded sample payloads. Accept: both have co-located
  `.test.ts` exercising a real record → Event.
- Strengthen `dedup.test.ts` (one test today): richness tie-breaks, alt-link
  construction, hour-excluded key.
- Update `docs/EVENT-SOURCES.md` "Currently integrated" table to the real 17
  sources (banner added marking it stale).

## Open questions (for the repo owner)

- Renew/replace JAMBASE_API_KEY (paid?) or retire the source?
- Songkick: was the API application ever approved / is the key valid? (The
  Actions secret is currently blank — see bug 1.)
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
