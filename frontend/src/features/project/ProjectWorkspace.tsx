import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Icon } from '../../components/Icon';
import { ContentState } from '../../components/ui/ContentState';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { api } from '../../lib/api';
import type { AuthSession, DependencyAnalysis, GraphResponse, Notification, Project, Requirement, RequirementFolder, RequirementTemplate, User, Workspace, WorkspaceMember, WorkspaceRole } from '../../lib/types';
import wand from '../../assets/magic-wand.svg';
import type { WorkspaceSummary } from '../../lib/types';
import { NewRequirementModal, type NewRequirementInput } from './NewRequirementModal';
import { RequirementDrawer } from './RequirementDrawer';
import { RequirementGraph } from './RequirementGraph';
import { FolderOverview } from './FolderOverview';
import { RequirementEditor } from './RequirementEditor';
import { TemplateEditor } from './TemplateEditor';
import { IntegrationCandidatesPanel } from './IntegrationCandidatesPanel';

type View = 'folders' | 'graph' | 'list' | 'archived' | 'candidates';
function editorRoute() {
  const match = window.location.pathname.match(/^\/projects\/([^/]+)\/requirements\/([^/]+)\/edit\/?$/);
  return match ? { projectId: match[1], requirementId: match[2] } : null;
}
function projectPath(projectId: string) { return `/projects/${projectId}`; }
function editorPath(projectId: string, requirementId: string) { return `${projectPath(projectId)}/requirements/${requirementId}/edit`; }

