# NYC Events Dashboard — Free API Expansion Plan

A consolidated, prioritized plan for every **free** API worth adding, including
Google Maps. Supersedes the shortlist in `SIGNUP-APIS.md` and folds in the
verified corrections (SeatGeek's free cap, Mapbox's card requirement, the BPL
status, Ticketmaster's real rate limit). Written so any agent can execute each
item end-to-end without extra context.

> **Verified June 2026.** Ticketmaster: 5,000 calls/day @ 5 req/sec. SeatGeek
> free `client_id`: ~500-event cap unless partner-approved. Mapbox free tier now
> requires a card on file; MapTiler/LocationIQ do not.

---

## How keys are wired in THIS repo (read first)

TypeScript + Vite app; data is built in CI by GitHub Actions. **No `config.py`,
no committed key file.** Keys are **GitHub Actions secrets** read from
`process.env` at build time, exactly like the existing `TICKETMASTER_API_KEY`.

1. Repo → Settings → Secrets and variables → Actions → **New repository secret**
   (e.g. `SEATGEEK_CLIENT_ID`).
2. Expose it to the data step in `.github/workflows/deploy.yml` under the
   "Refresh events data" step's `env:` block (Ticketmaster is the template).
3. Read it in the fetcher via `process.env.<NAME>`. If the key is missing, the
   fetcher should **throw** so the source is clearly "not configured"
   (carry-forward + the source-health footer handle the rest).
4. Local runs: `export <NAME>=...` before `npm run build:data`.

**A new event source = one pure normalizer in `src/ingestion/<src>.ts` (TDD'd) +
a `fetch<Src>()` in `src/pipeline/sources.ts`, registered in `assemble.ts` and
`run.ts`.** Coordinates → `boroughFromLatLng` / `neighborhoodFromLatLng`.

**Enrichment (geocoding, ratings) is different:** a build-time script that caches
results to a JSON file keyed by venue, skips anything already cached with a
non-null value, saves incrementally, and sleeps ~100ms between calls. It runs
over assembled events, not as a source.

---

## Execution order at a glance

| # | Item | Type | Effort | Cost | Why this slot |
|---|---|---|---|---|---|
| 1 | **Ticketmaster key** | activate | minutes | free | Adapter already wired & dormant; one secret unlocks it |
| 2 | **NYC Socrata app token** | header | minutes | free | Kills Parks 403s; no billing |
| 3 | **NYC Open Data new datasets** | sources | low | free | More keyless city events, borough included |
| 4 | **MapTiler geocoding** | enrichment | medium | free, card-free | Lifts neighborhood coverage past 78% |
| 5 | **Google Maps (Geocoding + Places)** | enrichment | medium | free-credit, card req'd | Best-quality coords + venue ratings |
| 6 | **SeatGeek** | source | medium | free (~500 cap) | Price breadth; capped, so secondary |
| 7 | **Spotify** | enrichment | low | free | Artist genre/photo/popularity on music cards |
| 8 | **OpenWeather** | enrichment | low | free | Forecast badges on outdoor events |
| 9 | **Bandsintown** | source (watchlist) | medium | free | Only if maintaining an artist/venue watchlist |

Do 1–3 first (hours, all free, no cards). Then geocoding (4 or 5). Then the
enrichment niceties. SeatGeek and Bandsintown are optional given their limits.

---

## Tier 1 — Free, self-serve, no billing card (do these first)

### 1. Ticketmaster Discovery API ⭐ (activate the dormant adapter)
- **Sign up:** <https://developer.ticketmaster.com/> → register → copy the
  Consumer Key. Instant, free. **5,000 calls/day, 5 req/sec.**
- **Secret:** `TICKETMASTER_API_KEY` — already referenced in `run.ts`,
  `sources.ts`, and `deploy.yml`. **Adding the secret is the whole task.** The
  footer's `Ticketmaster: 0` flips to a real count on the next build.
- **Adds:** concerts, sports, theater, arts, comedy at major venues (MSG,
  Barclays, Beacon…), with prices and venue coordinates → auto borough +
  neighborhood.

### 2. NYC Open Data — Socrata app token
- **Sign up:** <https://data.cityofnewyork.us/> → profile → Developer Settings →
  app token. Free, no billing.
- **Secret:** `SOCRATA_APP_TOKEN`. Send as the `X-App-Token` header in the
  Socrata fetchers (Permitted Events, Greenmarkets, any new datasets).
- **Adds:** higher rate limits → directly reduces the NYC Parks / Socrata 403s
  that currently trip carry-forward. Lowest-effort reliability win.

### 3. NYC Open Data — additional keyless datasets (new sources)
- **No key needed** (token from #2 just raises limits). Add as normal sources:
  - `tvpp-9vvx` **NYC Permitted Event Information** — daily-updated, supplies
    `event_borough` directly (no geocoding needed).
  - `6v4b-5gp4` **Public Programs Special Events.**
  - `fudw-fgrp` **NYC Parks Events Listing** — has a `cost_free` flag + canonical
    URL. *(Caveat: public copy has stale dates; live Parks RSS already covers
    this — evaluate before shipping.)*
- **Work:** one normalizer + fetcher each, same shape as `nycOpenData.ts`.

---

## Tier 2 — Geocoding & enrichment (lift the ~78% neighborhood coverage)

Neighborhood is point-in-polygon over bundled NTA boundaries, so it needs
lat/lng. Four sources ship address-only (TodayTix ~145, NYC Open Data ~145, City
Parks ~125, BPL ~210). Geocoding addresses fixes the first three; BPL needs a
curated branch→NTA map (geocoding branch *names* misplaces them).

### 4. MapTiler Geocoding — card-free default
- **Sign up:** <https://www.maptiler.com/> → API key. **100k requests/mo free,
  no credit card.** (Preferred over Mapbox, which now requires a card on file.)
- **Secret:** `MAPTILER_API_KEY`.
- **Use:** build-time enrichment script, address → lat/lng, cached per venue.
- **Card-free alternatives if needed:** LocationIQ (5k/day), Nominatim/NYC
  GeoSearch (keyless but unreliable for venue/branch names — see EVENT-SOURCES).

### 5. Google Maps — Geocoding + Places (highest quality; needs a card)
Two uses: **(a)** geocode venue addresses for the coverage lift; **(b)** attach
**ratings / review counts** to food & nightlife venues (the Omakase pattern).
- **Sign up:** <https://console.cloud.google.com/> → new project → enable
  **Geocoding API** and **Places API (New)** → Credentials → API key → **restrict
  the key to those two APIs**.
- **"Free":** requires a **billing account**, but Google's recurring monthly free
  credit covers a small dashboard's usage. Free-in-practice, not
  free-to-enable-without-a-card.
- **Secret:** `GOOGLE_MAPS_API_KEY` (Actions secret + `process.env` — **never** a
  committed file).
- **Endpoints:** Geocoding `maps/api/geocode/json` for coordinates; **Places API
  (New)** for ratings (the legacy `place/textsearch/json` is being phased out —
  do not build on it).
- **Enrichment script (replicate from Omakase):** cache to a JSON file keyed by
  venue, skip anything already cached non-null (calls are billed), save
  incrementally, sleep ~100ms between calls, take the first result. Optional
  rating bias `× 0.97`.
- **Decision:** use **MapTiler for coordinates** (free, card-free) and **Google
  Places only for ratings** where that adds real value (food/nightlife cards).
  Don't pay Google for geocoding MapTiler can do free.

### 6. BPL branch → NTA map (curated, no API)
- **Not an API** — a bounded static map of the ~60 BPL branches to NTA
  neighborhoods. Fixes the largest single no-neighborhood bucket (~210 events)
  more accurately than any geocoder. Ship alongside #4.

### 7. Spotify Web API — music enrichment
- **Sign up:** <https://developer.spotify.com/> → app → client credentials.
  Free, no billing.
- **Secret:** `SPOTIFY_CLIENT_ID` + `SPOTIFY_CLIENT_SECRET` (client-credentials
  token flow).
- **Adds:** artist genre, photo, popularity on music cards. Enrichment, cached
  per artist.

### 8. OpenWeather (or WeatherAPI) — outdoor-event forecast
- **Sign up:** <https://openweathermap.org/api> → free tier key.
- **Secret:** `OPENWEATHER_API_KEY`.
- **Adds:** forecast badges on parks / greenmarkets / festival cards. Only the
  next ~5–7 days are useful, so fetch at build time for near-term outdoor events.

---

## Tier 3 — Free but narrow (optional)

### 9. SeatGeek Platform API
- **Sign up:** <https://seatgeek.com/build> → `client_id`. Free, but the free
  tier is **capped at ~500 events**; full search needs partner approval
  (`hi@seatgeek.com`).
- **Secret:** `SEATGEEK_CLIENT_ID`.
- **Endpoint:** `https://api.seatgeek.com/2/events?venue.city=New York&client_id=...`
  (has avg prices + venue `lat`/`lon`).
- **Verdict:** treat as price-enrichment breadth, not a primary feed. ~1 adapter
  like `dice.ts`. Lower priority than the doc originally implied.

### 10. Bandsintown
- **Sign up:** free `app_id`.
- **Caveat:** **artist-centric** — query by artist name, not "all NYC shows."
  Worth it only if we maintain a watchlist of artists/venues to poll.

### 11. JamBase — evaluation only
- Free trial then paid. Good structured **festival** data, but treat as
  evaluation-only unless you decide to pay. Not part of the free plan.

---

## Not worth signing up for (verified)

Ticketmaster + SeatGeek are the **only** free self-serve ticketing keys.
Everything else in the resale/aggregator space is gated, paid, or scrape-only:
StubHub (affiliate-partner gated), Vivid Seats / AXS / TickPick / Gametime (no
public API), TicketsData (paid aggregator), Eventbrite (public search removed
2019), Meetup (paid Pro), Songkick (partner-only), Last.fm `geo.getEvents`
(removed), Foursquare/Eventful/Setlist.fm (not live events).

Museums are bot-walled (Met/MoMA/Brooklyn Museum CI-blocked; their Open Access
APIs are collection objects, not events). Best museum path stays DICE's
`culture/art` filter, optionally the Guggenheim WP-REST feed or a static
generator for free-admission days.

---

## Security note (carry over from SIGNUP-APIS.md)

If a real Google key was ever committed in plaintext (e.g. the Omakase repo's
`scripts/config.py`), **rotate it** (Cloud Console → Credentials → regenerate)
and gitignore the file. This repo stores nothing in files — Actions secrets +
`process.env` only. Keep it that way for every key above.
