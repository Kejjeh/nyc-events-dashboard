import type { Event } from '../domain/event';
import { formatDay, formatPrice, formatTime, sourceLabel } from './format';
import { googleCalendarUrl, icsHref } from './calendar';

const CATEGORY_LABELS: Record<Event['category'], string> = {
  music: 'Music',
  comedy: 'Comedy',
  theater: 'Theater',
  film: 'Film',
  food: 'Food',
  sports: 'Sports',
  museum: 'Museum',
  social: 'Social',
  other: 'Other',
};

export function EventCard({ event }: { event: Event }) {
  const icsName = `${event.id.replace(/[^a-z0-9]+/gi, '-')}.ics`;
  return (
    <article className="card" data-category={event.category}>
      <div className="card__date">
        <span className="card__day">{formatDay(event.start)}</span>
        <span className="card__time">{formatTime(event.start)}</span>
      </div>

      <div className="card__body">
        <div className="card__tags">
          <span className="chip chip--category">{CATEGORY_LABELS[event.category]}</span>
          <span className="chip chip--borough">
            {event.neighborhood ? `${event.borough} · ${event.neighborhood}` : event.borough}
          </span>
        </div>
        <h3 className="card__title">
          {/* Stretched link: makes the whole card open the event page. */}
          <a className="card__link" href={event.url} target="_blank" rel="noreferrer">
            {event.title}
          </a>
        </h3>
        <p className="card__venue">{event.venue}</p>
        <div className="card__meta">
          <span className={`price ${event.isFree ? 'price--free' : ''}`}>{formatPrice(event)}</span>
          <span className="card__source">{sourceLabel(event.source)}</span>
        </div>
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
        </div>
      </div>
    </article>
  );
}
