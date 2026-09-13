import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Underline from '@tiptap/extension-underline';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableHeader from '@tiptap/extension-table-header';
import TableCell from '@tiptap/extension-table-cell';
import TextStyle from '@tiptap/extension-text-style';
import { ArrowLeft, Check, Save } from 'lucide-react';
import { api } from '../../lib/api';
import type { AcceptanceCriterion, RequirementTemplate, Workspace } from '../../lib/types';
import { DocumentToolbar } from './DocumentToolbar';
import { TextFormatting } from './richTextExtensions';
import './documentEditor.css';

const emptyDocument = { type: 'doc', content: [{ type: 'paragraph' }] };
type TemplateDraft = { name: string; description: string; content: Record<string, unknown>; acceptanceCriteria: Array<Omit<AcceptanceCriterion, 'id'>> };
const emptyCriterion = (position: number): Omit<AcceptanceCriterion, 'id'> => ({ title: '', given: '', whenText: '', thenText: '', text: '', position });
const normalizeCriteria = (template: RequirementTemplate): Array<Omit<AcceptanceCriterion, 'id'>> => (template.acceptanceCriteria ?? template.criteria ?? []).map((criterion, position) => {
  const raw = criterion as AcceptanceCriterion & { when?: string; then?: string };
  const whenText = raw.whenText ?? raw.when ?? '';
  const thenText = raw.thenText ?? raw.then ?? '';
  return { title: criterion.title ?? '', given: criterion.given ?? '', whenText, thenText, text: criterion.text ?? thenText, content: criterion.content ?? null, position };
});

