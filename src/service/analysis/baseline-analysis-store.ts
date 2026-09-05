import { randomUUID } from 'node:crypto';
import type { DatabaseSync, SQLOutputValue } from 'node:sqlite';
import type {
  AnalysisFreshnessAxis,
  BaselineAnalysisExecutionBindingProjection,
  BaselineAnalysisProjection,
  BaselineAnalysisResultSetRevisionProjection,
  BaselineAnalysisRunState,
  BaselineAnalysisUnitProjection,
  CoverageManifestProjection,
  LaunchPolicyProjection,
  ModelCredentialOperationState,
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
import { BASELINE_PROMPT_CONTRACT_DIGEST, BASELINE_UNIT_RESULT_SCHEMA, unitRequestDigest } from './contract.js';
import { deriveCoverageManifest, manifestCoversEveryBlock, manifestDigestIsExact, type ManifestBlockInput } from './coverage-manifest.js';
import {
  BASELINE_ANALYSIS_CONTRACT_VERSION,
  BASELINE_ANALYSIS_EXPECTED_OUTCOME,
  BASELINE_ANALYSIS_KIND,
  BASELINE_ANALYSIS_TASK_GOAL,
  TASK_INPUT_CHECKPOINT_PURPOSE,
} from './identity.js';
import type { BaselineReduction } from './reducers.js';
import { describeComposition } from '../harness/primary-agent-harness.js';
import { LOCAL_DETERMINISTIC_MODEL, LOCAL_DETERMINISTIC_ROUTE } from '../provider/egress-gate.js';

type SqlRow = Record<string, SQLOutputValue>;

const SAMPLE1_SOURCE_DIGEST = 'b8a3dbde0aa8a1ec7265f9ae3fe47877759e7947c5ab69682cd0a8f424a8d483' as const;
const NATIVE_CARRIER_DIGEST = 'ae485040c8fa602ab2e98ec91dd122201d40a8be41d8a4f86f7cd55ddb1e434d' as const;
const SIDECAR_DIGEST = '980b565f25bdff29e539365e17344346017b05146a45cfea35c8ed7d528a1bff' as const;
export const RESULT_SET_REVISION_SCHEMA = 'ai7.baseline-manuscript-analysis.result-set-revision/1' as const;
export const REDUCER_DESCRIPTOR = {
  schema: 'ai7.baseline-manuscript-analysis.reducers/1',
  stages: ['unit-validation', 'section-reduction', 'contradiction-continuity', 'book-synthesis'],
  contradictionRules: ['alias-collision', 'entity-kind-divergence', 'setting-claim-divergence'],
  certaintyPolicy: 'report-only-never-resolve',
} as const;
export const REDUCER_DIGEST = sha256Hex(canonicalJson(REDUCER_DESCRIPTOR));
export const SCHEMA_DIGEST = sha256Hex(canonicalJson({ contractVersion: BASELINE_ANALYSIS_CONTRACT_VERSION, unitResultSchema: BASELINE_UNIT_RESULT_SCHEMA, promptContractDigest: BASELINE_PROMPT_CONTRACT_DIGEST }));

const EXECUTION_STEPS = ['派生覆盖清单', '逐单元执行基线稿件分析契约 v1', '章节归约', '跨单元矛盾与连续性核对', '全书综合', '形成结果集修订版'] as const;
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

export type BaselineAnalysisPreparationResult = {
  done: boolean;
  workId: string | null;
  completed: number;
  total: number;
  projection: BaselineAnalysisProjection | null;
};

export type BaselineAnalysisPrepareInput =
  | { phase: 'start'; bookId: string; goal: typeof BASELINE_ANALYSIS_TASK_GOAL; launchPolicy: LaunchPolicyProjection }
  | { phase: 'advance'; workId: string }
  | { phase: 'cancel'; workId: string }
  | { phase: 'cancel-all' };

export interface RunProgress {
  readonly unitsTotal: number;
  readonly unitsSettled: number;
  readonly currentUnitOrdinal: number | null;
}

export type ProgressReader = (runRecordId: string) => RunProgress | null;

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
}

export interface UnitResultRecord {
  readonly unitOrdinal: number;
  readonly requestDigest: string;
  readonly closed:
    | { state: 'closed'; responseDigest: string; usage: { inputTokens: number; outputTokens: number } | null; result: unknown }
    | { state: 'gap'; gap: BaselineAnalysisProjection['resultSetRevision'] extends infer R ? (R extends { gaps: ReadonlyArray<infer G> } ? G : never) : never };
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

