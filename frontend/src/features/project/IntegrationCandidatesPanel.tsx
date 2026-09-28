import { useRef, useState, type KeyboardEvent } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { ChevronDown, CircleAlert, CircleCheck, Clock3, Code2, FileText, FolderSync, FolderKanban, RefreshCw } from 'lucide-react';
import { api } from '../../lib/api';
import type { CursorPage, GoogleSyncRunItem, WorkspaceRole } from '../../lib/types';
import { GoogleDrivePanel } from './GoogleDrivePanel';
import { TaskIntegrationsPanel } from './TaskIntegrationsPanel';

type Provider = 'ALL' | 'GOOGLE' | 'GITHUB' | 'OPENPROJECT';
type ActivityStatus = 'ALL' | 'COMPLETED' | 'FAILED' | 'IN_PROGRESS' | 'UNKNOWN';
type ActivityPeriod = 'ALL' | 'TODAY' | 'LAST_7_DAYS' | 'LAST_30_DAYS' | 'CUSTOM';
type Activity = {
  id: string; source: 'GOOGLE_SYNC' | 'ACTIVITY' | 'TASK_OPERATION' | 'LEGACY_TASK'; provider: Exclude<Provider, 'ALL'>;
  action: string; status: string; occurredAt: string; title: string; summary: string; error?: string | null;
  remoteId?: string | null; url?: string | null; remoteStatus?: string | null; project?: { id?: string; key?: string; name?: string } | null;
  projectTitle?: string | null;
  requirement?: { id?: string; code?: string; title?: string } | null; actor?: string | null;
  detailId?: string; itemCount?: number; scannedCount?: number; changedCount?: number;
};
const integrationTabs = [
  { id: 'tasks', label: 'Tarefas externas' },
  { id: 'drive', label: 'Armazenamento' },
  { id: 'activity', label: 'Histórico de integrações' },
] as const;
const providerOptions: Array<{ id: Provider; label: string }> = [
  { id: 'ALL', label: 'Todas' }, { id: 'GOOGLE', label: 'Google Drive' }, { id: 'GITHUB', label: 'GitHub' }, { id: 'OPENPROJECT', label: 'OpenProject' },
];
const statusOptions: Array<{ id: ActivityStatus; label: string }> = [
  { id: 'ALL', label: 'Todos os status' }, { id: 'COMPLETED', label: 'Concluídas' }, { id: 'FAILED', label: 'Falharam' }, { id: 'IN_PROGRESS', label: 'Em andamento' }, { id: 'UNKNOWN', label: 'Resultado incerto' },
];
type IntegrationTab = (typeof integrationTabs)[number]['id'];
function formatDate(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? 'Data indisponível' : date.toLocaleString('pt-BR'); }
function localDay(value: string | Date) { const date = typeof value === 'string' ? new Date(`${value}T00:00:00`) : new Date(value); date.setHours(0, 0, 0, 0); return date; }
function dateRangeFor(period: ActivityPeriod, customStart: string, customEnd: string) {
  if (period === 'ALL') return {};
  let start: Date | undefined;
  let end: Date | undefined;
  if (period === 'CUSTOM') {
    if (customStart) start = localDay(customStart);
    if (customEnd) { end = localDay(customEnd); end.setDate(end.getDate() + 1); }
  } else {
    const today = localDay(new Date());
    start = new Date(today);
    if (period === 'LAST_7_DAYS') start.setDate(start.getDate() - 6);
    if (period === 'LAST_30_DAYS') start.setDate(start.getDate() - 29);
    end = new Date(today); end.setDate(end.getDate() + 1);
  }
  return { ...(start ? { from: start.toISOString() } : {}), ...(end ? { to: end.toISOString() } : {}) };
}
function payloadText(payload: unknown): string { if (typeof payload === 'string') return payload; if (!payload || typeof payload !== 'object') return ''; const value = payload as { text?: unknown; content?: unknown }; if (typeof value.text === 'string') return value.text; if (typeof value.content === 'string') return value.content; if (Array.isArray(value.content)) return value.content.map(payloadText).filter(Boolean).join(' '); return value.content && typeof value.content === 'object' ? payloadText(value.content) : ''; }
const statusLabels: Record<string, string> = { RUNNING: 'Em andamento', PENDING: 'Em andamento', COMPLETED: 'Concluída', FAILED: 'Falhou', IDLE: 'Sem alterações', UNKNOWN: 'Resultado incerto' };

