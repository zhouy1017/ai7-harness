import {
  type EvidenceAssuranceLevel,
  BASELINE_ANALYSIS_KIND,
  EVALUATION_REWRITE_KIND,
  INITIAL_EVALUATION_KIND,
  READERS_REPORT_KIND,
  WRITING_KIND,
  type AnalysisReusePlanCounts,
  type BaselineAnalysisRunState,
  type ResumableStopReason,
  type BaselineAnalysisSelectedRange,
  type DeveloperLiveCeiling,
  type RunBudgetCeilingState,
  MAX_TASK_INTENT_GOAL_LENGTH,
  MODEL_SERVICE_SETUP_REQUIRED_REASON,
} from '../../shared/protocol.js';
import { FACTUAL_VERIFICATION_POLICY_VERSION } from './factual-review-contract.js';
import type { DatabaseSync } from 'node:sqlite';
import { DIGEST_PATTERN, UUID_PATTERN, isRecord, parseCanonicalJson, requireAnalysis } from './canonical.js';
import {
  DEVELOPER_LIVE_PROVIDER_PROCESSING_VERSION,
  ORDINARY_PRODUCTION_PROVIDER_PROCESSING_VERSION,
} from '../launch-policy.js';
import type { AnalysisKindDefinition } from './kind-definition.js';
import { ASSURANCE_SAMPLING_PROMPT_CONTRACT_DIGEST } from './assurance-sampling-contract.js';
import { SAMPLE1_PUBLIC_SAMPLEBOOK } from '../../shared/public-samplebooks.js';
import type {
  AnalysisAuthorizationOrigin,
  BackgroundRunBudgetCeiling,
  LaunchBinding,
  LiveReading,
  RunStop,
  SqlRow,
  UnconfirmedStage,
} from './baseline-analysis-types.js';

/** The exact `sample1` source digest, the ADR 0044 baseline among the Public SampleBooks every non-production analysis Task requires. */
export const SAMPLE1_SOURCE_DIGEST = SAMPLE1_PUBLIC_SAMPLEBOOK.sha256;

export const NATIVE_CARRIER_DIGEST = 'ae485040c8fa602ab2e98ec91dd122201d40a8be41d8a4f86f7cd55ddb1e434d' as const;

export const SIDECAR_DIGEST = '980b565f25bdff29e539365e17344346017b05146a45cfea35c8ed7d528a1bff' as const;

export const SUCCESSOR_BEHAVIOR ='每次更新都是新的用户发起任务，经准备 → 计划预览 → 标准直接授权 → 执行后，在同一结果集上追加下一序号的不可变后继修订版；前一修订版不被改写，且始终可在修订历史中按其原始稿件 pin 查看。' as const;

/** 重新分析这段's paragraphs are no longer in the working manuscript, or out of order (Issue #423 review, P3-3). */
export const SELECTED_BLOCKS_GONE = '所选文字所在的段落已不在当前稿件中，或先后颠倒；请重新选择。' as const;

/** A range Task's paragraphs no longer stand at the positions its plan names (Issue #423 review, P3-4). */
export const SELECTED_RANGE_MOVED = '所选范围的段落在准备之后已移动或删除；请重新选择范围，再准备这项任务。' as const;

/**
 * What an active Run of a kind is called, and what it keeps from being prepared (Issue #760 review): the baseline's 分析任务
 * and 更新任务, a 写作任务's own, 评估's for AI7 初评, 审稿意见 and 按我的评分重写评语, and 审阅's for a review category's Task.
 */
function activeRunWords(kind: string): { readonly task: string; readonly next: string } {
  if (kind === BASELINE_ANALYSIS_KIND) return { task: '分析任务', next: '新的更新任务' };
  if (kind === WRITING_KIND) return { task: '写作任务', next: '新的写作任务' };
  if (kind === INITIAL_EVALUATION_KIND || kind === READERS_REPORT_KIND || kind === EVALUATION_REWRITE_KIND) return { task: '评估任务', next: '新的评估任务' };
  return { task: '审阅任务', next: '新的审阅' };
}

