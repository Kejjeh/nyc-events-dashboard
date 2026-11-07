// Synthetic, deliberately hostile payload for the browser smoke run.
// Writes events.json + archive.json into the scratch build's data/ dir.
import { writeFileSync, mkdirSync } from 'node:fs';

const out = process.argv[2];
mkdirSync(out, { recursive: true });

const day = (n, hm = '20:00:00') => {
  const d = new Date(Date.now() + n * 86400e3);
  const et = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(d);
  return `${et}T${hm}`;
};

const live = [
  {
    id: 'dice:hostile',
    title: '<img src=x onerror="window.__pwned=1">Jazz Night',
    category: 'music',
    borough: 'Manhattan',
    neighborhood: 'West Village',
    venue: '</span><script>window.__pwned2=1</script>Smalls',
    start: day(1),
    isFree: false,
    priceMin: 20,
    url: 'javascript:window.__pwned3=1',
    source: 'dice',
    lat: 40.7345,
    lon: -74.0016,
    altTicketLinks: [{ source: 'seatgeek', url: 'javascript:window.__pwned4=1' }],
    spotifyUrl: 'javascript:window.__pwned5=1',
    image: 'javascript:window.__pwned6=1',
  },
  {
    id: 'bpl:strings',
    title: 'Story Time',
    category: 'kids',
    borough: 'Brooklyn',
    venue: 'Central Library',
    start: day(2, '11:00:00'),
    isFree: true,
    url: 'https://www.bklynlibrary.org/calendar/story-time',
    source: 'bpl',
    lat: '40.6782',
    lon: '-73.9442',
  },
  {
    id: 'cityparks:range',
    title: 'Range Walk',
    category: 'social',
    borough: 'Queens',
    venue: 'Flushing Meadows',
    start: day(2, '14:00:00'),
    isFree: true,
    url: 'https://cityparksfoundation.org/events/range-walk',
    source: 'cityparks',
    lat: 999,
    lon: 999,
  },
  {
    id: 'nyc-parks:latonly',
    title: 'Half a Coordinate',
    category: 'other',
    borough: 'Bronx',
    venue: 'Van Cortlandt Park',
    start: day(3, '10:00:00'),
    isFree: true,
    url: 'https://www.nycgovparks.org/events/x',
    source: 'nyc-parks',
    lat: 40.8,
  },
  {
    id: 'smallslive:null',
    title: "Late Set 'quotes' & <ampersand>",
    category: 'music',
    borough: 'Manhattan',
    venue: 'Smalls',
    start: day(1, '22:30:00'),
    isFree: false,
    url: 'https://www.smallslive.com/events/late-set',
    source: 'smallslive',
    lat: null,
    lon: null,
  },
  {
    id: 'dice:normal',
    title: 'Normal Show',
    category: 'music',
    borough: 'Brooklyn',
    neighborhood: 'Williamsburg',
    venue: 'Music Hall of Williamsburg',
    start: day(4),
    isFree: false,
    priceMin: 30,
    priceMax: 45,
    url: 'https://dice.fm/event/normal',
    source: 'dice',
    lat: 40.7061,
    lon: -73.9969,
    weather: { icon: '01d', temp: 72, description: 'clear sky' },
  },
  {
    id: 'todaytix:harlem',
    title: 'Uptown Play',
    category: 'theater',
    borough: 'Manhattan',
    neighborhood: '<b>Harlem</b>',
    venue: 'Apollo Theater',
    start: day(5, '19:30:00'),
    isFree: false,
    priceMin: 55,
    url: 'https://www.todaytix.com/x',
    source: 'todaytix',
    lat: 40.81,
    lon: -73.95,
  },
];

const archive = [
  {
    id: 'jambase:boston',
    title: 'Boston Show',
    category: 'music',
    city: 'Boston',
    state: 'MA',
    venue: 'House of Blues',
    start: day(14),
    isFree: false,
    url: 'https://www.jambase.com/show/boston',
    source: 'jambase',
    lat: 42.3467,
    lon: -71.0972,
  },
];

const generatedAt = new Date().toISOString();
const sources = [
  { source: 'dice', count: 2, fresh: true, status: 'ok' },
  { source: 'bpl', count: 1, fresh: false, status: 'error', asOf: '2026-09-11T00:38:00.000Z' },
  { source: 'cityparks', count: 1, fresh: true, status: 'ok' },
  { source: 'nyc-parks', count: 1, fresh: false, status: 'error' },
  { source: 'smallslive', count: 1, fresh: true, status: 'ok' },
  { source: 'todaytix', count: 1, fresh: true, status: 'ok' },
  { source: 'eventbrite', count: 0, fresh: true, status: 'ok' },
  { source: 'seatgeek', count: 0, fresh: false, status: 'missing-key' },
  { source: 'songkick', count: 0, fresh: false, status: 'missing-key' },
  { source: 'serpapi', count: 0, fresh: false, status: 'skipped' },
  { source: 'jambase', count: 0, fresh: false, status: 'skipped' },
  // A row from a payload published before `status` existed.
  { source: 'village-vanguard', count: 0, fresh: false },
];

writeFileSync(
  `${out}/events.json`,
  JSON.stringify(
    {
      generatedAt,
      count: live.length,
      archivedCount: archive.length,
      places: [
        { state: 'NY', cities: [{ name: 'New York', count: live.length }] },
        { state: 'MA', cities: [{ name: 'Boston', count: 1 }] },
      ],
      sources,
      events: live,
    },
    null,
    1,
  ),
);
writeFileSync(
  `${out}/archive.json`,
  JSON.stringify({ generatedAt, count: archive.length, events: archive }, null, 1),
);
console.log(`wrote ${live.length} live + ${archive.length} archived synthetic events to ${out}`);