export function ProjectWorkspace({ user, workspace, project, onChangeContext, onBrowseWorkspaces, onCreateWorkspace, onCreateProject, onLogout, logoutPending }: { user: User; workspace: Workspace; project: Project; onChangeContext: (workspaceId: string, projectId: string) => void; onBrowseWorkspaces: () => void; onCreateWorkspace: () => void; onCreateProject: () => void; onLogout: () => void; logoutPending: boolean }) {
  const client = useQueryClient();
  const [view, setView] = useState<View>(() => new URLSearchParams(window.location.search).get('integration') === 'google' ? 'candidates' : 'folders');
  const [query, setQuery] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showSessions, setShowSessions] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showContext, setShowContext] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [graphRoot, setGraphRoot] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(() => { const route = editorRoute(); return route?.projectId === project.id ? route.requirementId : null; });
  const [editorDirty, setEditorDirty] = useState(false);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const requirements = useQuery<Requirement[]>({ queryKey: ['requirements', project.id], queryFn: () => api(`/projects/${project.id}/requirements`) });
  const archivedRequirements = useQuery<Requirement[]>({ queryKey: ['requirements', project.id, 'archived'], queryFn: () => api(`/projects/${project.id}/requirements?status=archived`) });
  const folders = useQuery<RequirementFolder[]>({ queryKey: ['folders', workspace.id], queryFn: () => api(`/workspaces/${workspace.id}/folders`) });
  const contexts = useQuery<WorkspaceSummary[]>({ queryKey: ['workspaces'], queryFn: () => api('/workspaces') });
  const graph = useQuery<GraphResponse>({ queryKey: ['graph', project.id], queryFn: () => api(`/projects/${project.id}/graph`) });
  const dependencyAnalysis = useQuery<DependencyAnalysis | null>({ queryKey: ['dependency-analysis', project.id], queryFn: () => api(`/projects/${project.id}/dependency-analyses/latest`), refetchInterval: (query) => ['QUEUED', 'READING', 'PERSISTING'].includes(query.state.data?.status ?? '') ? 1500 : false });
  const notifications = useQuery<Notification[]>({ queryKey: ['notifications'], queryFn: () => api('/notifications') });
  const openEditor = (id: string) => { window.history.pushState({}, '', editorPath(project.id, id)); setEditingId(id); setEditorDirty(false); };
  const create = useMutation({
    mutationFn: (input: NewRequirementInput) => api<Requirement>(`/projects/${project.id}/requirements`, { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: async (created) => { await Promise.all([client.invalidateQueries({ queryKey: ['requirements', project.id] }), client.invalidateQueries({ queryKey: ['graph', project.id] })]); setShowCreate(false); openEditor(created.id); },
  });
  const analyseProject = useMutation({
    mutationFn: () => api<DependencyAnalysis>(`/projects/${project.id}/dependency-analyses`, { method: 'POST' }),
    onSuccess: () => { void client.invalidateQueries({ queryKey: ['dependency-analysis', project.id] }); },
  });
  const selected = requirements.data?.find((item) => item.id === selectedId) ?? null;
  const canEdit = (workspace.role ?? 'EDITOR') !== 'VIEWER';
  const filteredRequirements = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('pt-BR');
    return (requirements.data ?? []).filter((item) => !normalized || `${item.code} ${item.title}`.toLocaleLowerCase('pt-BR').includes(normalized));
  }, [query, requirements.data]);
  const filteredArchivedRequirements = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('pt-BR');
    return (archivedRequirements.data ?? []).filter((item) => !normalized || `${item.code} ${item.title}`.toLocaleLowerCase('pt-BR').includes(normalized));
  }, [query, archivedRequirements.data]);
  const initials = user.name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
  useEffect(() => {
    const route = editorRoute();
    setEditingId(route?.projectId === project.id ? route.requirementId : null);
    setEditorDirty(false);
    setSelectedId(null);
    setGraphRoot(null);
    setView(new URLSearchParams(window.location.search).get('integration') === 'google' ? 'candidates' : 'folders');
  }, [project.id]);
  useEffect(() => {
    const onPop = () => {
      const next = editorRoute();
      const leavingCurrentEditor = Boolean(editingId && (!next || next.projectId !== project.id || next.requirementId !== editingId));
      if (leavingCurrentEditor && editorDirty && !window.confirm('Existem alterações não salvas. Sair mesmo assim?')) {
        window.history.pushState({}, '', editorPath(project.id, editingId!));
        return;
      }
      setEditingId(next?.projectId === project.id ? next.requirementId : null);
      setEditorDirty(false);
      setSelectedId(null);
      setGraphRoot(null);
      setView('folders');
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [editorDirty, editingId, project.id]);
  const closeEditor = () => { window.history.replaceState({}, '', projectPath(project.id)); setEditingId(null); setEditorDirty(false); };
  const changeContext = (nextWorkspaceId: string, nextProjectId: string) => {
    if (editorDirty && !window.confirm('Existem alterações não salvas. Trocar de projeto mesmo assim?')) return;
    window.history.replaceState({}, '', projectPath(nextProjectId));
    setEditingId(null);
    setEditorDirty(false);
    onChangeContext(nextWorkspaceId, nextProjectId);
  };
  if (editingId) return <RequirementEditor projectId={project.id} requirementId={editingId} workspace={workspace} user={user} onDirtyChange={setEditorDirty} onClose={closeEditor} />;
  if (editingTemplateId) return <TemplateEditor workspace={workspace} templateId={editingTemplateId} onClose={() => setEditingTemplateId(null)}/>;

  const navigate = (nextView: View) => { setSelectedId(null); setGraphRoot(null); setView(nextView); };
  const openGraph = (id: string) => { setGraphRoot(id); setSelectedId(null); setView('graph'); };
  return (
    <div className="workspace-shell">
      <header className="workspace-header">
        <button className="workspace-brand" onClick={onBrowseWorkspaces} aria-label="Voltar aos workspaces"><span className="workspace-brand-mark">A</span><span>ATHENA</span></button>
        <button className="project-context-trigger" onClick={() => setShowContext(true)} aria-haspopup="dialog" aria-expanded={showContext}><span className="project-key">{project.key.slice(0, 3)}</span><span><small>{workspace.name}</small><strong>{project.name}</strong></span><Icon name="chevron" size={15}/></button>
        <nav className="workspace-tabs" aria-label="Navegação do projeto">
          <button className={view === 'folders' ? 'active' : ''} onClick={() => navigate('folders')}>Visão geral</button>
          <button className={view === 'graph' ? 'active' : ''} onClick={() => navigate('graph')}>Mapa</button>
          <button className={view === 'list' ? 'active' : ''} onClick={() => navigate('list')}>Requisitos <span>{requirements.data?.length ?? 0}</span></button>
          <button className={view === 'archived' ? 'active' : ''} onClick={() => navigate('archived')}>Canceladas <span>{archivedRequirements.data?.length ?? 0}</span></button>
          <button className={view === 'candidates' ? 'active' : ''} onClick={() => navigate('candidates')}>Importações</button>
        </nav>
        <div className="workspace-header-actions"><button className="header-icon-button" aria-label="Abrir avisos" onClick={() => setShowNotifications((open) => !open)}><Icon name="bell" size={17}/>{notifications.data?.filter((item) => !item.readAt).length ? <b>{notifications.data.filter((item) => !item.readAt).length}</b> : null}</button>{workspace.role === 'OWNER' && <button className="header-icon-button" aria-label="Abrir membros" title="Membros" onClick={() => setShowMembers(true)}><Icon name="users" size={17}/></button>}<label className="search-box"><Icon name="search" size={16}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar requisitos" aria-label="Buscar requisitos"/></label><button className="user-avatar" onClick={() => setShowProfile((open) => !open)} aria-expanded={showProfile} aria-haspopup="menu" title="Meu perfil" aria-label="Meu perfil">{initials || <Icon name="user" size={14}/>}</button></div>
      </header>
      <div className="workspace">
        <main className="workspace-content">
          {view === 'folders' && <FolderOverview
            folders={folders.data ?? []}
            requirements={requirements.data ?? []}
            query={query}
            canEdit={canEdit}
            onSelect={openGraph}
            onCreateFolder={() => setShowCreateFolder(true)}
            onCreateRequirement={() => { create.reset(); setShowCreate(true); }}
            onSettings={() => setShowSettings(true)}
            loading={folders.isLoading || requirements.isLoading}
            error={folders.error ?? requirements.error}
            onRetry={() => { void folders.refetch(); void requirements.refetch(); }}
          />}
          {view === 'graph' && <section className={`map-page ${selected ? 'has-panel' : ''}`}><div className="map-toolbar"><div className="map-toolbar-content"><button className="secondary-button" onClick={() => navigate('folders')}>← Pastas</button><div className="map-toolbar-title"><h1>{requirements.data?.find((item) => item.id === graphRoot)?.title ?? project.name}</h1><span>Rede de dependências da US selecionada</span></div></div><div className="map-toolbar-actions">{canEdit && <button className="primary-button map-ai-trigger" disabled={analyseProject.isPending} onClick={() => analyseProject.mutate()}><img src={wand} alt=""/> {analyseProject.isPending ? 'Iniciando…' : 'Analisar projeto'}</button>}<button className="secondary-button project-requirements-link" onClick={() => navigate('list')}>Requisitos <span>{requirements.data?.length ?? 0}</span></button></div>{analyseProject.error && <span className="map-ai-feedback map-ai-error" role="alert">{analyseProject.error.message}</span>}</div><DependencyAnalysisCard analysis={dependencyAnalysis.data}/>{graph.isLoading && <ContentState loading title="Carregando mapa"/>}{graph.isError && <ContentState title="Não foi possível carregar o mapa" message={graph.error.message} retry={() => graph.refetch()}/>} {graph.data && <RequirementGraph data={graph.data} query={query} rootId={graphRoot} onSelect={setSelectedId} highlightedIds={[]}/>}</section>}
          {view === 'list' && <RequirementList requirements={filteredRequirements} loading={requirements.isLoading} error={requirements.error} onRetry={() => requirements.refetch()} onSelect={setSelectedId}/>} 
          {view === 'archived' && <RequirementList requirements={filteredArchivedRequirements} loading={archivedRequirements.isLoading} error={archivedRequirements.error} onRetry={() => archivedRequirements.refetch()} onSelect={openEditor} archived/>}
          {view === 'candidates' && <IntegrationCandidatesPanel workspaceId={workspace.id} projectId={project.id} role={workspace.role}/>
          }
          {selected && <RequirementDrawer requirement={selected} projectRequirements={requirements.data ?? []} canEdit={canEdit && selected.status !== 'ARCHIVED'} onClose={() => setSelectedId(null)} onSelect={setSelectedId} onEdit={() => openEditor(selected.id)}/>}
        </main>
      </div>
      {showContext && <ContextSwitcher
        contexts={contexts.data ?? []}
        currentWorkspaceId={workspace.id}
        currentProjectId={project.id}
        onSelect={(nextWorkspaceId, nextProjectId) => { setShowContext(false); changeContext(nextWorkspaceId, nextProjectId); }}
        onCreateWorkspace={() => { setShowContext(false); onCreateWorkspace(); }}
        onCreateProject={() => { setShowContext(false); onCreateProject(); }}
        onClose={() => setShowContext(false)}
      />}
      {showCreateFolder && <CreateFolderModal workspaceId={workspace.id} onClose={() => setShowCreateFolder(false)}/>}
      {showCreate && <NewRequirementModal workspaceId={workspace.id} pending={create.isPending} error={create.error} onClose={() => setShowCreate(false)} onCreate={(input) => create.mutate(input)}/>} 
      {showMembers && <MembersModal workspaceId={workspace.id} currentUserId={user.id} canManage={workspace.role === 'OWNER'} onClose={() => setShowMembers(false)}/>}
      {showSettings && <SettingsModal workspaceId={workspace.id} canEdit={canEdit} onClose={() => setShowSettings(false)} onEditTemplate={(id) => { setShowSettings(false); setEditingTemplateId(id); }}/>}
      {showNotifications && <NotificationsPanel notifications={notifications.data ?? []} onRead={(id) => api(`/notifications/${id}/read`, { method: 'PATCH' }).then(() => client.invalidateQueries({ queryKey: ['notifications'] }))}/>} 
      {showProfile && <ProfileMenu user={user} pending={logoutPending} onSessions={() => { setShowProfile(false); setShowSessions(true); }} onLogout={onLogout}/>}
      {showSessions && <SessionsModal onClose={() => setShowSessions(false)}/>}
    </div>
  );
}

function DependencyAnalysisCard({ analysis }: { analysis?: DependencyAnalysis | null }) {
  if (!analysis) return null;
  if (analysis.status === 'COMPLETED' && analysis.suggestionsFound === 0) return null;
  const active = ['QUEUED', 'READING', 'PERSISTING'].includes(analysis.status);
  const label = analysis.status === 'READING' ? `Lendo ${analysis.totalRequirements} US` : analysis.status === 'PERSISTING' ? 'Aplicando dependências ao mapa' : analysis.status === 'QUEUED' ? 'Analisando dependências' : analysis.status === 'FAILED' ? 'Não foi possível analisar dependências' : `${analysis.suggestionsFound} dependências aplicadas ao mapa`;
  const progress = analysis.totalRequirements ? Math.round((analysis.processedRequirements / analysis.totalRequirements) * 100) : 100;
  return <div className={`dependency-analysis-card ${active ? 'is-active' : ''} ${analysis.status === 'FAILED' ? 'is-failed' : ''}`} aria-live="polite"><span><strong>{label}</strong><small>{analysis.status === 'FAILED' ? analysis.error : `${analysis.processedRequirements} / ${analysis.totalRequirements} US`}</small></span>{active && <i className="dependency-progress"><b style={{ width: analysis.status === 'READING' ? undefined : `${progress}%` }}/></i>}</div>;
}

function NotificationsPanel({ notifications, onRead }: { notifications: Notification[]; onRead: (id: string) => void }) {
  return <section className="notifications-panel" aria-label="Avisos"><header><strong>Avisos</strong><span>{notifications.filter((item) => !item.readAt).length} novos</span></header>{notifications.length ? notifications.slice(0, 8).map((item) => <button className={item.readAt ? 'read' : ''} key={item.id} onClick={() => onRead(item.id)}><strong>{item.type === 'MENTION' ? 'Menção' : 'Atualização'}</strong><span>{item.type === 'MENTION' && item.commentMessage ? <>Você foi mencionado por {item.commentMessage.author.name} em {item.commentMessage.thread.requirement.title}.</> : 'Há uma atualização no seu workspace.'}</span></button>) : <p>Nenhuma notificação por enquanto.</p>}</section>;
}

function ProfileMenu({ user, pending, onSessions, onLogout }: { user: User; pending: boolean; onSessions: () => void; onLogout: () => void }) {
  return <section className="profile-menu" role="menu" aria-label="Meu perfil"><div><strong>{user.name}</strong><small>{user.email}</small></div><button role="menuitem" onClick={onSessions}>Segurança e sessões</button><button role="menuitem" onClick={onLogout} disabled={pending}><Icon name="logout" size={15}/> {pending ? 'Saindo…' : 'Sair'}</button></section>;
}

function SessionsModal({ onClose }: { onClose: () => void }) {
  const client = useQueryClient();
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const sessions = useQuery<AuthSession[]>({ queryKey: ['auth-sessions'], queryFn: () => api('/auth/sessions') });
  const revoke = useMutation({ mutationFn: (id: string) => api(`/auth/sessions/${id}`, { method: 'DELETE' }), onSuccess: () => { setConfirmingId(null); client.invalidateQueries({ queryKey: ['auth-sessions'] }); } });
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !revoke.isPending) onClose(); }}><section className="modal-card sessions-modal" role="dialog" aria-modal="true" aria-labelledby="sessions-title"><header className="modal-header"><div><p className="section-kicker">Segurança</p><h2 id="sessions-title">Dispositivos e sessões</h2></div><button className="icon-button" type="button" onClick={onClose} aria-label="Fechar" disabled={revoke.isPending}><Icon name="close" size={16}/></button></header><p className="form-lead">Revogue dispositivos que você não reconhece. Você poderá entrar novamente nesse dispositivo.</p><div className="sessions-list" aria-live="polite">{sessions.isLoading && <p className="empty-copy">Carregando sessões…</p>}{sessions.isError && <div className="inline-error" role="alert">{sessions.error.message}</div>}{sessions.data?.length === 0 && <p className="empty-copy">Nenhuma sessão ativa.</p>}{sessions.data?.map((session) => <article className="session-row" key={session.id}><span><strong>{session.persistent ? 'Dispositivo lembrado' : 'Sessão do navegador'}</strong><small>Iniciada em {new Date(session.createdAt).toLocaleString('pt-BR')} · expira em {new Date(session.expiresAt).toLocaleDateString('pt-BR')}</small></span>{confirmingId === session.id ? <span className="session-confirm" role="alert">Revogar esta sessão? <button type="button" className="text-button" onClick={() => revoke.mutate(session.id)} disabled={revoke.isPending}>{revoke.isPending ? 'Revogando…' : 'Confirmar'}</button><button type="button" className="text-button" onClick={() => setConfirmingId(null)} disabled={revoke.isPending}>Cancelar</button></span> : <button type="button" className="text-button" onClick={() => setConfirmingId(session.id)}>Revogar</button>}</article>)}</div><footer className="modal-footer"><span>As sessões revogadas perdem acesso imediatamente.</span><button type="button" className="secondary-button" onClick={onClose}>Concluir</button></footer></section></div>;
}

