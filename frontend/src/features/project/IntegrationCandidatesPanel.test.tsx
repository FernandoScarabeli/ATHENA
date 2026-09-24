// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../lib/api';
import { IntegrationCandidatesPanel } from './IntegrationCandidatesPanel';

vi.mock('../../lib/api', async original => ({ ...await original<typeof import('../../lib/api')>(), api: vi.fn() }));
let host: HTMLDivElement; let root: Root; let client: QueryClient; let mode: 'ok' | 'empty' | 'error';
const run = { id: 'run-1', status: 'COMPLETED', startedAt: '2026-09-12T12:00:00.000Z', completedAt: '2026-09-12T12:01:00.000Z', scannedCount: 31, changedCount: 2, itemCount: 2, folder: { id: 'folder-1', name: 'Produto', project: { id: 'p1', key: 'ATH', name: 'ATHENA' } } } as const;
const item = { id: 'item-1', title: 'Requisito importado', externalId: 'google:drive:1', changeType: 'UPDATED', createdAt: '2026-09-12T12:00:10.000Z', candidate: { status: 'ACCEPTED', content: { content: 'Texto externo' }, previousContent: { content: 'Texto anterior' }, previousTitle: 'Título anterior', updatedAt: '2026-09-12T12:00:10.000Z' } } as const;
beforeEach(() => { mode = 'ok'; vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); vi.mocked(api).mockImplementation(async path => { if (path === '/workspaces/w1/integrations/google/sync-runs') { if (mode === 'error') throw new Error('Falha temporária'); if (mode === 'empty') return { items: [], nextCursor: null } as never; return { items: [run], nextCursor: null } as never; } if (path === '/workspaces/w1/integrations/google/sync-runs/run-1/items') return { items: [item], nextCursor: 'next' } as never; if (String(path).includes('cursor=next')) return { items: [], nextCursor: null } as never; return [] as never; }); host = document.createElement('div'); document.body.append(host); root = createRoot(host); client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } }); });
afterEach(() => { act(() => root.unmount()); client.clear(); host.remove(); vi.unstubAllGlobals(); });
async function mount() { await act(async () => root.render(<QueryClientProvider client={client}><IntegrationCandidatesPanel workspaceId="w1" projectId="p1" role="VIEWER"/></QueryClientProvider>)); await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); }); }
describe('IntegrationCandidatesPanel', () => {
  it('agrupa uma execução em acordeão e só mostra documentos quando aberto', async () => { await mount(); expect(host.textContent).toContain('Produto'); expect(host.textContent).not.toContain('Texto externo'); const trigger = host.querySelector<HTMLButtonElement>('.sync-run-trigger')!; expect(trigger.getAttribute('aria-expanded')).toBe('false'); await act(async () => trigger.click()); await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); }); expect(trigger.getAttribute('aria-expanded')).toBe('true'); expect(host.textContent).toContain('Texto externo'); expect(host.textContent).toContain('Carregar mais documentos'); });
  it('mostra erro e permite tentar novamente', async () => { mode = 'error'; await mount(); expect(host.textContent).toContain('Falha temporária'); mode = 'ok'; const retry = [...host.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent === 'Tentar novamente')!; await act(async () => retry.click()); await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); }); expect(host.textContent).toContain('Produto'); });
  it('explica que execuções sem alterações são omitidas quando não há atividade relevante', async () => { mode = 'empty'; await mount(); expect(host.textContent).toContain('Nenhuma alteração ou falha registrada'); expect(host.textContent).toContain('Sincronizações concluídas sem mudanças ficam ocultas.'); });
});
