import { mkdtemp, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  getDatabaseTableNames,
  getWorkspaceRows,
  initializeWorkspaceDatabase
} from '@/lib/sqlite';

const cleanupPaths: string[] = [];

afterEach(async () => {
  await Promise.all(cleanupPaths.splice(0).map((entry) => rm(entry, { recursive: true, force: true })));
});

describe('sqlite persistence', () => {
  it('initializes the Cloakweave database tables', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'cloakweave-db-'));
    cleanupPaths.push(root);
    const databasePath = path.join(root, '.cloakweave', 'cloakweave.db');
    const now = new Date().toISOString();

    await initializeWorkspaceDatabase({
      id: 'workspace-test',
      name: 'Workspace Test',
      rootPath: root,
      metadataPath: path.join(root, '.cloakweave', 'metadata.json'),
      databasePath,
      createdAt: now,
      updatedAt: now
    });

    await expect(stat(databasePath)).resolves.toBeTruthy();
    await expect(getDatabaseTableNames(databasePath)).resolves.toEqual([
      'chat_messages',
      'chunks',
      'files',
      'settings',
      'workspaces'
    ]);
  });

  it('creates or updates the workspace row', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'cloakweave-db-'));
    cleanupPaths.push(root);
    const databasePath = path.join(root, '.cloakweave', 'cloakweave.db');
    const now = new Date().toISOString();

    await initializeWorkspaceDatabase({
      id: 'workspace-test',
      name: 'Workspace Test',
      rootPath: root,
      metadataPath: path.join(root, '.cloakweave', 'metadata.json'),
      databasePath,
      createdAt: now,
      updatedAt: now
    });

    await expect(getWorkspaceRows(databasePath)).resolves.toMatchObject([
      {
        id: 'workspace-test',
        name: 'Workspace Test',
        root_path: root,
        database_path: databasePath
      }
    ]);
  });
});
