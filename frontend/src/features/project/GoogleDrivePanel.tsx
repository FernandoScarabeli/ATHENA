import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown, FolderOpen, FolderSync, Link2, RefreshCcw, Search, Unlink, X } from 'lucide-react';
import { Dialog } from '../../components/ui/Dialog';
import { api } from '../../lib/api';
import type { WorkspaceRole } from '../../lib/types';
import { DocumentMenu } from './DocumentMenu';

type Connection = { kind: 'GOOGLE' | 'GITHUB'; status: 'CONNECTED' | 'DISCONNECTED'; accountLabel?: string | null };
type DriveFolder = { id: string; name: string; modifiedTime?: string; ownership: 'OWNED' | 'SHARED' };
type ProjectSummary = { id: string; name: string; key: string };
type FolderLink = { id: string; externalId: string; name: string; projectId?: string | null; isExportRoot?: boolean; project?: ProjectSummary | null; lastSyncedAt?: string | null; syncStatus?: 'IDLE' | 'RUNNING' | 'COMPLETED' | 'FAILED'; syncError?: string | null; _count?: { sources: number } };
type FolderSearchResponse = { files: DriveFolder[]; nextPageToken?: string };
type WorkspaceProjects = { id: string; projects: ProjectSummary[] };

function syncedLabel(link: FolderLink) {
  if (link.syncStatus === 'RUNNING') return 'Sincronizando agora';
  if (link.syncStatus === 'FAILED') return 'Sincronização com falha';
  if (!link.lastSyncedAt) return 'Primeira sincronização pendente';
  return `Sincronizada em ${new Date(link.lastSyncedAt).toLocaleString('pt-BR')}`;
}

