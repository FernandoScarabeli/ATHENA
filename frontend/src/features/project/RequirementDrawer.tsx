import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeftRight, ChevronDown, Database, FileText, Link2, Plus, Sparkles } from 'lucide-react';
import { Icon } from '../../components/Icon';
import { ConfirmDialog } from '../../components/ui/Dialog';
import { api } from '../../lib/api';
import type { AiSuggestion, Requirement, RequirementRelation } from '../../lib/types';

const statusLabels = { DRAFT: 'Rascunho', ACTIVE: 'Ativo', ARCHIVED: 'Arquivado' } as const;
const relationLabels = { RELATED_TO: 'Relacionado a', DEPENDS_ON: 'Depende de', BLOCKS: 'Bloqueia', CONFLICTS_WITH: 'Conflita com' } as const;

const relationDescriptions: Record<keyof typeof relationLabels, string> = { RELATED_TO: 'As US estão relacionadas', DEPENDS_ON: 'A US de origem depende da US alvo', BLOCKS: 'A US de origem bloqueia a US alvo', CONFLICTS_WITH: 'As US entram em conflito' };
const suggestionStatusLabels = { PENDING: 'Pendente', CONFIRMED: 'Aprovada', DISMISSED: 'Descartada' } as const;
const referenceLabels = { PROTOTYPE: 'Protótipo', ATTACHMENT: 'Anexo' } as const;
type AiAnalysis = { status: 'PENDING' | 'COMPLETED' | 'FAILED'; error?: string | null } | null;

