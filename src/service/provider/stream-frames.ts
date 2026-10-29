import type { DeepSeekTransportResponse } from './deepseek-adapter.js';

/**
 * The server-sent-events wire every streaming protocol family shares (Issue #833, generalized by Issue #1180): UTF-8 and
 * event boundaries may fall anywhere in a network chunk, a frame is its `event:` name and its joined `data:` lines, and
 * nothing here knows what a frame means. Each family's reader decides when a stream is whole; an unreadable wire, an
 * oversized pending frame or a reader that fails is outcome-unknown, and an abort stays an abort.
 */
export interface SseFrame {
  readonly event: string | null;
  readonly data: string;
}

/** One pending, unterminated frame larger than this is not a stream AI7 reads. */
const MAX_PENDING_CHARACTERS = 1024 * 1024;

/** Any failure inside a family's reader, as the adapter must see it: an abort, or a result that cannot be known. */
export function streamFailure(error: unknown): Error {
  return error instanceof Error && error.name === 'AbortError' ? error : new Error('AI7_OUTCOME_UNKNOWN');
}

function frameOf(raw: string): SseFrame | null {
  let event: string | null = null;
  const data: string[] = [];
  for (const line of raw.split(/\r?\n/u)) {
    if (line.startsWith('event:')) event = line.slice(6).trim();
    else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /u, ''));
  }
  return data.length === 0 ? null : { event, data: data.join('\n') };
}

/**
 * The frames of one `text/event-stream` response, in order, ending at the end of the body. A consumer that has read its
 * whole response stops early, and the reader is cancelled either way.
 */
export async function* sseFrames(response: DeepSeekTransportResponse): AsyncGenerator<SseFrame> {
  if (response.body == null || !response.headers?.get('content-type')?.toLowerCase().startsWith('text/event-stream')) {
    throw new Error('AI7_OUTCOME_UNKNOWN');
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let pending = '';
  try {
    for (;;) {
      const chunk = await reader.read();
      pending += chunk.done ? decoder.decode() : decoder.decode(chunk.value, { stream: true });
      if (pending.length > MAX_PENDING_CHARACTERS) throw new Error('AI7_OUTCOME_UNKNOWN');
      let boundary: RegExpExecArray | null;
      while ((boundary = /\r?\n\r?\n/u.exec(pending)) !== null) {
        const frame = frameOf(pending.slice(0, boundary.index));
        pending = pending.slice(boundary.index + boundary[0].length);
        if (frame !== null) yield frame;
      }
      if (chunk.done) {
        if (pending.trim().length > 0) throw new Error('AI7_OUTCOME_UNKNOWN');
        return;
      }
    }
  } catch (error) {
    throw streamFailure(error);
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
