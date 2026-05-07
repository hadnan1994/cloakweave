import { describe, expect, it } from 'vitest';
import {
  cosineSimilarity,
  createHashEmbeddingProvider,
  createLocalBaselineEmbeddingProvider
} from '@/lib/embeddings';

describe('embeddings', () => {
  it('computes cosine similarity', () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBe(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBe(0);
    expect(cosineSimilarity([0, 0], [1, 0])).toBe(0);
    expect(() => cosineSimilarity([1], [1, 0])).toThrow('same dimensions');
  });

  it('generates deterministic local baseline embeddings', async () => {
    const provider = createLocalBaselineEmbeddingProvider(16);
    const first = await provider.embed('Private local documents');
    const second = await provider.embed('Private local documents');

    expect(provider).toMatchObject({
      name: 'local-hash-baseline',
      dimensions: 16
    });
    expect(first).toEqual(second);
    expect(first).toHaveLength(16);
  });

  it('embeds batches in the same order as individual calls', async () => {
    const provider = createHashEmbeddingProvider(32);
    const texts = ['private documents', 'cloud upload disabled'];

    await expect(provider.embedBatch(texts)).resolves.toEqual([
      await provider.embed(texts[0]),
      await provider.embed(texts[1])
    ]);
  });

  it('gives related text higher similarity than unrelated text', async () => {
    const provider = createLocalBaselineEmbeddingProvider(128);
    const query = await provider.embed('private local document search');
    const related = await provider.embed('search private documents locally');
    const unrelated = await provider.embed('window toolbar color settings');

    expect(cosineSimilarity(query, related)).toBeGreaterThan(cosineSimilarity(query, unrelated));
  });

  it('rejects invalid embedding dimensions', () => {
    expect(() => createLocalBaselineEmbeddingProvider(0)).toThrow('positive integer');
    expect(() => createLocalBaselineEmbeddingProvider(1.5)).toThrow('positive integer');
  });
});
