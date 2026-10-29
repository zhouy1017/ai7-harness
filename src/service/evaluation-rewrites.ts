import type { DatabaseSync, SQLOutputValue } from 'node:sqlite';
import { clarificationPromptContractDigest } from './provider/clarification-contract.js';
import {
  EVALUATION_REWRITE_KIND,
  MAX_EVALUATION_EVIDENCE_NOTES,
  type EvaluationContent,
  type EvaluationProfileProjection,
  type EvaluationRewriteWorkspaceProjection,
  type EvaluationRewriteProjection,
  EVALUATION_REWRITE_LIVE_UNAVAILABLE,
  type LaunchPolicyProjection,
  EVALUATION_REWRITE_MODE_GOALS,
  type EvaluationRewriteDecision,
  type EvaluationWorkspaceProjection,
  INITIAL_EVALUATION_KIND,
  READERS_REPORT_KIND,
} from '../shared/protocol.js';
import type { EvaluationInitialDraft, AcceptedEvaluationRewrite, EvaluationRecords } from './evaluation-records.js';
import { EVALUATION_ADJUSTMENT_REASON_WORDS, evaluationItemAdjusted } from '../shared/evaluation-scoring.js';
import { UUID_PATTERN, canonicalRecord, isRecord, parseStoredJson, sha256Hex } from './analysis/canonical.js';
import { disclosedNote, producedUnverified } from './evaluation/unverified-disclosure.js';
import {
  evaluationRewriteContract,
  evaluationRewriteContractDigest,
  type EvaluationRewriteContractInput,
} from './evaluation/evaluation-rewrite-contract.js';
import {
  BaselineAnalysisStore,
  type ProgressReader,
  type AnalysisPreparationResult,
  runIsActive,
  activeRunReason,
} from './analysis/baseline-analysis-store.js';
import { evaluationRewriteKindDefinition } from './evaluation/evaluation-rewrite-kind.js';
import { StoreError, requireStore, UUID_PATTERN as StoreUUID_PATTERN } from './store-records.js';
import { evaluationRewriteTaskStateLabel } from './task-plan.js';
import type { BoundedManuscriptStore } from './bounded-manuscript.js';
import { RecentCache } from './recent-cache.js';
import type { StoreControl, LedgerTaskKind } from './store.js';

/**
 * 按我的评分重写评语 (Issue #429, plan slice S81b2; V2-UX-EVAL-008; editor-surfaces §5 ②C): AI7 rewrites one Evaluation Record
 * version's item 评语 and its 总评 to the editor's scores, and the editor 采用 or 放弃 what it wrote.
 *
 * The rewriting is the `evaluation-rewrite` analysis kind's (`evaluation/evaluation-rewrite-*.ts`), on the analysis ledger like
 * every kind; the version is `evaluation-records.ts`'s, and 采用 appends to it as a save does. What neither knows is the bridge,
 * and schema revision 64 owns it in two relations, ledgers like the others — a row is appended once and never rewritten or
 * removed:
 *
 * - `evaluation_rewrite_tasks`: which version, at which saved entry (its ordinal and digest), one rewrite Task rewrites, with the
 *   frozen contract input — the version's words — and that contract's digest. A Task the analysis ledger revised in place for a
 *   later request may hold two; the one whose contract its frozen plan names is its own.
 * - `evaluation_rewrite_decisions`: the editor's one decision on one rewritten result — 采用, with the entry it appended, or
 *   放弃. A result is decided once; a version moved past the entry a rewrite read can no longer take it, only set it aside.
 */
export const EVALUATION_REWRITE_SCHEMA_SQL = {
  evaluation_rewrite_tasks: `CREATE TABLE evaluation_rewrite_tasks (
  task_intent_id TEXT NOT NULL REFERENCES analysis_task_intents(task_intent_id),
  prompt_contract_sha256 TEXT NOT NULL CHECK(length(prompt_contract_sha256) = 64),
  book_id TEXT NOT NULL REFERENCES books(book_id),
  record_id TEXT NOT NULL REFERENCES evaluation_records(record_id),
  entry_ordinal INTEGER NOT NULL CHECK(entry_ordinal >= 1),
  entry_sha256 TEXT NOT NULL CHECK(length(entry_sha256) = 64),
  recorded_at TEXT NOT NULL,
  canonical_json TEXT NOT NULL,
  sha256 TEXT NOT NULL UNIQUE CHECK(length(sha256) = 64),
  PRIMARY KEY(task_intent_id, prompt_contract_sha256)
) STRICT`,
  evaluation_rewrite_decisions: `CREATE TABLE evaluation_rewrite_decisions (
  analysis_revision_id TEXT PRIMARY KEY REFERENCES analysis_result_set_revisions(revision_id),
  book_id TEXT NOT NULL REFERENCES books(book_id),
  record_id TEXT NOT NULL REFERENCES evaluation_records(record_id),
  task_intent_id TEXT NOT NULL REFERENCES analysis_task_intents(task_intent_id),
  decision TEXT NOT NULL CHECK(decision IN ('accepted', 'discarded')),
  entry_ordinal INTEGER CHECK(entry_ordinal IS NULL OR entry_ordinal >= 2),
  recorded_at TEXT NOT NULL,
  canonical_json TEXT NOT NULL,
  sha256 TEXT NOT NULL UNIQUE CHECK(length(sha256) = 64),
  CHECK((decision = 'accepted') = (entry_ordinal IS NOT NULL))
) STRICT`,
} as const;

export const EVALUATION_REWRITE_TRIGGER_SQL: Readonly<Record<string, string>> = Object.fromEntries(
  Object.keys(EVALUATION_REWRITE_SCHEMA_SQL).flatMap((table) => [
    [`${table}_no_update`, `CREATE TRIGGER ${table}_no_update
    BEFORE UPDATE ON ${table}
    BEGIN
      SELECT RAISE(ABORT, 'EVALUATION_REWRITE_LEDGER_IMMUTABLE');
    END`],
    [`${table}_no_delete`, `CREATE TRIGGER ${table}_no_delete
    BEFORE DELETE ON ${table}
    BEGIN
      SELECT RAISE(ABORT, 'EVALUATION_REWRITE_LEDGER_IMMUTABLE');
    END`],
  ]),
);

