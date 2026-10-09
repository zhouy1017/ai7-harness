import { describe, expect, it } from 'vitest';
import { marksRefreshStep } from '../../src/renderer/marks-refresh.js';

// Unit suite for how a settled 审阅's marks reach the window on screen (Issue #423 review, P2-7): set in place when the window is
// the same, so an open Mark Card or menu is never closed; reloaded only when the window moved on and nothing is open over it.

type Window = Parameters<typeof marksRefreshStep>[0];
const WINDOW = {
  revisionId: 'rev-1',
  journalSequence: 7,
  workingDigest: 'a'.repeat(64),
  blocks: [{ blockId: 'blk_1' }, { blockId: 'blk_2' }],
} as unknown as Window;
const idle = { floating: false, editor: false };

describe('bringing a settled 审阅\'s marks onto the window on screen', () => {
  it('sets the marks on the same window whatever is open over it', () => {
    expect(marksRefreshStep(WINDOW, { ...WINDOW }, idle)).toBe('set-marks');
    expect(marksRefreshStep(WINDOW, { ...WINDOW }, { floating: true, editor: true })).toBe('set-marks');
  });

  it('reloads a window that moved on only once nothing is open over the text and the editor is free', () => {
    const moved = [
      { ...WINDOW, revisionId: 'rev-2' },
      { ...WINDOW, journalSequence: 8 },
      { ...WINDOW, workingDigest: 'b'.repeat(64) },
      { ...WINDOW, blocks: [{ blockId: 'blk_1' }] },
      { ...WINDOW, blocks: [{ blockId: 'blk_1' }, { blockId: 'blk_3' }] },
    ] as unknown as Window[];
    for (const next of moved) {
      expect(marksRefreshStep(WINDOW, next, idle)).toBe('reload');
      expect(marksRefreshStep(WINDOW, next, { floating: true, editor: false })).toBe('wait');
      expect(marksRefreshStep(WINDOW, next, { floating: false, editor: true })).toBe('wait');
    }
  });
});
