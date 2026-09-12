import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Icon } from '../../components/Icon';
import { api } from '../../lib/api';
import type { GraphResponse, Notification, Project, Requirement, RequirementFolder, RequirementTemplate, User, Workspace, WorkspaceMember, WorkspaceRole } from '../../lib/types';
import type { WorkspaceSummary } from '../../lib/types';
import { NewRequirementModal, type NewRequirementInput } from './NewRequirementModal';
import { RequirementDrawer } from './RequirementDrawer';
import { RequirementGraph } from './RequirementGraph';
import { FolderOverview } from './FolderOverview';
import { RequirementEditor } from './RequirementEditor';

type View = 'folders' | 'graph' | 'list';
const statusLabels = { DRAFT: 'Rascunho', ACTIVE: 'Ativo', ARCHIVED: 'Arquivado' } as const;

export function ProjectWorkspace({ user, workspace, project, onChangeContext, onBrowseWorkspaces, onCreateWorkspace, onCreateProject, onLogout, logoutPending }: { user: User; workspace: Workspace; project: Project; onChangeContext: (workspaceId: string, projectId: string) => void; onBrowseWorkspaces: () => void; onCreateWorkspace: () => void; onCreateProject: () => void; onLogout: () => void; logoutPending: boolean }) {
  const client = useQueryClient();
  const [view, setView] = useState<View>('folders');
  const [query, setQuery] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showContext, setShowContext] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [graphRoot, setGraphRoot] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(() => { const match = window.location.pathname.match(/\/projects\/([^/]+)\/requirements\/([^/]+)\/edit$/); return match?.[1] === project.id ? match[2] : null; });
  const requirements = useQuery<Requirement[]>({ queryKey: ['requirements', project.id], queryFn: () => api(`/projects/${project.id}/requirements`) });
  const folders = useQuery<RequirementFolder[]>({ queryKey: ['folders', workspace.id], queryFn: () => api(`/workspaces/${workspace.id}/folders`) });
  const contexts = useQuery<WorkspaceSummary[]>({ queryKey: ['workspaces'], queryFn: () => api('/workspaces') });
  const graph = useQuery<GraphResponse>({ queryKey: ['graph', project.id], queryFn: () => api(`/projects/${project.id}/graph`) });
  const notifications = useQuery<Notification[]>({ queryKey: ['notifications'], queryFn: () => api('/notifications') });
  const create = useMutation({
    mutationFn: (input: NewRequirementInput) => api<Requirement>(`/projects/${project.id}/requirements`, { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: async (created) => { await Promise.all([client.invalidateQueries({ queryKey: ['requirements', project.id] }), client.invalidateQueries({ queryKey: ['graph', project.id] })]); setShowCreate(false); setSelectedId(created.id); },
  });
  const selected = requirements.data?.find((item) => item.id === selectedId) ?? null;
  const canEdit = (workspace.role ?? 'EDITOR') !== 'VIEWER';
  const filteredRequirements = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('pt-BR');
    return (requirements.data ?? []).filter((item) => !normalized || `${item.code} ${item.title}`.toLocaleLowerCase('pt-BR').includes(normalized));
  }, [query, requirements.data]);
  const initials = user.name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
  useEffect(() => { const onPop = () => { const match = window.location.pathname.match(/\/projects\/([^/]+)\/requirements\/([^/]+)\/edit$/); setEditingId(match?.[1] === project.id ? match[2] : null); }; window.addEventListener('popstate', onPop); return () => window.removeEventListener('popstate', onPop); }, [project.id]);
  const openEditor = (id: string) => { window.history.pushState({}, '', `/projects/${project.id}/requirements/${id}/edit`); setEditingId(id); };

  if (editingId) return <RequirementEditor projectId={project.id} requirementId={editingId} workspace={workspace} user={user} onClose={() => { window.history.pushState({}, '', `/projects/${project.id}`); setEditingId(null); }} />;

  const openGraph = (id: string) => { setGraphRoot(id); setSelectedId(null); setView('graph'); };
  return (
    <div className="workspace-shell">
      <header className="workspace-header">
        <button className="workspace-brand" onClick={onBrowseWorkspaces} aria-label="Voltar aos workspaces"><span className="workspace-brand-mark">A</span><span>ATHENA</span></button>
        <button className="project-context-trigger" onClick={() => setShowContext(true)} aria-haspopup="dialog" aria-expanded={showContext}><span className="project-key">{project.key.slice(0, 3)}</span><span><small>{workspace.name}</small><strong>{project.name}</strong></span><Icon name="chevron" size={15}/></button>
        <nav className="workspace-tabs" aria-label="Navegação do projeto">
          <button className={view === 'folders' ? 'active' : ''} onClick={() => { setGraphRoot(null); setView('folders'); }}>Visão geral</button>
          <button className={view === 'graph' ? 'active' : ''} onClick={() => { setGraphRoot(null); setSelectedId(null); setView('graph'); }}>Mapa</button>
          <button className={view === 'list' ? 'active' : ''} onClick={() => setView('list')}>Requisitos <span>{requirements.data?.length ?? 0}</span></button>
        </nav>
        <div className="workspace-header-actions"><button className="header-icon-button" aria-label="Abrir avisos" onClick={() => setShowNotifications((open) => !open)}><Icon name="bell" size={17}/>{notifications.data?.filter((item) => !item.readAt).length ? <b>{notifications.data.filter((item) => !item.readAt).length}</b> : null}</button>{workspace.role === 'OWNER' && <button className="header-icon-button" aria-label="Abrir membros" title="Membros" onClick={() => setShowMembers(true)}><Icon name="users" size={17}/></button>}<label className="search-box"><Icon name="search" size={16}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar requisitos" aria-label="Buscar requisitos"/></label><button className="user-avatar" onClick={() => setShowProfile((open) => !open)} aria-expanded={showProfile} aria-haspopup="menu" title="Meu perfil" aria-label="Meu perfil">{initials || <Icon name="user" size={14}/>}</button></div>
      </header>
      <div className="workspace">
        <main className="workspace-content">
          {view === 'folders' && <FolderOverview folders={folders.data ?? []} requirements={requirements.data ?? []} query={query} canEdit={canEdit} onSelect={openGraph} onOpenRequirements={() => setView('list')} onCreateFolder={() => setShowCreateFolder(true)} onCreateRequirement={() => { create.reset(); setShowCreate(true); }} onSettings={() => setShowSettings(true)}/>}
          {view === 'graph' && <section className={`map-page ${selected ? 'has-panel' : ''}`}><div className="map-toolbar"><div className="map-toolbar-content"><button className="secondary-button" onClick={() => { setGraphRoot(null); setView('folders'); }}>← Pastas</button><div className="map-toolbar-title"><h1>{requirements.data?.find((item) => item.id === graphRoot)?.title ?? project.name}</h1><span>Rede de dependências da US selecionada</span></div></div><button className="secondary-button project-requirements-link" onClick={() => setView('list')}>Requisitos <span>{requirements.data?.length ?? 0}</span></button></div>{graph.isLoading && <ContentState loading title="Carregando mapa"/>}{graph.isError && <ContentState title="Não foi possível carregar o mapa" message={graph.error.message} retry={() => graph.refetch()}/>} {graph.data && <RequirementGraph data={graph.data} query={query} rootId={graphRoot} onSelect={setSelectedId}/>}</section>}
          {view === 'list' && <RequirementList requirements={filteredRequirements} loading={requirements.isLoading} error={requirements.error} onRetry={() => requirements.refetch()} onSelect={setSelectedId}/>} 
          {selected && <RequirementDrawer requirement={selected} onClose={() => setSelectedId(null)} onSelect={setSelectedId} onEdit={() => openEditor(selected.id)}/>} 
        </main>
      </div>
      {showContext && <ContextSwitcher contexts={contexts.data ?? []} currentWorkspaceId={workspace.id} currentProjectId={project.id} onSelect={(nextWorkspaceId, nextProjectId) => { setShowContext(false); onChangeContext(nextWorkspaceId, nextProjectId); }} onCreateWorkspace={() => { setShowContext(false); onCreateWorkspace(); }} onCreateProject={() => { setShowContext(false); onCreateProject(); }} onClose={() => setShowContext(false)}/>}
      {showCreateFolder && <CreateFolderModal workspaceId={workspace.id} onClose={() => setShowCreateFolder(false)}/>}
      {showCreate && <NewRequirementModal workspaceId={workspace.id} pending={create.isPending} error={create.error} onClose={() => setShowCreate(false)} onCreate={(input) => create.mutate(input)}/>} 
      {showMembers && <MembersModal workspaceId={workspace.id} currentUserId={user.id} onClose={() => setShowMembers(false)}/>} 
      {showSettings && <SettingsModal workspaceId={workspace.id} canEdit={canEdit} onClose={() => setShowSettings(false)}/>}
      {showNotifications && <NotificationsPanel notifications={notifications.data ?? []} onRead={(id) => api(`/notifications/${id}/read`, { method: 'PATCH' }).then(() => client.invalidateQueries({ queryKey: ['notifications'] }))}/>} 
      {showProfile && <ProfileMenu user={user} pending={logoutPending} onLogout={onLogout}/>}
    </div>
  );
}