export function GoogleDrivePanel({ workspaceId, projectId: currentProjectId, role, active = true }: { workspaceId: string; projectId: string; role?: WorkspaceRole; active?: boolean }) {
  const client = useQueryClient();
  const owner = role === 'OWNER';
  const canManageProjectIntegration = owner || role === 'MANAGER';
  const [projectId, setProjectId] = useState(currentProjectId);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [disconnectPromptOpen, setDisconnectPromptOpen] = useState(false);
  const [folderQuery, setFolderQuery] = useState('');
  const [feedback, setFeedback] = useState<string | null>(() => {
    const query = new URLSearchParams(window.location.search);
    return query.get('integration') === 'google' && query.get('status') === 'connected' && (!query.get('workspaceId') || query.get('workspaceId') === workspaceId) ? 'Google Drive conectado. Agora escolha uma pasta para iniciar a sincronização.' : null;
  });
  const integrations = useQuery<Connection[]>({ queryKey: ['integrations', workspaceId], queryFn: () => api(`/workspaces/${workspaceId}/integrations`), enabled: active });
  const workspaces = useQuery<WorkspaceProjects[]>({ queryKey: ['workspaces'], queryFn: () => api('/workspaces'), enabled: canManageProjectIntegration && active });
  const projects = workspaces.data?.find(item => item.id === workspaceId)?.projects ?? [];
  const googleConnection = integrations.data?.find(item => item.kind === 'GOOGLE' && item.status === 'CONNECTED');
  const connected = Boolean(googleConnection);
  const links = useQuery<FolderLink[]>({ queryKey: ['google-folder-links', workspaceId], queryFn: () => api(`/workspaces/${workspaceId}/integrations/google/folder-links`), enabled: active && connected && canManageProjectIntegration, refetchInterval: (query) => !active ? false : query.state.data?.some(item => item.syncStatus === 'RUNNING') ? 2_000 : 10_000, refetchIntervalInBackground: false });
  const normalizedQuery = folderQuery.trim();
  const folders = useQuery<FolderSearchResponse>({ queryKey: ['google-folders', workspaceId, normalizedQuery], queryFn: () => api(`/workspaces/${workspaceId}/integrations/google/folders${normalizedQuery ? `?query=${encodeURIComponent(normalizedQuery)}` : ''}`), enabled: active && connected && canManageProjectIntegration && pickerOpen });
  const availableFolders = useMemo(() => (folders.data?.files ?? []).filter(folder => !links.data?.some(link => link.externalId === folder.id)), [folders.data?.files, links.data]);
  const ownedFolders = useMemo(() => availableFolders.filter(folder => folder.ownership === 'OWNED'), [availableFolders]);
  const sharedFolders = useMemo(() => availableFolders.filter(folder => folder.ownership !== 'OWNED'), [availableFolders]);

  useEffect(() => { setProjectId(currentProjectId); }, [currentProjectId]);

  const connect = useMutation({ mutationFn: () => api<{ authorizationUrl: string }>(`/workspaces/${workspaceId}/integrations/google/oauth/start`), onSuccess: ({ authorizationUrl }) => window.location.assign(authorizationUrl) });
  const disconnect = useMutation({
    mutationFn: () => api(`/workspaces/${workspaceId}/integrations/GOOGLE`, { method: 'DELETE' }),
    onSuccess: async () => {
      setDisconnectPromptOpen(false);
      setFeedback('Google Drive desconectado. As pastas vinculadas e os documentos importados foram mantidos.');
      await Promise.all([
        client.invalidateQueries({ queryKey: ['integrations', workspaceId] }),
        client.invalidateQueries({ queryKey: ['google-folder-links', workspaceId] }),
        client.invalidateQueries({ queryKey: ['google-sync-runs', workspaceId] }),
      ]);
    },
  });
  const link = useMutation({
    mutationFn: (folder: DriveFolder) => api<FolderLink>(`/workspaces/${workspaceId}/integrations/google/folder-links`, { method: 'POST', body: JSON.stringify({ externalId: folder.id, name: folder.name, projectId }) }),
    onSuccess: async (createdLink, folder) => {
      setPickerOpen(false); setFolderQuery('');
      setFeedback(createdLink.isExportRoot ? `“${folder.name}” foi vinculada como raiz. O conteúdo existente e as novas alterações serão exportados automaticamente.` : `“${folder.name}” foi vinculada para importar conteúdo ao projeto.`);
      await Promise.all([client.invalidateQueries({ queryKey: ['google-folder-links', workspaceId] }), client.invalidateQueries({ queryKey: ['integration-candidates', workspaceId] }), client.invalidateQueries({ queryKey: ['google-sync-runs', workspaceId] }), client.invalidateQueries({ queryKey: ['requirements'] }), client.invalidateQueries({ queryKey: ['folders', currentProjectId] })]);
    },
  });
  const sync = useMutation({
    mutationFn: (id: string) => api<{ skipped?: boolean; status?: string }>(`/workspaces/${workspaceId}/integrations/google/folder-links/${id}/sync`, { method: 'POST' }),
    onSuccess: async (result) => {
      setFeedback(result.skipped
        ? 'Já existe uma sincronização em andamento. Aguarde e confira o estado da pasta novamente.'
        : result.status === 'COMPLETED'
          ? 'Sincronização concluída. A atividade foi atualizada.'
          : 'Solicitação de sincronização recebida. Confira o estado da pasta em instantes.');
      await Promise.all([client.invalidateQueries({ queryKey: ['google-folder-links', workspaceId] }), client.invalidateQueries({ queryKey: ['integration-candidates', workspaceId] }), client.invalidateQueries({ queryKey: ['google-sync-runs', workspaceId] }), client.invalidateQueries({ queryKey: ['requirements'] }), client.invalidateQueries({ queryKey: ['folders', currentProjectId] })]);
    },
  });
  const chooseRoot = useMutation({
    mutationFn: (linkId: string) => api(`/workspaces/${workspaceId}/integrations/google/folder-links/${linkId}/export-root`, { method: 'POST' }),
    onSuccess: async () => {
      setFeedback('A raiz de exportação deste projeto foi atualizada. O conteúdo existente e as novas alterações serão enviados automaticamente ao Drive.');
      await client.invalidateQueries({ queryKey: ['google-folder-links', workspaceId] });
    },
  });

  return <div className="google-drive-panel">
    <header className="integration-section-intro"><h2 id="storage-title">Armazenamento e sincronização</h2><p>Importe de várias pastas e use uma raiz por projeto para exportar o conteúdo criado no ATHENA.</p></header>
    <section className="integration-provider" aria-labelledby="drive-title">
    <header className="integration-provider-header">
      <span className="integration-provider-mark" aria-hidden="true"><FolderSync size={22}/></span>
      <div><div className="integration-provider-title"><h3 id="drive-title">Google Drive</h3></div><p>{integrations.isLoading ? 'Verificando conexão…' : integrations.isError ? 'Não foi possível consultar a conexão' : connected ? `Conectado como ${googleConnection?.accountLabel || 'conta autorizada'}` : 'Ainda não conectado'}</p></div>
      {connected && canManageProjectIntegration && <div className="integration-actions">
        <DocumentMenu label={<>Ações <ChevronDown size={14}/></>}>
          {owner && <button type="button" data-menu-action onClick={() => connect.mutate()} disabled={connect.isPending}><RefreshCcw size={15}/><span>{connect.isPending ? 'Abrindo Google…' : 'Trocar conta'}</span></button>}
          {owner && <button type="button" data-menu-action className="document-danger" onClick={() => setDisconnectPromptOpen(true)}><Unlink size={15}/><span>Desconectar</span></button>}
          <button type="button" data-menu-action onClick={() => setPickerOpen(true)}><Link2 size={15}/><span>Vincular pasta</span></button>
        </DocumentMenu>
      </div>}
    </header>

    {connect.error && connected && <div className="integration-actions-error" role="alert">Não foi possível iniciar a troca de conta: {connect.error.message}</div>}
    {disconnect.error && <div className="integration-actions-error" role="alert">Não foi possível desconectar: {disconnect.error.message}</div>}
    {feedback && <div className="integration-feedback" role="status"><Check size={16}/><span>{feedback}</span><button type="button" aria-label="Fechar aviso" onClick={() => setFeedback(null)}><X size={14}/></button></div>}
    {integrations.isLoading && <div className="integration-provider-loading" aria-live="polite"><span className="loading-ring"/><span>Verificando conexão com o Google Drive…</span></div>}
    {integrations.isError && <div className="integration-provider-error" role="alert"><span>Não foi possível verificar a conexão: {integrations.error.message}</span><button className="secondary-button" onClick={() => integrations.refetch()}>Tentar novamente</button></div>}

    {!integrations.isLoading && !integrations.isError && !connected && <div className="integration-connect-state"><div><strong>Conecte sua conta do Google</strong><span>O ATHENA solicitará acesso somente aos arquivos necessários para a sincronização.</span></div>{owner ? <button className="primary-button" disabled={connect.isPending} onClick={() => connect.mutate()}>{connect.isPending ? 'Abrindo Google…' : 'Conectar Google Drive'}</button> : <span className="permission-note">Somente owners podem conectar uma conta.</span>}{connect.error && <div className="inline-error" role="alert">{connect.error.message}</div>}</div>}

    {connected && canManageProjectIntegration && <section className="linked-folders" aria-labelledby="linked-folders-title">
      <header><div><h3 id="linked-folders-title">Pastas vinculadas</h3><p>{links.data?.length ? `${links.data.length} pastas vinculadas para importar. Cada projeto mantém sua própria raiz de exportação.` : 'Vincule uma pasta para trazer documentos ao ATHENA.'}</p></div>{links.data?.length ? <span className="linked-folders-count">{links.data.length}</span> : null}</header>
      {links.isLoading && <div className="drive-loading"><span className="loading-ring"/> Carregando pastas vinculadas…</div>}
      {links.isError && <div className="integration-provider-error" role="alert"><span>Não foi possível carregar as pastas: {links.error.message}</span><button className="secondary-button" onClick={() => links.refetch()}>Tentar novamente</button></div>}
      {!links.isLoading && !links.isError && !links.data?.length && <button className="linked-folders-empty" type="button" onClick={() => setPickerOpen(true)}><span><FolderOpen size={20}/></span><strong>Nenhuma pasta vinculada</strong><small>Escolha uma pasta do Drive para começar.</small><b>Vincular primeira pasta</b></button>}
      <div className="linked-folder-list">{links.data?.map(item => {
        const syncing = (sync.isPending && sync.variables === item.id) || item.syncStatus === 'RUNNING';
        return <article key={item.id} className={`linked-folder-card ${item.syncStatus === 'FAILED' ? 'has-error' : ''}`}><span className="linked-folder-icon"><FolderOpen size={18}/></span><div className="linked-folder-main"><strong>{item.name} {item.isExportRoot && <span className="drive-root-badge">Raiz de exportação</span>}</strong><span>{item.project ? `${item.project.key} · ${item.project.name}` : 'Projeto não disponível'}</span></div><div className="linked-folder-meta"><span className={`sync-state sync-${item.syncStatus?.toLowerCase() ?? 'idle'}`}><i/>{syncedLabel(item)}</span><small>{item._count?.sources ?? 0} documento{item._count?.sources === 1 ? '' : 's'}</small></div><span className="linked-folder-card-actions">{canManageProjectIntegration && !item.projectId && currentProjectId && <button className="secondary-button" disabled={link.isPending} onClick={() => link.mutate({ id: item.externalId, name: item.name, ownership: 'SHARED' })}>{link.isPending && link.variables?.id === item.externalId ? 'Associando…' : 'Associar ao projeto'}</button>}{item.projectId === currentProjectId && !item.isExportRoot && canManageProjectIntegration && <button className="secondary-button" disabled={chooseRoot.isPending} onClick={() => chooseRoot.mutate(item.id)}>{chooseRoot.isPending && chooseRoot.variables === item.id ? 'Atualizando…' : 'Usar como raiz'}</button>}{canManageProjectIntegration && <button className="secondary-button" disabled={syncing} onClick={() => sync.mutate(item.id)}><RefreshCcw size={14}/>{syncing ? 'Sincronizando…' : 'Sincronizar'}</button>}</span>{item.syncStatus === 'FAILED' && <p className="linked-folder-error" role="alert">{item.syncError ?? 'Não foi possível sincronizar esta pasta.'}</p>}</article>;
      })}</div>
      {sync.error && <div className="inline-error" role="alert">{sync.error.message}</div>}
      {chooseRoot.error && <div className="inline-error" role="alert">{chooseRoot.error.message}</div>}
    </section>}

    {pickerOpen && <Dialog title="Vincular pasta do Google Drive" onClose={() => !link.isPending && setPickerOpen(false)} closeDisabled={link.isPending} className="drive-link-dialog">
      <p className="drive-link-dialog-lead">Escolha o projeto de destino e uma pasta. A primeira sincronização começa ao confirmar.</p>
      <div className="drive-link-fields"><label>Projeto de destino<select value={projectId} onChange={event => setProjectId(event.target.value)} disabled={link.isPending}><option value="">Selecione um projeto</option>{projects.map(project => <option key={project.id} value={project.id}>{project.key} · {project.name}</option>)}</select></label><label>Buscar no Drive<span className="drive-search"><Search size={15}/><input value={folderQuery} onChange={event => setFolderQuery(event.target.value)} placeholder="Nome da pasta" autoFocus disabled={link.isPending}/>{folderQuery && <button type="button" aria-label="Limpar busca" onClick={() => setFolderQuery('')}><X size={14}/></button>}</span></label></div>
      <div className="drive-dialog-results" aria-live="polite">{folders.isLoading && <div className="drive-dialog-state"><span className="loading-ring"/> Buscando pastas…</div>}{folders.isError && <div className="integration-provider-error" role="alert"><span>{folders.error.message}</span><button className="secondary-button" onClick={() => folders.refetch()}>Tentar novamente</button></div>}{!folders.isLoading && !folders.isError && <div className="drive-folder-groups"><DriveFolderGroup title="Minhas pastas" description="Pastas da conta Google conectada." folders={ownedFolders} emptyMessage={normalizedQuery ? 'Nenhuma pasta sua encontrada com essa busca.' : 'Nenhuma pasta sua disponível para vincular.'} projectId={projectId} pending={link.isPending} pendingFolderId={link.variables?.id} onLink={(folder) => link.mutate(folder)}/><DriveFolderGroup title="Compartilhadas comigo" description="Inclui pastas compartilhadas e Drives compartilhados." folders={sharedFolders} emptyMessage={normalizedQuery ? 'Nenhuma pasta compartilhada encontrada com essa busca.' : 'Nenhuma pasta compartilhada disponível para vincular.'} projectId={projectId} pending={link.isPending} pendingFolderId={link.variables?.id} onLink={(folder) => link.mutate(folder)}/></div>}</div>
      {!projectId && <small className="drive-picker-hint">Escolha um projeto para habilitar as pastas.</small>}
      {link.error && <div className="inline-error" role="alert">{link.error.message}</div>}
    </Dialog>}

    {disconnectPromptOpen && <Dialog title="Desconectar Google Drive" onClose={() => !disconnect.isPending && setDisconnectPromptOpen(false)} closeDisabled={disconnect.isPending} className="drive-disconnect-dialog">
      <p className="form-lead">A sincronização vai parar até você conectar novamente. As pastas vinculadas e os documentos que já foram importados serão mantidos.</p>
      <footer className="modal-footer"><button type="button" className="secondary-button" onClick={() => setDisconnectPromptOpen(false)} disabled={disconnect.isPending}>Cancelar</button><button type="button" className="primary-button danger-button" onClick={() => disconnect.mutate()} disabled={disconnect.isPending}>{disconnect.isPending ? 'Desconectando…' : 'Desconectar'}</button></footer>
    </Dialog>}
    </section>
  </div>;
}

