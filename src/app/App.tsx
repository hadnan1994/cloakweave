import { useEffect, useState, type DragEvent } from 'react';
import { ChatPanel } from '@/components/ChatPanel';
import type { IndexFilesResult, IndexingProgress } from '@/lib/indexing';
import { DEFAULT_OLLAMA_ENDPOINT, DEFAULT_OLLAMA_MODEL } from '@/lib/ollama';
import type { RetrievedChunk } from '@/lib/rag';
import type { IndexedFileRecord } from '@/lib/sqlite';
import type { WorkspaceInfo } from '@/lib/workspace';

type FileWithPath = File & {
  path?: string;
};

export function App() {
  const [workspace, setWorkspace] = useState<WorkspaceInfo | null>(null);
  const [status, setStatus] = useState<string>('No workspace selected');
  const [isChoosingWorkspace, setIsChoosingWorkspace] = useState(false);
  const [isIndexing, setIsIndexing] = useState(false);
  const [indexedFiles, setIndexedFiles] = useState<IndexedFileRecord[]>([]);
  const [indexingProgress, setIndexingProgress] = useState<IndexingProgress | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<RetrievedChunk[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [ollamaEndpoint, setOllamaEndpoint] = useState(DEFAULT_OLLAMA_ENDPOINT);
  const [ollamaModel, setOllamaModel] = useState(DEFAULT_OLLAMA_MODEL);
  const [ollamaStatus, setOllamaStatus] = useState<'unknown' | 'available' | 'unavailable'>('unknown');
  const [isCheckingOllama, setIsCheckingOllama] = useState(false);

  useEffect(() => {
    if (!window.cloakweave?.onIndexingProgress) {
      return undefined;
    }

    return window.cloakweave.onIndexingProgress(setIndexingProgress);
  }, []);

  async function chooseWorkspace(action: 'create' | 'open') {
    if (!window.cloakweave) {
      setStatus('Workspace dialogs are available in the Electron app.');
      return;
    }

    setIsChoosingWorkspace(true);
    setStatus(action === 'create' ? 'Choosing a workspace folder...' : 'Opening a workspace...');

    try {
      const selectedWorkspace =
        action === 'create'
          ? await window.cloakweave.createWorkspace()
          : await window.cloakweave.openWorkspace();

      if (!selectedWorkspace) {
        setStatus(workspace ? `Active workspace: ${workspace.metadata.name}` : 'No workspace selected');
        return;
      }

      setWorkspace(selectedWorkspace);
      await refreshIndexedFiles(selectedWorkspace);
      setStatus(
        action === 'create'
          ? `Created workspace: ${selectedWorkspace.metadata.name}`
          : `Opened workspace: ${selectedWorkspace.metadata.name}`
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Unable to open the selected workspace.');
    } finally {
      setIsChoosingWorkspace(false);
    }
  }

  async function refreshIndexedFiles(selectedWorkspace = workspace) {
    if (!selectedWorkspace || !window.cloakweave?.listIndexedFiles) {
      setIndexedFiles([]);
      return;
    }

    setIndexedFiles(await window.cloakweave.listIndexedFiles(selectedWorkspace));
  }

  async function selectFilesForImport() {
    if (!workspace) {
      setStatus('Create or open a workspace before importing files.');
      return;
    }

    if (!window.cloakweave?.selectFilesForImport) {
      setStatus('Native file import is available in the Electron app.');
      return;
    }

    setIsIndexing(true);
    setIndexingProgress({
      stage: 'extracting',
      current: 0,
      total: 0,
      message: 'Choosing files...'
    });

    try {
      const result = await window.cloakweave.selectFilesForImport(workspace);
      await handleIndexResult(result);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Unable to import selected files.');
    } finally {
      setIsIndexing(false);
    }
  }

  async function indexDroppedFiles(event: DragEvent<HTMLElement>) {
    event.preventDefault();

    if (!workspace) {
      setStatus('Create or open a workspace before importing files.');
      return;
    }

    const filePaths = Array.from(event.dataTransfer.files)
      .map((file) => (file as FileWithPath).path)
      .filter((filePath): filePath is string => Boolean(filePath));

    if (filePaths.length === 0) {
      setStatus('No local file paths were found in the drop.');
      return;
    }

    setIsIndexing(true);

    try {
      const result = await window.cloakweave.indexDroppedFiles(workspace, filePaths);
      await handleIndexResult(result);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Unable to import dropped files.');
    } finally {
      setIsIndexing(false);
    }
  }

  async function handleIndexResult(result: IndexFilesResult | null) {
    if (!workspace) {
      return;
    }

    if (!result) {
      setIndexingProgress(null);
      setStatus(`Active workspace: ${workspace.metadata.name}`);
      return;
    }

    await refreshIndexedFiles(workspace);
    if (searchQuery.trim().length > 0) {
      await runSearch(searchQuery);
    }
    setStatus(`Indexed ${result.indexedCount} files, ${result.failedCount} failed.`);
  }

  async function runSearch(query = searchQuery) {
    const trimmedQuery = query.trim();

    if (!workspace) {
      setSearchError('Create or open a workspace before searching.');
      setSearchResults([]);
      return;
    }

    if (trimmedQuery.length === 0) {
      setSearchError(null);
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    setSearchError(null);

    try {
      const results = await window.cloakweave.searchChunks(workspace, trimmedQuery, 6);
      setSearchResults(results);
    } catch (error) {
      setSearchResults([]);
      setSearchError(error instanceof Error ? error.message : 'Unable to search indexed chunks.');
    } finally {
      setIsSearching(false);
    }
  }

  function getSearchEmptyState(): string {
    if (!workspace) {
      return 'Open a workspace and index files before searching.';
    }

    if (indexedFiles.filter((file) => file.status === 'indexed').length === 0) {
      return 'Index at least one supported file to search source snippets.';
    }

    return 'Type a query to search indexed chunks.';
  }

  async function checkOllama() {
    setIsCheckingOllama(true);

    try {
      setOllamaStatus((await window.cloakweave.checkOllama(ollamaEndpoint)) ? 'available' : 'unavailable');
    } finally {
      setIsCheckingOllama(false);
    }
  }

  const indexedReadyCount = indexedFiles.filter((file) => file.status === 'indexed').length;

  return (
    <div className="welcome-shell">
      <main className="welcome-panel" aria-labelledby="welcome-title">
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true">
            C
          </div>
          <span>Privacy Mode: Local</span>
        </div>

        <section className="hero-copy">
          <p className="eyebrow">Local-first desktop RAG</p>
          <h1 id="welcome-title">Cloakweave</h1>
          <p className="tagline">Build a private AI knowledge base from your own files.</p>
          <p className="privacy-note">
            Your documents, extracted text, and local index stay on this machine by default. Cloud
            model providers are optional and should only be enabled intentionally.
          </p>
        </section>

        <div className="welcome-actions" aria-label="Workspace actions">
          <button
            className="primary-button"
            disabled={isChoosingWorkspace}
            onClick={() => void chooseWorkspace('create')}
            type="button"
          >
            Create Workspace
          </button>
          <button
            className="secondary-button"
            disabled={isChoosingWorkspace}
            onClick={() => void chooseWorkspace('open')}
            type="button"
          >
            Open Workspace
          </button>
        </div>

        <section className="workspace-status" aria-live="polite" aria-label="Active workspace">
          <span className="status-label">Workspace</span>
          <strong>{workspace?.metadata.name ?? status}</strong>
          {workspace ? <span className="workspace-path">{workspace.root}</span> : null}
        </section>

        <section className="import-grid" aria-label="File indexing">
          <article
            className={`dropzone ${workspace ? '' : 'dropzone-disabled'}`}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => void indexDroppedFiles(event)}
          >
            <span className="preview-kicker">Import</span>
            <h2>Drop files to index</h2>
            <p>.txt, .md, .json, and .csv are supported. Unsupported files are recorded as failed.</p>
            <button
              className="secondary-button"
              disabled={!workspace || isIndexing}
              onClick={() => void selectFilesForImport()}
              type="button"
            >
              Select Files
            </button>
          </article>

          <article className="indexing-panel" aria-live="polite">
            <span className="preview-kicker">Progress</span>
            <h2>{isIndexing ? 'Indexing files' : 'Ready to index'}</h2>
            <p>{indexingProgress?.message ?? 'Create or open a workspace, then import files.'}</p>
            {indexingProgress ? (
              <progress
                max={Math.max(indexingProgress.total, 1)}
                value={indexingProgress.current}
              />
            ) : null}
          </article>
        </section>

        <section className="search-panel" aria-label="Semantic search">
          <div className="section-heading">
            <span className="preview-kicker">Search</span>
            <h2>Semantic source search</h2>
          </div>
          <form
            className="search-form"
            onSubmit={(event) => {
              event.preventDefault();
              void runSearch();
            }}
          >
            <input
              aria-label="Semantic search query"
              disabled={!workspace || isSearching}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search your indexed files"
              type="search"
              value={searchQuery}
            />
            <button className="primary-button" disabled={!workspace || isSearching} type="submit">
              {isSearching ? 'Searching' : 'Search'}
            </button>
          </form>
          {searchError ? <p className="error-state">{searchError}</p> : null}
          {!searchError && searchResults.length === 0 ? (
            <p className="empty-list">
              {searchQuery.trim().length > 0 && !isSearching ? 'No matching chunks found.' : getSearchEmptyState()}
            </p>
          ) : null}
          {searchResults.length > 0 ? (
            <div className="search-results">
              {searchResults.map((result, index) => (
                <article className="search-result" key={result.chunkId}>
                  <div className="result-heading">
                    <strong>
                      {index + 1}. {result.fileName}
                    </strong>
                    <span>{result.score.toFixed(3)}</span>
                  </div>
                  <p>{result.text}</p>
                </article>
              ))}
            </div>
          ) : null}
        </section>

        <section className="settings-panel" aria-label="Ollama settings">
          <div className="section-heading">
            <span className="preview-kicker">Settings</span>
            <h2>Ollama provider</h2>
          </div>
          <div className="settings-grid">
            <label>
              Endpoint
              <input
                onChange={(event) => setOllamaEndpoint(event.target.value)}
                type="url"
                value={ollamaEndpoint}
              />
            </label>
            <label>
              Model
              <input
                onChange={(event) => setOllamaModel(event.target.value)}
                type="text"
                value={ollamaModel}
              />
            </label>
          </div>
          <div className="settings-actions">
            <button
              className="secondary-button"
              disabled={isCheckingOllama}
              onClick={() => void checkOllama()}
              type="button"
            >
              {isCheckingOllama ? 'Checking' : 'Check Ollama'}
            </button>
            <span className={`provider-status ${ollamaStatus}`}>{ollamaStatus}</span>
          </div>
        </section>

        <ChatPanel
          workspace={workspace}
          indexedFileCount={indexedReadyCount}
          ollamaEndpoint={ollamaEndpoint}
          ollamaModel={ollamaModel}
        />

        <section className="indexed-list" aria-label="Indexed files">
          <div className="section-heading">
            <span className="preview-kicker">Files</span>
            <h2>Indexed file list</h2>
          </div>
          {indexedFiles.length === 0 ? (
            <p className="empty-list">No files indexed yet.</p>
          ) : (
            indexedFiles.map((file) => (
              <article className="indexed-file-row" key={file.id}>
                <div>
                  <strong>{file.fileName}</strong>
                  <span>{file.errorMessage ?? file.filePath}</span>
                </div>
                <div className="file-stats">
                  <span>{file.chunkCount} chunks</span>
                  <span className={`file-status ${file.status}`}>{file.status}</span>
                </div>
              </article>
            ))
          )}
        </section>
      </main>
    </div>
  );
}
