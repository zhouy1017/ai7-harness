import { createHash, randomUUID } from 'node:crypto';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RECONCILED_INTERRUPTED_DETAIL, RECONCILED_QUEUED_DETAIL } from '../../src/service/analysis/baseline-analysis-store.js';
import { BaselineAnalysisExecutionOwner } from '../../src/service/analysis/execution.js';
import { INITIAL_EVALUATION_LIVE_UNAVAILABLE } from '../../src/service/evaluation/initial-evaluation-kind.js';
import { runReportUsageReconciles } from '../../src/service/analysis/run-report.js';
import { EVALUATION_INITIAL_DRAFT_TRIGGER_SQL, EVALUATION_RECORD_TRIGGER_SQL } from '../../src/service/evaluation-records.js';
import { resolveSourceCheckoutLaunchPolicy } from '../../src/service/launch-policy.js';
import { loadModelFixture, type ResolvedModelFixture } from '../../src/service/provider/model-fixture.js';
import { EditorialStore, StoreError } from '../../src/service/store.js';
import {
  ANALYSIS_LEDGER_REVISION_58_SQL,
  ANALYSIS_LEDGER_SCHEMA_SQL,
  DATABASE_MERGE_SCHEMA_VERSION,
  DIALOGUE_SCHEMA_VERSION,
} from '../../src/service/task-authorization.js';
import {
  INITIAL_EVALUATION_ASSURANCE_STATEMENT,
  INITIAL_EVALUATION_CONTRACT_VERSION,
  INITIAL_EVALUATION_KIND,
  type EvaluationAdjustment,
  type EvaluationContent,
  type LaunchPolicyProjection,
} from '../../src/shared/protocol.js';
import { KIND_COUPLED_ANALYSIS_RELATIONS, downgradeKindCoupledRelations } from '../support/analysis-ledger-revisions.js';
import { importSample1Book, pinEditorialWorkspaceProfileRevision2, recordMissingCredentialConnection, requireExactSample1 } from '../support/sample1-baseline.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';

// Service-integration suite (L2) for AI7 初评 (Issue #429, plan slice S81b1; V2-UX-EVAL-001, EVAL-005 to EVAL-007, EVAL-011):
// the evaluation kind over the real store and ledger, the one execution owner and the AI7 local deterministic adapter over
// the authored fixture `sample1-evaluation-authored`; then 评估 begun from AI7's draft, the editor's own scores with their
// adjustment reasons, and calibration counting the Book once. The manuscript is exact `sample1` (ADR 0043); no Provider,
// socket or credential value is involved. Assertions name scores, states and counts, never manuscript text.

const FIXTURES_ROOT = resolve(fileURLToPath(new URL('../fixtures/model/', import.meta.url)));
const AI7_SCORES = [16.5, 15, 15.5, 14, 12];

let roots: ServiceTestRoots;
let launchPolicy: LaunchPolicyProjection;
let fixture: ResolvedModelFixture;

beforeEach(async () => {
  roots = await createServiceTestRoots('ai7-service-initial-evaluation-');
  launchPolicy = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot);
  fixture = await loadModelFixture(FIXTURES_ROOT, 'sample1-evaluation-authored');
  expect(fixture.provenance).toBe('authored');
});

afterEach(async () => {
  await roots.dispose();
});

async function refusal(operation: () => unknown): Promise<string> {
  try {
    await operation();
  } catch (error) {
    if (error instanceof StoreError) return `${error.code}:${error.message}`;
    throw error;
  }
  return 'no-error';
}

interface Book {
  readonly store: EditorialStore;
  readonly owner: BaselineAnalysisExecutionOwner;
  readonly bookId: string;
  readonly manuscriptId: string;
  readonly branchId: string;
}

async function openStore(): Promise<EditorialStore> {
  return EditorialStore.open(roots.dataRoot, roots.codeRoot, {
    induceUnprovableReconciliation: false,
    persistLegacyReviewedDraft: false,
    induceReimportProofTamper: false,
    induceAbandonObjectRemovalFailure: false,
    interruptAfterAbandonObjectRemoval: false,
    baselineAnalysisRoute: { fixtureIdentity: fixture.identity, fixtureSha256: fixture.sha256, fixtureLineage: fixture.lineage },
  });
}