/** The foreign keys of the two relations, in the exact-schema validator's own spelling. */
export const EVALUATION_REWRITE_FOREIGN_KEYS: Readonly<Record<string, ReadonlyArray<string>>> = {
  evaluation_rewrite_tasks: [
    'book_id>books.book_id:NO ACTION/NO ACTION/NONE',
    'record_id>evaluation_records.record_id:NO ACTION/NO ACTION/NONE',
    'task_intent_id>analysis_task_intents.task_intent_id:NO ACTION/NO ACTION/NONE',
  ],
  evaluation_rewrite_decisions: [
    'analysis_revision_id>analysis_result_set_revisions.revision_id:NO ACTION/NO ACTION/NONE',
    'book_id>books.book_id:NO ACTION/NO ACTION/NONE',
    'record_id>evaluation_records.record_id:NO ACTION/NO ACTION/NONE',
    'task_intent_id>analysis_task_intents.task_intent_id:NO ACTION/NO ACTION/NONE',
  ],
};

export class EvaluationRewriteError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'EvaluationRewriteError';
  }
}

function requireRewrite(condition: unknown, code: string, message: string): asserts condition {
  if (!condition) throw new EvaluationRewriteError(code, message);
}

type SqlRow = Record<string, SQLOutputValue>;

const TASK_SCHEMA = 'ai7.evaluation-rewrite-task/1';
const DECISION_SCHEMA = 'ai7.evaluation-rewrite-decision/1';
const CORRUPT = '评语重写记录已损坏。';
const corrupt = (): EvaluationRewriteError => new EvaluationRewriteError('EVALUATION_REWRITE_RECORD_INVALID', CORRUPT);
const TABLE_PRESENT = "SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'evaluation_rewrite_tasks'";

/** Revision 64's relations, created once: a store that predates them gains two empty relations and nothing existing moves. */
export function initializeEvaluationRewriteSchema(db: DatabaseSync): void {
  if (db.prepare(TABLE_PRESENT).get() !== undefined) return;
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const sql of Object.values(EVALUATION_REWRITE_SCHEMA_SQL)) db.exec(sql);
    for (const sql of Object.values(EVALUATION_REWRITE_TRIGGER_SQL)) db.exec(sql);
    db.exec('COMMIT');
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch (rollbackError) {
      throw new AggregateError([error, rollbackError], 'Evaluation rewrite schema rollback failed.');
    }
    throw error;
  }
}

/** One version at its latest saved entry, as a rewrite reads it (`EvaluationRecords.rewritable`). */
export interface RewritableEvaluation {
  readonly recordId: string;
  readonly bookId: string;
  readonly ordinal: number;
  readonly state: 'draft' | 'editing' | 'finalized';
  readonly profile: EvaluationProfileProjection;
  readonly content: EvaluationContent;
  /** The latest saved entry: its ordinal and digest. */
  readonly entryOrdinal: number;
  readonly entrySha256: string;
  /** The AI7 初评 the version began from; `null` for a version the editor began alone. */
  readonly initial: EvaluationInitialDraft | null;
}

/** Why 按我的评分重写评语 cannot be asked of a version now, in the editor's words; `null` when it can. */
export function evaluationRewriteRefusal(version: Pick<RewritableEvaluation, 'state' | 'content' | 'initial' | 'ordinal'>): string | null {
  if (version.state === 'finalized') return `第 ${version.ordinal} 版已经定稿：评语不再重写；要改就重新评估。`;
  if (version.initial === null) return '这一版不是从 AI7 初评开始的：没有 AI7 的评语可以按你的评分重写。';
  const initial = version.initial;
  const adjusted = version.content.items.some((item) =>
    evaluationItemAdjusted({ score: item.score, notRated: item.notRated !== null }, initial.items.find((entry) => entry.itemId === item.itemId)?.score ?? null));
  if (!adjusted) return '先把至少一项改成你的分数并保存：重写会让评语与你保存的分数一致。';
  if (version.content.items.every((item) => item.score === null)) return '至少要给一项打分并保存，才有评语可以重写。';
  return null;
}

/**
 * The contract input of one rewrite: the version's words at its latest saved entry — each item's label and 满分, the editor's
 * score or `不评`, the 评语 as it stands, AI7's score and 评语, and the reasons given in the editor's words — never its identity
 * or time.
 */
export function evaluationRewriteContractInput(version: RewritableEvaluation): EvaluationRewriteContractInput {
  requireRewrite(version.initial !== null, 'EVALUATION_REWRITE_UNAVAILABLE', '这一版不是从 AI7 初评开始的：没有 AI7 的评语可以按你的评分重写。');
  const initial = version.initial;
  return {
    profile: { title: version.profile.title, version: version.profile.version },
    items: version.profile.items.map((item, index) => {
      const own = version.content.items[index]!;
      const ai7 = initial.items.find((entry) => entry.itemId === item.itemId) ?? null;
      const adjustment = own.adjustment ?? null;
      return {
        itemId: item.itemId,
        label: item.label,
        ...(item.description === undefined ? {} : { description: item.description }),
        fullMarks: item.fullMarks,
        score: own.score,
        notRated: own.notRated,
        comment: own.comment,
        ai7: { score: ai7?.score ?? null, comment: ai7?.comment ?? null },
        adjustment: adjustment === null ? null : { reasons: adjustment.reasons.map((reason) => EVALUATION_ADJUSTMENT_REASON_WORDS[reason]), note: adjustment.note },
      };
    }),
    strengths: [...version.content.strengths],
    weaknesses: [...version.content.weaknesses],
    verdict: version.content.verdict,
    conclusions: version.profile.conclusions.map((entry) => entry.label),
  };
}

/**
 * The version's content with a rewrite taken: each scored item's 评语 and the 总评 replaced by AI7's words where it offered them, and nothing else
 * touched — every score, `不评`, adjustment, risk, line and the conclusion exactly as the entry holds them.
 */
export function contentWithRewrite(content: EvaluationContent, words: { items: ReadonlyArray<{ itemId: string; comment: string }>; verdict: string | null }): EvaluationContent {
  return {
    ...content,
    items: content.items.map((item) => {
      const rewritten = words.items.find((entry) => entry.itemId === item.itemId);
      return rewritten === undefined || item.score === null ? item : { ...item, comment: rewritten.comment };
    }),
    // A 总评 set aside (it stated a score or a conclusion) leaves the version's own.
    verdict: words.verdict ?? content.verdict,
  };
}

/**
 * At most `limit` of AI7's notes toward one item, for 评估's page (Issue #689): a long Book's every note would outgrow the
 * frame. Beyond the limit the notes kept are spread over the ranges read — each range's first note, then each one's second —
 * and, where a round has more ranges than room, evenly over them, the last ranges as much as the first; they are shown in
 * reading order, with how many there are.
 */
