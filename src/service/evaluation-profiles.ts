import { randomUUID } from 'node:crypto';
import type { DatabaseSync, SQLOutputValue } from 'node:sqlite';
import type { EvaluationProfileProjection, SaveEvaluationProfileInput } from '../shared/protocol.js';
import { canonicalJson, canonicalRecord, DIGEST_PATTERN, hasExactKeys, isRecord, parseStoredJson, sha256Hex, UUID_PATTERN } from './analysis/canonical.js';
import { graphemeCount } from './analysis/factual-review-contract.js';
import { BUILTIN_EVALUATION_PROFILE, evaluationProfileDigest, EvaluationError } from './evaluation-records.js';
import { withinEvaluationBytes } from './evaluation/initial-evaluation-contract.js';

/** House versions stay behind in a Book-only merge; Tasks carry their exact profile by value (KB-002). */
export const EVALUATION_PROFILE_SCHEMA_SQL = {
  evaluation_profile_versions: `CREATE TABLE evaluation_profile_versions (
  version_id TEXT PRIMARY KEY,
  ordinal INTEGER NOT NULL UNIQUE CHECK(ordinal >= 1),
  previous_version_id TEXT REFERENCES evaluation_profile_versions(version_id),
  recorded_at TEXT NOT NULL,
  canonical_json TEXT NOT NULL,
  sha256 TEXT NOT NULL UNIQUE CHECK(length(sha256) = 64)
) STRICT`,
  initial_evaluation_tasks: `CREATE TABLE initial_evaluation_tasks (
  task_intent_id TEXT NOT NULL REFERENCES analysis_task_intents(task_intent_id),
  prompt_contract_sha256 TEXT NOT NULL CHECK(length(prompt_contract_sha256) = 64),
  profile_sha256 TEXT NOT NULL CHECK(length(profile_sha256) = 64),
  canonical_json TEXT NOT NULL,
  sha256 TEXT NOT NULL UNIQUE CHECK(length(sha256) = 64),
  PRIMARY KEY(task_intent_id, prompt_contract_sha256)
) STRICT`,
} as const;
export const EVALUATION_PROFILE_TRIGGER_SQL = Object.fromEntries(Object.keys(EVALUATION_PROFILE_SCHEMA_SQL).flatMap((table) =>
  ['update', 'delete'].map((operation) => [`${table}_no_${operation}`, `CREATE TRIGGER ${table}_no_${operation}
    BEFORE ${operation.toUpperCase()} ON ${table}
    BEGIN
      SELECT RAISE(ABORT, 'EVALUATION_PROFILE_LEDGER_IMMUTABLE');
    END`])));
export const EVALUATION_PROFILE_FOREIGN_KEYS = {
  evaluation_profile_versions: ['previous_version_id>evaluation_profile_versions.version_id:NO ACTION/NO ACTION/NONE'],
  initial_evaluation_tasks: ['task_intent_id>analysis_task_intents.task_intent_id:NO ACTION/NO ACTION/NONE'],
};
export function initializeEvaluationProfileSchema(db: DatabaseSync): void {
  if (db.prepare("SELECT 1 FROM sqlite_schema WHERE name = 'evaluation_profile_versions'").get() !== undefined) return;
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const sql of Object.values(EVALUATION_PROFILE_SCHEMA_SQL)) db.exec(sql);
    for (const sql of Object.values(EVALUATION_PROFILE_TRIGGER_SQL)) db.exec(sql);
    db.exec('COMMIT');
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch (rollback) { throw new AggregateError([error, rollback], 'Evaluation profile schema rollback failed.'); }
    throw error;
  }
}

const COUNTS = [1, 2, 4, 5, 10];
export const EVALUATION_PROFILE_COUNT_REASON = '评分项数需要能把 100 分平均分成整数：1、2、4、5 或 10 项。';
type Profile = Omit<EvaluationProfileProjection, 'sha256'>;
type Row = Record<string, SQLOutputValue>;
function requireProfile(condition: unknown, message: string, code = 'EVALUATION_PROFILE_INVALID'): asserts condition {
  if (!condition) throw new EvaluationError(code, message);
}
function line(value: unknown, max: number, empty = false): string {
  requireProfile(typeof value === 'string' && value.isWellFormed() && (empty || value.trim().length > 0) &&
    !/[\p{Cc}\p{Zl}\p{Zp}]/u.test(value) && graphemeCount(value) <= max && withinEvaluationBytes(value, max),
  `请填写有效的文字，且不超过 ${max} 字。`);
  return value.trim().normalize('NFC');
}
function read(row: Row): Record<string, unknown> {
  const invalid = () => new EvaluationError('EVALUATION_PROFILE_DAMAGED', '评估方案记录已损坏，请恢复数据后再试。');
  requireProfile(typeof row.canonical_json === 'string' && sha256Hex(row.canonical_json) === row.sha256, invalid().message, invalid().code);
  const value = parseStoredJson(row.canonical_json, invalid);
  requireProfile(isRecord(value) && canonicalJson(value) === row.canonical_json, invalid().message, invalid().code);
  return value;
}
export function builtinEvaluationProfile(): EvaluationProfileProjection {
  return { ...BUILTIN_EVALUATION_PROFILE, sha256: evaluationProfileDigest(BUILTIN_EVALUATION_PROFILE) };
}