/** A queued Run's own words (Issue #49, S14; CONC-007): what it waits for, and that nothing has begun. */
export const RUN_QUEUED_LABEL = '等待运行名额' as const;

/** A start the editor deferred to idle time (Issue #1089; ADR 0095 §3): authorized, holding no place until quiet. */
export const RUN_WAITING_IDLE_LABEL = '等待空闲' as const;

/** A background Run AI7 paused at a unit boundary for the editor's waiting Run (Issue #1089); it goes on at the next quiet. */
export const RUN_IDLE_YIELD_LABEL = '让位给你的任务' as const;

/** The waiting state's own words (Issue #502, OFF-005): recorded, and nothing has been sent or begun. */
export const CONNECTIVITY_WAIT_DETAIL = '已记录授权；联网并通过重新联网预检后开始。此前不调用模型、不产生用量。' as const;

/**
 * Why a mode that reads only what changed is not on offer: nothing has changed. The mode's own label
 * closes the sentence, so the baseline kind reads `…后才可同步到当前稿件。` exactly as it always has and
 * a review category names its own action.
 */
/** A frozen reuse plan the chain no longer derives (#711 review P3-4): at dispatch, and before authorization. */
export const REUSE_PLAN_DRIFT_REASON = '重新推导的复用计划与冻结计划不一致；未开始执行，请重新准备。' as const;

export const REUSE_PLAN_DRIFT_AUTHORIZE_REASON = '重新推导的复用计划与冻结计划不一致；无法授权，请重新准备。' as const;

/**
 * How much one ledger keeps of its walks and of revisions as a walk reads them (Issue #716): a few entries, and no more
 * block references than a large manuscript's handful of manifests hold. The least recently used is let go first.
 *
 * The chain cache is bounded four times wider than the walk cache (Issue #727). A walk reads its chain newest-first to
 * the chain's first Run whenever a chapter stands unread, so once a chain outgrows the bound the walk evicts, in order,
 * exactly what the next walk asks for first, and every revision is read from SQLite again at each new latest revision:
 * a cliff, not a decline (`tests/unit/unread-changes.test.ts` measures it). At 262,144 the chain of a ~3,000-block
 * manuscript (~4,700 weight a revision) stays cached to some 55 revisions, the entry bound's neighbourhood; the walk
 * cache, one walk per latest revision, keeps its bound.
 */
export const UNREAD_WALK_CACHE_ENTRIES = 16;

export const CHAIN_REVISION_CACHE_ENTRIES = 64;

export const UNREAD_WALK_CACHE_WEIGHT = 65_536;

export const CHAIN_REVISION_CACHE_WEIGHT = 4 * UNREAD_WALK_CACHE_WEIGHT;

export function changedModeUnavailableReason(label: string): string {
  return `结果集修订版仍绑定当前稿件；只有在已确认编辑使精确修订版新鲜度为“已过期”后才可${label}。`;
}

export const RUN_STATE_LABELS: Record<BaselineAnalysisRunState, string> = {
  authorized: '已记录授权',
  'blocked-before-dispatch': '派发前阻止 · 未启动',
  admitted: '已进入调度器',
  executing: '正在执行分析单元',
  completed: '已完成',
  'completed-with-gaps': '已完成 · 保留缺口',
  failed: '运行失败',
  interrupted: '运行已中断',
  'awaiting-connectivity': '等待网络 · 未启动',
  cancelled: '已取消 · 未启动',
  cancelling: '正在取消',
  pausing: '正在暂停',
  paused: '已暂停',
  resumable: '任务已中断 · 可续行',
  'awaiting-clarification': '任务等待你的说明',
};

/**
 * A Run cancelled after it began executing its units (Issue #422, CTRL-005): `已取消`, and never `已取消 · 未启动`,
 * which stays the word for a Run cancelled before it ran anything, nor 已中断, which OFF-012 keeps for a Run that
 * can resume.
 */
