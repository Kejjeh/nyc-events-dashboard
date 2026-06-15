# NYC event data sources

A working map of where this dashboard gets events, plus free APIs worth signing up
for to expand coverage — including which "walled" sites (museums, libraries,
concert halls) have an official API that gets around their bot protection, and
which are genuinely blocked from an automated job.

> Reachability is judged from a **GitHub Actions / datacenter IP** (where the
> refresh actually runs). Many event sites are fine in a browser but block
> datacenter IPs with Cloudflare / Vercel / Incapsula challenges — those are
> marked **CI-blocked**.

---

## Currently integrated (no keys required)

| Source | Covers | Access |
|---|---|---|
| **NYC Open Data — Permitted Events** (`bkfu-528j`) | street fairs, festivals, parades | Socrata JSON, keyless |
| **NYC Parks** events RSS | free outdoor programming, SummerStage, movies | RSS/XML |
| **GrowNYC Greenmarkets** (`8vwk-6iz2`) | farmers markets, all 4 boroughs | Socrata JSON, keyless |
| **Smorgasburg** | weekend food markets + special events | Squarespace JSON |
| **SmallsLIVE** | Smalls / Mezzrow / Café jazz sets | undocumented calendar JSON |
| **Village Vanguard** | nightly jazz | SquadUp Next.js data |
| **DICE.fm** | comedy, music, theater, film, sports | keyless Next.js data |
| **TodayTix** | off-Broadway / theater | keyless `api.todaytix.com` |
| **City Parks Foundation** | SummerStage + park programming | Tribe (WordPress) REST |
| **Ticketmaster** | *wired but dormant — needs a free key* | Discovery API |

Neighborhoods are resolved by point-in-polygon against the bundled **2020 NTA**
boundaries (NYC Open Data `9nt8-h7nd`).

---

## Tier 1 — add these first (free, CI-safe, verified)

1. **NYC Open Data / Socrata** — *zero signup, highest ROI.* The single best free
   well of NYC events. Add:
   - `tvpp-9vvx` **NYC Permitted Event Information** — daily-updated, gives
     `event_borough` directly (no geocoding needed).
   - `fudw-fgrp` **NYC Parks Events Listing** — has a `cost_free` flag, canonical
     URL, and start/end times. *(Caveat: the public copy currently has stale
     dates; the live Parks RSS source already covers this.)*
   - `6v4b-5gp4` Public Programs Special Events.
   - A free **app token** (`X-App-Token`) only raises rate limits; not required.

2. **Ticketmaster Discovery API** — *free key, 5,000 calls/day.* Reactivate the
   dormant adapter. Biggest single lift for ticketed **music / sports / theater /
   comedy** at major venues (MSG, Barclays, Beacon…). Set the repo secret
   `TICKETMASTER_API_KEY`. Get a key at developer.ticketmaster.com.

3. **Brooklyn Public Library** — keyless Drupal JSON:API
   (`bklynlibrary.org/jsonapi/node/event`). Free talks, author events, concerts,
   classes across a whole borough. *(Being added to the pipeline.)*

## Tier 2 — free keys, good complements

| API | Sign-up | Adds |
|---|---|---|
| **SeatGeek Platform** | free key | secondary-market + pricing breadth for sports/concerts/theater |
| **Bandsintown** | free `app_id` | touring-artist concert dates |
| **Songkick** | free key (approval, non-commercial) | metro-wide concert listings (NYC metro `sk:7644`) |
| **Yelp Fusion** | free key | *events endpoint largely deprecated — low value now* |

## Tier 3 — aggregators (freemium; paid for volume)

- **PredictHQ** — broad aggregated event intelligence; can surface events you
  can't reach directly. Free tier is limited.
- **AllEvents.in** — small-promoter community/nightlife/food events; free key tier.
- **Universe** (Ticketmaster-owned) — indie/community/nightlife; unofficial GraphQL.

---

## Behind a wall? Official-API workarounds vs. hard blocks

**Museums** are the hardest. Most museum *websites* are bot-walled, and their
collection APIs are **not** event feeds:

| Museum | Status |
|---|---|
| **The Met** | Open Access API is **collection objects only** — no events API. Website (`/events`) is behind a **Vercel** checkpoint → **CI-blocked**. |
| **MoMA** | **Cloudflare** "Just a moment" challenge → **CI-blocked**. No events API. |
| **Brooklyn Museum** | `/api/v2/*` returns **Vercel 429** → **CI-blocked**. |
| **Whitney** | `whitney.org/events` is **reachable** (plain HTML, no wall) — viable via HTML scrape; no official API. |
| **Guggenheim** | `/wp-json/wp/v2/event` returns **clean JSON from CI** ✅ — but the event date lives in an `event_date` taxonomy (often empty) and most programs are "free with admission" (not actually free). Buildable like BPL's branch resolution; modest volume. |
| **Smithsonian / Cooper Hewitt** | Open Access = objects, not events; mostly DC-based. Cooper Hewitt `/wp-json` → 403. |

→ **Best path for museums:** today we surface museum/art programming via **DICE's
`culture/art` filter** (→ `museum` category). For deeper coverage, the Guggenheim
WP-REST feed or a small static generator for recurring **free-admission days**
(MoMA Free Friday, Whitney Friday nights, Brooklyn Museum First Saturdays).

**Libraries** (free, high-quality programming):

| Library | Status |
|---|---|
| **Brooklyn PL** | keyless Drupal JSON:API → **works from CI** ✅ (adding) |
| **NYPL** | LibCal `/1.1/events` needs NYPL-issued credentials; site behind Incapsula → not self-serve |
| **Queens PL** | Communico needs library-issued credentials; WAF rejects bots → **CI-blocked** |

**Concert halls / performing arts:**

- **Carnegie Hall** — publishes **open-data** performance history (CC0) but that's
  *historical*, not the live calendar.
- **Lincoln Center**, **92NY**, **Apollo** — no clean public JSON; Cloudflare/redirects.
- **NYC Tourism** (nyctourism.com) — Next.js site, reachable; curated listings live
  in `__NEXT_DATA__` if you want to scrape it.

**Dead ends:** Eventbrite (public search removed in 2019), Last.fm `geo.getEvents`
(removed), Meetup (paid Pro only), Foursquare (places, not events), Eventful (shut
down), Setlist.fm (past setlists only).

---

## Adding a source

Each source is one file pair: a pure normalizer in `src/ingestion/<source>.ts`
(raw record → `Event`, TDD'd) and a `fetch<Source>()` in
`src/pipeline/sources.ts` (uses `fetchWithRetry` + a browser User-Agent, throws on
zero-parse so carry-forward keeps last-good data). Register it in
`src/pipeline/assemble.ts` and `src/pipeline/run.ts`. Borough comes from
`boroughFromLatLng`, neighborhood from `neighborhoodFromLatLng` (both
point-in-polygon over bundled NYC boundaries).

## Neighborhood coverage (~78%)

Neighborhood is resolved by point-in-polygon, so it needs lat/lng. Four sources
ship without coordinates and therefore show borough only:

| Source | No-nbhd events | Why it's hard |
| --- | --- | --- |
| BPL | ~210 | Branch coords aren't in the JSON:API term or the location page; geocoding branch *names* is wrong (GeoSearch maps "Greenpoint Library" → Downtown Brooklyn). |
| TodayTix | ~145 | Catalog (`SHOW_SUMMARY`) has venue names but no address/coords. |
| NYC Open Data | ~145 | `event_location` is free text ("Damrosch Park: Bandshell"); the dataset has no lat/lng. |
| City Parks | ~125 | Venue rows without geo fall back to borough-from-name, so there's nothing to snap. |

A wrong neighborhood is worse than none (it misplaces an event in the sub-filter),
so we leave these blank rather than guess. The one accurate path that would lift
coverage is a **curated BPL branch → NTA map** (the ~60 branches are a fixed set;
many are named after their neighborhood). That's a bounded follow-up, not a
quick geocode.
