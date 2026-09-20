import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { Check, FolderOpen, FolderSync, Link2, RefreshCcw, Search, X } from 'lucide-react';
import { Dialog } from '../../components/ui/Dialog';
import { api } from '../../lib/api';
import type { WorkspaceRole } from '../../lib/types';

type Connection = { kind: 'GOOGLE' | 'GITHUB'; status: 'CONNECTED' | 'DISCONNECTED'; accountLabel?: string | null };
type DriveFolder = { id: string; name: string; modifiedTime?: string; ownership: 'OWNED' | 'SHARED' };
type ProjectSummary = { id: string; name: string; key: string };
type FolderLink = { id: string; externalId: string; name: string; projectId?: string | null; project?: ProjectSummary | null; lastSyncedAt?: string | null; syncStatus?: 'IDLE' | 'RUNNING' | 'COMPLETED' | 'FAILED'; syncError?: string | null; _count?: { sources: number } };
type FolderSearchResponse = { files: DriveFolder[]; nextPageToken?: string };
type WorkspaceProjects = { id: string; projects: ProjectSummary[] };

function syncedLabel(link: FolderLink) {
  if (link.syncStatus === 'RUNNING') return 'Sincronizando agora';
  if (link.syncStatus === 'FAILED') return 'Sincronização com falha';
  if (!link.lastSyncedAt) return 'Primeira sincronização pendente';
  return `Sincronizada em ${new Date(link.lastSyncedAt).toLocaleString('pt-BR')}`;
}