/** Immutable profile values are read independently of the house ledger, including after a Book-only merge. */
export function checkedEvaluationProfile(value: unknown): EvaluationProfileProjection {
  requireProfile(isRecord(value) && typeof value.sha256 === 'string' && DIGEST_PATTERN.test(value.sha256), '评估方案快照无效。');
  const { sha256, ...profile } = value;
  requireProfile(evaluationProfileDigest(profile as unknown as Profile) === sha256 && typeof profile.profileId === 'string' &&
    typeof profile.version === 'string' && Array.isArray(profile.items) && COUNTS.includes(profile.items.length) &&
    profile.total === 100 && Array.isArray(profile.risks) && Array.isArray(profile.conclusions) && Array.isArray(profile.bands), '评估方案快照无效。');
  const ids = new Set<string>();
  for (const item of profile.items) {
    requireProfile(isRecord(item) && typeof item.itemId === 'string' && /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u.test(item.itemId) &&
      !ids.has(item.itemId) && item.fullMarks === 100 / profile.items.length, '评估方案评分项无效。');
    ids.add(item.itemId);
    line(item.label, 40);
    if (item.description !== undefined) line(item.description, 500, true);
  }
  requireProfile(canonicalJson(profile.risks) === canonicalJson(BUILTIN_EVALUATION_PROFILE.risks) &&
    canonicalJson(profile.bands) === canonicalJson(BUILTIN_EVALUATION_PROFILE.bands) &&
    canonicalJson(profile.conclusions) === canonicalJson(BUILTIN_EVALUATION_PROFILE.conclusions), '风险项、档位和结论不能修改。');
  if (profile.readiness !== undefined) {
    requireProfile(Array.isArray(profile.readiness) && profile.readiness.length <= 20, '就绪清单最多 20 项。');
    for (const entry of profile.readiness) line(entry, 200);
  }
  return value as unknown as EvaluationProfileProjection;
}

export class EvaluationProfiles {
  constructor(readonly db: DatabaseSync) {}