export function boundedEvidence<T extends { readonly unitOrdinal: number }>(evidence: ReadonlyArray<T>, limit: number): { evidence: T[]; evidenceCount: number } {
  if (evidence.length <= limit) return { evidence: [...evidence], evidenceCount: evidence.length };
  const seen = new Map<number, number>();
  const rounds: number[][] = [];
  evidence.forEach((entry, index) => {
    const round = seen.get(entry.unitOrdinal) ?? 0;
    seen.set(entry.unitOrdinal, round + 1);
    (rounds[round] ??= []).push(index);
  });
  const kept: number[] = [];
  for (const round of rounds) {
    const room = limit - kept.length;
    if (room <= 0) break;
    if (round.length <= room) kept.push(...round);
    else for (let pick = 0; pick < room; pick += 1) kept.push(round[Math.floor(((pick + 0.5) * round.length) / room)]!);
  }
  kept.sort((left, right) => left - right);
  return { evidence: kept.map((index) => evidence[index]!), evidenceCount: evidence.length };
}

/**
 * How many of each item's notes one 初评 or rewrite carries on 评估's page (Issue #689 review): `budget` notes shared among its
 * items however many the profile has — an item with fewer notes than its share keeps them all and leaves the rest to the
 * others, filled a note at a time in the profile's order.
 */
export function evidenceShares(counts: ReadonlyArray<number>, budget: number = MAX_EVALUATION_EVIDENCE_NOTES): number[] {
  const shares = counts.map(() => 0);
  let left = budget;
  let open = counts.flatMap((count, index) => (count > 0 ? [index] : []));
  while (left > 0 && open.length > 0) {
    const share = Math.max(1, Math.floor(left / open.length));
    for (const index of open) {
      const give = Math.min(share, counts[index]! - shares[index]!, left);
      shares[index]! += give;
      left -= give;
      if (left === 0) break;
    }
    open = open.filter((index) => shares[index]! < counts[index]!);
  }
  return shares;
}

/** Each item's notes as one 初评 or rewrite carries them on 评估's page: its share of the budget, with how many in all. */
export function boundedEvidenceSet<T extends { readonly unitOrdinal: number }>(lists: ReadonlyArray<ReadonlyArray<T>>): Array<{ evidence: T[]; evidenceCount: number }> {
  const shares = evidenceShares(lists.map((list) => list.length));
  return lists.map((list, index) => boundedEvidence(list, shares[index]!));
}

/**
 * Each rewritten 评语 of a proposal beside the version's own (EVAL-006): AI7's words, the version's, and the notes AI7 rests
 * them on — the range and the blocks they cite — bounded as 评估 carries them, with how many there are (Issue #689).
 */
export function rewriteProposalItems(
  words: ReadonlyArray<{ readonly itemId: string; readonly comment: string }>,
  observations: ReadonlyArray<{ readonly itemId: string; readonly unitOrdinal: number; readonly note: string; readonly blockIds: ReadonlyArray<string> }>,
  content: EvaluationContent,
  // A rewrite produced under the live route shows 未联网核查 on the notes, never on its words (Issue #429).
  unverified = false,
): NonNullable<EvaluationRewriteWorkspaceProjection['proposal']>['items'] {
  const evidence = boundedEvidenceSet(words.map((item) => observations.filter((observation) => observation.itemId === item.itemId)
    .map((observation) => ({ unitOrdinal: observation.unitOrdinal, note: disclosedNote(observation.note, unverified), blockIds: [...observation.blockIds] }))));
  return words.map((item, index) => ({
    itemId: item.itemId,
    before: content.items.find((entry) => entry.itemId === item.itemId)?.comment ?? null,
    after: item.comment,
    ...evidence[index]!,
  }));
}

/** One rewrite Task as its row holds it, verified. */
export interface StoredEvaluationRewriteTask {
  readonly taskIntentId: string;
  readonly promptContractSha256: string;
  readonly bookId: string;
  readonly recordId: string;
  readonly entryOrdinal: number;
  readonly entrySha256: string;
  readonly input: EvaluationRewriteContractInput;
  readonly recordedAt: string;
}

/** One decision as its row holds it, verified. */
export interface StoredEvaluationRewriteDecision {
  readonly analysisRevisionId: string;
  readonly bookId: string;
  readonly recordId: string;
  readonly taskIntentId: string;
  readonly decision: 'accepted' | 'discarded';
  readonly entryOrdinal: number | null;
  readonly recordedAt: string;
}

const text = (value: SQLOutputValue | undefined): string => {
  requireRewrite(typeof value === 'string', 'EVALUATION_REWRITE_RECORD_INVALID', CORRUPT);
  return value;
};

