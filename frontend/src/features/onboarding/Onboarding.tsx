import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import './workspaceNavigation.css';
import { Brand } from '../../components/Brand';
import { Icon } from '../../components/Icon';
import { api } from '../../lib/api';
import type { AccessRequest, User, WorkspaceSummary } from '../../lib/types';
import type { Theme } from '../../lib/theme';
import { ProjectWorkspace } from '../project/ProjectWorkspace';
import { WorkspaceManagementHub } from './WorkspaceManagementHub';

const ACTIVE_CONTEXT_KEY = 'athena.active-context';

function greetingForCurrentTime() {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return 'Bom dia';
  if (hour >= 12 && hour < 18) return 'Boa tarde';
  return 'Boa noite';
}

interface SavedContext { userId: string; workspaceId?: string; projectId?: string }

function readSavedContext(userId: string): SavedContext | null {
  try {
    const saved = JSON.parse(localStorage.getItem(ACTIVE_CONTEXT_KEY) ?? 'null') as SavedContext | null;
    return saved?.userId === userId ? saved : null;
  } catch {
    localStorage.removeItem(ACTIVE_CONTEXT_KEY);
    return null;
  }
}

function readDirectProjectId() {
  return window.location.pathname.match(/^\/projects\/([^/]+)(?:\/requirements\/[^/]+\/edit|\/(?:overview|map|requirements|cancelled|imports))?\/?$/)?.[1] ?? null;
}

