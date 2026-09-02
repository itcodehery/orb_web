import { PDFParse } from 'pdf-parse';
import * as mammoth from 'mammoth';

export const SUPPORTED_EXTENSIONS = ['pdf', 'docx', 'md', 'txt', 'json'] as const;
export type SupportedExtension = (typeof SUPPORTED_EXTENSIONS)[number];

export const MIME_BY_EXTENSION: Record<SupportedExtension, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  md: 'text/markdown',
  txt: 'text/plain',
  json: 'application/json',
};

const MAX_TEXT_CHARS = 200_000;

export function fileExtension(filename: string): SupportedExtension | null {
  const match = /\.([a-zA-Z0-9]+)$/.exec(filename);
  const ext = match ? match[1].toLowerCase() : '';
  return (SUPPORTED_EXTENSIONS as readonly string[]).includes(ext) ? (ext as SupportedExtension) : null;
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/[ \t]+\n/g, '\n').replace(/\n{4,}/g, '\n\n\n').trim();
}

export async function extractText(buffer: Buffer, mimeType: string, filename: string): Promise<string> {
  const ext = fileExtension(filename);
  let raw: string;

  if (ext === 'pdf') {
    const parser = new PDFParse({ data: buffer });
    try {
      const result = await parser.getText();
      raw = result.text;
    } finally {
      await parser.destroy();
    }
  } else if (ext === 'docx') {
    const result = await mammoth.extractRawText({ buffer });
    raw = result.value;
  } else {
    // md, txt, json — and the fallback for anything the multer filter already
    // rejected upstream, so this is unreachable in practice.
    raw = buffer.toString('utf-8');
  }

  return normalizeWhitespace(raw).slice(0, MAX_TEXT_CHARS);
}
