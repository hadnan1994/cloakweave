import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { indexWorkspaceFiles } from '@/lib/indexing';
import { answerQuestionWithRag, buildAnswerPrompt, retrieveRelevantChunks } from '@/lib/rag';
import { createWorkspace } from '@/lib/workspace';

const cleanupPaths: string[] = [];

afterEach(async () => {
  await Promise.all(cleanupPaths.splice(0).map((entry) => rm(entry, { recursive: true, force: true })));
});

describe('rag', () => {
  it('builds a prompt that asks for grounded cited answers', async () => {
    const prompt = await buildAnswerPrompt({
      question: 'What is Cloakweave?',
      chunks: [
        {
          chunkId: 'chunk-1',
          fileId: 'file-1',
          fileName: 'buildspec.md',
          text: 'Cloakweave is a private local-first RAG builder.',
          score: 0.9,
          startChar: 0,
          endChar: 48
        }
      ]
    });

    expect(prompt).toContain('Answer only from the retrieved context');
    expect(prompt).toContain('Do not use outside knowledge');
    expect(prompt).toContain('Cite sources by file name');
    expect(prompt).toContain('not found in the context');
    expect(prompt).toContain('buildspec.md');
  });

  it('builds a clear prompt when no context is retrieved', async () => {
    const prompt = await buildAnswerPrompt({
      question: 'What is missing?',
      chunks: []
    });

    expect(prompt).toContain('No context retrieved.');
    expect(prompt).toContain('indexed documents do not contain enough information');
  });

  it('retrieves chunks ranked by local embedding similarity', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'cloakweave-rag-'));
    cleanupPaths.push(root);
    const workspace = await createWorkspace(root);
    const privatePath = path.join(root, 'privacy.md');
    const unrelatedPath = path.join(root, 'colors.md');
    await writeFile(
      privatePath,
      'Private local document search keeps files on your machine. '.repeat(8),
      'utf8'
    );
    await writeFile(
      unrelatedPath,
      'Toolbar color settings adjust the interface appearance. '.repeat(8),
      'utf8'
    );
    await indexWorkspaceFiles({ workspace, filePaths: [privatePath, unrelatedPath] });

    const results = await retrieveRelevantChunks({
      databasePath: workspace.databasePath,
      workspaceId: workspace.metadata.id,
      question: 'private local file search',
      topK: 2
    });

    expect(results).toHaveLength(2);
    expect(results[0].fileName).toBe('privacy.md');
    expect(results[0].score).toBeGreaterThanOrEqual(results[1].score);
  });

  it('returns no chunks for blank queries', async () => {
    await expect(
      retrieveRelevantChunks({
        databasePath: '/tmp/missing.db',
        workspaceId: 'workspace',
        question: '   '
      })
    ).resolves.toEqual([]);
  });

  it('falls back to retrieval-only mode when Ollama is unavailable', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'cloakweave-rag-'));
    cleanupPaths.push(root);
    const workspace = await createWorkspace(root);
    const filePath = path.join(root, 'privacy.md');
    await writeFile(filePath, 'Private local document search keeps files on your machine.', 'utf8');
    await indexWorkspaceFiles({ workspace, filePaths: [filePath] });

    const result = await answerQuestionWithRag({
      databasePath: workspace.databasePath,
      workspaceId: workspace.metadata.id,
      question: 'Where do files stay?',
      ollamaEndpoint: 'http://127.0.0.1:1'
    });

    expect(result.mode).toBe('retrieval-only');
    expect(result.answer).toBeNull();
    expect(result.citations.length).toBeGreaterThan(0);
    expect(result.provider.available).toBe(false);
  });
});
