# Decision log

Settled choices, with rejected alternatives. Don't re-litigate these without new
evidence. "(inferred)" = reconstructed from code/history, not found stated.

1. **Static JSON committed to the repo, built in CI** — GitHub Pages can't run a
   server. Committing data (vs. artifacts) means a run where every source fails
   still deploys last-good data, and local dev needs no keys. Rejected: hosted
   DB/API (cost), build-time-only data (one bad run blanks the site).

2. **Carry-forward for failed sources** (`carryForward.ts`) — one flaky source
   must not sink the refresh; last-good events persist until their date passes.
   Corollary decided deliberately: a source that *succeeds* is authoritative even
   at zero events. This is what makes trial-key front-loading work (see 4).

3. **Live/archive partition** (`partition.ts`) — the dashboard is NYC-near-term;
   everything else (deep future, other cities) is banked in `archive.json` and
   lazy-loaded only when the user drills into another state/city. Keeps the
   eager payload ~3 MB instead of ~12 MB. Enrichment (paid APIs) runs only on
   the live set.

4. **Front-load trial/limited keys** — JamBase's 14-day trial was pointed at a
   270-day, 13-state window on every run, banking months of inventory that
   carry-forward keeps republishing after the key died (~2026-06-30, as
   planned). The archive's multi-state content is this decision's residue.
   (Note: `docs/API-PLAN.md` says 120 days; code says 270 — code won.)

5. **Quota gating by trigger** — push-triggered CI runs skip
   ticketmaster/serpapi/jambase and archive enrichment; only cron + manual
   dispatch spend quota (SerpAPI: 250 searches/month, ~180 used). Rejected:
   running everything always (burns quota on every dev push).

6. **Cross-source dedup only among ticketing sources** (`dedup.ts`) — key is
   normalized title|venue|calendar-date (hour excluded: sources disagree on
   start times). Winner = richest record (image > price > neighborhood > coords);
   losers become `altTicketLinks`. Parks/markets/library sources never collide
   meaningfully, so they bypass dedup.

7. **Neighborhood = point-in-polygon over bundled 2020 NTAs; never guess** — a
   wrong neighborhood misfiles an event, which is worse than blank. Hence BPL/
   TodayTix/etc. events without coords show borough only, and the fix on record
   is a curated BPL branch→NTA map, not geocoding branch names (GeoSearch maps
   "Greenpoint Library" to Downtown Brooklyn).

8. **Google Maps for geocoding + reverse-geocoded display names** — reverses
   API-PLAN.md's "MapTiler for coordinates, Google only for ratings" plan;
   MapTiler ended up as the map-tile provider only, and venue ratings were never
   built. (inferred: Google's quality won once the billing account existed.)

9. **Missing key ⇒ empty batch, not throw** (`sources.ts`) — documented in the
   fetcher docstrings as "so the pipeline still runs" for keyless local dev.
   Directly contradicts API-PLAN.md's "the fetcher should throw". Consequence:
   a keyless local `build:data` wipes banked keyed events from the working tree
   (harmless in CI where keys exist). Treat as an open tension — see HANDOFF
   P1 — not as settled.

10. **Data-commit race handling: reset+reapply, never rebase; `merge=ours` for
    events.json** — generated JSON can't 3-way merge (corrupt, duplicate-laden
    output). On push conflict CI saves the fresh files, hard-resets to
    origin/main, re-applies, and pushes. Data commits carry `[skip ci]`.

11. **Times are bare ET wall-clock ISO strings; date math is string compares**
    — events are physical NYC-area happenings; "today" is computed via
    `Intl.DateTimeFormat` in America/New_York in both pipeline and UI. Rejected:
    UTC instants (constant off-by-one-day bugs around midnight).

12. **Test-first pure modules; zero component tests** — logic is extracted out
    of components into pure modules (`filters.ts`, `filterSelection.ts`,
    `savedSearchMatching.ts`) and tested there; `.tsx` files stay thin and
    untested. Rejected (inferred): render-testing infrastructure.

13. **Fetch/normalize separation** — I/O in `pipeline/sources.ts`, pure
    normalizers in `ingestion/` with real sample payloads in tests. Fetchers
    throw on zero-parse (e.g. Eventbrite fails the whole source if <7 of 10
    lanes succeed) so carry-forward restores last-good instead of publishing a
    partial catalog.

14. **Four boroughs, no Staten Island** (`domain/event.ts` Borough union).
    (inferred: no sources cover it; polygon bundles exclude it.)

15. **Eventbrite via HTML scrape** — their public search API was removed in
    2019; the scrape brace-matches embedded JSON from 10 listing-page "lanes".
    Accepted fragility, mitigated by the <7-lanes failure policy.

16. **Songkick replaced Prospect Park source** (Jun 16) — Prospect Park's feed
    was CI-blocked; Songkick had an official (approval-gated) API. Currently
    returns 0 events — see HANDOFF known bugs.
