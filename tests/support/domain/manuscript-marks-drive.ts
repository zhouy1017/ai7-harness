import { randomUUID } from 'node:crypto';
import * as marks from '../../../src/service/editorial-mark-operations.js';
import * as manuscript from '../../../src/service/manuscript/operations.js';
import { graphemesOf } from '../../../src/shared/mark-anchor.js';
import type { ManuscriptWindowProjection } from '../../../src/shared/protocol.js';
import type { ManuscriptMarksBook } from './manuscript-marks.js';

export { marks, manuscript };

export interface Imported { manuscriptId: string; branchId: string }

export const imported = (book: ManuscriptMarksBook): Imported => ({ manuscriptId: book.manuscriptId, branchId: book.branchId });

/** The window from the start, through the production window operation. */
export function windowOf(book: ManuscriptMarksBook): ManuscriptWindowProjection {
  return manuscript.getManuscriptWindow(book.manuscriptHost, book.manuscriptId, book.branchId, null);
}

/** The paragraphs of at least 40 graphemes in the first window. */
export function paragraphs(window: ManuscriptWindowProjection): ManuscriptWindowProjection['blocks'] {
  const found = window.blocks.filter((block) => block.kind === 'paragraph' && graphemesOf(block.text).length >= 40);
  if (found.length < 2) throw new Error('the sample1 window holds fewer than two paragraphs of 40 graphemes');
  return found;
}

export function blockText(book: ManuscriptMarksBook, blockId: string): string {
  return windowOf(book).blocks.find((block) => block.blockId === blockId)!.text;
}

export function binding(book: ManuscriptMarksBook): Imported & { windowStartBlockId: string } {
  return { ...imported(book), windowStartBlockId: windowOf(book).blocks[0]!.blockId };
}

/** The editor's own typing: one journal edit of one block, against the window as it stands now. */
export function typeInto(book: ManuscriptMarksBook, blockId: string, from: number, to: number, insertText: string): ManuscriptWindowProjection {
  const now = windowOf(book);
  return manuscript.flushJournalEdit(book.manuscriptHost, {
    clientEditId: randomUUID(), ...imported(book), baseRevisionId: now.revisionId, blockId, windowStartBlockId: now.blocks[0]!.blockId,
    baseBlockDigest: now.blocks.find((candidate) => candidate.blockId === blockId)!.digest, expectedJournalSequence: now.journalSequence,
    fromGrapheme: from, toGrapheme: to, insertText,
  }).window;
}

/** A Change Suggestion on exact text of the window as it stands now. */
export function suggest(book: ManuscriptMarksBook, blockId: string, from: number, to: number, proposedText: string): { markId: string; pinned: string } {
  const window = windowOf(book);
  const block = window.blocks.find((candidate) => candidate.blockId === blockId)!;
  const made = marks.createEditorialMark(book.marksHost, {
    ...imported(book), windowStartBlockId: window.blocks[0]!.blockId, clientMarkId: randomUUID(), baseRevisionId: window.revisionId,
    expectedJournalSequence: window.journalSequence, blockId, baseBlockDigest: block.digest, fromGrapheme: from, toGrapheme: to,
    selectedText: graphemesOf(block.text).slice(from, to).join(''), kind: 'change-suggestion', highlightColor: null, body: '',
    proposedText, rationale: null,
  });
  return { markId: made.markId, pinned: made.card!.pinnedText };
}

/**
 * The refusal code an operation throws. The store's wrappers map an owner's refusal to `StoreError` with the same code;
 * here the wrappers are pass-through, so the code is read from whichever owner refused.
 */
export function refusal(operation: () => unknown): string {
  try {
    operation();
  } catch (error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === 'string') return code;
    throw error;
  }
  return 'no-error';
}

type HostBound<M, H> = {
  [K in keyof M as M[K] extends (host: H, ...rest: never[]) => unknown ? K : never]:
    M[K] extends (host: H, ...rest: infer A) => infer R ? (...rest: A) => R : never
};

/**
 * The domain's operations under the store's own member names, each the real exported function with its Host bound first:
 * partial application only — no store method is re-implemented here. `imported` names the Book, `close` ends the case.
 */
export function domainOf(book: ManuscriptMarksBook) {
  const bind = <M extends object, H>(module: M, host: H): HostBound<M, H> => Object.fromEntries(Object.entries(module)
    .filter(([, value]) => typeof value === 'function')
    .map(([name, operation]) => [name, (...rest: unknown[]) => (operation as (host: H, ...args: unknown[]) => unknown)(host, ...rest)])) as HostBound<M, H>;
  return {
    ...bind(marks, book.marksHost),
    ...bind(manuscript, book.manuscriptHost),
    imported: imported(book),
    db: book.db,
    close: () => book.db.close(),
  };
}
