const navItems = ['Workspace', 'Import', 'Search', 'Chat', 'Settings'];

export function Sidebar() {
  return (
    <aside className="sidebar" aria-label="Main navigation">
      <div className="brand">
        <div className="brand-mark" aria-hidden="true">
          C
        </div>
        <div>
          <p className="brand-title">Cloakweave</p>
          <p className="brand-subtitle">Local-first RAG</p>
        </div>
      </div>
      <nav className="nav-list">
        {navItems.map((item, index) => (
          <button className={`nav-button ${index === 0 ? 'active' : ''}`} key={item}>
            {item}
          </button>
        ))}
      </nav>
      <div className="privacy-badge">Privacy Mode: Local</div>
    </aside>
  );
}
