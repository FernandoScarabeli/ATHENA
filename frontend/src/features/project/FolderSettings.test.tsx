// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../lib/api';
import type { WorkspaceRole } from '../../lib/types';
import { SettingsModal } from './ProjectWorkspace';

vi.mock('../../lib/api', async importOriginal => ({ ...await importOriginal<typeof import('../../lib/api')>(), api: vi.fn() }));

let host: HTMLDivElement;
let root: Root;
let client: QueryClient;
const onClose = vi.fn();
const onEditTemplate = vi.fn();
const folderRows = [
  { id: 'f1', workspaceId: 'w1', name: 'Produto', description: 'Área principal', requirementCount: 2 },
  { id: 'f2', workspaceId: 'w1', name: 'Cadastro', description: 'Fluxo de cadastro', parentId: 'f1', requirementCount: 1 },
  { id: 'default', workspaceId: 'w1', name: 'Sem pasta', requirementCount: 0 },
];
const templateRows = [{ id: 't1', name: 'Busca', description: 'Padrão para busca', content: { type: 'doc', content: [] }, acceptanceCriteria: [] }];

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.mocked(api).mockImplementation(async (path, init) => {
    if (path === '/projects/p1/folders') return folderRows as never;
    if (path === '/workspaces/w1/templates') return templateRows as never;
    if (path === '/workspaces/w1/review-checklist') {
      if (init?.method === 'PUT') return JSON.parse((init.body as string) ?? '{}') as never;
      return { items: ['Revisar os códigos', 'Conferir os links'] } as never;
    }
    if (path === '/projects/p1/folders/f1' && init?.method === 'PATCH') return { ...folderRows[0], name: 'Roadmap', description: 'Nova' } as never;
    if (path === '/projects/p1/folders/f2' && init?.method === 'PATCH') return { ...folderRows[1], parentId: null } as never;
    return { ok: true } as never;
  });
  onClose.mockReset();
  onEditTemplate.mockReset();
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
});

afterEach(() => { act(() => root.unmount()); client.clear(); host.remove(); vi.unstubAllGlobals(); });

