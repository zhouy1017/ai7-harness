import { createHash, randomUUID } from 'node:crypto';
import { DatabaseSync, type SQLOutputValue } from 'node:sqlite';
import {
  J03_TASK_GOAL,
  type LaunchPolicyProjection,
  type TaskAuthorizationProjection,
} from '../shared/protocol.js';

const PREDECESSOR_SCHEMA_VERSION = 13;
export const TASK_AUTHORIZATION_SCHEMA_VERSION = 14;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DIGEST_PATTERN = /^[0-9a-f]{64}$/;
const SAMPLE1_SOURCE_DIGEST = 'b8a3dbde0aa8a1ec7265f9ae3fe47877759e7947c5ab69682cd0a8f424a8d483' as const;
const SIDECAR_DIGEST = '980b565f25bdff29e539365e17344346017b05146a45cfea35c8ed7d528a1bff' as const;
const EXPECTED_OUTCOME = '供编辑复核的结构与叙事连贯性重点清单' as const;
const CHECKPOINT_PURPOSE = 'Task Input / 任务输入' as const;
type CheckpointPurpose = typeof CHECKPOINT_PURPOSE | 'Reimport Safety / 重新导入安全固定点';
const NON_EFFECTS = [
  '不派发调度器任务',
  '不创建 DSH Session',
  '不读取或解析凭据',
  '不构造 Provider payload',
  '不访问网络或调用 Provider',
  '不创建或执行 Effect',
] as const;

type SqlRow = Record<string, SQLOutputValue>;

export const TASK_AUTHORIZATION_SCHEMA_SQL = {
  task_intents: `CREATE TABLE task_intents (
    task_intent_id TEXT PRIMARY KEY,
    book_id TEXT NOT NULL UNIQUE REFERENCES books(book_id),
    goal TEXT NOT NULL CHECK(goal = '${J03_TASK_GOAL}'),
    expected_outcome TEXT NOT NULL CHECK(expected_outcome = '${EXPECTED_OUTCOME}'),
    created_at TEXT NOT NULL,
    canonical_json TEXT NOT NULL,
    sha256 TEXT NOT NULL UNIQUE CHECK(length(sha256) = 64)
  ) STRICT`,
  task_input_checkpoints: `CREATE TABLE task_input_checkpoints (
    task_intent_id TEXT PRIMARY KEY REFERENCES task_intents(task_intent_id),
    manuscript_id TEXT NOT NULL REFERENCES manuscripts(manuscript_id),
    branch_id TEXT NOT NULL REFERENCES manuscript_branches(branch_id),
    revision_id TEXT NOT NULL REFERENCES manuscript_revisions(revision_id),
    revision_label TEXT NOT NULL,
    revision_digest TEXT NOT NULL CHECK(length(revision_digest) = 64),
    journal_sequence INTEGER NOT NULL CHECK(journal_sequence >= 0),
    purpose TEXT NOT NULL CHECK(purpose = '${CHECKPOINT_PURPOSE}'),
    created_for_dirty_journal INTEGER NOT NULL CHECK(created_for_dirty_journal IN (0, 1)),
    canonical_json TEXT NOT NULL,
    sha256 TEXT NOT NULL UNIQUE CHECK(length(sha256) = 64),
    created_at TEXT NOT NULL
  ) STRICT`,
  task_manuscript_pins: `CREATE TABLE task_manuscript_pins (
    task_intent_id TEXT PRIMARY KEY REFERENCES task_intents(task_intent_id),
    canonical_json TEXT NOT NULL,
    sha256 TEXT NOT NULL UNIQUE CHECK(length(sha256) = 64),
    created_at TEXT NOT NULL
  ) STRICT`,
  task_artifact_pins: `CREATE TABLE task_artifact_pins (
    task_intent_id TEXT PRIMARY KEY REFERENCES task_intents(task_intent_id),
    canonical_json TEXT NOT NULL,
    sha256 TEXT NOT NULL UNIQUE CHECK(length(sha256) = 64),
    created_at TEXT NOT NULL
  ) STRICT`,
  run_source_scopes: `CREATE TABLE run_source_scopes (
    task_intent_id TEXT PRIMARY KEY REFERENCES task_intents(task_intent_id),
    canonical_json TEXT NOT NULL,
    sha256 TEXT NOT NULL UNIQUE CHECK(length(sha256) = 64),
    created_at TEXT NOT NULL
  ) STRICT`,
  provider_resolution_plans: `CREATE TABLE provider_resolution_plans (
    task_intent_id TEXT PRIMARY KEY REFERENCES task_intents(task_intent_id),
    canonical_json TEXT NOT NULL,
    sha256 TEXT NOT NULL UNIQUE CHECK(length(sha256) = 64),
    created_at TEXT NOT NULL
  ) STRICT`,
  execution_plans: `CREATE TABLE execution_plans (
    task_intent_id TEXT PRIMARY KEY REFERENCES task_intents(task_intent_id),
    canonical_json TEXT NOT NULL,
    sha256 TEXT NOT NULL UNIQUE CHECK(length(sha256) = 64),
    created_at TEXT NOT NULL
  ) STRICT`,
  plan_envelopes: `CREATE TABLE plan_envelopes (
    task_intent_id TEXT PRIMARY KEY REFERENCES task_intents(task_intent_id),
    canonical_json TEXT NOT NULL,
    sha256 TEXT NOT NULL UNIQUE CHECK(length(sha256) = 64),
    created_at TEXT NOT NULL
  ) STRICT`,
  run_authorizations: `CREATE TABLE run_authorizations (
    authorization_id TEXT PRIMARY KEY,
    task_intent_id TEXT NOT NULL UNIQUE REFERENCES task_intents(task_intent_id),
    plan_envelope_sha256 TEXT NOT NULL REFERENCES plan_envelopes(sha256),
    origin TEXT NOT NULL CHECK(origin = 'standard-direct'),
    authorized_at TEXT NOT NULL,
    canonical_json TEXT NOT NULL,
    sha256 TEXT NOT NULL UNIQUE CHECK(length(sha256) = 64)
  ) STRICT`,
  run_records: `CREATE TABLE run_records (
    run_record_id TEXT PRIMARY KEY,
    task_intent_id TEXT NOT NULL UNIQUE REFERENCES task_intents(task_intent_id),
    authorization_id TEXT NOT NULL UNIQUE REFERENCES run_authorizations(authorization_id),
    state TEXT NOT NULL CHECK(state = 'recorded-not-dispatched'),
    dispatched INTEGER NOT NULL CHECK(dispatched = 0),
    recorded_at TEXT NOT NULL,
    canonical_json TEXT NOT NULL,
    sha256 TEXT NOT NULL UNIQUE CHECK(length(sha256) = 64)
  ) STRICT`,
} as const;

