import type { DatabaseSync, SQLOutputValue } from 'node:sqlite';
import { clarificationPromptContractDigest } from './provider/clarification-contract.js';
import {
  READERS_REPORT_KIND,
  READERS_REPORT_SECTION_LABELS,
  READERS_REPORT_TEMPLATE_LABELS,
  READERS_REPORT_TEMPLATES,
  type EvaluationConclusion,
  type ReadersReportSectionsProjection,
  type ReadersReportTemplate,
  type ReadersReportProjection,
  READERS_REPORT_LIVE_UNAVAILABLE,
  type LaunchPolicyProjection,
  READERS_REPORT_MODE_GOALS,
  type EvaluationReadersReportProjection,
  type EvaluationWorkspaceProjection,
  INITIAL_EVALUATION_KIND,
  EVALUATION_REWRITE_KIND,
} from '../shared/protocol.js';
import { UUID_PATTERN, canonicalJson, canonicalRecord, isRecord, sha256Hex } from './analysis/canonical.js';
import { graphemeCount } from './analysis/factual-review-contract.js';
import {
  readersReportContract,
  readersReportContractDigest,
  type ReadersReportContractInput,
  type ReadersReportExemplarInput,
  readersReportExemplarLine,
} from './evaluation/readers-report-contract.js';
import type { FinalizedEvaluation, EvaluationRecords } from './evaluation-records.js';
import {
  type TaskMaterialBoundary,
  taskMaterialKindDefinition,
  type TaskMaterialSource,
  type TaskMaterialReading,
} from './task-material-references.js';
import {
  BaselineAnalysisStore,
  type ProgressReader,
  type AnalysisPreparationResult,
  runIsActive,
  activeRunReason,
} from './analysis/baseline-analysis-store.js';
import { readersReportKindDefinition } from './evaluation/readers-report-kind.js';
import {
  requireStore,
  StoreError,
  UUID_PATTERN as StoreUUID_PATTERN,
  canonicalJson as storeCanonicalJson,
  type SqlRow as StoreSqlRow,
  asString,
  sha256,
} from './store-records.js';
import {
  readersReportDocumentTypeId,
  readersReportDocumentType,
  READERS_REPORT_DOCUMENT_TYPES,
  READERS_REPORT_DOCUMENT_TYPES_DIGEST,
} from './production-document-types.js';
import { readersReportTaskStateLabel } from './task-plan.js';
import { randomUUID } from 'node:crypto';
import type { BoundedManuscriptStore } from './bounded-manuscript.js';
import type { ProductionDocumentWorkflow } from './production-document-workflow.js';
import type { ProductionDocuments } from './production-documents.js';
import { RecentCache } from './recent-cache.js';
import type { StoreControl, LedgerTaskKind } from './store.js';

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
          ...(item.description === undefined ? {} : { description: item.description }),
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

