/** The subset of TipTap used by ATHENA is converted to Google Docs requests
 * instead of serialising HTML. Unknown provider fields never enter TipTap. */
type Mark = { type?: string; attrs?: Record<string, unknown> };
type Node = { type?: string; text?: string; attrs?: Record<string, unknown>; marks?: Mark[]; content?: Node[] };

type TextRange = { start: number; end: number; marks: Mark[] };
type ParagraphRange = { start: number; end: number; attrs?: Record<string, unknown>; kind: string; list?: 'bullet' | 'ordered' };

export type EncodedGoogleDocument = { text: string; requests: Array<Record<string, unknown>> };

function color(value: unknown) {
  if (typeof value !== 'string' || !/^#[0-9a-f]{6}$/i.test(value)) return undefined;
  return { color: { rgbColor: { red: parseInt(value.slice(1, 3), 16) / 255, green: parseInt(value.slice(3, 5), 16) / 255, blue: parseInt(value.slice(5, 7), 16) / 255 } } };
}

function textStyle(marks: Mark[]) {
  const style: Record<string, unknown> = {}; const fields: string[] = [];
  for (const mark of marks) {
    if (mark.type === 'bold') { style.bold = true; fields.push('bold'); }
    if (mark.type === 'italic') { style.italic = true; fields.push('italic'); }
    if (mark.type === 'underline') { style.underline = true; fields.push('underline'); }
    if (mark.type === 'strike') { style.strikethrough = true; fields.push('strikethrough'); }
    if (mark.type === 'code') { style.weightedFontFamily = { fontFamily: 'Courier New' }; fields.push('weightedFontFamily'); }
    if (mark.type === 'link' && typeof mark.attrs?.href === 'string') { style.link = { url: mark.attrs.href }; fields.push('link'); }
    if (mark.type === 'textStyle') {
      const foregroundColor = color(mark.attrs?.color); if (foregroundColor) { style.foregroundColor = foregroundColor; fields.push('foregroundColor'); }
      const backgroundColor = color(mark.attrs?.backgroundColor); if (backgroundColor) { style.backgroundColor = backgroundColor; fields.push('backgroundColor'); }
      if (typeof mark.attrs?.fontSize === 'string' && /^\d+px$/.test(mark.attrs.fontSize)) { style.fontSize = { magnitude: Number(mark.attrs.fontSize.replace('px', '')), unit: 'PT' }; fields.push('fontSize'); }
      if (typeof mark.attrs?.fontFamily === 'string') { style.weightedFontFamily = { fontFamily: mark.attrs.fontFamily }; fields.push('weightedFontFamily'); }
    }
  }
  return fields.length ? { style, fields: [...new Set(fields)] } : null;
}

export function encodeTipTapDocument(value: unknown): EncodedGoogleDocument {
  const root = value as Node; const texts: TextRange[] = []; const paragraphs: ParagraphRange[] = []; let output = ''; let list: 'bullet' | 'ordered' | undefined;
  const emitText = (node: Node) => {
    if (node.type === 'text' && typeof node.text === 'string') { const start = output.length + 1; output += node.text; if (node.marks?.length) texts.push({ start, end: output.length + 1, marks: node.marks }); return; }
    if (node.type === 'hardBreak') { output += '\n'; return; }
    node.content?.forEach(emitText);
  };
  const emitBlock = (node: Node) => {
    if (node.type === 'bulletList') { const previous = list; list = 'bullet'; node.content?.forEach(emitBlock); list = previous; return; }
    if (node.type === 'orderedList') { const previous = list; list = 'ordered'; node.content?.forEach(emitBlock); list = previous; return; }
    if (node.type === 'listItem' || node.type === 'taskItem') { const start = output.length + 1; if (node.type === 'taskItem') output += node.attrs?.checked ? '☑ ' : '☐ '; node.content?.forEach(emitBlock); const end = output.length + 1; paragraphs.push({ start, end, attrs: node.attrs, kind: 'paragraph', list }); return; }
    if (node.type === 'table') { node.content?.forEach(row => { row.content?.forEach(cell => { const start = output.length + 1; cell.content?.forEach(emitBlock); const end = output.length + 1; paragraphs.push({ start, end, kind: 'paragraph' }); output += '\t'; }); output = output.replace(/\t$/, '\n'); }); return; }
    if (['paragraph', 'heading', 'blockquote', 'codeBlock'].includes(node.type ?? '')) {
      const start = output.length + 1; emitText(node); output += '\n'; paragraphs.push({ start, end: output.length + 1, attrs: node.attrs, kind: node.type ?? 'paragraph', list }); return;
    }
    node.content?.forEach(emitBlock);
  };
  root?.content?.forEach(emitBlock);
  const requests: Array<Record<string, unknown>> = [];
  for (const range of texts) {
    const style = textStyle(range.marks); if (style) requests.push({ updateTextStyle: { range: { startIndex: range.start, endIndex: range.end }, textStyle: style.style, fields: style.fields.join(',') } });
  }
  for (const range of paragraphs) {
    const paragraphStyle: Record<string, unknown> = {}; const fields: string[] = [];
    if (range.kind === 'heading') { paragraphStyle.namedStyleType = `HEADING_${Number(range.attrs?.level ?? 1)}`; fields.push('namedStyleType'); }
    if (range.kind === 'blockquote') { paragraphStyle.indentStart = { magnitude: 18, unit: 'PT' }; fields.push('indentStart'); }
    if (range.kind === 'codeBlock') { paragraphStyle.namedStyleType = 'NORMAL_TEXT'; fields.push('namedStyleType'); }
    const align = range.attrs?.textAlign; if (typeof align === 'string') { paragraphStyle.alignment = ({ left: 'START', center: 'CENTER', right: 'END', justify: 'JUSTIFIED' } as Record<string, string>)[align]; if (paragraphStyle.alignment) fields.push('alignment'); }
    if (fields.length) requests.push({ updateParagraphStyle: { range: { startIndex: range.start, endIndex: range.end }, paragraphStyle, fields: fields.join(',') } });
    if (range.list) requests.push({ createParagraphBullets: { range: { startIndex: range.start, endIndex: range.end }, bulletPreset: range.list === 'ordered' ? 'NUMBERED_DECIMAL_ALPHA_ROMAN' : 'BULLET_DISC_CIRCLE_SQUARE' } });
  }
  return { text: output.replace(/\n+$/, '\n'), requests };
}

function marksFromStyle(style: any): Mark[] | undefined {
  const marks: Mark[] = [];
  if (style?.bold) marks.push({ type: 'bold' }); if (style?.italic) marks.push({ type: 'italic' }); if (style?.underline) marks.push({ type: 'underline' }); if (style?.strikethrough) marks.push({ type: 'strike' });
  if (style?.link?.url) marks.push({ type: 'link', attrs: { href: style.link.url, target: '_blank', rel: 'noopener noreferrer' } });
  return marks.length ? marks : undefined;
}

export function decodeGoogleDocument(document: any) {
  const content: Node[] = [];
  for (const block of document?.body?.content ?? []) {
    if (block.paragraph) {
      const paragraph = block.paragraph; const pieces: Node[] = [];
      for (const element of paragraph.elements ?? []) if (element.textRun?.content) {
        const text = String(element.textRun.content).replace(/\n$/, ''); if (text) pieces.push({ type: 'text', text, marks: marksFromStyle(element.textRun.textStyle) });
      }
      const named = paragraph.paragraphStyle?.namedStyleType; const type = typeof named === 'string' && /^HEADING_[1-6]$/.test(named) ? 'heading' : 'paragraph';
      content.push(type === 'heading' ? { type, attrs: { level: Number(named.slice(-1)) }, content: pieces } : { type, content: pieces });
    }
    if (block.table) {
      const rows = (block.table.tableRows ?? []).map((row: any) => ({ type: 'tableRow', content: (row.tableCells ?? []).map((cell: any) => ({ type: 'tableCell', content: (cell.content ?? []).flatMap((entry: any) => {
        const elements = entry.paragraph?.elements ?? []; const text = elements.map((element: any) => element.textRun?.content ?? '').join('').replace(/\n$/, ''); return [{ type: 'paragraph', content: text ? [{ type: 'text', text }] : [] }];
      }) })) }));
      content.push({ type: 'table', content: rows });
    }
  }
  return { type: 'doc', content: content.length ? content : [{ type: 'paragraph' }] };
}
