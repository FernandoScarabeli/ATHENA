import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { ChainedCommands, Editor } from '@tiptap/react';
import { AlignLeft, Bold, ChevronDown, Highlighter, Italic, Link2, List, ListOrdered, ListTodo, Quote, Redo2, Strikethrough, Table2, Underline, Undo2, X } from 'lucide-react';
import { DocumentMenu } from './DocumentMenu';
import { FONT_FAMILIES, FONT_SIZES } from './richTextExtensions';

type Action = { label: string; command: (chain: ChainedCommands) => ChainedCommands; icon?: ReactNode; active?: boolean; shortcut?: string };
const size = 16;

export function DocumentToolbar({ editor }: { editor: Editor }) {
  const [, update] = useState(0);
  const [linkOpen, setLinkOpen] = useState(false);
  useEffect(() => {
    const refresh = () => update(value => value + 1);
    editor.on('transaction', refresh);
    return () => { editor.off('transaction', refresh); };
  }, [editor]);
  const shortcut = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl';
  const actions: Record<string, Action> = {
    undo: { label: 'Desfazer', icon: <Undo2 size={size}/>, command: c => c.undo(), shortcut: `${shortcut}+Z` },
    redo: { label: 'Refazer', icon: <Redo2 size={size}/>, command: c => c.redo(), shortcut: `${shortcut}+Shift+Z` },
    bold: { label: 'Negrito', icon: <Bold size={size}/>, command: c => c.toggleBold(), active: editor.isActive('bold'), shortcut: `${shortcut}+B` },
    italic: { label: 'Itálico', icon: <Italic size={size}/>, command: c => c.toggleItalic(), active: editor.isActive('italic'), shortcut: `${shortcut}+I` },
    underline: { label: 'Sublinhado', icon: <Underline size={size}/>, command: c => c.toggleUnderline(), active: editor.isActive('underline'), shortcut: `${shortcut}+U` },
    strike: { label: 'Tachado', icon: <Strikethrough size={size}/>, command: c => c.toggleStrike(), active: editor.isActive('strike') },
    bullet: { label: 'Lista com marcadores', icon: <List size={size}/>, command: c => c.toggleBulletList(), active: editor.isActive('bulletList') },
    ordered: { label: 'Lista numerada', icon: <ListOrdered size={size}/>, command: c => c.toggleOrderedList(), active: editor.isActive('orderedList') },
    checklist: { label: 'Checklist', icon: <ListTodo size={size}/>, command: c => c.toggleTaskList(), active: editor.isActive('taskList') },
    quote: { label: 'Citação', icon: <Quote size={size}/>, command: c => c.toggleBlockquote(), active: editor.isActive('blockquote') },
    table: { label: 'Tabela', icon: <Table2 size={size}/>, command: c => c.insertTable({ rows: 3, cols: 4, withHeaderRow: true }) },
    clear: { label: 'Limpar formatação', command: c => c.unsetAllMarks().clearNodes().unsetTextAlign() },
  };
  const button = (action: Action, compact = false) => <button key={action.label} type="button" data-menu-action={!compact || undefined}
    aria-label={action.label} aria-pressed={action.active} title={`${action.label}${action.shortcut ? ` (${action.shortcut})` : ''}`}
    className={action.active ? 'active' : ''} disabled={!action.command(editor.can().chain()).run()}
    onMouseDown={event => event.preventDefault()} onClick={() => action.command(editor.chain().focus()).run()}>
    {action.icon}{!compact && <span>{action.label}</span>}{!compact && action.shortcut && <kbd>{action.shortcut}</kbd>}
  </button>;
  const textStyle = editor.getAttributes('textStyle');
  const fontSize = textStyle.fontSize ?? '16px';
  const fontFamily = textStyle.fontFamily ?? 'Inter';
  const alignment = editor.getAttributes(editor.isActive('heading') ? 'heading' : 'paragraph').textAlign ?? 'left';
  const heading = editor.isActive('heading') ? String(editor.getAttributes('heading').level) : 'paragraph';
  const style = (attributes: Record<string, string>) => editor.chain().focus().setMark('textStyle', attributes).run();
  const fontControls = <>
    <select aria-label="Fonte" className="document-font" value={fontFamily} onChange={event => style({ fontFamily: event.target.value })}>
      {!FONT_FAMILIES.includes(fontFamily) && <option value={fontFamily}>{fontFamily}</option>}{FONT_FAMILIES.map(font => <option key={font}>{font}</option>)}
    </select>
    <select aria-label="Tamanho da fonte" className="document-size" value={fontSize} onChange={event => editor.chain().focus().setFontSize(event.target.value).run()}>
      {!FONT_SIZES.includes(fontSize) && <option value={fontSize}>{fontSize}</option>}{FONT_SIZES.map(value => <option key={value} value={value}>{value.replace('px', '')}</option>)}
    </select>
  </>;
  const colors = <>
    <label className="document-color" title="Cor do texto"><span style={{ borderBottomColor: textStyle.color ?? '#252930' }}>A</span><input aria-label="Cor do texto" type="color" value={textStyle.color ?? '#252930'} onChange={event => style({ color: event.target.value })}/></label>
    <label className="document-color" title="Cor de destaque"><Highlighter size={size}/><input aria-label="Cor de destaque" type="color" value={textStyle.backgroundColor ?? '#fff2a8'} onChange={event => style({ backgroundColor: event.target.value })}/></label>
  </>;
  const alignmentControl = <label className="document-alignment"><AlignLeft size={size}/><select aria-label="Alinhamento" value={alignment} onChange={event => editor.chain().focus().setTextAlign(event.target.value as 'left' | 'center' | 'right' | 'justify').run()}>
    <option value="left">Esquerda</option><option value="center">Centro</option><option value="right">Direita</option><option value="justify">Justificado</option>
  </select></label>;
  const tableActions: Action[] = [
    { label: 'Linha acima', command: c => c.addRowBefore() }, { label: 'Linha abaixo', command: c => c.addRowAfter() },
    { label: 'Coluna à esquerda', command: c => c.addColumnBefore() }, { label: 'Coluna à direita', command: c => c.addColumnAfter() },
    { label: 'Remover linha', command: c => c.deleteRow() }, { label: 'Remover coluna', command: c => c.deleteColumn() },
    { label: 'Unir células', command: c => c.mergeCells() }, { label: 'Dividir célula', command: c => c.splitCell() },
    { label: 'Excluir tabela', command: c => c.deleteTable() },
  ];
  return <div className="document-tools">
    <nav className="document-menubar" aria-label="Menus do documento">
      <DocumentMenu label="Editar">{button(actions.undo)}{button(actions.redo)}</DocumentMenu>
      <DocumentMenu label="Inserir"><button type="button" data-menu-action onMouseDown={event => event.preventDefault()} onClick={() => setLinkOpen(true)}><Link2 size={size}/><span>Link</span></button>{['table', 'checklist', 'quote'].map(key => button(actions[key]))}</DocumentMenu>
      <DocumentMenu label="Formatar">{['bold', 'italic', 'underline', 'strike', 'clear'].map(key => button(actions[key]))}</DocumentMenu>
      {editor.isActive('table') && <DocumentMenu label={<><Table2 size={14}/> Tabela <ChevronDown size={12}/></>}>{tableActions.map(action => button(action))}</DocumentMenu>}
    </nav>
    <div className="document-formatbar" role="toolbar" aria-label="Ferramentas de formatação">
      <div className="document-toolgroup">{button(actions.undo, true)}{button(actions.redo, true)}</div>
      <div className="document-toolgroup"><select aria-label="Estilo do parágrafo" className="document-style" value={heading} onChange={event => {
        const value = event.target.value;
        if (value === 'paragraph') editor.chain().focus().setParagraph().run();
        else editor.chain().focus().setHeading({ level: Number(value) as 1 | 2 | 3 | 4 | 5 | 6 }).run();
      }}><option value="paragraph">Texto normal</option>{[1, 2, 3, 4, 5, 6].filter(level => level <= 3 || String(level) === heading).map(level => <option key={level} value={level}>Título {level}</option>)}</select></div>
      <div className="document-toolgroup document-secondary-tools">{fontControls}</div>
      <div className="document-toolgroup">{['bold', 'italic', 'underline'].map(key => button(actions[key], true))}</div>
      <div className="document-toolgroup document-secondary-tools">{colors}</div>
      <div className="document-toolgroup document-secondary-tools">{alignmentControl}{button(actions.bullet, true)}{button(actions.ordered, true)}</div>
      <DocumentMenu className="document-more-format" label={<>Mais formatação <ChevronDown size={12}/></>}>
        <div className="document-menu-fields">{fontControls}{colors}{alignmentControl}</div>{['bullet', 'ordered', 'checklist', 'strike', 'clear'].map(key => button(actions[key]))}
      </DocumentMenu>
    </div>
    {linkOpen && <LinkDialog editor={editor} onClose={() => { setLinkOpen(false); editor.commands.focus(); }}/>}
  </div>;
}

