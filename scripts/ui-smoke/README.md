# UI smoke run (offline, hostile data)

Drives the built dashboard in headless Chromium on a desktop and an iPhone-13
viewport, fed a synthetic payload with hostile titles/venues/URLs, malformed
coordinates, an empty-result search, mixed source health and an archive city.
It records anchors, the map count, popup markup, console errors, any off-host
request, and whether any injected script ran. Nothing here is a project
dependency: Playwright comes from wherever you have it installed, and the app is
built into a scratch directory with a placeholder map key (the map style is
answered inline, so no MapTiler request is made).

```bash
OUT=/tmp/nyc-smoke                                   # scratch, outside the repo
VITE_MAPTILER_API_KEY=offline-smoke npx vite build --outDir $OUT/dist
node scripts/ui-smoke/fixture.mjs $OUT/dist/data      # overwrite data/ with the synthetic payload
mkdir -p $OUT/site && ln -sfn $OUT/dist $OUT/site/nyc-events-dashboard
npx http-server $OUT/site -p 8123 -s -c-1 &           # base path must be /nyc-events-dashboard/
PLAYWRIGHT_MODULE=$(npm root -g)/playwright/index.mjs \
  node scripts/ui-smoke/smoke.mjs after $OUT/shots     # writes $OUT/shots/after-report.json + PNGs
```

What a healthy report looks like (both viewports):

- `list.titles` has one anchor fewer than there are cards (the `javascript:`
  URL renders as text), `altLinks` and `spotify` are empty, `directions` has
  only real coordinates.
- `map.count` is `3 of 7 events have location data` — string, out-of-range and
  half coordinates are not plotted.
- `popup.tags` are only `<strong>`, `<span>` and MapLibre's close button;
  `pwned` and `finalPwned` are `[]` everywhere.
- `boston.popupAtCentre` reads `Boston Show …` — the viewport re-fitted to the
  archive city.
- `srcFilterAfterSwitch.sourceFilterVisible` is `true` with `?src=` applied.
- `console` holds only WebGL software-renderer warnings and the aborted
  openweathermap icon (the one off-host request the app makes by design).
