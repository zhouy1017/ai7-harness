import { randomUUID } from 'node:crypto';
import type { DatabaseSync, SQLOutputValue } from 'node:sqlite';
import {
  DEFAULT_EXECUTION_RULE_PATTERNS,
  type DefaultExecutionRuleBinding,
  type DefaultExecutionRulePattern,
  type DefaultExecutionRuleReference,
  type MaterialPlanInputsProjection,
} from '../shared/protocol.js';
import { DIGEST_PATTERN, UUID_PATTERN, canonicalRecord, isRecord, parseCanonicalJson, sha256Hex } from './analysis/canonical.js';
import { diffMaterialPlanInputs } from './analysis/plan-boundary.js';
import { DRIFT_FIELD_LABELS } from './task-plan.js';

/**
 * 默认执行规则 — the rules 快速开始 starts a Task under (Issue #421, plan slice S75; V2-UX-TASK-017, TASK-019,
 * TASK-020, TASK-028, AUTH-009; UI ADR 0001). Schema revision 31 adds three append-only relations, each row
 * carrying canonical JSON and its digest:
 *
 * - `default_execution_rules`: one rule per Book and task pattern (applicability 本图书), and when it was set;
 * - `default_execution_rule_versions`: what each version binds — taken from the plan the editor viewed when
 *   they chose `设为快速开始默认…`, never from anything the editor did not see;
 * - `default_execution_rule_states`: which version is in force, or that the rule was turned off (停用).
 *
 * A rule is never a standing authorization. It starts nothing by itself (TASK-028): each Run it starts is a
 * newly user-initiated Task with its own Intent, plan, envelope and Run Authorization, whose origin is
 * `default-execution-rule` and which names the rule version. The kind and pattern are admitted by shape here
 * and by name in code, so widening what a rule may cover needs no schema revision.
 */

export const DEFAULT_EXECUTION_RULE_SCHEMA_SQL = {
  default_execution_rules: `CREATE TABLE default_execution_rules (
  rule_id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL REFERENCES books(book_id),
  task_kind TEXT NOT NULL CHECK(length(task_kind) BETWEEN 1 AND 128),
  task_pattern TEXT NOT NULL CHECK(length(task_pattern) BETWEEN 1 AND 256),
  created_at TEXT NOT NULL,
  canonical_json TEXT NOT NULL,
  sha256 TEXT NOT NULL UNIQUE CHECK(length(sha256) = 64),
  UNIQUE(book_id, task_kind, task_pattern)
) STRICT`,
  default_execution_rule_versions: `CREATE TABLE default_execution_rule_versions (
  rule_version_id TEXT PRIMARY KEY,
  rule_id TEXT NOT NULL REFERENCES default_execution_rules(rule_id),
  ordinal INTEGER NOT NULL CHECK(ordinal >= 1),
  source_task_intent_id TEXT NOT NULL REFERENCES analysis_task_intents(task_intent_id),
  source_plan_envelope_sha256 TEXT NOT NULL CHECK(length(source_plan_envelope_sha256) = 64),
  actor TEXT NOT NULL CHECK(actor = '本机编辑'),
  created_at TEXT NOT NULL,
  canonical_json TEXT NOT NULL,
  sha256 TEXT NOT NULL UNIQUE CHECK(length(sha256) = 64),
  UNIQUE(rule_id, ordinal)
) STRICT`,
  default_execution_rule_states: `CREATE TABLE default_execution_rule_states (
  rule_id TEXT NOT NULL REFERENCES default_execution_rules(rule_id),
  sequence INTEGER NOT NULL CHECK(sequence >= 1),
  state TEXT NOT NULL CHECK(state IN ('active', 'deactivated')),
  rule_version_id TEXT NOT NULL REFERENCES default_execution_rule_versions(rule_version_id),
  actor TEXT NOT NULL CHECK(actor = '本机编辑'),
  recorded_at TEXT NOT NULL,
  canonical_json TEXT NOT NULL,
  sha256 TEXT NOT NULL UNIQUE CHECK(length(sha256) = 64),
  PRIMARY KEY(rule_id, sequence)
) STRICT`,
} as const;

