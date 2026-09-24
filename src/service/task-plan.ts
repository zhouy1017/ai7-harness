import type {
  AnalysisReusePlanCounts,
  BaselineAnalysisPlanRevisionProjection,
  DefaultExecutionRuleBinding,
  BaselineAnalysisProjection,
  BaselineAnalysisSelectedRange,
  PlanRevisionDiffEntryProjection,
  PlanRevisionDiffValue,
  ProviderProcessingPin,
  RunBudgetCeilingState,
  TaskAuthorizationProjection,
  TaskPlanDefaultRuleProjection,
  TaskPlanDriftEntryProjection,
  TaskPlanProjection,
  TaskPlanClarificationProjection,
  TaskPlanRedoProjection,
  TaskPlanRunControlProjection,
  TaskPlanStartProjection,
  TaskPlanStepProjection,
} from '../shared/protocol.js';
import { BASELINE_ANALYSIS_MODE_GOALS, BASELINE_ANALYSIS_TASK_GOAL } from '../shared/protocol.js';
import type { ClarificationFacts } from './analysis/clarifications.js';
import { namedNonEffects } from './analysis/baseline-analysis-store.js';
import type { ManifestBlockInput } from './analysis/coverage-manifest.js';
import { PLAN_CEILING_LAUNCH_REASON, PLAN_EDITABLE_ADAPTATIONS, PLAN_EDIT_ADAPTATION_LABELS, PLAN_EDIT_STEP_LABELS } from './analysis/plan-edits.js';
import type { Connectivity } from './connectivity.js';
import { graphemeCount, sliceGraphemes } from './analysis/factual-review-contract.js';
import type { ReviewRunPlanFacts } from './review/review-runs.js';

/**
 * The Task Drawer's plan projection (Issue #418, plan slice S72; editor-surfaces §6 ③, V2-UX-PLAN-001 to
 * 012, TASK-030, TASK-039/040, LAYER-002, MODEL-013/014): one projection for the three Task kinds that
 * hold a plan today — J-03's fixed task, the baseline analysis and a Review Run.
 *
 * It is digest-neutral by construction. Every builder here is a pure function of a projection the kind's
 * own store already produces, of the blocks of the Task Input revision that plan froze, and of the Book's
 * title: nothing is written, and no stored byte is relabelled. What a record says in the engineer's words
 * — a stored diff's label, a stored step list, a named non-effect — stays in the technical layer exactly as
 * it is stored, and the editor's words beside it are derived here from the field key or the state that
 * record carries (S72 D2, D7, D8).
 *
 * Since Issue #420 (plan slice S74a) each plan also says what the drawer's authorization bar offers —
 * `start` — read from the same records: whether 开始任务 dispatches, only records, or waits on a changed
 * plan or a model connection, and the exact digests one activation binds. Reading it authorizes nothing.
 */

export class TaskPlanError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'TaskPlanError';
  }
}

function requirePlan(condition: unknown, message: string): asserts condition {
  if (!condition) throw new TaskPlanError('TASK_PLAN_UNAVAILABLE', message);
}

// ---- the words every kind shares --------------------------------------------------------------------

/** V2-UX-PLAN-005's statement when no participation is expected during a Run. */
export const NO_PARTICIPATION = '预计无需中途参与';
/** The send summary of a launch that connects to no model service (S72 D7). */
export const NOTHING_SENT = '本环境不连接模型服务，不会发送任何内容';
/** V2-UX-MODEL-013's exact wording for the default Run Budget Ceiling state. */
export const BUDGET_NOT_SET = '未设置任务预算上限';
/** V2-UX-MODEL-014: an unknown Provider Account Limit is said to be unknown, never given a value. */
export const ACCOUNT_LIMIT_UNKNOWN = '未知 · 提供方未返回';
/** No Run has measured a duration this estimate could stand on. */
export const DURATION_UNKNOWN = '暂无可靠估计';
const NO_USAGE = '不发送，没有模型用量';
const NOT_READ = '其他图书；来源材料（来源版本仅作血缘证据，不属于可读范围）';
/**
 * `这些一变就先停下来问你` (PLAN-004, PLAN-012): the three groups the authorization rules fix, each locked.
 * The first names the procedure too, because the authority-bearing artifact pin is one of the fields
 * whose change suspends a plan and nothing authority-bearing reads one step away (LAYER-002).
 */
export const LOCKED_BOUNDARY = ['要做的事、处理范围、参考范围与所用工序', '模型服务、发送内容类别、预算上限', '结果类型、受控动作'] as const;
/** `运行中 AI7 可以自己调整`: the one adaptation class the analysis ledgers declare (`safe-retry`). */
const SAFE_RETRY_ADAPTATION = PLAN_EDIT_ADAPTATION_LABELS['safe-retry'];
/**
 * Why a baseline analysis plan takes no edit now (Issue #419, V2-UX-PLAN-011): its key content changed, which
 * 重新确认计划 settles first — the editor's pending edits are kept for the version it writes — or its Run began.
 */
export const PLAN_EDIT_DRIFT_REASON = '计划的关键内容已变化：先重新确认计划，你的改动会保留';
export const PLAN_EDIT_STARTED_REASON = '任务已经开始，计划不能再改';
/** A plan the editor cannot edit because its kind keeps no plan versions. */
const NOT_EDITABLE: TaskPlanProjection['edit'] = { editable: false, reason: null, lastEdit: null, planEnvelopeDigest: null, budget: null };

/** 已停止 · 预算已达上限 (Issue #51, S16a; editor-surfaces §6 状态): the pill of a Run the Run Budget Ceiling stopped. */
export const BUDGET_REACHED_STATE = { key: 'budget-reached', label: '已停止 · 预算已达上限' } as const;
/** §10's editorial 不会做: the technical half reads in 查看技术详情. */
const EDITORIAL_NOT_DO = ['不会直接修改稿件', '不导出或发布', '不存里程碑版本'] as const;

const ROLE_LABELS: Readonly<Record<string, string>> = { 'Main Editorial Role': '主编辑角色' };
const PROVIDER_LABELS: Readonly<Record<string, string>> = {
  'deepseek-open-platform': 'DeepSeek 开放平台',
  'opencode-go': 'OpenCode Go',
  'opencode-go-messages': 'OpenCode Go',
  'opencode-go-responses': 'OpenCode Go',
};
const OUTBOUND_LABELS: Readonly<Record<string, string>> = { 'public-or-synthetic': '公开或合成材料' };

/** A count with its thousands grouped, the same text on every host: the projection never reads a locale. */
export function groupedCount(value: number): string {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/gu, ',');
}

function roleLabel(role: string): string {
  return ROLE_LABELS[role] ?? role;
}

function providerLabel(providerId: string): string {
  return PROVIDER_LABELS[providerId] ?? providerId;
}

function outboundLabel(category: string): string {
  return OUTBOUND_LABELS[category] ?? category;
}

export function budgetCeilingLabel(ceiling: RunBudgetCeilingState): string {
  return ceiling === 'unset' ? BUDGET_NOT_SET : `任务运行预算上限：${groupedCount(ceiling.maxTotalTokens)} tokens`;
}

// ---- 默认执行规则 (Issue #421, plan slice S75) -----------------------------------------------------------------

/** `设为快速开始默认…` where the plan's kind takes no rule: shown, disabled, with the reason (S75 D3). */
export function noDefaultRule(reason: string): TaskPlanDefaultRuleProjection {
  return { canSet: false, reason, planEnvelopeDigest: null, current: null, binds: [], startedBy: null };
}
/** J-03's fixed Task is only ever recorded (ADR 0055): there is nothing a rule could start. */
export const FIXED_TASK_NO_RULE = '这项固定任务只记录运行，不能设为快速开始默认。';
/** A Review Run's quick start stays unavailable (S75 D3). */
export const REVIEW_RUN_NO_RULE = '审阅还不能设为快速开始默认：每次审阅都先看计划，再开始审阅。';

/**
 * What a rule set from a plan binds, in the editor's words: the confirmation of `设为快速开始默认…` lists exactly
 * these rows, and 知识库 › 工序与规则 lists them again for the rule in force.
 */
export function defaultRuleBindingRows(binding: DefaultExecutionRuleBinding): ReadonlyArray<{ label: string; value: string }> {
  const provider = binding.providerBinding;
  const pin = binding.artifactPin;
  return [
    { label: '模型服务', value: `${providerLabel(provider.providerId)} · ${provider.modelId}（凭据引用 ${provider.credentialReference}）` },
    { label: '工序', value: `基线分析 · ${pin.identity} ${pin.version}（方案修订 ${pin.sidecarRevision}）` },
    { label: '预算上限', value: budgetCeilingLabel(binding.runBudgetCeiling) },
    { label: '发送内容类别', value: outboundLabel(binding.outboundDataCategory) },
    { label: '会得到', value: binding.expectedOutcome },
  ];
}

/**
 * The Provider Processing pin exactly as the plan has always read it: `development-ci · v1 · 拒绝 · 0 次实时传输`
 * is the reading J-03 pins; a future scope's pin reads faithfully instead of repeating that constant.
 */
export function pinReading(pin: ProviderProcessingPin): string {
  return `${pin.operationalScope} · ${pin.version} · ${pin.decision === 'deny' ? '拒绝' : pin.decision} · ${pin.authorizedLiveTransmissionCount} 次实时传输`;
}

// ---- the range a plan reads ---------------------------------------------------------------------------

const MAX_HEADING_GRAPHEMES = 40;

/** What one block range of a Task Input revision holds: its graphemes and the chapter headings inside it. */
export interface RangeReading {
  /** `null` reads the whole revision. */
  readonly range: BaselineAnalysisSelectedRange | null;
  readonly graphemes: number;
  readonly headings: ReadonlyArray<string>;
}

function boundedHeading(text: string): string {
  const trimmed = text.trim();
  return graphemeCount(trimmed) <= MAX_HEADING_GRAPHEMES ? trimmed : `${sliceGraphemes(trimmed, 0, MAX_HEADING_GRAPHEMES - 1)}…`;
}

/** Sum the graphemes of a range of the revision's blocks and collect its headings; `null` reads the whole. */
export function readRange(blocks: ReadonlyArray<ManifestBlockInput>, range: BaselineAnalysisSelectedRange | null): RangeReading {
  const inside = range === null ? blocks : blocks.filter((block) => block.position >= range.startPosition && block.position <= range.endPosition);
  return {
    range,
    graphemes: inside.reduce((total, block) => total + block.graphemes, 0),
    headings: inside.filter((block) => block.kind === 'heading').map((block) => boundedHeading(block.text)).filter((text) => text.length > 0),
  };
}

