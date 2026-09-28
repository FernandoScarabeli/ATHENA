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

beforeEach(() => { vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } }); host = document.createElement('div'); document.body.append(host); root = createRoot(host); vi.mocked(api).mockImplementation(async (path, init) => { if (init?.method === 'POST') return { id: 'rel-1', sourceId: path.includes('/r2/') ? 'r2' : 'r1', targetId: path.includes('/r2/') ? 'r1' : 'r2', type: JSON.parse(init.body as string).type, source: current, target: other } as never; if (init?.method === 'PATCH') return { id: 'rel-1', sourceId: 'r1', targetId: 'r2', type: JSON.parse(init.body as string).type, source: current, target: other } as never; if (init?.method === 'DELETE') return { id: 'rel-1', sourceId: 'r1', targetId: 'r2', type: 'RELATED_TO', source: current, target: other } as never; if (String(path).endsWith('/relations')) return [] as never; return undefined as never; }); });
afterEach(() => { act(() => root.unmount()); client.clear(); host.remove(); vi.unstubAllGlobals(); });
const mount = async (canEdit: boolean, closing = false, onCloseComplete = vi.fn()) => { await act(async () => { root.render(<QueryClientProvider client={client}><RequirementDrawer requirement={current} projectRequirements={[current, other]} canEdit={canEdit} closing={closing} onClose={vi.fn()} onCloseComplete={onCloseComplete} onSelect={vi.fn()}/></QueryClientProvider>); }); await act(async () => host.querySelector<HTMLButtonElement>('[aria-controls="drawer-relations"]')?.click()); };

