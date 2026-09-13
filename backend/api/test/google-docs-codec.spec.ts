import { decodeGoogleDocument, encodeTipTapDocument } from '../src/integrations/google-docs-codec';

describe('Google Docs codec', () => {
  it('preserves supported rich text styles and heading semantics when writing', () => {
    const encoded = encodeTipTapDocument({ type: 'doc', content: [
      { type: 'heading', attrs: { level: 2, textAlign: 'center' }, content: [{ type: 'text', text: 'Título', marks: [{ type: 'bold' }] }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'Link', marks: [{ type: 'link', attrs: { href: 'https://example.test' } }] }] },
    ] });
    expect(encoded.text).toBe('Título\nLink\n');
    expect(encoded.requests).toEqual(expect.arrayContaining([
      expect.objectContaining({ updateTextStyle: expect.objectContaining({ textStyle: expect.objectContaining({ bold: true }) }) }),
      expect.objectContaining({ updateParagraphStyle: expect.objectContaining({ paragraphStyle: expect.objectContaining({ namedStyleType: 'HEADING_2', alignment: 'CENTER' }) }) }),
    ]));
  });

  it('converts Google text runs and tables into a safe TipTap document', () => {
    const decoded = decodeGoogleDocument({ body: { content: [
      { paragraph: { paragraphStyle: { namedStyleType: 'HEADING_3' }, elements: [{ textRun: { content: 'Plano\n', textStyle: { italic: true } } }] } },
      { table: { tableRows: [{ tableCells: [{ content: [{ paragraph: { elements: [{ textRun: { content: 'Célula\n' } }] } }] }] }] } },
    ] } });
    expect(decoded).toMatchObject({ type: 'doc', content: [expect.objectContaining({ type: 'heading', attrs: { level: 3 } }), expect.objectContaining({ type: 'table' })] });
  });
});
