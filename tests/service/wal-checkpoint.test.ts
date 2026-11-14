import { randomUUID } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { copyFile, mkdir, rm } from 'node:fs/promises';
import { statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { build } from 'esbuild';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { EditorialStore } from '../../src/service/store.js';
import { configureDatabase, WalCheckpointPolicy } from '../../src/service/store-schema.js';
import { ADMITTED_BASELINE_DOCX, composeManuscriptDocx } from '../support/composed-fixture.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';

const codeRoot = fileURLToPath(new URL('../../', import.meta.url));
const helper = join(codeRoot, '.cache', 'service', `wal-crash-child-${process.pid}.mjs`);
let roots: ServiceTestRoots, store: EditorialStore | undefined, child: ChildProcess | undefined;
let book: { manuscriptId: string; branchId: string };
const database = () => join(roots.dataRoot, 'store', 'ai7.sqlite');
beforeAll(async () => {
  await mkdir(join(codeRoot, '.cache', 'service'), { recursive: true });
  await build({ entryPoints: [join(codeRoot, 'tests/support/wal-crash-child.ts')], outfile: helper,
    bundle: true, packages: 'external', platform: 'node', format: 'esm', target: 'node24.18', logLevel: 'silent' });
});
afterAll(async () => { await rm(helper, { force: true }); });
beforeEach(async () => {
  roots = await createServiceTestRoots('ai7-wal-recovery-');
  store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
  const path = join(roots.inputRoot, 'checkpoint.docx');
  await composeManuscriptDocx(path, { source: ADMITTED_BASELINE_DOCX, startBlock: 1, blocks: 6, title: '持久保存组稿' });
  const staged = await store.stageSelectedManuscript(randomUUID(), path);
  const review = store.prepareNewBookReview(staged.draftId, staged.draftVersion,
    { kind: 'new-book', choiceId: 'new-book', confirmedTitle: staged.titleSuggestion.value }, false);
  const commitId = randomUUID();
  const result = await store.commitNewBookImport({ draftId: staged.draftId, expectedDraftVersion: review.draftVersion, reviewDigest: review.reviewDigest!, commitId });
  await store.acknowledgeImportCompletion(commitId);
  book = { manuscriptId: result.manuscriptId, branchId: result.branchId };
});
afterEach(async () => {
  if (child && child.exitCode === null && child.signalCode === null) { const stopped = once(child, 'exit'); child.kill('SIGKILL'); await stopped; }
  child = undefined; store?.close(); store = undefined; await roots.dispose();
});
function edit() {
  const window = store!.getManuscriptWindow(book.manuscriptId, book.branchId, null);
  const block = window.blocks.find(value => value.kind === 'paragraph')!;
  return { clientEditId: randomUUID(), manuscriptId: book.manuscriptId, branchId: book.branchId, baseRevisionId: window.revisionId,
    blockId: block.blockId, windowStartBlockId: window.blocks[0]!.blockId, baseBlockDigest: block.digest,
    expectedJournalSequence: window.journalSequence, fromGrapheme: 0, toGrapheme: 0, insertText: '甲' };
}

describe('durable edit acknowledgement with store-owned checkpoints', () => {
  it('recovers every acknowledged edit after killing the store process while the edits exist only in WAL', async () => {
    store!.markCleanShutdown(); store!.close(); store = undefined;
    child = spawn(process.execPath, [helper, roots.dataRoot, roots.codeRoot, book.manuscriptId, book.branchId], { windowsHide: true, stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
    const [message] = await Promise.race([once(child, 'message'), once(child, 'exit').then(([code]) => { throw new Error('WAL child exited before acknowledgement: ' + String(code)); })]);
    const ack = message as { sequence: number; workingDigest: string; blockId: string };
    expect(ack.sequence).toBe(3);
    const mainOnly = join(roots.inputRoot, 'main-only.sqlite');
    await copyFile(database(), mainOnly);
    const disk = new DatabaseSync(mainOnly, { readOnly: true });
    try { expect(disk.prepare('SELECT journal_sequence FROM branch_working_state WHERE branch_id = ?').get(book.branchId)).toMatchObject({ journal_sequence: 0 }); }
    finally { disk.close(); }
    const stopped = once(child, 'exit'); child.kill('SIGKILL'); await stopped;
    store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    const recovered = store.getManuscriptWindow(book.manuscriptId, book.branchId, null);
    expect(recovered.journalSequence).toBe(ack.sequence);
    expect(recovered.workingDigest).toBe(ack.workingDigest);
    expect(recovered.blocks.find(block => block.blockId === ack.blockId)?.text.startsWith('甲')).toBe(true);
  });

  it('truncates WAL after clean-shutdown preparation while retaining acknowledged journal state', () => {
    const ack = store!.flushJournalEdit(edit());
    expect(statSync(database() + '-wal').size).toBeGreaterThan(0);
    store!.markCleanShutdown();
    expect(statSync(database() + '-wal').size).toBe(0);
    expect(store!.getManuscriptWindow(book.manuscriptId, book.branchId, null).journalSequence).toBe(ack.sequence);
  });

  it('resumes an exact journal command after hard-pressure maintenance without dropping or duplicating it', () => {
    const writer = new DatabaseSync(database()), reader = new DatabaseSync(database(), { readOnly: true });
    configureDatabase(writer);
    const policy = new WalCheckpointPolicy(writer, database(), { softBytes: 1, hardBytes: 1 });
    try {
      policy.shutdown(); reader.exec('BEGIN'); reader.prepare('SELECT * FROM branch_working_state').all();
      store!.flushJournalEdit(edit());
      const pending = edit();
      const attempt = () => { policy.admitJournalWrite(); return store!.flushJournalEdit(pending); };
      policy.maintain(false);
      expect(attempt).toThrowError(expect.objectContaining({ code: 'JOURNAL_CHECKPOINT_BUSY' }));
      reader.exec('ROLLBACK'); policy.maintain(true);
      const ack = attempt(); policy.maintain(true);
      expect(attempt().sequence).toBe(ack.sequence);
      expect(ack.sequence).toBe(pending.expectedJournalSequence + 1);
    } finally { reader.close(); writer.close(); }
  });
});
