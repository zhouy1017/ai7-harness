/**
 * The HTTP seam both platform tools share (Issue #473, S87-f3a): the structural `fetch` they are handed — the native
 * `fetch` the service captured before installing network denial, or a stub in every test — a deadline, and a body read
 * that stops at a byte cap instead of buffering whatever a server sends. No dependency is added for any of it.
 */
export interface PlatformToolHttpResponse {
  readonly status: number;
  readonly headers: { get(name: string): string | null };
  readonly body: ReadableStream<Uint8Array> | null;
}

export interface PlatformToolHttpInit {
  readonly method: 'GET' | 'POST';
  readonly headers: Record<string, string>;
  readonly body?: string;
  readonly signal: AbortSignal;
  /** A redirect is never followed: the next host would need a ticket of its own. */
  readonly redirect: 'manual';
}

export type PlatformToolFetch = (url: string, init: PlatformToolHttpInit) => Promise<PlatformToolHttpResponse>;

export class PlatformToolHttpError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'PlatformToolHttpError';
  }
}

/** An abort signal that fires at the deadline or when the caller's signal does, and the disposer that clears the timer. */
export function deadlineSignal(timeoutMs: number, caller?: AbortSignal): { signal: AbortSignal; dispose: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new PlatformToolHttpError('PLATFORM_TOOL_TIMEOUT', '平台工具请求超时。')), timeoutMs);
  const onAbort = (): void => controller.abort(caller?.reason);
  if (caller !== undefined) {
    if (caller.aborted) controller.abort(caller.reason);
    else caller.addEventListener('abort', onAbort, { once: true });
  }
  return {
    signal: controller.signal,
    dispose: () => {
      clearTimeout(timer);
      caller?.removeEventListener('abort', onAbort);
    },
  };
}

/**
 * Read a response body up to `maxBytes`. A body that would exceed the cap is cancelled the moment it does, and the read
 * refuses with `PLATFORM_TOOL_BODY_TOO_LARGE`; nothing past the cap is ever held.
 */
export async function readBoundedBody(response: PlatformToolHttpResponse, maxBytes: number): Promise<Uint8Array> {
  if (response.body === null) return new Uint8Array(0);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new PlatformToolHttpError('PLATFORM_TOOL_BODY_TOO_LARGE', '响应超过平台工具的字节上限。');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}
