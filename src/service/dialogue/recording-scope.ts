import { canonicalJson, sha256Hex } from '../analysis/canonical.js';
import { parseDialogueMessage } from './contract.js';

export const RECORDING_GLOBAL_QUESTION = '请检查公开样书的章节结构。';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;

/** The one scoped recording form. Preserve the question and scope structure while numbering import identities. */
export function scopedDialogueRecordingKey(message: string, contract: string) {
  const parsed = parseDialogueMessage(message);
  const scope = parsed?.globalScope;
  const book = scope?.books[0];
  if (parsed?.kind !== 'ask' || parsed.question !== RECORDING_GLOBAL_QUESTION || parsed.kept !== null || parsed.globalSources?.length !== 0 ||
      scope?.books.length !== 1 || scope.procedures.length !== 0 || book?.title !== 'sample1' ||
      Object.keys(scope).sort().join(',') !== 'books,procedures' ||
      Object.keys(book).sort().join(',') !== 'bookId,manuscriptId,revisionId,title') return null;
  const identities = [book.bookId, book.manuscriptId, book.revisionId];
  if (identities.some(id => !UUID.test(id)) || new Set(identities).size !== identities.length) return null;
  const normalized = { ...parsed, globalScope: { ...scope, books: [{ ...book,
    bookId: '{{tool-id:1}}', manuscriptId: '{{tool-id:2}}', revisionId: '{{tool-id:3}}' }] } };
  return { digest: sha256Hex(canonicalJson({ contract, message: normalized })), identities, book, question: parsed.question };
}
