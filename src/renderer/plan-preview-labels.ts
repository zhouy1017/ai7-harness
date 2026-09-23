import type {
  AnalysisAssuranceAxis,
  AnalysisCoverageAxis,
  AnalysisEntityKind,
  AnalysisFreshnessAxis,
  AnalysisReducerClosureAxis,
  AnalysisSourceRangeProjection,
  LaunchPolicyProjection,
  ProviderProcessingPin,
  ResultSetPolicyPin,
  RunAttemptState,
  RunBudgetCeilingState,
  RunReportRecordProjection,
  RunReportStageId,
  RunReportStageProjection,
  RunReportUnitAccountingProjection,
} from '../shared/protocol.js';

/**
 * The exact Run Budget Ceiling wording. `未设置任务预算上限` is true only when the plan really froze
 * `unset`; a developer-live plan freezes a required token ceiling and must say so, because the
 * ceiling is what bounds a Run that can actually transmit.
 */
export function runBudgetCeilingLabel(ceiling: RunBudgetCeilingState): string {
  return ceiling === 'unset' ? '未设置任务预算上限' : `任务运行预算上限：${ceiling.maxTotalTokens} tokens`;
}

/**
 * ②A's 不会做 in the editor's words (editor-surfaces §10, S72 D9): what an analysis never does whatever its
 * mode. The analysis kind's own statements — its named non-effects, the launch's Provider decision among
 * them — stay whole, one step away in the card's 查看技术详情, and in full in the Task Drawer.
 */
export const ANALYSIS_EDITORIAL_NOT_DO = ['不会直接修改稿件', '不读这本书以外的内容', '不导出或发布', '不存里程碑版本', '不作事实判定'] as const;

/**
 * What the authorization flow will and will not do, derived from the plan it froze (V2-UX-LAYER-002):
 * the named non-effect stays at full rank, but which non-effect is true depends on the launch. Before
 * a plan exists there is no pin to read, so the sentence states only what the flow itself does — never
 * a dispatch decision no plan has frozen.
 */
export function taskAuthorizationDispatchNote(pin: ProviderProcessingPin | null): string {
  const flow = '本流程只冻结并记录本次标准直接授权';
  if (pin === null) return `${flow}。`;
  return pin.decision === 'deny'
    ? `${flow}；Provider Processing ${pin.version} 固定拒绝派发。`
    : `${flow}；Provider Processing ${pin.version} 仅允许运行边界内的实时传输。`;
}

/**
 * What the baseline analysis kind is, and what its remote binding may do under the launch that bound
 * it. The frozen plan's pin is the truth when a plan exists; a Book that only holds a Result Set
 * Revision reads the pin that Revision recorded, where the policy's own bound (`liveTransmissions`)
 * carries the decision. With neither, the clause is dropped rather than guessed: the two facts that
 * hold in every state — the kind and that a Revision does not modify the manuscript — still read.
 */
export function analysisKindSubtitle(policy: ProviderProcessingPin | ResultSetPolicyPin | null): string {
  const kind = '一个精确版本化的覆盖式分析种类';
  const revision = '结果集修订版不修改稿件';
  if (policy === null) return `${kind}；${revision}。`;
  const version = 'version' in policy ? policy.version : policy.providerProcessingVersion;
  const denied = 'decision' in policy ? policy.decision === 'deny' : policy.liveTransmissions === 0;
  return denied
    ? `${kind}；远程绑定被 Provider Processing ${version} 拒绝，${revision}。`
    : `${kind}；远程绑定在 Provider Processing ${version} 下仅限资格，${revision}。`;
}

/**
 * The launch integrity sentence of the model-service settings, derived from the launch the projection
 * carries: the scope and the bound it holds are the two halves of the Provider Processing label, so a
 * `developer-live` launch never reads a sentence written for `development-ci`. The parameter is that
 * label's closed union, and both of its members carry the `：` the halves are taken around.
 */
