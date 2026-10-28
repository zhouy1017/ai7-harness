import { CURATION_SCHEMA_SQL, FACTUAL_TASK_INTENTS_SQL } from '../../src/service/task-authorization.js';
import { execPre74Fixture } from '../support/pre74-schema.js';
import { ModelRequestGovernor } from '../../src/service/analysis/execution.js';
import { resolveSourceCheckoutLaunchPolicy } from '../../src/service/launch-policy.js';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it, beforeEach } from 'vitest';
import { EditorialStore } from '../../src/service/store.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';
import { DialogueExecutionOwner } from '../../src/service/dialogue/dialogue-execution.js';
import { HouseReviewPreferenceLedger } from '../../src/service/house-review-preference.js';
import { buildDialogueMessage, parseDialogueMessage } from '../../src/service/dialogue/contract.js';
import { GLOBAL_AGENT_POLICY_BLOCKED, type GlobalMemoryPin, type RecordLearningSupervisionInput } from '../../src/shared/protocol.js';
import { LATEST_SCHEMA_VERSION } from '../../src/service/task-authorization.js';
import { DialogueLedger, DIALOGUE_SCHEMA_SQL, DIALOGUE_TASKS_REVISION_86_SQL, DIALOGUE_TRIGGER_SQL, initializeDialogueSchema } from '../../src/service/dialogue/dialogue-ledger.js';
import { SUPERVISION_SCHEMA_SQL, SUPERVISION_TRIGGER_SQL, SupervisionDirectives, governedMemoryItems, preferenceItems } from '../../src/service/learning/supervision-directives.js';
import { HOUSE_REVIEW_PREFERENCE_SCHEMA_SQL, HOUSE_REVIEW_PREFERENCE_TRIGGER_SQL, type HousePreferenceSource } from '../../src/service/house-review-preference.js';
import { LEARNING_ELIGIBILITY_SCHEMA_SQL } from '../../src/service/learning-eligibility.js';
import { admittedGlobalAgentRoute } from '../../src/service/dialogue/global-agent-session.js';
import { admittedDialogueRoute } from '../../src/service/dialogue/dialogue-route.js';
import { OPENCODE_GO_ROUTE_PROFILE } from '../../src/service/provider/deepseek-adapter.js';
import { OPENCODE_GO_MODEL } from '../../src/service/provider/egress-gate.js';
import { sha256Hex } from '../../src/service/analysis/canonical.js';

