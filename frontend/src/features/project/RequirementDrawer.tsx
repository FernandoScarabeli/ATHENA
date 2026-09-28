import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ChevronDown, Crosshair, Database, FileText, Link2, MoreHorizontal, Plus } from 'lucide-react';
import { Icon } from '../../components/Icon';
import { ConfirmDialog } from '../../components/ui/Dialog';
import { api } from '../../lib/api';
import type { Requirement, RequirementFolder, RequirementRelation } from '../../lib/types';
import { RequirementSearch } from './RequirementSearch';
import { relationDetails, relationKind, relationKinds, relationWrite, type RelationKind } from './relationSemantics';
import './requirementRelations.css';
const requirementTime = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });
const requirementDate = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });

function formatRequirementDateTime(value?: string) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : `${requirementTime.format(date)} - ${requirementDate.format(date)}`;
}

function formatRequirementSource(source: string) {
  if (source === 'INTEGRATION:GOOGLE') return 'Google Drive';
  return source;
}

function focusRelationTrigger(container: HTMLDivElement | null, relationId: string) {
  [...(container?.querySelectorAll<HTMLButtonElement>('.relation-actions-trigger') ?? [])]
    .find((button) => button.dataset.relationId === relationId)?.focus();
}

export function RequirementDrawer({ requirement, folders = [], projectRequirements = [], visibleRequirementIds, projectRequirementsLoading = false, projectRequirementsError, onRetryProjectRequirements, canEdit = false, closing = false, onClose, onCloseComplete, onSelect, onFocus, onEdit }: { requirement: Requirement; folders?: RequirementFolder[]; projectRequirements?: Requirement[]; visibleRequirementIds?: ReadonlySet<string>; projectRequirementsLoading?: boolean; projectRequirementsError?: Error | null; onRetryProjectRequirements?: () => void; canEdit?: boolean; closing?: boolean; onClose: () => void; onCloseComplete?: () => void; onSelect: (id: string) => void; onFocus?: () => void; onEdit?: () => void }) {
  const client = useQueryClient();
  const relations = useQuery<RequirementRelation[]>({ queryKey: ['relations', requirement.id], queryFn: () => api(`/requirements/${requirement.id}/relations`) });
  const [targetId, setTargetId] = useState('');
  const [chosenKind, setChosenKind] = useState<RelationKind | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [relationToRemove, setRelationToRemove] = useState<RequirementRelation | null>(null);
  const [openRelationMenuId, setOpenRelationMenuId] = useState<string | null>(null);
  const relationMenuRef = useRef<HTMLDivElement>(null);
  const folderPickerRef = useRef<HTMLDivElement>(null);
  const folderTriggerRef = useRef<HTMLButtonElement>(null);
  const folderOptionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [folderMenuOpen, setFolderMenuOpen] = useState(false);
  const [activeFolderIndex, setActiveFolderIndex] = useState(0);
  const [openSection, setOpenSection] = useState<'criteria' | 'relations' | 'metadata' | null>(null);
  const moveFolder = useMutation({ mutationFn: (folderId: string) => api<Requirement>(`/requirements/${requirement.id}`, { method: 'PATCH', body: JSON.stringify({ revision: requirement.revision, folderId }) }), onSuccess: async (saved) => {
    client.setQueryData<Requirement[]>(['requirements', requirement.projectId], (current) => current?.map((item) => item.id === saved.id ? saved : item));
    client.setQueryData<Requirement>(['requirement', requirement.id], saved);
    await Promise.all([client.invalidateQueries({ queryKey: ['requirements', requirement.projectId] }), client.invalidateQueries({ queryKey: ['graph', requirement.projectId] })]);
  } });
  const invalidateRelationQueries = async (ids: string[]) => Promise.all([...new Set(ids)].map((id) => client.invalidateQueries({ queryKey: ['relations', id] })));
  const createRelation = useMutation({ mutationFn: () => {
    if (!chosenKind || !targetId) throw new Error('Escolha uma US e uma relação.');
    const choice = relationWrite(chosenKind);
    const currentIsSource = choice.direction === 'CURRENT_TO_OTHER';
    return api<RequirementRelation>(`/requirements/${currentIsSource ? requirement.id : targetId}/relations`, { method: 'POST', body: JSON.stringify({ targetId: currentIsSource ? targetId : requirement.id, type: choice.type }) });
  }, onSuccess: async (relation) => { setTargetId(''); setChosenKind(null); setComposerOpen(false); createRelation.reset(); await Promise.all([invalidateRelationQueries([relation.sourceId, relation.targetId]), client.invalidateQueries({ queryKey: ['graph', requirement.projectId] })]); } });
  const updateRelation = useMutation({ mutationFn: ({ id, kind }: { id: string; kind: RelationKind }) => {
    const choice = relationWrite(kind);
    return api<RequirementRelation>(`/requirements/${requirement.id}/relations/${id}`, { method: 'PATCH', body: JSON.stringify(choice.type === 'RELATED_TO' ? { type: choice.type } : choice) });
  }, onSuccess: async (relation, variables) => { focusRelationTrigger(relationMenuRef.current, variables.id); setOpenRelationMenuId(null); updateRelation.reset(); await Promise.all([invalidateRelationQueries([relation.sourceId, relation.targetId]), client.invalidateQueries({ queryKey: ['graph', requirement.projectId] })]); } });
  const removeRelation = useMutation({ mutationFn: (relationId: string) => api<RequirementRelation>(`/requirements/${requirement.id}/relations/${relationId}`, { method: 'DELETE' }), onSuccess: async (relation) => { removeRelation.reset(); await Promise.all([invalidateRelationQueries([relation.sourceId, relation.targetId]), client.invalidateQueries({ queryKey: ['graph', requirement.projectId] })]); } });
  const visibleRelations = relations.data?.filter((relation) => {
    if (!visibleRequirementIds) return true;
    const otherId = relation.sourceId === requirement.id ? relation.targetId : relation.sourceId;
    return visibleRequirementIds.has(otherId);
  });
  const relatedIds = new Set((relations.data ?? []).flatMap((relation) => [relation.sourceId, relation.targetId]));
  const excludedRequirementIds = new Set([...relatedIds, requirement.id]);
  const chosenTarget = projectRequirements.find((item) => item.id === targetId);
  const relationCountByOther = new Map<string, number>();
  (visibleRelations ?? []).forEach((relation) => {
    const otherId = relation.sourceId === requirement.id ? relation.targetId : relation.sourceId;
    relationCountByOther.set(otherId, (relationCountByOther.get(otherId) ?? 0) + 1);
  });
  const hasLegacyMultiples = [...relationCountByOther.values()].some((count) => count > 1);
  const currentFolderIndex = folders.findIndex((folder) => folder.id === requirement.folderId);
  const folderOptionLabel = (folder: RequirementFolder) => {
    const names = [folder.name];
    const byId = new Map(folders.map((item) => [item.id, item]));
    let parentId = folder.parentId;
    const seen = new Set([folder.id]);
    while (parentId && byId.has(parentId) && !seen.has(parentId)) {
      seen.add(parentId);
      const parent = byId.get(parentId)!;
      names.unshift(parent.name);
      parentId = parent.parentId;
    }
    return names.join(' / ');
  };
  const closeFolderMenu = (restoreFocus = false) => {
    setFolderMenuOpen(false);
    if (restoreFocus) folderTriggerRef.current?.focus();
  };
  const chooseFolder = (folderId: string) => {
    if (folderId !== requirement.folderId && !moveFolder.isPending) moveFolder.mutate(folderId);
    closeFolderMenu(true);
  };
  const removeOther = relationToRemove && (relationToRemove.sourceId === requirement.id ? relationToRemove.target : relationToRemove.source);
  const removeSentence = relationToRemove && removeOther
    ? relationDetails(relationKind(relationToRemove.type, relationToRemove.sourceId, relationToRemove.targetId, requirement.id), requirement.code, removeOther.code).sentence
    : '';
  useEffect(() => {
    setTargetId('');
    setChosenKind(null);
    setComposerOpen(false);
    setOpenRelationMenuId(null);
    createRelation.reset();
    updateRelation.reset();
    removeRelation.reset();
    moveFolder.reset();
    setFolderMenuOpen(false);
  }, [requirement.id]);
  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key !== 'Escape' || closing) return; if (openRelationMenuId) { focusRelationTrigger(relationMenuRef.current, openRelationMenuId); setOpenRelationMenuId(null); event.stopImmediatePropagation(); return; } onClose(); };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [closing, onClose, openRelationMenuId]);
  useEffect(() => {
    if (!openRelationMenuId) return;
    const closeOutside = (event: PointerEvent) => { if (!relationMenuRef.current?.contains(event.target as Node)) setOpenRelationMenuId(null); };
    document.addEventListener('pointerdown', closeOutside);
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, [openRelationMenuId]);
  useEffect(() => {
    if (!folderMenuOpen) return;
    const closeOutside = (event: PointerEvent) => { if (!folderPickerRef.current?.contains(event.target as Node)) setFolderMenuOpen(false); };
    document.addEventListener('pointerdown', closeOutside);
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, [folderMenuOpen]);
  useEffect(() => {
    if (folderMenuOpen) folderOptionRefs.current[activeFolderIndex]?.focus();
  }, [activeFolderIndex, folderMenuOpen]);

  return (
    <>
    <aside className={`details-panel ${closing ? 'drawer-exiting' : 'drawer-entering'}`} aria-label={`Detalhes de ${requirement.code}`} aria-hidden={closing} inert={closing || undefined} onAnimationEnd={event => { if (event.target === event.currentTarget && event.animationName === 'details-drawer-exit' && closing) onCloseComplete?.(); }}>
      <div className="drawer-content">
        <header className="panel-header"><div><span className="drawer-code">{requirement.code}</span><h2>{requirement.title}</h2></div><button className="icon-button" onClick={onClose} aria-label="Fechar detalhes"><Icon name="close" size={16}/></button></header>
        <div className="type-row requirement-meta-row"><span>Versão: {requirement.revision}</span><span>Última modificação: <time dateTime={requirement.updatedAt}>{formatRequirementDateTime(requirement.updatedAt)}</time></span></div>

        <AccordionSection id="drawer-relations" icon={<Link2 size={22}/>} title="Relações" count={visibleRelations?.length ?? 0} open={openSection === 'relations'} onToggle={() => setOpenSection((current) => current === 'relations' ? null : 'relations')}>
        {relations.isLoading && <p className="empty-copy">Carregando relações…</p>}
        {relations.isError && <div className="compact-error" role="alert">{relations.error.message}</div>}
        {relations.data?.length === 0 && !relations.isLoading && <p className="empty-copy relation-empty">Ainda não há relações nesta US.</p>}
        {relations.data && relations.data.length > 0 && visibleRelations?.length === 0 && <p className="empty-copy relation-empty">Nenhuma relação desta US aparece no mapa atual.</p>}
        {hasLegacyMultiples && <p className="relation-legacy-notice" role="status">Algumas US têm mais de uma relação antiga. Todos os fluxos aparecem no mapa; mantenha apenas a relação desejada para cada par.</p>}
        <div className="relation-list" ref={relationMenuRef}>
          {visibleRelations?.map((relation) => {
            const other = relation.sourceId === requirement.id ? relation.target : relation.source;
            const currentKind = relationKind(relation.type, relation.sourceId, relation.targetId, requirement.id);
            const meaning = relationDetails(currentKind, requirement.code, other.code);
            const multipleCount = relationCountByOther.get(other.id) ?? 1;
            return <div className="relation-row" key={relation.id}>
              <button type="button" className="relation-row-link" aria-label={`Abrir ${other.code} ${other.title}`} onClick={() => onSelect(other.id)}>
                <Link2 size={16} aria-hidden="true"/><span><strong>{other.code} · {other.title}</strong><small className="relation-row-meaning"><b>{meaning.title}</b><span>{meaning.sentence}</span></small>{multipleCount > 1 && <em className="relation-legacy-badge">{multipleCount} relações com esta US</em>}</span>
              </button>
              {canEdit && <div className="relation-actions"><button type="button" className="relation-actions-trigger" data-relation-id={relation.id} aria-label={`Ações da relação com ${other.code}`} aria-expanded={openRelationMenuId === relation.id} aria-controls={`relation-menu-${relation.id}`} disabled={updateRelation.isPending || removeRelation.isPending} onClick={() => setOpenRelationMenuId((open) => open === relation.id ? null : relation.id)}><MoreHorizontal size={18}/></button>
                {openRelationMenuId === relation.id && <div className="relation-actions-menu" id={`relation-menu-${relation.id}`} aria-label={`Ações da relação com ${other.code}`}>
                  <span>Relação entre {requirement.code} e {other.code}</span>
                  {relationKinds.map((kind) => {
                    const selectedChoice = currentKind === kind;
                    const details = relationDetails(kind, requirement.code, other.code);
                    return <button key={kind} type="button" className={selectedChoice ? 'selected' : ''} aria-pressed={selectedChoice} disabled={selectedChoice || updateRelation.isPending} onClick={() => updateRelation.mutate({ id: relation.id, kind })}><span className="relation-choice-copy"><strong>{details.title}</strong><small>{details.sentence}</small></span>{selectedChoice && <Check size={14} aria-hidden="true"/>}</button>;
                  })}
                  <div className="relation-menu-divider"/>
                  <button type="button" className="danger" disabled={removeRelation.isPending} onClick={() => { setOpenRelationMenuId(null); setRelationToRemove(relation); }}>Remover relação</button>
                </div>}
              </div>}
            </div>;
          })}
        </div>
        {(updateRelation.error || removeRelation.error) && <div className="inline-error" role="alert">{updateRelation.error?.message ?? removeRelation.error?.message}</div>}
        {canEdit && <>
          <button type="button" className="relation-composer-trigger" aria-label={composerOpen ? 'Cancelar criação da relação' : 'Conectar relação'} aria-expanded={composerOpen} aria-controls="relation-composer" onClick={() => { setComposerOpen((open) => !open); setTargetId(''); setChosenKind(null); createRelation.reset(); }}><Plus size={18}/>{composerOpen ? 'Cancelar' : 'Conectar relação'}</button>
          {composerOpen && <form id="relation-composer" className="relation-form" aria-label="Criar relação" onSubmit={(event) => { event.preventDefault(); if (chosenTarget && chosenKind && !createRelation.isPending) createRelation.mutate(); }}>
          <RequirementSearch requirements={projectRequirements} excludedIds={excludedRequirementIds} selectedId={targetId} loading={projectRequirementsLoading} error={projectRequirementsError} onRetry={onRetryProjectRequirements} onSelect={(id) => { setTargetId(id); setChosenKind(null); }}/>
          {chosenTarget ? <fieldset className="relation-type-picker"><legend>Como {requirement.code} e {chosenTarget.code} se relacionam?</legend><div>{relationKinds.map((kind) => { const details = relationDetails(kind, requirement.code, chosenTarget.code); return <label key={kind} className={chosenKind === kind ? 'selected' : ''}><input type="radio" name="requirement-relation-type" value={kind} checked={chosenKind === kind} disabled={createRelation.isPending} onChange={() => setChosenKind(kind)}/><span className="relation-choice-copy"><strong>{details.title}</strong><small>{details.sentence}</small></span></label>; })}</div></fieldset> : <p className="relation-select-prompt">Escolha outra US para ver os cinco tipos de relação.</p>}
          {createRelation.error && <div className="inline-error" role="alert">{createRelation.error.message}</div>}
          <button className="primary-button relation-submit" type="submit" disabled={!chosenTarget || !chosenKind || createRelation.isPending || projectRequirementsLoading}>{createRelation.isPending ? 'Criando relação…' : 'Criar relação'}</button>
          </form>}
        </>}
        </AccordionSection>

        <AccordionSection id="drawer-criteria" icon={<FileText size={21}/>} title="Critérios de aceite" count={requirement.criteria.length} open={openSection === 'criteria'} onToggle={() => setOpenSection((current) => current === 'criteria' ? null : 'criteria')}>
          {requirement.criteria.length ? <ol className="criteria-list">{requirement.criteria.map((criterion, index) => <li key={criterion.id ?? index}>{criterion.title && <strong>{criterion.title}: </strong>}{criterion.given || criterion.whenText || criterion.thenText ? <>Dado {criterion.given || '—'}, quando {criterion.whenText || '—'}, então {criterion.thenText || criterion.text || '—'}.</> : criterion.text}</li>)}</ol> : <p className="empty-copy">Nenhum critério cadastrado.</p>}
        </AccordionSection>

        <AccordionSection id="drawer-metadata" icon={<Database size={21}/>} title="Origem" open={openSection === 'metadata'} onToggle={() => setOpenSection((current) => current === 'metadata' ? null : 'metadata')}>
          <div className="metadata-grid origin-metadata-grid"><div className="origin-folder-field"><span className="origin-folder-caption">Pasta</span>{canEdit ? <div className="origin-folder-picker" ref={folderPickerRef}><button ref={folderTriggerRef} type="button" className="origin-folder-trigger" aria-haspopup="listbox" aria-expanded={folderMenuOpen} aria-disabled={moveFolder.isPending || folders.length === 0} aria-label={`Pasta: ${requirement.folder?.name ?? 'Sem pasta'}. Alterar pasta`} onClick={() => { if (moveFolder.isPending || !folders.length) return; const nextOpen = !folderMenuOpen; setActiveFolderIndex(currentFolderIndex >= 0 ? currentFolderIndex : 0); setFolderMenuOpen(nextOpen); }} onKeyDown={(event) => { if (moveFolder.isPending) return; if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setActiveFolderIndex(currentFolderIndex >= 0 ? currentFolderIndex : 0); setFolderMenuOpen(true); } }}><span>{requirement.folder?.name ?? 'Sem pasta'}</span><ChevronDown size={15} aria-hidden="true"/></button>{folderMenuOpen && <div className="origin-folder-menu" role="listbox" aria-label="Mover US para pasta" onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeFolderMenu(true); } else if (event.key === 'Tab') { setFolderMenuOpen(false); } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Home' || event.key === 'End') { event.preventDefault(); const next = event.key === 'Home' ? 0 : event.key === 'End' ? folders.length - 1 : (activeFolderIndex + (event.key === 'ArrowDown' ? 1 : -1) + folders.length) % folders.length; setActiveFolderIndex(next); } else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); const target = folders[activeFolderIndex]; if (target) chooseFolder(target.id); } }}><div className="origin-folder-options">{folders.map((folder, index) => <button key={folder.id} ref={(element) => { folderOptionRefs.current[index] = element; }} type="button" role="option" aria-selected={folder.id === requirement.folderId} tabIndex={index === activeFolderIndex ? 0 : -1} className={`origin-folder-option ${folder.id === requirement.folderId ? 'is-current' : ''}`} onFocus={() => setActiveFolderIndex(index)} onClick={() => chooseFolder(folder.id)}><span>{folderOptionLabel(folder)}</span>{folder.id === requirement.folderId && <Check size={15} aria-hidden="true"/>}</button>)}</div></div>}</div> : <strong>{requirement.folder?.name ?? 'Sem pasta'}</strong>}{moveFolder.isPending && <small role="status">Movendo…</small>}{moveFolder.error && <small className="origin-folder-error" role="alert">{moveFolder.error.message}</small>}{moveFolder.isSuccess && <small className="origin-folder-success" role="status">Pasta alterada</small>}</div><div><span>Fonte</span><strong>{formatRequirementSource(requirement.source)}</strong></div></div>
        </AccordionSection>
      </div>
      {(onFocus || onEdit) && <footer className="drawer-footer">{onFocus && <button type="button" className="secondary-button drawer-focus-button" onClick={onFocus}><Crosshair size={16}/>Centralizar no mapa</button>}{onEdit && <button type="button" className="primary-button drawer-open-button" onClick={onEdit}>Abrir requisito <Icon name="chevron" size={16}/></button>}</footer>}
    </aside>
    {relationToRemove && <ConfirmDialog title="Remover relação?" description={<><span><strong>{removeSentence}</strong> deixará de aparecer no mapa.</span>{removeRelation.error && <span className="inline-error" role="alert">{removeRelation.error.message}</span>}</>} confirmLabel="Remover relação" pending={removeRelation.isPending} onCancel={() => { setRelationToRemove(null); removeRelation.reset(); }} onConfirm={() => removeRelation.mutate(relationToRemove.id, { onSuccess: () => setRelationToRemove(null) })}/>}
    </>
  );
}

function AccordionSection({ id, icon, title, count, summary, open, onToggle, children }: { id: string; icon: React.ReactNode; title: string; count?: number; summary?: string; open: boolean; onToggle: () => void; children: React.ReactNode }) {
  return <section className={`drawer-accordion ${open ? 'is-open' : ''}`}>
    <button type="button" className="drawer-accordion-trigger" aria-expanded={open} aria-controls={id} onClick={onToggle}>
      <span className="drawer-section-icon">{icon}</span><span className="drawer-section-title">{title}</span><span className="drawer-section-trailing">{typeof count === 'number' && <span className="count-pill">{count}</span>}<ChevronDown className="drawer-section-chevron" size={20}/></span>
    </button>
    {!open && summary && <p className="drawer-accordion-summary">{summary}</p>}
    <div id={id} className="drawer-accordion-body" hidden={!open}>{children}</div>
  </section>;
}
