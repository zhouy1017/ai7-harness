import type { ManuscriptWindowProjection } from '../shared/protocol.js';

/**
 * How the marks a 审阅 made reach the manuscript window on screen once it settles (Issue #423 review, P2-6, P2-7). When the window
 * read again is the window on screen — the same revision, journal position, text and paragraphs — only its marks are new, and
 * they are set on it: nothing open over the text is closed. When the window itself moved on, it is loaded again, but only once
 * nothing is open over the text — a Mark Card, a menu or a composer — and the editor is not busy; until then the caller waits.
 */
export type MarksRefreshStep = 'set-marks' | 'reload' | 'wait';

type WindowIdentity = Pick<ManuscriptWindowProjection, 'revisionId' | 'journalSequence' | 'workingDigest' | 'blocks'>;

export function marksRefreshStep(now: WindowIdentity, next: WindowIdentity, busy: { readonly floating: boolean; readonly editor: boolean }): MarksRefreshStep {
  const sameWindow = now.revisionId === next.revisionId && now.journalSequence === next.journalSequence && now.workingDigest === next.workingDigest &&
    now.blocks.length === next.blocks.length && now.blocks.every((block, index) => block.blockId === next.blocks[index]?.blockId);
  if (sameWindow) return 'set-marks';
  return busy.floating || busy.editor ? 'wait' : 'reload';
}