export const RUN_CANCELLED_AFTER_START_LABEL = '已取消' as const;

/** What `cancelling` records (CTRL-005): the editor's word, and where the Run stops. */
export const RUN_CANCELLING_DETAIL = '编辑取消了这项任务；正在进行的这一步会被中止，此后不再发送任何内容。' as const;

/** What `pausing` records (CTRL-001): the editor's word, and where the Run stops to wait. */
export const RUN_PAUSING_DETAIL = '编辑暂停了这项任务；正在进行的这一步完成后停下，不再开始下一步，已完成的结果与用量都会保存。' as const;

/** What reconciliation records for a Run AI7 stopped under (CONT-014): nothing of it runs, and nothing is sent until 续行. */
export const RECONCILED_RESUMABLE_DETAIL = 'AI7 上次关闭时这项任务正在运行；已读完的阅读范围都已保存。点「续行」从下一个阅读范围接着读；在此之前不会发送任何内容。' as const;

export const RECONCILED_PAUSED_DETAIL = 'AI7 上次关闭时这项任务正在暂停；已读完的阅读范围都已保存，任务已暂停。' as const;

/** A Run left yielded at a restart (Issue #1089; ADR 0034): it no longer goes on by itself at the next quiet. */
export const RECONCILED_YIELDED_DETAIL = 'AI7 上次关闭时这项任务正让位给你的任务；已读完的阅读范围都已保存，任务已暂停，点「续行」接着处理。' as const;

/**
 * A start AI7 closed on while it waited for a place (Issue #49 review; ADR 0034): it never began, and a restart starts
 * nothing by itself, so it is blocked before dispatch with why, and the editor starts it again when they choose.
 */
/**
 * What reconciliation records for a Run of a kind that cannot resume (Issue #429 review, P1): AI7 closed while it ran,
 * its results lived only in the Run it lost, and nothing of it will be sent again. It ends 已中断 with this outcome, and
 * the editor prepares the Task again — the kind's own surface offers that at once.
 */
export const RECONCILED_INTERRUPTED_DETAIL =
  'AI7 上次关闭时这项任务正在运行；这类任务不能续行，已读的内容没有形成结果集修订版，此后不会再发送任何内容。需要时请重新准备并开始。' as const;

/** Why such a Run's later stages never ran, in its Run Report. */
const RECONCILED_INTERRUPTED_STAGE_REASON = 'AI7 上次关闭时运行中断，这一步没有发起。' as const;

export const RECONCILED_QUEUED_DETAIL =
  'AI7 上次关闭时这项任务还在等待运行名额，没有开始，也没有发送任何内容；重新启动后它不会自己开始。需要时请重新准备并开始。' as const;

/** The schema of one unit's continuation checkpoint (Issue #422, S76b). */
export const UNIT_CHECKPOINT_SCHEMA = 'ai7.analysis.unit-checkpoint/1' as const;

export const OUTCOME_LABELS = {
  completed: '任务结果：已完成',
  'completed-with-gaps': '任务结果：已完成（保留缺口）',
  failed: '任务结果：失败',
  interrupted: '任务结果：已中断',
  cancelled: '任务结果：已取消',
} as const;

/** The Run Budget Ceiling Reached outcome's own words (Issue #51, S16a; V2-UX-MODEL-016, interaction-spec §706). */
export const BUDGET_REACHED_OUTCOME_LABEL = '任务结果：任务运行预算已达上限 · 已保留部分结果' as const;

/** …and the Run's, where ②A and its card read the Run (RUN-012): a terminal partial outcome, never 已中断. */
export const BUDGET_REACHED_RUN_LABEL = '任务运行预算已达上限 · 已保留部分结果' as const;

/** A Run the provider's account limit stopped (Issue #51, S16b; RUN-012): a remediable blocker, never 任务已中断 · 可续行. */
export const ACCOUNT_LIMIT_RUN_LABEL = '模型服务账户限额' as const;

