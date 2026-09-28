// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../lib/api';
import { TaskIntegrationsPanel } from './TaskIntegrationsPanel';

vi.mock('../../lib/api', async original => ({ ...await original<typeof import('../../lib/api')>(), api: vi.fn() }));
let host: HTMLDivElement; let root: Root; let client: QueryClient;
let repositoriesFail = false;
const calls: Array<{ path: string; body?: Record<string, unknown> }> = [];
const connections = [{ id: 'github-1', kind: 'GITHUB', status: 'CONNECTED', accountLabel: 'fernando' }, { id: 'op-1', kind: 'OPENPROJECT', status: 'CONNECTED', accountLabel: 'OpenProject' }];
const repos = [{ fullName: 'fernando/ATHENA', owner: 'fernando', name: 'ATHENA', private: true }, { fullName: 'outra/Portal', owner: 'outra', name: 'Portal', private: false }];
const mappings = [{ id: 'mapping-1', connectionId: 'github-1', resourceKind: 'GITHUB_REPOSITORY', externalId: 'fernando/ATHENA', externalName: 'fernando/ATHENA' }];
const settle = async () => { await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); }); };
const click = async (label: string) => { const button = [...document.querySelectorAll<HTMLButtonElement>('button')].find(item => item.textContent?.trim() === label || item.querySelector('b')?.textContent === label || item.getAttribute('aria-label') === label); expect(button).toBeTruthy(); await act(async () => button!.click()); await settle(); };
const type = async (input: HTMLInputElement, value: string) => { await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })); }); };
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  calls.length = 0;
  repositoriesFail = false;
  vi.mocked(api).mockImplementation(async (path, options) => {
    const url = String(path);
    if (options?.method === 'POST') { calls.push({ path: url, body: JSON.parse(String(options.body)) }); return {} as never; }
    if (url.endsWith('/integrations')) return connections as never;
    if (url.endsWith('/integration-mappings')) return mappings as never;
    if (url.endsWith('/github/repositories')) { if (repositoriesFail) throw new Error('GitHub indisponível'); return repos as never; }
    if (url.endsWith('/openproject/projects')) return [{ id: 7, name: 'Produto', identifier: 'produto' }] as never;
    if (url.includes('/github/projects?owner=')) return [{ id: 'project-1', title: 'Planejamento', number: 2, fields: [{ id: 'field-1', name: 'Status' }] }] as never;
    return [] as never;
  });
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
});
afterEach(() => { act(() => root.unmount()); client.clear(); host.remove(); vi.unstubAllGlobals(); });
async function mount(role: 'OWNER' | 'MANAGER' | 'VIEWER' = 'OWNER') { await act(async () => root.render(<QueryClientProvider client={client}><TaskIntegrationsPanel workspaceId="w1" projectId="p1" role={role}/></QueryClientProvider>)); await settle(); }

describe('TaskIntegrationsPanel', () => {
  it('mostra destinos em painéis e mantém consulta sem ações de OWNER', async () => {
    await mount('VIEWER');
    expect(host.querySelectorAll('.task-service-panel')).toHaveLength(2);
    expect(host.textContent).toContain('fernando/ATHENA');
    expect(host.textContent).toContain('Somente Owner');
    expect([...host.querySelectorAll('button')].some(button => button.textContent?.includes('Autorizar'))).toBe(false);
    expect([...host.querySelectorAll('button')].some(button => button.textContent?.includes('Remover'))).toBe(false);
  });
  it('lets Managers configure project destinations without exposing workspace credentials', async () => {
    await mount('MANAGER');
    expect([...host.querySelectorAll('button')].some(button => button.textContent?.includes('Autorizar'))).toBe(true);
    expect([...host.querySelectorAll('button')].some(button => button.textContent?.includes('Conectar'))).toBe(false);
    expect([...host.querySelectorAll('button')].some(button => button.textContent?.includes('Desconectar'))).toBe(false);
  });
  it('filtra repositórios, identifica autorizados e autoriza outro destino', async () => {
    await mount(); await click('Autorizar repositório');
    expect(document.querySelector('[role="dialog"]')).toBeTruthy();
    expect(document.querySelector('.task-target-results')?.textContent).toContain('Autorizado');
    await type(document.querySelector<HTMLInputElement>('.task-target-search input')!, 'Portal');
    expect(document.querySelector('.task-target-results')?.textContent).not.toContain('ATHENA');
    await click('Autorizar');
    expect(calls.at(-1)?.body).toMatchObject({ resourceKind: 'GITHUB_REPOSITORY', externalId: 'outra/Portal' });
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });
  it('escolhe proprietário e conserva os campos do GitHub Project', async () => {
    await mount(); await click('Autorizar Project'); await click('Escolher');
    expect(document.querySelector('.task-target-results')?.textContent).toContain('Planejamento');
    await click('Autorizar');
    expect(calls.at(-1)?.body).toMatchObject({ resourceKind: 'GITHUB_PROJECT', externalId: 'project-1', settings: { fields: [{ id: 'field-1', name: 'Status' }] } });
  });
  it('abre OpenProject em janela pesquisável', async () => {
    await mount(); await click('Autorizar projeto');
    expect(document.querySelector('.task-target-results')?.textContent).toContain('Produto');
    await click('Autorizar');
    expect(calls.at(-1)?.body).toMatchObject({ resourceKind: 'OPENPROJECT_PROJECT', externalId: '7' });
  });
  it('mantém a busca ao fechar a janela e informa quando não há resultados', async () => {
    await mount(); await click('Autorizar repositório');
    await type(document.querySelector<HTMLInputElement>('.task-target-search input')!, 'inexistente');
    expect(document.querySelector('.task-target-results')?.textContent).toContain('Nenhum repositório encontrado');
    await click('Fechar autorizar repositório do github'); await click('Autorizar repositório');
    expect(document.querySelector<HTMLInputElement>('.task-target-search input')?.value).toBe('inexistente');
  });
  it('mostra erro na busca de destinos e permite tentar novamente', async () => {
    repositoriesFail = true; await mount(); await click('Autorizar repositório');
    expect(document.querySelector('.task-target-results')?.textContent).toContain('GitHub indisponível');
    repositoriesFail = false; await click('Tentar novamente');
    expect(document.querySelector('.task-target-results')?.textContent).toContain('outra/Portal');
  });
});
