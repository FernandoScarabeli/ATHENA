import { useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, Code2, FolderKanban, GitBranch, Link2, Search, Unlink, X } from 'lucide-react';
import { Dialog } from '../../components/ui/Dialog';
import { api } from '../../lib/api';
import type { WorkspaceRole } from '../../lib/types';
import { DocumentMenu } from './DocumentMenu';

type Connection = { id: string; kind: 'GITHUB' | 'OPENPROJECT' | 'GOOGLE'; status: 'CONNECTED' | 'DISCONNECTED'; accountLabel?: string | null };
type Mapping = { id: string; connectionId: string; resourceKind: string; externalId: string; externalName: string; settings?: Record<string, unknown> };
type Repo = { fullName: string; owner: string; name: string; private: boolean };
type OpProject = { id: number; name: string; identifier?: string };
type GhProject = { id: string; title: string; number: number; url: string; fields: Array<{ id: string; name: string; options?: Array<{ id: string; name: string }> }> };
type Picker = 'repository' | 'githubProject' | 'openproject' | null;
const pickerLabels = {
  repository: { title: 'Autorizar repositório do GitHub', lead: 'Escolha um repositório para publicar tarefas deste projeto.', search: 'Nome do repositório' },
  githubProject: { title: 'Autorizar GitHub Project', lead: 'Escolha o proprietário e depois um Project para este projeto.', search: 'Nome do proprietário ou Project' },
  openproject: { title: 'Autorizar projeto do OpenProject', lead: 'Escolha um projeto para publicar tarefas deste projeto.', search: 'Nome do projeto' },
};