  #version(row: Row): EvaluationProfileProjection {
    const value = read(row);
    requireProfile(value.schema === 'ai7.evaluation-profile-version/1' && value.versionId === row.version_id && value.ordinal === row.ordinal &&
      value.previousVersionId === row.previous_version_id && value.recordedAt === row.recorded_at, '评估方案版本已损坏。', 'EVALUATION_PROFILE_DAMAGED');
    const profile = checkedEvaluationProfile(value.profile);
    requireProfile(profile.profileId === 'house/evaluation-profile' && profile.version === String(Number(row.ordinal) + 1), '评估方案版本已损坏。', 'EVALUATION_PROFILE_DAMAGED');
    return profile;
  }

  current(): EvaluationProfileProjection {
    const row = this.db.prepare('SELECT * FROM evaluation_profile_versions ORDER BY ordinal DESC LIMIT 1').get() as Row | undefined;
    return row === undefined ? builtinEvaluationProfile() : this.#version(row);
  }

  /** Bounded version pages; the built-in version is the last page's final entry. */
  page(before: number | null = null): { profiles: EvaluationProfileProjection[]; nextBefore: number | null } {
    const rows = this.db.prepare('SELECT * FROM evaluation_profile_versions WHERE ordinal < ? ORDER BY ordinal DESC LIMIT 11')
      .all(before ?? Number.MAX_SAFE_INTEGER) as Row[];
    const profiles = rows.slice(0, 10).map((row) => this.#version(row));
    if (rows.length <= 10) profiles.push(builtinEvaluationProfile());
    return { profiles, nextBefore: rows.length > 10 ? Number(rows[9]!.ordinal) : null };
  }

  /** Caller owns the transaction, including the optimistic concurrency check. */
  save(input: SaveEvaluationProfileInput): EvaluationProfileProjection {
    requireProfile(isRecord(input) && hasExactKeys(input, ['expectedSha256', 'items', 'readiness']) && Array.isArray(input.items) && Array.isArray(input.readiness), '评估方案修改无效。');
    const current = this.current();
    requireProfile(input.expectedSha256 === current.sha256, '评估方案刚在另一个窗口更新过，请看过最新版本再保存。', 'EVALUATION_PROFILE_MOVED');
    requireProfile(COUNTS.includes(input.items.length), EVALUATION_PROFILE_COUNT_REASON);
    const ids = new Set(current.items.map((item) => item.itemId));
    const items = input.items.map((item) => {
      requireProfile(isRecord(item) && hasExactKeys(item, ['itemId', 'label', 'description']) && (item.itemId === null || (typeof item.itemId === 'string' && ids.has(item.itemId))), '评分项标识无效，请重新打开方案。');
      return { itemId: item.itemId ?? `item-${randomUUID()}`, label: line(item.label, 40), description: line(item.description, 500, true), fullMarks: 100 / input.items.length };
    });
    requireProfile(new Set(items.map((item) => item.itemId)).size === items.length && new Set(items.map((item) => item.label)).size === items.length, '评分项名称或标识不能重复。');
    requireProfile(input.readiness.length <= 20, '就绪清单最多 20 项。');
    const readiness = input.readiness.map((entry) => line(entry, 200));
    requireProfile(new Set(readiness).size === readiness.length, '就绪清单不能重复。');
    const old = current.items.map((item) => ({ ...item, description: item.description ?? '' }));
    requireProfile(canonicalJson({ items, readiness }) !== canonicalJson({ items: old, readiness: current.readiness ?? [] }), '评估方案没有变化。', 'EVALUATION_PROFILE_UNCHANGED');
    const previous = this.db.prepare('SELECT version_id, ordinal FROM evaluation_profile_versions ORDER BY ordinal DESC LIMIT 1').get() as Row | undefined;
    const ordinal = Number(previous?.ordinal ?? 0) + 1;
    const profile: Profile = { ...BUILTIN_EVALUATION_PROFILE, profileId: 'house/evaluation-profile', version: String(ordinal + 1), issuer: '本社', items, readiness };
    const frozen = { ...profile, sha256: evaluationProfileDigest(profile) };
    const versionId = randomUUID();
    const recordedAt = new Date().toISOString();
    const record = canonicalRecord({ schema: 'ai7.evaluation-profile-version/1', versionId, ordinal, previousVersionId: previous?.version_id ?? null, recordedAt, profile: frozen });
    this.db.prepare('INSERT INTO evaluation_profile_versions(version_id, ordinal, previous_version_id, recorded_at, canonical_json, sha256) VALUES (?, ?, ?, ?, ?, ?)')
      .run(versionId, ordinal, previous?.version_id ?? null, recordedAt, record.json, record.digest);
    return frozen;
  }

  snapshotTask(taskIntentId: string, promptContractSha256: string, profile: EvaluationProfileProjection): void {
    checkedEvaluationProfile(profile);
    requireProfile(UUID_PATTERN.test(taskIntentId) && DIGEST_PATTERN.test(promptContractSha256), '初评方案快照标识无效。');
    const existing = this.taskProfile(taskIntentId, promptContractSha256);
    if (existing !== null) {
      requireProfile(existing.sha256 === profile.sha256, '初评方案快照不能更换。');
      return;
    }
    const record = canonicalRecord({ schema: 'ai7.initial-evaluation-task/1', taskIntentId, promptContractSha256, profile });
    this.db.prepare('INSERT INTO initial_evaluation_tasks(task_intent_id, prompt_contract_sha256, profile_sha256, canonical_json, sha256) VALUES (?, ?, ?, ?, ?)')
      .run(taskIntentId, promptContractSha256, profile.sha256, record.json, record.digest);
  }

  taskProfile(taskIntentId: string, digest: string): EvaluationProfileProjection | null {
    const row = this.db.prepare('SELECT * FROM initial_evaluation_tasks WHERE task_intent_id = ? AND prompt_contract_sha256 = ?').get(taskIntentId, digest) as Row | undefined;
    if (row === undefined) return null;
    const value = read(row);
    requireProfile(value.schema === 'ai7.initial-evaluation-task/1' && value.taskIntentId === row.task_intent_id && value.promptContractSha256 === row.prompt_contract_sha256, '初评方案快照已损坏。');
    const profile = checkedEvaluationProfile(value.profile);
    requireProfile(profile.sha256 === row.profile_sha256, '初评方案快照已损坏。');
    return profile;
  }
}
