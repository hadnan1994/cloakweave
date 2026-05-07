export function EmptyState() {
  return (
    <section className="empty-state">
      <h2>Welcome to Cloakweave</h2>
      <p>Your files stay local by default. Create or open a workspace to start indexing private documents.</p>
      <div className="actions">
        <button className="primary-button">Create Workspace</button>
        <button className="secondary-button">Open Existing Workspace</button>
      </div>
    </section>
  );
}
