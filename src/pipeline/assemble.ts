import type { Event } from '../domain/event';
import { normalizeTicketmasterEvent } from '../ingestion/ticketmaster';
import { normalizeNycOpenDataEvent } from '../ingestion/nycOpenData';
import { normalizeParksEvent } from '../ingestion/nycParks';
import { normalizeSmallsEvent } from '../ingestion/smallslive';
import { normalizeVillageVanguardEvent } from '../ingestion/villageVanguard';

export type SourceName =
  | 'ticketmaster'
  | 'nyc-open-data'
  | 'nyc-parks'
  | 'smallslive'
  | 'village-vanguard';

export interface RawBatch {
  source: SourceName;
  records: any[];
}

/** Normalizes one raw record for a given source. Returns null when the record is dropped. */
const NORMALIZERS: Record<SourceName, (raw: any) => Event | null> = {
  ticketmaster: normalizeTicketmasterEvent,
  'nyc-open-data': normalizeNycOpenDataEvent,
  'nyc-parks': normalizeParksEvent,
  smallslive: normalizeSmallsEvent,
  'village-vanguard': normalizeVillageVanguardEvent,
};

/**
 * Turns raw, source-tagged batches into a single clean list of events:
 * normalizes each record, drops adapter-rejected and start-less records,
 * deduplicates by id (last write wins), and sorts by start time ascending.
 */
export function assembleEvents(batches: RawBatch[]): Event[] {
  const byId = new Map<string, Event>();

  for (const batch of batches) {
    const normalize = NORMALIZERS[batch.source];
    for (const record of batch.records) {
      const event = normalize(record);
      if (event && typeof event.start === 'string' && event.start.length >= 10) {
        byId.set(event.id, event);
      }
    }
  }

  return [...byId.values()].sort((a, b) => a.start.localeCompare(b.start));
}