export function RequirementDrawer({ requirement, projectRequirements = [], canEdit = false, onClose, onSelect, onEdit }: { requirement: Requirement; projectRequirements?: Requirement[]; canEdit?: boolean; onClose: () => void; onSelect: (id: string) => void; onEdit?: () => void }) {
  const client = useQueryClient();
  const relations = useQuery<RequirementRelation[]>({ queryKey: ['relations', requirement.id], queryFn: () => api(`/requirements/${requirement.id}/relations`) });
  const suggestions = useQuery<AiSuggestion[]>({ queryKey: ['ai-suggestions', requirement.id], queryFn: () => api(`/requirements/${requirement.id}/ai-suggestions`) });
  const analysis = useQuery<AiAnalysis>({ queryKey: ['ai-analysis', requirement.id], queryFn: async () => (await api<AiAnalysis>(`/requirements/${requirement.id}/ai-analysis`)) ?? null });
  const [targetId, setTargetId] = useState('');
  const [targetPickerOpen, setTargetPickerOpen] = useState(false);
  const [type, setType] = useState<keyof typeof relationLabels>('RELATED_TO');
  const [direction, setDirection] = useState<'OUTGOING' | 'INCOMING'>('OUTGOING');
  const [composerOpen, setComposerOpen] = useState(false);
  const [relationToRemove, setRelationToRemove] = useState<RequirementRelation | null>(null);
  const [openSections, setOpenSections] = useState({ criteria: false, relations: true, suggestions: false, metadata: true });
  const invalidateRelationQueries = async (ids: string[]) => Promise.all([...new Set(ids)].map((id) => client.invalidateQueries({ queryKey: ['relations', id] })));
  const createRelation = useMutation({ mutationFn: () => api<RequirementRelation>(`/requirements/${direction === 'OUTGOING' ? requirement.id : targetId}/relations`, { method: 'POST', body: JSON.stringify({ targetId: direction === 'OUTGOING' ? targetId : requirement.id, type }) }), onSuccess: async (relation) => { setTargetId(''); createRelation.reset(); await Promise.all([invalidateRelationQueries([relation.sourceId, relation.targetId]), client.invalidateQueries({ queryKey: ['graph', requirement.projectId] })]); } });
  const removeRelation = useMutation({ mutationFn: (relationId: string) => api<RequirementRelation>(`/requirements/${requirement.id}/relations/${relationId}`, { method: 'DELETE' }), onSuccess: async (relation) => { removeRelation.reset(); await Promise.all([invalidateRelationQueries([relation.sourceId, relation.targetId]), client.invalidateQueries({ queryKey: ['graph', requirement.projectId] })]); } });
  const decideSuggestion = useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: 'approve' | 'dismiss' }) => api<AiSuggestion>(`/ai-suggestions/${id}/${decision}`, { method: 'POST' }),
    onSuccess: async (suggestion) => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ['ai-suggestions', requirement.id] }),
        client.invalidateQueries({ queryKey: ['requirements', requirement.projectId] }),
        client.invalidateQueries({ queryKey: ['requirement', requirement.id] }),
        client.invalidateQueries({ queryKey: ['references', requirement.id] }),
        client.invalidateQueries({ queryKey: ['relations', requirement.id] }),
        client.invalidateQueries({ queryKey: ['graph', requirement.projectId] }),
        ...(suggestion.targetRequirementId ? [client.invalidateQueries({ queryKey: ['relations', suggestion.targetRequirementId] })] : []),
      ]);
    },
  });
  const retryAnalysis = useMutation({
    mutationFn: () => api<AiAnalysis>(`/requirements/${requirement.id}/ai-analysis/retry`, { method: 'POST' }),
    onSuccess: async () => { await Promise.all([client.invalidateQueries({ queryKey: ['ai-analysis', requirement.id] }), client.invalidateQueries({ queryKey: ['ai-suggestions', requirement.id] })]); },
  });
  const candidates = projectRequirements.filter((item) => item.projectId === requirement.projectId && item.id !== requirement.id && item.status !== 'ARCHIVED');
  const selectedTarget = candidates.find((candidate) => candidate.id === targetId);
  const relationPreview = useMemo(() => {
    const source = direction === 'OUTGOING' ? requirement : selectedTarget;
    const target = direction === 'OUTGOING' ? selectedTarget : requirement;
    if (!source || !target) return 'Escolha outra US para visualizar a relação.';
    return `${source.code} ${relationLabels[type].toLocaleLowerCase('pt-BR')} ${target.code}.`;
  }, [direction, requirement, selectedTarget, type]);
  useEffect(() => {
    setTargetId('');
    setTargetPickerOpen(false);
    setComposerOpen(false);
    setOpenSections({ criteria: false, relations: true, suggestions: false, metadata: true });
    createRelation.reset();
    removeRelation.reset();
  }, [requirement.id]);
  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [onClose]);

  return (
    <>
    <aside className="details-panel" aria-label={`Detalhes de ${requirement.code}`}>
      <div className="drawer-content">
        <header className="panel-header"><div><span className="drawer-code">{requirement.code}</span><h2>{requirement.title}</h2></div><button className="icon-button" onClick={onClose} aria-label="Fechar detalhes"><Icon name="close" size={16}/></button></header>
        <div className="type-row"><span className="status-dot" aria-hidden="true"/><span>{statusLabels[requirement.status]}</span><span className="type-divider" aria-hidden="true"/><span>Revisão {requirement.revision}</span></div>

        <AccordionSection id="drawer-relations" icon={<Link2 size={22}/>} title="Relações" count={relations.data?.length ?? 0} open={openSections.relations} onToggle={() => setOpenSections((current) => ({ ...current, relations: !current.relations }))}>
        {relations.isLoading && <p className="empty-copy">Carregando relações…</p>}
        {relations.isError && <div className="compact-error" role="alert">{relations.error.message}</div>}
        {relations.data?.length === 0 && !relations.isLoading && <p className="empty-copy relation-empty">Ainda não há relações nesta US.</p>}
        <div className="relation-list">
          {relations.data?.map((relation) => {
            const other = relation.sourceId === requirement.id ? relation.target : relation.source;
            return <div className="relation-row" key={relation.id}>
              <Link2 size={15} aria-hidden="true"/>
              <button type="button" className="relation-row-link" onClick={() => onSelect(other.id)}>
                <span><strong>{other.code} · {other.title}</strong><small>{relation.sourceId === requirement.id ? relationLabels[relation.type] : `${relationLabels[relation.type]} desta US`}</small></span>
                <Icon name="chevron" size={14}/>
              </button>
              {canEdit && <button type="button" className="text-button relation-remove" disabled={removeRelation.isPending} onClick={() => setRelationToRemove(relation)}>Remover</button>}
            </div>;
          })}
        </div>
        {canEdit && <>
          <button type="button" className="relation-composer-trigger" aria-expanded={composerOpen} aria-controls="relation-composer" onClick={() => setComposerOpen((open) => !open)}><Plus size={18}/>{composerOpen ? 'Fechar conexão' : 'Conectar relação'}</button>
          {composerOpen && <form id="relation-composer" className="relation-form" onSubmit={(event) => { event.preventDefault(); if (targetId && !createRelation.isPending) createRelation.mutate(); }}>
          <div className="relation-form-heading"><strong>Nova relação</strong><small>Escolha como esta história se relaciona com outra.</small></div>
          <div className="relation-builder-stories">
            <div className="relation-story relation-story-source"><span>Esta US</span><strong>{requirement.code}</strong><small>{requirement.title}</small></div>
            <button type="button" className="relation-direction" aria-label="Inverter direção" title="Inverter direção" disabled={createRelation.isPending} onClick={() => setDirection((current) => current === 'OUTGOING' ? 'INCOMING' : 'OUTGOING')}><ArrowLeftRight size={16}/></button>
            <div className="relation-target-picker"><span>Outra US</span><button type="button" className="relation-target-trigger" aria-label="US selecionada" aria-haspopup="listbox" aria-expanded={targetPickerOpen} disabled={createRelation.isPending} onClick={() => setTargetPickerOpen((open) => !open)}>{selectedTarget ? <><strong>{selectedTarget.code}</strong><small>{selectedTarget.title}</small></> : <small>Selecione uma US</small>}<Icon name="chevron" size={14}/></button>{targetPickerOpen && <div className="relation-target-options" role="listbox" aria-label="Escolha outra US">{candidates.length ? candidates.map((candidate) => <button key={candidate.id} type="button" role="option" aria-selected={candidate.id === targetId} onClick={() => { setTargetId(candidate.id); setTargetPickerOpen(false); }}><strong>{candidate.code}</strong><small>{candidate.title}</small></button>) : <span>Nenhuma outra US ativa.</span>}</div>}</div>
          </div>
          <fieldset className="relation-type-picker"><legend>Como se relacionam?</legend><div role="radiogroup" aria-label="Tipo da relação">{(Object.keys(relationLabels) as Array<keyof typeof relationLabels>).map((relationType) => <button key={relationType} type="button" role="radio" aria-checked={type === relationType} className={type === relationType ? 'selected' : ''} disabled={createRelation.isPending} onClick={() => setType(relationType)} title={relationDescriptions[relationType]}>{relationLabels[relationType]}</button>)}</div></fieldset>
          <div className="relation-preview" aria-live="polite"><span>Prévia</span><strong>{relationPreview}</strong></div>
          {createRelation.error && <div className="inline-error" role="alert">{createRelation.error.message}</div>}
          {removeRelation.error && <div className="inline-error" role="alert">{removeRelation.error.message}</div>}
          <button className="primary-button relation-submit" type="submit" disabled={!targetId || createRelation.isPending}>{createRelation.isPending ? 'Criando relação…' : 'Criar relação'}</button>
          </form>}
        </>}
        </AccordionSection>

        <AccordionSection id="drawer-criteria" icon={<FileText size={21}/>} title="Critérios de aceite" count={requirement.criteria.length} summary={requirement.criteria.length ? `${requirement.criteria.length} critérios cadastrados.` : 'Nenhum critério cadastrado.'} open={openSections.criteria} onToggle={() => setOpenSections((current) => ({ ...current, criteria: !current.criteria }))}>
          {requirement.criteria.length ? <ol className="criteria-list">{requirement.criteria.map((criterion, index) => <li key={criterion.id ?? index}>{criterion.title && <strong>{criterion.title}: </strong>}{criterion.given || criterion.whenText || criterion.thenText ? <>Dado {criterion.given || '—'}, quando {criterion.whenText || '—'}, então {criterion.thenText || criterion.text || '—'}.</> : criterion.text}</li>)}</ol> : <p className="empty-copy">Nenhum critério cadastrado.</p>}
        </AccordionSection>

        <AccordionSection id="drawer-suggestions" icon={<Sparkles size={21}/>} title="Sugestões de IA" count={suggestions.data?.filter((item) => item.status === 'PENDING').length ?? 0} summary="Recomendações não alteram o grafo automaticamente." open={openSections.suggestions} onToggle={() => setOpenSections((current) => ({ ...current, suggestions: !current.suggestions }))}>
          <AiSuggestionsContent suggestions={suggestions.data ?? []} loading={suggestions.isLoading} error={suggestions.error} analysis={analysis.data} analysisLoading={analysis.isLoading} canEdit={canEdit} mutation={decideSuggestion} retryMutation={retryAnalysis} onRetry={() => { void suggestions.refetch(); void analysis.refetch(); }} projectRequirements={projectRequirements}/>
        </AccordionSection>

        <AccordionSection id="drawer-metadata" icon={<Database size={21}/>} title="Origem" open={openSections.metadata} onToggle={() => setOpenSections((current) => ({ ...current, metadata: !current.metadata }))}>
          <div className="metadata-grid"><div><span>Pasta</span><strong>{requirement.folder?.name ?? 'Sem pasta'}</strong></div><div><span>Origem</span><strong>{requirement.source}</strong></div></div>
        </AccordionSection>
      </div>
      {onEdit && <footer className="drawer-footer"><button className="primary-button drawer-open-button" onClick={onEdit}>Abrir requisito <Icon name="chevron" size={16}/></button></footer>}
    </aside>
    {relationToRemove && <ConfirmDialog title="Remover relação?" description={<>A relação <strong>{relationToRemove.source.code} → {relationToRemove.target.code}</strong> deixará de aparecer no mapa.</>} confirmLabel="Remover relação" pending={removeRelation.isPending} onCancel={() => setRelationToRemove(null)} onConfirm={() => removeRelation.mutate(relationToRemove.id, { onSuccess: () => setRelationToRemove(null) })}/>}
    </>
  );
}

