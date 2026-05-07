export type WorkspaceId = string;
export type FileId = string;
export type ChunkId = string;

export type ProviderMode = 'local' | 'cloud';

export type IndexedFile = {
  id: FileId;
  workspaceId: WorkspaceId;
  filePath: string;
  fileName: string;
  byteSize: number;
  indexedAt: string;
};
