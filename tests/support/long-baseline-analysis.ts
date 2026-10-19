import { randomUUID } from 'node:crypto';
import { BASELINE_ANALYSIS_TASK_GOAL, type BaselineAnalysisProjection, type BaselineAnalysisResultSetRevisionProjection } from '../../src/shared/protocol.js';
import { reduceBaselineAnalysis, assuranceSampleNotRun, type UnitOutcome } from '../../src/service/analysis/reducers.js';
import { BASELINE_UNIT_RESULT_SCHEMA } from '../../src/service/analysis/contract.js';
import { buildRunReport, runReportReflectionNotRun, runReportDigest } from '../../src/service/analysis/run-report.js';
import { deriveCoverageManifest } from '../../src/service/analysis/coverage-manifest.js';
import { sha256Hex } from '../../src/service/analysis/canonical.js';

export function longPreparedAnalysis(paragraphs = 6000): BaselineAnalysisProjection {
  const bookId = randomUUID();
  const manuscriptId = randomUUID();
  const revisionId = randomUUID();
  const manifest = deriveCoverageManifest({ bookId, manuscriptId, revisionId, branchId: randomUUID(), revisionLabel: 'r1',
    revisionDigest: '0'.repeat(64), blocks: Array.from({ length: paragraphs }, (_, index) => ({
      blockId: `blk_${(index + 1).toString(16).padStart(24, '0')}`, position: index + 1, kind: 'paragraph', level: null,
      text: '甲'.repeat(80), graphemes: 80, digest: sha256Hex('甲'.repeat(80)),
    })) });
  return { bookId, kind: 'baseline-manuscript-analysis', contractVersion: 'ai7.baseline-manuscript-analysis/1',
    state: 'prepared', stateLabel: '计划已准备', taskIntent: { taskIntentId: randomUUID(), goal: BASELINE_ANALYSIS_TASK_GOAL,
      expectedOutcome: '稿件分析结果集修订版（基线稿件分析契约 v1）', createdAt: '2026-10-19T00:00:00.000Z',
      mode: 'first-baseline', modeLabel: '首次基线分析', redoOf: null },
    checkpoint: null, manuscriptPin: null, artifactPin: null, runSourceScope: null, coverageManifest: manifest,
    providerResolutionPlan: null, executionPlan: null, planEnvelope: null, planVersion: null, planVersions: [], planRevisions: [],
    planRevision: null, authorization: null, run: null, resultSetRevision: null, taskOutcome: null, update: null, updateControls: null,
    history: null, inspectedRevision: null, actions: { canPrepare: true, canAuthorize: true, canReconfirmPlan: false }, namedNonEffects: [],
  };
}

