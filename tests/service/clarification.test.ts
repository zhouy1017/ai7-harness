import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync, type SQLOutputValue } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CLARIFICATION_CANCELLED_ANSWERED, CLARIFICATION_CANCELLED_UNANSWERED, CLARIFICATION_RECORD_GAP } from '../../src/service/analysis/clarifications.js';
import { BaselineAnalysisExecutionOwner } from '../../src/service/analysis/execution.js';
import { ASK_FIRST_SAFE_RETRY_STATEMENT } from '../../src/service/analysis/plan-boundary.js';
import { PLAN_EDIT_ADAPTATION_LABELS } from '../../src/service/analysis/plan-edits.js';
import { resolveSourceCheckoutLaunchPolicy } from '../../src/service/launch-policy.js';
import { loadModelFixture, type ResolvedModelFixture } from '../../src/service/provider/model-fixture.js';
import { EditorialStore, StoreError } from '../../src/service/store.js';
import { CLARIFICATION_SCHEMA_VERSION, REIMPORT_GROUP_SCHEMA_VERSION } from '../../src/service/task-authorization.js';
import {
  ANSWER_BLOCKED_OFFLINE,
  RESUME_BLOCKED_BINDING,
  CLARIFICATION_SCOPE_CONTINUING,
  CLARIFICATION_SCOPE_WAITING,
  CLARIFICATION_UNANSWERABLE_ENDED,
  clarificationQuestion,
} from '../../src/service/task-plan.js';
import { controlledUnitHold } from '../../src/service/unit-hold.js';
import {
  BASELINE_ANALYSIS_TASK_GOAL,
  type BaselineAnalysisProjection,
  type LaunchPolicyProjection,
} from '../../src/shared/protocol.js';
import { CLARIFICATION_RELATIONS_DROP_ORDER, plantRevision34Relations, runStatesShapeAt34 } from '../support/clarifications.js';
import { REIMPORT_GROUP_RELATIONS_DROP_ORDER } from '../support/reimport-groups.js';
import { importSample1Book, pinEditorialWorkspaceProfileRevision2, recordMissingCredentialConnection } from '../support/sample1-baseline.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';

// Service-integration suite (L2) for Clarification Requests (Issue #422, plan slice S76d; V2-UX-CLAR-001 to CLAR-007,
// PLAN-011, PLAN-012): the real store on a temporary Agent Data Root, exact `sample1` imported through the supported path,
// J-04's deterministic route over the transient-retry fixture — unit 2 fails for good, unit 5's first attempt fails
// retry-safe — and no Provider, socket or credential value. The safe retry moved into 先问你 makes the Run ask instead of
// retrying: the unit waits while the others are read, the Run then waits holding nothing, and the editor's answer takes
// it on — retrying, or settling the unit as the gap it is — whether it comes while the Run reads on or once it waits.

type Row = Record<string, SQLOutputValue>;

let roots: ServiceTestRoots;
let launchPolicy: LaunchPolicyProjection;
let happy: ResolvedModelFixture;
let transient: ResolvedModelFixture;
let holdPath: string;

const FIXTURES_ROOT = resolve(fileURLToPath(new URL('../fixtures/model/', import.meta.url)));
const ASK_FIRST = { removedSteps: [], disallowedAdaptations: [], askFirstAdaptations: ['safe-retry'] } as const;

beforeEach(async () => {
  roots = await createServiceTestRoots('ai7-service-clarification-');
  launchPolicy = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot);
  expect(launchPolicy.integrityState).toBe('verified');
  happy = await loadModelFixture(FIXTURES_ROOT, 'sample1-baseline-happy');
  transient = await loadModelFixture(FIXTURES_ROOT, 'sample1-baseline-transient-retry');
  holdPath = join(roots.dataRoot, '..', 'j10-unit-hold.txt');
  writeFileSync(holdPath, 'release');
});

afterEach(async () => {
  await roots.dispose();
});