/** 位置 (S72 D5): the chapter headings the range holds, `第 a–b 段` when it holds none, and `全书` for the whole. */
export function positionLabel(reading: RangeReading): string {
  if (reading.range === null) return '全书';
  const first = reading.headings[0];
  const last = reading.headings.at(-1);
  if (first === undefined || last === undefined) return `第 ${reading.range.startPosition}–${reading.range.endPosition} 段`;
  return first === last ? `「${first}」` : `「${first}」至「${last}」`;
}

// ---- the plan's key content, relabelled by field key (D8) -------------------------------------------------

/** The editor's name for each field a stored Plan Revision diff names; the stored label stays in the record. */
export const DRIFT_FIELD_LABELS: Readonly<Record<string, string>> = {
  'providerBinding.providerId': '模型服务 · 提供方',
  'providerBinding.modelId': '模型服务 · 模型',
  'providerBinding.adapterRevision': '模型服务 · 接入修订',
  'providerBinding.configurationRevision': '模型服务 · 配置修订',
  'providerBinding.credentialReference': '模型服务 · 连接',
  'artifactPin.identity': '所用工序 · 方案',
  'artifactPin.version': '所用工序 · 方案版本',
  'artifactPin.nativeCarrierSha256': '所用工序 · 方案内容',
  'artifactPin.sidecarRevision': '所用工序 · 权限规则版本',
  'artifactPin.sidecarSha256': '所用工序 · 权限规则内容',
  selectedRange: '处理范围',
  predecessorRevision: '要更新的那一份分析',
  runBudgetCeiling: '预算上限',
  outboundDataCategory: '发送内容类别',
  expectedOutcome: '会得到的结果',
  'reusePlan.counts': '重新分析与沿用的阅读范围',
  // The editor's own edits (Issue #419): a step left out, an adaptation withdrawn.
  'steps.assurance-sampling': `步骤 · ${PLAN_EDIT_STEP_LABELS['assurance-sampling']}`,
  'adaptations.safe-retry': '可以自己调整 · 安全地再试一次',
};

function countsReading(counts: AnalysisReusePlanCounts): string {
  return `重新分析 ${counts.recomputed} 个，沿用 ${counts.reused} 个`;
}

function driftValue(field: string, value: PlanRevisionDiffValue, blocks: ReadonlyArray<ManifestBlockInput>): string {
  if (value === null) return '无';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') return field === 'outboundDataCategory' ? outboundLabel(value) : value;
  if ('startPosition' in value) {
    const reading = readRange(blocks, value);
    return `${positionLabel(reading)} · ${groupedCount(reading.graphemes)} 字`;
  }
  if ('revisionId' in value) return `第 ${value.ordinal} 份分析`;
  if ('kind' in value) return budgetCeilingLabel(value);
  return countsReading(value);
}

/** One stored diff entry in the drawer's words, read by its field key and never by its stored label. */
export function driftEntry(entry: PlanRevisionDiffEntryProjection, blocks: ReadonlyArray<ManifestBlockInput>): TaskPlanDriftEntryProjection {
  return {
    field: entry.field,
    label: DRIFT_FIELD_LABELS[entry.field] ?? entry.field,
    prior: entry.field === 'runBudgetCeiling' && entry.prior === 'unset' ? BUDGET_NOT_SET : driftValue(entry.field, entry.prior, blocks),
    proposed: entry.field === 'runBudgetCeiling' && entry.proposed === 'unset' ? BUDGET_NOT_SET : driftValue(entry.field, entry.proposed, blocks),
    materiality: entry.materiality,
  };
}

// ---- the authorization bar (Issue #420, plan slice S74a; editor-surfaces §6 常驻授权条) ------------------

/**
 * What the bar offers once the Task has been started (AUTH-007): nothing to bind, only the Run's state.
 * `needsModelConnection` still says what the route is, so a reader never has to infer it from the state.
 */
function startedBar(needsModelConnection: boolean): TaskPlanStartProjection {
  return { readiness: 'started', needsModelConnection, planEnvelopeDigest: null, categoryDigests: [], reconfirm: null };
}

/** 模型未连接 (editor-surfaces §6 状态, §10): the pill of a plan whose route cannot reach its model service now. */
export const MODEL_UNCONNECTED_STATE = { key: 'unconnected', label: '模型未连接' } as const;

/**
 * Route-aware readiness (S74a A3; V2-UX-AUTH-005, MODEL-008, OFF-009): a plan whose route sends to a model
 * service can start only while the credential that route resolves is present. `credential` is what the
 * service found — the readiness check dispatch makes, with the value resolved and discarded — or `null`
 * when the launch holds no such credential at all. A plan whose route sends nothing, one already started,
 * and one whose key content changed read exactly as they came. The blocker is the Run's, never the
 * plan's: `drift` and every frozen fact stay as they were, so a missing credential invents no revision.
 */
export function withConnectionReadiness(plan: TaskPlanProjection, credential: 'present' | 'missing' | null): TaskPlanProjection {
  if (!plan.start.needsModelConnection || credential === 'present' || plan.start.readiness !== 'ready') return plan;
  return {
    ...plan,
    state: { ...MODEL_UNCONNECTED_STATE },
    start: { ...plan.start, readiness: 'needs-connection', planEnvelopeDigest: null, categoryDigests: [] },
  };
}

/** 离线 (editor-surfaces §6 状态): the pill of a plan whose route reaches its model over a network this device lacks now. */
export const OFFLINE_STATE = { key: 'offline', label: '离线' } as const;

/**
 * Connectivity readiness (Issue #502, plan slice S74b; V2-UX-AUTH-002, AUTH-005, OFF-004): a plan that could
 * start now, and whose route reaches its model service over the network, reads 离线 while this device has no
 * network. 联网后开始任务 then binds exactly the digests 开始任务 would, and the Run waits for Reconnect
 * Preflight. A missing credential is decided first — 模型未连接 is fixed in 设置, never waited out — and
 * nothing frozen moves: the reading is the device's, never the plan's, so it invents no revision (OFF-009).
 */
export function withConnectivityReadiness(plan: TaskPlanProjection, reachesNetwork: boolean, connectivity: Connectivity): TaskPlanProjection {
  if (!reachesNetwork || connectivity === 'online' || plan.start.readiness !== 'ready') return plan;
  return { ...plan, state: { ...OFFLINE_STATE }, start: { ...plan.start, readiness: 'offline' } };
}

/**
 * What a Run in Connectivity Wait waits for (OFF-006, OFF-009): the network, a model connection the editor
 * must fix in 设置, or the one execution slot — or nothing any more, when the next Reconnect Preflight will
 * admit it (正在排队, AUTH-007). Each is its own words, so a wait never reads as a pause, as activity, or as
 * the plan having changed.
 */
export const WAITING_LABELS = { network: '等待网络', connection: '需要处理模型连接', slot: '等待运行名额', admitting: '正在排队' } as const;
export type WaitingFor = keyof typeof WAITING_LABELS;

/** The waiting Run's pill, in the words of what it waits for now; any other plan reads exactly as it came. */
export function withWaitingReason(plan: TaskPlanProjection, waitingFor: WaitingFor): TaskPlanProjection {
  if (plan.state.key !== 'waiting') return plan;
  return { ...plan, state: { key: 'waiting', label: WAITING_LABELS[waitingFor] } };
}

/**
 * 重新确认计划's request for a baseline Task whose key content changed: the same Task Intent's goal, its
 * mode, and — for 重新分析所选范围 — the range the pending revision proposes, exactly as ②A sent it before
 * the action moved into the bar.
 */
function reconfirmRequest(projection: BaselineAnalysisProjection, revision: BaselineAnalysisPlanRevisionProjection): TaskPlanStartProjection['reconfirm'] {
  const intent = projection.taskIntent!;
  return {
    goal: intent.goal,
    update: intent.mode === 'first-baseline'
      ? null
      : { mode: intent.mode, selectedRange: intent.mode === 'reanalyze-range' ? revision.proposed.selectedRange : null },
  };
}

/** The bar of the Book's baseline analysis Task: the ledger's own `canAuthorize` and `canReconfirmPlan`, read. */
function baselineStart(projection: BaselineAnalysisProjection, planEnvelopeDigest: string): TaskPlanStartProjection {
  const route = projection.providerResolutionPlan!.executionRoute;
  const needsModelConnection = route.kind === 'opencode-go';
  if (projection.authorization !== null) return startedBar(needsModelConnection);
  const revision = projection.planRevision;
  if (!projection.actions.canAuthorize) {
    return {
      readiness: 'changed',
      needsModelConnection,
      planEnvelopeDigest: null,
      categoryDigests: [],
      reconfirm: revision !== null && projection.actions.canReconfirmPlan ? reconfirmRequest(projection, revision) : null,
    };
  }
  return { readiness: route.kind === 'none' ? 'no-route' : 'ready', needsModelConnection, planEnvelopeDigest, categoryDigests: [], reconfirm: null };
}

// ---- J-03's fixed task ----------------------------------------------------------------------------------

/**
 * The plan of J-03's fixed task: one Task per Book that is only ever recorded, never dispatched. Its steps
 * are what preparing and authorizing it actually do (D7); the three analysis steps its Execution Plan
 * stores are the record's own words and read in the technical layer, because this Task never runs them.
 */
