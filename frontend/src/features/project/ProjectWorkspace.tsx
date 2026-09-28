import { lazy, Suspense, useEffect, useMemo, useRef, useState, type Ref } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { WorkspaceNavigator } from '../onboarding/WorkspaceNavigator';
import { Dialog } from '../../components/ui/Dialog';
import '../onboarding/workspaceNavigation.css';
import { Icon } from '../../components/Icon';
import { ContentState } from '../../components/ui/ContentState';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { api } from '../../lib/api';
import type { GraphResponse, Notification, Project, Requirement, RequirementFolder, User, Workspace, WorkspaceMember, WorkspaceRole } from '../../lib/types';
import type { WorkspaceSummary } from '../../lib/types';
import { NewRequirementModal, type NewRequirementInput } from './NewRequirementModal';
import { RequirementDrawer } from './RequirementDrawer';
import { FolderOverview } from './FolderOverview';
import { RequirementEditor } from './RequirementEditor';
import { TemplateEditor } from './TemplateEditor';
import { IntegrationCandidatesPanel } from './IntegrationCandidatesPanel';
import type { Theme } from '../../lib/theme';
import { LiquidToggle } from '../../components/ui/LiquidToggle';
import { SettingsModal } from './WorkspaceSettingsModal';
import { AccessRequestInbox } from './AccessManagement';
export { SettingsModal };

const RequirementGraph = lazy(() => import('./RequirementGraph').then(({ RequirementGraph }) => ({ default: RequirementGraph })));

type View = 'folders' | 'graph' | 'archived' | 'candidates';
const viewSegments: Record<View, string> = { folders: 'overview', graph: 'map', archived: 'cancelled', candidates: 'imports' };
const segmentViews: Record<string, View> = Object.fromEntries(Object.entries(viewSegments).map(([view, segment]) => [segment, view])) as Record<string, View>;
function routedView(projectId: string): View {
  const match = window.location.pathname.match(new RegExp(`^/projects/${projectId}/([^/]+)/?$`));
  if (match?.[1] === 'requirements') {
    window.history.replaceState(window.history.state, '', `${projectPath(projectId)}/${viewSegments.folders}`);
    return 'folders';
  }
  return match ? segmentViews[match[1]] ?? 'folders' : 'folders';
}
function routedRoot(projectId: string) {
  if (routedView(projectId) !== 'graph') return null;
  return new URLSearchParams(window.location.search).get('root');
}
function editorRoute() {
  const match = window.location.pathname.match(/^\/projects\/([^/]+)\/requirements\/([^/]+)\/edit\/?$/);
  return match ? { projectId: match[1], requirementId: match[2] } : null;
}
function projectPath(projectId: string) { return `/projects/${projectId}`; }
function editorPath(projectId: string, requirementId: string) { return `${projectPath(projectId)}/requirements/${requirementId}/edit`; }