/**
 * A Run stopped because a sent request's result cannot be known (Issue #51, S16c; CTRL-007, COPY-009), never 任务已中断 · 可续行
 * nor 已取消. Only Runs recorded before #1080 carry that stop; it reads as the per-unit state 该单元结果未知 (ADR 0095 §2).
 */
export const OUTCOME_UNKNOWN_RUN_LABEL = '该单元结果未知' as const;

/** Why 结果待确认 has no 续行 (Issue #51, S16c; ADR 0034, CONT-011, CONT-016). */
export const OUTCOME_UNKNOWN_NO_RESUME = '结果待确认：有阅读范围的请求已发出而结果无法确认，这次运行不能续行；可以取消任务保留已读完的部分，或改计划重做。' as const;

/** The outcome key of a range or a step (Issue #757), as `UnconfirmedOutcomeRecord.key` and the resolutions spell it. */
export function unconfirmedOutcomeKey(kind: string, runRecordId: string, target: { contentKey: string } | { stage: UnconfirmedStage }): string {
  return `${kind}\n${runRecordId}\n${'contentKey' in target ? `range:${target.contentKey}` : `step:${target.stage}`}`;
}

/** A recorded stop read back: exactly the five facts, each a count; `null` for anything else, which no reader invents. */
export function runStopOf(value: unknown): RunStop | null {
  if (!isRecord(value) || value.reason !== 'run-budget-ceiling-reached' || Object.keys(value).length !== 5) return null;
  const counts = [value.maxTotalTokens, value.usedTokens, value.unitsSettled, value.unitsTotal];
  if (!counts.every((count) => typeof count === 'number' && Number.isSafeInteger(count) && count >= 0)) return null;
  return {
    reason: 'run-budget-ceiling-reached',
    maxTotalTokens: value.maxTotalTokens as number,
    usedTokens: value.usedTokens as number,
    unitsSettled: value.unitsSettled as number,
    unitsTotal: value.unitsTotal as number,
  };
}

/** Whether a Run began executing its units: the one fact that tells a started cancellation from a wait cancelled. */
export function runBegan(transitions: ReadonlyArray<{ state: BaselineAnalysisRunState }>): boolean {
  return transitions.some((transition) => transition.state === 'executing');
}

/**
 * The assurance sampling contract a frozen execution plan names (Issue #826). A plan records it only when its kind binds a
 * sampling contract other than /1 — today the current baseline's /2 — so every factual, Review Category and retained /1
 * baseline plan keeps the bytes it always had. A plan without it is read conservatively as /1: that is what every delivered
 * plan recorded before #826 was frozen under. (An unpinned plan of the #826 development candidate that sampled /2 reads as /1
 * too; the reading only refuses to execute such a plan again, and never relabels a Run already recorded.)
 */
export function frozenAssurancePromptContractDigest(executionPlan: Readonly<Record<string, unknown>>): string {
  const recorded = executionPlan.assurancePromptContractDigest;
  if (recorded === undefined) return ASSURANCE_SAMPLING_PROMPT_CONTRACT_DIGEST;
  requireAnalysis(typeof recorded === 'string' && DIGEST_PATTERN.test(recorded), 'ANALYSIS_RECORD_INVALID', '计划记录的保证抽样契约无效。');
  return recorded;
}

/**
 * Whether a kind now samples under another contract than the one its frozen plan names (Issue #826). The Execution Binding and
 * the composition pin only the unit prompt contract, so this is what keeps a plan frozen under one sampling contract from being
 * sampled under another. A kind that samples nothing never moves.
 */
export function assuranceContractMoved(definition: Pick<AnalysisKindDefinition, 'assurance'>, frozenDigest: string): boolean {
  return definition.assurance !== null && definition.assurance.promptContractDigest !== frozenDigest;
}

