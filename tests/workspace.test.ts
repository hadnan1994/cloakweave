import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createWorkspace, getWorkspacePaths, openWorkspace } from '@/lib/workspace';
import { getDatabaseTableNames, getWorkspaceRows } from '@/lib/sqlite';

const cleanupPaths: string[] = [];

afterEach(async () => {
  await Promise.all(cleanupPaths.splice(0).map((entry) => rm(entry, { recursive: true, force: true })));
});

describe('workspace', () => {
  it('creates the expected local workspace folders', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'cloakweave-'));
    cleanupPaths.push(root);

    const workspace = await createWorkspace(root);

    await expect(openWorkspace(root)).resolves.toEqual(workspace);
    expect(workspace.databasePath).toBe(path.join(root, '.cloakweave', 'cloakweave.db'));
    await expect(stat(workspace.databasePath)).resolves.toBeTruthy();
    await expect(stat(workspace.metadataPath)).resolves.toBeTruthy();
    await expect(getDatabaseTableNames(workspace.databasePath)).resolves.toContain('workspaces');
    await expect(getWorkspaceRows(workspace.databasePath)).resolves.toMatchObject([
      {
        id: workspace.metadata.id,
        name: workspace.metadata.name,
        root_path: root
      }
    ]);
    expect(workspace.metadata.name).toBe(path.basename(root));
    expect(workspace.metadata.rootPath).toBe(root);
  });

  it('writes local workspace metadata', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'cloakweave-'));
    cleanupPaths.push(root);

    const workspace = await createWorkspace(root);
    const metadata = JSON.parse(await readFile(workspace.metadataPath, 'utf8')) as {
      name: string;
      rootPath: string;
      version: number;
    };

    expect(metadata).toMatchObject({
      id: workspace.metadata.id,
      name: path.basename(root),
      rootPath: root,
      version: 1
    });
  });

  it('rejects folders that are not Cloakweave workspaces', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'not-cloakweave-'));
    cleanupPaths.push(root);

    await expect(openWorkspace(root)).rejects.toThrow();
  });

  it('returns deterministic workspace paths', () => {
    const root = path.join(path.sep, 'tmp', 'example');

    expect(getWorkspacePaths(root)).toEqual({
      root,
      cloakweaveDir: path.join(root, '.cloakweave'),
      databasePath: path.join(root, '.cloakweave', 'cloakweave.db'),
      metadataPath: path.join(root, '.cloakweave', 'metadata.json'),
      filesDir: path.join(root, '.cloakweave', 'files'),
      indexDir: path.join(root, '.cloakweave', 'index')
    });
  });
});
