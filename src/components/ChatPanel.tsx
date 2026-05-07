import { useState } from 'react';
import type { RagAnswerResult } from '@/lib/rag';
import type { WorkspaceInfo } from '@/lib/workspace';

type ChatPanelProps = {
  workspace: WorkspaceInfo | null;
  indexedFileCount: number;
  ollamaEndpoint: string;
  ollamaModel: string;
};

export function ChatPanel({
  workspace,
  indexedFileCount,
  ollamaEndpoint,
  ollamaModel
}: ChatPanelProps) {
  const [question, setQuestion] = useState('');
  const [result, setResult] = useState<RagAnswerResult | null>(null);
  const [isAsking, setIsAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasAsked, setHasAsked] = useState(false);

  async function askQuestion() {
    const trimmedQuestion = question.trim();

    if (!workspace) {
      setError('Create or open a workspace before asking questions.');
      setResult(null);
      return;
    }

    if (indexedFileCount === 0) {
      setError('Index at least one supported file before asking questions.');
      setResult(null);
      return;
    }

    if (trimmedQuestion.length === 0) {
      setError(null);
      setResult(null);
      setHasAsked(false);
      return;
    }

    setIsAsking(true);
    setError(null);
    setHasAsked(true);

    try {
      setResult(
        await window.cloakweave.askQuestion(workspace, trimmedQuestion, {
          endpoint: ollamaEndpoint,
          model: ollamaModel,
          topK: 5
        })
      );
    } catch (requestError) {
      setResult(null);
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Unable to retrieve context for this question.'
      );
    } finally {
      setIsAsking(false);
    }
  }

  return (
    <section className="chat-panel" aria-label="Document chat">
      <div className="section-heading">
        <span className="preview-kicker">Chat</span>
        <h2>Ask your documents</h2>
      </div>
      <p className="retrieval-note">
        Cloakweave will use Ollama when it is available. If not, it falls back to retrieval-only
        mode and shows the most relevant local source snippets.
      </p>
      <form
        className="chat-form"
        onSubmit={(event) => {
          event.preventDefault();
          void askQuestion();
        }}
      >
        <textarea
          aria-label="Question"
          disabled={!workspace || isAsking}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="Ask a question about your indexed files"
          rows={3}
          value={question}
        />
        <button className="primary-button" disabled={!workspace || isAsking} type="submit">
          {isAsking ? 'Retrieving' : 'Ask'}
        </button>
      </form>
      {error ? <p className="error-state">{error}</p> : null}
      {result?.provider.error ? <p className="error-state">{result.provider.error}</p> : null}
      {result ? (
        <section className="answer-output" aria-label="Answer output">
          <div className="result-heading">
            <strong>{result.mode === 'ollama' ? 'Ollama answer' : 'Retrieval-only results'}</strong>
            <span>{result.provider.available ? result.provider.model : 'No Ollama'}</span>
          </div>
          {result.answer ? (
            <p className="answer-text">{result.answer}</p>
          ) : (
            <p className="retrieval-note">
              Ollama is not available at {result.provider.endpoint}. Showing retrieved context only.
            </p>
          )}
        </section>
      ) : null}
      {!error && !result ? (
        <p className="empty-list">
          {hasAsked && !isAsking
            ? 'No relevant source snippets were found for that question.'
            : 'Ask a question to retrieve the most relevant local snippets.'}
        </p>
      ) : null}
      {result && result.citations.length > 0 ? (
        <div className="search-results">
          {result.citations.map((citation, index) => (
            <article className="citation-card" key={citation.chunkId}>
              <div className="result-heading">
                <strong>
                  {index + 1}. {citation.fileName}
                </strong>
                <span>{citation.score.toFixed(3)}</span>
              </div>
              <p>{citation.text}</p>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}