export function isBackgroundRunBudgetCeiling(value: unknown): value is BackgroundRunBudgetCeiling {
  return isRecord(value) && value.kind === 'tokens' && Number.isSafeInteger(value.maxTotalTokens) && (value.maxTotalTokens as number) >= 1 &&
    Object.keys(value).length === 2;
}

export function asString(value: unknown): string {
  requireAnalysis(typeof value === 'string', 'ANALYSIS_RECORD_INVALID', '分析记录字段无效。');
  return value;
}

export function asNumber(value: unknown): number {
  requireAnalysis(typeof value === 'number' && Number.isSafeInteger(value), 'ANALYSIS_RECORD_INVALID', '分析记录数值无效。');
  return value;
}

/**
 * Who started the Task, as its Run Authorization records it (Issue #421): `standard-direct` from its plan,
 * `default-execution-rule` — 快速开始 under a 默认执行规则 — with the rule version the authorization names, or
 * `background-analysis-enrollment` — AI7 by itself under the Book's 后台分析登记 (Issue #95, S39) — with the enrollment version.
 */
export function authorizationOrigin(row: SqlRow): {
  origin: 'standard-direct' | 'default-execution-rule' | 'background-analysis-enrollment';
  ruleVersionId: string | null;
  enrollmentVersionId: string | null;
} {
  const origin = asString(row.origin);
  if (origin === 'standard-direct') return { origin, ruleVersionId: null, enrollmentVersionId: null };
  const record = parseCanonicalJson(asString(row.canonical_json));
  if (origin === 'background-analysis-enrollment') {
    requireAnalysis(isRecord(record) && record.origin === origin && typeof record.enrollmentVersionId === 'string' &&
      UUID_PATTERN.test(record.enrollmentVersionId) && record.ruleVersionId === undefined,
    'ANALYSIS_RECORD_INVALID', '运行授权的来源记录无效。');
    return { origin, ruleVersionId: null, enrollmentVersionId: record.enrollmentVersionId };
  }
  requireAnalysis(origin === 'default-execution-rule' && isRecord(record) && record.origin === origin &&
    typeof record.ruleVersionId === 'string' && UUID_PATTERN.test(record.ruleVersionId),
  'ANALYSIS_RECORD_INVALID', '运行授权的来源记录无效。');
  return { origin, ruleVersionId: record.ruleVersionId, enrollmentVersionId: null };
}

export const STANDARD_DIRECT: AnalysisAuthorizationOrigin = { kind: 'standard-direct' };

/** What a Run AI7 started under the Book's 后台分析登记 records when it is authorized (Issue #95, S39). */
export const BACKGROUND_AUTHORIZED_DETAIL = '后台分析按登记记录了运行授权。';

export function transact<T>(db: DatabaseSync, body: () => T): T {
  if (db.isTransaction) return body();
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = body();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch (rollbackError) {
      throw new AggregateError([error, rollbackError], 'Analysis ledger transaction rollback failed.');
    }
    throw error;
  }
}

/** A Task Intent Draft's sentence as a goal (Issue #423, slice 7a): trimmed, one to `MAX_TASK_INTENT_GOAL_LENGTH` characters. */
export function isDraftGoal(goal: unknown): goal is string {
  return typeof goal === 'string' && goal.trim() === goal && goal.length >= 1 && goal.length <= MAX_TASK_INTENT_GOAL_LENGTH;
}

export function sameRange(left: BaselineAnalysisSelectedRange | null, right: BaselineAnalysisSelectedRange | null): boolean {
  return left === null || right === null ? left === right : left.startPosition === right.startPosition && left.endPosition === right.endPosition;
}

export function firstBaselineCounts(unitCount: number): AnalysisReusePlanCounts {
  return { reused: 0, recomputed: unitCount, invalidated: 0, bypassed: 0 };
}

