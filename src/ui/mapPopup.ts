/**
 * Popup markup for the map, built as a string because MapLibre's
 * `Popup.setHTML` takes HTML, not React nodes.
 *
 * Every value in it comes from a scraped or third-party source — `sources.ts`
 * parses vendor HTML and JSON, so a title, venue or URL is whatever that site
 * served. Interpolating those directly (as this popup used to) puts attacker
 * markup into the DOM: an `<img onerror=...>` in a title runs the moment the
 * popup is inserted, and a `javascript:` URL runs on click. Escaping and
 * scheme-checking live here, as pure functions, so they can be tested against
 * hostile input.
 */

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Escapes text for both element and quoted-attribute contexts. */
export function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
}

/**
 * The URL to link to, or null when it isn't safe to link at all.
 *
 * Only http(s) is allowed. Control characters and whitespace are stripped
 * before the check because browsers ignore them inside a scheme — a tab or a
 * leading space inside "javascript:" still parses as the javascript: scheme.
 */
export function safeHref(url: unknown): string | null {
  if (typeof url !== 'string') return null;
  const cleaned = url.replace(/[\u0000-\u0020\u007f]/g, '');
  return /^https?:\/\/\S/i.test(cleaned) ? cleaned : null;
}

export interface PopupContent {
  title: unknown;
  venue: unknown;
  url: unknown;
}

/**
 * The popup body: the title, linked when the URL is safe and plain text when it
 * isn't, above the venue name. Returns markup that is safe to hand to
 * `setHTML` for any input.
 */
export function popupHtml({ title, venue, url }: PopupContent): string {
  const safeTitle = escapeHtml(title);
  const href = safeHref(url);
  const heading = href
    ? `<a href="${escapeHtml(href)}" target="_blank" rel="noreferrer noopener" style="color:inherit">${safeTitle}</a>`
    : safeTitle;

  return (
    `<strong style="display:block;margin-bottom:4px">${heading}</strong>` +
    `<span style="font-size:0.8em;opacity:.7">${escapeHtml(venue)}</span>`
  );
}