async function withBook(body: (book: Book) => Promise<void>): Promise<void> {
  await requireExactSample1(roots.codeRoot);
  const store = await openStore();
  const owner = new BaselineAnalysisExecutionOwner({ ledger: store.baselineAnalysisLedger, launchPolicy, fixture, secretResolver: { resolve: async () => null } });
  try {
    const imported = await importSample1Book(store, roots.codeRoot, '初评之书');
    await pinEditorialWorkspaceProfileRevision2(store, imported.bookId);
    recordMissingCredentialConnection(store, 'L2 主编辑连接');
    await body({ store, owner, bookId: imported.bookId, manuscriptId: imported.manuscriptId, branchId: imported.branchId });
    store.markCleanShutdown();
  } finally {
    await owner.dispose();
    store.close();
  }
}

/** 准备 AI7 初评 to its frozen plan, then 开始任务 through the governor, and the Run to its end. */
async function runInitialEvaluation(book: Book): Promise<string> {
  let progress = book.store.createInitialEvaluationPreparationWork(book.bookId, launchPolicy);
  while (!progress.done) progress = book.store.advanceInitialEvaluationPreparationWork(progress.workId!);
  const prepared = progress.projection!;
  expect(prepared).toMatchObject({ kind: INITIAL_EVALUATION_KIND, contractVersion: INITIAL_EVALUATION_CONTRACT_VERSION, state: 'prepared' });
  const authorized = book.store.authorizeInitialEvaluation(book.bookId, prepared.taskIntent!.taskIntentId, prepared.planEnvelope!.digest);
  expect(authorized.dispatchRunRecordId).not.toBeNull();
  expect(book.owner.admitOrQueue(authorized.dispatchRunRecordId!, book.store.initialEvaluationLedger)).toBe('admitted');
  await book.owner.whenIdle();
  return prepared.taskIntent!.taskIntentId;
}

function adjust(content: EvaluationContent, index: number, score: number, adjustment: EvaluationAdjustment | null): EvaluationContent {
  return { ...content, items: content.items.map((item, at) => (at === index ? { ...item, score, adjustment } : item)) };
}

