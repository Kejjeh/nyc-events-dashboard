// Browser smoke run of the dashboard against a scratch build served locally,
// fed the hostile synthetic payload from fixture.mjs. See README.md.
//
// No external network: the MapTiler style is answered inline (a blank
// background), glyph requests get an empty body, and every other off-host
// request is aborted and recorded in the report. Playwright is NOT a project
// dependency — point PLAYWRIGHT_MODULE at an installed copy.
//   PLAYWRIGHT_MODULE=$(npm root -g)/playwright/index.mjs node smoke.mjs <label> <shotsDir>
import { mkdirSync, writeFileSync } from 'node:fs';

const { chromium, devices } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');

const [label = 'run', shots = './shots'] = process.argv.slice(2);
mkdirSync(shots, { recursive: true });
const BASE = 'http://127.0.0.1:8123/nyc-events-dashboard/';
const BLANK_STYLE = {
  version: 8,
  sources: {},
  layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#dfe6ee' } }],
  glyphs: 'https://api.maptiler.com/fonts/{fontstack}/{range}.pbf',
};

const report = { label, at: new Date().toISOString(), viewports: {} };

async function exercise(name, contextOptions, useBottomNav) {
  const browser = await chromium.launch();
  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();
  const r = { console: [], pageErrors: [], external: [], steps: {} };
  report.viewports[name] = r;

  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') r.console.push(`${m.type()}: ${m.text()}`);
  });
  page.on('pageerror', (e) => r.pageErrors.push(String(e)));
  await page.route('**/*', (route) => {
    const url = route.request().url();
    if (url.startsWith(BASE) || url.startsWith('http://127.0.0.1:8123/')) return route.continue();
    if (/api\.maptiler\.com\/maps\/.*style\.json/.test(url)) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(BLANK_STYLE) });
    }
    if (/api\.maptiler\.com\/fonts\//.test(url)) {
      return route.fulfill({ status: 200, contentType: 'application/x-protobuf', body: '' });
    }
    r.external.push(url);
    return route.abort();
  });

  const pwned = () =>
    page.evaluate(() =>
      ['__pwned', '__pwned2', '__pwned3', '__pwned4', '__pwned5', '__pwned6'].filter((k) => window[k] !== undefined),
    );
  const shot = (n) => page.screenshot({ path: `${shots}/${label}-${name}-${n}.png`, fullPage: false });
  const text = (sel) => page.textContent(sel, { timeout: 4000 }).catch(() => null);
  const step = async (key, fn) => {
    try {
      r.steps[key] = await fn();
    } catch (e) {
      r.steps[key] = { error: String(e).split('\n')[0] };
    }
  };
  const clickCentre = async () => {
    const el = await page.$('.maplibregl-canvas');
    await el.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    const box = await el.boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    const popup = await page.waitForSelector('.maplibregl-popup-content', { timeout: 4000 }).catch(() => null);
    return popup ? await popup.innerHTML() : null;
  };
  const showMap = async () => {
    if (useBottomNav) await page.click('.bottom-nav__btn:has-text("Map")');
    else await page.click('.view-btn:has-text("Map")');
    await page.waitForSelector('.maplibregl-canvas', { timeout: 10000 });
    await page.waitForTimeout(1500);
  };

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('.results__count');

  // 1. List view with hostile text.
  await step('list', async () => {
    const out = {
      stamp: await text('.hero__stamp'),
      count: await text('.results__count'),
      titles: await page.$$eval('.card__title a', (as) => as.map((a) => ({ text: a.textContent, href: a.getAttribute('href') }))),
      altLinks: await page.$$eval('.card__alt-links a', (as) => as.map((a) => a.getAttribute('href'))),
      spotify: await page.$$eval('.cal-btn--spotify', (as) => as.map((a) => a.getAttribute('href'))),
      directions: await page.$$eval('a[href*="google.com/maps"]', (as) => as.map((a) => a.getAttribute('href'))),
      injectedTags: await page.$$eval('main script, main img', (els) => els.length),
      hoodChips: await page.$$eval('.hoods .hood', (els) => els.map((e) => e.textContent)),
      pwned: await pwned(),
    };
    await shot('1-list');
    return out;
  });

  // 1b. Neighborhood chips with a hostile neighborhood name.
  await step('hoods', async () => {
    if (useBottomNav) await page.click('.bottom-nav__btn:has-text("Filters")');
    await page.click('.tabs button:has-text("Manhattan")');
    await page.waitForSelector('.hoods .hood');
    const chips = await page.$$eval('.hoods .hood', (els) => els.map((e) => e.textContent));
    const injected = await page.$$eval('.hoods b', (els) => els.length);
    await page.click('.tabs button:has-text("All boroughs")');
    if (useBottomNav) await page.click('.bottom-nav__btn:has-text("Filters")');
    return { chips, injectedBoldTags: injected };
  });

  // 2. Footer health rows.
  await step('footer', () =>
    page.$$eval('.footer__sources .src', (els) =>
      els.map((e) => ({ text: e.textContent.trim(), stale: e.classList.contains('src--stale'), title: e.getAttribute('title') })),
    ),
  );

  // 3. Hostile event modal.
  await step('modal', async () => {
    await page.click('.card:has-text("Jazz Night") .card__expand');
    await page.waitForSelector('.modal__actions', { timeout: 5000 });
    const out = {
      actions: await page.$$eval('.modal__actions a, .modal__alt-links a, .modal__cal a', (as) =>
        as.map((a) => ({ text: a.textContent.trim(), href: a.getAttribute('href') })),
      ),
      pwned: await pwned(),
    };
    await shot('2-modal');
    await page.keyboard.press('Escape');
    await page.waitForSelector('.modal__actions', { state: 'detached', timeout: 3000 });
    return out;
  });

  // 4. No results.
  await step('noResults', async () => {
    await page.fill('.search', 'zzzz-no-such-event');
    await page.waitForSelector('.notice');
    const out = { notice: await text('.notice'), count: await text('.results__count') };
    await shot('3-no-results');
    await page.fill('.search', '');
    return out;
  });

  // 5. Map view.
  await step('map', async () => {
    await showMap();
    const out = { count: await text('.map-view__count'), consoleSoFar: r.console.length };
    await shot('4-map');
    return out;
  });

  // 6. Popup on the hostile marker: open on ?q= so the initial fit centres it.
  await step('popup', async () => {
    await page.goto(`${BASE}?q=Jazz+Night`, { waitUntil: 'networkidle' });
    await page.waitForSelector('.results__count');
    await showMap();
    const html = await clickCentre();
    const out = { html, tags: html?.match(/<\/?[a-z][^>]*>/gi) ?? null, pwned: await pwned() };
    await shot('5-popup');
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForSelector('.results__count');
    await showMap();
    return out;
  });

  // 7. Switch to Massachusetts → archive loads → map should re-frame on Boston.
  await step('boston', async () => {
    await page.click('.city-tab:has-text("Massachusetts")');
    await page.waitForSelector('.results__count');
    await page.waitForTimeout(1500);
    const out = {
      count: await text('.results__count'),
      notice: await text('.notice'),
      mapCount: await text('.map-view__count'),
      hasCanvas: !!(await page.$('.maplibregl-canvas')),
      popupAtCentre: null,
      sourceFilterVisible: !!(await page.$('.fdd__btn:has-text("Source")')),
    };
    if (out.hasCanvas) {
      const html = await clickCentre();
      out.popupAtCentre = html ? html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : null;
    }
    await shot('6-boston');
    return out;
  });

  // 8. Source filter reachability after a city switch with ?src= applied.
  await step('srcFilterAfterSwitch', async () => {
    await page.goto(`${BASE}?src=jambase`, { waitUntil: 'networkidle' });
    await page.waitForSelector('.results__count');
    await page.click('.city-tab:has-text("Massachusetts")');
    await page.waitForSelector('.results__count');
    if (useBottomNav) await page.click('.bottom-nav__btn:has-text("Filters")');
    const out = {
      count: await text('.results__count'),
      sourceFilterVisible: !!(await page.$('.fdd__btn:has-text("Source")')),
    };
    await shot('7-src-filter');
    return out;
  });

  r.finalPwned = await pwned();
  await browser.close();
}

await exercise('desktop', { viewport: { width: 1280, height: 900 } }, false);
await exercise('mobile', { ...devices['iPhone 13'] }, true);

writeFileSync(`${shots}/${label}-report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
