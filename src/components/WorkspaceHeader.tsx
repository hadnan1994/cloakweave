export function WorkspaceHeader() {
  return (
    <header className="workspace-header">
      <div>
        <h1>Private document workspace</h1>
        <p>Build a local index, search your files, and ask questions with citations.</p>
      </div>
      <div className="actions">
        <button className="primary-button">Create Workspace</button>
        <button className="secondary-button">Open Existing</button>
      </div>
    </header>
  );
}
