import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, FileText, Folder, GripVertical, ListChecks, MoreHorizontal, Plus, Search, Users, X } from 'lucide-react';
import { ConfirmDialog, Dialog } from '../../components/ui/Dialog';
import { api } from '../../lib/api';
import type { RequirementFolder, RequirementTemplate, WorkspaceReviewChecklist, WorkspaceRole } from '../../lib/types';
import { ProjectAccessPanel } from './AccessManagement';

type SettingsTab = 'folders' | 'templates' | 'checklist' | 'access';
type DeleteTarget = { type: 'folder' | 'template'; id: string; name: string };
const tabs: Array<{ id: SettingsTab; label: string; icon: typeof Folder }> = [
  { id: 'folders', label: 'Pastas', icon: Folder },
  { id: 'templates', label: 'Templates', icon: FileText },
  { id: 'checklist', label: 'Checklist', icon: ListChecks },
];
const isUnassignedFolder = (folder: RequirementFolder) => folder.name.trim().localeCompare('Sem pasta', 'pt-BR', { sensitivity: 'base' }) === 0;
const resizeChecklistTextarea = (element: HTMLTextAreaElement | null) => {
  if (!element) return;
  element.style.height = 'auto';
  element.style.height = `${element.scrollHeight}px`;
};
const moveListItem = <T,>(items: T[], from: number, to: number) => {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) return items;
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
};
type ChecklistPointerDrag = { pointerId: number; fromIndex: number; startY: number; targetIndex: number; moved: boolean; shiftDistance: number };
type ChecklistDragView = { index: number; offsetY: number; targetIndex: number; shiftDistance: number };

