/**
 * A structural Edit Journal command (protocol 181; Issue #1175, ADR 0096 §1), carried by `flushJournalEdit` beside the text it
 * leaves unchanged. `split` — `Enter` at the caret — splits the paragraph `blockId` at `fromGrapheme` (= `toGrapheme`), and the
 * text from the caret on becomes the new paragraph `newBlockId`, an identity the editor chose. `merge` — `Backspace` at a
 * paragraph's start — takes the paragraph `mergedBlockId`, the one right after `blockId`, into `blockId` at its end
 * (`fromGrapheme` = `toGrapheme` = its length). `insertText` is empty for both.
 */
export type JournalStructuralEdit =
  | { kind: 'split'; newBlockId: string }
  | { kind: 'merge'; mergedBlockId: string; mergedBlockDigest: string };

export interface JournalEditInput {
  clientEditId: string;
  manuscriptId: string;
  branchId: string;
  baseRevisionId: string;
  blockId: string;
  windowStartBlockId: string;
  baseBlockDigest: string;
  expectedJournalSequence: number;
  fromGrapheme: number;
  toGrapheme: number;
  insertText: string;
  structure?: JournalStructuralEdit;
}