export function ProjectWorkspace({ user, workspace, project, theme, onThemeChange, onChangeContext, onBrowseWorkspaces, onManageWorkspaces, onLogout, logoutPending }: { user: User; workspace: Workspace; project: Project; theme?: Theme; onThemeChange?: (theme: Theme) => void; onChangeContext: (workspaceId: string, projectId: string) => void; onBrowseWorkspaces: () => void; onManageWorkspaces?: () => void; onCreateWorkspace: () => void; onCreateProject: (workspaceId?: string) => void; onLogout: () => void; logoutPending: boolean }) {
  const client = useQueryClient();
  const [view, setView] = useState<View>(() => new URLSearchParams(window.location.search).get('integration') === 'google' ? 'candidates' : routedView(project.id));
  const [query, setQuery] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [showMembers, setShowMembers] = useState(() => new URLSearchParams(window.location.search).has('accessRequest'));
  const [showNotifications, setShowNotifications] = useState(false);
  const notificationsTriggerRef = useRef<HTMLButtonElement>(null);
  const notificationsPanelRef = useRef<HTMLElement>(null);
  const [showProfile, setShowProfile] = useState(false);
  const profileTriggerRef = useRef<HTMLButtonElement>(null);
  const profileMenuRef = useRef<HTMLElement>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showContext, setShowContext] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawerClosing, setDrawerClosing] = useState(false);
  const [graphRoot, setGraphRoot] = useState<string | null>(() => routedRoot(project.id));
  const [graphSelectionId, setGraphSelectionId] = useState<string | null>(() => routedRoot(project.id));
  const [editingId, setEditingId] = useState<string | null>(() => { const route = editorRoute(); return route?.projectId === project.id ? route.requirementId : null; });
  const [editorDirty, setEditorDirty] = useState(false);
  const [editorSaving, setEditorSaving] = useState(false);
  const [editorTrail, setEditorTrail] = useState<string[]>([]);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const requirements = useQuery<Requirement[]>({ queryKey: ['requirements', project.id], queryFn: () => api(`/projects/${project.id}/requirements`), refetchInterval: 5_000, refetchIntervalInBackground: false });
  const archivedRequirements = useQuery<Requirement[]>({ queryKey: ['requirements', project.id, 'archived'], queryFn: () => api(`/projects/${project.id}/requirements?status=archived`), refetchInterval: 10_000, refetchIntervalInBackground: false });
  const folders = useQuery<RequirementFolder[]>({ queryKey: ['folders', project.id], queryFn: () => api(`/projects/${project.id}/folders`), refetchInterval: 5_000, refetchIntervalInBackground: false });
  const contexts = useQuery<WorkspaceSummary[]>({ queryKey: ['workspaces'], queryFn: () => api('/workspaces') });
  const graph = useQuery<GraphResponse>({ queryKey: ['graph', project.id], queryFn: () => api(`/projects/${project.id}/graph`), refetchInterval: 5_000, refetchIntervalInBackground: false });
  const visibleGraphRequirementIds = useMemo(() => {
    if (!graph.data) return undefined;
    if (!graphRoot) return new Set(graph.data.nodes.map((node) => node.id));
    const graphNodeIds = new Set(graph.data.nodes.map((node) => node.id));
    const visibleIds = new Set(graphNodeIds.has(graphRoot) ? [graphRoot] : []);
    graph.data.edges.forEach((edge) => {
      if (edge.source === graphRoot && graphNodeIds.has(edge.target)) visibleIds.add(edge.target);
      if (edge.target === graphRoot && graphNodeIds.has(edge.source)) visibleIds.add(edge.source);
    });
    return visibleIds;
  }, [graph.data, graphRoot]);
  const notifications = useQuery<Notification[]>({ queryKey: ['notifications'], queryFn: () => api('/notifications') });
  const openEditor = (id: string) => { window.history.pushState({ editorTrail: [] }, '', editorPath(project.id, id)); setEditingId(id); setEditorDirty(false); setEditorSaving(false); setEditorTrail([]); };
  const navigateEditorRequirement = (id: string) => {
    if (!editingId || id === editingId || editorSaving) return;
    if (editorDirty && !window.confirm('Existem alterações não salvas. Descartar e abrir outra US?')) return;
    const nextTrail = [...editorTrail, editingId];
    window.history.pushState({ editorTrail: nextTrail }, '', editorPath(project.id, id));
    setEditorTrail(nextTrail);
    setEditingId(id);
    setEditorDirty(false);
  };
  const create = useMutation({
    mutationFn: (input: NewRequirementInput) => api<Requirement>(`/projects/${project.id}/requirements`, { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: async (created) => { await Promise.all([client.invalidateQueries({ queryKey: ['requirements', project.id] }), client.invalidateQueries({ queryKey: ['graph', project.id] })]); setShowCreate(false); openEditor(created.id); },
  });
  const selected = requirements.data?.find((item) => item.id === selectedId) ?? null;
  const effectiveRole = project.role ?? workspace.role ?? 'VIEWER';
  const effectiveWorkspace = { ...workspace, role: effectiveRole };
  const canEdit = effectiveRole === 'OWNER' || effectiveRole === 'MANAGER' || effectiveRole === 'EDITOR';
  useEffect(() => { if (workspace.role === null && view === 'candidates') setView('folders'); }, [view, workspace.role]);
  const filteredArchivedRequirements = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('pt-BR');
    return (archivedRequirements.data ?? []).filter((item) => !normalized || `${item.code} ${item.title}`.toLocaleLowerCase('pt-BR').includes(normalized));
  }, [query, archivedRequirements.data]);
  const initials = user.name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
  useEffect(() => {
    const route = editorRoute();
    setEditingId(route?.projectId === project.id ? route.requirementId : null);
    setEditorDirty(false);
    setEditorSaving(false);
    setEditorTrail([]);
    setSelectedId(null);
    setDrawerClosing(false);
    setGraphRoot(null);
    setGraphSelectionId(null);
    const params = new URLSearchParams(window.location.search);
    const oauthReturn = params.get('integration') === 'google';
    setView(oauthReturn ? 'candidates' : routedView(project.id));
    const nextRoot = oauthReturn ? null : routedRoot(project.id);
    setGraphRoot(nextRoot);
    setGraphSelectionId(nextRoot);
    if (oauthReturn) {
      params.delete('integration');
      params.delete('status');
      params.delete('workspaceId');
      const search = params.toString();
      window.history.replaceState({}, '', `${window.location.pathname}${search ? `?${search}` : ''}${window.location.hash}`);
    }
  }, [project.id]);
  useEffect(() => {
    if (!showProfile) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (profileMenuRef.current?.contains(target) || profileTriggerRef.current?.contains(target)) return;
      setShowProfile(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setShowProfile(false);
      profileTriggerRef.current?.focus();
    };
    document.addEventListener('pointerdown', closeOnOutsidePointer);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [showProfile]);
  useEffect(() => {
    if (!showNotifications) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (notificationsPanelRef.current?.contains(target) || notificationsTriggerRef.current?.contains(target)) return;
      setShowNotifications(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setShowNotifications(false);
      notificationsTriggerRef.current?.focus();
    };
    document.addEventListener('pointerdown', closeOnOutsidePointer);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [showNotifications]);
  useEffect(() => {
    const onPop = () => {
      const next = editorRoute();
      const leavingCurrentEditor = Boolean(editingId && (!next || next.projectId !== project.id || next.requirementId !== editingId));
      if (leavingCurrentEditor && editorSaving) {
        window.history.pushState({ editorTrail }, '', editorPath(project.id, editingId!));
        return;
      }
      if (leavingCurrentEditor && editorDirty && !window.confirm('Existem alterações não salvas. Sair mesmo assim?')) {
        window.history.pushState({ editorTrail }, '', editorPath(project.id, editingId!));
        return;
      }
      const params = new URLSearchParams(window.location.search);
      const oauthReturn = params.get('integration') === 'google';
      const nextView = oauthReturn ? 'candidates' : routedView(project.id);
      const nextRoot = oauthReturn ? null : routedRoot(project.id);
      setGraphRoot(nextRoot);
      setGraphSelectionId(nextRoot);
      const drawerRequirementId = window.history.state?.drawerRequirementId;
      setSelectedId(nextView === 'graph' && typeof drawerRequirementId === 'string' ? drawerRequirementId : null);
      setEditingId(next?.projectId === project.id ? next.requirementId : null);
      setEditorDirty(false);
      setEditorSaving(false);
      setDrawerClosing(false);
      const restoredTrail = window.history.state?.editorTrail;
      setEditorTrail(Array.isArray(restoredTrail) ? restoredTrail.filter((id: unknown): id is string => typeof id === 'string') : []);
      setView(nextView);
      if (oauthReturn) {
        params.delete('integration'); params.delete('status'); params.delete('workspaceId');
        const search = params.toString();
        window.history.replaceState({}, '', `${projectPath(project.id)}/${viewSegments[nextView]}${search ? `?${search}` : ''}${window.location.hash}`);
      }
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [editorDirty, editorSaving, editorTrail, editingId, project.id]);
  const closeEditor = () => { const root = view === 'graph' && graphRoot ? `?root=${encodeURIComponent(graphRoot)}` : ''; window.history.replaceState({}, '', `${projectPath(project.id)}/${viewSegments[view]}${root}`); setEditingId(null); setEditorDirty(false); setEditorSaving(false); setEditorTrail([]); };
  const changeContext = (nextWorkspaceId: string, nextProjectId: string) => {
    if (editorDirty && !window.confirm('Existem alterações não salvas. Trocar de projeto mesmo assim?')) return;
    window.history.replaceState({}, '', `${projectPath(nextProjectId)}/${viewSegments.folders}`);
    setEditingId(null);
    setEditorDirty(false);
    onChangeContext(nextWorkspaceId, nextProjectId);
  };
  if (editingId) return <RequirementEditor projectId={project.id} requirementId={editingId} workspace={effectiveWorkspace} user={user} onDirtyChange={setEditorDirty} onSavingChange={setEditorSaving} onNavigateRequirement={navigateEditorRequirement} canReturnToPreviousRequirement={editorTrail.length > 0} onReturnToPreviousRequirement={() => { if (!editorSaving) window.history.back(); }} onClose={closeEditor} />;
  if (editingTemplateId && workspace.role !== null) return <TemplateEditor workspace={workspace} templateId={editingTemplateId} onClose={() => setEditingTemplateId(null)}/>;

  const navigate = (nextView: View) => { setSelectedId(null); setDrawerClosing(false); setGraphRoot(null); setGraphSelectionId(null); setView(nextView); window.history.pushState({}, '', `${projectPath(project.id)}/${viewSegments[nextView]}`); };
  const openGraph = (id: string, showDetails = false) => { setGraphRoot(id); setGraphSelectionId(id); setSelectedId(showDetails ? id : null); setDrawerClosing(false); setView('graph'); window.history.pushState({ drawerRequirementId: showDetails ? id : null }, '', `${projectPath(project.id)}/${viewSegments.graph}?root=${encodeURIComponent(id)}`); };
  const selectGraphRequirement = (id: string) => {
    setGraphSelectionId(id);
    setSelectedId(id);
    setDrawerClosing(false);
  };
  const focusGraphRequirement = (id: string) => {
    if (graphRoot === id) return;
    setGraphRoot(id);
    setGraphSelectionId(id);
    setSelectedId(id);
    setDrawerClosing(false);
    window.history.pushState({ drawerRequirementId: id }, '', `${projectPath(project.id)}/${viewSegments.graph}?root=${encodeURIComponent(id)}`);
  };
  const closeRequirementDrawer = () => {
    setGraphSelectionId(null);
    if (!selectedId) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setSelectedId(null);
      setDrawerClosing(false);
      return;
    }
    setDrawerClosing(true);
  };
  const finishClosingRequirementDrawer = () => { setSelectedId(null); setDrawerClosing(false); };
  const showAllFolders = () => {
    setGraphRoot(null);
    setGraphSelectionId(null);
    closeRequirementDrawer();
    window.history.replaceState({}, '', `${projectPath(project.id)}/${viewSegments.graph}`);
  };
  return (
    <div className="workspace-shell">
      <header className="workspace-header">
        <button className="workspace-brand" onClick={onBrowseWorkspaces} aria-label="Voltar aos workspaces"><span className="workspace-brand-mark">A</span><span>ATHENA</span></button>
        <button className="project-context-trigger" onClick={() => setShowContext(true)} aria-haspopup="dialog" aria-expanded={showContext}><span className="project-key">{project.key.slice(0, 3)}</span><span><small>{workspace.name}</small><strong>{project.name}</strong></span><Icon name="chevron" size={15}/></button>
        <nav className="workspace-tabs" aria-label="Navegação do projeto">
          <button className={view === 'folders' ? 'active' : ''} onClick={() => navigate('folders')}>Visão geral</button>
          <button className={view === 'graph' ? 'active' : ''} onClick={() => navigate('graph')}>Mapa</button>
          <button className={view === 'archived' ? 'active' : ''} onClick={() => navigate('archived')}>Canceladas <span>{archivedRequirements.data?.length ?? 0}</span></button>
          {workspace.role !== null && <button className={view === 'candidates' ? 'active' : ''} onClick={() => navigate('candidates')}>Integrações</button>}
        </nav>
        <div className="workspace-header-actions"><button ref={notificationsTriggerRef} className="header-icon-button" aria-label="Abrir avisos" aria-expanded={showNotifications} aria-controls="notifications-panel" onClick={() => setShowNotifications((open) => !open)}><Icon name="bell" size={17}/>{notifications.data?.filter((item) => !item.readAt).length ? <b>{notifications.data.filter((item) => !item.readAt).length}</b> : null}</button>{workspace.role === 'OWNER' && <button className="header-icon-button" aria-label="Abrir membros" title="Membros" onClick={() => setShowMembers(true)}><Icon name="users" size={17}/></button>}<label className="search-box"><Icon name="search" size={16}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar requisitos" aria-label="Buscar requisitos"/></label><button ref={profileTriggerRef} className="user-avatar" onClick={() => setShowProfile((open) => !open)} aria-expanded={showProfile} aria-haspopup="menu" title="Meu perfil" aria-label="Meu perfil">{initials || <Icon name="user" size={14}/>}</button></div>
      </header>
      <div className="workspace">
        <main className="workspace-content">
          <div key={view} className="workspace-view-transition">
          {view === 'folders' && <FolderOverview
            folders={folders.data ?? []}
            requirements={requirements.data ?? []}
            query={query}
            canEdit={canEdit}
            onSelect={(id) => openGraph(id, true)}
            onCreateFolder={() => setShowCreateFolder(true)}
            onCreateRequirement={() => { create.reset(); setShowCreate(true); }}
            onSettings={() => setShowSettings(true)}
            loading={folders.isLoading || requirements.isLoading}
            error={folders.error ?? requirements.error}
            onRetry={() => { void folders.refetch(); void requirements.refetch(); }}
          />}
          {view === 'graph' && <section className={`map-page ${selected ? 'has-panel' : ''}`}><div className="map-toolbar"><div className="map-toolbar-content"><div className="map-toolbar-title"><h1>{requirements.data?.find((item) => item.id === graphRoot)?.title ?? project.name}</h1><span>{graphRoot ? 'US selecionada e relações diretas' : 'Pastas, User Stories e relações'}</span></div></div><div className="map-toolbar-actions">{graphRoot && <button className="secondary-button map-all-folders" onClick={showAllFolders}>Todas as pastas</button>}</div></div>{graph.isLoading && <ContentState loading title="Carregando mapa"/>}{graph.isError && <ContentState title="Não foi possível carregar o mapa" message={graph.error.message} retry={() => graph.refetch()}/>} {graph.data && <Suspense fallback={<ContentState loading title="Carregando mapa"/>}><RequirementGraph key={project.id} projectId={project.id} data={graph.data} folders={folders.data ?? []} requirements={requirements.data ?? []} query={query} rootId={graphRoot} selectedId={graphSelectionId} onSelect={selectGraphRequirement} darkMode={theme === 'dark'}/></Suspense>}</section>}
          {view === 'archived' && <RequirementList requirements={filteredArchivedRequirements} loading={archivedRequirements.isLoading} error={archivedRequirements.error} onRetry={() => archivedRequirements.refetch()} onSelect={openEditor}/>}
          {view === 'candidates' && workspace.role !== null && <IntegrationCandidatesPanel workspaceId={workspace.id} projectId={project.id} role={workspace.role}/>
          }
          {selected && <RequirementDrawer requirement={selected} folders={folders.data ?? []} projectRequirements={requirements.data ?? []} visibleRequirementIds={visibleGraphRequirementIds} projectRequirementsLoading={requirements.isLoading} projectRequirementsError={requirements.error} onRetryProjectRequirements={() => void requirements.refetch()} canEdit={canEdit && selected.status !== 'ARCHIVED'} closing={drawerClosing} onClose={closeRequirementDrawer} onCloseComplete={finishClosingRequirementDrawer} onSelect={selectGraphRequirement} onFocus={selected.id !== graphRoot ? () => focusGraphRequirement(selected.id) : undefined} onEdit={() => openEditor(selected.id)}/>}
          </div>
        </main>
      </div>
      {showContext && <ContextSwitcher
        contexts={contexts.data ?? []}
        currentWorkspaceId={workspace.id}
        currentProjectId={project.id}
        onSelect={(nextWorkspaceId, nextProjectId) => { setShowContext(false); changeContext(nextWorkspaceId, nextProjectId); }}
        onManage={() => { setShowContext(false); onManageWorkspaces?.(); }}
        onClose={() => setShowContext(false)}
      />}
      {showCreateFolder && <CreateFolderModal projectId={project.id} onClose={() => setShowCreateFolder(false)}/>}
      {showCreate && <NewRequirementModal projectId={project.id} workspaceId={workspace.role === null ? undefined : workspace.id} pending={create.isPending} error={create.error} onClose={() => setShowCreate(false)} onCreate={(input) => create.mutate(input)}/>}
      {showMembers && <WorkspaceMembersModal workspaceId={workspace.id} currentUserId={user.id} canManage={workspace.role === 'OWNER'} onClose={() => setShowMembers(false)}/>}
      {showSettings && <SettingsModal projectId={project.id} workspaceId={workspace.id} workspaceRole={workspace.role ?? null} canEdit={canEdit} onClose={() => setShowSettings(false)} onEditTemplate={(id) => { setShowSettings(false); setEditingTemplateId(id); }}/>}
      {showNotifications && <NotificationsPanel panelRef={notificationsPanelRef} notifications={notifications.data ?? []} onSelect={(item) => {
        void api(`/notifications/${item.id}/read`, { method: 'PATCH' }).then(() => client.invalidateQueries({ queryKey: ['notifications'] }));
        setShowNotifications(false);
        const request = item.accessRequest;
        if (!request || (item.type === 'ACCESS_DECISION' && request.status !== 'APPROVED')) return;
        const context = contexts.data?.find(candidate => candidate.id === request.workspaceId && candidate.projects.some(candidateProject => candidateProject.id === request.projectId));
        if (!context) return;
        changeContext(context.id, request.projectId);
        if (item.type === 'ACCESS_REQUEST') setShowMembers(true);
      }}/>}
      {showProfile && <ProfileMenu menuRef={profileMenuRef} user={user} pending={logoutPending} theme={theme ?? 'light'} onThemeChange={onThemeChange} onLogout={onLogout}/>}
    </div>
  );
}

function NotificationsPanel({ panelRef, notifications, onSelect }: { panelRef: Ref<HTMLElement>; notifications: Notification[]; onSelect: (notification: Notification) => void }) {
  const copy = (item: Notification) => {
    const request = item.accessRequest;
    if (item.type === 'MENTION' && item.commentMessage) return { title: 'Menção', text: <>Você foi mencionado por {item.commentMessage.author.name} em {item.commentMessage.thread.requirement.title}.</> };
    if (item.type === 'ACCESS_REQUEST' && request) return { title: 'Pedido de acesso', text: <>{request.requester?.name ?? 'Uma pessoa'} pediu acesso a {request.project?.name ?? 'um projeto'}.</> };
    if (item.type === 'ACCESS_DECISION' && request) return { title: request.status === 'APPROVED' ? 'Acesso aprovado' : 'Pedido recusado', text: request.status === 'APPROVED' ? <>Seu pedido para {request.scope === 'WORKSPACE' ? request.workspace?.name ?? 'o workspace' : request.project?.name ?? 'o projeto'} foi aprovado como {request.role === 'EDITOR' ? 'Editor' : 'Viewer'}.</> : <>Seu pedido para {request.project?.name ?? 'o projeto'} foi recusado. Você pode pedir acesso novamente pelo link da User Story.</> };
    return { title: 'Atualização', text: 'Há uma atualização no ATHENA.' };
  };
  return <section ref={panelRef} id="notifications-panel" className="notifications-panel" role="region" aria-label="Avisos"><header><strong>Avisos</strong><span>{notifications.filter((item) => !item.readAt).length} novos</span></header>{notifications.length ? notifications.slice(0, 8).map((item) => { const content = copy(item); return <button className={item.readAt ? 'read' : ''} key={item.id} onClick={() => onSelect(item)}><strong>{content.title}</strong><span>{content.text}</span></button>; }) : <p>Nenhuma notificação por enquanto.</p>}</section>;
}

export function ProfileMenu({ menuRef, user, pending, theme, onThemeChange, onLogout }: { menuRef: Ref<HTMLElement>; user: User; pending: boolean; theme: Theme; onThemeChange?: (theme: Theme) => void; onLogout: () => void }) {
  const darkModeEnabled = theme === 'dark';
  return <section id="workspace-profile-menu" ref={menuRef} className="profile-menu" role="menu" aria-label="Meu perfil"><div><strong>{user.name}</strong><small>{user.email}</small></div><button type="button" role="menuitem">Meu perfil</button><div className="theme-toggle"><span>Modo escuro</span><LiquidToggle label="Ativar modo escuro" checked={darkModeEnabled} onCheckedChange={(enabled) => onThemeChange?.(enabled ? 'dark' : 'light')}/></div><button role="menuitem" onClick={onLogout} disabled={pending}><Icon name="logout" size={15}/> {pending ? 'Saindo…' : 'Sair'}</button></section>;
}

function CreateFolderModal({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const client = useQueryClient();
  const [name, setName] = useState('');
  const create = useMutation({ mutationFn: () => api<RequirementFolder>(`/projects/${projectId}/folders`, { method: 'POST', body: JSON.stringify({ name: name.trim() }) }), onSuccess: () => { client.invalidateQueries({ queryKey: ['folders', projectId] }); onClose(); } });
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !create.isPending) onClose(); }}><form className="modal-card create-folder-modal" role="dialog" aria-modal="true" aria-labelledby="create-folder-title" onSubmit={(event) => { event.preventDefault(); if (name.trim()) create.mutate(); }}><header className="modal-header"><div><p className="section-kicker">Organização do projeto</p><h2 id="create-folder-title">Nova pasta</h2></div><button type="button" className="icon-button" onClick={onClose} disabled={create.isPending} aria-label="Fechar"><Icon name="close" size={16}/></button></header><p className="form-lead">Agrupe as User Stories deste projeto de uma forma fácil de reconhecer.</p><div className="modal-fields"><label>Nome da pasta<input autoFocus required maxLength={120} value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex.: Área do cliente"/></label>{create.error && <div className="inline-error" role="alert">{create.error.message}</div>}</div><footer className="modal-footer"><span>Você poderá organizar os requisitos depois.</span><div><button type="button" className="secondary-button" onClick={onClose} disabled={create.isPending}>Cancelar</button><button className="primary-button" disabled={!name.trim() || create.isPending}>{create.isPending ? 'Criando…' : 'Criar pasta'}</button></div></footer></form></div>;
}

