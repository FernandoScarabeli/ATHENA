// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../lib/api';
import { IntegrationCandidatesPanel } from './IntegrationCandidatesPanel';

vi.mock('../../lib/api', async importOriginal => ({ ...await importOriginal<typeof import('../../lib/api')>(), api: vi.fn() }));

let host: HTMLDivElement;
let root: Root;
let client: QueryClient;
let mode: 'ok' | 'error';
const candidate = {
  id: 'candidate-1', externalId: 'github:acme:readme.md', title: 'Requisito importado',
  content: { provider: 'GITHUB', content: 'Texto externo', mimeType: 'text/plain' },
  status: 'ACCEPTED', changeType: 'UPDATED', externalVersion: 'sha-2', updatedAt: '2026-09-12T12:00:00.000Z',
  previousTitle: 'Título anterior', previousContent: { content: 'Texto anterior' },
  connection: { kind: 'GITHUB', workspaceId: 'w1' }, source: { name: 'readme.md', removedAt: null },
} as const;

beforeEach(() => {
  mode = 'ok';
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.mocked(api).mockImplementation(async (path, init) => {
    if (path === '/workspaces/w1/integration-candidates') {
      if (mode === 'error') throw new Error('Falha temporária');
      return [candidate] as never;
    }
    return [] as never;
  });
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
});

afterEach(() => { act(() => root.unmount()); client.clear(); host.remove(); vi.unstubAllGlobals(); });
const mount = async (role: 'OWNER' | 'VIEWER') => { await act(async () => root.render(<QueryClientProvider client={client}><IntegrationCandidatesPanel workspaceId="w1" projectId="p1" role={role}/></QueryClientProvider>)); await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); }); };

describe('IntegrationCandidatesPanel', () => {
  it('mostra o histórico automático e não expõe aprovação por US', async () => {
    await mount('VIEWER');
    expect(host.textContent).toContain('Texto externo');
    expect(host.textContent).toContain('Título anterior');
    expect(host.textContent).toContain('Sincronizado');
    expect(host.querySelector('button.primary-button')).toBeNull();
    expect(host.querySelector('button.secondary-button')).toBeNull();
  });

  it('não oferece decisões individuais para registros sincronizados', async () => {
    await mount('OWNER');
    expect(host.textContent).not.toContain('Aprovar');
    expect(host.textContent).not.toContain('Rejeitar');
  });

  it('mostra erro de carregamento e permite tentar novamente', async () => {
    mode = 'error';
    await mount('OWNER');
    expect(host.textContent).toContain('Falha temporária');
    mode = 'ok';
    await act(async () => host.querySelector<HTMLButtonElement>('button')!.click());
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
    expect(host.textContent).toContain('Requisito importado');
  });
});
