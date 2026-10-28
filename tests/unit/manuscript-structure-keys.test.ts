import { describe, expect, it } from 'vitest';
import { newParagraphIdentity, structuralInput, structuralKey } from '../../src/renderer/editor-structure.js';

// The editor's Enter split and Backspace merge (Issue #1175; ADR 0096 §1): which key presses are structural, and the journal
// command a pending structure becomes once its paragraphs hold their texts.

const key = (init: KeyboardEventInit & { key: string }): KeyboardEvent => ({
  key: init.key, isComposing: init.isComposing ?? false, ctrlKey: init.ctrlKey ?? false, metaKey: init.metaKey ?? false,
  altKey: init.altKey ?? false, shiftKey: init.shiftKey ?? false,
}) as KeyboardEvent;
const base = { manuscriptId: crypto.randomUUID(), branchId: crypto.randomUUID(), baseRevisionId: crypto.randomUUID(), expectedJournalSequence: 7 };

describe('Enter and Backspace in the manuscript', () => {
  it('are structural alone, never with a modifier or while an input method composes', () => {
    expect([key({ key: 'Enter' }), key({ key: 'Backspace' })].map((event) => structuralKey(event, false))).toEqual(['Enter', 'Backspace']);
    expect([key({ key: 'Enter', shiftKey: true }), key({ key: 'Backspace', ctrlKey: true }), key({ key: 'Enter', isComposing: true }), key({ key: 'a' })]
      .map((event) => structuralKey(event, false))).toEqual([null, null, null, null]);
    expect(structuralKey(key({ key: 'Enter' }), true)).toBeNull();
    expect(newParagraphIdentity()).toMatch(/^blk_[0-9a-f]{24}$/);
  });

  it('become a split at the caret or a merge at the absorbing paragraph’s end, with no text written', () => {
    const split = structuralInput({ kind: 'split', blockId: 'blk_a', newBlockId: 'blk_n', at: 12, preText: 'x', windowStartBlockId: 'blk_s', held: null },
      base, { block: 'd1' }, (text) => [...text].length);
    expect(split).toMatchObject({ ...base, blockId: 'blk_a', windowStartBlockId: 'blk_s', baseBlockDigest: 'd1', fromGrapheme: 12, toGrapheme: 12,
      insertText: '', structure: { kind: 'split', newBlockId: 'blk_n' } });
    const merge = structuralInput({ kind: 'merge', blockId: 'blk_a', mergedBlockId: 'blk_b', preText: '甲乙丙', mergedPreText: '丁', windowStartBlockId: 'blk_s', held: null },
      base, { block: 'd1', merged: 'd2' }, (text) => [...text].length);
    expect(merge).toMatchObject({ blockId: 'blk_a', fromGrapheme: 3, toGrapheme: 3, insertText: '',
      structure: { kind: 'merge', mergedBlockId: 'blk_b', mergedBlockDigest: 'd2' } });
  });
});