describe('RequirementDrawer relations', () => {
  it('slides in when opened and completes the exit only after its animation', async () => {
    const onCloseComplete = vi.fn();
    await mount(false, true, onCloseComplete);
    const drawer = host.querySelector<HTMLElement>('.details-panel');
    expect(drawer?.classList.contains('drawer-exiting')).toBe(true);
    const animationEnd = new Event('animationend', { bubbles: true });
    Object.defineProperty(animationEnd, 'animationName', { value: 'details-drawer-exit' });
    await act(async () => drawer?.dispatchEvent(animationEnd));
    expect(onCloseComplete).toHaveBeenCalledOnce();
  });

  it('keeps the open section while changing US, then resets it when the drawer is remounted', async () => {
    const render = (requirement: typeof current) => root.render(<QueryClientProvider client={client}><RequirementDrawer requirement={requirement} projectRequirements={[current, other]} canEdit onClose={vi.fn()} onSelect={vi.fn()}/></QueryClientProvider>);
    await act(async () => render(current));
    await act(async () => host.querySelector<HTMLButtonElement>('[aria-controls="drawer-relations"]')?.click());
    expect(host.querySelector<HTMLButtonElement>('[aria-controls="drawer-relations"]')?.getAttribute('aria-expanded')).toBe('true');

    await act(async () => render(other));
    expect(host.querySelector<HTMLButtonElement>('[aria-controls="drawer-relations"]')?.getAttribute('aria-expanded')).toBe('true');

    await act(async () => root.render(null));
    await act(async () => render(other));
    expect(host.querySelector<HTMLButtonElement>('[aria-controls="drawer-relations"]')?.getAttribute('aria-expanded')).toBe('false');
  });

  it.each([
    ['PREREQUISITE', 'r1', 'r2', 'DEPENDS_ON', 'US-001 depende de US-002'],
    ['DEPENDENT', 'r2', 'r1', 'DEPENDS_ON', 'US-002 depende de US-001'],
    ['BLOCKS_CURRENT', 'r2', 'r1', 'BLOCKS', 'US-002 bloqueia US-001'],
    ['BLOCKED_BY_CURRENT', 'r1', 'r2', 'BLOCKS', 'US-001 bloqueia US-002'],
    ['RELATED', 'r1', 'r2', 'RELATED_TO', 'US-001 está relacionada à US-002'],
  ] as const)('creates %s with the correct direction', async (kind, sourceId, targetId, relationType, sentence) => {
    await mount(true);
    expect(host.querySelector('.details-panel')?.classList.contains('drawer-entering')).toBe(true);
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
    await act(async () => { (host.querySelector('.relation-composer-trigger') as HTMLButtonElement).click(); });
    expect(host.querySelectorAll('input[name="requirement-relation-type"]')).toHaveLength(0);
    const search = host.querySelector<HTMLInputElement>('[aria-label="Buscar US pelo código ou nome"]')!;
    await act(async () => {
      search.value = 'Checkout';
      search.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => { (host.querySelector('[role="option"]') as HTMLButtonElement).click(); });
    expect(host.querySelectorAll('input[name="requirement-relation-type"]')).toHaveLength(5);
    expect(host.querySelector('form')?.textContent).toContain(sentence);
    expect(host.querySelector<HTMLButtonElement>('form button[type="submit"]')?.disabled).toBe(true);
    await act(async () => { (Array.from(host.querySelectorAll<HTMLInputElement>('input[name="requirement-relation-type"]')).find(input => input.value === kind)!).click(); });
    await act(async () => {
      (host.querySelector('form button[type="submit"]') as HTMLButtonElement).click();
    });
    expect(api).toHaveBeenCalledWith(`/requirements/${sourceId}/relations`, expect.objectContaining({ method: 'POST', body: JSON.stringify({ targetId, type: relationType }) }));
  });

  it('navigates from the whole relationship card and changes type from its three-dot menu', async () => {
    const relation = { id: 'rel-1', sourceId: 'r1', targetId: 'r2', type: 'DEPENDS_ON', source: current, target: other } as const;
    client.setQueryData(['relations', 'r1'], [relation]);
    const onSelect = vi.fn();
    await act(async () => root.render(<QueryClientProvider client={client}><RequirementDrawer requirement={current} projectRequirements={[current, other]} canEdit onClose={vi.fn()} onSelect={onSelect}/></QueryClientProvider>));
    await act(async () => host.querySelector<HTMLButtonElement>('[aria-controls="drawer-relations"]')?.click());
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
    expect(host.querySelector('.relation-row-meaning')?.textContent).toContain('Pré-requisitoUS-001 depende de US-002');
    await act(async () => (host.querySelector<HTMLButtonElement>('[aria-label="Abrir US-002 Checkout"]')!).click());
    expect(onSelect).toHaveBeenCalledWith('r2');
    await act(async () => (host.querySelector<HTMLButtonElement>('[aria-label="Ações da relação com US-002"]')!).click());
    expect(host.querySelectorAll('.relation-actions-menu button[aria-pressed]')).toHaveLength(5);
    expect(host.querySelector('.relation-actions-menu button[aria-pressed="true"]')?.textContent).toContain('Pré-requisito');
    await act(async () => (Array.from(host.querySelectorAll<HTMLButtonElement>('.relation-actions-menu button')).find(button => button.textContent?.includes('US-002 bloqueia US-001'))!).click());
    expect(api).toHaveBeenCalledWith('/requirements/r1/relations/rel-1', expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ type: 'BLOCKS', direction: 'OTHER_TO_CURRENT' }) }));
  });

  it('shows every old relation for the same pair and explains why the US repeats', async () => {
    client.setQueryData(['relations', 'r1'], [
      { id: 'rel-a', sourceId: 'r1', targetId: 'r2', type: 'DEPENDS_ON', source: current, target: other },
      { id: 'rel-b', sourceId: 'r2', targetId: 'r1', type: 'BLOCKS', source: other, target: current },
    ]);
    await mount(true);
    expect(host.querySelectorAll('.relation-row')).toHaveLength(2);
    expect(host.querySelector('.relation-legacy-notice')?.textContent).toContain('mais de uma relação antiga');
    expect(host.querySelectorAll('.relation-legacy-badge')).toHaveLength(2);
    expect(host.querySelector('.relation-list')?.textContent).toContain('US-002 bloqueia US-001');
  });

  it('returns keyboard focus to the menu trigger after Escape', async () => {
    client.setQueryData(['relations', 'r1'], [{ id: 'rel-1', sourceId: 'r1', targetId: 'r2', type: 'DEPENDS_ON', source: current, target: other }]);
    await mount(true);
    const trigger = host.querySelector<HTMLButtonElement>('.relation-actions-trigger')!;
    await act(async () => trigger.click());
    const choice = host.querySelector<HTMLButtonElement>('.relation-actions-menu button[aria-pressed="false"]')!;
    choice.focus();
    await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(host.querySelector('.relation-actions-menu')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('excludes the current and already related stories from search and requires confirmation to remove', async () => {
    const relation = { id: 'rel-1', sourceId: 'r1', targetId: 'r2', type: 'RELATED_TO', source: current, target: other } as const;
    client.setQueryData(['relations', 'r1'], [relation]);
    await act(async () => root.render(<QueryClientProvider client={client}><RequirementDrawer requirement={current} projectRequirements={[current, other, { ...other, id: 'r3', code: 'US-003', title: 'Endereço' }]} canEdit onClose={vi.fn()} onSelect={vi.fn()}/></QueryClientProvider>));
    await act(async () => host.querySelector<HTMLButtonElement>('[aria-controls="drawer-relations"]')?.click());
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
    await act(async () => (host.querySelector<HTMLButtonElement>('[aria-label="Ações da relação com US-002"]')!).click());
    await act(async () => (Array.from(host.querySelectorAll<HTMLButtonElement>('.relation-actions-menu button')).find(button => button.textContent === 'Remover relação')!).click());
    expect(host.querySelector('[role="dialog"]')?.textContent).toContain('Remover relação?');
    expect(api).not.toHaveBeenCalledWith('/requirements/r1/relations/rel-1', expect.objectContaining({ method: 'DELETE' }));
    await act(async () => (host.querySelector<HTMLButtonElement>('.modal-footer .primary-button')!).click());
    expect(api).toHaveBeenCalledWith('/requirements/r1/relations/rel-1', expect.objectContaining({ method: 'DELETE' }));
  });

  it('filters the reusable search and supports selecting its result from the keyboard', async () => {
    const relation = { id: 'rel-1', sourceId: 'r1', targetId: 'r2', type: 'RELATED_TO', source: current, target: other } as const;
    const third = { ...other, id: 'r3', code: 'US-003', title: 'Endereço' };
    client.setQueryData(['relations', 'r1'], [relation]);
    await act(async () => root.render(<QueryClientProvider client={client}><RequirementDrawer requirement={current} projectRequirements={[current, other, third]} canEdit onClose={vi.fn()} onSelect={vi.fn()}/></QueryClientProvider>));
    await act(async () => host.querySelector<HTMLButtonElement>('[aria-controls="drawer-relations"]')?.click());
    await act(async () => (host.querySelector<HTMLButtonElement>('.relation-composer-trigger')!).click());
    const input = host.querySelector<HTMLInputElement>('[aria-label="Buscar US pelo código ou nome"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'US');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(Array.from(host.querySelectorAll('[role="option"]')).map(option => option.textContent)).toEqual(['US-003Endereço']);
    await act(async () => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })));
    await act(async () => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
    expect(host.querySelector('.requirement-search-selected')?.textContent).toContain('US-003');
  });

  it('shows loading, error recovery, and no-results states in the search', async () => {
    const retry = vi.fn();
    const render = (options: { loading?: boolean; error?: Error | null; requirements?: Array<typeof current> }) => root.render(<QueryClientProvider client={client}><RequirementDrawer requirement={current} projectRequirements={options.requirements ?? [current, other]} projectRequirementsLoading={options.loading} projectRequirementsError={options.error} onRetryProjectRequirements={retry} canEdit onClose={vi.fn()} onSelect={vi.fn()}/></QueryClientProvider>);
    await act(async () => render({ loading: true }));
    await act(async () => host.querySelector<HTMLButtonElement>('[aria-controls="drawer-relations"]')?.click());
    await act(async () => (host.querySelector<HTMLButtonElement>('.relation-composer-trigger')!).click());
    expect(host.querySelector('[role="status"]')?.textContent).toContain('Carregando US');
    await act(async () => render({ error: new Error('Sem conexão') }));
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('Sem conexão');
    await act(async () => (Array.from(host.querySelectorAll<HTMLButtonElement>('button')).find(button => button.textContent === 'Tentar novamente')!).click());
    expect(retry).toHaveBeenCalledOnce();
    await act(async () => render({ requirements: [] }));
    const input = host.querySelector<HTMLInputElement>('[aria-label="Buscar US pelo código ou nome"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'inexistente');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(host.textContent).toContain('Nenhuma US encontrada.');
  });

  it('does not expose relation mutations to viewers', async () => { await mount(false); await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); }); expect(host.querySelector('.relation-form')).toBeNull(); expect(host.textContent).toContain('Ainda não há relações nesta US.'); });

  it('keeps related stories navigable in read mode while hiding their action menu', async () => {
    client.setQueryData(['relations', 'r1'], [{ id: 'rel-1', sourceId: 'r1', targetId: 'r2', type: 'DEPENDS_ON', source: current, target: other }]);
    await act(async () => root.render(<QueryClientProvider client={client}><RequirementDrawer requirement={current} projectRequirements={[current, other]} canEdit={false} onClose={vi.fn()} onSelect={vi.fn()}/></QueryClientProvider>));
    await act(async () => host.querySelector<HTMLButtonElement>('[aria-controls="drawer-relations"]')?.click());
    expect(host.querySelector('.relation-row-link')).toBeTruthy();
    expect(host.querySelector('.relation-actions')).toBeNull();
    expect(host.querySelector('.relation-composer-trigger')).toBeNull();
  });

  it('loads manual relations without extra analysis routes', async () => {
    await mount(false);
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
    expect(api).toHaveBeenCalledWith('/requirements/r1/relations');
    expect(vi.mocked(api).mock.calls.some(([path]) => String(path).includes('analysis') || String(path).includes('suggestions'))).toBe(false);
  });
});
