type CitationCardProps = {
  fileName: string;
  text: string;
};

export function CitationCard({ fileName, text }: CitationCardProps) {
  return (
    <article className="panel citation" aria-label={`Citation from ${fileName}`}>
      <h2>{fileName}</h2>
      <p>{text}</p>
    </article>
  );
}