export class EvaluationRewrites {
  readonly #db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.#db = db;
  }

  #task(row: SqlRow): StoredEvaluationRewriteTask {
    const json = text(row.canonical_json);
    requireRewrite(sha256Hex(json) === text(row.sha256), 'EVALUATION_REWRITE_RECORD_INVALID', CORRUPT);
    const stored = parseStoredJson(json, corrupt);
    requireRewrite(isRecord(stored) && stored.schema === TASK_SCHEMA && stored.taskIntentId === row.task_intent_id &&
      stored.promptContractSha256 === row.prompt_contract_sha256 && stored.bookId === row.book_id && stored.recordId === row.record_id &&
      stored.entryOrdinal === Number(row.entry_ordinal) && stored.entrySha256 === row.entry_sha256 && stored.recordedAt === row.recorded_at &&
      isRecord(stored.input),
    'EVALUATION_REWRITE_RECORD_INVALID', CORRUPT);
    const input = stored.input as unknown as EvaluationRewriteContractInput;
    // The frozen input is the contract: its digest must be the one the row names.
    let digest: string;
    try {
      digest = evaluationRewriteContractDigest(evaluationRewriteContract(input));
    } catch {
      throw new EvaluationRewriteError('EVALUATION_REWRITE_RECORD_INVALID', CORRUPT);
    }
    requireRewrite(digest === row.prompt_contract_sha256 || clarificationPromptContractDigest(digest) === row.prompt_contract_sha256,
      'EVALUATION_REWRITE_RECORD_INVALID', CORRUPT);
    return {
      taskIntentId: text(row.task_intent_id),
      promptContractSha256: text(row.prompt_contract_sha256),
      bookId: text(row.book_id),
      recordId: text(row.record_id),
      entryOrdinal: Number(row.entry_ordinal),
      entrySha256: text(row.entry_sha256),
      input,
      recordedAt: text(row.recorded_at),
    };
  }

  /**
   * Record which version and saved entry a Task rewrites, in the caller's transaction — once per Task and contract: a Task the
   * ledger revised in place for this very request holds it already.
   */
  recordTask(input: {
    taskIntentId: string;
    bookId: string;
    recordId: string;
    entryOrdinal: number;
    entrySha256: string;
    contract: EvaluationRewriteContractInput;
    promptContractSha256: string;
  }): void {
    requireRewrite(UUID_PATTERN.test(input.taskIntentId) && UUID_PATTERN.test(input.bookId) && UUID_PATTERN.test(input.recordId) &&
      Number.isSafeInteger(input.entryOrdinal) && input.entryOrdinal >= 1, 'EVALUATION_REWRITE_INVALID', '评语重写参数无效。');
    const intent = this.#db.prepare('SELECT book_id, kind FROM analysis_task_intents WHERE task_intent_id = ?').get(input.taskIntentId) as SqlRow | undefined;
    requireRewrite(intent !== undefined && intent.book_id === input.bookId && intent.kind === EVALUATION_REWRITE_KIND, 'EVALUATION_REWRITE_INVALID', '评语重写任务无效。');
    const existing = this.#db.prepare('SELECT 1 FROM evaluation_rewrite_tasks WHERE task_intent_id = ? AND prompt_contract_sha256 = ?')
      .get(input.taskIntentId, input.promptContractSha256);
    if (existing !== undefined) return;
    const recordedAt = new Date().toISOString();
    const record = canonicalRecord({
      schema: TASK_SCHEMA,
      taskIntentId: input.taskIntentId,
      promptContractSha256: input.promptContractSha256,
      bookId: input.bookId,
      recordId: input.recordId,
      entryOrdinal: input.entryOrdinal,
      entrySha256: input.entrySha256,
      input: input.contract,
      recordedAt,
    });
    this.#db.prepare(
      `INSERT INTO evaluation_rewrite_tasks(
         task_intent_id, prompt_contract_sha256, book_id, record_id, entry_ordinal, entry_sha256, recorded_at, canonical_json, sha256
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(input.taskIntentId, input.promptContractSha256, input.bookId, input.recordId, input.entryOrdinal, input.entrySha256,
      recordedAt, record.json, record.digest);
  }

  /**
   * One Task's version and entry: the row whose contract the Task's frozen plan names when `planContract` is given, else the one
   * recorded last — the request its preparation was last made for. `null` for a Task with none.
   */
  task(taskIntentId: string, planContract: string | null = null): StoredEvaluationRewriteTask | null {
    const rows = this.#db.prepare('SELECT * FROM evaluation_rewrite_tasks WHERE task_intent_id = ? ORDER BY recorded_at, rowid')
      .all(taskIntentId) as SqlRow[];
    const tasks = rows.map((row) => this.#task(row));
    if (planContract !== null) return tasks.find((task) => task.promptContractSha256 === planContract) ?? null;
    return tasks.at(-1) ?? null;
  }

  /**
   * The prompt contract one Task's latest frozen plan names, read from its Plan Envelope record and verified against its
   * digest; `null` while no plan froze.
   */
  planContract(taskIntentId: string): string | null {
    const row = this.#db.prepare(
      "SELECT canonical_json, sha256 FROM analysis_plan_records WHERE task_intent_id = ? AND component = 'plan-envelope' ORDER BY plan_version DESC LIMIT 1",
    ).get(taskIntentId) as SqlRow | undefined;
    if (row === undefined) return null;
    const json = text(row.canonical_json);
    requireRewrite(sha256Hex(json) === text(row.sha256), 'EVALUATION_REWRITE_RECORD_INVALID', CORRUPT);
    const envelope = parseStoredJson(json, corrupt);
    requireRewrite(isRecord(envelope) && typeof envelope.promptContractDigest === 'string', 'EVALUATION_REWRITE_RECORD_INVALID', CORRUPT);
    return envelope.promptContractDigest;
  }

  /** The Book's latest rewrite Task by its intent, as the analysis ledger orders them; `null` before the first. */
  latestTaskIntentId(bookId: string): string | null {
    const row = this.#db.prepare(
      'SELECT task_intent_id FROM analysis_task_intents WHERE book_id = ? AND kind = ? ORDER BY created_at DESC, rowid DESC LIMIT 1',
    ).get(bookId, EVALUATION_REWRITE_KIND) as SqlRow | undefined;
    return row === undefined ? null : text(row.task_intent_id);
  }

  /**
   * Any recorded rewrite Task of any Book that still verifies, the latest first: what a reconciliation of the kind's Runs builds
   * its ledger from. A damaged row is passed over — the reconciliation needs the kind, not that row.
   */
  anyTask(): StoredEvaluationRewriteTask | null {
    for (const row of this.#db.prepare('SELECT * FROM evaluation_rewrite_tasks ORDER BY recorded_at DESC, rowid DESC').iterate() as IterableIterator<SqlRow>) {
      try {
        return this.#task(row);
      } catch (error) {
        if (!(error instanceof EvaluationRewriteError)) throw error;
      }
    }
    return null;
  }

  /** The Book's rewrite Result Set Revisions newest first, each with the Task that made it. */
  revisions(bookId: string): Array<{ revisionId: string; ordinal: number; createdAt: string; taskIntentId: string }> {
    return (this.#db.prepare(
      `SELECT r.revision_id, r.ordinal, r.created_at, r.task_intent_id FROM analysis_result_set_revisions r
       JOIN analysis_result_sets s ON s.result_set_id = r.result_set_id
       WHERE s.book_id = ? AND s.kind = ? ORDER BY r.ordinal DESC`,
    ).all(bookId, EVALUATION_REWRITE_KIND) as SqlRow[]).map((row) => ({
      revisionId: text(row.revision_id),
      ordinal: Number(row.ordinal),
      createdAt: text(row.created_at),
      taskIntentId: text(row.task_intent_id),
    }));
  }

  #decision(row: SqlRow): StoredEvaluationRewriteDecision {
    const json = text(row.canonical_json);
    requireRewrite(sha256Hex(json) === text(row.sha256), 'EVALUATION_REWRITE_RECORD_INVALID', CORRUPT);
    const stored = parseStoredJson(json, corrupt);
    const entryOrdinal = row.entry_ordinal === null ? null : Number(row.entry_ordinal);
    requireRewrite(isRecord(stored) && stored.schema === DECISION_SCHEMA && stored.analysisRevisionId === row.analysis_revision_id &&
      stored.bookId === row.book_id && stored.recordId === row.record_id && stored.taskIntentId === row.task_intent_id &&
      stored.decision === row.decision && (stored.entryOrdinal ?? null) === entryOrdinal && stored.recordedAt === row.recorded_at &&
      (row.decision === 'accepted' || row.decision === 'discarded'),
    'EVALUATION_REWRITE_RECORD_INVALID', CORRUPT);
    return {
      analysisRevisionId: text(row.analysis_revision_id),
      bookId: text(row.book_id),
      recordId: text(row.record_id),
      taskIntentId: text(row.task_intent_id),
      decision: row.decision as 'accepted' | 'discarded',
      entryOrdinal,
      recordedAt: text(row.recorded_at),
    };
  }

  /** The editor's decision on one rewritten result, or `null` while it waits. */
  decisionOf(analysisRevisionId: string): StoredEvaluationRewriteDecision | null {
    const row = this.#db.prepare('SELECT * FROM evaluation_rewrite_decisions WHERE analysis_revision_id = ?').get(analysisRevisionId) as SqlRow | undefined;
    return row === undefined ? null : this.#decision(row);
  }

  /** The version's latest decision, newest first by when it was made; `null` before the first. */
  latestDecision(recordId: string): StoredEvaluationRewriteDecision | null {
    const row = this.#db.prepare('SELECT * FROM evaluation_rewrite_decisions WHERE record_id = ? ORDER BY recorded_at DESC, rowid DESC LIMIT 1')
      .get(recordId) as SqlRow | undefined;
    return row === undefined ? null : this.#decision(row);
  }

  /**
   * Each entry of one version a 采用 appended, by ordinal, with the rewrite it took (Issue #696), as the record reads the marks
   * that name them: every accepted decision of the version, each verified, in one read.
   */
  adoptionsOf(recordId: string): Map<number, { taskIntentId: string; analysisRevisionId: string }> {
    const adopted = new Map<number, { taskIntentId: string; analysisRevisionId: string }>();
    for (const row of this.#db.prepare("SELECT * FROM evaluation_rewrite_decisions WHERE record_id = ? AND decision = 'accepted'").all(recordId) as SqlRow[]) {
      const decision = this.#decision(row);
      // One 采用 appends one entry: a second on the same entry is no row this owner wrote.
      requireRewrite(decision.entryOrdinal !== null && !adopted.has(decision.entryOrdinal), 'EVALUATION_REWRITE_RECORD_INVALID', CORRUPT);
      adopted.set(decision.entryOrdinal, { taskIntentId: decision.taskIntentId, analysisRevisionId: decision.analysisRevisionId });
    }
    return adopted;
  }

  /**
   * Each version's decisions as their recorded digests, by record, in one read (Issue #708): what the evaluation record checks a
   * reading it kept against. Nothing is parsed, so it never fails on a damaged row; that row's digest still tells it apart.
   */
  decisionStamps(bookId: string): Map<string, string> {
    const stamps = new Map<string, string>();
    for (const row of this.#db.prepare('SELECT record_id, sha256 FROM evaluation_rewrite_decisions WHERE book_id = ? ORDER BY record_id, analysis_revision_id')
      .all(bookId) as SqlRow[]) {
      const recordId = String(row.record_id);
      stamps.set(recordId, `${stamps.get(recordId) ?? ''}${String(row.sha256)},`);
    }
    return stamps;
  }

  /** The editor's decision on one rewritten result, in the caller's transaction: once — a second is refused. */
  recordDecision(input: Omit<StoredEvaluationRewriteDecision, 'recordedAt'>): void {
    requireRewrite(this.decisionOf(input.analysisRevisionId) === null, 'EVALUATION_REWRITE_DECIDED', '这一次重写已经处理过了。');
    const recordedAt = new Date().toISOString();
    const record = canonicalRecord({ schema: DECISION_SCHEMA, ...input, recordedAt });
    this.#db.prepare(
      `INSERT INTO evaluation_rewrite_decisions(
         analysis_revision_id, book_id, record_id, task_intent_id, decision, entry_ordinal, recorded_at, canonical_json, sha256
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(input.analysisRevisionId, input.bookId, input.recordId, input.taskIntentId, input.decision, input.entryOrdinal, recordedAt,
      record.json, record.digest);
  }
}

