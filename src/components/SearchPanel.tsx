export function SearchPanel() {
  return (
    <section className="panel" aria-label="Semantic search">
      <h2>Semantic search</h2>
      <p>Search locally indexed snippets without sending documents to a cloud service.</p>
      <input className="search-input" placeholder="Search your files" aria-label="Search query" />
    </section>
  );
}
