import { cosineSimilarity, createLocalBaselineEmbeddingProvider } from './embeddings';
import {
  checkOllamaAvailable,
  generateWithOllama,
  DEFAULT_OLLAMA_ENDPOINT,
  DEFAULT_OLLAMA_MODEL
} from './ollama';
import { listChunkEmbeddings } from './sqlite';
import type { EmbeddingProvider } from './embeddings';

export type RetrievedChunk = {
  chunkId: string;
  fileId: string;
  fileName: string;
  text: string;
  score: number;
  startChar: number;
  endChar: number;
};

export type RagAnswerResult = {
  mode: 'ollama' | 'retrieval-only';
  question: string;
  answer: string | null;
  citations: RetrievedChunk[];
  provider: {
    name: 'ollama';
    endpoint: string;
    model: string;
    available: boolean;
    error?: string;
  };
};

export async function retrieveRelevantChunks(input: {
  databasePath: string;
  workspaceId: string;
  question: string;
  topK?: number;
  embeddingProvider?: EmbeddingProvider;
}): Promise<RetrievedChunk[]> {
  const question = input.question.trim();
  const topK = input.topK ?? 5;

  if (question.length === 0 || topK <= 0) {
    return [];
  }

  const embeddingProvider = input.embeddingProvider ?? createLocalBaselineEmbeddingProvider();
  const [queryEmbedding, chunks] = await Promise.all([
    embeddingProvider.embed(question),
    listChunkEmbeddings(input.databasePath, input.workspaceId)
  ]);

  return chunks
    .map((chunk) => ({
      chunkId: chunk.id,
      fileId: chunk.fileId,
      fileName: chunk.fileName,
      text: chunk.text,
      startChar: chunk.startChar,
      endChar: chunk.endChar,
      score: cosineSimilarity(queryEmbedding, chunk.embedding)
    }))
    .sort((left, right) => right.score - left.score || left.fileName.localeCompare(right.fileName))
    .slice(0, topK);
}

export async function answerQuestionWithRag(input: {
  databasePath: string;
  workspaceId: string;
  question: string;
  topK?: number;
  ollamaEndpoint?: string;
  ollamaModel?: string;
  embeddingProvider?: EmbeddingProvider;
}): Promise<RagAnswerResult> {
  const endpoint = input.ollamaEndpoint?.trim() || DEFAULT_OLLAMA_ENDPOINT;
  const model = input.ollamaModel?.trim() || DEFAULT_OLLAMA_MODEL;
  const citations = await retrieveRelevantChunks({
    databasePath: input.databasePath,
    workspaceId: input.workspaceId,
    question: input.question,
    topK: input.topK,
    embeddingProvider: input.embeddingProvider
  });
  const available = await checkOllamaAvailable(endpoint);

  if (!available || citations.length === 0) {
    return {
      mode: 'retrieval-only',
      question: input.question,
      answer: null,
      citations,
      provider: {
        name: 'ollama',
        endpoint,
        model,
        available
      }
    };
  }

  try {
    const prompt = await buildAnswerPrompt({
      question: input.question,
      chunks: citations
    });

    return {
      mode: 'ollama',
      question: input.question,
      answer: await generateWithOllama({
        endpoint,
        model,
        prompt
      }),
      citations,
      provider: {
        name: 'ollama',
        endpoint,
        model,
        available
      }
    };
  } catch (error) {
    return {
      mode: 'retrieval-only',
      question: input.question,
      answer: null,
      citations,
      provider: {
        name: 'ollama',
        endpoint,
        model,
        available,
        error: error instanceof Error ? error.message : 'Ollama answer generation failed'
      }
    };
  }
}

export async function buildAnswerPrompt(input: {
  question: string;
  chunks: RetrievedChunk[];
}): Promise<string> {
  const context = input.chunks
    .map((chunk, index) => {
      return `[${index + 1}] Source: ${chunk.fileName}\n${chunk.text}`;
    })
    .join('\n\n');

  return [
    'You are Cloakweave, a local-first document assistant.',
    'Answer only from the retrieved context below.',
    'Do not use outside knowledge or make unsupported claims.',
    'Cite sources by file name in the answer.',
    'If the answer is not found in the context, say that the indexed documents do not contain enough information.',
    '',
    `Question: ${input.question}`,
    '',
    `Retrieved context:\n${context || 'No context retrieved.'}`
  ].join('\n');
}
