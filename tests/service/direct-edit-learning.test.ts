import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EditorialStore } from '../../src/service/store.js';
import type { JournalEditInput } from '../../src/shared/protocol.js';
import { importSample1Book } from '../support/sample1-baseline.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';

let roots: ServiceTestRoots;
let store: EditorialStore;
let book: { bookId: string; manuscriptId: string; branchId: string };
const RAW = 'e\u0301q\u0301"\\😀𠀀';

beforeEach(async () => {
  roots = await createServiceTestRoots('ai7-direct-edit-');
  store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
  book = await importSample1Book(store, roots.codeRoot, '直接编辑样书');
});
afterEach(async () => {
  store?.markCleanShutdown(); store?.close();
  await roots.dispose();
});
const inspect = () => store.inspectEditorialLearning({ signalOffset: 0, itemOffset: 0 });
const window = () => store.getManuscriptWindow(book.manuscriptId, book.branchId, null);
function edit(insertText = RAW, blockIndex = 0): JournalEditInput {
  const view = window();
  const block = view.blocks[blockIndex]!;
  const input: JournalEditInput = { clientEditId: randomUUID(), manuscriptId: book.manuscriptId, branchId: book.branchId,
    baseRevisionId: view.revisionId, blockId: block.blockId, windowStartBlockId: view.blocks[0]!.blockId,
    baseBlockDigest: block.digest, expectedJournalSequence: view.journalSequence, fromGrapheme: 0, toGrapheme: 0, insertText };
  store.flushJournalEdit(input);
  return input;
}
function undo(): void { store.undoManuscript(book.manuscriptId, book.branchId, window().workingDigest); }
function redo(): void { store.redoManuscript(book.manuscriptId, book.branchId, window().workingDigest); }