export function SettingsModal({ workspaceId, canEdit, onClose, onEditTemplate }: { workspaceId: string; canEdit: boolean; onClose: () => void; onEditTemplate: (id: string) => void }) {
  const client = useQueryClient();
  const [templateName, setTemplateName] = useState('');
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [folderName, setFolderName] = useState('');
  const [folderDescription, setFolderDescription] = useState('');
  const [confirmingFolderId, setConfirmingFolderId] = useState<string | null>(null);
  const folders = useQuery<RequirementFolder[]>({ queryKey: ['folders', workspaceId], queryFn: () => api(`/workspaces/${workspaceId}/folders`) });
  const templates = useQuery<RequirementTemplate[]>({ queryKey: ['templates', workspaceId], queryFn: () => api(`/workspaces/${workspaceId}/templates`) });
  const updateFolder = useMutation({ mutationFn: ({ id, name, description }: { id: string; name: string; description: string }) => api<RequirementFolder>(`/folders/${id}`, { method: 'PATCH', body: JSON.stringify({ name, description }) }), onSuccess: () => { setEditingFolderId(null); client.invalidateQueries({ queryKey: ['folders', workspaceId] }); client.invalidateQueries({ queryKey: ['requirements'] }); } });
  const deleteFolder = useMutation({ mutationFn: (id: string) => api(`/folders/${id}`, { method: 'DELETE' }), onSuccess: () => { setConfirmingFolderId(null); client.invalidateQueries({ queryKey: ['folders', workspaceId] }); client.invalidateQueries({ queryKey: ['requirements'] }); } });
  const createTemplate = useMutation({ mutationFn: () => api<RequirementTemplate>(`/workspaces/${workspaceId}/templates`, { method: 'POST', body: JSON.stringify({ name: templateName.trim(), content: { type: 'doc', content: [{ type: 'paragraph' }] } }) }), onSuccess: (template) => { setTemplateName(''); client.invalidateQueries({ queryKey: ['templates', workspaceId] }); onEditTemplate(template.id); } });
  const deleteTemplate = useMutation({ mutationFn: (id: string) => api(`/templates/${id}`, { method: 'DELETE' }), onSuccess: () => client.invalidateQueries({ queryKey: ['templates', workspaceId] }) });
  const startFolderEdit = (folder: RequirementFolder) => { setEditingFolderId(folder.id); setFolderName(folder.name); setFolderDescription(folder.description ?? ''); updateFolder.reset(); };
  const cancelFolderEdit = () => { setEditingFolderId(null); updateFolder.reset(); };
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !updateFolder.isPending && !deleteFolder.isPending) onClose(); }}><section className="modal-card settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title"><header className="modal-header"><div><p className="section-kicker">Workspace</p><h2 id="settings-title">Configurações</h2></div><button className="icon-button" onClick={onClose} disabled={updateFolder.isPending || deleteFolder.isPending}><Icon name="close" size={16}/></button></header><section className="settings-section"><div className="doc-section-heading"><div><h3>Pastas</h3><p className="section-help">Gerencie nome e descrição. Excluir uma pasta move suas US para “Sem pasta”.</p></div></div><div className="settings-list">{folders.data?.map((folder) => { const isDefault = folder.name.localeCompare('Sem pasta', 'pt-BR', { sensitivity: 'base' }) === 0; const isEditing = editingFolderId === folder.id; const isConfirming = confirmingFolderId === folder.id; return <div className="settings-row settings-folder-row" key={folder.id}>{isEditing ? <form className="settings-folder-edit" onSubmit={(event) => { event.preventDefault(); if (folderName.trim()) updateFolder.mutate({ id: folder.id, name: folderName.trim(), description: folderDescription }); }}><input aria-label="Nome da pasta" maxLength={120} value={folderName} onChange={(event) => setFolderName(event.target.value)} autoFocus/><input aria-label="Descrição da pasta" maxLength={500} value={folderDescription} onChange={(event) => setFolderDescription(event.target.value)} placeholder="Descrição (opcional)"/><div><button type="button" className="text-button" onClick={cancelFolderEdit} disabled={updateFolder.isPending}>Cancelar</button><button type="submit" className="text-button" disabled={!folderName.trim() || updateFolder.isPending}>{updateFolder.isPending ? 'Salvando…' : 'Salvar'}</button></div></form> : <><span><Icon name="folder" size={14}/><strong>{folder.name}</strong></span><small>{folder.requirementCount ?? 0} US</small>{canEdit && !isDefault && <><button className="text-button" onClick={() => startFolderEdit(folder)}>Editar</button>{isConfirming ? <span className="folder-delete-confirm" role="alert">Mover US para “Sem pasta”? <button className="text-button" onClick={() => deleteFolder.mutate(folder.id)} disabled={deleteFolder.isPending}>{deleteFolder.isPending ? 'Excluindo…' : 'Confirmar'}</button><button className="text-button" onClick={() => setConfirmingFolderId(null)} disabled={deleteFolder.isPending}>Cancelar</button></span> : <button className="text-button" onClick={() => setConfirmingFolderId(folder.id)}>Excluir</button>}</>}</>}</div>; })}</div>{updateFolder.error && <div className="inline-error" role="alert">{updateFolder.error.message}</div>}{deleteFolder.error && <div className="inline-error" role="alert">{deleteFolder.error.message}</div>}</section><section className="settings-section"><h3>Templates</h3><p className="section-help">Templates são aplicados ao criar uma nova US.</p>{canEdit && <div className="settings-create"><input value={templateName} onChange={(event) => setTemplateName(event.target.value)} placeholder="Nome do novo template"/><button className="primary-button" disabled={!templateName.trim() || createTemplate.isPending} onClick={() => createTemplate.mutate()}>{createTemplate.isPending ? 'Criando…' : 'Criar'}</button></div>}{createTemplate.error && <div className="inline-error" role="alert">{createTemplate.error.message}</div>}{templates.isLoading && <p className="empty-copy">Carregando templates…</p>}{templates.isError && <div className="inline-error" role="alert">Não foi possível carregar os templates: {templates.error.message}</div>} {!templates.isLoading && !templates.isError && <div className="settings-list">{templates.data?.length ? templates.data.map((template) => <div className="settings-row" key={template.id}><span><Icon name="list" size={14}/><strong>{template.name}</strong></span><small>{template.description || 'Documento reutilizável'}</small><button className="text-button" onClick={() => onEditTemplate(template.id)}>{canEdit ? 'Editar' : 'Visualizar'}</button>{canEdit && <button className="text-button" onClick={() => deleteTemplate.mutate(template.id)}>Excluir</button>}</div>) : <p className="empty-copy">Nenhum template criado.</p>}</div>}{deleteTemplate.error && <div className="inline-error" role="alert">{deleteTemplate.error.message}</div>}</section><footer className="modal-footer"><span>Alterações ficam restritas ao workspace.</span><button className="secondary-button" onClick={onClose}>Concluir</button></footer></section></div>;
}

