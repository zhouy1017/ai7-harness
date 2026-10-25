import { randomUUID } from 'node:crypto';
import { constructPre94PolicyEncoding } from '../support/analysis-ledger-revisions.js';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EditorialStore, StoreError, type DraftPreparation } from '../../src/service/store.js';
import { resolveSourceCheckoutLaunchPolicy } from '../../src/service/launch-policy.js';
import { loadModelFixture, type ResolvedModelFixture } from '../../src/service/provider/model-fixture.js';
import { ANALYSIS_LEDGER_REVISION_79_SQL, ANALYSIS_LEDGER_SCHEMA_SQL, LATEST_SCHEMA_VERSION, TASK_INTENT_DRAFT_SCHEMA_VERSION } from '../../src/service/task-authorization.js';
import { MERGE_TABLE_POLICY } from '../../src/service/database-merge.js';
import { TASK_INTENT_DRAFT_SCHEMA_SQL, draftAnswer, goalFromText, resolveDraft, type DraftResolutionFacts } from '../../src/service/task-intent-drafts.js';
import { graphemesOf } from '../../src/shared/mark-anchor.js';
import {
  BASELINE_ANALYSIS_TASK_GOAL,
  MAX_TASK_INTENT_GOAL_LENGTH,
  type DialogueSelectionInput,
  type LaunchPolicyProjection,
} from '../../src/shared/protocol.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';
import { restoreTaskIntentDraftPredecessor } from '../support/pre74-schema.js';
import { importSample1Book, pinEditorialWorkspaceProfileRevision2, recordMissingCredentialConnection, requireExactSample1 } from '../support/sample1-baseline.js';
import { WRITING_FIXTURE_IDENTITY, WRITING_REQUEST } from '../support/writing-task.js';

// Service-integration suite (L2) for Task Intent Drafts (Issue #423, wave 10 slice 7a; V2-UX-TASK-001 to 009, 042, 043): the real
// store over exact `sample1`. A draft is created and versioned without any Task, plan, Run Record or transmission; it stays bound
// to its Book; 准备计划 makes exactly one prepared Task of it through the existing preparation, linked once, with the draft's
// sentence as the Task Intent's goal; and schema 80 rebuilds `analysis_task_intents` with every existing row byte for byte.

const FIXTURES_ROOT = resolve(fileURLToPath(new URL('../fixtures/model/', import.meta.url)));
const CONTROL = {
  induceUnprovableReconciliation: false,
  persistLegacyReviewedDraft: false,
  induceReimportProofTamper: false,
  induceAbandonObjectRemovalFailure: false,
  interruptAfterAbandonObjectRemoval: false,
  baselineAnalysisRoute: null,
};
const GOAL = '统一全书的人名译法，并列出前后不一致的地方';

let roots: ServiceTestRoots;
let launchPolicy: LaunchPolicyProjection;
let fixture: ResolvedModelFixture;

beforeEach(async () => {
  roots = await createServiceTestRoots('ai7-service-task-intent-drafts-');
  await requireExactSample1(roots.codeRoot);
  launchPolicy = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot);
  fixture = await loadModelFixture(FIXTURES_ROOT, 'sample1-baseline-happy');
});

afterEach(async () => {
  await roots.dispose();
});

function open(): Promise<EditorialStore> {
  return EditorialStore.open(roots.dataRoot, roots.codeRoot, {
    ...CONTROL,
    baselineAnalysisRoute: { fixtureIdentity: fixture.identity, fixtureSha256: fixture.sha256, fixtureLineage: fixture.lineage },
  });
}

async function importBook(store: EditorialStore, title: string, first: boolean): Promise<{ bookId: string; manuscriptId: string; branchId: string }> {
  const imported = await importSample1Book(store, roots.codeRoot, title);
  await pinEditorialWorkspaceProfileRevision2(store, imported.bookId);
  if (first) recordMissingCredentialConnection(store, 'L2 主编辑连接');
  return imported;
}

function spanOf(store: EditorialStore, book: { manuscriptId: string; branchId: string }, index = 0, from = 2, to = 12): DialogueSelectionInput {
  const window = store.getManuscriptWindow(book.manuscriptId, book.branchId, null);
  const block = window.blocks.filter((candidate) => candidate.kind === 'paragraph' && graphemesOf(candidate.text).length >= 30)[index]!;
  return {
    manuscriptId: book.manuscriptId,
    branchId: book.branchId,
    windowStartBlockId: window.blocks[0]!.blockId,
    baseRevisionId: window.revisionId,
    expectedJournalSequence: window.journalSequence,
    blockId: block.blockId,
    baseBlockDigest: block.digest,
    fromGrapheme: from,
    toGrapheme: to,
    selectedText: graphemesOf(block.text).slice(from, to).join(''),
  };
}

function editBlock(store: EditorialStore, book: { manuscriptId: string; branchId: string }, blockId: string, insertText: string): void {
  const window = store.getManuscriptWindow(book.manuscriptId, book.branchId, null);
  const block = window.blocks.find((candidate) => candidate.blockId === blockId)!;
  store.flushJournalEdit({
    clientEditId: randomUUID(), manuscriptId: book.manuscriptId, branchId: book.branchId, baseRevisionId: window.revisionId, blockId,
    windowStartBlockId: window.blocks[0]!.blockId, baseBlockDigest: block.digest, expectedJournalSequence: window.journalSequence,
    fromGrapheme: 0, toGrapheme: 0, insertText,
  });
}

