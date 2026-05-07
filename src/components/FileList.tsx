type IndexedFile = {
  name: string;
  status: string;
  chunks: number;
};

type FileListProps = {
  files: IndexedFile[];
};

export function FileList({ files }: FileListProps) {
  return (
    <section className="file-list" aria-label="Indexed files">
      {files.map((file) => (
        <article className="file-row" key={file.name}>
          <div>
            <div className="file-name">{file.name}</div>
            <div className="file-meta">{file.chunks} chunks indexed</div>
          </div>
          <span className="status-pill">{file.status}</span>
        </article>
      ))}
    </section>
  );
}
