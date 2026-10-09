import type { DatabaseSync, SQLOutputValue } from 'node:sqlite';
import { WRITING_KIND, type WritingDraftWordsProjection } from '../shared/protocol.js';
import { UUID_PATTERN, canonicalJson, canonicalRecord, isRecord, sha256Hex } from './analysis/canonical.js';
import { graphemeCount } from './analysis/factual-review-contract.js';
import {
  MAX_CHARACTERS,
  MAX_EXEMPLAR_GRAPHEMES,
  MAX_SYNOPSIS_GRAPHEMES,
  MAX_WRITING_EXEMPLARS,
  WRITING_COPY_RULES,
  writingContract,
  writingContractDigest,
  type WritingCopyRules,
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
 * One exemplar version a Task's contract read, by reference only (#688 review): which document and delivered revision, whose
 * Book it is, the facts the plan names it by — the Book's title, the version, whether the contract took its opening — and the
 * digest of the text the contract took. Another Book's text never enters this Book's rows: it is read again from that
 * immutable revision when the Task needs it, and a Task whose exemplar no longer gives that text is not run again.
 */
export interface WritingExemplarSource {
  readonly documentId: string;
  readonly revisionId: string;
  readonly bookId: string;
  readonly bookTitle: string;
  readonly version: number;
  readonly excerpt: boolean;
  readonly sha256: string;
}

/** How a reference's digest is taken: of the exemplar's text alone, as the contract took it (#688 re-review). */
export const WRITING_EXEMPLAR_TEXT_SCHEMA = 'ai7.writing-exemplar/1' as const;

/** The digest a reference pins: of the text the contract took, never of the facts beside it. */
export function writingExemplarDigest(text: string): string {
  return sha256Hex(canonicalJson({ schema: WRITING_EXEMPLAR_TEXT_SCHEMA, text }));
}

/**
 * One exemplar revision's text as a writing contract takes it (S79b; KB-004): its blocks' words — the opening when longer than
 * the contract takes, which `excerpt` says. `null` when the revision holds no words here.
 */
export function readWritingExemplarWords(db: DatabaseSync, revisionId: string): { text: string; excerpt: boolean } | null {
  const whole = (db.prepare('SELECT text FROM manuscript_block_versions WHERE revision_id = ? ORDER BY position').all(revisionId) as SqlRow[])
    .map((block) => String(block.text)).join('\n');
  const words = writingWords(whole, MAX_EXEMPLAR_GRAPHEMES);
  return words.length === 0 ? null : { text: words, excerpt: graphemeLength(whole.trim()) > MAX_EXEMPLAR_GRAPHEMES };
}

/** The words a contract input holds for an exemplar no longer here: never sent, never compared, only named. */
export const WRITING_EXEMPLAR_ABSENT_TEXT = '（这份范例已不在本机）' as const;

/** One writing Task as its row holds it, verified. */
export interface StoredWritingTask {
  readonly taskIntentId: string;
  readonly promptContractSha256: string;
  readonly bookId: string;
  readonly typeId: string;
  readonly evaluationRecordId: string | null;
  readonly baselineRevisionId: string | null;
  readonly exemplarSources: ReadonlyArray<WritingExemplarSource>;
  /**
   * Whether every exemplar still gives the text its reference pinned. When one does not, `input` names it with
   * {@link WRITING_EXEMPLAR_ABSENT_TEXT} for its words, the row's contract digest cannot be computed again, and the Task is
   * read as recorded — its outcome and drafts — but never authorized or run again (#688 re-review).
   */
  readonly exemplarsReadable: boolean;
  readonly input: WritingContractInput;
  /**
   * The copy rules its frozen contract carries (the Commander's ruling on #704 P2-2): `2` for a row that says so, `1` for a row
   * recorded before #698, which names none. Its draft is judged, and its plan worded, under these.
   */
  readonly copyRules: WritingCopyRules;
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
export { WRITING_EXEMPLAR_MOVED } from './writing/writing-contract.js';

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

function isExemplarSource(source: unknown): source is WritingExemplarSource {
  return isRecord(source) &&
    typeof source.documentId === 'string' && UUID_PATTERN.test(source.documentId) &&
    typeof source.revisionId === 'string' && UUID_PATTERN.test(source.revisionId) &&
    typeof source.bookId === 'string' && UUID_PATTERN.test(source.bookId) &&
    typeof source.bookTitle === 'string' && source.bookTitle.length > 0 &&
    typeof source.version === 'number' && Number.isSafeInteger(source.version) && source.version >= 1 &&
    typeof source.excerpt === 'boolean' &&
    typeof source.sha256 === 'string' && /^[0-9a-f]{64}$/u.test(source.sha256);
}

function exemplarSourceOf(source: WritingExemplarSource): WritingExemplarSource {
  return {
    documentId: source.documentId, revisionId: source.revisionId, bookId: source.bookId,
    bookTitle: source.bookTitle, version: source.version, excerpt: source.excerpt, sha256: source.sha256,
  };
}

export class WritingTasks {
  readonly #db: DatabaseSync;
  /**
   * Each exemplar text a reference pinned, read once (#688 re-review): a revision's blocks never change while the store is
   * open — a merge or a replacement is applied at the next open — so the text and its digest are not read again on every poll.
   * `null` when the revision no longer gives the pinned text. Bounded.
   */
  readonly #exemplarWords = new Map<string, string | null>();

  constructor(db: DatabaseSync) {
    this.#db = db;
  }

  #pinnedWords(source: WritingExemplarSource): string | null {
    const key = `${source.revisionId}:${source.sha256}`;
    const known = this.#exemplarWords.get(key);
    if (known !== undefined) return known;
    const words = readWritingExemplarWords(this.#db, source.revisionId);
    const pinned = words !== null && writingExemplarDigest(words.text) === source.sha256 ? words.text : null;
    if (this.#exemplarWords.size >= 64) this.#exemplarWords.clear();
    this.#exemplarWords.set(key, pinned);
    return pinned;
  }

  #task(row: SqlRow): StoredWritingTask {
    const json = text(row.canonical_json);
    requireWriting(sha256Hex(json) === text(row.sha256), 'WRITING_RECORD_INVALID', CORRUPT);
    const stored = JSON.parse(json) as unknown;
    requireWriting(isRecord(stored) && stored.schema === TASK_SCHEMA && stored.taskIntentId === row.task_intent_id &&
      stored.promptContractSha256 === row.prompt_contract_sha256 && stored.bookId === row.book_id && stored.typeId === row.type_id &&
      stored.evaluationRecordId === row.evaluation_record_id && stored.baselineRevisionId === row.baseline_revision_id &&
      stored.recordedAt === row.recorded_at && isRecord(stored.input) && isRecord(stored.input.type) && stored.input.type.typeId === row.type_id &&
      Array.isArray(stored.exemplarSources) && stored.exemplarSources.every(isExemplarSource) &&
      Array.isArray(stored.input.exemplars) && stored.input.exemplars.length === 0 &&
      (stored.copyRules === undefined || stored.copyRules === 2),
    'WRITING_RECORD_INVALID', CORRUPT);
    // A row recorded before #698 names no copy rules: its contract is `/1`, and so is the bound that judges it.
    const copyRules: WritingCopyRules = stored.copyRules === 2 ? 2 : 1;
    const sources = (stored.exemplarSources as WritingExemplarSource[]).map(exemplarSourceOf);
    // The exemplars' text comes back from their own revisions, each the text its reference pinned; the facts beside it are
    // the reference's own.
    const words = sources.map((source) => this.#pinnedWords(source));
    const exemplarsReadable = words.every((entry) => entry !== null);
    const exemplars = sources.map((source, index) => ({
      bookTitle: source.bookTitle, version: source.version, excerpt: source.excerpt, text: words[index] ?? WRITING_EXEMPLAR_ABSENT_TEXT,
    }));
    const input = { ...(stored.input as unknown as WritingContractInput), exemplars };
    // The frozen input is the contract: its digest must be the one the row names — checked whenever the exemplars' text is
    // here to check it with. Without it the row's own digest above still holds it.
    let digest: string;
    try {
      digest = writingContractDigest(writingContract(input, copyRules));
    } catch {
      throw new WritingTaskError('WRITING_RECORD_INVALID', CORRUPT);
    }
    requireWriting(!exemplarsReadable || digest === row.prompt_contract_sha256, 'WRITING_RECORD_INVALID', CORRUPT);
    return {
      taskIntentId: text(row.task_intent_id),
      promptContractSha256: text(row.prompt_contract_sha256),
      bookId: text(row.book_id),
      typeId: text(row.type_id),
      evaluationRecordId: nullableText(row.evaluation_record_id),
      baselineRevisionId: nullableText(row.baseline_revision_id),
      exemplarSources: sources,
      exemplarsReadable,
      input,
      copyRules,
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
      input.exemplarSources.length === input.contract.exemplars.length && input.exemplarSources.every(isExemplarSource) &&
      // One exemplar per Book, as the house scan takes them: 不同图书 in the reference bound is told by count.
      new Set(input.exemplarSources.map((source) => source.bookId)).size === input.exemplarSources.length &&
      input.exemplarSources.every((source, index) => {
        const exemplar = input.contract.exemplars[index]!;
        return source.sha256 === writingExemplarDigest(exemplar.text) && source.bookTitle === exemplar.bookTitle &&
          source.version === exemplar.version && source.excerpt === exemplar.excerpt;
      }),
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
      exemplarSources: input.exemplarSources.map(exemplarSourceOf),
      // Another Book's words are referenced, never stored here: the exemplars travel as references only.
      input: { ...input.contract, exemplars: [] },
      // The copy rules its contract carries (#704 P2-2): every Task recorded now is `/2`.
      copyRules: WRITING_COPY_RULES,
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
