import { randomUUID } from 'node:crypto';
import type { DatabaseSync, SQLOutputValue } from 'node:sqlite';
import {
  BASELINE_ANALYSIS_MODE_LABELS,
  BASELINE_ANALYSIS_MODE_MEANINGS,
  type AnalysisFreshnessAxis,
  type AnalysisReusePlanCounts,
  type AnalysisReusePlanProjection,
  type AnalysisUnitLineage,
  type BaselineAnalysisExecutionBindingProjection,
  type BaselineAnalysisGoal,
  type BaselineAnalysisHistoryEntryProjection,
  type BaselineAnalysisHistoryProjection,
  type BaselineAnalysisProjection,
  type BaselineAnalysisRangeOptionProjection,
  type BaselineAnalysisResultSetRevisionProjection,
  type BaselineAnalysisRevisionUpdateProjection,
  type BaselineAnalysisRunState,
  type BaselineAnalysisSelectedRange,
  type BaselineAnalysisTaskMode,
  type BaselineAnalysisUnitProjection,
  type BaselineAnalysisUpdateControlsProjection,
  type BaselineAnalysisUpdateMode,
  type BaselineAnalysisUpdateProjection,
  type BaselineAnalysisUpdateRequest,
  type CoverageManifestProjection,
  type LaunchPolicyProjection,
  type ModelCredentialOperationState,
} from '../../shared/protocol.js';
import {
  AnalysisError,
  DIGEST_PATTERN,
  UUID_PATTERN,
  canonicalJson,
  canonicalRecord,
  isRecord,
  parseCanonicalJson,
  requireAnalysis,
  sha256Hex,
} from './canonical.js';
import { BASELINE_PROMPT_CONTRACT_DIGEST, BASELINE_UNIT_RESULT_SCHEMA, unitRequestDigest, type BaselineUnitResult } from './contract.js';
import { deriveCoverageManifest, manifestCoversEveryBlock, manifestDigestIsExact, type ManifestBlockInput } from './coverage-manifest.js';
import {
  BASELINE_ANALYSIS_CONTRACT_VERSION,
  BASELINE_ANALYSIS_EXPECTED_OUTCOME,
  BASELINE_ANALYSIS_KIND,
  TASK_INPUT_CHECKPOINT_PURPOSE,
  goalForMode,
} from './identity.js';
import type { BaselineReduction } from './reducers.js';
import { deriveReusePlan, requireSelectedRange, reusePlanRecord, type ReusePlanPredecessor } from './reuse-plan.js';
import { describeComposition } from '../harness/primary-agent-harness.js';
import { LOCAL_DETERMINISTIC_MODEL, LOCAL_DETERMINISTIC_ROUTE } from '../provider/egress-gate.js';

type SqlRow = Record<string, SQLOutputValue>;

const SAMPLE1_SOURCE_DIGEST = 'b8a3dbde0aa8a1ec7265f9ae3fe47877759e7947c5ab69682cd0a8f424a8d483' as const;
const NATIVE_CARRIER_DIGEST = 'ae485040c8fa602ab2e98ec91dd122201d40a8be41d8a4f86f7cd55ddb1e434d' as const;
const SIDECAR_DIGEST = '980b565f25bdff29e539365e17344346017b05146a45cfea35c8ed7d528a1bff' as const;
/** The first-baseline revision record (Issue #92): unchanged in shape. */
export const RESULT_SET_REVISION_SCHEMA = 'ai7.baseline-manuscript-analysis.result-set-revision/1' as const;
/** A successor revision record (Issue #93): the `/1` keys plus `update` and per-unit `lineage`. */
export const RESULT_SET_SUCCESSOR_REVISION_SCHEMA = 'ai7.baseline-manuscript-analysis.result-set-revision/2' as const;
export const REDUCER_DESCRIPTOR = {
  schema: 'ai7.baseline-manuscript-analysis.reducers/1',
  stages: ['unit-validation', 'section-reduction', 'contradiction-continuity', 'book-synthesis'],
  contradictionRules: ['alias-collision', 'entity-kind-divergence', 'setting-claim-divergence'],
  certaintyPolicy: 'report-only-never-resolve',
} as const;
export const REDUCER_DIGEST = sha256Hex(canonicalJson(REDUCER_DESCRIPTOR));
export const SCHEMA_DIGEST = sha256Hex(canonicalJson({ contractVersion: BASELINE_ANALYSIS_CONTRACT_VERSION, unitResultSchema: BASELINE_UNIT_RESULT_SCHEMA, promptContractDigest: BASELINE_PROMPT_CONTRACT_DIGEST }));

const EXECUTION_STEPS = ['派生覆盖清单', '逐单元执行基线稿件分析契约 v1', '章节归约', '跨单元矛盾与连续性核对', '全书综合', '形成结果集修订版'] as const;
const UPDATE_EXECUTION_STEPS = ['派生覆盖清单并计算复用计划', '按血缘复用兼容单元', '仅对重算单元逐单元执行基线稿件分析契约 v1', '章节归约', '跨单元矛盾与连续性核对', '全书综合', '追加后继结果集修订版'] as const;
const REDUCER_STAGES = ['unit-validation', 'section-reduction', 'contradiction-continuity', 'book-synthesis'] as const;
const NON_EFFECTS = [
  '不修改稿件，不创建修订版或事实判定',
  '不创建学习资格、策略激活、Enrollment、Apply 或 Effect',
  '只读取当前图书的任务输入修订版，不读取其他图书',
  'development-ci · Provider Processing v1：0 次实时传输，远程绑定被拒绝',
  '凭据值不进入任务账本、协议帧、日志、诊断或 Session 内容',
] as const;
const BLOCKED_REASONS = [
  '当前可信启动范围为 development-ci，Provider Processing v1 允许 0 次实时传输；远程 DeepSeek 绑定被拒绝。',
  '未提供 J-04 专用的本地确定性模型适配器控制，因此没有可执行的本地路由。',
  '运行授权已记录；派发前阻止，未创建 Session、未构造 Provider payload、未访问网络。',
] as const;
const PROVIDER_CONSEQUENCE = '与首次基线分析相同：远程 DeepSeek 绑定被 development-ci · Provider Processing v1 拒绝（0 次实时传输），只有 J-04 控制绑定的 AI7 本地确定性模型适配器可执行；外发数据类别 public-or-synthetic；未设置任务预算上限；只有重算单元形成模型请求并计入用量，复用单元不形成任何模型负载。' as const;
const SUCCESSOR_BEHAVIOR = '每次更新都是新的用户发起任务，经准备 → 计划预览 → 标准直接授权 → 执行后，在同一结果集上追加下一序号的不可变后继修订版；前一修订版不被改写，且始终可在修订历史中按其原始稿件 pin 查看。' as const;
const ACTIVE_RUN_REASON = '当前已有分析任务在调度或执行中；在其结束前不能准备新的更新任务。' as const;
const SYNC_UNAVAILABLE_REASON = '结果集修订版仍绑定当前稿件；只有在已确认编辑使精确修订版新鲜度为“已过期”后才可同步到当前稿件。' as const;

const RUN_STATE_LABELS: Record<BaselineAnalysisRunState, string> = {
  authorized: '已记录授权',
  'blocked-before-dispatch': '派发前阻止 · 未启动',
  admitted: '已进入调度器',
  executing: '正在执行分析单元',
  completed: '已完成',
  'completed-with-gaps': '已完成 · 保留缺口',
  failed: '运行失败',
  interrupted: '运行已中断',
};

const OUTCOME_LABELS = {
  completed: '任务结果：已完成',
  'completed-with-gaps': '任务结果：已完成（保留缺口）',
  failed: '任务结果：失败',
  interrupted: '任务结果：已中断',
} as const;

export interface BaselineAnalysisRouteFacts {
  readonly fixtureIdentity: string;
  readonly fixtureSha256: string;
  readonly fixtureLineage: ReadonlyArray<{ identity: string; sha256: string }>;
}

interface ManuscriptCheckpointBinding {
  bookId: string;
  manuscriptId: string;
  branchId: string;
  revisionId: string;
  revisionLabel: string;
  revisionDigest: string;
  journalSequence: number;
  createdForDirtyJournal: boolean;
}

type CheckpointPurpose = typeof TASK_INPUT_CHECKPOINT_PURPOSE | 'Reimport Safety / 重新导入安全固定点';

interface CheckpointOwner {
  createManuscriptCheckpointWork(manuscriptId: string, branchId: string, purpose: typeof TASK_INPUT_CHECKPOINT_PURPOSE):
    { workId: string | null; total: number; checkpoint: ManuscriptCheckpointBinding | null };
  advanceManuscriptCheckpointWork(workId: string):
    { done: boolean; completed: number; total: number; checkpoint: ManuscriptCheckpointBinding | null };
  finalizeManuscriptCheckpointWork(
    workId: string,
    persist: (checkpoint: ManuscriptCheckpointBinding, purpose: CheckpointPurpose) => void,
  ): ManuscriptCheckpointBinding;
  cancelManuscriptCheckpointWork(workId: string): boolean;
}

interface PreparationWork {
  workId: string;
  taskIntentId: string;
  checkpointWorkId: string;
  launchPolicy: LaunchPolicyProjection;
  total: number;
}

/** The facts one `analysis_task_intents` row carries. */
interface IntentFacts {
  readonly taskIntentId: string;
  readonly bookId: string;
  readonly mode: BaselineAnalysisTaskMode;
  readonly goal: BaselineAnalysisGoal;
  readonly createdAt: string;
  readonly predecessorRevisionId: string | null;
  readonly selectedRange: BaselineAnalysisSelectedRange | null;
}

export type BaselineAnalysisPreparationResult = {
  done: boolean;
  workId: string | null;
  completed: number;
  total: number;
  projection: BaselineAnalysisProjection | null;
};

export type BaselineAnalysisPrepareInput =
  | { phase: 'start'; bookId: string; goal: BaselineAnalysisGoal; update: BaselineAnalysisUpdateRequest | null; launchPolicy: LaunchPolicyProjection }
  | { phase: 'advance'; workId: string }
  | { phase: 'cancel'; workId: string }
  | { phase: 'cancel-all' };

export interface RunProgress {
  readonly unitsTotal: number;
  readonly unitsSettled: number;
  readonly currentUnitOrdinal: number | null;
}

export type ProgressReader = (runRecordId: string) => RunProgress | null;

/** The update facts of a frozen update plan, re-derived and verified before execution. */
export interface ExecutionUpdateFacts {
  readonly mode: BaselineAnalysisUpdateMode;
  readonly selectedRange: BaselineAnalysisSelectedRange | null;
  readonly predecessor: { revisionId: string; ordinal: number; digest: string; coverageManifestDigest: string; manifest: CoverageManifestProjection };
  readonly reusePlan: AnalysisReusePlanProjection;
  readonly reusePlanDigest: string;
}

/** Everything the execution owner needs from the frozen plan before the first model call. */
export interface ExecutionPlanFacts {
  readonly bookId: string;
  readonly taskIntentId: string;
  readonly runRecordId: string;
  readonly checkpoint: ManuscriptCheckpointBinding;
  readonly manifest: CoverageManifestProjection;
  readonly manifestDigest: string;
  readonly planEnvelopeDigest: string;
  readonly runSourceScopeDigest: string;
  readonly providerResolutionPlanDigest: string;
  readonly credentialReference: string;
  readonly route: BaselineAnalysisRouteFacts;
  readonly artifactPin: { nativeCarrierSha256: string; sidecarRevision: 2; sidecarSha256: string };
  readonly promptContractDigest: string;
  readonly behaviorCompositionDigest: string;
  /** `null` for the first baseline; the verified reuse plan for an update Task. */
  readonly update: ExecutionUpdateFacts | null;
}

