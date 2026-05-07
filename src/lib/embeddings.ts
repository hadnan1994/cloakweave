export type EmbeddingVector = number[];

export interface EmbeddingProvider {
  name: string;
  dimensions: number;
  embed(text: string): Promise<EmbeddingVector>;
  embedBatch(texts: string[]): Promise<EmbeddingVector[]>;
}

export const DEFAULT_EMBEDDING_DIMENSIONS = 128;

export function createLocalBaselineEmbeddingProvider(
  dimensions = DEFAULT_EMBEDDING_DIMENSIONS
): EmbeddingProvider {
  if (!Number.isInteger(dimensions) || dimensions <= 0) {
    throw new Error('Embedding dimensions must be a positive integer');
  }

  return {
    name: 'local-hash-baseline',
    dimensions,
    embed: async (text: string) => hashEmbed(text, dimensions),
    embedBatch: async (texts: string[]) => texts.map((text) => hashEmbed(text, dimensions))
  };
}

export const createHashEmbeddingProvider = createLocalBaselineEmbeddingProvider;

export function cosineSimilarity(a: EmbeddingVector, b: EmbeddingVector): number {
  if (a.length !== b.length) {
    throw new Error('Embedding vectors must have the same dimensions');
  }

  let dot = 0;
  let aMagnitude = 0;
  let bMagnitude = 0;

  for (let index = 0; index < a.length; index += 1) {
    dot += a[index] * b[index];
    aMagnitude += a[index] ** 2;
    bMagnitude += b[index] ** 2;
  }

  if (aMagnitude === 0 || bMagnitude === 0) {
    return 0;
  }

  return dot / (Math.sqrt(aMagnitude) * Math.sqrt(bMagnitude));
}

function hashEmbed(text: string, dimensions: number): EmbeddingVector {
  const vector = Array.from({ length: dimensions }, () => 0);
  const tokens = tokenize(text);

  for (const token of tokens) {
    vector[hashToIndex(token, dimensions)] += 1;
  }

  for (let index = 0; index < tokens.length - 1; index += 1) {
    vector[hashToIndex(`${tokens[index]} ${tokens[index + 1]}`, dimensions)] += 0.5;
  }

  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value ** 2, 0));
  return magnitude === 0 ? vector : vector.map((value) => value / magnitude);
}

function tokenize(text: string): string[] {
  return text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
}

function hashToIndex(value: string, dimensions: number): number {
  return Math.abs(hashToken(value)) % dimensions;
}

function hashToken(token: string): number {
  let hash = 0;

  for (let index = 0; index < token.length; index += 1) {
    hash = (hash << 5) - hash + token.charCodeAt(index);
    hash |= 0;
  }

  return hash;
}
