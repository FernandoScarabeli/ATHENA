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
import { Icon } from '../../components/Icon';
import { api, ApiError } from '../../lib/api';
import type { AcceptanceCriterion, CommentThread, Requirement, RequirementFolder, RequirementReference, RequirementRelation, RequirementVersion, User, Workspace, WorkspaceParticipant, WorkspaceRole } from '../../lib/types';
import { isRequirementDirty, isSaveShortcut, requirementUpdatePayload, type RequirementDraft } from './requirementEditorModel';
import { CommentHighlights, TextFormatting, commentHighlightsKey, type CommentHighlightAnchor } from './richTextExtensions';
import { DocumentToolbar } from './DocumentToolbar';
import { DocumentHeader, type DocumentPanel } from './DocumentHeader';
import { DocumentDetails, DocumentSidePanel } from './DocumentPanel';
import { VersionHistory } from './VersionHistory';
import { relationDetails, relationKind } from './relationSemantics';
import { ExternalTasksDialog, newIdempotencyKey } from './ExternalTasksDialog';
import './documentEditor.css';

const emptyDoc = { type: 'doc', content: [{ type: 'paragraph' }] };
const emptyCriterion = (position: number): AcceptanceCriterion => ({ title: '', given: '', whenText: '', thenText: '', position });
type Props = { projectId: string; requirementId: string; workspace: Workspace; user: User; onClose: () => void; onDirtyChange?: (dirty: boolean) => void; onSavingChange?: (saving: boolean) => void; onNavigateRequirement?: (id: string) => void; onReturnToPreviousRequirement?: () => void; canReturnToPreviousRequirement?: boolean };