// ---- 按我的评分重写评语 as operations of the store (Issue #429 S81b2; moved from store.ts by Issue #1172) ------------------------------

/** The store state and calls the 重写评语 operations use, lent by EditorialStore: its fields read live through getters, its own methods bound. */
export interface EvaluationRewriteStoreHost {
  analysisCall<T>(operation: () => T): T;
  assertAvailable(): void;
  readonly authority: DatabaseSync;
  readonly baselineAnalysis: BaselineAnalysisStore;
  readonly boundedAuthority: BoundedManuscriptStore;
  readonly control: StoreControl;
  evaluationCall<T>(operation: () => T): T;
  evaluationLiveRefused(kind: typeof INITIAL_EVALUATION_KIND | typeof READERS_REPORT_KIND | typeof EVALUATION_REWRITE_KIND): boolean;
  evaluationRecordOrdinal(recordId: string): number;
  evaluationRewriteCall<T>(operation: () => T): T;
  readonly evaluationRewriteLedgers: RecentCache<BaselineAnalysisStore>;
  readonly evaluationRewrites: EvaluationRewrites;
  readonly evaluationRewriteWork: Map<string, BaselineAnalysisStore>;
  readonly evaluations: EvaluationRecords;
  inspectEvaluation(bookId: string, recordId: string | null, recordsBefore?: number | null): EvaluationWorkspaceProjection;
  ledgerTaskOf(kind: LedgerTaskKind, bookId: string, taskIntentId: string): BaselineAnalysisStore;
  requireLedgerKindScope(kind: LedgerTaskKind, bookId: string, taskIntentId: string): void;
  transaction<T>(db: DatabaseSync, operation: () => T): T;
}

/**
 * The rewrite ledger of one frozen contract — one version's words at one saved entry — made when first asked for and kept
 * while it prepares, as 审稿意见's is. It takes the launch the baseline ledger was bound to.
 */