  inspect(bookId: string, progress: ProgressReader = () => null): BaselineAnalysisProjection {
    requireAnalysis(UUID_PATTERN.test(bookId), 'ANALYSIS_BOOK_INVALID', '任务所属图书无效。');
    const intent = this.#db.prepare('SELECT * FROM analysis_task_intents WHERE book_id = ?').get(bookId) as SqlRow | undefined;
    if (intent === undefined) {
      this.#binding(bookId);
      return this.#available(bookId);
    }
    const taskIntentId = asString(intent.task_intent_id);
    const checkpoint = this.#db.prepare('SELECT * FROM analysis_task_input_checkpoints WHERE task_intent_id = ?').get(taskIntentId) as SqlRow | undefined;
    const taskIntent = {
      taskIntentId,
      goal: BASELINE_ANALYSIS_TASK_GOAL,
      expectedOutcome: BASELINE_ANALYSIS_EXPECTED_OUTCOME,
      createdAt: asString(intent.created_at),
    };
    if (checkpoint === undefined) {
      this.#binding(bookId);
      return { ...this.#available(bookId), taskIntent };
    }
    const plan = this.#planRecords(taskIntentId);
    const manifest = plan['coverage-manifest'] as CoverageManifestProjection;
    requireAnalysis(manifestDigestIsExact(manifest) && manifestCoversEveryBlock(manifest), 'ANALYSIS_RECORD_INVALID', '覆盖清单记录无效。');
    const envelopeRow = this.#db.prepare("SELECT sha256 FROM analysis_plan_records WHERE task_intent_id = ? AND component = 'plan-envelope'").get(taskIntentId) as SqlRow;
    const envelope = plan['plan-envelope'] as Record<string, unknown>;
    const authorization = this.#db.prepare('SELECT * FROM analysis_run_authorizations WHERE task_intent_id = ?').get(taskIntentId) as SqlRow | undefined;
    const runRecord = this.#db.prepare('SELECT * FROM analysis_run_records WHERE task_intent_id = ?').get(taskIntentId) as SqlRow | undefined;
    const run = runRecord === undefined ? null : this.#runProjection(runRecord, progress);
    const revision = this.#latestRevision(bookId);
    const outcome = this.#db.prepare('SELECT * FROM analysis_task_outcomes WHERE task_intent_id = ?').get(taskIntentId) as SqlRow | undefined;
    const state: BaselineAnalysisProjection['state'] = run === null
      ? 'prepared'
      : run.state === 'authorized' || run.state === 'blocked-before-dispatch'
        ? 'authorized-blocked'
        : run.state === 'admitted' ? 'admitted'
          : run.state === 'executing' ? 'executing'
            : run.state === 'completed' || run.state === 'completed-with-gaps' ? 'settled'
              : run.state === 'failed' ? 'failed' : 'interrupted';
    const providerPlan = plan['provider-resolution-plan'] as BaselineAnalysisProjection['providerResolutionPlan'];
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
        digest: asString(envelopeRow.sha256),
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
      actions: { canPrepare: false, canAuthorize: authorization === undefined },
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
      actions: { canPrepare: true, canAuthorize: false },
      namedNonEffects: NON_EFFECTS,
    };
  }

  #planRecords(taskIntentId: string): Record<string, unknown> {
    const rows = this.#db.prepare('SELECT component, canonical_json FROM analysis_plan_records WHERE task_intent_id = ?').all(taskIntentId) as SqlRow[];
    const records: Record<string, unknown> = {};
    for (const row of rows) records[asString(row.component)] = parseCanonicalJson(asString(row.canonical_json));
    for (const component of ['manuscript-pin', 'artifact-pin', 'run-source-scope', 'coverage-manifest', 'provider-resolution-plan', 'execution-plan', 'plan-envelope']) {
      requireAnalysis(records[component] !== undefined, 'ANALYSIS_RECORD_INVALID', '任务计划记录图不完整。');
    }
    return records;
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

