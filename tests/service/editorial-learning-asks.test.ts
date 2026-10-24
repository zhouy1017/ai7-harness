import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import { EditorialStore } from '../../src/service/store.js';
import { EditorialLearningLedger } from '../../src/service/learning/ledger.js';
import { graphemesOf } from '../../src/shared/mark-anchor.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';
import { importSample1Book } from '../support/sample1-baseline.js';

let roots: ServiceTestRoots | undefined;
let store: EditorialStore | undefined;
afterEach(async () => { store?.close(); store = undefined; await roots?.dispose(); roots = undefined; });

async function setup() {
  roots = await createServiceTestRoots('ai7-learning-asks-');
  store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
  const book = await importSample1Book(store, roots.codeRoot, '学习询问测试');
  const window = store.getManuscriptWindow(book.manuscriptId, book.branchId, null);
  const block = window.blocks.find((entry) => entry.kind === 'paragraph' && graphemesOf(entry.text).length >= 10)!;
  const binding = { manuscriptId: book.manuscriptId, branchId: book.branchId, windowStartBlockId: window.blocks[0]!.blockId };
  const decide = (disposition: 'rejected' | 'accepted-with-edit' = 'rejected') => {
    const mark = store!.createEditorialMark({ ...binding, clientMarkId: randomUUID(), baseRevisionId: window.revisionId,
      expectedJournalSequence: window.journalSequence, blockId: block.blockId, baseBlockDigest: block.digest,
      fromGrapheme: 0, toGrapheme: 2, selectedText: graphemesOf(block.text).slice(0, 2).join(''),
      kind: 'change-suggestion', highlightColor: null, body: '', proposedText: '合成建议', rationale: '合成依据' });
    return store!.recordChangeSuggestionDecision({ ...binding, markId: mark.markId, clientDecisionId: randomUUID(), disposition,
      editedText: disposition === 'accepted-with-edit' ? '合成改写' : null, reason: null }).card!.suggestion!.decision!.decisionId;
  };
  return { book, decide };
}

describe('local proactive reason asks', () => {
  it('honours off/often, stores options plus optional text with exact lineage, and reopens without asking again', async () => {
    const { decide, book } = await setup();
    const off = decide();
    expect(store!.recordLearningReasonAsk({ action: 'offer', decisionId: off }, 'off')).toBeNull();
    const decisionId = decide('accepted-with-edit');
    const ask = store!.recordLearningReasonAsk({ action: 'offer', decisionId }, 'often')!;
    expect(ask.options).toEqual(['语言更准确', '保持作者风格']);
    expect(() => store!.recordLearningReasonAsk({ action: 'answer', askId: ask.askId, choice: null, text: null }, 'often')).toThrow();
    expect(() => store!.recordLearningReasonAsk({ action: 'answer', askId: ask.askId, choice: '任意新类别', text: null }, 'often')).toThrow();
    store!.recordLearningReasonAsk({ action: 'answer', askId: ask.askId, choice: ask.options[0]!, text: '保留这一类的节奏。' }, 'often');
    const answer = store!.inspectEditorialLearning({ signalOffset: 0, itemOffset: 0 }).signals.find((entry) => entry.ask?.state === 'answered')!;
    expect(answer).toMatchObject({ kind: 'proactive-reason', source: { bookId: book.bookId, decisionId, markId: expect.any(String), reasonRevision: 0 },
      ask: { askId: ask.askId, choice: '语言更准确', text: '保留这一类的节奏。' }, currentEligibility: 'house' });
    expect(JSON.stringify(answer)).not.toContain('合成改写');
    store!.markCleanShutdown(); store!.close(); store = undefined;
    store = await EditorialStore.open(roots!.dataRoot, roots!.codeRoot);
    expect(store.recordLearningReasonAsk({ action: 'offer', decisionId }, 'often')).toBeNull();
    expect(store.inspectEditorialLearning({ signalOffset: 0, itemOffset: 0 }).signals.some((entry) => entry.ask?.state === 'answered')).toBe(true);
  });

  it('occasionally waits for three eligible decisions and sixty seconds across dismissal and restart', async () => {
    const { decide } = await setup();
    const decisions = Array.from({ length: 9 }, () => decide());
    const db = new DatabaseSync(join(roots!.dataRoot, 'store', 'ai7.sqlite'));
    try {
      const ledger = new EditorialLearningLedger(db);
      const offer = (index: number, time: string) => ledger.reasonAsk({ action: 'offer', decisionId: decisions[index]! }, 'occasionally', time);
      expect(offer(0, '2026-10-24T00:00:00Z')).toBeNull();
      expect(offer(1, '2026-10-24T00:00:01Z')).toBeNull();
      const first = offer(2, '2026-10-24T00:00:02Z')!; expect(first).not.toBeNull();
      ledger.reasonAsk({ action: 'dismiss', askId: first.askId }, 'occasionally', '2026-10-24T00:00:03Z');
      expect(offer(3, '2026-10-24T00:00:10Z')).toBeNull();
      expect(offer(4, '2026-10-24T00:00:11Z')).toBeNull();
      expect(offer(5, '2026-10-24T00:00:12Z')).toBeNull();
      const second = new EditorialLearningLedger(db).reasonAsk({ action: 'offer', decisionId: decisions[6]! }, 'occasionally', '2026-10-24T00:01:02Z');
      expect(second).not.toBeNull();
      expect(offer(7, '2026-10-24T00:02:05Z')).toBeNull();
      expect(offer(8, '2026-10-24T00:02:06Z')).toBeNull();
      expect(ledger.reasonAsk({ action: 'offer', decisionId: decisions[6]! }, 'often', '2026-10-24T00:03:00Z')).toBeNull();
      ledger.validate();
    } finally { db.close(); }
  });

  it('respects learning exclusions immediately and refuses an unrelated ask id', async () => {
    const { book, decide } = await setup();
    const decisionId = decide();
    store!.changeEditorialLearning({ kind: 'book', bookId: book.bookId, excluded: true, expectedEntries: 0 });
    expect(store!.recordLearningReasonAsk({ action: 'offer', decisionId }, 'often')).toBeNull();
    expect(() => store!.recordLearningReasonAsk({ action: 'answer', askId: randomUUID(), choice: null, text: '合成原因' }, 'often')).toThrow();
  });
});