/** Every rule relation is a ledger: a row is appended once and never rewritten or removed. */
export const DEFAULT_EXECUTION_RULE_TRIGGER_SQL: Readonly<Record<string, string>> = Object.fromEntries(
  Object.keys(DEFAULT_EXECUTION_RULE_SCHEMA_SQL).flatMap((table) => [
    [`${table}_no_update`, `CREATE TRIGGER ${table}_no_update
    BEFORE UPDATE ON ${table}
    BEGIN
      SELECT RAISE(ABORT, 'DEFAULT_EXECUTION_RULE_IMMUTABLE');
    END`],
    [`${table}_no_delete`, `CREATE TRIGGER ${table}_no_delete
    BEFORE DELETE ON ${table}
    BEGIN
      SELECT RAISE(ABORT, 'DEFAULT_EXECUTION_RULE_IMMUTABLE');
    END`],
  ]),
);

/** The foreign keys of the three relations, in the exact-schema validator's own spelling. */
export const DEFAULT_EXECUTION_RULE_FOREIGN_KEYS: Readonly<Record<string, ReadonlyArray<string>>> = {
  default_execution_rules: ['book_id>books.book_id:NO ACTION/NO ACTION/NONE'],
  default_execution_rule_versions: [
    'rule_id>default_execution_rules.rule_id:NO ACTION/NO ACTION/NONE',
    'source_task_intent_id>analysis_task_intents.task_intent_id:NO ACTION/NO ACTION/NONE',
  ],
  default_execution_rule_states: [
    'rule_id>default_execution_rules.rule_id:NO ACTION/NO ACTION/NONE',
    'rule_version_id>default_execution_rule_versions.rule_version_id:NO ACTION/NO ACTION/NONE',
  ],
};

export class DefaultExecutionRuleError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'DefaultExecutionRuleError';
  }
}

export function requireRule(condition: unknown, code: string, message: string): asserts condition {
  if (!condition) throw new DefaultExecutionRuleError(code, message);
}

/**
 * Revision 31's three relations and their ledger triggers, created once and never rebuilt: a store that predates
 * them gains three empty relations and nothing existing moves. Shape-detected like revisions 21 to 29, and run
 * before the version is stamped in `task-authorization.ts`.
 */
export function initializeDefaultExecutionRuleSchema(db: DatabaseSync): void {
  const existing = db.prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'default_execution_rules'").get();
  if (existing !== undefined) return;
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const sql of Object.values(DEFAULT_EXECUTION_RULE_SCHEMA_SQL)) db.exec(sql);
    for (const sql of Object.values(DEFAULT_EXECUTION_RULE_TRIGGER_SQL)) db.exec(sql);
    db.exec('COMMIT');
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch (rollbackError) {
      throw new AggregateError([error, rollbackError], 'Default execution rule schema rollback failed.');
    }
    throw error;
  }
  requireRule(db.prepare('PRAGMA foreign_key_check').all().length === 0, 'SCHEMA_MIGRATION_FAILED', '数据库引用校验失败。');
}

// ---- the ledger ------------------------------------------------------------------------------------------

/** The one Task kind a rule covers today (S75 D3), named as the analysis ledger names it. */
export const DEFAULT_EXECUTION_RULE_KIND = 'baseline-analysis' as const;
const RULE_SCHEMA = 'ai7.default-execution-rule/1' as const;
const VERSION_SCHEMA = 'ai7.default-execution-rule.version/1' as const;
const STATE_SCHEMA = 'ai7.default-execution-rule.state/1' as const;
const ACTOR = '本机编辑' as const;

/** The quick start each pattern gives, in the words ②A's button carries. */
export const DEFAULT_EXECUTION_RULE_QUICK_LABELS: Readonly<Record<DefaultExecutionRulePattern, string>> = {
  'sync-current': '开始同步',
  'reanalyze-book': '开始全部重来',
};

/** One rule as the ledger holds it: the version in force — or the last one, once turned off — and its state. */
export interface DefaultExecutionRuleRecord {
  ruleId: string;
  bookId: string;
  taskKind: typeof DEFAULT_EXECUTION_RULE_KIND;
  pattern: DefaultExecutionRulePattern;
  createdAt: string;
  state: 'active' | 'deactivated';
  stateRecordedAt: string;
  version: DefaultExecutionRuleVersionRecord;
}

