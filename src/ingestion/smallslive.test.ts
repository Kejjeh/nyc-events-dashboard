import { describe, it, expect } from 'vitest';
import { normalizeSmallsEvent, parseSmallsCalendar } from './smallslive';

describe('normalizeSmallsEvent', () => {
  it('normalizes a SmallsLIVE listing into a Manhattan jazz Event', () => {
    // Shape the scraper extracts from one calendar listing + its detail page.
    const raw = {
      id: '32673',
      title: 'Santi Debriano Bembe Arktet',
      venue: 'Smalls',
      date: '2026-06-13',
      startTime: '6:00 PM',
      endTime: '7:30 PM',
      url: 'https://www.smallslive.com/events/32673-santi-debriano-bembe-arktet/',
    };

    expect(normalizeSmallsEvent(raw)).toEqual({
      id: 'smallslive:32673',
      title: 'Santi Debriano Bembe Arktet',
      category: 'music',
      borough: 'Manhattan',
      neighborhood: 'West Village',
      venue: 'Smalls Jazz Club',
      start: '2026-06-13T18:00:00',
      end: '2026-06-13T19:30:00',
      isFree: false,
      url: 'https://www.smallslive.com/events/32673-santi-debriano-bembe-arktet/',
      source: 'smallslive',
    });
  });

  it('omits end when no end time is given (multi-set listings)', () => {
    const event = normalizeSmallsEvent({
      id: '32671',
      title: 'Caelan Cardello Trio',
      venue: 'Mezzrow',
      date: '2026-06-13',
      startTime: '6:00 PM',
      url: 'https://www.smallslive.com/events/32671-caelan-cardello-trio/',
    });

    expect(event.start).toBe('2026-06-13T18:00:00');
    expect(event.end).toBeUndefined();
    expect(event.venue).toBe('Mezzrow');
  });

  it('passes through an unknown venue label unchanged', () => {
    const event = normalizeSmallsEvent({
      id: '1',
      title: 'x',
      venue: 'Jazzcultural',
      date: '2026-06-13',
      startTime: '8:00 PM',
      url: 'x',
    });

    expect(event.venue).toBe('The Jazz Cultural Theater');
  });
});

// A faithful slice of the /search/upcoming-ajax/ `template` HTML.
const TEMPLATE = `
<div class="flex-column day-list">
  <div class="title1" data-date="June 14, 2026"> Sun Jun 14 </div>
  <div class="venue-group">
    <div class="smalls-color text2"> Smalls </div>
    <div class="flex-column day-event">
      <a href="/events/32678-saul-dautch-quintet/">
        <div class="text-grey text2"> 6:00 PM &amp; 7:30 PM </div>
        <div class="text2 day_event_title"> Saul Dautch Quintet </div>
      </a>
    </div>
    <div class="flex-column day-event">
      <a href="/events/33039-jeff-mcgregor-quartet/">
        <div class="text-grey text2"> 11:55 PM - 4:00 AM </div>
        <div class="text2 day_event_title"> Jeff McGregor Quartet </div>
      </a>
    </div>
  </div>
  <div class="venue-group">
    <div class="mezzrow-color text2"> Mezzrow </div>
    <div class="flex-column day-event">
      <a href="/events/32676-sarah-king-trio/">
        <div class="text-grey text2"> 2:00 PM - 5:15 PM </div>
        <div class="text2 day_event_title"> Sarah King Trio </div>
      </a>
    </div>
  </div>
  <div class="title1" data-date="June 15, 2026"> Mon Jun 15 </div>
  <div class="venue-group">
    <div class="jazzcultural-color text2"> Jazzcultural </div>
    <div class="flex-column day-event">
      <a href="/events/32927-afternoon-jam-in-the-cafe/">
        <div class="text-grey text2"> 2:00 PM - 6:00 PM </div>
        <div class="text2 day_event_title"> Afternoon Jam in the Cafe </div>
      </a>
    </div>
  </div>
</div>`;

describe('parseSmallsCalendar', () => {
  it('threads date and venue through the listing and splits set times', () => {
    const records = parseSmallsCalendar(TEMPLATE);

    expect(records).toEqual([
      {
        id: '32678',
        title: 'Saul Dautch Quintet',
        venue: 'Smalls',
        date: '2026-06-14',
        startTime: '6:00 PM',
        endTime: undefined, // "&" = two set start times, no clean end
        url: 'https://www.smallslive.com/events/32678-saul-dautch-quintet/',
      },
      {
        id: '33039',
        title: 'Jeff McGregor Quartet',
        venue: 'Smalls',
        date: '2026-06-14',
        startTime: '11:55 PM',
        endTime: undefined, // crosses midnight — end omitted rather than wrong
        url: 'https://www.smallslive.com/events/33039-jeff-mcgregor-quartet/',
      },
      {
        id: '32676',
        title: 'Sarah King Trio',
        venue: 'Mezzrow',
        date: '2026-06-14',
        startTime: '2:00 PM',
        endTime: '5:15 PM',
        url: 'https://www.smallslive.com/events/32676-sarah-king-trio/',
      },
      {
        id: '32927',
        title: 'Afternoon Jam in the Cafe',
        venue: 'Jazzcultural',
        date: '2026-06-15',
        startTime: '2:00 PM',
        endTime: '6:00 PM',
        url: 'https://www.smallslive.com/events/32927-afternoon-jam-in-the-cafe/',
      },
    ]);
  });

  it('feeds straight into the normalizer', () => {
    const [first] = parseSmallsCalendar(TEMPLATE);
    expect(normalizeSmallsEvent(first)).toMatchObject({
      id: 'smallslive:32678',
      venue: 'Smalls Jazz Club',
      borough: 'Manhattan',
      category: 'music',
      start: '2026-06-14T18:00:00',
    });
  });
});
