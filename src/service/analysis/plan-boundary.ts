import type {
  AnalysisReusePlanCounts,
  BaselineAnalysisPlanAdaptationProjection,
  BaselineAnalysisSelectedRange,
  MaterialPlanField,
  MaterialPlanInputsProjection,
  PlanBoundarySplitProjection,
  PlanRevisionDiffEntryProjection,
  PlanRevisionDiffValue,
} from '../../shared/protocol.js';
import { DIGEST_PATTERN, UUID_PATTERN, canonicalJson, canonicalRecord, isRecord, requireAnalysis } from './canonical.js';

/**
 * The Plan Boundary Split of the baseline-analysis Task kind and the material plan inputs whose
 * drift suspends authorization (ADR 0009, Issue #48). The split is part of the canonical Plan
 * Envelope: `运行中可调整` lists exactly the declared Plan Adaptation classes, `变化后必须暂停并重新授权`
 * lists the material fields, and `需要你参与的位置` states that no editor participation is expected for
 * this Task kind. A Plan Revision diff compares the material inputs a plan version froze with the
 * inputs re-derived from durable state (or proposed by a re-prepare) field by field; a later
 * manuscript edit, elapsed time, or a display label never appears in it.
 */
export const PLAN_ADAPTATION_CLASSES = ['safe-retry'] as const;
export type PlanAdaptationClass = (typeof PLAN_ADAPTATION_CLASSES)[number];

export const MATERIAL_PLAN_FIELDS: ReadonlyArray<MaterialPlanField> = [
  'providerBinding.providerId',
  'providerBinding.modelId',
  'providerBinding.adapterRevision',
  'providerBinding.configurationRevision',
  'providerBinding.credentialReference',
  'artifactPin.identity',
  'artifactPin.version',
  'artifactPin.nativeCarrierSha256',
  'artifactPin.sidecarRevision',
  'artifactPin.sidecarSha256',
  'selectedRange',
  'predecessorRevision',
  'runBudgetCeiling',
  'outboundDataCategory',
  'expectedOutcome',
];

export const MATERIAL_PLAN_FIELD_LABELS: Readonly<Record<MaterialPlanField, string>> = {
  'providerBinding.providerId': 'Provider 绑定 · provider',
  'providerBinding.modelId': 'Provider 绑定 · 模型',
  'providerBinding.adapterRevision': 'Provider 绑定 · adapter 修订',
  'providerBinding.configurationRevision': 'Provider 绑定 · 配置修订',
  'providerBinding.credentialReference': 'Provider 绑定 · Credential Reference',
  'artifactPin.identity': '权限承载构件 pin · 身份',
  'artifactPin.version': '权限承载构件 pin · 版本',
  'artifactPin.nativeCarrierSha256': '权限承载构件 pin · 原生构件摘要',
  'artifactPin.sidecarRevision': '权限承载构件 pin · 侧车修订',
  'artifactPin.sidecarSha256': '权限承载构件 pin · 侧车摘要',
  selectedRange: '重新分析所选范围 · 目标范围',
  predecessorRevision: '前一结果集修订版',
  runBudgetCeiling: 'Run Budget Ceiling 状态',
  outboundDataCategory: '外发数据类别',
  expectedOutcome: '预期结果类别',
};

export const SAFE_RETRY_STATEMENT = '单个分析单元的模型请求因瞬时模型服务错误（速率限制、服务端错误、传输失败）失败时，在冻结计划内以完全相同的单元消息安全重试一次；不改变执行绑定、运行来源范围、Provider 绑定、预算状态或覆盖清单。第二次失败即记录为缺口。' as const;
export const NO_PARTICIPATION_STATEMENT = '预计无需中途参与' as const;
export const PLAN_PREVIEW_FOOTER = '计划说明，不是运行授权' as const;
export const PLAN_REVISION_REQUIRED_REASON = 'plan-revision-required' as const;

/** The exact split every plan version of this Task kind carries inside its canonical envelope. */
export function planBoundarySplit(): PlanBoundarySplitProjection {
  return {
    adaptable: PLAN_ADAPTATION_CLASSES.map((adaptationClass) => ({ adaptationClass, label: '安全重试', statement: SAFE_RETRY_STATEMENT })),
    material: MATERIAL_PLAN_FIELDS.map((field) => ({ field, label: MATERIAL_PLAN_FIELD_LABELS[field] })),
    participation: { expected: false, statement: NO_PARTICIPATION_STATEMENT },
  };
}