export function evaluationRewriteLedger(host: EvaluationRewriteStoreHost, input: EvaluationRewriteContractInput): BaselineAnalysisStore {
  const definition = host.analysisCall(() => evaluationRewriteKindDefinition(input));
  return host.evaluationRewriteLedgers.obtain(definition.promptContractDigest, () => {
    const ledger = new BaselineAnalysisStore(host.authority, host.boundedAuthority, host.control.baselineAnalysisRoute, definition);
    ledger.bindLaunch(host.baselineAnalysis.launch);
    return ledger;
  });
}

/**
 * One rewrite the editor accepted, as the evaluation record checks a mark that names it (Issue #708): the Book and version of
 * the 采用, its Task and the words it wrote; `null` when no decision accepted it, `'unreadable'` when the decision cannot be
 * read, and words `null` when they cannot be.
 */
export function acceptedEvaluationRewrite(host: EvaluationRewriteStoreHost, analysisRevisionId: string): AcceptedEvaluationRewrite | null | 'unreadable' {
  let decision: StoredEvaluationRewriteDecision | null;
  try {
    decision = host.evaluationRewrites.decisionOf(analysisRevisionId);
  } catch (error) {
    if (error instanceof EvaluationRewriteError) return 'unreadable';
    throw error;
  }
  if (decision === null || decision.decision !== 'accepted') return null;
  let words: AcceptedEvaluationRewrite['words'] = null;
  try {
    const found = evaluationRewriteTaskOf(host, decision.taskIntentId);
    if (found !== null) {
      const inspected = host.analysisCall(() => found.ledger.inspect(decision.bookId, undefined, analysisRevisionId)) as EvaluationRewriteProjection;
      const read = inspected.inspectedRevision?.revision.rewrite.words ?? null;
      words = read === null ? null : { items: read.items.map((item) => ({ itemId: item.itemId, comment: item.comment })), verdict: read.verdict };
    }
  } catch (error) {
    if (!(error instanceof StoreError)) throw error;
  }
  return { bookId: decision.bookId, recordId: decision.recordId, taskIntentId: decision.taskIntentId, words };
}

/** One Task's version and entry — the one its frozen plan names when it froze one. */
export function evaluationRewriteTaskOf(host: EvaluationRewriteStoreHost, taskIntentId: string): { task: StoredEvaluationRewriteTask; ledger: BaselineAnalysisStore } | null {
  let task = host.evaluationRewriteCall(() => host.evaluationRewrites.task(taskIntentId));
  if (task === null) return null;
  let ledger = evaluationRewriteLedger(host, task.input);
  const planContract = host.evaluationRewriteCall(() => host.evaluationRewrites.planContract(taskIntentId));
  if (planContract !== null && planContract !== task.promptContractSha256) {
    task = host.evaluationRewriteCall(() => host.evaluationRewrites.task(taskIntentId, planContract));
    requireStore(task !== null, 'EVALUATION_REWRITE_RECORD_INVALID', '评语重写任务的计划与它的记录不一致。');
    ledger = evaluationRewriteLedger(host, task.input);
  }
  return { task, ledger };
}

/** The Book's latest rewrite Task with its ledger and projection; `null` before the first, or for one no record names. */
export function latestEvaluationRewrite(host: EvaluationRewriteStoreHost, bookId: string, progress?: ProgressReader): { task: StoredEvaluationRewriteTask; ledger: BaselineAnalysisStore; projection: EvaluationRewriteProjection } | null {
  const intentId = host.evaluationRewriteCall(() => host.evaluationRewrites.latestTaskIntentId(bookId));
  if (intentId === null) return null;
  const found = evaluationRewriteTaskOf(host, intentId);
  if (found === null) return null;
  const projection = host.analysisCall(() => found.ledger.inspect(bookId, progress)) as EvaluationRewriteProjection;
  return { ...found, projection };
}

/** The Book's latest rewrite Task as its ledger reads it, or `null`; `progress` is the execution owner's reader. */
export function inspectEvaluationRewrite(host: EvaluationRewriteStoreHost, bookId: string, progress?: ProgressReader): EvaluationRewriteProjection | null {
  host.assertAvailable();
  return latestEvaluationRewrite(host, bookId, progress)?.projection ?? null;
}

/**
 * 按我的评分重写评语 runs only where it may be sent (EVAL-008, as 初评): under a live scope only a rule naming the kind with the
 * editor's saved words admits it; otherwise nothing is prepared or started there, and 评估 says why. The provider-free scope
 * is unaffected.
 */
export function requireEvaluationRewriteScope(host: EvaluationRewriteStoreHost): void {
  host.assertAvailable();
  if (host.evaluationLiveRefused(EVALUATION_REWRITE_KIND)) throw new StoreError('EVALUATION_REWRITE_UNAVAILABLE', EVALUATION_REWRITE_LIVE_UNAVAILABLE);
}

/**
 * 按我的评分重写评语 (EVAL-008): the rewrite kind's Task over one version of the Book at its latest saved entry, in the mode that
 * applies. Refused under a live scope, for a 定稿 version, one begun without AI7's 初评, or one whose saved scores do not depart
 * from AI7's yet — the 评语 then already speak to them. Its plan opens in the Task Drawer.
 */
