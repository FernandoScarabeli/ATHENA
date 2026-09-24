import { useMemo, type ReactNode } from 'react';
import { Icon } from '../../components/Icon';
import type { Requirement, RequirementFolder } from '../../lib/types';

export function FolderOverview({ folders, requirements, query, canEdit, onSelect, onCreateFolder, onCreateRequirement, onSettings, loading = false, error, onRetry }: { folders: RequirementFolder[]; requirements: Requirement[]; query: string; canEdit: boolean; onSelect: (id: string) => void; onCreateFolder: () => void; onCreateRequirement: () => void; onSettings: () => void; loading?: boolean; error?: Error | null; onRetry?: () => void }) {
  const normalized = query.trim().toLocaleLowerCase('pt-BR');
  const visible = useMemo(() => requirements.filter((item) => !normalized || `${item.code} ${item.title}`.toLocaleLowerCase('pt-BR').includes(normalized)), [normalized, requirements]);
  const visibleFolders = useMemo(() => {
    const byParent = new Map<string | null, RequirementFolder[]>();
    folders.forEach(folder => { const key = folder.parentId ?? null; byParent.set(key, [...(byParent.get(key) ?? []), folder]); });
    const included = new Set<string>();
    const includeBranch = (folder: RequirementFolder): boolean => {
      const own = visible.some(item => item.folderId === folder.id);
      const child = (byParent.get(folder.id) ?? []).some(includeBranch);
      if (own || child || (folder.name !== 'Sem pasta' && !normalized)) included.add(folder.id);
      return own || child;
    };
    folders.filter(folder => !folder.parentId || !folders.some(candidate => candidate.id === folder.parentId)).forEach(includeBranch);
    return { included, byParent, roots: folders.filter(folder => (!folder.parentId || !folders.some(candidate => candidate.id === folder.parentId)) && included.has(folder.id)) };
  }, [folders, normalized, visible]);
  if (loading) return <section className="folder-overview"><div className="content-state"><span className="loading-ring"/><strong>Carregando pastas e requisitos</strong></div></section>;
  if (error) return <section className="folder-overview"><div className="content-state" role="alert"><span className="state-symbol">!</span><strong>Não foi possível carregar a visão geral</strong><span>{error.message}</span>{onRetry && <button className="secondary-button" onClick={onRetry}><Icon name="refresh" size={13}/> Tentar novamente</button>}</div></section>;
  const renderFolder = (folder: RequirementFolder, depth = 0): ReactNode => {
    const items = visible.filter(item => item.folderId === folder.id);
    const children = (visibleFolders.byParent.get(folder.id) ?? []).filter(child => visibleFolders.included.has(child.id));
    return <section className="folder-card" key={folder.id} style={{ marginLeft: depth ? `${depth * 20}px` : undefined }}><header><span className="folder-icon"><Icon name="folder" size={16}/></span><div><h2>{folder.name}</h2><p>{folder.description || 'User Stories deste grupo'}</p></div><span className="folder-count">{items.length} US</span></header><div className="folder-requirements">{items.length ? items.map((item) => <button key={item.id} aria-label={item.status === 'ARCHIVED' ? `${item.code}: ${item.title} (cancelada)` : `Abrir grafo de ${item.code}: ${item.title}`} title={item.status === 'ARCHIVED' ? 'US cancelada' : 'Abrir grafo de dependências'} onClick={() => onSelect(item.id)}><span className="us-type">{item.code}</span><span className="us-name">{item.title}</span><span className={`us-relations ${item.status === 'ARCHIVED' ? 'is-archived' : ''}`}>{item.status === 'ARCHIVED' ? 'Cancelada' : <Icon name="chevron" size={12}/>}</span></button>) : <div className="folder-card-empty"><Icon name="folder" size={18}/><span>Nenhuma US nesta pasta</span></div>}</div>{children.length ? <div className="folder-tree-children">{children.map(child => renderFolder(child, depth + 1))}</div> : null}</section>;
  };
  return <section className="folder-overview"><header className="folder-overview-heading"><div><h1>{normalized ? `Resultados para “${query}”` : 'Pastas'}</h1><p>{normalized ? `${visible.length} User Stories encontradas` : 'Abra uma User Story para ver suas relações no mapa.'}</p></div><div className="overview-metrics">{canEdit && <><button className="secondary-button project-create-folder" onClick={onCreateFolder}><Icon name="folder" size={14}/> Nova pasta</button><button className="primary-button project-create-requirement" onClick={onCreateRequirement}><Icon name="plus" size={15}/> Novo requisito</button></>}<button className="overview-settings" onClick={onSettings} aria-label="Abrir configurações do projeto" title="Configurações do projeto"><Icon name="settings" size={14}/></button></div></header><div className="folder-grid">{visibleFolders.roots.map(folder => renderFolder(folder))}</div>{!visibleFolders.roots.length && <div className="folder-empty"><Icon name="folder" size={24}/><strong>{normalized ? 'Nenhuma pasta encontrada' : 'Nenhuma pasta criada'}</strong><span>{normalized ? 'Tente buscar por outro termo.' : 'Crie uma pasta pelo botão no topo para organizar suas US.'}</span></div>}{Boolean(visibleFolders.roots.length && !visible.length) && <div className="folder-empty"><Icon name="search" size={24}/><strong>Nenhuma US encontrada</strong><span>Tente buscar por outro termo.</span></div>}</section>;
}
