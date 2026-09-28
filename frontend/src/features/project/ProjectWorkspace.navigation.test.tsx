// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../lib/api';
import { ProjectWorkspace } from './ProjectWorkspace';

vi.mock('../../lib/api', async importOriginal => ({ ...await importOriginal<typeof import('../../lib/api')>(), api: vi.fn() }));
vi.mock('./FolderOverview', () => ({ FolderOverview: ({ onSelect }: { onSelect: (id: string) => void }) => <section data-testid="folders"><button onClick={() => onSelect('r1')}>US-001</button></section> }));
vi.mock('./RequirementGraph', () => ({ RequirementGraph: ({ onSelect, rootId, selectedId }: { onSelect: (id: string) => void; rootId?: string | null; selectedId?: string | null }) => <section data-testid="graph" data-root={rootId ?? ''} data-selected={selectedId ?? ''}><button onClick={() => onSelect('r1')}>Selecionar US</button><button onClick={() => onSelect('r2')}>Selecionar US relacionada</button></section> }));
vi.mock('./RequirementDrawer', () => ({ RequirementDrawer: ({ requirement, closing, onClose, onCloseComplete, onFocus, onEdit }: { requirement: { id: string }; closing?: boolean; onClose: () => void; onCloseComplete?: () => void; onFocus?: () => void; onEdit: () => void }) => <aside data-testid="drawer" data-closing={closing} data-requirement-id={requirement.id}>{onFocus && <button onClick={onFocus}>Centralizar no mapa</button>}<button onClick={onEdit}>Abrir requisito</button><button onClick={onClose}>Fechar detalhes</button>{closing && <button onClick={onCloseComplete}>Concluir fechamento</button>}</aside> }));
vi.mock('./RequirementEditor', () => ({ RequirementEditor: ({ requirementId, onClose, onDirtyChange, onSavingChange, onNavigateRequirement, onReturnToPreviousRequirement, canReturnToPreviousRequirement }: { requirementId: string; onClose: () => void; onDirtyChange?: (dirty: boolean) => void; onSavingChange?: (saving: boolean) => void; onNavigateRequirement?: (id: string) => void; onReturnToPreviousRequirement?: () => void; canReturnToPreviousRequirement?: boolean }) => <main data-testid="editor" data-requirement-id={requirementId}><button onClick={() => onDirtyChange?.(true)}>Editar</button><button onClick={() => onSavingChange?.(true)}>Salvando</button><button onClick={() => onNavigateRequirement?.('r2')}>Abrir relacionada</button>{canReturnToPreviousRequirement && <button onClick={onReturnToPreviousRequirement}>Voltar à anterior</button>}<button onClick={onClose}>Fechar editor</button></main> }));
vi.mock('./TemplateEditor', () => ({ TemplateEditor: () => <main data-testid="template-editor"/> }));

let host: HTMLDivElement;
let root: Root;
let client: QueryClient;
const project = { id: 'p1', workspaceId: 'w1', key: 'ATH', name: 'Athena' };
const workspace = { id: 'w1', name: 'Produto', role: 'EDITOR' as const };
const user = { id: 'u1', name: 'Pessoa', email: 'pessoa@example.com' };
const requirement = { id: 'r1', projectId: 'p1', code: 'US-001', type: 'USER_STORY' as const, title: 'Login', status: 'DRAFT' as const, folderId: 'f1', source: 'MANUAL' as const, revision: 1, content: { type: 'doc', content: [{ type: 'paragraph' }] }, criteria: [] };
const relatedRequirement = { ...requirement, id: 'r2', code: 'US-002', title: 'Recuperar senha' };

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.mocked(api).mockImplementation(async path => {
    if (path === '/projects/p1/requirements') return [requirement, relatedRequirement] as never;
    if (path === '/projects/p1/requirements?status=archived') return [] as never;
    if (path === '/projects/p1/folders') return [{ id: 'f1', workspaceId: 'w1', projectId: 'p1', name: 'Geral' }] as never;
    if (path === '/projects/p1/graph') return { nodes: [requirement, relatedRequirement], edges: [] } as never;
    if (path === '/notifications') return [] as never;
    if (path === '/workspaces') return [{ ...workspace, projects: [project] }] as never;
    return [] as never;
  });
  window.history.replaceState({}, '', '/projects/p1');
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
});
afterEach(() => { act(() => root.unmount()); client.clear(); host.remove(); vi.unstubAllGlobals(); });

