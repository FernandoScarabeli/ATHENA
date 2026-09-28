// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../lib/api';
import { WorkspaceManagementHub } from './WorkspaceManagementHub';

vi.mock('../../lib/api', async importOriginal => ({ ...await importOriginal<typeof import('../../lib/api')>(), api: vi.fn() }));

const user = { id: 'u1', name: 'Pessoa', email: 'pessoa@example.com' };
const workspaces = [
  {
    id: 'w1', name: 'Workspace atual', role: 'OWNER' as const, projects: [
      { id: 'p1', name: 'Projeto ativo', key: 'ACT' },
      { id: 'p2', name: 'Projeto arquivado', key: 'ARC', archivedAt: '2026-09-01T00:00:00.000Z' },
    ],
  },
  { id: 'w2', name: 'Workspace arquivado', role: 'OWNER' as const, archivedAt: '2026-09-01T00:00:00.000Z', projects: [{ id: 'p3', name: 'Projeto legado', key: 'LEG' }] },
  { id: 'w3', name: 'Workspace de leitura', role: 'VIEWER' as const, projects: [{ id: 'p4', name: 'Somente leitura', key: 'READ' }] },
  { id: 'w4', name: 'Workspace da Gerência', role: 'MANAGER' as const, projects: [{ id: 'p5', name: 'Projeto gerenciável', key: 'MGR' }] },
];
let host: HTMLDivElement;
let root: Root;
let client: QueryClient;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.mocked(api).mockResolvedValue({ ok: true } as never);
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
});
afterEach(() => { act(() => root.unmount()); client.clear(); host.remove(); vi.unstubAllGlobals(); });

const mount = async () => act(async () => root.render(<QueryClientProvider client={client}><WorkspaceManagementHub user={user} workspaces={workspaces} onOpenProject={vi.fn()} onLogout={vi.fn()} logoutPending={false}/></QueryClientProvider>));
const click = async (element: Element | null) => { if (!element) throw new Error('Elemento não encontrado'); await act(async () => (element as HTMLElement).click()); };
const tab = (listName: string, tabName: string) => host.querySelector<HTMLElement>(`[aria-label="${listName}"] [role="tab"][aria-selected="${tabName === 'Ativos' ? 'true' : 'false'}"]`);
const setValue = async (input: HTMLInputElement, value: string) => act(async () => {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
});