export function RequirementEditor({ projectId, requirementId, workspace, user, onClose, onDirtyChange, onSavingChange, onNavigateRequirement, onReturnToPreviousRequirement, canReturnToPreviousRequirement }: Props) {
  const client = useQueryClient();
  const [form, setForm] = useState<Partial<Requirement>>({});
  const [criteria, setCriteria] = useState<AcceptanceCriterion[]>([]);
  const [base, setBase] = useState<Requirement | null>(null);
  const [conflict, setConflict] = useState<Requirement | null>(null);
  const [editorTick, setEditorTick] = useState(0);
  const [panel, setPanel] = useState<DocumentPanel>(null);
  const [relatedOpen, setRelatedOpen] = useState(false);
  const [criteriaOpen, setCriteriaOpen] = useState(false);
  const [referencesOpen, setReferencesOpen] = useState(false);
  const [tasksOpen, setTasksOpen] = useState(false);
  const [taskIdempotencyKey, setTaskIdempotencyKey] = useState<string>(newIdempotencyKey);
  const criteriaContainer = useRef<HTMLDivElement>(null);
  const focusNewCriterion = useRef(false);
  const topbar = useRef<HTMLDivElement>(null);
  const submittedCriteria = useRef<AcceptanceCriterion[]>([]);
  const submittedDraft = useRef<RequirementDraft | null>(null);
  const [selection, setSelection] = useState<{ from: number; to: number; quote: string } | null>(null);
  const [commentBody, setCommentBody] = useState('');
  const [activeCommentId, setActiveCommentId] = useState<string | null>(null);
  const [historicalVersion, setHistoricalVersion] = useState<RequirementVersion | null>(null);
  const [contentRequirementId, setContentRequirementId] = useState<string | null>(null);
  const loadedRequirement = useRef<string | null>(null);
  const role = workspace.role ?? 'EDITOR';
  const query = useQuery<Requirement>({ queryKey: ['requirement', requirementId], queryFn: () => api(`/requirements/${requirementId}`) });
  const canEdit = (role === 'OWNER' || role === 'MANAGER' || role === 'EDITOR') && query.data?.status !== 'ARCHIVED';
  const canComment = query.data?.status !== 'ARCHIVED';
  const folders = useQuery<RequirementFolder[]>({ queryKey: ['folders', projectId], queryFn: () => api(`/projects/${projectId}/folders`) });
  const requirement = query.data;
  const comments = useQuery<CommentThread[]>({ queryKey: ['comments', requirementId], queryFn: () => api(`/requirements/${requirementId}/comments`), enabled: Boolean(requirement) });
  const references = useQuery<RequirementReference[]>({ queryKey: ['references', requirementId], queryFn: () => api(`/requirements/${requirementId}/references`), enabled: Boolean(requirement) });
  const externalLinks = useQuery<Array<{ id: string }>>({ queryKey: ['external-links', requirementId], queryFn: () => api(`/requirements/${requirementId}/external-links`), enabled: Boolean(requirement && tasksOpen) });
  const relations = useQuery<RequirementRelation[]>({ queryKey: ['relations', requirementId], queryFn: () => api(`/requirements/${requirementId}/relations`), enabled: Boolean(requirement) });
  const members = useQuery<WorkspaceParticipant[]>({ queryKey: ['participants', projectId], queryFn: () => api(`/projects/${projectId}/participants`), enabled: panel === 'comments' });
  const editor = useEditor({
    editable: canEdit,
    editorProps: { attributes: { 'aria-label': 'Conteúdo do documento', role: 'textbox', 'aria-multiline': 'true' } },
    // http, https and mailto are already built into Link. Registering them for
    // each editor instance makes linkifyjs warn after the first editor mounts.
    extensions: [StarterKit, TextStyle, TextFormatting, CommentHighlights, Underline, Link.configure({ openOnClick: false }), TaskList, TaskItem.configure({ nested: true }), Table.configure({ resizable: true }), TableRow, TableHeader, TableCell, Placeholder.configure({ placeholder: 'Comece a documentar o requisito…' })],
    content: emptyDoc,
    onUpdate: () => setEditorTick((value) => value + 1),
    onSelectionUpdate: ({ editor: instance }) => {
      const { from, to } = instance.state.selection;
      if (from === to) return setSelection(null);
      const text = instance.state.doc.textBetween(from, to, ' ').trim();
      setSelection(text ? { from, to, quote: text } : null);
    },
  });
  const historicalEditor = useEditor({
    editable: false,
    editorProps: { attributes: { 'aria-label': 'Conteúdo da revisão histórica', role: 'document' } },
    extensions: [StarterKit, TextStyle, Underline, Link.configure({ openOnClick: false }), TaskList, TaskItem.configure({ nested: true }), Table.configure({ resizable: false }), TableRow, TableHeader, TableCell],
    content: emptyDoc,
  });
  useEffect(() => { editor?.setEditable(canEdit); }, [canEdit, editor]);
  useEffect(() => {
    if (!historicalEditor) return;
    historicalEditor.commands.setContent(historicalVersion?.snapshot.content ?? emptyDoc, false);
  }, [historicalEditor, historicalVersion]);
  useEffect(() => {
    if (!editor || contentRequirementId !== requirementId) return;
    const anchors: CommentHighlightAnchor[] = (comments.data ?? []).flatMap((thread) => {
      const anchor = thread.anchor;
      return thread.status === 'OPEN' && anchor && Number.isInteger(anchor.from) && Number.isInteger(anchor.to) ? [{ id: thread.id, from: anchor.from!, to: anchor.to!, active: thread.id === activeCommentId }] : [];
    });
    editor.view.dispatch(editor.state.tr.setMeta(commentHighlightsKey, anchors));
  }, [activeCommentId, comments.data, contentRequirementId, editor, requirementId]);
  useEffect(() => {
    if (!editor) return;
    const openThread = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const commentId = target.closest<HTMLElement>('.comment-highlight[data-comment-id]')?.dataset.commentId;
      if (!commentId) return;
      event.preventDefault();
      setPanel('comments');
      setActiveCommentId(commentId);
    };
    editor.view.dom.addEventListener('click', openThread);
    return () => editor.view.dom.removeEventListener('click', openThread);
  }, [editor]);
  useEffect(() => {
    if (!editor || !requirement || loadedRequirement.current === requirementId) return;
    loadedRequirement.current = requirementId;
    setCriteriaOpen(requirement.criteria.length > 0);
    setForm(requirement); setCriteria(requirement.criteria.map((criterion, position) => ({ ...criterion, position })));
    editor.commands.setContent(requirement.content ?? emptyDoc);
    setBase({ ...requirement, content: editor.getJSON() });
    setContentRequirementId(requirementId);
  }, [editor, requirement, requirementId]);
  useEffect(() => () => { loadedRequirement.current = null; }, [requirementId]);
  useEffect(() => {
    setHistoricalVersion(null);
    setPanel(null);
    setActiveCommentId(null);
    setCommentBody('');
    setSelection(null);
    setConflict(null);
    setTaskIdempotencyKey(newIdempotencyKey());
  }, [requirementId]);
  const draft = useMemo(() => ({ title: String(form.title ?? ''), status: form.status as Requirement['status'], folderId: String(form.folderId ?? requirement?.folderId ?? ''), criteria, content: editor?.getJSON() ?? emptyDoc }), [criteria, editor, editorTick, form, requirement?.folderId]);
  const dirty = useMemo(() => Boolean(base && isRequirementDirty(base, draft)), [base, draft]);
  useEffect(() => { onDirtyChange?.(dirty); return () => onDirtyChange?.(false); }, [dirty, onDirtyChange]);
  useEffect(() => {
    const element = topbar.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => element.parentElement?.style.setProperty('--document-tools-height', `${element.offsetHeight}px`));
    observer.observe(element);
    return () => observer.disconnect();
  }, [Boolean(requirement), canEdit]);
  useEffect(() => { const handler = (event: BeforeUnloadEvent) => { if (dirty) { event.preventDefault(); event.returnValue = ''; } }; window.addEventListener('beforeunload', handler); return () => window.removeEventListener('beforeunload', handler); }, [dirty]);
  const save = useMutation({
    mutationFn: (payload: ReturnType<typeof requirementUpdatePayload>) => api<Requirement>(`/requirements/${requirementId}`, { method: 'PATCH', body: JSON.stringify(payload) }),
    onSuccess: (saved, submitted) => {
      const snapshot = submittedDraft.current;
      // The API can normalize nullable criterion fields. The saved snapshot is the
      // authoritative baseline so a successful save never creates a local change.
      setBase({
        ...saved,
        title: submitted.title,
        status: saved.status,
        folderId: submitted.folderId,
        content: submitted.content,
        criteria: snapshot?.criteria ?? submittedCriteria.current,
      });
      setForm(current => ({ ...current, status: saved.status, title: current.title === submitted.title ? submitted.title : current.title, folderId: current.folderId === submitted.folderId ? submitted.folderId : current.folderId }));
      client.setQueryData(['requirement', requirementId], saved);
      client.invalidateQueries({ queryKey: ['requirements', projectId] });
      client.invalidateQueries({ queryKey: ['graph', projectId] });
    },
    onError: async (error) => { if (error instanceof ApiError && error.code === 'REQUIREMENT_REVISION_CONFLICT') setConflict(await api(`/requirements/${requirementId}`)); },
  });
  useEffect(() => { onSavingChange?.(save.isPending); return () => onSavingChange?.(false); }, [onSavingChange, save.isPending]);
  const saveNow = () => { if (canEdit && base && dirty && !save.isPending) {
    submittedCriteria.current = criteria;
    submittedDraft.current = draft;
    save.mutate(requirementUpdatePayload(base, draft));
  } };
  const saveDraftBeforeTask = async () => {
    if (!dirty) return;
    if (!canEdit || !base || save.isPending) throw new Error('Aguarde o salvamento atual da US.');
    submittedCriteria.current = criteria;
    submittedDraft.current = draft;
    await save.mutateAsync(requirementUpdatePayload(base, draft));
  };
  const archive = useMutation({ mutationFn: () => api(`/requirements/${requirementId}`, { method: 'DELETE' }), onSuccess: () => { client.invalidateQueries({ queryKey: ['requirements', projectId] }); client.invalidateQueries({ queryKey: ['graph', projectId] }); onClose(); } });
  const createComment = useMutation({ mutationFn: () => api<CommentThread>(`/requirements/${requirementId}/comments`, { method: 'POST', body: JSON.stringify({ body: commentBody.trim(), anchor: selection ?? undefined, mentionedUserIds: (members.data ?? []).filter((member) => commentBody.includes(`@${member.name}`)).map((member) => member.id) }) }), onSuccess: () => { setCommentBody(''); setSelection(null); client.invalidateQueries({ queryKey: ['comments', requirementId] }); client.invalidateQueries({ queryKey: ['notifications'] }); } });
  const setThreadStatus = useMutation({ mutationFn: ({ id, status }: { id: string; status: 'OPEN' | 'RESOLVED' }) => api(`/comments/${id}/${status === 'RESOLVED' ? 'resolve' : 'reopen'}`, { method: 'PATCH' }), onSuccess: () => client.invalidateQueries({ queryKey: ['comments', requirementId] }) });
  const addReply = useMutation({ mutationFn: ({ id, body }: { id: string; body: string }) => api(`/comments/${id}/replies`, { method: 'POST', body: JSON.stringify({ body }) }), onSuccess: () => client.invalidateQueries({ queryKey: ['comments', requirementId] }) });
  const removeReference = useMutation({ mutationFn: (id: string) => api(`/requirements/${requirementId}/references/${id}`, { method: 'DELETE' }), onSuccess: () => client.invalidateQueries({ queryKey: ['references', requirementId] }) });
  useEffect(() => { const onKey = (event: KeyboardEvent) => { if (isSaveShortcut(event)) { event.preventDefault(); saveNow(); } }; window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey); }, [canEdit, dirty, base, draft, save.isPending]);
  useEffect(() => {
    if (criteriaOpen && focusNewCriterion.current) {
      const inputs = criteriaContainer.current?.querySelectorAll<HTMLInputElement>('.criterion-card > input');
      inputs?.[inputs.length - 1]?.focus();
      focusNewCriterion.current = false;
    }
  }, [criteria.length, criteriaOpen]);
  if (query.isLoading) return <div className="editor-page"><div className="content-state"><span className="loading-ring"/><strong>Carregando requisito…</strong></div></div>;
  if (!requirement) return <div className="editor-page"><div className="content-state" role="alert"><strong>Requisito não encontrado</strong></div></div>;
  if (requirement.projectId !== projectId) return <div className="editor-page"><div className="content-state" role="alert"><strong>Requisito indisponível neste projeto</strong><span>Esta User Story pertence a outro projeto e não pode ser aberta por esta rota.</span></div></div>;
  const set = (key: keyof Requirement, value: unknown) => setForm((current) => ({ ...current, [key]: value }));
  const close = () => { if (!dirty || window.confirm('Existem alterações não salvas. Sair mesmo assim?')) onClose(); };
  const updateCriterion = (index: number, key: keyof AcceptanceCriterion, value: string) => setCriteria((current) => current.map((item, position) => position === index ? { ...item, [key]: value } : item));
  const referenceItems = references.data ?? requirement.references ?? [];
  const addCriterion = () => {
    focusNewCriterion.current = true;
    setCriteriaOpen(true);
    setCriteria(current => [...current, emptyCriterion(current.length)]);
  };
  const previewingHistory = Boolean(historicalVersion);
  const displayedTitle = historicalVersion?.snapshot.title ?? String(form.title ?? '');
  const displayedRevision = historicalVersion?.revision ?? base?.revision;
  return <main className="editor-page document-editor">
    <div className="document-topbar" ref={topbar}>
      <DocumentHeader code={requirement.code} revision={displayedRevision} title={displayedTitle}
        editable={canEdit && !previewingHistory} dirty={previewingHistory ? false : dirty} saving={previewingHistory ? false : save.isPending} error={previewingHistory ? false : Boolean(save.error)} historicalPreview={previewingHistory}
        relatedCount={relations.data?.length ?? 0} relatedOpen={relatedOpen} onToggleRelated={() => setRelatedOpen(open => !open)}
        commentCount={comments.data?.filter(thread => thread.status === 'OPEN').length ?? 0}
        tasksAvailable={!previewingHistory && requirement.status !== 'ARCHIVED'} taskCount={externalLinks.data?.length ?? 0} onTasks={() => setTasksOpen(true)}
        panel={panel} onPanel={setPanel} onTitle={title => set('title', title)} onClose={close} onSave={saveNow}
        archiveDisabled={archive.isPending || requirement.status === 'ARCHIVED'}
        onArchive={() => { if (window.confirm('Cancelar esta US? Ela ficará arquivada e sem relações.')) archive.mutate(); }}/>
      {canEdit && editor && !previewingHistory && <DocumentToolbar editor={editor}/>}
    </div>
    {save.error && <div className="inline-error editor-error" role="alert">{save.error.message}</div>}
    {archive.error && <div className="inline-error editor-error" role="alert">{archive.error.message}</div>}
    {previewingHistory ? <div className="historical-preview-banner" role="status"><div><span>Visualizando revisão {historicalVersion?.revision}</span><small>Esta é uma cópia de consulta. Sua edição atual permanece preservada.</small></div><button type="button" className="secondary-button" onClick={() => setHistoricalVersion(null)}>Voltar para a revisão atual</button></div> : !canEdit && <div className="editor-readonly">{requirement.status === 'ARCHIVED' ? 'Esta US está cancelada e disponível somente para consulta.' : <>Você possui acesso de {roleLabel(role)}. {canComment ? 'Você pode comentar, mas não alterar o documento.' : 'Este documento está em modo de leitura.'}</>}</div>}
    <div className={`document-layout ${relatedOpen ? 'with-related-stories' : ''} ${panel ? 'with-panel' : ''}`}>
      <div className="document-main-column">
        <section className={`document-paper ${previewingHistory ? 'historical-document-paper' : ''}`} aria-label={previewingHistory ? `Documento da revisão ${historicalVersion?.revision}` : 'Documento da US'}><div className="rich-editor rich-document"><EditorContent editor={previewingHistory ? historicalEditor : editor}/></div></section>
        {!previewingHistory && <><section className="document-supplement">
          <div className="doc-section-heading">
            <button type="button" className="document-section-toggle" aria-expanded={criteriaOpen} aria-controls="document-criteria" onClick={() => setCriteriaOpen(!criteriaOpen)}>
              <Icon name="chevron" size={16} className={criteriaOpen ? 'expanded' : ''}/><h2>Critérios de aceite</h2><span className="document-count">{criteria.length}</span>
            </button>
            {canEdit && <button type="button" className="secondary-button" onClick={addCriterion}><Icon name="plus" size={14}/>Critério</button>}
          </div>
          <div id="document-criteria" hidden={!criteriaOpen} ref={criteriaContainer}>
            <p className="section-help">Registre o contexto, a ação e o resultado esperado de cada critério.</p>
            <div className="criterion-cards">{criteria.map((criterion, index) => <CriterionCard key={criterion.id ?? index} criterion={criterion} index={index} editable={canEdit} onChange={updateCriterion} onRemove={() => setCriteria(current => current.filter((_, position) => position !== index))}/>)}</div>
            {!criteria.length && <p className="empty-copy">Nenhum critério adicionado.</p>}
          </div>
        </section>
        <section className="document-supplement">
          <button type="button" className="document-section-toggle" aria-expanded={referencesOpen} aria-controls="document-references" onClick={() => setReferencesOpen(!referencesOpen)}>
            <Icon name="chevron" size={16} className={referencesOpen ? 'expanded' : ''}/><h2>Links externos</h2><span className="document-count">{referenceItems.length}</span>
          </button>
          <div id="document-references" hidden={!referencesOpen}>
            <div className="reference-list">{referenceItems.map(item => <div className="reference-row" key={item.id}><span className={`reference-type ${item.type.toLowerCase()}`}>{item.type === 'PROTOTYPE' ? 'Protótipo' : 'Anexo'}</span><a href={item.url} target="_blank" rel="noreferrer">{item.name}</a>{canEdit && <button type="button" className="text-button" disabled={removeReference.isPending} onClick={() => removeReference.mutate(item.id)}>Remover</button>}</div>)}</div>
            {!referenceItems.length && <p className="empty-copy">Nenhum link externo.</p>}
            {removeReference.error && <p className="inline-error" role="alert">{removeReference.error.message}</p>}
          </div>
        </section>
        </>}
      </div>
      {!previewingHistory && relatedOpen && <RelatedStoriesPanel requirement={requirement} currentTitle={String(form.title ?? requirement.title)} editable={canEdit} relations={relations.data ?? []} loading={relations.isLoading} error={relations.error} retry={() => void relations.refetch()} saving={save.isPending} onNavigate={onNavigateRequirement ?? (() => {})} canReturn={Boolean(canReturnToPreviousRequirement)} onReturn={onReturnToPreviousRequirement ?? (() => {})}/>}
      {panel && <DocumentSidePanel title={panel === 'details' ? 'Detalhes da US' : panel === 'history' ? 'Histórico de versões' : 'Comentários'} onClose={() => { setPanel(null); setActiveCommentId(null); }}>
        {panel === 'details' ? <DocumentDetails status={String(form.status ?? 'DRAFT')} folderId={String(form.folderId ?? requirement.folderId)} folders={folders.data ?? []} editable={canEdit && !previewingHistory} onFolder={id => set('folderId', id)}/> : panel === 'history' ? <VersionHistory requirementId={requirementId} selectedRevision={historicalVersion?.revision} onSelectVersion={setHistoricalVersion}/> :
          <CommentSidebar threads={comments.data ?? []} role={role} user={user} members={members.data ?? []} canComment={canComment} selection={selection} body={commentBody} activeCommentId={activeCommentId} onActiveComment={setActiveCommentId} onBody={setCommentBody} onCreate={() => createComment.mutate()} pending={createComment.isPending} createError={createComment.error} onStatus={(id, status) => setThreadStatus.mutate({ id, status })} onReply={(id, body) => addReply.mutate({ id, body })}/>}
      </DocumentSidePanel>}
    </div>
    {tasksOpen && <ExternalTasksDialog projectId={projectId} requirementId={requirementId} code={requirement.code} revision={base?.revision ?? requirement.revision} title={String(form.title ?? requirement.title)} content={draft.content} criteria={criteria} editable={canEdit && !previewingHistory} idempotencyKey={taskIdempotencyKey} onIdempotencyKeyChange={setTaskIdempotencyKey} onSaveDraft={saveDraftBeforeTask} onClose={() => setTasksOpen(false)}/>}
    {conflict && <ConflictDialog conflict={conflict} onServer={() => { setForm(conflict); setCriteria(conflict.criteria.map((criterion, position) => ({ ...criterion, position }))); setCriteriaOpen(conflict.criteria.length > 0); editor?.commands.setContent(conflict.content); setBase({ ...conflict, content: editor?.getJSON() ?? conflict.content }); setConflict(null); save.reset(); }} onMine={() => { setBase(conflict); setConflict(null); save.reset(); }}/>}</main>;
}

