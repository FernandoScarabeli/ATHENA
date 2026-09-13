import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Check, ChevronDown, FolderSync, Link2, RefreshCcw, Search, X } from 'lucide-react';
import { api } from '../../lib/api';
import type { WorkspaceRole } from '../../lib/types';

type Connection = { kind: 'GOOGLE' | 'GITHUB'; status: 'CONNECTED' | 'DISCONNECTED' };
type DriveFolder = { id: string; name: string; modifiedTime?: string };
type FolderLink = { id: string; externalId: string; name: string; projectId?: string | null; lastSyncedAt?: string | null; syncStatus?: 'IDLE' | 'RUNNING' | 'COMPLETED' | 'FAILED'; syncError?: string | null; _count?: { sources: number } };
type FolderSearchResponse = { files: DriveFolder[]; nextPageToken?: string };
type WorkspaceProjects = { id: string; projects: Array<{ id: string; name: string; key: string }> };

function syncedLabel(link: FolderLink) {
  if (link.syncStatus === 'RUNNING') return 'Sincronizando';
  if (link.syncStatus === 'FAILED') return 'Precisa de atenção';
  if (!link.lastSyncedAt) return 'Aguardando primeira sincronização';
  return `Atualizado ${new Date(link.lastSyncedAt).toLocaleString('pt-BR')}`;
}