export interface ExecutionBindingRecord {
  readonly attemptId: string;
  readonly taskIntentId: string;
  readonly runRecordId: string;
  readonly bookId: string;
  readonly planEnvelopeDigest: string;
  readonly runSourceScopeDigest: string;
  readonly providerResolutionPlanDigest: string;
  readonly coverageManifestDigest: string;
  readonly manuscriptPin: { revisionId: string; revisionDigest: string };
  readonly nativeArtifact: { identity: '@ai7/editorial-workspace-profile'; version: '1.0.0'; nativeCarrierSha256: string; sidecarRevision: 2; sidecarSha256: string };
  readonly behaviorCompositionDigest: string;
  readonly promptContractDigest: string;
  readonly contractVersion: typeof BASELINE_ANALYSIS_CONTRACT_VERSION;
  readonly harnessSessionId: string;
  readonly route: typeof LOCAL_DETERMINISTIC_ROUTE;
  readonly model: typeof LOCAL_DETERMINISTIC_MODEL;
  readonly adapterPin: { fixtureIdentity: string; fixtureSha256: string };
  readonly credentialSlot: { modelRole: 'Main Editorial Role'; slot: 'deepseek-api-key'; credentialReference: string };
  readonly outboundDataCategory: 'public-or-synthetic';
  readonly policyPin: { operationalScope: 'development-ci'; providerProcessingVersion: 'v1'; activePolicySetVersion: 'v3'; liveTransmissions: 0 };
  readonly runBudgetCeiling: 'unset';
  readonly dispatchAttribution: 'Dispatch';
  readonly boundAt: string;
  /** The update mode and reuse-plan digest an update attempt executes; absent for the first baseline. */
  readonly update?: { mode: BaselineAnalysisUpdateMode; predecessorRevisionId: string; reusePlanDigest: string };
}

export interface UnitResultRecord {
  readonly unitOrdinal: number;
  readonly requestDigest: string;
  readonly lineage: AnalysisUnitLineage;
  readonly closed:
    | { state: 'closed'; responseDigest: string; usage: { inputTokens: number; outputTokens: number } | null; result: unknown }
    | { state: 'gap'; gap: BaselineAnalysisProjection['resultSetRevision'] extends infer R ? (R extends { gaps: ReadonlyArray<infer G> } ? G : never) : never };
}

/** A closed predecessor unit result, ready to be copied by lineage into a successor revision. */
export interface PredecessorUnitResult {
  readonly unitOrdinal: number;
  readonly requestDigest: string;
  readonly responseDigest: string;
  readonly usage: { inputTokens: number; outputTokens: number } | null;
  readonly result: BaselineUnitResult;
}

export interface RevisionPersistInput {
  readonly facts: ExecutionPlanFacts;
  readonly attemptId: string;
  readonly bindingDigest: string;
  readonly harnessSessionId: string;
  readonly reduction: BaselineReduction;
  readonly units: ReadonlyArray<UnitResultRecord>;
  readonly usage: { inputTokens: number; outputTokens: number; requests: number };
}

function asString(value: unknown): string {
  requireAnalysis(typeof value === 'string', 'ANALYSIS_RECORD_INVALID', '分析记录字段无效。');
  return value;
}

function asNumber(value: unknown): number {
  requireAnalysis(typeof value === 'number' && Number.isSafeInteger(value), 'ANALYSIS_RECORD_INVALID', '分析记录数值无效。');
  return value;
}