/** One preparation's skipped exemplar, as 评估 and the frozen plan name it (Issue #792): a damaged record, or a ledger. */
export interface ReadersReportSkippedExemplar {
  readonly title: string;
  readonly reason: 'record' | 'ledger';
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
  /**
   * What the preparation skipped for damage, as 评估 named it then: a frozen plan carries the note, and a row recorded before
   * Issue #792 names none.
   */
  readonly skippedExemplars: ReadonlyArray<ReadersReportSkippedExemplar>;
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
    // What the preparation skipped for damage (Issue #792): a row recorded before it names none.
    const skipped = stored.skippedExemplars === undefined ? [] : stored.skippedExemplars;
    requireReport(Array.isArray(skipped) && skipped.every((entry) => isRecord(entry) && typeof entry.title === 'string' && entry.title.isWellFormed() &&
      entry.title.length > 0 && graphemeCount(entry.title) <= 200 && (entry.reason === 'record' || entry.reason === 'ledger')),
    'READERS_REPORT_RECORD_INVALID', CORRUPT);
    // The frozen input is the contract: its digest must be the one the row names.
    let digest: string;
    try {
      digest = readersReportContractDigest(readersReportContract(input));
    } catch {
      throw new ReadersReportError('READERS_REPORT_RECORD_INVALID', CORRUPT);
    }
    requireReport(digest === row.prompt_contract_sha256 || clarificationPromptContractDigest(digest) === row.prompt_contract_sha256,
      'READERS_REPORT_RECORD_INVALID', CORRUPT);
    return {
      taskIntentId: text(row.task_intent_id),
      promptContractSha256: text(row.prompt_contract_sha256),
      bookId: text(row.book_id),
      recordId: text(row.record_id),
      finalizedEntrySha256: text(row.finalized_entry_sha256),
      template: template(row.template),
      input,
      skippedExemplars: (skipped as ReadersReportSkippedExemplar[]).map((entry) => ({ title: entry.title, reason: entry.reason })),
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
    /** What the preparation skipped for damage, so the frozen plan's exemplar line can name it (Issue #792). */
    skippedExemplars: ReadonlyArray<ReadersReportSkippedExemplar>;
    promptContractSha256: string;
  }): void {
    requireReport(UUID_PATTERN.test(input.taskIntentId) && UUID_PATTERN.test(input.bookId) && UUID_PATTERN.test(input.recordId) &&
      input.skippedExemplars.every((entry) => typeof entry.title === 'string' && entry.title.isWellFormed() && entry.title.length > 0 &&
        graphemeCount(entry.title) <= 200 && (entry.reason === 'record' || entry.reason === 'ledger')),
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
      skippedExemplars: input.skippedExemplars.map((entry) => ({ title: entry.title, reason: entry.reason })),
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

  /**
   * Any recorded 审稿意见 Task of any Book that still verifies, the latest first: what a reconciliation of the kind's Runs builds
   * its ledger from. A damaged row is passed over — the reconciliation needs the kind, not that row.
   */
  anyTask(): StoredReadersReportTask | null {
    for (const row of this.#db.prepare('SELECT * FROM readers_report_tasks ORDER BY recorded_at DESC, rowid DESC').iterate() as IterableIterator<SqlRow>) {
      try {
        return this.#task(row);
      } catch (error) {
        if (!(error instanceof ReadersReportError)) throw error;
      }
    }
    return null;
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

// ---- 审稿意见 operations of the store (Issue #429 S81c; moved from store.ts by Issue #1172) ---------------------------------------

/** The store state and calls the 审稿意见 operations use, lent by EditorialStore: its fields read live through getters, its own methods bound. */
export interface ReadersReportStoreHost {
  analysisCall<T>(operation: () => T): T;
  assertAvailable(): void;
  readonly authority: DatabaseSync;
  readonly baselineAnalysis: BaselineAnalysisStore;
  readonly boundedAuthority: BoundedManuscriptStore;
  boundedCall<T>(operation: () => T): T;
  readonly control: StoreControl;
  documentCall<T>(operation: () => T): T;
  readonly documentWorkflow: ProductionDocumentWorkflow;
  evaluationCall<T>(operation: () => T): T;
  evaluationLiveRefused(kind: typeof INITIAL_EVALUATION_KIND | typeof READERS_REPORT_KIND | typeof EVALUATION_REWRITE_KIND): boolean;
  evaluationMaterialPlan(taskIntentId: string): { boundary: TaskMaterialBoundary; baseDigest: string; promptDigest: string } | null;
  evaluationRecordOrdinal(recordId: string): number;
  readonly evaluations: EvaluationRecords;
  inspectEvaluation(bookId: string, recordId: string | null, recordsBefore?: number | null): EvaluationWorkspaceProjection;
  ledgerTaskOf(kind: LedgerTaskKind, bookId: string, taskIntentId: string): BaselineAnalysisStore;
  prepareTaskMaterials(bookId: string, materialIds: ReadonlyArray<string>): ReadonlyArray<TaskMaterialSource>;
  readonly productionDocuments: ProductionDocuments;
  readersReportCall<T>(operation: () => T): T;
  readersReportExemplars(bookId: string): { exemplars: ReadersReportExemplarInput[]; damaged: string[]; ledgerDamaged: string[] };
  readonly readersReportLedgers: RecentCache<BaselineAnalysisStore>;
  readonly readersReports: ReadersReports;
  requireEvaluationMaterialScope(hasReferences: boolean, kind: string): void;
  requireLedgerKindScope(kind: LedgerTaskKind, bookId: string, taskIntentId: string): void;
  taskMaterialReadings(boundary: TaskMaterialBoundary, surface?: '审阅' | '评估'): ReadonlyArray<TaskMaterialReading>;
  transaction<T>(db: DatabaseSync, operation: () => T): T;
}

/**
 * The reader's report ledger of one frozen contract — a template and one 定稿 version's words — made when first asked for. As
 * a review category's, only the `REVIEW_CATEGORY_CACHE_CAPACITY` most recently used are kept besides those with a preparation
 * in flight, which only that instance holds (Issue #672); any other is made afresh from the Book database and reads exactly
 * what the one let go would have. It takes the launch the baseline ledger was bound to.
 */
export function readersReportLedger(host: ReadersReportStoreHost, input: ReadersReportContractInput, materials?: TaskMaterialBoundary, frozenPromptDigest?: string): BaselineAnalysisStore {
  host.assertAvailable();
  const base = host.analysisCall(() => readersReportKindDefinition(input));
  const readings = materials === undefined || materials.references.length === 0 ? [] : host.taskMaterialReadings(materials, '评估');
  const definition = materials === undefined ? base : host.analysisCall(() => taskMaterialKindDefinition(base, materials, readings, frozenPromptDigest));
  const make = (): BaselineAnalysisStore => {
    const ledger = new BaselineAnalysisStore(host.authority, host.boundedAuthority, host.control.baselineAnalysisRoute, definition);
    ledger.bindLaunch(host.baselineAnalysis.launch);
    return ledger;
  };
  return readings.some((reading) => reading.refusal !== null) ? make() : host.readersReportLedgers.obtain(definition.promptContractDigest, make);
}

/** The kept reader's report ledger that holds the preparation `workId`, if one does: a ledger preparing is never let go. */
export function readersReportLedgerPreparing(host: ReadersReportStoreHost, workId: string): BaselineAnalysisStore | undefined {
  for (const ledger of host.readersReportLedgers.values()) if (ledger.holdsPreparation(workId)) return ledger;
  return undefined;
}

/** One Task's 定稿 version and template — the one its frozen plan names when it froze one. */
export function readersReportTaskOf(host: ReadersReportStoreHost, taskIntentId: string): { task: StoredReadersReportTask; ledger: BaselineAnalysisStore } | null {
  const frozen = host.evaluationMaterialPlan(taskIntentId);
  const planContract = frozen?.baseDigest ?? host.readersReportCall(() => host.readersReports.planContract(taskIntentId));
  const task = host.readersReportCall(() => host.readersReports.task(taskIntentId, planContract));
  if (task === null) {
    requireStore(planContract === null, 'READERS_REPORT_RECORD_INVALID', '审稿意见任务的计划与它的记录不一致。');
    return null;
  }
  return { task, ledger: readersReportLedger(host, task.input, frozen?.boundary, frozen?.promptDigest) };
}

/** The Book's latest 审稿意见 Task with its ledger and projection; `null` before the first, or for one no record names. */
export function latestReadersReport(host: ReadersReportStoreHost, bookId: string, progress?: ProgressReader): { task: StoredReadersReportTask; ledger: BaselineAnalysisStore; projection: ReadersReportProjection } | null {
  const intentId = host.readersReportCall(() => host.readersReports.latestTaskIntentId(bookId));
  if (intentId === null) return null;
  const found = readersReportTaskOf(host, intentId);
  if (found === null) return null;
  const projection = host.analysisCall(() => found.ledger.inspect(bookId, progress)) as ReadersReportProjection;
  return { ...found, projection };
}

/** The Book's latest 审稿意见 Task as its ledger reads it, or `null`; `progress` is the execution owner's reader. */
export function inspectReadersReport(host: ReadersReportStoreHost, bookId: string, progress?: ProgressReader): ReadersReportProjection | null {
  host.assertAvailable();
  return latestReadersReport(host, bookId, progress)?.projection ?? null;
}

/**
 * 审稿意见 runs only where it may be sent (EVAL-013, as 初评): under a live scope only a rule naming the kind with the editor's
 * record and the house exemplars admits it; otherwise nothing is prepared or started there, and 评估 says why. The
 * provider-free scope is unaffected.
 */
export function requireReadersReportScope(host: ReadersReportStoreHost): void {
  host.assertAvailable();
  if (host.evaluationLiveRefused(READERS_REPORT_KIND)) throw new StoreError('READERS_REPORT_UNAVAILABLE', READERS_REPORT_LIVE_UNAVAILABLE);
}

/**
 * What 评估 says of the house's 审稿意见 exemplars (Issue #778, #792): the ones that read, then what cannot be read — a
 * damaged record, or one whose decision ledger alone will not read, each under its own plain reason and named as it would
 * be listed, so one damaged record leaves only itself out. When nothing readable precedes the damage, 「另有」 is not used.
 */
export function readersReportExemplarStatement(host: ReadersReportStoreHost, readings: { exemplars: ReadonlyArray<ReadersReportExemplarInput>; damaged: ReadonlyArray<string>; ledgerDamaged: ReadonlyArray<string> }): string {
  const clauses: string[] = [];
  const clause = (count: number, subject: string, titles: ReadonlyArray<string>): void => {
    if (count === 0) return;
    const names = titles.map((title) => `《${title}》`).join('、');
    clauses.push(clauses.length === 0 && readings.exemplars.length === 0
      ? `本社有 ${count} 份审稿意见范例${subject}已损坏，无法读取，本次不参考范例：${names}`
      : `另有 ${count} 份范例${subject}已损坏，无法读取，本次不参考：${names}`);
  };
  clause(readings.damaged.length, '记录', readings.damaged);
  clause(readings.ledgerDamaged.length, '的学习准入记录', readings.ledgerDamaged);
  if (clauses.length === 0) return readersReportExemplarLine(readings.exemplars);
  return readings.exemplars.length === 0
    ? clauses.join('；')
    : `${readersReportExemplarLine(readings.exemplars)}；${clauses.join('；')}`;
}

/**
 * 起草审稿意见 (EVAL-013): the reader's report kind's Task, drafted from the Book's latest 定稿 version under one template, in
 * the mode that applies — the first draft, or another once one settled. Refused under a live scope, while no version is
 * 定稿, or once the template has its draft document. Its plan opens in the Task Drawer.
 */
export function createReadersReportPreparationWork(host: ReadersReportStoreHost, bookId: string, template: ReadersReportTemplate, launchPolicy: LaunchPolicyProjection, materialIds: ReadonlyArray<string> = [], redoOf: string | null = null): AnalysisPreparationResult<ReadersReportProjection> {
  host.requireEvaluationMaterialScope(materialIds.length > 0, READERS_REPORT_KIND);
  requireReadersReportScope(host);
  requireStore(StoreUUID_PATTERN.test(bookId) && READERS_REPORT_TEMPLATES.includes(template), 'READERS_REPORT_INVALID', '审稿意见参数无效。');
  const basis = host.evaluationCall(() => host.evaluations.latestFinalized(bookId));
  requireStore(basis !== null, 'READERS_REPORT_NEEDS_FINALIZED', READERS_REPORT_NEEDS_FINALIZED);
  requireStore(host.documentCall(() => host.productionDocuments.documentOfType(bookId, readersReportDocumentTypeId(template))) === undefined,
    'READERS_REPORT_DRAFT_EXISTS', `这本书已经有「${READERS_REPORT_TEMPLATE_LABELS[template]}」的草稿；请打开它继续修改。`);
  const readings = host.readersReportExemplars(bookId);
  const input = host.readersReportCall(() => readersReportContractInput(template, basis, readings.exemplars));
  const ledger = readersReportLedger(host, input, { bookId, references: host.prepareTaskMaterials(bookId, materialIds) });
  const latest = latestReadersReport(host, bookId);
  const mode = latest === null || latest.projection.resultSetRevision === null ? 'readers-report-first' : 'readers-report-again';
  // What this preparation skipped for damage, and the contract it is recorded under (Issue #792).
  const skippedExemplars = [
    ...readings.damaged.map((title) => ({ title, reason: 'record' as const })),
    ...readings.ledgerDamaged.map((title) => ({ title, reason: 'ledger' as const })),
  ];
  const promptContractSha256 = ledger.definition.materialReferences?.basePromptContractDigest ?? ledger.definition.promptContractDigest;
  // A row is written once per contract, so re-preparing under a digest already recorded would keep its first note. When only
  // the damage set changed — a damaged exemplar repaired or replaced — prepare a new Task, whose fresh row names the current
  // set, as the frozen plan's exemplar line must (Issue #803).
  // An interrupted preparation can record several contracts before any plan freezes. Compare the requested contract's
  // row, even when another template's contract was recorded more recently on that same Task.
  const recorded = latest === null ? null : host.readersReportCall(() =>
    host.readersReports.task(latest.task.taskIntentId, promptContractSha256));
  const noteChanged = recorded !== null && storeCanonicalJson(recorded.skippedExemplars) !== storeCanonicalJson(skippedExemplars);
  const result = host.analysisCall(() => ledger.prepare({
    phase: 'start',
    bookId,
    goal: READERS_REPORT_MODE_GOALS[mode],
    redoOf,
    update: mode === 'readers-report-first' ? null : { mode, selectedRange: null },
    reconfirm: false,
    launchPolicy,
    ...(noteChanged || storeCanonicalJson(latest?.ledger.definition.materialReferences?.sources ?? []) !== storeCanonicalJson(ledger.definition.materialReferences?.sources ?? []) ? { newTask: true } : {}),
  }));
  // Which 定稿 version and template the Task drafts from, recorded once for it and this contract, and what that preparation
  // left out for damage: a plan is frozen, so its exemplar line names what was skipped when it was drafted (Issue #792).
  const taskIntentId = host.readersReportCall(() => host.readersReports.latestTaskIntentId(bookId));
  requireStore(taskIntentId !== null, 'READERS_REPORT_RECORD_INVALID', '审稿意见任务没有准备出来。');
  host.readersReportCall(() => host.transaction(host.authority, () => host.readersReports.recordTask({
    taskIntentId,
    bookId,
    recordId: basis.recordId,
    finalizedEntrySha256: basis.entrySha256,
    contract: input,
    skippedExemplars,
    promptContractSha256,
  })));
  return { ...result, projection: result.projection as ReadersReportProjection | null };
}

export function advanceReadersReportPreparationWork(host: ReadersReportStoreHost, workId: string): AnalysisPreparationResult<ReadersReportProjection> {
  host.assertAvailable();
  const ledger = readersReportLedgerPreparing(host, workId);
  requireStore(ledger !== undefined, 'ANALYSIS_PREPARATION_NOT_FOUND', '审稿意见的计划准备已不存在。');
  const result = host.analysisCall(() => ledger.prepare({ phase: 'advance', workId }));
  return { ...result, projection: result.projection as ReadersReportProjection | null };
}

export function cancelReadersReportPreparationWork(host: ReadersReportStoreHost, workId: string): boolean {
  host.assertAvailable();
  const ledger = readersReportLedgerPreparing(host, workId);
  if (ledger === undefined) return false;
  host.analysisCall(() => ledger.prepare({ phase: 'cancel', workId }));
  return true;
}

/** 开始任务 in the drawer's bar: the Run Authorization and the Run on the ledger of the plan's contract, for the owner. */
export function authorizeReadersReport(
    host: ReadersReportStoreHost,
  bookId: string,
  taskIntentId: string,
  planEnvelopeDigest: string,
  start: 'now' | 'when-online' | 'idle' = 'now',
): { dispatchRunRecordId: string | null; ledger: BaselineAnalysisStore } {
  host.requireLedgerKindScope('readers-report', bookId, taskIntentId);
  const ledger = host.ledgerTaskOf('readers-report', bookId, taskIntentId);
  const authorized = host.analysisCall(() => ledger.authorize(bookId, taskIntentId, planEnvelopeDigest, start));
  return { dispatchRunRecordId: authorized.dispatchRunRecordId, ledger };
}

/** Reconcile stranded Runs to their kept continuation points; queued starts still require an explicit new start. */
export function reconcileStoppedReadersReportRuns(host: ReadersReportStoreHost): { settled: number } {
  host.assertAvailable();
  const any = host.readersReportCall(() => host.readersReports.anyTask());
  if (any === null) return { settled: 0 };
  return { settled: host.analysisCall(() => readersReportLedger(host, any.input).reconcileStoppedRuns()).settled };
}

/**
 * 审稿意见 on ②C (EVAL-013): the 定稿 version a new one drafts from, the Book's latest Task, and per template whether it can be
 * drafted, its newest result not yet opened, and its draft document.
 */
export function readersReportWorkspace(host: ReadersReportStoreHost, bookId: string, basis: FinalizedEvaluation | null, unreadable: string | null): EvaluationReadersReportProjection {
  const readings = host.readersReportExemplars(bookId);
  let latest: { task: StoredReadersReportTask; ledger: BaselineAnalysisStore; projection: ReadersReportProjection } | null = null;
  let unavailable: string | null = unreadable;
  try {
    latest = latestReadersReport(host, bookId);
  } catch (error) {
    if (!(error instanceof StoreError)) throw error;
    unavailable = `审稿意见暂不可用：${error.message}`;
  }
  const runState = latest?.projection.run?.state ?? null;
  const drafts = host.readersReportCall(() => host.readersReports.drafts(bookId));
  const revisions = host.readersReportCall(() => host.readersReports.revisions(bookId));
  const templates = READERS_REPORT_TEMPLATES.map((template) => {
    const label = READERS_REPORT_TEMPLATE_LABELS[template];
    const typeId = readersReportDocumentTypeId(template);
    const stored = drafts.find((draft) => draft.template === template);
    const row = stored === undefined ? undefined : host.documentCall(() => host.productionDocuments.documentById(bookId, stored.documentId));
    const draft = stored === undefined || row === undefined ? null : {
      typeId,
      typeLabel: readersReportDocumentType(typeId)!.label,
      recordOrdinal: host.evaluationRecordOrdinal(stored.recordId),
      document: host.documentCall(() => host.productionDocuments.document(row)),
    };
    // The newest result of this template whose synthesis wrote the draft, while the template has no draft document yet.
    let drafted: { revisionId: string; recordOrdinal: number; createdAt: string } | null = null;
    if (draft === null && unavailable === null) {
      for (const revision of revisions) {
        const found = readersReportTaskOf(host, revision.taskIntentId);
        if (found === null || found.task.template !== template) continue;
        const inspected = host.analysisCall(() => found.ledger.inspect(bookId, undefined, revision.revisionId)) as ReadersReportProjection;
        if (inspected.inspectedRevision?.revision.readersReport.sections !== null) {
          drafted = { revisionId: revision.revisionId, recordOrdinal: host.evaluationRecordOrdinal(found.task.recordId), createdAt: revision.createdAt };
        }
        break;
      }
    }
    const prepare: EvaluationReadersReportProjection['templates'][number]['prepare'] =
      host.evaluationLiveRefused(READERS_REPORT_KIND) ? { allowed: false, reason: READERS_REPORT_LIVE_UNAVAILABLE }
      : unavailable !== null ? { allowed: false, reason: unavailable }
      : basis === null ? { allowed: false, reason: READERS_REPORT_NEEDS_FINALIZED }
      : draft !== null ? { allowed: false, reason: `这本书已经有「${label}」的草稿；请打开它继续修改。` }
      : runIsActive(runState) ? { allowed: false, reason: activeRunReason(runState, READERS_REPORT_KIND) }
      : { allowed: true, mode: latest === null || latest.projection.resultSetRevision === null ? 'readers-report-first' : 'readers-report-again' };
    return { template, label, prepare, drafted, draft };
  });
  const task = latest?.projection.taskIntent ?? null;
  return {
    basis: basis === null ? null : { recordId: basis.recordId, ordinal: basis.ordinal, revisionLabel: basis.revisionLabel, finalizedAt: basis.finalizedAt },
    exemplars: { count: readings.exemplars.length, statement: readersReportExemplarStatement(host, readings) },
    task: latest === null || task === null ? null : {
      taskIntentId: task.taskIntentId,
      template: latest.task.template,
      state: latest.projection.state,
      label: readersReportTaskStateLabel(latest.projection),
    },
    templates,
  };
}

/**
 * 打开草稿 (EVAL-013): one drafted result made its template's draft document — an Editorial Artifact in the same block store
 * as a Production Document, edited on the manuscript surface with the same marks, saved as `版本 N` and exported as DOCX —
 * in one transaction with the record of which result and which 定稿 version it was made from. Once per template of a Book:
 * the draft is then edited in place. It is a draft: nothing is delivered or sent, and the Evaluation Record is unchanged.
 */
export function createReadersReportDraft(host: ReadersReportStoreHost, bookId: string, revisionId: string): EvaluationWorkspaceProjection {
  host.assertAvailable();
  requireStore(StoreUUID_PATTERN.test(bookId) && StoreUUID_PATTERN.test(revisionId), 'READERS_REPORT_INVALID', '审稿意见参数无效。');
  const revision = host.readersReportCall(() => host.readersReports.revisions(bookId)).find((entry) => entry.revisionId === revisionId);
  requireStore(revision !== undefined, 'READERS_REPORT_NOT_FOUND', '这本书没有这一次起草的审稿意见。');
  const found = readersReportTaskOf(host, revision.taskIntentId);
  requireStore(found !== null, 'READERS_REPORT_RECORD_INVALID', '这一次起草没有记下它依据的评估版本。');
  const inspected = host.analysisCall(() => found.ledger.inspect(bookId, undefined, revisionId)) as ReadersReportProjection;
  const sections = inspected.inspectedRevision?.revision.readersReport.sections ?? null;
  requireStore(sections !== null, 'READERS_REPORT_NOT_DRAFTED', '这一次起草没有写出审稿意见，不能打开草稿。');
  const template = found.task.template;
  const typeId = readersReportDocumentTypeId(template);
  const type = readersReportDocumentType(typeId)!;
  const book = host.authority.prepare('SELECT title FROM books WHERE book_id = ?').get(bookId) as StoreSqlRow | undefined;
  requireStore(book !== undefined, 'BOOK_NOT_FOUND', '图书不存在。');
  // Every revision names a Source Version; a draft's names the manuscript file its 定稿 version evaluated (the export writes
  // the draft fresh from its own words, never from that file).
  const source = host.authority.prepare(
    `SELECT mr.source_version_id FROM evaluation_records er JOIN manuscript_revisions mr ON mr.revision_id = er.revision_id
       WHERE er.record_id = ? AND er.book_id = ?`,
  ).get(found.task.recordId, bookId) as StoreSqlRow | undefined;
  requireStore(source !== undefined, 'READERS_REPORT_RECORD_INVALID', '审稿意见所依据的评估版本缺失。');
  const sourceVersionId = asString(source.source_version_id);
  const blocks = readersReportDraftBlocks(asString(book.title), template, sections).map((block) => ({
    ...block,
    digest: sha256(storeCanonicalJson({ kind: block.kind, level: block.level, text: block.text })),
    graphemeLength: readersReportBlockLength(block.text),
  }));
  const now = new Date().toISOString();
  const documentId = randomUUID();
  const branchId = randomUUID();
  const draftRevisionId = randomUUID();
  const characterCount = blocks.reduce((total, block) => total + block.graphemeLength, 0);
  const revisionDigest = ReadersReports.draftRevisionDigest(documentId, revisionId, blocks.map(({ kind, level, text }) => ({ kind, level, text })));
  host.documentCall(() => host.readersReportCall(() => host.transaction(host.authority, () => {
    // The checks again, inside the transaction that writes: a second 打开草稿 of the template refuses this one.
    requireStore(host.productionDocuments.documentOfType(bookId, typeId) === undefined, 'READERS_REPORT_DRAFT_EXISTS',
      `这本书已经有「${READERS_REPORT_TEMPLATE_LABELS[template]}」的草稿；请打开它继续修改。`);
    host.authority.prepare("INSERT INTO manuscripts(manuscript_id, book_id, role, created_at) VALUES (?, ?, 'production-document', ?)")
      .run(documentId, bookId, now);
    host.authority.prepare('INSERT INTO manuscript_branches(branch_id, manuscript_id, name, created_at) VALUES (?, ?, ?, ?)')
      .run(branchId, documentId, type.label, now);
    host.authority.prepare(
      `INSERT INTO manuscript_revisions(
           revision_id, manuscript_id, branch_id, ordinal, revision_label, parent_revision_id,
           source_version_id, revision_digest, created_at
         ) VALUES (?, ?, ?, 1, 'r1', NULL, ?, ?, ?)`,
    ).run(draftRevisionId, documentId, branchId, sourceVersionId, revisionDigest, now);
    host.authority.prepare('UPDATE manuscript_branches SET base_revision_id = ? WHERE branch_id = ?').run(draftRevisionId, branchId);
    const insertBlock = host.authority.prepare('INSERT INTO manuscript_blocks(block_id, manuscript_id, created_revision_id) VALUES (?, ?, ?)');
    const insertVersion = host.authority.prepare(
      `INSERT INTO manuscript_block_versions(
           revision_id, block_id, position, kind, level, text, digest, start_offset, grapheme_length
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const insertWorking = host.authority.prepare(
      `INSERT INTO working_blocks(branch_id, block_id, position, kind, level, text, digest, grapheme_length)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    let offset = 0;
    blocks.forEach((block, index) => {
      const position = index + 1;
      const blockId = `blk_${sha256(`${draftRevisionId}\u0000${position}\u0000${block.digest}`).slice(0, 24)}`;
      insertBlock.run(blockId, documentId, draftRevisionId);
      insertVersion.run(draftRevisionId, blockId, position, block.kind, block.level, block.text, block.digest, offset, block.graphemeLength);
      insertWorking.run(branchId, blockId, position, block.kind, block.level, block.text, block.digest, block.graphemeLength);
      offset += block.graphemeLength;
    });
    host.authority.prepare(
      `INSERT INTO branch_working_state(
           branch_id, manuscript_id, base_revision_id, journal_sequence, working_digest,
           total_graphemes, history_sequence, last_checkpoint_sequence
         ) VALUES (?, ?, ?, 0, ?, ?, 0, 0)`,
    ).run(branchId, documentId, draftRevisionId, revisionDigest, characterCount);
    requireStore(
      host.boundedCall(() => host.boundedAuthority.initializeImportedBranch(branchId)) === characterCount,
      'READERS_REPORT_INVALID', '审稿意见草稿的索引无法由它的文字精确建立。',
    );
    host.productionDocuments.record({
      documentId, bookId, typeId, originSourceVersionId: sourceVersionId, parserIdentity: 'ai7.readers-report-draft/1', createdAt: now,
    }, { types: READERS_REPORT_DOCUMENT_TYPES, digest: READERS_REPORT_DOCUMENT_TYPES_DIGEST });
    host.documentWorkflow.recordInstance(documentId, now);
    host.productionDocuments.recordVersion(documentId, draftRevisionId, revisionDigest, 'created');
    host.readersReports.recordDraft({
      documentId, bookId, template, analysisRevisionId: revisionId, taskIntentId: revision.taskIntentId, recordId: found.task.recordId, recordedAt: now,
    });
  })));
  return host.inspectEvaluation(bookId, null);
}
