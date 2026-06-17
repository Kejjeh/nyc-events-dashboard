import { useEffect, useState } from 'react';
import type { Event } from '../domain/event';
import { formatDay, formatTime, formatPrice, sourceLabel } from './format';
import { googleCalendarUrl, icsHref } from './calendar';

const CATEGORY_LABELS: Record<Event['category'], string> = {
  music: 'Music', comedy: 'Comedy', theater: 'Theater', film: 'Film',
  food: 'Food', sports: 'Sports', museum: 'Museum', social: 'Social',
  kids: 'Kids', other: 'Other',
};

export function EventModal({
  event,
  saved,
  onClose,
  onToggleSave,
  onOpenVenue,
}: {
  event: Event;
  saved: boolean;
  onClose: () => void;
  onToggleSave: () => void;
  onOpenVenue: () => void;
}) {
  const [linkCopied, setLinkCopied] = useState(false);

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

  function copyLink() {
    const url = new URL(window.location.href);
    url.searchParams.set('event', event.id);
    navigator.clipboard
      ?.writeText(url.toString())
      .then(() => {
        setLinkCopied(true);
        window.setTimeout(() => setLinkCopied(false), 1500);
      })
      .catch(() => {});
  }

  const icsName = `${event.id.replace(/[^a-z0-9]+/gi, '-')}.ics`;

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={event.title}
        onClick={(e) => e.stopPropagation()}
      >
        <button className="modal__close" onClick={onClose} aria-label="Close">
          ✕
        </button>

        {event.image && (
          <img className="modal__art" src={event.image} alt="" loading="lazy" />
        )}

        <div className="modal__body">
          <div className="modal__tags">
            <span className="chip chip--category">{CATEGORY_LABELS[event.category]}</span>
            <span className="chip chip--borough">
              {event.borough
                ? event.neighborhood
                  ? `${event.borough} · ${event.neighborhood}`
                  : event.borough
                : event.neighborhood
                  ? `${event.city} · ${event.neighborhood}`
                  : event.state
                    ? `${event.city}, ${event.state}`
                    : event.city}
            </span>
          </div>

          <h2 className="modal__title">{event.title}</h2>
          {event.venue ? (
            <button
              className="modal__venue modal__venue--link"
              onClick={onOpenVenue}
              aria-label={`See all events at ${event.venue}`}
            >
              {event.venue} <span aria-hidden="true">›</span>
            </button>
          ) : (
            <p className="modal__venue">{event.venue}</p>
          )}

          <p className="modal__when">
            <span>{formatDay(event.start)}</span>
            <span>·</span>
            <span>{formatTime(event.start)}</span>
            {event.end && (
              <>
                <span>–</span>
                <span>{formatTime(event.end)}</span>
              </>
            )}
          </p>

          <p className="modal__price-row">
            <span className={`price ${event.isFree ? 'price--free' : ''}`}>
              {formatPrice(event)}
            </span>
            <span className="modal__source">via {sourceLabel(event.source)}</span>
          </p>

          {event.weather && (
            <div className="card__weather modal__weather">
              <img
                src={`https://openweathermap.org/img/wn/${event.weather.icon}@2x.png`}
                alt={event.weather.description}
                width={32}
                height={32}
              />
              <span>
                {event.weather.temp}°F · {event.weather.description}
              </span>
            </div>
          )}

          <div className="modal__actions">
            <a
              className="modal-btn modal-btn--primary"
              href={event.url}
              target="_blank"
              rel="noreferrer"
            >
              Get tickets / info ↗
            </a>
            <button
              className={`modal-btn ${saved ? 'modal-btn--saved' : ''}`}
              onClick={onToggleSave}
            >
              {saved ? '♥ Saved' : '♡ Save'}
            </button>
            <button className="modal-btn" onClick={copyLink}>
              {linkCopied ? '✓ Copied' : '🔗 Share'}
            </button>
          </div>
          {event.altTicketLinks && event.altTicketLinks.length > 0 && (
            <div className="modal__alt-links">
              {event.altTicketLinks.map((link) => (
                <a key={link.source} className="modal-btn" href={link.url} target="_blank" rel="noreferrer">
                  Also on {sourceLabel(link.source)} ↗
                </a>
              ))}
            </div>
          )}

          <div className="modal__cal">
            <span className="card__cal-label">Add to calendar</span>
            <a
              className="cal-btn"
              href={googleCalendarUrl(event)}
              target="_blank"
              rel="noreferrer"
            >
              Google
            </a>
            <a className="cal-btn" href={icsHref(event)} download={icsName}>
              iCal
            </a>
            {event.lat != null && event.lon != null && (
              <a
                className="cal-btn"
                href={`https://www.google.com/maps/dir/?api=1&destination=${event.lat},${event.lon}`}
                target="_blank"
                rel="noreferrer"
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
              >
                ♫ Spotify
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
