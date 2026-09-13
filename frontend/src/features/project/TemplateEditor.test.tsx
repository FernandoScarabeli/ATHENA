// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TemplateEditor } from './TemplateEditor';
import { api } from '../../lib/api';
import type { RequirementTemplate } from '../../lib/types';

vi.mock('../../lib/api', async importOriginal => ({ ...await importOriginal<typeof import('../../lib/api')>(), api: vi.fn() }));

const initial: RequirementTemplate = {
  id: 'template-1', name: 'Estrutura padrão', description: 'Para histórias de produto',
  content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Contexto' }] }] },
};
let host: HTMLDivElement;
let root: Root;
let client: QueryClient;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.mocked(api).mockReset();
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } } });
  client.setQueryData(['template', initial.id], structuredClone(initial));
});
afterEach(() => { act(() => root.unmount()); client.clear(); host.remove(); vi.unstubAllGlobals(); });

const mount = async () => {
  await act(async () => root.render(<QueryClientProvider client={client}><TemplateEditor workspace={{ id: 'workspace-1', name: 'Produto', role: 'EDITOR' }} templateId={initial.id} onClose={vi.fn()}/></QueryClientProvider>));
};
const description = () => host.querySelector<HTMLInputElement>('.template-description input')!;
const saveButton = () => Array.from(host.querySelectorAll<HTMLButtonElement>('button')).find(node => node.textContent === 'Salvar')!;
const change = async (input: HTMLInputElement, value: string) => {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
};
const settle = async () => { await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); }); };

describe('template editor saving', () => {
  it('saves the edited draft and marks it clean after a successful response', async () => {
    vi.mocked(api).mockImplementation(async (_path, init) => ({ ...initial, ...JSON.parse(init!.body as string) } as never));
    await mount();
    await change(description(), 'Estrutura para fluxos críticos');
    expect(saveButton().disabled).toBe(false);
    await act(async () => saveButton().click());
    await settle();
    expect(api).toHaveBeenCalledWith('/templates/template-1', expect.objectContaining({ method: 'PATCH' }));
    expect(JSON.parse(vi.mocked(api).mock.calls[0][1]!.body as string)).toMatchObject({ description: 'Estrutura para fluxos críticos' });
    expect(saveButton().disabled).toBe(true);
    expect(host.querySelector('.save-state')?.textContent).toBe('Salvo');
  });

  it('sends null when the description is cleared', async () => {
    vi.mocked(api).mockImplementation(async (_path, init) => ({ ...initial, ...JSON.parse(init!.body as string) } as never));
    await mount();
    await change(description(), '');
    await act(async () => saveButton().click());
    await settle();
    expect(JSON.parse(vi.mocked(api).mock.calls[0][1]!.body as string).description).toBeNull();
  });

  it('edita critérios ordenados Dado/Quando/Então e os envia no round-trip', async () => {
    vi.mocked(api).mockImplementation(async (_path, init) => ({ ...initial, ...JSON.parse(init!.body as string) } as never));
    await mount();
    await settle();
    await act(async () => Array.from(host.querySelectorAll('button')).find(button => button.textContent?.trim() === '＋ Critério')?.click());
    const title = host.querySelector<HTMLInputElement>('[aria-label="Título do critério 1"]')!;
    const fields = Array.from(host.querySelectorAll<HTMLInputElement>('.gherkin-fields input'));
    await change(title, 'Usuário autenticado');
    await settle();
    await change(fields[0], 'que possui uma conta válida');
    await settle();
    await change(fields[1], 'envia o formulário');
    await settle();
    await change(fields[2], 'o acesso é concedido');
    await settle();
    expect({ disabled: saveButton().disabled, state: host.querySelector('.save-state')?.textContent, title: title.value, fields: fields.map(field => field.value) }).toEqual(expect.objectContaining({ disabled: false }));
    await act(async () => saveButton().click());
    await settle();
    const body = JSON.parse(vi.mocked(api).mock.calls[0][1]!.body as string);
    expect(body.acceptanceCriteria).toEqual([expect.objectContaining({ title: 'Usuário autenticado', given: 'que possui uma conta válida', when: 'envia o formulário', then: 'o acesso é concedido', position: 0 })]);
    expect(saveButton().disabled).toBe(true);
  });
});