export interface DefaultExecutionRuleVersionRecord {
  ruleVersionId: string;
  ordinal: number;
  sourceTaskIntentId: string;
  sourcePlanEnvelopeDigest: string;
  binding: DefaultExecutionRuleBinding;
  createdAt: string;
}

/** `开始同步 · 第 2 版`. */
export function defaultExecutionRuleName(pattern: DefaultExecutionRulePattern, ordinal: number): string {
  return `${DEFAULT_EXECUTION_RULE_QUICK_LABELS[pattern]} · 第 ${ordinal} 版`;
}

export function defaultExecutionRuleReference(
  rule: Pick<DefaultExecutionRuleRecord, 'ruleId' | 'pattern'>,
  version: Pick<DefaultExecutionRuleVersionRecord, 'ruleVersionId' | 'ordinal'>,
): DefaultExecutionRuleReference {
  return { ruleId: rule.ruleId, ruleVersionId: version.ruleVersionId, ordinal: version.ordinal, name: defaultExecutionRuleName(rule.pattern, version.ordinal) };
}

/** What a rule set from these material inputs binds: everything but the range and the predecessor, which are each Run's own. */
export function defaultExecutionRuleBindingOf(inputs: MaterialPlanInputsProjection): DefaultExecutionRuleBinding {
  return {
    providerBinding: { ...inputs.providerBinding },
    artifactPin: { ...inputs.artifactPin },
    runBudgetCeiling: inputs.runBudgetCeiling === 'unset' ? 'unset' : { ...inputs.runBudgetCeiling },
    outboundDataCategory: inputs.outboundDataCategory,
    expectedOutcome: inputs.expectedOutcome,
  };
}

/**
 * The labels of the material fields in which `inputs` differ from what the rule binds — the same labels, in the
 * same order, a Plan Revision's diff uses. The range and the predecessor are taken from `inputs` itself, so they
 * never count: a rule does not bind them.
 */
export function defaultExecutionRuleDrift(binding: DefaultExecutionRuleBinding, inputs: MaterialPlanInputsProjection): ReadonlyArray<string> {
  // Named in the drawer's words by field key, never by the engineering label a stored diff carries.
  return diffMaterialPlanInputs({ ...binding, selectedRange: inputs.selectedRange, predecessorRevision: inputs.predecessorRevision }, inputs)
    .map((entry) => DRIFT_FIELD_LABELS[entry.field] ?? entry.label);
}

function isBinding(value: unknown): value is DefaultExecutionRuleBinding {
  if (!isRecord(value) || !isRecord(value.providerBinding) || !isRecord(value.artifactPin)) return false;
  const provider = value.providerBinding;
  const pin = value.artifactPin;
  const ceiling = value.runBudgetCeiling;
  return typeof provider.providerId === 'string' && typeof provider.modelId === 'string' &&
    Number.isSafeInteger(provider.adapterRevision) && Number.isSafeInteger(provider.configurationRevision) &&
    typeof provider.credentialReference === 'string' && Object.keys(provider).length === 5 &&
    typeof pin.identity === 'string' && typeof pin.version === 'string' && typeof pin.nativeCarrierSha256 === 'string' &&
    Number.isSafeInteger(pin.sidecarRevision) && typeof pin.sidecarSha256 === 'string' && Object.keys(pin).length === 5 &&
    (ceiling === 'unset' || (isRecord(ceiling) && ceiling.kind === 'tokens' && Number.isSafeInteger(ceiling.maxTotalTokens) && Object.keys(ceiling).length === 2)) &&
    value.outboundDataCategory === 'public-or-synthetic' && typeof value.expectedOutcome === 'string' && Object.keys(value).length === 5;
}

type SqlRow = Record<string, SQLOutputValue>;

function text(value: SQLOutputValue | undefined): string {
  requireRule(typeof value === 'string', 'DEFAULT_EXECUTION_RULE_RECORD_INVALID', '默认执行规则记录无效。');
  return value;
}