function GoogleSyncDetails({ workspaceId, event }: { workspaceId: string; event: Activity }) {
  const [cursor, setCursor] = useState<string | null>(null);
  const [previous, setPrevious] = useState<GoogleSyncRunItem[]>([]);
  const page = useQuery<CursorPage<GoogleSyncRunItem>>({ queryKey: ['google-sync-run-items', workspaceId, event.detailId, cursor], enabled: Boolean(event.detailId), queryFn: () => api(`/workspaces/${workspaceId}/integrations/google/sync-runs/${event.detailId}/items${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`) });
  const items = cursor ? [...previous, ...(page.data?.items ?? [])] : page.data?.items ?? [];
  return <div className="integration-history-details">
    <div className="integration-history-meta"><span>{event.summary}</span>{event.itemCount !== undefined && <span>{event.itemCount} {event.itemCount === 1 ? 'documento alterado' : 'documentos alterados'}</span>}</div>
    {event.error && <p className="integration-history-error" role="alert">{event.error}</p>}
    {page.isLoading && !items.length && <div className="sync-run-loading"><RefreshCw size={15}/> Carregando documentos…</div>}
    {page.isError && <div className="sync-run-feedback" role="alert">Não foi possível carregar os detalhes. <button type="button" onClick={() => void page.refetch()}>Tentar novamente</button></div>}
    {!!items.length && <ol className="sync-run-items">{items.map(item => <li key={item.id}><span className="activity-provider-icon"><FileText size={16}/></span><div><strong>{item.title}</strong><p>{payloadText(item.candidate?.content) || 'Documento sincronizado sem prévia de texto.'}</p></div><span className="activity-status">{item.changeType === 'CREATED' ? 'Criado' : item.changeType === 'UPDATED' ? 'Atualizado' : 'Removido'}</span><time dateTime={item.createdAt}>{formatDate(item.createdAt)}</time></li>)}</ol>}
    {page.data?.nextCursor && <button className="secondary-button sync-run-more" type="button" onClick={() => { setPrevious(items); setCursor(page.data!.nextCursor); }}>Carregar mais documentos</button>}
    {!page.isLoading && !page.isError && !items.length && !event.error && <p className="sync-run-empty">Nenhuma alteração foi encontrada nesta sincronização.</p>}
  </div>;
}

function HistoryRow({ workspaceId, event }: { workspaceId: string; event: Activity }) {
  const [expanded, setExpanded] = useState(false);
  const icon = event.provider === 'GOOGLE' ? <FolderSync size={18}/> : event.provider === 'GITHUB' ? <Code2 size={18}/> : <FolderKanban size={18}/>;
  const label = event.provider === 'GOOGLE' ? 'Google Drive' : event.provider === 'GITHUB' ? 'GitHub' : 'OpenProject';
  const status = statusLabels[event.status] ?? (event.status === 'COMPLETED' ? 'Concluída' : event.status);
  const statusClass = event.status.toLocaleLowerCase();
  return <article className={`integration-history-row ${expanded ? 'is-open' : ''}`}>
    <button className="integration-history-trigger" type="button" aria-expanded={expanded} aria-controls={`history-details-${event.id.replaceAll(':', '-')}`} onClick={() => setExpanded(value => !value)}>
      <span className={`integration-history-icon provider-${event.provider.toLowerCase()}`}>{icon}</span>
      <span className="integration-history-copy"><strong>{event.title}</strong><small><span>{label}</span>{event.requirement?.code && <> · {event.requirement.code}</>}{event.project?.key && <> · {event.project.key}</>}</small><span>{event.summary}</span></span>
      <span className={`integration-history-status status-${statusClass}`}>{event.status === 'FAILED' || event.status === 'UNKNOWN' ? <CircleAlert size={13}/> : event.status === 'COMPLETED' ? <CircleCheck size={13}/> : <Clock3 size={13}/>} {status}</span>
      <time dateTime={event.occurredAt}>{formatDate(event.occurredAt)}</time><ChevronDown className="integration-history-chevron" size={17}/>
    </button>
    {expanded && <div className="integration-history-details-wrap" id={`history-details-${event.id.replaceAll(':', '-')}`}>
      {event.source === 'GOOGLE_SYNC' && <GoogleSyncDetails workspaceId={workspaceId} event={event}/>}
      {event.source !== 'GOOGLE_SYNC' && <div className="integration-history-details">
        {event.requirement && <p>US {event.requirement.code ?? ''} · {event.requirement.title ?? ''}</p>}
        {event.project?.name && <p>Projeto ATHENA · {event.project.name}</p>}
        {event.projectTitle && <p>GitHub Project · {event.projectTitle}</p>}
        {event.actor && <p>Realizada por {event.actor}</p>}
        {event.remoteId && <p>Identificador externo · {event.remoteId}</p>}
        {event.remoteStatus && <p>Status do item · {event.remoteStatus}</p>}
        {event.error && <p className="integration-history-error" role="alert">{event.error}</p>}
        {event.url && <a className="integration-history-link" href={event.url} target="_blank" rel="noreferrer">Abrir tarefa no {label}</a>}
      </div>}
    </div>}
  </article>;
}