function openWithRoute(fixture: ResolvedModelFixture): Promise<EditorialStore> {
  return EditorialStore.open(roots.dataRoot, roots.codeRoot, {
    induceUnprovableReconciliation: false,
    persistLegacyReviewedDraft: false,
    induceReimportProofTamper: false,
    induceAbandonObjectRemovalFailure: false,
    interruptAfterAbandonObjectRemoval: false,
    baselineAnalysisRoute: { fixtureIdentity: fixture.identity, fixtureSha256: fixture.sha256, fixtureLineage: fixture.lineage },
  });
}

function owner(store: EditorialStore, fixture: ResolvedModelFixture, held = false): BaselineAnalysisExecutionOwner {
  return new BaselineAnalysisExecutionOwner({
    ledger: store.baselineAnalysisLedger,
    launchPolicy,
    fixture,
    secretResolver: { resolve: async () => null },
    ...(held ? { unitHold: controlledUnitHold(holdPath, { pollMs: 5 }) } : {}),
  });
}

function prepare(store: EditorialStore, bookId: string): BaselineAnalysisProjection {
  let progress = store.createBaselineAnalysisPreparationWork(bookId, BASELINE_ANALYSIS_TASK_GOAL, null, launchPolicy);
  while (!progress.done) progress = store.advanceBaselineAnalysisPreparationWork(progress.workId!);
  return progress.projection!;
}

async function importedBook(store: EditorialStore, title: string, connection = true): Promise<string> {
  const imported = await importSample1Book(store, roots.codeRoot, title);
  await pinEditorialWorkspaceProfileRevision2(store, imported.bookId);
  // The one Main Editorial Role connection is recorded once, with the first Book.
  if (connection) recordMissingCredentialConnection(store, 'L2 主编辑连接');
  return imported.bookId;
}

/** A first baseline whose safe retry is asked first, authorized: its Task and its Run. */
function askingRun(store: EditorialStore, bookId: string): { taskIntentId: string; runRecordId: string; planEnvelopeDigest: string } {
  const prepared = prepare(store, bookId);
  const taskIntentId = prepared.taskIntent!.taskIntentId;
  const edited = store.editBaselineAnalysisPlan({ bookId, taskIntentId, planEnvelopeDigest: prepared.planEnvelope!.digest, ...ASK_FIRST });
  const planEnvelopeDigest = edited.planEnvelope!.digest;
  const runRecordId = store.authorizeBaselineAnalysis(bookId, taskIntentId, planEnvelopeDigest).dispatchRunRecordId!;
  return { taskIntentId, runRecordId, planEnvelopeDigest };
}

async function refusal(operation: () => unknown): Promise<string> {
  try {
    await operation();
  } catch (error) {
    if (error instanceof StoreError) return error.code;
    throw error;
  }
  return 'no-error';
}

