// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RequirementEditor } from './RequirementEditor';
import { api, ApiError } from '../../lib/api';
import type { Requirement, WorkspaceRole } from '../../lib/types';

vi.mock('../../lib/api', async importOriginal => ({ ...await importOriginal<typeof import('../../lib/api')>(), api: vi.fn() }));
let host: HTMLDivElement;
let root: Root;
let client: QueryClient;
const onClose = vi.fn();
const initial: Requirement = {
  id: 'r1', projectId: 'p1', code: 'US-001', type: 'USER_STORY', title: 'Login', status: 'DRAFT', folderId: 'f1', source: 'MANUAL', revision: 4,
  content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Documento existente' }] }] },
  criteria: [{ id: 'ca1', text: 'Acesso permitido', title: 'Autenticação', given: 'uma conta', whenText: 'entro', thenText: 'acesso permitido', position: 0 }],
};

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('requestAnimationFrame', () => 0);
  vi.stubGlobal('matchMedia', () => ({ matches: true }));
  vi.mocked(api).mockReset();
  onClose.mockReset();
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } } });
  client.setQueryData(['requirement', 'r1'], structuredClone(initial));
  client.setQueryData(['folders', 'w1'], [{ id: 'f1', workspaceId: 'w1', name: 'Login' }]);
  client.setQueryData(['comments', 'r1'], []);
  client.setQueryData(['references', 'r1'], [{ id: 'ref1', type: 'PROTOTYPE', name: 'Tela de login', url: 'https://example.com' }]);
  client.setQueryData(['participants', 'w1'], []);
  client.setQueryData(['versions', 'r1'], [
    { id: null, requirementId: 'r1', revision: 4, current: true, createdAt: '2026-01-04T10:00:00Z', snapshot: { revision: 4, title: 'Login', content: initial.content, folderId: 'f1', status: 'DRAFT', criteria: initial.criteria } },
    { id: 'v3', requirementId: 'r1', revision: 3, createdAt: '2026-01-03T10:00:00Z', snapshot: { revision: 3, title: 'Login antigo', content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Documento histórico' }] }] }, folderId: 'f1', status: 'DRAFT', criteria: [] } },
  ]);
});
afterEach(() => { act(() => root.unmount()); client.clear(); host.remove(); vi.unstubAllGlobals(); });
const mount = async (role: WorkspaceRole = 'EDITOR') => {
  await act(async () => root.render(<QueryClientProvider client={client}><RequirementEditor projectId="p1" requirementId="r1" workspace={{ id: 'w1', name: 'Produto', role }} user={{ id: 'u1', name: 'Pessoa', email: 'pessoa@example.com' }} onClose={onClose}/></QueryClientProvider>));
};
const button = (name: string) => {
  const result = Array.from(host.querySelectorAll<HTMLButtonElement>('button')).find(node => node.getAttribute('aria-label') === name || node.textContent === name);
  if (!result) throw new Error(`Botão não encontrado: ${name}`);
  return result;
};
const click = async (name: string) => { await act(async () => button(name).click()); };
const title = () => host.querySelector<HTMLInputElement>('[aria-label="Título do requisito"]')!;
const changeTitle = async (value: string) => {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(title(), value);
    title().dispatchEvent(new Event('input', { bubbles: true }));
  });
};
const settle = async () => { await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); }); };