function IntegrationHistory({ workspaceId, active }: { workspaceId: string; active: boolean }) {
  const [provider, setProvider] = useState<Provider>('ALL');
  const [status, setStatus] = useState<ActivityStatus>('ALL');
  const [period, setPeriod] = useState<ActivityPeriod>('ALL');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const customDatesInvalid = Boolean(period === 'CUSTOM' && customStart && customEnd && customStart > customEnd);
  const filterRange = dateRangeFor(period, customStart, customEnd);
  const customDatesEmpty = period === 'CUSTOM' && !customStart && !customEnd;
  const canLoad = !customDatesInvalid && !customDatesEmpty;
  const hasFilters = provider !== 'ALL' || status !== 'ALL' || period !== 'ALL';
  const history = useInfiniteQuery<CursorPage<Activity>>({
    queryKey: ['integration-activity', workspaceId, provider, status, period, customStart, customEnd], initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ provider, status, limit: '30' });
      if (filterRange.from) params.set('from', filterRange.from);
      if (filterRange.to) params.set('to', filterRange.to);
      if (pageParam) params.set('cursor', String(pageParam));
      return api(`/workspaces/${workspaceId}/integrations/activity?${params.toString()}`);
    },
    getNextPageParam: page => page.nextCursor ?? undefined, enabled: active && canLoad,
  });
  const items = history.data?.pages.flatMap(page => page.items) ?? [];
  const clearFilters = () => { setProvider('ALL'); setStatus('ALL'); setPeriod('ALL'); setCustomStart(''); setCustomEnd(''); };
  return <section className="integration-activity" aria-labelledby="integration-activity-title">
    <header className="integration-section-intro"><div><h2 id="integration-activity-title">Histórico de integrações</h2><p>Sincronizações do Drive, tarefas criadas ou vinculadas e falhas nas integrações.</p></div></header>
    <div className="integration-history-filters" role="group" aria-label="Filtrar histórico por integração">{providerOptions.map(option => <button key={option.id} type="button" className={provider === option.id ? 'is-active' : ''} aria-pressed={provider === option.id} onClick={() => setProvider(option.id)}>{option.label}</button>)}</div>
    <div className="integration-history-controls">
      <label><span>Período</span><select aria-label="Filtrar por período" value={period} onChange={event => setPeriod(event.target.value as ActivityPeriod)}><option value="ALL">Qualquer data</option><option value="TODAY">Hoje</option><option value="LAST_7_DAYS">Últimos 7 dias</option><option value="LAST_30_DAYS">Últimos 30 dias</option><option value="CUSTOM">Período personalizado</option></select></label>
      {period === 'CUSTOM' && <div className="integration-history-date-range"><label><span>De</span><input aria-label="Data inicial" type="date" value={customStart} max={customEnd || undefined} onChange={event => setCustomStart(event.target.value)}/></label><label><span>Até</span><input aria-label="Data final" type="date" value={customEnd} min={customStart || undefined} onChange={event => setCustomEnd(event.target.value)}/></label></div>}
      <label><span>Status</span><select aria-label="Filtrar por status" value={status} onChange={event => setStatus(event.target.value as ActivityStatus)}>{statusOptions.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>
      {hasFilters && <button className="integration-history-reset" type="button" onClick={clearFilters}>Limpar filtros</button>}
    </div>
    {customDatesEmpty && <p className="integration-history-filter-hint" role="status">Escolha ao menos uma data para filtrar o histórico.</p>}
    {customDatesInvalid && <p className="integration-history-filter-hint is-error" role="alert">A data inicial precisa ser anterior ou igual à data final.</p>}
    {canLoad && history.isLoading && <div className="integration-activity-state" aria-live="polite"><span className="loading-ring"/><strong>Carregando histórico…</strong></div>}
    {canLoad && history.isError && <div className="integration-activity-state" role="alert"><span className="state-symbol">!</span><strong>Não foi possível carregar o histórico</strong><span>{history.error.message}</span><button className="secondary-button" type="button" onClick={() => void history.refetch()}>Tentar novamente</button></div>}
    {canLoad && !history.isLoading && !history.isError && !items.length && <div className="integration-activity-empty" role="status"><span><FolderSync size={21}/></span><div><strong>{hasFilters ? 'Nenhuma atividade encontrada' : 'Sem atividade por enquanto'}</strong><p>{hasFilters ? 'Experimente alterar ou limpar os filtros.' : 'As sincronizações do Drive e as tarefas criadas ou vinculadas pelo ATHENA aparecerão aqui.'}</p></div></div>}
    {canLoad && !history.isLoading && !history.isError && !!items.length && <div className="integration-history-list">{items.map(event => <HistoryRow key={event.id} workspaceId={workspaceId} event={event}/>)}</div>}
    {canLoad && history.hasNextPage && <div className="integration-history-more"><button className="secondary-button" type="button" disabled={history.isFetchingNextPage} onClick={() => void history.fetchNextPage()}>{history.isFetchingNextPage ? 'Carregando…' : 'Carregar mais'}</button></div>}
  </section>;
}

