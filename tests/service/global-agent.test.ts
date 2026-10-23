import { resolveSourceCheckoutLaunchPolicy } from '../../src/service/launch-policy.js';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import { EditorialStore } from '../../src/service/store.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';
import { DialogueExecutionOwner } from '../../src/service/dialogue/dialogue-execution.js';
import { HouseReviewPreferenceLedger } from '../../src/service/house-review-preference.js';
import { buildDialogueMessage, parseDialogueMessage } from '../../src/service/dialogue/contract.js';
import { GLOBAL_AGENT_POLICY_BLOCKED, type GlobalMemoryPin, type RecordLearningSupervisionInput } from '../../src/shared/protocol.js';
import { LATEST_SCHEMA_VERSION } from '../../src/service/task-authorization.js';
import { DialogueLedger, DIALOGUE_SCHEMA_SQL, DIALOGUE_TASKS_REVISION_86_SQL, DIALOGUE_TRIGGER_SQL, initializeDialogueSchema } from '../../src/service/dialogue/dialogue-ledger.js';
import { SUPERVISION_TRIGGER_SQL } from '../../src/service/learning/supervision-directives.js';

let roots: ServiceTestRoots | undefined;
let store: EditorialStore | undefined;
afterEach(async () => { await store?.close(); store = undefined; await roots?.dispose(); roots = undefined; });
const create = (text: string): RecordLearningSupervisionInput => ({ operation: 'create', targets: [], scope: { kind: 'house' },
  categoryId: 'typos-and-usage', text, effect: 'guide' });
const pinOf = ({ itemId, revisionId }: GlobalMemoryPin): GlobalMemoryPin => ({ itemId, revisionId });
async function open(): Promise<EditorialStore> {
  roots = await createServiceTestRoots('ai7-global-agent-');
  return store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
}