export function createEvaluationRewritePreparationWork(host: EvaluationRewriteStoreHost, bookId: string, recordId: string, launchPolicy: LaunchPolicyProjection, redoOf: string | null = null): AnalysisPreparationResult<EvaluationRewriteProjection> {
  requireEvaluationRewriteScope(host);
  requireStore(StoreUUID_PATTERN.test(bookId) && StoreUUID_PATTERN.test(recordId), 'EVALUATION_REWRITE_INVALID', '评语重写参数无效。');
  const version = host.evaluationCall(() => host.evaluations.rewritable(bookId, recordId));
  const refusal = evaluationRewriteRefusal(version);
  requireStore(refusal === null, 'EVALUATION_REWRITE_UNAVAILABLE', refusal ?? '');
  const input = host.evaluationRewriteCall(() => evaluationRewriteContractInput(version));
  const ledger = evaluationRewriteLedger(host, input);
  const latest = latestEvaluationRewrite(host, bookId);
  requireStore(!runIsActive(latest?.projection.run?.state ?? null), 'EVALUATION_REWRITE_UNAVAILABLE', activeRunReason(latest?.projection.run?.state ?? null, EVALUATION_REWRITE_KIND));
  const mode = latest === null || latest.projection.resultSetRevision === null ? 'evaluation-rewrite-first' : 'evaluation-rewrite-again';
  const result = host.analysisCall(() => ledger.prepare({
    phase: 'start',
    bookId,
    goal: EVALUATION_REWRITE_MODE_GOALS[mode],
    redoOf,
    update: mode === 'evaluation-rewrite-first' ? null : { mode, selectedRange: null },
    reconfirm: false,
    launchPolicy,
  }));
  // Which version and saved entry the Task rewrites, recorded once for it and this contract.
  const taskIntentId = host.evaluationRewriteCall(() => host.evaluationRewrites.latestTaskIntentId(bookId));
  requireStore(taskIntentId !== null, 'EVALUATION_REWRITE_RECORD_INVALID', '评语重写任务没有准备出来。');
  host.evaluationRewriteCall(() => host.transaction(host.authority, () => host.evaluationRewrites.recordTask({
    taskIntentId,
    bookId,
    recordId,
    entryOrdinal: version.entryOrdinal,
    entrySha256: version.entrySha256,
    contract: input,
    promptContractSha256: ledger.definition.promptContractDigest,
  })));
  if (result.workId !== null) host.evaluationRewriteWork.set(result.workId, ledger);
  return { ...result, projection: result.projection as EvaluationRewriteProjection | null };
}

export function advanceEvaluationRewritePreparationWork(host: EvaluationRewriteStoreHost, workId: string): AnalysisPreparationResult<EvaluationRewriteProjection> {
  const ledger = host.evaluationRewriteWork.get(workId);
  requireStore(ledger !== undefined, 'ANALYSIS_PREPARATION_NOT_FOUND', '评语重写的计划准备已不存在。');
  const result = host.analysisCall(() => ledger.prepare({ phase: 'advance', workId }));
  if (result.done) host.evaluationRewriteWork.delete(workId);
  return { ...result, projection: result.projection as EvaluationRewriteProjection | null };
}

export function cancelEvaluationRewritePreparationWork(host: EvaluationRewriteStoreHost, workId: string): boolean {
  const ledger = host.evaluationRewriteWork.get(workId);
  if (ledger === undefined) return false;
  host.evaluationRewriteWork.delete(workId);
  host.analysisCall(() => ledger.prepare({ phase: 'cancel', workId }));
  return true;
}

/** The version the Book's latest rewrite Task rewrites: what 评估 shows once that Task was prepared or started. */
export function evaluationRewriteRecordOf(host: EvaluationRewriteStoreHost, bookId: string): string | null {
  host.assertAvailable();
  return latestEvaluationRewrite(host, bookId)?.task.recordId ?? null;
}

/** 开始任务 in the drawer's bar: the Run Authorization and the Run on the ledger of the plan's contract, for the owner. */
export function authorizeEvaluationRewrite(
    host: EvaluationRewriteStoreHost,
  bookId: string,
  taskIntentId: string,
  planEnvelopeDigest: string,
  start: 'now' | 'when-online' | 'idle' = 'now',
): { dispatchRunRecordId: string | null; ledger: BaselineAnalysisStore; recordId: string } {
  host.requireLedgerKindScope('evaluation-rewrite', bookId, taskIntentId);
  const ledger = host.ledgerTaskOf('evaluation-rewrite', bookId, taskIntentId);
  const authorized = host.analysisCall(() => ledger.authorize(bookId, taskIntentId, planEnvelopeDigest, start));
  return { dispatchRunRecordId: authorized.dispatchRunRecordId, ledger, recordId: latestEvaluationRewrite(host, bookId)!.task.recordId };
}

/** Reconcile stranded Runs to their kept continuation points; queued starts still require an explicit new start. */
export function reconcileStoppedEvaluationRewriteRuns(host: EvaluationRewriteStoreHost): { settled: number } {
  host.assertAvailable();
  const any = host.evaluationRewriteCall(() => host.evaluationRewrites.anyTask());
  if (any === null) return { settled: 0 };
  return { settled: host.analysisCall(() => evaluationRewriteLedger(host, any.input).reconcileStoppedRuns()).settled };
}

/** The newest rewritten result of one version, with its Task, words and what it read; `null` while the version has none. */
export function newestEvaluationRewrite(host: EvaluationRewriteStoreHost, bookId: string, recordId: string): null | {
  revision: { revisionId: string; createdAt: string; taskIntentId: string };
  task: StoredEvaluationRewriteTask;
  words: NonNullable<NonNullable<EvaluationRewriteProjection['inspectedRevision']>['revision']['rewrite']['words']> | null;
  observations: NonNullable<EvaluationRewriteProjection['inspectedRevision']>['revision']['rewrite']['observations'];
  /** Produced under the live route: its notes show 未联网核查 (Issue #429). */
  unverified: boolean;
  reading: { unitsTotal: number; unitsRead: number };
} {
  for (const revision of host.evaluationRewriteCall(() => host.evaluationRewrites.revisions(bookId))) {
    const found = evaluationRewriteTaskOf(host, revision.taskIntentId);
    if (found === null || found.task.recordId !== recordId) continue;
    const inspected = host.analysisCall(() => found.ledger.inspect(bookId, undefined, revision.revisionId)) as EvaluationRewriteProjection;
    const read = inspected.inspectedRevision?.revision ?? null;
    return {
      revision,
      task: found.task,
      words: read?.rewrite.words ?? null,
      observations: read?.rewrite.observations ?? [],
      unverified: producedUnverified(read?.policyPin.operationalScope),
      reading: { unitsTotal: read?.coverage.unitsTotal ?? 0, unitsRead: read?.coverage.unitsClosed ?? 0 },
    };
  }
  return null;
}

/**
 * 按我的评分重写评语 on ②C for the version on show (EVAL-008): whether it can be asked, the Book's latest rewrite Task, the newest
 * rewrite of this version still waiting for the editor — its words beside the version's own, the notes they rest on, how much
 * of the Book it read and what it set aside — and the version's last decision. Every rewrite row it reads is read under one
 * guard: a damaged one makes the rewrite unavailable with why, never 评估 unreadable (S81b2 review).
 */
