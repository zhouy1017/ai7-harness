import { ModelRequestGovernor } from '../../src/service/analysis/execution.js';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BaselineAnalysisExecutionOwner, OUTCOME_UNKNOWN_NOT_RESENT, assuranceSamplingTurnGapReason } from '../../src/service/analysis/execution.js';
import { saysOutcomeUnknown } from '../../src/service/analysis/outcome-unknown.js';
import { RUN_REPORT_REFLECTION_PROMPT_CONTRACT_DIGEST, runReportReflectionRequestDigest } from '../../src/service/analysis/run-report-contract.js';
import { resolveSourceCheckoutLaunchPolicy } from '../../src/service/launch-policy.js';
import { fixtureEntryKey, loadModelFixture, type ModelFixtureEntry, type ResolvedModelFixture } from '../../src/service/provider/model-fixture.js';
import { EditorialStore } from '../../src/service/store.js';
import { BASELINE_ANALYSIS_TASK_GOAL, type BaselineAnalysisProjection, type LaunchPolicyProjection } from '../../src/shared/protocol.js';
import { importSample1Book, pinEditorialWorkspaceProfileRevision2, recordMissingCredentialConnection } from '../support/sample1-baseline.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';

// One explicit model-request capability per test application.
// Registered first: the stack-ordered final hook runs after existing consumer teardown.
let requestGovernor: ModelRequestGovernor;
beforeEach(() => { requestGovernor = new ModelRequestGovernor(); });
afterEach(async () => { requestGovernor.close(); await requestGovernor.whenIdle(); });

// Service-integration suite (L2) for the non-unit steps' 结果待确认 (Issue #757, item 3; V2-UX-CTRL-007, COPY-009, CONT-011,
// CONT-016; ADR 0034): the cross-unit reduction, a sample and the reflection, each driven to an ambiguous outcome — a sent
// request whose answer never comes back whole — through the deterministic route's fixture/replay seam. No Provider, socket
// or credential value. Each step records its reason in 结果待确认's own words, its one request is sent exactly once and is
// never re-sent automatically: the Run ends, and the way on is the editor's.
//
// A step has no gap code of its own on the Run Report (`saysOutcomeUnknown`, `outcome-unknown.ts`): the reduction's and the
// sample's recorded marker is the failure row's `gap` state and the reflection's is its own `ifRedone` state, and in all
// three the words are the record. The assertion each step's reason must satisfy is the ledger's own predicate.

let roots: ServiceTestRoots;
let launchPolicy: LaunchPolicyProjection;

const FIXTURES_ROOT = resolve(fileURLToPath(new URL('../fixtures/model/', import.meta.url)));
const UNKNOWN_REASON = '结果待确认：请求已发出，但回答没有完整传回，无法确认模型服务是否已处理并计费。（AI7_OUTCOME_UNKNOWN）';
/** `ambiguousTurnReason`'s words: the classified reason and the clause that nothing in the Run sends it again. */
const UNKNOWN_STEP_REASON = `${UNKNOWN_REASON}；${OUTCOME_UNKNOWN_NOT_RESENT}。`;
const DROPPED = { kind: 'outcome-unknown' as const, message: '合成：回答没有完整传回。' };

beforeEach(async () => {
  roots = await createServiceTestRoots('ai7-service-outcome-unknown-steps-');
  launchPolicy = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot);
  expect(launchPolicy.integrityState).toBe('verified');
});

afterEach(async () => {
  await roots.dispose();
});

function open(fixture: ResolvedModelFixture): Promise<EditorialStore> {
  return EditorialStore.open(roots.dataRoot, roots.codeRoot, {
    induceUnprovableReconciliation: false,
    persistLegacyReviewedDraft: false,
    induceReimportProofTamper: false,
    induceAbandonObjectRemovalFailure: false,
    interruptAfterAbandonObjectRemoval: false,
    baselineAnalysisRoute: { fixtureIdentity: fixture.identity, fixtureSha256: fixture.sha256, fixtureLineage: fixture.lineage },
  });
}