/**
 * A Task whose Run is authorized for dispatch, waiting in Connectivity Wait, admitted, executing, stopping at the
 * editor's cancellation, pausing, paused, or left 可续行 blocks any new update Task: a paused Run holds no slot, but it
 * is not done (Issue #422, S76b). A waiting Run holds no execution slot, but it will run: the
 * editor cancels it to prepare another (Issue #502, OFF-010); a cancelling one still holds the slot until it has
 * stopped (Issue #422).
 */
export function runIsActive(state: BaselineAnalysisRunState | null): boolean {
  return state === 'authorized' || state === 'awaiting-connectivity' || state === 'admitted' || state === 'executing' ||
    state === 'cancelling' || state === 'pausing' || state === 'paused' || state === 'resumable' || state === 'awaiting-clarification';
}

/**
 * Why an active Run blocks a new Task, in the words of its state — a waiting Run is never said to be under way (OFF-005,
 * OFF-006; Issue #49, S14) — and of its kind (Issue #760 review): a 写作任务 is never called an 分析任务.
 */
export function activeRunReason(state: BaselineAnalysisRunState | null, kind: string = BASELINE_ANALYSIS_KIND, stopReason?: ResumableStopReason): string {
  const { task, next } = activeRunWords(kind);
  if (state === 'resumable' && stopReason !== undefined) return `有一项运行因${stopReason === 'proxy-unreachable' ? '代理不可达' : stopReason === 'model-service-unreachable' ? '模型服务不可达' : stopReason === 'outcome-unknown' ? '结果待确认' : 'AI7 关闭时正在运行'}中断，续行或取消它后才能准备新的更新。`;
  if (state === 'awaiting-connectivity') return `有一项${task}在等待联网后开始；它开始并结束之前，或在任务抽屉里取消它之前，不能准备${next}。`;
  if (state === 'authorized') return `有一项${task}在等待运行名额；它开始并结束之前，或在任务抽屉里取消它之前，不能准备${next}。`;
  return `当前已有${task}在调度或执行中；在其结束前不能准备${next}。`;
}

/** The reading of an ordinary-production launch with no configured route: a stand-in for the binding in its sentences. */
export const MODEL_SERVICE_SETUP_REQUIRED = 'ordinary-production-setup-required' as const;

/** Whether the launch, not the plan, sets the Run Budget Ceiling: developer-live only (ADR 0070). */
export function launchSetsCeilingOf(live: LaunchBinding['live']): boolean {
  return live !== null && live.scope !== 'ordinary-production';
}

export const DEVELOPMENT_CI_LAUNCH: LaunchBinding = { operationalScope: 'development-ci', live: null };

/**
 * Resolve the bound ceiling against the frozen Coverage Manifest unit count: an explicit form
 * ceiling is already a total, and the policy default is 30,000 tokens times the unit count
 * (ADR 0070), computed here — after the manifest is frozen and before the plan is.
 */
export function resolveDeveloperLiveCeiling(ceiling: DeveloperLiveCeiling, unitCount: number): { kind: 'tokens'; maxTotalTokens: number } {
  return ceiling.kind === 'tokens'
    ? ceiling
    : { kind: 'tokens', maxTotalTokens: ceiling.tokensPerFrozenUnit * unitCount };
}

/** The exact ceiling state a frozen Provider Resolution Plan carries; the plan writes only this shape. */
export function runBudgetCeilingStateOf(value: unknown): RunBudgetCeilingState {
  if (value === 'unset') return 'unset';
  const maxTotalTokens = isRecord(value) ? value['maxTotalTokens'] : null;
  requireAnalysis(isRecord(value) && value['kind'] === 'tokens' && typeof maxTotalTokens === 'number' && Number.isSafeInteger(maxTotalTokens) && maxTotalTokens > 0,
    'ANALYSIS_RECORD_INVALID', 'Run Budget Ceiling 记录无效。');
  return { kind: 'tokens', maxTotalTokens };
}

/**
 * The one reading every developer-live surface states for the bound ceiling. An explicit ceiling is
 * its total; the per-frozen-unit default states the formula before a manifest exists and the computed
 * total once one does.
 */
