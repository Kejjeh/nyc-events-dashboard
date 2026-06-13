# NYC Events Dashboard

A live-updated dashboard of New York City events — sports, music, food, and museums —
across the Bronx, Queens, Manhattan, and Brooklyn. Sortable and filterable, with a free
section and ticket prices, hosted on GitHub Pages.

## Architecture

GitHub Pages serves static files only, so the data is built ahead of time:

```
GitHub Actions (cron, twice daily)
  1. Ingest   — fetch from event sources (Ticketmaster, NYC Open Data, ...)
  2. Normalize — raw source data -> clean Event[] model   (test-driven)
  3. Write     — public/data/events.json (committed)
        |
        v  static JSON
Dashboard (Vite + React) — reads events.json, renders sortable/filterable views
        |
        v
GitHub Pages
```

## Status

Early development. The **normalization core** is built test-first:

- `src/domain/event.ts` — the shared `Event` model
- `src/ingestion/` — per-source adapters that normalize raw data into `Event`

## Development

```bash
npm install
npm test          # run the test suite once
npm run test:watch
```

## Tech

TypeScript end-to-end · Vitest · (Vite + React for the dashboard, coming next)
