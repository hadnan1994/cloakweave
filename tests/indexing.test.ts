import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { indexWorkspaceFiles, type IndexingProgress } from '@/lib/indexing';
import { getChunkRows, listIndexedFiles } from '@/lib/sqlite';
import { createWorkspace } from '@/lib/workspace';

const cleanupPaths: string[] = [];

afterEach(async () => {
  await Promise.all(cleanupPaths.splice(0).map((entry) => rm(entry, { recursive: true, force: true })));
});

describe('indexWorkspaceFiles', () => {
  it('extracts, chunks, embeds, and stores supported files', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'cloakweave-index-'));
    cleanupPaths.push(root);
    const workspace = await createWorkspace(root);
    const filePath = path.join(root, 'notes.txt');
    await writeFile(filePath, 'private local document search '.repeat(80), 'utf8');
    const progress: IndexingProgress[] = [];

    const result = await indexWorkspaceFiles({
      workspace,
      filePaths: [filePath],
      onProgress: (event) => progress.push(event)
    });

    expect(result.indexedCount).toBe(1);
    expect(result.failedCount).toBe(0);
    expect(result.files[0]).toMatchObject({
      fileName: 'notes.txt',
      status: 'indexed'
    });
    expect(result.files[0].chunkCount).toBeGreaterThan(1);
    expect(progress.map((event) => event.stage)).toContain('embedding');

    const indexedFiles = await listIndexedFiles(workspace.databasePath, workspace.metadata.id);
    expect(indexedFiles[0]).toMatchObject({
      fileName: 'notes.txt',
      status: 'indexed',
      chunkCount: result.files[0].chunkCount
    });

    const chunks = await getChunkRows(workspace.databasePath, result.files[0].id);
    expect(chunks).toHaveLength(result.files[0].chunkCount);
    expect(JSON.parse(chunks[0].embedding_json)).toHaveLength(128);
  });

  it('records unsupported files as failed without stopping the batch', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'cloakweave-index-'));
    cleanupPaths.push(root);
    const workspace = await createWorkspace(root);
    const supportedPath = path.join(root, 'notes.md');
    const unsupportedPath = path.join(root, 'scan.pdf');
    await writeFile(supportedPath, '# Notes\n\nLocal indexing works.', 'utf8');
    await writeFile(unsupportedPath, '%PDF placeholder', 'utf8');

    const result = await indexWorkspaceFiles({
      workspace,
      filePaths: [supportedPath, unsupportedPath]
    });

    expect(result.indexedCount).toBe(1);
    expect(result.failedCount).toBe(1);
    expect(result.files.map((file) => file.status).sort()).toEqual(['failed', 'indexed']);

    const indexedFiles = await listIndexedFiles(workspace.databasePath, workspace.metadata.id);
    const failed = indexedFiles.find((file) => file.status === 'failed');
    expect(failed).toMatchObject({
      fileName: 'scan.pdf',
      chunkCount: 0
    });
    expect(failed?.errorMessage).toContain('PDF text extraction is not supported yet');
  });
});
