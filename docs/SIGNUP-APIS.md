# Free APIs to add — setup handoff

Free-only shortlist of APIs that would improve the NYC Events Dashboard, ordered
by impact. Written so another agent (or you) can set each one up without extra
context. Everything here is **free to sign up for** (a couple need a billing
account for the free credit — flagged explicitly).

## How API keys are wired in THIS repo (read first)

This is a TypeScript + Vite app whose data is built in CI by a GitHub Actions
pipeline. **Do not use a `config.py` / committed key file** (that's the Python
pattern from the Omakase repo). Keys live as **GitHub Actions secrets** and are
read from `process.env` at build time. The existing Ticketmaster key already
follows this:

1. Repo → Settings → Secrets and variables → Actions → **New repository secret**
   (e.g. `SEATGEEK_CLIENT_ID`).
2. Expose it to the data step in [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml)
   under the "Refresh events data" step's `env:` block (Ticketmaster is there as
   a template).
3. Read it in the fetcher via `process.env.SEATGEEK_CLIENT_ID`. If the key is
   missing, the fetcher should **throw** so the source is clearly "not
   configured" (carry-forward + the source-health footer handle the rest).
4. For local runs, set the env var in the shell before `npm run build:data`.

A new event source is one normalizer in `src/ingestion/<src>.ts` (pure, TDD'd) +
a `fetch<Src>()` in `src/pipeline/sources.ts`, registered in `assemble.ts` and
`run.ts`. Borough/neighborhood come from `boroughFromLatLng` /
`neighborhoodFromLatLng` when the source provides coordinates.

---

## Tier 1 — Event inventory, self-serve free keys (do these)

### 1. Ticketmaster Discovery API ⭐ (already wired — just needs the key)
- **Sign up:** <https://developer.ticketmaster.com/> → register → copy the
  Consumer Key. Free, instant. Quota 5,000/day, 2/sec.
- **Secret:** `TICKETMASTER_API_KEY` (already referenced in `run.ts` and
  `deploy.yml`). **Adding the secret is the entire task** — the footer's
  `Ticketmaster: 0` flips to a real count on the next build.
- **Adds:** concerts, sports, theater, arts, comedy — with prices and venue
  coordinates (so they auto-resolve borough + neighborhood).

### 2. SeatGeek Platform API (new adapter)
- **Sign up:** <https://seatgeek.com/build> → register an app → `client_id`
  (+ optional `client_secret`). Free; full event search may require partner
  approval — start with the basic tier.
- **Secret:** `SEATGEEK_CLIENT_ID`.
- **Endpoint:** `https://api.seatgeek.com/2/events?venue.city=New York&per_page=...&client_id=...`
- **Adds:** concerts/sports/comedy with average prices and venue `lat`/`lon`.
  Clean JSON, CI-safe. Strong complement to Ticketmaster.
- **Work:** ~1 new adapter + fetcher (a few hours), same shape as `dice.ts`.

---

## Tier 2 — Free, but narrower

### 3. Bandsintown API
- **Sign up:** request an `app_id` (artist account → Settings → Get API Key, or
  SwaggerHub). Free.
- **Caveat:** **artist-centric** — you query *by artist name*
  (`/artists/{name}/events`), not "all NYC shows." Useful only if we maintain a
  watchlist of artists/venues to poll. Good for the "which band is playing where"
  goal; not a bulk city feed.

### 4. JamBase Data API (free trial, then paid)
- **Sign up:** <https://data.jambase.com/> → free trial, no card.
- **Adds:** structured concert + **festival** data (closest thing to a real
  music-festival feed). Note it becomes paid after the trial — treat as
  evaluation-only unless you decide to pay.

---

## Tier 3 — Coverage & enrichment (make existing data better)

### 5. Google Maps — Places + Geocoding (Omakase pattern, adapted)
Two uses here: **(a)** geocode venue addresses to lift neighborhood coverage past
78% for address-only sources (TodayTix, NYC Open Data, BPL branches); **(b)**
attach **ratings/review counts** to food & nightlife venues, exactly like the
Omakase restaurant pipeline.
- **Sign up:** <https://console.cloud.google.com/> → new project → enable
  **Geocoding API** (and **Places API** for ratings) → Credentials → API key →
  restrict the key to those APIs.
- **"Free":** requires a **billing account**, but Google's recurring free credit
  covers a small dashboard's usage. Flagging because you said free-only — it's
  free-in-practice, not free-to-enable-without-a-card.
- **Secret:** `GOOGLE_MAPS_API_KEY` (Actions secret + `process.env`, **not** a
  committed `config.py`).
- **Note:** the legacy Text Search endpoint Omakase uses
  (`maps/api/place/textsearch/json`) is being phased out for "Places API (New)";
  use Geocoding for coordinates and the new Places endpoint for ratings.
- **Replicate from Omakase:** build-time enrichment script that **caches results
  to a JSON file keyed by venue**, skips anything already cached with a non-null
  value (calls are billed), saves incrementally, and sleeps ~100ms between calls.
  Take the first result. (Optional rating bias `× 0.97`.)

### 6. Mapbox Geocoding (truly-free alternative to Google for coordinates)
- **Sign up:** <https://account.mapbox.com/> → access token. Free 100k/mo, no
  billing card required for the free tier.
- **Adds:** address → lat/lng for the neighborhood-coverage lift, without
  Google's billing requirement. Use this if you want geocoding but not Google's
  card-on-file. (NYC's own GeoSearch is keyless but couldn't resolve library
  branch names reliably — see EVENT-SOURCES.md.)

### 7. NYC Open Data — Socrata app token (free, tiny effort)
- **Sign up:** <https://data.cityofnewyork.us/> → profile → Developer Settings →
  app token. Free, no billing.
- **Adds:** higher rate limits on the **3 city datasets we already use** (Parks,
  Open Data permits, Greenmarkets). Would reduce the Parks 403s that currently
  trip carry-forward. Just send the token as the `X-App-Token` header in those
  fetchers.

### 8. Spotify Web API (music enrichment) — free
- Artist genre/photo/popularity on music cards. Free client-credentials token.

### 9. OpenWeather / WeatherAPI (outdoor events) — free tier
- Forecast badges on parks/greenmarkets/festival cards.

---

## Competitors checked — not worth signing up for

| Service | Status |
|---|---|
| **StubHub** | Developer API exists (OAuth2) but **affiliate-partner gated** — email `affiliates@stubhub.com` with a Partnerize ID for access. Not self-serve; resale prices only. |
| **Vivid Seats** | **No public API.** Only third-party scrapers (Apify) / paid aggregators. |
| **AXS** | **No public API.** |
| **TickPick** | **No public API.** |
| **Gametime** | **No public API.** |
| **TicketsData** | Paid aggregator that unifies Ticketmaster/StubHub/SeatGeek/Vivid/etc. — not free. |
| **Eventbrite** | Public event *search* removed (2019); API only returns your own org's events. |
| **Meetup** | GraphQL API requires paid **Meetup Pro**. |
| **Songkick** | API closed to new apps (partner-only). |

**Takeaway:** for ticketed inventory, **Ticketmaster + SeatGeek are the only two
free self-serve keys.** Everything else in the resale space is gated, paid, or
scrape-only.

---

## Security note (Omakase repo, not this one)
You mentioned a real Google key sitting in plaintext in `scripts/config.py` in
the Omakase repo. If that file is committed/pushed, **rotate the key** (Google
Cloud Console → Credentials → regenerate) and add `config.py` to that repo's
`.gitignore`. That's separate from this repo — nothing here stores a key in a
file; this repo uses Actions secrets + `process.env`.