describe('requirement document workflow', () => {
  it('starts clean, expands existing criteria, and focuses each added criterion', async () => {
    await mount();
    expect(button('Salvar').disabled).toBe(true);
    expect(host.querySelector('#document-side-panel')).toBeNull();
    expect(host.querySelector<HTMLElement>('#document-criteria')?.hidden).toBe(false);
    await click('Critério');
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Título do critério 2');
    expect(button('Salvar').disabled).toBe(false);
  });

  it('opens one panel at a time and closes the overlay with Escape', async () => {
    await mount();
    await click('Detalhes da US');
    expect(host.querySelector('#document-side-panel')?.getAttribute('aria-label')).toBe('Detalhes da US');
    await click('Comentários');
    expect(host.querySelectorAll('#document-side-panel')).toHaveLength(1);
    expect(host.querySelector('#document-side-panel')?.getAttribute('aria-label')).toBe('Comentários');
    await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(host.querySelector('#document-side-panel')).toBeNull();
  });

  it('previews an older revision in read-only mode without losing the current draft', async () => {
    await mount();
    await changeTitle('Rascunho preservado');
    await click('Histórico de versões');
    await act(async () => { (Array.from(host.querySelectorAll('button')).find(node => node.textContent?.includes('Revisão 3')) as HTMLButtonElement).click(); });
    expect(host.textContent).toContain('Visualizando revisão 3');
    expect(host.textContent).toContain('Documento histórico');
    expect(title().value).toBe('Login antigo');
    expect(title().disabled).toBe(true);
    expect(host.querySelector('[role="toolbar"]')).toBeNull();
    await click('Voltar para a revisão atual');
    expect(title().value).toBe('Rascunho preservado');
    expect(title().disabled).toBe(false);
    expect(button('Salvar').disabled).toBe(false);
  });

  it.each(['VIEWER'] as WorkspaceRole[])('enforces %s access without editing tools', async role => {
    await mount(role);
    expect(title().disabled).toBe(true);
    expect(host.querySelector('[role="toolbar"]')).toBeNull();
    expect(host.querySelector('.ProseMirror')?.getAttribute('contenteditable')).toBe('false');
    await click('Comentários');
    expect(Boolean(host.querySelector('textarea'))).toBe(true);
    expect(api).not.toHaveBeenCalled();
  });

  it('opens an archived requirement by direct route in read-only mode', async () => {
    client.setQueryData(['requirement', 'r1'], { ...initial, status: 'ARCHIVED' });
    await mount('EDITOR');
    expect(title().disabled).toBe(true);
    expect(host.querySelector('[role="toolbar"]')).toBeNull();
    expect(host.querySelector('button')?.textContent).not.toContain('Salvar');
    expect(host.textContent).toContain('cancelada e disponível somente para consulta');
    await click('Comentários');
    expect(host.querySelector('textarea')).toBeNull();
    expect(api).not.toHaveBeenCalled();
  });

  it('blocks a requirement returned from another project before rendering editorial tools', async () => {
    client.setQueryData(['requirement', 'r1'], { ...initial, projectId: 'another-project' });
    await mount('EDITOR');
    expect(host.textContent).toContain('Requisito indisponível neste projeto');
    expect(host.textContent).toContain('pertence a outro projeto');
    expect(host.querySelector('[role="toolbar"]')).toBeNull();
    expect(host.querySelectorAll('button')).toHaveLength(0);
  });

  it('saves explicitly with Ctrl+S and clears pending status after draft activation', async () => {
    vi.mocked(api).mockImplementation(async (_path, init) => {
      const submitted = JSON.parse(init!.body as string);
      return { ...initial, title: submitted.title, content: submitted.content, status: 'ACTIVE', revision: 5 } as never;
    });
    await mount();
    await changeTitle('Entrar no sistema');
    expect(api).not.toHaveBeenCalled();
    await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, cancelable: true })));
    await settle();
    expect(api).toHaveBeenCalledWith('/requirements/r1', expect.objectContaining({ method: 'PATCH' }));
    expect(button('Salvar').disabled).toBe(true);
    expect(host.querySelector('.save-state')?.textContent).toBe('Salvo');
    await click('Detalhes da US');
    expect(host.querySelector('.status-text')?.textContent).toBe('Ativa');
  });

  it('uses the submitted document as the clean baseline when the API normalizes it', async () => {
    vi.mocked(api).mockImplementation(async (_path, init) => {
      const submitted = JSON.parse(init!.body as string);
      return {
        ...initial,
        title: submitted.title,
        content: submitted.content,
        status: 'ACTIVE',
        revision: 5,
        criteria: initial.criteria.map(criterion => ({ ...criterion, content: null })),
      } as never;
    });
    await mount();
    await changeTitle('Título salvo');
    await click('Salvar');
    await settle();
    expect(host.querySelector('.save-state')?.textContent).toBe('Salvo');
    expect(button('Salvar').disabled).toBe(true);
  });

  it('retains edits made while a save request is pending', async () => {
    let finish!: (value: unknown) => void;
    vi.mocked(api).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    await mount();
    await changeTitle('Primeira edição');
    await click('Salvar');
    await changeTitle('Edição mais recente');
    const submitted = JSON.parse(vi.mocked(api).mock.calls[0][1]!.body as string);
    await act(async () => finish({ ...initial, title: submitted.title, content: submitted.content, status: 'ACTIVE', revision: 5 }));
    await settle();
    expect(title().value).toBe('Edição mais recente');
    expect(button('Salvar').disabled).toBe(false);
  });

  it('preserves the draft on save failure and warns before closing', async () => {
    vi.mocked(api).mockRejectedValue(new ApiError('Sem conexão'));
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    await mount(); await changeTitle('Minha edição'); await click('Salvar'); await settle();
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('Sem conexão');
    expect(title().value).toBe('Minha edição');
    await click('Voltar'); expect(confirm).toHaveBeenCalled(); expect(onClose).not.toHaveBeenCalled();
    confirm.mockRestore();
  });

  it('preserves local content when choosing it after a revision conflict', async () => {
    vi.mocked(api).mockImplementation(async (_path, init) => {
      if (init?.method === 'PATCH') throw new ApiError('Conflito de revisão', 'REQUIREMENT_REVISION_CONFLICT');
      return { ...initial, title: 'Título remoto', revision: 8 } as never;
    });
    await mount(); await changeTitle('Título local'); await click('Salvar'); await settle();
    expect(host.textContent).toContain('Uma versão mais recente foi salva');
    await click('Manter minha edição');
    expect(title().value).toBe('Título local');
    expect(host.querySelector('.section-kicker')?.textContent).toContain('8');
    expect(button('Salvar').disabled).toBe(false);
  });

  it('accepts the server revision as a clean document after a conflict', async () => {
    vi.mocked(api).mockImplementation(async (_path, init) => {
      if (init?.method === 'PATCH') throw new ApiError('Conflito de revisão', 'REQUIREMENT_REVISION_CONFLICT');
      return { ...initial, title: 'Título remoto', revision: 8 } as never;
    });
    await mount(); await changeTitle('Título local'); await click('Salvar'); await settle();
    await click('Usar versão atual');
    expect(title().value).toBe('Título remoto');
    expect(button('Salvar').disabled).toBe(true);
    expect(host.querySelector('.save-state')?.textContent).toBe('Salvo');
    expect(host.querySelector('[role="alert"]')).toBeNull();
  });
});
