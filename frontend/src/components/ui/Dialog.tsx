import { useEffect, useId, useRef, type ReactNode } from 'react';
import { Icon } from '../Icon';

type DialogProps = {
  title: string;
  children: ReactNode;
  onClose: () => void;
  labelledBy?: string;
  className?: string;
  closeDisabled?: boolean;
};

const focusableSelector = 'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [href], [tabindex]:not([tabindex="-1"])';

/** A shared modal contract: focus is contained, Escape closes, and focus returns to its trigger. */
export function Dialog({ title, children, onClose, labelledBy, className = '', closeDisabled = false }: DialogProps) {
  const dialog = useRef<HTMLElement>(null);
  const onCloseRef = useRef(onClose);
  const closeDisabledRef = useRef(closeDisabled);
  const generatedId = useId();
  const titleId = labelledBy ?? `dialog-${generatedId}`;
  onCloseRef.current = onClose;
  closeDisabledRef.current = closeDisabled;

  useEffect(() => {
    const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const firstFocusable = dialog.current?.querySelector<HTMLElement>(focusableSelector);
    firstFocusable?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !closeDisabledRef.current) {
        event.preventDefault();
        onCloseRef.current();
      }
      if (event.key !== 'Tab' || !dialog.current) return;
      const items = Array.from(dialog.current.querySelectorAll<HTMLElement>(focusableSelector));
      const first = items[0];
      const last = items.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => { document.removeEventListener('keydown', onKeyDown); returnFocus?.focus(); };
  }, []);

  return <div className="modal-backdrop ui-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !closeDisabled) onClose(); }}>
    <section ref={dialog} className={`modal-card ui-dialog ${className}`} role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <header className="modal-header"><h2 id={titleId}>{title}</h2><button type="button" className="icon-button" aria-label={`Fechar ${title.toLowerCase()}`} onClick={onClose} disabled={closeDisabled}><Icon name="close" size={16}/></button></header>
      {children}
    </section>
  </div>;
}

export function ConfirmDialog({ title, description, confirmLabel, tone = 'danger', pending = false, onCancel, onConfirm }: { title: string; description: ReactNode; confirmLabel: string; tone?: 'danger' | 'primary'; pending?: boolean; onCancel: () => void; onConfirm: () => void }) {
  return <Dialog title={title} onClose={onCancel} closeDisabled={pending} className="confirm-dialog">
    <p className="form-lead">{description}</p>
    <footer className="modal-footer"><span>Esta ação poderá alterar o histórico do projeto.</span><div><button type="button" className="secondary-button" onClick={onCancel} disabled={pending}>Voltar</button><button type="button" className={`primary-button ${tone === 'danger' ? 'danger-button' : ''}`} onClick={onConfirm} disabled={pending}>{pending ? 'Processando…' : confirmLabel}</button></div></footer>
  </Dialog>;
}
