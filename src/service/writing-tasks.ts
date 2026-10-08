import type { DatabaseSync, SQLOutputValue } from 'node:sqlite';
import { WRITING_KIND, type WritingDraftWordsProjection } from '../shared/protocol.js';
import { UUID_PATTERN, canonicalJson, canonicalRecord, isRecord, sha256Hex } from './analysis/canonical.js';
import { graphemeCount } from './analysis/factual-review-contract.js';
import {
  MAX_CHARACTERS,
  MAX_EXEMPLAR_GRAPHEMES,
  MAX_SYNOPSIS_GRAPHEMES,
  MAX_WRITING_EXEMPLARS,
  writingContract,
  writingContractDigest,
  type WritingContractInput,
  type WritingExemplarInput,
} from './writing/writing-contract.js';

/**
 * 写作任务 (Issue #432, plan slice S84a; V2-UX-DELIV-007, KB-004; editor-surfaces §9 新建文档 · 写作任务): a Production Document of
 * a house type drafted by AI7 from the Book and its reference set, and opened as an Editorial Artifact in the document's 起草
 * phase, which the editor edits on the manuscript surface.
 *
 * The drafting is the `writing` analysis kind's (`writing/writing-*.ts`), on the analysis ledger like every kind; its draft is a
 * Production Document of the house type, in the same block store and ledgers as any other. What neither of those knows is the
 * bridge, and schema revision 65 owns it in two relations, ledgers like the others — a row is appended once and never
 * rewritten or removed:
 *
 * - `writing_tasks`: which house type, which words of the editor and which reference set one writing Task drafts from — the
 *   frozen contract input and its digest, with the 定稿 evaluation version, the baseline Result Set Revision and the exemplar
 *   versions it was read from, by identity. A Task the analysis ledger revised in place for a later request may hold two; the
 *   one whose contract its frozen plan names is its own.
 * - `writing_drafts`: which drafted result became which type's document, once per type of a Book.
 */
export const WRITING_TASK_SCHEMA_SQL = {
  writing_tasks: `CREATE TABLE writing_tasks (
  task_intent_id TEXT NOT NULL REFERENCES analysis_task_intents(task_intent_id),
  prompt_contract_sha256 TEXT NOT NULL CHECK(length(prompt_contract_sha256) = 64),
  book_id TEXT NOT NULL REFERENCES books(book_id),
  type_id TEXT NOT NULL CHECK(length(type_id) BETWEEN 1 AND 64),
  evaluation_record_id TEXT REFERENCES evaluation_records(record_id),
  baseline_revision_id TEXT REFERENCES analysis_result_set_revisions(revision_id),
  recorded_at TEXT NOT NULL,
  canonical_json TEXT NOT NULL,
  sha256 TEXT NOT NULL UNIQUE CHECK(length(sha256) = 64),
  PRIMARY KEY(task_intent_id, prompt_contract_sha256)
) STRICT`,
  writing_drafts: `CREATE TABLE writing_drafts (
  document_id TEXT PRIMARY KEY REFERENCES production_documents(document_id),
  book_id TEXT NOT NULL REFERENCES books(book_id),
  type_id TEXT NOT NULL CHECK(length(type_id) BETWEEN 1 AND 64),
  analysis_revision_id TEXT NOT NULL UNIQUE REFERENCES analysis_result_set_revisions(revision_id),
  task_intent_id TEXT NOT NULL REFERENCES analysis_task_intents(task_intent_id),
  recorded_at TEXT NOT NULL,
  canonical_json TEXT NOT NULL,
  sha256 TEXT NOT NULL UNIQUE CHECK(length(sha256) = 64),
  UNIQUE(book_id, type_id)
) STRICT`,
} as const;

export const WRITING_TASK_TRIGGER_SQL: Readonly<Record<string, string>> = Object.fromEntries(
  Object.keys(WRITING_TASK_SCHEMA_SQL).flatMap((table) => [
    [`${table}_no_update`, `CREATE TRIGGER ${table}_no_update
    BEFORE UPDATE ON ${table}
    BEGIN
      SELECT RAISE(ABORT, 'WRITING_TASK_LEDGER_IMMUTABLE');
    END`],
    [`${table}_no_delete`, `CREATE TRIGGER ${table}_no_delete
    BEFORE DELETE ON ${table}
    BEGIN
      SELECT RAISE(ABORT, 'WRITING_TASK_LEDGER_IMMUTABLE');
    END`],
  ]),
);