/** The owner over one fixture, recording every stage dispatch it observes — the test's own count of what was sent. */
function ownerOf(store: EditorialStore, fixture: ResolvedModelFixture, sent: Array<'cross-unit-reduction' | 'assurance-sampling'>): BaselineAnalysisExecutionOwner {
  return new BaselineAnalysisExecutionOwner({
    requestGovernor,
    ledger: store.baselineAnalysisLedger,
    launchPolicy,
    fixture,
    secretResolver: { resolve: async () => null },
    stageHold: async (stage) => { sent.push(stage); },
  });
}

/** The fixture with every entry `drop` names answering 结果待确认 instead; identity and digest stay, as the route bound them. */
function dropping(fixture: ResolvedModelFixture, drop: (entry: ModelFixtureEntry) => boolean): ResolvedModelFixture {
  return { ...fixture, entries: new Map([...fixture.entries].map(([key, entry]) => [key, drop(entry) ? { ...entry, response: DROPPED } : entry])) };
}

/**
 * The replay route's own count of the requests it answered 结果待确认. Every request it serves resolves its entry once, by
 * its `#<attempt>` key first (`resolveFixtureEntry`), so a step sent a second time is counted here whatever sends it —
 * the report's request count and the stage hold count what the owner kept, not what went out.
 */
class ServedEntries extends Map<string, ModelFixtureEntry> {
  unknownServed = 0;

  override get(key: string): ModelFixtureEntry | undefined {
    const hash = key.lastIndexOf('#');
    if (hash !== -1 && (super.get(key) ?? super.get(key.slice(0, hash)))?.response.kind === 'outcome-unknown') this.unknownServed += 1;
    return super.get(key);
  }
}

function counted(fixture: ResolvedModelFixture): { fixture: ResolvedModelFixture; entries: ServedEntries } {
  const entries = new ServedEntries(fixture.entries);
  return { fixture: { ...fixture, entries }, entries };
}

async function book(store: EditorialStore, title: string, recordConnection = true): Promise<string> {
  const imported = await importSample1Book(store, roots.codeRoot, title);
  await pinEditorialWorkspaceProfileRevision2(store, imported.bookId);
  // One Main Editorial Role connection serves the whole store; a second book reuses the first's record.
  if (recordConnection) recordMissingCredentialConnection(store, 'L2 主编辑连接');
  return imported.bookId;
}

async function run(store: EditorialStore, execution: BaselineAnalysisExecutionOwner, bookId: string): Promise<BaselineAnalysisProjection> {
  let progress = store.createBaselineAnalysisPreparationWork(bookId, BASELINE_ANALYSIS_TASK_GOAL, null, launchPolicy);
  while (!progress.done) progress = store.advanceBaselineAnalysisPreparationWork(progress.workId!);
  const prepared = progress.projection!;
  execution.admitAndDispatch(store.authorizeBaselineAnalysis(bookId, prepared.taskIntent!.taskIntentId, prepared.planEnvelope!.digest).dispatchRunRecordId!);
  await execution.whenIdle();
  return store.inspectBaselineAnalysis(bookId, () => null);
}