function CreateFolderModal({ workspaceId, onClose }: { workspaceId: string; onClose: () => void }) {
  const client = useQueryClient();
  const [name, setName] = useState('');
  const create = useMutation({ mutationFn: () => api<RequirementFolder>(`/workspaces/${workspaceId}/folders`, { method: 'POST', body: JSON.stringify({ name: name.trim() }) }), onSuccess: () => { client.invalidateQueries({ queryKey: ['folders', workspaceId] }); onClose(); } });
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !create.isPending) onClose(); }}><form className="modal-card create-folder-modal" role="dialog" aria-modal="true" aria-labelledby="create-folder-title" onSubmit={(event) => { event.preventDefault(); if (name.trim()) create.mutate(); }}><header className="modal-header"><div><p className="section-kicker">Organização</p><h2 id="create-folder-title">Nova pasta</h2></div><button type="button" className="icon-button" onClick={onClose} disabled={create.isPending} aria-label="Fechar"><Icon name="close" size={16}/></button></header><p className="form-lead">Agrupe as User Stories do workspace de uma forma fácil de reconhecer.</p><div className="modal-fields"><label>Nome da pasta<input autoFocus required maxLength={120} value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex.: Área do cliente"/></label>{create.error && <div className="inline-error" role="alert">{create.error.message}</div>}</div><footer className="modal-footer"><span>Você poderá organizar os requisitos depois.</span><div><button type="button" className="secondary-button" onClick={onClose} disabled={create.isPending}>Cancelar</button><button className="primary-button" disabled={!name.trim() || create.isPending}>{create.isPending ? 'Criando…' : 'Criar pasta'}</button></div></footer></form></div>;
}