describe('the Book-less Global Agent', () => {
  it('reads without creating a Task, Run or session, and persists explicit local governance across restart', async () => {
    const subject = await open();
    expect(subject.inspectGlobalAgent()).toMatchObject({ dialogueState: GLOBAL_AGENT_POLICY_BLOCKED, history: [], directives: [], items: [] });
    const first = subject.recordLearningSupervision(create('保留作者短句。'));
    const original = first.items.find((item) => item.state === 'active')!;
    const corrected = subject.recordLearningSupervision({ ...create('短句不一概补主语。'), operation: 'correct', targets: [pinOf(original)] });
    expect(corrected.items.find((item) => item.state === 'active')?.text).toBe('短句不一概补主语。');
    expect(() => subject.recordLearningSupervision({ ...create('旧版本不得覆盖。'), operation: 'correct', targets: [pinOf(original)] })).toThrow('版本已经变化');
    const current = corrected.items.find((item) => item.state === 'active')!;
    subject.recordLearningSupervision({ ...create('先停止使用这条概括。'), operation: 'supervise', targets: [pinOf(current)], effect: 'freeze' });
    await subject.close(); store = undefined;
    store = await EditorialStore.open(roots!.dataRoot, roots!.codeRoot);
    expect(store.inspectGlobalAgent().directives).toHaveLength(3);
    expect(store.inspectGlobalAgent().items.every((item) => item.state !== 'active')).toBe(true);
    const db = new DatabaseSync(join(roots!.dataRoot, 'store', 'ai7.sqlite'));
    try {
      expect(db.prepare('PRAGMA user_version').get()?.user_version).toBe(LATEST_SCHEMA_VERSION);
      expect(db.prepare('SELECT count(*) n FROM dialogue_tasks').get()?.n).toBe(0);
      expect(db.prepare('SELECT count(*) n FROM analysis_run_records').get()?.n).toBe(0);
      expect(() => db.prepare('DELETE FROM learning_supervision_directives').run()).toThrow('IMMUTABLE');
      const preferences = new HouseReviewPreferenceLedger(db);
      expect(preferences.use('development-ci', randomUUID(), 'typos-and-usage')).toBeNull();
    } finally { db.close(); }
  });

  it('merges and deactivates locally, preserving the action chain and preventing a rebuild from restoring disabled memory', async () => {
    const subject = await open();
    subject.recordLearningSupervision(create('保留短句。'));
    const created = subject.recordLearningSupervision(create('保留省略。'));
    const merged = subject.recordLearningSupervision({ ...create('保留短句和有意省略。'), operation: 'merge', targets: created.items.filter((item) => item.state === 'active').map(pinOf) });
    const item = merged.items.find((entry) => entry.state === 'active')!;
    expect(item.lineage).toHaveLength(2);
    const stopped = subject.recordLearningSupervision({ ...create(''), operation: 'deactivate', targets: [pinOf(item)] });
    subject.rebuildHouseReviewPreference();
    expect(subject.inspectGlobalAgent().items.every((entry) => entry.state === 'inactive')).toBe(true);
    expect(stopped.directives.map((entry) => entry.operation)).toEqual(['create', 'create', 'merge', 'deactivate']);
  });

  it('invalidates an excerpt pin when supervision changes and rejects a mutation outside its declared scope', async () => {
    const subject = await open();
    const created = subject.recordLearningSupervision(create('保留短句。'));
    const pin = pinOf(created.items[0]!);
    expect(subject.globalAgentSourcesCurrent([pin])).toBe(true);
    subject.recordLearningSupervision({ ...create('今后区分文风与语法错误。'), operation: 'supervise' });
    expect(subject.globalAgentSourcesCurrent([pin])).toBe(false);
    const current = subject.inspectGlobalAgent();
    expect(() => subject.recordLearningSupervision({ ...create('不得跨类别改写。'), operation: 'correct',
      categoryId: 'style-and-format', scope: { kind: 'category', categoryId: 'style-and-format' }, targets: [pinOf(current.items[0]!)] })).toThrow();
    expect(subject.inspectGlobalAgent().directives).toHaveLength(2);
  });

  it('keeps known house names out of manually governed preference consumption, including later people changes', async () => {
    const subject = await open();
    const creation = subject.prepareBookCreation('合成人员图书', null);
    const bookId = subject.commitBookCreation({ ...creation.proposed, reviewDigest: creation.reviewDigest }).overview.book.bookId;
    subject.updateBookPeople({ bookId, expectedVersion: 0, authors: ['作者甲'], editors: ['责编乙'], related: [] });
    subject.recordLearningSupervision(create('作者甲与责编乙建议保留短句，作者丙也适用。'));
    const db = new DatabaseSync(join(roots!.dataRoot, 'store', 'ai7.sqlite'));
    try {
      const ledger = new HouseReviewPreferenceLedger(db);
      const before = ledger.use('development-ci', bookId, 'typos-and-usage')!;
      expect(before.lines.join('')).not.toMatch(/作者甲|责编乙/u);
      subject.updateBookPeople({ bookId, expectedVersion: 1, authors: ['作者甲', '作者丙'], editors: ['责编乙'], related: [] });
      expect(ledger.use('development-ci', bookId, 'typos-and-usage')!.lines.join('')).not.toMatch(/作者甲|作者丙|责编乙/u);
      expect(subject.inspectGlobalAgent().directives[0]!.text).toContain('作者甲');
    } finally { db.close(); }
  });

  it('refuses a model attempt before recording anything when no Book-less rule is admitted', async () => {
    const subject = await open();
    const owner = new DialogueExecutionOwner({ records: subject, fixture: null, live: null, sessionLogRoot: subject.harnessSessionLogRoot });
    try {
      // A runtime with no live binding cannot turn public/synthetic classification into an admission.
      const policy = await resolveSourceCheckoutLaunchPolicy(roots!.codeRoot, 'development-ci');
      expect(() => owner.requireGlobalReady(policy)).toThrow(GLOBAL_AGENT_POLICY_BLOCKED);
      expect(subject.inspectGlobalAgent().history).toEqual([]);
    } finally { await owner.dispose(); }
  });

  it('refuses damaged governance records on reopen instead of silently losing the supervision constraint', async () => {
    const subject = await open();
    subject.recordLearningSupervision(create('保留短句。'));
    await subject.close(); store = undefined;
    const db = new DatabaseSync(join(roots!.dataRoot, 'store', 'ai7.sqlite'));
    try {
      db.exec('DROP TRIGGER learning_supervision_directives_no_update');
      db.prepare('UPDATE learning_supervision_directives SET sha256 = ?').run('0'.repeat(64));
      db.exec(SUPERVISION_TRIGGER_SQL.learning_supervision_directives_no_update!);
    } finally { db.close(); }
    await expect(EditorialStore.open(roots!.dataRoot, roots!.codeRoot).then((opened) => { store = opened; return opened; }))
      .rejects.toThrow('学习监督指令');
  });

  it('round-trips only explicitly pinned preference excerpts through the existing Harness-message contract', () => {
    const input = { kind: 'ask' as const, selection: '', question: '这条偏好有何适用边界？', kept: null,
      globalSources: [{ itemId: randomUUID(), revisionId: randomUUID(), text: '合成偏好：保留短句。' }] };
    expect(parseDialogueMessage(buildDialogueMessage(input))).toEqual(input);
    expect(buildDialogueMessage(input)).not.toContain('【所选文字】');
  });

  it('widens legacy dialogue metadata without changing a Book task, and keeps global metadata out of Book lookup', () => {
    const db = new DatabaseSync(':memory:');
    const id = randomUUID();
    try {
      for (const [table, key] of [['books', 'book_id'], ['manuscripts', 'manuscript_id'], ['manuscript_branches', 'branch_id'], ['manuscript_revisions', 'revision_id'], ['editorial_marks', 'mark_id']]) {
        db.exec(`CREATE TABLE ${table} (${key} TEXT PRIMARY KEY)`);
        db.prepare(`INSERT INTO ${table} VALUES (?)`).run(id);
      }
      for (const [table, sql] of Object.entries(DIALOGUE_SCHEMA_SQL)) db.exec(table === 'dialogue_tasks' ? DIALOGUE_TASKS_REVISION_86_SQL : sql);
      for (const sql of Object.values(DIALOGUE_TRIGGER_SQL)) db.exec(sql);
      const ledger = new DialogueLedger(db);
      const asked = ledger.ask({ bookId: id, manuscriptId: id, branchId: id, revisionId: id, journalSequence: 0,
        blockId: `blk_${'a'.repeat(24)}`, fromGrapheme: 0, toGrapheme: 1, blockDigest: 'b'.repeat(64),
        selectionSha256: 'c'.repeat(64), questionSha256: 'd'.repeat(64), now: new Date() });
      const before = db.prepare('SELECT canonical_json, sha256 FROM dialogue_tasks').get();
      initializeDialogueSchema(db);
      expect(db.prepare('SELECT canonical_json, sha256 FROM dialogue_tasks').get()).toEqual(before);
      expect(ledger.task(asked.task.dialogueId)).toEqual(asked.task);
      const global = ledger.askGlobal('development-ci', [{ itemId: randomUUID(), revisionId: randomUUID() }], 'e'.repeat(64), new Date());
      expect(ledger.task(global.task.dialogueId)).toBeNull();
      expect(ledger.globalTask(global.task.dialogueId)).toEqual(global.task);
      expect(db.prepare('SELECT book_id, manuscript_id, branch_id, revision_id, block_id FROM dialogue_tasks WHERE dialogue_id = ?').get(global.task.dialogueId))
        .toEqual({ book_id: null, manuscript_id: null, branch_id: null, revision_id: null, block_id: null });
      expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    } finally { db.close(); }
  });
});
