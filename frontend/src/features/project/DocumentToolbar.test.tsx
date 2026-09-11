// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Editor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import TextStyle from '@tiptap/extension-text-style';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableHeader from '@tiptap/extension-table-header';
import TableCell from '@tiptap/extension-table-cell';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TextFormatting } from './richTextExtensions';
import { DocumentToolbar } from './DocumentToolbar';

let editor: Editor;
let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('requestAnimationFrame', () => 0);
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  host = document.createElement('div');
  document.body.append(host);
  editor = new Editor({ extensions: [StarterKit, TextStyle, TextFormatting, Underline, Link.configure({ openOnClick: false }), Table.configure({ resizable: true }), TableRow, TableHeader, TableCell, TaskList, TaskItem], content: '<p>Texto selecionado</p>' });
  root = createRoot(host);
  act(() => root.render(<><DocumentToolbar editor={editor}/><EditorContent editor={editor}/></>));
});
afterEach(() => { act(() => root.unmount()); editor.destroy(); host.remove(); vi.unstubAllGlobals(); });

const named = (label: string) => {
  const node = Array.from(host.querySelectorAll<HTMLButtonElement>('button')).find(button => button.getAttribute('aria-label') === label || button.textContent === label);
  if (!node) throw new Error(`Botão não encontrado: ${label}`);
  return node;
};
const click = (label: string) => act(() => { named(label).click(); });
const select = (label: string, value: string) => act(() => {
  const input = host.querySelector<HTMLSelectElement>(`select[aria-label="${label}"]`)!;
  input.value = value; input.dispatchEvent(new Event('change', { bubbles: true }));
});

describe('document formatting interactions', () => {
  it('preserves the selected range when using a menu, and undo restores the text', () => {
    act(() => editor.commands.setTextSelection({ from: 1, to: 6 }));
    click('Formatar');
    act(() => named('Formatar').focus());
    click('Tachado');
    expect(editor.state.selection.from).toBe(1);
    expect(editor.state.selection.to).toBe(6);
    expect(editor.state.doc.firstChild?.firstChild?.marks[0]?.type.name).toBe('strike');
    click('Desfazer');
    expect(editor.state.doc.firstChild?.firstChild?.marks).toHaveLength(0);
  });

  it('updates active controls when the selection changes without changing the document', () => {
    act(() => editor.commands.setContent('<p><strong>Forte</strong> normal</p>'));
    act(() => editor.commands.setTextSelection(2));
    expect(named('Negrito').getAttribute('aria-pressed')).toBe('true');
    act(() => editor.commands.setTextSelection(9));
    expect(named('Negrito').getAttribute('aria-pressed')).toBe('false');
  });

  it('offers legacy heading levels and aligns selected headings and paragraphs together', () => {
    act(() => editor.commands.setContent('<h5>Título legado</h5><p>Texto</p>'));
    act(() => editor.commands.setTextSelection(2));
    expect(host.querySelector<HTMLSelectElement>('[aria-label="Estilo do parágrafo"]')?.value).toBe('5');
    act(() => editor.commands.selectAll());
    select('Alinhamento', 'center');
    editor.state.doc.forEach(node => expect(node.attrs.textAlign).toBe('center'));
    select('Estilo do parágrafo', '2');
    expect(editor.state.doc.firstChild?.type.name).toBe('heading');
    expect(editor.state.doc.firstChild?.attrs.level).toBe(2);
  });

  it('retains existing size, font and color when changing only one attribute', () => {
    act(() => editor.commands.setContent({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Formatado', marks: [{ type: 'textStyle', attrs: { fontFamily: 'Georgia', fontSize: '24px', color: '#112233' } }] }] }] }));
    act(() => editor.commands.selectAll());
    select('Tamanho da fonte', '18px');
    expect(editor.getAttributes('textStyle')).toMatchObject({ fontSize: '18px', fontFamily: 'Georgia', color: '#112233' });
  });

  it('shows table actions only inside a table, respecting cell command availability', () => {
    expect(Array.from(host.querySelectorAll('.document-menubar .document-menu-trigger')).some(node => node.textContent?.includes('Tabela'))).toBe(false);
    click('Inserir'); click('Tabela');
    act(() => Array.from(host.querySelectorAll<HTMLButtonElement>('.document-menubar .document-menu-trigger')).find(node => node.textContent?.includes('Tabela'))!.click());
    expect(named('Unir células').disabled).toBe(true);
    expect(named('Dividir célula').disabled).toBe(true);
    expect(named('Linha abaixo').disabled).toBe(false);
    click('Linha abaixo');
    expect(editor.state.doc.firstChild?.childCount).toBe(4);
  });

  it('restores selection when applying a link and rejects unsafe protocols', () => {
    act(() => editor.commands.setTextSelection({ from: 1, to: 6 }));
    click('Inserir'); click('Link');
    const input = host.querySelector<HTMLInputElement>('[aria-label="Endereço do link"]')!;
    const setUrl = (value: string) => act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    setUrl('javascript:alert(1)');
    act(() => host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    expect(host.querySelector('[role="alert"]')).not.toBeNull();
    expect(editor.isActive('link')).toBe(false);
    setUrl('https://example.com');
    act(() => host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    expect(editor.state.doc.firstChild?.firstChild?.text).toBe('Texto');
    expect(editor.state.doc.firstChild?.firstChild?.marks.find(mark => mark.type.name === 'link')?.attrs.href).toBe('https://example.com');
    expect(host.querySelector('dialog')).toBeNull();
  });

  it('closes menus with Escape and returns focus to their trigger', () => {
    click('Editar');
    act(() => named('Editar').focus());
    act(() => named('Editar').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })));
    // Both history actions are disabled for the initial document.
    act(() => named('Editar').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(named('Editar').getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(named('Editar'));
  });

  it('round trips existing formatted documents with merged table cells', () => {
    act(() => editor.commands.setContent({ type: 'doc', content: [{ type: 'table', content: [{ type: 'tableRow', content: [{ type: 'tableCell', attrs: { colspan: 2, rowspan: 1, colwidth: [140, 180] }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Célula mesclada', marks: [{ type: 'bold' }, { type: 'textStyle', attrs: { fontFamily: 'Georgia', fontSize: '18px' } }] }] }] }] }] }] }));
    const saved = editor.getJSON();
    act(() => editor.commands.setContent(saved));
    expect(editor.getJSON()).toEqual(saved);
    expect(editor.state.doc.firstChild?.firstChild?.firstChild?.attrs).toMatchObject({ colspan: 2, colwidth: [140, 180] });
  });
});
