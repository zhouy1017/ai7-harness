import { researchUnavailableLine } from '../shared/research-status.js';
import { serviceWords } from './service-wording.js';
import { technicalWords } from './technical-layer.js';

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

/** Written for the editor: Chinese, with no English word or code in it (a product name such as AI7 is fine). */
function isEditorSentence(message: string): boolean {
  return /[㐀-鿿]/u.test(message) && !/[A-Za-z]{3,}|[A-Z0-9_]{4,}/u.test(message);
}

/** What developer mode keeps of an error: its code and its own words. */
function rawDetail(error: unknown): string | null {
  const data = rendererErrorData(error);
  if (data !== null) return data.message === '' ? data.code : `${data.code}: ${data.message}`;
  return error instanceof Error && error.message !== '' ? error.message : null;
}

/**
 * The one helper that chooses error words. A bridge error shows the service's own sentence; a renderer `Error` shows its
 * message only when that is a sentence written for the editor, otherwise the caller's Chinese fallback — never a code or an
 * English message in ordinary mode. Developer mode keeps the raw detail after the fallback, in the technical layer.
 */
export function rendererErrorMessage(error: unknown, fallback: string): string {
  const data = rendererErrorData(error);
  // The service's message reads in the table's words in ordinary mode (Issue #1531); its code is untouched.
  if (data !== null && data.message !== '') return researchUnavailableLine(data.code, serviceWords(data.message));
  if (data === null && error instanceof Error && isEditorSentence(error.message)) return error.message;
  const raw = rawDetail(error);
  return raw === null ? fallback : `${fallback}${technicalWords(`（${raw}）`)}`;
}
