import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import initSqlJs from 'sql.js';

export const SQLITE_FILE_NAME = 'cloakweave.db';

export const SQLITE_PERSISTENCE_NOTE =
  'Cloakweave uses sql.js, SQLite compiled to WebAssembly, to avoid native Electron rebuilds on macOS, Windows, and Linux. Database bytes are exported back to the local workspace cloakweave.db file after initialization or writes.';

export type WorkspaceDatabaseRecord = {
  id: string;
  name: string;
  rootPath: string;
  metadataPath: string;
  databasePath: string;
  createdAt: string;
  updatedAt: string;
};

export type IndexedFileStatus = 'indexed' | 'failed';

export type IndexedFileRecord = {
  id: string;
  workspaceId: string;
  filePath: string;
  fileName: string;
  extension: string;
  byteSize: number;
  status: IndexedFileStatus;
  indexedAt: string;
  updatedAt: string;
  chunkCount: number;
  errorMessage?: string;
};

export type PersistedChunkInput = {
  id: string;
  fileId: string;
  fileName: string;
  text: string;
  startChar: number;
  endChar: number;
  metadata?: Record<string, unknown>;
  embedding: number[];
};

export type StoredChunkEmbedding = {
  id: string;
  fileId: string;
  fileName: string;
  text: string;
  startChar: number;
  endChar: number;
  embedding: number[];
};

export type PersistIndexedFileInput = {
  file: Omit<IndexedFileRecord, 'chunkCount'>;
  chunks: PersistedChunkInput[];
};

type SqlJsDatabase = initSqlJs.Database;

let sqlJsPromise: Promise<initSqlJs.SqlJsStatic> | null = null;

export const schema = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  root_path TEXT NOT NULL,
  metadata_path TEXT NOT NULL,
  database_path TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS files (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  extension TEXT NOT NULL,
  byte_size INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'indexed',
  error_message TEXT,
  indexed_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id)
);

CREATE TABLE IF NOT EXISTS chunks (
  id TEXT PRIMARY KEY,
  file_id TEXT NOT NULL,
  file_name TEXT NOT NULL,
  text TEXT NOT NULL,
  start_char INTEGER NOT NULL,
  end_char INTEGER NOT NULL,
  metadata_json TEXT,
  embedding_json TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (file_id) REFERENCES files(id)
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  citations_json TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id)
);

