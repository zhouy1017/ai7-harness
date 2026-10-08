import type { DatabaseSync, SQLOutputValue } from 'node:sqlite';
import {
  READERS_REPORT_KIND,
  READERS_REPORT_SECTION_LABELS,
  READERS_REPORT_TEMPLATE_LABELS,
  READERS_REPORT_TEMPLATES,
  type EvaluationConclusion,
  type ReadersReportSectionsProjection,
  type ReadersReportTemplate,
} from '../shared/protocol.js';
import { UUID_PATTERN, canonicalJson, canonicalRecord, isRecord, sha256Hex } from './analysis/canonical.js';
import { graphemeCount } from './analysis/factual-review-contract.js';
import {
  readersReportContract,
  readersReportContractDigest,
  type ReadersReportContractInput,
  type ReadersReportExemplarInput,
} from './evaluation/readers-report-contract.js';
import type { FinalizedEvaluation } from './evaluation-records.js';

/**
 * 审稿意见 (Issue #429, plan slice S81c; V2-UX-EVAL-013; editor-surfaces §5 ②C): the reader's report drafted by AI7 from a
 * finalized Evaluation Record, under one of the two V1 templates, and opened as an Editorial Artifact the editor edits on the
 * manuscript surface.
 *
 * The drafting is the `readers-report` analysis kind's (`evaluation/readers-report-*.ts`), on the analysis ledger like every
 * kind; its draft is a document in the same block store and ledgers as a Production Document (`production-documents.ts`),
 * under a type of its own. What neither of those knows is the bridge, and schema revision 62 owns it in two relations, ledgers
 * like the others — a row is appended once and never rewritten or removed:
 *
 * - `readers_report_tasks`: which 定稿 version, by its record and the digest of the entry that finalized it, and which template
 *   one 审稿意见 Task drafts from, with the frozen contract input — the record's words — and that contract's digest. A Task the
 *   analysis ledger revised in place for a later request may hold two; the one whose contract its frozen plan names is its own.
 * - `readers_report_drafts`: which drafted result became which template's draft document, once per template of a Book.
 */
export const READERS_REPORT_SCHEMA_SQL = {
  readers_report_tasks: `CREATE TABLE readers_report_tasks (
  task_intent_id TEXT NOT NULL REFERENCES analysis_task_intents(task_intent_id),
  prompt_contract_sha256 TEXT NOT NULL CHECK(length(prompt_contract_sha256) = 64),
  book_id TEXT NOT NULL REFERENCES books(book_id),
  record_id TEXT NOT NULL REFERENCES evaluation_records(record_id),
  finalized_entry_sha256 TEXT NOT NULL CHECK(length(finalized_entry_sha256) = 64),
  template TEXT NOT NULL CHECK(template IN ('author', 'editorial')),
  recorded_at TEXT NOT NULL,
  canonical_json TEXT NOT NULL,
  sha256 TEXT NOT NULL UNIQUE CHECK(length(sha256) = 64),
  PRIMARY KEY(task_intent_id, prompt_contract_sha256)
) STRICT`,
  readers_report_drafts: `CREATE TABLE readers_report_drafts (
  document_id TEXT PRIMARY KEY REFERENCES production_documents(document_id),
  book_id TEXT NOT NULL REFERENCES books(book_id),
  template TEXT NOT NULL CHECK(template IN ('author', 'editorial')),
  analysis_revision_id TEXT NOT NULL UNIQUE REFERENCES analysis_result_set_revisions(revision_id),
  task_intent_id TEXT NOT NULL REFERENCES analysis_task_intents(task_intent_id),
  record_id TEXT NOT NULL REFERENCES evaluation_records(record_id),
  recorded_at TEXT NOT NULL,
  canonical_json TEXT NOT NULL,
  sha256 TEXT NOT NULL UNIQUE CHECK(length(sha256) = 64),
  UNIQUE(book_id, template)
) STRICT`,
} as const;