function materialValueAt(inputs: MaterialPlanInputsProjection, field: MaterialPlanField): PlanRevisionDiffValue {
  switch (field) {
    case 'providerBinding.providerId': return inputs.providerBinding.providerId;
    case 'providerBinding.modelId': return inputs.providerBinding.modelId;
    case 'providerBinding.adapterRevision': return inputs.providerBinding.adapterRevision;
    case 'providerBinding.configurationRevision': return inputs.providerBinding.configurationRevision;
    case 'providerBinding.credentialReference': return inputs.providerBinding.credentialReference;
    case 'artifactPin.identity': return inputs.artifactPin.identity;
    case 'artifactPin.version': return inputs.artifactPin.version;
    case 'artifactPin.nativeCarrierSha256': return inputs.artifactPin.nativeCarrierSha256;
    case 'artifactPin.sidecarRevision': return inputs.artifactPin.sidecarRevision;
    case 'artifactPin.sidecarSha256': return inputs.artifactPin.sidecarSha256;
    case 'selectedRange': return inputs.selectedRange;
    case 'predecessorRevision': return inputs.predecessorRevision;
    case 'runBudgetCeiling': return inputs.runBudgetCeiling;
    case 'outboundDataCategory': return inputs.outboundDataCategory;
    case 'expectedOutcome': return inputs.expectedOutcome;
  }
}

/** Every material field whose frozen and proposed values differ, in the fixed field order; empty when nothing material drifted. */
export function diffMaterialPlanInputs(prior: MaterialPlanInputsProjection, proposed: MaterialPlanInputsProjection): PlanRevisionDiffEntryProjection[] {
  const entries: PlanRevisionDiffEntryProjection[] = [];
  for (const field of MATERIAL_PLAN_FIELDS) {
    const before = materialValueAt(prior, field);
    const after = materialValueAt(proposed, field);
    if (canonicalJson(before) !== canonicalJson(after)) {
      entries.push({ field, label: MATERIAL_PLAN_FIELD_LABELS[field], prior: before, proposed: after, materiality: 'material' });
    }
  }
  return entries;
}

/** The derived consequence a range change carries: the reuse-plan counts before and after; never itself a material field. */
export function reusePlanCountsDiffEntry(prior: AnalysisReusePlanCounts, proposed: AnalysisReusePlanCounts): PlanRevisionDiffEntryProjection | null {
  if (canonicalJson(prior) === canonicalJson(proposed)) return null;
  return { field: 'reusePlan.counts', label: '复用计划 · 复用/重算/失效/绕过', prior, proposed, materiality: 'derived' };
}

export function sameMaterialPlanInputs(left: MaterialPlanInputsProjection, right: MaterialPlanInputsProjection): boolean {
  return canonicalJson(left) === canonicalJson(right);
}

function asNumber(value: unknown, message: string): number {
  requireAnalysis(typeof value === 'number' && Number.isSafeInteger(value), 'ANALYSIS_RECORD_INVALID', message);
  return value;
}

function asString(value: unknown, message: string): string {
  requireAnalysis(typeof value === 'string', 'ANALYSIS_RECORD_INVALID', message);
  return value;
}

/**
 * The material inputs a frozen plan version carries, re-read from its own plan components: the
 * remote binding of the Provider Resolution Plan, the artifact pin, the reuse plan's selected range
 * and predecessor (absent for the first baseline), the ceiling and outbound category, and the
 * expected outcome class of the Task Intent.
 */
export function materialPlanInputsOfComponents(components: Readonly<Record<string, unknown>>, expectedOutcome: string): MaterialPlanInputsProjection {
  const providerPlan = components['provider-resolution-plan'];
  const artifactPin = components['artifact-pin'];
  const reusePlan = components['reuse-plan'];
  requireAnalysis(isRecord(providerPlan) && isRecord(providerPlan.remoteBinding) && isRecord(artifactPin), 'ANALYSIS_RECORD_INVALID', '计划组件缺少物质输入。');
  const binding = providerPlan.remoteBinding;
  const range = isRecord(reusePlan) && isRecord(reusePlan.selectedRange) ? reusePlan.selectedRange : null;
  const predecessor = isRecord(reusePlan) && isRecord(reusePlan.predecessor) ? reusePlan.predecessor : null;
  return {
    providerBinding: {
      providerId: asString(binding.providerId, 'Provider 绑定记录无效。'),
      modelId: asString(binding.modelId, 'Provider 绑定记录无效。'),
      adapterRevision: asNumber(binding.adapterRevision, 'Provider 绑定记录无效。'),
      configurationRevision: asNumber(binding.configurationRevision, 'Provider 绑定记录无效。'),
      credentialReference: asString(binding.credentialReference, 'Provider 绑定记录无效。'),
    },
    artifactPin: {
      identity: asString(artifactPin.identity, '构件 pin 记录无效。'),
      version: asString(artifactPin.version, '构件 pin 记录无效。'),
      nativeCarrierSha256: asString(artifactPin.nativeCarrierSha256, '构件 pin 记录无效。'),
      sidecarRevision: asNumber(artifactPin.sidecarRevision, '构件 pin 记录无效。'),
      sidecarSha256: asString(artifactPin.sidecarSha256, '构件 pin 记录无效。'),
    },
    selectedRange: range === null ? null : { startPosition: asNumber(range.startPosition, '所选范围记录无效。'), endPosition: asNumber(range.endPosition, '所选范围记录无效。') },
    predecessorRevision: predecessor === null ? null : {
      revisionId: asString(predecessor.revisionId, '前一修订版记录无效。'),
      ordinal: asNumber(predecessor.ordinal, '前一修订版记录无效。'),
      digest: asString(predecessor.digest, '前一修订版记录无效。'),
    },
    runBudgetCeiling: 'unset',
    outboundDataCategory: 'public-or-synthetic',
    expectedOutcome,
  };
}