export function Onboarding({ user, theme, onThemeChange, onLogout }: { user: User; theme: Theme; onThemeChange: (theme: Theme) => void; onLogout: () => void }) {
  const client = useQueryClient();
  const savedContext = useState(() => {
    const saved = readSavedContext(user.id);
    const params = new URLSearchParams(window.location.search);
    const workspaceId = params.get('workspace') ?? saved?.workspaceId;
    const projectId = params.get('project') ?? saved?.projectId;
    return workspaceId || projectId ? { userId: user.id, workspaceId: workspaceId ?? undefined, projectId: projectId ?? undefined } : saved;
  })[0];
  const directProjectId = useState(readDirectProjectId)[0];
  const [workspaceId, setWorkspaceId] = useState<string | null>(directProjectId ? null : savedContext?.workspaceId ?? null);
  const [projectId, setProjectId] = useState<string | null>(() => directProjectId ? null : new URLSearchParams(window.location.search).get('project'));
  const [directRouteResolved, setDirectRouteResolved] = useState(!directProjectId);
  const [createInManagement, setCreateInManagement] = useState<{ type: 'workspace' } | { type: 'project'; workspaceId: string } | null>(null);
  const [directAccessStatus, setDirectAccessStatus] = useState<'requesting' | 'pending' | 'denied' | 'error' | null>(directProjectId ? 'requesting' : null);
  const [directAccessRequestId, setDirectAccessRequestId] = useState<string | null>(null);
  const workspaces = useQuery<WorkspaceSummary[]>({ queryKey: ['workspaces', 'management'], queryFn: () => api('/workspaces?includeArchived=true'), refetchInterval: directAccessStatus === 'pending' ? 3000 : false });
  const accessRequests = useQuery<AccessRequest[]>({ queryKey: ['access-requests', 'mine'], queryFn: () => api('/access-requests/mine'), enabled: directAccessStatus === 'pending', refetchInterval: directAccessStatus === 'pending' ? 3000 : false });
  const workspace = workspaces.data?.find((item) => item.id === workspaceId && !item.archivedAt) ?? null;
  const project = workspace?.projects.find((item) => item.id === projectId && !item.archivedAt) ?? null;

  const requestAccess = useMutation({
    mutationFn: () => api<{ status: 'PENDING' | 'ALREADY_HAS_ACCESS'; request?: { id: string } }>(`/projects/${directProjectId}/access-requests`, { method: 'POST' }),
    onSuccess: async (result) => {
      setDirectAccessRequestId(result.request?.id ?? null);
      if (result.status === 'ALREADY_HAS_ACCESS') {
        setDirectAccessStatus('requesting');
        await client.invalidateQueries({ queryKey: ['workspaces'] });
      } else setDirectAccessStatus('pending');
    },
    onError: () => setDirectAccessStatus('error'),
  });

  useEffect(() => {
    if (!workspaces.data || !directProjectId) return;
    const routedWorkspace = workspaces.data.find((item) => item.projects.some((candidate) => candidate.id === directProjectId));
    const routedProject = routedWorkspace?.projects.find(candidate => candidate.id === directProjectId);
    if (routedWorkspace && !routedWorkspace.archivedAt && routedProject && !routedProject.archivedAt) {
      setDirectRouteResolved(true);
      setDirectAccessStatus(null);
      setWorkspaceId(routedWorkspace.id);
      setProjectId(directProjectId);
    } else if (routedWorkspace) {
      // Archived items are visible to Owners in management, but cannot be opened or requested through a direct link.
      setDirectRouteResolved(true);
      setDirectAccessStatus(null);
      setWorkspaceId(null);
      setProjectId(null);
    } else if (!directRouteResolved) {
      // Create the request using the project id from the URL. No project data is fetched here.
      setDirectRouteResolved(true);
      setWorkspaceId(null);
      setProjectId(null);
      requestAccess.mutate();
    }
  }, [directProjectId, directRouteResolved, requestAccess.mutate, workspaces.data]);

  useEffect(() => {
    if (!directAccessRequestId) return;
    const current = accessRequests.data?.find((request) => request.id === directAccessRequestId);
    if (current?.status === 'DENIED') setDirectAccessStatus('denied');
    if (current?.status === 'APPROVED') void client.invalidateQueries({ queryKey: ['workspaces'] });
  }, [accessRequests.data, client, directAccessRequestId]);

  useEffect(() => {
    if (!workspaces.data) return;
    const validWorkspace = workspaces.data.some((item) => item.id === workspaceId && !item.archivedAt);
    if (workspaceId && !validWorkspace) {
      setWorkspaceId(null);
      setProjectId(null);
      return;
    }
    const validProject = workspaces.data.find((item) => item.id === workspaceId && !item.archivedAt)?.projects.some((item) => item.id === projectId && !item.archivedAt);
    if (projectId && !validProject) setProjectId(null);
  }, [projectId, workspaceId, workspaces.data]);

  useEffect(() => {
    localStorage.setItem(ACTIVE_CONTEXT_KEY, JSON.stringify({ userId: user.id, workspaceId: workspaceId ?? undefined, projectId: projectId ?? undefined }));
  }, [projectId, user.id, workspaceId]);

  const logout = useMutation({
    mutationFn: () => api<{ ok: true }>('/auth/logout', { method: 'POST' }),
    onSuccess: () => {
      localStorage.removeItem(ACTIVE_CONTEXT_KEY);
      client.clear();
      onLogout();
    },
  });

  if (workspaces.isLoading) return <StatePage loading title="Carregando seus workspaces" theme={theme}/>;
  if (workspaces.isError) return <StatePage title="Não foi possível carregar seus workspaces" message={workspaces.error.message} theme={theme} onRetry={() => workspaces.refetch()} onLogout={() => logout.mutate()} logoutPending={logout.isPending}/>;

  if (directProjectId && directAccessStatus) return <AccessRequestPage status={directAccessStatus} message={requestAccess.error instanceof Error ? requestAccess.error.message : undefined} onRetry={() => { setDirectAccessRequestId(null); setDirectAccessStatus('requesting'); requestAccess.mutate(); }} onLogout={() => logout.mutate()} logoutPending={logout.isPending}/>;

  if (workspace && project) return <ProjectWorkspace user={user} workspace={workspace} project={project} theme={theme} onThemeChange={onThemeChange} onChangeContext={(nextWorkspaceId, nextProjectId) => { setWorkspaceId(nextWorkspaceId); setProjectId(nextProjectId); }} onBrowseWorkspaces={() => setProjectId(null)} onManageWorkspaces={() => setProjectId(null)} onCreateWorkspace={() => { setProjectId(null); setCreateInManagement({ type: 'workspace' }); }} onCreateProject={(nextWorkspaceId) => { const targetWorkspaceId = nextWorkspaceId ?? workspace.id; setWorkspaceId(targetWorkspaceId); setProjectId(null); setCreateInManagement({ type: 'project', workspaceId: targetWorkspaceId }); }} onLogout={() => logout.mutate()} logoutPending={logout.isPending}/>;

  return <WorkspaceManagementHub user={user} workspaces={workspaces.data ?? []} theme={theme} onThemeChange={onThemeChange} initialWorkspaceId={workspaceId ?? undefined} initialCreateWorkspace={createInManagement?.type === 'workspace'} initialCreateProjectWorkspaceId={createInManagement?.type === 'project' ? createInManagement.workspaceId : undefined} greeting={`${greetingForCurrentTime()}, ${user.name}`} onInitialCreateRequestHandled={() => setCreateInManagement(null)} onOpenProject={(nextWorkspaceId, nextProjectId) => { setWorkspaceId(nextWorkspaceId); setProjectId(nextProjectId); setCreateInManagement(null); }} onLogout={() => logout.mutate()} logoutPending={logout.isPending}/>;
}

