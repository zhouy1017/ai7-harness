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
import { BASELINE_ANALYSIS_TASK_GOAL } from '../../src/shared/protocol.js';
let governor: ModelRequestGovernor;
beforeEach(() => { governor = new ModelRequestGovernor(); });
afterEach(async () => { governor.close(); await governor.whenIdle(); });
it('maps baseline ordinals and reduction rows through captured ordinary transport on sample1', async () => {
  const roots = await createServiceTestRoots('ai7-ordinals-');
  const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot, { baselineAnalysisRoute: null, induceUnprovableReconciliation: false, persistLegacyReviewedDraft: false, induceReimportProofTamper: false, induceAbandonObjectRemovalFailure: false, interruptAfterAbandonObjectRemoval: false });
  const captured = capturedOrdinaryExecution(store, roots.codeRoot, roots.dataRoot, governor, (request, message) => {
    const response = request.stage === 'units' ? { synopsis: '概述', entities: [{ name: '人物', blockOrdinals: [1, 9999] }] }
      : request.stage === 'cross-unit-reduction' ? { findings: [{ kind: 'contradiction', description: '跨章设定', rowRefs: ['r1', 'r9999', 'r2'] }], notes: [] }
      : { items: [], dispositions: [] };
    if (request.stage === 'units') expect(message).toMatch(/^\[1\] \[blk_/mu);
    if (request.stage === 'cross-unit-reduction') expect(message).toMatch(/^\[r1\]/mu);
    return { kind: 'unit-result', text: JSON.stringify(response), usage: { inputTokens: 10, outputTokens: 5 } };
  });
  try {
    const { bookId } = await importSample1Book(store, roots.codeRoot, '整数引用');
    await pinEditorialWorkspaceProfileRevision2(store, bookId);
    let progress = store.createBaselineAnalysisPreparationWork(bookId, BASELINE_ANALYSIS_TASK_GOAL, null, captured.policy);
    while (!progress.done) progress = store.advanceBaselineAnalysisPreparationWork(progress.workId!);
    const plan = progress.projection!;
    captured.owner.admitAndDispatch(store.authorizeBaselineAnalysis(bookId, plan.taskIntent!.taskIntentId, plan.planEnvelope!.digest).dispatchRunRecordId!);
    await captured.owner.whenIdle();
    captured.assertMatched();
    const result = store.inspectBaselineAnalysis(bookId, () => null).resultSetRevision!;
    expect(result.crossUnitFindings).toHaveLength(1);
    expect(result.crossUnitFindings[0]!.sides.map((side) => side.unitOrdinal)).toEqual([1, 2]);
    expect(result.crossUnitFindings[0]!.sides.every((side) => side.sourceRanges.length === 1 && side.sourceRanges[0]!.fromGrapheme === null)).toBe(true);
    for (const wire of captured.wireRequests.filter((wire) => wire.messages.some((m) => m.role === 'user' && m.content.startsWith('分析单元')))) {
      expect(wire.messages.find((m) => m.role === 'system')!.content).toContain('blockOrdinals');
      expect(wire.messages.find((m) => m.role === 'system')!.content).not.toMatch(/fromGrapheme|toGrapheme/u);
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
  } finally { await captured.owner.dispose(); store.close(); await roots.dispose(); }
}, 300_000);