export function GoogleDrivePanel({ workspaceId, projectId: currentProjectId, role }: { workspaceId: string; projectId: string; role?: WorkspaceRole }) {
  const client = useQueryClient();
  const owner = role === 'OWNER';
  const [projectId, setProjectId] = useState(currentProjectId);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [folderQuery, setFolderQuery] = useState('');
  const [feedback, setFeedback] = useState<string | null>(() => {
    const query = new URLSearchParams(window.location.search);
    return query.get('integration') === 'google' && query.get('status') === 'connected' ? 'Google Drive conectado. Agora escolha uma pasta para iniciar a sincronização.' : null;
  });
  const integrations = useQuery<Connection[]>({ queryKey: ['integrations', workspaceId], queryFn: () => api(`/workspaces/${workspaceId}/integrations`) });
  const workspaces = useQuery<WorkspaceProjects[]>({ queryKey: ['workspaces'], queryFn: () => api('/workspaces'), enabled: owner });
  const projects = workspaces.data?.find(item => item.id === workspaceId)?.projects ?? [];
  const connected = Boolean(integrations.data?.find(item => item.kind === 'GOOGLE' && item.status === 'CONNECTED'));
  const links = useQuery<FolderLink[]>({ queryKey: ['google-folder-links', workspaceId], queryFn: () => api(`/workspaces/${workspaceId}/integrations/google/folder-links`), enabled: connected && owner });
  const normalizedQuery = folderQuery.trim();
  const folders = useQuery<FolderSearchResponse>({ queryKey: ['google-folders', workspaceId, normalizedQuery], queryFn: () => api(`/workspaces/${workspaceId}/integrations/google/folders${normalizedQuery ? `?query=${encodeURIComponent(normalizedQuery)}` : ''}`), enabled: connected && owner && pickerOpen });
  const availableFolders = useMemo(() => (folders.data?.files ?? []).filter(folder => !links.data?.some(link => link.externalId === folder.id)), [folders.data?.files, links.data]);
  const ownedFolders = useMemo(() => availableFolders.filter(folder => folder.ownership === 'OWNED'), [availableFolders]);
  const sharedFolders = useMemo(() => availableFolders.filter(folder => folder.ownership !== 'OWNED'), [availableFolders]);

  useEffect(() => { setProjectId(currentProjectId); }, [currentProjectId]);

  const connect = useMutation({ mutationFn: () => api<{ authorizationUrl: string }>(`/workspaces/${workspaceId}/integrations/google/oauth/start`), onSuccess: ({ authorizationUrl }) => window.location.assign(authorizationUrl) });
  const link = useMutation({
    mutationFn: (folder: DriveFolder) => api(`/workspaces/${workspaceId}/integrations/google/folder-links`, { method: 'POST', body: JSON.stringify({ externalId: folder.id, name: folder.name, projectId }) }),
    onSuccess: async (_, folder) => {
      setPickerOpen(false); setFolderQuery('');
      setFeedback(`“${folder.name}” foi vinculada e a primeira sincronização foi iniciada.`);
      await Promise.all([client.invalidateQueries({ queryKey: ['google-folder-links', workspaceId] }), client.invalidateQueries({ queryKey: ['integration-candidates', workspaceId] }), client.invalidateQueries({ queryKey: ['requirements'] }), client.invalidateQueries({ queryKey: ['folders', workspaceId] })]);
    },
  });
  const sync = useMutation({ mutationFn: (id: string) => api(`/workspaces/${workspaceId}/integrations/google/folder-links/${id}/sync`, { method: 'POST' }), onSuccess: async () => { setFeedback('Sincronização concluída. A atividade foi atualizada.'); await Promise.all([client.invalidateQueries({ queryKey: ['google-folder-links', workspaceId] }), client.invalidateQueries({ queryKey: ['integration-candidates', workspaceId] }), client.invalidateQueries({ queryKey: ['requirements'] })]); } });

  if (role === 'VIEWER') return null;

  return <section className="integration-provider" aria-labelledby="drive-title">
    <header className="integration-provider-header">
      <span className="integration-provider-mark" aria-hidden="true"><FolderSync size={22}/></span>
      <div><div className="integration-provider-title"><h2 id="drive-title">Google Drive</h2>{connected && <span className="connection-badge"><Check size={12}/> Conectado</span>}</div><p>Sincronize pastas do Drive com projetos do ATHENA e acompanhe cada alteração importada.</p></div>
      {connected && owner && <button className="primary-button integration-link-trigger" type="button" onClick={() => setPickerOpen(true)}><Link2 size={15}/> Vincular pasta</button>}
    </header>

    {feedback && <div className="integration-feedback" role="status"><Check size={16}/><span>{feedback}</span><button type="button" aria-label="Fechar aviso" onClick={() => setFeedback(null)}><X size={14}/></button></div>}
    {integrations.isLoading && <div className="integration-provider-loading" aria-live="polite"><span className="loading-ring"/><span>Verificando conexão com o Google Drive…</span></div>}
    {integrations.isError && <div className="integration-provider-error" role="alert"><span>Não foi possível verificar a conexão: {integrations.error.message}</span><button className="secondary-button" onClick={() => integrations.refetch()}>Tentar novamente</button></div>}

    {!integrations.isLoading && !integrations.isError && !connected && <div className="integration-connect-state"><div><strong>Conecte sua conta do Google</strong><span>O ATHENA solicitará acesso somente aos arquivos necessários para a sincronização.</span></div>{owner ? <button className="primary-button" disabled={connect.isPending} onClick={() => connect.mutate()}>{connect.isPending ? 'Abrindo Google…' : 'Conectar Google Drive'}</button> : <span className="permission-note">Somente owners podem conectar uma conta.</span>}{connect.error && <div className="inline-error" role="alert">{connect.error.message}</div>}</div>}

    {connected && owner && <section className="linked-folders" aria-labelledby="linked-folders-title">
      <header><div><h3 id="linked-folders-title">Pastas vinculadas</h3><p>{links.data?.length ? `${links.data.length} ${links.data.length === 1 ? 'pasta alimenta' : 'pastas alimentam'} este workspace.` : 'Vincule uma pasta para trazer documentos ao ATHENA.'}</p></div>{links.data?.length ? <span className="linked-folders-count">{links.data.length}</span> : null}</header>
      {links.isLoading && <div className="drive-loading"><span className="loading-ring"/> Carregando pastas vinculadas…</div>}
      {links.isError && <div className="integration-provider-error" role="alert"><span>Não foi possível carregar as pastas: {links.error.message}</span><button className="secondary-button" onClick={() => links.refetch()}>Tentar novamente</button></div>}
      {!links.isLoading && !links.isError && !links.data?.length && <button className="linked-folders-empty" type="button" onClick={() => setPickerOpen(true)}><span><FolderOpen size={20}/></span><strong>Nenhuma pasta vinculada</strong><small>Escolha uma pasta do Drive para começar.</small><b>Vincular primeira pasta</b></button>}
      <div className="linked-folder-list">{links.data?.map(item => {
        const syncing = (sync.isPending && sync.variables === item.id) || item.syncStatus === 'RUNNING';
        return <article key={item.id} className={`linked-folder-card ${item.syncStatus === 'FAILED' ? 'has-error' : ''}`}><span className="linked-folder-icon"><FolderOpen size={18}/></span><div className="linked-folder-main"><strong>{item.name}</strong><span>{item.project ? `${item.project.key} · ${item.project.name}` : 'Projeto não disponível'}</span></div><div className="linked-folder-meta"><span className={`sync-state sync-${item.syncStatus?.toLowerCase() ?? 'idle'}`}><i/>{syncedLabel(item)}</span><small>{item._count?.sources ?? 0} documento{item._count?.sources === 1 ? '' : 's'}</small></div><button className="secondary-button" disabled={syncing} onClick={() => sync.mutate(item.id)}><RefreshCcw size={14}/>{syncing ? 'Sincronizando…' : 'Sincronizar'}</button>{item.syncStatus === 'FAILED' && <p className="linked-folder-error" role="alert">{item.syncError ?? 'Não foi possível sincronizar esta pasta.'}</p>}</article>;
      })}</div>
      {sync.error && <div className="inline-error" role="alert">{sync.error.message}</div>}
    </section>}

    {pickerOpen && <Dialog title="Vincular pasta do Google Drive" onClose={() => !link.isPending && setPickerOpen(false)} closeDisabled={link.isPending} className="drive-link-dialog">
      <p className="drive-link-dialog-lead">Escolha o projeto de destino e uma pasta. A primeira sincronização começa ao confirmar.</p>
      <div className="drive-link-fields"><label>Projeto de destino<select value={projectId} onChange={event => setProjectId(event.target.value)} disabled={link.isPending}><option value="">Selecione um projeto</option>{projects.map(project => <option key={project.id} value={project.id}>{project.key} · {project.name}</option>)}</select></label><label>Buscar no Drive<span className="drive-search"><Search size={15}/><input value={folderQuery} onChange={event => setFolderQuery(event.target.value)} placeholder="Nome da pasta" autoFocus disabled={link.isPending}/>{folderQuery && <button type="button" aria-label="Limpar busca" onClick={() => setFolderQuery('')}><X size={14}/></button>}</span></label></div>
      <div className="drive-dialog-results" aria-live="polite">{folders.isLoading && <div className="drive-dialog-state"><span className="loading-ring"/> Buscando pastas…</div>}{folders.isError && <div className="integration-provider-error" role="alert"><span>{folders.error.message}</span><button className="secondary-button" onClick={() => folders.refetch()}>Tentar novamente</button></div>}{!folders.isLoading && !folders.isError && <div className="drive-folder-groups"><DriveFolderGroup title="Minhas pastas" description="Pastas da conta Google conectada." folders={ownedFolders} emptyMessage={normalizedQuery ? 'Nenhuma pasta sua encontrada com essa busca.' : 'Nenhuma pasta sua disponível para vincular.'} projectId={projectId} pending={link.isPending} pendingFolderId={link.variables?.id} onLink={(folder) => link.mutate(folder)}/><DriveFolderGroup title="Compartilhadas comigo" description="Inclui pastas compartilhadas e Drives compartilhados." folders={sharedFolders} emptyMessage={normalizedQuery ? 'Nenhuma pasta compartilhada encontrada com essa busca.' : 'Nenhuma pasta compartilhada disponível para vincular.'} projectId={projectId} pending={link.isPending} pendingFolderId={link.variables?.id} onLink={(folder) => link.mutate(folder)}/></div>}</div>
      {!projectId && <small className="drive-picker-hint">Escolha um projeto para habilitar as pastas.</small>}
      {link.error && <div className="inline-error" role="alert">{link.error.message}</div>}
    </Dialog>}
  </section>;
}