export function launchPolicyIntegritySentence(label: LaunchPolicyProjection['providerProcessing']['label']): string {
  const separator = label.indexOf('：');
  return `策略完整性：已验证。当前${label.slice(0, separator)}范围保持${label.slice(separator + 1)}。`;
}

/**
 * The Decision Layer's form of an instant (V2-UX-LAYER-004): absolute local date and time, 24-hour, to
 * the second. It never replaces the exact instant, which sits beside it in the technical layer; an
 * unparsable value is returned as it came, because inventing a time is worse than showing a raw one.
 * `hourCycle` is stated rather than `hour12: false`, which reports midnight as hour 24 in some locales.
 */
export function localInstantLabel(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return iso;
  return at.toLocaleString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  });
}

/** How long the step in flight has been running, as `mm:ss`; hours carry into the minutes place. */
export function elapsedLabel(elapsedMs: number): string {
  const seconds = Math.max(0, Math.floor(elapsedMs / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

/** What the Provider attempt is doing, in the Decision Layer's vocabulary (V2-UX-LIVE-001). */
export function attemptStateLabel(state: RunAttemptState): string {
  if (state === 'dispatched') return '已派发';
  return state === 'awaiting-response' ? '等待模型响应' : '安全重试中';
}

/**
 * The stale threshold V2-UX-LIVE-003 sets before any step of a Run has completed: three minutes, used
 * only until the Run has measured a step of its own.
 */
export const RUN_LIVENESS_UNMEASURED_STALE_MS = 180_000;

/**
 * Whether the step in flight has run longer than this Run can account for (V2-UX-LIVE-003). The bar is
 * measured, never guessed: twice this Run's longest settled step, and only before any step has settled
 * does the fixed threshold stand in. Being over it says the step is unusual for this Run, never that
 * the Run has died — only a recorded state says that.
 */
export function runStepIsStale(elapsedMs: number, longestSettledUnitMs: number | null): boolean {
  return longestSettledUnitMs === null
    ? elapsedMs > RUN_LIVENESS_UNMEASURED_STALE_MS
    : elapsedMs > longestSettledUnitMs * 2;
}

/**
 * How many content blocks a provenance collection touches (V2-UX-LAYER-006), never the identifiers
 * themselves: whole-block and partial ranges count alike, and two ranges of one block count once.
 * An empty collection reads `无精确范围` rather than `0 个内容块`, which would report a measurement
 * the analysis never made.
 */
export function analysisBlockCountLabel(ranges: ReadonlyArray<Pick<AnalysisSourceRangeProjection, 'blockId'>>): string {
  const blocks = new Set(ranges.map((range) => range.blockId));
  return blocks.size === 0 ? '无精确范围' : `${blocks.size} 个内容块`;
}

/**
 * An item's provenance as the Decision Layer reads it (V2-UX-LAYER-006): `来自单元 1、2、5 · 25 个内容块`,
 * with the block identifiers one step away in its list's technical disclosure. The units are the
 * item's own recorded ordinals, ascending and deduplicated — never inferred from a block identifier —
 * so an item that records no unit reads as its block count alone rather than as an empty unit list.
 */
export function analysisProvenanceSummary(
  unitOrdinals: ReadonlyArray<number>,
  ranges: ReadonlyArray<Pick<AnalysisSourceRangeProjection, 'blockId'>>,
): string {
  const units = [...new Set(unitOrdinals)].sort((left, right) => left - right);
  const blocks = analysisBlockCountLabel(ranges);
  return units.length === 0 ? blocks : `来自单元 ${units.join('、')} · ${blocks}`;
}

/**
 * One editorial Chinese label per conflict kind the analysis can report (V2-UX-LAYER-003): the
 * reducer's token is its own vocabulary, not the editor's; the token itself stays on the entry in
 * `data-analysis-conflict-kind`, where the record and the Journeys read it. The labels live in the
 * shared protocol since Issue #417, because the 情节逻辑与前后一致 leads the service makes into 批注 name
 * the same kinds in the same words.
 */
export { ANALYSIS_CONFLICT_KIND_LABELS } from '../shared/protocol.js';

/** The editor's word for each entity kind (V2-UX-LAYER-003); the contract's token stays on the record. */
export const ANALYSIS_ENTITY_KIND_LABELS: Record<AnalysisEntityKind, string> = {
  person: '人物',
  place: '地点',
  organization: '机构',
  object: '物品',
  term: '名称',
  other: '其他',
};

/** Where a sentence's safe next action is taken, when it is taken on the analysis surface itself. */
export type AnalysisSentenceTarget = 'chapters' | 'history' | null;

/** One of the four sentences of V2-UX-ANALYSIS-025: its axis, its heading, what it says, and the one safe next action. */
export interface AnalysisSentence {
  axis: 'coverage' | 'reducer-closure' | 'freshness' | 'assurance';
  heading: '覆盖范围' | '全书综合' | '与当前稿件' | '可信程度';
  sentence: string;
  nextAction: string;
  target: AnalysisSentenceTarget;
}

/**
 * The four axes as four sentences in editorial Chinese (V2-UX-ANALYSIS-025): what the analysis read,
 * what it made of it, how it stands against the manuscript now, and how far it can be trusted — each
 * with one safe next action. Nothing here counts units by their technical name, names a digest or a
 * reducer stage; those stay one step away. The contradictions and open questions the analysis found
 * are counted and pointed at 审阅, never listed: they are that category's leads (V2-UX-REV-011).
 */
export function analysisFourSentences(revision: {
  coverage: Pick<AnalysisCoverageAxis, 'state' | 'unitsTotal' | 'unitsClosed' | 'gapCount'>;
  reducerClosure: Pick<AnalysisReducerClosureAxis, 'state'>;
  freshness: Pick<AnalysisFreshnessAxis, 'state'>;
  assurance: Pick<AnalysisAssuranceAxis, 'unresolvedConflictCount' | 'unresolvedItemCount' | 'lowConfidenceUnitCount' | 'crossUnitFindingCount' | 'sampledPrecision' | 'statement'>;
  manuscriptPin: { revisionLabel: string };
}): AnalysisSentence[] {
  const { coverage, reducerClosure, freshness, assurance } = revision;
  const read = revision.manuscriptPin.revisionLabel;
  const leads = assurance.unresolvedConflictCount + assurance.crossUnitFindingCount;
  const trust = [
    assurance.statement,
    ...(assurance.lowConfidenceUnitCount === 0 ? [] : [`其中 ${assurance.lowConfidenceUnitCount} 个阅读范围模型自评把握较低。`]),
    ...(assurance.sampledPrecision === null ? [] : [`抽样复核了 ${assurance.sampledPrecision.size} 条，${assurance.sampledPrecision.upheld} 条成立。`]),
    ...(leads === 0 && assurance.unresolvedItemCount === 0
      ? []
      : [`另有 ${leads} 处前后不一致的线索、${assurance.unresolvedItemCount} 项未决事项，归入审阅的「情节逻辑与前后一致」，不在这里列出。`]),
  ].join('');
  return [
    coverage.state === 'complete'
      ? { axis: 'coverage', heading: '覆盖范围', sentence: `全稿分成 ${coverage.unitsTotal} 个阅读范围，全部读完。`, nextAction: '无需处理。', target: null }
      : {
          axis: 'coverage',
          heading: '覆盖范围',
          sentence: `全稿分成 ${coverage.unitsTotal} 个阅读范围，已读完 ${coverage.unitsClosed} 个；还有 ${coverage.gapCount} 个没有读成，在「各章」里标为尚未分析。`,
          nextAction: '可在「历史与更新」里重新分析所选范围。',
          target: 'history',
        },
    reducerClosure.state === 'open'
      ? { axis: 'reducer-closure', heading: '全书综合', sentence: '还没有读完的范围可以合并，所以没有全书梗概。', nextAction: '先补齐尚未分析的范围。', target: 'history' }
      : {
          axis: 'reducer-closure',
          heading: '全书综合',
          sentence: reducerClosure.state === 'closed'
            ? '已把读完的范围合并成一份梗概，以及人物与名称、事件、关系、设定四份清单。'
            : '已把读完的范围合并成一份梗概，以及人物与名称、事件、关系、设定四份清单；没有读成的范围不在其中。',
          nextAction: reducerClosure.state === 'closed' ? '无需处理。' : '补齐尚未分析的范围后会重新合并。',
          target: reducerClosure.state === 'closed' ? null : 'chapters',
        },
    freshness.state === 'current'
      ? { axis: 'freshness', heading: '与当前稿件', sentence: `这份分析读的是 ${read}，稿件此后没有改动。`, nextAction: '无需处理。', target: null }
      : freshness.state === 'stale'
        ? { axis: 'freshness', heading: '与当前稿件', sentence: `这份分析读的是 ${read}，稿件此后有改动，分析已不是最新。`, nextAction: '可在「历史与更新」里同步到当前稿件。', target: 'history' }
        : { axis: 'freshness', heading: '与当前稿件', sentence: `这是较早的一份分析，读的是 ${read}；之后已有更新的分析，它按原样保留。`, nextAction: '可在「历史与更新」里返回最新的一份。', target: 'history' },
    { axis: 'assurance', heading: '可信程度', sentence: trust, nextAction: '需要核实的地方，到「审阅」的「情节逻辑与前后一致」处理。', target: null },
  ];
}

/** The Run Report's four stages in the editor's words; `阅读范围` is what the record calls a unit. */
export const RUN_REPORT_STAGE_LABELS: Record<RunReportStageId, string> = {
  units: '逐个阅读范围分析',
  'cross-unit-reduction': '跨范围比对',
  'assurance-sampling': '抽样复核',
  reduction: '合并整理',
};

export const RUN_REPORT_STAGE_STATE_LABELS: Record<RunReportStageProjection['state'], string> = {
  closed: '完成',
  'closed-with-gaps': '完成，有没读成的部分',
  gap: '没有完成',
  'not-run': '没有运行',
};

export const RUN_REPORT_CLASSIFICATION_LABELS: Record<RunReportRecordProjection['classification'], string> = {
  completed: '已完成',
  'completed-with-gaps': '已完成，保留了没读成的部分',
  failed: '失败',
  interrupted: '已中断',
  cancelled: '已取消',
};

/** How long a stage's own work took, in the reader's units; a stage that never ran has no duration to state. */
export function durationLabel(wallMs: number | null): string {
  if (wallMs === null) return '—';
  if (wallMs < 1000) return '不到 1 秒';
  const seconds = Math.round(wallMs / 1000);
  return seconds < 60 ? `${seconds} 秒` : `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`;
}

/**
 * The step a Run is in, as the Run Liveness Signal names it (V2-UX-LIVE-001, editor-surfaces §10): a
 * stage and its current object, never `分析单元进度`. The reflection turn runs last, after the revision is
 * already kept, which is what its label says so that an editor never reads it as the analysis still open.
 */
export const RUN_LIVENESS_STAGE_LABELS: Record<'units' | 'cross-unit-reduction' | 'assurance-sampling' | 'run-report-reflection', string> = {
  units: '正在逐个阅读范围分析',
  'cross-unit-reduction': '正在跨范围比对',
  'assurance-sampling': '正在抽样复核',
  'run-report-reflection': '分析已保存，正在写运行报告',
};

/** The report's unit accounting as one sentence; every figure is the record's own count. */
export function runReportUnitsSentence(units: RunReportUnitAccountingProjection): string {
  return `共 ${units.submitted} 个阅读范围：沿用上一份 ${units.reused} 个，重新分析 ${units.recomputed} 个，其中 ${units.gaps} 个没有读成，${units.retried} 个安全重试过。`;
}
