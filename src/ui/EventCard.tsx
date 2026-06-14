import type { Event } from '../domain/event';
import { formatDay, formatPrice, formatTime, sourceLabel } from './format';

const CATEGORY_LABELS: Record<Event['category'], string> = {
  music: 'Music',
  comedy: 'Comedy',
  food: 'Food',
  sports: 'Sports',
  museum: 'Museum',
  other: 'Other',
};

export function EventCard({ event }: { event: Event }) {
  return (
    <a
      className="card"
      data-category={event.category}
      href={event.url}
      target="_blank"
      rel="noreferrer"
    >
      <div className="card__date">
        <span className="card__day">{formatDay(event.start)}</span>
        <span className="card__time">{formatTime(event.start)}</span>
      </div>

      <div className="card__body">
        <div className="card__tags">
          <span className="chip chip--category">{CATEGORY_LABELS[event.category]}</span>
          <span className="chip chip--borough">{event.borough}</span>
        </div>
        <h3 className="card__title">{event.title}</h3>
        <p className="card__venue">{event.venue}</p>
        <div className="card__meta">
          <span className={`price ${event.isFree ? 'price--free' : ''}`}>
            {formatPrice(event)}
          </span>
          <span className="card__source">{sourceLabel(event.source)}</span>
        </div>
      </div>
    </a>
  );
}
