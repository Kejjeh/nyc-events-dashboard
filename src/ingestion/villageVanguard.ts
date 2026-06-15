import type { Event } from '../domain/event';

/** Strips a trailing timezone offset to yield bare venue-local ISO. */
function toLocalIso(value: string): string {
  return value.slice(0, 19);
}

/** "FRED HERSCH / DREW GRESS" -> "Fred Hersch / Drew Gress" (SquadUp names are uppercase). */
function titleCase(name: string): string {
  return name.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

export function normalizeVillageVanguardEvent(raw: any): Event {
  const prices: number[] = (raw.priceTiers ?? [])
    .map((t: any) => parseFloat(t.price))
    .filter((n: number) => Number.isFinite(n));

  return {
    id: `village-vanguard:${raw.id}`,
    title: titleCase(raw.title),
    category: 'music',
    borough: 'Manhattan',
    neighborhood: 'West Village',
    venue: 'Village Vanguard',
    start: toLocalIso(raw.startAt),
    ...(raw.endAt && { end: toLocalIso(raw.endAt) }),
    isFree: false,
    ...(prices.length > 0 && {
      priceMin: Math.min(...prices),
      priceMax: Math.max(...prices),
    }),
    url: `https://vv.squadup.com/artists/${raw.slug}`,
    source: 'village-vanguard',
  };
}