describe('结果待确认 in non-unit steps (Issue #757, item 3)', () => {
  it('records an ambiguous cross-unit reduction on the revision and the report, sent once, never re-sent', async () => {
    // From disk: J-10's reduction fixture reads all eight ranges and answers the reduction 结果待确认.
    const { fixture, entries } = counted(await loadModelFixture(FIXTURES_ROOT, 'sample1-baseline-reduction-unknown'));
    const store = await open(fixture);
    const sent: Array<'cross-unit-reduction' | 'assurance-sampling'> = [];
    const execution = ownerOf(store, fixture, sent);
    try {
      const bookId = await book(store, 'L2 sample1 归纳步骤结果待确认');
      const settled = await run(store, execution, bookId);
      // The Run completes: an unconfirmed step is a gap, never a failed or interrupted Run.
      expect(settled.taskOutcome?.classification).toMatch(/^completed/);
      expect(settled.run?.state).toMatch(/^completed/);
      // The step's own record on the revision, in 结果待确认's exact words.
      expect(settled.resultSetRevision?.crossUnitReduction).toMatchObject({ state: 'gap', reason: UNKNOWN_STEP_REASON });
      // The report's failure row: the recorded gap marker for a step, and the same words. A step has no cause
      // code of its own; the ledger reads the words (`saysOutcomeUnknown`), which is the record.
      const failure = settled.taskOutcome!.report!.failures.find((entry) => entry.stage === 'cross-unit-reduction');
      expect(failure).toEqual({ stage: 'cross-unit-reduction', code: 'gap', reason: UNKNOWN_STEP_REASON });
      expect(saysOutcomeUnknown(failure!.reason)).toBe(true);
      // Its request was sent exactly once: one dispatched turn, and no automatic re-send (ADR 0034; CONT-011/016).
      expect(settled.taskOutcome!.report!.usagePerStage['cross-unit-reduction'].requests).toBe(1);
      expect(sent.filter((stage) => stage === 'cross-unit-reduction')).toHaveLength(1);
      expect(entries.unknownServed).toBe(1);
      expect(settled.resultSetRevision?.crossUnitReduction?.requestDigest).toMatch(/^[0-9a-f]{64}$/);
      store.markCleanShutdown();
    } finally {
      await execution.dispose();
      store.close();
    }
  }, 300_000);

  it('records an ambiguous sample on the revision and the report, sent once, never re-sent', async () => {
    const happy = await loadModelFixture(FIXTURES_ROOT, 'sample1-baseline-happy');
    // The happy fixture's sampling answers, told apart by the result schema they carry, answer 结果待确认 instead. The
    // first turn is ambiguous and the sample stops there — one dispatched turn, never a retry.
    const { fixture, entries } = counted(dropping(happy, (entry) =>
      entry.unitOrdinal === 0 && entry.response.kind === 'unit-result' && entry.response.text.includes('assurance-sampling-result')));
    const store = await open(fixture);
    const sent: Array<'cross-unit-reduction' | 'assurance-sampling'> = [];
    const execution = ownerOf(store, fixture, sent);
    try {
      const bookId = await book(store, 'L2 sample1 抽样步骤结果待确认');
      const settled = await run(store, execution, bookId);
      expect(settled.taskOutcome?.classification).toMatch(/^completed/);
      expect(settled.run?.state).toMatch(/^completed/);
      // The step's own record on the revision: the drawn sample's first turn is its gap, in the sample's own
      // words around 结果待确认's, and the anchor unit is the one whose findings the turn judged.
      const expected = assuranceSamplingTurnGapReason(1, UNKNOWN_STEP_REASON);
      expect(settled.resultSetRevision?.assuranceSample).toMatchObject({ state: 'gap', reason: expected });
      const failure = settled.taskOutcome!.report!.failures.find((entry) => entry.stage === 'assurance-sampling');
      expect(failure).toEqual({ stage: 'assurance-sampling', code: 'gap', reason: expected });
      expect(saysOutcomeUnknown(failure!.reason)).toBe(true);
      expect(settled.taskOutcome!.report!.usagePerStage['assurance-sampling'].requests).toBe(1);
      expect(sent.filter((stage) => stage === 'assurance-sampling')).toHaveLength(1);
      expect(entries.unknownServed).toBe(1);
      store.markCleanShutdown();
    } finally {
      await execution.dispose();
      store.close();
    }
  }, 300_000);

  it('stops at the first ambiguous turn of a two-turn sample, never dispatching the second', async () => {
    // From disk: the reduction's second finding is anchored in unit 3, so the draw has two turns — unit 1's, then unit 3's.
    const { fixture, entries } = counted(await loadModelFixture(FIXTURES_ROOT, 'sample1-baseline-sampling-two-turns'));
    const store = await open(fixture);
    const sent: Array<'cross-unit-reduction' | 'assurance-sampling'> = [];
    const execution = ownerOf(store, fixture, sent);
    try {
      const bookId = await book(store, 'L2 sample1 抽样两轮结果待确认');
      const settled = await run(store, execution, bookId);
      expect(settled.taskOutcome?.classification).toMatch(/^completed/);
      expect(settled.run?.state).toMatch(/^completed/);
      // The sample was drawn over both findings and stopped at unit 1's ambiguous turn: a gap with nothing judged, never continued
      // into unit 3's turn, whose entry no dispatch reached.
      expect(settled.resultSetRevision?.assuranceSample).toMatchObject({ state: 'gap', size: 2, candidateCount: 2, dispositions: [] });
      const expected = assuranceSamplingTurnGapReason(1, UNKNOWN_STEP_REASON);
      expect(settled.resultSetRevision?.assuranceSample?.reason).toBe(expected);
      const failure = settled.taskOutcome!.report!.failures.find((entry) => entry.stage === 'assurance-sampling');
      expect(failure).toEqual({ stage: 'assurance-sampling', code: 'gap', reason: expected });
      expect(saysOutcomeUnknown(failure!.reason)).toBe(true);
      // One dispatched turn, one answered entry, no re-send: the second turn's finding was never read, let alone judged.
      expect(settled.taskOutcome!.report!.usagePerStage['assurance-sampling'].requests).toBe(1);
      expect(sent.filter((stage) => stage === 'assurance-sampling')).toHaveLength(1);
      expect(entries.unknownServed).toBe(1);
      store.markCleanShutdown();
    } finally {
      await execution.dispose();
      store.close();
    }
  }, 300_000);

  it('records an ambiguous reflection in the report, sent once, never re-sent', async () => {
    const happy = await loadModelFixture(FIXTURES_ROOT, 'sample1-baseline-happy');
    const store = await open(happy);
    const executions: BaselineAnalysisExecutionOwner[] = [];
    try {
      // A first Run with nothing ambiguous mints the accounting the reflection's request is keyed by; the same
      // fixture over one manuscript mints the same accounting digest on every deterministic replay.
      const control = ownerOf(store, happy, []);
      executions.push(control);
      const controlBook = await book(store, 'L2 sample1 反思账目');
      const first = await run(store, control, controlBook);
      // The control Run reached the reflection turn — the happy fixture carries no entry for it — and its digest
      // is what the second Run's fixture keys the same request by.
      expect(first.taskOutcome!.report!.usagePerStage['run-report-reflection'].requests).toBe(1);
      const requestDigest = runReportReflectionRequestDigest(RUN_REPORT_REFLECTION_PROMPT_CONTRACT_DIGEST, first.taskOutcome!.report!.accountingDigest);
      // A second Run over the same fixture answers exactly that reflection request 结果待确认.
      const { fixture, entries } = counted({
        ...happy,
        entries: new Map([...happy.entries, [fixtureEntryKey(0, requestDigest), {
          unitOrdinal: 0, requestDigest, attempt: null, contentDigest: null, response: DROPPED,
        }]]),
      });
      const execution = ownerOf(store, fixture, []);
      executions.push(execution);
      const bookId = await book(store, 'L2 sample1 反思步骤结果待确认', false);
      const settled = await run(store, execution, bookId);
      expect(settled.taskOutcome?.classification).toMatch(/^completed/);
      expect(settled.run?.state).toMatch(/^completed/);
      // The reflection's own record, in its exact words; it is not a report failure row, and a step has no code.
      const ifRedone = settled.taskOutcome!.report!.ifRedone;
      expect(ifRedone).toEqual({ state: 'gap', items: [], reason: UNKNOWN_STEP_REASON });
      expect(ifRedone.state === 'gap' && saysOutcomeUnknown(ifRedone.reason)).toBe(true);
      expect(settled.taskOutcome!.report!.failures.map((entry) => String(entry.stage))).not.toContain('run-report-reflection');
      // Its one turn was dispatched; nothing re-sent it. The report's count is the step's own constant, so the route's
      // count is what proves it.
      expect(settled.taskOutcome!.report!.usagePerStage['run-report-reflection'].requests).toBe(1);
      expect(entries.unknownServed).toBe(1);
      store.markCleanShutdown();
    } finally {
      for (const execution of executions) await execution.dispose();
      store.close();
    }
  }, 300_000);
});
