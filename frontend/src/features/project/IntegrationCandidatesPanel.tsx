import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, FileText, FolderSync, RefreshCw } from 'lucide-react';
import { api } from '../../lib/api';
import type { CursorPage, GoogleSyncRun, GoogleSyncRunItem, WorkspaceRole } from '../../lib/types';
import { GoogleDrivePanel } from './GoogleDrivePanel';

const changeLabels = { CREATED: 'Criado', UPDATED: 'Atualizado', REMOVED: 'Removido' } as const;
const runLabels = { RUNNING: 'Em andamento', COMPLETED: 'Concluída', FAILED: 'Falhou', IDLE: 'Aguardando' } as const;
function formatDate(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? 'Data indisponível' : date.toLocaleString('pt-BR'); }
function payloadText(payload: unknown): string { if (typeof payload === 'string') return payload; if (!payload || typeof payload !== 'object') return ''; const value = payload as { text?: unknown; content?: unknown }; if (typeof value.text === 'string') return value.text; if (typeof value.content === 'string') return value.content; if (Array.isArray(value.content)) return value.content.map(payloadText).filter(Boolean).join(' '); return value.content && typeof value.content === 'object' ? payloadText(value.content) : ''; }

function SyncRunAccordion({ workspaceId, run, expanded, onToggle }: { workspaceId: string; run: GoogleSyncRun; expanded: boolean; onToggle: () => void }) {
  const [cursor, setCursor] = useState<string | null>(null);
  const [previousItems, setPreviousItems] = useState<GoogleSyncRunItem[]>([]);
  const page = useQuery<CursorPage<GoogleSyncRunItem>>({ queryKey: ['google-sync-run-items', workspaceId, run.id, cursor], enabled: expanded, queryFn: () => api(`/workspaces/${workspaceId}/integrations/google/sync-runs/${run.id}/items${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`) });
  const items = cursor ? [...previousItems, ...(page.data?.items ?? [])] : page.data?.items ?? [];
  const panelId = `sync-run-${run.id}`;
  return <article className={`sync-run ${expanded ? 'is-open' : ''}`}>
    <button className="sync-run-trigger" aria-expanded={expanded} aria-controls={panelId} onClick={onToggle}>
      <span className="sync-run-folder"><FolderSync size={19}/></span><span className="sync-run-title"><strong>{run.folder.name}</strong><small>{run.folder.project ? `${run.folder.project.key} · ${run.folder.project.name}` : 'Projeto não definido'}</small></span><span className={`sync-run-status status-${run.status.toLowerCase()}`}>{runLabels[run.status]}</span><span className="sync-run-summary"><b>{run.changedCount}</b> {run.changedCount === 1 ? 'alteração' : 'alterações'}<small>{formatDate(run.startedAt)}</small></span><ChevronDown className="sync-run-chevron" size={18} aria-hidden="true"/>
    </button>
    {expanded && <div className="sync-run-panel" id={panelId}>
      <div className="sync-run-meta"><span>{run.scannedCount} {run.scannedCount === 1 ? 'arquivo lido' : 'arquivos lidos'}</span><span>{run.itemCount} {run.itemCount === 1 ? 'registro nesta execução' : 'registros nesta execução'}</span>{run.error && <span className="sync-run-error">{run.error}</span>}</div>
      {page.isLoading && !items.length && <div className="sync-run-loading"><RefreshCw size={15}/><span>Carregando documentos…</span></div>}
      {page.isError && <div className="sync-run-feedback" role="alert">Não foi possível carregar os documentos desta sincronização. <button onClick={() => page.refetch()}>Tentar novamente</button></div>}
      {!page.isLoading && !page.isError && !items.length && <div className="sync-run-empty">Nenhuma alteração foi encontrada nesta execução.</div>}
      {!!items.length && <ol className="sync-run-items">{items.map(item => <li key={item.id}><span className="activity-provider-icon"><FileText size={16}/></span><div><strong>{item.title}</strong><p>{payloadText(item.candidate?.content) || 'Documento sincronizado sem prévia de texto.'}</p></div><span className="activity-status">{changeLabels[item.changeType]}</span><time dateTime={item.createdAt}>{formatDate(item.createdAt)}</time></li>)}</ol>}
      {page.data?.nextCursor && <button className="secondary-button sync-run-more" onClick={() => { setPreviousItems(items); setCursor(page.data!.nextCursor); }}>Carregar mais documentos</button>}
    </div>}
  </article>;
}

export function IntegrationCandidatesPanel({ workspaceId, projectId, role }: { workspaceId: string; projectId: string; role?: WorkspaceRole }) {
  const runs = useQuery<CursorPage<GoogleSyncRun>>({ queryKey: ['google-sync-runs', workspaceId], queryFn: () => api(`/workspaces/${workspaceId}/integrations/google/sync-runs`) });
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);
  const records = runs.data?.items ?? [];
  return <section className="list-page integrations-page"><header className="integrations-heading"><div><p className="section-kicker">Integrações</p><h1>Conexões e sincronização</h1><p>Gerencie as fontes que alimentam seus requisitos e acompanhe o que mudou.</p></div></header><GoogleDrivePanel workspaceId={workspaceId} projectId={projectId} role={role}/>
    <section className="integration-activity" aria-labelledby="integration-activity-title"><header><div><p className="section-kicker">Auditoria</p><h2 id="integration-activity-title">Atividade de sincronização</h2><p>Abra uma sincronização para consultar somente os documentos que ela alterou.</p></div><span className="count-summary">{records.length} {records.length === 1 ? 'sincronização' : 'sincronizações'}</span></header>
      {runs.isLoading && <div className="integration-activity-state" aria-live="polite"><span className="loading-ring"/><strong>Carregando sincronizações…</strong></div>}
      {runs.isError && <div className="integration-activity-state" role="alert"><span className="state-symbol">!</span><strong>Não foi possível carregar a atividade</strong><span>{runs.error.message}</span><button className="secondary-button" onClick={() => runs.refetch()}>Tentar novamente</button></div>}
      {!runs.isLoading && !runs.isError && !records.length && <div className="integration-activity-empty"><span><FolderSync size={22}/></span><strong>Nenhuma sincronização registrada</strong><p>Quando uma pasta for sincronizada, cada execução aparecerá aqui como uma pasta expansível.</p></div>}
      {!runs.isLoading && !runs.isError && !!records.length && <div className="sync-run-list">{records.map(run => <SyncRunAccordion key={run.id} workspaceId={workspaceId} run={run} expanded={expandedRunId === run.id} onToggle={() => setExpandedRunId(current => current === run.id ? null : run.id)}/>)}</div>}
    </section></section>;
}