function NotificationsPanel({ notifications, onRead }: { notifications: Notification[]; onRead: (id: string) => void }) {
  return <section className="notifications-panel" aria-label="Avisos"><header><strong>Avisos</strong><span>{notifications.filter((item) => !item.readAt).length} novos</span></header>{notifications.length ? notifications.slice(0, 8).map((item) => <button className={item.readAt ? 'read' : ''} key={item.id} onClick={() => onRead(item.id)}><strong>{item.type === 'MENTION' ? 'Menção' : 'Atualização'}</strong><span>{item.type === 'MENTION' && item.commentMessage ? <>Você foi mencionado por {item.commentMessage.author.name} em {item.commentMessage.thread.requirement.title}.</> : 'Há uma atualização no seu workspace.'}</span></button>) : <p>Nenhuma notificação por enquanto.</p>}</section>;
}

function ProfileMenu({ user, pending, onLogout }: { user: User; pending: boolean; onLogout: () => void }) {
  return <section className="profile-menu" role="menu" aria-label="Meu perfil"><div><strong>{user.name}</strong><small>{user.email}</small></div><button role="menuitem" onClick={onLogout} disabled={pending}><Icon name="logout" size={15}/> {pending ? 'Saindo…' : 'Sair'}</button></section>;
}

function SettingsModal({ workspaceId, canEdit, onClose }: { workspaceId: string; canEdit: boolean; onClose: () => void }) {
  const client = useQueryClient();
  const [templateName, setTemplateName] = useState('');
  const folders = useQuery<RequirementFolder[]>({ queryKey: ['folders', workspaceId], queryFn: () => api(`/workspaces/${workspaceId}/folders`) });
  const templates = useQuery<RequirementTemplate[]>({ queryKey: ['templates', workspaceId], queryFn: () => api(`/workspaces/${workspaceId}/templates`) });
  const deleteFolder = useMutation({ mutationFn: (id: string) => api(`/folders/${id}`, { method: 'DELETE' }), onSuccess: () => client.invalidateQueries({ queryKey: ['folders', workspaceId] }) });
  const createTemplate = useMutation({ mutationFn: () => api<RequirementTemplate>(`/workspaces/${workspaceId}/templates`, { method: 'POST', body: JSON.stringify({ name: templateName.trim(), content: { type: 'doc', content: [{ type: 'paragraph' }] } }) }), onSuccess: () => { setTemplateName(''); client.invalidateQueries({ queryKey: ['templates', workspaceId] }); } });
  const deleteTemplate = useMutation({ mutationFn: (id: string) => api(`/templates/${id}`, { method: 'DELETE' }), onSuccess: () => client.invalidateQueries({ queryKey: ['templates', workspaceId] }) });
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="modal-card settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title"><header className="modal-header"><div><p className="section-kicker">Workspace</p><h2 id="settings-title">Configurações</h2></div><button className="icon-button" onClick={onClose}><Icon name="close" size={16}/></button></header><section className="settings-section"><div className="doc-section-heading"><div><h3>Pastas</h3><p className="section-help">Gerencie as pastas existentes. Para criar uma nova, use a ação no topo.</p></div></div><div className="settings-list">{folders.data?.map((folder) => <div className="settings-row" key={folder.id}><span><Icon name="folder" size={14}/><strong>{folder.name}</strong></span><small>{folder.requirementCount ?? 0} US</small>{canEdit && folder.name !== 'Sem pasta' && <button className="text-button" onClick={() => deleteFolder.mutate(folder.id)}>Excluir</button>}</div>)}</div></section><section className="settings-section"><h3>Templates</h3><p className="section-help">Templates são aplicados ao criar uma nova US.</p>{canEdit && <div className="settings-create"><input value={templateName} onChange={(event) => setTemplateName(event.target.value)} placeholder="Nome do novo template"/><button className="primary-button" disabled={!templateName.trim() || createTemplate.isPending} onClick={() => createTemplate.mutate()}>Criar</button></div>}<div className="settings-list">{templates.data?.length ? templates.data.map((template) => <div className="settings-row" key={template.id}><span><Icon name="list" size={14}/><strong>{template.name}</strong></span><small>{template.description || 'Documento reutilizável'}</small>{canEdit && <button className="text-button" onClick={() => deleteTemplate.mutate(template.id)}>Excluir</button>}</div>) : <p className="empty-copy">Nenhum template criado.</p>}</div></section><footer className="modal-footer"><span>Alterações ficam restritas ao workspace.</span><button className="secondary-button" onClick={onClose}>Concluir</button></footer></section></div>;
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

function MembersModal({ workspaceId, currentUserId, onClose }: { workspaceId: string; currentUserId: string; onClose: () => void }) {
  const client = useQueryClient();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<WorkspaceRole>('EDITOR');
  const members = useQuery<WorkspaceMember[]>({ queryKey: ['members', workspaceId], queryFn: () => api(`/workspaces/${workspaceId}/members`) });
  const add = useMutation({ mutationFn: () => api(`/workspaces/${workspaceId}/members`, { method: 'POST', body: JSON.stringify({ email: email.trim(), role }) }), onSuccess: () => { setEmail(''); client.invalidateQueries({ queryKey: ['members', workspaceId] }); } });
  const update = useMutation({ mutationFn: ({ userId, role: nextRole }: { userId: string; role: WorkspaceRole }) => api(`/workspaces/${workspaceId}/members/${userId}`, { method: 'PATCH', body: JSON.stringify({ role: nextRole }) }), onSuccess: () => client.invalidateQueries({ queryKey: ['members', workspaceId] }) });
  const remove = useMutation({ mutationFn: (userId: string) => api(`/workspaces/${workspaceId}/members/${userId}`, { method: 'DELETE' }), onSuccess: () => client.invalidateQueries({ queryKey: ['members', workspaceId] }) });
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="modal-card members-modal" role="dialog" aria-modal="true" aria-labelledby="members-title"><header className="modal-header"><div><p className="section-kicker">Workspace</p><h2 id="members-title">Membros e permissões</h2></div><button className="icon-button" onClick={onClose}>×</button></header><p className="form-lead">Adicione pessoas que já possuem cadastro no ATHENA e defina o que elas podem fazer.</p><div className="member-invite"><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="pessoa@empresa.com"/><RoleSelect value={role} onChange={setRole}/><button className="primary-button" disabled={!email.trim() || add.isPending} onClick={() => add.mutate()}>Adicionar</button></div>{add.error && <div className="inline-error">{add.error.message}</div>}<div className="members-list">{members.isLoading && <span className="empty-copy">Carregando membros…</span>}{members.data?.map((member) => <div className="member-row" key={member.user.id}><span className="avatar">{member.user.name.slice(0, 1).toUpperCase()}</span><div><strong>{member.user.name}</strong><small>{member.user.email}</small></div>{member.user.id === currentUserId ? <span className="member-owner">Você</span> : <><RoleSelect value={member.role} onChange={(nextRole) => update.mutate({ userId: member.user.id, role: nextRole })}/><button className="text-button" onClick={() => remove.mutate(member.user.id)}>Remover</button></>}</div>)}</div><footer className="modal-footer"><span>Owner administra membros e permissões.</span><button className="secondary-button" onClick={onClose}>Concluir</button></footer></section></div>;
}
function RoleSelect({ value, onChange }: { value: WorkspaceRole; onChange: (role: WorkspaceRole) => void }) { return <select className="role-select" value={value} onChange={(event) => onChange(event.target.value as WorkspaceRole)}><option value="OWNER">Owner</option><option value="EDITOR">Editor</option><option value="VIEWER">Leitor</option></select>; }

function RequirementList({ requirements, loading, error, onRetry, onSelect }: { requirements: Requirement[]; loading: boolean; error: Error | null; onRetry: () => void; onSelect: (id: string) => void }) {
  if (loading) return <section className="list-page"><ContentState loading title="Carregando requisitos"/></section>;
  if (error) return <section className="list-page"><ContentState title="Não foi possível carregar os requisitos" message={error.message} retry={onRetry}/></section>;
  return <section className="list-page"><header className="list-heading"><div><p className="section-kicker">Catálogo</p><h1>Requisitos</h1><p>Consulte os registros do projeto.</p></div><span className="count-summary">{requirements.length} {requirements.length === 1 ? 'resultado' : 'resultados'}</span></header>{requirements.length ? <div className="requirements-table"><div className="table-head"><span>Requisito</span><span>Tipo</span><span>Status</span><span>Revisão</span><span/></div>{requirements.map((item) => <button className="table-row" key={item.id} onClick={() => onSelect(item.id)}><span className="table-title"><i>US</i><span><strong>{item.title}</strong><small>{item.code}</small></span></span><span>User Story</span><span className={`status-pill status-${item.status.toLowerCase()}`}>{statusLabels[item.status]}</span><strong>v{item.revision}</strong><Icon name="chevron" size={13}/></button>)}</div> : <div className="list-empty"><span className="state-symbol"><Icon name="list" size={20}/></span><strong>Nenhum requisito encontrado</strong><span>Tente ajustar a busca ou adicione um novo requisito.</span></div>}</section>;
}

function ContentState({ loading = false, title, message, retry }: { loading?: boolean; title: string; message?: string; retry?: () => void }) {
  return <div className="content-state" role={message ? 'alert' : undefined}>{loading ? <span className="loading-ring"/> : <span className="state-symbol">!</span>}<strong>{title}</strong>{message && <span>{message}</span>}{retry && <button className="secondary-button" onClick={retry}><Icon name="refresh" size={13}/> Tentar novamente</button>}</div>;
}
