// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../lib/api';
import { Onboarding } from './Onboarding';

vi.mock('../../lib/api', async importOriginal => ({ ...await importOriginal<typeof import('../../lib/api')>(), api: vi.fn() }));
vi.mock('../project/ProjectWorkspace', () => ({ ProjectWorkspace: ({ workspace, project }: { workspace: { id: string }; project: { id: string } }) => <main data-testid="project-context">{workspace.id}/{project.id}</main> }));

const user = { id: 'u1', name: 'Pessoa', email: 'pessoa@example.com' };
const workspaces = [
  { id: 'w1', name: 'Workspace salvo', role: 'EDITOR' as const, projects: [{ id: 'p1', workspaceId: 'w1', key: 'OLD', name: 'Projeto salvo' }] },
  { id: 'w2', name: 'Workspace da URL', role: 'VIEWER' as const, projects: [{ id: 'p2', workspaceId: 'w2', key: 'URL', name: 'Projeto da URL' }] },
];
let host: HTMLDivElement;
let root: Root;
let client: QueryClient;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.mocked(api).mockResolvedValue(workspaces as never);
  localStorage.clear();
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
});
afterEach(() => { act(() => root.unmount()); client.clear(); host.remove(); vi.unstubAllGlobals(); });

const mount = async () => { await act(async () => root.render(<QueryClientProvider client={client}><Onboarding user={user} onLogout={vi.fn()}/></QueryClientProvider>)); };
const settle = async () => { await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); }); };

describe('direct project routes', () => {
  it('prefers an authorized project from the URL over the saved context', async () => {
    localStorage.setItem('athena.active-context', JSON.stringify({ userId: user.id, workspaceId: 'w1', projectId: 'p1' }));
    window.history.replaceState({}, '', '/projects/p2/requirements/r2/edit');
    await mount();
    await settle();
    expect(host.querySelector('[data-testid="project-context"]')?.textContent).toBe('w2/p2');
  });

  it('does not expose a saved project when the direct URL is unauthorized or missing', async () => {
    localStorage.setItem('athena.active-context', JSON.stringify({ userId: user.id, workspaceId: 'w1', projectId: 'p1' }));
    window.history.replaceState({}, '', '/projects/p-secret/requirements/r2/edit');
    await mount();
    await settle();
    expect(host.querySelector('[data-testid="project-context"]')).toBeNull();
    expect(host.textContent).toContain('Workspace salvo');
    expect(host.textContent).not.toContain('Projeto salvo');
    expect(window.location.pathname).toBe('/');
  });
});