const mount = async (canEdit = true, workspaceRole: WorkspaceRole = 'OWNER') => {
  await act(async () => root.render(<QueryClientProvider client={client}><SettingsModal projectId="p1" workspaceId="w1" workspaceRole={workspaceRole} canEdit={canEdit} onClose={onClose} onEditTemplate={onEditTemplate}/></QueryClientProvider>));
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
};
const click = async (selector: string) => {
  const button = host.querySelector<HTMLButtonElement>(selector);
  if (!button) throw new Error(`Botão não encontrado: ${selector}`);
  await act(async () => button.click());
};
const setInput = async (input: HTMLInputElement | HTMLTextAreaElement, value: string) => {
  await act(async () => {
    Object.getOwnPropertyDescriptor(input.constructor.prototype, 'value')?.set?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
};

describe('workspace settings', () => {
  it('usa tabs e mostra hierarquia com busca preservando o caminho até a pasta', async () => {
    await mount();
    expect(host.querySelector('[role="tablist"]')).not.toBeNull();
    expect(host.textContent).not.toContain('Sem pasta');
    expect(host.querySelector('.settings-panel-heading > span')?.textContent).toBe('2');
    await setInput(host.querySelector<HTMLInputElement>('[aria-label="Buscar pastas"]')!, 'Cadastro');
    expect(host.textContent).toContain('Produto');
    expect(host.textContent).toContain('Cadastro');
    expect(host.textContent).not.toContain('Sem pasta');
  });

  it('edita nome e descrição em modal e persiste no workspace', async () => {
    await mount();
    await click('[aria-label="Ações da pasta Produto"]');
    await click('.settings-actions-popover button');
    expect(host.textContent).toContain('Editar pasta');
    const inputs = host.querySelectorAll<HTMLInputElement>('.settings-edit-dialog .modal-fields input');
    const name = inputs[0];
    const description = inputs[1];
    await setInput(name, 'Roadmap');
    await setInput(description, 'Nova');
    await click('.settings-edit-dialog .primary-button');
    expect(api).toHaveBeenCalledWith('/projects/p1/folders/f1', expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ name: 'Roadmap', description: 'Nova', parentId: null }) }));
  });

  it('move uma pasta para o nível principal e envia o novo parentId', async () => {
    await mount();
    await click('[aria-label="Expandir Produto"]');
    await click('[aria-label="Ações da pasta Cadastro"]');
    const childEdit = Array.from(host.querySelectorAll<HTMLButtonElement>('.settings-actions-popover button')).find(button => button.closest('.settings-tree-node')?.querySelector('.settings-folder-name strong')?.textContent === 'Cadastro');
    if (!childEdit) throw new Error('Ação de editar Cadastro não encontrada');
    await act(async () => childEdit.click());
    const parent = host.querySelector<HTMLSelectElement>('.settings-edit-dialog select')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set?.call(parent, '');
      parent.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await click('.settings-edit-dialog .primary-button');
    expect(api).toHaveBeenCalledWith('/projects/p1/folders/f2', expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ name: 'Cadastro', description: 'Fluxo de cadastro', parentId: null }) }));
  });

  it('confirma antes de excluir uma pasta e informa o destino das histórias', async () => {
    await mount();
    await click('[aria-label="Ações da pasta Produto"]');
    await click('.settings-actions-popover .is-danger');
    expect(host.textContent).toContain('movidas para Sem pasta');
    expect(api).not.toHaveBeenCalledWith('/projects/p1/folders/f1', expect.objectContaining({ method: 'DELETE' }));
    await click('.confirm-dialog .danger-button');
    expect(api).toHaveBeenCalledWith('/projects/p1/folders/f1', expect.objectContaining({ method: 'DELETE' }));
  });

  it('mantém ações de edição e exclusão de template no menu do card', async () => {
    await mount();
    await click('#settings-tab-templates');
    expect(host.textContent).toContain('Padrão para busca');
    await click('[aria-label="Ações do template Busca"]');
    await click('.settings-template-card .settings-actions-popover button');
    expect(onEditTemplate).toHaveBeenCalledWith('t1');
    await click('[aria-label="Ações do template Busca"]');
    await click('.settings-template-card .settings-actions-popover .is-danger');
    expect(host.textContent).toContain('As User Stories já criadas não serão alteradas.');
    await click('.confirm-dialog .danger-button');
    expect(api).toHaveBeenCalledWith('/templates/t1', expect.objectContaining({ method: 'DELETE' }));
  });

  it('salva a edição ordenada da checklist para o workspace', async () => {
    await mount();
    await click('#settings-tab-checklist');
    const item = host.querySelector<HTMLTextAreaElement>('[aria-label="Item 1 do checklist"]')!;
    await setInput(item, 'Revisar exemplos');
    const dragHandle = host.querySelector<HTMLButtonElement>('[data-checklist-index="1"] .settings-checklist-drag-handle')!;
    for (const key of ['Enter', 'ArrowUp', 'Enter']) {
      await act(async () => dragHandle.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })));
    }
    await click('.settings-modal-footer .primary-button');
    expect(api).toHaveBeenCalledWith('/workspaces/w1/review-checklist', expect.objectContaining({ method: 'PUT', body: JSON.stringify({ items: ['Conferir os links', 'Revisar exemplos'] }) }));
  });

  it('mantém checklist e configurações somente leitura para viewer', async () => {
    await mount(false, 'VIEWER');
    await click('#settings-tab-checklist');
    expect(host.querySelector('[aria-label="Novo item do checklist"]')).toBeNull();
    expect(host.querySelector('[aria-label="Item 1 do checklist"]')?.hasAttribute('disabled')).toBe(true);
    expect(host.querySelector('.settings-modal-footer .primary-button')).toBeNull();
    expect(host.querySelector('[aria-label="Ações da pasta Produto"]')).toBeNull();
  });

  it('limits Manager settings to project folders and direct project access', async () => {
    await mount(true, 'MANAGER');
    expect(host.querySelector('#settings-tab-folders')).not.toBeNull();
    expect(host.querySelector('#settings-tab-access')).not.toBeNull();
    expect(host.querySelector('#settings-tab-templates')).toBeNull();
    expect(host.querySelector('#settings-tab-checklist')).toBeNull();
    expect(host.querySelector('[aria-label="Ações da pasta Produto"]')).not.toBeNull();
  });

  it('keeps Manager access requests scoped to the selected project', async () => {
    vi.mocked(api).mockImplementation(async path => {
      if (path === '/projects/p1/access-requests') return [{
        id: 'request-1', status: 'PENDING', projectId: 'p1', workspaceId: 'w1',
        requester: { id: 'u2', name: 'Pessoa', email: 'pessoa@example.com' },
        project: { id: 'p1', name: 'Projeto', key: 'PRJ' },
      }] as never;
      if (path === '/projects/p1/folders') return folderRows as never;
      if (path === '/projects/p1/members' || path === '/projects/p1/invites') return [] as never;
      if (path === '/workspaces/w1/templates') return templateRows as never;
      if (path === '/workspaces/w1/review-checklist') return { items: ['Revisar', 'Conferir'] } as never;
      return { ok: true } as never;
    });
    await mount(true, 'MANAGER');
    await click('#settings-tab-access');
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });

    expect(host.querySelector('.access-request-project-scope')?.textContent).toBe('Acesso somente a este projeto');
    expect(host.textContent).not.toContain('Workspace inteiro');
  });
});
