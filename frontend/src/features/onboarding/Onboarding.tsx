import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Brand } from '../../components/Brand';
import { Icon } from '../../components/Icon';
import { api } from '../../lib/api';
import type { Project, User, Workspace, WorkspaceSummary } from '../../lib/types';
import { ProjectWorkspace } from '../project/ProjectWorkspace';

const ACTIVE_CONTEXT_KEY = 'athena.active-context';

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

export function Onboarding({ user, onLogout }: { user: User; onLogout: () => void }) {
  const client = useQueryClient();
  const savedContext = useState(() => readSavedContext(user.id))[0];
  const [workspaceId, setWorkspaceId] = useState<string | null>(savedContext?.workspaceId ?? null);
  const [projectId, setProjectId] = useState<string | null>(savedContext?.projectId ?? null);
  const [creatingWorkspace, setCreatingWorkspace] = useState(false);
  const [creatingProject, setCreatingProject] = useState(false);
  const [workspaceName, setWorkspaceName] = useState('');
  const [projectName, setProjectName] = useState('');
  const [projectKey, setProjectKey] = useState('');
  const workspaces = useQuery<WorkspaceSummary[]>({ queryKey: ['workspaces'], queryFn: () => api('/workspaces') });
  const workspace = workspaces.data?.find((item) => item.id === workspaceId) ?? null;
  const project = workspace?.projects.find((item) => item.id === projectId) ?? null;

  useEffect(() => {
    if (!workspaces.data) return;
    const validWorkspace = workspaces.data.some((item) => item.id === workspaceId);
    if (workspaceId && !validWorkspace) {
      setWorkspaceId(null);
      setProjectId(null);
      return;
    }
    const validProject = workspaces.data.find((item) => item.id === workspaceId)?.projects.some((item) => item.id === projectId);
    if (projectId && !validProject) setProjectId(null);
  }, [projectId, workspaceId, workspaces.data]);

  useEffect(() => {
    localStorage.setItem(ACTIVE_CONTEXT_KEY, JSON.stringify({ userId: user.id, workspaceId: workspaceId ?? undefined, projectId: projectId ?? undefined }));
  }, [projectId, user.id, workspaceId]);

  const createWorkspace = useMutation({
    mutationFn: () => api<Workspace>('/workspaces', { method: 'POST', body: JSON.stringify({ name: workspaceName.trim() }) }),
    onSuccess: async (created) => {
      client.setQueryData<WorkspaceSummary[]>(['workspaces'], (current = []) => [...current, { ...created, role: 'OWNER', projects: [] }]);
      setWorkspaceId(created.id);
      setProjectId(null);
      setCreatingWorkspace(false);
      setWorkspaceName('');
      await client.invalidateQueries({ queryKey: ['workspaces'] });
    },
  });
  const createProject = useMutation({
    mutationFn: () => api<Project>(`/workspaces/${workspaceId!}/projects`, { method: 'POST', body: JSON.stringify({ name: projectName.trim(), key: projectKey.trim().toUpperCase() }) }),
    onSuccess: async (created) => {
      client.setQueryData<WorkspaceSummary[]>(['workspaces'], (current = []) => current.map((item) => item.id === workspaceId ? { ...item, projects: [...item.projects, created] } : item));
      setProjectId(created.id);
      setCreatingProject(false);
      setProjectName('');
      setProjectKey('');
      await client.invalidateQueries({ queryKey: ['workspaces'] });
    },
  });
  const logout = useMutation({
    mutationFn: () => api<{ ok: true }>('/auth/logout', { method: 'POST' }),
    onSuccess: () => {
      localStorage.removeItem(ACTIVE_CONTEXT_KEY);
      client.clear();
      onLogout();
    },
  });

  if (workspaces.isLoading) return <StatePage loading title="Carregando seus workspaces"/>;
  if (workspaces.isError) return <StatePage title="Não foi possível carregar seus workspaces" message={workspaces.error.message} onRetry={() => workspaces.refetch()} onLogout={() => logout.mutate()} logoutPending={logout.isPending}/>;

  if (workspace && project) return <ProjectWorkspace user={user} workspace={workspace} project={project} onChangeContext={(nextWorkspaceId, nextProjectId) => { setWorkspaceId(nextWorkspaceId); setProjectId(nextProjectId); }} onBrowseWorkspaces={() => { setWorkspaceId(null); setProjectId(null); setCreatingWorkspace(false); setCreatingProject(false); }} onCreateWorkspace={() => { setWorkspaceId(null); setProjectId(null); setCreatingWorkspace(true); }} onCreateProject={() => { setProjectId(null); setCreatingProject(true); }} onLogout={() => logout.mutate()} logoutPending={logout.isPending}/>;

  const workspaceList = workspaces.data ?? [];
  if (workspaceList.length > 0 && !workspace && !creatingWorkspace) {
    return <SelectionPage
      kicker="Seu ambiente"
      title={`Bem-vindo, ${user.name}`}
      description="Selecione o workspace em que deseja trabalhar."
      items={workspaceList.map((item) => ({ id: item.id, badge: item.role, title: item.name, detail: `${item.projects.length} ${item.projects.length === 1 ? 'projeto' : 'projetos'}` }))}
      onSelect={(id) => { setWorkspaceId(id); setProjectId(null); setCreatingProject(false); }}
      onCreate={() => { createWorkspace.reset(); setCreatingWorkspace(true); }}
      createLabel="Criar novo workspace"
      step={1}
      onLogout={() => logout.mutate()}
      logoutPending={logout.isPending}
    />;
  }

  if (workspace && workspace.projects.length > 0 && !project && !creatingProject) {
    return <SelectionPage
      kicker={workspace.name}
      title="Selecione um projeto"
      description="Escolha o projeto que deseja abrir neste workspace."
      items={workspace.projects.map((item) => ({ id: item.id, badge: item.key.slice(0, 3), title: item.name, detail: item.key }))}
      onSelect={setProjectId}
      onCreate={() => { createProject.reset(); setCreatingProject(true); }}
      createLabel="Criar novo projeto"
      step={2}
      onBack={() => { setWorkspaceId(null); setProjectId(null); }}
      onLogout={() => logout.mutate()}
      logoutPending={logout.isPending}
    />;
  }

  const isWorkspaceStep = !workspace;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (isWorkspaceStep) createWorkspace.mutate(); else createProject.mutate();
  };
  const mutation = isWorkspaceStep ? createWorkspace : createProject;

  const currentStep = isWorkspaceStep ? 1 : 2;
  return (
    <main className="onboarding-page">
      <header className="auth-nav"><Brand/><button className="secondary-button" onClick={() => logout.mutate()} disabled={logout.isPending}><Icon name="logout" size={14}/> Sair</button></header>
      <section className="onboarding-card">
        <ProgressSteps current={currentStep}/>
        <p className="section-kicker">{isWorkspaceStep ? 'Novo workspace' : 'Novo projeto'}</p>
        <h1>{isWorkspaceStep ? `Crie seu workspace` : 'Crie um projeto'}</h1>
        <p>{isWorkspaceStep ? 'O workspace reúne pessoas e projetos da sua organização.' : `O projeto ficará dentro de ${workspace?.name}.`}</p>
        <form onSubmit={submit}>
          {isWorkspaceStep ? (
            <label>Nome do workspace<input autoFocus required maxLength={120} value={workspaceName} onChange={(e) => setWorkspaceName(e.target.value)} placeholder="Ex.: Minha organização"/></label>
          ) : <><label>Nome do projeto<input autoFocus required maxLength={120} value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder="Ex.: Plataforma de clientes"/></label><label>Chave do projeto<input required maxLength={16} value={projectKey} onChange={(e) => setProjectKey(e.target.value.replace(/[^a-zA-Z0-9_-]/g, ''))} placeholder="Ex.: PORTAL"/></label></>}
          {mutation.error && <div className="inline-error" role="alert">{mutation.error.message}</div>}
          <button className="primary-button" disabled={mutation.isPending}>{mutation.isPending ? 'Criando…' : isWorkspaceStep ? 'Criar workspace' : 'Criar projeto'}<Icon name="chevron" size={15}/></button>
          {(isWorkspaceStep ? workspaceList.length > 0 : Boolean(workspace?.projects.length)) && <button type="button" className="text-button" onClick={() => { if (isWorkspaceStep) setCreatingWorkspace(false); else setCreatingProject(false); }}>Voltar para a seleção</button>}
        </form>
        <small className="onboarding-note">Os dados informados serão salvos no seu ambiente ATHENA.</small>
      </section>
    </main>
  );
}

