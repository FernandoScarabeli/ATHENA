import { useEffect, useRef, type ReactNode } from 'react';
import { MoreHorizontal } from 'lucide-react';

export function EntityActions({ label, children }: { label: string; children: ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const outside = (event: MouseEvent) => { if (ref.current && !ref.current.contains(event.target as Node)) ref.current.open = false; };
    document.addEventListener('click', outside);
    return () => document.removeEventListener('click', outside);
  }, []);
  return <details ref={ref} className="entity-actions" onKeyDown={event => {
    if (event.key === 'Escape' && ref.current?.open) { event.stopPropagation(); ref.current.open = false; ref.current.querySelector('summary')?.focus(); }
  }}><summary aria-label={label} title={label}><MoreHorizontal size={19}/></summary><div className="entity-actions-popover" onClick={event => {
    if ((event.target as HTMLElement).closest('button') && ref.current) { ref.current.open = false; ref.current.querySelector('summary')?.focus(); }
  }}>{children}</div></details>;
}