export function fixedTaskPlan(input: {
  projection: TaskAuthorizationProjection;
  bookTitle: string;
  blocks: ReadonlyArray<ManifestBlockInput>;
}): TaskPlanProjection {
  const { projection, bookTitle } = input;
  const intent = projection.taskIntent;
  const checkpoint = projection.checkpoint;
  const manuscriptPin = projection.manuscriptPin;
  const sourceScope = projection.runSourceScope;
  const artifact = projection.artifactPin;
  const provider = projection.providerResolutionPlan;
  const plan = projection.executionPlan;
  const envelope = projection.planEnvelope;
  requirePlan(intent !== null && checkpoint !== null && manuscriptPin !== null && sourceScope !== null && artifact !== null &&
    provider !== null && plan !== null && envelope !== null, '这项任务还没有准备计划。');
  const whole = readRange(input.blocks, null);
  const pin = provider.providerProcessing;
  const recorded = projection.state === 'authorized';
  return {
    bookId: projection.bookId,
    kind: 'fixed-task',
    ref: intent.taskIntentId,
    state: recorded ? { key: 'recorded', label: '已记录 · 未派发' } : { key: 'ready', label: '尚未开始' },
    planVersion: null,
    goal: {
      sentence: intent.goal,
      chips: { book: bookTitle, position: '全书', selectedGraphemes: whole.graphemes, taskInputRevision: checkpoint.revisionLabel, procedure: '固定任务' },
      savedForEdits: checkpoint.createdForDirtyJournal,
    },
    scope: {
      process: `《${bookTitle}》全书 · ${groupedCount(whole.graphemes)} 字 · 任务输入修订版 ${checkpoint.revisionLabel}`,
      reference: [],
      send: '不发送任何内容',
      notRead: NOT_READ,
    },
    steps: [
      { id: 'task-input', label: '准备任务输入', result: `任务输入修订版 ${checkpoint.revisionLabel}`, removable: false, removed: false },
      { id: 'record-run', label: '记录运行（不派发）', result: '运行记录', removable: false, removed: false },
    ],
    participation: { during: NO_PARTICIPATION, after: null },
    service: {
      role: roleLabel(provider.role),
      provider: `${providerLabel(provider.providerId)} · ${provider.modelId}`,
      decision: pin.decision === 'deny'
        ? `远程模型服务被拒绝（${pin.operationalScope} · ${pin.version}：0 次实时传输）；这项任务只记录，不派发`
        : `远程模型服务在 ${pin.operationalScope} · ${pin.version} 下仅限资格；这项任务只记录，不派发`,
      send: NOTHING_SENT,
      sendCategory: outboundLabel(provider.outboundDataCategory),
      usage: NO_USAGE,
      usageIsCeiling: false,
      duration: DURATION_UNKNOWN,
      budgetCeiling: budgetCeilingLabel(provider.runBudgetCeiling),
      accountLimit: ACCOUNT_LIMIT_UNKNOWN,
    },
    outcomes: ['一条运行记录：只记录这次运行授权，不派发，不产出重点清单'],
    notDo: {
      editorial: ['不会开始运行（只记录）', ...EDITORIAL_NOT_DO, '不读这本书以外的内容'],
      technical: [...projection.namedNonEffects],
    },
    boundary: { adaptable: [], askFirst: [...LOCKED_BOUNDARY] },
    edit: NOT_EDITABLE,
    drift: null,
    technical: [
      { key: 'task-intent', label: '任务意图', value: intent.taskIntentId },
      { key: 'expected-outcome', label: '预期结果类别', value: intent.expectedOutcome },
      { key: 'task-input-revision', label: '任务输入修订版', value: `${checkpoint.revisionLabel} · ${checkpoint.revisionId} · ${checkpoint.revisionDigest}` },
      { key: 'task-input-checkpoint', label: '任务输入修订版用途', value: `${checkpoint.purpose} · ${checkpoint.createdForDirtyJournal ? '由已确认编辑创建' : '复用当前精确修订版'} · 修订日志序号 ${checkpoint.journalSequence}` },
      { key: 'readable-scope', label: '可读范围', value: `仅图书 ${sourceScope.bookId} · 主稿件 ${sourceScope.manuscriptId} · 任务输入修订版 ${sourceScope.taskInputRevision.revisionId} · ${sourceScope.taskInputRevision.revisionDigest}` },
      { key: 'source-evidence', label: '来源版本证据', value: `${sourceScope.sourceVersionEvidence.sourceVersionId} · 仅血缘证据，不属于可读范围` },
      { key: 'source-digest', label: '来源摘要', value: manuscriptPin.sourceDigest },
      { key: 'native-artifact', label: '原生构件', value: `${artifact.identity}@${artifact.version} · ${artifact.nativeCarrierSha256}` },
      { key: 'authority-sidecar', label: '权限侧车', value: `${artifact.sidecarIdentity} · Revision ${artifact.sidecarRevision} · ${artifact.sidecarSha256}` },
      { key: 'provider-binding', label: '模型提供方绑定', value: `${provider.providerId} · ${provider.modelId} · adapter r${provider.adapterRevision} · config r${provider.configurationRevision}` },
      { key: 'capabilities', label: 'AI7 能力', value: provider.capabilities.length === 0 ? '未声明' : provider.capabilities.join('、') },
      { key: 'fallback-chain', label: '已批准备用链', value: provider.approvedFallbackChain.length === 0 ? '未声明' : provider.approvedFallbackChain.join('、') },
      { key: 'credential-reference', label: '凭据引用', value: provider.credentialReference },
      { key: 'credential-readiness', label: '凭据就绪', value: `readiness ${provider.credentialReadiness}` },
      { key: 'outbound-category', label: '外发数据类别', value: provider.outboundDataCategory },
      { key: 'run-budget-ceiling', label: '任务运行预算上限', value: provider.runBudgetCeiling === 'unset' ? 'unset' : `${provider.runBudgetCeiling.maxTotalTokens} tokens` },
      { key: 'provider-processing', label: '模型服务数据处理策略', value: pinReading(pin) },
      { key: 'execution-steps', label: '计划步骤（记录）', value: plan.steps.join(' → ') },
      { key: 'effects', label: '受控动作', value: plan.effects.length === 0 ? '未声明' : plan.effects.join('、') },
      { key: 'stop-condition', label: '停止条件', value: plan.stopCondition },
      { key: 'dispatch', label: '派发状态', value: envelope.summary },
      { key: 'plan-envelope', label: '计划权限边界', value: envelope.digest },
      ...(projection.authorization === null ? [] : [
        { key: 'authorization', label: '运行授权', value: `${projection.authorization.authorizationId} · ${projection.authorization.origin} · ${projection.authorization.authorizedAt}` },
      ]),
      ...(projection.runRecord === null ? [] : [
        { key: 'run-record', label: '运行记录', value: `${projection.runRecord.runRecordId} · ${projection.runRecord.state} · ${projection.runRecord.recordedAt}` },
      ]),
    ],
    // ADR 0055: this Task is only ever recorded. Its route sends nothing, so it needs no credential, and its
    // record never enters the scheduler, a wait, or an automatic start.
    start: recorded || !projection.actions.canAuthorize
      ? startedBar(false)
      : { readiness: 'record-only', needsModelConnection: false, planEnvelopeDigest: envelope.digest, categoryDigests: [], reconfirm: null },
    defaultRule: noDefaultRule(FIXED_TASK_NO_RULE),
    runControl: null,
    redo: null,
    clarifications: [],
    budgetStop: null,
  };
}

// ---- the baseline analysis ------------------------------------------------------------------------------

/** The baseline plan read without the Book's rules: nothing can be set from it here. */
const BASELINE_NO_RULE = '这份计划不能设为快速开始默认。';

/** The task sentence of each baseline mode in the editor's words; the stored goal reads in the technical layer. */
const BASELINE_GOAL_SENTENCES: Readonly<Record<string, string>> = {
  'first-baseline': '为这本书做基线分析：梗概、人物与名称、事件、关系、设定和各章',
  'sync-current': '把基线分析同步到当前稿件：只重新分析改动过的阅读范围，其余沿用上一份',
  'reanalyze-range': '重新分析所选范围，其余阅读范围沿用上一份',
  'reanalyze-book': '重新分析全书，不沿用以前的结果',
};

function baselineState(projection: BaselineAnalysisProjection): TaskPlanProjection['state'] {
  switch (projection.state) {
    case 'prepared':
      return projection.planRevision !== null || (projection.update !== null && !projection.update.predecessorCurrent)
        ? { key: 'changed', label: '计划已变化' }
        : { key: 'ready', label: '尚未开始' };
    case 'authorized-blocked':
      return { key: 'blocked', label: '派发前已阻止' };
    // Connectivity Wait (Issue #502): the label says what it waits for once the service has looked
    // (`withWaitingReason`); on its own the record says only that it waits for the network.
    case 'waiting':
      return { key: 'waiting', label: WAITING_LABELS.network };
    // A Run the editor cancelled before it ran anything keeps the dash of a cancelled wait (Issue #502); one it
    // cancelled after it began reading reads 已取消 in its own shape, and 正在取消 while it stops (Issue #422).
    case 'cancelled':
      return projection.run !== null && projection.run.transitions.some((transition) => transition.state === 'executing')
        ? { key: 'cancelled-after-start', label: '已取消' }
        : { key: 'cancelled', label: '已取消' };
    case 'cancelling':
      return { key: 'cancelling', label: '正在取消' };
    // 暂停 and 续行 (Issue #422, S76b; CTRL-001, CONT-014).
    case 'pausing':
      return { key: 'pausing', label: '正在暂停' };
    case 'paused':
      return { key: 'paused', label: '已暂停' };
    case 'resumable':
      return { key: 'resumable', label: '任务已中断 · 可续行' };
    // 任务等待你的说明 (Issue #422, S76d; CLAR-004): every unit the Run could read is read; it waits for the answer.
    case 'awaiting-clarification':
      return { key: 'awaiting-clarification', label: '任务等待你的说明' };
    case 'admitted':
      return { key: 'running', label: '正在排队' };
    case 'executing':
      return { key: 'running', label: '运行中' };
    case 'settled':
      return { key: 'settled', label: '已完成' };
    case 'failed':
      return { key: 'stopped', label: '运行失败' };
    // Run Budget Ceiling Reached (Issue #51, S16a; MODEL-016): interrupted, and its outcome names the ceiling.
    case 'interrupted':
      return projection.taskOutcome?.stop?.reason === 'run-budget-ceiling-reached' ? { ...BUDGET_REACHED_STATE } : { key: 'stopped', label: '已中断' };
    default:
      return { key: 'ready', label: '尚未开始' };
  }
}

/**
 * Whether the editor can edit the baseline analysis plan now, and the edit that made the version shown (Issue #419,
 * V2-UX-PLAN-011): a plan takes edits while it is prepared and unauthorized and no key-content change is pending.
 */
function baselinePlanEdit(
  projection: BaselineAnalysisProjection,
  ordinal: number,
  blocks: ReadonlyArray<ManifestBlockInput>,
  ceiling: RunBudgetCeilingState,
  live: boolean,
): TaskPlanProjection['edit'] {
  const started = projection.authorization !== null;
  const drifted = projection.planRevision !== null;
  const madeBy = projection.planRevisions.find((entry) => entry.trigger === 'plan-edit' && entry.state === 'resolved' && entry.nextOrdinal === ordinal);
  const reason = started ? PLAN_EDIT_STARTED_REASON : drifted ? PLAN_EDIT_DRIFT_REASON : null;
  return {
    editable: !started && !drifted,
    reason,
    lastEdit: madeBy === undefined || madeBy.detectedAt === null
      ? null
      : { ordinal, recordedAt: madeBy.detectedAt, entries: madeBy.diff.map((entry) => driftEntry(entry, blocks)) },
    planEnvelopeDigest: started || drifted ? null : projection.planEnvelope?.digest ?? null,
    // 设置上限… (Issue #51, S16a; MODEL-015): set with the plan's other edits — never under developer-live, whose launch sets it.
    budget: { ceiling, settable: reason === null && !live, reason: reason ?? (live ? PLAN_CEILING_LAUNCH_REASON : null) },
  };
}