export function evaluationRewriteWorkspace(host: EvaluationRewriteStoreHost, bookId: string, version: RewritableEvaluation | null): EvaluationRewriteWorkspaceProjection {
  let latest: { task: StoredEvaluationRewriteTask; ledger: BaselineAnalysisStore; projection: EvaluationRewriteProjection } | null = null;
  let unavailable: string | null = null;
  let proposal: EvaluationRewriteWorkspaceProjection['proposal'] = null;
  let decided: EvaluationRewriteWorkspaceProjection['decided'] = null;
  try {
    latest = latestEvaluationRewrite(host, bookId);
    if (version !== null) {
      const newest = newestEvaluationRewrite(host, bookId, version.recordId);
      if (newest !== null && newest.words !== null && host.evaluationRewriteCall(() => host.evaluationRewrites.decisionOf(newest.revision.revisionId)) === null) {
        const words = newest.words;
        proposal = {
          revisionId: newest.revision.revisionId,
          createdAt: newest.revision.createdAt,
          entryOrdinal: newest.task.entryOrdinal,
          current: newest.task.entryOrdinal === version.entryOrdinal && newest.task.entrySha256 === version.entrySha256 && version.state !== 'finalized',
          reading: newest.reading,
          // Each beside the version's own, with at most a frame's share of its notes and how many in all (Issue #689).
          items: rewriteProposalItems(words.items, newest.observations, version.content, newest.unverified),
          verdict: words.verdict === null ? null : { before: version.content.verdict, after: words.verdict },
          withheld: words.withheld.map((entry) => entry.reason),
        };
      }
      const last = host.evaluationRewriteCall(() => host.evaluationRewrites.latestDecision(version.recordId));
      // Every 采用 of the version, read under the same guard: a damaged one makes the rewrite unavailable (Issue #702 review).
      host.evaluationRewriteCall(() => host.evaluationRewrites.adoptionsOf(version.recordId));
      decided = last === null ? null : { decision: last.decision, entryOrdinal: last.entryOrdinal, decidedAt: last.recordedAt };
    }
  } catch (error) {
    if (!(error instanceof StoreError)) throw error;
    latest = null;
    proposal = null;
    decided = null;
    unavailable = `按我的评分重写评语暂不可用：${error.message}`;
  }
  const runState = latest?.projection.run?.state ?? null;
  const task = latest === null || latest.projection.taskIntent === null ? null : {
    taskIntentId: latest.projection.taskIntent.taskIntentId,
    recordId: latest.task.recordId,
    recordOrdinal: host.evaluationRecordOrdinal(latest.task.recordId),
    entryOrdinal: latest.task.entryOrdinal,
    state: latest.projection.state,
    label: evaluationRewriteTaskStateLabel(latest.projection),
  };
  const refusal = version === null ? '先打开一版评估。' : evaluationRewriteRefusal(version);
  const prepare: EvaluationRewriteWorkspaceProjection['prepare'] =
    host.evaluationLiveRefused(EVALUATION_REWRITE_KIND) ? { allowed: false, reason: EVALUATION_REWRITE_LIVE_UNAVAILABLE }
    : unavailable !== null ? { allowed: false, reason: unavailable }
    : refusal !== null ? { allowed: false, reason: refusal }
    : runIsActive(runState) ? { allowed: false, reason: activeRunReason(runState, EVALUATION_REWRITE_KIND) }
    : { allowed: true, mode: latest === null || latest.projection.resultSetRevision === null ? 'evaluation-rewrite-first' : 'evaluation-rewrite-again' };
  return { prepare, task, proposal, decided };
}

/**
 * 采用 or 放弃 one rewrite (EVAL-008): 采用 appends AI7's rewritten 评语 and 总评 to the version as a new entry — every score as the
 * editor saved it — only while the version still stands at the entry the rewrite read and the rewrite is its newest; 放弃 sets
 * it aside. Either is recorded once, in the transaction that makes it, and nothing else of the record changes.
 */
export function decideEvaluationRewrite(host: EvaluationRewriteStoreHost, bookId: string, revisionId: string, decision: EvaluationRewriteDecision): EvaluationWorkspaceProjection {
  host.assertAvailable();
  requireStore(StoreUUID_PATTERN.test(bookId) && StoreUUID_PATTERN.test(revisionId) && (decision === 'accept' || decision === 'discard'),
    'EVALUATION_REWRITE_INVALID', '评语重写参数无效。');
  const revision = host.evaluationRewriteCall(() => host.evaluationRewrites.revisions(bookId)).find((entry) => entry.revisionId === revisionId);
  requireStore(revision !== undefined, 'EVALUATION_REWRITE_NOT_FOUND', '这本书没有这一次重写的评语。');
  const found = evaluationRewriteTaskOf(host, revision.taskIntentId);
  requireStore(found !== null, 'EVALUATION_REWRITE_RECORD_INVALID', '这一次重写没有记下它依据的评估版本。');
  const inspected = host.analysisCall(() => found.ledger.inspect(bookId, undefined, revisionId)) as EvaluationRewriteProjection;
  const words = inspected.inspectedRevision?.revision.rewrite.words ?? null;
  const recordId = found.task.recordId;
  host.evaluationRewriteCall(() => host.transaction(host.authority, () => {
    requireStore(host.evaluationRewrites.decisionOf(revisionId) === null, 'EVALUATION_REWRITE_DECIDED', '这一次重写已经处理过了。');
    if (decision === 'discard') {
      host.evaluationRewrites.recordDecision({ analysisRevisionId: revisionId, bookId, recordId, taskIntentId: revision.taskIntentId, decision: 'discarded', entryOrdinal: null });
      return;
    }
    requireStore(words !== null, 'EVALUATION_REWRITE_NOT_WRITTEN', '这一次重写没有写出评语，不能采用。');
    requireStore(newestEvaluationRewrite(host, bookId, recordId)?.revision.revisionId === revisionId, 'EVALUATION_REWRITE_SUPERSEDED',
      '这一版评估后来又重写过：请看最新的重写。');
    requireStore(words.items.length > 0 || words.verdict !== null, 'EVALUATION_REWRITE_NOT_WRITTEN', '这一次重写写出的评语都没有采用的条件，只能放弃。');
    const entryOrdinal = host.evaluations.applyRewrite(bookId, recordId, { entryOrdinal: found.task.entryOrdinal, entrySha256: found.task.entrySha256 }, words,
      { taskIntentId: revision.taskIntentId, analysisRevisionId: revisionId });
    host.evaluationRewrites.recordDecision({ analysisRevisionId: revisionId, bookId, recordId, taskIntentId: revision.taskIntentId, decision: 'accepted', entryOrdinal });
  }));
  return host.inspectEvaluation(bookId, recordId);
}
