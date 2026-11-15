import { BASELINE_PROMPT_CONTRACT, parseUnitMessageHeader } from '../../src/service/analysis/contract.js';
import { BASELINE_CROSS_UNIT_PROMPT_CONTRACT, parseCrossUnitMessageHeader, crossUnitRequestDigest, type CrossUnitFindingSide } from '../../src/service/analysis/cross-unit-contract.js';
import { canonicalRecord } from '../../src/service/analysis/canonical.js';
import { DatabaseSync } from 'node:sqlite';
import { resolve } from 'node:path';
import { BoundedManuscriptStore } from '../../src/service/bounded-manuscript.js';
import { BaselineAnalysisStore } from '../../src/service/analysis/baseline-analysis-store.js';
import { baselineAnalysisKindDefinition } from '../../src/service/analysis/kind-definition.js';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { ModelRequestGovernor } from '../../src/service/analysis/execution.js';
import { EditorialStore } from '../../src/service/store.js';
import { createServiceTestRoots } from '../support/temp-data-root.js';
import { importSample1Book, pinEditorialWorkspaceProfileRevision2 } from '../support/sample1-baseline.js';
import { capturedOrdinaryExecution } from '../support/captured-ordinary-transport.js';
import { BASELINE_ANALYSIS_TASK_GOAL, BASELINE_ANALYSIS_MODE_GOALS } from '../../src/shared/protocol.js';
let governor: ModelRequestGovernor;
beforeEach(() => { governor = new ModelRequestGovernor(); });
afterEach(async () => { governor.close(); await governor.whenIdle(); });
const controls = { baselineAnalysisRoute: null, induceUnprovableReconciliation: false, persistLegacyReviewedDraft: false,
  induceReimportProofTamper: false, induceAbandonObjectRemovalFailure: false, interruptAfterAbandonObjectRemoval: false };
const MEMORY = '保留人物设定的前后呼应。';
const INSTRUCTION = '只归纳本书已写明的设定。';

function selectInstructionProcedure(store: EditorialStore, bookId: string) {
  const original = store.procedureLibrary({ action: 'inspect' }).procedures.find((entry) => entry.executorKind === 'baseline-manuscript-analysis')!;
  const edited = store.procedureLibrary({ action: 'save', input: { procedureId: original.procedureId,
    basedOn: { procedureId: original.procedureId, version: original.version, digest: original.digest }, title: original.document.title,
    editorInstruction: INSTRUCTION, stages: original.document.stages.map((stage, index) => index === 1 ? { ...stage, exemptionRules: ['保留原有设定。'] } : stage) } })
    .procedures.find((entry) => entry.procedureId === original.procedureId)!;
  store.procedureLibrary({ action: 'select', bookId, procedure: { procedureId: edited.procedureId, version: edited.version, digest: edited.digest } });
}

function ordinalAnswers() {
  const blocks = new Map<number, Array<{ ordinal: number; blockId: string }>>();
  let sides: CrossUnitFindingSide[] = [];
  const answer: Parameters<typeof capturedOrdinaryExecution>[4] = (request, message) => {
    let response: object = { items: [], dispositions: [] };
    if (request.stage === 'units') {
      const unit = parseUnitMessageHeader(message)!;
      const lines = [...message.matchAll(/^\[(\d+)\] \[(blk_[0-9a-f]{24})\]/gmu)]
        .map((line) => ({ ordinal: Number(line[1]), blockId: line[2]! }));
      blocks.set(unit.ordinal, lines);
      response = { synopsis: '概述', entities: lines.map(({ ordinal }) => ({ name: `单元${unit.ordinal}段${ordinal}`,
        kind: 'other', aliases: [], note: null, blockOrdinals: [ordinal, 9999] })) };
    } else if (request.stage === 'cross-unit-reduction') {
      expect(message).toContain(BASELINE_CROSS_UNIT_PROMPT_CONTRACT.instruction);
      expect(message).not.toMatch(/blk_|fromGrapheme|sourceRanges/u);
      const rows = [...message.matchAll(/^\[(r\d+)\] - 单元(\d+)段(\d+)（other）· 单元 (\d+)$/gmu)];
      const chosen = [rows.find((row) => row[2] === '2' && row[3] === '1')!, rows.filter((row) => row[2] === '3').at(-1)!];
      sides = chosen.map((row) => {
        expect(row[2]).toBe(row[4]);
        return { unitOrdinal: Number(row[4]), sourceRanges: [{ blockId: blocks.get(Number(row[2]))!.find((block) => block.ordinal === Number(row[3]))!.blockId,
          fromGrapheme: null, toGrapheme: null }] };
      });
      response = { findings: [{ kind: 'contradiction', description: '跨章设定', confidence: 'high', rowRefs: [chosen[0]![1], 'r99999', chosen[1]![1]] }], notes: [] };
    }
    return { kind: 'unit-result', text: JSON.stringify(response), usage: { inputTokens: 10, outputTokens: 5 } };
  };
  return { blocks, answer, sides: () => sides };
}