function RelatedStoriesPanel({ requirement, currentTitle, editable, relations, loading, error, retry, saving, onNavigate, canReturn, onReturn }: { requirement: Requirement; currentTitle: string; editable: boolean; relations: RequirementRelation[]; loading: boolean; error: Error | null; retry: () => void; saving: boolean; onNavigate: (id: string) => void; canReturn: boolean; onReturn: () => void }) {
  const relationCountByOther = new Map<string, number>();
  relations.forEach((relation) => {
    const otherId = relation.sourceId === requirement.id ? relation.targetId : relation.sourceId;
    relationCountByOther.set(otherId, (relationCountByOther.get(otherId) ?? 0) + 1);
  });
  return <aside id="related-stories-panel" className="related-stories-panel" aria-label="US relacionadas">
    <header className="related-stories-heading">
      <span>US atual</span>
      <strong>{requirement.code}</strong>
      <p>{currentTitle}</p>
      <small>{editable ? 'Modo de edição' : 'Somente leitura'}</small>
    </header>
    {canReturn && <button type="button" className="related-stories-back" disabled={saving} onClick={onReturn}>← Voltar à US anterior</button>}
    <div className="related-stories-list" aria-live="polite">
      <h2>US relacionadas <span className="document-count">{relations.length}</span></h2>
      {loading && <p className="empty-copy" role="status">Carregando relações…</p>}
      {error && <div className="related-stories-error" role="alert"><p>Não foi possível carregar as relações. {error.message}</p><button type="button" className="text-button" onClick={retry}>Tentar novamente</button></div>}
      {!loading && !error && relations.length === 0 && <p className="empty-copy">Esta US ainda não tem relações.</p>}
      {[...relationCountByOther.values()].some((count) => count > 1) && <p className="related-stories-legacy" role="status">Algumas US aparecem mais de uma vez porque têm relações antigas diferentes.</p>}
      {!error && relations.map((relation) => {
        const other = relation.sourceId === requirement.id ? relation.target : relation.source;
        const meaning = relationDetails(relationKind(relation.type, relation.sourceId, relation.targetId, requirement.id), requirement.code, other.code);
        return <button key={relation.id} type="button" className="related-story-link" aria-label={`Abrir ${other.code} ${other.title}`} disabled={saving} onClick={() => onNavigate(other.id)}>
          <span className="related-story-code">{other.code}{(relationCountByOther.get(other.id) ?? 1) > 1 && ` · ${relationCountByOther.get(other.id)} relações`}</span>
          <strong>{other.title}</strong>
          <small>{meaning.title} · {meaning.sentence}</small>
        </button>;
      })}
    </div>
    {saving && <p className="related-stories-saving" role="status">Salvando alterações…</p>}
  </aside>;
}

