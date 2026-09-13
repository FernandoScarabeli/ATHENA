// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../lib/api';
import { NewRequirementModal } from './NewRequirementModal';

vi.mock('../../lib/api', async importOriginal => ({ ...await importOriginal<typeof import('../../lib/api')>(), api: vi.fn() }));

let host: HTMLDivElement;
let root: Root;
let client: QueryClient;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.mocked(api).mockImplementation(async path => {
    if (path === '/workspaces/w1/folders') return [{ id: 'folder-1', workspaceId: 'w1', name: 'Produto' }] as never;
    if (path === '/workspaces/w1/templates') return [{ id: 'template-1', name: 'Fluxo', content: { type: 'doc', content: [] }, acceptanceCriteria: [{ title: 'Acesso', when: 'envia', then: 'entra', text: 'entra', position: 0 }] }] as never;
    return [] as never;
  });
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
});
afterEach(() => { act(() => root.unmount()); client.clear(); host.remove(); vi.unstubAllGlobals(); });

it('usa o snapshot canônico do backend para template persistido', async () => {
  const onCreate = vi.fn();
  await act(async () => root.render(<QueryClientProvider client={client}><NewRequirementModal workspaceId="w1" pending={false} onClose={vi.fn()} onCreate={onCreate}/></QueryClientProvider>));
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
  const title = host.querySelector<HTMLInputElement>('input[placeholder="Descreva a User Story"]')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(title, 'Nova US');
    title.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const templateRadio = host.querySelector<HTMLInputElement>('input[type="radio"][value="template-1"]') ?? Array.from(host.querySelectorAll<HTMLInputElement>('input[type="radio"]')).find(input => input.parentElement?.textContent?.includes('Fluxo'))!;
  await act(async () => templateRadio.click());
  await act(async () => host.querySelector<HTMLButtonElement>('button.primary-button')!.click());
  expect(onCreate).toHaveBeenCalledWith({ title: 'Nova US', folderId: 'folder-1', templateId: 'template-1', content: {} });
});