function DriveFolderGroup({ title, description, folders, emptyMessage, projectId, pending, pendingFolderId, onLink }: { title: string; description: string; folders: DriveFolder[]; emptyMessage: string; projectId: string; pending: boolean; pendingFolderId?: string; onLink: (folder: DriveFolder) => void }) {
  const headingId = title === 'Minhas pastas' ? 'owned-drive-folders' : 'shared-drive-folders';
  return <section className="drive-folder-group" aria-labelledby={headingId}>
    <header><div><h3 id={headingId}>{title}</h3><p>{description}</p></div><span>{folders.length}</span></header>
    {folders.length ? <div>{folders.map(folder => <button className="drive-folder-option" key={folder.id} type="button" disabled={pending || !projectId} onClick={() => onLink(folder)}><span className="linked-folder-icon"><FolderOpen size={16}/></span><span><strong>{folder.name}</strong><small>{folder.modifiedTime ? `Alterada em ${new Date(folder.modifiedTime).toLocaleDateString('pt-BR')}` : 'Pasta do Google Drive'}</small></span><b>{pending && pendingFolderId === folder.id ? 'Vinculando…' : 'Vincular'}</b></button>)}</div> : <div className="drive-folder-group-empty"><FolderOpen size={17}/><span>{emptyMessage}</span></div>}
  </section>;
}
