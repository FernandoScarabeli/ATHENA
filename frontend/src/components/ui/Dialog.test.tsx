// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ConfirmDialog, Dialog } from './Dialog';

let host: HTMLDivElement;
let root: Root;

beforeEach(() => { vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); host = document.createElement('div'); document.body.append(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); vi.unstubAllGlobals(); });

it('moves focus into the confirmation and closes with Escape', async () => {
  const onCancel = vi.fn();
  const trigger = document.createElement('button'); document.body.append(trigger); trigger.focus();
  await act(async () => root.render(<ConfirmDialog title="Remover relação?" description="A relação será removida." confirmLabel="Remover" onCancel={onCancel} onConfirm={vi.fn()}/>));
  expect(document.activeElement?.getAttribute('aria-label')).toContain('Fechar');
  await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  expect(onCancel).toHaveBeenCalledOnce();
  act(() => root.unmount());
  expect(document.activeElement).toBe(trigger);
  trigger.remove();
});

it('preserves focus across rerenders and calls the latest close handler', async () => {
  const firstClose = vi.fn();
  const latestClose = vi.fn();
  await act(async () => root.render(<Dialog title="Vincular pasta" onClose={firstClose}><input aria-label="Buscar pasta"/></Dialog>));
  const input = host.querySelector<HTMLInputElement>('input')!;
  input.focus();
  await act(async () => root.render(<Dialog title="Vincular pasta" onClose={latestClose}><input aria-label="Buscar pasta"/></Dialog>));
  expect(document.activeElement).toBe(input);
  await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  expect(firstClose).not.toHaveBeenCalled();
  expect(latestClose).toHaveBeenCalledOnce();
});