function AccordionSection({ id, icon, title, count, summary, open, onToggle, children }: { id: string; icon: React.ReactNode; title: string; count?: number; summary?: string; open: boolean; onToggle: () => void; children: React.ReactNode }) {
  return <section className={`drawer-accordion ${open ? 'is-open' : ''}`}>
    <button type="button" className="drawer-accordion-trigger" aria-expanded={open} aria-controls={id} onClick={onToggle}>
      <span className="drawer-section-icon">{icon}</span><span className="drawer-section-title">{title}</span>{typeof count === 'number' && <span className="count-pill">{count}</span>}<ChevronDown className="drawer-section-chevron" size={20}/>
    </button>
    {!open && summary && <p className="drawer-accordion-summary">{summary}</p>}
    <div id={id} className="drawer-accordion-body" hidden={!open}>{children}</div>
  </section>;
}

type SuggestionDecision = 'approve' | 'dismiss';
type SuggestionMutation = {
  isPending: boolean;
  variables?: { id: string; decision: SuggestionDecision };
  error: Error | null;
  mutate: (variables: { id: string; decision: SuggestionDecision }) => void;
};

function AiSuggestionsContent({ suggestions, loading, error, analysis, analysisLoading, canEdit, mutation, retryMutation, onRetry, projectRequirements }: { suggestions: AiSuggestion[]; loading: boolean; error: Error | null; analysis: AiAnalysis | undefined; analysisLoading: boolean; canEdit: boolean; mutation: SuggestionMutation; retryMutation: { isPending: boolean; error: Error | null; mutate: () => void }; onRetry: () => void; projectRequirements: Requirement[] }) {
  return <div className="ai-suggestions" aria-live="polite">
    <p className="suggestion-note">Sugestões pendentes são recomendações e ainda não alteram o grafo ou as referências.</p>
    {analysisLoading && <p className="empty-copy">Verificando análise…</p>}
    {analysis?.status === 'PENDING' && <p className="analysis-state">A IA está analisando esta US.</p>}
    {analysis?.status === 'FAILED' && <div className="compact-error" role="alert"><span>A análise falhou. {analysis.error || 'Tente novamente.'}</span>{canEdit && <button type="button" className="text-button" disabled={retryMutation.isPending} onClick={() => retryMutation.mutate()}>{retryMutation.isPending ? 'Tentando…' : 'Tentar análise novamente'}</button>}</div>}
    {retryMutation.error && <div className="inline-error" role="alert">{retryMutation.error.message}</div>}
    {loading && <p className="empty-copy">Carregando sugestões…</p>}
    {error && <div className="compact-error" role="alert"><span>Não foi possível carregar as sugestões. {error.message}</span><button type="button" className="text-button" onClick={onRetry}>Tentar novamente</button></div>}
    {!loading && !error && suggestions.length === 0 && <p className="empty-copy">Nenhuma sugestão disponível para esta US.</p>}
    <div className="suggestion-list">{suggestions.map((suggestion) => <AiSuggestionCard key={suggestion.id} suggestion={suggestion} canEdit={canEdit} mutation={mutation} projectRequirements={projectRequirements}/>)}</div>
  </div>;
}