export interface PlanAdaptationRecordInput {
  readonly adaptationId: string;
  readonly attemptId: string;
  readonly runRecordId: string;
  readonly taskIntentId: string;
  readonly ordinal: number;
  readonly unitOrdinal: number;
  readonly attemptIndex: number;
  readonly classifiedReason: string;
  readonly failureCode: string;
  readonly failureClass: string;
  readonly failureStatus: number | null;
  readonly requestDigest: string;
  readonly firstPayloadDigest: string | null;
  readonly planEnvelopeDigest: string;
  readonly bindingDigest: string;
  readonly recordedAt: string;
}

/**
 * The immutable `safe-retry` Plan Adaptation record, written before the retry is dispatched: the
 * unit, the class, the attempt index the repetition will carry, the classified reason of the failed
 * first attempt, the first attempt's payload digest, and the unchanged envelope and binding digests.
 * The retry's own payload digest is recorded by the retry's harness span once it exists.
 */
export function buildPlanAdaptationRecord(input: PlanAdaptationRecordInput): { record: Omit<BaselineAnalysisPlanAdaptationProjection, 'label'>; json: string; digest: string } {
  requireAnalysis(UUID_PATTERN.test(input.adaptationId) && UUID_PATTERN.test(input.attemptId) && UUID_PATTERN.test(input.runRecordId) && UUID_PATTERN.test(input.taskIntentId),
    'ANALYSIS_RECORD_INVALID', '计划内调整记录身份无效。');
  requireAnalysis(Number.isSafeInteger(input.ordinal) && input.ordinal >= 1 && Number.isSafeInteger(input.unitOrdinal) && input.unitOrdinal >= 1 &&
    input.attemptIndex === 2 && DIGEST_PATTERN.test(input.requestDigest) && DIGEST_PATTERN.test(input.planEnvelopeDigest) && DIGEST_PATTERN.test(input.bindingDigest) &&
    (input.firstPayloadDigest === null || DIGEST_PATTERN.test(input.firstPayloadDigest)), 'ANALYSIS_RECORD_INVALID', '计划内调整记录无效。');
  const record = {
    adaptationId: input.adaptationId,
    attemptId: input.attemptId,
    runRecordId: input.runRecordId,
    taskIntentId: input.taskIntentId,
    ordinal: input.ordinal,
    unitOrdinal: input.unitOrdinal,
    adaptationClass: 'safe-retry' as const,
    attemptIndex: input.attemptIndex,
    classifiedReason: input.classifiedReason,
    failureCode: input.failureCode,
    failureClass: input.failureClass,
    failureStatus: input.failureStatus,
    requestDigest: input.requestDigest,
    firstPayloadDigest: input.firstPayloadDigest,
    planEnvelopeDigest: input.planEnvelopeDigest,
    bindingDigest: input.bindingDigest,
    recordedAt: input.recordedAt,
  };
  const canonical = canonicalRecord(record);
  return { record, json: canonical.json, digest: canonical.digest };
}

/** The timeline and Overview wording of one adaptation: `计划内调整 · 单元 N 安全重试 1 次 · <classified reason>`. */
export function planAdaptationLabel(unitOrdinal: number, classifiedReason: string): string {
  return `计划内调整 · 单元 ${unitOrdinal} 安全重试 1 次 · ${classifiedReason}`;
}

/** The wording of one Plan Revision: `计划修订 · 版本 m → m+1 · <changed fields>`; a pending revision names the next version it will yield. */
export function planRevisionLabel(priorOrdinal: number, nextOrdinal: number | null, changedFields: ReadonlyArray<string>): string {
  const next = nextOrdinal ?? priorOrdinal + 1;
  return `计划修订 · 版本 ${priorOrdinal} → ${next}${nextOrdinal === null ? '（待重新确认）' : ''} · ${changedFields.join('、')}`;
}

export function selectedRangeEquals(left: BaselineAnalysisSelectedRange | null, right: BaselineAnalysisSelectedRange | null): boolean {
  return left === null || right === null ? left === right : left.startPosition === right.startPosition && left.endPosition === right.endPosition;
}
