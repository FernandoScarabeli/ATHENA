// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { WorkspaceNavigator } from './WorkspaceNavigator';

const workspaces = [
  { id: 'w1', name: 'Produto', role: 'OWNER' as const, projects: [{ id: 'p1', key: 'WEB', name: 'Portal' }, { id: 'old', key: 'OLD', name: 'Legado', archivedAt: '2026-09-01' }] },
  { id: 'w2', name: 'Equipe', role: 'VIEWER' as const, projects: [{ id: 'p2', key: 'OPS', name: 'Operações' }] },
  { id: 'old-workspace', name: 'Histórico', role: 'OWNER' as const, archivedAt: '2026-09-01', projects: [{ id: 'old-project', key: 'OLD', name: 'Projeto antigo' }] },
];
let host: HTMLDivElement;
let root: Root;
const onSelect = vi.fn();
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  onSelect.mockClear();
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  act(() => root.render(<WorkspaceNavigator workspaces={workspaces} initialWorkspaceId="w1" onSelect={onSelect} onCreateWorkspace={vi.fn()} onCreateProject={vi.fn()}/>));
});
afterEach(() => { act(() => root.unmount()); host.remove(); vi.unstubAllGlobals(); });

it('opens a project directly and excludes archived workspaces and projects', () => {
  expect(host.textContent).not.toContain('Legado');
  expect(host.textContent).not.toContain('Histórico');
  act(() => host.querySelector<HTMLButtonElement>('.navigator-project')!.click());
  expect(onSelect).toHaveBeenCalledWith('w1', 'p1');
});

it('searches across workspaces and opens the result in its own context', () => {
  const input = host.querySelector('input')!;
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'OPS');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  expect(host.textContent).toContain('Operações');
  expect(host.querySelectorAll('.navigator-project')).toHaveLength(1);
  act(() => host.querySelector<HTMLButtonElement>('.navigator-project')!.click());
  expect(onSelect).toHaveBeenCalledWith('w2', 'p2');
});

it('switches workspace without opening a project and respects creation permissions', () => {
  act(() => host.querySelectorAll<HTMLButtonElement>('.navigator-workspaces > button')[1].click());
  expect(onSelect).not.toHaveBeenCalled();
  expect(host.querySelector('.navigator-project')?.textContent).toContain('Operações');
  expect(host.querySelector('.navigator-heading button')).toBeNull();
});

it('provides the same workspace selection through the mobile control', () => {
  const select = host.querySelector('select')!;
  act(() => { select.value = 'w2'; select.dispatchEvent(new Event('change', { bubbles: true })); });
  expect(host.querySelector('.navigator-project')?.textContent).toContain('Operações');
});