export const READERS_REPORT_TRIGGER_SQL: Readonly<Record<string, string>> = Object.fromEntries(
  Object.keys(READERS_REPORT_SCHEMA_SQL).flatMap((table) => [
    [`${table}_no_update`, `CREATE TRIGGER ${table}_no_update
    BEFORE UPDATE ON ${table}
    BEGIN
      SELECT RAISE(ABORT, 'READERS_REPORT_LEDGER_IMMUTABLE');
    END`],
    [`${table}_no_delete`, `CREATE TRIGGER ${table}_no_delete
    BEFORE DELETE ON ${table}
    BEGIN
      SELECT RAISE(ABORT, 'READERS_REPORT_LEDGER_IMMUTABLE');
    END`],
  ]),
);

/** The foreign keys of the two relations, in the exact-schema validator's own spelling. */
export const READERS_REPORT_FOREIGN_KEYS: Readonly<Record<string, ReadonlyArray<string>>> = {
  readers_report_tasks: [
    'book_id>books.book_id:NO ACTION/NO ACTION/NONE',
    'record_id>evaluation_records.record_id:NO ACTION/NO ACTION/NONE',
    'task_intent_id>analysis_task_intents.task_intent_id:NO ACTION/NO ACTION/NONE',
  ],
  readers_report_drafts: [
    'analysis_revision_id>analysis_result_set_revisions.revision_id:NO ACTION/NO ACTION/NONE',
    'book_id>books.book_id:NO ACTION/NO ACTION/NONE',
    'document_id>production_documents.document_id:NO ACTION/NO ACTION/NONE',
    'record_id>evaluation_records.record_id:NO ACTION/NO ACTION/NONE',
    'task_intent_id>analysis_task_intents.task_intent_id:NO ACTION/NO ACTION/NONE',
  ],
};

export class ReadersReportError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'ReadersReportError';
  }
}

function requireReport(condition: unknown, code: string, message: string): asserts condition {
  if (!condition) throw new ReadersReportError(code, message);
}

type SqlRow = Record<string, SQLOutputValue>;

const TASK_SCHEMA = 'ai7.readers-report-task/1';
const DRAFT_SCHEMA = 'ai7.readers-report-draft/1';
const CORRUPT = '审稿意见记录已损坏。';
const TABLE_PRESENT = "SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'readers_report_tasks'";

/** Revision 62's relations, created once: a store that predates them gains two empty relations and nothing existing moves. */
export function initializeReadersReportSchema(db: DatabaseSync): void {
  if (db.prepare(TABLE_PRESENT).get() !== undefined) return;
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const sql of Object.values(READERS_REPORT_SCHEMA_SQL)) db.exec(sql);
    for (const sql of Object.values(READERS_REPORT_TRIGGER_SQL)) db.exec(sql);
    db.exec('COMMIT');
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch (rollbackError) {
      throw new AggregateError([error, rollbackError], 'Readers report schema rollback failed.');
    }
    throw error;
  }
}

/** Why no 审稿意见 can be drafted while the Book has no 定稿 version. */
export const READERS_REPORT_NEEDS_FINALIZED = '先定稿一版评估，再从定稿起草审稿意见。' as const;

/**
 * The contract input of one draft: the template, the 定稿 version's words — never its identity or time — and the house's
 * 审稿意见 among its 范例 that seed it.
 */
export function readersReportContractInput(
  template: ReadersReportTemplate,
  finalized: FinalizedEvaluation,
  exemplars: ReadonlyArray<ReadersReportExemplarInput>,
): ReadersReportContractInput {
  const { profile, content } = finalized;
  const conclusion = profile.conclusions.find((entry) => entry.conclusion === content.conclusion);
  requireReport(conclusion !== undefined, 'READERS_REPORT_BASIS_INVALID', '定稿的评估没有结论。');
  return {
    template,
    record: {
      profile: { title: profile.title, version: profile.version },
      items: profile.items.map((item, index) => {
        const own = content.items[index]!;
        const ai7 = finalized.initial?.items.find((entry) => entry.itemId === item.itemId) ?? null;
        return {
          label: item.label,
          fullMarks: item.fullMarks,
          score: own.score,
          notRated: own.notRated,
          comment: own.comment,
          ai7: ai7 === null ? null : {
            score: ai7.score,
            sufficiency: ai7.sufficiency,
            evidence: ai7.evidence.map((evidence) => ({ unitOrdinal: evidence.unitOrdinal, note: evidence.note })),
          },
        };
      }),
      total: { score: finalized.total.score, fullMarks: finalized.total.fullMarks },
      risks: profile.risks.map((risk, index) => {
        const own = content.risks[index]!;
        requireReport(own.level !== null, 'READERS_REPORT_BASIS_INVALID', '定稿的评估有未评的风险项。');
        return { label: risk.label, level: own.level, statement: own.statement };
      }),
      readiness: [...content.readiness],
      strengths: [...content.strengths],
      weaknesses: [...content.weaknesses],
      verdict: content.verdict,
      conclusion: conclusion.label,
    },
    exemplars: [...exemplars],
  };
}