export function SettingsModal({ projectId, workspaceId, workspaceRole, canEdit, onClose, onEditTemplate }: { projectId?: string; workspaceId: string; workspaceRole: WorkspaceRole | null; canEdit: boolean; onClose: () => void; onEditTemplate: (id: string) => void }) {
  const client = useQueryClient();
  const [activeTab, setActiveTab] = useState<SettingsTab>(projectId ? 'folders' : 'templates');
  const canManageAccess = workspaceRole === 'OWNER' || workspaceRole === 'MANAGER';
  const canEditWorkspaceSettings = workspaceRole === 'OWNER';
  const visibleTabs = workspaceRole === null
    ? (projectId ? tabs.filter(tab => tab.id === 'folders') : [])
    : workspaceRole === 'MANAGER'
      ? [...tabs.filter(tab => tab.id === 'folders' && Boolean(projectId)), ...(projectId ? [{ id: 'access' as const, label: 'Acesso', icon: Users }] : [])]
      : [...tabs.filter(tab => tab.id !== 'folders' || Boolean(projectId)), ...(canManageAccess && projectId ? [{ id: 'access' as const, label: 'Acesso', icon: Users }] : [])];
  const [folderQuery, setFolderQuery] = useState('');
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(() => new Set());
  const [templateName, setTemplateName] = useState('');
  const [editingFolder, setEditingFolder] = useState<RequirementFolder | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [newChecklistItem, setNewChecklistItem] = useState('');
  const [checklistDraft, setChecklistDraft] = useState<string[]>([]);
  const [checklistDrag, setChecklistDrag] = useState<ChecklistDragView | null>(null);
  const [checklistCommittingOrder, setChecklistCommittingOrder] = useState(false);
  const [keyboardChecklistDragIndex, setKeyboardChecklistDragIndex] = useState<number | null>(null);
  const [checklistAnnouncement, setChecklistAnnouncement] = useState('');
  const checklistPointerDrag = useRef<ChecklistPointerDrag | null>(null);
  const keyboardChecklistStartItems = useRef<{ items: string[]; index: number } | null>(null);
  const checklistListRef = useRef<HTMLOListElement | null>(null);
  const tabRefs = useRef<Record<SettingsTab, HTMLButtonElement | null>>({ folders: null, templates: null, checklist: null, access: null });
  const folders = useQuery<RequirementFolder[]>({ queryKey: ['folders', projectId], queryFn: () => api(`/projects/${projectId}/folders`), enabled: Boolean(projectId) });
  const templatesQuery = useQuery<RequirementTemplate[]>({ queryKey: ['templates', workspaceId], queryFn: () => api(`/workspaces/${workspaceId}/templates`), enabled: workspaceRole !== null });
  const checklist = useQuery<WorkspaceReviewChecklist>({ queryKey: ['review-checklist', workspaceId], queryFn: () => api(`/workspaces/${workspaceId}/review-checklist`), enabled: workspaceRole !== null });

  useEffect(() => {
    if (checklist.data) setChecklistDraft(checklist.data.items);
  }, [checklist.data]);

  const updateFolder = useMutation({
    mutationFn: ({ id, name, description, parentId }: { id: string; name: string; description: string; parentId: string | null }) => api<RequirementFolder>(`/projects/${projectId!}/folders/${id}`, { method: 'PATCH', body: JSON.stringify({ name, description, parentId }) }),
    onSuccess: () => {
      setEditingFolder(null);
      client.invalidateQueries({ queryKey: ['folders', projectId] });
      client.invalidateQueries({ queryKey: ['requirements'] });
    },
  });
  const createTemplate = useMutation({
    mutationFn: () => api<RequirementTemplate>(`/workspaces/${workspaceId}/templates`, { method: 'POST', body: JSON.stringify({ name: templateName.trim(), content: { type: 'doc', content: [{ type: 'paragraph' }] } }) }),
    onSuccess: (template) => {
      setTemplateName('');
      client.invalidateQueries({ queryKey: ['templates', workspaceId] });
      onEditTemplate(template.id);
    },
  });
  const deleteItem = useMutation({
    mutationFn: (target: DeleteTarget) => api(target.type === 'folder' ? `/projects/${projectId!}/folders/${target.id}` : `/templates/${target.id}`, { method: 'DELETE' }),
    onSuccess: (_result, target) => {
      setDeleteTarget(null);
      if (target.type === 'folder') {
        client.invalidateQueries({ queryKey: ['folders', projectId] });
        client.invalidateQueries({ queryKey: ['requirements'] });
      } else {
        client.invalidateQueries({ queryKey: ['templates', workspaceId] });
      }
    },
  });
  const saveChecklist = useMutation({
    mutationFn: (items: string[]) => api<WorkspaceReviewChecklist>(`/workspaces/${workspaceId}/review-checklist`, { method: 'PUT', body: JSON.stringify({ items }) }),
    onSuccess: (saved) => client.setQueryData(['review-checklist', workspaceId], saved),
  });

  const normalizedFolderQuery = folderQuery.trim().toLocaleLowerCase('pt-BR');
  const folderTree = useMemo(() => {
    const allFolders = folders.data ?? [];
    const folderIds = new Set(allFolders.map(folder => folder.id));
    const children = new Map<string | null, RequirementFolder[]>();
    for (const folder of allFolders) {
      if (isUnassignedFolder(folder) && (folder.requirementCount ?? 0) === 0) continue;
      const parentId = folder.parentId && folderIds.has(folder.parentId) ? folder.parentId : null;
      children.set(parentId, [...(children.get(parentId) ?? []), folder]);
    }
    for (const group of children.values()) group.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }));
    const hasVisibleMatch = (folder: RequirementFolder): boolean => {
      if (!normalizedFolderQuery || folder.name.toLocaleLowerCase('pt-BR').includes(normalizedFolderQuery)) return true;
      return (children.get(folder.id) ?? []).some(hasVisibleMatch);
    };
    const roots = (children.get(null) ?? []).filter(hasVisibleMatch);
    const countVisible = (folder: RequirementFolder): number => 1 + (children.get(folder.id) ?? []).filter(hasVisibleMatch).reduce((count, child) => count + countVisible(child), 0);
    return { children, roots, count: roots.reduce((count, folder) => count + countVisible(folder), 0) };
  }, [folders.data, normalizedFolderQuery]);
  const checklistDirty = JSON.stringify(checklistDraft) !== JSON.stringify(checklist.data?.items ?? []);
  const checklistHasBlankItem = checklistDraft.some(item => !item.trim());

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const currentIndex = visibleTabs.findIndex(tab => tab.id === activeTab);
    const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? visibleTabs.length - 1 : (currentIndex + (event.key === 'ArrowRight' ? 1 : visibleTabs.length - 1)) % visibleTabs.length;
    const nextTab = visibleTabs[nextIndex].id;
    setActiveTab(nextTab);
    tabRefs.current[nextTab]?.focus();
  };

  const toggleExpanded = (id: string) => setExpandedFolders(current => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  const renderFolder = (folder: RequirementFolder, depth = 0): ReactNode => {
    const children = folderTree.children.get(folder.id) ?? [];
    const filteredChildren = children.filter(child => {
      if (!normalizedFolderQuery) return true;
      const matchesBranch = (node: RequirementFolder): boolean => node.name.toLocaleLowerCase('pt-BR').includes(normalizedFolderQuery) || (folderTree.children.get(node.id) ?? []).some(matchesBranch);
      return matchesBranch(child);
    });
    const hasChildren = filteredChildren.length > 0;
    const expanded = normalizedFolderQuery ? true : expandedFolders.has(folder.id);
    return <li className="settings-tree-node" key={folder.id}>
      <div className={`settings-folder-card ${hasChildren ? 'has-children' : 'no-children'}`} style={{ '--folder-depth': depth } as CSSProperties}>
        {hasChildren && <span className="settings-tree-toggle-slot">
          <button type="button" className="settings-tree-toggle" onClick={() => toggleExpanded(folder.id)} aria-label={`${expanded ? 'Recolher' : 'Expandir'} ${folder.name}`} aria-expanded={expanded}>
            {expanded ? <ChevronDown size={16}/> : <ChevronRight size={16}/>}
          </button>
        </span>}
        <Folder size={17} className="settings-folder-icon" aria-hidden="true"/>
        <span className="settings-folder-name"><strong title={folder.name}>{folder.name}</strong>{folder.description && <small title={folder.description}>{folder.description}</small>}</span>
        <span className="settings-folder-count">{folder.requirementCount ?? 0} US</span>
        {!isUnassignedFolder(folder) && canEdit && <details className="settings-actions-menu" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) event.currentTarget.open = false; }} onKeyDown={event => { if (event.key === 'Escape') { event.currentTarget.open = false; event.currentTarget.querySelector('summary')?.focus(); } }}>
          <summary aria-label={`Ações da pasta ${folder.name}`}><MoreHorizontal size={18}/></summary>
          <div className="settings-actions-popover">
            <button type="button" onClick={(event) => { event.currentTarget.closest('details')?.removeAttribute('open'); setEditingFolder(folder); updateFolder.reset(); }}>Editar</button>
            <button type="button" className="is-danger" onClick={(event) => { event.currentTarget.closest('details')?.removeAttribute('open'); setDeleteTarget({ type: 'folder', id: folder.id, name: folder.name }); deleteItem.reset(); }}>Excluir</button>
          </div>
        </details>}
      </div>
      {expanded && hasChildren && <ul className="settings-tree-children">{filteredChildren.map(child => renderFolder(child, depth + 1))}</ul>}
    </li>;
  };

  const addChecklistItem = () => {
    const item = newChecklistItem.trim();
    if (!item || checklistDraft.length >= 100) return;
    setChecklistDraft(current => [...current, item]);
    setNewChecklistItem('');
  };

  const handleChecklistKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      return;
    }
    if (event.key === 'Escape' && keyboardChecklistDragIndex !== null) {
      event.preventDefault();
      const start = keyboardChecklistStartItems.current;
      if (start) setChecklistDraft(start.items);
      keyboardChecklistStartItems.current = null;
      setKeyboardChecklistDragIndex(null);
      setChecklistAnnouncement('Movimentação cancelada. A ordem original foi restaurada.');
      focusChecklistHandle(start?.index ?? index);
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (keyboardChecklistDragIndex === null) {
        keyboardChecklistStartItems.current = { items: [...checklistDraft], index };
        setKeyboardChecklistDragIndex(index);
        setChecklistAnnouncement(`Item ${index + 1} selecionado. Use as setas para cima e para baixo e pressione Enter para soltar.`);
      } else if (keyboardChecklistDragIndex === index) {
        keyboardChecklistStartItems.current = null;
        setKeyboardChecklistDragIndex(null);
        setChecklistAnnouncement(`Item solto na posição ${index + 1}.`);
      }
      return;
    }
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    event.preventDefault();
    const fromIndex = keyboardChecklistDragIndex ?? index;
    const targetIndex = Math.max(0, Math.min(checklistDraft.length - 1, fromIndex + (event.key === 'ArrowUp' ? -1 : 1)));
    if (targetIndex === fromIndex) return;
    setChecklistDraft(items => moveListItem(items, fromIndex, targetIndex));
    if (keyboardChecklistDragIndex !== null) setKeyboardChecklistDragIndex(targetIndex);
    setChecklistAnnouncement(`Item movido para a posição ${targetIndex + 1}.`);
    focusChecklistHandle(targetIndex);
  };

  const focusChecklistHandle = (index: number) => {
    requestAnimationFrame(() => checklistListRef.current?.querySelector<HTMLButtonElement>(`[data-checklist-index="${index}"] .settings-checklist-drag-handle`)?.focus());
  };

  const startChecklistDrag = (event: ReactPointerEvent<HTMLButtonElement>, index: number) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const row = event.currentTarget.closest<HTMLElement>('.settings-checklist-item');
    const listGap = checklistListRef.current ? Number.parseFloat(window.getComputedStyle(checklistListRef.current).rowGap) || 7 : 7;
    checklistPointerDrag.current = { pointerId: event.pointerId, fromIndex: index, startY: event.clientY, targetIndex: index, moved: false, shiftDistance: (row?.getBoundingClientRect().height ?? 0) + listGap };
  };

  const moveChecklistDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = checklistPointerDrag.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const offsetY = event.clientY - drag.startY;
    if (!drag.moved && Math.abs(offsetY) < 4) return;
    const scrollPanel = checklistListRef.current?.closest<HTMLElement>('.settings-panel-scroll');
    if (scrollPanel) {
      const bounds = scrollPanel.getBoundingClientRect();
      if (event.clientY < bounds.top + 40) scrollPanel.scrollTop -= 12;
      else if (event.clientY > bounds.bottom - 40) scrollPanel.scrollTop += 12;
    }
    const items = Array.from(checklistListRef.current?.querySelectorAll<HTMLElement>('[data-checklist-index]') ?? []);
    const targetIndex = Math.max(0, Math.min(items.length - 1, items.reduce((position, item, itemIndex) => {
      if (itemIndex === drag.fromIndex) return position;
      const bounds = item.getBoundingClientRect();
      return event.clientY > bounds.top + bounds.height / 2 ? position + 1 : position;
    }, 0)));
    checklistPointerDrag.current = { ...drag, targetIndex, moved: true };
    setChecklistDrag({ index: drag.fromIndex, offsetY, targetIndex, shiftDistance: drag.shiftDistance });
  };

  const finishChecklistDrag = (event: ReactPointerEvent<HTMLButtonElement>, cancelled = false) => {
    const drag = checklistPointerDrag.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    checklistPointerDrag.current = null;
    if (!cancelled && drag.moved && drag.targetIndex !== drag.fromIndex) {
      setChecklistDraft(items => moveListItem(items, drag.fromIndex, drag.targetIndex));
      setChecklistCommittingOrder(true);
      requestAnimationFrame(() => requestAnimationFrame(() => setChecklistCommittingOrder(false)));
      setChecklistAnnouncement(`Item movido para a posição ${drag.targetIndex + 1}.`);
    }
    setChecklistDrag(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !updateFolder.isPending && !deleteItem.isPending && !saveChecklist.isPending) onClose(); }}>
    <section className="modal-card settings-modal settings-tabs-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">
      <header className="modal-header"><div><p className="section-kicker">Projeto</p><h2 id="settings-title">Configurações</h2></div><button type="button" className="icon-button" onClick={onClose} aria-label="Fechar configurações" disabled={updateFolder.isPending || deleteItem.isPending || saveChecklist.isPending}><X size={16}/></button></header>
      <div className="settings-tabs" role="tablist" aria-label="Seções das configurações">
        {visibleTabs.map(({ id, label, icon: TabIcon }) => <button key={id} ref={node => { tabRefs.current[id] = node; }} type="button" role="tab" id={`settings-tab-${id}`} aria-controls={`settings-panel-${id}`} aria-selected={activeTab === id} tabIndex={activeTab === id ? 0 : -1} className={activeTab === id ? 'active' : ''} onClick={() => setActiveTab(id)} onKeyDown={handleTabKeyDown}><TabIcon size={15} aria-hidden="true"/><span>{label}</span></button>)}
      </div>

      <div className="settings-panel-scroll">
        <section id="settings-panel-folders" role="tabpanel" aria-labelledby="settings-tab-folders" tabIndex={0} hidden={activeTab !== 'folders'}>
          <div className="settings-panel-heading"><div><h3>Pastas</h3><p>Organize as User Stories deste projeto.</p></div><span>{folderTree.count}</span></div>
          <label className="settings-search"><Search size={16} aria-hidden="true"/><input type="search" value={folderQuery} onChange={event => setFolderQuery(event.target.value)} placeholder="Buscar pastas" aria-label="Buscar pastas"/></label>
          {folders.isLoading && <p className="empty-copy">Carregando pastas…</p>}
          {folders.isError && <div className="inline-error" role="alert">Não foi possível carregar as pastas: {folders.error.message}<button type="button" className="text-button" onClick={() => folders.refetch()}>Tentar novamente</button></div>}
          {!folders.isLoading && !folders.isError && <ul className="settings-tree-list">{folderTree.roots.map(folder => renderFolder(folder))}</ul>}
          {!folders.isLoading && !folders.isError && folderTree.roots.length === 0 && <div className="settings-empty-state"><Folder size={20}/><strong>{normalizedFolderQuery ? 'Nenhuma pasta encontrada' : 'Nenhuma pasta cadastrada'}</strong><span>{normalizedFolderQuery ? 'Tente buscar por outro nome.' : 'Crie uma pasta para começar a organizar as US.'}</span></div>}
        </section>

        <section id="settings-panel-templates" role="tabpanel" aria-labelledby="settings-tab-templates" tabIndex={0} hidden={workspaceRole === null || activeTab !== 'templates'}>
          <div className="settings-panel-heading"><div><h3>Templates</h3><p>Templates são aplicados ao criar uma nova US.</p></div><span>{templatesQuery.data?.length ?? 0}</span></div>
          {canEditWorkspaceSettings && <form className="settings-create settings-template-create" onSubmit={event => { event.preventDefault(); if (templateName.trim()) createTemplate.mutate(); }}><input value={templateName} onChange={event => setTemplateName(event.target.value)} maxLength={120} placeholder="Nome do novo template" aria-label="Nome do novo template"/><button type="submit" className="primary-button" disabled={!templateName.trim() || createTemplate.isPending}>{createTemplate.isPending ? 'Criando…' : <><Plus size={15}/> Criar template</>}</button></form>}
          {createTemplate.error && <div className="inline-error" role="alert">{createTemplate.error.message}</div>}
          {templatesQuery.isLoading && <p className="empty-copy">Carregando templates…</p>}
          {templatesQuery.isError && <div className="inline-error" role="alert">Não foi possível carregar os templates: {templatesQuery.error.message}<button type="button" className="text-button" onClick={() => templatesQuery.refetch()}>Tentar novamente</button></div>}
          {!templatesQuery.isLoading && !templatesQuery.isError && <div className="settings-template-grid">{(templatesQuery.data ?? []).map(template => <article className="settings-template-card" key={template.id}><span className="settings-template-icon"><FileText size={18}/></span><div className="settings-template-copy"><strong>{template.name}</strong><p>{template.description || 'Documento reutilizável para novas User Stories.'}</p></div><details className="settings-actions-menu" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) event.currentTarget.open = false; }} onKeyDown={event => { if (event.key === 'Escape') { event.currentTarget.open = false; event.currentTarget.querySelector('summary')?.focus(); } }}><summary aria-label={`Ações do template ${template.name}`}><MoreHorizontal size={18}/></summary><div className="settings-actions-popover"><button type="button" onClick={(event) => { event.currentTarget.closest('details')?.removeAttribute('open'); onEditTemplate(template.id); }}>{canEditWorkspaceSettings ? 'Editar' : 'Visualizar'}</button>{canEditWorkspaceSettings && <button type="button" className="is-danger" onClick={(event) => { event.currentTarget.closest('details')?.removeAttribute('open'); setDeleteTarget({ type: 'template', id: template.id, name: template.name }); deleteItem.reset(); }}>Excluir</button>}</div></details></article>)}</div>}
          {!templatesQuery.isLoading && !templatesQuery.isError && templatesQuery.data?.length === 0 && <div className="settings-empty-state"><FileText size={20}/><strong>Nenhum template criado</strong><span>Crie um template para padronizar novas User Stories.</span></div>}
        </section>

        <section id="settings-panel-checklist" role="tabpanel" aria-labelledby="settings-tab-checklist" tabIndex={0} hidden={workspaceRole === null || activeTab !== 'checklist'}>
          <div className="settings-panel-heading"><div><h3>Checklist de revisão</h3><p>Itens para revisar a qualidade das User Stories deste workspace.</p></div><span>{checklistDraft.length}</span></div>
          {canEditWorkspaceSettings && <form className="settings-create checklist-create" onSubmit={(event: FormEvent) => { event.preventDefault(); addChecklistItem(); }}><input value={newChecklistItem} onChange={event => setNewChecklistItem(event.target.value)} maxLength={1000} placeholder="Adicionar item ao checklist" aria-label="Novo item do checklist"/><button type="submit" className="secondary-button" disabled={!newChecklistItem.trim() || checklistDraft.length >= 100}><Plus size={15}/> Adicionar</button></form>}
          {checklist.isLoading && <p className="empty-copy">Carregando checklist…</p>}
          {checklist.isError && <div className="inline-error" role="alert">Não foi possível carregar o checklist: {checklist.error.message}<button type="button" className="text-button" onClick={() => checklist.refetch()}>Tentar novamente</button></div>}
          {!checklist.isLoading && <ol className={`settings-checklist${checklistCommittingOrder ? ' is-committing-order' : ''}`} ref={checklistListRef} onDragStart={event => event.preventDefault()}>{checklistDraft.map((item, index) => {
            const dropMarker = checklistDrag ? checklistDrag.targetIndex >= checklistDrag.index ? checklistDrag.targetIndex + 1 : checklistDrag.targetIndex : -1;
            const markerBefore = dropMarker === index;
            const markerAfter = dropMarker === checklistDraft.length && index === checklistDraft.length - 1;
            const isDragged = checklistDrag?.index === index;
            const shiftUp = checklistDrag && checklistDrag.targetIndex > checklistDrag.index && index > checklistDrag.index && index <= checklistDrag.targetIndex;
            const shiftDown = checklistDrag && checklistDrag.targetIndex < checklistDrag.index && index >= checklistDrag.targetIndex && index < checklistDrag.index;
            const shift = shiftUp ? -checklistDrag.shiftDistance : shiftDown ? checklistDrag.shiftDistance : 0;
            const style = isDragged
              ? { '--checklist-drag-offset': `${checklistDrag.offsetY}px` } as CSSProperties
              : shift ? { '--checklist-sibling-shift': `${shift}px` } as CSSProperties : undefined;
            const occurrence = checklistDraft.slice(0, index).filter(value => value === item).length;
            return <li data-checklist-index={index} className={`settings-checklist-item${isDragged ? ' is-dragging' : ''}${shift ? ' is-shifting' : ''}${keyboardChecklistDragIndex === index ? ' is-keyboard-dragging' : ''}${markerBefore ? ' is-drop-target' : ''}${markerAfter ? ' is-drop-after' : ''}`} style={style} key={`${item}:${occurrence}`}><span className="settings-checklist-index">{index + 1}</span><textarea ref={resizeChecklistTextarea} rows={1} value={item} disabled={!canEditWorkspaceSettings} maxLength={1000} aria-label={`Item ${index + 1} do checklist`} onChange={event => { const text = event.currentTarget.value; resizeChecklistTextarea(event.currentTarget); setChecklistDraft(current => current.map((value, itemIndex) => itemIndex === index ? text : value)); }}/>{canEditWorkspaceSettings && <div className="settings-checklist-actions"><button type="button" className="icon-button settings-checklist-drag-handle" aria-label={`Reordenar item ${index + 1}; pressione Enter e use as setas para mover`} aria-keyshortcuts="Enter ArrowUp ArrowDown Escape" onKeyDown={event => handleChecklistKeyDown(event, index)} onPointerDown={event => startChecklistDrag(event, index)} onPointerMove={moveChecklistDrag} onPointerUp={event => finishChecklistDrag(event)} onPointerCancel={event => finishChecklistDrag(event, true)} onLostPointerCapture={event => finishChecklistDrag(event, true)}><GripVertical size={16}/></button><button type="button" className="icon-button settings-remove-item" aria-label={`Remover item ${index + 1}`} onClick={() => setChecklistDraft(current => current.filter((_value, itemIndex) => itemIndex !== index))}><X size={15}/></button></div>}</li>;
          })}</ol>}
          <span className="settings-sr-only" aria-live="polite" aria-atomic="true">{checklistAnnouncement}</span>
          {!checklist.isLoading && checklistDraft.length === 0 && <div className="settings-empty-state"><ListChecks size={20}/><strong>Checklist vazio</strong><span>Adicione as verificações que devem fazer parte da revisão.</span></div>}
          {saveChecklist.error && <div className="inline-error" role="alert">Não foi possível salvar o checklist: {saveChecklist.error.message}</div>}
        </section>

        {canManageAccess && projectId && activeTab === 'access' && <section id="settings-panel-access" role="tabpanel" aria-labelledby="settings-tab-access" tabIndex={0}>
          <div className="settings-panel-heading"><div><h3>Acesso ao projeto</h3><p>Gerencie membros, convites e pedidos deste projeto.</p></div></div>
          <ProjectAccessPanel projectId={projectId} managerMode={workspaceRole === 'MANAGER'}/>
        </section>}
      </div>
      <footer className="modal-footer settings-modal-footer"><span role={activeTab === 'checklist' && (checklistDirty || saveChecklist.isSuccess) ? 'status' : undefined}>{activeTab === 'checklist' ? checklistDirty ? 'Há alterações não salvas.' : saveChecklist.isSuccess ? 'Checklist salvo.' : '' : ''}</span><div>{activeTab === 'checklist' && canEditWorkspaceSettings && <button type="button" className="primary-button" disabled={!checklistDirty || checklistHasBlankItem || saveChecklist.isPending} onClick={() => saveChecklist.mutate(checklistDraft.map(item => item.trim()))}>{saveChecklist.isPending ? 'Salvando…' : 'Salvar checklist'}</button>}<button type="button" className="secondary-button" onClick={onClose} disabled={updateFolder.isPending || deleteItem.isPending || saveChecklist.isPending}>Concluir</button></div></footer>
    </section>

    {editingFolder && <EditFolderDialog folder={editingFolder} folders={folders.data ?? []} pending={updateFolder.isPending} error={updateFolder.error?.message} onCancel={() => { setEditingFolder(null); updateFolder.reset(); }} onSave={(name, description, parentId) => updateFolder.mutate({ id: editingFolder.id, name, description, parentId })}/>}
    {deleteTarget && <ConfirmDialog title={deleteTarget.type === 'folder' ? 'Excluir pasta?' : 'Excluir template?'} description={<>{deleteTarget.type === 'folder' ? <>A pasta <strong>{deleteTarget.name}</strong> será excluída e as User Stories vinculadas serão movidas para <strong>Sem pasta</strong>. Subpastas precisam ser movidas ou excluídas antes.</> : <>O template <strong>{deleteTarget.name}</strong> será excluído. As User Stories já criadas não serão alteradas.</>}{deleteItem.error && <span className="inline-error" role="alert">{deleteItem.error.message}</span>}</>} confirmLabel={deleteTarget.type === 'folder' ? 'Excluir pasta' : 'Excluir template'} pending={deleteItem.isPending} onCancel={() => { setDeleteTarget(null); deleteItem.reset(); }} onConfirm={() => deleteItem.mutate(deleteTarget)}/>}
  </div>;
}