export function TaskIntegrationsPanel({ workspaceId, projectId, role, active = true }: { workspaceId: string; projectId: string; role?: WorkspaceRole; active?: boolean }) {
  const client = useQueryClient();
  const owner = role === 'OWNER';
  const canManageProjectIntegrations = owner || role === 'MANAGER';
  const [githubToken, setGithubToken] = useState('');
  const [openUrl, setOpenUrl] = useState('');
  const [openToken, setOpenToken] = useState('');
  const [githubConnectOpen, setGithubConnectOpen] = useState(false);
  const [openProjectConnectOpen, setOpenProjectConnectOpen] = useState(false);
  const [picker, setPicker] = useState<Picker>(null);
  const [searches, setSearches] = useState({ repository: '', githubProject: '', openproject: '' });
  const [githubOwner, setGithubOwner] = useState<string | null>(null);
  const connections = useQuery<Connection[]>({ queryKey: ['integrations', workspaceId], queryFn: () => api(`/workspaces/${workspaceId}/integrations`), enabled: active });
  const mappings = useQuery<Mapping[]>({ queryKey: ['integration-mappings', projectId], queryFn: () => api(`/projects/${projectId}/integration-mappings`), enabled: active });
  const github = connections.data?.find(row => row.kind === 'GITHUB' && row.status === 'CONNECTED');
  const openproject = connections.data?.find(row => row.kind === 'OPENPROJECT' && row.status === 'CONNECTED');
  const repositories = useQuery<Repo[]>({ queryKey: ['github-repositories', workspaceId], queryFn: () => api(`/workspaces/${workspaceId}/integrations/github/repositories`), enabled: Boolean(active && canManageProjectIntegrations && github && (picker === 'repository' || picker === 'githubProject')) });
  const openProjects = useQuery<OpProject[]>({ queryKey: ['openproject-projects', workspaceId], queryFn: () => api(`/workspaces/${workspaceId}/integrations/openproject/projects`), enabled: Boolean(active && canManageProjectIntegrations && openproject && picker === 'openproject') });
  const ghProjects = useQuery<GhProject[]>({ queryKey: ['github-projects', workspaceId, githubOwner], queryFn: () => api(`/workspaces/${workspaceId}/integrations/github/projects?owner=${encodeURIComponent(githubOwner!)}`), enabled: Boolean(active && canManageProjectIntegrations && github && picker === 'githubProject' && githubOwner) });
  const invalidate = () => {
    void client.invalidateQueries({ queryKey: ['integrations', workspaceId] });
    void client.invalidateQueries({ queryKey: ['integration-mappings', projectId] });
    void client.invalidateQueries({ queryKey: ['integration-targets', projectId] });
    void client.invalidateQueries({ queryKey: ['github-repositories', workspaceId] });
    void client.invalidateQueries({ queryKey: ['openproject-projects', workspaceId] });
  };
  const connectGithub = useMutation({ mutationFn: () => api(`/workspaces/${workspaceId}/integrations/github/connect`, { method: 'POST', body: JSON.stringify({ token: githubToken }) }), onSuccess: () => { setGithubToken(''); setGithubConnectOpen(false); invalidate(); } });
  const connectOp = useMutation({ mutationFn: () => api(`/workspaces/${workspaceId}/integrations/openproject/connect`, { method: 'POST', body: JSON.stringify({ instanceUrl: openUrl, apiToken: openToken }) }), onSuccess: () => { setOpenToken(''); setOpenProjectConnectOpen(false); invalidate(); } });
  const disconnect = useMutation({ mutationFn: (kind: string) => api(`/workspaces/${workspaceId}/integrations/${kind}`, { method: 'DELETE' }), onSuccess: invalidate });
  const save = useMutation({ mutationFn: (input: { connectionId: string; resourceKind: string; externalId: string; externalName: string; settings?: Record<string, unknown> }) => api(`/projects/${projectId}/integration-mappings`, { method: 'POST', body: JSON.stringify(input) }), onSuccess: () => { invalidate(); setPicker(null); } });
  const remove = useMutation({ mutationFn: (id: string) => api(`/projects/${projectId}/integration-mappings/${id}`, { method: 'DELETE' }), onSuccess: invalidate });
  const ghTargets = mappings.data?.filter(row => row.resourceKind === 'GITHUB_REPOSITORY' || row.resourceKind === 'GITHUB_PROJECT') ?? [];
  const opTargets = mappings.data?.filter(row => row.resourceKind === 'OPENPROJECT_PROJECT') ?? [];
  const owners = [...new Set((repositories.data ?? []).map(row => row.owner).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const query = picker ? searches[picker].trim().toLocaleLowerCase('pt-BR') : '';
  const setSearch = (value: string) => { if (picker) setSearches(current => ({ ...current, [picker]: value })); };
  const authorized = (kind: string, id: string) => (mappings.data ?? []).some(row => row.resourceKind === kind && row.externalId === id);
  const openPicker = (next: Exclude<Picker, null>) => { save.reset(); setPicker(next); };

  return <section className="task-integration-settings" aria-labelledby="task-integrations-heading">
    <header className="integration-section-intro"><h2 id="task-integrations-heading">Tarefas externas</h2><p>Conecte os serviços e escolha onde as tarefas deste projeto podem ser publicadas.</p></header>
    <div className="task-provider-grid">
      <ProviderPanel name="GitHub" account={github?.accountLabel} connected={Boolean(github)} loading={connections.isLoading} error={connections.error} icon={<Code2 size={21}/>} onRetry={() => void connections.refetch()} actions={canManageProjectIntegrations && github ? <DocumentMenu className="task-service-actions-menu" label={<>Ações <ChevronDown size={14}/></>}>
        <button type="button" data-menu-action onClick={() => openPicker('repository')}><GitBranch size={15}/><span>Autorizar repositório</span></button>
        <button type="button" data-menu-action onClick={() => openPicker('githubProject')}><FolderKanban size={15}/><span>Autorizar Project</span></button>
        {owner && <button type="button" data-menu-action className="document-danger" disabled={disconnect.isPending} onClick={() => disconnect.mutate('GITHUB')}><Unlink size={15}/><span>{disconnect.isPending ? 'Desconectando…' : 'Desconectar'}</span></button>}
      </DocumentMenu> : !connections.isLoading && !connections.isError && !github && owner ? <button className="primary-button" type="button" aria-expanded={githubConnectOpen} aria-controls={githubConnectOpen ? 'github-connect-form' : undefined} disabled={connectGithub.isPending} onClick={() => setGithubConnectOpen(value => !value)}>{githubConnectOpen ? 'Cancelar' : 'Conectar'}</button> : null}>
        {!connections.isLoading && !connections.isError && !github && owner && githubConnectOpen && <form id="github-connect-form" className="task-connect-form" onSubmit={event => { event.preventDefault(); connectGithub.mutate(); }}><label>Personal access token<input type="password" value={githubToken} autoComplete="new-password" autoFocus onChange={event => setGithubToken(event.target.value)} placeholder="ghp_…"/></label><p className="task-provider-hint">Use um token com permissão para criar Issues nos repositórios autorizados.</p><button className="primary-button" disabled={!githubToken || connectGithub.isPending}>{connectGithub.isPending ? 'Validando…' : 'Conectar GitHub'}</button>{connectGithub.error && <p className="inline-error" role="alert">{connectGithub.error.message}</p>}</form>}
        {github && <MappingSection rows={ghTargets} loading={mappings.isLoading} error={mappings.error} onRetry={() => void mappings.refetch()} canManage={canManageProjectIntegrations} removing={remove.isPending} removingId={remove.variables} onRemove={id => remove.mutate(id)}/>}
      </ProviderPanel>
      <ProviderPanel name="OpenProject" account={openproject?.accountLabel} connected={Boolean(openproject)} loading={connections.isLoading} error={connections.error} icon={<span className="openproject-mark">OP</span>} onRetry={() => void connections.refetch()} actions={canManageProjectIntegrations && openproject ? <DocumentMenu className="task-service-actions-menu" label={<>Ações <ChevronDown size={14}/></>}>
        <button type="button" data-menu-action onClick={() => openPicker('openproject')}><FolderKanban size={15}/><span>Autorizar projeto</span></button>
        {owner && <button type="button" data-menu-action className="document-danger" disabled={disconnect.isPending} onClick={() => disconnect.mutate('OPENPROJECT')}><Unlink size={15}/><span>{disconnect.isPending ? 'Desconectando…' : 'Desconectar'}</span></button>}
      </DocumentMenu> : !connections.isLoading && !connections.isError && !openproject && owner ? <button className="primary-button" type="button" aria-expanded={openProjectConnectOpen} aria-controls={openProjectConnectOpen ? 'openproject-connect-form' : undefined} disabled={connectOp.isPending} onClick={() => setOpenProjectConnectOpen(value => !value)}>{openProjectConnectOpen ? 'Cancelar' : 'Conectar'}</button> : null}>
        {!connections.isLoading && !connections.isError && !openproject && owner && openProjectConnectOpen && <form id="openproject-connect-form" className="task-connect-form" onSubmit={event => { event.preventDefault(); connectOp.mutate(); }}><label>URL pública HTTPS da instância<input type="url" value={openUrl} autoFocus onChange={event => setOpenUrl(event.target.value)} placeholder="https://openproject.empresa.com"/></label><label>Token de API<input type="password" value={openToken} autoComplete="new-password" onChange={event => setOpenToken(event.target.value)} placeholder="Token da conta de serviço"/></label><button className="primary-button" disabled={!openUrl || !openToken || connectOp.isPending}>{connectOp.isPending ? 'Testando conexão…' : 'Conectar OpenProject'}</button>{connectOp.error && <p className="inline-error" role="alert">{connectOp.error.message}</p>}</form>}
        {openproject && <MappingSection rows={opTargets} loading={mappings.isLoading} error={mappings.error} onRetry={() => void mappings.refetch()} canManage={canManageProjectIntegrations} removing={remove.isPending} removingId={remove.variables} onRemove={id => remove.mutate(id)}/>}
      </ProviderPanel>
    </div>
    {!owner && <p className="permission-note">Somente Owner pode conectar ou desconectar contas. Gerência pode configurar os destinos deste projeto usando as conexões existentes.</p>}
    {disconnect.error && <div className="inline-error" role="alert">{disconnect.error.message}</div>}
    {remove.error && <div className="inline-error" role="alert">{remove.error.message}</div>}
    {picker && <Dialog title={pickerLabels[picker].title} onClose={() => { if (!save.isPending) setPicker(null); }} closeDisabled={save.isPending} className="drive-link-dialog task-target-dialog">
      <p className="drive-link-dialog-lead">{pickerLabels[picker].lead}</p>
      {picker === 'githubProject' && githubOwner && <button className="task-owner-back" type="button" onClick={() => setGithubOwner(null)} disabled={save.isPending}>← {githubOwner} · Trocar proprietário</button>}
      <label className="task-target-search">Buscar {picker === 'githubProject' && !githubOwner ? 'proprietário' : 'destino'}<span className="drive-search"><Search size={15}/><input value={searches[picker]} onChange={event => setSearch(event.target.value)} placeholder={pickerLabels[picker].search} disabled={save.isPending}/>{searches[picker] && <button type="button" aria-label="Limpar busca" onClick={() => setSearch('')}><X size={14}/></button>}</span></label>
      <div className="drive-dialog-results task-target-results" aria-live="polite">
        {picker === 'repository' && <PickerResults loading={repositories.isLoading} error={repositories.error} retry={() => void repositories.refetch()} empty={query ? 'Nenhum repositório encontrado com essa busca.' : 'Nenhum repositório disponível.'}>{repositories.data?.filter(row => row.fullName.toLocaleLowerCase('pt-BR').includes(query)).map(row => <TargetOption key={row.fullName} icon={<GitBranch size={17}/>} name={row.fullName} detail={row.private ? 'Repositório privado' : 'Repositório público'} authorized={authorized('GITHUB_REPOSITORY', row.fullName)} pending={save.isPending && save.variables?.externalId === row.fullName} disabled={save.isPending} onChoose={() => github && save.mutate({ connectionId: github.id, resourceKind: 'GITHUB_REPOSITORY', externalId: row.fullName, externalName: row.fullName })}/>)}</PickerResults>}
        {picker === 'openproject' && <PickerResults loading={openProjects.isLoading} error={openProjects.error} retry={() => void openProjects.refetch()} empty={query ? 'Nenhum projeto encontrado com essa busca.' : 'Nenhum projeto disponível.'}>{openProjects.data?.filter(row => `${row.name} ${row.identifier ?? ''}`.toLocaleLowerCase('pt-BR').includes(query)).map(row => <TargetOption key={row.id} icon={<FolderKanban size={17}/>} name={row.name} detail={row.identifier || 'Projeto OpenProject'} authorized={authorized('OPENPROJECT_PROJECT', String(row.id))} pending={save.isPending && save.variables?.externalId === String(row.id)} disabled={save.isPending} onChoose={() => openproject && save.mutate({ connectionId: openproject.id, resourceKind: 'OPENPROJECT_PROJECT', externalId: String(row.id), externalName: row.name })}/>)}</PickerResults>}
        {picker === 'githubProject' && !githubOwner && <PickerResults loading={repositories.isLoading} error={repositories.error} retry={() => void repositories.refetch()} empty={query ? 'Nenhum proprietário encontrado com essa busca.' : 'Nenhum proprietário disponível nos repositórios acessíveis.'}>{owners.filter(value => value.toLocaleLowerCase('pt-BR').includes(query)).map(value => <button className="task-owner-option" type="button" key={value} onClick={() => { setGithubOwner(value); setSearch(''); }}><span className="linked-folder-icon"><Code2 size={16}/></span><span><strong>{value}</strong><small>Ver GitHub Projects</small></span><b>Escolher</b></button>)}</PickerResults>}
        {picker === 'githubProject' && githubOwner && <PickerResults loading={ghProjects.isLoading} error={ghProjects.error} retry={() => void ghProjects.refetch()} empty={query ? 'Nenhum Project encontrado com essa busca.' : 'Nenhum Project disponível para este proprietário.'}>{ghProjects.data?.filter(row => row.title.toLocaleLowerCase('pt-BR').includes(query)).map(row => <TargetOption key={row.id} icon={<FolderKanban size={17}/>} name={row.title} detail={`${githubOwner} · Project #${row.number}`} authorized={authorized('GITHUB_PROJECT', row.id)} pending={save.isPending && save.variables?.externalId === row.id} disabled={save.isPending} onChoose={() => github && save.mutate({ connectionId: github.id, resourceKind: 'GITHUB_PROJECT', externalId: row.id, externalName: row.title, settings: { fields: row.fields } })}/>)}</PickerResults>}
      </div>
      {save.error && <div className="inline-error" role="alert">{save.error.message}</div>}
    </Dialog>}
  </section>;
}

function ProviderPanel({ name, account, connected, loading, error, icon, actions, onRetry, children }: { name: string; account?: string | null; connected: boolean; loading: boolean; error: Error | null; icon: ReactNode; actions: ReactNode; onRetry: () => void; children: ReactNode }) {
  return <article className="task-service-panel"><header className="task-service-header"><span className="integration-provider-mark">{icon}</span><div className="task-service-identity"><div className="integration-provider-title"><h3>{name}</h3><span className={`task-service-status ${connected ? 'is-connected' : ''} ${error ? 'is-error' : ''}`}>{loading ? 'Verificando…' : error ? 'Erro na conexão' : connected ? 'Conectado' : 'Desconectado'}</span></div><p>{loading ? 'Consultando conexão…' : error ? 'Não foi possível consultar a conexão' : connected ? `Conectado como ${account || 'conta autorizada'}` : 'Ainda não conectado'}</p></div>{actions && <div className="task-service-actions">{actions}</div>}</header>
    {loading && <div className="integration-provider-loading" aria-live="polite"><span className="loading-ring"/> Verificando conexão com {name}…</div>}
    {error && <div className="integration-provider-error" role="alert"><span>Não foi possível verificar a conexão: {error.message}</span><button className="secondary-button" type="button" onClick={onRetry}>Tentar novamente</button></div>}
    {children}
  </article>;
}

function MappingSection({ rows, loading, error, onRetry, canManage, removing, removingId, onRemove }: { rows: Mapping[]; loading: boolean; error: Error | null; onRetry: () => void; canManage: boolean; removing: boolean; removingId?: string; onRemove: (id: string) => void }) {
  return <section className="task-mappings" aria-label="Destinos autorizados"><header><div><h4>Destinos autorizados</h4><p>{rows.length ? `${rows.length} ${rows.length === 1 ? 'destino disponível' : 'destinos disponíveis'} para este projeto.` : 'Autorize um destino para publicar tarefas.'}</p></div>{!loading && !error && rows.length > 0 && <span className="linked-folders-count">{rows.length}</span>}</header>
    {loading && <div className="drive-loading" aria-live="polite"><span className="loading-ring"/> Carregando destinos…</div>}
    {error && <div className="integration-provider-error" role="alert"><span>Não foi possível carregar os destinos: {error.message}</span><button className="secondary-button" type="button" onClick={onRetry}>Tentar novamente</button></div>}
    {!loading && !error && !rows.length && <div className="task-mappings-empty"><Link2 size={18}/><span>Nenhum destino autorizado para este projeto.</span></div>}
    {!loading && !error && <div className="task-mapping-list">{rows.map(row => <div className="task-mapping-row" key={row.id}><span className="linked-folder-icon">{row.resourceKind === 'GITHUB_REPOSITORY' ? <GitBranch size={17}/> : <FolderKanban size={17}/>}</span><div><strong>{row.externalName}</strong><small>{row.resourceKind === 'GITHUB_REPOSITORY' ? 'Repositório GitHub' : row.resourceKind === 'GITHUB_PROJECT' ? 'GitHub Project' : 'Projeto OpenProject'}</small></div>{canManage && <button className="secondary-button" type="button" disabled={removing} onClick={() => onRemove(row.id)}>{removing && removingId === row.id ? 'Removendo…' : 'Remover'}</button>}</div>)}</div>}
  </section>;
}

function PickerResults({ loading, error, retry, empty, children }: { loading: boolean; error: Error | null; retry: () => void; empty: string; children: ReactNode }) {
  const rows = Array.isArray(children) ? children : children ? [children] : [];
  return <>{loading && <div className="drive-dialog-state"><span className="loading-ring"/> Buscando destinos…</div>}{error && <div className="integration-provider-error" role="alert"><span>{error.message}</span><button className="secondary-button" type="button" onClick={retry}>Tentar novamente</button></div>}{!loading && !error && (rows.length ? rows : <div className="drive-folder-group-empty"><Search size={17}/><span>{empty}</span></div>)}</>;
}

function TargetOption({ icon, name, detail, authorized, pending, disabled, onChoose }: { icon: ReactNode; name: string; detail: string; authorized: boolean; pending: boolean; disabled: boolean; onChoose: () => void }) {
  return <button className="task-target-option" type="button" disabled={authorized || disabled} onClick={onChoose}><span className="linked-folder-icon">{icon}</span><span><strong>{name}</strong><small>{detail}</small></span><b>{authorized ? 'Autorizado' : pending ? 'Autorizando…' : 'Autorizar'}</b></button>;
}