function ContextSwitcher({ contexts, currentWorkspaceId, currentProjectId, onSelect, onCreateWorkspace, onCreateProject, onClose }: { contexts: WorkspaceSummary[]; currentWorkspaceId: string; currentProjectId: string; onSelect: (workspaceId: string, projectId: string) => void; onCreateWorkspace: () => void; onCreateProject: () => void; onClose: () => void }) {
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose]);
  const current = contexts.find((item) => item.id === currentWorkspaceId);
  const others = contexts.filter((item) => item.id !== currentWorkspaceId);
  const workspaceSection = (item: WorkspaceSummary, currentSection = false) => <section className={`context-workspace ${currentSection ? 'current' : ''}`} key={item.id}><header><span className="project-key">{item.name.slice(0, 2).toUpperCase()}</span><div><strong>{item.name}</strong><small>{currentSection ? 'Workspace atual' : `${item.projects.length} ${item.projects.length === 1 ? 'projeto' : 'projetos'}`}</small></div><span className="context-role">{item.role}</span></header><div className="context-projects">{item.projects.length ? item.projects.map((itemProject) => <button className={item.id === currentWorkspaceId && itemProject.id === currentProjectId ? 'selected' : ''} key={itemProject.id} onClick={() => onSelect(item.id, itemProject.id)}><span className="project-key">{itemProject.key.slice(0, 3)}</span><span><strong>{itemProject.name}</strong><small>{itemProject.key}</small></span>{item.id === currentWorkspaceId && itemProject.id === currentProjectId && <span className="context-check">Atual</span>}</button>) : <p className="empty-copy">Nenhum projeto neste workspace.</p>}</div></section>;
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="modal-card context-switcher-modal" role="dialog" aria-modal="true" aria-labelledby="context-switcher-title"><header className="modal-header"><div><p className="section-kicker">Navegação</p><h2 id="context-switcher-title">Trocar workspace ou projeto</h2></div><button className="icon-button" onClick={onClose} aria-label="Fechar"><Icon name="close" size={16}/></button></header><div className="context-sections">{current && workspaceSection(current, true)}{others.length > 0 && <div className="context-divider"><span>Outros workspaces</span></div>}{others.map((item) => workspaceSection(item))}</div><footer className="context-actions"><button className="secondary-button" onClick={onCreateProject}><Icon name="plus" size={14}/> Novo projeto</button><button className="primary-button" onClick={onCreateWorkspace}><Icon name="plus" size={14}/> Novo workspace</button></footer></section></div>;
}