/** One 审稿意见 Task as its row holds it, verified. */
export interface StoredReadersReportTask {
  readonly taskIntentId: string;
  readonly promptContractSha256: string;
  readonly bookId: string;
  readonly recordId: string;
  readonly finalizedEntrySha256: string;
  readonly template: ReadersReportTemplate;
  readonly input: ReadersReportContractInput;
  readonly recordedAt: string;
}

/** One draft document as its row holds it, verified. */
export interface StoredReadersReportDraft {
  readonly documentId: string;
  readonly bookId: string;
  readonly template: ReadersReportTemplate;
  readonly analysisRevisionId: string;
  readonly taskIntentId: string;
  readonly recordId: string;
  readonly recordedAt: string;
}

const text = (value: SQLOutputValue | undefined): string => {
  requireReport(typeof value === 'string', 'READERS_REPORT_RECORD_INVALID', CORRUPT);
  return value;
};

function template(value: unknown): ReadersReportTemplate {
  requireReport(typeof value === 'string' && READERS_REPORT_TEMPLATES.includes(value as ReadersReportTemplate), 'READERS_REPORT_RECORD_INVALID', CORRUPT);
  return value as ReadersReportTemplate;
}

/**
 * The words of one draft as the document begins: the title, then the five sections in their order — a heading each, its
 * paragraph, or its points numbered one to a paragraph. The editor edits them on the manuscript surface from there.
 */
export function readersReportDraftBlocks(
  bookTitle: string,
  reportTemplate: ReadersReportTemplate,
  sections: ReadersReportSectionsProjection,
): Array<{ kind: 'title' | 'heading' | 'paragraph'; level: number | null; text: string }> {
  const numbered = (lines: ReadonlyArray<string>): Array<{ kind: 'paragraph'; level: null; text: string }> =>
    lines.map((line, index) => ({ kind: 'paragraph' as const, level: null, text: `${index + 1}. ${line}` }));
  type Block = { kind: 'title' | 'heading' | 'paragraph'; level: number | null; text: string };
  const heading = (id: keyof typeof READERS_REPORT_SECTION_LABELS): Block => ({ kind: 'heading', level: 1, text: READERS_REPORT_SECTION_LABELS[id] });
  const blocks: Block[] = [
    { kind: 'title', level: 1, text: `《${bookTitle}》审稿意见 · ${READERS_REPORT_TEMPLATE_LABELS[reportTemplate]}` },
    heading('overall'),
    { kind: 'paragraph', level: null, text: sections.overall },
    heading('strengths'),
    ...numbered(sections.strengths),
    heading('problems'),
    ...numbered(sections.problems),
    heading('suggestions'),
    ...numbered(sections.suggestions),
    heading('conclusion'),
    { kind: 'paragraph', level: null, text: sections.conclusion },
  ];
  return blocks.map((block) => ({ ...block, text: block.text.normalize('NFC') }));
}

/** The grapheme length every block of a draft carries, as the block store counts it. */
export function readersReportBlockLength(value: string): number {
  return graphemeCount(value);
}

