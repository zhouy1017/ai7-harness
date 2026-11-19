import { describe, expect, it } from 'vitest';
import { finishedResultRoute, type FinishedEntry, type ResultEntrance } from '../../src/renderer/result-destination.js';
import type { BookTaskResultRef, GlobalAttentionItemProjection, GlobalAttentionObjectProjection, GlobalAttentionTarget, TaskPlanKind } from '../../src/shared/protocol.js';

function entry(object: GlobalAttentionObjectProjection, target: GlobalAttentionTarget, result: BookTaskResultRef | null, plan: { kind: TaskPlanKind; ref: string | null } | null, bookId = 'book-a'): FinishedEntry {
  const attention: GlobalAttentionItemProjection = {
    itemId: 'task:finished', group: 'recent', state: 'analysis-completed', blocked: false, at: '2026-11-18T00:00:00Z', book: { bookId, title: 'Book' }, object,
    facts: { progress: null, categories: [], revisionOrdinal: null }, nextStep: 'view-run', target, technical: [],
  };
  return { bookId, result, attention, plan };
}

const KINDS = {
  analysis: entry({ kind: 'analysis', mode: 'first-baseline' }, { kind: 'analysis', bookId: 'book-a', taskIntentId: 'intent' }, { kind: 'analysis-revision', revisionId: 'rev' }, { kind: 'baseline-analysis', ref: 'intent' }),
  review: entry({ kind: 'review', ordinal: 1 }, { kind: 'review', bookId: 'book-a', reviewRunId: 'run' }, { kind: 'review-run', reviewRunId: 'run' }, { kind: 'review-run', ref: 'run' }),
  dialogue: entry({ kind: 'dialogue', question: null }, { kind: 'dialogue', bookId: 'book-a', dialogueId: 'dlg' }, { kind: 'dialogue', dialogueId: 'dlg' }, null),
  evaluation: entry({ kind: 'task', taskKind: 'initial-evaluation' }, { kind: 'task-plan', bookId: 'book-a', taskKind: 'initial-evaluation', ref: 'old' }, null, { kind: 'initial-evaluation', ref: 'finished-one' }),
  writing: entry({ kind: 'task', taskKind: 'writing' }, { kind: 'task-plan', bookId: 'book-a', taskKind: 'writing', ref: 'old' }, null, { kind: 'writing', ref: 'finished-writing' }),
  // A finished analysis whose outcome formed no revision, and a dialogue with nothing to read.
  analysisWithoutResult: entry({ kind: 'analysis', mode: 'first-baseline' }, { kind: 'analysis', bookId: 'book-a', taskIntentId: 'intent' }, null, { kind: 'baseline-analysis', ref: 'intent' }),
  dialogueWithoutResult: entry({ kind: 'dialogue', question: null }, { kind: 'dialogue', bookId: 'book-a', dialogueId: 'dlg' }, null, null),
};

const PAGE = (target: GlobalAttentionTarget, analysisRevisionId?: string) => ({ via: 'page', target, ...(analysisRevisionId === undefined ? {} : { analysisRevisionId }) });
const WINDOW = { via: 'window' };

describe('where 查看结果 opens, by task kind and entrance (#1528)', () => {
  const placed = (name: keyof typeof KINDS, from: ResultEntrance) => finishedResultRoute(KINDS[name], from);

  it.each(['toast', 'palette', 'overview'] as const)('%s: the result itself, in its Book', (from) => {
    expect(placed('analysis', from)).toEqual(PAGE({ kind: 'analysis', bookId: 'book-a', taskIntentId: 'intent' }, 'rev'));
    expect(placed('review', from)).toEqual(PAGE({ kind: 'review', bookId: 'book-a', reviewRunId: 'run' }));
    expect(placed('dialogue', from)).toEqual(PAGE({ kind: 'dialogue', bookId: 'book-a', dialogueId: 'dlg' }));
    // The task that finished (its own ref), not the Book's current task of that kind.
    expect(placed('evaluation', from)).toEqual(PAGE({ kind: 'task-plan', bookId: 'book-a', taskKind: 'initial-evaluation', ref: 'finished-one' }));
    expect(placed('writing', from)).toEqual(PAGE({ kind: 'task-plan', bookId: 'book-a', taskKind: 'writing', ref: 'finished-writing' }));
  });

  it.each(['panel', 'attention'] as const)('%s: a result to read stays in the result window; a 评估 or 写作 without one goes to its page', (from) => {
    for (const name of ['analysis', 'review', 'dialogue', 'analysisWithoutResult', 'dialogueWithoutResult'] as const) expect(placed(name, from)).toEqual(WINDOW);
    expect(placed('evaluation', from)).toEqual(PAGE({ kind: 'task-plan', bookId: 'book-a', taskKind: 'initial-evaluation', ref: 'finished-one' }));
    expect(placed('writing', from)).toEqual(PAGE({ kind: 'task-plan', bookId: 'book-a', taskKind: 'writing', ref: 'finished-writing' }));
  });

  it('never stands the result window over a page that is not the overview: a task without a result page opens in its own Book', () => {
    for (const from of ['toast', 'palette'] as const) {
      expect(placed('analysisWithoutResult', from)).toEqual(PAGE({ kind: 'analysis', bookId: 'book-a', taskIntentId: 'intent' }));
      expect(placed('dialogueWithoutResult', from)).toEqual(PAGE({ kind: 'dialogue', bookId: 'book-a', dialogueId: 'dlg' }));
    }
    // On the overview, the one page where a task of another Book may be opened, the window is what the card has always opened.
    expect(placed('analysisWithoutResult', 'overview')).toEqual(WINDOW);
    expect(placed('dialogueWithoutResult', 'overview')).toEqual(WINDOW);
  });

  it('keeps each route on the Book of the task, and says nothing for a task without one', () => {
    const other = entry({ kind: 'dialogue', question: null }, { kind: 'dialogue', bookId: 'book-b', dialogueId: 'dlg-b' }, null, null, 'book-b');
    expect(finishedResultRoute(other, 'toast')).toEqual(PAGE({ kind: 'dialogue', bookId: 'book-b', dialogueId: 'dlg-b' }));
    expect(finishedResultRoute({ ...other, bookId: null, attention: { ...other.attention, book: { bookId: null, title: null } } }, 'toast')).toEqual({ via: 'none' });
  });
});