/** The foreign keys of the two relations, in the exact-schema validator's own spelling. */
export const WRITING_TASK_FOREIGN_KEYS: Readonly<Record<string, ReadonlyArray<string>>> = {
  writing_tasks: [
    'baseline_revision_id>analysis_result_set_revisions.revision_id:NO ACTION/NO ACTION/NONE',
    'book_id>books.book_id:NO ACTION/NO ACTION/NONE',
    'evaluation_record_id>evaluation_records.record_id:NO ACTION/NO ACTION/NONE',
    'task_intent_id>analysis_task_intents.task_intent_id:NO ACTION/NO ACTION/NONE',
  ],
  writing_drafts: [
    'analysis_revision_id>analysis_result_set_revisions.revision_id:NO ACTION/NO ACTION/NONE',
    'book_id>books.book_id:NO ACTION/NO ACTION/NONE',
    'document_id>production_documents.document_id:NO ACTION/NO ACTION/NONE',
    'task_intent_id>analysis_task_intents.task_intent_id:NO ACTION/NO ACTION/NONE',
  ],
};

export class WritingTaskError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'WritingTaskError';
  }
}

function requireWriting(condition: unknown, code: string, message: string): asserts condition {
  if (!condition) throw new WritingTaskError(code, message);
}

type SqlRow = Record<string, SQLOutputValue>;

const TASK_SCHEMA = 'ai7.writing-task/1';
const DRAFT_SCHEMA = 'ai7.writing-draft/1';
/** The parser identity a drafted document's record names: its words are AI7's draft, read from no file. */
export const WRITING_DRAFT_PARSER_IDENTITY = 'ai7.writing-draft/1' as const;
const CORRUPT = '写作任务记录已损坏。';
const TABLE_PRESENT = "SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'writing_tasks'";

/** Revision 65's relations, created once: a store that predates them gains two empty relations and nothing existing moves. */
export function initializeWritingTaskSchema(db: DatabaseSync): void {
  if (db.prepare(TABLE_PRESENT).get() !== undefined) return;
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const sql of Object.values(WRITING_TASK_SCHEMA_SQL)) db.exec(sql);
    for (const sql of Object.values(WRITING_TASK_TRIGGER_SQL)) db.exec(sql);
    db.exec('COMMIT');
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch (rollbackError) {
      throw new AggregateError([error, rollbackError], 'Writing task schema rollback failed.');
    }
    throw error;
  }
}

/**
 * One exemplar version a Task's contract read, by reference only (#688 review): which document, which delivered revision of it,
 * and the digest of the words the contract took from it. Another Book's text never enters this Book's rows: it is read again
 * from that immutable revision whenever the Task is read, and a Task whose exemplar no longer gives the same words is refused.
 */
export interface WritingExemplarSource {
  readonly documentId: string;
  readonly revisionId: string;
  readonly sha256: string;
}

/** The digest a reference pins: of the exemplar's words exactly as the contract takes them. */
export function writingExemplarDigest(exemplar: WritingExemplarInput): string {
  return sha256Hex(canonicalJson({ schema: 'ai7.writing-exemplar/1', bookTitle: exemplar.bookTitle, version: exemplar.version, text: exemplar.text, excerpt: exemplar.excerpt }));
}

/**
 * One exemplar's words as a writing contract takes them (S79b; KB-004), read from its own records: its Book's title, the
 * document version the revision is, and its blocks' words — the opening when longer than the contract takes. `null` when the
 * revision is not a document version here, or holds no words.
 */