/**
 * The plan of the Book's baseline analysis Task. The range the chips name is the current plan version's —
 * the one `重新确认计划` froze last — never the range the Task Intent row first recorded (#288's visible
 * half): the plan version is the authority, and the intent row keeps what was first asked for.
 */
export function baselineAnalysisPlan(input: {
  projection: BaselineAnalysisProjection;
  bookTitle: string;
  blocks: ReadonlyArray<ManifestBlockInput>;
  /** What the store read of the Book's rules for this plan (Issue #421); absent reads as a plan no rule can come from. */
  defaultRule?: TaskPlanDefaultRuleProjection;
  /** What the store read of the Task's stopped Run (Issue #422, S76b); absent while no Run of it is stopped. */
  stopped?: BaselineStoppedRunFacts;
  /** What the Task's Run asked the editor, and the answers (Issue #422, S76d); absent reads as nothing asked. */
  clarifications?: ReadonlyArray<ClarificationFacts>;
}): TaskPlanProjection {
  const { projection, bookTitle, blocks } = input;
  const intent = projection.taskIntent;
  const checkpoint = projection.checkpoint;
  const manifest = projection.coverageManifest;
  const provider = projection.providerResolutionPlan;
  const plan = projection.executionPlan;
  const envelope = projection.planEnvelope;
  const version = projection.planVersion;
  requirePlan(intent !== null && checkpoint !== null && manifest !== null && provider !== null && plan !== null &&
    envelope !== null && version !== null, '这项分析还没有准备计划。');
  const range = version.materialInputs.selectedRange;
  const reading = readRange(blocks, range);
  const position = positionLabel(reading);
  const update = projection.update;
  const counts = update?.reusePlan?.counts ?? null;
  const units = manifest.units.length;
  const recomputed = counts?.recomputed ?? units;
  const reused = counts?.reused ?? 0;
  const route = provider.executionRoute;
  const remote = provider.remoteBinding;
  const live = route.kind === 'opencode-go';
  const ceiling = provider.runBudgetCeiling;
  const where = range === null ? '全书' : position;
  const revision = projection.planRevision;
  const boundary = envelope.boundary;
  return {
    bookId: projection.bookId,
    kind: 'baseline-analysis',
    ref: intent.taskIntentId,
    state: baselineState(projection),
    planVersion: version.ordinal,
    goal: {
      sentence: intent.redoOf === null ? BASELINE_GOAL_SENTENCES[intent.mode] ?? intent.modeLabel : redoGoalSentence(counts),
      chips: { book: bookTitle, position, selectedGraphemes: reading.graphemes, taskInputRevision: checkpoint.revisionLabel, procedure: '基线分析' },
      savedForEdits: checkpoint.createdForDirtyJournal,
    },
    scope: {
      process: counts === null
        ? `《${bookTitle}》${where} · ${groupedCount(reading.graphemes)} 字 · ${units} 个阅读范围`
        : `《${bookTitle}》${where} · ${groupedCount(reading.graphemes)} 字 · 重新分析 ${recomputed} 个阅读范围，沿用 ${reused} 个`,
      reference: update === null || update.predecessor === null
        ? []
        : [`上一份基线分析（第 ${update.predecessor.ordinal} 份，读的是 ${update.predecessor.manuscriptPin.revisionLabel}）`],
      send: live ? `所读阅读范围的稿件正文（${recomputed} 个）` : '不发送任何内容',
      notRead: NOT_READ,
    },
    // PLAN-011 (Issue #419): of the analysis's steps only 核对与抽检 can be left out with the result still formed.
    steps: [
      { id: 'units', label: counts === null ? '逐章读取' : `逐章读取（重新读取 ${recomputed} 个阅读范围，沿用 ${reused} 个）`, result: '各章摘要', removable: false, removed: false },
      { id: 'reduction', label: '汇总全书', result: '梗概与人物、事件、关系、设定', removable: false, removed: false },
      {
        id: 'assurance-sampling',
        label: PLAN_EDIT_STEP_LABELS['assurance-sampling'],
        result: '可信程度说明',
        removable: true,
        removed: version.edits.removedSteps.includes('assurance-sampling'),
      },
    ],
    participation: { during: boundary !== null && boundary.participation.expected ? boundary.participation.statement : NO_PARTICIPATION, after: null },
    service: {
      role: roleLabel(provider.role),
      provider: live ? `${route.kind} · ${route.model}` : `${providerLabel(remote.providerId)} · ${remote.modelId}`,
      decision: live
        ? `开发者实时（${remote.providerProcessing.operationalScope} · ${remote.providerProcessing.version}）：实时传输受运行边界约束`
        : route.kind === 'none'
          ? '远程模型服务被拒绝，且没有可执行的本地路由；授权后会在派发前阻止'
          : `远程模型服务被拒绝（${remote.providerProcessing.operationalScope} · ${remote.providerProcessing.version}：0 次实时传输）；由 AI7 本地确定性模型适配器执行`,
      send: live ? `所读范围内的稿件正文发往 ${route.kind} · ${route.model}` : NOTHING_SENT,
      sendCategory: outboundLabel(provider.outboundDataCategory),
      // The ceiling the Run is held to, the launch's or the editor's (Issue #51, S16a), is a ceiling and never a prediction.
      // It is evaluated before each request (MODEL-016), so the turn under way when it is reached still counts: nothing
      // promises the Run stays under it, only that nothing more is sent once it is reached.
      usage: ceiling !== 'unset' ? `达到 ${groupedCount(ceiling.maxTotalTokens)} tokens 后不再发送新的请求（${units} 个阅读范围）` : NO_USAGE,
      usageIsCeiling: ceiling !== 'unset',
      duration: DURATION_UNKNOWN,
      budgetCeiling: budgetCeilingLabel(ceiling),
      accountLimit: ACCOUNT_LIMIT_UNKNOWN,
    },
    outcomes: [
      update === null || update.predecessor === null
        ? '一份基线分析：梗概、人物与名称、事件、关系、设定和各章'
        : `新的一份基线分析，接在第 ${update.predecessor.ordinal} 份之后；之前的每一份原样保留`,
      '这次运行的运行报告',
    ],
    notDo: {
      editorial: [...EDITORIAL_NOT_DO, range === null ? '不读这本书以外的内容' : '不重新读取所选范围以外的正文', '不作事实判定'],
      technical: [...projection.namedNonEffects],
    },
    // The adaptation the kind declares, read against the envelope the version froze: withdrawn when the editor
    // said 不允许, which leaves it out of the envelope's split (Issue #419).
    boundary: {
      adaptable: boundary === null ? [] : PLAN_EDITABLE_ADAPTATIONS.map((adaptationClass) => {
        // Moved into 先问你 (Issue #422, S76d): out of the adaptable list, and into the split's own — never withdrawn.
        const askFirst = (boundary.askFirst ?? []).some((entry) => entry.adaptationClass === adaptationClass);
        return {
          id: adaptationClass,
          label: PLAN_EDIT_ADAPTATION_LABELS[adaptationClass],
          removable: true,
          removed: !askFirst && !boundary.adaptable.some((entry) => entry.adaptationClass === adaptationClass),
          movable: true,
          askFirst,
        };
      }),
      askFirst: [...LOCKED_BOUNDARY],
    },
    edit: baselinePlanEdit(projection, version.ordinal, blocks, ceiling, live),
    drift: revision === null ? null : {
      reasons: ['计划冻结之后，它的关键内容已经变化；原计划不能再开始。'],
      entries: revision.diff.map((entry) => driftEntry(entry, blocks)),
      // Issue #420 (S74a A4): 重新确认计划 is the drawer's own action now, in its authorization bar.
      resolution: projection.actions.canReconfirmPlan
        ? '重新确认计划后，新的计划版本才能开始。'
        : '要更新的那一份分析已不是最新的一份；请在「分析」里基于最新的一份重新准备。',
    },
    technical: [
      { key: 'task-intent', label: '任务意图', value: intent.taskIntentId },
      { key: 'mode', label: '更新方式', value: `${intent.modeLabel} · ${intent.mode}` },
      // CONT-013: a redo's link to the Run it redoes stays visible.
      ...(intent.redoOf === null ? [] : [{ key: 'redo-of', label: '改计划重做自', value: `运行 ${intent.redoOf.runRecordId} · 任务意图 ${intent.redoOf.taskIntentId}` }]),
      { key: 'goal', label: '固定任务目标', value: intent.goal },
      { key: 'expected-outcome', label: '预期结果类别', value: intent.expectedOutcome },
      { key: 'task-input-revision', label: '任务输入修订版', value: `${checkpoint.revisionLabel} · ${checkpoint.revisionId} · ${checkpoint.revisionDigest}` },
      { key: 'task-input-checkpoint', label: '任务输入修订版用途', value: `${checkpoint.purpose} · ${checkpoint.createdForDirtyJournal ? '由已确认编辑创建' : '复用当前精确修订版'} · 修订日志序号 ${checkpoint.journalSequence}` },
      { key: 'coverage-manifest', label: '覆盖清单', value: `${units} 个分析单元 · ${manifest.sectionCount} 个结构段 · ${manifest.totalBlocks} 个内容块 · ${manifest.totalGraphemes} 字素 · ${manifest.digest}` },
      { key: 'manifest-units', label: '分析单元', value: manifest.units.map((unit) => `单元 ${unit.ordinal} · 内容块 ${unit.startPosition}–${unit.endPosition} · ${unit.graphemes} 字素`).join('；') },
      ...(range === null ? [] : [{ key: 'selected-range', label: '所选范围', value: `内容块 ${range.startPosition}–${range.endPosition}` }]),
      ...(update === null || update.reusePlan === null ? [] : [
        { key: 'reuse-plan', label: '复用计划', value: `${update.reusePlanDigest ?? ''} · ${update.reusePlan.units.map((unit) => `单元 ${unit.unitOrdinal} ${unit.disposition}（${unit.reason}）`).join('；')}` },
        { key: 'reuse-plan-predecessors', label: '前一修订版单元去向', value: update.reusePlan.predecessorUnits.map((unit) => `单元 ${unit.unitOrdinal} ${unit.disposition}`).join('；') },
      ]),
      ...(update === null || update.predecessor === null ? [] : [
        { key: 'predecessor', label: '前一修订版', value: `Revision ${update.predecessor.ordinal} · ${update.predecessor.revisionId} · ${update.predecessor.digest}` },
      ]),
      { key: 'execution-route', label: '执行路由', value: route.kind === 'none'
        ? `none · ${route.reason}`
        : route.kind === 'opencode-go' ? `${route.kind} · ${route.model} · ${route.endpoint}` : `${route.kind} · ${route.model} · 夹具 ${route.fixtureIdentity} · ${route.fixtureSha256}` },
      { key: 'provider-binding', label: '模型提供方绑定', value: `${remote.providerId} · ${remote.modelId} · adapter r${remote.adapterRevision} · config r${remote.configurationRevision} · 凭据 ${remote.credentialReadiness}` },
      { key: 'credential-reference', label: '凭据引用', value: remote.credentialReference },
      { key: 'provider-processing', label: '模型服务数据处理策略', value: pinReading(remote.providerProcessing) },
      { key: 'outbound-category', label: '外发数据类别', value: provider.outboundDataCategory },
      { key: 'run-budget-ceiling', label: '任务运行预算上限', value: ceiling === 'unset' ? 'unset' : `${ceiling.maxTotalTokens} tokens` },
      { key: 'execution-steps', label: '计划步骤（记录）', value: plan.steps.join(' → ') },
      { key: 'reducer-stages', label: '归约阶段', value: plan.reducerStages.join(' → ') },
      { key: 'stop-condition', label: '停止条件', value: plan.stopCondition },
      { key: 'prompt-contract', label: '提示契约摘要', value: envelope.promptContractDigest },
      { key: 'behavior-composition', label: '行为组合摘要', value: envelope.behaviorCompositionDigest },
      { key: 'material-fields', label: '变化后必须暂停的字段', value: boundary === null ? '未记录' : boundary.material.map((entry) => entry.field).join('、') },
      { key: 'plan-versions', label: '计划版本', value: projection.planVersions.map((entry) => `版本 ${entry.ordinal} · ${entry.state} · ${entry.planEnvelopeDigest}`).join('；') },
      ...(projection.planRevisions.length === 0 ? [] : [
        { key: 'plan-revisions', label: '计划修订', value: projection.planRevisions.map((entry) => entry.label).join('；') },
      ]),
      { key: 'dispatch', label: '派发状态', value: envelope.summary },
      { key: 'plan-envelope', label: '计划权限边界', value: envelope.digest },
      ...(projection.authorization === null ? [] : [
        { key: 'authorization', label: '运行授权', value: `${projection.authorization.authorizationId} · ${projection.authorization.origin} · ${projection.authorization.authority} · ${projection.authorization.authorizedAt}` },
      ]),
      ...(projection.run === null ? [] : [
        { key: 'run-record', label: '运行记录', value: `${projection.run.runRecordId} · ${projection.run.state} · ${projection.run.recordedAt}` },
      ]),
    ],
    start: baselineStart(projection, envelope.digest),
    defaultRule: input.defaultRule ?? noDefaultRule(BASELINE_NO_RULE),
    runControl: baselineRunControl(projection, input.stopped),
    redo: baselineRedo(projection, input.stopped),
    clarifications: baselineClarifications(projection, input.clarifications ?? [], input.stopped),
    budgetStop: baselineBudgetStop(projection),
  };
}