function EditFolderDialog({ folder, folders, pending, error, onCancel, onSave }: { folder: RequirementFolder; folders: RequirementFolder[]; pending: boolean; error?: string; onCancel: () => void; onSave: (name: string, description: string, parentId: string | null) => void }) {
  const [name, setName] = useState(folder.name);
  const [description, setDescription] = useState(folder.description ?? '');
  const [parentId, setParentId] = useState(folder.parentId ?? '');
  const descendants = new Set<string>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const candidate of folders) {
      if (candidate.parentId === folder.id || (candidate.parentId && descendants.has(candidate.parentId))) {
        if (!descendants.has(candidate.id)) { descendants.add(candidate.id); changed = true; }
      }
    }
  }
  const parentOptions = folders.filter(candidate => candidate.id !== folder.id && !descendants.has(candidate.id) && !isUnassignedFolder(candidate));
  return <Dialog title="Editar pasta" onClose={onCancel} closeDisabled={pending} className="settings-edit-dialog">
    <form onSubmit={(event) => { event.preventDefault(); if (name.trim()) onSave(name.trim(), description.trim(), parentId || null); }}>
      <div className="modal-fields"><label>Nome da pasta<input autoFocus required maxLength={120} value={name} onChange={event => setName(event.target.value)}/></label><label>Descrição<input maxLength={500} value={description} onChange={event => setDescription(event.target.value)} placeholder="Descrição (opcional)"/></label><label>Pasta pai<select value={parentId} onChange={event => setParentId(event.target.value)}><option value="">Nível principal</option>{parentOptions.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}</select></label>{error && <div className="inline-error" role="alert">{error}</div>}</div>
      <footer className="modal-footer"><div><button type="button" className="secondary-button" onClick={onCancel} disabled={pending}>Cancelar</button><button type="submit" className="primary-button" disabled={!name.trim() || pending}>{pending ? 'Salvando…' : 'Salvar alterações'}</button></div></footer>
    </form>
  </Dialog>;
}
