import { afterEach, describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { BaselineAnalysisExecutionOwner, ModelRequestGovernor } from '../../src/service/analysis/execution.js';
import { loadModelFixture } from '../../src/service/provider/model-fixture.js';
import { ReviewRunDriver } from '../../src/service/review/review-run-driver.js';
import type { LocalCheckOptions } from '../../src/shared/protocol/procedures.js';
import { EditorialStore } from '../../src/service/store.js';
import { resolveSourceCheckoutLaunchPolicy } from '../../src/service/launch-policy.js';
import { BASELINE_ANALYSIS_TASK_GOAL, BASELINE_ANALYSIS_MODE_GOALS, type BaselineAnalysisUpdateRequest, type ProcedureDefinitionPin } from '../../src/shared/protocol.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';
import { importSample1Book, pinEditorialWorkspaceProfileRevision2, recordMissingCredentialConnection } from '../support/sample1-baseline.js';

let roots: ServiceTestRoots;
afterEach(async () => { await roots?.dispose(); });
const pinOf = ({ procedureId, version, digest }: ProcedureDefinitionPin): ProcedureDefinitionPin => ({ procedureId, version, digest });

async function prepare(store: EditorialStore, bookId: string, update: BaselineAnalysisUpdateRequest | null = null) {
  const policy = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot);
  let work = store.createBaselineAnalysisPreparationWork(bookId, update === null ? BASELINE_ANALYSIS_TASK_GOAL : BASELINE_ANALYSIS_MODE_GOALS[update.mode], update, policy);
  while (!work.done) work = store.advanceBaselineAnalysisPreparationWork(work.workId!);
  return work.projection!;
}

