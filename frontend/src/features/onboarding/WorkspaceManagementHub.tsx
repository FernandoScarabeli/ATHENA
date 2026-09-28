import './workspaceNavigation.css';
import { EntityActions } from './EntityActions';
import { workspaceRoleLabel } from './WorkspaceNavigator';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Archive, ArrowRightLeft, Check, ChevronRight, FolderKanban, Plus, RotateCcw, Search, Settings2, Trash2, Users, X } from 'lucide-react';
import { Brand } from '../../components/Brand';
import { Dialog, ConfirmDialog } from '../../components/ui/Dialog';
import { api } from '../../lib/api';
import type { Project, User, WorkspaceSummary } from '../../lib/types';
import { ProfileMenu, WorkspaceMembersModal } from '../project/ProjectWorkspace';
import type { Theme } from '../../lib/theme';

type Pane = 'projects' | 'people' | 'archived';
type FormTarget = { type: 'workspace' | 'project'; mode: 'create' | 'edit'; id?: string; workspaceId?: string; name?: string; key?: string };
type LifecycleTarget = { type: 'project'; id: string; name: string };
type DeleteTarget = { type: 'workspace' | 'project'; id: string; name: string };

export function WorkspaceManagementHub({ user, workspaces, onOpenProject, onLogout, logoutPending, initialWorkspaceId, initialCreateWorkspace, initialCreateProjectWorkspaceId, onInitialCreateRequestHandled, greeting, theme, onThemeChange }: {
  initialWorkspaceId?: string;
  initialCreateWorkspace?: boolean;
  initialCreateProjectWorkspaceId?: string;
  greeting?: string;
  theme?: Theme;
  onThemeChange?: (theme: Theme) => void;
  user: User;
  workspaces: WorkspaceSummary[];
  onOpenProject: (workspaceId: string, projectId: string) => void;
  onInitialCreateRequestHandled?: () => void;
  onLogout: () => void;
  logoutPending: boolean;
}) {
  const client = useQueryClient();
  const [workspaceQuery, setWorkspaceQuery] = useState('');
  const [projectQuery, setProjectQuery] = useState('');
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState(() => workspaces.find(item => item.id === initialWorkspaceId)?.id ?? workspaces.find(item => !item.archivedAt)?.id ?? workspaces[0]?.id ?? '');
  const [pane, setPane] = useState<Pane>('projects');
  const [formTarget, setFormTarget] = useState<FormTarget | null>(() => initialCreateProjectWorkspaceId
    ? { type: 'project', mode: 'create', workspaceId: initialCreateProjectWorkspaceId }
    : initialCreateWorkspace ? { type: 'workspace', mode: 'create' } : null);
  const [lifecycleTarget, setLifecycleTarget] = useState<LifecycleTarget | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [typedName, setTypedName] = useState('');
  const [moveTarget, setMoveTarget] = useState<Project | null>(null);
  const [moveWorkspaceId, setMoveWorkspaceId] = useState('');
  const [moveKey, setMoveKey] = useState('');
  const [moveNotice, setMoveNotice] = useState('');
  const [showProfile, setShowProfile] = useState(false);
  const profileRootRef = useRef<HTMLDivElement>(null);
  const profileButtonRef = useRef<HTMLButtonElement>(null);
  const profileMenuRef = useRef<HTMLElement>(null);
  const workspaceTabsRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (initialCreateWorkspace || initialCreateProjectWorkspaceId) onInitialCreateRequestHandled?.();
  }, [initialCreateProjectWorkspaceId, initialCreateWorkspace, onInitialCreateRequestHandled]);

  useEffect(() => {
    if (!showProfile) return;
    const dismiss = (event: PointerEvent) => {
      if (!profileRootRef.current?.contains(event.target as Node)) setShowProfile(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowProfile(false);
        profileButtonRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', dismiss);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [showProfile]);

  const selectedWorkspace = workspaces.find(item => item.id === selectedWorkspaceId) ?? workspaces.find(item => !item.archivedAt) ?? workspaces[0] ?? null;
  const isOwner = selectedWorkspace?.role === 'OWNER';
  const canManageProjects = isOwner || selectedWorkspace?.role === 'MANAGER';
  const workspaceArchived = Boolean(selectedWorkspace?.archivedAt);
  const visibleWorkspaces = useMemo(() => workspaces
    .filter(item => `${item.name} ${item.role ?? ''}`.toLocaleLowerCase('pt-BR').includes(workspaceQuery.trim().toLocaleLowerCase('pt-BR'))), [workspaceQuery, workspaces]);
  const visibleProjects = useMemo(() => (selectedWorkspace?.projects ?? [])
    .filter(item => `${item.name} ${item.key}`.toLocaleLowerCase('pt-BR').includes(projectQuery.trim().toLocaleLowerCase('pt-BR'))), [projectQuery, selectedWorkspace?.projects]);
  const activeProjects = visibleProjects.filter(item => !item.archivedAt);
  const archivedProjects = visibleProjects.filter(item => Boolean(item.archivedAt));
  const activeOwners = workspaces.filter(item => item.role === 'OWNER' && !item.archivedAt && item.id !== selectedWorkspace?.id);

  useLayoutEffect(() => {
    const tabs = workspaceTabsRef.current;
    if (!tabs) return;

    const updateIndicator = () => {
      const activeTab = tabs.querySelector<HTMLElement>('[aria-current="page"]');
      if (!activeTab) return;
      tabs.style.setProperty('--workspace-tab-indicator-offset', `${activeTab.offsetLeft}px`);
      tabs.style.setProperty('--workspace-tab-indicator-width', `${activeTab.offsetWidth}px`);
    };

    updateIndicator();
    const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(updateIndicator);
    resizeObserver?.observe(tabs);
    const activeTab = tabs.querySelector<HTMLElement>('[aria-current="page"]');
    if (activeTab) resizeObserver?.observe(activeTab);
    window.addEventListener('resize', updateIndicator);
    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener('resize', updateIndicator);
    };
  }, [pane, selectedWorkspace?.id, selectedWorkspace?.role]);

  const refresh = () => client.invalidateQueries({ queryKey: ['workspaces'] });
  const saveEntity = useMutation({
    mutationFn: (input: FormTarget & { name: string; key?: string }) => {
      if (input.type === 'workspace' && input.mode === 'create') return api('/workspaces', { method: 'POST', body: JSON.stringify({ name: input.name }) });
      if (input.type === 'workspace') return api(`/workspaces/${input.id}`, { method: 'PATCH', body: JSON.stringify({ name: input.name }) });
      if (input.mode === 'create') return api(`/workspaces/${input.workspaceId}/projects`, { method: 'POST', body: JSON.stringify({ name: input.name, key: input.key }) });
      return api(`/projects/${input.id}`, { method: 'PATCH', body: JSON.stringify({ name: input.name, key: input.key }) });
    },
    onSuccess: async (result: any, input) => {
      setFormTarget(null);
      if (input.mode === 'create') onInitialCreateRequestHandled?.();
      if (input.type === 'workspace' && input.mode === 'create' && result?.id) setSelectedWorkspaceId(result.id);
      await refresh();
    },
  });
  const lifecycle = useMutation({
    mutationFn: ({ target, action }: { target: LifecycleTarget; action: 'archive' | 'restore' }) => {
      const path = `/projects/${target.id}`;
      return api(action === 'archive' ? path : `${path}/restore`, { method: action === 'archive' ? 'DELETE' : 'POST' });
    },
    onSuccess: async (_result, input) => {
      setLifecycleTarget(null);
      await refresh();
    },
  });
  const permanentDelete = useMutation({
    mutationFn: (target: DeleteTarget) => {
      const path = target.type === 'workspace' ? `/workspaces/${target.id}` : `/projects/${target.id}`;
      return api(`${path}/permanent`, { method: 'DELETE', body: JSON.stringify({ confirmationName: typedName }) });
    },
    onSuccess: async (_result, target) => {
      setDeleteTarget(null);
      setTypedName('');
      if (target.type === 'workspace') setSelectedWorkspaceId(workspaces.find(item => item.id !== target.id && !item.archivedAt)?.id ?? '');
      await refresh();
    },
  });
  const move = useMutation({
    mutationFn: () => api<{ accessImpact?: { integrationsRequireReconnect?: boolean } }>(`/projects/${moveTarget!.id}/move`, { method: 'POST', body: JSON.stringify({ targetWorkspaceId: moveWorkspaceId, key: moveKey.trim().toUpperCase() }) }),
    onSuccess: async result => {
      const destinationId = moveWorkspaceId;
      setMoveTarget(null);
      setMoveNotice(result.accessImpact?.integrationsRequireReconnect ? 'Projeto movido. Configure novamente as integrações no workspace de destino.' : 'Projeto movido. O acesso agora segue as regras do workspace de destino.');
      setSelectedWorkspaceId(destinationId);
      setPane('projects');
      await refresh();
    },
  });

  const selectWorkspace = (item: WorkspaceSummary) => {
    setSelectedWorkspaceId(item.id);
    setPane(current => current === 'people' && item.role !== 'OWNER' ? 'projects' : current);
    setProjectQuery('');
    setMoveNotice('');
  };

  const beginMove = (project: Project) => {
    setMoveTarget(project);
    setMoveWorkspaceId(activeOwners[0]?.id ?? '');
    setMoveKey(project.key);
    move.reset();
  };

  const renderWorkspace = (item: WorkspaceSummary) => <button key={item.id} type="button" aria-pressed={item.id === selectedWorkspace?.id} className={`workspace-manager-workspace${item.id === selectedWorkspace?.id ? ' selected' : ''}${item.archivedAt ? ' is-archived' : ''}`} onClick={() => selectWorkspace(item)}>
    <span className="workspace-manager-avatar">{item.name.slice(0, 2).toLocaleUpperCase('pt-BR')}</span>
    <span className="workspace-manager-workspace-copy"><strong>{item.name}</strong><small>{item.archivedAt ? 'Arquivado' : `${item.projects.filter(project => !project.archivedAt).length} ${item.projects.filter(project => !project.archivedAt).length === 1 ? 'projeto' : 'projetos'}`}</small></span>
    {item.role && <span className="workspace-manager-owner">{{ OWNER: 'Owner', MANAGER: 'Gerência', EDITOR: 'Editor', VIEWER: 'Leitor' }[item.role]}</span>}
  </button>;

  const renderProject = (project: Project) => <article className={`workspace-manager-project${project.archivedAt ? ' is-archived' : ''}`} key={project.id}>
    <span className="workspace-manager-project-key">{project.key.slice(0, 3).toUpperCase()}</span>
    <div className="workspace-manager-project-copy"><strong>{project.name}</strong><small>{project.key}{project.archivedAt ? ' · Arquivado' : ''}</small></div>
    {!project.archivedAt && !workspaceArchived && <button type="button" className="project-open-button" onClick={() => onOpenProject(selectedWorkspace!.id, project.id)}>Abrir <ChevronRight size={15}/></button>}
    {canManageProjects && !project.archivedAt && !workspaceArchived && <div className="workspace-manager-project-actions"><EntityActions label={`Opções de ${project.name}`}>
      <button type="button" className="icon-button" aria-label={`Editar ${project.name}`} title="Editar projeto" onClick={() => { saveEntity.reset(); setFormTarget({ type: 'project', mode: 'edit', id: project.id, workspaceId: selectedWorkspace!.id, name: project.name, key: project.key }); }}><Settings2 size={15}/> Editar projeto</button>
      {isOwner && <button type="button" className="icon-button" aria-label={`Mover ${project.name}`} title="Mover projeto" onClick={() => beginMove(project)}><ArrowRightLeft size={15}/> Mover para outro workspace</button>}
      <button type="button" className="icon-button" aria-label={`Arquivar ${project.name}`} title="Arquivar projeto" onClick={() => { lifecycle.reset(); setLifecycleTarget({ type: 'project', id: project.id, name: project.name }); }}><Archive size={15}/> Arquivar projeto</button>
    </EntityActions></div>}
    {canManageProjects && project.archivedAt && <div className="workspace-manager-project-actions">
      {!workspaceArchived && <button type="button" className="icon-button" aria-label={`Restaurar ${project.name}`} title="Restaurar projeto" disabled={lifecycle.isPending} onClick={() => { lifecycle.reset(); lifecycle.mutate({ target: { type: 'project', id: project.id, name: project.name }, action: 'restore' }); }}><RotateCcw size={15}/></button>}
      <button type="button" className="icon-button danger" aria-label={`Excluir definitivamente ${project.name}`} title="Excluir definitivamente" onClick={() => { permanentDelete.reset(); setTypedName(''); setDeleteTarget({ type: 'project', id: project.id, name: project.name }); }}><Trash2 size={15}/></button>
    </div>}
  </article>;

  return <main className="workspace-manager-shell">
    <header className="workspace-manager-header">
      <Brand/>
      <div className="workspace-manager-header-spacer"/>
      <div className="workspace-profile-control" ref={profileRootRef}>
        <button ref={profileButtonRef} type="button" className="user-avatar" aria-label="Meu perfil" aria-haspopup="menu" aria-expanded={showProfile} aria-controls="workspace-profile-menu" title="Meu perfil" onClick={() => setShowProfile(open => !open)}>{user.name.trim().split(/\s+/).map(part => part[0]).slice(0, 2).join('').toLocaleUpperCase('pt-BR') || user.email[0]?.toLocaleUpperCase('pt-BR') || 'U'}</button>
        {showProfile && <ProfileMenu menuRef={profileMenuRef} user={user} pending={logoutPending} theme={theme ?? 'light'} onThemeChange={onThemeChange} onLogout={onLogout}/>}
      </div>
    </header>
    <section className="workspace-home-heading workspace-manager-greeting"><div><h1>{greeting ?? `Olá, ${user.name}`}</h1><p>Organize sua equipe ou abra um projeto.</p></div></section>
    <div className="workspace-manager-layout">
      <aside className="workspace-manager-sidebar" aria-label="Workspaces">
        <div className="workspace-manager-side-heading"><h2>Workspaces</h2><button type="button" className="icon-button" aria-label="Criar workspace" title="Criar workspace" onClick={() => { saveEntity.reset(); setFormTarget({ type: 'workspace', mode: 'create' }); }}><Plus size={17}/></button></div>
        <label className="workspace-manager-mobile-select">Workspace atual<select value={selectedWorkspace?.id ?? ''} onChange={event => { const item = workspaces.find(item => item.id === event.target.value); if (item) selectWorkspace(item); }}><option value="" disabled>Selecione um workspace</option>{workspaces.map(item => <option key={item.id} value={item.id}>{item.name}{item.archivedAt ? ' · Arquivado' : ''}</option>)}</select></label>
        <label className="workspace-manager-search"><Search size={16}/><input aria-label="Buscar workspace" placeholder="Buscar workspace" value={workspaceQuery} onChange={event => setWorkspaceQuery(event.target.value)}/>{workspaceQuery && <button type="button" aria-label="Limpar busca" onClick={() => setWorkspaceQuery('')}><X size={14}/></button>}</label>
        <div className="workspace-manager-list">
          {visibleWorkspaces.map(renderWorkspace)}
          {!visibleWorkspaces.length && <p className="workspace-manager-empty">Nenhum workspace encontrado.</p>}
        </div>
      </aside>

      <section className="workspace-manager-main" aria-label="Gestão do workspace">
        {!selectedWorkspace ? <div className="workspace-manager-blank"><FolderKanban size={22}/><h2>{workspaces.length ? 'Escolha um workspace' : 'Crie seu primeiro workspace'}</h2><p>{workspaces.length ? 'Selecione um workspace à esquerda ou crie um novo.' : 'Workspaces reúnem seus projetos e sua equipe em um só lugar.'}</p><button type="button" className="primary-button" onClick={() => { saveEntity.reset(); setFormTarget({ type: 'workspace', mode: 'create' }); }}><Plus size={16}/> Criar workspace</button></div> : <>
          <header className="workspace-manager-titlebar">
            <div className="workspace-manager-title-copy"><span className="workspace-manager-avatar large">{selectedWorkspace.name.slice(0, 2).toLocaleUpperCase('pt-BR')}</span><div><h2>{selectedWorkspace.name}</h2><p>{workspaceArchived ? 'Workspace arquivado' : `${workspaceRoleLabel(selectedWorkspace.role)} · ${selectedWorkspace.projects.filter(project => !project.archivedAt).length} ${selectedWorkspace.projects.filter(project => !project.archivedAt).length === 1 ? 'projeto ativo' : 'projetos ativos'}`}</p></div></div>
            <div className="workspace-manager-title-actions">
              {isOwner && <EntityActions label="Opções do workspace">
                <button type="button" className="secondary-button" onClick={() => { saveEntity.reset(); setFormTarget({ type: 'workspace', mode: 'edit', id: selectedWorkspace.id, name: selectedWorkspace.name }); }}><Settings2 size={15}/> Editar</button>
                <button type="button" className="is-danger" onClick={() => { permanentDelete.reset(); setTypedName(''); setDeleteTarget({ type: 'workspace', id: selectedWorkspace.id, name: selectedWorkspace.name }); }}><Trash2 size={15}/> Excluir workspace</button>
              </EntityActions>}
            </div>
          </header>
          {workspaceArchived && <div className="workspace-manager-notice"><Archive size={16}/> Este workspace foi arquivado anteriormente. Você pode excluí-lo permanentemente pelo menu de opções.</div>}
          {moveNotice && <div className="workspace-manager-notice success"><Check size={16}/><span>{moveNotice}</span><button type="button" aria-label="Fechar aviso" onClick={() => setMoveNotice('')}><X size={14}/></button></div>}
          {lifecycle.error && <div className="inline-error workspace-manager-error" role="alert"><span>{lifecycle.error.message}</span><button type="button" className="text-button" onClick={() => lifecycle.reset()}>Fechar</button></div>}
          <nav ref={workspaceTabsRef} className="workspace-manager-tabs" aria-label="Seções de gestão">
            <button type="button" className={pane === 'projects' ? 'active' : ''} aria-current={pane === 'projects' ? 'page' : undefined} onClick={() => setPane('projects')}><FolderKanban size={16}/> Projetos</button>
            {isOwner && <button type="button" className={pane === 'people' ? 'active' : ''} aria-current={pane === 'people' ? 'page' : undefined} onClick={() => setPane('people')}><Users size={16}/> Pessoas e acesso</button>}
            <button type="button" className={pane === 'archived' ? 'active' : ''} aria-current={pane === 'archived' ? 'page' : undefined} onClick={() => setPane('archived')}><Archive size={16}/> Projetos arquivados</button>
            <span className="workspace-manager-tab-indicator" aria-hidden="true"/>
          </nav>

          {pane === 'projects' && <section className="workspace-manager-section">
            <header className="workspace-manager-section-header"><div><h3>Projetos</h3><p>Organize o trabalho e os acessos da sua equipe.</p></div><div className="workspace-manager-section-actions">
              {canManageProjects && !workspaceArchived && <button type="button" className="primary-button" onClick={() => { saveEntity.reset(); setFormTarget({ type: 'project', mode: 'create', workspaceId: selectedWorkspace.id }); }}><Plus size={16}/> Novo projeto</button>}
            </div></header>
            <label className="workspace-manager-search project"><Search size={16}/><input aria-label="Buscar projeto" placeholder="Buscar por nome ou chave" value={projectQuery} onChange={event => setProjectQuery(event.target.value)}/>{projectQuery && <button type="button" aria-label="Limpar busca" onClick={() => setProjectQuery('')}><X size={14}/></button>}</label>
            <div className="workspace-manager-project-list">
              {activeProjects.map(renderProject)}
              {!activeProjects.length && <div className="workspace-manager-empty-projects"><FolderKanban size={20}/><strong>{projectQuery ? 'Nenhum projeto ativo encontrado' : 'Este workspace ainda não tem projetos ativos'}</strong><span>{!projectQuery && canManageProjects && !workspaceArchived ? 'Crie o primeiro projeto para começar a organizar o trabalho.' : 'Ajuste a busca ou selecione outro workspace.'}</span>{!projectQuery && canManageProjects && !workspaceArchived && <button type="button" className="secondary-button" onClick={() => { saveEntity.reset(); setFormTarget({ type: 'project', mode: 'create', workspaceId: selectedWorkspace.id }); }}><Plus size={15}/> Criar projeto</button>}</div>}
            </div>
          </section>}

          {pane === 'people' && isOwner && <section className="workspace-manager-section" key={selectedWorkspace.id}>
            <header className="workspace-manager-section-header"><div><h3>Pessoas e acesso</h3><p>Membros, convites e pedidos de acesso de {selectedWorkspace.name}.</p></div></header>
            {workspaceArchived ? <p className="workspace-manager-empty">Restaure o workspace para gerenciar sua equipe.</p> : <WorkspaceMembersModal embedded workspaceId={selectedWorkspace.id} currentUserId={user.id} canManage={isOwner} onClose={() => setPane('projects')}/>}
          </section>}

          {pane === 'archived' && <section className="workspace-manager-section workspace-manager-archive-content">
            <section aria-label="Projetos arquivados">
              <header className="workspace-manager-section-header"><div><h3>Projetos arquivados</h3><p>Projetos arquivados em {selectedWorkspace.name}.</p></div><span className="workspace-manager-archive-count">{archivedProjects.length}</span></header>
              <div className="workspace-manager-project-list">
                {archivedProjects.map(renderProject)}
                {!archivedProjects.length && <p className="workspace-manager-empty">Nenhum projeto arquivado neste workspace.</p>}
              </div>
            </section>
          </section>}

        </>}
      </section>
    </div>

    {formTarget && <EntityFormDialog target={formTarget} pending={saveEntity.isPending} error={saveEntity.error?.message} onCancel={() => { if (formTarget.mode === 'create') onInitialCreateRequestHandled?.(); setFormTarget(null); saveEntity.reset(); }} onSave={(name, key) => saveEntity.mutate({ ...formTarget, name, key })}/>}
    {lifecycleTarget && <ConfirmDialog title="Arquivar projeto?" description={<>O projeto <strong>{lifecycleTarget.name}</strong> ficará indisponível para edição e sincronização até ser restaurado.{lifecycle.error && <span className="inline-error" role="alert">{lifecycle.error.message}</span>}</>} confirmLabel="Arquivar" tone="danger" pending={lifecycle.isPending} onCancel={() => { setLifecycleTarget(null); lifecycle.reset(); }} onConfirm={() => lifecycle.mutate({ target: lifecycleTarget, action: 'archive' })}/>}
    {deleteTarget && <Dialog title="Excluir permanentemente" onClose={() => { setDeleteTarget(null); setTypedName(''); permanentDelete.reset(); }} closeDisabled={permanentDelete.isPending} className="workspace-delete-dialog">
      <form onSubmit={event => { event.preventDefault(); if (typedName.trim() === deleteTarget.name) permanentDelete.mutate(deleteTarget); }}>
        <p className="form-lead">{deleteTarget.type === 'workspace' ? 'O workspace, seus projetos e os dados associados serão removidos do ATHENA.' : 'O projeto, seus requisitos e o histórico serão removidos do ATHENA.'} Arquivos nos serviços conectados não serão removidos.</p>
        {permanentDelete.error && <div className="inline-error" role="alert">{permanentDelete.error.message}</div>}
        <label><span>Digite <strong>{deleteTarget.name}</strong> para confirmar</span><input autoFocus value={typedName} onChange={event => setTypedName(event.target.value)} aria-label={`Confirme o nome ${deleteTarget.name}`}/></label>
        <footer className="modal-footer">
          <div>
            <button type="button" className="secondary-button" onClick={() => setDeleteTarget(null)} disabled={permanentDelete.isPending}>Cancelar</button>
            <button type="submit" className="primary-button danger-button" disabled={typedName.trim() !== deleteTarget.name || permanentDelete.isPending}>{permanentDelete.isPending ? 'Excluindo…' : 'Excluir definitivamente'}</button>
          </div>
        </footer>
      </form>
    </Dialog>}
    {moveTarget && <Dialog title="Mover projeto" onClose={() => { setMoveTarget(null); move.reset(); }} closeDisabled={move.isPending} className="workspace-move-dialog"><form onSubmit={event => { event.preventDefault(); if (moveWorkspaceId && moveKey.trim()) move.mutate(); }}><p className="form-lead"><strong>{moveTarget.name}</strong> manterá seus requisitos, pastas, dados importados no ATHENA, convites e membros diretos.</p><div className="workspace-manager-notice"><Users size={16}/><span>Os membros do workspace de origem perdem o acesso herdado; os membros do destino passam a ter acesso. A sincronização e os destinos externos da origem serão pausados e precisarão ser configurados novamente. As credenciais não serão transferidas.</span></div><label>Workspace de destino<select value={moveWorkspaceId} onChange={event => setMoveWorkspaceId(event.target.value)} required><option value="">Selecione um workspace</option>{activeOwners.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Chave do projeto<input required maxLength={16} value={moveKey} onChange={event => setMoveKey(event.target.value.replace(/[^a-zA-Z0-9_-]/g, '').toUpperCase())}/></label>{move.error && <div className="inline-error" role="alert">{move.error.message}</div>}<footer className="modal-footer"><span>Você precisa ser Owner nos dois workspaces.</span><div><button type="button" className="secondary-button" onClick={() => setMoveTarget(null)} disabled={move.isPending}>Cancelar</button><button type="submit" className="primary-button" disabled={!moveWorkspaceId || !moveKey.trim() || move.isPending}>{move.isPending ? 'Movendo…' : 'Mover projeto'}</button></div></footer></form></Dialog>}
  </main>;
}

function EntityFormDialog({ target, pending, error, onCancel, onSave }: { target: FormTarget; pending: boolean; error?: string; onCancel: () => void; onSave: (name: string, key?: string) => void }) {
  const [name, setName] = useState(target.name ?? '');
  const [key, setKey] = useState(target.key ?? '');
  const entity = target.type === 'workspace' ? 'workspace' : 'projeto';
  return <Dialog title={`${target.mode === 'create' ? 'Criar' : 'Editar'} ${entity}`} onClose={onCancel} closeDisabled={pending} className="workspace-entity-dialog"><form onSubmit={event => { event.preventDefault(); if (name.trim() && (target.type === 'workspace' || key.trim())) onSave(name.trim(), target.type === 'project' ? key.trim().toUpperCase() : undefined); }}><label>Nome<input autoFocus required maxLength={120} value={name} onChange={event => setName(event.target.value)} placeholder={target.type === 'workspace' ? 'Ex.: Produto' : 'Ex.: Plataforma de clientes'}/></label>{target.type === 'project' && <label>Chave do projeto<input required maxLength={16} value={key} onChange={event => setKey(event.target.value.replace(/[^a-zA-Z0-9_-]/g, '').toUpperCase())} placeholder="Ex.: PORTAL"/></label>}{error && <div className="inline-error" role="alert">{error}</div>}<footer className={`modal-footer${target.type === 'workspace' ? ' modal-footer-actions-only' : ''}`}>{target.type === 'project' && <span>A chave precisa ser única neste workspace.</span>}<div><button type="button" className="secondary-button" onClick={onCancel} disabled={pending}>Cancelar</button><button type="submit" className="primary-button" disabled={!name.trim() || (target.type === 'project' && !key.trim()) || pending}>{pending ? 'Salvando…' : target.mode === 'create' ? 'Criar' : 'Salvar alterações'}</button></div></footer></form></Dialog>;
}
