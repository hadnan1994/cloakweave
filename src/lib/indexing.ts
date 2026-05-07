import { createHash } from 'node:crypto';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { chunkText } from './chunking';
import { createLocalBaselineEmbeddingProvider, type EmbeddingProvider } from './embeddings';
import { extractTextFromFile } from './fileExtract';
import {
  persistIndexedFile,
  type IndexedFileRecord,
  type PersistedChunkInput
} from './sqlite';
import type { WorkspaceInfo } from './workspace';

export type IndexingStage =
  | 'extracting'
  | 'chunking'
  | 'embedding'
  | 'storing'
  | 'indexed'
  | 'failed'
  | 'complete';

export type IndexingProgress = {
  stage: IndexingStage;
  current: number;
  total: number;
  filePath?: string;
  fileName?: string;
  message?: string;
};

export type IndexFilesResult = {
  files: IndexedFileRecord[];
  indexedCount: number;
  failedCount: number;
};

export async function indexWorkspaceFiles(input: {
  workspace: WorkspaceInfo;
  filePaths: string[];
  embeddingProvider?: EmbeddingProvider;
  onProgress?: (progress: IndexingProgress) => void;
}): Promise<IndexFilesResult> {
  const embeddingProvider = input.embeddingProvider ?? createLocalBaselineEmbeddingProvider();
  const uniqueFilePaths = [...new Set(input.filePaths)].filter(Boolean);
  const files: IndexedFileRecord[] = [];

  for (const [index, filePath] of uniqueFilePaths.entries()) {
    const current = index + 1;
    const fileName = path.basename(filePath);

    try {
      input.onProgress?.({
        stage: 'extracting',
        current,
        total: uniqueFilePaths.length,
        filePath,
        fileName,
        message: `Extracting ${fileName}`
      });

      const extracted = await extractTextFromFile(filePath);

      input.onProgress?.({
        stage: 'chunking',
        current,
        total: uniqueFilePaths.length,
        filePath,
        fileName,
        message: `Chunking ${fileName}`
      });

      const fileId = createFileId(input.workspace.metadata.id, extracted.filePath);
      const chunks = chunkText({
        fileId,
        fileName: extracted.fileName,
        text: extracted.text
      });

      input.onProgress?.({
        stage: 'embedding',
        current,
        total: uniqueFilePaths.length,
        filePath,
        fileName,
        message: `Embedding ${chunks.length} chunks`
      });

      const embeddings = await embeddingProvider.embedBatch(chunks.map((chunk) => chunk.text));
      const persistedChunks: PersistedChunkInput[] = chunks.map((chunk, chunkIndex) => ({
        id: chunk.id,
        fileId: chunk.fileId,
        fileName: chunk.fileName,
        text: chunk.text,
        startChar: chunk.startChar,
        endChar: chunk.endChar,
        metadata: {
          ...chunk.metadata,
          embeddingProvider: embeddingProvider.name
        },
        embedding: embeddings[chunkIndex]
      }));
      const now = new Date().toISOString();

      input.onProgress?.({
        stage: 'storing',
        current,
        total: uniqueFilePaths.length,
        filePath,
        fileName,
        message: `Storing ${fileName}`
      });

      const indexedFile = await persistIndexedFile(input.workspace.databasePath, {
        file: {
          id: fileId,
          workspaceId: input.workspace.metadata.id,
          filePath: extracted.filePath,
          fileName: extracted.fileName,
          extension: extracted.extension,
          byteSize: extracted.byteSize,
          status: 'indexed',
          indexedAt: now,
          updatedAt: now
        },
        chunks: persistedChunks
      });

      files.push(indexedFile);
      input.onProgress?.({
        stage: 'indexed',
        current,
        total: uniqueFilePaths.length,
        filePath,
        fileName,
        message: `Indexed ${fileName}`
      });
    } catch (error) {
      const failedFile = await persistFailedFile(input.workspace, filePath, error);
      files.push(failedFile);
      input.onProgress?.({
        stage: 'failed',
        current,
        total: uniqueFilePaths.length,
        filePath,
        fileName,
        message: failedFile.errorMessage
      });
    }
  }

  const indexedCount = files.filter((file) => file.status === 'indexed').length;
  const failedCount = files.filter((file) => file.status === 'failed').length;

  input.onProgress?.({
    stage: 'complete',
    current: uniqueFilePaths.length,
    total: uniqueFilePaths.length,
    message: `Indexed ${indexedCount} files, ${failedCount} failed`
  });

  return {
    files,
    indexedCount,
    failedCount
  };
}

async function persistFailedFile(
  workspace: WorkspaceInfo,
  filePath: string,
  error: unknown
): Promise<IndexedFileRecord> {
  const fileStats = await stat(filePath).catch(() => null);
  const now = new Date().toISOString();

  return persistIndexedFile(workspace.databasePath, {
    file: {
      id: createFileId(workspace.metadata.id, filePath),
      workspaceId: workspace.metadata.id,
      filePath,
      fileName: path.basename(filePath),
      extension: path.extname(filePath).toLowerCase(),
      byteSize: fileStats?.size ?? 0,
      status: 'failed',
      errorMessage: error instanceof Error ? error.message : 'Unable to index file',
      indexedAt: now,
      updatedAt: now
    },
    chunks: []
  });
}

function createFileId(workspaceId: string, filePath: string): string {
  return createHash('sha256')
    .update(`${workspaceId}:${path.resolve(filePath)}`)
    .digest('hex')
    .slice(0, 24);
}