const IMMUTABLE_TABLES = Object.keys(TASK_AUTHORIZATION_SCHEMA_SQL);
export const TASK_AUTHORIZATION_TRIGGER_SQL = Object.fromEntries(IMMUTABLE_TABLES.flatMap((table) => [
  [`${table}_no_update`, `CREATE TRIGGER ${table}_no_update
    BEFORE UPDATE ON ${table}
    BEGIN
      SELECT RAISE(ABORT, 'TASK_LEDGER_IMMUTABLE');
    END`],
  [`${table}_no_delete`, `CREATE TRIGGER ${table}_no_delete
    BEFORE DELETE ON ${table}
    BEGIN
      SELECT RAISE(ABORT, 'TASK_LEDGER_IMMUTABLE');
    END`],
])) as Readonly<Record<string, string>>;

export class TaskAuthorizationError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'TaskAuthorizationError';
  }
}

function requireTask(condition: unknown, code: string, message: string): asserts condition {
  if (!condition) throw new TaskAuthorizationError(code, message);
}

function asString(value: unknown): string {
  requireTask(typeof value === 'string', 'TASK_RECORD_INVALID', '任务授权记录字段无效。');
  return value;
}

function asNumber(value: unknown): number {
  requireTask(typeof value === 'number' && Number.isSafeInteger(value), 'TASK_RECORD_INVALID', '任务授权记录数值无效。');
  return value;
}

