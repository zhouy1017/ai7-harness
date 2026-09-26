import { randomUUID } from 'node:crypto';
import type { DatabaseSync, SQLOutputValue } from 'node:sqlite';
import {
  MAX_PRODUCTION_DOCUMENT_PHASE_REASON_CHARACTERS,
  PRODUCTION_DOCUMENT_PHASE_IDS,
  PRODUCTION_DOCUMENT_PHASE_LABELS,
  PRODUCTION_DOCUMENT_PHASE_STATE_LABELS,
  PRODUCTION_DOCUMENT_PHASE_WAITING_LABEL,
  PRODUCTION_DOCUMENT_REOPEN_REASONS,
  PRODUCTION_DOCUMENT_SKIP_REASONS,
  type ProductionDocumentPhaseAction,
  type ProductionDocumentPhaseId,
  type ProductionDocumentPhaseProjection,
  type ProductionDocumentPhaseState,
  type ProductionDocumentPhaseTransitionProjection,
  type ProductionDocumentWorkflowProjection,
  type TransitionProductionDocumentPhaseInput,
} from '../shared/protocol.js';
import { canonicalRecord, isRecord, parseCanonicalJson } from './analysis/canonical.js';

/**
 * A Production Document's Deliverable Workflow (Issue #415, plan slice S66c; V2-UX-WORK-001 to 009, WORK-011; editor-surfaces
 * §9 文档稿件面). Every document follows the Book's built-in workflow profile, pinned when the document began (WORK-002),
 * through its seven shared phases (WORK-003). Several may be open at once (WORK-004). Only the editor's deterministic
 * commands move a phase — 开始, 完成, 跳过 and 重新打开, the last two with a reason chosen from an unselected set or written
 * (WORK-008, WORK-009) — and a move grants nothing else (WORK-011). No Task, Run, model outcome or Effect moves one.
 *
 * Schema revision 40 owns two relations, ledgers like the others: a row is appended once and never rewritten or removed.
 *
 * - `production_document_workflow_instances`: the profile a document follows and since when — one per document,
 *   recorded with the document. A revision-39 store gains one for every document it holds, activated when the
 *   document was made, and nothing existing moves.
 * - `production_document_phase_transitions`: every move of every phase of a document, in order, with its prior state,
 *   its new one and a skip's or reopen's reason. The latest move of a phase is its state; history is never deleted.
 *
 * The profile defines no gates yet (`gates: []`), so no phase has a gate card: WGATE-001 to 011 wait for a profile
 * that defines them (S66d).
 */
export const PRODUCTION_DOCUMENT_WORKFLOW_SCHEMA_SQL = {
  production_document_workflow_instances: `CREATE TABLE production_document_workflow_instances (
  document_id TEXT PRIMARY KEY REFERENCES production_documents(document_id),
  profile_id TEXT NOT NULL CHECK(length(profile_id) BETWEEN 1 AND 128),
  profile_name TEXT NOT NULL CHECK(length(profile_name) BETWEEN 1 AND 64),
  profile_version TEXT NOT NULL CHECK(length(profile_version) BETWEEN 1 AND 32),
  profile_digest TEXT NOT NULL CHECK(length(profile_digest) = 64),
  activated_at TEXT NOT NULL,
  canonical_json TEXT NOT NULL,
  sha256 TEXT NOT NULL UNIQUE CHECK(length(sha256) = 64)
) STRICT`,
  production_document_phase_transitions: `CREATE TABLE production_document_phase_transitions (
  transition_id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES production_document_workflow_instances(document_id),
  ordinal INTEGER NOT NULL CHECK(ordinal >= 1),
  phase_id TEXT NOT NULL CHECK(phase_id IN ('intake', 'source-development', 'drafting', 'review-verification', 'finalization', 'delivery', 'maintenance')),
  action TEXT NOT NULL CHECK(action IN ('start', 'complete', 'skip', 'reopen')),
  from_state TEXT NOT NULL CHECK(from_state IN ('not-started', 'in-progress', 'completed', 'skipped', 'reopened')),
  to_state TEXT NOT NULL CHECK(to_state IN ('in-progress', 'completed', 'skipped', 'reopened')),
  reason_choice TEXT,
  reason_text TEXT,
  actor TEXT NOT NULL CHECK(actor = '本机编辑'),
  recorded_at TEXT NOT NULL,
  canonical_json TEXT NOT NULL,
  sha256 TEXT NOT NULL UNIQUE CHECK(length(sha256) = 64),
  CHECK((action = 'start' AND from_state = 'not-started' AND to_state = 'in-progress')
    OR (action = 'complete' AND from_state IN ('in-progress', 'reopened') AND to_state = 'completed')
    OR (action = 'skip' AND from_state IN ('not-started', 'in-progress', 'reopened') AND to_state = 'skipped')
    OR (action = 'reopen' AND from_state IN ('completed', 'skipped') AND to_state = 'reopened')),
  CHECK((action IN ('skip', 'reopen')) = (reason_choice IS NOT NULL)),
  CHECK(reason_choice IS NOT NULL OR reason_text IS NULL),
  CHECK(reason_choice <> 'custom' OR reason_text IS NOT NULL),
  CHECK(reason_text IS NULL OR length(reason_text) BETWEEN 1 AND ${MAX_PRODUCTION_DOCUMENT_PHASE_REASON_CHARACTERS * 4}),
  UNIQUE(document_id, ordinal)
) STRICT`,
} as const;