function ContextSwitcher({ contexts, currentWorkspaceId, currentProjectId, onSelect, onManage, onClose }: { contexts: WorkspaceSummary[]; currentWorkspaceId: string; currentProjectId: string; onSelect: (workspaceId: string, projectId: string) => void; onManage: () => void; onClose: () => void }) {
  return <Dialog title="Trocar projeto" onClose={onClose} className="workspace-switch-dialog">
    <WorkspaceNavigator workspaces={contexts} initialWorkspaceId={currentWorkspaceId} currentProjectId={currentProjectId} onSelect={onSelect}/>
    <footer className="workspace-switch-footer"><button className="secondary-button" onClick={onManage}><Icon name="settings" size={15}/> Gerenciar workspaces</button></footer>
  </Dialog>;
}

export function WorkspaceMembersModal({ workspaceId, currentUserId, canManage, onClose, embedded = false }: { workspaceId: string; currentUserId: string; canManage: boolean; onClose: () => void; embedded?: boolean }) {
  const client = useQueryClient();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Exclude<WorkspaceRole, 'OWNER'>>('EDITOR');
  const members = useQuery<WorkspaceMember[]>({ queryKey: ['members', workspaceId], queryFn: () => api(`/workspaces/${workspaceId}/members`) });
  const invites = useQuery<Array<{ id: string; email: string; role: Exclude<WorkspaceRole, 'OWNER'>; expiresAt: string; revokedAt?: string | null; acceptedAt?: string | null; deliveryError?: string | null }>>({ queryKey: ['invites', workspaceId], queryFn: () => api(`/workspaces/${workspaceId}/invites`), enabled: canManage });
  const memberRows = Array.isArray(members.data) ? members.data : [];
  const inviteRows = Array.isArray(invites.data) ? invites.data : [];
  const invite = useMutation({ mutationFn: () => api(`/workspaces/${workspaceId}/invites`, { method: 'POST', body: JSON.stringify({ email: email.trim(), role }) }), onSuccess: () => { setEmail(''); client.invalidateQueries({ queryKey: ['invites', workspaceId] }); } });
  const resendInvite = useMutation({ mutationFn: (id: string) => api(`/workspaces/${workspaceId}/invites/${id}/resend`, { method: 'POST' }), onSuccess: () => client.invalidateQueries({ queryKey: ['invites', workspaceId] }) });
  const revokeInvite = useMutation({ mutationFn: (id: string) => api(`/workspaces/${workspaceId}/invites/${id}`, { method: 'DELETE' }), onSuccess: () => client.invalidateQueries({ queryKey: ['invites', workspaceId] }) });
  const update = useMutation({ mutationFn: ({ userId, role: nextRole }: { userId: string; role: WorkspaceRole }) => api(`/workspaces/${workspaceId}/members/${userId}`, { method: 'PATCH', body: JSON.stringify({ role: nextRole }) }), onSuccess: () => client.invalidateQueries({ queryKey: ['members', workspaceId] }) });
  const remove = useMutation({ mutationFn: (userId: string) => api(`/workspaces/${workspaceId}/members/${userId}`, { method: 'DELETE' }), onSuccess: () => client.invalidateQueries({ queryKey: ['members', workspaceId] }) });
  const content = <><p className="form-lead">{canManage ? 'Convide pessoas por e-mail. O acesso só é criado após a confirmação e o aceite.' : 'Consulte as pessoas que participam deste workspace.'}</p>{canManage && <><div className="member-invite"><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="pessoa@empresa.com" aria-label="E-mail da pessoa convidada"/><InviteRoleSelect value={role} onChange={setRole}/><button className="primary-button" disabled={!email.trim() || invite.isPending} onClick={() => invite.mutate()}>{invite.isPending ? 'Enviando…' : 'Convidar'}</button></div>{invite.error && <div className="inline-error" role="alert">{invite.error.message}</div>}{inviteRows.filter((item) => !item.acceptedAt && !item.revokedAt).map((item) => <div className="invite-row" key={item.id}><span><strong>{item.email}</strong><small>{item.role === 'MANAGER' ? 'Gerência' : item.role === 'EDITOR' ? 'Editor' : 'Leitor'} · expira em {new Date(item.expiresAt).toLocaleDateString('pt-BR')}</small>{item.deliveryError && <em role="alert">{item.deliveryError}</em>}</span><button className="text-button" disabled={resendInvite.isPending} onClick={() => resendInvite.mutate(item.id)}>Reenviar</button><button className="text-button" disabled={revokeInvite.isPending} onClick={() => revokeInvite.mutate(item.id)}>Revogar</button></div>)}</>}{canManage && <AccessRequestInbox workspaceId={workspaceId} compact/>}{members.isError && <div className="inline-error" role="alert">Não foi possível carregar os membros. <button className="text-button" onClick={() => members.refetch()}>Tentar novamente</button></div>}{invites.isError && <div className="inline-error" role="alert">Não foi possível carregar os convites. <button className="text-button" onClick={() => invites.refetch()}>Tentar novamente</button></div>}{[update.error, remove.error, resendInvite.error, revokeInvite.error].filter(Boolean).map((error, index) => <div key={index} className="inline-error" role="alert">{error?.message}</div>)}<div className="members-list">{members.isLoading && <span className="empty-copy">Carregando membros…</span>}{memberRows.map((member) => <div className="member-row" key={member.user.id}><span className="avatar">{member.user.name.slice(0, 1).toUpperCase()}</span><div><strong>{member.user.name}</strong><small>{member.user.email}</small></div>{member.user.id === currentUserId ? <span className="member-owner">Você</span> : canManage ? <><RoleSelect label={`Papel de ${member.user.name}`} value={member.role} onChange={(nextRole) => update.mutate({ userId: member.user.id, role: nextRole })}/><button className="text-button" onClick={() => remove.mutate(member.user.id)}>Remover</button></> : <span className="member-owner">{member.role === 'MANAGER' ? 'Gerência' : member.role === 'OWNER' ? 'Owner' : member.role === 'EDITOR' ? 'Editor' : 'Leitor'}</span>}</div>)}</div></>;
  if (embedded) return <div className="workspace-team-panel">{content}</div>;
  return <Dialog title="Membros e permissões" onClose={onClose} className="members-modal">{content}<footer className="modal-footer"><span>Owner administra membros, convites e permissões.</span><button className="secondary-button" onClick={onClose}>Concluir</button></footer></Dialog>;
}
function RoleSelect({ value, onChange, label = 'Papel do membro' }: { value: WorkspaceRole; onChange: (role: WorkspaceRole) => void; label?: string }) { return <select aria-label={label} className="role-select" value={value} onChange={(event) => onChange(event.target.value as WorkspaceRole)}><option value="OWNER">Owner</option><option value="MANAGER">Gerência</option><option value="EDITOR">Editor</option><option value="VIEWER">Leitor</option></select>; }
function InviteRoleSelect({ value, onChange }: { value: Exclude<WorkspaceRole, 'OWNER'>; onChange: (role: Exclude<WorkspaceRole, 'OWNER'>) => void }) { return <select aria-label="Papel da pessoa convidada" className="role-select" value={value} onChange={(event) => onChange(event.target.value as Exclude<WorkspaceRole, 'OWNER'>)}><option value="MANAGER">Gerência</option><option value="EDITOR">Editor</option><option value="VIEWER">Leitor</option></select>; }