const mount = async () => { await act(async () => root.render(<QueryClientProvider client={client}><ProjectWorkspace user={user} workspace={workspace} project={project} onChangeContext={vi.fn()} onBrowseWorkspaces={vi.fn()} onCreateWorkspace={vi.fn()} onCreateProject={vi.fn()} onLogout={vi.fn()} logoutPending={false}/></QueryClientProvider>)); };
const click = async (selector: string) => {
  const target = host.querySelector<HTMLElement>(selector);
  if (!target) throw new Error(`Elemento não encontrado: ${selector}`);
  await act(async () => target.click());
};

describe('project navigation', () => {
  it('keeps device sessions out of the profile menu for now', async () => {
    await mount();
    await click('[aria-label="Meu perfil"]');
    const security = [...host.querySelectorAll<HTMLButtonElement>('button')].find((button) => button.textContent === 'Segurança e sessões');
    expect(security).toBeUndefined();
    expect(host.textContent).not.toContain('Dispositivos e sessões');
    expect(api).not.toHaveBeenCalledWith('/auth/sessions');
  });

  it('offers dark mode in the profile menu', async () => {
    const onThemeChange = vi.fn();
    await act(async () => root.render(<QueryClientProvider client={client}><ProjectWorkspace user={user} workspace={workspace} project={project} theme="light" onThemeChange={onThemeChange} onChangeContext={vi.fn()} onBrowseWorkspaces={vi.fn()} onCreateWorkspace={vi.fn()} onCreateProject={vi.fn()} onLogout={vi.fn()} logoutPending={false}/></QueryClientProvider>));
    await click('[aria-label="Meu perfil"]');
    const darkMode = host.querySelector<HTMLButtonElement>('[role="menuitemcheckbox"]');
    expect(host.querySelector('.theme-toggle')?.textContent).toContain('Modo escuro');
    expect(darkMode?.getAttribute('aria-checked')).toBe('false');
    await act(async () => darkMode?.click());
    expect(onThemeChange).toHaveBeenCalledWith('dark');
  });

  it('moves from folders to focused graph, drawer, editor, and back without stale route history', async () => {
    await mount();
    await click('[data-testid="folders"] button');
    expect(host.querySelector('.workspace-view-transition')).not.toBeNull();
    expect(host.querySelector('[data-testid="graph"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="graph"]')?.getAttribute('data-root')).toBe('r1');
    expect(host.querySelector('[data-testid="drawer"]')?.getAttribute('data-requirement-id')).toBe('r1');
    expect(host.querySelector('[data-testid="drawer"]')?.textContent).not.toContain('Centralizar no mapa');
    await click('[data-testid="graph"] button');
    expect(host.querySelector('[data-testid="drawer"]')).not.toBeNull();
    await click('[data-testid="drawer"] button');
    expect(host.querySelector('[data-testid="editor"]')).not.toBeNull();
    expect(window.location.pathname).toBe('/projects/p1/requirements/r1/edit');
    await click('[data-testid="editor"] button:last-child');
    expect(window.location.pathname).toBe('/projects/p1/map');
    expect(host.querySelector('[data-testid="editor"]')).toBeNull();
  });

  it('keeps the details drawer mounted until its closing transition completes', async () => {
    await mount();
    await click('[data-testid="folders"] button');
    await click('[data-testid="drawer"] button:nth-child(2)');
    expect(host.querySelector('[data-testid="drawer"]')?.getAttribute('data-closing')).toBe('true');
    await click('[data-testid="drawer"] button:nth-child(3)');
    expect(host.querySelector('[data-testid="drawer"]')).toBeNull();
  });

  it('removes the duplicate Requisitos tab and redirects its old route to the overview', async () => {
    window.history.replaceState({}, '', '/projects/p1/requirements');
    await mount();

    const tabLabels = [...host.querySelectorAll<HTMLButtonElement>('.workspace-tabs button')].map(button => button.textContent?.trim());
    expect(tabLabels).not.toContain('Requisitos');
    expect(host.querySelector('[data-testid="folders"]')).not.toBeNull();
    expect(window.location.pathname).toBe('/projects/p1/overview');
  });

  it('selects a related story without changing focus and records explicit focus in browser history', async () => {
    await mount();
    await click('[data-testid="folders"] button');
    await click('[data-testid="graph"] button:nth-child(2)');

    expect(host.querySelector('[data-testid="graph"]')?.getAttribute('data-root')).toBe('r1');
    expect(host.querySelector('[data-testid="graph"]')?.getAttribute('data-selected')).toBe('r2');
    expect(host.querySelector('[data-testid="drawer"]')?.getAttribute('data-requirement-id')).toBe('r2');
    expect(new URLSearchParams(window.location.search).get('root')).toBe('r1');

    await click('[data-testid="drawer"] button:first-child');
    expect(host.querySelector('[data-testid="graph"]')?.getAttribute('data-root')).toBe('r2');
    expect(new URLSearchParams(window.location.search).get('root')).toBe('r2');
    expect(host.querySelector('[data-testid="drawer"]')?.textContent).not.toContain('Centralizar no mapa');

    await act(async () => { window.history.back(); await new Promise((resolve) => setTimeout(resolve, 20)); });
    expect(host.querySelector('[data-testid="graph"]')?.getAttribute('data-root')).toBe('r1');
    expect(host.querySelector('[data-testid="drawer"]')?.getAttribute('data-requirement-id')).toBe('r1');
    await act(async () => { window.history.forward(); await new Promise((resolve) => setTimeout(resolve, 20)); });
    expect(host.querySelector('[data-testid="graph"]')?.getAttribute('data-root')).toBe('r2');
    expect(host.querySelector('[data-testid="drawer"]')?.getAttribute('data-requirement-id')).toBe('r2');
  });

  it('highlights a selected story on the full map without filtering the board', async () => {
    await mount();
    await click('.workspace-tabs button:nth-child(2)');
    await click('[data-testid="graph"] button');

    expect(host.querySelector('[data-testid="graph"]')?.getAttribute('data-root')).toBe('');
    expect(host.querySelector('[data-testid="graph"]')?.getAttribute('data-selected')).toBe('r1');
    expect(host.querySelector('[data-testid="drawer"]')).not.toBeNull();
  });

  it('opens a direct editor route and keeps unsaved work on browser back cancellation', async () => {
    window.history.replaceState({}, '', '/projects/p1/requirements/r1/edit');
    await mount();
    expect(host.querySelector('[data-testid="editor"]')).not.toBeNull();
    await click('[data-testid="editor"] button');
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    window.history.replaceState({}, '', '/projects/p1');
    await act(async () => window.dispatchEvent(new PopStateEvent('popstate')));
    expect(confirm).toHaveBeenCalled();
    expect(window.location.pathname).toBe('/projects/p1/requirements/r1/edit');
    expect(host.querySelector('[data-testid="editor"]')).not.toBeNull();
    confirm.mockRestore();
  });

  it('opens a related story in the same editor route and returns through browser history', async () => {
    await mount();
    await click('[data-testid="folders"] button');
    await click('[data-testid="graph"] button');
    await click('[data-testid="drawer"] button');
    await click('[data-testid="editor"] button:nth-child(3)');
    expect(host.querySelector('[data-testid="editor"]')?.getAttribute('data-requirement-id')).toBe('r2');
    expect(window.location.pathname).toBe('/projects/p1/requirements/r2/edit');
    window.history.replaceState({ editorTrail: [] }, '', '/projects/p1/requirements/r1/edit');
    await act(async () => window.dispatchEvent(new PopStateEvent('popstate')));
    expect(host.querySelector('[data-testid="editor"]')?.getAttribute('data-requirement-id')).toBe('r1');
    expect(window.location.pathname).toBe('/projects/p1/requirements/r1/edit');
  });

  it('confirms before discarding a draft when opening a related story', async () => {
    await mount();
    await click('[data-testid="folders"] button');
    await click('[data-testid="graph"] button');
    await click('[data-testid="drawer"] button');
    await click('[data-testid="editor"] button:first-child');
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    await click('[data-testid="editor"] button:nth-child(3)');
    expect(confirm).toHaveBeenCalledWith('Existem alterações não salvas. Descartar e abrir outra US?');
    expect(window.location.pathname).toBe('/projects/p1/requirements/r1/edit');
    expect(host.querySelector('[data-testid="editor"]')?.getAttribute('data-requirement-id')).toBe('r1');
    confirm.mockReturnValue(true);
    await click('[data-testid="editor"] button:nth-child(3)');
    expect(window.location.pathname).toBe('/projects/p1/requirements/r2/edit');
    confirm.mockRestore();
  });

  it('blocks related navigation while the current story is saving', async () => {
    await mount();
    await click('[data-testid="folders"] button');
    await click('[data-testid="graph"] button');
    await click('[data-testid="drawer"] button');
    await click('[data-testid="editor"] button:nth-child(2)');
    await click('[data-testid="editor"] button:nth-child(3)');
    expect(window.location.pathname).toBe('/projects/p1/requirements/r1/edit');
  });
});