/** What the Run read before the Run Budget Ceiling stopped it (Issue #51, S16a; MODEL-016); `null` for any other Run. */
function baselineBudgetStop(projection: BaselineAnalysisProjection): TaskPlanProjection['budgetStop'] {
  const stop = projection.run?.state === 'interrupted' ? projection.taskOutcome?.stop ?? null : null;
  if (stop === null) return null;
  // Under developer-live the launch sets the ceiling (ADR 0070): the plan cannot raise it.
  const launchSetsCeiling = projection.planEnvelope?.providerStatus === 'remote-eligible-developer-live';
  return { maxTotalTokens: stop.maxTotalTokens, usedTokens: stop.usedTokens, unitsSettled: stop.unitsSettled, unitsTotal: stop.unitsTotal, launchSetsCeiling };
}

// ---- Clarification Requests (Issue #422, plan slice S76d) --------------------------------------------------------

/**
 * The card's own words (V2-UX-CLAR-002, INPUT-002, INPUT-003; editor-surfaces §6 澄清卡): the question and why it is
 * asked, what waits and what goes on, what happens after an answer, and the two choices — neither chosen, 再试一次 marked
 * 推荐 with its reason — each with its consequence.
 */
export const CLARIFICATION_WHY = '你把「模型服务暂时出错时，同一个阅读范围安全地再试一次」改成了「先问你」，所以 AI7 先停下这一步来问你。';
export const CLARIFICATION_SCOPE_CONTINUING = '该步骤等待说明 · 其他步骤仍在继续';
export const CLARIFICATION_SCOPE_WAITING = '任务等待你的说明';
export const CLARIFICATION_SCOPE_PAUSED = '任务已暂停：回答会先记下，续行后按它接着做';
export const CLARIFICATION_SCOPE_RESUMABLE = '任务已中断：回答会先记下，续行后按它接着做';
export const CLARIFICATION_AFTER = '回答后：选「再试一次」，AI7 把这个阅读范围再发送一次；选「不重试，记为缺口」，它记为缺口。之后接着做归纳和抽样。';
export const CLARIFICATION_OPTIONS = [
  {
    id: 'retry' as const,
    label: '再试一次',
    consequence: '再发送一次这个阅读范围；已读完的部分不重复。',
    recommended: '推荐：这类错误通常是暂时的，再试一次就能安全地补上这个阅读范围',
  },
  {
    id: 'record-gap' as const,
    label: '不重试，记为缺口',
    consequence: '这个阅读范围记为缺口，缺口写进结果；其余照常。',
    recommended: null,
  },
];
export const CLARIFICATION_NOTE = { label: '自行说明…', hint: '补充你的考虑，和所选的回答一起记下；不改变所选回答的意思。', maxLength: 500 } as const;
export const CLARIFICATION_UNANSWERABLE_ENDED = '这次运行已经结束，这个问题不再等你回答';
export const CLARIFICATION_UNANSWERABLE_CANCELLING = '任务正在取消，这个问题不再等你回答';

/** The question a unit's safe retry asks (CLAR-002): which range, and what the editor decides. */
export function clarificationQuestion(unitOrdinal: number): string {
  return `第 ${unitOrdinal} 个阅读范围：模型服务暂时出错，这一次没有读成。要安全地再试一次吗？`;
}

/** An answer as the card keeps it once given (CLAR-005): the choice, and the note that qualifies it. */
export function clarificationAnsweredLine(label: string, note: string | null): string {
  return `你已回答：${label}${note === null ? '' : ` · 说明：${note}`}`;
}

/** What the Run asked the editor, as the drawer's cards show it, open questions first. */
function baselineClarifications(
  projection: BaselineAnalysisProjection,
  facts: ReadonlyArray<ClarificationFacts>,
  stopped?: BaselineStoppedRunFacts,
): TaskPlanClarificationProjection[] {
  const run = projection.run;
  if (run === null) return [];
  // A Run waiting for its answer goes on once answered (CLAR-006), so it is answered only while it could go on as it was
  // authorized — the plan, its kept progress, the launch's binding — as 续行 is revalidated (CONT-015, CONT-016).
  const blocked = run.state === 'awaiting-clarification' && stopped !== undefined && stopped.blockers.length > 0 ? stopped.blockers.join('') : null;
  const answerableStates = new Set(['admitted', 'executing', 'pausing', 'paused', 'resumable', 'awaiting-clarification']);
  const scope = run.state === 'awaiting-clarification' ? CLARIFICATION_SCOPE_WAITING
    : run.state === 'paused' || run.state === 'pausing' ? CLARIFICATION_SCOPE_PAUSED
      : run.state === 'resumable' ? CLARIFICATION_SCOPE_RESUMABLE
        : CLARIFICATION_SCOPE_CONTINUING;
  const cards = facts.filter((entry) => entry.runRecordId === run.runRecordId).map((entry): TaskPlanClarificationProjection => {
    const answered = entry.answer;
    const option = answered === null ? null : CLARIFICATION_OPTIONS.find((candidate) => candidate.id === answered.optionId)!;
    const open = answered === null && answerableStates.has(run.state);
    return {
      requestId: entry.requestId,
      unitOrdinal: entry.unitOrdinal,
      planVersion: entry.planVersion,
      raisedAt: entry.raisedAt,
      question: clarificationQuestion(entry.unitOrdinal),
      why: CLARIFICATION_WHY,
      detail: `模型服务那边的情况：${entry.failure.reason}`,
      scope,
      after: CLARIFICATION_AFTER,
      options: CLARIFICATION_OPTIONS,
      note: CLARIFICATION_NOTE,
      state: answered !== null ? 'answered' : open ? 'open' : 'unanswered',
      answer: answered === null || option === null ? null : {
        optionId: answered.optionId,
        label: option.label,
        note: answered.note,
        answeredAt: answered.answeredAt,
        line: clarificationAnsweredLine(option.label, answered.note),
      },
      answerable: {
        reason: open ? blocked
          : answered !== null ? '这个问题已经回答过了'
            : run.state === 'cancelling' ? CLARIFICATION_UNANSWERABLE_CANCELLING : CLARIFICATION_UNANSWERABLE_ENDED,
      },
    };
  });
  return [...cards.filter((card) => card.state === 'open'), ...cards.filter((card) => card.state !== 'open')];
}

// ---- 取消任务 and the activity card (Issue #422, plan slice S76a) -----------------------------------------------

/** 暂停 is offered while a Run executes or waits its turn in the slot (CTRL-001, CTRL-008); otherwise it says why not. */
export const RUN_CONTROL_PAUSE_REASON = '这项任务现在没有在运行，不能暂停；可以取消它';
/**
 * 改计划重做 is offered once the Run has stopped (editor-surfaces §6: 暂停后出现 续行 与 改计划重做; Issue #422, S76c); a
 * Run still under way says to pause it first.
 */