export class ReadersReports {
  readonly #db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.#db = db;
  }

  #task(row: SqlRow): StoredReadersReportTask {
    const json = text(row.canonical_json);
    requireReport(sha256Hex(json) === text(row.sha256), 'READERS_REPORT_RECORD_INVALID', CORRUPT);
    const stored = JSON.parse(json) as unknown;
    requireReport(isRecord(stored) && stored.schema === TASK_SCHEMA && stored.taskIntentId === row.task_intent_id &&
      stored.promptContractSha256 === row.prompt_contract_sha256 && stored.bookId === row.book_id && stored.recordId === row.record_id &&
      stored.finalizedEntrySha256 === row.finalized_entry_sha256 && stored.template === row.template && stored.recordedAt === row.recorded_at &&
      isRecord(stored.input) && stored.input.template === row.template,
    'READERS_REPORT_RECORD_INVALID', CORRUPT);
    const input = stored.input as unknown as ReadersReportContractInput;
    // The frozen input is the contract: its digest must be the one the row names.
    let digest: string;
    try {
      digest = readersReportContractDigest(readersReportContract(input));
    } catch {
      throw new ReadersReportError('READERS_REPORT_RECORD_INVALID', CORRUPT);
    }
    requireReport(digest === row.prompt_contract_sha256, 'READERS_REPORT_RECORD_INVALID', CORRUPT);
    return {
      taskIntentId: text(row.task_intent_id),
      promptContractSha256: text(row.prompt_contract_sha256),
      bookId: text(row.book_id),
      recordId: text(row.record_id),
      finalizedEntrySha256: text(row.finalized_entry_sha256),
      template: template(row.template),
      input,
      recordedAt: text(row.recorded_at),
    };
  }

  /**
   * Record which 定稿 version and template a Task drafts from, in the caller's transaction — once per Task and contract: a
   * Task the ledger revised in place for this very request holds it already.
   */
  recordTask(input: {
    taskIntentId: string;
    bookId: string;
    recordId: string;
    finalizedEntrySha256: string;
    contract: ReadersReportContractInput;
    promptContractSha256: string;
  }): void {
    requireReport(UUID_PATTERN.test(input.taskIntentId) && UUID_PATTERN.test(input.bookId) && UUID_PATTERN.test(input.recordId),
      'READERS_REPORT_INVALID', '审稿意见参数无效。');
    const intent = this.#db.prepare('SELECT book_id, kind FROM analysis_task_intents WHERE task_intent_id = ?').get(input.taskIntentId) as SqlRow | undefined;
    requireReport(intent !== undefined && intent.book_id === input.bookId && intent.kind === READERS_REPORT_KIND, 'READERS_REPORT_INVALID', '审稿意见任务无效。');
    const existing = this.#db.prepare('SELECT 1 FROM readers_report_tasks WHERE task_intent_id = ? AND prompt_contract_sha256 = ?')
      .get(input.taskIntentId, input.promptContractSha256);
    if (existing !== undefined) return;
    const recordedAt = new Date().toISOString();
    const record = canonicalRecord({
      schema: TASK_SCHEMA,
      taskIntentId: input.taskIntentId,
      promptContractSha256: input.promptContractSha256,
      bookId: input.bookId,
      recordId: input.recordId,
      finalizedEntrySha256: input.finalizedEntrySha256,
      template: input.contract.template,
      input: input.contract,
      recordedAt,
    });
    this.#db.prepare(
      `INSERT INTO readers_report_tasks(
         task_intent_id, prompt_contract_sha256, book_id, record_id, finalized_entry_sha256, template, recorded_at, canonical_json, sha256
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(input.taskIntentId, input.promptContractSha256, input.bookId, input.recordId, input.finalizedEntrySha256,
      input.contract.template, recordedAt, record.json, record.digest);
  }

  /**
   * One Task's 定稿 version and template: the row whose contract the Task's frozen plan names when `planContract` is given,
   * else the one recorded last — the request its preparation was last made for. `null` for a Task with none.
   */
  task(taskIntentId: string, planContract: string | null = null): StoredReadersReportTask | null {
    const rows = this.#db.prepare('SELECT * FROM readers_report_tasks WHERE task_intent_id = ? ORDER BY recorded_at, rowid')
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
    requireReport(sha256Hex(json) === text(row.sha256), 'READERS_REPORT_RECORD_INVALID', CORRUPT);
    const envelope = JSON.parse(json) as unknown;
    requireReport(isRecord(envelope) && typeof envelope.promptContractDigest === 'string', 'READERS_REPORT_RECORD_INVALID', CORRUPT);
    return envelope.promptContractDigest;
  }

  /** The Book's latest 审稿意见 Task by its intent, as the analysis ledger orders them; `null` before the first. */
  latestTaskIntentId(bookId: string): string | null {
    const row = this.#db.prepare(
      'SELECT task_intent_id FROM analysis_task_intents WHERE book_id = ? AND kind = ? ORDER BY created_at DESC, rowid DESC LIMIT 1',
    ).get(bookId, READERS_REPORT_KIND) as SqlRow | undefined;
    return row === undefined ? null : text(row.task_intent_id);
  }

  /** Any recorded 审稿意见 Task of any Book, the latest: what a reconciliation of the kind's Runs builds its ledger from. */
  anyTask(): StoredReadersReportTask | null {
    const row = this.#db.prepare('SELECT * FROM readers_report_tasks ORDER BY recorded_at DESC, rowid DESC LIMIT 1').get() as SqlRow | undefined;
    return row === undefined ? null : this.#task(row);
  }

  /** The Book's 审稿意见 Result Set Revisions newest first, each with the Task that made it. */
  revisions(bookId: string): Array<{ revisionId: string; ordinal: number; createdAt: string; taskIntentId: string }> {
    return (this.#db.prepare(
      `SELECT r.revision_id, r.ordinal, r.created_at, r.task_intent_id FROM analysis_result_set_revisions r
       JOIN analysis_result_sets s ON s.result_set_id = r.result_set_id
       WHERE s.book_id = ? AND s.kind = ? ORDER BY r.ordinal DESC`,
    ).all(bookId, READERS_REPORT_KIND) as SqlRow[]).map((row) => ({
      revisionId: text(row.revision_id),
      ordinal: Number(row.ordinal),
      createdAt: text(row.created_at),
      taskIntentId: text(row.task_intent_id),
    }));
  }

  #draft(row: SqlRow): StoredReadersReportDraft {
    const json = text(row.canonical_json);
    requireReport(sha256Hex(json) === text(row.sha256), 'READERS_REPORT_RECORD_INVALID', CORRUPT);
    const stored = JSON.parse(json) as unknown;
    requireReport(isRecord(stored) && stored.schema === DRAFT_SCHEMA && stored.documentId === row.document_id && stored.bookId === row.book_id &&
      stored.template === row.template && stored.analysisRevisionId === row.analysis_revision_id && stored.taskIntentId === row.task_intent_id &&
      stored.recordId === row.record_id && stored.recordedAt === row.recorded_at,
    'READERS_REPORT_RECORD_INVALID', CORRUPT);
    return {
      documentId: text(row.document_id),
      bookId: text(row.book_id),
      template: template(row.template),
      analysisRevisionId: text(row.analysis_revision_id),
      taskIntentId: text(row.task_intent_id),
      recordId: text(row.record_id),
      recordedAt: text(row.recorded_at),
    };
  }

  /** The Book's draft documents, one per template at most. */
  drafts(bookId: string): StoredReadersReportDraft[] {
    return (this.#db.prepare('SELECT * FROM readers_report_drafts WHERE book_id = ? ORDER BY recorded_at, rowid').all(bookId) as SqlRow[])
      .map((row) => this.#draft(row));
  }

  /** Which drafted result became this template's draft document, in the transaction that made the document. */
  recordDraft(input: Omit<StoredReadersReportDraft, 'recordedAt'> & { recordedAt: string }): void {
    const record = canonicalRecord({ schema: DRAFT_SCHEMA, ...input });
    this.#db.prepare(
      `INSERT INTO readers_report_drafts(
         document_id, book_id, template, analysis_revision_id, task_intent_id, record_id, recorded_at, canonical_json, sha256
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(input.documentId, input.bookId, input.template, input.analysisRevisionId, input.taskIntentId, input.recordId, input.recordedAt,
      record.json, record.digest);
  }

  /** The revision digest of a draft's first revision: what it was made from, and the words it was made with. */
  static draftRevisionDigest(documentId: string, analysisRevisionId: string, blocks: ReadonlyArray<{ kind: string; level: number | null; text: string }>): string {
    return sha256Hex(canonicalJson({ schema: 'ai7.readers-report-draft-revision/1', documentId, analysisRevisionId, blocks }));
  }
}

/** The conclusion label a profile gives one conclusion, for the words of a draft's plan. */
export function conclusionLabelOf(profile: FinalizedEvaluation['profile'], conclusion: EvaluationConclusion | null): string | null {
  return profile.conclusions.find((entry) => entry.conclusion === conclusion)?.label ?? null;
}