/** Generated model-shaped results over a real imported/prepared Book; no model or transport is involved. */
export function longSettledAnalysis(prepared: BaselineAnalysisProjection, revisions = 1): BaselineAnalysisProjection {
  const manifest = prepared.coverageManifest!;
  const outcomes: UnitOutcome[] = manifest.units.map((unit) => {
    const sourceRanges = [{ blockId: unit.blockIds[0]!, fromGrapheme: 0, toGrapheme: 1 }];
    return { unitOrdinal: unit.ordinal, state: 'closed', result: {
      schema: BASELINE_UNIT_RESULT_SCHEMA, unitOrdinal: unit.ordinal, synopsis: '生成梗概甲乙丙丁'.repeat(90),
      confidence: 'medium', relationships: [], settingClaims: [], conflicts: [], unresolved: [],
      entities: Array.from({ length: 20 }, (_, index) => ({ name: `生成实体${unit.ordinal}-${index}`, kind: 'person', aliases: [], note: null, sourceRanges })),
      events: Array.from({ length: 20 }, (_, index) => ({ ordinal: index + 1, summary: `生成事件${unit.ordinal}-${index}`, chronology: null, participants: [], sourceRanges })),
    } };
  });
  const reduction = reduceBaselineAnalysis(manifest, outcomes);
  const now = '2026-10-19T00:00:00.000Z';
  const taskIntentId = prepared.taskIntent!.taskIntentId;
  const runRecordId = randomUUID();
  const attemptId = randomUUID();
  const sample = assuranceSampleNotRun('生成测试不调用模型。');
  const revision: BaselineAnalysisResultSetRevisionProjection = {
    ...reduction, resultSetId: randomUUID(), revisionId: randomUUID(), ordinal: revisions, createdAt: now,
    digest: 'a'.repeat(64), contractVersion: prepared.contractVersion,
    manuscriptPin: { bookId: prepared.bookId, manuscriptId: manifest.manuscript.manuscriptId,
      revisionId: manifest.manuscript.revisionId, revisionDigest: manifest.manuscript.revisionDigest, revisionLabel: manifest.manuscript.revisionLabel },
    coverageManifestDigest: manifest.digest, schemaDigest: 'b'.repeat(64), reducerDigest: 'c'.repeat(64),
    adapterPin: { route: 'opencode-go', model: 'deepseek-v4.1-flash', fixtureIdentity: null, fixtureSha256: null },
    bindingPin: { attemptId, bindingDigest: 'd'.repeat(64), harnessSessionId: randomUUID(), behaviorCompositionDigest: 'e'.repeat(64), promptContractDigest: 'f'.repeat(64) },
    policyPin: { operationalScope: 'ordinary-production', providerProcessingVersion: 'v23', activePolicySetVersion: 'v15', liveTransmissions: 'bounded-by-run' },
    provenance: { taskIntentId, runRecordId, attemptId }, usage: { inputTokens: 40000, outputTokens: 40000, requests: manifest.units.length },
    update: { mode: 'first-baseline', modeLabel: '首次基线分析', predecessor: null, reusePlanDigest: null, selectedRange: null,
      counts: { reused: 0, recomputed: manifest.units.length, invalidated: 0, bypassed: 0 } },
    lineage: manifest.units.map((unit) => ({ unitOrdinal: unit.ordinal, kind: 'recomputed' })),
    freshness: { axis: 'freshness', state: 'current', label: '当前', boundRevisionId: manifest.manuscript.revisionId,
      boundRevisionDigest: manifest.manuscript.revisionDigest, currentRevisionId: manifest.manuscript.revisionId,
      currentWorkingDigest: manifest.manuscript.revisionDigest, currentJournalSequence: 0, comparison: 'local-deterministic' },
    assuranceSample: sample,
    units: outcomes.map((outcome) => {
      if (outcome.state !== 'closed') throw new Error('generated closed outcome required');
      return { ...outcome.result, state: 'closed', requestDigest: '1'.repeat(64), responseDigest: '2'.repeat(64), usage: { inputTokens: 100, outputTokens: 100 }, lineage: { kind: 'recomputed' } };
    }),
  };
  const rows = manifest.units.map((unit) => ({ unitOrdinal: unit.ordinal, state: 'closed' as const, lineage: 'recomputed' as const,
    attempts: 1, startedAt: now, settledAt: now, wallMs: 1, usage: { inputTokens: 100, outputTokens: 100 }, gapCode: null }));
  const report = buildRunReport({ runRecordId, taskIntentId, attemptId, resultSetRevisionId: revision.revisionId,
    classification: 'completed', recordedAt: now, spans: new Map(),
    usage: { units: { inputTokens: 40000, outputTokens: 40000, requests: manifest.units.length },
      'cross-unit-reduction': { inputTokens: 0, outputTokens: 0, requests: 0 }, 'assurance-sampling': { inputTokens: 0, outputTokens: 0, requests: 0 } },
    unitRows: rows, submitted: manifest.units.length, adaptations: [], gaps: [], crossUnit: revision.crossUnitReduction,
    sample, findingCounts: [], terminalFailure: null }, runReportReflectionNotRun('生成测试不调用模型。'));
  const projectedReport = { ...report, reportDigest: runReportDigest(report) };
  const counts = { reused: 0, recomputed: manifest.units.length, invalidated: 0, bypassed: manifest.units.length };
  const rangeAction = { mode: 'reanalyze-range' as const, label: '重新分析所选范围', goal: prepared.taskIntent!.goal,
    meaning: '生成范围计划', available: true, unavailableReason: null, expected: null };
  return { ...prepared, state: 'settled', resultSetRevision: revision,
    update: { mode: 'reanalyze-book', modeLabel: '重新分析全书', meaning: '生成更新',
      predecessor: { revisionId: revision.revisionId, ordinal: 1, digest: revision.digest, manuscriptPin: revision.manuscriptPin },
      predecessorCurrent: true, selectedRange: null, reusePlanDigest: '5'.repeat(64), reusePlan: {
        schema: 'ai7.baseline-manuscript-analysis.reuse-plan/1', mode: 'reanalyze-book', contractVersion: prepared.contractVersion,
        predecessor: { revisionId: revision.revisionId, ordinal: 1, digest: revision.digest, contractVersion: prepared.contractVersion,
          coverageManifestDigest: manifest.digest, unitCount: manifest.units.length }, coverageManifestDigest: manifest.digest,
        selectedRange: null, recomputeClosure: manifest.units.map((unit) => unit.ordinal), counts,
        units: manifest.units.map((unit) => ({ unitOrdinal: unit.ordinal, startPosition: unit.startPosition, endPosition: unit.endPosition,
          contentKey: '6'.repeat(64), disposition: 'recomputed', reason: 'bypassed-whole-book', reusedFrom: null })),
        predecessorUnits: manifest.units.map((unit) => ({ unitOrdinal: unit.ordinal, state: 'closed', disposition: 'bypassed', successorUnitOrdinal: unit.ordinal })),
      } },
    updateControls: { target: { revisionId: revision.revisionId, ordinal: revisions, digest: revision.digest,
      manuscriptPin: revision.manuscriptPin, freshness: 'current' },
      working: { branchId: manifest.manuscript.branchId, revisionLabel: 'r1', journalSequence: 0, workingDigest: manifest.manuscript.revisionDigest,
        totalBlocks: manifest.totalBlocks, unitCount: manifest.units.length, sectionCount: manifest.sectionCount },
      blockedByActiveRun: false, blockedReason: null, providerConsequence: '生成测试不发送内容', successorBehavior: '追加修订版', actions: {
        'sync-current': { ...rangeAction, mode: 'sync-current', expected: counts },
        'reanalyze-book': { ...rangeAction, mode: 'reanalyze-book', expected: counts },
        'reanalyze-range': { ...rangeAction, options: manifest.units.map((unit) => ({ unitOrdinal: unit.ordinal,
          sectionOrdinal: unit.sectionOrdinal, headingText: unit.headingText, subUnitIndex: unit.subUnitIndex,
          subUnitCount: unit.subUnitCount, startPosition: unit.startPosition, endPosition: unit.endPosition,
          graphemes: unit.graphemes, label: `结构段 ${unit.sectionOrdinal} · 单元 ${unit.ordinal}/${manifest.units.length} · 内容块 ${unit.startPosition}–${unit.endPosition} · ${unit.graphemes} 字素`, expected: null })) },
      } },
    run: { runRecordId, state: 'completed', stateLabel: '已完成', recordedAt: now, transitions: [], adaptations: [], blockedReasons: null,
      blockedBy: null, progress: null, attempt: { attemptId, ordinal: 1, startedAt: now,
        credentialReadinessCheck: { slot: 'opencode-go', readiness: 'present', valueReleased: false },
        executionBinding: null, spans: manifest.units.map((unit) => ({ ordinal: unit.ordinal, harnessSessionId: randomUUID(), startSeq: 1, endSeq: 2,
          unitOrdinal: unit.ordinal, attemptIndex: 1, payloadDigest: '3'.repeat(64), unitMessageDigest: '4'.repeat(64) })) } },
    taskOutcome: { outcomeId: randomUUID(), classification: 'completed', label: '已完成', recordedAt: now,
      resultSetRevisionId: revision.revisionId, safeNextAction: '查看分析', stop: null, report: projectedReport, reportAbsentReason: null },
    history: { resultSetId: revision.resultSetId, kind: prepared.kind, createdAt: now, latestOrdinal: revisions,
      entries: Array.from({ length: revisions }, (_, index) => ({ revisionId: index === revisions - 1 ? revision.revisionId : randomUUID(),
        ordinal: index + 1, digest: revision.digest, createdAt: now, mode: 'first-baseline', modeLabel: '首次基线分析',
        manuscriptPin: revision.manuscriptPin, coverageManifestDigest: manifest.digest, contractVersion: prepared.contractVersion,
        counts: revision.update.counts, predecessor: null, reusePlanDigest: null,
        producingRun: { taskIntentId, runRecordId, attemptId, classification: 'completed' }, report: projectedReport, reportAbsentReason: null,
        usage: revision.usage, unitsTotal: manifest.units.length, unitsClosed: manifest.units.length, gapCount: 0, conflictCount: 0,
        current: index === revisions - 1, freshness: index === revisions - 1 ? 'current' : 'superseded', freshnessLabel: '生成历史' })) },
    inspectedRevision: revisions === 1 ? null : { revision: { ...revision, revisionId: randomUUID(), ordinal: 1 }, current: false, readOnly: true },
  };
}
