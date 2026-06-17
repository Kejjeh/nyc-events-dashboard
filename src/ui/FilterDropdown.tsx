import { useEffect, useRef, useState } from 'react';

export function FilterDropdown({
  label,
  activeCount = 0,
  align = 'left',
  children,
}: {
  label: string;
  activeCount?: number;
  /** Which edge to anchor the panel to. Use 'right' for right-most triggers so
   *  the panel doesn't clip off the viewport edge at narrow widths. */
  align?: 'left' | 'right';
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className={`fdd ${open ? 'fdd--open' : ''}`} ref={ref}>
      <button
        className={`fdd__btn ${activeCount > 0 ? 'fdd__btn--active' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        {label}
        {activeCount > 0 && <span className="fdd__badge">{activeCount}</span>}
        <span className="fdd__arrow" aria-hidden="true">
          {open ? '▲' : '▾'}
        </span>
      </button>
      {open && (
        <div
          className={`fdd__panel ${align === 'right' ? 'fdd__panel--right' : ''}`}
          role="dialog"
          aria-label={`${label} filter`}
        >
          {children}
        </div>
      )}
    </div>
  );
}
