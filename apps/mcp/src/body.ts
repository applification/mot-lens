export class BodyTooLarge extends Error {
  constructor() { super('Body exceeds the byte limit'); }
}

// The same boundary owns both incoming MCP and upstream JSON allocation limits.
// Count bytes before retaining chunks, including when Content-Length is absent.
export async function readBoundedBody(message: Request | Response, limit: number): Promise<Uint8Array<ArrayBuffer>> {
  if (Number(message.headers.get('content-length')) > limit) {
    await message.body?.cancel().catch(() => {}); throw new BodyTooLarge();
  }
  const reader = message.body?.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  if (reader) {
    try {
      while (true) {
        const chunk = await reader.read(); if (chunk.done) break;
        size += chunk.value.byteLength;
        if (size > limit) { await reader.cancel().catch(() => {}); throw new BodyTooLarge(); }
        chunks.push(chunk.value);
      }
    } finally { reader.releaseLock(); }
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}
