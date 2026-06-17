import type { Event } from '../domain/event';
import { formatDay, formatPrice, formatTime, sourceLabel } from './format';
import { googleCalendarUrl, icsHref } from './calendar';

const TZ = 'America/New_York';

function sameDay(a: Date, b: Date): boolean {
  const opts: Intl.DateTimeFormatOptions = { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' };
  return a.toLocaleDateString('en-US', opts) === b.toLocaleDateString('en-US', opts);
}

function formatForecastTime(dt: number): string {
  const d = new Date(dt);
  const now = new Date();
  const timeStr = d
    .toLocaleTimeString('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit', hour12: true })
    .replace(':00', '');
  if (sameDay(d, now)) return timeStr;
  if (sameDay(d, new Date(now.getTime() + 86_400_000))) return `tomorrow, ${timeStr}`;
  const weekday = d.toLocaleDateString('en-US', { timeZone: TZ, weekday: 'short' });
  return `${weekday}, ${timeStr}`;
}

const CATEGORY_LABELS: Record<Event['category'], string> = {
  music: 'Music',
  comedy: 'Comedy',
  theater: 'Theater',
  film: 'Film',
  food: 'Food',
  sports: 'Sports',
  museum: 'Museum',
  social: 'Social',
  kids: 'Kids',
  other: 'Other',
};

export function EventCard({
  event,
  saved,
  onToggleSave,
  onExpand,
  onOpenVenue,
}: {
  event: Event;
  saved: boolean;
  onToggleSave: () => void;
  onExpand: () => void;
  onOpenVenue: () => void;
}) {
  const icsName = `${event.id.replace(/[^a-z0-9]+/gi, '-')}.ics`;
  return (
    <article className="card" data-category={event.category}>
      {/* Bookmark + expand buttons — z-index above the stretched link */}
      <div className="card__actions">
        <button
          className={`card__save ${saved ? 'card__save--saved' : ''}`}
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggleSave(); }}
          aria-label={saved ? `Remove ${event.title} from saved` : `Save ${event.title}`}
          aria-pressed={saved}
          title={saved ? 'Remove from saved' : 'Save event'}
        >
          {saved ? '♥' : '♡'}
        </button>
        <button
          className="card__expand"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onExpand(); }}
          aria-label={`View details for ${event.title}`}
          title="View details"
        >
          ⋯
        </button>
      </div>

      <div className="card__date">
        <span className="card__day">{formatDay(event.start)}</span>
        <span className="card__time">{formatTime(event.start)}</span>
      </div>

      <div className="card__body">
        <div className="card__tags">
          <span className="chip chip--category">{CATEGORY_LABELS[event.category]}</span>
          <span className="chip chip--borough">
            {event.borough
              ? event.neighborhood
                ? `${event.borough} · ${event.neighborhood}`
                : event.borough
              : event.city}
          </span>
        </div>
        <h3 className="card__title">
          <a className="card__link" href={event.url} target="_blank" rel="noreferrer">
            {event.title}
          </a>
        </h3>
        {event.venue ? (
          <button
            className="card__venue card__venue--link"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onOpenVenue(); }}
            title={`See all events at ${event.venue}`}
          >
            {event.venue}
          </button>
        ) : (
          <p className="card__venue">{event.venue}</p>
        )}
        <div className="card__meta">
          <span className={`price ${event.isFree ? 'price--free' : ''}`}>{formatPrice(event)}</span>
          <span className="card__source">{sourceLabel(event.source)}</span>
        </div>
        {event.weather && (
          <div className="card__weather">
            <img
              src={`https://openweathermap.org/img/wn/${event.weather.icon}.png`}
              alt={event.weather.description}
              width={24}
              height={24}
            />
            <span>
              {event.weather.dt != null && `${formatForecastTime(event.weather.dt)} · `}
              {event.weather.temp}°F · {event.weather.description}
            </span>
          </div>
        )}
        <div className="card__cal">
          <span className="card__cal-label">Add to calendar</span>
          <a
            className="cal-btn"
            href={googleCalendarUrl(event)}
            target="_blank"
            rel="noreferrer"
            aria-label={`Add ${event.title} to Google Calendar`}
          >
            Google
          </a>
          <a
            className="cal-btn"
            href={icsHref(event)}
            download={icsName}
            aria-label={`Download ${event.title} as an iCal file`}
          >
            iCal
          </a>
          {event.lat != null && event.lon != null && (
            <a
              className="cal-btn"
              href={`https://www.google.com/maps/dir/?api=1&destination=${event.lat},${event.lon}`}
              target="_blank"
              rel="noreferrer"
              aria-label={`Get directions to ${event.venue}`}
            >
              Directions
            </a>
          )}
          {event.spotifyUrl && (
            <a
              className="cal-btn cal-btn--spotify"
              href={event.spotifyUrl}
              target="_blank"
              rel="noreferrer"
              aria-label={`Listen to ${event.title} on Spotify`}
            >
              ♫ Spotify
            </a>
          )}
        </div>
        {event.altTicketLinks && event.altTicketLinks.length > 0 && (
          <div className="card__alt-links">
            <span className="card__cal-label">Also on</span>
            {event.altTicketLinks.map((link) => (
              <a key={link.source} className="cal-btn" href={link.url} target="_blank" rel="noreferrer">
                {sourceLabel(link.source)}
              </a>
            ))}
          </div>
        )}
      </div>

      {event.image && (
        <img className="card__art" src={event.image} alt="" loading="lazy" aria-hidden="true" />
      )}
    </article>
  );
}
