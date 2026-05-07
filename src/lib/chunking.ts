export type TextChunk = {
  id: string;
  fileId: string;
  fileName: string;
  text: string;
  startChar: number;
  endChar: number;
  metadata?: Record<string, unknown>;
};

export function chunkText(input: {
  fileId: string;
  fileName: string;
  text: string;
  chunkSize?: number;
  overlap?: number;
}): TextChunk[] {
  const chunkSize = input.chunkSize ?? 900;
  const overlap = input.overlap ?? 150;

  if (chunkSize <= 0) {
    throw new Error('chunkSize must be greater than 0');
  }

  if (overlap < 0 || overlap >= chunkSize) {
    throw new Error('overlap must be greater than or equal to 0 and less than chunkSize');
  }

  const sourceText = input.text;
  const chunks: TextChunk[] = [];
  let startChar = 0;

  while (startChar < sourceText.length) {
    const endChar = Math.min(startChar + chunkSize, sourceText.length);
    const text = sourceText.slice(startChar, endChar);

    if (text.trim().length > 0) {
      chunks.push({
        id: `${input.fileId}:${chunks.length}`,
        fileId: input.fileId,
        fileName: input.fileName,
        text,
        startChar,
        endChar,
        metadata: {
          fileName: input.fileName
        }
      });
    }

    if (endChar === sourceText.length) {
      break;
    }

    startChar = endChar - overlap;
  }

  return chunks;
}
