import { supportsEditorialMemoryPolicy } from '../shared/protocol.js';
import {
  MODEL_SERVICE_ROUTES,
  modelServiceChannelOf,
  validModelServiceModelId,
  type ModelConnectionTestStatus,
  type ModelServiceRouteId,
} from '../shared/protocol.js';
import { SEARCH_BACKENDS, defaultSearchBackend } from './provider/search-backends.js';
import { allowedProductionBindingOf } from './launch-policy.js';
import { modelServiceRowsOutsideBindings } from './model-service-connections.js';
import { dirname, join } from 'node:path';
import { statSync, statfsSync, writeFileSync, renameSync, rmSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { asNumber, asString, requireStore, type SqlRow } from './store-records.js';
import { isModelTextAttemptProvenance } from './material-index.js';
import { hasExactKeys, isRecord } from './analysis/canonical.js';
import { cacheStatements } from './statement-cache.js';

export function configureDatabase(db: DatabaseSync, tempStore: 'MEMORY' | 'FILE' = 'MEMORY'): void {
  db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA recursive_triggers = ON;
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = FULL;
    PRAGMA wal_autocheckpoint = 0;
    PRAGMA busy_timeout = 5000;
    PRAGMA trusted_schema = OFF;
    PRAGMA secure_delete = ON;
    PRAGMA temp_store = ${tempStore};
  `);
  const recursiveTriggers = db.prepare('PRAGMA recursive_triggers').get() as SqlRow;
  requireStore(
    asNumber(recursiveTriggers.recursive_triggers) === 1,
    'SCHEMA_INVALID',
    'SQLite 递归触发器未启用，无法保护不可变记录。',
  );
  cacheStatements(db);
}

export const WAL_CHECKPOINT_LIMITS = { softBytes: 256 * 1024 * 1024, emergencyBytes: 16 * 1024 * 1024 * 1024 };

/** Connection configuration disables automatic checkpoints; the store runs this only after responses, outside edit commits. */
export function recordCheckpointSkip(error: unknown, source: string): void {
  const code = typeof error === 'object' && error !== null && 'errcode' in error ? Number(error.errcode) : 0;
  process.stderr.write('AI7_CHECKPOINT_SKIPPED/' + JSON.stringify({ source, sqliteCode: Number.isFinite(code) ? code : 0 }) + '\n');
}

export class WalCheckpointPolicy {
  readonly #pageBytes: number;
  #lastFrames = 0;
  #reclaim = false;

  constructor(
    readonly db: DatabaseSync,
    readonly path: string,
    readonly limits = WAL_CHECKPOINT_LIMITS,
  ) {
    this.#pageBytes = asNumber((db.prepare('PRAGMA page_size').get() as SqlRow).page_size) + 24;
  }

  frames(): number {
    const row = this.db.prepare('PRAGMA wal_checkpoint(NOOP)').get() as SqlRow;
    const frames = asNumber(row.log);
    // A concurrent checkpoint can return -1 (busy); that is not a WAL reset or a new write.
    if (frames >= 0) this.#lastFrames = frames;
    return this.#lastFrames;
  }

  fileBytes(): number {
    try { return statSync(`${this.path}-wal`).size; }
    catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') return 0;
      throw error;
    }
  }

  needsMaintenance(): boolean { return this.frames() * this.#pageBytes >= this.limits.softBytes; }

  /** Refuse before BEGIN; the renderer retains and retries the exact command through its existing protection path. */
  admitJournalWrite(): void {
    let freeBytes = -1;
    try { const space = statfsSync(dirname(this.path)); freeBytes = space.bavail * space.bsize; }
    catch { process.stderr.write('AI7_WAL_SPACE_UNAVAILABLE\n'); }
    requireStore(freeBytes < 0 || freeBytes >= 64 * 1024 * 1024, 'JOURNAL_DISK_FULL', '磁盘已满，请腾出空间后再保存。');
    // 30 bursts can append 11.84 GB before checkpointing catches up. Normal backlog is not a write refusal.
    const ceiling = freeBytes < 0 ? this.limits.emergencyBytes : Math.min(this.limits.emergencyBytes, Math.floor(freeBytes / 4));
    const walBytes = this.fileBytes();
    if (walBytes >= ceiling) { this.#reclaim = true; this.#recordEmergency(walBytes, ceiling, freeBytes); }
    requireStore(walBytes < ceiling, 'JOURNAL_CHECKPOINT_BUSY', '本机存储空间暂时不足，请稍候重试保存。');
  }

  #recordEmergency(walBytes: number, ceilingBytes: number, freeBytes: number): void {
    const record = JSON.stringify({ flag: 'JOURNAL_CHECKPOINT_BUSY', timestamp: Date.now(), walBytes, ceilingBytes, freeBytes });
    // One bounded numeric observation, not a manuscript or service log; never affects admission or recovery.
    const target = join(dirname(this.path), 'wal-checkpoint-pressure.json');
    const staged = `${target}.${randomUUID()}.tmp`;
    try {
      writeFileSync(staged, record, { flag: 'wx', mode: 0o600 });
      renameSync(staged, target);
    } catch { process.stderr.write('AI7_WAL_DIAGNOSTIC_WRITE_FAILED\n'); }
    finally { try { rmSync(staged, { force: true }); } catch { /* Diagnostics must not mask the original refusal. */ } }
    process.stderr.write('AI7_WAL_EMERGENCY/' + record + '\n');
  }

  maintain(idle: boolean, force = false): { busy: boolean; beforeBytes: number; afterBytes: number } | null {
    try {
      if (!force && !idle && !this.#reclaim && !this.needsMaintenance()) return null;
      const beforeBytes = this.fileBytes();
      const timeout = asNumber((this.db.prepare('PRAGMA busy_timeout').get() as SqlRow).timeout);
      this.db.exec('PRAGMA busy_timeout = 0');
      try {
        // Backfill without a writer lock first. Only an entirely backfilled, idle WAL may be truncated.
        const passive = this.db.prepare('PRAGMA wal_checkpoint(PASSIVE)').get() as SqlRow;
        let busy = asNumber(passive.busy) !== 0 || asNumber(passive.log) > asNumber(passive.checkpointed);
        if (idle && !busy) {
          const latest = this.db.prepare('PRAGMA wal_checkpoint(NOOP)').get() as SqlRow;
          if (asNumber(latest.log) === asNumber(latest.checkpointed)) {
            const trimmed = this.db.prepare('PRAGMA wal_checkpoint(TRUNCATE)').get() as SqlRow;
            busy = asNumber(trimmed.busy) !== 0;
          }
        }
        const afterBytes = this.fileBytes();
        if (afterBytes === 0) this.#reclaim = false;
        return { busy, beforeBytes, afterBytes };
      } finally { this.db.exec(`PRAGMA busy_timeout = ${timeout}`); }
    } catch (error) {
      recordCheckpointSkip(error, 'fallback');
      return null;
    }
  }

  shutdown(): void {
    // Busy readers/unfinished statements leave FULL-durable WAL for the next open.
    this.maintain(true, true);
  }
}

/** Read only the closed, generation-bound metadata retained by the protected synthetic test. */
export function readModelConnectionTest(row: SqlRow): ModelConnectionTestStatus | null {
  if (row.connection_test == null) return null;
  const json = asString(row.connection_test);
  requireStore(json.length <= 8192, 'MODEL_CONNECTION_TEST_INVALID', '连接测试状态无效。');
  const value: unknown = JSON.parse(json);
  requireStore(isRecord(value) && hasExactKeys(value, ['modelId', 'credentialUpdatedAt', 'testedAt', 'outcome', 'code', 'verified',
    ...(value.provenance === undefined ? [] : ['provenance']), ...(value.responseText === undefined ? [] : ['responseText'])]) &&
    (value.responseText === undefined || typeof value.responseText === 'string' && value.responseText.isWellFormed() && value.responseText.length <= 4000) &&
    value.credentialUpdatedAt === row.credential_updated_at && typeof value.testedAt === 'string' && value.testedAt.length <= 30 && Number.isFinite(Date.parse(value.testedAt)) &&
    ['passed', 'failed', 'outcome-unknown', 'cancelled'].includes(value.outcome as string) && value.verified === 'buffered-text-only' &&
    (value.code === null || (typeof value.code === 'string' && /^[A-Z0-9_]{1,100}$/u.test(value.code))) &&
    MODEL_SERVICE_ROUTES.includes(row.provider_id as ModelServiceRouteId) && validModelServiceModelId(value.modelId as string),
    'MODEL_CONNECTION_TEST_INVALID', '连接测试状态无效。');
  const facts = value.provenance;
  requireStore(value.outcome !== 'passed' || (value.code === null && facts !== undefined), 'MODEL_CONNECTION_TEST_INVALID', '连接测试状态无效。');
  if (facts !== undefined) requireStore(isModelTextAttemptProvenance(facts) && facts.model === value.modelId && modelServiceChannelOf(facts.route) === row.provider_id &&
    facts.credentialReference === row.credential_reference && facts.credentialSlot === row.credential_slot && (facts.policyVersion === 'v25' || facts.policyVersion === 'v26' || facts.policyVersion === 'v27' || facts.policyVersion === 'v30' || facts.policyVersion === 'v31' || (facts.policyVersion === 'v32' || facts.policyVersion === 'v33' || facts.policyVersion === 'v34' || supportsEditorialMemoryPolicy(facts.policyVersion))) && facts.failureCode === value.code &&
    (facts.credentialUpdatedAt === undefined || facts.credentialUpdatedAt === value.credentialUpdatedAt) &&
    allowedProductionBindingOf({ route: facts.route, endpoint: facts.endpoint, model: facts.model, credentialSlot: facts.credentialSlot, credentialReference: facts.credentialReference }, 'fast-interaction') !== null,
    'MODEL_CONNECTION_TEST_INVALID', '连接测试来历无效。');
  return value as unknown as ModelConnectionTestStatus;
}

/** The baseline's seed (#1634): one connection row per shipped search backend, the registry's top rank selected. */
export function seedSearchBackends(db: DatabaseSync, instant: string): void {
  const insert = db.prepare("INSERT INTO search_backend_connections(backend_id, credential_reference, credential_operation_state, selected, selected_at) VALUES (?, NULL, 'missing', ?, ?)");
  for (const entry of SEARCH_BACKENDS.filter((backend) => backend.shipped)) insert.run(entry.id, entry.id === defaultSearchBackend()!.id ? 1 : null, instant);
}

/** What every open checks of the model-service and search-backend connections: the seeded rows stand, inside the fixed bindings. */
export function validateConnectionRecords(db: DatabaseSync): void {
  requireStore(asNumber((db.prepare('SELECT count(*) total FROM search_backend_connections').get() as SqlRow).total) === 5 &&
    db.prepare('SELECT 1 FROM search_backend_connections WHERE selected = 1').all().length === 1, 'SCHEMA_INVALID', '联网检索连接记录不完整。');
  requireStore(!modelServiceRowsOutsideBindings(db), 'SCHEMA_INVALID', '模型服务连接记录超出当前固定绑定。');
  for (const row of db.prepare('SELECT * FROM model_service_connections').iterate()) readModelConnectionTest(row);
}