// One explicit model-request capability per test application.
// Registered first: the stack-ordered final hook runs after existing consumer teardown.
let requestGovernor: ModelRequestGovernor;
beforeEach(() => { requestGovernor = new ModelRequestGovernor(); });
afterEach(async () => { requestGovernor.close(); await requestGovernor.whenIdle(); });

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
      // The editor's own record keeps their words; what a Run or the session would read of it does not carry the names.
      expect(subject.inspectGlobalAgent().directives[0]!.text).toContain('作者甲');
      expect(subject.inspectGlobalAgent().items.map((item) => item.text).join('')).not.toMatch(/作者甲|作者丙|责编乙/u);
    } finally { db.close(); }
  });

  it('refuses a model attempt before recording anything when no Book-less rule is admitted', async () => {
    const subject = await open();
    const owner = new DialogueExecutionOwner({ requestGovernor, records: subject, fixture: null, live: null, sessionLogRoot: subject.harnessSessionLogRoot });
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

describe('revision 87 (Issue #1083)', () => {
  const objects = (db: DatabaseSync): Array<{ name: string; sql: string }> =>
    db.prepare("SELECT name, sql FROM sqlite_schema WHERE sql IS NOT NULL AND name NOT LIKE 'dialogue_tasks%' AND name NOT LIKE 'learning_supervision_directives%' ORDER BY name").all() as Array<{ name: string; sql: string }>;

  it('migrates an exact revision-86 store by adding the supervision ledger and widening dialogue metadata, moving nothing else, and refuses an 87 without the ledger', async () => {
    const subject = await open();
    subject.markCleanShutdown(); await subject.close(); store = undefined;
    const path = join(roots!.dataRoot, 'store', 'ai7.sqlite');
    const planted = new DatabaseSync(path, { enableForeignKeyConstraints: false });
    let before: Array<{ name: string; sql: string }>;
    try {
      // The store as revision 86 left it: no supervision ledger, every dialogue binding column NOT NULL.
      for (const trigger of Object.keys(SUPERVISION_TRIGGER_SQL)) planted.exec(`DROP TRIGGER ${trigger}`);
      planted.exec('DROP TABLE learning_supervision_directives; DROP TRIGGER dialogue_tasks_no_update; DROP TRIGGER dialogue_tasks_no_delete; DROP TABLE dialogue_tasks;');
      planted.exec(DIALOGUE_TASKS_REVISION_86_SQL);
      planted.exec(DIALOGUE_TRIGGER_SQL.dialogue_tasks_no_update!); planted.exec(DIALOGUE_TRIGGER_SQL.dialogue_tasks_no_delete!);
      execPre74Fixture(planted, 'PRAGMA user_version = 86');
      before = objects(planted);
    } finally { planted.close(); }
    store = await EditorialStore.open(roots!.dataRoot, roots!.codeRoot);
    store.markCleanShutdown(); await store.close(); store = undefined;
    const migrated = new DatabaseSync(path, { enableForeignKeyConstraints: false });
    try {
      // Synchronized with #1084: revision 88 follows, adding only its own relations, which this predecessor already carries.
      expect(migrated.prepare('PRAGMA user_version').get()).toEqual({ user_version: 100 });
      expect((migrated.prepare("SELECT sql FROM sqlite_schema WHERE name = 'learning_supervision_directives'").get() as { sql: string }).sql)
        .toBe(SUPERVISION_SCHEMA_SQL.learning_supervision_directives);
      expect((migrated.prepare("SELECT sql FROM sqlite_schema WHERE name = 'dialogue_tasks'").get() as { sql: string }).sql).toBe(DIALOGUE_SCHEMA_SQL.dialogue_tasks);
      expect(objects(migrated)).toEqual(before.map((row) => row.name === 'analysis_task_intents' ? { ...row, sql: FACTUAL_TASK_INTENTS_SQL } : CURATION_SCHEMA_SQL[row.name] === undefined ? row : { ...row, sql: CURATION_SCHEMA_SQL[row.name] }));
      for (const trigger of Object.keys(SUPERVISION_TRIGGER_SQL)) migrated.exec(`DROP TRIGGER ${trigger}`);
      migrated.exec('DROP TABLE learning_supervision_directives');
    } finally { migrated.close(); }
    await expect(EditorialStore.open(roots!.dataRoot, roots!.codeRoot).then((opened) => { store = opened; return opened; })).rejects.toThrow();
  }, 120_000);

  it('keeps developer-live refused and resolves the dedicated v27 Book-less rule beside the Book dialogue', async () => {
    roots = await createServiceTestRoots('ai7-global-agent-policy-');
    const live = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot, 'developer-live');
    const fast = { route: 'opencode-go', endpoint: OPENCODE_GO_ROUTE_PROFILE.endpoint, model: OPENCODE_GO_MODEL,
      credentialSlot: OPENCODE_GO_ROUTE_PROFILE.credentialSlot, credentialReference: '00000000-0000-4000-8000-000000001083' };
    const production = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot, 'ordinary-production', null, fast);
    for (const policy of [live, production]) {
      expect(policy.integrityState).toBe('verified');
      // The Book dialogue's own rule stands, and the session borrows neither it nor any other.
      expect(admittedDialogueRoute(policy)).not.toBeNull();
    }
    expect(admittedGlobalAgentRoute(live)).toBeNull();
    expect(admittedGlobalAgentRoute(production)?.ruleId).toBe('ordinary-production-global-agent-dialogue');
  });
});