function CriterionCard({ criterion, index, editable, onChange, onRemove }: { criterion: AcceptanceCriterion; index: number; editable: boolean; onChange: (index: number, key: keyof AcceptanceCriterion, value: string) => void; onRemove: () => void }) { return <article className="criterion-card"><header><span>CA{String(index + 1).padStart(2, '0')}</span>{editable && <button className="text-button" onClick={onRemove}>Remover</button>}</header><input disabled={!editable} value={criterion.title ?? ''} onChange={(event) => onChange(index, 'title', event.target.value)} aria-label={`Título do critério ${index + 1}`} placeholder="Título do critério"/><div className="gherkin-fields"><label>Dado<input disabled={!editable} value={criterion.given ?? ''} onChange={(event) => onChange(index, 'given', event.target.value)} placeholder="o contexto"/></label><label>Quando<input disabled={!editable} value={criterion.whenText ?? ''} onChange={(event) => onChange(index, 'whenText', event.target.value)} placeholder="a ação ocorre"/></label><label>Então<input disabled={!editable} value={criterion.thenText ?? criterion.text ?? ''} onChange={(event) => onChange(index, 'thenText', event.target.value)} placeholder="o resultado esperado"/></label></div></article>; }
function CommentSidebar({ threads, role, user, members, canComment, selection, body, activeCommentId, onActiveComment, onBody, onCreate, pending, createError, onStatus, onReply }: { threads: CommentThread[]; role: WorkspaceRole; user: User; members: WorkspaceParticipant[]; canComment: boolean; selection: { quote: string } | null; body: string; activeCommentId: string | null; onActiveComment: (id: string | null) => void; onBody: (body: string) => void; onCreate: () => void; pending: boolean; createError: Error | null; onStatus: (id: string, status: 'OPEN' | 'RESOLVED') => void; onReply: (id: string, body: string) => void }) {
  const [tab, setTab] = useState<'OPEN' | 'RESOLVED'>('OPEN');
  const openThreads = threads.filter((thread) => thread.status === 'OPEN');
  const resolvedThreads = threads.filter((thread) => thread.status === 'RESOLVED');
  const visibleThreads = tab === 'OPEN' ? openThreads : resolvedThreads;
  useEffect(() => {
    if (!activeCommentId) return;
    setTab('OPEN');
    requestAnimationFrame(() => document.getElementById(`comment-thread-${activeCommentId}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
  }, [activeCommentId]);
  return <aside className="comments-sidebar">
    {canComment && <section className="new-comment" aria-label="Novo comentário">
      {selection && <p className="selected-comment-quote" title={selection.quote}>“{selection.quote}”</p>}
      <textarea value={body} onChange={(event) => onBody(event.target.value)} placeholder="Escreva um comentário… Use @nome para mencionar."/>
      <div className="comment-composer-actions"><div className="mention-list">{members.filter(member => member.id !== user.id).slice(0, 3).map(member => <button key={member.id} className="mention-chip" type="button" onClick={() => onBody(`${body}${body && !body.endsWith(' ') ? ' ' : ''}@${member.name} `)}>@{member.name}</button>)}</div><button className="primary-button" disabled={!body.trim() || pending} onClick={onCreate}>{pending ? 'Enviando…' : 'Comentar'}</button></div>
      {createError && <div className="inline-error">{createError.message}</div>}
    </section>}
    <div className="comment-tabs" role="tablist" aria-label="Status dos comentários">
      <button type="button" role="tab" aria-selected={tab === 'OPEN'} className={tab === 'OPEN' ? 'active' : ''} onClick={() => setTab('OPEN')}>Abertos <span>{openThreads.length}</span></button>
      <button type="button" role="tab" aria-selected={tab === 'RESOLVED'} className={tab === 'RESOLVED' ? 'active' : ''} onClick={() => setTab('RESOLVED')}>Resolvidos <span>{resolvedThreads.length}</span></button>
    </div>
    <div className="thread-list" role="tabpanel">{visibleThreads.length ? visibleThreads.map(thread => <CommentItem key={thread.id} thread={thread} user={user} role={role} canComment={canComment} active={activeCommentId === thread.id} onActive={() => onActiveComment(thread.id)} onInactive={() => onActiveComment(null)} onStatus={onStatus} onReply={onReply}/>) : <p className="empty-copy">{tab === 'OPEN' ? 'Nenhum comentário aberto.' : 'Nenhum comentário resolvido.'}</p>}</div>
  </aside>;
}
function CommentItem({ thread, user, role, canComment, active, onActive, onInactive, onStatus, onReply }: { thread: CommentThread; user: User; role: WorkspaceRole; canComment: boolean; active: boolean; onActive: () => void; onInactive: () => void; onStatus: (id: string, status: 'OPEN' | 'RESOLVED') => void; onReply: (id: string, body: string) => void }) {
  const [reply, setReply] = useState('');
  const canResolve = thread.author.id === user.id || role === 'OWNER' || role === 'MANAGER' || role === 'EDITOR';
  const quote = thread.anchor?.quote ?? thread.quote;
  const isOpen = thread.status === 'OPEN';
  const sendReply = () => { if (!reply.trim()) return; onReply(thread.id, reply); setReply(''); };
  return <article id={`comment-thread-${thread.id}`} className={`comment-thread ${thread.status.toLowerCase()} ${active ? 'active' : ''}`} onMouseEnter={onActive} onMouseLeave={onInactive}>
    <header><strong>{thread.author.name}</strong>{canComment && isOpen && canResolve && <button className="resolve-comment" type="button" onClick={() => onStatus(thread.id, 'RESOLVED')}>Fechar</button>}</header>
    {quote && <p className="thread-quote" title={quote}>“{quote}”</p>}
    <div className="comment-conversation">{thread.messages.map((message, index) => <div className="comment-message" key={message.id}>{index > 0 && message.author.id !== thread.messages[index - 1].author.id && <strong>{message.author.name}</strong>}<p>{message.body}</p></div>)}</div>
    {isOpen && canComment && <div className="reply-box"><input value={reply} onChange={event => setReply(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') sendReply(); }} placeholder="Adicionar uma resposta…" aria-label={`Responder comentário de ${thread.author.name}`}/><button type="button" disabled={!reply.trim()} onClick={sendReply} aria-label="Enviar resposta">↑</button></div>}
    {!isOpen && canComment && canResolve && <footer><button className="text-button" type="button" onClick={() => onStatus(thread.id, 'OPEN')}>Reabrir comentário</button></footer>}
  </article>;
}
function ConflictDialog({ conflict, onServer, onMine }: { conflict: Requirement; onServer: () => void; onMine: () => void }) { return <div className="modal-backdrop"><section className="modal-card"><p className="section-kicker">Conflito de revisão</p><h2>Uma versão mais recente foi salva</h2><p className="form-lead">A revisão atual é v{conflict.revision}. Sua edição continua preservada nesta tela.</p><div className="conflict-actions"><button className="secondary-button" onClick={onServer}>Usar versão atual</button><button className="primary-button" onClick={onMine}>Manter minha edição</button></div></section></div>; }
function roleLabel(role: WorkspaceRole) { return ({ OWNER: 'proprietário', MANAGER: 'gerência', EDITOR: 'editor', VIEWER: 'leitor' } as const)[role]; }
