import { ArrowLeft, Check, ChevronDown, Info, MessageCircle, MoreHorizontal, Save } from 'lucide-react';
import { DocumentMenu } from './DocumentMenu';

export type DocumentPanel = 'details' | 'comments' | null;
type Props = {
  code: string; revision?: number; title: string; editable: boolean; dirty: boolean; saving: boolean; error: boolean;
  commentCount: number; panel: DocumentPanel; archiveDisabled: boolean;
  onTitle: (title: string) => void; onClose: () => void; onSave: () => void; onArchive: () => void; onPanel: (panel: DocumentPanel) => void;
};

export function DocumentHeader({ code, revision, title, editable, dirty, saving, error, commentCount, panel, archiveDisabled, onTitle, onClose, onSave, onArchive, onPanel }: Props) {
  return <header className="document-heading">
    <button type="button" className="secondary-button document-back" onClick={onClose} aria-label="Voltar"><ArrowLeft size={16}/><span>Voltar</span></button>
    <div className="document-identity"><p className="section-kicker">{code} <span>· Revisão {revision}</span></p><input className="document-title" value={title} disabled={!editable} onChange={event => onTitle(event.target.value)} aria-label="Título do requisito"/></div>
    <div className="document-heading-actions">
      <span className={`save-state ${saving ? 'saving' : error ? 'error' : dirty ? 'pending' : 'saved'}`} aria-live="polite">{!saving && !error && !dirty && <Check size={13}/>}<span>{saving ? 'Salvando…' : error ? 'Falha ao salvar' : dirty ? 'Alterações pendentes' : 'Salvo'}</span></span>
      <button type="button" className={`secondary-button ${panel === 'details' ? 'active' : ''}`} aria-label="Detalhes da US" aria-expanded={panel === 'details'} aria-controls="document-side-panel" onClick={() => onPanel(panel === 'details' ? null : 'details')}><Info size={16}/><span className="document-action-label">Detalhes</span></button>
      <button type="button" className={`secondary-button ${panel === 'comments' ? 'active' : ''}`} aria-label="Comentários" aria-expanded={panel === 'comments'} aria-controls="document-side-panel" onClick={() => onPanel(panel === 'comments' ? null : 'comments')}><MessageCircle size={16}/><span className="document-action-label">Comentários</span>{commentCount > 0 && <span className="document-count">{commentCount}</span>}</button>
      {editable && <><button type="button" className="primary-button" disabled={!dirty || saving} onClick={onSave}><Save size={15}/>Salvar</button><DocumentMenu className="document-actions-menu" label={<><MoreHorizontal size={18}/><span className="sr-only">Mais ações</span><ChevronDown size={10}/></>}><button type="button" data-menu-action className="document-danger" disabled={archiveDisabled} onClick={onArchive}>Cancelar US</button></DocumentMenu></>}
    </div>
  </header>;
}
