import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { assembleEvents, type RawBatch } from './assemble';
import { fetchNycOpenData, fetchParks, fetchSmalls, fetchTicketmaster } from './sources';

const OUTPUT_PATH = 'public/data/events.json';

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
      settle('ticketmaster', fetchTicketmaster(process.env.TICKETMASTER_API_KEY)),
    ])
  ).filter((b): b is RawBatch => b !== null);

  const events = assembleEvents(batches);

  // Never replace a good dataset with nothing: if every source failed this run,
  // keep the last successful events.json rather than publishing an empty page.
  if (events.length === 0 && existsSync(OUTPUT_PATH)) {
    console.warn('All sources returned 0 events — keeping existing data, not overwriting.');
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
