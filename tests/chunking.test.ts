import { describe, expect, it } from 'vitest';
import { chunkText } from '@/lib/chunking';

describe('chunkText', () => {
  it('creates deterministic chunks with source metadata', () => {
    const chunks = chunkText({
      fileId: 'file-1',
      fileName: 'notes.md',
      text: 'abcdefghijklmnopqrst',
      chunkSize: 10,
      overlap: 0
    });

    expect(chunks).toEqual([
      {
        id: 'file-1:0',
        fileId: 'file-1',
        fileName: 'notes.md',
        text: 'abcdefghij',
        startChar: 0,
        endChar: 10,
        metadata: { fileName: 'notes.md' }
      },
      {
        id: 'file-1:1',
        fileId: 'file-1',
        fileName: 'notes.md',
        text: 'klmnopqrst',
        startChar: 10,
        endChar: 20,
        metadata: { fileName: 'notes.md' }
      }
    ]);

    expect(chunkText({
      fileId: 'file-1',
      fileName: 'notes.md',
      text: 'abcdefghijklmnopqrst',
      chunkSize: 10,
      overlap: 0
    })).toEqual(chunks);
  });

  it('uses overlap between adjacent chunks', () => {
    const chunks = chunkText({
      fileId: 'file-1',
      fileName: 'notes.md',
      text: 'abcdefghijklmnopqrstuvwxyz',
      chunkSize: 10,
      overlap: 2
    });

    expect(chunks.map((chunk) => ({
      text: chunk.text,
      startChar: chunk.startChar,
      endChar: chunk.endChar
    }))).toEqual([
      { text: 'abcdefghij', startChar: 0, endChar: 10 },
      { text: 'ijklmnopqr', startChar: 8, endChar: 18 },
      { text: 'qrstuvwxyz', startChar: 16, endChar: 26 }
    ]);
  });

  it('returns no chunks for empty or whitespace-only input', () => {
    expect(chunkText({ fileId: 'file-1', fileName: 'empty.txt', text: '' })).toEqual([]);
    expect(chunkText({ fileId: 'file-1', fileName: 'empty.txt', text: '   \n\t  ' })).toEqual([]);
  });

  it('returns one chunk for short input', () => {
    expect(
      chunkText({
        fileId: 'file-1',
        fileName: 'short.txt',
        text: 'short input'
      })
    ).toEqual([
      {
        id: 'file-1:0',
        fileId: 'file-1',
        fileName: 'short.txt',
        text: 'short input',
        startChar: 0,
        endChar: 11,
        metadata: { fileName: 'short.txt' }
      }
    ]);
  });

  it('uses default chunkSize and overlap values', () => {
    const text = 'a'.repeat(1000);
    const chunks = chunkText({
      fileId: 'file-1',
      fileName: 'defaults.txt',
      text
    });

    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toMatchObject({ startChar: 0, endChar: 900 });
    expect(chunks[1]).toMatchObject({ startChar: 750, endChar: 1000 });
  });

  it('rejects overlap values that can cause an infinite loop', () => {
    expect(() =>
      chunkText({
        fileId: 'file-1',
        fileName: 'notes.md',
        text: 'hello',
        chunkSize: 10,
        overlap: 10
      })
    ).toThrow('overlap');
  });
});