it.each(['clarification', 'memory', 'procedure', 'both'] as const)('maps captured overlap/own ordinals and row references with %s wrappers', async (wrappers) => {
  const roots = await createServiceTestRoots('ai7-ordinals-');
  const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot, controls);
  const answers = ordinalAnswers();
  const captured = capturedOrdinaryExecution(store, roots.codeRoot, roots.dataRoot, governor, answers.answer);
  try {
    const { bookId } = await importSample1Book(store, roots.codeRoot, '整数引用');
    await pinEditorialWorkspaceProfileRevision2(store, bookId);
    if (wrappers === 'memory' || wrappers === 'both') store.recordLearningSupervision({ operation: 'create', targets: [], scope: { kind: 'house' }, categoryId: 'plot-consistency', text: MEMORY, effect: 'guide' });
    if (wrappers === 'procedure' || wrappers === 'both') selectInstructionProcedure(store, bookId);
    let progress = store.createBaselineAnalysisPreparationWork(bookId, BASELINE_ANALYSIS_TASK_GOAL, null, captured.policy);
    while (!progress.done) progress = store.advanceBaselineAnalysisPreparationWork(progress.workId!);
    const plan = progress.projection!;
    const runId = store.authorizeBaselineAnalysis(bookId, plan.taskIntent!.taskIntentId, plan.planEnvelope!.digest).dispatchRunRecordId!;
    const ledger = store.baselineAnalysisLedger;
    const facts = ledger.loadExecutionPlan(runId), definition = ledger.definitionForRun(runId, facts.promptContractDigest);
    expect(definition.clarificationBase).toBeDefined();
    expect(definition.systemPrompt).toContain(BASELINE_PROMPT_CONTRACT.systemPrompt);
    if (wrappers === 'memory' || wrappers === 'both') expect(definition.systemPrompt).toContain(MEMORY);
    if (wrappers === 'procedure' || wrappers === 'both') expect(definition.systemPrompt).toContain(INSTRUCTION);
    captured.owner.admitAndDispatch(runId); await captured.owner.whenIdle(); captured.assertMatched();
    const result = store.inspectBaselineAnalysis(bookId, () => null).resultSetRevision!;
    expect([...answers.blocks.values()].flat()).toHaveLength(104);
    expect(plan.coverageManifest!.units.filter((unit) => unit.overlapBlockIds.length > 0)).toHaveLength(7);
    for (const unit of result.units) {
      expect(unit.state).toBe('closed');
      if (unit.state !== 'closed') throw new Error('UNIT_DID_NOT_CLOSE');
      expect(unit.entities.map((entity) => entity.sourceRanges)).toEqual(answers.blocks.get(unit.unitOrdinal)!.map(({ blockId }) => [{ blockId, fromGrapheme: null, toGrapheme: null }]));
    }
    expect(result.crossUnitFindings[0]!.sides).toEqual(answers.sides());
    for (const [index, request] of captured.requests.entries()) {
      const wire = captured.wireRequests[index]!, message = wire.messages.findLast((entry) => entry.role === 'user')!.content;
      expect(wire.messages.find((entry) => entry.role === 'system')!.content).toBe(definition.systemPrompt);
      if (request.stage === 'units') {
        const header = parseUnitMessageHeader(message)!;
        expect(request.contractDigest).toBe(facts.promptContractDigest);
        expect(request.requestDigest).toBe(definition.requestDigest(header.ordinal, header.unitDigest));
      } else if (request.stage === 'cross-unit-reduction') {
        expect(request.contractDigest).toBe(definition.crossUnit!.promptContractDigest);
        expect(request.requestDigest).toBe(crossUnitRequestDigest(definition.crossUnit!.promptContractDigest, parseCrossUnitMessageHeader(message)!.unitSetDigest));
      } else if (request.stage === 'assurance-sampling') {
        expect(message).toContain(definition.assurance!.prompt.instruction);
        expect(request.contractDigest).toBe(definition.assurance!.promptContractDigest);
        expect(request.requestDigest).toBe(canonicalRecord(message).digest);
      }
    }
  } finally { await captured.owner.dispose(); store.close(); await roots.dispose(); }
}, 300_000);
it('executes a task frozen under /2 after reopening with the new default', async () => {
  const roots = await createServiceTestRoots('ai7-frozen-ordinals-');
  const controls = { baselineAnalysisRoute: null, induceUnprovableReconciliation: false, persistLegacyReviewedDraft: false,
    induceReimportProofTamper: false, induceAbandonObjectRemovalFailure: false, interruptAfterAbandonObjectRemoval: false };
  let store = await EditorialStore.open(roots.dataRoot, roots.codeRoot, controls);
  const answer = () => ({ kind: 'unit-result' as const, text: JSON.stringify({ synopsis: '概述', findings: [], notes: [], items: [] }), usage: { inputTokens: 10, outputTokens: 5 } });
  let captured = capturedOrdinaryExecution(store, roots.codeRoot, roots.dataRoot, governor, answer);
  const { bookId } = await importSample1Book(store, roots.codeRoot, '冻结旧契约');
  await pinEditorialWorkspaceProfileRevision2(store, bookId);
  const database = new DatabaseSync(resolve(roots.dataRoot, 'store', 'ai7.sqlite'));
  database.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000');
  const old = new BaselineAnalysisStore(database, new BoundedManuscriptStore(database), null, baselineAnalysisKindDefinition('retained-v2'));
  old.bindLaunch(captured.launch);
  let progress = old.prepare({ phase: 'start', bookId, goal: BASELINE_ANALYSIS_TASK_GOAL, update: null, reconfirm: false, launchPolicy: captured.policy });
  while (!progress.done) progress = old.prepare({ phase: 'advance', workId: progress.workId! });
  const plan = progress.projection!;
  database.close(); await captured.owner.dispose(); store.close();
  store = await EditorialStore.open(roots.dataRoot, roots.codeRoot, controls);
  captured = capturedOrdinaryExecution(store, roots.codeRoot, roots.dataRoot, governor, answer);
  try {
    captured.owner.admitAndDispatch(store.authorizeBaselineAnalysis(bookId, plan.taskIntent!.taskIntentId, plan.planEnvelope!.digest).dispatchRunRecordId!);
    await captured.owner.whenIdle(); captured.assertMatched();
    expect(store.inspectBaselineAnalysis(bookId, () => null).resultSetRevision).not.toBeNull();
    const units = captured.wireRequests.filter((wire) => wire.messages.some((m) => m.role === 'user' && m.content.startsWith('分析单元')));
    expect(units).toHaveLength(8);
    expect(units.every((wire) => wire.messages.some((m) => m.role === 'system' && m.content.includes('fromGrapheme')))).toBe(true);
    expect(units.every((wire) => wire.messages.some((m) => m.role === 'user' && /^\[blk_/mu.test(m.content)))).toBe(true);
    let next = store.createBaselineAnalysisPreparationWork(bookId, BASELINE_ANALYSIS_MODE_GOALS['reanalyze-range'],
      { mode: 'reanalyze-range', selectedRange: { startPosition: 1, endPosition: 15 } }, captured.policy);
    while (!next.done) next = store.advanceBaselineAnalysisPreparationWork(next.workId!);
    expect(next.projection!.update!.reusePlan!.counts).toMatchObject({ reused: 6, recomputed: 2 });

  } finally { await captured.owner.dispose(); store.close(); await roots.dispose(); }
}, 300_000);