function DriveFolderGroup({ title, description, folders, emptyMessage, projectId, pending, pendingFolderId, onLink }: { title: string; description: string; folders: DriveFolder[]; emptyMessage: string; projectId: string; pending: boolean; pendingFolderId?: string; onLink: (folder: DriveFolder) => void }) {
  const headingId = title === 'Minhas pastas' ? 'owned-drive-folders' : 'shared-drive-folders';
  return <section className="drive-folder-group" aria-labelledby={headingId}>
    <header><div><h3 id={headingId}>{title}</h3><p>{description}</p></div><span>{folders.length}</span></header>
    {folders.length ? <div>{folders.map(folder => <button className="drive-folder-option" key={folder.id} type="button" disabled={pending || !projectId} onClick={() => onLink(folder)}><span className="linked-folder-icon"><FolderOpen size={16}/></span><span><strong>{folder.name}</strong><small>{folder.modifiedTime ? `Alterada em ${new Date(folder.modifiedTime).toLocaleDateString('pt-BR')}` : 'Pasta do Google Drive'}</small></span><b>{pending && pendingFolderId === folder.id ? 'Vinculando…' : 'Vincular'}</b></button>)}</div> : <div className="drive-folder-group-empty"><FolderOpen size={17}/><span>{emptyMessage}</span></div>}
  </section>;
}
