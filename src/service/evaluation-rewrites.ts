import type { DatabaseSync, SQLOutputValue } from 'node:sqlite';
import {
  EVALUATION_REWRITE_KIND,
  MAX_EVALUATION_EVIDENCE_NOTES,
  type EvaluationContent,
  type EvaluationProfileProjection,
  type EvaluationRewriteWorkspaceProjection,
} from '../shared/protocol.js';
import type { EvaluationInitialDraft } from './evaluation-records.js';
import { EVALUATION_ADJUSTMENT_REASON_WORDS, evaluationItemAdjusted } from '../shared/evaluation-scoring.js';
import { UUID_PATTERN, canonicalRecord, isRecord, parseStoredJson, sha256Hex } from './analysis/canonical.js';
import {
  evaluationRewriteContract,
  evaluationRewriteContractDigest,
  type EvaluationRewriteContractInput,
} from './evaluation/evaluation-rewrite-contract.js';

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
): NonNullable<EvaluationRewriteWorkspaceProjection['proposal']>['items'] {
  const evidence = boundedEvidenceSet(words.map((item) => observations.filter((observation) => observation.itemId === item.itemId)
    .map((observation) => ({ unitOrdinal: observation.unitOrdinal, note: observation.note, blockIds: [...observation.blockIds] }))));
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
    requireRewrite(digest === row.prompt_contract_sha256, 'EVALUATION_REWRITE_RECORD_INVALID', CORRUPT);
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