describe('workspace management hub', () => {
  it('searches workspaces and projects and switches between active and archived records', async () => {
    await mount();
    const projectInput = host.querySelector<HTMLInputElement>('[aria-label="Buscar projeto"]')!;
    await setValue(projectInput, 'ativo');
    expect(host.textContent).toContain('Projeto ativo');
    expect(host.textContent).not.toContain('Projeto arquivado');

    await setValue(projectInput, '');
    await click(tab('Estado dos projetos', 'Arquivados'));
    expect(host.textContent).toContain('Projeto arquivado');
    expect(host.querySelector('.project-open-button')).toBeNull();

    await click(tab('Estado dos workspaces', 'Arquivados'));
    const archivedWorkspace = Array.from(host.querySelectorAll('.workspace-manager-workspace')).find(button => button.textContent?.includes('Workspace arquivado'));
    expect(archivedWorkspace).toBeTruthy();
    await click(archivedWorkspace ?? null);
    expect(host.textContent).toContain('Workspace arquivado');
    expect(Array.from(host.querySelectorAll('button')).some(button => button.textContent?.includes('Restaurar'))).toBe(true);
  });

  it('hides Owner controls for a Viewer while keeping the project available to open', async () => {
    await mount();
    await click(Array.from(host.querySelectorAll('.workspace-manager-workspace')).find(button => button.textContent?.includes('Workspace de leitura')) ?? null);

    expect(host.textContent).toContain('Somente leitura');
    expect(host.querySelector('.project-open-button')).toBeTruthy();
    expect(Array.from(host.querySelectorAll('button')).some(button => button.textContent?.includes('Novo projeto'))).toBe(false);
    expect(Array.from(host.querySelectorAll('button')).some(button => button.textContent?.trim() === 'Editar')).toBe(false);
    expect(host.querySelector('[aria-label="Mover Somente leitura"]')).toBeNull();
  });

  it('shows project lifecycle controls to Managers while hiding workspace administration and project moves', async () => {
    await mount();
    await click(Array.from(host.querySelectorAll('.workspace-manager-workspace')).find(button => button.textContent?.includes('Workspace da Gerência')) ?? null);

    expect(host.textContent).toContain('Gerência');
    expect(host.querySelector('[aria-label="Editar Projeto gerenciável"]')).toBeTruthy();
    expect(host.querySelector('[aria-label="Arquivar Projeto gerenciável"]')).toBeTruthy();
    expect(host.querySelector('[aria-label="Mover Projeto gerenciável"]')).toBeNull();
    expect(host.querySelector('[aria-label="Pessoas e acesso"]')).toBeNull();
    expect(host.querySelector('.workspace-manager-title-actions')?.textContent).not.toContain('Editar');
    expect(host.querySelector('.workspace-manager-title-actions')?.textContent).not.toContain('Arquivar');
  });

  it('requires an explicit confirmation to archive a project and previews move access changes', async () => {
    await mount();
    await click(host.querySelector('[aria-label="Arquivar Projeto ativo"]'));
    expect(host.textContent).toContain('Arquivar projeto?');
    expect(host.textContent).toContain('Projeto ativo');
    await click(Array.from(host.querySelectorAll('button')).find(button => button.textContent?.trim() === 'Voltar') ?? null);
    expect(host.textContent).not.toContain('Arquivar projeto?');

    await click(host.querySelector('[aria-label="Mover Projeto ativo"]'));
    expect(host.textContent).toContain('Mover projeto');
    expect(host.textContent).toContain('membros do workspace de origem perdem o acesso herdado');
    expect(host.textContent).toContain('destino passam a ter acesso');
    expect(host.textContent).toContain('membros diretos');
  });

  it('requires the archived project name before enabling permanent deletion', async () => {
    await mount();
    await click(tab('Estado dos projetos', 'Arquivados'));
    await click(host.querySelector('[aria-label="Excluir definitivamente Projeto arquivado"]'));
    const confirm = host.querySelector<HTMLButtonElement>('.workspace-delete-dialog button[type="submit"]');
    expect(confirm?.disabled).toBe(true);
    expect(host.textContent).toContain('Arquivos nos serviços conectados não serão removidos.');
    await setValue(host.querySelector<HTMLInputElement>('.workspace-delete-dialog input')!, 'Projeto arquivado');
    expect(confirm?.disabled).toBe(false);
  });

  it('shows a recoverable server error when creating a project', async () => {
    vi.mocked(api).mockRejectedValueOnce(new Error('Esta chave já está sendo usada neste workspace'));
    await mount();
    await click(Array.from(host.querySelectorAll('button')).find(button => button.textContent?.includes('Novo projeto')) ?? null);
    const name = host.querySelector<HTMLInputElement>('.workspace-entity-dialog input')!;
    const key = host.querySelectorAll<HTMLInputElement>('.workspace-entity-dialog input')[1];
    await setValue(name, 'Projeto duplicado');
    await setValue(key, 'ACT');
    await click(host.querySelector('.workspace-entity-dialog button[type="submit"]'));
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
    expect(host.textContent).toContain('Esta chave já está sendo usada neste workspace');
    expect(host.querySelector('.workspace-entity-dialog')).toBeTruthy();
  });
});

describe('management navigation continuity', () => {
  it('shows people inline and preserves the section when switching between owned workspaces', async () => {
    await mount();
    await click(Array.from(host.querySelectorAll('.workspace-manager-tabs button')).find(button => button.textContent?.includes('Pessoas e acesso')) ?? null);
    expect(host.querySelector('.workspace-team-panel')).toBeTruthy();
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    const select = host.querySelector<HTMLSelectElement>('.workspace-manager-mobile-select select')!;
    await act(async () => { select.value = 'w2'; select.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(host.querySelector('.workspace-manager-tabs [aria-current="page"]')?.textContent).toContain('Pessoas e acesso');
    expect(host.textContent).toContain('Restaure o workspace para gerenciar sua equipe.');
    await act(async () => { select.value = 'w3'; select.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(host.querySelector('.workspace-manager-tabs [aria-current="page"]')?.textContent).toContain('Projetos');
    expect(host.querySelector('.workspace-team-panel')).toBeNull();
  });

  it('keeps the detail pane consistent with the archived workspace filter', async () => {
    await mount();
    await click(tab('Estado dos workspaces', 'Arquivados'));
    expect(host.querySelector('.workspace-manager-title-copy h2')?.textContent).toBe('Workspace arquivado');
    expect(host.querySelector('.project-open-button')).toBeNull();
  });
});
