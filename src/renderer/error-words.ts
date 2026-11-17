import { researchUnavailableLine } from '../shared/research-status.js';

interface RendererErrorData {
  readonly code: string;
  readonly message: string;
}

/** A bridge error arrives as a plain `{ code, message }` object, never as an `Error`. */
export function rendererErrorData(error: unknown): RendererErrorData | null {
  if (typeof error !== 'object' || error === null) return null;
  const candidate = error as { code?: unknown; message?: unknown };
  return typeof candidate.code === 'string' && typeof candidate.message === 'string'
    ? { code: candidate.code, message: candidate.message }
    : null;
}

export function hasErrorCode(error: unknown, code: string): boolean {
  return rendererErrorData(error)?.code === code;
}

export function rendererErrorCode(error: unknown): string | null {
  return rendererErrorData(error)?.code ?? null;
}

const CHINESE = /[㐀-鿿]/u;

/**
 * The one helper that chooses error words. A bridge error shows the service's own sentence; a renderer `Error` shows its
 * message only when that is a sentence written for the editor (it has Chinese in it), otherwise the caller's Chinese
 * fallback — never a code or an English message.
 */
export function rendererErrorMessage(error: unknown, fallback: string): string {
  const data = rendererErrorData(error);
  if (data !== null) return researchUnavailableLine(data.code, data.message);
  return error instanceof Error && CHINESE.test(error.message) ? error.message : fallback;
}
