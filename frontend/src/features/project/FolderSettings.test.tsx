// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../lib/api';
import { SettingsModal } from './ProjectWorkspace';

vi.mock('../../lib/api', async importOriginal => ({ ...await importOriginal<typeof import('../../lib/api')>(), api: vi.fn() }));

let host: HTMLDivElement;
let root: Root;
let client: QueryClient;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.mocked(api).mockImplementation(async (path, init) => {
    if (path === '/workspaces/w1/folders') return [{ id: 'f1', workspaceId: 'w1', name: 'Produto', description: 'Antiga', requirementCount: 2 }, { id: 'default', workspaceId: 'w1', name: 'Sem pasta', requirementCount: 0 }] as never;
    if (path === '/workspaces/w1/templates') return [] as never;
    if (path === '/folders/f1' && init?.method === 'PATCH') return { id: 'f1', workspaceId: 'w1', name: 'Roadmap', description: 'Nova' } as never;
    if (path === '/folders/f1' && init?.method === 'DELETE') return { ok: true } as never;
    return [] as never;
  });
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
});

afterEach(() => { act(() => root.unmount()); client.clear(); host.remove(); vi.unstubAllGlobals(); });

const mount = async () => { await act(async () => root.render(<QueryClientProvider client={client}><SettingsModal workspaceId="w1" canEdit onClose={vi.fn()} onEditTemplate={vi.fn()} /></QueryClientProvider>)); };

describe('folder settings', () => {
  it('edita nome/descrição e envia a alteração sem recarregar a página', async () => {
    await mount();
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
    const edit = host.querySelector<HTMLButtonElement>('.settings-row .text-button');
    expect(edit).not.toBeNull();
    await act(async () => edit!.click());
    const inputs = host.querySelectorAll<HTMLInputElement>('.settings-folder-edit input');
    await act(async () => { inputs[0].value = 'Roadmap'; inputs[0].dispatchEvent(new Event('input', { bubbles: true })); inputs[1].value = 'Nova'; inputs[1].dispatchEvent(new Event('input', { bubbles: true })); });
    await act(async () => host.querySelector<HTMLButtonElement>('.settings-folder-edit button[type="submit"]')!.click());
    expect(api).toHaveBeenCalledWith('/folders/f1', expect.objectContaining({ method: 'PATCH' }));
  });

  it('pede confirmação contextual antes de excluir uma pasta', async () => {
    await mount();
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
    const deleteButton = Array.from(host.querySelectorAll<HTMLButtonElement>('.settings-row .text-button')).find(button => button.textContent === 'Excluir');
    expect(deleteButton).not.toBeUndefined();
    await act(async () => deleteButton!.click());
    expect(host.textContent).toContain('Mover US para “Sem pasta”?');
    expect(api).not.toHaveBeenCalledWith('/folders/f1', expect.objectContaining({ method: 'DELETE' }));
  });
});
