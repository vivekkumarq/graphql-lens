/** getContent() hands back text, or base64 for binary-ish bodies; decode as UTF-8 without throwing on bad bytes. */
export function decodeBody(content: string | null | undefined, encoding?: string | null): string {
  if (!content) return '';
  if (encoding !== 'base64') return content;
  try {
    const bin = atob(content);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder('utf-8').decode(bytes); // invalid sequences become U+FFFD
  } catch {
    return content;
  }
}

export function truncateBody(body: string, maxBytes: number): { body: string; truncated: boolean } {
  // string length approximates bytes; exact enough for a memory guard
  return body.length > maxBytes
    ? { body: body.slice(0, maxBytes), truncated: true }
    : { body, truncated: false };
}
