import type { Event } from '../domain/event';
import { normalizeTicketmasterEvent } from '../ingestion/ticketmaster';
import { normalizeNycOpenDataEvent } from '../ingestion/nycOpenData';
import { normalizeParksEvent } from '../ingestion/nycParks';
import { normalizeSmallsEvent } from '../ingestion/smallslive';
import { normalizeVillageVanguardEvent } from '../ingestion/villageVanguard';
import { normalizeDiceEvent } from '../ingestion/dice';
import { normalizeSmorgasburgEvent } from '../ingestion/smorgasburg';
import { normalizeGreenmarketEvent } from '../ingestion/nycGreenmarket';
import { normalizeTodayTixShow } from '../ingestion/todaytix';
import { normalizeCityParksEvent } from '../ingestion/cityParks';
import { normalizeBplEvent } from '../ingestion/bpl';
import { normalizeSeatGeekEvent } from '../ingestion/seatgeek';
import { normalizeSongkickEvent } from '../ingestion/songkick';
import { normalizeSerpApiEvent } from '../ingestion/serpapi';
import { normalizeJamBaseEvent } from '../ingestion/jambase';
import { normalizeEventbriteEvent } from '../ingestion/eventbrite';
import { normalizeResidentAdvisorEvent } from '../ingestion/residentAdvisor';

export type SourceName =
  | 'ticketmaster'
  | 'nyc-open-data'
  | 'nyc-parks'
  | 'smallslive'
  | 'village-vanguard'
  | 'dice'
  | 'smorgasburg'
  | 'nyc-greenmarket'
  | 'todaytix'
  | 'cityparks'
  | 'bpl'
  | 'seatgeek'
  | 'songkick'
  | 'serpapi'
  | 'jambase'
  | 'eventbrite'
  | 'resident-advisor';

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
  dice: normalizeDiceEvent,
  smorgasburg: normalizeSmorgasburgEvent,
  'nyc-greenmarket': normalizeGreenmarketEvent,
  todaytix: normalizeTodayTixShow,
  cityparks: normalizeCityParksEvent,
  bpl: normalizeBplEvent,
  seatgeek: normalizeSeatGeekEvent,
  songkick: normalizeSongkickEvent,
  serpapi: normalizeSerpApiEvent,
  jambase: normalizeJamBaseEvent,
  eventbrite: normalizeEventbriteEvent,
  'resident-advisor': normalizeResidentAdvisorEvent,
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
      let event: Event | null = null;
      try {
        event = normalize(record);
      } catch {
        // A single malformed record must never sink the whole refresh.
        continue;
      }
      if (event && typeof event.start === 'string' && event.start.length >= 10) {
        byId.set(event.id, event);
      }
    }
  }

  return [...byId.values()].sort((a, b) => a.start.localeCompare(b.start));
}