function ceilingReading(ceiling: DeveloperLiveCeiling, unitCount: number | null): string {
  if (ceiling.kind === 'tokens') return `${ceiling.maxTotalTokens} tokens`;
  return unitCount === null
    ? `${ceiling.tokensPerFrozenUnit} tokens × 冻结单元数`
    : `${ceiling.tokensPerFrozenUnit * unitCount} tokens（${ceiling.tokensPerFrozenUnit} × ${unitCount} 个冻结单元）`;
}

/**
 * Every statement a Task surface makes about the trusted scope, the Provider Processing version, the
 * live transmissions, and the Run Budget Ceiling is derived here from the bound launch, never from a
 * constant. Under `development-ci` each one reads exactly as it always has — the v1 denial and its
 * zero live transmissions, byte for byte. Under `developer-live` each states the scope the launch
 * actually bound, its version, the route, and the frozen token ceiling: a surface that promised zero
 * transmission one row above the endpoint the Run was calling is the defect these derive away.
 *
 * The three are exported so a test can compare both readings against the captured base text directly,
 * without standing up the Run each surface would otherwise need. `unitCount` is the frozen Coverage
 * Manifest count when one exists, so the per-frozen-unit default can state its computed total.
 */
export function namedNonEffects(live: LiveReading, unitCount: number | null = null): ReadonlyArray<string> {
  return [
    '不修改稿件，不创建修订版或事实判定',
    '不创建学习资格、策略激活、Enrollment、Apply 或 Effect',
    '只读取当前图书的任务输入修订版，不读取其他图书',
    live === null
      ? 'development-ci · Provider Processing v1：0 次实时传输，远程绑定被拒绝'
      : live === MODEL_SERVICE_SETUP_REQUIRED
        ? `ordinary-production · Provider Processing ${ORDINARY_PRODUCTION_PROVIDER_PROCESSING_VERSION}：模型服务需设置，尚无可用路线，0 次实时传输`
        : live.scope === 'ordinary-production'
          ? `ordinary-production · Provider Processing ${ORDINARY_PRODUCTION_PROVIDER_PROCESSING_VERSION}：经你配置的模型服务 ${live.route} · ${live.model} 实时传输，每个单元实际调用；任务运行预算上限由计划设定`
          : `developer-live · Provider Processing ${DEVELOPER_LIVE_PROVIDER_PROCESSING_VERSION}：实时传输受运行边界约束（任务运行预算上限 ${ceilingReading(live.runBudgetCeiling, unitCount)}），远程绑定 ${live.route} · ${live.model} 已获准`,
    '凭据值不进入任务账本、协议帧、日志、诊断或 Session 内容',
  ];
}

/** Why a Run that cannot dispatch was blocked; only the first reason states the launch's own facts. */
export function blockedReasons(live: LiveReading, unitCount: number | null = null): ReadonlyArray<string> {
  return [
    live === null
      ? '当前可信启动范围为 development-ci，Provider Processing v1 允许 0 次实时传输；远程 DeepSeek 绑定被拒绝。'
      : live === MODEL_SERVICE_SETUP_REQUIRED
        ? MODEL_SERVICE_SETUP_REQUIRED_REASON
        : live.scope === 'ordinary-production'
          ? `当前可信启动范围为 ordinary-production，Provider Processing ${ORDINARY_PRODUCTION_PROVIDER_PROCESSING_VERSION} 允许经你配置的模型服务 ${live.route} · ${live.model} 实时传输。`
          : `当前可信启动范围为 developer-live，Provider Processing ${DEVELOPER_LIVE_PROVIDER_PROCESSING_VERSION} 允许的实时传输受运行边界约束（任务运行预算上限 ${ceilingReading(live.runBudgetCeiling, unitCount)}）；远程绑定 ${live.route} · ${live.model} 已获准。`,
    '未提供 J-04 专用的本地确定性模型适配器控制，因此没有可执行的本地路由。',
    '运行授权已记录；派发前阻止，未创建 Session、未构造 Provider payload、未访问网络。',
  ];
}

