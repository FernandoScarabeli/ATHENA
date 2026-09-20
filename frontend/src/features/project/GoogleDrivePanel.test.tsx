// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../lib/api';
import { GoogleDrivePanel } from './GoogleDrivePanel';

vi.mock('../../lib/api', async importOriginal => ({ ...await importOriginal<typeof import('../../lib/api')>(), api: vi.fn() }));

let host: HTMLDivElement;
let root: Root;
let client: QueryClient;
let folders: unknown[];

const settle = async () => act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });

beforeEach(() => {
  folders = [
    { id: 'owned', name: 'Planejamento próprio', modifiedTime: '2026-09-20T00:00:00.000Z', ownership: 'OWNED' },
    { id: 'shared', name: 'Pesquisa compartilhada', modifiedTime: '2026-09-19T00:00:00.000Z', ownership: 'SHARED' },
    { id: 'already-linked', name: 'Não deve aparecer', ownership: 'OWNED' },
  ];
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.mocked(api).mockImplementation(async path => {
    if (path === '/workspaces/w1/integrations') return [{ kind: 'GOOGLE', status: 'CONNECTED' }] as never;
    if (path === '/workspaces') return [{ id: 'w1', projects: [{ id: 'p1', key: 'ATH', name: 'Projeto Athena' }] }] as never;
    if (path === '/workspaces/w1/integrations/google/folder-links') return [{ id: 'link-1', externalId: 'already-linked' }] as never;
    if (path === '/workspaces/w1/integrations/google/folders') return { files: folders } as never;
    throw new Error(`Rota não esperada: ${path}`);
  });
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
});

afterEach(() => { act(() => root.unmount()); client.clear(); host.remove(); vi.unstubAllGlobals(); });

async function mountPicker() {
  await act(async () => root.render(<QueryClientProvider client={client}><GoogleDrivePanel workspaceId="w1" projectId="p1" role="OWNER"/></QueryClientProvider>));
  await settle();
  const openPicker = [...host.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent?.includes('Vincular pasta'));
  expect(openPicker).toBeDefined();
  await act(async () => openPicker!.click());
  await settle();
}

describe('GoogleDrivePanel folder origin groups', () => {
  it('shows owned folders before shared folders and excludes links already created', async () => {
    await mountPicker();
    const groups = [...host.querySelectorAll<HTMLElement>('.drive-folder-group')];
    expect(groups.map(group => group.querySelector('h3')?.textContent)).toEqual(['Minhas pastas', 'Compartilhadas comigo']);
    expect(groups[0].textContent).toContain('Planejamento próprio');
    expect(groups[1].textContent).toContain('Pesquisa compartilhada');
    expect(host.textContent).not.toContain('Não deve aparecer');
  });

  it('keeps the shared section visible with a contextual empty state', async () => {
    folders = [{ id: 'owned', name: 'Planejamento próprio', ownership: 'OWNED' }];
    await mountPicker();
    const shared = host.querySelectorAll<HTMLElement>('.drive-folder-group')[1];
    expect(shared.textContent).toContain('Nenhuma pasta compartilhada disponível para vincular.');
  });
});