export const RUN_CONTROL_REDO_REASON = '先暂停，再改计划重做';
/** A stopped Run that never began reading has nothing to redo from: it is cancelled, and the Task prepared again. */
export const RUN_CONTROL_REDO_NOT_BEGUN_REASON = '这项任务还没有开始阅读，没有可以重做的部分；可以取消它，再重新准备任务';
/** Once the editor confirmed 取消任务 nothing more is offered: the Run is stopping. */
export const RUN_CONTROL_CANCELLING_REASON = '已在取消：正在进行的这一步完成后停止';
/** While the Run pauses, 取消任务 waits for it to have stopped. */
export const RUN_CONTROL_PAUSING_REASON = '正在暂停：正在进行的这一步完成后停下';
/** What the analysis never does, so there is nothing a cancellation could leave committed (CTRL-007). */
export const CANCELLATION_NO_EFFECTS = '这项分析不改稿，没有需要撤回的受控动作。';

const STAGE_WORDS: Readonly<Record<'cross-unit-reduction' | 'assurance-sampling' | 'run-report-reflection', string>> = {
  'cross-unit-reduction': '跨单元归纳',
  'assurance-sampling': '保证抽样',
  'run-report-reflection': '运行反思',
};

/**
 * The Cancellation Impact Summary of the Book's baseline Run (CTRL-004; interaction-spec § Control invariants): the
 * future work that stops, what is kept, the committed Effects there are none of, and the one turn whose answer is
 * not back yet — read from the Run Liveness Signal, so it names exactly where the Run stands.
 */
export function baselineCancellationImpact(
  run: NonNullable<BaselineAnalysisProjection['run']>,
  update: TaskPlanRunControlProjection['update'] = null,
  kept: {
    unitsSettled: number | null;
    unitsTotal: number;
    bindingHolds?: boolean;
    waiting?: ReadonlyArray<{ unitOrdinal: number; answered: boolean }>;
  } | null = null,
): ReadonlyArray<string> {
  // An update Run reads only the ranges it recomputes: the rest it names as such, and the ranges it reuses are kept.
  const reusedKept = update === null || update.reusedUnits === 0 ? '' : `，连同沿用上一份分析的 ${update.reusedUnits} 个阅读范围，`;
  // The ranges not read yet stop with the steps after them — named only when there are any.
  const restOf = (count: number): string => count === 0 ? '' : update === null ? `其余 ${count} 个阅读范围和` : `其余 ${count} 个要重新分析的阅读范围和`;
  // What a Run nothing executes kept becomes its partial revision — unless this launch can no longer carry it under the
  // binding it persisted, when its cancellation forms none (Issue #422, S76c).
  const partial = (unitsSettled: number): string => kept?.bindingHolds === false
    ? `执行绑定已经变化，已读完的 ${unitsSettled} 个阅读范围不能整理成结果集修订版；这次取消不会形成修订版。`
    : `已读完的 ${unitsSettled} 个阅读范围的结果与缺口${reusedKept}会保留在一份新的结果集修订版里，没读到的记为未尝试；这份修订版会成为这本书最新的分析。`;
  // The ranges that asked the editor and have not settled (Issue #422, S76d; D7): each is named, answered or not, and
  // ends as a gap, unretried — in the partial revision when there is one.
  const waitingLines = (asked: ReadonlyArray<{ unitOrdinal: number; answered: boolean }>, shared: boolean): string[] => {
    if (asked.length === 0) return [];
    const carried = kept?.bindingHolds !== false;
    const tail = !carried ? '取消后不再重试。' : shared ? '取消后不再重试，在这份修订版里记为缺口。' : '取消后不再重试，记为缺口。';
    const lines: string[] = [];
    for (const answered of [false, true]) {
      const units = asked.filter((entry) => entry.answered === answered).map((entry) => `第 ${entry.unitOrdinal} 个`);
      if (units.length > 0) lines.push(`${units.join('、')}阅读范围${answered ? '你已回答，但还没有按回答接着做' : '在等你的回答'}；${tail}`);
    }
    if (!shared) {
      lines.push(carried
        ? '这些缺口和没读到的阅读范围（记为未尝试）会保留在一份新的结果集修订版里；这份修订版会成为这本书最新的分析。'
        : '执行绑定已经变化，这次取消不会形成结果集修订版。');
    }
    return lines;
  };
  const progress = run.progress;
  // A Run nothing executes — paused, left 可续行, or left under way when AI7 closed — has nothing in flight: what its
  // checkpoints kept becomes its partial revision, and one that kept nothing, or whose kept progress no longer reads
  // back, ends with its record alone (Issue #422, S76b).
  if (progress === null && kept !== null) {
    const { unitsSettled, unitsTotal } = kept;
    if (run.state === 'paused' || run.state === 'resumable' || run.state === 'awaiting-clarification') {
      if (unitsSettled === null) {
        return ['这项任务已经停下，它已保存的阅读进度无法核对；取消后不会发送任何内容，也不会形成结果集修订版。', CANCELLATION_NO_EFFECTS];
      }
      const asked = kept.waiting ?? [];
      if (unitsSettled === 0 && asked.length === 0) {
        return ['这项任务还没有读完任何阅读范围；取消后不会发送任何内容，也不会形成结果集修订版。', CANCELLATION_NO_EFFECTS];
      }
      return [
        `这项任务已经停下；${restOf(Math.max(0, unitsTotal - unitsSettled - asked.length))}之后的归纳、抽样都不再进行，不再发送任何内容。`,
        ...(unitsSettled === 0 ? [] : [partial(unitsSettled)]),
        ...waitingLines(asked, unitsSettled > 0),
        CANCELLATION_NO_EFFECTS,
      ];
    }
    if (unitsSettled === null || unitsSettled === 0) {
      return [
        'AI7 上次关闭时这项任务没有结束，现在也没有在运行；取消只结束这条运行记录，不会再发送任何内容。',
        unitsSettled === null ? '它已保存的阅读进度无法核对，不会形成结果集修订版。' : '它还没有读完任何阅读范围，不会形成结果集修订版。',
        CANCELLATION_NO_EFFECTS,
      ];
    }
    return [
      `AI7 上次关闭时这项任务没有结束，现在也没有在运行；${restOf(Math.max(0, unitsTotal - unitsSettled))}之后的归纳、抽样都不再进行，不再发送任何内容。`,
      partial(unitsSettled),
      CANCELLATION_NO_EFFECTS,
    ];
  }
  // Admitted and waiting its turn: nothing read yet — unless it is a Run going on from what it kept.
  if (run.state === 'admitted' && (progress === null || progress.unitsSettled === 0)) {
    return ['这项任务还没有开始阅读；取消后不会发送任何内容，也不会形成结果集修订版。', CANCELLATION_NO_EFFECTS];
  }
  if (progress === null) {
    // No execution of this service holds the Run: AI7 closed while it ran, and its unit results were never kept.
    return [
      'AI7 上次关闭时这项任务没有结束，现在也没有在运行；取消只结束这条运行记录，不会再发送任何内容。',
      '它已读完的阅读范围的结果没有保存下来，不会形成结果集修订版。',
      CANCELLATION_NO_EFFECTS,
    ];
  }
  const inFlight = progress.stage === 'units' && progress.currentUnitOrdinal !== null;
  const remaining = Math.max(0, progress.unitsTotal - progress.unitsSettled - (inFlight ? 1 : 0));
  const stops = progress.stage !== 'units'
    ? `正在进行的${STAGE_WORDS[progress.stage]}完成后停止，之后的步骤都不再进行，不再发送任何内容。`
    : inFlight
      ? `正在读的第 ${progress.currentUnitOrdinal} 个阅读范围读完后停止；${restOf(remaining)}之后的归纳、抽样都不再进行，不再发送任何内容。`
      : `在这两个阅读范围之间停止；${restOf(remaining)}之后的归纳、抽样都不再进行，不再发送任何内容。`;
  const settled = `已读完的 ${progress.unitsSettled} 个阅读范围${inFlight ? '和正在读的这一个' : ''}的结果与缺口${reusedKept}会保留在一份新的结果集修订版里，没读到的记为未尝试；这份修订版会成为这本书最新的分析。`;
  return [
    stops,
    settled,
    CANCELLATION_NO_EFFECTS,
    ...(inFlight ? ['正在等待的那一轮模型回答不会被中途切断，它的结果照常计入。'] : []),
  ];
}

/**
 * The controls and activity of the Book's baseline Run while it is under way (AUTH-010, AUTH-011): 取消任务 with its
 * summary, and 暂停 and 改计划重做 with the reasons they are not offered yet. `null` once the Run has ended, and
 * before it was admitted — a Run waiting for the network has its own 取消 (Issue #502).
 */
function baselineRunControl(projection: BaselineAnalysisProjection, stopped?: BaselineStoppedRunFacts): TaskPlanRunControlProjection | null {
  const run = projection.run;
  if (run === null) return null;
  const under = run.state === 'admitted' || run.state === 'executing' || run.state === 'cancelling' || run.state === 'pausing' ||
    run.state === 'paused' || run.state === 'resumable' || run.state === 'awaiting-clarification';
  if (!under) return null;
  const waitsForAnswer = run.state === 'awaiting-clarification';
  const held = run.progress !== null;
  // Stopping at the editor's word while an execution holds it. One AI7 left 正在取消 when it closed has none, and is
  // offered 取消任务 again, which settles it at once.
  const cancelling = run.state === 'cancelling' && held;
  const pausing = run.state === 'pausing' && held;
  // What its checkpoints kept, read by the store for a Run nothing executes, with whether this launch can still carry it;
  // a stopped one — paused, left 可续行, or waiting for the editor's answer — continues from it.
  const kept = held || stopped === undefined ? null : {
    unitsSettled: stopped.unitsSettled, unitsTotal: stopped.unitsTotal, bindingHolds: stopped.bindingHolds, waiting: stopped.waiting,
  };
  const continuation = kept !== null && (run.state === 'paused' || run.state === 'resumable' || waitsForAnswer) ? { unitsSettled: kept.unitsSettled, unitsTotal: kept.unitsTotal } : null;
  const counts = projection.update?.reusePlan?.counts ?? null;
  const update = counts === null ? null : { manuscriptUnits: projection.coverageManifest?.units.length ?? counts.recomputed + counts.reused, reusedUnits: counts.reused };
  return {
    runRecordId: run.runRecordId,
    cancelling,
    pausing,
    cancel: {
      reason: cancelling ? RUN_CONTROL_CANCELLING_REASON : pausing ? RUN_CONTROL_PAUSING_REASON : null,
      impact: cancelling || pausing ? [] : baselineCancellationImpact(run, update, kept),
    },
    // CTRL-001 and CTRL-008: a Run executing its units, or admitted and waiting its turn, pauses in one click.
    pause: { reason: (run.state === 'executing' || run.state === 'admitted') && held ? null : RUN_CONTROL_PAUSE_REASON },
    // A Run waiting for the editor's answer goes on when they answer (CLAR-006), never by 续行.
    resume: continuation === null || waitsForAnswer ? null : { reason: stopped!.blockers.length === 0 ? null : stopped!.blockers.join('') },
    redo: { reason: continuation === null ? RUN_CONTROL_REDO_REASON : runBegan(run) ? null : RUN_CONTROL_REDO_NOT_BEGUN_REASON },
    activity: run.progress,
    executingSince: run.transitions.find((transition) => transition.state === 'executing')?.recordedAt ?? null,
    continuation,
    update,
  };
}

