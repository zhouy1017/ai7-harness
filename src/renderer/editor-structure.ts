import type { JournalEditInput } from '../shared/protocol.js';

/**
 * Enter and Backspace at a paragraph's edge in the bounded window (Issue #1175; ADR 0096 §1). The editor splits or merges the
 * paragraph in its own document at once and keeps a Pending Structure until the journal acknowledges it, so typing goes on
 * without a round trip to wait for. One stands at a time. Before its structural command is sent, the paragraphs it touches are
 * written to exactly the text they held when the key was pressed, and so is the block a split pushes out of a full window, which
 * leaves the document with the split so the window never holds more than its bound.
 */
export type PendingStructure =
  | {
      readonly kind: 'split';
      readonly blockId: string;
      readonly newBlockId: string;
      readonly at: number;
      readonly preText: string;
      readonly windowStartBlockId: string;
      /** The block a split in a full window pushes past its edge: it leaves the window at once, its text still to be written. */
      readonly held: { readonly blockId: string; readonly text: string } | null;
    }
  | {
      readonly kind: 'merge';
      readonly blockId: string;
      readonly mergedBlockId: string;
      readonly preText: string;
      readonly mergedPreText: string;
      readonly windowStartBlockId: string;
      readonly held: null;
    };

/** A paragraph identity the editor chooses for the text a split moves; the service refuses one already used. */
export function newParagraphIdentity(): string {
  return `blk_${Array.from(crypto.getRandomValues(new Uint8Array(12)), (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

/** Which key this is, if it is Enter or Backspace pressed alone: no modifier, and no input method composing. */
export function structuralKey(event: KeyboardEvent, composing: boolean): 'Enter' | 'Backspace' | null {
  if (composing || event.isComposing || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return null;
  return event.key === 'Enter' || event.key === 'Backspace' ? event.key : null;
}

/** The pending structure's own command, once its paragraphs hold its texts durably. */
export function structuralInput(
  pending: PendingStructure,
  base: Pick<JournalEditInput, 'manuscriptId' | 'branchId' | 'baseRevisionId' | 'expectedJournalSequence'>,
  digests: { readonly block: string; readonly merged?: string },
  graphemeCount: (text: string) => number,
): JournalEditInput {
  const at = pending.kind === 'split' ? pending.at : graphemeCount(pending.preText);
  return {
    clientEditId: crypto.randomUUID(),
    ...base,
    blockId: pending.blockId,
    windowStartBlockId: pending.windowStartBlockId,
    baseBlockDigest: digests.block,
    fromGrapheme: at,
    toGrapheme: at,
    insertText: '',
    structure: pending.kind === 'split'
      ? { kind: 'split', newBlockId: pending.newBlockId }
      : { kind: 'merge', mergedBlockId: pending.mergedBlockId, mergedBlockDigest: digests.merged! },
  };
}
