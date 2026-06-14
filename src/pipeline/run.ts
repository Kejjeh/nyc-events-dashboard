import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { Event } from '../domain/event';
import { assembleEvents, type RawBatch } from './assemble';
import { carryForwardEvents } from './carryForward';
import {
  fetchDice,
  fetchGreenmarket,
  fetchNycOpenData,
  fetchParks,
  fetchSmalls,
  fetchSmorgasburg,
  fetchTicketmaster,
  fetchVillageVanguard,
} from './sources';

const OUTPUT_PATH = 'public/data/events.json';

/** Reads the previously-published events, or [] if there is no prior file. */
async function readPreviousEvents(): Promise<Event[]> {
  if (!existsSync(OUTPUT_PATH)) return [];
  try {
    const payload = JSON.parse(await readFile(OUTPUT_PATH, 'utf8'));
    return Array.isArray(payload.events) ? payload.events : [];
  } catch {
    return [];
  }
}

async function settle(label: string, p: Promise<RawBatch>): Promise<RawBatch | null> {
  try {
    const batch = await p;
    console.log(`  ${label}: ${batch.records.length} raw records`);
    return batch;
  } catch (err) {
    // One failing source must not sink the whole refresh.
    console.error(`  ${label}: FAILED — ${(err as Error).message}`);
    return null;
  }
}

async function main(): Promise<void> {
  const nowIso = new Date().toISOString();
  console.log(`Refreshing events at ${nowIso}`);

  const batches = (
    await Promise.all([
      settle('nyc-open-data', fetchNycOpenData(nowIso)),
      settle('nyc-parks', fetchParks()),
      settle('smallslive', fetchSmalls(nowIso)),
      settle('village-vanguard', fetchVillageVanguard()),
      settle('dice', fetchDice()),
      settle('smorgasburg', fetchSmorgasburg(nowIso)),
      settle('nyc-greenmarket', fetchGreenmarket(nowIso)),
      settle('ticketmaster', fetchTicketmaster(process.env.TICKETMASTER_API_KEY)),
    ])
  ).filter((b): b is RawBatch => b !== null);

  const succeededSources = batches.map((b) => b.source);
  const fresh = assembleEvents(batches);

  // Carry forward last-good events for any source that failed this run, so a
  // single source's flakiness doesn't make its events blink out of the dashboard.
  const previous = await readPreviousEvents();
  const events = carryForwardEvents(fresh, previous, succeededSources, nowIso);

  const carried = events.length - fresh.length;
  if (carried > 0) {
    const succeeded = new Set<string>(succeededSources);
    const downSources = [...new Set(previous.map((e) => e.source))].filter((s) => !succeeded.has(s));
    console.warn(`Carried forward ${carried} events from down source(s): ${downSources.join(', ')}`);
  }

  // Never replace a good dataset with nothing: if every source failed and there
  // was nothing to carry forward, keep the existing file rather than blanking it.
  if (events.length === 0 && existsSync(OUTPUT_PATH)) {
    console.warn('No events produced and nothing to carry forward — keeping existing data.');
    return;
  }

  const payload = {
    generatedAt: nowIso,
    count: events.length,
    events,
  };

  await mkdir(dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, JSON.stringify(payload, null, 2) + '\n');
  console.log(`Wrote ${events.length} events to ${OUTPUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