/**
 * 改计划重做's own sentence for the Task it prepared (Issue #422, S76c): how many ranges already read it carries — what
 * the redone Run read, and on an update what it carried itself — and how many it reads; or, carrying none, that it
 * starts from the beginning.
 */
export function redoGoalSentence(counts: AnalysisReusePlanCounts | null): string {
  // Carrying nothing says only that: the Run it redoes may have read ranges this launch could not carry (S76c).
  return counts === null || counts.reused === 0
    ? '改计划重做：不沿用上一次运行的结果，这次从头读'
    : `改计划重做：沿用已读完的 ${counts.reused} 个阅读范围，接着读其余 ${counts.recomputed} 个`;
}

/** Whether a Run began reading its units: a Run that stopped or was cancelled before it did has nothing to redo from. */
function runBegan(run: NonNullable<BaselineAnalysisProjection['run']>): boolean {
  return run.transitions.some((transition) => transition.state === 'executing');
}

/**
 * 改计划重做 (Issue #422, plan slice S76c; V2-UX-AUTH-010, CONT-013), while it can be made: on a stopped Run — which it
 * cancels first, so its summary says what stops, what is kept and what comes next — and on a Run the editor cancelled
 * after it began, which it redoes at once. What the Run kept, it forms — once cancelled — into the partial revision
 * the new Task carries, read again wherever it is not closed (同步到当前稿件); a Run that kept nothing is redone as
 * the Task it was, the same way over the same range, or the first baseline again.
 */
function baselineRedo(projection: BaselineAnalysisProjection, stopped?: BaselineStoppedRunFacts): TaskPlanRedoProjection | null {
  const run = projection.run;
  if (run === null) return null;
  const cancelledAfterStart = run.state === 'cancelled' && runBegan(run);
  // A stopped Run — paused, left 可续行, or waiting for the editor's answer — is redone only once it began reading: one
  // paused while it waited its turn, or left 可续行 before it read, ends 已取消 as a wait does, which nothing redoes (the
  // store refuses it too).
  const stoppedRun = (run.state === 'paused' || run.state === 'resumable' || run.state === 'awaiting-clarification') && stopped !== undefined && runBegan(run);
  // 调整预算并重做 (Issue #51, S16a; MODEL-017): a Run the ceiling stopped has ended, its partial revision formed, so it is
  // redone at once, as a cancelled one is — neither 续行 nor 重试 is offered for it.
  const budgetReached = run.state === 'interrupted' && projection.taskOutcome?.stop?.reason === 'run-budget-ceiling-reached';
  if (!cancelledAfterStart && !stoppedRun && !budgetReached) return null;
  // A stopped Run's kept ranges are carried only while this launch can still form them into its partial revision.
  const carries = stoppedRun
    ? (stopped!.unitsSettled ?? 0) > 0 && stopped!.bindingHolds
    : projection.resultSetRevision?.provenance.runRecordId === run.runRecordId;
  const update = carries
    ? { mode: 'sync-current' as const, selectedRange: null }
    : projection.update === null ? null : { mode: projection.update.mode, selectedRange: projection.update.selectedRange };
  const prepare = { goal: update === null ? BASELINE_ANALYSIS_TASK_GOAL : BASELINE_ANALYSIS_MODE_GOALS[update.mode], update, redoOf: run.runRecordId };
  if (!stoppedRun) return { summary: [], prepare };
  const kept = stopped!.unitsSettled ?? 0;
  // 同步到当前稿件 reuses the ranges the Run read to a result and reads its gaps again.
  const closed = stopped!.unitsClosed ?? 0;
  const total = stopped!.unitsTotal;
  const next = !carries || closed === 0
    ? update === null || update.mode === 'sync-current'
      ? '然后准备一项新任务，从头读；开始之前可以先改计划。'
      : '然后准备一项新任务，照原来的方式再做一次；开始之前可以先改计划。'
    : closed === kept
      ? `然后准备一项新任务：沿用这 ${kept} 个阅读范围的结果，接着读其余 ${total - kept} 个；开始之前可以先改计划。`
      : `然后准备一项新任务：沿用其中有结果的 ${closed} 个阅读范围，其余 ${total - closed} 个（含留下缺口的 ${kept - closed} 个）重新读；开始之前可以先改计划。`;
  return {
    summary: [
      stopped!.unitsSettled === null
        ? '这项任务会在这里停下并取消；它已保存的阅读进度无法核对，不会形成结果集修订版。'
        : kept === 0
          ? '这项任务会在这里停下并取消；它还没有读完任何阅读范围，不会形成结果集修订版。'
          : carries
            ? `这项任务会在这里停下并取消；已读完的 ${kept} 个阅读范围保留在一份新的结果集修订版里，没读到的记为未尝试。`
            : `这项任务会在这里停下并取消；执行绑定已经变化，已读完的 ${kept} 个阅读范围不能沿用，不会形成结果集修订版。`,
      next,
      CANCELLATION_NO_EFFECTS,
      '新任务由你开始，不会自己运行。',
    ],
    prepare,
  };
}

/**
 * What the store reads of a Run nothing executes for the drawer (Issue #422, S76b): how many of the units it submits it
 * kept — `null` when that progress no longer reads back — and, for a stopped Run, why 续行 cannot go on now, if it
 * cannot: the plan moved, its progress no longer reads back, or, read by the service, the model service, the network
 * or the slot.
 */
export interface BaselineStoppedRunFacts {
  /** The units that asked the editor and have not settled since, and whether each was answered (Issue #422, S76d). */
  readonly waiting: ReadonlyArray<{ readonly unitOrdinal: number; readonly answered: boolean }>;
  readonly unitsSettled: number | null;
  /** Of those, the units it read to a result, which a redo carries; its gaps it reads again. */
  readonly unitsClosed: number | null;
  readonly unitsTotal: number;
  readonly blockers: ReadonlyArray<string>;
  /**
   * Whether this launch can still carry the Run under the Execution Binding it persisted (Issue #422, S76c): go on
   * with it, or form what it kept into its partial revision when it is cancelled. Read by the service.
   */
  readonly bindingHolds: boolean;
}

/** 续行's own words when the service cannot let the Run go on now (CONT-015): each names what it waits for. */
export const RESUME_BLOCKED_SLOT = '另一项任务正在运行；它结束后再续行。';
export const RESUME_BLOCKED_CONNECTION = '模型未连接：续行要发送到模型服务，所需的凭据还没有就绪；连接好之后才能续行。';
export const RESUME_BLOCKED_OFFLINE = '离线：续行要连到模型服务，而这台设备现在没有网络；联网后再续行。';
/** The Run's persisted binding no longer reads the same under this launch (CONT-016): the way on is 改计划重做. */
export const RESUME_BLOCKED_BINDING = '这次运行授权时的执行绑定已经变化（模型服务、路由、策略或 AI7 版本不同），不能照原样续行；请改计划重做。';

/** An answer's own words when the service cannot take the Run on now (CLAR-006): each names what it waits for. */
export const ANSWER_BLOCKED_CONNECTION = '模型未连接：按回答接着做要发送到模型服务，所需的凭据还没有就绪；连接好之后再回答。';
export const ANSWER_BLOCKED_OFFLINE = '离线：按回答接着做要连到模型服务，而这台设备现在没有网络；联网后再回答。';

/** The drawer's plan with the service's own reasons an answer must wait added to each open question's (CLAR-006). */
export function withAnswerBlockers(plan: TaskPlanProjection, blockers: ReadonlyArray<string>): TaskPlanProjection {
  if (plan.state.key !== 'awaiting-clarification' || blockers.length === 0) return plan;
  return {
    ...plan,
    clarifications: plan.clarifications.map((card) => card.state !== 'open' ? card : {
      ...card,
      answerable: { reason: [card.answerable.reason, ...blockers].filter((entry): entry is string => entry !== null).join('') },
    }),
  };
}

/** The drawer's plan with the service's own reasons 续行 must wait added to the stopped Run's (CONT-015). */
export function withResumeBlockers(plan: TaskPlanProjection, blockers: ReadonlyArray<string>): TaskPlanProjection {
  const control = plan.runControl;
  if (control === null || control.resume === null || blockers.length === 0) return plan;
  // Each reason is a sentence of its own, ending with its full stop, so they run on as Chinese does.
  const reason = [control.resume.reason, ...blockers].filter((entry): entry is string => entry !== null).join('');
  return { ...plan, runControl: { ...control, resume: { reason } } };
}

// ---- a Review Run ---------------------------------------------------------------------------------------

function reviewState(facts: ReviewRunPlanFacts): TaskPlanProjection['state'] {
  switch (facts.state) {
    case 'prepared':
      return facts.staleReasons.length > 0 ? { key: 'changed', label: '计划已变化' } : { key: 'ready', label: '尚未开始' };
    case 'running':
      return { key: 'running', label: '运行中' };
    case 'settled':
      return { key: 'settled', label: '已完成' };
    case 'partial':
      return { key: 'stopped', label: facts.canContinue ? '中途停止 · 可继续审阅' : '中途停止' };
    case 'failed':
      return { key: 'stopped', label: '运行失败' };
  }
}

function frozenCeiling(components: Readonly<Record<string, unknown>>): RunBudgetCeilingState {
  const provider = components['provider-resolution-plan'];
  const ceiling = typeof provider === 'object' && provider !== null ? (provider as { runBudgetCeiling?: unknown }).runBudgetCeiling : undefined;
  if (typeof ceiling === 'object' && ceiling !== null && (ceiling as { kind?: unknown }).kind === 'tokens') {
    const maxTotalTokens = (ceiling as { maxTotalTokens?: unknown }).maxTotalTokens;
    if (typeof maxTotalTokens === 'number') return { kind: 'tokens', maxTotalTokens };
  }
  return 'unset';
}