function MembersModal({ workspaceId, currentUserId, canManage, onClose }: { workspaceId: string; currentUserId: string; canManage: boolean; onClose: () => void }) {
  const client = useQueryClient();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'EDITOR' | 'VIEWER'>('EDITOR');
  const members = useQuery<WorkspaceMember[]>({ queryKey: ['members', workspaceId], queryFn: () => api(`/workspaces/${workspaceId}/members`) });
  const invites = useQuery<Array<{ id: string; email: string; role: 'EDITOR' | 'VIEWER'; expiresAt: string; revokedAt?: string | null; acceptedAt?: string | null; deliveryError?: string | null }>>({ queryKey: ['invites', workspaceId], queryFn: () => api(`/workspaces/${workspaceId}/invites`), enabled: canManage });
  const invite = useMutation({ mutationFn: () => api(`/workspaces/${workspaceId}/invites`, { method: 'POST', body: JSON.stringify({ email: email.trim(), role }) }), onSuccess: () => { setEmail(''); client.invalidateQueries({ queryKey: ['invites', workspaceId] }); } });
  const resendInvite = useMutation({ mutationFn: (id: string) => api(`/workspaces/${workspaceId}/invites/${id}/resend`, { method: 'POST' }), onSuccess: () => client.invalidateQueries({ queryKey: ['invites', workspaceId] }) });
  const revokeInvite = useMutation({ mutationFn: (id: string) => api(`/workspaces/${workspaceId}/invites/${id}`, { method: 'DELETE' }), onSuccess: () => client.invalidateQueries({ queryKey: ['invites', workspaceId] }) });
  const update = useMutation({ mutationFn: ({ userId, role: nextRole }: { userId: string; role: WorkspaceRole }) => api(`/workspaces/${workspaceId}/members/${userId}`, { method: 'PATCH', body: JSON.stringify({ role: nextRole }) }), onSuccess: () => client.invalidateQueries({ queryKey: ['members', workspaceId] }) });
  const remove = useMutation({ mutationFn: (userId: string) => api(`/workspaces/${workspaceId}/members/${userId}`, { method: 'DELETE' }), onSuccess: () => client.invalidateQueries({ queryKey: ['members', workspaceId] }) });
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="modal-card members-modal" role="dialog" aria-modal="true" aria-labelledby="members-title"><header className="modal-header"><div><p className="section-kicker">Workspace</p><h2 id="members-title">Membros e permissões</h2></div><button className="icon-button" onClick={onClose} aria-label="Fechar">×</button></header><p className="form-lead">{canManage ? 'Convide pessoas por e-mail. O acesso só é criado após a confirmação e o aceite.' : 'Consulte as pessoas que participam deste workspace.'}</p>{canManage && <><div className="member-invite"><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="pessoa@empresa.com" aria-label="E-mail da pessoa convidada"/><InviteRoleSelect value={role} onChange={setRole}/><button className="primary-button" disabled={!email.trim() || invite.isPending} onClick={() => invite.mutate()}>{invite.isPending ? 'Enviando…' : 'Convidar'}</button></div>{invite.error && <div className="inline-error" role="alert">{invite.error.message}</div>}{invites.data?.filter((item) => !item.acceptedAt && !item.revokedAt).map((item) => <div className="invite-row" key={item.id}><span><strong>{item.email}</strong><small>{item.role === 'EDITOR' ? 'Editor' : 'Leitor'} · expira em {new Date(item.expiresAt).toLocaleDateString('pt-BR')}</small>{item.deliveryError && <em role="alert">{item.deliveryError}</em>}</span><button className="text-button" disabled={resendInvite.isPending} onClick={() => resendInvite.mutate(item.id)}>Reenviar</button><button className="text-button" disabled={revokeInvite.isPending} onClick={() => revokeInvite.mutate(item.id)}>Revogar</button></div>)}</>}<div className="members-list">{members.isLoading && <span className="empty-copy">Carregando membros…</span>}{members.data?.map((member) => <div className="member-row" key={member.user.id}><span className="avatar">{member.user.name.slice(0, 1).toUpperCase()}</span><div><strong>{member.user.name}</strong><small>{member.user.email}</small></div>{member.user.id === currentUserId ? <span className="member-owner">Você</span> : canManage ? <><RoleSelect value={member.role} onChange={(nextRole) => update.mutate({ userId: member.user.id, role: nextRole })}/><button className="text-button" onClick={() => remove.mutate(member.user.id)}>Remover</button></> : <span className="member-owner">{member.role}</span>}</div>)}</div><footer className="modal-footer"><span>Owner administra membros, convites e permissões.</span><button className="secondary-button" onClick={onClose}>Concluir</button></footer></section></div>;
}
function RoleSelect({ value, onChange }: { value: WorkspaceRole; onChange: (role: WorkspaceRole) => void }) { return <select className="role-select" value={value} onChange={(event) => onChange(event.target.value as WorkspaceRole)}><option value="OWNER">Owner</option><option value="EDITOR">Editor</option><option value="VIEWER">Leitor</option></select>; }
function InviteRoleSelect({ value, onChange }: { value: 'EDITOR' | 'VIEWER'; onChange: (role: 'EDITOR' | 'VIEWER') => void }) { return <select className="role-select" value={value} onChange={(event) => onChange(event.target.value as 'EDITOR' | 'VIEWER')}><option value="EDITOR">Editor</option><option value="VIEWER">Leitor</option></select>; }

