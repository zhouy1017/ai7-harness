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
  TaskPlanStartProjection,
  TaskPlanStepProjection,
} from '../shared/protocol.js';
import { namedNonEffects } from './analysis/baseline-analysis-store.js';
import type { ManifestBlockInput } from './analysis/coverage-manifest.js';
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
const SAFE_RETRY_ADAPTATION = '模型服务暂时出错时，同一个阅读范围安全地再试一次';
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
const DRIFT_FIELD_LABELS: Readonly<Record<string, string>> = {
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
      { label: '准备任务输入', result: `任务输入修订版 ${checkpoint.revisionLabel}` },
      { label: '记录运行（不派发）', result: '运行记录' },
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
    case 'cancelled':
      return { key: 'cancelled', label: '已取消' };
    case 'admitted':
      return { key: 'running', label: '正在排队' };
    case 'executing':
      return { key: 'running', label: '运行中' };
    case 'settled':
      return { key: 'settled', label: '已完成' };
    case 'failed':
      return { key: 'stopped', label: '运行失败' };
    case 'interrupted':
      return { key: 'stopped', label: '已中断' };
    default:
      return { key: 'ready', label: '尚未开始' };
  }
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
      sentence: BASELINE_GOAL_SENTENCES[intent.mode] ?? intent.modeLabel,
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
    steps: [
      { label: counts === null ? '逐章读取' : `逐章读取（重新读取 ${recomputed} 个阅读范围，沿用 ${reused} 个）`, result: '各章摘要' },
      { label: '汇总全书', result: '梗概与人物、事件、关系、设定' },
      { label: '核对与抽检', result: '可信程度说明' },
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
      usage: live && ceiling !== 'unset' ? `至多 ${groupedCount(ceiling.maxTotalTokens)} tokens（${units} 个阅读范围）` : NO_USAGE,
      usageIsCeiling: live && ceiling !== 'unset',
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
    boundary: {
      adaptable: boundary === null ? [] : boundary.adaptable.map((entry) => entry.adaptationClass === 'safe-retry' ? SAFE_RETRY_ADAPTATION : entry.label),
      askFirst: [...LOCKED_BOUNDARY],
    },
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
  };
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
        label: category.modelFree ? `读取基线分析的线索：${category.label}` : `逐章审读：${category.label}`,
        result: `${category.label}的发现（稿件上的标记）`,
      })),
      { label: '汇总', result: '审阅报告' },
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
    boundary: { adaptable: tasks.length === 0 ? [] : [SAFE_RETRY_ADAPTATION], askFirst: [...LOCKED_BOUNDARY] },
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
  };
}
