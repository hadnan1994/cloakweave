import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { initializeWorkspaceDatabase } from './sqlite';

export const WORKSPACE_DIR_NAME = '.cloakweave';
export const WORKSPACE_DB_NAME = 'cloakweave.db';
export const WORKSPACE_METADATA_NAME = 'metadata.json';
export const WORKSPACE_METADATA_VERSION = 1;

export type WorkspacePaths = {
  root: string;
  cloakweaveDir: string;
  databasePath: string;
  metadataPath: string;
  filesDir: string;
  indexDir: string;
};

export type WorkspaceMetadata = {
  id: string;
  name: string;
  rootPath: string;
  createdAt: string;
  updatedAt: string;
  version: number;
};

export type WorkspaceInfo = WorkspacePaths & {
  metadata: WorkspaceMetadata;
};

export async function createWorkspace(root: string): Promise<WorkspaceInfo> {
  const paths = getWorkspacePaths(root);
  const now = new Date().toISOString();
  const existingMetadata = await readWorkspaceMetadata(paths).catch(() => null);
  const metadata: WorkspaceMetadata = {
    id: existingMetadata?.id ?? createWorkspaceId(root),
    name: existingMetadata?.name ?? getWorkspaceName(root),
    rootPath: root,
    createdAt: existingMetadata?.createdAt ?? now,
    updatedAt: now,
    version: WORKSPACE_METADATA_VERSION
  };

  await Promise.all([
    mkdir(paths.cloakweaveDir, { recursive: true }),
    mkdir(paths.filesDir, { recursive: true }),
    mkdir(paths.indexDir, { recursive: true })
  ]);

  await writeWorkspaceMetadata(paths, metadata);
  await initializeWorkspaceDatabase({
    id: metadata.id,
    name: metadata.name,
    rootPath: metadata.rootPath,
    metadataPath: paths.metadataPath,
    databasePath: paths.databasePath,
    createdAt: metadata.createdAt,
    updatedAt: metadata.updatedAt
  });

  return {
    ...paths,
    metadata
  };
}

export async function openWorkspace(root: string): Promise<WorkspaceInfo> {
  const paths = getWorkspacePaths(root);
  const workspaceStat = await stat(paths.cloakweaveDir);

  if (!workspaceStat.isDirectory()) {
    throw new Error('The selected path is not a Cloakweave workspace');
  }

  const metadata = await readWorkspaceMetadata(paths);

  await initializeWorkspaceDatabase({
    id: metadata.id,
    name: metadata.name,
    rootPath: metadata.rootPath,
    metadataPath: paths.metadataPath,
    databasePath: paths.databasePath,
    createdAt: metadata.createdAt,
    updatedAt: metadata.updatedAt
  });

  return {
    ...paths,
    metadata
  };
}

export function getWorkspacePaths(root: string): WorkspacePaths {
  const cloakweaveDir = path.join(root, WORKSPACE_DIR_NAME);

  return {
    root,
    cloakweaveDir,
    databasePath: path.join(cloakweaveDir, WORKSPACE_DB_NAME),
    metadataPath: path.join(cloakweaveDir, WORKSPACE_METADATA_NAME),
    filesDir: path.join(cloakweaveDir, 'files'),
    indexDir: path.join(cloakweaveDir, 'index')
  };
}

async function readWorkspaceMetadata(paths: WorkspacePaths): Promise<WorkspaceMetadata> {
  const metadata = JSON.parse(await readFile(paths.metadataPath, 'utf8')) as WorkspaceMetadata;

  if (
    !metadata.id ||
    !metadata.name ||
    !metadata.rootPath ||
    !metadata.createdAt ||
    !metadata.version
  ) {
    throw new Error('Invalid Cloakweave workspace metadata');
  }

  return metadata;
}

async function writeWorkspaceMetadata(
  paths: WorkspacePaths,
  metadata: WorkspaceMetadata
): Promise<void> {
  await writeFile(paths.metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, 'utf8');
}

function getWorkspaceName(root: string): string {
  return path.basename(path.resolve(root)) || 'Cloakweave Workspace';
}

function createWorkspaceId(root: string): string {
  return createHash('sha256').update(path.resolve(root)).digest('hex').slice(0, 16);
}
