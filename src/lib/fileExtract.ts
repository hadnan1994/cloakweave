import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

export type ExtractedFile = {
  filePath: string;
  fileName: string;
  extension: string;
  text: string;
  byteSize: number;
};

const TEXT_EXTENSIONS = new Set(['.txt', '.md', '.json', '.csv']);
const PDF_EXTENSION = '.pdf';

export async function extractTextFromFile(filePath: string): Promise<ExtractedFile> {
  const extension = path.extname(filePath).toLowerCase();

  if (extension === PDF_EXTENSION) {
    throw new Error(
      'PDF text extraction is not supported yet. PDF parsing will be added with a reliable local parser.'
    );
  }

  if (!TEXT_EXTENSIONS.has(extension)) {
    throw new Error(`Unsupported file type: ${extension || 'unknown'}`);
  }

  const [contents, fileStat] = await Promise.all([readFile(filePath, 'utf8'), stat(filePath)]);

  return {
    filePath,
    fileName: path.basename(filePath),
    extension,
    text: extractTextByExtension(contents, extension),
    byteSize: fileStat.size
  };
}

function extractTextByExtension(contents: string, extension: string): string {
  if (extension === '.json') {
    return normalizeExtractedText(extractJsonText(contents));
  }

  return normalizeExtractedText(contents);
}

function extractJsonText(contents: string): string {
  if (contents.trim().length === 0) {
    return '';
  }

  try {
    return JSON.stringify(JSON.parse(contents), null, 2);
  } catch {
    throw new Error('Invalid JSON file. Cloakweave can only extract text from valid .json files.');
  }
}

export function normalizeExtractedText(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