export function readWritingExemplar(db: DatabaseSync, documentId: string, revisionId: string): WritingExemplarInput | null {
  const row = db.prepare(
    `SELECT b.title, pv.version FROM production_documents pd
     JOIN production_document_versions pv ON pv.document_id = pd.document_id AND pv.revision_id = ?
     JOIN books b ON b.book_id = pd.book_id
     WHERE pd.document_id = ?`,
  ).get(revisionId, documentId) as SqlRow | undefined;
  if (row === undefined || typeof row.title !== 'string') return null;
  const whole = (db.prepare('SELECT text FROM manuscript_block_versions WHERE revision_id = ? ORDER BY position').all(revisionId) as SqlRow[])
    .map((block) => String(block.text)).join('\n');
  const words = writingWords(whole, MAX_EXEMPLAR_GRAPHEMES);
  if (words.length === 0) return null;
  return { bookTitle: writingWords(row.title, 200), version: Number(row.version), text: words, excerpt: graphemeLength(whole.trim()) > MAX_EXEMPLAR_GRAPHEMES };
}

/** One writing Task as its row holds it, verified. */
export interface StoredWritingTask {
  readonly taskIntentId: string;
  readonly promptContractSha256: string;
  readonly bookId: string;
  readonly typeId: string;
  readonly evaluationRecordId: string | null;
  readonly baselineRevisionId: string | null;
  readonly exemplarSources: ReadonlyArray<WritingExemplarSource>;
  readonly input: WritingContractInput;
  readonly recordedAt: string;
}

/** One draft document as its row holds it, verified. */
export interface StoredWritingDraft {
  readonly documentId: string;
  readonly bookId: string;
  readonly typeId: string;
  readonly analysisRevisionId: string;
  readonly taskIntentId: string;
  readonly recordedAt: string;
}

const text = (value: SQLOutputValue | undefined): string => {
  requireWriting(typeof value === 'string', 'WRITING_RECORD_INVALID', CORRUPT);
  return value;
};

const nullableText = (value: SQLOutputValue | undefined): string | null => {
  if (value === null) return null;
  return text(value);
};

/**
 * The words of one draft as the document begins: the title, then each section — its heading, then its paragraphs. The editor
 * edits them on the manuscript surface from there.
 */
export function writingDraftBlocks(draft: WritingDraftWordsProjection): Array<{ kind: 'title' | 'heading' | 'paragraph'; level: number | null; text: string }> {
  type Block = { kind: 'title' | 'heading' | 'paragraph'; level: number | null; text: string };
  const blocks: Block[] = [{ kind: 'title', level: 1, text: draft.title }];
  for (const section of draft.sections) {
    blocks.push({ kind: 'heading', level: 1, text: section.heading });
    for (const paragraph of section.paragraphs) blocks.push({ kind: 'paragraph', level: null, text: paragraph });
  }
  return blocks.map((block) => ({ ...block, text: block.text.normalize('NFC') }));
}

/** The grapheme length every block of a draft carries, as the block store counts it. */
export function writingBlockLength(value: string): number {
  return graphemeCount(value);
}

// ---- the editor's words around a writing Task (Issue #432, S84a) --------------------------------------------------------

export const MAX_WRITING_SYNOPSIS_GRAPHEMES = MAX_SYNOPSIS_GRAPHEMES;
export const MAX_WRITING_CHARACTERS = MAX_CHARACTERS;
export const MAX_WRITING_EXEMPLARS_REFERENCED = MAX_WRITING_EXEMPLARS;
export const MAX_WRITING_EXEMPLAR_GRAPHEMES = MAX_EXEMPLAR_GRAPHEMES;
/** A field the editor writes is one line: no control or separator character. */
export const WRITING_FIELD_CONTROL = /[\p{Cc}\p{Zl}\p{Zp}]/u;
export const WRITING_NEEDS_MANUSCRIPT = '这本书还没有稿件：写作任务要读稿件，先导入稿件。' as const;
/**
 * 会发送 before any plan exists (editor-surfaces §9: 四行后果), as S84a is (#688 review): a writing Task runs only where nothing
 * is sent — under a live scope it is refused — so nothing leaves the machine. When a sending route arrives, this line names what
 * would be sent, 其他图书的范例原文 among it, since that is other Books' text leaving the machine.
 */
export const WRITING_SEND_CONSEQUENCE = '不发送任何内容：写作任务目前只在不连接模型服务的运行范围内起草。' as const;
/** 不会做 in the editor's words; the plan's technical half is in 查看技术详情. */
export const WRITING_NOT_DO = '不改稿件；不照抄范例；不交付、不发送；草稿由你在稿件编辑面上修改后才用。' as const;
export const WRITING_COST_BEFORE_PLAN = '先看计划后显示' as const;
/** A Task whose exemplar no longer gives the words its reference pinned: the Run is refused rather than read other words. */
export const WRITING_EXEMPLAR_MOVED = '写作任务参照的范例已经变化或不在本机，这一次起草不能再读取或开始。' as const;

