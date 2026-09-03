# NYC Events Dashboard

A live dashboard of New York City events — music, sports, food, museums, free
stuff — filterable by category, date, price, borough, and neighborhood, with a
map view, bookmarks, and saved searches. Installable as a PWA. Also banks events
across the Northeast corridor, browsable via a State → City → Neighborhood
drill-down. Hosted on GitHub Pages.

## How it works

GitHub Pages serves static files only, so data is built ahead of time:

```
GitHub Actions (cron, twice daily)
  fetch ~17 sources → normalize → carry-forward → dedup →
  partition (live NYC board / multi-state archive) → enrich
  (geocode, neighborhood, weather, Spotify) → commit public/data/*.json
        ↓
Dashboard (Vite + React PWA) reads the JSON → GitHub Pages
```

## Development

```bash
npm ci
npm run dev        # dashboard at localhost:5173
npm run check      # typecheck + test suite
```

Working on this repo with an AI agent? **`CLAUDE.md` is the source of truth**
for commands, conventions, and gotchas; `HANDOFF.md` has current status;
`docs/ARCHITECTURE.md` and `docs/DECISIONS.md` cover design.

TypeScript end-to-end · Vitest (test-first normalizers) · Vite + React 19 ·
MapLibre GL
