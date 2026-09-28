import { ArrowLeft, Check, ChevronDown, History, Info, Link2, ListTodo, MessageCircle, MoreHorizontal, Save } from 'lucide-react';
import { DocumentMenu } from './DocumentMenu';

export type DocumentPanel = 'details' | 'comments' | 'history' | null;
type Props = {
  code: string; revision?: number; title: string; editable: boolean; dirty: boolean; saving: boolean; error: boolean;
  commentCount: number; relatedCount: number; relatedOpen: boolean; panel: DocumentPanel; archiveDisabled: boolean; historicalPreview?: boolean; tasksAvailable?: boolean; taskCount?: number;
  onTitle: (title: string) => void; onClose: () => void; onSave: () => void; onArchive: () => void; onPanel: (panel: DocumentPanel) => void; onTasks?: () => void;
  onToggleRelated: () => void;
};

export function DocumentHeader({ code, revision, title, editable, dirty, saving, error, commentCount, relatedCount, relatedOpen, panel, archiveDisabled, historicalPreview = false, tasksAvailable = false, taskCount = 0, onTitle, onClose, onSave, onArchive, onPanel, onTasks, onToggleRelated }: Props) {
  return <header className="document-heading">
    <button type="button" className="secondary-button document-back" onClick={onClose} aria-label="Voltar"><ArrowLeft size={16}/><span>Voltar</span></button>
    <div className="document-identity"><p className="section-kicker">{code} <span>· Revisão {revision}</span></p><input className="document-title" value={title} disabled={!editable} onChange={event => onTitle(event.target.value)} aria-label="Título do requisito"/></div>
    <div className="document-heading-actions">
      {!historicalPreview && <><span className={`save-state ${saving ? 'saving' : error ? 'error' : dirty ? 'pending' : 'saved'}`} aria-live="polite">{!saving && !error && !dirty && <Check size={13}/>}<span>{saving ? 'Salvando…' : error ? 'Falha ao salvar' : dirty ? 'Alterações pendentes' : 'Salvo'}</span></span>
      {tasksAvailable && <button type="button" className="secondary-button" onClick={onTasks} aria-label="Tarefas vinculadas à US"><ListTodo size={16}/><span className="document-action-label">Tarefas</span>{taskCount > 0 && <span className="document-count">{taskCount}</span>}</button>}
      <button type="button" className={`secondary-button ${relatedOpen ? 'active' : ''}`} aria-label="Referências: US relacionadas" aria-expanded={relatedOpen} aria-controls="related-stories-panel" onClick={onToggleRelated}><Link2 size={16}/><span className="document-action-label">Referências</span><span className="document-count">{relatedCount}</span></button>
      <button type="button" className={`secondary-button ${panel === 'details' ? 'active' : ''}`} aria-label="Detalhes da US" aria-expanded={panel === 'details'} aria-controls="document-side-panel" onClick={() => onPanel(panel === 'details' ? null : 'details')}><Info size={16}/><span className="document-action-label">Detalhes</span></button>
      <button type="button" className={`secondary-button ${panel === 'comments' ? 'active' : ''}`} aria-label="Comentários" aria-expanded={panel === 'comments'} aria-controls="document-side-panel" onClick={() => onPanel(panel === 'comments' ? null : 'comments')}><MessageCircle size={16}/><span className="document-action-label">Comentários</span>{commentCount > 0 && <span className="document-count">{commentCount}</span>}</button></>}
      <button type="button" className={`secondary-button ${panel === 'history' ? 'active' : ''}`} aria-label="Histórico de versões" aria-expanded={panel === 'history'} aria-controls="document-side-panel" onClick={() => onPanel(panel === 'history' ? null : 'history')}><History size={16}/><span className="document-action-label">Histórico</span></button>
      {editable && !historicalPreview && <><button type="button" className="primary-button" disabled={!dirty || saving} onClick={onSave}><Save size={15}/>Salvar</button><DocumentMenu className="document-actions-menu" label={<><MoreHorizontal size={18}/><span className="sr-only">Mais ações</span><ChevronDown size={10}/></>}><button type="button" data-menu-action className="document-danger" disabled={archiveDisabled} onClick={onArchive}>Cancelar US</button></DocumentMenu></>}
    </div>
  </header>;
}