function RequirementList({ requirements, loading, error, onRetry, onSelect }: { requirements: Requirement[]; loading: boolean; error: Error | null; onRetry: () => void; onSelect: (id: string) => void }) {
  if (loading) return <section className="list-page"><ContentState loading title="Carregando canceladas"/></section>;
  if (error) return <section className="list-page"><ContentState title="Não foi possível carregar as User Stories canceladas" message={error.message} retry={onRetry}/></section>;
  return <section className="list-page"><header className="list-heading"><div><h1>Canceladas</h1><p>As US canceladas podem ser consultadas, mas não editadas.</p></div><span className="count-summary">{requirements.length} {requirements.length === 1 ? 'resultado' : 'resultados'}</span></header>{requirements.length ? <div className="requirements-table"><div className="table-head"><span>Requisito</span><span>Tipo</span><span>Status</span><span>Revisão</span><span/></div>{requirements.map((item) => <button className="table-row" key={item.id} onClick={() => onSelect(item.id)}><span className="table-title"><i>US</i><span><strong>{item.title}</strong><small>{item.code}</small></span></span><span>User Story</span><StatusBadge status={item.status}/><strong>v{item.revision}</strong><Icon name="chevron" size={13}/></button>)}</div> : <div className="list-empty"><span className="state-symbol"><Icon name="list" size={20}/></span><strong>Nenhuma US cancelada</strong><span>As US canceladas aparecerão aqui.</span></div>}</section>;
}