CREATE INDEX IF NOT EXISTS files_workspace_id_index ON files(workspace_id);
CREATE INDEX IF NOT EXISTS chunks_file_id_index ON chunks(file_id);
CREATE INDEX IF NOT EXISTS chat_messages_workspace_id_index ON chat_messages(workspace_id);
`;

export function getWorkspaceDatabasePath(workspaceRoot: string): string {
  return path.join(workspaceRoot, '.cloakweave', SQLITE_FILE_NAME);
}

export async function initializeWorkspaceDatabase(
  workspace: WorkspaceDatabaseRecord
): Promise<void> {
  const database = await openDatabase(workspace.databasePath);

  try {
    database.exec(schema);
    runMigrations(database);
    upsertWorkspace(database, workspace);
    await saveDatabase(database, workspace.databasePath);
  } finally {
    database.close();
  }
}

export async function persistIndexedFile(
  databasePath: string,
  input: PersistIndexedFileInput
): Promise<IndexedFileRecord> {
  const database = await openDatabase(databasePath);

  try {
    database.exec('PRAGMA foreign_keys = ON; BEGIN TRANSACTION;');
    upsertFile(database, input.file);
    database.run('DELETE FROM chunks WHERE file_id = :fileId;', {
      ':fileId': input.file.id
    });

    for (const chunk of input.chunks) {
      insertChunk(database, chunk);
    }

    database.exec('COMMIT;');
    await saveDatabase(database, databasePath);

    return {
      ...input.file,
      chunkCount: input.chunks.length
    };
  } catch (error) {
    database.exec('ROLLBACK;');
    throw error;
  } finally {
    database.close();
  }
}

export async function listIndexedFiles(
  databasePath: string,
  workspaceId: string
): Promise<IndexedFileRecord[]> {
  const database = await openDatabase(databasePath);

  try {
    const result = database.exec(
      `
      SELECT
        files.id,
        files.workspace_id,
        files.file_path,
        files.file_name,
        files.extension,
        files.byte_size,
        files.status,
        files.error_message,
        files.indexed_at,
        files.updated_at,
        COUNT(chunks.id) AS chunk_count
      FROM files
      LEFT JOIN chunks ON chunks.file_id = files.id
      WHERE files.workspace_id = :workspaceId
      GROUP BY files.id
      ORDER BY files.updated_at DESC, files.file_name ASC;
      `,
      {
        ':workspaceId': workspaceId
      }
    );

    if (!result[0]) {
      return [];
    }

    return result[0].values.map((row) => {
      return {
        id: String(row[0]),
        workspaceId: String(row[1]),
        filePath: String(row[2]),
        fileName: String(row[3]),
        extension: String(row[4]),
        byteSize: Number(row[5]),
        status: String(row[6]) as IndexedFileStatus,
        errorMessage: row[7] === null ? undefined : String(row[7]),
        indexedAt: String(row[8]),
        updatedAt: String(row[9]),
        chunkCount: Number(row[10])
      };
    });
  } finally {
    database.close();
  }
}

export async function getChunkRows(
  databasePath: string,
  fileId: string
): Promise<Array<Record<string, string>>> {
  const database = await openDatabase(databasePath);

  try {
    const result = database.exec(
      `
      SELECT id, file_id, file_name, text, start_char, end_char, embedding_json
      FROM chunks
      WHERE file_id = :fileId
      ORDER BY start_char ASC;
      `,
      {
        ':fileId': fileId
      }
    );

    if (!result[0]) {
      return [];
    }

    return result[0].values.map((row) => {
      return Object.fromEntries(result[0].columns.map((column, index) => [column, String(row[index])]));
    });
  } finally {
    database.close();
  }
}

export async function listChunkEmbeddings(
  databasePath: string,
  workspaceId: string
): Promise<StoredChunkEmbedding[]> {
  const database = await openDatabase(databasePath);

  try {
    const result = database.exec(
      `
      SELECT
        chunks.id,
        chunks.file_id,
        chunks.file_name,
        chunks.text,
        chunks.start_char,
        chunks.end_char,
        chunks.embedding_json
      FROM chunks
      INNER JOIN files ON files.id = chunks.file_id
      WHERE files.workspace_id = :workspaceId
        AND files.status = 'indexed'
        AND chunks.embedding_json IS NOT NULL
      ORDER BY chunks.file_name ASC, chunks.start_char ASC;
      `,
      {
        ':workspaceId': workspaceId
      }
    );

    if (!result[0]) {
      return [];
    }

    return result[0].values
      .map((row) => {
        return {
          id: String(row[0]),
          fileId: String(row[1]),
          fileName: String(row[2]),
          text: String(row[3]),
          startChar: Number(row[4]),
          endChar: Number(row[5]),
          embedding: parseEmbedding(row[6])
        };
      })
      .filter((chunk) => chunk.embedding.length > 0);
  } finally {
    database.close();
  }
}

export async function getDatabaseTableNames(databasePath: string): Promise<string[]> {
  const database = await openDatabase(databasePath);

  try {
    const result = database.exec(`
      SELECT name
      FROM sqlite_master
      WHERE type = 'table'
        AND name NOT LIKE 'sqlite_%'
      ORDER BY name;
    `);

    return result[0]?.values.map(([name]) => String(name)) ?? [];
  } finally {
    database.close();
  }
}

export async function getWorkspaceRows(databasePath: string): Promise<Array<Record<string, string>>> {
  const database = await openDatabase(databasePath);

  try {
    const result = database.exec(`
      SELECT id, name, root_path, metadata_path, database_path, created_at, updated_at
      FROM workspaces
      ORDER BY name;
    `);

    if (!result[0]) {
      return [];
    }

    return result[0].values.map((row) => {
      return Object.fromEntries(result[0].columns.map((column, index) => [column, String(row[index])]));
    });
  } finally {
    database.close();
  }
}

async function openDatabase(databasePath: string): Promise<SqlJsDatabase> {
  const SQL = await getSqlJs();
  const databaseBytes = await readFile(databasePath).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') {
      return null;
    }

    throw error;
  });

  if (databaseBytes && databaseBytes.byteLength > 0) {
    return new SQL.Database(databaseBytes);
  }

  return new SQL.Database();
}

async function saveDatabase(database: SqlJsDatabase, databasePath: string): Promise<void> {
  await mkdir(path.dirname(databasePath), { recursive: true });
  await writeFile(databasePath, Buffer.from(database.export()));
}

async function getSqlJs(): Promise<initSqlJs.SqlJsStatic> {
  sqlJsPromise ??= initSqlJs({
    locateFile: (fileName) => path.join(path.dirname(require.resolve('sql.js/dist/sql-wasm.wasm')), fileName)
  });

  return sqlJsPromise;
}

function upsertWorkspace(database: SqlJsDatabase, workspace: WorkspaceDatabaseRecord): void {
  database.run(
    `
    INSERT INTO workspaces (
      id,
      name,
      root_path,
      metadata_path,
      database_path,
      created_at,
      updated_at
    )
    VALUES (
      :id,
      :name,
      :rootPath,
      :metadataPath,
      :databasePath,
      :createdAt,
      :updatedAt
    )
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      root_path = excluded.root_path,
      metadata_path = excluded.metadata_path,
      database_path = excluded.database_path,
      updated_at = excluded.updated_at;
    `,
    {
      ':id': workspace.id,
      ':name': workspace.name,
      ':rootPath': workspace.rootPath,
      ':metadataPath': workspace.metadataPath,
      ':databasePath': workspace.databasePath,
      ':createdAt': workspace.createdAt,
      ':updatedAt': workspace.updatedAt
    }
  );
}

function runMigrations(database: SqlJsDatabase): void {
  const filesColumns = getTableColumns(database, 'files');

  if (filesColumns.length > 0 && !filesColumns.includes('error_message')) {
    database.run('ALTER TABLE files ADD COLUMN error_message TEXT;');
  }
}

function getTableColumns(database: SqlJsDatabase, tableName: string): string[] {
  const result = database.exec(`PRAGMA table_info(${tableName});`);
  return result[0]?.values.map((row) => String(row[1])) ?? [];
}

function upsertFile(database: SqlJsDatabase, file: Omit<IndexedFileRecord, 'chunkCount'>): void {
  database.run(
    `
    INSERT INTO files (
      id,
      workspace_id,
      file_path,
      file_name,
      extension,
      byte_size,
      status,
      error_message,
      indexed_at,
      updated_at
    )
    VALUES (
      :id,
      :workspaceId,
      :filePath,
      :fileName,
      :extension,
      :byteSize,
      :status,
      :errorMessage,
      :indexedAt,
      :updatedAt
    )
    ON CONFLICT(id) DO UPDATE SET
      file_path = excluded.file_path,
      file_name = excluded.file_name,
      extension = excluded.extension,
      byte_size = excluded.byte_size,
      status = excluded.status,
      error_message = excluded.error_message,
      indexed_at = excluded.indexed_at,
      updated_at = excluded.updated_at;
    `,
    {
      ':id': file.id,
      ':workspaceId': file.workspaceId,
      ':filePath': file.filePath,
      ':fileName': file.fileName,
      ':extension': file.extension,
      ':byteSize': file.byteSize,
      ':status': file.status,
      ':errorMessage': file.errorMessage ?? null,
      ':indexedAt': file.indexedAt,
      ':updatedAt': file.updatedAt
    }
  );
}

function insertChunk(database: SqlJsDatabase, chunk: PersistedChunkInput): void {
  database.run(
    `
    INSERT INTO chunks (
      id,
      file_id,
      file_name,
      text,
      start_char,
      end_char,
      metadata_json,
      embedding_json,
      created_at
    )
    VALUES (
      :id,
      :fileId,
      :fileName,
      :text,
      :startChar,
      :endChar,
      :metadataJson,
      :embeddingJson,
      :createdAt
    );
    `,
    {
      ':id': chunk.id,
      ':fileId': chunk.fileId,
      ':fileName': chunk.fileName,
      ':text': chunk.text,
      ':startChar': chunk.startChar,
      ':endChar': chunk.endChar,
      ':metadataJson': JSON.stringify(chunk.metadata ?? {}),
      ':embeddingJson': JSON.stringify(chunk.embedding),
      ':createdAt': new Date().toISOString()
    }
  );
}

function parseEmbedding(value: initSqlJs.SqlValue): number[] {
  if (typeof value !== 'string') {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) && parsed.every((entry) => typeof entry === 'number') ? parsed : [];
  } catch {
    return [];
  }
}