export function writingDocumentExists(typeLabel: string): string {
  return `这本书已经有「${typeLabel}」；请在交付物中打开它继续修改。`;
}

export function writingNotForThisBook(typeLabel: string): string {
  return `「${typeLabel}」已标为本书不做；先恢复，再起草。`;
}

const SEGMENTER = new Intl.Segmenter('zh-CN', { granularity: 'grapheme' });
/** Any control or separator character but a line break reads as a space in words a writing contract takes. */
const STRAY_CHARACTER = /[\p{Zl}\p{Zp}]|(?![\n])\p{Cc}/gu;

/** How many graphemes a text holds, as the block store counts them. */
export function graphemeLength(value: string): number {
  let count = 0;
  for (const _segment of SEGMENTER.segment(value)) count += 1;
  return count;
}

/**
 * Words of the Book or of the house as a writing contract takes them: normalized, each stray control or separator character
 * read as a space, trimmed, and — when longer than `most` graphemes — their opening, which the contract then says is one.
 */
export function writingWords(value: string, most: number): string {
  const words = value.normalize('NFC').replace(/\r\n?/gu, '\n').replace(STRAY_CHARACTER, ' ').trim();
  const segments = Array.from(SEGMENTER.segment(words), ({ segment }) => segment);
  return segments.length <= most ? words : segments.slice(0, most).join('').trim();
}