export function IntegrationCandidatesPanel({ workspaceId, projectId, role }: { workspaceId: string; projectId: string; role?: WorkspaceRole }) {
  const [activeTab, setActiveTab] = useState<IntegrationTab>(() => {
    const query = new URLSearchParams(window.location.search);
    const oauthWorkspaceId = query.get('workspaceId');
    return query.get('integration') === 'google' && (!oauthWorkspaceId || oauthWorkspaceId === workspaceId) ? 'drive' : 'tasks';
  });
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const onTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, currentIndex: number) => {
    let nextIndex: number | null = null;
    if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % integrationTabs.length;
    if (event.key === 'ArrowLeft') nextIndex = (currentIndex + integrationTabs.length - 1) % integrationTabs.length;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = integrationTabs.length - 1;
    if (nextIndex === null) return;
    event.preventDefault(); setActiveTab(integrationTabs[nextIndex].id); tabRefs.current[nextIndex]?.focus();
  };
  return <section className="list-page integrations-page">
    <header className="integrations-heading"><div><h1>Integrações</h1><p>Gerencie serviços, destinos de tarefas e pastas sincronizadas.</p></div></header>
    <div className="integrations-tablist" role="tablist" aria-label="Seções de integrações" aria-orientation="horizontal">
      {integrationTabs.map((tab, index) => <button key={tab.id} ref={element => { tabRefs.current[index] = element; }} id={`integrations-tab-${tab.id}`} className="integrations-tab" type="button" role="tab" aria-selected={activeTab === tab.id} aria-controls={`integrations-panel-${tab.id}`} tabIndex={activeTab === tab.id ? 0 : -1} onClick={() => setActiveTab(tab.id)} onKeyDown={event => onTabKeyDown(event, index)}>{tab.label}</button>)}
    </div>
    <section id="integrations-panel-tasks" className="integrations-tabpanel" role="tabpanel" aria-labelledby="integrations-tab-tasks" hidden={activeTab !== 'tasks'}><TaskIntegrationsPanel workspaceId={workspaceId} projectId={projectId} role={role} active={activeTab === 'tasks'}/></section>
    <section id="integrations-panel-drive" className="integrations-tabpanel" role="tabpanel" aria-labelledby="integrations-tab-drive" hidden={activeTab !== 'drive'}><GoogleDrivePanel workspaceId={workspaceId} projectId={projectId} role={role} active={activeTab === 'drive'}/></section>
    <section id="integrations-panel-activity" className="integrations-tabpanel" role="tabpanel" aria-labelledby="integrations-tab-activity" hidden={activeTab !== 'activity'}><IntegrationHistory workspaceId={workspaceId} active={activeTab === 'activity'}/></section>
  </section>;
}
