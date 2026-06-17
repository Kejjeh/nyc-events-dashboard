import { useEffect } from 'react';
import type { Event } from '../domain/event';
import { formatDay, formatTime, formatPrice } from './format';

const CATEGORY_LABELS: Record<Event['category'], string> = {
  music: 'Music', comedy: 'Comedy', theater: 'Theater', film: 'Film',
  food: 'Food', sports: 'Sports', museum: 'Museum', social: 'Social',
  kids: 'Kids', other: 'Other',
};

/**
 * A venue "page" rendered as a modal: shows every upcoming event at one venue,
 * with a directions link and a tap-through to each event's detail. Opened via
 * the ?venue= URL param so it's shareable.
 */
export function VenueModal({
  venue,
  events,
  saved,
  onClose,
  onSelectEvent,
}: {
  venue: string;
  events: Event[];
  saved: Set<string>;
  onClose: () => void;
  onSelectEvent: (id: string) => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const first = events[0];
  const locationLabel = first
    ? first.borough
      ? first.neighborhood
        ? `${first.borough} · ${first.neighborhood}`
        : first.borough
      : first.city
        ? first.state
          ? `${first.city}, ${first.state}`
          : first.city
        : ''
    : '';
  const located = events.find((e) => e.lat != null && e.lon != null);

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="modal venue-modal"
        role="dialog"
        aria-modal="true"
        aria-label={venue}
        onClick={(e) => e.stopPropagation()}
      >
        <button className="modal__close" onClick={onClose} aria-label="Close">
          ✕
        </button>

        <div className="modal__body">
          {locationLabel && (
            <div className="modal__tags">
              <span className="chip chip--borough">{locationLabel}</span>
            </div>
          )}
          <h2 className="modal__title">{venue}</h2>
          <p className="modal__venue">
            {events.length} upcoming {events.length === 1 ? 'event' : 'events'}
          </p>

          {located && (
            <div className="modal__actions">
              <a
                className="modal-btn modal-btn--primary"
                href={`https://www.google.com/maps/dir/?api=1&destination=${located.lat},${located.lon}`}
                target="_blank"
                rel="noreferrer"
              >
                Directions ↗
              </a>
            </div>
          )}

          <ul className="venue-list">
            {events.map((ev) => (
              <li key={ev.id}>
                <button className="venue-row" onClick={() => onSelectEvent(ev.id)}>
                  <span className="venue-row__date">
                    <span className="venue-row__day">{formatDay(ev.start)}</span>
                    <span className="venue-row__time">{formatTime(ev.start)}</span>
                  </span>
                  <span className="venue-row__main">
                    <span className="venue-row__title">
                      {saved.has(ev.id) && <span className="venue-row__heart">♥</span>}
                      {ev.title}
                    </span>
                    <span className="venue-row__meta">
                      <span className="chip chip--category" data-category={ev.category}>
                        {CATEGORY_LABELS[ev.category]}
                      </span>
                      <span className={`price ${ev.isFree ? 'price--free' : ''}`}>
                        {formatPrice(ev)}
                      </span>
                    </span>
                  </span>
                  <span className="venue-row__arrow" aria-hidden="true">
                    ›
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