// Public source/learning behavior on admitted sample1; no SQL inspection, corruption, or manuscript dumps.
describe('actual manual edits in local learning', () => {
  it('captures one exact original transformation and keeps a retried flush idempotent', () => {
    expect(inspect().signals).toEqual([]);
    const before = window().blocks[0]!.text;
    const input = edit();
    const signal = inspect().signals[0]!;
    expect(signal).toMatchObject({ kind: 'manual-edit-journal', currentEligibility: 'house', rewriteDistance: null });
    const source = store.inspectManualLearningSource(signal.signalId);
    expect(source.members).toHaveLength(1);
    expect(source.members[0]!.beforeText === before).toBe(true);
    expect(source.members[0]!.afterText === RAW + before).toBe(true);
    expect(signal.source).not.toHaveProperty('decisionId');
    expect(signal).not.toHaveProperty('ask');
    store.flushJournalEdit(input);
    expect(inspect().signals.map((entry) => entry.signalId)).toEqual([signal.signalId]);
    expect(inspect().items).toEqual([]);
  });

  it('keeps the original identity through undo and redo without additional support', () => {
    edit();
    const signal = inspect().signals[0]!;
    undo();
    expect(inspect().signals[0]).toMatchObject({ signalId: signal.signalId, currentEligibility: 'deferred' });
    expect(store.inspectManualLearningSource(signal.signalId).history.lastAction.kind).toBe('undo');
    redo();
    expect(inspect().signals).toHaveLength(1);
    expect(inspect().signals[0]).toMatchObject({ signalId: signal.signalId, currentEligibility: 'house' });
    expect(store.inspectManualLearningSource(signal.signalId).history.lastAction.kind).toBe('redo');
  });

  it('holds an earlier edit after the same block changes again', () => {
    edit();
    const original = inspect().signals[0]!;
    edit('后续');
    expect(inspect().signals.find((entry) => entry.signalId === original.signalId)?.currentEligibility).toBe('superseded');
    expect(store.inspectManualLearningSource(original.signalId).current[0]!.block).toBe('other-text');
    expect(inspect().signals[0]!.currentEligibility).toBe('house');
  });

  it('holds a discarded redo tail without relabelling the new edit as its continuation', () => {
    edit();
    const original = inspect().signals[0]!;
    undo(); edit('不同修改');
    expect(inspect().signals.find((entry) => entry.signalId === original.signalId)?.currentEligibility).toBe('superseded');
    expect(store.inspectManualLearningSource(original.signalId).history.groupStatus).toBe('superseded');
    expect(inspect().signals[0]!.signalId).not.toBe(original.signalId);
  });

  it('honors global and Book exclusions at capture without backfilling retries', () => {
    store.changeEditorialLearning({ kind: 'switch', enabled: false, expectedEntries: 0 });
    const disabled = edit();
    expect(inspect().signals).toEqual([]);
    store.changeEditorialLearning({ kind: 'switch', enabled: true, expectedEntries: 1 });
    store.flushJournalEdit(disabled);
    expect(inspect().signals).toEqual([]);
    store.changeEditorialLearning({ kind: 'book', bookId: book.bookId, excluded: true, expectedEntries: 2 });
    edit('排除期间');
    expect(inspect().signals).toEqual([]);
    store.changeEditorialLearning({ kind: 'book', bookId: book.bookId, excluded: false, expectedEntries: 3 });
    edit('恢复以后');
    expect(inspect().signals).toHaveLength(1);
  });

  it('excludes one exact manual material and keeps its source inspectable', () => {
    edit();
    const signal = inspect().signals[0]!;
    store.changeEditorialLearning({ kind: 'material', signalId: signal.signalId });
    expect(inspect().signals[0]!.currentEligibility).toBe('excluded');
    expect(inspect().excludedMaterials).toContainEqual({ bookId: book.bookId, materialKey: signal.source.materialKey });
    expect(store.inspectManualLearningSource(signal.signalId).members).toHaveLength(1);
  });

  it('captures a manual Search/Replace as one complete command group', () => {
    edit('替换标识', 0); edit('替换标识', 1);
    const search = store.createSearch(book.manuscriptId, book.branchId, '替换标识');
    while (!store.advanceSearch(search.searchId).done) { /* bounded preparation */ }
    const preview = store.prepareReplacement(search.searchId, '替换结果', []);
    while (!store.advanceReplacementWork(preview.previewId).done) { /* bounded preparation */ }
    store.freezeReplacement(preview.previewId, []);
    while (!store.advanceReplacementWork(preview.previewId).done) { /* exact validation */ }
    store.commitReplacement(preview.previewId);
    const signal = inspect().signals[0]!;
    expect(signal.kind).toBe('manual-edit-journal');
    const source = store.inspectManualLearningSource(signal.signalId);
    expect(source.memberCount).toBe(2);
    expect(source.members.every((member) => member.beforeText.includes('替换标识') && member.afterText.includes('替换结果'))).toBe(true);
    expect(source.next).toBeNull();
    expect(source.history.lastAction.kind).toBe('replacement');
    undo();
    expect(inspect().signals[0]!.currentEligibility).toBe('deferred');
    redo();
    expect(inspect().signals).toHaveLength(3);
  });

  it.each(['journal', 'checkpoint'] as const)('preserves provenance and holds a %s recovery', async (kind) => {
    edit();
    const signal = inspect().signals[0]!;
    store.close();
    store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    expect(inspect().signals[0]).toMatchObject({ signalId: signal.signalId, currentEligibility: 'deferred' });
    const startup = await store.getStartup();
    if (startup.state !== 'manuscript-recovery') throw new Error('expected actual recovery');
    await store.restoreRecovery(randomUUID(), startup.recovery.attentionId, startup.recovery.attentionVersion, { kind });
    expect(inspect().signals[0]).toMatchObject({ signalId: signal.signalId, currentEligibility: 'superseded' });
    expect(store.inspectManualLearningSource(signal.signalId).history.restoration?.selectedKind).toBe(kind);
  });

  it('keeps one captured source after a clean restart', async () => {
    edit();
    const signal = inspect().signals[0]!;
    store.markCleanShutdown(); store.close();
    store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    expect(inspect().signals).toHaveLength(1);
    expect(inspect().signals[0]).toMatchObject({ signalId: signal.signalId, currentEligibility: 'house' });
  });
});