function transact<T>(db: DatabaseSync, body: () => T): T {
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

function sameRange(left: BaselineAnalysisSelectedRange | null, right: BaselineAnalysisSelectedRange | null): boolean {
  return left === null || right === null ? left === right : left.startPosition === right.startPosition && left.endPosition === right.endPosition;
}

function firstBaselineCounts(unitCount: number): AnalysisReusePlanCounts {
  return { reused: 0, recomputed: unitCount, invalidated: 0, bypassed: 0 };
}

/** A Task whose Run is authorized for dispatch, admitted, or executing blocks any new update Task. */
function runIsActive(state: BaselineAnalysisRunState | null): boolean {
  return state === 'authorized' || state === 'admitted' || state === 'executing';
}

export class BaselineAnalysisStore {
  readonly #db: DatabaseSync;
  readonly #checkpointOwner: CheckpointOwner;
  readonly #route: BaselineAnalysisRouteFacts | null;
  readonly #work = new Map<string, PreparationWork>();

  constructor(db: DatabaseSync, checkpointOwner: CheckpointOwner, route: BaselineAnalysisRouteFacts | null) {
    this.#db = db;
    this.#checkpointOwner = checkpointOwner;
    this.#route = route;
  }

  get route(): BaselineAnalysisRouteFacts | null {
    return this.#route;
  }

  // ---- inspection -------------------------------------------------------------------------------

  /**
   * The Book's latest baseline-analysis Task with the latest Result Set Revision, the Revision
   * History, and the Analysis Update Controls; `revisionId` additionally opens one exact revision
   * read-only. Older revisions never replace `resultSetRevision`, which is always the latest.
   */
  inspect(bookId: string, progress: ProgressReader = () => null, revisionId: string | null = null): BaselineAnalysisProjection {
    requireAnalysis(UUID_PATTERN.test(bookId), 'ANALYSIS_BOOK_INVALID', '任务所属图书无效。');
    requireAnalysis(revisionId === null || UUID_PATTERN.test(revisionId), 'ANALYSIS_REVISION_INVALID', '结果集修订版标识无效。');
    const intentRow = this.#latestIntentRow(bookId);
    if (intentRow === undefined) {
      this.#binding(bookId);
      requireAnalysis(revisionId === null, 'ANALYSIS_REVISION_NOT_FOUND', '本图书没有该结果集修订版。');
      return this.#available(bookId);
    }
    const intent = this.#intentFacts(intentRow);
    const taskIntent = {
      taskIntentId: intent.taskIntentId,
      goal: intent.goal,
      expectedOutcome: BASELINE_ANALYSIS_EXPECTED_OUTCOME,
      createdAt: intent.createdAt,
      mode: intent.mode,
      modeLabel: BASELINE_ANALYSIS_MODE_LABELS[intent.mode],
    };
    const revisionRows = this.#revisionRows(bookId);
    const latestRow = revisionRows.at(-1);
    const latestOrdinal = latestRow === undefined ? 0 : asNumber(latestRow.ordinal);
    const revision = latestRow === undefined ? null : this.#revisionProjection(latestRow, latestOrdinal);
    const history = this.#history(bookId, revisionRows, revision);
    const inspectedRevision = revisionId === null ? null : this.#inspectedRevision(revisionRows, revisionId, latestOrdinal);
    const checkpoint = this.#db.prepare('SELECT * FROM analysis_task_input_checkpoints WHERE task_intent_id = ?').get(intent.taskIntentId) as SqlRow | undefined;
    if (checkpoint === undefined) {
      this.#binding(bookId);
      const update = intent.mode === 'first-baseline' ? null : this.#updateProjection(intent, null, null, revision);
      return {
        ...this.#available(bookId),
        taskIntent,
        resultSetRevision: revision,
        update,
        updateControls: revision === null ? null : this.#updateControls(bookId, revision, false),
        history,
        inspectedRevision,
        actions: { canPrepare: revision === null, canAuthorize: false },
      };
    }
    const plan = this.#planRecords(intent.taskIntentId, intent.mode);
    const manifest = plan['coverage-manifest'] as CoverageManifestProjection;
    requireAnalysis(manifestDigestIsExact(manifest) && manifestCoversEveryBlock(manifest), 'ANALYSIS_RECORD_INVALID', '覆盖清单记录无效。');
    const digests = this.#planDigests(intent.taskIntentId);
    const envelope = plan['plan-envelope'] as Record<string, unknown>;
    const authorization = this.#db.prepare('SELECT * FROM analysis_run_authorizations WHERE task_intent_id = ?').get(intent.taskIntentId) as SqlRow | undefined;
    const runRecord = this.#db.prepare('SELECT * FROM analysis_run_records WHERE task_intent_id = ?').get(intent.taskIntentId) as SqlRow | undefined;
    const run = runRecord === undefined ? null : this.#runProjection(runRecord, progress);
    const outcome = this.#db.prepare('SELECT * FROM analysis_task_outcomes WHERE task_intent_id = ?').get(intent.taskIntentId) as SqlRow | undefined;
    const state: BaselineAnalysisProjection['state'] = run === null
      ? 'prepared'
      : run.state === 'authorized' || run.state === 'blocked-before-dispatch'
        ? 'authorized-blocked'
        : run.state === 'admitted' ? 'admitted'
          : run.state === 'executing' ? 'executing'
            : run.state === 'completed' || run.state === 'completed-with-gaps' ? 'settled'
              : run.state === 'failed' ? 'failed' : 'interrupted';
    const providerPlan = plan['provider-resolution-plan'] as BaselineAnalysisProjection['providerResolutionPlan'];
    const reusePlan = intent.mode === 'first-baseline' ? null : plan['reuse-plan'] as AnalysisReusePlanProjection;
    const update = intent.mode === 'first-baseline' ? null : this.#updateProjection(intent, reusePlan, digests['reuse-plan'] ?? null, revision);
    return {
      bookId,
      kind: BASELINE_ANALYSIS_KIND,
      contractVersion: BASELINE_ANALYSIS_CONTRACT_VERSION,
      state,
      stateLabel: state === 'prepared' ? '计划已冻结 · 待授权'
        : state === 'authorized-blocked' ? '已授权 · 派发前阻止'
          : state === 'admitted' ? '已进入调度'
            : state === 'executing' ? '正在执行'
              : state === 'settled' ? '已形成结果集修订版'
                : state === 'failed' ? '运行失败' : '运行已中断',
      taskIntent,
      checkpoint: {
        manuscriptId: asString(checkpoint.manuscript_id),
        branchId: asString(checkpoint.branch_id),
        revisionId: asString(checkpoint.revision_id),
        revisionLabel: asString(checkpoint.revision_label),
        revisionDigest: asString(checkpoint.revision_digest),
        journalSequence: asNumber(checkpoint.journal_sequence),
        purpose: TASK_INPUT_CHECKPOINT_PURPOSE,
        createdForDirtyJournal: asNumber(checkpoint.created_for_dirty_journal) === 1,
      },
      manuscriptPin: plan['manuscript-pin'] as BaselineAnalysisProjection['manuscriptPin'],
      artifactPin: plan['artifact-pin'] as BaselineAnalysisProjection['artifactPin'],
      runSourceScope: plan['run-source-scope'] as BaselineAnalysisProjection['runSourceScope'],
      coverageManifest: manifest,
      providerResolutionPlan: providerPlan,
      executionPlan: plan['execution-plan'] as BaselineAnalysisProjection['executionPlan'],
      planEnvelope: {
        digest: asString(digests['plan-envelope']),
        dispatchAllowed: envelope.dispatchAllowed === true,
        providerStatus: envelope.providerStatus as 'remote-denied-local-deterministic' | 'remote-denied-no-route',
        summary: asString(envelope.summary),
        promptContractDigest: asString(envelope.promptContractDigest),
        behaviorCompositionDigest: asString(envelope.behaviorCompositionDigest),
      },
      authorization: authorization === undefined ? null : {
        authorizationId: asString(authorization.authorization_id),
        planEnvelopeDigest: asString(authorization.plan_envelope_sha256),
        origin: 'standard-direct',
        authority: asString(authorization.authority) as 'standard-direct-dispatch' | 'record-only-no-dispatch',
        authorizedAt: asString(authorization.authorized_at),
      },
      run,
      resultSetRevision: revision,
      taskOutcome: outcome === undefined ? null : {
        outcomeId: asString(outcome.outcome_id),
        classification: asString(outcome.classification) as keyof typeof OUTCOME_LABELS,
        label: OUTCOME_LABELS[asString(outcome.classification) as keyof typeof OUTCOME_LABELS],
        recordedAt: asString(outcome.recorded_at),
        resultSetRevisionId: outcome.result_set_revision_id === null ? null : asString(outcome.result_set_revision_id),
        safeNextAction: asString((parseCanonicalJson(asString(outcome.canonical_json)) as Record<string, unknown>).safeNextAction),
      },
      update,
      updateControls: revision === null ? null : this.#updateControls(bookId, revision, runIsActive(run?.state ?? null)),
      history,
      inspectedRevision,
      actions: { canPrepare: false, canAuthorize: authorization === undefined && (update === null || update.predecessorCurrent) },
      namedNonEffects: NON_EFFECTS,
    };
  }

  #available(bookId: string): BaselineAnalysisProjection {
    return {
      bookId,
      kind: BASELINE_ANALYSIS_KIND,
      contractVersion: BASELINE_ANALYSIS_CONTRACT_VERSION,
      state: 'available',
      stateLabel: '待开始',
      taskIntent: null,
      checkpoint: null,
      manuscriptPin: null,
      artifactPin: null,
      runSourceScope: null,
      coverageManifest: null,
      providerResolutionPlan: null,
      executionPlan: null,
      planEnvelope: null,
      authorization: null,
      run: null,
      resultSetRevision: null,
      taskOutcome: null,
      update: null,
      updateControls: null,
      history: null,
      inspectedRevision: null,
      actions: { canPrepare: true, canAuthorize: false },
      namedNonEffects: NON_EFFECTS,
    };
  }

  #latestIntentRow(bookId: string): SqlRow | undefined {
    return this.#db.prepare('SELECT * FROM analysis_task_intents WHERE book_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1').get(bookId) as SqlRow | undefined;
  }

  #intentFacts(row: SqlRow): IntentFacts {
    const mode = asString(row.mode) as BaselineAnalysisTaskMode;
    const goal = asString(row.goal);
    requireAnalysis(goal === goalForMode(mode), 'ANALYSIS_RECORD_INVALID', '任务意图的目标与更新方式不一致。');
    const start = row.selected_start_position;
    const end = row.selected_end_position;
    return {
      taskIntentId: asString(row.task_intent_id),
      bookId: asString(row.book_id),
      mode,
      goal: goal as BaselineAnalysisGoal,
      createdAt: asString(row.created_at),
      predecessorRevisionId: row.predecessor_revision_id === null ? null : asString(row.predecessor_revision_id),
      selectedRange: start === null || end === null ? null : { startPosition: asNumber(start), endPosition: asNumber(end) },
    };
  }

  /** The frozen plan components of one Task; an update Task must also carry its `reuse-plan`. */
  #planRecords(taskIntentId: string, mode: BaselineAnalysisTaskMode | 'any'): Record<string, unknown> {
    const rows = this.#db.prepare('SELECT component, canonical_json FROM analysis_plan_records WHERE task_intent_id = ?').all(taskIntentId) as SqlRow[];
    const records: Record<string, unknown> = {};
    for (const row of rows) records[asString(row.component)] = parseCanonicalJson(asString(row.canonical_json));
    const required = ['manuscript-pin', 'artifact-pin', 'run-source-scope', 'coverage-manifest', 'provider-resolution-plan', 'execution-plan', 'plan-envelope'];
    if (mode !== 'first-baseline' && mode !== 'any') required.push('reuse-plan');
    for (const component of required) {
      requireAnalysis(records[component] !== undefined, 'ANALYSIS_RECORD_INVALID', '任务计划记录图不完整。');
    }
    return records;
  }

  #planDigests(taskIntentId: string): Record<string, string> {
    return Object.fromEntries((this.#db.prepare('SELECT component, sha256 FROM analysis_plan_records WHERE task_intent_id = ?').all(taskIntentId) as SqlRow[])
      .map((row) => [asString(row.component), asString(row.sha256)]));
  }

  #runProjection(runRecord: SqlRow, progress: ProgressReader): NonNullable<BaselineAnalysisProjection['run']> {
    const runRecordId = asString(runRecord.run_record_id);
    const states = this.#db.prepare('SELECT * FROM analysis_run_states WHERE run_record_id = ? ORDER BY sequence').all(runRecordId) as SqlRow[];
    requireAnalysis(states.length >= 1, 'ANALYSIS_RECORD_INVALID', '运行记录缺少状态转换。');
    const transitions = states.map((row) => {
      const detail = parseCanonicalJson(asString(row.canonical_json)) as Record<string, unknown>;
      return {
        sequence: asNumber(row.sequence),
        state: asString(row.state) as BaselineAnalysisRunState,
        recordedAt: asString(row.recorded_at),
        detail: typeof detail.detail === 'string' ? detail.detail : null,
      };
    });
    const current = transitions[transitions.length - 1]!;
    const attemptRow = this.#db.prepare('SELECT * FROM analysis_execution_attempts WHERE run_record_id = ?').get(runRecordId) as SqlRow | undefined;
    let attempt: NonNullable<BaselineAnalysisProjection['run']>['attempt'] = null;
    if (attemptRow !== undefined) {
      const attemptId = asString(attemptRow.attempt_id);
      const attemptJson = parseCanonicalJson(asString(attemptRow.canonical_json)) as Record<string, unknown>;
      const check = attemptJson.credentialReadinessCheck as { slot: 'deepseek-api-key'; readiness: 'present' | 'missing' };
      const bindingRow = this.#db.prepare('SELECT * FROM analysis_execution_bindings WHERE attempt_id = ?').get(attemptId) as SqlRow | undefined;
      const spans = (this.#db.prepare('SELECT * FROM analysis_harness_spans WHERE attempt_id = ? ORDER BY ordinal').all(attemptId) as SqlRow[]).map((row) => ({
        ordinal: asNumber(row.ordinal),
        harnessSessionId: asString(row.harness_session_id),
        startSeq: asNumber(row.start_seq),
        endSeq: asNumber(row.end_seq),
        unitOrdinal: row.unit_ordinal === null ? null : asNumber(row.unit_ordinal),
      }));
      attempt = {
        attemptId,
        ordinal: 1,
        startedAt: asString(attemptRow.started_at),
        credentialReadinessCheck: { slot: 'deepseek-api-key', readiness: check.readiness, valueReleased: false },
        executionBinding: bindingRow === undefined ? null : this.#bindingProjection(bindingRow),
        spans,
      };
    }
    return {
      runRecordId,
      state: current.state,
      stateLabel: RUN_STATE_LABELS[current.state],
      recordedAt: asString(runRecord.recorded_at),
      transitions,
      blockedReasons: current.state === 'blocked-before-dispatch' ? BLOCKED_REASONS : null,
      progress: current.state === 'admitted' || current.state === 'executing' ? progress(runRecordId) : null,
      attempt,
    };
  }

  #bindingProjection(row: SqlRow): BaselineAnalysisExecutionBindingProjection {
    const binding = parseCanonicalJson(asString(row.canonical_json)) as ExecutionBindingRecord;
    return {
      attemptId: binding.attemptId,
      bindingDigest: asString(row.sha256),
      harnessSessionId: binding.harnessSessionId,
      behaviorCompositionDigest: binding.behaviorCompositionDigest,
      promptContractDigest: binding.promptContractDigest,
      planEnvelopeDigest: binding.planEnvelopeDigest,
      runSourceScopeDigest: binding.runSourceScopeDigest,
      providerResolutionPlanDigest: binding.providerResolutionPlanDigest,
      coverageManifestDigest: binding.coverageManifestDigest,
      route: LOCAL_DETERMINISTIC_ROUTE,
      model: LOCAL_DETERMINISTIC_MODEL,
      fixtureIdentity: binding.adapterPin.fixtureIdentity,
      fixtureSha256: binding.adapterPin.fixtureSha256,
      nativeCarrierSha256: binding.nativeArtifact.nativeCarrierSha256,
      sidecarRevision: 2,
      boundAt: binding.boundAt,
    };
  }

  // ---- revisions and history ---------------------------------------------------------------------

  #revisionRows(bookId: string): SqlRow[] {
    return this.#db.prepare(
      `SELECT r.* FROM analysis_result_set_revisions r
       JOIN analysis_result_sets s ON s.result_set_id = r.result_set_id
       WHERE s.book_id = ? AND s.kind = ? ORDER BY r.ordinal`,
    ).all(bookId, BASELINE_ANALYSIS_KIND) as SqlRow[];
  }

  #revisionBody(row: SqlRow): Record<string, unknown> {
    const body = parseCanonicalJson(asString(row.canonical_json)) as Record<string, unknown>;
    requireAnalysis(body.schema === RESULT_SET_REVISION_SCHEMA || body.schema === RESULT_SET_SUCCESSOR_REVISION_SCHEMA,
      'ANALYSIS_RECORD_INVALID', '结果集修订版记录无效。');
    return body;
  }

  /** The `update` facts of a revision body; a `/1` (first-baseline) body carries none and is synthesized. */
  #revisionUpdate(body: Record<string, unknown>, unitCount: number): BaselineAnalysisRevisionUpdateProjection {
    if (!isRecord(body.update)) {
      return { mode: 'first-baseline', modeLabel: BASELINE_ANALYSIS_MODE_LABELS['first-baseline'], predecessor: null, reusePlanDigest: null, selectedRange: null, counts: firstBaselineCounts(unitCount) };
    }
    const update = body.update as Omit<BaselineAnalysisRevisionUpdateProjection, 'modeLabel'>;
    return { ...update, modeLabel: BASELINE_ANALYSIS_MODE_LABELS[update.mode] };
  }

  #unitLineage(unit: Record<string, unknown>): AnalysisUnitLineage {
    return isRecord(unit.lineage) ? unit.lineage as AnalysisUnitLineage : { kind: 'recomputed' };
  }

  #revisionProjection(row: SqlRow, latestOrdinal: number): BaselineAnalysisResultSetRevisionProjection {
    const body = this.#revisionBody(row);
    const revisionId = asString(row.revision_id);
    const ordinal = asNumber(row.ordinal);
    const units = (this.#db.prepare('SELECT * FROM analysis_unit_results WHERE revision_id = ? ORDER BY unit_ordinal').all(revisionId) as SqlRow[])
      .map((unit) => {
        const record = parseCanonicalJson(asString(unit.canonical_json)) as Record<string, unknown>;
        return { ...record, lineage: this.#unitLineage(record) } as BaselineAnalysisUnitProjection;
      });
    const manuscriptPin = body.manuscriptPin as BaselineAnalysisResultSetRevisionProjection['manuscriptPin'];
    const coverage = body.coverage as BaselineAnalysisResultSetRevisionProjection['coverage'];
    return {
      resultSetId: asString(row.result_set_id),
      revisionId,
      ordinal,
      createdAt: asString(row.created_at),
      digest: asString(row.sha256),
      contractVersion: BASELINE_ANALYSIS_CONTRACT_VERSION,
      manuscriptPin,
      coverageManifestDigest: asString(row.coverage_manifest_sha256),
      schemaDigest: asString(body.schemaDigest),
      reducerDigest: asString(body.reducerDigest),
      adapterPin: body.adapterPin as BaselineAnalysisResultSetRevisionProjection['adapterPin'],
      bindingPin: body.bindingPin as BaselineAnalysisResultSetRevisionProjection['bindingPin'],
      policyPin: body.policyPin as BaselineAnalysisResultSetRevisionProjection['policyPin'],
      provenance: body.provenance as BaselineAnalysisResultSetRevisionProjection['provenance'],
      usage: body.usage as BaselineAnalysisResultSetRevisionProjection['usage'],
      update: this.#revisionUpdate(body, units.length),
      lineage: units.map((unit) => ({ unitOrdinal: unit.unitOrdinal, ...unit.lineage })),
      coverage: { ...coverage, unitsReused: typeof coverage.unitsReused === 'number' ? coverage.unitsReused : 0 },
      reducerClosure: body.reducerClosure as BaselineAnalysisResultSetRevisionProjection['reducerClosure'],
      freshness: this.#freshness(manuscriptPin, ordinal < latestOrdinal),
      assurance: body.assurance as BaselineAnalysisResultSetRevisionProjection['assurance'],
      gaps: body.gaps as BaselineAnalysisResultSetRevisionProjection['gaps'],
      conflicts: body.conflicts as BaselineAnalysisResultSetRevisionProjection['conflicts'],
      sections: body.sections as BaselineAnalysisResultSetRevisionProjection['sections'],
      synthesis: body.synthesis as BaselineAnalysisResultSetRevisionProjection['synthesis'],
      units,
    };
  }

  #inspectedRevision(rows: SqlRow[], revisionId: string, latestOrdinal: number): NonNullable<BaselineAnalysisProjection['inspectedRevision']> {
    const row = rows.find((candidate) => candidate.revision_id === revisionId);
    requireAnalysis(row !== undefined, 'ANALYSIS_REVISION_NOT_FOUND', '本图书没有该结果集修订版。');
    const revision = this.#revisionProjection(row, latestOrdinal);
    return { revision, current: revision.ordinal === latestOrdinal, readOnly: true };
  }

  /**
   * Exact-revision freshness through local deterministic comparison against the current branch
   * head. A superseded (non-latest) revision keeps its original pin and is never current.
   */
  #freshness(pin: BaselineAnalysisResultSetRevisionProjection['manuscriptPin'], superseded: boolean): AnalysisFreshnessAxis {
    const head = this.#workingHead(pin.manuscriptId, pin.bookId);
    const current = !superseded && head.currentRevisionId === pin.revisionId && head.currentWorkingDigest === pin.revisionDigest;
    return {
      axis: 'freshness',
      state: superseded ? 'superseded' : current ? 'current' : 'stale',
      label: superseded
        ? `精确修订版新鲜度：已被后续修订版取代 · 绑定 ${pin.revisionLabel}`
        : current
          ? `精确修订版新鲜度：当前 · 绑定 ${pin.revisionLabel}`
          : `精确修订版新鲜度：已过期 · 绑定 ${pin.revisionLabel}，稿件已有后续已确认编辑`,
      boundRevisionId: pin.revisionId,
      boundRevisionDigest: pin.revisionDigest,
      currentRevisionId: head.currentRevisionId,
      currentWorkingDigest: head.currentWorkingDigest,
      currentJournalSequence: head.currentJournalSequence,
      comparison: 'local-deterministic',
    };
  }

  #workingHead(manuscriptId: string, bookId: string): { branchId: string; currentRevisionId: string; currentRevisionLabel: string; currentWorkingDigest: string; currentJournalSequence: number } {
    const head = this.#db.prepare(
      `SELECT bws.branch_id, bws.base_revision_id, bws.journal_sequence, bws.working_digest, mr.revision_label
       FROM branch_working_state bws
       JOIN manuscripts m ON m.manuscript_id = bws.manuscript_id
       JOIN manuscript_revisions mr ON mr.revision_id = bws.base_revision_id
       WHERE m.manuscript_id = ? AND m.book_id = ? AND m.role = 'primary'`,
    ).get(manuscriptId, bookId) as SqlRow | undefined;
    requireAnalysis(head !== undefined, 'ANALYSIS_RECORD_INVALID', '无法读取当前稿件工作状态。');
    return {
      branchId: asString(head.branch_id),
      currentRevisionId: asString(head.base_revision_id),
      currentRevisionLabel: asString(head.revision_label),
      currentWorkingDigest: asString(head.working_digest),
      currentJournalSequence: asNumber(head.journal_sequence),
    };
  }

  #history(bookId: string, rows: SqlRow[], latest: BaselineAnalysisResultSetRevisionProjection | null): BaselineAnalysisHistoryProjection | null {
    if (rows.length === 0 || latest === null) return null;
    const resultSet = this.#db.prepare('SELECT * FROM analysis_result_sets WHERE book_id = ? AND kind = ?').get(bookId, BASELINE_ANALYSIS_KIND) as SqlRow | undefined;
    requireAnalysis(resultSet !== undefined, 'ANALYSIS_RECORD_INVALID', '结果集记录缺失。');
    const entries: BaselineAnalysisHistoryEntryProjection[] = rows.map((row) => {
      const body = this.#revisionBody(row);
      const ordinal = asNumber(row.ordinal);
      const revisionId = asString(row.revision_id);
      const unitDigests = body.unitDigests as ReadonlyArray<{ unitOrdinal: number; state: 'closed' | 'gap' }>;
      const update = this.#revisionUpdate(body, unitDigests.length);
      const pin = body.manuscriptPin as BaselineAnalysisResultSetRevisionProjection['manuscriptPin'];
      const provenance = body.provenance as BaselineAnalysisResultSetRevisionProjection['provenance'];
      const outcome = this.#db.prepare('SELECT classification FROM analysis_task_outcomes WHERE run_record_id = ?').get(provenance.runRecordId) as SqlRow | undefined;
      const coverage = body.coverage as BaselineAnalysisResultSetRevisionProjection['coverage'];
      const freshness = ordinal === latest.ordinal ? latest.freshness : this.#freshness(pin, true);
      return {
        revisionId,
        ordinal,
        digest: asString(row.sha256),
        createdAt: asString(row.created_at),
        mode: update.mode,
        modeLabel: update.modeLabel,
        manuscriptPin: { revisionLabel: pin.revisionLabel, revisionId: pin.revisionId, revisionDigest: pin.revisionDigest },
        coverageManifestDigest: asString(row.coverage_manifest_sha256),
        contractVersion: BASELINE_ANALYSIS_CONTRACT_VERSION,
        counts: update.counts,
        predecessor: update.predecessor,
        reusePlanDigest: update.reusePlanDigest,
        producingRun: {
          taskIntentId: provenance.taskIntentId,
          runRecordId: provenance.runRecordId,
          attemptId: provenance.attemptId,
          classification: outcome === undefined ? null : asString(outcome.classification) as BaselineAnalysisHistoryEntryProjection['producingRun']['classification'],
        },
        usage: body.usage as BaselineAnalysisResultSetRevisionProjection['usage'],
        unitsTotal: coverage.unitsTotal,
        unitsClosed: coverage.unitsClosed,
        gapCount: (body.gaps as unknown[]).length,
        conflictCount: (body.conflicts as unknown[]).length,
        current: ordinal === latest.ordinal,
        freshness: freshness.state,
        freshnessLabel: freshness.label,
      };
    });
    return {
      resultSetId: asString(resultSet.result_set_id),
      kind: BASELINE_ANALYSIS_KIND,
      createdAt: asString(resultSet.created_at),
      latestOrdinal: latest.ordinal,
      entries,
    };
  }

  /** The predecessor facts a reuse plan is derived against, read from the immutable revision rows. */
  #predecessorFacts(row: SqlRow): ReusePlanPredecessor {
    const revisionId = asString(row.revision_id);
    const manifest = this.#planRecords(asString(row.task_intent_id), 'any')['coverage-manifest'] as CoverageManifestProjection;
    requireAnalysis(manifestDigestIsExact(manifest) && manifest.digest === asString(row.coverage_manifest_sha256),
      'ANALYSIS_RECORD_INVALID', '前一修订版的覆盖清单记录无效。');
    const unitStates = (this.#db.prepare('SELECT unit_ordinal, state FROM analysis_unit_results WHERE revision_id = ? ORDER BY unit_ordinal').all(revisionId) as SqlRow[])
      .map((unit) => ({ unitOrdinal: asNumber(unit.unit_ordinal), state: asString(unit.state) as 'closed' | 'gap' }));
    return {
      revisionId,
      ordinal: asNumber(row.ordinal),
      digest: asString(row.sha256),
      contractVersion: asString(row.contract_version),
      coverageManifestDigest: asString(row.coverage_manifest_sha256),
      manifest,
      unitStates,
    };
  }

  #revisionRowById(revisionId: string): SqlRow {
    const row = this.#db.prepare('SELECT * FROM analysis_result_set_revisions WHERE revision_id = ?').get(revisionId) as SqlRow | undefined;
    requireAnalysis(row !== undefined, 'ANALYSIS_RECORD_INVALID', '前一结果集修订版缺失。');
    return row;
  }

  #updateProjection(
    intent: IntentFacts,
    reusePlan: AnalysisReusePlanProjection | null,
    reusePlanDigest: string | null,
    latest: BaselineAnalysisResultSetRevisionProjection | null,
  ): BaselineAnalysisUpdateProjection {
    requireAnalysis(intent.mode !== 'first-baseline' && intent.predecessorRevisionId !== null, 'ANALYSIS_RECORD_INVALID', '更新任务缺少前一修订版。');
    const predecessorRow = this.#revisionRowById(intent.predecessorRevisionId);
    const body = this.#revisionBody(predecessorRow);
    const pin = body.manuscriptPin as BaselineAnalysisResultSetRevisionProjection['manuscriptPin'];
    return {
      mode: intent.mode,
      modeLabel: BASELINE_ANALYSIS_MODE_LABELS[intent.mode],
      meaning: BASELINE_ANALYSIS_MODE_MEANINGS[intent.mode],
      predecessor: {
        revisionId: intent.predecessorRevisionId,
        ordinal: asNumber(predecessorRow.ordinal),
        digest: asString(predecessorRow.sha256),
        manuscriptPin: { revisionLabel: pin.revisionLabel, revisionId: pin.revisionId, revisionDigest: pin.revisionDigest },
      },
      predecessorCurrent: latest !== null && latest.revisionId === intent.predecessorRevisionId && latest.digest === asString(predecessorRow.sha256),
      selectedRange: intent.selectedRange,
      reusePlan,
      reusePlanDigest,
    };
  }

  /**
   * The Analysis Update Controls: the preview manifest is derived over the current working blocks of
   * the primary branch (exactly what the next Task Input checkpoint would pin), and every expected
   * count is a real reuse-plan derivation against the latest revision, never an estimate.
   */
  #updateControls(bookId: string, latest: BaselineAnalysisResultSetRevisionProjection, blockedByActiveRun: boolean): BaselineAnalysisUpdateControlsProjection {
    const head = this.#workingHead(latest.manuscriptPin.manuscriptId, bookId);
    const blocks = this.readWorkingBlocks(head.branchId);
    const preview = deriveCoverageManifest({
      bookId,
      manuscriptId: latest.manuscriptPin.manuscriptId,
      branchId: head.branchId,
      revisionId: head.currentRevisionId,
      revisionLabel: head.currentRevisionLabel,
      revisionDigest: head.currentWorkingDigest,
      blocks,
    });
    const predecessor = this.#predecessorFacts(this.#revisionRowById(latest.revisionId));
    const expected = (mode: BaselineAnalysisUpdateMode, selectedRange: BaselineAnalysisSelectedRange | null): AnalysisReusePlanCounts =>
      deriveReusePlan({ mode, selectedRange, manifest: preview, predecessor }).counts;
    const freshness = latest.freshness.state === 'stale' ? 'stale' : 'current';
    const action = (mode: BaselineAnalysisUpdateMode, available: boolean, unavailableReason: string | null, counts: AnalysisReusePlanCounts | null) => ({
      mode,
      label: BASELINE_ANALYSIS_MODE_LABELS[mode],
      goal: goalForMode(mode),
      meaning: BASELINE_ANALYSIS_MODE_MEANINGS[mode],
      available: available && !blockedByActiveRun,
      unavailableReason: blockedByActiveRun ? ACTIVE_RUN_REASON : unavailableReason,
      expected: counts,
    });
    const options: BaselineAnalysisRangeOptionProjection[] = preview.units.map((unit) => ({
      unitOrdinal: unit.ordinal,
      sectionOrdinal: unit.sectionOrdinal,
      headingText: unit.headingText,
      subUnitIndex: unit.subUnitIndex,
      subUnitCount: unit.subUnitCount,
      startPosition: unit.startPosition,
      endPosition: unit.endPosition,
      graphemes: unit.graphemes,
      label: `结构段 ${unit.sectionOrdinal}${unit.headingText === null ? '' : `「${unit.headingText}」`} · 单元 ${unit.ordinal}/${preview.units.length}（${unit.subUnitIndex}/${unit.subUnitCount}）· 内容块 ${unit.startPosition}–${unit.endPosition} · ${unit.graphemes} 字素`,
      expected: expected('reanalyze-range', { startPosition: unit.startPosition, endPosition: unit.endPosition }),
    }));
    return {
      target: {
        revisionId: latest.revisionId,
        ordinal: latest.ordinal,
        digest: latest.digest,
        manuscriptPin: { revisionLabel: latest.manuscriptPin.revisionLabel, revisionId: latest.manuscriptPin.revisionId, revisionDigest: latest.manuscriptPin.revisionDigest },
        freshness,
      },
      working: {
        revisionLabel: head.currentRevisionLabel,
        journalSequence: head.currentJournalSequence,
        workingDigest: head.currentWorkingDigest,
        totalBlocks: preview.totalBlocks,
        unitCount: preview.units.length,
        sectionCount: preview.sectionCount,
      },
      blockedByActiveRun,
      actions: {
        'sync-current': action('sync-current', freshness === 'stale', freshness === 'stale' ? null : SYNC_UNAVAILABLE_REASON, freshness === 'stale' ? expected('sync-current', null) : null),
        'reanalyze-range': { ...action('reanalyze-range', true, null, null), options },
        'reanalyze-book': action('reanalyze-book', true, null, expected('reanalyze-book', null)),
      },
      providerConsequence: PROVIDER_CONSEQUENCE,
      successorBehavior: SUCCESSOR_BEHAVIOR,
    };
  }

  // ---- preparation -----------------------------------------------------------------------------

  prepare(input: BaselineAnalysisPrepareInput): BaselineAnalysisPreparationResult {
    if (input.phase === 'cancel-all') {
      for (const workId of Array.from(this.#work.keys())) this.prepare({ phase: 'cancel', workId });
      return { done: true, workId: null, completed: 0, total: 0, projection: null };
    }
    if (input.phase === 'cancel') {
      const work = this.#work.get(input.workId);
      if (work !== undefined) {
        this.#checkpointOwner.cancelManuscriptCheckpointWork(work.checkpointWorkId);
        this.#work.delete(input.workId);
      }
      return { done: true, workId: null, completed: 0, total: 0, projection: null };
    }
    if (input.phase === 'advance') return this.#advance(input.workId);
    const update = input.update;
    const mode: BaselineAnalysisTaskMode = update === null ? 'first-baseline' : update.mode;
    requireAnalysis(input.goal === goalForMode(mode), 'ANALYSIS_GOAL_INVALID', '任务目标与所选更新方式的固定目标不一致。');
    this.#requireDeniedPolicy(input.launchPolicy);
    const existing = this.inspect(input.bookId);
    requireAnalysis(!runIsActive(existing.run?.state ?? null), 'ANALYSIS_TASK_ACTIVE', ACTIVE_RUN_REASON);
    const latest = existing.resultSetRevision;
    let selectedRange: BaselineAnalysisSelectedRange | null = null;
    if (update === null) {
      requireAnalysis(latest === null, 'ANALYSIS_FIRST_BASELINE_EXISTS', '本图书已存在结果集修订版；请使用分析更新操作追加后继修订版。');
    } else {
      requireAnalysis(latest !== null && existing.updateControls !== null, 'ANALYSIS_PREDECESSOR_ABSENT', '本图书尚无结果集修订版；请先完成首次基线分析。');
      const control = existing.updateControls.actions[update.mode];
      requireAnalysis(control.available, 'ANALYSIS_UPDATE_MODE_UNAVAILABLE', control.unavailableReason ?? SYNC_UNAVAILABLE_REASON);
      if (update.mode === 'reanalyze-range') {
        selectedRange = requireSelectedRange(update.selectedRange, existing.updateControls.working.totalBlocks);
      } else {
        requireAnalysis(update.selectedRange === null, 'ANALYSIS_SELECTED_RANGE_INVALID', '只有重新分析所选范围可以携带内容块范围。');
      }
    }
    const binding = this.#binding(input.bookId);
    const latestIntent = existing.taskIntent === null ? null : this.#intentFacts(this.#latestIntentRow(input.bookId)!);
    const reusable = latestIntent !== null && existing.run === null && latestIntent.mode === mode &&
      sameRange(latestIntent.selectedRange, selectedRange) && latestIntent.predecessorRevisionId === (latest?.revisionId ?? null);
    if (reusable && existing.checkpoint !== null) {
      return { done: true, workId: null, completed: 1, total: 1, projection: existing };
    }
    const taskIntentId = reusable ? latestIntent.taskIntentId : randomUUID();
    if (!reusable) {
      const createdAt = new Date().toISOString();
      const base = {
        bookId: input.bookId,
        contractVersion: BASELINE_ANALYSIS_CONTRACT_VERSION,
        createdAt,
        expectedOutcome: BASELINE_ANALYSIS_EXPECTED_OUTCOME,
        goal: input.goal,
        kind: BASELINE_ANALYSIS_KIND,
        taskIntentId,
      };
      const intent = canonicalRecord(mode === 'first-baseline' ? base : {
        ...base,
        mode,
        predecessorRevisionId: latest!.revisionId,
        predecessorRevisionDigest: latest!.digest,
        selectedRange,
      });
      this.#db.prepare(
        `INSERT INTO analysis_task_intents(
           task_intent_id, book_id, kind, contract_version, goal, created_at, canonical_json, sha256,
           mode, predecessor_revision_id, selected_start_position, selected_end_position
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(taskIntentId, input.bookId, BASELINE_ANALYSIS_KIND, BASELINE_ANALYSIS_CONTRACT_VERSION, input.goal, createdAt, intent.json, intent.digest,
        mode, mode === 'first-baseline' ? null : latest!.revisionId, selectedRange?.startPosition ?? null, selectedRange?.endPosition ?? null);
    }
    const active = Array.from(this.#work.values()).find((work) => work.taskIntentId === taskIntentId);
    if (active !== undefined) return { done: false, workId: active.workId, completed: 0, total: active.total, projection: null };
    const checkpoint = this.#checkpointOwner.createManuscriptCheckpointWork(binding.manuscriptId, binding.branchId, TASK_INPUT_CHECKPOINT_PURPOSE);
    if (checkpoint.workId === null) {
      requireAnalysis(checkpoint.checkpoint !== null, 'ANALYSIS_CHECKPOINT_INVALID', '任务输入固定点缺失。');
      transact(this.#db, () => this.#persistPrepared(taskIntentId, checkpoint.checkpoint!, TASK_INPUT_CHECKPOINT_PURPOSE, input.launchPolicy));
      return { done: true, workId: null, completed: 1, total: 1, projection: this.inspect(input.bookId) };
    }
    const workId = randomUUID();
    this.#work.set(workId, { workId, taskIntentId, checkpointWorkId: checkpoint.workId, launchPolicy: structuredClone(input.launchPolicy), total: checkpoint.total });
    return { done: false, workId, completed: 0, total: checkpoint.total, projection: null };
  }

  #advance(workId: string): BaselineAnalysisPreparationResult {
    requireAnalysis(UUID_PATTERN.test(workId), 'JOB_INVALID', '任务准备标识无效。');
    const work = this.#work.get(workId);
    requireAnalysis(work !== undefined, 'JOB_NOT_FOUND', '任务准备不存在或已结束。');
    const progress = this.#checkpointOwner.advanceManuscriptCheckpointWork(work.checkpointWorkId);
    if (!progress.done) return { done: false, workId, completed: progress.completed, total: progress.total, projection: null };
    this.#checkpointOwner.finalizeManuscriptCheckpointWork(
      work.checkpointWorkId,
      (checkpoint, purpose) => this.#persistPrepared(work.taskIntentId, checkpoint, purpose, work.launchPolicy),
    );
    this.#work.delete(workId);
    const intent = this.#db.prepare('SELECT book_id FROM analysis_task_intents WHERE task_intent_id = ?').get(work.taskIntentId) as SqlRow;
    return { done: true, workId: null, completed: progress.total, total: progress.total, projection: this.inspect(asString(intent.book_id)) };
  }

  #persistPrepared(taskIntentId: string, checkpoint: ManuscriptCheckpointBinding, purpose: CheckpointPurpose, launchPolicy: LaunchPolicyProjection): void {
    requireAnalysis(purpose === TASK_INPUT_CHECKPOINT_PURPOSE, 'ANALYSIS_CHECKPOINT_INVALID', '任务输入固定点用途无效。');
    this.#requireDeniedPolicy(launchPolicy);
    const intentRow = this.#db.prepare('SELECT * FROM analysis_task_intents WHERE task_intent_id = ?').get(taskIntentId) as SqlRow | undefined;
    requireAnalysis(intentRow !== undefined, 'ANALYSIS_RECORD_INVALID', '任务意图缺失。');
    const intent = this.#intentFacts(intentRow);
    const facts = this.#binding(checkpoint.bookId, checkpoint);
    const instant = new Date().toISOString();
    const blocks = this.readRevisionBlocks(checkpoint.manuscriptId, checkpoint.revisionId);
    const manifest = deriveCoverageManifest({
      bookId: checkpoint.bookId,
      manuscriptId: checkpoint.manuscriptId,
      branchId: checkpoint.branchId,
      revisionId: checkpoint.revisionId,
      revisionLabel: checkpoint.revisionLabel,
      revisionDigest: checkpoint.revisionDigest,
      blocks,
    });
    let reusePlan: AnalysisReusePlanProjection | null = null;
    if (intent.mode !== 'first-baseline') {
      requireAnalysis(intent.predecessorRevisionId !== null, 'ANALYSIS_RECORD_INVALID', '更新任务缺少前一修订版。');
      const latestRow = this.#revisionRows(checkpoint.bookId).at(-1);
      requireAnalysis(latestRow !== undefined && asString(latestRow.revision_id) === intent.predecessorRevisionId,
        'ANALYSIS_PREDECESSOR_DRIFT', '该任务的前一修订版已不再是结果集的最新修订版；请基于最新修订版重新准备更新。');
      reusePlan = deriveReusePlan({
        mode: intent.mode,
        selectedRange: intent.mode === 'reanalyze-range' ? requireSelectedRange(intent.selectedRange, manifest.totalBlocks) : null,
        manifest,
        predecessor: this.#predecessorFacts(latestRow),
      });
    }
    const checkpointRecord = canonicalRecord({
      branchId: checkpoint.branchId,
      createdForDirtyJournal: checkpoint.createdForDirtyJournal,
      journalSequence: checkpoint.journalSequence,
      manuscriptId: checkpoint.manuscriptId,
      purpose,
      revisionDigest: checkpoint.revisionDigest,
      revisionId: checkpoint.revisionId,
      revisionLabel: checkpoint.revisionLabel,
      taskIntentId,
    });
    const manuscriptPin = {
      bookId: checkpoint.bookId,
      manuscriptId: checkpoint.manuscriptId,
      revisionId: checkpoint.revisionId,
      revisionLabel: checkpoint.revisionLabel,
      revisionDigest: checkpoint.revisionDigest,
      sourceVersionId: facts.sourceVersionId,
      sourceDigest: SAMPLE1_SOURCE_DIGEST,
    };
    const artifactPin = {
      identity: '@ai7/editorial-workspace-profile',
      version: '1.0.0',
      nativeCarrierSha256: NATIVE_CARRIER_DIGEST,
      sidecarIdentity: 'ai7.editorial-workspace-profile.authority',
      sidecarRevision: 2,
      sidecarSha256: SIDECAR_DIGEST,
    };
    const sourceScopeBase = {
      bookId: checkpoint.bookId,
      manuscriptId: checkpoint.manuscriptId,
      taskInputRevision: { revisionId: checkpoint.revisionId, revisionDigest: checkpoint.revisionDigest },
      readableScopeKinds: ['current-book-primary-manuscript-revision'],
      sourceVersionEvidence: { sourceVersionId: facts.sourceVersionId, readable: false },
    };
    // An update Run admits only the recomputed units' messages; a reused unit never forms a model-bound payload.
    const sourceScope = reusePlan === null ? sourceScopeBase : {
      ...sourceScopeBase,
      unitScope: {
        mode: reusePlan.mode,
        recomputedUnitOrdinals: reusePlan.units.filter((unit) => unit.disposition === 'recomputed').map((unit) => unit.unitOrdinal),
        reusedUnitOrdinals: reusePlan.units.filter((unit) => unit.disposition === 'reused').map((unit) => unit.unitOrdinal),
      },
    };
    const composition = describeComposition(LOCAL_DETERMINISTIC_ROUTE, LOCAL_DETERMINISTIC_MODEL, BASELINE_PROMPT_CONTRACT_DIGEST);
    const providerPlan = {
      role: 'Main Editorial Role',
      capabilities: [],
      remoteBinding: {
        providerId: 'deepseek-open-platform',
        modelId: 'deepseek-v4-pro',
        adapterRevision: 1,
        configurationRevision: 1,
        approvedFallbackChain: [],
        credentialSlot: 'deepseek-api-key',
        credentialReference: facts.credentialReference,
        credentialReadiness: facts.credentialOperationState,
        providerProcessing: { operationalScope: 'development-ci', version: 'v1', decision: 'deny', authorizedLiveTransmissionCount: 0 },
      },
      executionRoute: this.#route === null
        ? { kind: 'none', reason: 'j04-model-adapter-control-absent' }
        : {
            kind: LOCAL_DETERMINISTIC_ROUTE,
            model: LOCAL_DETERMINISTIC_MODEL,
            fixtureIdentity: this.#route.fixtureIdentity,
            fixtureSha256: this.#route.fixtureSha256,
            fixtureLineage: this.#route.fixtureLineage,
          },
      outboundDataCategory: 'public-or-synthetic',
      runBudgetCeiling: 'unset',
    };
    const dispatchAllowed = this.#route !== null;
    const stopCondition = dispatchAllowed
      ? 'Provider Processing v1 denies the remote route; execution binds only ai7-local-deterministic'
      : 'Provider Processing v1 denies the remote route and no local deterministic route is bound';
    const executionPlan = reusePlan === null
      ? { steps: EXECUTION_STEPS, effects: [], unitCount: manifest.units.length, reducerStages: REDUCER_STAGES, stopCondition }
      : {
          steps: UPDATE_EXECUTION_STEPS,
          effects: [],
          unitCount: manifest.units.length,
          recomputedUnitCount: reusePlan.counts.recomputed,
          reusedUnitCount: reusePlan.counts.reused,
          reducerStages: REDUCER_STAGES,
          stopCondition,
        };
    const records: Record<string, { json: string; digest: string }> = {
      'manuscript-pin': canonicalRecord(manuscriptPin),
      'artifact-pin': canonicalRecord(artifactPin),
      'run-source-scope': canonicalRecord(sourceScope),
      'coverage-manifest': canonicalRecord(manifest),
      'provider-resolution-plan': canonicalRecord(providerPlan),
      'execution-plan': canonicalRecord(executionPlan),
    };
    if (reusePlan !== null) records['reuse-plan'] = reusePlanRecord(reusePlan);
    const envelopeBase = {
      providerStatus: dispatchAllowed ? 'remote-denied-local-deterministic' : 'remote-denied-no-route',
      dispatchAllowed,
      summary: dispatchAllowed
        ? '计划已冻结；远程绑定被 Provider Processing v1 拒绝，执行绑定至 AI7 本地确定性模型适配器'
        : '计划已冻结；远程绑定被 Provider Processing v1 拒绝，且没有可执行的本地路由',
      taskIntentId,
      checkpointDigest: checkpointRecord.digest,
      manuscriptPinDigest: records['manuscript-pin']!.digest,
      artifactPinDigest: records['artifact-pin']!.digest,
      runSourceScopeDigest: records['run-source-scope']!.digest,
      coverageManifestDigest: manifest.digest,
      providerResolutionPlanDigest: records['provider-resolution-plan']!.digest,
      executionPlanDigest: records['execution-plan']!.digest,
      promptContractDigest: BASELINE_PROMPT_CONTRACT_DIGEST,
      behaviorCompositionDigest: composition.digest,
    };
    const envelope = canonicalRecord(reusePlan === null ? envelopeBase : {
      ...envelopeBase,
      updateMode: reusePlan.mode,
      predecessorRevisionId: reusePlan.predecessor.revisionId,
      predecessorRevisionDigest: reusePlan.predecessor.digest,
      reusePlanDigest: records['reuse-plan']!.digest,
    });
    this.#db.prepare(
      `INSERT INTO analysis_task_input_checkpoints(
         task_intent_id, manuscript_id, branch_id, revision_id, revision_label, revision_digest,
         journal_sequence, purpose, created_for_dirty_journal, canonical_json, sha256, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(taskIntentId, checkpoint.manuscriptId, checkpoint.branchId, checkpoint.revisionId, checkpoint.revisionLabel,
      checkpoint.revisionDigest, checkpoint.journalSequence, purpose, checkpoint.createdForDirtyJournal ? 1 : 0,
      checkpointRecord.json, checkpointRecord.digest, instant);
    const insert = this.#db.prepare(
      'INSERT INTO analysis_plan_records(task_intent_id, component, canonical_json, sha256, created_at) VALUES (?, ?, ?, ?, ?)',
    );
    for (const [component, record] of Object.entries(records)) insert.run(taskIntentId, component, record.json, record.digest, instant);
    insert.run(taskIntentId, 'plan-envelope', envelope.json, envelope.digest, instant);
  }

  // ---- authorization -----------------------------------------------------------------------------

  authorize(bookId: string, taskIntentId: string, planEnvelopeDigest: string): { projection: BaselineAnalysisProjection; dispatchRunRecordId: string | null } {
    requireAnalysis(UUID_PATTERN.test(bookId) && UUID_PATTERN.test(taskIntentId) && DIGEST_PATTERN.test(planEnvelopeDigest),
      'ANALYSIS_AUTHORIZATION_INVALID', '任务运行授权参数无效。');
    const prepared = this.inspect(bookId);
    requireAnalysis(prepared.taskIntent?.taskIntentId === taskIntentId && prepared.planEnvelope?.digest === planEnvelopeDigest,
      'ANALYSIS_AUTHORIZATION_STALE', '任务计划已经变化；无法记录该授权。');
    if (prepared.authorization !== null) return { projection: prepared, dispatchRunRecordId: null };
    requireAnalysis(prepared.state === 'prepared', 'ANALYSIS_AUTHORIZATION_INVALID', '任务计划尚未准备完成。');
    // An update Task is re-verified against the Result Set: its predecessor must still be the latest revision.
    requireAnalysis(prepared.update === null || prepared.update.predecessorCurrent,
      'ANALYSIS_PREDECESSOR_DRIFT', '该任务的前一修订版已不再是结果集的最新修订版；无法授权。请基于最新修订版重新准备更新。');
    const dispatchAllowed = prepared.planEnvelope.dispatchAllowed;
    const authorizationId = randomUUID();
    const runRecordId = randomUUID();
    const instant = new Date().toISOString();
    const authority = dispatchAllowed ? 'standard-direct-dispatch' : 'record-only-no-dispatch';
    const authorization = canonicalRecord({ authorizationId, origin: 'standard-direct', planEnvelopeDigest, taskIntentId, authority });
    const run = canonicalRecord({ runRecordId, authorizationId, taskIntentId, recordedAt: instant });
    transact(this.#db, () => {
      this.#db.prepare(
        `INSERT INTO analysis_run_authorizations(authorization_id, task_intent_id, plan_envelope_sha256, origin, authority, authorized_at, canonical_json, sha256)
         VALUES (?, ?, ?, 'standard-direct', ?, ?, ?, ?)`,
      ).run(authorizationId, taskIntentId, planEnvelopeDigest, authority, instant, authorization.json, authorization.digest);
      this.#db.prepare(
        'INSERT INTO analysis_run_records(run_record_id, task_intent_id, authorization_id, recorded_at, canonical_json, sha256) VALUES (?, ?, ?, ?, ?, ?)',
      ).run(runRecordId, taskIntentId, authorizationId, instant, run.json, run.digest);
      this.#insertRunState(runRecordId, 1, 'authorized', { detail: '标准直接运行授权已记录。' }, instant);
      if (!dispatchAllowed) {
        this.#insertRunState(runRecordId, 2, 'blocked-before-dispatch', { detail: BLOCKED_REASONS.join(' '), reasons: BLOCKED_REASONS }, instant);
      }
    });
    return { projection: this.inspect(bookId), dispatchRunRecordId: dispatchAllowed ? runRecordId : null };
  }

  #insertRunState(runRecordId: string, sequence: number, state: BaselineAnalysisRunState, detail: Record<string, unknown>, recordedAt: string): void {
    const record = canonicalRecord({ runRecordId, sequence, state, recordedAt, ...detail });
    this.#db.prepare(
      'INSERT INTO analysis_run_states(run_record_id, sequence, state, recorded_at, canonical_json, sha256) VALUES (?, ?, ?, ?, ?, ?)',
    ).run(runRecordId, sequence, state, recordedAt, record.json, record.digest);
  }

  // ---- execution persistence -------------------------------------------------------------------

  recordRunState(runRecordId: string, state: BaselineAnalysisRunState, detail: Record<string, unknown>): void {
    requireAnalysis(UUID_PATTERN.test(runRecordId), 'ANALYSIS_RUN_INVALID', '运行记录标识无效。');
    const row = this.#db.prepare('SELECT max(sequence) last FROM analysis_run_states WHERE run_record_id = ?').get(runRecordId) as SqlRow;
    const last = row.last === null ? 0 : asNumber(row.last);
    requireAnalysis(last >= 1, 'ANALYSIS_RUN_INVALID', '运行记录不存在。');
    this.#insertRunState(runRecordId, last + 1, state, detail, new Date().toISOString());
  }

  currentRunState(runRecordId: string): BaselineAnalysisRunState {
    const row = this.#db.prepare('SELECT state FROM analysis_run_states WHERE run_record_id = ? ORDER BY sequence DESC LIMIT 1').get(runRecordId) as SqlRow | undefined;
    requireAnalysis(row !== undefined, 'ANALYSIS_RUN_INVALID', '运行记录不存在。');
    return asString(row.state) as BaselineAnalysisRunState;
  }

  /**
   * The frozen plan of one Run. For an update Task the reuse plan is re-derived from the same inputs
   * and must digest to the recorded plan component; any drift refuses execution before a model call.
   */
  loadExecutionPlan(runRecordId: string): ExecutionPlanFacts {
    requireAnalysis(UUID_PATTERN.test(runRecordId), 'ANALYSIS_RUN_INVALID', '运行记录标识无效。');
    const run = this.#db.prepare(
      `SELECT r.run_record_id, r.task_intent_id, a.plan_envelope_sha256
       FROM analysis_run_records r
       JOIN analysis_run_authorizations a ON a.authorization_id = r.authorization_id
       WHERE r.run_record_id = ?`,
    ).get(runRecordId) as SqlRow | undefined;
    requireAnalysis(run !== undefined, 'ANALYSIS_RUN_INVALID', '运行记录不存在。');
    const intentRow = this.#db.prepare('SELECT * FROM analysis_task_intents WHERE task_intent_id = ?').get(asString(run.task_intent_id)) as SqlRow | undefined;
    requireAnalysis(intentRow !== undefined, 'ANALYSIS_RECORD_INVALID', '任务意图缺失。');
    const intent = this.#intentFacts(intentRow);
    const checkpointRow = this.#db.prepare('SELECT * FROM analysis_task_input_checkpoints WHERE task_intent_id = ?').get(intent.taskIntentId) as SqlRow | undefined;
    requireAnalysis(checkpointRow !== undefined, 'ANALYSIS_RECORD_INVALID', '任务输入固定点缺失。');
    const plan = this.#planRecords(intent.taskIntentId, intent.mode);
    const digests = this.#planDigests(intent.taskIntentId);
    const manifest = plan['coverage-manifest'] as CoverageManifestProjection;
    requireAnalysis(manifestDigestIsExact(manifest), 'ANALYSIS_RECORD_INVALID', '覆盖清单记录无效。');
    const providerPlan = plan['provider-resolution-plan'] as NonNullable<BaselineAnalysisProjection['providerResolutionPlan']>;
    requireAnalysis(providerPlan.executionRoute.kind === LOCAL_DETERMINISTIC_ROUTE, 'ANALYSIS_ROUTE_ABSENT', '计划没有可执行的本地路由。');
    requireAnalysis(this.#route !== null && this.#route.fixtureIdentity === providerPlan.executionRoute.fixtureIdentity &&
      this.#route.fixtureSha256 === providerPlan.executionRoute.fixtureSha256, 'ANALYSIS_ROUTE_STALE', '当前启动的本地路由与冻结计划不一致。');
    const envelope = plan['plan-envelope'] as Record<string, unknown>;
    const artifactPin = plan['artifact-pin'] as { nativeCarrierSha256: string; sidecarSha256: string };
    let update: ExecutionUpdateFacts | null = null;
    if (intent.mode !== 'first-baseline') {
      requireAnalysis(intent.predecessorRevisionId !== null, 'ANALYSIS_RECORD_INVALID', '更新任务缺少前一修订版。');
      const predecessorRow = this.#revisionRowById(intent.predecessorRevisionId);
      const latestRow = this.#revisionRows(intent.bookId).at(-1);
      requireAnalysis(latestRow !== undefined && asString(latestRow.revision_id) === intent.predecessorRevisionId,
        'ANALYSIS_PREDECESSOR_DRIFT', '该任务的前一修订版已不再是结果集的最新修订版；未开始执行。');
      const predecessor = this.#predecessorFacts(predecessorRow);
      const stored = plan['reuse-plan'] as AnalysisReusePlanProjection;
      const rederived = deriveReusePlan({ mode: intent.mode, selectedRange: intent.selectedRange, manifest, predecessor });
      const record = reusePlanRecord(rederived);
      requireAnalysis(record.digest === digests['reuse-plan'] && canonicalJson(stored) === record.json && envelope.reusePlanDigest === record.digest,
        'ANALYSIS_REUSE_PLAN_DRIFT', '重新推导的复用计划与冻结计划不一致；未开始执行。');
      update = {
        mode: intent.mode,
        selectedRange: intent.selectedRange,
        predecessor: {
          revisionId: predecessor.revisionId,
          ordinal: predecessor.ordinal,
          digest: predecessor.digest,
          coverageManifestDigest: predecessor.coverageManifestDigest,
          manifest: predecessor.manifest,
        },
        reusePlan: rederived,
        reusePlanDigest: record.digest,
      };
    }
    return {
      bookId: intent.bookId,
      taskIntentId: intent.taskIntentId,
      runRecordId,
      checkpoint: {
        bookId: intent.bookId,
        manuscriptId: asString(checkpointRow.manuscript_id),
        branchId: asString(checkpointRow.branch_id),
        revisionId: asString(checkpointRow.revision_id),
        revisionLabel: asString(checkpointRow.revision_label),
        revisionDigest: asString(checkpointRow.revision_digest),
        journalSequence: asNumber(checkpointRow.journal_sequence),
        createdForDirtyJournal: asNumber(checkpointRow.created_for_dirty_journal) === 1,
      },
      manifest,
      manifestDigest: manifest.digest,
      planEnvelopeDigest: asString(run.plan_envelope_sha256),
      runSourceScopeDigest: asString(digests['run-source-scope']),
      providerResolutionPlanDigest: asString(digests['provider-resolution-plan']),
      credentialReference: providerPlan.remoteBinding.credentialReference,
      route: this.#route,
      artifactPin: { nativeCarrierSha256: artifactPin.nativeCarrierSha256, sidecarRevision: 2, sidecarSha256: artifactPin.sidecarSha256 },
      promptContractDigest: asString(envelope.promptContractDigest),
      behaviorCompositionDigest: asString(envelope.behaviorCompositionDigest),
      update,
    };
  }

  readRevisionBlocks(manuscriptId: string, revisionId: string): ManifestBlockInput[] {
    requireAnalysis(UUID_PATTERN.test(manuscriptId) && UUID_PATTERN.test(revisionId), 'ANALYSIS_RECORD_INVALID', '修订版身份无效。');
    const rows = this.#db.prepare(
      `SELECT version.block_id, version.position, version.kind, version.level, version.text, version.digest, version.grapheme_length
       FROM manuscript_block_versions version
       JOIN manuscript_blocks block ON block.block_id = version.block_id AND block.manuscript_id = ?
       WHERE version.revision_id = ? ORDER BY version.position`,
    ).all(manuscriptId, revisionId) as SqlRow[];
    return rows.map((row) => this.#blockInput(row));
  }

  /** The current working blocks of one branch: what the next Task Input checkpoint would materialize. */
  readWorkingBlocks(branchId: string): ManifestBlockInput[] {
    requireAnalysis(UUID_PATTERN.test(branchId), 'ANALYSIS_RECORD_INVALID', '分支身份无效。');
    const rows = this.#db.prepare(
      `SELECT block_id, position, kind, level, text, digest, grapheme_length
       FROM working_blocks WHERE branch_id = ? ORDER BY position`,
    ).all(branchId) as SqlRow[];
    return rows.map((row) => this.#blockInput(row));
  }

  #blockInput(row: SqlRow): ManifestBlockInput {
    return {
      blockId: asString(row.block_id),
      position: asNumber(row.position),
      kind: asString(row.kind) as ManifestBlockInput['kind'],
      level: row.level === null ? null : asNumber(row.level),
      text: asString(row.text),
      digest: asString(row.digest),
      graphemes: asNumber(row.grapheme_length),
    };
  }

  /** The closed unit results of one revision, parsed back into contract results for reuse by lineage. */
  loadPredecessorUnitResults(revisionId: string): Map<number, PredecessorUnitResult> {
    requireAnalysis(UUID_PATTERN.test(revisionId), 'ANALYSIS_REVISION_INVALID', '结果集修订版标识无效。');
    const rows = this.#db.prepare("SELECT * FROM analysis_unit_results WHERE revision_id = ? AND state = 'closed' ORDER BY unit_ordinal").all(revisionId) as SqlRow[];
    const results = new Map<number, PredecessorUnitResult>();
    for (const row of rows) {
      const record = parseCanonicalJson(asString(row.canonical_json)) as Record<string, unknown>;
      const unitOrdinal = asNumber(row.unit_ordinal);
      requireAnalysis(record.state === 'closed' && record.unitOrdinal === unitOrdinal, 'ANALYSIS_RECORD_INVALID', '前一修订版的单元结果无效。');
      results.set(unitOrdinal, {
        unitOrdinal,
        requestDigest: asString(record.requestDigest),
        responseDigest: asString(record.responseDigest),
        usage: record.usage as PredecessorUnitResult['usage'],
        result: {
          schema: BASELINE_UNIT_RESULT_SCHEMA,
          unitOrdinal,
          synopsis: record.synopsis as string,
          entities: record.entities as BaselineUnitResult['entities'],
          events: record.events as BaselineUnitResult['events'],
          relationships: record.relationships as BaselineUnitResult['relationships'],
          settingClaims: record.settingClaims as BaselineUnitResult['settingClaims'],
          conflicts: record.conflicts as BaselineUnitResult['conflicts'],
          unresolved: record.unresolved as BaselineUnitResult['unresolved'],
          confidence: record.confidence as BaselineUnitResult['confidence'],
        },
      });
    }
    return results;
  }

  /** The attempt and its Execution Binding are written together, before the first model call. */
  persistAttemptAndBinding(input: {
    runRecordId: string;
    binding: ExecutionBindingRecord;
    credentialReadiness: 'present' | 'missing';
  }): { bindingDigest: string } {
    const startedAt = input.binding.boundAt;
    const attempt = canonicalRecord({
      attemptId: input.binding.attemptId,
      runRecordId: input.runRecordId,
      ordinal: 1,
      startedAt,
      dispatchAttribution: 'Dispatch',
      credentialReadinessCheck: {
        modelRole: 'Main Editorial Role',
        slot: 'deepseek-api-key',
        credentialReference: input.binding.credentialSlot.credentialReference,
        readiness: input.credentialReadiness,
        valueReleased: false,
        checkedAt: startedAt,
      },
    });
    const binding = canonicalRecord(input.binding);
    transact(this.#db, () => {
      this.#db.prepare(
        'INSERT INTO analysis_execution_attempts(attempt_id, run_record_id, ordinal, started_at, canonical_json, sha256) VALUES (?, ?, 1, ?, ?, ?)',
      ).run(input.binding.attemptId, input.runRecordId, startedAt, attempt.json, attempt.digest);
      this.#db.prepare(
        'INSERT INTO analysis_execution_bindings(attempt_id, harness_session_id, bound_at, canonical_json, sha256) VALUES (?, ?, ?, ?, ?)',
      ).run(input.binding.attemptId, input.binding.harnessSessionId, startedAt, binding.json, binding.digest);
    });
    return { bindingDigest: binding.digest };
  }

  recordSpan(attemptId: string, ordinal: number, span: { sessionId: string; startSeq: number; endSeq: number }, unitOrdinal: number | null): void {
    const recordedAt = new Date().toISOString();
    const record = canonicalRecord({ spanId: randomUUID(), attemptId, ordinal, harnessSessionId: span.sessionId, startSeq: span.startSeq, endSeq: span.endSeq, unitOrdinal, recordedAt });
    const spanId = (parseCanonicalJson(record.json) as { spanId: string }).spanId;
    this.#db.prepare(
      `INSERT INTO analysis_harness_spans(span_id, attempt_id, ordinal, harness_session_id, start_seq, end_seq, unit_ordinal, recorded_at, canonical_json, sha256)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(spanId, attemptId, ordinal, span.sessionId, span.startSeq, span.endSeq, unitOrdinal, recordedAt, record.json, record.digest);
  }

  /**
   * Append one immutable Result Set Revision with the next ordinal on the Book's Result Set. A
   * first-baseline revision keeps the `/1` record shape; a successor revision is a `/2` record that
   * adds the update facts (mode, predecessor identity and digest, reuse-plan digest, counts) and the
   * per-unit lineage. The predecessor rows are never touched.
   */
  persistRevision(input: RevisionPersistInput): { resultSetId: string; revisionId: string; ordinal: number; digest: string } {
    const { facts } = input;
    const createdAt = new Date().toISOString();
    return transact(this.#db, () => {
      let resultSetRow = this.#db.prepare('SELECT result_set_id FROM analysis_result_sets WHERE book_id = ? AND kind = ?').get(facts.bookId, BASELINE_ANALYSIS_KIND) as SqlRow | undefined;
      if (resultSetRow === undefined) {
        const resultSetId = randomUUID();
        const record = canonicalRecord({ resultSetId, bookId: facts.bookId, kind: BASELINE_ANALYSIS_KIND, createdAt });
        this.#db.prepare('INSERT INTO analysis_result_sets(result_set_id, book_id, kind, created_at, canonical_json, sha256) VALUES (?, ?, ?, ?, ?, ?)')
          .run(resultSetId, facts.bookId, BASELINE_ANALYSIS_KIND, createdAt, record.json, record.digest);
        resultSetRow = { result_set_id: resultSetId };
      }
      const resultSetId = asString(resultSetRow.result_set_id);
      const ordinalRow = this.#db.prepare('SELECT count(*) total, max(ordinal) latest FROM analysis_result_set_revisions WHERE result_set_id = ?').get(resultSetId) as SqlRow;
      const ordinal = asNumber(ordinalRow.total) + 1;
      if (facts.update !== null) {
        requireAnalysis(asNumber(ordinalRow.latest) === facts.update.predecessor.ordinal && ordinal === facts.update.predecessor.ordinal + 1,
          'ANALYSIS_PREDECESSOR_DRIFT', '前一修订版已不再是结果集的最新修订版；后继修订版未写入。');
      }
      const revisionId = randomUUID();
      const successor = facts.update !== null;
      const unitRecords = input.units.map((unit) => {
        const lineage = successor ? { lineage: unit.lineage } : {};
        const body = unit.closed.state === 'closed'
          ? {
              unitOrdinal: unit.unitOrdinal,
              state: 'closed',
              requestDigest: unit.requestDigest,
              responseDigest: unit.closed.responseDigest,
              usage: unit.closed.usage,
              ...lineage,
              ...(unit.closed.result as Record<string, unknown>),
            }
          : { unitOrdinal: unit.unitOrdinal, state: 'gap', requestDigest: unit.requestDigest, ...lineage, gap: unit.closed.gap };
        return { unitOrdinal: unit.unitOrdinal, state: unit.closed.state, record: canonicalRecord(body) };
      });
      const base = {
        schema: successor ? RESULT_SET_SUCCESSOR_REVISION_SCHEMA : RESULT_SET_REVISION_SCHEMA,
        kind: BASELINE_ANALYSIS_KIND,
        contractVersion: BASELINE_ANALYSIS_CONTRACT_VERSION,
        resultSetId,
        revisionId,
        ordinal,
        createdAt,
        manuscriptPin: {
          bookId: facts.bookId,
          manuscriptId: facts.checkpoint.manuscriptId,
          revisionId: facts.checkpoint.revisionId,
          revisionLabel: facts.checkpoint.revisionLabel,
          revisionDigest: facts.checkpoint.revisionDigest,
        },
        coverageManifestDigest: facts.manifestDigest,
        schemaDigest: SCHEMA_DIGEST,
        reducerDigest: REDUCER_DIGEST,
        adapterPin: { route: LOCAL_DETERMINISTIC_ROUTE, model: LOCAL_DETERMINISTIC_MODEL, fixtureIdentity: facts.route.fixtureIdentity, fixtureSha256: facts.route.fixtureSha256 },
        bindingPin: {
          attemptId: input.attemptId,
          bindingDigest: input.bindingDigest,
          harnessSessionId: input.harnessSessionId,
          behaviorCompositionDigest: facts.behaviorCompositionDigest,
          promptContractDigest: facts.promptContractDigest,
        },
        policyPin: { operationalScope: 'development-ci', providerProcessingVersion: 'v1', activePolicySetVersion: 'v3', liveTransmissions: 0 },
        provenance: { taskIntentId: facts.taskIntentId, runRecordId: facts.runRecordId, attemptId: input.attemptId },
        usage: input.usage,
        coverage: input.reduction.coverage,
        reducerClosure: input.reduction.reducerClosure,
        assurance: input.reduction.assurance,
        gaps: input.reduction.gaps,
        conflicts: input.reduction.conflicts,
        sections: input.reduction.sections,
        synthesis: input.reduction.synthesis,
        unitDigests: unitRecords.map((unit) => ({ unitOrdinal: unit.unitOrdinal, state: unit.state, sha256: unit.record.digest })),
      };
      const body = canonicalRecord(facts.update === null ? base : {
        ...base,
        update: {
          mode: facts.update.mode,
          predecessor: { revisionId: facts.update.predecessor.revisionId, ordinal: facts.update.predecessor.ordinal, digest: facts.update.predecessor.digest },
          reusePlanDigest: facts.update.reusePlanDigest,
          selectedRange: facts.update.selectedRange,
          counts: facts.update.reusePlan.counts,
        },
        lineage: input.units.map((unit) => ({ unitOrdinal: unit.unitOrdinal, ...unit.lineage })),
      });
      this.#db.prepare(
        `INSERT INTO analysis_result_set_revisions(
           revision_id, result_set_id, ordinal, task_intent_id, run_record_id, attempt_id, manuscript_revision_id,
           manuscript_revision_digest, coverage_manifest_sha256, contract_version, created_at, canonical_json, sha256
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(revisionId, resultSetId, ordinal, facts.taskIntentId, facts.runRecordId, input.attemptId, facts.checkpoint.revisionId,
        facts.checkpoint.revisionDigest, facts.manifestDigest, BASELINE_ANALYSIS_CONTRACT_VERSION, createdAt, body.json, body.digest);
      const insertUnit = this.#db.prepare('INSERT INTO analysis_unit_results(revision_id, unit_ordinal, state, canonical_json, sha256) VALUES (?, ?, ?, ?, ?)');
      for (const unit of unitRecords) insertUnit.run(revisionId, unit.unitOrdinal, unit.state, unit.record.json, unit.record.digest);
      return { resultSetId, revisionId, ordinal, digest: body.digest };
    });
  }

  recordOutcome(input: {
    taskIntentId: string;
    runRecordId: string;
    classification: keyof typeof OUTCOME_LABELS;
    resultSetRevisionId: string | null;
    summary: string;
    safeNextAction: string;
  }): void {
    const outcomeId = randomUUID();
    const recordedAt = new Date().toISOString();
    const record = canonicalRecord({
      outcomeId,
      taskIntentId: input.taskIntentId,
      runRecordId: input.runRecordId,
      classification: input.classification,
      resultSetRevisionId: input.resultSetRevisionId,
      summary: input.summary,
      safeNextAction: input.safeNextAction,
      recordedAt,
    });
    this.#db.prepare(
      `INSERT INTO analysis_task_outcomes(outcome_id, task_intent_id, run_record_id, classification, result_set_revision_id, recorded_at, canonical_json, sha256)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(outcomeId, input.taskIntentId, input.runRecordId, input.classification, input.resultSetRevisionId, recordedAt, record.json, record.digest);
  }

  /** Unit request digests for the frozen manifest, in unit order. */
  unitRequestDigests(manifest: CoverageManifestProjection, promptContractDigest: string): string[] {
    return manifest.units.map((unit) => unitRequestDigest(promptContractDigest, unit.ordinal, unit.digest));
  }

  // ---- shared bindings -------------------------------------------------------------------------

  #binding(bookId: string, checkpoint?: ManuscriptCheckpointBinding): {
    manuscriptId: string;
    branchId: string;
    sourceVersionId: string;
    credentialReference: string;
    credentialOperationState: ModelCredentialOperationState;
  } {
    requireAnalysis(UUID_PATTERN.test(bookId), 'ANALYSIS_BOOK_INVALID', '任务所属图书无效。');
    const row = this.#db.prepare(
      `SELECT m.manuscript_id, mb.branch_id, bws.base_revision_id, bws.journal_sequence, bws.working_digest,
              mr.source_version_id, sv.source_digest,
              pin.sidecar_revision, pin.sidecar_sha256, installation.content_sha256 native_carrier_sha256,
              connection.credential_reference, connection.credential_operation_state
       FROM manuscripts m
       JOIN manuscript_branches mb ON mb.manuscript_id = m.manuscript_id
       JOIN branch_working_state bws ON bws.branch_id = mb.branch_id
       JOIN manuscript_revisions mr ON mr.revision_id = ${checkpoint === undefined ? 'bws.base_revision_id' : '?'}
       JOIN source_versions sv ON sv.source_version_id = mr.source_version_id AND sv.book_id = m.book_id
       LEFT JOIN editorial_workspace_profile_book_pins pin ON pin.book_id = m.book_id
         AND pin.native_artifact_id = '@ai7/editorial-workspace-profile'
         AND pin.sidecar_id = 'ai7.editorial-workspace-profile.authority'
       LEFT JOIN native_artifact_installations installation ON installation.artifact_id = pin.native_artifact_id
       LEFT JOIN model_service_connections connection ON connection.connection_id = 'main-editorial-deepseek-v4-pro'
       WHERE m.book_id = ? AND m.role = 'primary'
       ORDER BY pin.sidecar_revision DESC`,
    ).get(...(checkpoint === undefined ? [bookId] : [checkpoint.revisionId, bookId])) as SqlRow | undefined;
    requireAnalysis(row !== undefined && row.source_digest === SAMPLE1_SOURCE_DIGEST,
      'ANALYSIS_LINEAGE_UNAVAILABLE', '当前图书不是精确 sample1 主稿件血缘。');
    requireAnalysis(row.native_carrier_sha256 === NATIVE_CARRIER_DIGEST && row.sidecar_revision === 2 && row.sidecar_sha256 === SIDECAR_DIGEST,
      'ANALYSIS_ARTIFACT_PIN_UNAVAILABLE', '当前图书尚未固定编辑工作区方案 Revision 2。');
    requireAnalysis(typeof row.credential_operation_state === 'string' && typeof row.credential_reference === 'string',
      'ANALYSIS_PROVIDER_BINDING_UNAVAILABLE', '主编辑角色缺少固定的凭据引用元数据。');
    const state = asString(row.credential_operation_state);
    requireAnalysis((state === 'ready' || state === 'missing' || state === 'needs-attention') && UUID_PATTERN.test(asString(row.credential_reference)),
      'ANALYSIS_PROVIDER_BINDING_UNAVAILABLE', '主编辑角色缺少固定的凭据引用元数据。');
    if (checkpoint !== undefined) {
      requireAnalysis(row.manuscript_id === checkpoint.manuscriptId && row.branch_id === checkpoint.branchId &&
        row.base_revision_id === checkpoint.revisionId && row.journal_sequence === checkpoint.journalSequence &&
        row.working_digest === checkpoint.revisionDigest,
      'ANALYSIS_CHECKPOINT_STALE', '任务输入固定点已经变化。');
    }
    return {
      manuscriptId: asString(row.manuscript_id),
      branchId: asString(row.branch_id),
      sourceVersionId: asString(row.source_version_id),
      credentialReference: asString(row.credential_reference),
      credentialOperationState: state,
    };
  }

  #requireDeniedPolicy(policy: LaunchPolicyProjection): void {
    requireAnalysis(policy.integrityState === 'verified' && policy.denialReason === null &&
      policy.operationalScope === 'development-ci' && policy.activePolicySetVersion === 'v3' &&
      policy.providerProcessing.version === 'v1' && policy.providerProcessing.decision === 'deny' &&
      policy.providerProcessing.authorizedLiveTransmissionCount === 0 && policy.providerProcessing.liveTransmissionAllowed === false,
    'ANALYSIS_POLICY_UNAVAILABLE', '无法建立可信的 development-ci Provider Processing v1 拒绝记录。');
  }
}

export { AnalysisError, isRecord };