export const PRODUCTION_DOCUMENT_WORKFLOW_TRIGGER_SQL: Readonly<Record<string, string>> = Object.fromEntries(
  Object.keys(PRODUCTION_DOCUMENT_WORKFLOW_SCHEMA_SQL).flatMap((table) => [
    [`${table}_no_update`, `CREATE TRIGGER ${table}_no_update
    BEFORE UPDATE ON ${table}
    BEGIN
      SELECT RAISE(ABORT, 'PRODUCTION_DOCUMENT_WORKFLOW_LEDGER_IMMUTABLE');
    END`],
    [`${table}_no_delete`, `CREATE TRIGGER ${table}_no_delete
    BEFORE DELETE ON ${table}
    BEGIN
      SELECT RAISE(ABORT, 'PRODUCTION_DOCUMENT_WORKFLOW_LEDGER_IMMUTABLE');
    END`],
  ]),
);

export const PRODUCTION_DOCUMENT_WORKFLOW_FOREIGN_KEYS: Readonly<Record<string, ReadonlyArray<string>>> = {
  production_document_workflow_instances: ['document_id>production_documents.document_id:NO ACTION/NO ACTION/NONE'],
  production_document_phase_transitions: ['document_id>production_document_workflow_instances.document_id:NO ACTION/NO ACTION/NONE'],
};

/** The profile a document follows, as the instance pins it (WORK-002). */
export interface WorkflowProfilePin {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly digest: string;
}

const INSTANCE_SCHEMA = 'ai7.production-document-workflow-instance/1';
const TRANSITION_SCHEMA = 'ai7.production-document-phase-transition/1';
const ACTOR = '本机编辑';

export class ProductionDocumentWorkflowError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'ProductionDocumentWorkflowError';
  }
}

function requireWorkflow(condition: unknown, code: string, message: string): asserts condition {
  if (!condition) throw new ProductionDocumentWorkflowError(code, message);
}

type SqlRow = Record<string, SQLOutputValue>;

function text(value: SQLOutputValue | undefined): string {
  requireWorkflow(typeof value === 'string', 'PRODUCTION_DOCUMENT_RECORD_INVALID', '工作流程记录无效。');
  return value;
}

function nullableText(value: SQLOutputValue | undefined): string | null {
  return value === null ? null : text(value);
}

function integer(value: SQLOutputValue | undefined): number {
  requireWorkflow(typeof value === 'number' && Number.isSafeInteger(value), 'PRODUCTION_DOCUMENT_RECORD_INVALID', '工作流程记录无效。');
  return value;
}