interface SelectionItem { id: string; badge: string; title: string; detail: string }

function ProgressSteps({ current }: { current: 1 | 2 }) {
  return <ol className="context-progress" aria-label={`Etapa ${current} de 2`}>
    <li className={current >= 1 ? 'complete' : ''}><span>1</span><strong>Workspace</strong></li>
    <li aria-hidden="true"/>
    <li className={current === 2 ? 'current' : ''}><span>2</span><strong>Projeto</strong></li>
  </ol>;
}

function SelectionPage({ kicker, title, description, items, onSelect, onCreate, createLabel, step, onBack, onLogout, logoutPending }: { kicker: string; title: string; description: string; items: SelectionItem[]; onSelect: (id: string) => void; onCreate: () => void; createLabel: string; step: 1 | 2; onBack?: () => void; onLogout: () => void; logoutPending: boolean }) {
  return <main className="onboarding-page">
    <header className="auth-nav"><Brand/><button className="secondary-button" onClick={onLogout} disabled={logoutPending}><Icon name="logout" size={14}/> Sair</button></header>
    <section className="onboarding-card selection-card">
      <ProgressSteps current={step}/>
      <p className="section-kicker">{kicker}</p>
      <h1>{title}</h1>
      <p>{description}</p>
      <div className="context-list">
        {items.map((item) => <button key={item.id} className="context-option" onClick={() => onSelect(item.id)}>
          <span className="project-key">{item.badge.slice(0, 3).toUpperCase()}</span>
          <span><strong>{item.title}</strong><small>{item.detail}</small></span>
          <Icon name="chevron" size={14}/>
        </button>)}
      </div>
      <div className="selection-actions">
        {onBack && <button type="button" className="secondary-button selection-back" onClick={onBack}><Icon name="back" size={14}/> Voltar</button>}
        <button className="secondary-button" onClick={onCreate}><Icon name="plus" size={14}/>{createLabel}</button>
      </div>
    </section>
  </main>;
}

function StatePage({ loading = false, title, message, onRetry, onLogout, logoutPending = false }: { loading?: boolean; title: string; message?: string; onRetry?: () => void; onLogout?: () => void; logoutPending?: boolean }) {
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