function canonicalJson(value: unknown): string {
  if (typeof value === 'string') requireTask(value.isWellFormed(), 'TASK_CANONICAL_INVALID', '任务授权记录无法规范化。');
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(',')}}`;
  }
  const encoded = JSON.stringify(value);
  requireTask(encoded !== undefined, 'TASK_CANONICAL_INVALID', '任务授权记录无法规范化。');
  return encoded;
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function canonicalRecord(value: unknown): { json: string; digest: string } {
  const json = canonicalJson(value);
  return { json, digest: sha256(json) };
}

function parseCanonicalJson(value: unknown): unknown {
  const json = asString(value);
  let parsed: unknown;
  try {
    parsed = JSON.parse(json) as unknown;
  } catch {
    throw new TaskAuthorizationError('TASK_RECORD_INVALID', '任务授权记录不是有效 JSON。');
  }
  requireTask(canonicalJson(parsed) === json, 'TASK_RECORD_INVALID', '任务授权记录不是规范 JSON。');
  return parsed;
}

function isCanonicalInstant(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) && new Date(milliseconds).toISOString() === value;
}

function normalizeSql(value: string): string {
  return value.trim().replace(/\s+/gu, ' ');
}

function transact<T>(db: DatabaseSync, body: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = body();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch (rollbackError) {
      throw new AggregateError([error, rollbackError], 'Task authorization transaction rollback failed.');
    }
    throw error;
  }
}

function validateStoredCanonicalRows(db: DatabaseSync): void {
  for (const table of IMMUTABLE_TABLES) {
    const rows = db.prepare(`SELECT canonical_json, sha256 FROM ${table}`).all() as SqlRow[];
    for (const row of rows) {
      const json = asString(row.canonical_json);
      requireTask(DIGEST_PATTERN.test(asString(row.sha256)) && sha256(json) === row.sha256,
        'TASK_RECORD_INVALID', '任务授权记录摘要不一致。');
      parseCanonicalJson(json);
    }
  }
  const rows = db.prepare(
    `SELECT ti.task_intent_id, ti.book_id, ti.goal, ti.expected_outcome, ti.created_at,
            ti.canonical_json intent_json,
            cp.task_intent_id checkpoint_id, cp.manuscript_id, cp.branch_id, cp.revision_id,
            cp.revision_label, cp.revision_digest, cp.journal_sequence, cp.purpose,
            cp.created_for_dirty_journal, cp.canonical_json checkpoint_json, cp.sha256 checkpoint_sha256,
            mp.task_intent_id manuscript_pin_id, mp.canonical_json manuscript_pin_json, mp.sha256 manuscript_pin_sha256,
            ap.task_intent_id artifact_pin_id, ap.canonical_json artifact_pin_json, ap.sha256 artifact_pin_sha256,
            rs.task_intent_id source_scope_id, rs.canonical_json source_scope_json, rs.sha256 source_scope_sha256,
            pp.task_intent_id provider_plan_id, pp.canonical_json provider_plan_json, pp.sha256 provider_plan_sha256,
            ep.task_intent_id execution_plan_id, ep.canonical_json execution_plan_json, ep.sha256 execution_plan_sha256,
            pe.task_intent_id envelope_id, pe.canonical_json envelope_json, pe.sha256 envelope_sha256,
            mr.revision_id joined_revision_id, mr.revision_digest joined_revision_digest,
            mr.source_version_id, sv.source_digest, m.manuscript_id joined_manuscript_id,
            mb.branch_id joined_branch_id, pin.book_id artifact_pin_book_id,
            connection.credential_reference,
            ra.task_intent_id authorization_task_id, ra.authorization_id, ra.plan_envelope_sha256,
            ra.origin, ra.authorized_at, ra.canonical_json authorization_json,
            rr.task_intent_id run_task_id, rr.run_record_id, rr.authorization_id run_authorization_id,
            rr.state, rr.dispatched, rr.recorded_at, rr.canonical_json run_json
     FROM task_intents ti
     LEFT JOIN task_input_checkpoints cp ON cp.task_intent_id = ti.task_intent_id
     LEFT JOIN task_manuscript_pins mp ON mp.task_intent_id = ti.task_intent_id
     LEFT JOIN task_artifact_pins ap ON ap.task_intent_id = ti.task_intent_id
     LEFT JOIN run_source_scopes rs ON rs.task_intent_id = ti.task_intent_id
     LEFT JOIN provider_resolution_plans pp ON pp.task_intent_id = ti.task_intent_id
     LEFT JOIN execution_plans ep ON ep.task_intent_id = ti.task_intent_id
     LEFT JOIN plan_envelopes pe ON pe.task_intent_id = ti.task_intent_id
     LEFT JOIN run_authorizations ra ON ra.task_intent_id = ti.task_intent_id
     LEFT JOIN run_records rr ON rr.task_intent_id = ti.task_intent_id
     LEFT JOIN manuscripts m ON m.manuscript_id = cp.manuscript_id AND m.book_id = ti.book_id AND m.role = 'primary'
     LEFT JOIN manuscript_branches mb ON mb.branch_id = cp.branch_id AND mb.manuscript_id = m.manuscript_id
     LEFT JOIN manuscript_revisions mr ON mr.revision_id = cp.revision_id
       AND mr.manuscript_id = m.manuscript_id AND mr.branch_id = mb.branch_id
     LEFT JOIN source_versions sv ON sv.source_version_id = mr.source_version_id
       AND sv.book_id = ti.book_id
     LEFT JOIN editorial_workspace_profile_book_pins pin ON pin.book_id = ti.book_id
       AND pin.native_artifact_id = '@ai7/editorial-workspace-profile'
       AND pin.sidecar_id = 'ai7.editorial-workspace-profile.authority'
       AND pin.sidecar_revision = 2 AND pin.sidecar_sha256 = '${SIDECAR_DIGEST}'
     LEFT JOIN model_service_connections connection
       ON connection.connection_id = 'main-editorial-deepseek-v4-pro'`,
  ).all() as SqlRow[];
  for (const row of rows) {
    const taskIntentId = asString(row.task_intent_id);
    const bookId = asString(row.book_id);
    const createdAt = asString(row.created_at);
    requireTask(UUID_PATTERN.test(taskIntentId) && UUID_PATTERN.test(bookId) &&
      row.goal === J03_TASK_GOAL && row.expected_outcome === EXPECTED_OUTCOME && isCanonicalInstant(createdAt) &&
      row.intent_json === canonicalJson({
        bookId,
        createdAt,
        expectedOutcome: EXPECTED_OUTCOME,
        goal: J03_TASK_GOAL,
        taskIntentId,
      }), 'TASK_RECORD_INVALID', '任务意图记录无效。');
    const prepared = row.checkpoint_id !== null;
    const graph = ['manuscript_pin_id', 'artifact_pin_id', 'source_scope_id', 'provider_plan_id', 'execution_plan_id', 'envelope_id'];
    requireTask(graph.every((key) => (row[key] !== null) === prepared), 'TASK_RECORD_INVALID', '任务计划记录图不完整。');
    if (prepared) {
      const manuscriptId = asString(row.manuscript_id);
      const branchId = asString(row.branch_id);
      const revisionId = asString(row.revision_id);
      const revisionLabel = asString(row.revision_label);
      const revisionDigest = asString(row.revision_digest);
      const journalSequence = asNumber(row.journal_sequence);
      const createdForDirtyJournal = asNumber(row.created_for_dirty_journal);
      const sourceVersionId = asString(row.source_version_id);
      const credentialReference = asString(row.credential_reference);
      requireTask(
        row.checkpoint_id === taskIntentId && UUID_PATTERN.test(manuscriptId) && UUID_PATTERN.test(branchId) &&
        UUID_PATTERN.test(revisionId) && /^r[1-9][0-9]*$/.test(revisionLabel) && DIGEST_PATTERN.test(revisionDigest) &&
        journalSequence >= 0 && (createdForDirtyJournal === 0 || createdForDirtyJournal === 1) &&
        row.purpose === CHECKPOINT_PURPOSE && row.joined_manuscript_id === manuscriptId &&
        row.joined_branch_id === branchId && row.joined_revision_id === revisionId &&
        row.joined_revision_digest === revisionDigest && UUID_PATTERN.test(sourceVersionId) &&
        row.source_digest === SAMPLE1_SOURCE_DIGEST && row.artifact_pin_book_id === bookId &&
        UUID_PATTERN.test(credentialReference),
        'TASK_RECORD_INVALID',
        '任务计划所固定的输入、构件或本地绑定无效。',
      );
      requireTask(row.checkpoint_json === canonicalJson({
        branchId,
        createdForDirtyJournal: createdForDirtyJournal === 1,
        journalSequence,
        manuscriptId,
        purpose: CHECKPOINT_PURPOSE,
        revisionDigest,
        revisionId,
        revisionLabel,
        taskIntentId,
      }), 'TASK_RECORD_INVALID', '任务输入固定点记录无效。');
      requireTask(row.manuscript_pin_json === canonicalJson({
        bookId,
        manuscriptId,
        revisionId,
        revisionDigest,
        sourceVersionId,
        sourceDigest: SAMPLE1_SOURCE_DIGEST,
      }), 'TASK_RECORD_INVALID', '任务稿件 pin 无效。');
      requireTask(row.artifact_pin_json === canonicalJson({
        identity: '@ai7/editorial-workspace-profile',
        version: '1.0.0',
        sidecarIdentity: 'ai7.editorial-workspace-profile.authority',
        sidecarRevision: 2,
        sidecarSha256: SIDECAR_DIGEST,
      }), 'TASK_RECORD_INVALID', '任务原生构件 pin 无效。');
      requireTask(row.source_scope_json === canonicalJson({
        readableScopeKinds: ['current-book-primary-manuscript-revision'],
        sourceVersionEvidence: { sourceVersionId, readable: false },
      }), 'TASK_RECORD_INVALID', '任务运行来源范围无效。');
      requireTask(row.provider_plan_json === canonicalJson({
        role: 'Main Editorial Role',
        capabilities: [],
        providerId: 'deepseek-open-platform',
        modelId: 'deepseek-v4-pro',
        adapterRevision: 1,
        configurationRevision: 1,
        approvedFallbackChain: [],
        credentialReference,
        credentialReadiness: 'missing',
        outboundDataCategory: 'public-or-synthetic',
        runBudgetCeiling: 'unset',
        providerProcessing: {
          operationalScope: 'development-ci',
          version: 'v1',
          decision: 'deny',
          authorizedLiveTransmissionCount: 0,
        },
      }), 'TASK_RECORD_INVALID', 'Provider Resolution Plan 无效。');
      requireTask(row.execution_plan_json === canonicalJson({
        steps: ['分析结构', '分析叙事连贯性', '形成编辑复核重点'],
        effects: [],
        stopCondition: 'Provider Processing v1 denies dispatch',
      }), 'TASK_RECORD_INVALID', 'Execution Plan 无效。');
      requireTask(row.envelope_json === canonicalJson({
        providerStatus: 'denied',
        dispatchAllowed: false,
        summary: '计划已冻结；Provider Processing v1 拒绝派发',
        taskIntentId,
        checkpointDigest: asString(row.checkpoint_sha256),
        manuscriptPinDigest: asString(row.manuscript_pin_sha256),
        artifactPinDigest: asString(row.artifact_pin_sha256),
        runSourceScopeDigest: asString(row.source_scope_sha256),
        providerResolutionPlanDigest: asString(row.provider_plan_sha256),
        executionPlanDigest: asString(row.execution_plan_sha256),
      }), 'TASK_RECORD_INVALID', 'Plan Envelope 无效。');
    }
    requireTask((row.authorization_task_id !== null) === (row.run_task_id !== null),
      'TASK_RECORD_INVALID', '任务授权与运行记录不完整。');
    if (row.run_task_id !== null) {
      const authorizationId = asString(row.authorization_id);
      const runRecordId = asString(row.run_record_id);
      const authorizedAt = asString(row.authorized_at);
      const recordedAt = asString(row.recorded_at);
      requireTask(prepared && row.authorization_task_id === taskIntentId && row.run_task_id === taskIntentId &&
        UUID_PATTERN.test(authorizationId) && UUID_PATTERN.test(runRecordId) &&
        row.plan_envelope_sha256 === row.envelope_sha256 && row.origin === 'standard-direct' &&
        isCanonicalInstant(authorizedAt) && row.run_authorization_id === authorizationId &&
        row.state === 'recorded-not-dispatched' && row.dispatched === 0 && isCanonicalInstant(recordedAt) &&
        row.authorization_json === canonicalJson({
          authorizationId,
          origin: 'standard-direct',
          planEnvelopeDigest: asString(row.envelope_sha256),
          taskIntentId,
          authority: 'record-only-no-dispatch',
        }) && row.run_json === canonicalJson({
          authorizationId,
          dispatched: false,
          runRecordId,
          state: 'recorded-not-dispatched',
          taskIntentId,
        }), 'TASK_RECORD_INVALID', '运行记录超出标准直接授权的未派发终态。');
    }
  }
  requireTask(db.prepare('PRAGMA foreign_key_check').all().length === 0,
    'TASK_RECORD_INVALID', '任务授权记录引用校验失败。');
}

export function validateTaskAuthorizationSchema(db: DatabaseSync): void {
  const version = asNumber((db.prepare('PRAGMA user_version').get() as SqlRow).user_version);
  requireTask(version === TASK_AUTHORIZATION_SCHEMA_VERSION, 'SCHEMA_UNSUPPORTED', '数据库版本不受支持。');
  for (const [name, sql] of Object.entries(TASK_AUTHORIZATION_SCHEMA_SQL)) {
    const row = db.prepare("SELECT sql FROM sqlite_schema WHERE type = 'table' AND name = ?").get(name) as SqlRow | undefined;
    requireTask(row !== undefined && normalizeSql(asString(row.sql)) === normalizeSql(sql),
      'SCHEMA_INVALID', `任务授权表 ${name} 结构不兼容。`);
  }
  for (const [name, sql] of Object.entries(TASK_AUTHORIZATION_TRIGGER_SQL)) {
    const row = db.prepare("SELECT sql FROM sqlite_schema WHERE type = 'trigger' AND name = ?").get(name) as SqlRow | undefined;
    requireTask(row !== undefined && normalizeSql(asString(row.sql)) === normalizeSql(sql),
      'SCHEMA_INVALID', `任务授权触发器 ${name} 结构不兼容。`);
  }
  validateStoredCanonicalRows(db);
}

export function initializeTaskAuthorizationSchema(db: DatabaseSync): void {
  const version = asNumber((db.prepare('PRAGMA user_version').get() as SqlRow).user_version);
  requireTask(version === PREDECESSOR_SCHEMA_VERSION || version === TASK_AUTHORIZATION_SCHEMA_VERSION,
    'SCHEMA_UNSUPPORTED', '数据库版本不受支持。');
  if (version === TASK_AUTHORIZATION_SCHEMA_VERSION) return validateTaskAuthorizationSchema(db);
  try {
    db.exec(`BEGIN IMMEDIATE;
      ${Object.values(TASK_AUTHORIZATION_SCHEMA_SQL).join(';\n')};
      ${Object.values(TASK_AUTHORIZATION_TRIGGER_SQL).join(';\n')};
      PRAGMA user_version = ${TASK_AUTHORIZATION_SCHEMA_VERSION};`);
    validateTaskAuthorizationSchema(db);
    db.exec('COMMIT');
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch (rollbackError) {
      throw new AggregateError([error, rollbackError], 'Task authorization schema rollback failed.');
    }
    throw error;
  }
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

interface CheckpointOwner {
  createManuscriptCheckpointWork(manuscriptId: string, branchId: string, purpose: typeof CHECKPOINT_PURPOSE):
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

export type TaskPreparationResult = {
  done: boolean;
  workId: string | null;
  completed: number;
  total: number;
  projection: TaskAuthorizationProjection | null;
};

export type TaskPrepareInput =
  | { phase: 'start'; bookId: string; goal: typeof J03_TASK_GOAL; launchPolicy: LaunchPolicyProjection }
  | { phase: 'advance'; workId: string }
  | { phase: 'cancel'; workId: string }
  | { phase: 'cancel-all' };

export class TaskAuthorizationStore {
  readonly #work = new Map<string, PreparationWork>();
  readonly #db: DatabaseSync;
  readonly #checkpointOwner: CheckpointOwner;

  constructor(db: DatabaseSync, checkpointOwner: CheckpointOwner) {
    this.#db = db;
    this.#checkpointOwner = checkpointOwner;
    validateTaskAuthorizationSchema(db);
  }

  inspect(bookId: string): TaskAuthorizationProjection {
    requireTask(UUID_PATTERN.test(bookId), 'TASK_BOOK_INVALID', '任务所属图书无效。');
    const intent = this.#db.prepare('SELECT * FROM task_intents WHERE book_id = ?').get(bookId) as SqlRow | undefined;
    if (intent === undefined) return this.#available(bookId);
    const taskIntentId = asString(intent.task_intent_id);
    const checkpoint = this.#db.prepare('SELECT * FROM task_input_checkpoints WHERE task_intent_id = ?')
      .get(taskIntentId) as SqlRow | undefined;
    if (checkpoint === undefined) {
      return { ...this.#available(bookId), taskIntent: this.#intentProjection(intent), actions: { canPrepare: true, canAuthorize: false } };
    }
    const read = <T>(table: string): T => {
      const row = this.#db.prepare(`SELECT canonical_json FROM ${table} WHERE task_intent_id = ?`).get(taskIntentId) as SqlRow | undefined;
      requireTask(row !== undefined, 'TASK_RECORD_INVALID', '任务计划记录图不完整。');
      return parseCanonicalJson(row.canonical_json) as T;
    };
    const envelopeRow = this.#db.prepare('SELECT canonical_json, sha256 FROM plan_envelopes WHERE task_intent_id = ?')
      .get(taskIntentId) as SqlRow;
    const envelope = parseCanonicalJson(envelopeRow.canonical_json) as {
      providerStatus: 'denied';
      dispatchAllowed: false;
      summary: '计划已冻结；Provider Processing v1 拒绝派发';
    };
    const authorization = this.#db.prepare('SELECT * FROM run_authorizations WHERE task_intent_id = ?')
      .get(taskIntentId) as SqlRow | undefined;
    const runRecord = this.#db.prepare('SELECT * FROM run_records WHERE task_intent_id = ?')
      .get(taskIntentId) as SqlRow | undefined;
    return {
      bookId,
      state: authorization === undefined ? 'prepared' : 'authorized',
      taskIntent: this.#intentProjection(intent),
      checkpoint: {
        manuscriptId: asString(checkpoint.manuscript_id),
        branchId: asString(checkpoint.branch_id),
        revisionId: asString(checkpoint.revision_id),
        revisionLabel: asString(checkpoint.revision_label),
        revisionDigest: asString(checkpoint.revision_digest),
        journalSequence: asNumber(checkpoint.journal_sequence),
        purpose: CHECKPOINT_PURPOSE,
        createdForDirtyJournal: asNumber(checkpoint.created_for_dirty_journal) === 1,
      },
      manuscriptPin: read('task_manuscript_pins'),
      runSourceScope: read('run_source_scopes'),
      artifactPin: read('task_artifact_pins'),
      providerResolutionPlan: read('provider_resolution_plans'),
      executionPlan: read('execution_plans'),
      planEnvelope: {
        digest: asString(envelopeRow.sha256),
        providerStatus: envelope.providerStatus,
        dispatchAllowed: envelope.dispatchAllowed,
        summary: envelope.summary,
      },
      authorization: authorization === undefined ? null : {
        authorizationId: asString(authorization.authorization_id),
        planEnvelopeDigest: asString(authorization.plan_envelope_sha256),
        origin: 'standard-direct',
        authorizedAt: asString(authorization.authorized_at),
      },
      runRecord: runRecord === undefined ? null : {
        runRecordId: asString(runRecord.run_record_id),
        state: 'recorded-not-dispatched',
        dispatched: false,
        terminalLabel: '已记录授权 · 未派发',
        recordedAt: asString(runRecord.recorded_at),
      },
      actions: { canPrepare: false, canAuthorize: authorization === undefined },
      namedNonEffects: NON_EFFECTS,
    };
  }

  prepare(input: TaskPrepareInput): TaskPreparationResult {
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
    requireTask(input.goal === J03_TASK_GOAL, 'TASK_GOAL_INVALID', '本次任务目标与固定 J-03 目标不一致。');
    this.#requireDeniedPolicy(input.launchPolicy);
    const existing = this.inspect(input.bookId);
    if (existing.state !== 'available' || existing.taskIntent !== null) {
      if (existing.state === 'prepared' || existing.state === 'authorized') {
        return { done: true, workId: null, completed: 1, total: 1, projection: existing };
      }
    }
    const binding = this.#binding(input.bookId);
    const taskIntentId = existing.taskIntent?.taskIntentId ?? randomUUID();
    if (existing.taskIntent === null) {
      const createdAt = new Date().toISOString();
      const intent = canonicalRecord({
        bookId: input.bookId,
        createdAt,
        expectedOutcome: EXPECTED_OUTCOME,
        goal: J03_TASK_GOAL,
        taskIntentId,
      });
      this.#db.prepare(
        `INSERT INTO task_intents(
           task_intent_id, book_id, goal, expected_outcome, created_at, canonical_json, sha256
         ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(taskIntentId, input.bookId, J03_TASK_GOAL, EXPECTED_OUTCOME, createdAt, intent.json, intent.digest);
    }
    const active = Array.from(this.#work.values()).find((work) => work.taskIntentId === taskIntentId);
    if (active !== undefined) return { done: false, workId: active.workId, completed: 0, total: active.total, projection: null };
    const checkpoint = this.#checkpointOwner.createManuscriptCheckpointWork(
      binding.manuscriptId,
      binding.branchId,
      CHECKPOINT_PURPOSE,
    );
    if (checkpoint.workId === null) {
      requireTask(checkpoint.checkpoint !== null, 'TASK_CHECKPOINT_INVALID', '任务输入固定点缺失。');
      transact(this.#db, () => this.#persistPrepared(taskIntentId, checkpoint.checkpoint!, CHECKPOINT_PURPOSE, input.launchPolicy));
      return { done: true, workId: null, completed: 1, total: 1, projection: this.inspect(input.bookId) };
    }
    const workId = randomUUID();
    this.#work.set(workId, {
      workId,
      taskIntentId,
      checkpointWorkId: checkpoint.workId,
      launchPolicy: structuredClone(input.launchPolicy),
      total: checkpoint.total,
    });
    return { done: false, workId, completed: 0, total: checkpoint.total, projection: null };
  }

  authorize(bookId: string, taskIntentId: string, planEnvelopeDigest: string): TaskAuthorizationProjection {
    requireTask(UUID_PATTERN.test(bookId) && UUID_PATTERN.test(taskIntentId) && DIGEST_PATTERN.test(planEnvelopeDigest),
      'TASK_AUTHORIZATION_INVALID', '任务运行授权参数无效。');
    const prepared = this.inspect(bookId);
    requireTask(prepared.taskIntent?.taskIntentId === taskIntentId && prepared.planEnvelope?.digest === planEnvelopeDigest,
      'TASK_AUTHORIZATION_STALE', '任务计划已经变化；无法记录该授权。');
    if (prepared.state === 'authorized') return prepared;
    requireTask(prepared.state === 'prepared', 'TASK_AUTHORIZATION_INVALID', '任务计划尚未准备完成。');
    const authorizationId = randomUUID();
    const runRecordId = randomUUID();
    const instant = new Date().toISOString();
    const authorization = canonicalRecord({
      authorizationId,
      origin: 'standard-direct',
      planEnvelopeDigest,
      taskIntentId,
      authority: 'record-only-no-dispatch',
    });
    const run = canonicalRecord({
      authorizationId,
      dispatched: false,
      runRecordId,
      state: 'recorded-not-dispatched',
      taskIntentId,
    });
    transact(this.#db, () => {
      this.#db.prepare(
        `INSERT INTO run_authorizations(
           authorization_id, task_intent_id, plan_envelope_sha256, origin, authorized_at, canonical_json, sha256
         ) VALUES (?, ?, ?, 'standard-direct', ?, ?, ?)`,
      ).run(authorizationId, taskIntentId, planEnvelopeDigest, instant, authorization.json, authorization.digest);
      this.#db.prepare(
        `INSERT INTO run_records(
           run_record_id, task_intent_id, authorization_id, state, dispatched, recorded_at, canonical_json, sha256
         ) VALUES (?, ?, ?, 'recorded-not-dispatched', 0, ?, ?, ?)`,
      ).run(runRecordId, taskIntentId, authorizationId, instant, run.json, run.digest);
    });
    return this.inspect(bookId);
  }

  #advance(workId: string): TaskPreparationResult {
    requireTask(UUID_PATTERN.test(workId), 'JOB_INVALID', '任务准备标识无效。');
    const work = this.#work.get(workId);
    requireTask(work !== undefined, 'JOB_NOT_FOUND', '任务准备不存在或已结束。');
    const progress = this.#checkpointOwner.advanceManuscriptCheckpointWork(work.checkpointWorkId);
    if (!progress.done) {
      return { done: false, workId, completed: progress.completed, total: progress.total, projection: null };
    }
    this.#checkpointOwner.finalizeManuscriptCheckpointWork(
      work.checkpointWorkId,
      (checkpoint, purpose) => this.#persistPrepared(work.taskIntentId, checkpoint, purpose, work.launchPolicy),
    );
    this.#work.delete(workId);
    const intent = this.#db.prepare('SELECT book_id FROM task_intents WHERE task_intent_id = ?').get(work.taskIntentId) as SqlRow;
    return { done: true, workId: null, completed: progress.total, total: progress.total, projection: this.inspect(asString(intent.book_id)) };
  }

  #persistPrepared(
    taskIntentId: string,
    checkpoint: ManuscriptCheckpointBinding,
    purpose: CheckpointPurpose,
    launchPolicy: LaunchPolicyProjection,
  ): void {
    requireTask(purpose === CHECKPOINT_PURPOSE, 'TASK_CHECKPOINT_INVALID', '任务输入固定点用途无效。');
    this.#requireDeniedPolicy(launchPolicy);
    const facts = this.#binding(checkpoint.bookId, checkpoint);
    const instant = new Date().toISOString();
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
      revisionDigest: checkpoint.revisionDigest,
      sourceVersionId: facts.sourceVersionId,
      sourceDigest: SAMPLE1_SOURCE_DIGEST,
    } as const;
    const artifactPin = {
      identity: '@ai7/editorial-workspace-profile',
      version: '1.0.0',
      sidecarIdentity: 'ai7.editorial-workspace-profile.authority',
      sidecarRevision: 2,
      sidecarSha256: SIDECAR_DIGEST,
    } as const;
    const sourceScope = {
      readableScopeKinds: ['current-book-primary-manuscript-revision'],
      sourceVersionEvidence: { sourceVersionId: facts.sourceVersionId, readable: false },
    } as const;
    const providerPlan = {
      role: 'Main Editorial Role',
      capabilities: [],
      providerId: 'deepseek-open-platform',
      modelId: 'deepseek-v4-pro',
      adapterRevision: 1,
      configurationRevision: 1,
      approvedFallbackChain: [],
      credentialReference: facts.credentialReference,
      credentialReadiness: 'missing',
      outboundDataCategory: 'public-or-synthetic',
      runBudgetCeiling: 'unset',
      providerProcessing: {
        operationalScope: 'development-ci',
        version: 'v1',
        decision: 'deny',
        authorizedLiveTransmissionCount: 0,
      },
    } as const;
    const executionPlan = {
      steps: ['分析结构', '分析叙事连贯性', '形成编辑复核重点'],
      effects: [],
      stopCondition: 'Provider Processing v1 denies dispatch',
    } as const;
    const records = {
      manuscriptPin: canonicalRecord(manuscriptPin),
      artifactPin: canonicalRecord(artifactPin),
      sourceScope: canonicalRecord(sourceScope),
      providerPlan: canonicalRecord(providerPlan),
      executionPlan: canonicalRecord(executionPlan),
    };
    const envelopeValue = {
      providerStatus: 'denied',
      dispatchAllowed: false,
      summary: '计划已冻结；Provider Processing v1 拒绝派发',
      taskIntentId,
      checkpointDigest: checkpointRecord.digest,
      manuscriptPinDigest: records.manuscriptPin.digest,
      artifactPinDigest: records.artifactPin.digest,
      runSourceScopeDigest: records.sourceScope.digest,
      providerResolutionPlanDigest: records.providerPlan.digest,
      executionPlanDigest: records.executionPlan.digest,
    } as const;
    const envelope = canonicalRecord(envelopeValue);
    this.#db.prepare(
      `INSERT INTO task_input_checkpoints(
         task_intent_id, manuscript_id, branch_id, revision_id, revision_label, revision_digest,
         journal_sequence, purpose, created_for_dirty_journal, canonical_json, sha256, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(taskIntentId, checkpoint.manuscriptId, checkpoint.branchId, checkpoint.revisionId,
      checkpoint.revisionLabel, checkpoint.revisionDigest, checkpoint.journalSequence, purpose,
      checkpoint.createdForDirtyJournal ? 1 : 0, checkpointRecord.json, checkpointRecord.digest, instant);
    const insert = (table: string, record: { json: string; digest: string }): void => {
      this.#db.prepare(
        `INSERT INTO ${table}(task_intent_id, canonical_json, sha256, created_at) VALUES (?, ?, ?, ?)`,
      ).run(taskIntentId, record.json, record.digest, instant);
    };
    insert('task_manuscript_pins', records.manuscriptPin);
    insert('task_artifact_pins', records.artifactPin);
    insert('run_source_scopes', records.sourceScope);
    insert('provider_resolution_plans', records.providerPlan);
    insert('execution_plans', records.executionPlan);
    insert('plan_envelopes', envelope);
  }

  #binding(bookId: string, checkpoint?: ManuscriptCheckpointBinding): {
    manuscriptId: string;
    branchId: string;
    sourceVersionId: string;
    credentialReference: string;
  } {
    requireTask(UUID_PATTERN.test(bookId), 'TASK_BOOK_INVALID', '任务所属图书无效。');
    const row = this.#db.prepare(
      `SELECT m.manuscript_id, mb.branch_id, bws.base_revision_id, bws.journal_sequence, bws.working_digest,
              mr.source_version_id, sv.source_digest,
              pin.sidecar_revision, pin.sidecar_sha256,
              connection.credential_reference, connection.credential_operation_state
       FROM manuscripts m
       JOIN manuscript_branches mb ON mb.manuscript_id = m.manuscript_id
       JOIN branch_working_state bws ON bws.branch_id = mb.branch_id
       JOIN manuscript_revisions mr ON mr.revision_id = ${checkpoint === undefined ? 'bws.base_revision_id' : '?'}
       JOIN source_versions sv ON sv.source_version_id = mr.source_version_id AND sv.book_id = m.book_id
       JOIN editorial_workspace_profile_book_pins pin ON pin.book_id = m.book_id
         AND pin.native_artifact_id = '@ai7/editorial-workspace-profile'
         AND pin.sidecar_id = 'ai7.editorial-workspace-profile.authority'
       JOIN model_service_connections connection ON connection.connection_id = 'main-editorial-deepseek-v4-pro'
       WHERE m.book_id = ? AND m.role = 'primary'
       ORDER BY pin.sidecar_revision DESC`,
    ).get(...(checkpoint === undefined ? [bookId] : [checkpoint.revisionId, bookId])) as SqlRow | undefined;
    requireTask(row !== undefined && row.source_digest === SAMPLE1_SOURCE_DIGEST,
      'TASK_LINEAGE_UNAVAILABLE', '当前图书不是精确 sample1 主稿件血缘。');
    requireTask(row.sidecar_revision === 2 && row.sidecar_sha256 === SIDECAR_DIGEST,
      'TASK_ARTIFACT_PIN_UNAVAILABLE', '当前图书尚未固定编辑工作区方案 Revision 2。');
    requireTask(row.credential_operation_state === 'missing' && UUID_PATTERN.test(asString(row.credential_reference)),
      'TASK_PROVIDER_BINDING_UNAVAILABLE', '主编辑角色缺少固定的未就绪凭据引用元数据。');
    if (checkpoint !== undefined) {
      requireTask(row.manuscript_id === checkpoint.manuscriptId && row.branch_id === checkpoint.branchId &&
        row.base_revision_id === checkpoint.revisionId && row.journal_sequence === checkpoint.journalSequence &&
        row.working_digest === checkpoint.revisionDigest,
      'TASK_CHECKPOINT_STALE', '任务输入固定点已经变化。');
    }
    return {
      manuscriptId: asString(row.manuscript_id),
      branchId: asString(row.branch_id),
      sourceVersionId: asString(row.source_version_id),
      credentialReference: asString(row.credential_reference),
    };
  }

  #requireDeniedPolicy(policy: LaunchPolicyProjection): void {
    requireTask(policy.integrityState === 'verified' && policy.denialReason === null &&
      policy.operationalScope === 'development-ci' && policy.activePolicySetVersion === 'v3' &&
      policy.providerProcessing.version === 'v1' && policy.providerProcessing.decision === 'deny' &&
      policy.providerProcessing.authorizedLiveTransmissionCount === 0 &&
      policy.providerProcessing.liveTransmissionAllowed === false,
    'TASK_POLICY_UNAVAILABLE', '无法建立可信的 development-ci Provider Processing v1 拒绝记录。');
  }

  #available(bookId: string): TaskAuthorizationProjection {
    return {
      bookId,
      state: 'available',
      taskIntent: null,
      checkpoint: null,
      manuscriptPin: null,
      runSourceScope: null,
      artifactPin: null,
      providerResolutionPlan: null,
      executionPlan: null,
      planEnvelope: null,
      authorization: null,
      runRecord: null,
      actions: { canPrepare: true, canAuthorize: false },
      namedNonEffects: NON_EFFECTS,
    };
  }

  #intentProjection(row: SqlRow): NonNullable<TaskAuthorizationProjection['taskIntent']> {
    return {
      taskIntentId: asString(row.task_intent_id),
      goal: J03_TASK_GOAL,
      expectedOutcome: EXPECTED_OUTCOME,
      createdAt: asString(row.created_at),
    };
  }
}
