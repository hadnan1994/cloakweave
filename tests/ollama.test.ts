import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  checkOllamaAvailable,
  DEFAULT_OLLAMA_ENDPOINT,
  DEFAULT_OLLAMA_MODEL,
  generateWithOllama
} from '@/lib/ollama';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ollama', () => {
  it('checks the default Ollama endpoint', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true
    } as Response);

    await expect(checkOllamaAvailable()).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(new URL('/api/tags', DEFAULT_OLLAMA_ENDPOINT));
  });

  it('returns false when Ollama is unavailable', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));

    await expect(checkOllamaAvailable()).resolves.toBe(false);
  });

  it('generates with the default model suggestion when no model is provided', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ response: 'Answer with citations.' })
    } as Response);

    await expect(generateWithOllama({ prompt: 'Use context.' })).resolves.toBe('Answer with citations.');
    expect(fetchMock).toHaveBeenCalledWith(
      new URL('/api/generate', DEFAULT_OLLAMA_ENDPOINT),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          model: DEFAULT_OLLAMA_MODEL,
          prompt: 'Use context.',
          stream: false
        })
      })
    );
  });

  it('throws a clear error for failed generation requests', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 404
    } as Response);

    await expect(generateWithOllama({ prompt: 'Use context.' })).rejects.toThrow(
      'Ollama request failed with status 404'
    );
  });
});