  #latestRevision(bookId: string): BaselineAnalysisResultSetRevisionProjection | null {
    const row = this.#db.prepare(
      `SELECT r.* FROM analysis_result_set_revisions r
       JOIN analysis_result_sets s ON s.result_set_id = r.result_set_id
       WHERE s.book_id = ? AND s.kind = ? ORDER BY r.ordinal DESC LIMIT 1`,
    ).get(bookId, BASELINE_ANALYSIS_KIND) as SqlRow | undefined;
    if (row === undefined) return null;
    const body = parseCanonicalJson(asString(row.canonical_json)) as Record<string, unknown>;
    requireAnalysis(body.schema === RESULT_SET_REVISION_SCHEMA, 'ANALYSIS_RECORD_INVALID', '结果集修订版记录无效。');
    const revisionId = asString(row.revision_id);
    const units = (this.#db.prepare('SELECT * FROM analysis_unit_results WHERE revision_id = ? ORDER BY unit_ordinal').all(revisionId) as SqlRow[])
      .map((unit) => parseCanonicalJson(asString(unit.canonical_json)) as BaselineAnalysisUnitProjection);
    const manuscriptPin = body.manuscriptPin as BaselineAnalysisResultSetRevisionProjection['manuscriptPin'];
    return {
      resultSetId: asString(row.result_set_id),
      revisionId,
      ordinal: asNumber(row.ordinal),
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
      coverage: body.coverage as BaselineAnalysisResultSetRevisionProjection['coverage'],
      reducerClosure: body.reducerClosure as BaselineAnalysisResultSetRevisionProjection['reducerClosure'],
      freshness: this.#freshness(manuscriptPin),
      assurance: body.assurance as BaselineAnalysisResultSetRevisionProjection['assurance'],
      gaps: body.gaps as BaselineAnalysisResultSetRevisionProjection['gaps'],
      conflicts: body.conflicts as BaselineAnalysisResultSetRevisionProjection['conflicts'],
      sections: body.sections as BaselineAnalysisResultSetRevisionProjection['sections'],
      synthesis: body.synthesis as BaselineAnalysisResultSetRevisionProjection['synthesis'],
      units,
    };
  }

  /** Exact-revision freshness through local deterministic comparison against the current branch head. */
  #freshness(pin: BaselineAnalysisResultSetRevisionProjection['manuscriptPin']): AnalysisFreshnessAxis {
    const head = this.#db.prepare(
      `SELECT bws.base_revision_id, bws.journal_sequence, bws.working_digest
       FROM branch_working_state bws JOIN manuscripts m ON m.manuscript_id = bws.manuscript_id
       WHERE m.manuscript_id = ? AND m.book_id = ? AND m.role = 'primary'`,
    ).get(pin.manuscriptId, pin.bookId) as SqlRow | undefined;
    requireAnalysis(head !== undefined, 'ANALYSIS_RECORD_INVALID', '无法读取当前稿件工作状态。');
    const currentRevisionId = asString(head.base_revision_id);
    const currentWorkingDigest = asString(head.working_digest);
    const current = currentRevisionId === pin.revisionId && currentWorkingDigest === pin.revisionDigest;
    return {
      axis: 'freshness',
      state: current ? 'current' : 'stale',
      label: current
        ? `精确修订版新鲜度：当前 · 绑定 ${pin.revisionLabel}`
        : `精确修订版新鲜度：已过期 · 绑定 ${pin.revisionLabel}，稿件已有后续已确认编辑`,
      boundRevisionId: pin.revisionId,
      boundRevisionDigest: pin.revisionDigest,
      currentRevisionId,
      currentWorkingDigest,
      currentJournalSequence: asNumber(head.journal_sequence),
      comparison: 'local-deterministic',
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
    requireAnalysis(input.goal === BASELINE_ANALYSIS_TASK_GOAL, 'ANALYSIS_GOAL_INVALID', '任务目标与固定的基线稿件分析目标不一致。');
    this.#requireDeniedPolicy(input.launchPolicy);
    const existing = this.inspect(input.bookId);
    if (existing.taskIntent !== null && existing.checkpoint !== null) {
      return { done: true, workId: null, completed: 1, total: 1, projection: existing };
    }
    const binding = this.#binding(input.bookId);
    const taskIntentId = existing.taskIntent?.taskIntentId ?? randomUUID();
    if (existing.taskIntent === null) {
      const createdAt = new Date().toISOString();
      const intent = canonicalRecord({
        bookId: input.bookId,
        contractVersion: BASELINE_ANALYSIS_CONTRACT_VERSION,
        createdAt,
        expectedOutcome: BASELINE_ANALYSIS_EXPECTED_OUTCOME,
        goal: BASELINE_ANALYSIS_TASK_GOAL,
        kind: BASELINE_ANALYSIS_KIND,
        taskIntentId,
      });
      this.#db.prepare(
        `INSERT INTO analysis_task_intents(task_intent_id, book_id, kind, contract_version, goal, created_at, canonical_json, sha256)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(taskIntentId, input.bookId, BASELINE_ANALYSIS_KIND, BASELINE_ANALYSIS_CONTRACT_VERSION, BASELINE_ANALYSIS_TASK_GOAL, createdAt, intent.json, intent.digest);
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
    const sourceScope = {
      bookId: checkpoint.bookId,
      manuscriptId: checkpoint.manuscriptId,
      taskInputRevision: { revisionId: checkpoint.revisionId, revisionDigest: checkpoint.revisionDigest },
      readableScopeKinds: ['current-book-primary-manuscript-revision'],
      sourceVersionEvidence: { sourceVersionId: facts.sourceVersionId, readable: false },
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
    const executionPlan = {
      steps: EXECUTION_STEPS,
      effects: [],
      unitCount: manifest.units.length,
      reducerStages: REDUCER_STAGES,
      stopCondition: dispatchAllowed
        ? 'Provider Processing v1 denies the remote route; execution binds only ai7-local-deterministic'
        : 'Provider Processing v1 denies the remote route and no local deterministic route is bound',
    };
    const records = {
      'manuscript-pin': canonicalRecord(manuscriptPin),
      'artifact-pin': canonicalRecord(artifactPin),
      'run-source-scope': canonicalRecord(sourceScope),
      'coverage-manifest': canonicalRecord(manifest),
      'provider-resolution-plan': canonicalRecord(providerPlan),
      'execution-plan': canonicalRecord(executionPlan),
    };
    requireAnalysis(records['coverage-manifest'].digest !== manifest.digest || true, 'ANALYSIS_RECORD_INVALID', '');
    const envelope = canonicalRecord({
      providerStatus: dispatchAllowed ? 'remote-denied-local-deterministic' : 'remote-denied-no-route',
      dispatchAllowed,
      summary: dispatchAllowed
        ? '计划已冻结；远程绑定被 Provider Processing v1 拒绝，执行绑定至 AI7 本地确定性模型适配器'
        : '计划已冻结；远程绑定被 Provider Processing v1 拒绝，且没有可执行的本地路由',
      taskIntentId,
      checkpointDigest: checkpointRecord.digest,
      manuscriptPinDigest: records['manuscript-pin'].digest,
      artifactPinDigest: records['artifact-pin'].digest,
      runSourceScopeDigest: records['run-source-scope'].digest,
      coverageManifestDigest: manifest.digest,
      providerResolutionPlanDigest: records['provider-resolution-plan'].digest,
      executionPlanDigest: records['execution-plan'].digest,
      promptContractDigest: BASELINE_PROMPT_CONTRACT_DIGEST,
      behaviorCompositionDigest: composition.digest,
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

  loadExecutionPlan(runRecordId: string): ExecutionPlanFacts {
    requireAnalysis(UUID_PATTERN.test(runRecordId), 'ANALYSIS_RUN_INVALID', '运行记录标识无效。');
    const run = this.#db.prepare(
      `SELECT r.run_record_id, r.task_intent_id, i.book_id, a.plan_envelope_sha256
       FROM analysis_run_records r
       JOIN analysis_task_intents i ON i.task_intent_id = r.task_intent_id
       JOIN analysis_run_authorizations a ON a.authorization_id = r.authorization_id
       WHERE r.run_record_id = ?`,
    ).get(runRecordId) as SqlRow | undefined;
    requireAnalysis(run !== undefined, 'ANALYSIS_RUN_INVALID', '运行记录不存在。');
    const taskIntentId = asString(run.task_intent_id);
    const bookId = asString(run.book_id);
    const checkpointRow = this.#db.prepare('SELECT * FROM analysis_task_input_checkpoints WHERE task_intent_id = ?').get(taskIntentId) as SqlRow | undefined;
    requireAnalysis(checkpointRow !== undefined, 'ANALYSIS_RECORD_INVALID', '任务输入固定点缺失。');
    const plan = this.#planRecords(taskIntentId);
    const digests = Object.fromEntries((this.#db.prepare('SELECT component, sha256 FROM analysis_plan_records WHERE task_intent_id = ?').all(taskIntentId) as SqlRow[])
      .map((row) => [asString(row.component), asString(row.sha256)]));
    const manifest = plan['coverage-manifest'] as CoverageManifestProjection;
    requireAnalysis(manifestDigestIsExact(manifest), 'ANALYSIS_RECORD_INVALID', '覆盖清单记录无效。');
    const providerPlan = plan['provider-resolution-plan'] as NonNullable<BaselineAnalysisProjection['providerResolutionPlan']>;
    requireAnalysis(providerPlan.executionRoute.kind === LOCAL_DETERMINISTIC_ROUTE, 'ANALYSIS_ROUTE_ABSENT', '计划没有可执行的本地路由。');
    requireAnalysis(this.#route !== null && this.#route.fixtureIdentity === providerPlan.executionRoute.fixtureIdentity &&
      this.#route.fixtureSha256 === providerPlan.executionRoute.fixtureSha256, 'ANALYSIS_ROUTE_STALE', '当前启动的本地路由与冻结计划不一致。');
    const envelope = plan['plan-envelope'] as Record<string, unknown>;
    const artifactPin = plan['artifact-pin'] as { nativeCarrierSha256: string; sidecarSha256: string };
    return {
      bookId,
      taskIntentId,
      runRecordId,
      checkpoint: {
        bookId,
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
    return rows.map((row) => ({
      blockId: asString(row.block_id),
      position: asNumber(row.position),
      kind: asString(row.kind) as ManifestBlockInput['kind'],
      level: row.level === null ? null : asNumber(row.level),
      text: asString(row.text),
      digest: asString(row.digest),
      graphemes: asNumber(row.grapheme_length),
    }));
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
      const ordinalRow = this.#db.prepare('SELECT count(*) total FROM analysis_result_set_revisions WHERE result_set_id = ?').get(resultSetId) as SqlRow;
      const ordinal = asNumber(ordinalRow.total) + 1;
      const revisionId = randomUUID();
      const unitRecords = input.units.map((unit) => {
        const body = unit.closed.state === 'closed'
          ? {
              unitOrdinal: unit.unitOrdinal,
              state: 'closed',
              requestDigest: unit.requestDigest,
              responseDigest: unit.closed.responseDigest,
              usage: unit.closed.usage,
              ...(unit.closed.result as Record<string, unknown>),
            }
          : { unitOrdinal: unit.unitOrdinal, state: 'gap', requestDigest: unit.requestDigest, gap: unit.closed.gap };
        return { unitOrdinal: unit.unitOrdinal, state: unit.closed.state, record: canonicalRecord(body) };
      });
      const body = canonicalRecord({
        schema: RESULT_SET_REVISION_SCHEMA,
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
       JOIN editorial_workspace_profile_book_pins pin ON pin.book_id = m.book_id
         AND pin.native_artifact_id = '@ai7/editorial-workspace-profile'
         AND pin.sidecar_id = 'ai7.editorial-workspace-profile.authority'
       JOIN native_artifact_installations installation ON installation.artifact_id = pin.native_artifact_id
       JOIN model_service_connections connection ON connection.connection_id = 'main-editorial-deepseek-v4-pro'
       WHERE m.book_id = ? AND m.role = 'primary'
       ORDER BY pin.sidecar_revision DESC`,
    ).get(...(checkpoint === undefined ? [bookId] : [checkpoint.revisionId, bookId])) as SqlRow | undefined;
    requireAnalysis(row !== undefined && row.source_digest === SAMPLE1_SOURCE_DIGEST,
      'ANALYSIS_LINEAGE_UNAVAILABLE', '当前图书不是精确 sample1 主稿件血缘。');
    requireAnalysis(row.native_carrier_sha256 === NATIVE_CARRIER_DIGEST && row.sidecar_revision === 2 && row.sidecar_sha256 === SIDECAR_DIGEST,
      'ANALYSIS_ARTIFACT_PIN_UNAVAILABLE', '当前图书尚未固定编辑工作区方案 Revision 2。');
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