function frozenRoute(components: Readonly<Record<string, unknown>>): { kind: string; model: string } {
  const provider = components['provider-resolution-plan'];
  const route = typeof provider === 'object' && provider !== null ? (provider as { executionRoute?: unknown }).executionRoute : undefined;
  if (typeof route === 'object' && route !== null) {
    const { kind, model } = route as { kind?: unknown; model?: unknown };
    return { kind: typeof kind === 'string' ? kind : 'none', model: typeof model === 'string' ? model : '' };
  }
  return { kind: 'none', model: '' };
}

/**
 * The plan of one Review Run: one step per category — its findings become marks on the manuscript — and
 * the 审阅报告 the Run's findings are summed up in (D7). A Review Run has no revision route (S69): a plan
 * that moved before the one approval is reported with the refusal's own reason, and a category the Run
 * refused at its turn with the reason it recorded (D8).
 */
export function reviewRunPlan(input: {
  bookId: string;
  facts: ReviewRunPlanFacts;
  bookTitle: string;
  blocks: ReadonlyArray<ManifestBlockInput>;
}): TaskPlanProjection {
  const { facts, bookTitle, blocks } = input;
  const scope = facts.scope;
  const reading = scope.kind === 'whole' ? readRange(blocks, null)
    : scope.selectedRange !== null ? readRange(blocks, scope.selectedRange) : null;
  const position = scope.kind === 'changed' ? '改动过的章' : reading === null ? scope.label : positionLabel(reading);
  const categories = facts.categories;
  const tasks = categories.filter((category) => category.task !== null);
  const procedures = [...new Set(categories.map((category) => category.procedure.title))];
  const firstProcedure = procedures[0] ?? '审阅工序';
  const ceilings = tasks.map((category) => frozenCeiling(category.task!.components));
  const route = tasks.length === 0 ? null : frozenRoute(tasks[0]!.task!.components);
  const live = route?.kind === 'opencode-go';
  const allSet = ceilings.length > 0 && ceilings.every((ceiling) => ceiling !== 'unset');
  const ceilingTotal = ceilings.reduce((total, ceiling) => total + (ceiling === 'unset' ? 0 : ceiling.maxTotalTokens), 0);
  const unitsRead = tasks.reduce((total, category) => total + category.task!.plan.recomputed, 0);
  const refused = categories.filter((category) => category.state === 'refused');
  const reasons = facts.state === 'prepared'
    ? facts.staleReasons
    : refused.map((category) => `「${category.label}」没有开始：${category.detail ?? category.stateLabel}`);
  const riskPoints = categories.some((category) => category.riskPointsOnly);
  const scopeWords = scope.kind === 'whole' ? '全书' : scope.kind === 'changed' ? '改动过的章' : scope.kind === 'selection' ? '所选文字' : position;
  // The bar (Issue #420, S74a): the one approval binds every Task-backed category's exact digest, and the
  // route every category froze decides whether starting needs a model connection. A Run has no revision
  // route, so a plan that moved is only ever `changed`; the leads alone need nothing and start as they are.
  const routes = tasks.map((category) => frozenRoute(category.task!.components).kind);
  const needsModelConnection = routes.includes('opencode-go');
  const start: TaskPlanStartProjection = facts.state !== 'prepared' || facts.authorizedAt !== null
    ? startedBar(needsModelConnection)
    : facts.staleReasons.length > 0
      ? { readiness: 'changed', needsModelConnection, planEnvelopeDigest: null, categoryDigests: [], reconfirm: null }
      : {
          readiness: routes.includes('none') ? 'no-route' : 'ready',
          needsModelConnection,
          planEnvelopeDigest: null,
          categoryDigests: tasks.map((category) => ({ categoryId: category.categoryId, planEnvelopeDigest: category.task!.planEnvelopeDigest })),
          reconfirm: null,
        };
  return {
    bookId: input.bookId,
    kind: 'review-run',
    ref: facts.reviewRunId,
    state: reviewState(facts),
    planVersion: null,
    goal: {
      sentence: `按 ${categories.length} 类审阅${scopeWords}：${categories.map((category) => category.label).join('、')}`,
      chips: {
        book: bookTitle,
        position,
        selectedGraphemes: reading?.graphemes ?? null,
        taskInputRevision: facts.inputRevision.revisionLabel,
        procedure: procedures.length <= 1 ? firstProcedure : `${firstProcedure} 等 ${procedures.length} 个工序`,
      },
      savedForEdits: facts.inputRevision.createdForDirtyJournal,
    },
    scope: {
      process: `《${bookTitle}》${position}${reading === null ? '' : ` · ${groupedCount(reading.graphemes)} 字`} · ${categories.length} 个类别`,
      reference: categories.map((category) => category.modelFree
        ? `${category.label}：基线分析的前后不一致线索与未决事项`
        : category.guidelineDocuments.length === 0
          ? `${category.label}：${category.procedure.title}（第 ${category.procedure.version} 版）`
          : `${category.label}：${category.guidelineDocuments.map((document) => `${document.issuer}《${document.title}》第 ${document.version} 版`).join('、')}`),
      send: tasks.length === 0 || !live ? '不发送任何内容' : '所读范围内的稿件正文和所选类别的规范条款',
      notRead: scope.kind === 'whole' ? NOT_READ : `所选范围以外的正文；${NOT_READ}`,
    },
    steps: [
      ...categories.map((category): TaskPlanStepProjection => ({
        id: `category:${category.categoryId}`,
        label: category.modelFree ? `读取基线分析的线索：${category.label}` : `逐章审读：${category.label}`,
        result: `${category.label}的发现（稿件上的标记）`,
        removable: false,
        removed: false,
      })),
      { id: 'report', label: '汇总', result: '审阅报告', removable: false, removed: false },
    ],
    participation: {
      during: NO_PARTICIPATION,
      after: '每一类完成后，它的发现立即可以处理：修改建议由你接受并应用，批注由你标记为已处理或忽略并说明',
    },
    service: {
      role: roleLabel('Main Editorial Role'),
      provider: route === null ? '不调用模型' : live ? `${route.kind} · ${route.model}` : 'AI7 本地确定性模型适配器',
      decision: route === null
        ? '只读基线分析的线索，不调用模型'
        : live ? '开发者实时：实时传输受运行边界约束'
          : route.kind === 'none'
            ? '远程模型服务被拒绝，且没有可执行的本地路由；授权后会在派发前阻止'
            : '远程模型服务被拒绝（0 次实时传输）；由 AI7 本地确定性模型适配器执行',
      send: route === null ? '只读基线分析的线索，不发送任何内容' : live ? '所读范围内的稿件正文和所选类别的规范条款，发往为审阅配置的模型服务' : NOTHING_SENT,
      sendCategory: outboundLabel('public-or-synthetic'),
      usage: live && allSet ? `至多 ${groupedCount(ceilingTotal)} tokens（${tasks.length} 类合计）` : NO_USAGE,
      usageIsCeiling: live && allSet,
      duration: DURATION_UNKNOWN,
      budgetCeiling: allSet ? `任务运行预算上限：${groupedCount(ceilingTotal)} tokens（${tasks.length} 类合计）` : BUDGET_NOT_SET,
      accountLimit: ACCOUNT_LIMIT_UNKNOWN,
    },
    outcomes: [
      ...categories.map((category) => category.riskPointsOnly
        ? `${category.label}：需人工复核的风险点（批注）`
        : `${category.label}：${category.output === 'change-suggestion' ? '修改建议' : '批注'}，标在稿件上，由你逐条处理`),
      '审阅报告：在审阅里生成，按版本保存',
    ],
    notDo: {
      editorial: [
        ...EDITORIAL_NOT_DO,
        scope.kind === 'whole' ? '不读这本书以外的内容' : '不读所选范围以外的正文',
        ...(riskPoints ? ['不给出合规、查重或政策结论'] : []),
      ],
      technical: [...namedNonEffects(facts.live, unitsRead === 0 ? null : unitsRead)],
    },
    boundary: {
      adaptable: tasks.length === 0 ? [] : [{ id: 'safe-retry', label: SAFE_RETRY_ADAPTATION, removable: false, removed: false, movable: false, askFirst: false }],
      askFirst: [...LOCKED_BOUNDARY],
    },
    edit: NOT_EDITABLE,
    drift: reasons.length === 0 ? null : {
      reasons,
      entries: [],
      resolution: facts.state === 'prepared'
        ? '审阅没有计划修订：请在「审阅」里点「返回修改」重新准备这次审阅。'
        : '没有开始的类别可以在「审阅」里新建一次审阅再审。',
    },
    technical: [
      { key: 'review-run', label: '审阅记录', value: `${facts.label} · ${facts.reviewRunId} · ${facts.createdAt}` },
      { key: 'manuscript', label: '稿件 pin', value: `${facts.manuscript.revisionLabel} · ${facts.manuscript.revisionId} · 修订日志序号 ${facts.manuscript.journalSequence} · ${facts.manuscript.workingDigest}` },
      { key: 'task-input-revision', label: '任务输入修订版', value: `${facts.inputRevision.revisionLabel} · ${facts.inputRevision.revisionId}` },
      { key: 'scope', label: '审阅范围', value: scope.label },
      { key: 'configuration', label: '审阅配置', value: `${facts.configuration.schema} · 第 ${facts.configuration.version} 版 · ${facts.configuration.digest}` },
      ...categories.map((category) => ({
        key: `category:${category.categoryId}`,
        label: category.label,
        value: category.task === null
          ? `${category.procedure.title}（第 ${category.procedure.version} 版）· 直接读取基线分析的线索，没有任务`
          : `${category.procedure.title}（第 ${category.procedure.version} 版）· 任务 ${category.task.taskIntentId} · ${category.task.modeLabel} · 计划版本 ${category.task.planVersion} · 计划权限边界 ${category.task.planEnvelopeDigest} · ${category.task.plan.routeLabel} · ${category.task.plan.providerStatusLabel} · ${category.task.plan.budgetCeilingLabel}`,
      })),
      ...(facts.authorizedAt === null ? [] : [{ key: 'authorization', label: '审阅授权', value: facts.authorizedAt }]),
    ],
    start,
    defaultRule: noDefaultRule(REVIEW_RUN_NO_RULE),
    runControl: null,
    redo: null,
    clarifications: [],
    budgetStop: null,
  };
}