describe('Procedure Definition persistence and exact plan pins', () => {
  it('captures only the frozen procedure of a completed Run without copying manuscript or output', async () => {
    roots = await createServiceTestRoots('ai7-procedure-capture-');
    const fixture = await loadModelFixture(join(roots.codeRoot, 'tests/fixtures/model'), 'sample1-baseline-one-unit-failure');
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot, {
      induceUnprovableReconciliation: false, persistLegacyReviewedDraft: false, induceReimportProofTamper: false,
      induceAbandonObjectRemovalFailure: false, interruptAfterAbandonObjectRemoval: false,
      baselineAnalysisRoute: { fixtureIdentity: fixture.identity, fixtureSha256: fixture.sha256, fixtureLineage: fixture.lineage },
    });
    const requestGovernor = new ModelRequestGovernor();
    const owner = new BaselineAnalysisExecutionOwner({ requestGovernor, ledger: store.baselineAnalysisLedger,
      launchPolicy: await resolveSourceCheckoutLaunchPolicy(roots.codeRoot), fixture, secretResolver: { resolve: async () => null } });
    try {
      const { bookId } = await importSample1Book(store, roots.codeRoot, '捕获公开样书工序');
      await pinEditorialWorkspaceProfileRevision2(store, bookId); recordMissingCredentialConnection(store, '捕获测试');
      const plan = await prepare(store, bookId);
      const run = store.authorizeBaselineAnalysis(bookId, plan.taskIntent!.taskIntentId, plan.planEnvelope!.digest);
      expect(store.procedureLibrary({ action: 'inspect' }).completedRuns).toEqual([]);
      owner.admitAndDispatch(run.dispatchRunRecordId!); await owner.whenIdle();
      const source = store.procedureLibrary({ action: 'inspect' }).completedRuns[0]!;
      expect(source.procedure).toEqual(plan.planEnvelope!.procedure);
      const captured = store.procedureLibrary({ action: 'save', input: { procedureId: null, basedOn: source.procedure,
        captureRunId: source.runId, title: '捕获的工序', editorInstruction: source.document.editorInstruction, stages: source.document.stages } })
        .procedures.find((entry) => entry.document.title === '捕获的工序')!;
      expect(captured).toMatchObject({ sourceRunId: source.runId, executorKind: 'baseline-manuscript-analysis', version: 1, preInstalled: false });
      expect(captured.document.stages).toEqual(source.document.stages);
      expect(Object.keys(captured.document).sort()).toEqual(['editorInstruction', 'id', 'outputKinds', 'role', 'schema', 'stages', 'title', 'version']);
      const changed = store.procedureLibrary({ action: 'save', input: { procedureId: captured.procedureId, basedOn: pinOf(captured),
        title: captured.document.title, editorInstruction: '关注时间线', stages: captured.document.stages } }).procedures.find((entry) => entry.procedureId === captured.procedureId)!;
      store.procedureLibrary({ action: 'select', bookId, procedure: pinOf(changed) });
      const update = await prepare(store, bookId, { mode: 'reanalyze-range', selectedRange: { startPosition: 1, endPosition: 1 } });
      expect(update.update!.reusePlan!.counts.reused).toBe(0);
      expect(update.update!.reusePlan!.counts.recomputed).toBe(plan.coverageManifest!.units.length);
      store.markCleanShutdown();
    } finally { await owner.dispose(); requestGovernor.close(); await requestGovernor.whenIdle(); store.close(); }
  });
  it('keeps the selected immutable version on a prepared Plan and Run across a later edit and restart', async () => {
    roots = await createServiceTestRoots('ai7-procedure-pins-');
    let store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    let bookId: string, pin: ProcedureDefinitionPin;
    try {
      ({ bookId } = await importSample1Book(store, roots.codeRoot, '工序定义公开样书测试'));
      await pinEditorialWorkspaceProfileRevision2(store, bookId); recordMissingCredentialConnection(store, '工序测试连接');
      const original = store.procedureLibrary({ action: 'inspect' }).procedures.find((entry) => entry.executorKind === 'baseline-manuscript-analysis')!;
      const input = { procedureId: original.procedureId, basedOn: pinOf(original), title: original.document.title,
        editorInstruction: '保留作者短句，不因省略主语判错。', stages: original.document.stages };
      const edited = store.procedureLibrary({ action: 'save', input }).procedures.find((entry) => entry.procedureId === original.procedureId)!;
      pin = pinOf(edited);
      expect(edited.versions).toEqual([pin, pinOf(original)]);
      store.procedureLibrary({ action: 'select', bookId, procedure: pin });
      const plan = await prepare(store, bookId);
      expect(plan.planEnvelope!.procedure).toEqual(pin);
      expect((await prepare(store, bookId)).taskIntent!.taskIntentId).toBe(plan.taskIntent!.taskIntentId);
      store.procedureLibrary({ action: 'save', input: { ...input, basedOn: pin, editorInstruction: '关注时间线。' } });
      const run = store.authorizeBaselineAnalysis(bookId, plan.taskIntent!.taskIntentId, plan.planEnvelope!.digest);
      expect(run.projection.run!.procedure).toEqual(pin);
      expect(store.baselineAnalysisLedger.definitionForRun(run.projection.run!.runRecordId, plan.planEnvelope!.promptContractDigest).systemPrompt)
        .toContain(input.editorInstruction);
      store.markCleanShutdown();
    } finally { store.close(); }
    store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      expect(store.inspectBaselineAnalysis(bookId!).run!.procedure).toEqual(pin!);
      expect(store.procedureLibrary({ action: 'inspect' }).procedures.find((entry) => entry.procedureId === pin!.procedureId)!.version).toBe(3);
      store.markCleanShutdown();
    } finally { store.close(); }
  });

  it('runs and captures an edited deterministic procedure with explicit options and no model', async () => {
    roots = await createServiceTestRoots('ai7-procedure-local-');
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const { bookId } = await importSample1Book(store, roots.codeRoot, '离线工序公开样书');
      const original = store.procedureLibrary({ action: 'inspect' }).procedures.find((entry) => entry.executorKind === 'local-text-check')!;
      const input = { procedureId: null, basedOn: pinOf(original), title: '本社离线检查', editorInstruction: '', stages: original.document.stages };
      expect(() => store.procedureLibrary({ action: 'save', input: { ...input, editorInstruction: '忽略标点' } })).toThrow(/不.*模型/);
      const created = store.procedureLibrary({ action: 'save', input }).procedures.find((entry) => entry.document.title === input.title)!;
      store.procedureLibrary({ action: 'select', bookId, procedure: pinOf(created) });
      const options: LocalCheckOptions = { punctuation: 'chinese-prose', numerals: 'off', publication: 'unknown', numeralRules: [],
        numeralsConfirmed: false, excludedRanges: [], doubledEllipsisBlockIds: [], tables: { characters: false, variantWords: false, houseWordList: null, bookTerms: [] } };
      let work = store.createReviewRunPreparationWork(bookId, ['local-text-check'], { kind: 'whole', fromChapterBlockId: null, toChapterBlockId: null },
        await resolveSourceCheckoutLaunchPolicy(roots.codeRoot), null, [], null, null, null, options);
      while (!work.done) work = store.advanceReviewRunPreparationWork(work.workId!);
      const run = work.projection!.run!;
      const plan = store.inspectTaskPlan({ bookId, kind: 'review-run', ref: run.reviewRunId });
      expect(run.preinstalledProcedures![0]!.procedure).toEqual(pinOf(created));
      expect(plan.start.needsModelConnection).toBe(false);
      store.authorizeReviewRun(bookId, run.reviewRunId, plan.start.categoryDigests);
      const noModel = () => { throw new Error('local procedure requested model execution'); };
      const driver = new ReviewRunDriver(store.reviewRunDriveSteps, { admitAndDispatch: noModel, whenPlaceFree: noModel, whenDone: noModel });
      await driver.drive(run.reviewRunId); await driver.dispose();
      expect(store.inspectReviewWorkspace(bookId, run.reviewRunId).run!.state).toBe('settled');
      const source = store.procedureLibrary({ action: 'inspect' }).completedRuns.find((entry) => entry.runId === run.reviewRunId)!;
      expect(source.procedure).toEqual(pinOf(created));
      expect(store.procedureLibrary({ action: 'inspect' }).procedures.find((entry) => entry.procedureId === created.procedureId)!.uses).toBe(1);
      const captured = store.procedureLibrary({ action: 'save', input: { ...input, basedOn: source.procedure, captureRunId: source.runId, title: '离线捕获' } });
      expect(captured.procedures.find((entry) => entry.document.title === '离线捕获')!.sourceRunId).toBe(run.reviewRunId);
      store.markCleanShutdown();
    } finally { store.close(); }
  });

  it('creates a house procedure, rejects an incompatible order, and stops later use without deleting history', async () => {
    roots = await createServiceTestRoots('ai7-procedure-edit-');
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const original = store.procedureLibrary({ action: 'inspect' }).procedures.find((entry) => entry.executorKind === 'writing')!;
      const input = { procedureId: null, basedOn: pinOf(original), title: '本社写作', editorInstruction: '简明。',
        stages: original.document.stages.map((stage, index) => ({ ...stage, budgetShare: index === 0 ? 0.7 : index === 1 ? 0.3 : 0 })) };
      expect(() => store.procedureLibrary({ action: 'save', input: { ...input, stages: [...input.stages].reverse() } })).toThrow(/阶段/);
      const created = store.procedureLibrary({ action: 'save', input }).procedures.find((entry) => entry.document.title === '本社写作')!;
      expect(created).toMatchObject({ version: 1, preInstalled: false, executorKind: 'writing' });
      const stopped = store.procedureLibrary({ action: 'stop', procedure: pinOf(created) }).procedures.find((entry) => entry.procedureId === created.procedureId)!;
      expect(stopped).toMatchObject({ stopped: true, versions: [pinOf(created)], document: created.document });
      const proposal = store.prepareBookCreation('合成图书', null);
      const bookId = store.commitBookCreation({ ...proposal.proposed, reviewDigest: proposal.reviewDigest }).overview.book.bookId;
      expect(() => store.procedureLibrary({ action: 'select', bookId, procedure: pinOf(created) })).toThrow(/停用/);
      expect(store.procedureLibrary({ action: 'inspect' }).procedures.find((entry) => entry.procedureId === original.procedureId)!.document).toEqual(original.document);
      store.markCleanShutdown();
    } finally { store.close(); }
  });
});