function integer(value: SQLOutputValue | undefined): number {
  requireRule(typeof value === 'number' && Number.isSafeInteger(value), 'DEFAULT_EXECUTION_RULE_RECORD_INVALID', '默认执行规则记录无效。');
  return value;
}

/** A stored row read back: its canonical JSON digests to the recorded SHA-256 and names exactly the facts its columns hold. */
function requireRecord(row: SqlRow, facts: Readonly<Record<string, unknown>>): Record<string, unknown> {
  const canonical = text(row.canonical_json);
  const recorded = text(row.sha256);
  requireRule(DIGEST_PATTERN.test(recorded) && sha256Hex(canonical) === recorded, 'DEFAULT_EXECUTION_RULE_RECORD_INVALID', '默认执行规则记录与其摘要不一致。');
  const record = parseCanonicalJson(canonical);
  requireRule(isRecord(record) && Object.entries(facts).every(([key, value]) => record[key] === value),
    'DEFAULT_EXECUTION_RULE_RECORD_INVALID', '默认执行规则记录与其字段不一致。');
  return record as Record<string, unknown>;
}

function transact<T>(db: DatabaseSync, operation: () => T): T {
  if (db.isTransaction) return operation();
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = operation();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch (rollbackError) {
      throw new AggregateError([error, rollbackError], 'Default execution rule transaction rollback failed.');
    }
    throw error;
  }
}

/**
 * The rule ledger of one store. Setting a rule appends; changing it appends its next version; turning it off
 * appends a state row. Nothing is rewritten, so every version a Run authorization ever named stays readable.
 */
