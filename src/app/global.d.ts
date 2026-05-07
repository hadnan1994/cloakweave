import type { IndexFilesResult, IndexingProgress } from '@/lib/indexing';
import type { RagAnswerResult, RetrievedChunk } from '@/lib/rag';
import type { IndexedFileRecord } from '@/lib/sqlite';
import type { WorkspaceInfo } from '@/lib/workspace';

declare global {
  interface Window {
    cloakweave: {
      getVersion: () => Promise<string>;
      createWorkspace: () => Promise<WorkspaceInfo | null>;
      openWorkspace: () => Promise<WorkspaceInfo | null>;
      listIndexedFiles: (workspace: WorkspaceInfo) => Promise<IndexedFileRecord[]>;
      selectFilesForImport: (workspace: WorkspaceInfo) => Promise<IndexFilesResult | null>;
      indexDroppedFiles: (
        workspace: WorkspaceInfo,
        filePaths: string[]
      ) => Promise<IndexFilesResult>;
      searchChunks: (
        workspace: WorkspaceInfo,
        query: string,
        topK?: number
      ) => Promise<RetrievedChunk[]>;
      checkOllama: (endpoint?: string) => Promise<boolean>;
      askQuestion: (
        workspace: WorkspaceInfo,
        question: string,
        options?: {
          endpoint?: string;
          model?: string;
          topK?: number;
        }
      ) => Promise<RagAnswerResult>;
      onIndexingProgress: (callback: (progress: IndexingProgress) => void) => () => void;
    };
  }
}

export {};