function refusal(operation: () => unknown): string {
  try {
    operation();
  } catch (error) {
    if (error instanceof StoreError) return error.code;
    throw error;
  }
  return 'no-error';
}

/** Every row of every relation but the drafts': what saving a draft must leave exactly as it was. */
function rowsOutsideDrafts(): string {
  const database = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'), { readOnly: true });
  try {
    const tables = (database.prepare("SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as Array<{ name: string }>)
      .map((row) => row.name).filter((name) => !(name in TASK_INTENT_DRAFT_SCHEMA_SQL));
    return JSON.stringify(tables.map((table) => [table, database.prepare(`SELECT * FROM "${table}"`).all()]),
      (_key, value: unknown) => value instanceof Uint8Array ? Buffer.from(value).toString('hex') : value);
  } finally {
    database.close();
  }
}

/** Start what 准备计划 resolved to, as the cooperative job would, step by step to its end. */
function runPreparation(store: EditorialStore, bookId: string, preparation: DraftPreparation): void {
  if (preparation.kind === 'baseline') {
    let progress = store.createBaselineAnalysisPreparationWork(bookId, preparation.goal, preparation.update, launchPolicy, false, null, preparation.intentDraft);
    while (!progress.done) progress = store.advanceBaselineAnalysisPreparationWork(progress.workId!);
  } else if (preparation.kind === 'review') {
    let progress = store.createReviewRunPreparationWork(bookId, [preparation.categoryId], preparation.scope, launchPolicy, null, [], null, preparation.intentDraft);
    while (!progress.done) progress = store.advanceReviewRunPreparationWork(progress.workId!);
  } else {
    let progress = store.createWritingPreparationWork(bookId, preparation.request, launchPolicy, null, preparation.intentDraft);
    while (!progress.done) progress = store.advanceWritingPreparationWork(progress.workId!);
  }
}

describe('Task Intent Drafts over the real store on exact sample1', () => {
  it('promotes writing atomically into a prepared plan with its writing context and no authorization', async () => {
    fixture = await loadModelFixture(FIXTURES_ROOT, WRITING_FIXTURE_IDENTITY);
    const store = await open();
    try {
      const book = await importBook(store, 'L2 草稿 写作准备', true);
      editBlock(store, book, spanOf(store, book).blockId, '〔测试编辑〕');
      const draft = store.saveTaskIntentDraft({ bookId: book.bookId, draftId: null, expectedOrdinal: null, origin: 'composer-book',
        goal: '重点介绍人物关系，写一篇简短宣传文章', target: { kind: 'book' }, outcomeClass: 'writing' });
      const preparation = store.taskIntentDraftPreparation({ bookId: book.bookId, draftId: draft.draftId, versionId: draft.version.versionId,
        choice: { kind: 'writing', typeId: WRITING_REQUEST.typeId }, writing: { audience: WRITING_REQUEST.audience, channel: WRITING_REQUEST.channel } });
      runPreparation(store, book.bookId, preparation);
      const prepared = store.inspectWriting(book.bookId)!;
      expect(prepared).toMatchObject({ state: 'prepared', authorization: null, run: null });
      expect(prepared.taskIntent!.goal).toBe(draft.version.goal);
      const promoted = store.inspectTaskIntentDrafts({ bookId: book.bookId, draftId: draft.draftId }).drafts[0]!;
      expect(promoted.promotion).toMatchObject({ taskKind: 'writing', taskIntentId: prepared.taskIntent!.taskIntentId });
      expect(store.inspectTaskPlan({ bookId: book.bookId, kind: 'writing', ref: promoted.promotion!.planRef }).goal.draft)
        .toEqual({ draftId: draft.draftId, sentence: draft.version.goal });
      expect(refusal(() => runPreparation(store, book.bookId, preparation))).toBe('TASK_INTENT_DRAFT_PROMOTED');
      const db = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'), { readOnly: true });
      try {
        expect(db.prepare('SELECT count(*) AS n FROM analysis_task_intents').get()).toEqual({ n: 1 });
        expect(db.prepare('SELECT count(*) AS n FROM task_intent_draft_promotions').get()).toEqual({ n: 1 });
      } finally { db.close(); }
      store.markCleanShutdown();
    } finally { store.close(); }
  }, 300_000);

  it('keeps a cancelled or stale preparation editable and commits exactly one intent with its plan and promotion', async () => {
    const store = await open();
    try {
      const book = await importBook(store, 'L2 草稿 原子准备', true);
      editBlock(store, book, spanOf(store, book).blockId, '〔测试编辑〕');
      const draft = store.saveTaskIntentDraft({ bookId: book.bookId, draftId: null, expectedOrdinal: null, origin: 'composer-book', goal: GOAL,
        target: { kind: 'book' }, outcomeClass: 'analysis' });
      const request = { bookId: book.bookId, draftId: draft.draftId, versionId: draft.version.versionId,
        choice: { kind: 'baseline' as const, mode: 'first-baseline' as const } };
      const preparation = store.taskIntentDraftPreparation(request);
      expect(preparation.kind).toBe('baseline');
      if (preparation.kind !== 'baseline') throw new Error('EXPECTED_BASELINE');
      const start = () => store.createBaselineAnalysisPreparationWork(book.bookId, preparation.goal, preparation.update, launchPolicy, false, null, preparation.intentDraft);
      const counts = (): unknown => {
        const db = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'), { readOnly: true });
        try {
          return ['analysis_task_intents', 'analysis_task_input_checkpoints', 'analysis_plan_versions', 'task_intent_draft_promotions']
            .map((table) => db.prepare(`SELECT count(*) AS n FROM ${table}`).get()!.n);
        } finally { db.close(); }
      };
      const cancelled = start();
      expect(cancelled.done).toBe(false);
      expect(counts()).toEqual([0, 0, 0, 0]);
      store.cancelBaselineAnalysisPreparationWork(cancelled.workId!);
      expect(store.inspectTaskIntentDrafts({ bookId: book.bookId, draftId: draft.draftId }).drafts[0]!.promotion).toBeNull();
      let stale = start();
      const edited = store.saveTaskIntentDraft({ bookId: book.bookId, draftId: draft.draftId, expectedOrdinal: 1, origin: 'composer-book', goal: `${GOAL}。`,
        target: { kind: 'book' }, outcomeClass: 'analysis' });
      expect(refusal(() => {
        while (!stale.done) stale = store.advanceBaselineAnalysisPreparationWork(stale.workId!);
      })).toBe('TASK_INTENT_DRAFT_STALE');
      expect(counts()).toEqual([0, 0, 0, 0]);
      runPreparation(store, book.bookId, store.taskIntentDraftPreparation({ ...request, versionId: edited.version.versionId }));
      expect(counts()).toEqual([1, 1, 1, 1]);
      expect(store.inspectBaselineAnalysis(book.bookId)).toMatchObject({ state: 'prepared', authorization: null, run: null });
      store.markCleanShutdown();
    } finally { store.close(); }
  }, 300_000);

  it('creates and versions a Book-bound draft without any Task or transmission, and never lets it follow another Book', async () => {
    const store = await open();
    try {
      const bookA = await importBook(store, 'L2 草稿 甲', true);
      const bookB = await importBook(store, 'L2 草稿 乙', false);
      const before = rowsOutsideDrafts();
      // 准备任务 in the whole-Book composer: a durable draft, version 1, nothing else written (TASK-004).
      const created = store.saveTaskIntentDraft({ bookId: bookA.bookId, draftId: null, expectedOrdinal: null, origin: 'composer-book', goal: `  ${GOAL}\n`,
        target: { kind: 'book' }, outcomeClass: null });
      expect(created).toMatchObject({ bookId: bookA.bookId, bookTitle: 'L2 草稿 甲', origin: 'composer-book', promotion: null,
        version: { ordinal: 1, goal: GOAL, target: 'book', outcomeClass: null, ranges: [], answer: null, procedurePin: null } });
      // No intended outcome yet: 准备计划 says what is missing and the draft stays editable (TASK-005).
      expect(created.resolution).toEqual({ state: 'unsupported', reason: '先选「希望得到的结果」，再准备计划。' });
      expect(rowsOutsideDrafts()).toBe(before);
      // 保存修改: a new version over the one the editor edited; a stale one is refused.
      const span = spanOf(store, bookA);
      const second = store.saveTaskIntentDraft({ bookId: bookA.bookId, draftId: created.draftId, expectedOrdinal: 1, origin: 'composer-selection', goal: GOAL,
        target: { kind: 'ranges', ranges: [{ kind: 'new', span }] }, outcomeClass: 'review', procedurePin: { procedureId: randomUUID(), versionId: randomUUID() } });
      expect(second.version.ordinal).toBe(2);
      expect(second.origin).toBe('composer-book');
      expect(second.version.ranges).toEqual([expect.objectContaining({ blockId: span.blockId, fromGrapheme: 2, toGrapheme: 12, text: span.selectedText, state: 'exact', stateLabel: null })]);
      expect(second.version.procedurePin).not.toBeNull();
      expect(refusal(() => store.saveTaskIntentDraft({ bookId: bookA.bookId, draftId: created.draftId, expectedOrdinal: 1, origin: 'composer-book', goal: GOAL,
        target: { kind: 'book' }, outcomeClass: null }))).toBe('TASK_INTENT_DRAFT_STALE');
      // A range kept from the version before keeps its original pin, never rebound (TASK-041).
      const third = store.saveTaskIntentDraft({ bookId: bookA.bookId, draftId: created.draftId, expectedOrdinal: 2, origin: 'composer-book', goal: `${GOAL}。`,
        target: { kind: 'ranges', ranges: [{ kind: 'kept', rangeId: second.version.ranges[0]!.rangeId }] }, outcomeClass: 'analysis' });
      expect(third.version.ranges).toEqual(second.version.ranges);
      expect(third.version.procedurePin).toBeNull();
      // Bounds: the goal, the ranges, a range the draft does not hold.
      expect(refusal(() => store.saveTaskIntentDraft({ bookId: bookA.bookId, draftId: null, expectedOrdinal: null, origin: 'composer-book', goal: '   ',
        target: { kind: 'book' }, outcomeClass: null }))).toBe('TASK_INTENT_DRAFT_GOAL_INVALID');
      expect(refusal(() => store.saveTaskIntentDraft({ bookId: bookA.bookId, draftId: null, expectedOrdinal: null, origin: 'composer-book', goal: '字'.repeat(MAX_TASK_INTENT_GOAL_LENGTH + 1),
        target: { kind: 'book' }, outcomeClass: null }))).toBe('TASK_INTENT_DRAFT_GOAL_INVALID');
      expect(refusal(() => store.saveTaskIntentDraft({ bookId: bookA.bookId, draftId: created.draftId, expectedOrdinal: 3, origin: 'composer-book', goal: GOAL,
        target: { kind: 'ranges', ranges: [{ kind: 'kept', rangeId: randomUUID() }] }, outcomeClass: null }))).toBe('TASK_INTENT_DRAFT_RANGE_INVALID');
      // Words of another Book's manuscript are never pinned to this Book's draft.
      expect(refusal(() => store.saveTaskIntentDraft({ bookId: bookA.bookId, draftId: null, expectedOrdinal: null, origin: 'composer-selection', goal: GOAL,
        target: { kind: 'ranges', ranges: [{ kind: 'new', span: spanOf(store, bookB) }] }, outcomeClass: null }))).toBe('TASK_INTENT_DRAFT_RANGE_INVALID');

      // Switching Books (TASK-006): the draft stays its Book's — listed there, waiting in 等你处理 and in 待我处理 as its own card —
      // and the other Book neither lists nor saves it.
      const listedA = store.inspectTaskIntentDrafts({ bookId: bookA.bookId, draftId: null });
      expect(listedA.drafts.map((draft) => [draft.draftId, draft.version.ordinal, draft.resolution])).toEqual([[created.draftId, 3, null]]);
      expect(store.inspectTaskIntentDrafts({ bookId: bookB.bookId, draftId: null }).drafts).toEqual([]);
      expect(refusal(() => store.inspectTaskIntentDrafts({ bookId: bookB.bookId, draftId: created.draftId }))).toBe('TASK_INTENT_DRAFT_NOT_FOUND');
      expect(refusal(() => store.saveTaskIntentDraft({ bookId: bookB.bookId, draftId: created.draftId, expectedOrdinal: 3, origin: 'composer-book', goal: GOAL,
        target: { kind: 'book' }, outcomeClass: null }))).toBe('TASK_INTENT_DRAFT_NOT_FOUND');
      const panelA = store.inspectBookTasks(bookA.bookId, () => null);
      const waiting = panelA.groups.find((group) => group.key === 'waiting')!;
      expect(waiting.items.map((entry) => [entry.item.state, entry.item.nextStep, entry.item.object, entry.item.target, entry.result])).toEqual([[
        'draft-unfinished', 'continue-draft', { kind: 'draft', goal: `${GOAL}。`, origin: 'composer-book', ranges: 1 },
        { kind: 'task-intent-draft', bookId: bookA.bookId, draftId: created.draftId }, null,
      ]]);
      expect(store.inspectBookTasks(bookB.bookId, () => null).groups.every((group) => group.total === 0)).toBe(true);
      const attention = store.inspectGlobalAttention(() => null, false).groups.flatMap((group) => group.items);
      expect(attention.map((item) => [item.state, item.book.bookId])).toEqual([['draft-unfinished', bookA.bookId]]);

      // A restart keeps it, exactly (返回继续 reads it again).
      store.markCleanShutdown();
      store.close();
      const reopened = await open();
      try {
        expect(reopened.inspectTaskIntentDrafts({ bookId: bookA.bookId, draftId: created.draftId }).drafts[0]!.version).toEqual(
          { ...third.version, ranges: third.version.ranges });
        expect(MERGE_TABLE_POLICY.task_intent_drafts).toBe('owned');
        expect(MERGE_TABLE_POLICY.task_intent_draft_versions).toBe('owned');
        expect(MERGE_TABLE_POLICY.task_intent_draft_promotions).toBe('owned');
        reopened.markCleanShutdown();
      } finally {
        reopened.close();
      }
    } finally {
      try { store.close(); } catch { /* closed above */ }
    }
  }, 300_000);

  it('labels a range pinned on newer edits 待保存修订版 and one whose words moved 任务范围需要重新选择, and refuses 准备计划 then', async () => {
    const store = await open();
    try {
      const book = await importBook(store, 'L2 草稿 范围', true);
      const span = spanOf(store, book);
      editBlock(store, book, spanOf(store, book, 1).blockId, '〔新写的字〕');
      // Pinned after an edit no revision holds yet: 待保存修订版.
      const pending = store.saveTaskIntentDraft({ bookId: book.bookId, draftId: null, expectedOrdinal: null, origin: 'composer-selection', goal: GOAL,
        target: { kind: 'ranges', ranges: [{ kind: 'new', span: spanOf(store, book) }] }, outcomeClass: 'analysis' });
      expect(pending.version.ranges.map((range) => [range.state, range.stateLabel])).toEqual([['pending-save', '待保存修订版']]);
      // A window still naming an older revision or journal position (a Task Input checkpoint moved the branch meanwhile) pins the
      // same words at the branch's state now; words that are not there are refused.
      const stale = { ...spanOf(store, book, 1), baseRevisionId: randomUUID(), expectedJournalSequence: 0 };
      const pinned = store.saveTaskIntentDraft({ bookId: book.bookId, draftId: null, expectedOrdinal: null, origin: 'composer-selection', goal: GOAL,
        target: { kind: 'ranges', ranges: [{ kind: 'new', span: stale }] }, outcomeClass: null });
      expect(pinned.version.ranges.map((entry) => [entry.blockId, entry.text, entry.state])).toEqual([[stale.blockId, stale.selectedText, 'pending-save']]);
      expect(refusal(() => store.saveTaskIntentDraft({ bookId: book.bookId, draftId: null, expectedOrdinal: null, origin: 'composer-selection', goal: GOAL,
        target: { kind: 'ranges', ranges: [{ kind: 'new', span: { ...stale, selectedText: `${stale.selectedText}多` } }] }, outcomeClass: null }))).toBe('TASK_INTENT_DRAFT_RANGE_MOVED');
      // The words it pinned change: 任务范围需要重新选择, and 准备计划 is refused until it is reselected (TASK-043).
      editBlock(store, book, span.blockId, '〔挪动〕');
      const moved = store.inspectTaskIntentDrafts({ bookId: book.bookId, draftId: pending.draftId }).drafts[0]!;
      expect(moved.version.ranges.map((range) => [range.state, range.stateLabel])).toEqual([['reselect', '任务范围需要重新选择']]);
      expect(refusal(() => store.taskIntentDraftPreparation({ bookId: book.bookId, draftId: pending.draftId, versionId: pending.version.versionId,
        choice: { kind: 'baseline', mode: 'reanalyze-range' } }))).toBe('TASK_INTENT_DRAFT_RANGE_RESELECT');
      store.markCleanShutdown();
    } finally {
      store.close();
    }
  }, 300_000);

  it('promotes a draft once through the existing preparation, with its sentence as the goal, leaving other Tasks\' records as they were', async () => {
    const store = await open();
    try {
      const book = await importBook(store, 'L2 草稿 准备计划', true);
      const draft = store.saveTaskIntentDraft({ bookId: book.bookId, draftId: null, expectedOrdinal: null, origin: 'composer-book', goal: GOAL,
        target: { kind: 'book' }, outcomeClass: 'analysis' });
      // The Book has no analysis yet: exactly one Task fits — 首次基线分析 — chosen with no model call.
      expect(draft.resolution).toEqual({ state: 'ready', option: { choice: { kind: 'baseline', mode: 'first-baseline' }, taskKind: 'baseline-analysis',
        label: '首次基线分析', available: true, reason: null } });
      // Only an offered choice, of the latest version, is taken.
      expect(refusal(() => store.taskIntentDraftPreparation({ bookId: book.bookId, draftId: draft.draftId, versionId: draft.version.versionId,
        choice: { kind: 'baseline', mode: 'reanalyze-book' } }))).toBe('TASK_INTENT_DRAFT_UNSUPPORTED');
      expect(refusal(() => store.taskIntentDraftPreparation({ bookId: book.bookId, draftId: draft.draftId, versionId: randomUUID(),
        choice: { kind: 'baseline', mode: 'first-baseline' } }))).toBe('TASK_INTENT_DRAFT_STALE');
      runPreparation(store, book.bookId, store.taskIntentDraftPreparation({ bookId: book.bookId, draftId: draft.draftId, versionId: draft.version.versionId,
        choice: { kind: 'baseline', mode: 'first-baseline' } }));
      // A normal prepared Task that still needs 开始任务 (AUTH-002), whose goal is the draft's sentence.
      const prepared = store.inspectBaselineAnalysis(book.bookId);
      expect(prepared.state).toBe('prepared');
      expect(prepared.authorization).toBeNull();
      expect(prepared.taskIntent!.goal).toBe(GOAL);
      const promoted = store.inspectTaskIntentDrafts({ bookId: book.bookId, draftId: draft.draftId }).drafts[0]!;
      expect(promoted.promotion).toEqual({ taskKind: 'baseline-analysis', taskIntentId: prepared.taskIntent!.taskIntentId,
        planRef: prepared.taskIntent!.taskIntentId, promotedAt: expect.any(String) });
      expect(promoted.resolution).toBeNull();
      const database = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'), { readOnly: true });
      try {
        const intent = database.prepare('SELECT goal, canonical_json FROM analysis_task_intents WHERE task_intent_id = ?').get(prepared.taskIntent!.taskIntentId) as { goal: string; canonical_json: string };
        expect(intent.goal).toBe(GOAL);
        expect(JSON.parse(intent.canonical_json)).toMatchObject({ goal: GOAL, intentDraftVersionId: draft.version.versionId });
        expect(database.prepare('SELECT count(*) AS n FROM task_intent_draft_promotions').get()).toEqual({ n: 1 });
      } finally {
        database.close();
      }
      // The plan's 目标块 shows the draft's sentence.
      const plan = store.inspectTaskPlan({ bookId: book.bookId, kind: 'baseline-analysis', ref: prepared.taskIntent!.taskIntentId });
      expect(plan.goal.draft).toEqual({ draftId: draft.draftId, sentence: GOAL });
      // A promoted draft is final: neither promoted again nor edited; it leaves 等你处理, where its Task now waits.
      expect(refusal(() => store.taskIntentDraftPreparation({ bookId: book.bookId, draftId: draft.draftId, versionId: draft.version.versionId,
        choice: { kind: 'baseline', mode: 'first-baseline' } }))).toBe('TASK_INTENT_DRAFT_PROMOTED');
      expect(refusal(() => store.saveTaskIntentDraft({ bookId: book.bookId, draftId: draft.draftId, expectedOrdinal: 1, origin: 'composer-book', goal: GOAL,
        target: { kind: 'book' }, outcomeClass: 'analysis' }))).toBe('TASK_INTENT_DRAFT_PROMOTED');
      const waiting = store.inspectBookTasks(book.bookId, () => null).groups.find((group) => group.key === 'waiting')!;
      expect(waiting.items.map((entry) => entry.item.state)).toEqual(['analysis-prepared']);

      // 先看计划 of the same Task revises that prepared Task in place: it stays the draft's, with its sentence.
      let again = store.createBaselineAnalysisPreparationWork(book.bookId, BASELINE_ANALYSIS_TASK_GOAL, null, launchPolicy);
      while (!again.done) again = store.advanceBaselineAnalysisPreparationWork(again.workId!);
      expect(store.inspectBaselineAnalysis(book.bookId).taskIntent).toMatchObject({ taskIntentId: prepared.taskIntent!.taskIntentId, goal: GOAL });

      // On another Book, a Task prepared without a draft keeps its fixed goal and its record's keys exactly as before revision 80.
      const other = await importBook(store, 'L2 草稿 另一本', false);
      let progress = store.createBaselineAnalysisPreparationWork(other.bookId, BASELINE_ANALYSIS_TASK_GOAL, null, launchPolicy);
      while (!progress.done) progress = store.advanceBaselineAnalysisPreparationWork(progress.workId!);
      const fixed = store.inspectBaselineAnalysis(other.bookId).taskIntent!;
      const check = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'), { readOnly: true });
      try {
        const row = check.prepare('SELECT goal, canonical_json FROM analysis_task_intents WHERE task_intent_id = ?').get(fixed.taskIntentId) as { goal: string; canonical_json: string };
        expect(row.goal).toBe(BASELINE_ANALYSIS_TASK_GOAL);
        expect(Object.keys(JSON.parse(row.canonical_json)).sort()).toEqual(['bookId', 'contractVersion', 'createdAt', 'expectedOutcome', 'goal', 'kind', 'taskIntentId']);
      } finally {
        check.close();
      }
      expect(store.inspectTaskPlan({ bookId: other.bookId, kind: 'baseline-analysis', ref: fixed.taskIntentId }).goal.draft).toBeUndefined();
      store.markCleanShutdown();
    } finally {
      store.close();
    }
  }, 300_000);

  it('promotes a 审阅 draft on its one paragraph as one category\'s Run, linking the Run and its Task', async () => {
    const reviewFixture = await loadModelFixture(FIXTURES_ROOT, 'sample1-review-authored');
    fixture = reviewFixture;
    const store = await open();
    try {
      const book = await importBook(store, 'L2 草稿 审阅', true);
      const span = spanOf(store, book);
      const draft = store.saveTaskIntentDraft({ bookId: book.bookId, draftId: null, expectedOrdinal: null, origin: 'composer-selection', goal: GOAL,
        target: { kind: 'ranges', ranges: [{ kind: 'new', span }] }, outcomeClass: 'review' });
      expect(draft.resolution?.state).toBe('choose');
      const options = draft.resolution!.state === 'choose' ? draft.resolution!.options : [];
      expect(options.every((option) => option.taskKind === 'review-run' && option.choice.kind === 'review' && option.choice.categoryId !== 'factual-review')).toBe(true);
      const modelFree = new Set(store.inspectReviewWorkspace(book.bookId, null).categories.filter((category) => category.modelFree).map((category) => category.categoryId));
      expect(options.every((option) => option.choice.kind !== 'review' || !modelFree.has(option.choice.categoryId))).toBe(true);
      for (const categoryId of modelFree) expect(refusal(() => store.taskIntentDraftPreparation({
        bookId: book.bookId, draftId: draft.draftId, versionId: draft.version.versionId, choice: { kind: 'review', categoryId },
      }))).toBe('TASK_INTENT_DRAFT_UNSUPPORTED');
      const typos = options.find((option) => option.choice.kind === 'review' && option.choice.categoryId === 'typos-and-usage')!;
      expect(typos).toBeDefined();
      const preparation = store.taskIntentDraftPreparation({ bookId: book.bookId, draftId: draft.draftId, versionId: draft.version.versionId, choice: typos.choice });
      expect(preparation).toMatchObject({ kind: 'review', categoryId: 'typos-and-usage', scope: { kind: 'selection', fromChapterBlockId: span.blockId, toChapterBlockId: span.blockId } });
      runPreparation(store, book.bookId, preparation);
      // A delayed second preparation must roll back its intent and plan when the draft was already promoted.
      expect(refusal(() => runPreparation(store, book.bookId, preparation))).toBe('TASK_INTENT_DRAFT_PROMOTED');
      const workspace = store.inspectReviewWorkspace(book.bookId, null);
      const run = workspace.run!;
      expect(run.state).toBe('prepared');
      const promoted = store.inspectTaskIntentDrafts({ bookId: book.bookId, draftId: draft.draftId }).drafts[0]!.promotion!;
      expect(promoted.taskKind).toBe('review-run');
      expect(promoted.planRef).toBe(run.reviewRunId);
      expect(promoted.taskIntentId).not.toBeNull();
      expect(store.inspectTaskPlan({ bookId: book.bookId, kind: 'review-run', ref: run.reviewRunId }).goal.draft).toEqual({ draftId: draft.draftId, sentence: GOAL });
      expect(store.inspectTaskPlan({ bookId: book.bookId, kind: 'review-run', ref: run.reviewRunId }).scope.process).toContain('所选文字已扩展为所在的 1 个完整段落');
      const db = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'), { readOnly: true });
      try {
        expect(db.prepare('SELECT count(*) AS n FROM analysis_task_intents').get()).toEqual({ n: 1 });
        const scope = db.prepare("SELECT canonical_json FROM analysis_plan_records WHERE task_intent_id = ? AND component = 'run-source-scope'").get(promoted.taskIntentId!)!;
        expect(JSON.parse(String(scope.canonical_json)).draftRangeExpansion).toMatchObject({ paragraphs: 1 });
        const recorded = db.prepare('SELECT canonical_json FROM review_runs WHERE review_run_id = ?').get(run.reviewRunId)!;
        expect(JSON.parse(String(recorded.canonical_json)).scope.label).toContain('所选文字已扩展为所在的 1 个完整段落');
      } finally { db.close(); }
      expect(store.inspectTaskIntentDrafts({ bookId: book.bookId, draftId: draft.draftId }).drafts[0]!.version.ranges).toEqual(draft.version.ranges);
      store.markCleanShutdown();
    } finally {
      store.close();
    }
  }, 300_000);
});

describe('the kind a draft becomes, decided without a model', () => {
  const facts: DraftResolutionFacts = {
    analysis: { first: false, firstAvailable: false, firstReason: null, modes: [
      { mode: 'sync-current', label: '同步到当前稿件', available: true, reason: null },
      { mode: 'reanalyze-book', label: '重新分析全书', available: true, reason: null },
      { mode: 'reanalyze-range', label: '重新分析所选范围', available: false, reason: '先选一段。' },
    ] },
    review: { available: true, reason: null, categories: [
      { categoryId: 'typos-and-usage', label: '错别字与规范用语', book: true, selection: true },
      { categoryId: 'factual-review', label: '事实核查', book: true, selection: false },
    ] },
    writing: [{ typeId: 'jacket-copy', label: '封面文案', available: true, reason: null }],
    writingRequirementsLimit: 300,
  };
  const range = (blockId: string) => ({ rangeId: randomUUID(), manuscriptId: randomUUID(), branchId: randomUUID(), blockId, blockDigest: '0'.repeat(64),
    fromGrapheme: 0, toGrapheme: 2, revisionId: randomUUID(), revisionLabel: 'r1', journalSequence: 0, pendingSave: false, text: '文字' });
  const book = { target: 'book' as const, ranges: [], goal: GOAL };

  it('chooses deterministically, offers a visible choice when several fit, and says so when none does', () => {
    expect(resolveDraft({ ...book, outcomeClass: null }, facts)).toEqual({ state: 'unsupported', reason: '先选「希望得到的结果」，再准备计划。' });
    const analysis = resolveDraft({ ...book, outcomeClass: 'analysis' }, facts);
    expect(analysis.state === 'choose' && analysis.options.map((option) => option.choice)).toEqual([{ kind: 'baseline', mode: 'sync-current' }, { kind: 'baseline', mode: 'reanalyze-book' }]);
    expect(resolveDraft({ ...book, outcomeClass: 'factual' }, facts)).toEqual({ state: 'ready', option: { choice: { kind: 'review', categoryId: 'factual-review' },
      taskKind: 'review-run', label: '事实核查', available: true, reason: null } });
    expect(resolveDraft({ target: 'ranges', ranges: [range('blk_000000000000000000000001')], goal: GOAL, outcomeClass: 'factual' }, facts))
      .toEqual({ state: 'unsupported', reason: '事实核查现在不能就这个范围准备。' });
    expect(resolveDraft({ target: 'ranges', ranges: [range('blk_000000000000000000000001')], goal: GOAL, outcomeClass: 'analysis' }, facts))
      .toEqual({ state: 'unsupported', reason: '先选一段。' });
    // Two paragraphs are never widened to the text between them (TASK-003).
    expect(resolveDraft({ target: 'ranges', ranges: [range('blk_000000000000000000000001'), range('blk_000000000000000000000002')], goal: GOAL, outcomeClass: 'review' }, facts).state)
      .toBe('unsupported');
    expect(resolveDraft({ target: 'ranges', ranges: [range('blk_000000000000000000000001')], goal: GOAL, outcomeClass: 'writing' }, facts))
      .toEqual({ state: 'unsupported', reason: '写作任务读全书，不就所选段落准备；请把范围改为全书。' });
    expect(resolveDraft({ ...book, outcomeClass: 'writing' }, facts)).toEqual({ state: 'choose', options: [
      { choice: { kind: 'writing', typeId: 'jacket-copy' }, taskKind: 'writing', label: '写作任务 · 封面文案', available: true, reason: null }] });
    expect(resolveDraft({ ...book, goal: '字'.repeat(301), outcomeClass: 'writing' }, facts)).toEqual({ state: 'unsupported', reason: '写作任务的要求最多 300 个字；请把任务描述改短。' });
    // The same facts always give the same answer.
    expect(resolveDraft({ ...book, outcomeClass: 'review' }, facts)).toEqual(resolveDraft({ ...book, outcomeClass: 'review' }, facts));
  });

  it('keeps a completed answer by complete fragment within its bound, its lines as rows, and fits a question into a goal', () => {
    expect(draftAnswer([{ text: '第一行。', breakAfter: true }, { text: '第二行[retrieval:' + 'a'.repeat(64) + ']。', breakAfter: false }]))
      .toEqual({ text: '第一行。\n第二行〔稿件引用〕。', rows: ['第一行。', '第二行〔稿件引用〕。'], truncated: false });
    expect(draftAnswer([{ text: '一句。', breakAfter: false }])).toEqual({ text: '一句。', rows: [], truncated: false });
    const long = draftAnswer(Array.from({ length: 300 }, () => ({ text: '十个字的一句话而已。', breakAfter: false })));
    expect(long.truncated).toBe(true);
    expect(long.text.length).toBeLessThanOrEqual(2_000);
    expect(goalFromText('问'.repeat(500))).toHaveLength(MAX_TASK_INTENT_GOAL_LENGTH);
    expect(goalFromText(' 一个 \n 问题 ')).toBe('一个 问题');
  });
});

describe('schema revision 80', () => {
  it('rebuilds a revision-79 store\'s Task Intents with every row byte for byte and adds the draft relations empty', async () => {
    expect(TASK_INTENT_DRAFT_SCHEMA_VERSION).toBe(80);
    // Revision 84 follows the imported Skill revisions and adds independent model selections and translation attempt metadata.
    expect(LATEST_SCHEMA_VERSION).toBe(TASK_INTENT_DRAFT_SCHEMA_VERSION + 14);
    const store = await open();
    let bookId: string;
    try {
      const book = await importBook(store, 'L2 修订版 80', true);
      bookId = book.bookId;
      let progress = store.createBaselineAnalysisPreparationWork(bookId, BASELINE_ANALYSIS_TASK_GOAL, null, launchPolicy);
      while (!progress.done) progress = store.advanceBaselineAnalysisPreparationWork(progress.workId!);
      store.markCleanShutdown();
    } finally {
      store.close();
    }
    const path = join(roots.dataRoot, 'store', 'ai7.sqlite');
    const plant = new DatabaseSync(path);
    constructPre94PolicyEncoding(plant);
    const intents = plant.prepare('SELECT rowid, * FROM analysis_task_intents ORDER BY rowid').all();
    const plans = plant.prepare('SELECT rowid, * FROM analysis_plan_records ORDER BY rowid').all();
    expect(intents).toHaveLength(1);
    restoreTaskIntentDraftPredecessor(plant);
    plant.exec('PRAGMA user_version = 79');
    expect((plant.prepare("SELECT sql FROM sqlite_schema WHERE name = 'analysis_task_intents'").get() as { sql: string }).sql).toBe(ANALYSIS_LEDGER_REVISION_79_SQL.analysis_task_intents);
    plant.close();
    const reopened = await open();
    try {
      expect(reopened.inspectBaselineAnalysis(bookId!).state).toBe('prepared');
      reopened.markCleanShutdown();
    } finally {
      reopened.close();
    }
    const migrated = new DatabaseSync(path);
    try {
      expect(migrated.prepare('PRAGMA user_version').get()).toEqual({ user_version: 94 });
      expect((migrated.prepare("SELECT sql FROM sqlite_schema WHERE name = 'analysis_task_intents'").get() as { sql: string }).sql).toBe(ANALYSIS_LEDGER_SCHEMA_SQL.analysis_task_intents);
      expect(migrated.prepare('SELECT rowid, * FROM analysis_task_intents ORDER BY rowid').all()).toEqual(intents);
      expect(migrated.prepare('SELECT rowid, * FROM analysis_plan_records ORDER BY rowid').all()).toEqual(plans);
      for (const table of Object.keys(TASK_INTENT_DRAFT_SCHEMA_SQL)) expect(migrated.prepare(`SELECT count(*) AS n FROM ${table}`).get()).toEqual({ n: 0 });
      // The rebuilt CHECKs: a bounded goal for every kind, the custom analysis family with its contract and the baseline modes only.
      migrated.exec('PRAGMA foreign_keys = OFF');
      const insert = (kind: string, contract: string, mode: string, goal: string): void => {
        migrated.prepare(`INSERT INTO analysis_task_intents(task_intent_id, book_id, kind, contract_version, goal, created_at, canonical_json, sha256, mode)
          VALUES (?, ?, ?, ?, ?, 'now', '{}', ?, ?)`).run(randomUUID(), bookId!, kind, contract, goal, randomUUID().replaceAll('-', '').padEnd(64, '0'), mode);
      };
      migrated.exec('BEGIN');
      expect(() => insert('custom-analysis/names', 'ai7.custom-analysis/1', 'first-baseline', '自定义')).not.toThrow();
      expect(() => insert('custom-analysis/names', 'ai7.custom-analysis/1', 'review-first', '自定义')).toThrow(/CHECK/u);
      expect(() => insert('custom-analysis/Names', 'ai7.custom-analysis/1', 'first-baseline', '自定义')).toThrow(/CHECK/u);
      expect(() => insert('baseline-manuscript-analysis', 'ai7.baseline-manuscript-analysis/1', 'first-baseline', '字'.repeat(401))).toThrow(/CHECK/u);
      expect(() => insert('baseline-manuscript-analysis', 'ai7.baseline-manuscript-analysis/1', 'first-baseline', '')).toThrow(/CHECK/u);
      migrated.exec('ROLLBACK');
    } finally {
      migrated.close();
    }
  }, 300_000);
});