export class DefaultExecutionRuleLedger {
  readonly #db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.#db = db;
  }

  /**
   * `设为快速开始默认…` from the plan the editor viewed: the Book's rule for the pattern — created with its first
   * version, or given its next one — and the state row that puts that version in force. The plan that set the
   * version in force, set again, answers with the rule as it is.
   */
  set(input: {
    bookId: string;
    pattern: DefaultExecutionRulePattern;
    sourceTaskIntentId: string;
    sourcePlanEnvelopeDigest: string;
    binding: DefaultExecutionRuleBinding;
  }): DefaultExecutionRuleRecord {
    requireRule(UUID_PATTERN.test(input.bookId) && UUID_PATTERN.test(input.sourceTaskIntentId) &&
      DIGEST_PATTERN.test(input.sourcePlanEnvelopeDigest) && DEFAULT_EXECUTION_RULE_PATTERNS.includes(input.pattern) && isBinding(input.binding),
    'DEFAULT_EXECUTION_RULE_INVALID', '默认执行规则的参数无效。');
    return transact(this.#db, () => {
      const now = new Date().toISOString();
      let ruleId = this.#ruleId(input.bookId, input.pattern);
      const current = ruleId === null ? null : this.#read(ruleId);
      if (current !== null && current.state === 'active' && current.version.sourcePlanEnvelopeDigest === input.sourcePlanEnvelopeDigest) return current;
      if (ruleId === null) {
        ruleId = randomUUID();
        const rule = canonicalRecord({
          schema: RULE_SCHEMA, ruleId, bookId: input.bookId, taskKind: DEFAULT_EXECUTION_RULE_KIND, taskPattern: input.pattern,
          applicability: 'book', createdAt: now,
        });
        this.#db.prepare(
          `INSERT INTO default_execution_rules(rule_id, book_id, task_kind, task_pattern, created_at, canonical_json, sha256)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ).run(ruleId, input.bookId, DEFAULT_EXECUTION_RULE_KIND, input.pattern, now, rule.json, rule.digest);
      }
      const ruleVersionId = randomUUID();
      const ordinal = current === null ? 1 : current.version.ordinal + 1;
      const version = canonicalRecord({
        schema: VERSION_SCHEMA, ruleVersionId, ruleId, ordinal, sourceTaskIntentId: input.sourceTaskIntentId,
        sourcePlanEnvelopeDigest: input.sourcePlanEnvelopeDigest, binding: input.binding, actor: ACTOR, createdAt: now,
      });
      this.#db.prepare(
        `INSERT INTO default_execution_rule_versions(rule_version_id, rule_id, ordinal, source_task_intent_id, source_plan_envelope_sha256, actor, created_at, canonical_json, sha256)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(ruleVersionId, ruleId, ordinal, input.sourceTaskIntentId, input.sourcePlanEnvelopeDigest, ACTOR, now, version.json, version.digest);
      this.#appendState(ruleId, 'active', ruleVersionId, now);
      return this.#read(ruleId)!;
    });
  }

  /** 停用: the rule stays on record with every version, and quick start stops using it. Turning it off twice answers as once. */
  deactivate(ruleId: string): DefaultExecutionRuleRecord {
    requireRule(UUID_PATTERN.test(ruleId), 'DEFAULT_EXECUTION_RULE_INVALID', '默认执行规则标识无效。');
    return transact(this.#db, () => {
      const current = this.#read(ruleId);
      requireRule(current !== null, 'DEFAULT_EXECUTION_RULE_NOT_FOUND', '这条默认执行规则不存在。');
      if (current.state === 'deactivated') return current;
      this.#appendState(ruleId, 'deactivated', current.version.ruleVersionId, new Date().toISOString());
      return this.#read(ruleId)!;
    });
  }

  /** The Book's rule for the pattern, in force or turned off; `null` when none was ever set. */
  forPattern(bookId: string, pattern: DefaultExecutionRulePattern): DefaultExecutionRuleRecord | null {
    const ruleId = this.#ruleId(bookId, pattern);
    return ruleId === null ? null : this.#read(ruleId);
  }

  /** The Book's rule for the pattern while it is in force. */
  activeFor(bookId: string, pattern: DefaultExecutionRulePattern): DefaultExecutionRuleRecord | null {
    const rule = this.forPattern(bookId, pattern);
    return rule !== null && rule.state === 'active' ? rule : null;
  }

  /** The rule a version belongs to and that version, whichever is in force now: a Run names the one it started under. */
  version(ruleVersionId: string): { rule: DefaultExecutionRuleRecord; version: DefaultExecutionRuleVersionRecord } | null {
    requireRule(UUID_PATTERN.test(ruleVersionId), 'DEFAULT_EXECUTION_RULE_INVALID', '默认执行规则版本标识无效。');
    const row = this.#db.prepare('SELECT * FROM default_execution_rule_versions WHERE rule_version_id = ?').get(ruleVersionId) as SqlRow | undefined;
    if (row === undefined) return null;
    const rule = this.#read(text(row.rule_id));
    requireRule(rule !== null, 'DEFAULT_EXECUTION_RULE_RECORD_INVALID', '默认执行规则版本指向的规则不存在。');
    return { rule, version: this.#versionOf(row) };
  }

  /** Every rule, each Book's together in the order they were set. */
  list(): ReadonlyArray<DefaultExecutionRuleRecord> {
    const rows = this.#db.prepare('SELECT rule_id FROM default_execution_rules ORDER BY book_id, created_at, rowid').all() as SqlRow[];
    return rows.map((row) => this.#read(text(row.rule_id))!);
  }

  #ruleId(bookId: string, pattern: DefaultExecutionRulePattern): string | null {
    const row = this.#db.prepare('SELECT rule_id FROM default_execution_rules WHERE book_id = ? AND task_kind = ? AND task_pattern = ?')
      .get(bookId, DEFAULT_EXECUTION_RULE_KIND, pattern) as SqlRow | undefined;
    return row === undefined ? null : text(row.rule_id);
  }

  #appendState(ruleId: string, state: 'active' | 'deactivated', ruleVersionId: string, recordedAt: string): void {
    const last = this.#db.prepare('SELECT max(sequence) last FROM default_execution_rule_states WHERE rule_id = ?').get(ruleId) as SqlRow;
    const sequence = last.last === null ? 1 : integer(last.last) + 1;
    const record = canonicalRecord({ schema: STATE_SCHEMA, ruleId, sequence, state, ruleVersionId, actor: ACTOR, recordedAt });
    this.#db.prepare(
      `INSERT INTO default_execution_rule_states(rule_id, sequence, state, rule_version_id, actor, recorded_at, canonical_json, sha256)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(ruleId, sequence, state, ruleVersionId, ACTOR, recordedAt, record.json, record.digest);
  }

  #versionOf(row: SqlRow): DefaultExecutionRuleVersionRecord {
    const ruleVersionId = text(row.rule_version_id);
    const ordinal = integer(row.ordinal);
    const sourceTaskIntentId = text(row.source_task_intent_id);
    const sourcePlanEnvelopeDigest = text(row.source_plan_envelope_sha256);
    const createdAt = text(row.created_at);
    const record = requireRecord(row, {
      schema: VERSION_SCHEMA, ruleVersionId, ruleId: text(row.rule_id), ordinal, sourceTaskIntentId, sourcePlanEnvelopeDigest,
      actor: text(row.actor), createdAt,
    });
    const binding = record.binding;
    requireRule(isBinding(binding), 'DEFAULT_EXECUTION_RULE_RECORD_INVALID', '默认执行规则记录的绑定无效。');
    return { ruleVersionId, ordinal, sourceTaskIntentId, sourcePlanEnvelopeDigest, binding, createdAt };
  }

  /** One rule, read back and verified: the rule row, its last state, and the version that state names. */
  #read(ruleId: string): DefaultExecutionRuleRecord | null {
    const row = this.#db.prepare('SELECT * FROM default_execution_rules WHERE rule_id = ?').get(ruleId) as SqlRow | undefined;
    if (row === undefined) return null;
    const bookId = text(row.book_id);
    const pattern = text(row.task_pattern);
    const createdAt = text(row.created_at);
    requireRule(text(row.task_kind) === DEFAULT_EXECUTION_RULE_KIND && (DEFAULT_EXECUTION_RULE_PATTERNS as readonly string[]).includes(pattern),
      'DEFAULT_EXECUTION_RULE_RECORD_INVALID', '默认执行规则记录无效。');
    requireRecord(row, { schema: RULE_SCHEMA, ruleId, bookId, taskKind: DEFAULT_EXECUTION_RULE_KIND, taskPattern: pattern, applicability: 'book', createdAt });
    const stateRow = this.#db.prepare('SELECT * FROM default_execution_rule_states WHERE rule_id = ? ORDER BY sequence DESC LIMIT 1').get(ruleId) as SqlRow | undefined;
    // A rule, its first version and its first state are written in one transaction: a rule without a state is not one this ledger wrote.
    requireRule(stateRow !== undefined, 'DEFAULT_EXECUTION_RULE_RECORD_INVALID', '默认执行规则缺少状态记录。');
    const state = text(stateRow.state);
    requireRule(state === 'active' || state === 'deactivated', 'DEFAULT_EXECUTION_RULE_RECORD_INVALID', '默认执行规则状态无效。');
    const stateRecordedAt = text(stateRow.recorded_at);
    const ruleVersionId = text(stateRow.rule_version_id);
    requireRecord(stateRow, {
      schema: STATE_SCHEMA, ruleId, sequence: integer(stateRow.sequence), state, ruleVersionId, actor: text(stateRow.actor), recordedAt: stateRecordedAt,
    });
    const versionRow = this.#db.prepare('SELECT * FROM default_execution_rule_versions WHERE rule_version_id = ? AND rule_id = ?')
      .get(ruleVersionId, ruleId) as SqlRow | undefined;
    requireRule(versionRow !== undefined, 'DEFAULT_EXECUTION_RULE_RECORD_INVALID', '默认执行规则状态指向的版本不存在。');
    return {
      ruleId, bookId, taskKind: DEFAULT_EXECUTION_RULE_KIND, pattern: pattern as DefaultExecutionRulePattern, createdAt,
      state, stateRecordedAt, version: this.#versionOf(versionRow),
    };
  }
}

// ---- words -----------------------------------------------------------------------------------------------

/** Whether a Task mode is one a rule may cover (S75 D3). */
export function isDefaultExecutionRulePattern(mode: string): mode is DefaultExecutionRulePattern {
  return (DEFAULT_EXECUTION_RULE_PATTERNS as readonly string[]).includes(mode);
}

/** 知识库 › 工序与规则's statement (TASK-028): a rule is not a standing authorization. */
export const DEFAULT_EXECUTION_RULES_STATEMENT =
  '默认执行规则只在你点快速开始时使用：它不会自己开始任何任务；每次开始都会留下那一次的计划和运行授权，并写明按哪一版规则开始。';

/** What 快速开始 does under a rule of the pattern. */
export function defaultExecutionRuleDoes(pattern: DefaultExecutionRulePattern): string {
  const what = pattern === 'sync-current' ? '只重新分析改动过的部分，其余沿用' : '把整本书重新分析一遍';
  return `点「${DEFAULT_EXECUTION_RULE_QUICK_LABELS[pattern]}」后，AI7 先准备计划：计划与这条规则一致时直接开始，${what}；有任何不同都停在计划上，等你看过再开始。`;
}

// ②A's quick start, before anything is prepared.
export const QUICK_START_RANGE_REASON = '重新分析所选范围每次都要先选范围，没有快速开始；请先看计划。';
export function quickStartNoRuleReason(pattern: DefaultExecutionRulePattern): string {
  return `这本书还没有「${DEFAULT_EXECUTION_RULE_QUICK_LABELS[pattern]}」的默认执行规则：先看计划，可以在完整计划里设为快速开始默认。`;
}
/** Provider Processing v5 to v7: `matchingActiveDefaultExecutionRuleAllowed: false` under developer-live. */
export const QUICK_START_DEVELOPER_LIVE = '开发者实时模式下不用默认执行规则：每次都先看计划，再开始任务。';
export const QUICK_START_MODE_UNAVAILABLE = '这种更新现在不能开始。';
/** The rule's facts and the Book's — or the prepared plan's — differ in these fields (TASK-026: fall back, never widen). */
export function ruleDriftReason(ruleName: string, labels: ReadonlyArray<string>): string {
  return `默认执行规则「${ruleName}」定下的${labels.map((label) => `「${label}」`).join('、')}已经变化，不能按规则直接开始；请看过计划后再开始，也可以把新的计划设为快速开始默认。`;
}

// A quick start that stopped at the plan (TASK-026): the plan stands prepared, and the reason says why it did not start.
export const QUICK_START_RULE_CHANGED = '这条默认执行规则刚刚停用或改过，这次没有按规则开始；请看过计划后再开始。';
export const QUICK_START_PLAN_CHANGED = '计划的关键内容已变化，这次没有按规则开始；请查看计划修订并重新确认计划。';
export const QUICK_START_NEEDS_CONNECTION = '模型未连接：这份计划要发送到模型服务，所需的凭据还没有就绪；连接好之后再开始。';
export const QUICK_START_OFFLINE = '离线：这份计划要连到模型服务，而这台设备现在没有网络；可以在计划里选择联网后开始任务。';
export const QUICK_START_SLOT_BUSY = '另一项任务正在运行；它结束后再开始。';
export const QUICK_START_NOT_READY = '这份计划现在不能开始；请看过计划后再开始。';

// The drawer's `设为快速开始默认…`.
export const SET_RULE_FIRST_BASELINE = '首次基线分析只做一次，不能设为快速开始默认。';
export const SET_RULE_RANGE = '重新分析所选范围每次都要先选范围，不能设为快速开始默认。';
export const SET_RULE_DEVELOPER_LIVE = '开发者实时模式下不能设快速开始默认：每次都先看计划，再开始任务。';
export const SET_RULE_CHANGED = '计划的关键内容已变化；重新确认计划后才能设为快速开始默认。';
/**
 * A rule binds a plan's allowed variability and outcome classes exactly (TASK-022), and a quick start prepares the plan
 * as the procedure proposes it: a plan the editor edited cannot be the rule, which would start without those edits.
 */
export const SET_RULE_EDITED = '这份计划改过步骤或限制；快速开始按工序原样准备计划，不会带上这些修改，所以不能设为快速开始默认。';
export function setRuleAlreadyReason(ruleName: string): string {
  return `默认执行规则「${ruleName}」就是由这份计划设定的，正在使用。`;
}
export const RULE_STATE_LABELS = { active: '使用中', deactivated: '已停用' } as const;