export function GoogleDrivePanel({ workspaceId, role }: { workspaceId: string; role?: WorkspaceRole }) {
  const client = useQueryClient();
  const owner = role === 'OWNER';
  const [projectId, setProjectId] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [folderQuery, setFolderQuery] = useState('');
  const integrations = useQuery<Connection[]>({ queryKey: ['integrations', workspaceId], queryFn: () => api(`/workspaces/${workspaceId}/integrations`) });
  const workspaces = useQuery<WorkspaceProjects[]>({ queryKey: ['workspaces'], queryFn: () => api('/workspaces'), enabled: owner });
  const projects = workspaces.data?.find(item => item.id === workspaceId)?.projects ?? [];
  const connected = integrations.data?.some((item) => item.kind === 'GOOGLE' && item.status === 'CONNECTED');
  const links = useQuery<FolderLink[]>({ queryKey: ['google-folder-links', workspaceId], queryFn: () => api(`/workspaces/${workspaceId}/integrations/google/folder-links`), enabled: Boolean(connected && owner) });
  const normalizedQuery = folderQuery.trim();
  const folders = useQuery<FolderSearchResponse>({
    queryKey: ['google-folders', workspaceId, normalizedQuery],
    queryFn: () => api(`/workspaces/${workspaceId}/integrations/google/folders${normalizedQuery ? `?query=${encodeURIComponent(normalizedQuery)}` : ''}`),
    enabled: Boolean(connected && owner && pickerOpen),
  });
  const availableFolders = useMemo(() => (folders.data?.files ?? []).filter(folder => !links.data?.some(link => link.externalId === folder.id)), [folders.data?.files, links.data]);
  const connect = useMutation({ mutationFn: () => api<{ authorizationUrl: string }>(`/workspaces/${workspaceId}/integrations/google/oauth/start`), onSuccess: ({ authorizationUrl }) => window.location.assign(authorizationUrl) });
  const link = useMutation({
    mutationFn: (folder: DriveFolder) => api(`/workspaces/${workspaceId}/integrations/google/folder-links`, { method: 'POST', body: JSON.stringify({ externalId: folder.id, name: folder.name, projectId }) }),
    onSuccess: async () => {
      setPickerOpen(false);
      setFolderQuery('');
      await Promise.all([client.invalidateQueries({ queryKey: ['google-folder-links', workspaceId] }), client.invalidateQueries({ queryKey: ['integration-candidates', workspaceId] })]);
    },
  });
  const sync = useMutation({ mutationFn: (id: string) => api(`/workspaces/${workspaceId}/integrations/google/folder-links/${id}/sync`, { method: 'POST' }), onSuccess: () => { client.invalidateQueries({ queryKey: ['google-folder-links', workspaceId] }); client.invalidateQueries({ queryKey: ['integration-candidates', workspaceId] }); } });

  if (role === 'VIEWER') return null;

  return <section className="drive-panel" aria-labelledby="drive-title">
    <div className="drive-intro"><p className="section-kicker">Google Drive</p><h2 id="drive-title">Pastas vinculadas</h2><p>Escolha uma pasta do Drive e deixe o restante acontecer. Mudanças são verificadas a cada 10 minutos; o que você salva aqui é enviado imediatamente.</p><span className="drive-sync-note"><RefreshCcw size={12}/> Sincronização automática ativa</span></div>
    {!connected && <div className="drive-empty"><FolderSync size={20}/><span>Conecte o Google Drive para escolher uma pasta.</span>{owner && <button className="primary-button" disabled={connect.isPending} onClick={() => connect.mutate()}>{connect.isPending ? 'Abrindo Google…' : 'Conectar Google Drive'}</button>}{connect.error && <div className="inline-error" role="alert">{connect.error.message}</div>}</div>}
    {connected && owner && <div className="drive-connected">
      <div className="drive-links-header"><div><strong>Pastas sincronizadas</strong><span>{links.data?.length ?? 0} vínculo{links.data?.length === 1 ? '' : 's'} ativo{links.data?.length === 1 ? '' : 's'}</span></div><button className="drive-add-button" type="button" onClick={() => setPickerOpen(current => !current)} aria-expanded={pickerOpen}><Link2 size={14}/>{pickerOpen ? 'Fechar seletor' : 'Vincular pasta'}<ChevronDown size={13}/></button></div>
      <div className="drive-folder-list">
        {links.isLoading && <span className="drive-loading">Carregando vínculos…</span>}
        {!links.isLoading && !links.data?.length && <div className="drive-no-links"><FolderSync size={17}/><span>Nenhuma pasta vinculada ainda.</span></div>}
        {links.data?.map(item => <article key={item.id} className={item.syncStatus === 'FAILED' ? 'drive-link-card has-error' : 'drive-link-card'}><span className="drive-folder-icon"><FolderSync size={16}/></span><span className="drive-link-copy"><strong>{item.name}</strong><small><b className={`sync-dot ${item.syncStatus === 'FAILED' ? 'failed' : item.syncStatus === 'RUNNING' ? 'running' : ''}`}/>{syncedLabel(item)} · {item._count?.sources ?? 0} US</small>{item.syncStatus === 'FAILED' && <small className="inline-error">{item.syncError ?? 'Falha na sincronização'}</small>}</span><button className="secondary-button drive-sync-button" disabled={sync.isPending || item.syncStatus === 'RUNNING'} onClick={() => sync.mutate(item.id)}><RefreshCcw size={13}/>{item.syncStatus === 'RUNNING' || sync.isPending ? 'Sincronizando…' : 'Sincronizar'}</button></article>)}
      </div>
      {pickerOpen && <div className="drive-picker" aria-label="Vincular nova pasta do Google Drive"><header><div><strong>Vincular uma pasta</strong><span>A primeira importação acontece assim que você confirmar.</span></div><button type="button" className="icon-button" aria-label="Fechar seletor" onClick={() => setPickerOpen(false)}><X size={15}/></button></header><label className="drive-project-select"><span>Projeto de destino</span><select value={projectId} onChange={event => setProjectId(event.target.value)}><option value="">Selecione um projeto</option>{projects.map(project => <option key={project.id} value={project.id}>{project.key} · {project.name}</option>)}</select></label><label className="drive-search"><Search size={15}/><input value={folderQuery} onChange={event => setFolderQuery(event.target.value)} placeholder="Buscar pasta no Google Drive" autoFocus/><button type="button" aria-label="Limpar busca" onClick={() => setFolderQuery('')} disabled={!folderQuery}><X size={14}/></button></label><div className="drive-search-results" aria-live="polite">{folders.isLoading && <span className="drive-loading">Buscando pastas…</span>}{!folders.isLoading && availableFolders.map(folder => <button key={folder.id} type="button" disabled={link.isPending || !projectId} onClick={() => link.mutate(folder)}><span className="drive-folder-icon"><FolderSync size={15}/></span><span><strong>{folder.name}</strong><small>{folder.modifiedTime ? `Alterada ${new Date(folder.modifiedTime).toLocaleDateString('pt-BR')}` : 'Pasta do Google Drive'}</small></span><span className="drive-link-action">{link.isPending ? 'Vinculando…' : <><Check size={13}/> Vincular</>}</span></button>)}{!folders.isLoading && !availableFolders.length && <span className="drive-search-empty">{normalizedQuery ? 'Nenhuma pasta encontrada com esse nome.' : 'Digite um nome para filtrar ou escolha entre as pastas recentes.'}</span>}</div>{!projectId && <small className="drive-picker-hint">Escolha o projeto antes de vincular a pasta.</small>}</div>}
      {(folders.error || links.error || link.error || sync.error) && <div className="inline-error" role="alert">{(folders.error || links.error || link.error || sync.error)?.message}</div>}
    </div>}
  </section>;
}
