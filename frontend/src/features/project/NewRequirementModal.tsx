import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Icon } from '../../components/Icon';
import { api } from '../../lib/api';
import type { RequirementFolder, RequirementTemplate } from '../../lib/types';

export interface NewRequirementInput { title: string; folderId: string; templateId?: string; content?: Record<string, unknown>; acceptanceCriteria?: Array<{ text: string; title?: string; given?: string; when?: string; then?: string; content?: Record<string, unknown> | null; position: number }> }

const blankDocument = { type: 'doc', content: [{ type: 'paragraph' }] };
const userStoryTemplate: RequirementTemplate = {
  id: 'native-user-story', name: 'User Story completa',
  content: { type: 'doc', content: [
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Especificação' }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'Descreva os detalhes, regras e decisões deste requisito.' }] },
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Campos e comportamento' }] },
    { type: 'table', content: [{ type: 'tableRow', content: ['Campo', 'Tipo', 'Descrição', 'Exemplo'].map((text) => ({ type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] })) }, { type: 'tableRow', content: ['', '', '', ''].map(() => ({ type: 'tableCell', content: [{ type: 'paragraph' }] })) }] },
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Regras de negócio' }] },
    { type: 'paragraph' },
  ] },
  criteria: [],
};

export function NewRequirementModal({ workspaceId, pending, error, onClose, onCreate }: { workspaceId: string; pending: boolean; error?: Error | null; onClose: () => void; onCreate: (input: NewRequirementInput) => void }) {
  const [title, setTitle] = useState('');
  const [templateId, setTemplateId] = useState('blank');
  const [folderId, setFolderId] = useState('');
  const templates = useQuery<RequirementTemplate[]>({ queryKey: ['templates', workspaceId], queryFn: () => api(`/workspaces/${workspaceId}/templates`) });
  const folders = useQuery<RequirementFolder[]>({ queryKey: ['folders', workspaceId], queryFn: () => api(`/workspaces/${workspaceId}/folders`) });
  const input = useRef<HTMLInputElement>(null);
  const modal = useRef<HTMLFormElement>(null);
  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    input.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !pending) onClose();
      if (event.key !== 'Tab' || !modal.current) return;
      const focusable = Array.from(modal.current.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled)'));
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => { window.removeEventListener('keydown', handleKeyDown); previouslyFocused?.focus(); };
  }, [onClose, pending]);
  const selectedTemplate = templateId === 'native-user-story' ? userStoryTemplate : templates.data?.find((item) => item.id === templateId);
  useEffect(() => { if (!folderId && folders.data?.[0]) setFolderId(folders.data[0].id); }, [folderId, folders.data]);
  const foldersUnavailable = folders.isError || (!folders.isLoading && !folders.data?.length);
  const cannotSubmit = pending || !title.trim() || !folderId || folders.isLoading || foldersUnavailable;
  const submit = (event: FormEvent) => { event.preventDefault(); if (cannotSubmit) return; const isPersistedTemplate = templateId !== 'blank' && templateId !== 'native-user-story'; const criteria = (selectedTemplate?.acceptanceCriteria ?? selectedTemplate?.criteria)?.map((criterion, position) => ({ title: criterion.title, given: criterion.given, text: criterion.text ?? criterion.thenText ?? criterion.title ?? '', when: criterion.whenText, then: criterion.thenText, content: criterion.content ?? null, position })); onCreate({ title: title.trim(), folderId, ...(isPersistedTemplate ? { templateId, content: {} } : { content: selectedTemplate?.content ?? blankDocument, acceptanceCriteria: criteria }) }); };
  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !pending) onClose(); }}>
      <form ref={modal} className="modal-card" role="dialog" aria-modal="true" aria-labelledby="new-requirement-title" onSubmit={submit}>
        <header className="modal-header"><div><p className="section-kicker">Novo registro</p><h2 id="new-requirement-title">Adicionar requisito</h2></div><button type="button" className="icon-button" aria-label="Fechar" onClick={onClose} disabled={pending}><Icon name="close" size={16}/></button></header>
        <div className="modal-fields"><label>Título<input ref={input} required maxLength={240} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Descreva a User Story"/></label><label>Pasta<select required value={folderId} onChange={(event) => setFolderId(event.target.value)} disabled={folders.isLoading || foldersUnavailable}>{folders.isLoading ? <option>Carregando pastas…</option> : (folders.data ?? []).map((folder) => <option value={folder.id} key={folder.id}>{folder.name}</option>)}</select></label>{foldersUnavailable && <div className="inline-error" role="alert">{folders.isError ? `Não foi possível carregar as pastas: ${folders.error.message}` : 'Nenhuma pasta está disponível neste workspace. Crie uma pasta e tente novamente.'}</div>}<fieldset className="template-picker"><legend>Começar com</legend><label className={templateId === 'blank' ? 'selected' : ''}><input type="radio" name="template" checked={templateId === 'blank'} onChange={() => setTemplateId('blank')}/><span><strong>Em branco</strong><small>Comece apenas com uma página vazia.</small></span></label><label className={templateId === 'native-user-story' ? 'selected' : ''}><input type="radio" name="template" checked={templateId === 'native-user-story'} onChange={() => setTemplateId('native-user-story')}/><span><strong>User Story completa</strong><small>Documento com campos e regras de negócio.</small></span></label>{(templates.data ?? []).map((template) => <label key={template.id} className={templateId === template.id ? 'selected' : ''}><input type="radio" name="template" checked={templateId === template.id} onChange={() => setTemplateId(template.id)}/><span><strong>{template.name}</strong><small>{template.description || 'Template salvo no workspace.'}</small></span></label>)}</fieldset></div>
        {error && <div className="inline-error" role="alert">{error.message}</div>}
        <footer className="modal-footer"><span>O código será gerado automaticamente.</span><div><button type="button" className="secondary-button" onClick={onClose} disabled={pending}>Cancelar</button><button className="primary-button" disabled={cannotSubmit}>{pending ? 'Adicionando…' : 'Adicionar requisito'}</button></div></footer>
      </form>
    </div>
  );
}