function LinkDialog({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const [url, setUrl] = useState(String(editor.getAttributes('link').href ?? ''));
  const [error, setError] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  const bookmark = useRef(editor.state.selection.getBookmark());
  useEffect(() => { dialog.current?.showModal(); }, []);
  const restore = () => editor.chain().focus().command(({ tr }) => { tr.setSelection(bookmark.current.resolve(tr.doc)); return true; }).extendMarkRange('link');
  return <dialog ref={dialog} className="document-link-dialog" aria-labelledby="document-link-title" onCancel={event => { event.preventDefault(); onClose(); }}>
    <form onSubmit={event => {
      event.preventDefault();
      const value = url.trim();
      try { const parsed = new URL(value); if (!['https:', 'http:', 'mailto:'].includes(parsed.protocol)) throw new Error(); }
      catch { setError('Use um endereço completo com https://, http:// ou mailto:.'); return; }
      const chain = restore();
      const applied = editor.state.selection.empty && !editor.isActive('link')
        ? chain.insertContent({ type: 'text', text: value, marks: [{ type: 'link', attrs: { href: value } }] }).run()
        : chain.setLink({ href: value }).run();
      if (applied) onClose();
      else setError('Não foi possível aplicar o link ao trecho selecionado.');
    }}>
      <header><h2 id="document-link-title">{editor.isActive('link') ? 'Editar link' : 'Inserir link'}</h2><button type="button" aria-label="Fechar link" onClick={onClose}><X size={18}/></button></header>
      <label>Endereço<input autoFocus aria-label="Endereço do link" placeholder="https://exemplo.com" value={url} onChange={event => { setUrl(event.target.value); setError(''); }}/></label>
      {error && <p role="alert" className="inline-error">{error}</p>}
      <footer>{editor.isActive('link') && <button type="button" className="text-button" onClick={() => { restore().unsetLink().run(); onClose(); }}>Remover link</button>}<button type="button" className="secondary-button" onClick={onClose}>Cancelar</button><button className="primary-button" disabled={!url.trim()}>Aplicar</button></footer>
    </form>
  </dialog>;
}
