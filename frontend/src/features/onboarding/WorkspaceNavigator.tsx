import { useState } from 'react';
import { Check, ChevronRight, FolderKanban, Plus, Search, X } from 'lucide-react';
import type { WorkspaceSummary } from '../../lib/types';

export const workspaceRoleLabel = (role: WorkspaceSummary['role']) => role ? ({ OWNER: 'Owner', MANAGER: 'Gerência', EDITOR: 'Editor', VIEWER: 'Leitor' } as const)[role] : 'Acesso por projeto';

/** One context browser for the entry screen and the in-project switcher. */
export function WorkspaceNavigator({ workspaces, initialWorkspaceId, currentProjectId, onSelect, onCreateWorkspace, onCreateProject, onWorkspaceChange, createProjectLabel = 'Novo projeto' }: {
  workspaces: WorkspaceSummary[];
  initialWorkspaceId?: string;
  currentProjectId?: string;
  onWorkspaceChange?: (workspaceId: string) => void;
  onSelect: (workspaceId: string, projectId: string) => void;
  onCreateWorkspace?: () => void;
  onCreateProject?: (workspaceId: string) => void;
  createProjectLabel?: string;
}) {
  const [selectedId, setSelectedId] = useState(initialWorkspaceId);
  const [query, setQuery] = useState('');
  const active = workspaces.filter(item => !item.archivedAt);
  const selected = active.find(item => item.id === selectedId) ?? active[0];
  const term = query.trim().toLocaleLowerCase('pt-BR');
  const results = active.flatMap(workspace => workspace.projects.filter(project => !project.archivedAt && (!term ? workspace.id === selected?.id : `${workspace.name} ${project.name} ${project.key}`.toLocaleLowerCase('pt-BR').includes(term))).map(project => ({ workspace, project })));

  return <div className="workspace-navigator">
    <aside className="navigator-sidebar" aria-label="Escolher workspace">
      <h2>Workspaces <span>{active.length}</span></h2>
      <label className="navigator-mobile-select">Workspace atual<select value={selected?.id ?? ''} onChange={event => { setSelectedId(event.target.value); onWorkspaceChange?.(event.target.value); setQuery(''); }}>{!active.length && <option value="">Nenhum workspace ativo</option>}{active.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <div className="navigator-workspaces">{active.map(item => <button type="button" key={item.id} aria-pressed={selected?.id === item.id} onClick={() => { setSelectedId(item.id); onWorkspaceChange?.(item.id); setQuery(''); }}>
        <span className="workspace-manager-avatar">{item.name.slice(0, 2).toLocaleUpperCase('pt-BR')}</span><span><strong title={item.name}>{item.name}</strong><small>{workspaceRoleLabel(item.role)}</small></span>{selected?.id === item.id && <Check size={15}/>}
      </button>)}</div>
      {onCreateWorkspace && <button type="button" className="secondary-button navigator-create" onClick={onCreateWorkspace}><Plus size={16}/> Novo workspace</button>}
    </aside>
    <section className="navigator-content" aria-label="Escolher projeto">
      <label className="navigator-search"><Search size={18}/><input aria-label="Buscar projetos em todos os workspaces" placeholder="Buscar projeto ou workspace…" value={query} onChange={event => setQuery(event.target.value)}/>{query && <button type="button" aria-label="Limpar busca" onClick={() => setQuery('')}><X size={16}/></button>}</label>
      <header className="navigator-heading"><div><h2>{term ? 'Resultados da busca' : selected?.name ?? 'Comece pelo workspace'}</h2><p>{term ? `${results.length} ${results.length === 1 ? 'projeto encontrado' : 'projetos encontrados'}` : 'Selecione um projeto para continuar.'}</p></div>{selected && !term && onCreateProject && (selected.role === 'OWNER' || selected.role === 'MANAGER') && <button type="button" className="secondary-button" onClick={() => onCreateProject(selected.id)}><Plus size={15}/> {createProjectLabel}</button>}</header>
      <div className="navigator-projects" aria-live="polite">{results.map(({ workspace, project }) => <button type="button" key={project.id} className="navigator-project" onClick={() => onSelect(workspace.id, project.id)} aria-current={project.id === currentProjectId ? 'page' : undefined}>
        <span className="workspace-manager-project-key">{project.key.slice(0, 3)}</span><span className="navigator-project-copy"><strong>{project.name}</strong><small>{term ? `${workspace.name} · ${project.key}` : project.key}</small></span>{project.id === currentProjectId ? <span className="navigator-current"><Check size={14}/> Atual</span> : <ChevronRight size={17}/>}
      </button>)}{!results.length && <div className="navigator-empty"><FolderKanban size={28}/><h3>{term ? 'Nenhum projeto encontrado' : selected ? 'Seu próximo projeto começa aqui' : 'Nenhum workspace ativo'}</h3><p>{term ? 'Tente outro nome, chave ou workspace.' : selected ? 'Os projetos organizam os requisitos e o trabalho da equipe.' : 'Crie um workspace ou restaure um arquivado no gerenciamento.'}</p>{term && <button className="text-button" onClick={() => setQuery('')}>Limpar busca</button>}</div>}</div>
    </section>
  </div>;
}
