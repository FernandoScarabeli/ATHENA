import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import type { RequirementFolder } from '../../lib/types';

export function DocumentSidePanel({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const panel = useRef<HTMLElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !document.querySelector('dialog[open]')) { event.preventDefault(); close.current(); }
      if (event.key === 'Tab' && window.matchMedia('(max-width: 1100px)').matches) {
        const elements = Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href]') ?? []);
        const first = elements[0]; const last = elements.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('keydown', key); if (previous?.isConnected) previous.focus({ preventScroll: true }); };
  }, []);
  return <><button type="button" tabIndex={-1} className="document-panel-backdrop" aria-label="Fechar painel" onClick={onClose}/><aside ref={panel} id="document-side-panel" className="document-side-panel" aria-label={title}>
    <header className="document-panel-heading"><h2>{title}</h2><button type="button" aria-label={`Fechar ${title.toLowerCase()}`} onClick={onClose}><X size={18}/></button></header>{children}
  </aside></>;
}

export function DocumentDetails({ status, folderId, folders, editable, onFolder }: { status: string; folderId: string; folders: RequirementFolder[]; editable: boolean; onFolder: (id: string) => void }) {
  return <div className="document-details"><dl><dt>Tipo</dt><dd>User Story</dd><dt>Status</dt><dd><span className={`status-text status-${status.toLowerCase()}`}>{status === 'ACTIVE' ? 'Ativa' : status === 'ARCHIVED' ? 'Arquivada' : 'Rascunho'}</span></dd></dl><label>Pasta<select disabled={!editable} value={folderId} onChange={event => onFolder(event.target.value)}>{folders.map(folder => <option key={folder.id} value={folder.id}>{folder.name}</option>)}</select></label><p className="section-help">A pasta organiza esta US dentro do workspace.</p></div>;
}