function AccessRequestPage({ status, message, onRetry, onLogout, logoutPending }: { status: 'requesting' | 'pending' | 'denied' | 'error'; message?: string; onRetry: () => void; onLogout: () => void; logoutPending: boolean }) {
  const requesting = status === 'requesting';
  const denied = status === 'denied';
  const failed = status === 'error';
  return <main className="onboarding-page">
    <header className="auth-nav"><Brand/><button className="secondary-button" onClick={onLogout} disabled={logoutPending}><Icon name="logout" size={14}/> Sair</button></header>
    <section className="onboarding-card access-request-card" aria-live="polite">
      <span className="state-symbol"><Icon name={requesting ? 'refresh' : failed || denied ? 'close' : 'users'} size={20}/></span>
      <p className="section-kicker">Acesso ao projeto</p>
      <h1>{requesting ? 'Enviando pedido' : denied ? 'Pedido recusado' : failed ? 'Não foi possível pedir acesso' : 'Pedido enviado'}</h1>
      <p>{requesting ? 'Estamos encaminhando sua solicitação aos Owners do workspace.' : denied ? 'Um Owner recusou este pedido. Você pode enviar uma nova solicitação pelo mesmo link.' : failed ? (message ?? 'Tente novamente em instantes.') : 'Um Owner precisa aprovar seu acesso. A página vai abrir automaticamente quando sua permissão for liberada.'}</p>
      {(failed || denied) && <button type="button" className="primary-button" onClick={onRetry}>{denied ? 'Pedir acesso novamente' : 'Tentar novamente'} <Icon name="chevron" size={15}/></button>}
      {!failed && !requesting && !denied && <small className="onboarding-note">O conteúdo da User Story permanece restrito até a aprovação.</small>}
    </section>
  </main>;
}

function StatePage({ loading = false, title, message, theme = 'light', onRetry, onLogout, logoutPending = false }: { loading?: boolean; title: string; message?: string; theme?: Theme; onRetry?: () => void; onLogout?: () => void; logoutPending?: boolean }) {
  return <main className="onboarding-page">
    {onLogout && <header className="auth-nav"><Brand/><button className="secondary-button" onClick={onLogout} disabled={logoutPending}><Icon name="logout" size={14}/> Sair</button></header>}
    <section className="state-page">
      {loading ? <span className="loading-ring"/> : <span className="state-symbol">!</span>}
      <p className="section-kicker">ATHENA</p><h1>{title}</h1>
      {message && <p>{message}</p>}
      {onRetry && <button className="secondary-button" onClick={onRetry}><Icon name="refresh" size={13}/> Tentar novamente</button>}
    </section>
  </main>;
}
