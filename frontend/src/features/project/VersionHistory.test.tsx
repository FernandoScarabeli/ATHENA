// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../lib/api';
import { VersionHistory } from './VersionHistory';

vi.mock('../../lib/api', async importOriginal => ({ ...await importOriginal<typeof import('../../lib/api')>(), api: vi.fn() }));
let host: HTMLDivElement; let root: Root; let client: QueryClient;
const versions = [
  { id: null, requirementId: 'r1', revision: 3, current: true, createdAt: '2026-01-03T00:00:00Z', snapshot: { revision: 3, title: 'Atual', content: {}, folderId: 'f2', status: 'ACTIVE', criteria: [{ text: 'Novo', position: 0 }] } },
  { id: 'v2', requirementId: 'r1', revision: 2, current: false, createdAt: '2026-01-02T00:00:00Z', snapshot: { revision: 2, title: 'Anterior', content: {}, folderId: 'f1', status: 'ACTIVE', criteria: [] } },
];

beforeEach(() => { vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); host = document.createElement('div'); document.body.append(host); root = createRoot(host); client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); vi.mocked(api).mockImplementation(async path => { if (path === '/requirements/r1/versions') return versions as never; throw new Error(`unexpected request: ${path}`); }); });
afterEach(() => { act(() => root.unmount()); client.clear(); host.remove(); vi.unstubAllGlobals(); });

describe('VersionHistory', () => {
  it('shows the current revision and opens an older snapshot without requesting a diff', async () => {
    const onSelectVersion = vi.fn();
    await act(async () => { root.render(<QueryClientProvider client={client}><VersionHistory requirementId="r1" onSelectVersion={onSelectVersion}/></QueryClientProvider>); });
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
    expect(host.textContent).toContain('Revisão 3 (atual)');
    expect(host.textContent).toContain('Revisões anteriores');
    await act(async () => { (Array.from(host.querySelectorAll('button')).find(button => button.textContent?.includes('Revisão 2')) as HTMLButtonElement).click(); });
    expect(onSelectVersion).toHaveBeenCalledWith(versions[1]);
    expect(vi.mocked(api).mock.calls.some(([path]) => String(path).includes('/diff'))).toBe(false);
  });
});
