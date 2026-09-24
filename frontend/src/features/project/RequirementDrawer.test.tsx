// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../lib/api';
import { RequirementDrawer } from './RequirementDrawer';

vi.mock('../../lib/api', async importOriginal => ({ ...await importOriginal<typeof import('../../lib/api')>(), api: vi.fn() }));
const req = (id: string, code: string, title: string) => ({ id, projectId: 'p1', code, type: 'USER_STORY' as const, title, status: 'ACTIVE' as const, folderId: 'f1', source: 'MANUAL', revision: 1, content: {}, criteria: [] });
const current = req('r1', 'US-001', 'Login');
const other = req('r2', 'US-002', 'Checkout');
let host: HTMLDivElement; let root: Root; let client: QueryClient;

beforeEach(() => { vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); host = document.createElement('div'); document.body.append(host); root = createRoot(host); vi.mocked(api).mockImplementation(async (path, init) => { if (path === '/requirements/r1/relations') return [] as never; if (path === '/requirements/r1/ai-suggestions') return [] as never; if (path === '/requirements/r1/ai-analysis') return null as never; if (init?.method === 'POST') return { id: 'rel-1', sourceId: path.includes('/r2/') ? 'r2' : 'r1', targetId: path.includes('/r2/') ? 'r1' : 'r2', type: 'RELATED_TO', source: current, target: other } as never; return undefined as never; }); });
afterEach(() => { act(() => root.unmount()); client.clear(); host.remove(); vi.unstubAllGlobals(); });
const mount = async (canEdit: boolean) => act(async () => { root.render(<QueryClientProvider client={client}><RequirementDrawer requirement={current} projectRequirements={[current, other]} canEdit={canEdit} onClose={vi.fn()} onSelect={vi.fn()}/></QueryClientProvider>); });

describe('RequirementDrawer relations', () => {
  it('lets editors invert direction, choose a relation, and posts the correct source', async () => {
    await mount(true);
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
    await act(async () => { (host.querySelector('.relation-composer-trigger') as HTMLButtonElement).click(); });
    await act(async () => {
      (host.querySelector('[aria-label="Inverter direção"]') as HTMLButtonElement).click();
      (host.querySelector('[title="A US de origem depende da US alvo"]') as HTMLButtonElement).click();
    });
    await act(async () => {
      (host.querySelector('[aria-label="US selecionada"]') as HTMLButtonElement).click();
    });
    await act(async () => {
      (host.querySelector('[role="option"]') as HTMLButtonElement).click();
    });
    expect(host.textContent).toContain('US-002 depende de US-001.');
    await act(async () => {
      (host.querySelector('form button[type="submit"]') as HTMLButtonElement).click();
    });
    expect(api).toHaveBeenCalledWith('/requirements/r2/relations', expect.objectContaining({ method: 'POST', body: JSON.stringify({ targetId: 'r1', type: 'DEPENDS_ON' }) }));
  });

  it('does not expose relation mutations to viewers', async () => { await mount(false); await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); }); expect(host.querySelector('.relation-form')).toBeNull(); expect(host.textContent).toContain('Ainda não há relações nesta US.'); });

  it('shows pending suggestions to viewers without decision controls', async () => {
    vi.mocked(api).mockImplementation(async (path) => path === '/requirements/r1/relations' ? [] as never : [{ id: 's1', analysisId: 'a1', requirementId: 'r1', type: 'RELATION', targetRequirementId: 'r2', relationType: 'RELATED_TO', confidence: 0.82, justification: 'As duas histórias compartilham o mesmo fluxo.', status: 'PENDING', createdAt: '', updatedAt: '' }] as never);
    await mount(false);
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
    expect(host.textContent).toContain('Relação sugerida');
    expect(host.textContent).toContain('82%');
    expect(host.textContent).toContain('As duas histórias compartilham o mesmo fluxo.');
    expect(host.querySelector('button')?.textContent).not.toContain('Aprovar');
    expect(host.querySelector('.suggestion-actions')).toBeNull();
  });

  it('confirms an approval and invalidates related caches', async () => {
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    vi.mocked(api).mockImplementation(async (path, init) => {
      if (path === '/requirements/r1/relations') return [] as never;
      if (path === '/requirements/r1/ai-suggestions') return [{ id: 's1', analysisId: 'a1', requirementId: 'r1', type: 'REFERENCE', referenceType: 'PROTOTYPE', url: 'https://example.com/design', confidence: 0.9, justification: 'O protótipo contém o fluxo.', status: 'PENDING', createdAt: '', updatedAt: '' }] as never;
      if (init?.method === 'POST') return { id: 's1', requirementId: 'r1', type: 'REFERENCE', status: 'CONFIRMED', targetRequirementId: null } as never;
      return undefined as never;
    });
    await mount(true);
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
    const approve = Array.from(host.querySelectorAll('button')).find((button) => button.textContent?.includes('Aprovar'));
    expect(approve).toBeTruthy();
    await act(async () => { approve?.dispatchEvent(new MouseEvent('click', { bubbles: true })); await new Promise(resolve => setTimeout(resolve, 0)); });
    const confirm = Array.from(host.querySelectorAll('button')).find((button) => button.textContent?.includes('Aplicar sugestão'));
    expect(confirm).toBeTruthy();
    await act(async () => { confirm?.dispatchEvent(new MouseEvent('click', { bubbles: true })); await new Promise(resolve => setTimeout(resolve, 0)); });
    expect(api).toHaveBeenCalledWith('/ai-suggestions/s1/approve', expect.objectContaining({ method: 'POST' }));
    expect(invalidate).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['ai-suggestions', 'r1'] }));
    expect(invalidate).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['references', 'r1'] }));
  });

  it('keeps the suggestion actionable after a decision error and offers retrying the query', async () => {
    let attempts = 0;
    vi.mocked(api).mockImplementation(async (path) => {
      if (path === '/requirements/r1/relations') return [] as never;
      if (path === '/requirements/r1/ai-suggestions') { attempts += 1; if (attempts === 1) throw new Error('Falha temporária'); return [] as never; }
      return undefined as never;
    });
    await mount(false);
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
    expect(host.textContent).toContain('Falha temporária');
    const retry = Array.from(host.querySelectorAll('button')).find((button) => button.textContent?.includes('Tentar novamente'));
    await act(async () => { retry?.dispatchEvent(new MouseEvent('click', { bubbles: true })); await new Promise(resolve => setTimeout(resolve, 0)); });
    expect(host.textContent).toContain('Nenhuma sugestão disponível');
  });
});