export function TemplateEditor({ workspace, templateId, onClose }: { workspace: Workspace; templateId: string; onClose: () => void }) {
  const client = useQueryClient();
  const canEdit = (workspace.role ?? 'EDITOR') !== 'VIEWER';
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [criteria, setCriteria] = useState<Array<Omit<AcceptanceCriterion, 'id'>>>([]);
  const [revision, setRevision] = useState(0);
  const [base, setBase] = useState<TemplateDraft | null>(null);
  const loaded = useRef<string | null>(null);
  const topbar = useRef<HTMLDivElement>(null);
  const template = useQuery<RequirementTemplate>({ queryKey: ['template', templateId], queryFn: () => api(`/templates/${templateId}`) });
  const editor = useEditor({
    editable: canEdit,
    editorProps: { attributes: { 'aria-label': 'Conteúdo do template', role: 'textbox', 'aria-multiline': 'true' } },
    // The standard schemes are supported by Link itself; avoid re-registering
    // them globally every time an editor is mounted.
    extensions: [StarterKit, TextStyle, TextFormatting, Underline, Link.configure({ openOnClick: false }), TaskList, TaskItem.configure({ nested: true }), Table.configure({ resizable: true }), TableRow, TableHeader, TableCell, Placeholder.configure({ placeholder: 'Defina a estrutura que novas User Stories devem receber…' })],
    content: emptyDocument,
    onUpdate: () => setRevision(value => value + 1),
  });
  useEffect(() => { editor?.setEditable(canEdit); }, [canEdit, editor]);
  useEffect(() => {
    if (!editor || !template.data || loaded.current === templateId) return;
    loaded.current = templateId;
    setName(template.data.name);
    setDescription(template.data.description ?? '');
    setCriteria(normalizeCriteria(template.data));
    editor.commands.setContent(template.data.content ?? emptyDocument);
    setBase({ name: template.data.name, description: template.data.description ?? '', content: editor.getJSON(), acceptanceCriteria: normalizeCriteria(template.data) });
    setRevision(value => value + 1);
  }, [editor, template.data, templateId]);
  const draft = useMemo<TemplateDraft>(() => ({ name: name.trim(), description: description.trim(), content: editor?.getJSON() ?? emptyDocument, acceptanceCriteria: criteria.map((criterion, position) => ({ ...criterion, position })) }), [criteria, description, editor, name, revision]);
  const save = useMutation({
    mutationFn: (submitted: TemplateDraft) => api<RequirementTemplate>(`/templates/${templateId}`, { method: 'PATCH', body: JSON.stringify({ ...submitted, description: submitted.description || null, acceptanceCriteria: submitted.acceptanceCriteria.map(criterion => ({ ...criterion, when: criterion.whenText, then: criterion.thenText })) }) }),
    onSuccess: (saved, submitted) => {
      client.setQueryData(['template', templateId], saved);
      client.invalidateQueries({ queryKey: ['templates', workspace.id] });
      // Use exactly what was submitted as the clean baseline. The API may
      // normalize JSON fields, and edits made while a request is pending must
      // remain local instead of being overwritten by the response.
      setBase(submitted);
    },
  });
  const canSave = canEdit && Boolean(draft.name) && Boolean(editor) && !save.isPending;
  const dirty = useMemo(() => Boolean(base && (draft.name !== base.name || draft.description !== base.description || JSON.stringify(draft.content) !== JSON.stringify(base.content) || JSON.stringify(draft.acceptanceCriteria) !== JSON.stringify(base.acceptanceCriteria))), [base, draft]);
  useEffect(() => {
    const element = topbar.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => element.parentElement?.style.setProperty('--document-tools-height', `${element.offsetHeight}px`));
    observer.observe(element);
    return () => observer.disconnect();
  }, [canEdit, Boolean(template.data)]);
  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 's') return;
      event.preventDefault();
      if (canSave && dirty) save.mutate(draft);
    };
    window.addEventListener('keydown', shortcut);
    return () => window.removeEventListener('keydown', shortcut);
  }, [canSave, dirty, draft, save]);
  const close = () => { if (!dirty || window.confirm('Existem alterações não salvas. Sair mesmo assim?')) onClose(); };
  if (template.isLoading) return <main className="editor-page"><div className="content-state"><span className="loading-ring"/><strong>Carregando template…</strong></div></main>;
  if (template.isError) return <main className="editor-page"><div className="content-state" role="alert"><strong>Não foi possível carregar o template</strong><span>{template.error instanceof Error ? template.error.message : 'Tente novamente.'}</span><button type="button" className="secondary-button" onClick={() => template.refetch()}>Tentar novamente</button></div></main>;
  if (!template.data) return <main className="editor-page"><div className="content-state"><strong>Template não encontrado</strong></div></main>;
  return <main className="editor-page document-editor">
    <div className="document-topbar" ref={topbar}>
      <header className="document-heading">
        <button type="button" className="secondary-button document-back" onClick={close} aria-label="Voltar"><ArrowLeft size={16}/><span>Voltar</span></button>
        <div className="document-identity"><p className="section-kicker">Template do workspace</p><input className="document-title" value={name} disabled={!canEdit} onChange={event => setName(event.target.value)} aria-label="Nome do template"/></div>
        <div className="document-heading-actions">
          <span className={`save-state ${save.isPending ? 'saving' : save.error ? 'error' : dirty ? 'pending' : 'saved'}`} aria-live="polite">{!save.isPending && !save.error && !dirty && <Check size={13}/>}<span>{save.isPending ? 'Salvando…' : save.error ? 'Falha ao salvar' : dirty ? 'Alterações pendentes' : 'Salvo'}</span></span>
          {canEdit && <button type="button" className="primary-button" disabled={!canSave || !dirty} onClick={() => save.mutate(draft)}><Save size={15}/>Salvar</button>}
        </div>
      </header>
      {canEdit && editor && <DocumentToolbar editor={editor}/>}
    </div>
    {save.error && <div className="inline-error editor-error" role="alert">{save.error.message}</div>}
    {!canEdit && <div className="editor-readonly">Você possui acesso de leitor. Este template está em modo de leitura.</div>}
    <div className="document-layout template-document-layout"><div className="document-main-column"><section className="document-paper template-document-paper" aria-label="Editor de template"><label className="template-description"><span>Descrição</span><input value={description} disabled={!canEdit} maxLength={500} onChange={event => setDescription(event.target.value)} placeholder="Explique quando este template deve ser usado"/></label><div className="rich-editor rich-document"><EditorContent editor={editor}/></div></section><section className="document-supplement"><div className="doc-section-heading"><div><h2>Critérios de aceite</h2><p className="section-help">Defina os critérios que serão copiados para cada nova User Story.</p></div>{canEdit && <button type="button" className="secondary-button" onClick={() => setCriteria(current => [...current, emptyCriterion(current.length)])}>＋ Critério</button>}</div><div className="criterion-cards">{criteria.map((criterion, index) => <article className="criterion-card" key={index}><header><span>CA{String(index + 1).padStart(2, '0')}</span>{canEdit && <button type="button" className="text-button" onClick={() => setCriteria(current => current.filter((_, position) => position !== index).map((item, position) => ({ ...item, position })))}>Remover</button>}</header><input disabled={!canEdit} value={criterion.title ?? ''} onChange={event => setCriteria(current => current.map((item, position) => position === index ? { ...item, title: event.target.value } : item))} aria-label={`Título do critério ${index + 1}`} placeholder="Título do critério"/><div className="gherkin-fields"><label>Dado<input disabled={!canEdit} value={criterion.given ?? ''} onChange={event => setCriteria(current => current.map((item, position) => position === index ? { ...item, given: event.target.value } : item))} placeholder="o contexto"/></label><label>Quando<input disabled={!canEdit} value={criterion.whenText ?? ''} onChange={event => setCriteria(current => current.map((item, position) => position === index ? { ...item, whenText: event.target.value } : item))} placeholder="a ação ocorre"/></label><label>Então<input disabled={!canEdit} value={criterion.thenText ?? ''} onChange={event => setCriteria(current => current.map((item, position) => position === index ? { ...item, thenText: event.target.value, text: event.target.value } : item))} placeholder="o resultado esperado"/></label></div></article>)}</div>{!criteria.length && <p className="empty-copy">Nenhum critério adicionado.</p>}</section></div></div>
  </main>;
}
