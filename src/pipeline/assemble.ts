import type { Event } from '../domain/event';
import { normalizeTicketmasterEvent } from '../ingestion/ticketmaster';
import { normalizeNycOpenDataEvent } from '../ingestion/nycOpenData';
import { normalizeParksEvent } from '../ingestion/nycParks';
import { normalizeSmallsEvent } from '../ingestion/smallslive';

export type SourceName = 'ticketmaster' | 'nyc-open-data' | 'nyc-parks' | 'smallslive';

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
};

/**
 * Turns raw, source-tagged batches into a single clean list of events,
 * dropping records the adapters reject and sorting by start time ascending.
 */
export function assembleEvents(batches: RawBatch[]): Event[] {
  const events: Event[] = [];

  for (const batch of batches) {
    const normalize = NORMALIZERS[batch.source];
    for (const record of batch.records) {
      const event = normalize(record);
      if (event) {
        events.push(event);
      }
    }
  }

  return events.sort((a, b) => a.start.localeCompare(b.start));
}