function RequirementList({ requirements, loading, error, onRetry, onSelect, archived = false }: { requirements: Requirement[]; loading: boolean; error: Error | null; onRetry: () => void; onSelect: (id: string) => void; archived?: boolean }) {
  if (loading) return <section className="list-page"><ContentState loading title="Carregando requisitos"/></section>;
  if (error) return <section className="list-page"><ContentState title="Não foi possível carregar os requisitos" message={error.message} retry={onRetry}/></section>;
  return <section className="list-page"><header className="list-heading"><div><p className="section-kicker">{archived ? 'Histórico' : 'Catálogo'}</p><h1>{archived ? 'Canceladas' : 'Requisitos'}</h1><p>{archived ? 'US arquivadas ficam disponíveis para consulta em modo leitura.' : 'Consulte os registros ativos do projeto.'}</p></div><span className="count-summary">{requirements.length} {requirements.length === 1 ? 'resultado' : 'resultados'}</span></header>{requirements.length ? <div className="requirements-table"><div className="table-head"><span>Requisito</span><span>Tipo</span><span>Status</span><span>Revisão</span><span/></div>{requirements.map((item) => <button className="table-row" key={item.id} onClick={() => onSelect(item.id)}><span className="table-title"><i>US</i><span><strong>{item.title}</strong><small>{item.code}</small></span></span><span>User Story</span><StatusBadge status={item.status}/><strong>v{item.revision}</strong><Icon name="chevron" size={13}/></button>)}</div> : <div className="list-empty"><span className="state-symbol"><Icon name="list" size={20}/></span><strong>{archived ? 'Nenhuma US cancelada' : 'Nenhum requisito encontrado'}</strong><span>{archived ? 'As US canceladas aparecerão aqui.' : 'Tente ajustar a busca ou adicione um novo requisito.'}</span></div>}</section>;
}