function instanceRecord(documentId: string, profile: WorkflowProfilePin, activatedAt: string) {
  return canonicalRecord({
    schema: INSTANCE_SCHEMA,
    documentId,
    profile: { id: profile.id, name: profile.name, version: profile.version, digest: profile.digest },
    activatedAt,
  });
}

function insertInstance(db: DatabaseSync, documentId: string, profile: WorkflowProfilePin, activatedAt: string): void {
  const record = instanceRecord(documentId, profile, activatedAt);
  db.prepare(
    `INSERT INTO production_document_workflow_instances(
       document_id, profile_id, profile_name, profile_version, profile_digest, activated_at, canonical_json, sha256
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(documentId, profile.id, profile.name, profile.version, profile.digest, activatedAt, record.json, record.digest);
}

/**
 * Revision 40's relations, created once (shape-detected): a revision-39 store gains them and one instance per document it
 * holds — the profile in force, activated when the document was made — and nothing existing moves.
 */
export function initializeProductionDocumentWorkflowSchema(db: DatabaseSync, profile: WorkflowProfilePin): void {
  if (db.prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'production_document_workflow_instances'").get() !== undefined) return;
  if (db.prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'production_documents'").get() === undefined) return;
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const sql of Object.values(PRODUCTION_DOCUMENT_WORKFLOW_SCHEMA_SQL)) db.exec(sql);
    for (const sql of Object.values(PRODUCTION_DOCUMENT_WORKFLOW_TRIGGER_SQL)) db.exec(sql);
    const documents = db.prepare('SELECT document_id, created_at FROM production_documents ORDER BY created_at, rowid').iterate();
    for (const row of documents) insertInstance(db, text(row.document_id), profile, text(row.created_at));
    db.exec('COMMIT');
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch (rollbackError) {
      throw new AggregateError([error, rollbackError], 'Production Document workflow schema rollback failed.');
    }
    throw error;
  }
  requireWorkflow(db.prepare('PRAGMA foreign_key_check').all().length === 0, 'SCHEMA_INVALID', '生产文档工作流程的关系与已有记录不一致。');
}

/** What a phase may move to, from each state (WORK-004, WORK-009). */
const MOVES: Readonly<Record<ProductionDocumentPhaseAction, { from: ReadonlyArray<ProductionDocumentPhaseState>; to: ProductionDocumentPhaseState }>> = {
  start: { from: ['not-started'], to: 'in-progress' },
  complete: { from: ['in-progress', 'reopened'], to: 'completed' },
  skip: { from: ['not-started', 'in-progress', 'reopened'], to: 'skipped' },
  reopen: { from: ['completed', 'skipped'], to: 'reopened' },
};
const OPEN_STATES: ReadonlySet<ProductionDocumentPhaseState> = new Set(['in-progress', 'reopened']);

function reasonLabel(action: ProductionDocumentPhaseAction, choice: string): string | undefined {
  const reasons: Readonly<Record<string, string>> = action === 'skip' ? PRODUCTION_DOCUMENT_SKIP_REASONS : PRODUCTION_DOCUMENT_REOPEN_REASONS;
  return Object.hasOwn(reasons, choice) ? reasons[choice] : undefined;
}

/** What the document's own facts say an open phase waits on (WORK-004's 等待你处理); never recorded. */
export interface ProductionDocumentWorkflowFacts {
  readonly changedSinceVersion: boolean;
  readonly delivered: boolean;
  readonly deliveryExported: boolean;
  readonly changedSinceDelivery: boolean;
  readonly openSuggestions: number;
}

function waitingOn(phaseId: ProductionDocumentPhaseId, facts: ProductionDocumentWorkflowFacts): string | null {
  if (phaseId === 'review-verification') return facts.openSuggestions > 0 ? `${facts.openSuggestions} 条修改建议待处理` : null;
  if (phaseId === 'delivery') {
    if (facts.changedSinceVersion) return '有修改尚未保存为版本';
    if (!facts.delivered) return '尚未交付';
    if (facts.changedSinceDelivery) return '交付后有修改';
    if (!facts.deliveryExported) return '交付文件尚未导出';
  }
  return null;
}

interface TransitionFacts {
  ordinal: number;
  phaseId: ProductionDocumentPhaseId;
  action: ProductionDocumentPhaseAction;
  fromState: ProductionDocumentPhaseState;
  toState: ProductionDocumentPhaseState;
  reasonChoice: string | null;
  /** The reason's words as the move recorded them, or, for a move recorded before its words were, the key's words now. */
  reasonLabel: string | null;
  reasonText: string | null;
  recordedAt: string;
}

/** The longest words a recorded reason may carry: its choice's label, never the editor's own text. */
const MAX_REASON_LABEL_CHARACTERS = 40;

export class ProductionDocumentWorkflow {
  readonly #db: DatabaseSync;
  readonly #profile: WorkflowProfilePin;

  constructor(db: DatabaseSync, profile: WorkflowProfilePin) {
    this.#db = db;
    this.#profile = profile;
  }

  /** The instance a new document begins with, in the caller's transaction (WORK-002). */
  recordInstance(documentId: string, activatedAt: string): void {
    insertInstance(this.#db, documentId, this.#profile, activatedAt);
  }

  /** A document's lens as its records and its own facts stand now. */
  projection(documentId: string, facts: ProductionDocumentWorkflowFacts): ProductionDocumentWorkflowProjection {
    const instance = this.#instance(documentId);
    const transitions = this.#transitions(documentId);
    const phases = PRODUCTION_DOCUMENT_PHASE_IDS.map((phaseId): ProductionDocumentPhaseProjection => {
      const own = transitions.phases.get(phaseId);
      const state: ProductionDocumentPhaseState = own?.latest.toState ?? 'not-started';
      const waiting = OPEN_STATES.has(state) ? waitingOn(phaseId, facts) : null;
      const last = own?.latest;
      const latest: ProductionDocumentPhaseTransitionProjection | null = last === undefined ? null : {
        action: last.action,
        fromState: last.fromState,
        toState: last.toState,
        reason: last.reasonChoice === null ? null : { choice: last.reasonChoice, label: last.reasonLabel!, text: last.reasonText },
        recordedAt: last.recordedAt,
      };
      return {
        phaseId,
        label: PRODUCTION_DOCUMENT_PHASE_LABELS[phaseId],
        state,
        stateLabel: waiting === null ? PRODUCTION_DOCUMENT_PHASE_STATE_LABELS[state] : PRODUCTION_DOCUMENT_PHASE_WAITING_LABEL,
        waiting,
        actions: (Object.keys(MOVES) as ProductionDocumentPhaseAction[]).filter((action) => MOVES[action].from.includes(state)),
        latest,
        moves: own?.moves ?? 0,
      };
    });
    const open = phases.filter((phase) => OPEN_STATES.has(phase.state));
    const waiting = open.filter((phase) => phase.waiting !== null);
    const untouched = phases.every((phase) => phase.state === 'not-started');
    const settled = phases.every((phase) => phase.state === 'completed' || phase.state === 'skipped');
    return {
      profile: { id: instance.profile.id, name: instance.profile.name, version: instance.profile.version, activatedAt: instance.activatedAt },
      summary: untouched ? '七个阶段都未开始' : settled ? '七个阶段都已完成或跳过' : `${open.length} 个阶段进行中 · ${waiting.length} 项等待处理`,
      next: [
        ...waiting.map((phase) => ({ phaseId: phase.phaseId, text: `${phase.label} · ${phase.waiting!}` })),
        ...open.filter((phase) => phase.waiting === null).map((phase) => ({ phaseId: phase.phaseId, text: `${phase.label} · ${phase.stateLabel}` })),
      ],
      phases,
      transitions: transitions.count,
    };
  }

  /**
   * One deterministic move of one phase (WORK-008, WORK-009), in the caller's transaction: the move must be open to the
   * phase's state, a skip or a reopen carries its reason, and the count of moves must be the one the editor saw.
   */
  transition(input: TransitionProductionDocumentPhaseInput, recordedAt: string): void {
    requireWorkflow(PRODUCTION_DOCUMENT_PHASE_IDS.includes(input.phaseId) && Object.hasOwn(MOVES, input.action) &&
      Number.isSafeInteger(input.expectedTransitions) && input.expectedTransitions >= 0,
    'PRODUCTION_DOCUMENT_PHASE_INVALID', '工作流程操作无效。');
    this.#instance(input.documentId);
    const transitions = this.#transitions(input.documentId);
    requireWorkflow(transitions.count === input.expectedTransitions, 'PRODUCTION_DOCUMENT_WORKFLOW_CHANGED',
      '工作流程在你查看后有了变化，请看过新的状态再操作。');
    const fromState: ProductionDocumentPhaseState = transitions.phases.get(input.phaseId)?.latest.toState ?? 'not-started';
    const move = MOVES[input.action];
    requireWorkflow(move.from.includes(fromState), 'PRODUCTION_DOCUMENT_PHASE_INVALID',
      `「${PRODUCTION_DOCUMENT_PHASE_LABELS[input.phaseId]}」现在是${PRODUCTION_DOCUMENT_PHASE_STATE_LABELS[fromState]}，不能这样操作。`);
    const reason = this.#reason(input);
    const transitionId = randomUUID();
    const ordinal = transitions.count + 1;
    const record = canonicalRecord({
      schema: TRANSITION_SCHEMA,
      transitionId,
      documentId: input.documentId,
      ordinal,
      phaseId: input.phaseId,
      action: input.action,
      fromState,
      toState: move.to,
      reason,
      actor: ACTOR,
      recordedAt,
    });
    this.#db.prepare(
      `INSERT INTO production_document_phase_transitions(
         transition_id, document_id, ordinal, phase_id, action, from_state, to_state, reason_choice, reason_text,
         actor, recorded_at, canonical_json, sha256
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(transitionId, input.documentId, ordinal, input.phaseId, input.action, fromState, move.to,
      reason?.choice ?? null, reason?.text ?? null, ACTOR, recordedAt, record.json, record.digest);
  }

  /**
   * A skip's or a reopen's reason as it will be recorded, or `null` for 开始 and 完成 — which take none. The move records the
   * choice's words as the editor read them (WORK-009; Issue #626), so a later relabel never rewrites what a past move says.
   */
  #reason(input: TransitionProductionDocumentPhaseInput): { choice: string; label: string; text: string | null } | null {
    if (input.action !== 'skip' && input.action !== 'reopen') {
      requireWorkflow(input.reason === null, 'PRODUCTION_DOCUMENT_PHASE_INVALID', '开始和完成不需要原因。');
      return null;
    }
    requireWorkflow(input.reason !== null && typeof input.reason.choice === 'string' && reasonLabel(input.action, input.reason.choice) !== undefined,
      'PRODUCTION_DOCUMENT_PHASE_REASON_REQUIRED', input.action === 'skip' ? '请选择跳过的原因。' : '请选择重新打开的原因。');
    const raw = input.reason.text;
    const words = raw === null ? null : raw.normalize('NFC').trim();
    requireWorkflow(words === null || (words.isWellFormed() && [...words].length <= MAX_PRODUCTION_DOCUMENT_PHASE_REASON_CHARACTERS),
      'PRODUCTION_DOCUMENT_PHASE_REASON_INVALID', `原因最多 ${MAX_PRODUCTION_DOCUMENT_PHASE_REASON_CHARACTERS} 个字。`);
    const kept = words === null || words.length === 0 ? null : words;
    requireWorkflow(input.reason.choice !== 'custom' || kept !== null, 'PRODUCTION_DOCUMENT_PHASE_REASON_REQUIRED', '选了「自行输入」，请写下原因。');
    return { choice: input.reason.choice, label: reasonLabel(input.action, input.reason.choice)!, text: kept };
  }

  #instance(documentId: string): { profile: WorkflowProfilePin; activatedAt: string } {
    const row = this.#db.prepare('SELECT * FROM production_document_workflow_instances WHERE document_id = ?').get(documentId) as SqlRow | undefined;
    requireWorkflow(row !== undefined, 'PRODUCTION_DOCUMENT_RECORD_INVALID', '生产文档缺少工作流程记录。');
    const profile = { id: text(row.profile_id), name: text(row.profile_name), version: text(row.profile_version), digest: text(row.profile_digest) };
    const activatedAt = text(row.activated_at);
    const record = instanceRecord(documentId, profile, activatedAt);
    requireWorkflow(record.json === text(row.canonical_json) && record.digest === text(row.sha256),
      'PRODUCTION_DOCUMENT_RECORD_INVALID', '生产文档的工作流程记录与其内容不一致。');
    return { profile, activatedAt };
  }

  /** Validate the ledger as a stream, retaining only one latest move and count per phase. */
  #transitions(documentId: string): { count: number; phases: Map<ProductionDocumentPhaseId, { moves: number; latest: TransitionFacts }> } {
    const rows = this.#db.prepare('SELECT * FROM production_document_phase_transitions WHERE document_id = ? ORDER BY ordinal').iterate(documentId);
    const phases = new Map<ProductionDocumentPhaseId, { moves: number; latest: TransitionFacts }>();
    let count = 0;
    for (const row of rows) {
      const facts: TransitionFacts = {
        ordinal: integer(row.ordinal),
        phaseId: text(row.phase_id) as ProductionDocumentPhaseId,
        action: text(row.action) as ProductionDocumentPhaseAction,
        fromState: text(row.from_state) as ProductionDocumentPhaseState,
        toState: text(row.to_state) as ProductionDocumentPhaseState,
        reasonChoice: nullableText(row.reason_choice),
        reasonLabel: null,
        reasonText: nullableText(row.reason_text),
        recordedAt: text(row.recorded_at),
      };
      // The words a move recorded with its reason are read back from its own record, which its digest covers (Issue #626).
      const stored = parseCanonicalJson(text(row.canonical_json));
      const storedReason = isRecord(stored) && isRecord(stored.reason) ? stored.reason : null;
      const recordedLabel = storedReason !== null && 'label' in storedReason ? storedReason.label : undefined;
      requireWorkflow(recordedLabel === undefined || (typeof recordedLabel === 'string' && recordedLabel.length >= 1 &&
        [...recordedLabel].length <= MAX_REASON_LABEL_CHARACTERS), 'PRODUCTION_DOCUMENT_RECORD_INVALID', '生产文档的工作流程记录与其内容不一致。');
      facts.reasonLabel = facts.reasonChoice === null ? null
        : typeof recordedLabel === 'string' ? recordedLabel : reasonLabel(facts.action, facts.reasonChoice) ?? null;
      const record = canonicalRecord({
        schema: TRANSITION_SCHEMA,
        transitionId: text(row.transition_id),
        documentId,
        ordinal: facts.ordinal,
        phaseId: facts.phaseId,
        action: facts.action,
        fromState: facts.fromState,
        toState: facts.toState,
        reason: facts.reasonChoice === null ? null
          : typeof recordedLabel === 'string' ? { choice: facts.reasonChoice, label: recordedLabel, text: facts.reasonText }
            : { choice: facts.reasonChoice, text: facts.reasonText },
        actor: text(row.actor),
        recordedAt: facts.recordedAt,
      });
      // A reason reads when its words were recorded with it, or, for a move recorded before they were, when its key still
      // names a reason — which is why no shipped key is ever removed (the unit suite holds them).
      requireWorkflow(PRODUCTION_DOCUMENT_PHASE_IDS.includes(facts.phaseId) && facts.ordinal === count + 1 &&
        record.json === text(row.canonical_json) && record.digest === text(row.sha256) &&
        (facts.reasonChoice === null || facts.reasonLabel !== null),
      'PRODUCTION_DOCUMENT_RECORD_INVALID', '生产文档的工作流程记录与其内容不一致。');
      phases.set(facts.phaseId, { moves: (phases.get(facts.phaseId)?.moves ?? 0) + 1, latest: facts });
      count += 1;
    }
    return { count, phases };
  }
}
