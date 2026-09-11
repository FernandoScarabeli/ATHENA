import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

/** A disclosure with ordinary buttons: Tab, arrows and Escape all work. */
export function DocumentMenu({ label, children, className = '' }: { label: ReactNode; children: ReactNode; className?: string }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const id = useId();
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const element = content.current;
      if (!element) return;
      element.style.transform = '';
      const bounds = element.getBoundingClientRect();
      const shift = bounds.left < 12 ? 12 - bounds.left : bounds.right > window.innerWidth - 12 ? window.innerWidth - 12 - bounds.right : 0;
      element.style.transform = `translateX(${shift}px)`;
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  return <div className={`document-menu ${className}`} ref={root} onBlur={(event) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node)) setOpen(false);
  }} onKeyDown={(event) => {
    if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); setOpen(false); trigger.current?.focus(); }
    if (open && ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key) && !(event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement)) {
      const items = Array.from(root.current?.querySelectorAll<HTMLButtonElement>('.document-menu-content button:not(:disabled)') ?? []);
      if (!items.length) return;
      event.preventDefault();
      const index = items.indexOf(document.activeElement as HTMLButtonElement);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      items[next]?.focus();
    }
  }}>
    <button ref={trigger} type="button" className="document-menu-trigger" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>{label}</button>
    {open && <div ref={content} id={id} className="document-menu-content" onClick={(event) => {
      if ((event.target as HTMLElement).closest('button[data-menu-action]')) setOpen(false);
    }}>{children}</div>}
  </div>;
}