describe('explicit governance over derived 本社审阅偏好 (Issue #1083)', () => {
  const SCOPE = 'development-ci' as const;
  const BOOK = randomUUID();
  const material = (categoryId: string, overrides: Partial<HousePreferenceSource> = {}): HousePreferenceSource => ({
    bookId: BOOK, bookTitle: '合成反馈图书', categoryId, categoryLabel: '合成类别', materialDigest: sha256Hex(randomUUID()), decisionId: randomUUID(),
    eligibilityDecisionId: randomUUID(), eligibility: 'house', operationalScope: SCOPE, disposition: 'rejected', reason: '保留原有写法',
    attribution: { peopleVersion: 1, authors: [], editors: [] }, quality: { applied: 0, surviving: 0, editVolume: 0, lineageDigest: 'b'.repeat(64) }, ...overrides,
  });
  const ledgers = (): { db: DatabaseSync; ledger: HouseReviewPreferenceLedger; directives: SupervisionDirectives } => {
    const db = new DatabaseSync(':memory:');
    for (const sql of [...Object.values(HOUSE_REVIEW_PREFERENCE_SCHEMA_SQL), ...Object.values(HOUSE_REVIEW_PREFERENCE_TRIGGER_SQL),
      ...Object.values(SUPERVISION_SCHEMA_SQL), ...Object.values(SUPERVISION_TRIGGER_SQL)]) db.exec(sql);
    db.exec(LEARNING_ELIGIBILITY_SCHEMA_SQL.learning_eligibility_decisions.replace('REFERENCES books(book_id)', ''));
    db.exec('CREATE TABLE review_runs(review_run_id TEXT PRIMARY KEY); CREATE TABLE analysis_task_intents(task_intent_id TEXT PRIMARY KEY, book_id TEXT, kind TEXT);');
    return { db, ledger: new HouseReviewPreferenceLedger(db), directives: new SupervisionDirectives(db) };
  };
  const items = (ledger: HouseReviewPreferenceLedger, directives: SupervisionDirectives) => {
    const current = ledger.history(SCOPE).at(-1) ?? null;
    return governedMemoryItems(preferenceItems(current === null ? null : { ...current, lines: current.governance?.baseLines ?? current.lines }), directives.history(SCOPE));
  };
  // One transaction, as `recordLearningSupervision` records the directive and the version it governs.
  const govern = (ledger: HouseReviewPreferenceLedger, directives: SupervisionDirectives, input: RecordLearningSupervisionInput): void => {
    ledger.db.exec('SAVEPOINT govern');
    try {
      directives.record(SCOPE, input, items(ledger, directives));
      ledger.refreshGovernance(SCOPE, [], true);
      ledger.db.exec('RELEASE govern');
    } catch (error) { ledger.db.exec('ROLLBACK TO govern'); ledger.db.exec('RELEASE govern'); throw error; }
  };
  const action = (operation: RecordLearningSupervisionInput['operation'], categoryId: string, targets: GlobalMemoryPin[], text = ''): RecordLearningSupervisionInput =>
    ({ operation, targets, scope: { kind: 'house' }, categoryId, text, effect: 'guide' });

  it('keeps a 停用 on a derived line when a later decision rereads its group', () => {
    const { db, ledger, directives } = ledgers();
    try {
      ledger.rebuild(SCOPE, [material('typos-and-usage')]);
      const line = items(ledger, directives)[0]!;
      govern(ledger, directives, action('deactivate', 'typos-and-usage', [pinOf(line)]));
      expect(ledger.use(SCOPE, BOOK, 'typos-and-usage')).toBeNull();
      // A second admitted material changes the group's tendency text; the editor's 停用 still reaches it.
      ledger.rebuild(SCOPE, [material('typos-and-usage'), material('typos-and-usage', { reason: '另一条合成理由' })]);
      expect(ledger.history(SCOPE).at(-1)!.governance!.baseLines[0]!.text).not.toBe(ledger.history(SCOPE)[0]!.lines[0]!.text);
      expect(ledger.use(SCOPE, BOOK, 'typos-and-usage')).toBeNull();
      expect(items(ledger, directives).find((entry) => entry.itemId === line.itemId)?.state).toBe('inactive');
    } finally { db.close(); }
  });

  it('never fails a rebuild for governance: derived lines yield to the editor\'s own, and only adding text past the bound is refused', () => {
    const { db, ledger, directives } = ledgers();
    try {
      ledger.rebuild(SCOPE, [material('a-category')]);
      const own = '合'.repeat(150);
      govern(ledger, directives, action('create', 'a-category', [], own));
      // Two more categories' tendencies no longer fit beside the editor's line: the rebuild leaves them out instead of failing.
      const rebuilt = ledger.rebuild(SCOPE, [material('a-category'), material('b-category'), material('c-category')])!;
      expect(rebuilt.lines.map((entry) => entry.text)).toContain(own);
      expect(rebuilt.lines.map((entry) => entry.categoryId)).toEqual(['a-category', 'a-category']);
      expect(rebuilt.governance!.baseLines).toHaveLength(3);
      expect(() => govern(ledger, directives, action('create', 'b-category', [], '再加一条合成记忆。'))).toThrow('最多 12 条');
      // Taking a line out is never refused.
      const derived = items(ledger, directives).find((entry) => entry.itemId === 'preference:house:c-category')!;
      govern(ledger, directives, action('deactivate', 'c-category', [pinOf(derived)]));
      expect(directives.history(SCOPE).map((entry) => entry.operation)).toEqual(['create', 'deactivate']);
    } finally { db.close(); }
  });

  it('stops a prepared Run only when governance changes the lines its pin reads', () => {
    const { db, ledger, directives } = ledgers();
    try {
      ledger.rebuild(SCOPE, [material('typos-and-usage'), material('style-and-format')]);
      const pinned = (categoryId: string): string => {
        const run = randomUUID(); const task = randomUUID();
        db.prepare('INSERT INTO review_runs VALUES (?)').run(run);
        db.prepare('INSERT INTO analysis_task_intents VALUES (?, ?, ?)').run(task, BOOK, `editorial-review/${categoryId}`);
        ledger.pin(run, task, 'e'.repeat(64), ledger.use(SCOPE, BOOK, categoryId)!);
        return task;
      };
      const derivedOnly = pinned('typos-and-usage');
      // With no directive in the scope, the derived path reads as before, even for a name its text happens to hold.
      expect(ledger.governanceChanged(derivedOnly, () => ['保留'])).toBe(false);
      const style = items(ledger, directives).find((entry) => entry.categoryId === 'style-and-format')!;
      govern(ledger, directives, action('deactivate', 'style-and-format', [pinOf(style)]));
      govern(ledger, directives, action('supervise', 'typos-and-usage', [], '今后区分文风与用语。'));
      expect(ledger.governanceChanged(derivedOnly, () => [])).toBe(false);
      const typos = items(ledger, directives).find((entry) => entry.categoryId === 'typos-and-usage')!;
      govern(ledger, directives, action('correct', 'typos-and-usage', [pinOf(typos)], '短句一般保留。'));
      expect(ledger.governanceChanged(derivedOnly, () => [])).toBe(true);
      const governed = pinned('typos-and-usage');
      expect(ledger.governanceChanged(governed, () => [])).toBe(false);
      expect(ledger.governanceChanged(governed, () => ['短句'])).toBe(true);
    } finally { db.close(); }
  });
});
