export const DEFAULT_OLLAMA_ENDPOINT = 'http://localhost:11434';
export const DEFAULT_OLLAMA_MODEL = 'llama3.1';

export async function checkOllamaAvailable(endpoint = DEFAULT_OLLAMA_ENDPOINT): Promise<boolean> {
  try {
    const response = await fetch(buildOllamaUrl(endpoint, '/api/tags'));
    return response.ok;
  } catch {
    return false;
  }
}

export async function generateWithOllama(input: {
  endpoint?: string;
  model?: string;
  prompt: string;
}): Promise<string> {
  const endpoint = input.endpoint?.trim() || DEFAULT_OLLAMA_ENDPOINT;
  const model = input.model?.trim() || DEFAULT_OLLAMA_MODEL;
  const response = await fetch(buildOllamaUrl(endpoint, '/api/generate'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      prompt: input.prompt,
      stream: false
    })
  });

  if (!response.ok) {
    throw new Error(`Ollama request failed with status ${response.status}`);
  }

  const data = (await response.json()) as { response?: string };
  return data.response ?? '';
}

function buildOllamaUrl(endpoint: string, pathname: string): URL {
  const baseUrl = new URL(endpoint.trim() || DEFAULT_OLLAMA_ENDPOINT);
  baseUrl.pathname = pathname;
  baseUrl.search = '';
  baseUrl.hash = '';
  return baseUrl;
}