function AiSuggestionCard({ suggestion, canEdit, mutation, projectRequirements }: { suggestion: AiSuggestion; canEdit: boolean; mutation: SuggestionMutation; projectRequirements: Requirement[] }) {
  const [decision, setDecision] = useState<SuggestionDecision | null>(null);
  const target = suggestion.targetRequirementId ? projectRequirements.find((item) => item.id === suggestion.targetRequirementId) : undefined;
  const pending = suggestion.status === 'PENDING';
  const busy = mutation.isPending && mutation.variables?.id === suggestion.id;
  const failed = Boolean(mutation.error && mutation.variables?.id === suggestion.id);
  const targetLabel = suggestion.type === 'RELATION' ? `${suggestion.relationType ? relationLabels[suggestion.relationType] : 'Relação'}${target ? ` · ${target.code} — ${target.title}` : ''}` : `${suggestion.referenceType ? referenceLabels[suggestion.referenceType] : 'Referência'}${suggestion.url ? ` · ${suggestion.url}` : ''}`;
  const decisionCopy = decision === 'approve' ? `A sugestão será aplicada como ${suggestion.type === 'RELATION' ? 'relação no mapa' : 'referência'}.` : 'A sugestão será descartada e continuará registrada no histórico.';
  return <article className={`suggestion-card suggestion-${suggestion.status.toLowerCase()}`}>
    <header><strong>{suggestion.type === 'RELATION' ? 'Relação sugerida' : 'Referência sugerida'}</strong><span className="suggestion-status">{suggestionStatusLabels[suggestion.status]}</span></header>
    <div className="suggestion-target"><span>Alvo</span><strong>{targetLabel}</strong>{suggestion.url && <a href={suggestion.url} target="_blank" rel="noreferrer">Abrir URL</a>}</div>
    <div className="suggestion-meta"><span>Confiança {Math.round(suggestion.confidence * 100)}%</span><span>Origem: análise de IA</span></div>
    <p className="suggestion-justification">{suggestion.justification}</p>
    {suggestion.error && <div className="inline-error" role="alert">{suggestion.error}</div>}
    {pending && canEdit && <div className="suggestion-actions"><button type="button" className="primary-button" disabled={busy || mutation.isPending} onClick={() => setDecision('approve')}>{busy && mutation.variables?.decision === 'approve' ? 'Aplicando…' : 'Aprovar'}</button><button type="button" className="secondary-button" disabled={busy || mutation.isPending} onClick={() => setDecision('dismiss')}>{busy && mutation.variables?.decision === 'dismiss' ? 'Descartando…' : 'Descartar'}</button></div>}
    {failed && mutation.error && <div className="inline-error" role="alert">{mutation.error.message} Tente novamente.</div>}
    {decision && <ConfirmDialog title={decision === 'approve' ? 'Aplicar sugestão?' : 'Descartar sugestão?'} description={decisionCopy} confirmLabel={decision === 'approve' ? 'Aplicar sugestão' : 'Descartar sugestão'} tone={decision === 'approve' ? 'primary' : 'danger'} pending={busy} onCancel={() => setDecision(null)} onConfirm={() => { mutation.mutate({ id: suggestion.id, decision }); setDecision(null); }}/>}
  </article>;
}