async function until(condition: () => boolean, label: string): Promise<void> {
  const deadline = Date.now() + 60_000;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${label}`);
    await new Promise((settle) => setTimeout(settle, 5));
  }
}

const states = (projection: BaselineAnalysisProjection): string[] => projection.run!.transitions.map((transition) => transition.state);
const turns = (projection: BaselineAnalysisProjection): number[][] => projection.run!.attempt!.spans.map((span) => [span.unitOrdinal!, span.attemptIndex]);

function withDatabase<T>(readOnly: boolean, operation: (database: DatabaseSync) => T): T {
  const database = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'), { readOnly });
  try {
    return operation(database);
  } finally {
    database.close();
  }
}

function relationTruth(database: DatabaseSync): Map<string, { sql: string; content: string }> {
  const relations = database.prepare("SELECT name, sql FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as Row[];
  return new Map(relations.map((relation) => {
    const rows = database.prepare(`SELECT * FROM "${relation.name}"`).all() as Row[];
    const hash = createHash('sha256');
    for (const row of rows) {
      for (const column of Object.keys(row).sort()) {
        const value = row[column]!;
        hash.update(JSON.stringify([column, value instanceof Uint8Array ? [...value] : typeof value === 'bigint' ? value.toString() : value]));
      }
    }
    return [String(relation.name), { sql: String(relation.sql), content: `${rows.length}:${hash.digest('hex')}` }];
  }));
}

describe('schema revision 35 over the real store', () => {
  it('widens a planted revision-34 store\'s Run states with every row as it was, and adds the clarification relations empty', async () => {
    const first = await openWithRoute(happy);
    const execution = owner(first, happy);
    try {
      const bookId = await importedBook(first, 'L2 sample1 澄清迁移');
      const prepared = prepare(first, bookId);
      execution.admitAndDispatch(first.authorizeBaselineAnalysis(bookId, prepared.taskIntent!.taskIntentId, prepared.planEnvelope!.digest).dispatchRunRecordId!);
      await execution.whenIdle();
      first.markCleanShutdown();
    } finally {
      await execution.dispose();
      first.close();
    }
    const before = withDatabase(false, (database) => {
      plantRevision34Relations(database);
      database.exec('PRAGMA user_version = 34');
      expect(runStatesShapeAt34(database)).toBe('revision-34');
      return { states: database.prepare('SELECT rowid, * FROM analysis_run_states ORDER BY rowid').all() as Row[], truth: relationTruth(database) };
    });
    expect(before.states.length).toBeGreaterThan(0);
    const migrated = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      migrated.markCleanShutdown();
    } finally {
      migrated.close();
    }
    withDatabase(true, (database) => {
      expect((database.prepare('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(REIMPORT_GROUP_SCHEMA_VERSION);
      expect(runStatesShapeAt34(database)).toBe('current');
      expect(database.prepare('SELECT rowid, * FROM analysis_run_states ORDER BY rowid').all()).toEqual(before.states);
      const after = relationTruth(database);
      expect([...after.keys()]).toEqual([...before.truth.keys(), ...REIMPORT_GROUP_RELATIONS_DROP_ORDER, ...CLARIFICATION_RELATIONS_DROP_ORDER].sort());
      for (const relation of CLARIFICATION_RELATIONS_DROP_ORDER) expect(after.get(relation)?.content).toMatch(/^0:/);
      expect([...before.truth].filter(([name, was]) => after.get(name)!.sql !== was.sql).map(([name]) => name)).toEqual(['analysis_run_states']);
      expect([...before.truth].filter(([name, was]) => after.get(name)!.content !== was.content).map(([name]) => name)).toEqual(['service_lifetimes']);
      // Still a ledger: nothing rewrites or removes a question or its answer.
      for (const relation of CLARIFICATION_RELATIONS_DROP_ORDER) {
        expect(database.prepare("SELECT name FROM sqlite_schema WHERE type = 'trigger' AND tbl_name = ? ORDER BY name").all(relation))
          .toEqual([{ name: `${relation}_no_delete` }, { name: `${relation}_no_update` }]);
      }
      expect(database.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    });
  }, 300_000);
});

describe('Clarification Requests over the real store', () => {
  it('moves the safe retry into 先问你 as the next plan version, and the plan says where the editor may be asked', async () => {
    const store = await openWithRoute(transient);
    try {
      const bookId = await importedBook(store, 'L2 sample1 先问你');
      const prepared = prepare(store, bookId);
      const taskIntentId = prepared.taskIntent!.taskIntentId;
      const planEnvelopeDigest = prepared.planEnvelope!.digest;
      // Withheld and asked first at once is not an edit this plan can take.
      expect(await refusal(() => store.editBaselineAnalysisPlan({
        bookId, taskIntentId, planEnvelopeDigest, removedSteps: [], disallowedAdaptations: ['safe-retry'], askFirstAdaptations: ['safe-retry'],
      }))).toBe('ANALYSIS_PLAN_EDIT_INVALID');
      const edited = store.editBaselineAnalysisPlan({ bookId, taskIntentId, planEnvelopeDigest, ...ASK_FIRST });
      expect(edited.planVersion).toMatchObject({ ordinal: 2, edits: ASK_FIRST });
      expect(edited.planEnvelope!.boundary).toMatchObject({
        adaptable: [],
        askFirst: [{ adaptationClass: 'safe-retry' }],
        participation: { expected: true, statement: ASK_FIRST_SAFE_RETRY_STATEMENT },
      });
      expect(edited.planRevisions.at(-1)!.diff.map((entry) => [entry.field, entry.prior, entry.proposed, entry.materiality]))
        .toEqual([['adaptations.safe-retry', '允许', '先问你', 'edited']]);
      const plan = store.inspectTaskPlan({ bookId, kind: 'baseline-analysis', ref: taskIntentId });
      expect(plan.boundary.adaptable).toEqual([
        { id: 'safe-retry', label: PLAN_EDIT_ADAPTATION_LABELS['safe-retry'], removable: true, removed: false, movable: true, askFirst: true },
      ]);
      expect(plan.participation.during).toBe(ASK_FIRST_SAFE_RETRY_STATEMENT);
      expect(plan.clarifications).toEqual([]);
      // 恢复 is an edit like any other: the next version lets AI7 retry on its own again, and names nothing asked first.
      const restored = store.editBaselineAnalysisPlan({
        bookId, taskIntentId, planEnvelopeDigest: edited.planEnvelope!.digest, removedSteps: [], disallowedAdaptations: [],
      });
      expect(restored.planVersion).toMatchObject({ ordinal: 3, edits: { removedSteps: [], disallowedAdaptations: [] } });
      expect(restored.planVersion!.edits).not.toHaveProperty('askFirstAdaptations');
      expect(restored.planEnvelope!.boundary).toMatchObject({ adaptable: [{ adaptationClass: 'safe-retry' }], participation: { expected: false } });
      expect(restored.planEnvelope!.boundary).not.toHaveProperty('askFirst');
      store.markCleanShutdown();
    } finally {
      store.close();
    }
  }, 300_000);

  it('asks before the retry, reads what does not depend on the answer, waits holding nothing, and goes on once answered', async () => {
    const store = await openWithRoute(transient);
    const execution = owner(store, transient);
    try {
      const bookId = await importedBook(store, 'L2 sample1 澄清');
      const { taskIntentId, runRecordId } = askingRun(store, bookId);
      execution.admitAndDispatch(runRecordId);
      await execution.whenIdle();
      // Unit 5 asked instead of retrying; every other unit was read, and the Run waits at that boundary.
      const waiting = store.inspectBaselineAnalysis(bookId, () => null);
      expect(waiting.state).toBe('awaiting-clarification');
      expect(waiting.stateLabel).toBe('任务等待你的说明');
      expect(states(waiting)).toEqual(['authorized', 'admitted', 'executing', 'awaiting-clarification']);
      expect(turns(waiting)).toEqual([[1, 1], [2, 1], [3, 1], [4, 1], [5, 1], [6, 1], [7, 1], [8, 1]]);
      expect(waiting.run!.adaptations).toEqual([]);
      expect(waiting.resultSetRevision).toBeNull();
      expect(execution.busy).toBe(false);
      expect(store.baselineAnalysisLedger.unitCheckpoints(runRecordId).map((checkpoint) => checkpoint.unit.unitOrdinal)).toEqual([1, 2, 3, 4, 6, 7, 8]);
      // The card: the question, why it is asked, that the whole Task waits, and the two choices — none chosen.
      const plan = store.inspectTaskPlan({ bookId, kind: 'baseline-analysis', ref: taskIntentId });
      expect(plan.state).toEqual({ key: 'awaiting-clarification', label: '任务等待你的说明' });
      expect(plan.clarifications).toHaveLength(1);
      const card = plan.clarifications[0]!;
      expect(card).toMatchObject({ unitOrdinal: 5, planVersion: 2, state: 'open', scope: CLARIFICATION_SCOPE_WAITING, question: clarificationQuestion(5), answer: null, answerable: { reason: null } });
      expect(card.detail).toContain('PROVIDER_ERROR');
      expect(card.options.map((option) => [option.id, option.recommended !== null])).toEqual([['retry', true], ['record-gap', false]]);
      expect(plan.runControl).toMatchObject({ resume: null, redo: { reason: null }, cancel: { reason: null } });
      // 待我处理: a named decision the Task waits for, counted.
      const attention = store.inspectGlobalAttention(() => null, false);
      const decisions = attention.groups.find((group) => group.key === 'decisions')!;
      expect(decisions.items.map((entry) => [entry.state, entry.blocked, entry.nextStep])).toEqual([['analysis-clarification', true, 'answer-clarification']]);
      // Answers are refused when they name another Task, no option, or a question already answered.
      expect(await refusal(() => store.answerBaselineAnalysisClarification({ bookId, taskIntentId: runRecordId, requestId: card.requestId, optionId: 'retry', note: null }))).toBe('ANALYSIS_CLARIFICATION_STALE');
      expect(await refusal(() => store.answerBaselineAnalysisClarification({ bookId, taskIntentId, requestId: card.requestId, optionId: 'maybe', note: null }))).toBe('ANALYSIS_CLARIFICATION_INVALID');
      // 再试一次, with a note that qualifies it: recorded, and the Run goes on — retrying unit 5 as its second attempt.
      const answered = store.answerBaselineAnalysisClarification({ bookId, taskIntentId, requestId: card.requestId, optionId: 'retry', note: ' 服务刚才在维护 ' });
      expect(answered).toEqual({ runRecordId, runState: 'awaiting-clarification' });
      expect(await refusal(() => store.answerBaselineAnalysisClarification({ bookId, taskIntentId, requestId: card.requestId, optionId: 'record-gap', note: null }))).toBe('ANALYSIS_CLARIFICATION_ANSWERED');
      expect(execution.continueAnswered(runRecordId, store.baselineAnalysisLedger)).toBe('continuing');
      await execution.whenIdle();
      const settled = store.inspectBaselineAnalysis(bookId, () => null);
      expect(settled.state).toBe('settled');
      expect(states(settled)).toEqual(['authorized', 'admitted', 'executing', 'awaiting-clarification', 'admitted', 'executing', 'completed-with-gaps']);
      expect(turns(settled)).toEqual([[1, 1], [2, 1], [3, 1], [4, 1], [5, 1], [6, 1], [7, 1], [8, 1], [5, 2]]);
      expect(settled.resultSetRevision!.units.map((unit) => unit.state)).toEqual(['closed', 'gap', 'closed', 'closed', 'closed', 'closed', 'closed', 'closed']);
      // The retry is the plan's declared adaptation, and its record names the answer that let AI7 make it.
      const answer = store.baselineAnalysisLedger.clarificationsOf(runRecordId)[0]!.answer!;
      expect(answer).toMatchObject({ optionId: 'retry', note: '服务刚才在维护' });
      expect(settled.run!.adaptations).toHaveLength(1);
      expect(settled.run!.adaptations[0]).toMatchObject({ unitOrdinal: 5, adaptationClass: 'safe-retry', clarificationAnswerId: answer.answerId });
      const after = store.inspectTaskPlan({ bookId, kind: 'baseline-analysis', ref: taskIntentId });
      expect(after.clarifications[0]).toMatchObject({ state: 'answered', answer: { optionId: 'retry', note: '服务刚才在维护', line: '你已回答：再试一次 · 说明：服务刚才在维护' } });
      // Nothing is asked of a Run that has ended.
      expect(await refusal(() => store.answerBaselineAnalysisClarification({ bookId, taskIntentId, requestId: card.requestId, optionId: 'retry', note: null }))).toBe('ANALYSIS_CLARIFICATION_STALE');
      store.markCleanShutdown();
    } finally {
      await execution.dispose();
      store.close();
    }
  }, 300_000);

  it('applies an answer given while the Run reads on at its next boundary, and 不重试 settles the unit as the gap it is', async () => {
    const store = await openWithRoute(transient);
    const execution = owner(store, transient, true);
    try {
      const bookId = await importedBook(store, 'L2 sample1 澄清继续');
      const { taskIntentId, runRecordId } = askingRun(store, bookId);
      // Five units may settle: 1 to 4 do, 5 asks, 6 settles, and 7 is held in flight.
      writeFileSync(holdPath, '5');
      execution.admitAndDispatch(runRecordId);
      await until(() => execution.progressFor(runRecordId)?.currentUnitOrdinal === 7, 'unit 7 in flight');
      const reading = store.inspectTaskPlan({ bookId, kind: 'baseline-analysis', ref: taskIntentId }, (id) => execution.progressFor(id));
      expect(reading.state.key).toBe('running');
      expect(reading.clarifications.map((card) => [card.unitOrdinal, card.state, card.scope])).toEqual([[5, 'open', CLARIFICATION_SCOPE_CONTINUING]]);
      const answered = store.answerBaselineAnalysisClarification({
        bookId, taskIntentId, requestId: reading.clarifications[0]!.requestId, optionId: 'record-gap', note: null,
      });
      expect(answered.runState).toBe('executing');
      writeFileSync(holdPath, 'release');
      await execution.whenIdle();
      // It never waited: the answer was found at the next boundary, and unit 5 is a gap in the editor's words, unretried.
      const settled = store.inspectBaselineAnalysis(bookId, () => null);
      expect(states(settled)).toEqual(['authorized', 'admitted', 'executing', 'completed-with-gaps']);
      expect(turns(settled)).toEqual([[1, 1], [2, 1], [3, 1], [4, 1], [5, 1], [6, 1], [7, 1], [8, 1]]);
      expect(settled.run!.adaptations).toEqual([]);
      const gap = settled.resultSetRevision!.gaps.find((entry) => entry.unitOrdinal === 5)!;
      expect(gap.code).toBe('adapter-failure');
      expect(gap.reason.endsWith(`；${CLARIFICATION_RECORD_GAP}`)).toBe(true);
      store.markCleanShutdown();
    } finally {
      await execution.dispose();
      store.close();
    }
  }, 300_000);

  it('cancels a Run that waits for its answer into its partial revision, the question left unanswered on record', async () => {
    const store = await openWithRoute(transient);
    const execution = owner(store, transient);
    try {
      const bookId = await importedBook(store, 'L2 sample1 澄清取消');
      const { taskIntentId, runRecordId } = askingRun(store, bookId);
      execution.admitAndDispatch(runRecordId);
      await execution.whenIdle();
      expect(store.inspectBaselineAnalysis(bookId, () => null).state).toBe('awaiting-clarification');
      expect(store.requestBaselineAnalysisCancel(bookId, taskIntentId)).toBe(runRecordId);
      execution.cancelRun(runRecordId, store.baselineAnalysisLedger);
      await execution.whenIdle();
      const cancelled = store.inspectBaselineAnalysis(bookId, () => null);
      expect(cancelled.run!.state).toBe('cancelled');
      const revision = cancelled.resultSetRevision!;
      expect(revision.units.map((unit) => unit.state)).toEqual(['closed', 'gap', 'closed', 'closed', 'gap', 'closed', 'closed', 'closed']);
      expect(revision.gaps.find((entry) => entry.unitOrdinal === 5)!.reason.endsWith(`；${CLARIFICATION_CANCELLED_UNANSWERED}`)).toBe(true);
      const plan = store.inspectTaskPlan({ bookId, kind: 'baseline-analysis', ref: taskIntentId });
      expect(plan.clarifications.map((card) => [card.state, card.answerable.reason])).toEqual([['unanswered', CLARIFICATION_UNANSWERABLE_ENDED]]);
      store.markCleanShutdown();
    } finally {
      await execution.dispose();
      store.close();
    }
  }, 300_000);

  it('takes a Run answered while another holds the slot on once it is free, and after AI7 closes before that', async () => {
    const store = await openWithRoute(transient);
    const execution = owner(store, transient, true);
    let next: BaselineAnalysisExecutionOwner | null = null;
    try {
      const first = await importedBook(store, 'L2 sample1 澄清排队甲');
      const second = await importedBook(store, 'L2 sample1 澄清排队乙', false);
      const asking = askingRun(store, first);
      execution.admitAndDispatch(asking.runRecordId);
      await execution.whenIdle();
      expect(store.inspectBaselineAnalysis(first, () => null).state).toBe('awaiting-clarification');
      // The second Book's Run takes the slot and is held with its second range in flight.
      const prepared = prepare(store, second);
      writeFileSync(holdPath, '1');
      const other = store.authorizeBaselineAnalysis(second, prepared.taskIntent!.taskIntentId, prepared.planEnvelope!.digest).dispatchRunRecordId!;
      execution.admitAndDispatch(other);
      await until(() => execution.progressFor(other)?.currentUnitOrdinal === 2, 'the other Run in flight');
      const card = store.inspectTaskPlan({ bookId: first, kind: 'baseline-analysis', ref: asking.taskIntentId }).clarifications[0]!;
      const answered = store.answerBaselineAnalysisClarification({ bookId: first, taskIntentId: asking.taskIntentId, requestId: card.requestId, optionId: 'retry', note: null });
      expect(execution.continueAnswered(answered.runRecordId, store.baselineAnalysisLedger)).toBe('queued');
      expect(store.inspectTaskPlan({ bookId: first, kind: 'baseline-analysis', ref: asking.taskIntentId }).clarifications.map((entry) => entry.state)).toEqual(['answered']);
      // AI7 closes before the slot is free: the answer stays recorded, and the next launch takes the Run on.
      await execution.dispose();
      expect(store.inspectBaselineAnalysis(first, () => null).run!.state).toBe('awaiting-clarification');
      expect(store.inspectBaselineAnalysis(second, () => null).run!.state).toBe('resumable');
      writeFileSync(holdPath, 'release');
      next = owner(store, transient);
      const reconciled = store.reconcileStoppedBaselineAnalysisRuns();
      expect(reconciled.answered).toEqual([asking.runRecordId]);
      for (const runRecordId of reconciled.answered) next.continueAnswered(runRecordId, store.baselineAnalysisLedger);
      await next.whenIdle();
      const settled = store.inspectBaselineAnalysis(first, () => null);
      expect(settled.run!.state).toBe('completed-with-gaps');
      expect(turns(settled).filter(([unit]) => unit === 5)).toEqual([[5, 1], [5, 2]]);
      store.markCleanShutdown();
    } finally {
      await execution.dispose();
      await next?.dispose();
      store.close();
    }
  }, 300_000);

  it('takes no answer while the Run could not go on by it, and says why on the card', async () => {
    const store = await openWithRoute(transient);
    const execution = owner(store, transient);
    let next: BaselineAnalysisExecutionOwner | null = null;
    try {
      const bookId = await importedBook(store, 'L2 sample1 澄清重新核对');
      const { taskIntentId, runRecordId } = askingRun(store, bookId);
      execution.admitAndDispatch(runRecordId);
      await execution.whenIdle();
      const input = { bookId, kind: 'baseline-analysis' as const, ref: taskIntentId };
      // Offline, under a route that reaches its model over the network: the answer waits for the network.
      const offline = await store.inspectTaskPlanWithConnection(input, async () => null, { reading: () => 'offline', reachesNetwork: () => true, slotBusy: () => false }, () => null);
      expect(offline.clarifications[0]).toMatchObject({ state: 'open', answerable: { reason: ANSWER_BLOCKED_OFFLINE } });
      // A busy slot only queues an answer: it is taken.
      const busy = await store.inspectTaskPlanWithConnection(input, async () => null, { reading: () => 'online', reachesNetwork: () => false, slotBusy: () => true }, () => null);
      expect(busy.clarifications[0]!.answerable.reason).toBeNull();
      // A launch that can no longer carry the Run's binding could not take it on by any answer, and its summary says
      // what it read cannot become a revision.
      await execution.dispose();
      next = owner(store, happy);
      const carrier = next;
      const moved = await store.inspectTaskPlanWithConnection(input, async () => null, {
        reading: () => 'online', reachesNetwork: () => false, slotBusy: () => false, carriesStoppedRun: (id) => carrier.carriesStoppedRun(id),
      }, () => null);
      expect(moved.clarifications[0]!.answerable.reason).toBe(RESUME_BLOCKED_BINDING);
      expect(moved.runControl?.cancel.impact[1]).toBe('执行绑定已经变化，已读完的 7 个阅读范围不能整理成结果集修订版；这次取消不会形成修订版。');
      expect(moved.runControl?.cancel.impact[2]).toBe('第 5 个阅读范围在等你的回答；取消后不再重试。');
      store.markCleanShutdown();
    } finally {
      await execution.dispose();
      await next?.dispose();
      store.close();
    }
  }, 300_000);

  it('names an answer a cancellation leaves unapplied, and ends its range as a gap in those words', async () => {
    const store = await openWithRoute(transient);
    const execution = owner(store, transient, true);
    try {
      const first = await importedBook(store, 'L2 sample1 已答未接着做甲');
      const second = await importedBook(store, 'L2 sample1 已答未接着做乙', false);
      const asking = askingRun(store, first);
      execution.admitAndDispatch(asking.runRecordId);
      await execution.whenIdle();
      // Another Book's Run holds the slot, so the answer is recorded and queued.
      const prepared = prepare(store, second);
      writeFileSync(holdPath, '1');
      const other = store.authorizeBaselineAnalysis(second, prepared.taskIntent!.taskIntentId, prepared.planEnvelope!.digest).dispatchRunRecordId!;
      execution.admitAndDispatch(other);
      await until(() => execution.progressFor(other)?.currentUnitOrdinal === 2, 'the other Run in flight');
      const input = { bookId: first, kind: 'baseline-analysis' as const, ref: asking.taskIntentId };
      const card = store.inspectTaskPlan(input).clarifications[0]!;
      store.answerBaselineAnalysisClarification({ bookId: first, taskIntentId: asking.taskIntentId, requestId: card.requestId, optionId: 'retry', note: null });
      expect(execution.continueAnswered(asking.runRecordId, store.baselineAnalysisLedger)).toBe('queued');
      // The summary names the range: answered, and not yet gone on by.
      expect(store.inspectTaskPlan(input).runControl?.cancel.impact).toContain('第 5 个阅读范围你已回答，但还没有按回答接着做；取消后不再重试，在这份修订版里记为缺口。');
      // Cancelled before it went on by the answer: nothing is retried, and the gap says the answer was not yet applied.
      store.requestBaselineAnalysisCancel(first, asking.taskIntentId);
      expect(execution.cancelRun(asking.runRecordId, store.baselineAnalysisLedger)).toBe('stopping');
      writeFileSync(holdPath, 'release');
      await execution.whenIdle();
      const cancelled = store.inspectBaselineAnalysis(first, () => null);
      expect(cancelled.run!.state).toBe('cancelled');
      expect(turns(cancelled).filter(([unit]) => unit === 5)).toEqual([[5, 1]]);
      expect(cancelled.resultSetRevision!.gaps.find((entry) => entry.unitOrdinal === 5)!.reason.endsWith(`；${CLARIFICATION_CANCELLED_ANSWERED}`)).toBe(true);
      store.markCleanShutdown();
    } finally {
      await execution.dispose();
      store.close();
    }
  }, 300_000);

  it('keeps the question across AI7 closing under the Run, and 续行 goes on to wait for the answer again', async () => {
    const store = await openWithRoute(transient);
    const execution = owner(store, transient, true);
    let next: BaselineAnalysisExecutionOwner | null = null;
    try {
      const bookId = await importedBook(store, 'L2 sample1 澄清重启');
      const { taskIntentId, runRecordId } = askingRun(store, bookId);
      writeFileSync(holdPath, '5');
      execution.admitAndDispatch(runRecordId);
      await until(() => execution.progressFor(runRecordId)?.currentUnitOrdinal === 7, 'unit 7 in flight');
      // AI7 closes with unit 7 held: the Run is 可续行, and the question it asked is still open.
      await execution.dispose();
      const resumable = store.inspectBaselineAnalysis(bookId, () => null);
      expect(resumable.run!.state).toBe('resumable');
      expect(store.inspectTaskPlan({ bookId, kind: 'baseline-analysis', ref: taskIntentId }).clarifications.map((card) => [card.unitOrdinal, card.state]))
        .toEqual([[5, 'open']]);
      writeFileSync(holdPath, 'release');
      next = owner(store, transient);
      next.admitAndDispatch(runRecordId, store.baselineAnalysisLedger, { resume: true });
      await next.whenIdle();
      // 续行 read unit 7 and 8, never unit 5 again: it waits for its answer, and so does the Run.
      const waiting = store.inspectBaselineAnalysis(bookId, () => null);
      expect(waiting.state).toBe('awaiting-clarification');
      expect(turns(waiting).filter(([unit]) => unit === 5)).toEqual([[5, 1]]);
      store.markCleanShutdown();
    } finally {
      await execution.dispose();
      await next?.dispose();
      store.close();
    }
  }, 300_000);
});