export class WritingTasks {
  readonly #db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.#db = db;
  }

  #task(row: SqlRow): StoredWritingTask {
    const json = text(row.canonical_json);
    requireWriting(sha256Hex(json) === text(row.sha256), 'WRITING_RECORD_INVALID', CORRUPT);
    const stored = JSON.parse(json) as unknown;
    requireWriting(isRecord(stored) && stored.schema === TASK_SCHEMA && stored.taskIntentId === row.task_intent_id &&
      stored.promptContractSha256 === row.prompt_contract_sha256 && stored.bookId === row.book_id && stored.typeId === row.type_id &&
      stored.evaluationRecordId === row.evaluation_record_id && stored.baselineRevisionId === row.baseline_revision_id &&
      stored.recordedAt === row.recorded_at && isRecord(stored.input) && isRecord(stored.input.type) && stored.input.type.typeId === row.type_id &&
      Array.isArray(stored.exemplarSources) && stored.exemplarSources.every((source) => isRecord(source) &&
        typeof source.documentId === 'string' && UUID_PATTERN.test(source.documentId) &&
        typeof source.revisionId === 'string' && UUID_PATTERN.test(source.revisionId) &&
        typeof source.sha256 === 'string' && /^[0-9a-f]{64}$/u.test(source.sha256)) &&
      Array.isArray(stored.input.exemplars) && stored.input.exemplars.length === 0,
    'WRITING_RECORD_INVALID', CORRUPT);
    // The exemplars' words come back from their own revisions, each the words its reference pinned.
    const sources = (stored.exemplarSources as WritingExemplarSource[]).map((source) => ({ documentId: source.documentId, revisionId: source.revisionId, sha256: source.sha256 }));
    const exemplars = sources.map((source) => {
      const exemplar = readWritingExemplar(this.#db, source.documentId, source.revisionId);
      requireWriting(exemplar !== null && writingExemplarDigest(exemplar) === source.sha256, 'WRITING_EXEMPLAR_MOVED', WRITING_EXEMPLAR_MOVED);
      return exemplar;
    });
    const input = { ...(stored.input as unknown as WritingContractInput), exemplars };
    // The frozen input is the contract: its digest must be the one the row names.
    let digest: string;
    try {
      digest = writingContractDigest(writingContract(input));
    } catch {
      throw new WritingTaskError('WRITING_RECORD_INVALID', CORRUPT);
    }
    requireWriting(digest === row.prompt_contract_sha256, 'WRITING_RECORD_INVALID', CORRUPT);
    return {
      taskIntentId: text(row.task_intent_id),
      promptContractSha256: text(row.prompt_contract_sha256),
      bookId: text(row.book_id),
      typeId: text(row.type_id),
      evaluationRecordId: nullableText(row.evaluation_record_id),
      baselineRevisionId: nullableText(row.baseline_revision_id),
      exemplarSources: sources,
      input,
      recordedAt: text(row.recorded_at),
    };
  }

  /**
   * Record which type, words and reference set a Task drafts from, in the caller's transaction — once per Task and contract: a
   * Task the ledger revised in place for this very request holds it already.
   */
  recordTask(input: {
    taskIntentId: string;
    bookId: string;
    evaluationRecordId: string | null;
    baselineRevisionId: string | null;
    exemplarSources: ReadonlyArray<WritingExemplarSource>;
    contract: WritingContractInput;
    promptContractSha256: string;
  }): void {
    requireWriting(UUID_PATTERN.test(input.taskIntentId) && UUID_PATTERN.test(input.bookId) &&
      (input.evaluationRecordId === null || UUID_PATTERN.test(input.evaluationRecordId)) &&
      (input.baselineRevisionId === null || UUID_PATTERN.test(input.baselineRevisionId)) &&
      input.exemplarSources.length === input.contract.exemplars.length &&
      input.exemplarSources.every((source, index) => source.sha256 === writingExemplarDigest(input.contract.exemplars[index]!)),
    'WRITING_INVALID', '写作任务参数无效。');
    const intent = this.#db.prepare('SELECT book_id, kind FROM analysis_task_intents WHERE task_intent_id = ?').get(input.taskIntentId) as SqlRow | undefined;
    requireWriting(intent !== undefined && intent.book_id === input.bookId && intent.kind === WRITING_KIND, 'WRITING_INVALID', '写作任务无效。');
    const existing = this.#db.prepare('SELECT 1 FROM writing_tasks WHERE task_intent_id = ? AND prompt_contract_sha256 = ?')
      .get(input.taskIntentId, input.promptContractSha256);
    if (existing !== undefined) return;
    const recordedAt = new Date().toISOString();
    const record = canonicalRecord({
      schema: TASK_SCHEMA,
      taskIntentId: input.taskIntentId,
      promptContractSha256: input.promptContractSha256,
      bookId: input.bookId,
      typeId: input.contract.type.typeId,
      evaluationRecordId: input.evaluationRecordId,
      baselineRevisionId: input.baselineRevisionId,
      exemplarSources: input.exemplarSources.map((source) => ({ documentId: source.documentId, revisionId: source.revisionId, sha256: source.sha256 })),
      // Another Book's words are referenced, never stored here: the exemplars travel as references only.
      input: { ...input.contract, exemplars: [] },
      recordedAt,
    });
    this.#db.prepare(
      `INSERT INTO writing_tasks(
         task_intent_id, prompt_contract_sha256, book_id, type_id, evaluation_record_id, baseline_revision_id, recorded_at, canonical_json, sha256
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(input.taskIntentId, input.promptContractSha256, input.bookId, input.contract.type.typeId, input.evaluationRecordId,
      input.baselineRevisionId, recordedAt, record.json, record.digest);
  }

  /**
   * One Task's type, words and reference set: the row whose contract the Task's frozen plan names when `planContract` is given,
   * else the one recorded last — the request its preparation was last made for. `null` for a Task with none.
   */
  task(taskIntentId: string, planContract: string | null = null): StoredWritingTask | null {
    const rows = this.#db.prepare('SELECT * FROM writing_tasks WHERE task_intent_id = ? ORDER BY recorded_at, rowid')
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
    requireWriting(sha256Hex(json) === text(row.sha256), 'WRITING_RECORD_INVALID', CORRUPT);
    const envelope = JSON.parse(json) as unknown;
    requireWriting(isRecord(envelope) && typeof envelope.promptContractDigest === 'string', 'WRITING_RECORD_INVALID', CORRUPT);
    return envelope.promptContractDigest;
  }

  /** The Book's latest writing Task by its intent, as the analysis ledger orders them; `null` before the first. */
  latestTaskIntentId(bookId: string): string | null {
    const row = this.#db.prepare(
      'SELECT task_intent_id FROM analysis_task_intents WHERE book_id = ? AND kind = ? ORDER BY created_at DESC, rowid DESC LIMIT 1',
    ).get(bookId, WRITING_KIND) as SqlRow | undefined;
    return row === undefined ? null : text(row.task_intent_id);
  }

  /**
   * Any recorded writing Task of any Book that still verifies, the latest first: what a reconciliation of the kind's Runs builds
   * its ledger from. A damaged row is passed over — the reconciliation needs the kind, not that row.
   */
  anyTask(): StoredWritingTask | null {
    for (const row of this.#db.prepare('SELECT * FROM writing_tasks ORDER BY recorded_at DESC, rowid DESC').iterate() as IterableIterator<SqlRow>) {
      try {
        return this.#task(row);
      } catch (error) {
        if (!(error instanceof WritingTaskError)) throw error;
      }
    }
    return null;
  }

  /** The Book's writing Result Set Revisions newest first, each with the Task that made it. */
  revisions(bookId: string): Array<{ revisionId: string; ordinal: number; createdAt: string; taskIntentId: string }> {
    return (this.#db.prepare(
      `SELECT r.revision_id, r.ordinal, r.created_at, r.task_intent_id FROM analysis_result_set_revisions r
       JOIN analysis_result_sets s ON s.result_set_id = r.result_set_id
       WHERE s.book_id = ? AND s.kind = ? ORDER BY r.ordinal DESC`,
    ).all(bookId, WRITING_KIND) as SqlRow[]).map((row) => ({
      revisionId: text(row.revision_id),
      ordinal: Number(row.ordinal),
      createdAt: text(row.created_at),
      taskIntentId: text(row.task_intent_id),
    }));
  }

  #draft(row: SqlRow): StoredWritingDraft {
    const json = text(row.canonical_json);
    requireWriting(sha256Hex(json) === text(row.sha256), 'WRITING_RECORD_INVALID', CORRUPT);
    const stored = JSON.parse(json) as unknown;
    requireWriting(isRecord(stored) && stored.schema === DRAFT_SCHEMA && stored.documentId === row.document_id && stored.bookId === row.book_id &&
      stored.typeId === row.type_id && stored.analysisRevisionId === row.analysis_revision_id && stored.taskIntentId === row.task_intent_id &&
      stored.recordedAt === row.recorded_at,
    'WRITING_RECORD_INVALID', CORRUPT);
    return {
      documentId: text(row.document_id),
      bookId: text(row.book_id),
      typeId: text(row.type_id),
      analysisRevisionId: text(row.analysis_revision_id),
      taskIntentId: text(row.task_intent_id),
      recordedAt: text(row.recorded_at),
    };
  }

  /** The Book's drafted documents, one per type at most. */
  drafts(bookId: string): StoredWritingDraft[] {
    return (this.#db.prepare('SELECT * FROM writing_drafts WHERE book_id = ? ORDER BY recorded_at, rowid').all(bookId) as SqlRow[])
      .map((row) => this.#draft(row));
  }

  /** Whether a document's words began as a writing draft: its export is written fresh from them, never from a file. */
  isDraft(documentId: string): boolean {
    return this.#db.prepare('SELECT 1 FROM writing_drafts WHERE document_id = ?').get(documentId) !== undefined;
  }

  /** Which drafted result became this type's document, in the transaction that made the document. */
  recordDraft(input: StoredWritingDraft): void {
    const record = canonicalRecord({ schema: DRAFT_SCHEMA, ...input });
    this.#db.prepare(
      `INSERT INTO writing_drafts(
         document_id, book_id, type_id, analysis_revision_id, task_intent_id, recorded_at, canonical_json, sha256
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(input.documentId, input.bookId, input.typeId, input.analysisRevisionId, input.taskIntentId, input.recordedAt, record.json, record.digest);
  }

  /** The revision digest of a draft's first revision: what it was made from, and the words it was made with. */
  static draftRevisionDigest(documentId: string, analysisRevisionId: string, blocks: ReadonlyArray<{ kind: string; level: number | null; text: string }>): string {
    return sha256Hex(canonicalJson({ schema: 'ai7.writing-draft-revision/1', documentId, analysisRevisionId, blocks }));
  }
}
