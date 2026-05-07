import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { extractTextFromFile, normalizeExtractedText } from '@/lib/fileExtract';

const cleanupPaths: string[] = [];

afterEach(async () => {
  await Promise.all(cleanupPaths.splice(0).map((entry) => rm(entry, { recursive: true, force: true })));
});

describe('fileExtract', () => {
  it('extracts normalized text from .txt files', async () => {
    const filePath = await writeSampleFile('notes.txt', 'Hello   Cloakweave\r\n\r\n\r\nLocal first');

    const extracted = await extractTextFromFile(filePath);

    expect(extracted.fileName).toBe('notes.txt');
    expect(extracted.extension).toBe('.txt');
    expect(extracted.text).toBe('Hello Cloakweave\n\nLocal first');
    expect(extracted.byteSize).toBeGreaterThan(0);
  });

  it('extracts normalized text from .md files', async () => {
    const filePath = await writeSampleFile(
      'notes.md',
      '# Heading\n\nThis   markdown\tfile preserves paragraphs.'
    );

    const extracted = await extractTextFromFile(filePath);

    expect(extracted.fileName).toBe('notes.md');
    expect(extracted.extension).toBe('.md');
    expect(extracted.text).toBe('# Heading\n\nThis markdown file preserves paragraphs.');
  });

  it('extracts pretty-printed text from valid .json files', async () => {
    const filePath = await writeSampleFile(
      'notes.json',
      '{"title":"Cloakweave","tags":["local","private"],"enabled":true}'
    );

    const extracted = await extractTextFromFile(filePath);

    expect(extracted.fileName).toBe('notes.json');
    expect(extracted.extension).toBe('.json');
    expect(extracted.text).toContain('"title": "Cloakweave"');
    expect(extracted.text).toContain('"local"');
  });

  it('extracts normalized text from .csv files', async () => {
    const filePath = await writeSampleFile('notes.csv', 'name, value\r\nprivacy,   local');

    const extracted = await extractTextFromFile(filePath);

    expect(extracted.fileName).toBe('notes.csv');
    expect(extracted.extension).toBe('.csv');
    expect(extracted.text).toBe('name, value\nprivacy, local');
  });

  it('returns empty text for empty supported files', async () => {
    const filePath = await writeSampleFile('empty.txt', '');

    const extracted = await extractTextFromFile(filePath);

    expect(extracted.fileName).toBe('empty.txt');
    expect(extracted.text).toBe('');
    expect(extracted.byteSize).toBe(0);
  });

  it('rejects invalid JSON with a clear error', async () => {
    const filePath = await writeSampleFile('broken.json', '{"title":');

    await expect(extractTextFromFile(filePath)).rejects.toThrow('Invalid JSON file');
  });

  it('rejects unsupported file types with a clear error', async () => {
    await expect(extractTextFromFile('/tmp/example.exe')).rejects.toThrow('Unsupported file type');
  });

  it('rejects PDFs with a clear local parser note', async () => {
    await expect(extractTextFromFile('/tmp/example.pdf')).rejects.toThrow(
      'PDF text extraction is not supported yet'
    );
  });

  it('normalizes whitespace while preserving paragraph breaks', () => {
    expect(normalizeExtractedText('A\t B\n\n\nC')).toBe('A B\n\nC');
  });
});

async function writeSampleFile(fileName: string, contents: string): Promise<string> {
    const root = await mkdtemp(path.join(os.tmpdir(), 'cloakweave-'));
    cleanupPaths.push(root);
    const filePath = path.join(root, fileName);
    await writeFile(filePath, contents, 'utf8');
    return filePath;
}
