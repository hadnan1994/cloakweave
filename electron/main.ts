import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import path from 'node:path';
import { indexWorkspaceFiles } from '../src/lib/indexing';
import { checkOllamaAvailable } from '../src/lib/ollama';
import { answerQuestionWithRag, retrieveRelevantChunks } from '../src/lib/rag';
import { listIndexedFiles } from '../src/lib/sqlite';
import { createWorkspace, openWorkspace } from '../src/lib/workspace';
import type { WorkspaceInfo } from '../src/lib/workspace';

const VITE_DEV_SERVER_URL = 'http://127.0.0.1:5173';
const APP_ICON_PATH = path.join(__dirname, '../../assets/cloakweavelogo.png');

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1120,
    height: 760,
    minWidth: 860,
    minHeight: 620,
    title: 'Cloakweave',
    backgroundColor: '#0f172a',
    autoHideMenuBar: true,
    icon: APP_ICON_PATH,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  if (app.isPackaged) {
    mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'));
  } else {
    mainWindow.loadURL(VITE_DEV_SERVER_URL);

    if (process.env.CLOAKWEAVE_OPEN_DEVTOOLS === '1') {
      mainWindow.webContents.openDevTools({ mode: 'detach' });
    }
  }
}

app.whenReady().then(() => {
  ipcMain.handle('app:get-version', () => app.getVersion());
  ipcMain.handle('workspace:create', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Create Cloakweave Workspace',
      buttonLabel: 'Create Workspace',
      properties: ['openDirectory', 'createDirectory']
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    return createWorkspace(result.filePaths[0]);
  });

  ipcMain.handle('workspace:open', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Open Cloakweave Workspace',
      buttonLabel: 'Open Workspace',
      properties: ['openDirectory']
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    return openWorkspace(result.filePaths[0]);
  });

  ipcMain.handle('files:list-indexed', async (_event, workspace: WorkspaceInfo) => {
    return listIndexedFiles(workspace.databasePath, workspace.metadata.id);
  });

  ipcMain.handle('files:select-and-index', async (event, workspace: WorkspaceInfo) => {
    const result = await dialog.showOpenDialog({
      title: 'Import files into Cloakweave',
      buttonLabel: 'Import Files',
      properties: ['openFile', 'multiSelections'],
      filters: [
        {
          name: 'Supported files',
          extensions: ['txt', 'md', 'json', 'csv']
        },
        {
          name: 'All files',
          extensions: ['*']
        }
      ]
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    return indexWorkspaceFiles({
      workspace,
      filePaths: result.filePaths,
      onProgress: (progress) => event.sender.send('indexing:progress', progress)
    });
  });

  ipcMain.handle('files:index-paths', async (event, workspace: WorkspaceInfo, filePaths: string[]) => {
    return indexWorkspaceFiles({
      workspace,
      filePaths,
      onProgress: (progress) => event.sender.send('indexing:progress', progress)
    });
  });

  ipcMain.handle('search:chunks', async (_event, workspace: WorkspaceInfo, query: string, topK = 5) => {
    return retrieveRelevantChunks({
      databasePath: workspace.databasePath,
      workspaceId: workspace.metadata.id,
      question: query,
      topK
    });
  });

  ipcMain.handle('ollama:check', async (_event, endpoint?: string) => {
    return checkOllamaAvailable(endpoint);
  });

  ipcMain.handle(
    'chat:ask',
    async (
      _event,
      workspace: WorkspaceInfo,
      question: string,
      options?: {
        endpoint?: string;
        model?: string;
        topK?: number;
      }
    ) => {
      return answerQuestionWithRag({
        databasePath: workspace.databasePath,
        workspaceId: workspace.metadata.id,
        question,
        topK: options?.topK ?? 5,
        ollamaEndpoint: options?.endpoint,
        ollamaModel: options?.model
      });
    }
  );

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
