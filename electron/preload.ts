import { contextBridge, ipcRenderer } from 'electron';
import type { IndexFilesResult, IndexingProgress } from '../src/lib/indexing';
import type { RagAnswerResult, RetrievedChunk } from '../src/lib/rag';
import type { IndexedFileRecord } from '../src/lib/sqlite';
import type { WorkspaceInfo } from '../src/lib/workspace';

const api = {
  getVersion: (): Promise<string> => ipcRenderer.invoke('app:get-version'),
  createWorkspace: (): Promise<WorkspaceInfo | null> => ipcRenderer.invoke('workspace:create'),
  openWorkspace: (): Promise<WorkspaceInfo | null> => ipcRenderer.invoke('workspace:open'),
  listIndexedFiles: (workspace: WorkspaceInfo): Promise<IndexedFileRecord[]> =>
    ipcRenderer.invoke('files:list-indexed', workspace),
  selectFilesForImport: (workspace: WorkspaceInfo): Promise<IndexFilesResult | null> =>
    ipcRenderer.invoke('files:select-and-index', workspace),
  indexDroppedFiles: (
    workspace: WorkspaceInfo,
    filePaths: string[]
  ): Promise<IndexFilesResult> => ipcRenderer.invoke('files:index-paths', workspace, filePaths),
  searchChunks: (workspace: WorkspaceInfo, query: string, topK?: number): Promise<RetrievedChunk[]> =>
    ipcRenderer.invoke('search:chunks', workspace, query, topK),
  checkOllama: (endpoint?: string): Promise<boolean> => ipcRenderer.invoke('ollama:check', endpoint),
  askQuestion: (
    workspace: WorkspaceInfo,
    question: string,
    options?: {
      endpoint?: string;
      model?: string;
      topK?: number;
    }
  ): Promise<RagAnswerResult> => ipcRenderer.invoke('chat:ask', workspace, question, options),
  onIndexingProgress: (callback: (progress: IndexingProgress) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, progress: IndexingProgress) => {
      callback(progress);
    };

    ipcRenderer.on('indexing:progress', listener);
    return () => ipcRenderer.removeListener('indexing:progress', listener);
  }
};

contextBridge.exposeInMainWorld('cloakweave', api);

export type CloakweaveApi = typeof api;