/**
 * What an analysis update does to the Provider, stated for the launch the next Run would execute
 * under. `firstTaskLabel` is the label of the kind's own first Task, which the sentence compares an
 * update to; it defaults to the baseline kind's, so every existing reading keeps its exact text.
 */
export function providerConsequence(live: LiveReading, unitCount: number | null = null, firstTaskLabel = '首次基线分析'): string {
  if (live === MODEL_SERVICE_SETUP_REQUIRED) return MODEL_SERVICE_SETUP_REQUIRED_REASON;
  if (live !== null && live.scope === 'ordinary-production') {
    return `与${firstTaskLabel}相同：经你配置的模型服务 ${live.route} · ${live.model} 在 ordinary-production · Provider Processing ${ORDINARY_PRODUCTION_PROVIDER_PROCESSING_VERSION} 下执行；外发数据类别 unpublished-excerpts；任务运行预算上限由计划设定，未设置则不设上限；每个重算单元形成一次实时传输并计入用量，复用单元不形成任何模型负载。`;
  }
  return live === null
    ? `与${firstTaskLabel}相同：远程 DeepSeek 绑定被 development-ci · Provider Processing v1 拒绝（0 次实时传输），只有 J-04 控制绑定的 AI7 本地确定性模型适配器可执行；外发数据类别 public-or-synthetic；未设置任务预算上限；只有重算单元形成模型请求并计入用量，复用单元不形成任何模型负载。`
    : `与${firstTaskLabel}相同：远程绑定 ${live.route} · ${live.model} 在 developer-live · Provider Processing ${DEVELOPER_LIVE_PROVIDER_PROCESSING_VERSION} 下可执行，实时传输受运行边界约束；外发数据类别 public-or-synthetic；任务运行预算上限 ${ceilingReading(live.runBudgetCeiling, unitCount)}；每个重算单元形成一次实时传输并计入用量，复用单元不形成任何模型负载。`;
}

/**
 * The stages a stop keeps its usage for (Issue #541): settled or refused stage work was spent all the same. A unit
 * a stop kept carries its own usage in its checkpoint.
 */
export const CARRIED_STAGES = ['cross-unit-reduction', 'assurance-sampling'] as const;

/**
 * The append-only ledger of one analysis kind of one Book database. The kind it serves is the
 * {@link AnalysisKindDefinition} it is constructed with: the identity it tags every row with, the
 * contract version, the Task modes and their goals, the frozen prompt contract its plans freeze, the
 * reducer its Runs reduce through, and the stages its plans declare. Two instances over the same
 * database serve the two kinds of Issue #53 without either seeing the other's Tasks, plans, Runs, or
 * revisions: every read is filtered by the definition's kind.
 */
/** The provider-free v2 fixture identity whose lineage runs the factual levels on the deterministic route (Issue #901). */
export const FACTUAL_VERIFIED_FIXTURE_IDENTITY = 'sample1-factual-verified';

/** Why a level below the Factual Verification Policy's minimum is refused; the document names none today (EASSURE-008). */
export const FACTUAL_POLICY_MINIMUM_REASON = '事实核查政策要求更高的证据保证级别；这个级别不能选。' as const;

const LEVEL_ORDER: Readonly<Record<EvidenceAssuranceLevel, number>> = { quick: 0, standard: 1, strict: 2 };

/** Whether a level is below the minimum the pinned Factual Verification Policy Document requires (EASSURE-008). */
export function levelBelowPolicyMinimum(level: EvidenceAssuranceLevel, minimum: EvidenceAssuranceLevel | null = FACTUAL_VERIFICATION_POLICY_VERSION.minimumLevel): boolean {
  return minimum !== null && LEVEL_ORDER[level] < LEVEL_ORDER[minimum];
}