describe('AI7 初评 over the real store on exact sample1', () => {
  it('reads every range for the evidence of each item, scores the items once, and says how well each score stands', async () => {
    await withBook(async (book) => {
      // Before any 初评: 评估 offers to prepare one, and nothing to begin from.
      const before = book.store.inspectEvaluation(book.bookId, null);
      expect(before.initial).toEqual({ task: null, prepare: { allowed: true, mode: 'evaluation-first' }, latest: null });
      expect(before.start).toEqual({ allowed: true, kind: 'first', fromInitial: null });
      expect(await refusal(() => book.store.startEvaluation(book.bookId, true))).toBe('EVALUATION_INITIAL_UNAVAILABLE:这本书还没有完成的 AI7 初评。');

      // The plan in the Task Drawer, in the editor's words: two steps, nothing sent under the deterministic route, ready to start.
      let progress = book.store.createInitialEvaluationPreparationWork(book.bookId, launchPolicy);
      while (!progress.done) progress = book.store.advanceInitialEvaluationPreparationWork(progress.workId!);
      const taskIntentId = progress.projection!.taskIntent!.taskIntentId;
      const plan = book.store.inspectTaskPlan({ bookId: book.bookId, kind: 'initial-evaluation', ref: taskIntentId });
      expect(plan).toMatchObject({ kind: 'initial-evaluation', ref: taskIntentId, state: { key: 'ready' }, start: { readiness: 'ready', needsModelConnection: false } });
      expect(plan.steps.map((step) => step.label)).toEqual(['逐章读取，记下各评分项的依据', '全书综合']);
      expect(plan.goal.chips.procedure).toBe('审稿评估方案 第 1 版');
      expect(plan.notDo.editorial).toContain('不选结论：建议结论只标明是 AI7 的');
      expect(book.store.inspectEvaluation(book.bookId, null).initial.task).toMatchObject({ taskIntentId, state: 'prepared' });

      const authorized = book.store.authorizeInitialEvaluation(book.bookId, taskIntentId, plan.start.planEnvelopeDigest!);
      book.owner.admitOrQueue(authorized.dispatchRunRecordId!, book.store.initialEvaluationLedger);
      await book.owner.whenIdle();
      const settled = book.store.inspectInitialEvaluation(book.bookId);
      expect(settled.state).toBe('settled');
      const revision = settled.resultSetRevision!;
      expect(revision.coverage).toMatchObject({ state: 'complete', unitsTotal: 8, unitsClosed: 8 });
      expect(revision.reducerClosure.stages.map((stage) => [stage.stage, stage.state])).toEqual([
        ['unit-validation', 'closed'], ['cross-unit-reduction', 'closed'], ['book-synthesis', 'closed'], ['assurance-sampling', 'not-run'],
      ]);
      expect(revision.assurance).toMatchObject({ state: 'limited', statement: INITIAL_EVALUATION_ASSURANCE_STATEMENT });
      const evaluation = revision.evaluation;
      expect(evaluation.synthesis).toEqual({ state: 'closed', reason: null });
      expect(evaluation.items.map((item) => [item.itemId, item.score, item.sufficiency, item.unitsCited])).toEqual([
        ['literary-quality', 16.5, 'sufficient', 8],
        ['theme-and-context', 15, 'fair', 3],
        ['structure-and-coherence', 15.5, 'sufficient', 8],
        ['chinese-language', 14, 'sufficient', 7],
        ['readers-and-market', 12, 'insufficient', 0],
      ]);
      // Distinct blocks: a block cited twice for one item, or seen again as the next range's overlap, counts once.
      expect(evaluation.items.map((item) => item.citedBlocks)).toEqual([19, 6, 16, 9, 0]);
      // Every observation cites blocks of the revision AI7 read, resolved from the positions the contract named.
      const blocks = new Set(book.store.initialEvaluationLedger.readRevisionBlocks(book.manuscriptId, revision.manuscriptPin.revisionId).map((block) => block.blockId));
      expect(evaluation.items.flatMap((item) => item.observations.flatMap((observation) => observation.blockIds)).every((blockId) => blocks.has(blockId))).toBe(true);
      expect(evaluation.suggestedConclusion).toBe('revise');
      expect(runReportUsageReconciles(settled.taskOutcome!.report!, revision.usage)).toBe(true);
      expect(book.store.inspectTaskPlan({ bookId: book.bookId, kind: 'initial-evaluation', ref: taskIntentId }).state.key).toBe('settled');

      // 评估 now names it, and a version can begin from it.
      const after = book.store.inspectEvaluation(book.bookId, null);
      expect(after.initial.task).toMatchObject({ taskIntentId, state: 'settled' });
      expect(after.initial.prepare).toEqual({ allowed: true, mode: 'evaluation-again' });
      expect(after.initial.latest).toMatchObject({ revisionId: revision.revisionId, ordinal: 1, revisionLabel: 'r1', complete: true, current: true,
        total: { score: 73, fullMarks: 100, notRated: 0, unscored: 0 }, suggestedConclusion: 'revise' });
      expect(after.start).toEqual({ allowed: true, kind: 'first', fromInitial: { revisionId: revision.revisionId, ordinal: 1 } });
      // What each score rests on travels with it (EVAL-006): AI7's notes range by range, with the blocks they cite; every range read.
      expect(after.initial.latest!.items.map((item) => item.evidence)).toEqual(evaluation.items.map((item) =>
        item.observations.map((observation) => ({ unitOrdinal: observation.unitOrdinal, note: observation.note, blockIds: observation.blockIds }))));
      expect(after.initial.latest!.items.map((item) => item.evidence.length > 0)).toEqual([true, true, true, true, false]);
      expect(after.initial.latest).toMatchObject({ unitsTotal: 8, unreadUnits: [] });
    });
  }, 300_000);

  it('begins a version from AI7\'s draft, keeps the editor\'s scores with their reasons, and counts the Book once toward calibration', async () => {
    await withBook(async (book) => {
      await runInitialEvaluation(book);
      expect(book.store.inspectEvaluationCalibration().calibration).toMatchObject({ adjustments: 0, initialScoresConnected: true });

      // 从 AI7 初评开始: AI7's scores and words are the starting point, beside the version; no risk and no conclusion are AI7's.
      const draft = book.store.startEvaluation(book.bookId, true).record!;
      expect(draft).toMatchObject({ ordinal: 1, state: 'draft', entries: 1, conclusion: null, total: { score: 73, fullMarks: 100 } });
      expect(draft.content.items.map((item) => [item.score, item.adjustment])).toEqual(AI7_SCORES.map((score) => [score, null]));
      expect(draft.content.risks.every((risk) => risk.level === null)).toBe(true);
      expect(draft.content.strengths.length).toBe(2);
      expect(draft.initial).toMatchObject({ ordinal: 1, revisionLabel: 'r1', suggestedConclusion: 'revise', complete: true });
      expect(draft.initial!.items.map((item) => item.score)).toEqual(AI7_SCORES);
      // The snapshot keeps AI7's evidence for each item, so the version shows what each of AI7's scores rests on.
      expect(draft.initial!.items.map((item) => item.evidence)).toEqual(book.store.inspectEvaluation(book.bookId, null).initial.latest!.items.map((item) => item.evidence));
      expect(draft.initial!.unreadUnits).toEqual([]);
      expect(book.store.inspectEvaluation(book.bookId, null).records.map((record) => record.state)).toEqual(['draft']);

      const save = (expectedEntries: number, content: EvaluationContent, finalize = false) =>
        book.store.saveEvaluation({ bookId: book.bookId, recordId: draft.recordId, expectedEntries, content, finalize });
      // A reason for a score that agrees with AI7's says nothing and is not kept — a save of that alone records nothing new;
      // 自行输入 needs the editor's words.
      expect(await refusal(() => save(1, adjust(draft.content, 0, 16.5, { reasons: ['too-high'], note: null })))).toBe('EVALUATION_UNCHANGED:评估没有变化。');
      const agreeing = save(1, { ...adjust(draft.content, 0, 16.5, { reasons: ['too-high'], note: null }), verdict: '整体可用，需修改。' }).record!;
      expect(agreeing.state).toBe('editing');
      expect(agreeing.content.items[0]!.adjustment).toBeNull();
      expect(await refusal(() => save(2, adjust(agreeing.content, 4, 10, { reasons: ['own'], note: null }))))
        .toBe('EVALUATION_ADJUSTMENT_NOTE:「读者与市场潜力」选了「自行输入」，要写明原因。');
      expect(await refusal(() => save(2, adjust(agreeing.content, 4, 10, { reasons: ['too-high'], note: '多余的话' }))))
        .toBe('EVALUATION_CONTENT_INVALID:只有选「自行输入」时才写原因。');
      // The editor's score departs from AI7's, with the reasons ticked, in the five's own order.
      const adjusted = save(2, adjust(agreeing.content, 4, 10, { reasons: ['own', 'too-high'], note: '市场资料尚未收集' })).record!;
      expect(adjusted.content.items[4]).toMatchObject({ score: 10, adjustment: { reasons: ['too-high', 'own'], note: '市场资料尚未收集' } });
      expect(adjusted.total).toEqual({ score: 71, fullMarks: 100, notRated: 0, unscored: 0 });
      // Still being scored, it adjusted nothing yet.
      expect(book.store.inspectEvaluationCalibration().calibration.adjustments).toBe(0);
      const finalized = save(3, {
        ...adjusted.content,
        risks: [
          { riskId: 'facts-and-sources', level: 'low', statement: '已核对事实和来源。', reviewed: false },
          { riskId: 'law-rights-ethics-policy', level: 'low', statement: '未见法律与政策风险。', reviewed: false },
        ],
        conclusion: 'revise',
      }, true).record!;
      expect(finalized).toMatchObject({ state: 'finalized', conclusion: 'revise' });
      expect(book.store.inspectEvaluationCalibration().calibration).toMatchObject({ adjustments: 1, initialScoresConnected: true, active: false });

      // 重新评估 alone carries the editor's scores but no adjustment: its start is its own.
      const again = book.store.startEvaluation(book.bookId).record!;
      expect(again).toMatchObject({ ordinal: 2, state: 'editing', initial: null });
      expect(again.content.items.every((item) => item.adjustment === null)).toBe(true);
      const kept = book.store.saveEvaluation({ bookId: book.bookId, recordId: again.recordId, expectedEntries: 1, finalize: true,
        content: { ...again.content, items: again.content.items.map((item) => ({ ...item, adjustment: { reasons: ['too-low'], note: null } })), conclusion: 'defer' } }).record!;
      expect(kept.content.items.every((item) => item.adjustment === null)).toBe(true);
      // A second 定稿 of the same Book counts it once — one begun from AI7's 初评 and adjusted again included.
      expect(book.store.inspectEvaluationCalibration().calibration.adjustments).toBe(1);
      const third = book.store.startEvaluation(book.bookId, true).record!;
      expect(third).toMatchObject({ ordinal: 3, state: 'draft', comparison: { previousOrdinal: 2 } });
      book.store.saveEvaluation({ bookId: book.bookId, recordId: third.recordId, expectedEntries: 1, finalize: true,
        content: { ...adjust(third.content, 0, 18, { reasons: ['too-low'], note: null }), conclusion: 'revise' } });
      expect(book.store.inspectEvaluationCalibration().calibration.adjustments).toBe(1);

      // The manuscript moves on: the 初评 no longer reads the text as it stands, and nothing begins from it until 重新初评.
      const window = book.store.getManuscriptWindow(book.manuscriptId, book.branchId, null);
      const block = window.blocks.find((candidate) => candidate.kind === 'paragraph')!;
      book.store.flushJournalEdit({
        clientEditId: randomUUID(), manuscriptId: book.manuscriptId, branchId: book.branchId, baseRevisionId: window.revisionId, blockId: block.blockId,
        windowStartBlockId: window.blocks[0]!.blockId, baseBlockDigest: block.digest, expectedJournalSequence: window.journalSequence,
        fromGrapheme: 0, toGrapheme: 0, insertText: '〔初评后改动〕',
      });
      const moved = book.store.inspectEvaluation(book.bookId, null);
      expect(moved.initial.latest).toMatchObject({ current: false });
      expect(moved.start).toEqual({ allowed: true, kind: 'again', fromInitial: null });
      expect(await refusal(() => book.store.startEvaluation(book.bookId, true))).toBe('EVALUATION_INITIAL_UNAVAILABLE:稿件在最近一次 AI7 初评之后改过；请重新初评，再从初评开始。');
    });

    // The snapshot is immutable, as the rest of the record is.
    const database = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'));
    try {
      expect((database.prepare('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(DIALOGUE_SCHEMA_VERSION);
      expect(() => database.exec('UPDATE evaluation_initial_drafts SET canonical_json = canonical_json')).toThrowError(/EVALUATION_LEDGER_IMMUTABLE/u);
      expect(() => database.exec('DELETE FROM evaluation_initial_drafts')).toThrowError(/EVALUATION_LEDGER_IMMUTABLE/u);
      database.exec('DROP TRIGGER evaluation_initial_drafts_no_update');
      database.exec(`UPDATE evaluation_initial_drafts SET canonical_json = replace(canonical_json, '"score":16.5', '"score":20') WHERE rowid = (SELECT min(rowid) FROM evaluation_initial_drafts)`);
      database.exec(EVALUATION_INITIAL_DRAFT_TRIGGER_SQL.evaluation_initial_drafts_no_update!);
    } finally {
      database.close();
    }
    const reopened = await openStore();
    try {
      const bookId = reopened.listBooks(null).items.find((entry) => entry.title === '初评之书')!.bookId;
      expect(await refusal(() => reopened.inspectEvaluation(bookId, null))).toBe('no-error');
      const first = reopened.inspectEvaluation(bookId, null).records.find((record) => record.ordinal === 1)!;
      expect(await refusal(() => reopened.inspectEvaluation(bookId, first.recordId))).toBe('EVALUATION_RECORD_INVALID:评估记录已损坏。');
      reopened.markCleanShutdown();
    } finally {
      reopened.close();
    }
  }, 300_000);

  it('scores nothing when the synthesis does not close, says so, and begins no version from it', async () => {
    await withBook(async (book) => {
      // Only the first range is answered, and the synthesis over it is not: one closed range is enough to ask for it.
      const trimmed: ResolvedModelFixture = {
        ...fixture,
        entries: new Map([...fixture.entries].filter(([, entry]) => entry.unitOrdinal === 1)),
      };
      const owner = new BaselineAnalysisExecutionOwner({ ledger: book.store.baselineAnalysisLedger, launchPolicy, fixture: trimmed, secretResolver: { resolve: async () => null } });
      try {
        await runInitialEvaluation({ ...book, owner });
      } finally {
        await owner.dispose();
      }
      const revision = book.store.inspectInitialEvaluation(book.bookId).resultSetRevision!;
      expect(revision.coverage).toMatchObject({ unitsClosed: 1, gapCount: 7 });
      expect(revision.evaluation.synthesis.state).toBe('gap');
      expect(revision.evaluation.synthesis.reason).toContain('AI7_FIXTURE_MISMATCH');
      expect(revision.evaluation.items.every((item) => item.score === null)).toBe(true);
      expect(revision.reducerClosure.label).toBe('归约/综合闭合：已闭合 · 全书综合未给出分数');
      const workspace = book.store.inspectEvaluation(book.bookId, null);
      expect(workspace.initial.latest).toMatchObject({ complete: false, current: true, total: { score: 0, fullMarks: 100, unscored: 5 } });
      // The ranges it never read are named.
      expect(workspace.initial.latest).toMatchObject({ unitsTotal: 8, unreadUnits: [2, 3, 4, 5, 6, 7, 8] });
      expect(workspace.start).toEqual({ allowed: true, kind: 'first', fromInitial: null });
      expect(await refusal(() => book.store.startEvaluation(book.bookId, true)))
        .toBe('EVALUATION_INITIAL_UNAVAILABLE:最近一次 AI7 初评没有给出全部评分项的分数；请重新初评。');
    });
  }, 300_000);

  it('settles a 初评 a stopped AI7 left under way or waiting, so 评估 offers 重新初评 and polls nothing', async () => {
    let bookId = '';
    await withBook(async (book) => {
      bookId = book.bookId;
      await runInitialEvaluation(book);
    });
    // The states the renderer polls while the 初评 reads as under way (evaluation.ts).
    const polled = ['waiting', 'admitted', 'executing', 'cancelling', 'pausing', 'queued'];
    for (const planted of ['authorized', 'admitted', 'executing'] as const) {
      const first = await openStore();
      let runRecordId: string;
      try {
        let progress = first.createInitialEvaluationPreparationWork(bookId, launchPolicy);
        while (!progress.done) progress = first.advanceInitialEvaluationPreparationWork(progress.workId!);
        const prepared = progress.projection!;
        expect(prepared.taskIntent!.mode).toBe('evaluation-again');
        // AI7 closes with the Run authorized and not admitted, or admitted, or reading: nothing executes it any more.
        runRecordId = first.authorizeInitialEvaluation(bookId, prepared.taskIntent!.taskIntentId, prepared.planEnvelope!.digest).dispatchRunRecordId!;
        if (planted !== 'authorized') first.initialEvaluationLedger.recordRunState(runRecordId, 'admitted', { detail: 'planted' });
        if (planted === 'executing') first.initialEvaluationLedger.recordRunState(runRecordId, 'executing', { detail: 'planted' });
        expect(first.initialEvaluationLedger.currentRunState(runRecordId)).toBe(planted);
      } finally {
        first.close();
      }
      const second = await openStore();
      try {
        // Unreconciled, the 初评 reads as under way for good: no 重新初评, and a state the renderer polls.
        const stuck = second.inspectEvaluation(bookId, null).initial;
        expect(stuck.prepare.allowed).toBe(false);
        expect(polled).toContain(stuck.task!.state);

        expect(second.reconcileStoppedInitialEvaluationRuns()).toEqual({ settled: 1 });
        const settled = second.inspectInitialEvaluation(bookId);
        if (planted === 'authorized') {
          // It never began: blocked before dispatch with why, no outcome.
          expect(settled.state).toBe('authorized-blocked');
          expect(settled.run).toMatchObject({ runRecordId, state: 'blocked-before-dispatch', blockedReasons: [RECONCILED_QUEUED_DETAIL] });
          expect(settled.taskOutcome).toBeNull();
        } else {
          // This kind cannot resume: 已中断, with its outcome, no revision — and never 可续行.
          expect(settled.state).toBe('interrupted');
          expect(settled.run).toMatchObject({ runRecordId, state: 'interrupted' });
          expect(settled.taskOutcome).toMatchObject({ classification: 'interrupted', resultSetRevisionId: null, safeNextAction: RECONCILED_INTERRUPTED_DETAIL });
        }
        // The latest settled 初评 is still the one AI7 drafted from, and 重新初评 is offered at once.
        const initial = second.inspectEvaluation(bookId, null).initial;
        expect(initial.prepare).toEqual({ allowed: true, mode: 'evaluation-again' });
        expect(polled).not.toContain(initial.task!.state);
        expect(initial.latest).toMatchObject({ complete: true, current: true });
        // A second reconciliation settles nothing more.
        expect(second.reconcileStoppedInitialEvaluationRuns()).toEqual({ settled: 0 });
        second.markCleanShutdown();
      } finally {
        second.close();
      }
    }
  }, 300_000);

  it('offers no 初评 under a live scope, whose policy does not name the book-level synthesis, and prepares or starts none there', async () => {
    await withBook(async (book) => {
      const live = book.store.initialEvaluationLedger.launch;
      book.store.initialEvaluationLedger.bindLaunch({
        operationalScope: 'developer-live',
        live: {
          route: 'opencode-go',
          model: 'deepseek-v4-flash',
          endpoint: 'https://example.invalid/v1',
          credentialSlot: 'opencode-go',
          credentialReference: randomUUID(),
          runBudgetCeiling: { kind: 'tokens', maxTotalTokens: 100_000 },
        },
      });
      try {
        expect(book.store.inspectEvaluation(book.bookId, null).initial.prepare).toEqual({ allowed: false, reason: INITIAL_EVALUATION_LIVE_UNAVAILABLE });
        expect(await refusal(() => book.store.createInitialEvaluationPreparationWork(book.bookId, launchPolicy)))
          .toBe(`EVALUATION_INITIAL_UNAVAILABLE:${INITIAL_EVALUATION_LIVE_UNAVAILABLE}`);
        expect(await refusal(() => book.store.authorizeInitialEvaluation(book.bookId, randomUUID(), 'a'.repeat(64))))
          .toBe(`EVALUATION_INITIAL_UNAVAILABLE:${INITIAL_EVALUATION_LIVE_UNAVAILABLE}`);
      } finally {
        book.store.initialEvaluationLedger.bindLaunch(live);
      }
      // The provider-free scope is unaffected.
      expect(book.store.inspectEvaluation(book.bookId, null).initial.prepare).toEqual({ allowed: true, mode: 'evaluation-first' });
    });
  }, 300_000);

  it('rebuilds a revision-58 store\'s kind-coupled relations for the evaluation kind, every row kept byte for byte', async () => {
    await withBook(async (book) => {
      // A baseline Task, so the rebuilt relations carry rows.
      let progress = book.store.createBaselineAnalysisPreparationWork(book.bookId, '对当前书稿执行基线稿件分析，形成覆盖全部结构单元的结果集修订版。', null, launchPolicy);
      while (!progress.done) progress = book.store.advanceBaselineAnalysisPreparationWork(progress.workId!);
      expect(progress.projection!.state).toBe('prepared');
    });
    const path = join(roots.dataRoot, 'store', 'ai7.sqlite');
    const rows = (database: DatabaseSync): string => JSON.stringify(KIND_COUPLED_ANALYSIS_RELATIONS.map((table) => database.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()));
    const plant = new DatabaseSync(path);
    let before: string;
    try {
      // Revision 58 exactly: the three relations as revision 24 left them, and no relation of revision 59 or 60.
      plant.exec(`DROP TABLE dialogue_conversions; DROP TABLE dialogue_attempt_outcomes; DROP TABLE dialogue_harness_spans; DROP TABLE dialogue_execution_bindings; DROP TABLE dialogue_attempts; DROP TABLE dialogue_tasks; DROP TABLE evaluation_initial_drafts; PRAGMA user_version = ${DATABASE_MERGE_SCHEMA_VERSION};`);
      downgradeKindCoupledRelations(plant, ANALYSIS_LEDGER_REVISION_58_SQL);
      before = rows(plant);
      // At revision 58 the evaluation kind is refused by the CHECK itself.
      expect(() => plant.exec(`INSERT INTO analysis_result_sets(result_set_id, book_id, kind, created_at, canonical_json, sha256)
        VALUES ('${randomUUID()}', (SELECT book_id FROM books LIMIT 1), '${INITIAL_EVALUATION_KIND}', 'x', '{}', '${'a'.repeat(64)}')`)).toThrowError(/CHECK constraint failed/u);
    } finally {
      plant.close();
    }
    const migrated = await openStore();
    try {
      migrated.markCleanShutdown();
    } finally {
      migrated.close();
    }
    const after = new DatabaseSync(path, { readOnly: true });
    try {
      expect((after.prepare('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(DIALOGUE_SCHEMA_VERSION);
      expect(rows(after)).toBe(before!);
      for (const table of KIND_COUPLED_ANALYSIS_RELATIONS) {
        expect((after.prepare("SELECT sql FROM sqlite_schema WHERE type = 'table' AND name = ?").get(table) as { sql: string }).sql).toBe(ANALYSIS_LEDGER_SCHEMA_SQL[table]);
      }
      expect(after.prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'evaluation_initial_drafts'").get()).toBeDefined();
    } finally {
      after.close();
    }
  }, 300_000);

  it('refuses an entry of the adjustments\' schema whose item leaves its adjustment out', async () => {
    let bookId = '';
    let recordId = '';
    await withBook(async (book) => {
      bookId = book.bookId;
      await runInitialEvaluation(book);
      recordId = book.store.startEvaluation(book.bookId, true).record!.recordId;
    });
    // Rewritten whole, its digest with it: only the schema's own rule is left to notice.
    let original = '';
    const rewrite = (change: (json: string) => string): void => {
      const database = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'));
      try {
        const row = database.prepare('SELECT entry_id, canonical_json FROM evaluation_record_entries WHERE record_id = ?').get(recordId) as { entry_id: string; canonical_json: string };
        if (original === '') original = row.canonical_json;
        const json = change(original);
        database.exec('DROP TRIGGER evaluation_record_entries_no_update');
        database.prepare('UPDATE evaluation_record_entries SET canonical_json = ?, sha256 = ? WHERE entry_id = ?')
          .run(json, createHash('sha256').update(json).digest('hex'), row.entry_id);
        database.exec(EVALUATION_RECORD_TRIGGER_SQL.evaluation_record_entries_no_update!);
      } finally {
        database.close();
      }
    };
    const read = async (): Promise<string> => {
      const reopened = await openStore();
      try {
        const answer = await refusal(() => reopened.inspectEvaluation(bookId, recordId));
        if (answer === 'no-error') {
          // An entry written before S81b1 names no adjustment, and each item reads as having none.
          expect(reopened.inspectEvaluation(bookId, recordId).record!.content.items.map((item) => item.adjustment)).toEqual([null, null, null, null, null]);
        }
        reopened.markCleanShutdown();
        return answer;
      } finally {
        reopened.close();
      }
    };
    // As schema 1 wrote it — no item names an adjustment — it reads.
    rewrite((json) => json.replaceAll('"adjustment":null,', '').replace('"schema":"ai7.evaluation-entry/2"', '"schema":"ai7.evaluation-entry/1"'));
    expect(original).toContain('"schema":"ai7.evaluation-entry/2"');
    expect(await read()).toBe('no-error');
    // Schema 2 with one item's adjustment left out is refused.
    rewrite((json) => json.replace('"adjustment":null,', ''));
    expect(await read()).toBe('EVALUATION_RECORD_INVALID:评估记录已损坏。');
  }, 300_000);

  it('refuses a store stamped revision 58 whose kind-coupled relations already read as revision 59\'s', async () => {
    await withBook(async () => undefined);
    const path = join(roots.dataRoot, 'store', 'ai7.sqlite');
    const plant = new DatabaseSync(path);
    try {
      // Only the version moves back: no store AI7 wrote at revision 58 held these shapes, and none is read as one.
      plant.exec(`DROP TABLE dialogue_conversions; DROP TABLE dialogue_attempt_outcomes; DROP TABLE dialogue_harness_spans; DROP TABLE dialogue_execution_bindings; DROP TABLE dialogue_attempts; DROP TABLE dialogue_tasks; DROP TABLE evaluation_initial_drafts; PRAGMA user_version = ${DATABASE_MERGE_SCHEMA_VERSION};`);
    } finally {
      plant.close();
    }
    await expect(openStore()).rejects.toThrowError(/分析任务账本表（修订版 58） analysis_task_intents 结构不兼容/u);
  }, 300_000);
});
