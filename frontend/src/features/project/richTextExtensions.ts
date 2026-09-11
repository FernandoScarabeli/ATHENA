import { CommandProps, Extension } from '@tiptap/core';

export const FONT_FAMILIES = ['Inter', 'Arial', 'Georgia', 'Times New Roman', 'Verdana', 'Courier New'] as const;
export const FONT_SIZES = ['10px', '11px', '12px', '14px', '16px', '18px', '24px', '32px'] as const;
export const TEXT_ALIGNMENTS = ['left', 'center', 'right', 'justify'] as const;

type TextAlign = typeof TEXT_ALIGNMENTS[number];

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    textFormatting: {
      setTextAlign: (alignment: TextAlign) => ReturnType;
      unsetTextAlign: () => ReturnType;
      setFontSize: (fontSize: string) => ReturnType;
      unsetFontSize: () => ReturnType;
    };
  }
}

const safeStyleValue = (value: unknown, pattern: RegExp) => typeof value === 'string' && pattern.test(value) ? value : null;

export const TextFormatting = Extension.create({
  name: 'textFormatting',
  addGlobalAttributes() {
    return [
      {
        types: ['textStyle'],
        attributes: {
          fontSize: {
            default: null,
            parseHTML: (element: HTMLElement) => safeStyleValue(element.style.fontSize, /^(10|11|12|14|16|18|24|32)px$/),
            renderHTML: (attributes: Record<string, unknown>) => attributes.fontSize ? { style: `font-size: ${attributes.fontSize}` } : {},
          },
          fontFamily: {
            default: null,
            parseHTML: (element: HTMLElement) => safeStyleValue(element.style.fontFamily?.replaceAll('"', ''), /^(Inter|Arial|Georgia|Times New Roman|Verdana|Courier New)$/),
            renderHTML: (attributes: Record<string, unknown>) => attributes.fontFamily ? { style: `font-family: ${attributes.fontFamily}` } : {},
          },
          color: {
            default: null,
            parseHTML: (element: HTMLElement) => safeStyleValue(element.style.color, /^#[0-9a-f]{6}$/i),
            renderHTML: (attributes: Record<string, unknown>) => attributes.color ? { style: `color: ${attributes.color}` } : {},
          },
          backgroundColor: {
            default: null,
            parseHTML: (element: HTMLElement) => safeStyleValue(element.style.backgroundColor, /^#[0-9a-f]{6}$/i),
            renderHTML: (attributes: Record<string, unknown>) => attributes.backgroundColor ? { style: `background-color: ${attributes.backgroundColor}` } : {},
          },
        },
      },
      {
        types: ['paragraph', 'heading'],
        attributes: {
          textAlign: {
            default: null,
            parseHTML: (element: HTMLElement) => safeStyleValue(element.style.textAlign, /^(left|center|right|justify)$/),
            renderHTML: (attributes: Record<string, unknown>) => attributes.textAlign && attributes.textAlign !== 'left' ? { style: `text-align: ${attributes.textAlign}` } : {},
          },
        },
      },
    ];
  },
  addCommands() {
    return {
      setTextAlign: (alignment: TextAlign) => ({ commands }: CommandProps) => {
        const paragraphs = commands.updateAttributes('paragraph', { textAlign: alignment });
        const headings = commands.updateAttributes('heading', { textAlign: alignment });
        return paragraphs || headings;
      },
      unsetTextAlign: () => ({ commands }: CommandProps) => {
        const paragraphs = commands.updateAttributes('paragraph', { textAlign: null });
        const headings = commands.updateAttributes('heading', { textAlign: null });
        return paragraphs || headings;
      },
      setFontSize: (fontSize: string) => ({ commands, editor }: CommandProps) => commands.setMark('textStyle', { ...editor.getAttributes('textStyle'), fontSize }),
      unsetFontSize: () => ({ commands, editor }: CommandProps) => commands.setMark('textStyle', { ...editor.getAttributes('textStyle'), fontSize: null }),
    };
  },
});
