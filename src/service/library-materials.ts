import { createHash, randomUUID } from 'node:crypto';
import { constants, createReadStream } from 'node:fs';
import { copyFile, open, opendir, rename, rm, stat } from 'node:fs/promises';
import { basename, extname, posix, resolve } from 'node:path';
import type { DatabaseSync, SQLOutputValue } from 'node:sqlite';
import {
  LIBRARY_MATERIAL_KINDS,
  MAX_LEARNING_ELIGIBILITY_REASON_GRAPHEMES,
  MAX_LIBRARY_MATERIAL_BYTES,
  MAX_LIBRARY_MATERIAL_DECISIONS_SHOWN,
  MAX_LIBRARY_MATERIAL_TITLE_GRAPHEMES,
  MAX_LIBRARY_MATERIALS_PAGE,
  type LearningEligibilityChoice,
  type LibraryMaterialCursor,
  type LibraryMaterialDecisionInput,
  type LibraryMaterialDecisionProjection,
  type LibraryMaterialFormat,
  type LibraryMaterialKind,
  type LibraryMaterialPreviewProjection,
  type LibraryMaterialProjection,
  type LibraryMaterialsProjection,
  type LibraryMaterialSourceProjection,
} from '../shared/protocol.js';
import { ensureCanonicalDataDirectory, inspectCanonicalDataFile } from '../shared/data-root.js';
import { UUID_PATTERN, canonicalRecord, isRecord, sha256Hex } from './analysis/canonical.js';
import { graphemeCount } from './analysis/factual-review-contract.js';
import { MANUSCRIPT_FORMAT_HEAD_BYTES, identifyManuscriptFormat } from './manuscript-format.js';

/**
 * 知识库 › 资料库 (Issue #427, plan slice S79c; V2-UX-KB-007, KB-002, ATTN-009, LEARN-004 to LEARN-010): the books, papers,
 * documents and web captures an editor collected. A chosen file arrives whole into the Agent Data Root, never read beyond the
 * window that identifies its format; the editor then decides where it belongs — one Book or the house — and its Learning
 * Eligibility. Nothing is inferred: both start undecided, a Task can list the item under 允许参考 only once both are decided,
 * and an item still waiting for either is an attention item in 等待你的决定. The five-layer index is built later (S80).
 *
 * Schema revision 46 owns two relations, ledgers like the others: each item's arrival record, and its decisions — one chain
 * per item, each decision chained by digest to the one before and the first to the arrival record, appended once and never
 * rewritten, so a later decision supersedes an earlier one and both stay on record (LEARN-007).
 */

export const LIBRARY_MATERIAL_SCHEMA_SQL = {
  library_materials: `CREATE TABLE library_materials (
  material_id TEXT PRIMARY KEY,
  object_sha256 TEXT NOT NULL UNIQUE CHECK(length(object_sha256) = 64),
  recorded_at TEXT NOT NULL,
  canonical_json TEXT NOT NULL,
  sha256 TEXT NOT NULL UNIQUE CHECK(length(sha256) = 64)
) STRICT`,
  library_material_decisions: `CREATE TABLE library_material_decisions (
  decision_id TEXT PRIMARY KEY,
  material_id TEXT NOT NULL REFERENCES library_materials(material_id),
  ordinal INTEGER NOT NULL CHECK(ordinal >= 1),
  kind TEXT NOT NULL CHECK(kind IN ('attribution', 'eligibility')),
  book_id TEXT REFERENCES books(book_id),
  previous_sha256 TEXT NOT NULL CHECK(length(previous_sha256) = 64),
  recorded_at TEXT NOT NULL,
  canonical_json TEXT NOT NULL,
  sha256 TEXT NOT NULL UNIQUE CHECK(length(sha256) = 64),
  UNIQUE(material_id, ordinal)
) STRICT`,
} as const;

export const LIBRARY_MATERIAL_TRIGGER_SQL: Readonly<Record<string, string>> = Object.fromEntries(
  Object.keys(LIBRARY_MATERIAL_SCHEMA_SQL).flatMap((table) => [
    [`${table}_no_update`, `CREATE TRIGGER ${table}_no_update
    BEFORE UPDATE ON ${table}
    BEGIN
      SELECT RAISE(ABORT, 'LIBRARY_MATERIAL_LEDGER_IMMUTABLE');
    END`],
    [`${table}_no_delete`, `CREATE TRIGGER ${table}_no_delete
    BEFORE DELETE ON ${table}
    BEGIN
      SELECT RAISE(ABORT, 'LIBRARY_MATERIAL_LEDGER_IMMUTABLE');
    END`],
  ]),
);

export const LIBRARY_MATERIAL_FOREIGN_KEYS: Readonly<Record<string, ReadonlyArray<string>>> = {
  library_materials: [],
  library_material_decisions: [
    'book_id>books.book_id:NO ACTION/NO ACTION/NONE',
    'material_id>library_materials.material_id:NO ACTION/NO ACTION/NONE',
  ],
};

export class LibraryMaterialError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'LibraryMaterialError';
  }
}

function requireLibrary(condition: unknown, code: string, message: string): asserts condition {
  if (!condition) throw new LibraryMaterialError(code, message);
}

type SqlRow = Record<string, SQLOutputValue>;

const RECORD_SCHEMA = 'ai7.library-material/1';
const DECISION_SCHEMA = 'ai7.library-material-decision/1';
/** Who decides, as the other editor records of this device name it. */
export const LIBRARY_ACTOR = '本机编辑' as const;
/** The governing basis of every Learning Eligibility decision here: the editor's own, never a policy's inference. */
export const LEARNING_ELIGIBILITY_BASIS = '编辑决定' as const;
/** Where the kept originals live inside the Agent Data Root, by content. */
export const LIBRARY_OBJECT_DIRECTORY = 'library-objects';
const TABLE_PRESENT = "SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'library_materials'";
/** Previews wait in memory for 放入资料库; a service that restarts forgets them, and the editor chooses again. */
const MAX_PREVIEWS = 16;
const CONTROL_CHARACTER = /[\p{Cc}\p{Zl}\p{Zp}]/u;
const REASON_CONTROL_CHARACTER = /[\p{Zl}\p{Zp}]|(?![\n])\p{Cc}/u;
const DIGEST_PATTERN = /^[0-9a-f]{64}$/;

const OBJECT_EXTENSIONS: Readonly<Record<LibraryMaterialFormat, string>> = {
  DOCX: '.docx',
  DOC: '.doc',
  PDF: '.pdf',
  ODT: '.odt',
  RTF: '.rtf',
  TXT: '.txt',
  MD: '.md',
  HTML: '.html',
  EPUB: '.epub',
  UNKNOWN: '.bin',
};
const ZIP_LOCAL_HEADER = Uint8Array.of(0x50, 0x4b, 0x03, 0x04);
/** Where a ZIP local file header's name length and name sit, from the header's start. */
const ZIP_NAME_LENGTH_OFFSET = 26;
const ZIP_NAME_OFFSET = 30;
const EPUB_MIMETYPE = new TextEncoder().encode('mimetypeapplication/epub+zip');
const WORD_PART = new TextEncoder().encode('word/');
/**
 * A web page saved as HTML: leading whitespace and comments, then `<html` or `<!doctype html`. A comment ends at its first
 * `-->`, never past it, so a file of many comments is read in one pass (Issue #427 review; ADR 0072's hostile input).
 */
const HTML_START = /^(?:\s|<!--(?:(?!-->)[\s\S])*-->)*<(?:!doctype\s+html|html)[\s>]/iu;
/** What 放入资料库 leaves beside the kept originals: a copy written aside, and an original under its digest. */
const PARTIAL_NAME = /^\.partial-[0-9a-f-]{36}$/u;
const OBJECT_NAME = /^([0-9a-f]{64})\.[a-z]+$/u;
const PREFIX_NAME = /^[0-9a-f]{2}$/u;

/** Revision 46's relations, created once: a store that predates them gains two empty relations and nothing existing moves. */
export function initializeLibraryMaterialSchema(db: DatabaseSync): void {
  if (db.prepare(TABLE_PRESENT).get() !== undefined) return;
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const sql of Object.values(LIBRARY_MATERIAL_SCHEMA_SQL)) db.exec(sql);
    for (const sql of Object.values(LIBRARY_MATERIAL_TRIGGER_SQL)) db.exec(sql);
    db.exec('COMMIT');
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch (rollbackError) {
      throw new AggregateError([error, rollbackError], 'Library material schema rollback failed.');
    }
    throw error;
  }
}

function startsWith(head: Uint8Array, expected: Uint8Array, offset = 0): boolean {
  if (head.length < offset + expected.length) return false;
  for (let index = 0; index < expected.length; index += 1) if (head[offset + index] !== expected[index]) return false;
  return true;
}

/**
 * Whether the window holds a ZIP entry named under `word/`: a local file header whose own name starts with it (Issue #427
 * review). A `foreword/` entry, or stored text that mentions `/word/`, is no Word part.
 */
function hasWordEntry(head: Uint8Array): boolean {
  for (let at = 0; at + ZIP_NAME_OFFSET <= head.length; at += 1) {
    if (!startsWith(head, ZIP_LOCAL_HEADER, at)) continue;
    const nameLength = head[at + ZIP_NAME_LENGTH_OFFSET]! | (head[at + ZIP_NAME_LENGTH_OFFSET + 1]! << 8);
    if (nameLength >= WORD_PART.length && startsWith(head, WORD_PART, at + ZIP_NAME_OFFSET)) return true;
  }
  return false;
}

/**
 * What a material's content is, from at most its first window — the manuscript intake's identification, and the two a
 * collected item adds: an EPUB, whose archive opens with its stored media type, and a web page saved as HTML. A ZIP that
 * is neither an OpenDocument, an EPUB nor carries a Word part is not called a Word file: nothing parses it to decide.
 */
export function identifyLibraryMaterialFormat(head: Uint8Array, displayName: string): LibraryMaterialFormat {
  if (startsWith(head, ZIP_LOCAL_HEADER)) {
    if (startsWith(head, EPUB_MIMETYPE, 30)) return 'EPUB';
    const format = identifyManuscriptFormat(head, displayName);
    return format === 'ODT' ? 'ODT' : hasWordEntry(head) ? 'DOCX' : 'UNKNOWN';
  }
  const format = identifyManuscriptFormat(head, displayName);
  if (format === 'TXT' || format === 'MD') {
    const text = new TextDecoder('utf-8').decode(head.subarray(0, Math.min(head.length, 4096))).replace(/^﻿/u, '');
    if (HTML_START.test(text)) return 'HTML';
  }
  return format;
}

/** The title a file suggests: its name without the extension, as the editor would read it on the shelf. */
function suggestedTitle(displayName: string): string {
  const stem = displayName.slice(0, displayName.length - extname(displayName).length).trim();
  const title = (stem.length > 0 ? stem : displayName).replace(/[\p{Cc}\p{Zl}\p{Zp}]/gu, ' ').replace(/\s+/gu, ' ').trim();
  const graphemes = Array.from(new Intl.Segmenter('zh', { granularity: 'grapheme' }).segment(title), (entry) => entry.segment);
  return graphemes.slice(0, MAX_LIBRARY_MATERIAL_TITLE_GRAPHEMES).join('');
}

function suggestedKind(format: LibraryMaterialFormat): LibraryMaterialKind | null {
  return format === 'HTML' ? 'web' : format === 'EPUB' ? 'book' : null;
}

async function digestFile(path: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
  return hash.digest('hex');
}

/** The title the editor gave it: one line of at most MAX_LIBRARY_MATERIAL_TITLE_GRAPHEMES. */
export function libraryMaterialTitle(value: string): string {
  const title = value.trim();
  requireLibrary(title.length > 0, 'LIBRARY_MATERIAL_TITLE_EMPTY', '请写下这份资料的标题。');
  requireLibrary(graphemeCount(title) <= MAX_LIBRARY_MATERIAL_TITLE_GRAPHEMES, 'LIBRARY_MATERIAL_TITLE_TOO_LONG',
    `标题要在 ${MAX_LIBRARY_MATERIAL_TITLE_GRAPHEMES} 字以内。`);
  requireLibrary(!CONTROL_CHARACTER.test(title), 'LIBRARY_MATERIAL_TITLE_INVALID', '标题只能是一行文字。');
  return title;
}

/** The optional 补充说明 of a Learning Eligibility decision (LEARN-006): `null`, or a note of at most the bound. */
export function learningEligibilityReason(value: string | null): string | null {
  if (value === null) return null;
  const reason = value.replace(/\r\n?/gu, '\n').trim();
  if (reason.length === 0) return null;
  requireLibrary(graphemeCount(reason) <= MAX_LEARNING_ELIGIBILITY_REASON_GRAPHEMES, 'LEARNING_ELIGIBILITY_REASON_TOO_LONG',
    `补充说明要在 ${MAX_LEARNING_ELIGIBILITY_REASON_GRAPHEMES} 字以内。`);
  requireLibrary(!REASON_CONTROL_CHARACTER.test(reason), 'LEARNING_ELIGIBILITY_REASON_INVALID', '补充说明含有不能显示的控制字符。');
  return reason;
}

interface Preview {
  readonly previewId: string;
  readonly path: string;
  readonly source: LibraryMaterialSourceProjection;
}

interface StoredMaterial {
  readonly materialId: string;
  readonly title: string;
  readonly kind: LibraryMaterialKind;
  readonly source: LibraryMaterialSourceProjection;
  readonly objectKey: string;
  readonly recordedAt: string;
  readonly sha256: string;
}

type StoredDecision =
  | { readonly ordinal: number; readonly recordedAt: string; readonly sha256: string; readonly kind: 'attribution'; readonly scope: 'book'; readonly bookId: string }
  | { readonly ordinal: number; readonly recordedAt: string; readonly sha256: string; readonly kind: 'attribution'; readonly scope: 'house' }
  | {
    readonly ordinal: number;
    readonly recordedAt: string;
    readonly sha256: string;
    readonly kind: 'eligibility';
    readonly choice: LearningEligibilityChoice;
    readonly bookId: string | null;
    readonly reason: string | null;
    readonly attributionOrdinal: number;
  };

/** Where an item stands now, from its chain: the attribution in force and the eligibility decided under it. */
interface Standing {
  readonly attribution: Extract<StoredDecision, { kind: 'attribution' }> | null;
  readonly eligibility: Extract<StoredDecision, { kind: 'eligibility' }> | null;
  readonly eligibilityReset: boolean;
}

/** One 资料库 item that waits for the editor's decision (ATTN-009), as 待我处理 reads it. */
export interface LibraryMaterialAttentionReading {
  readonly materialId: string;
  readonly title: string;
  readonly kind: LibraryMaterialKind;
  readonly state: 'library-attribution-pending' | 'learning-eligibility-pending' | 'learning-eligibility-deferred';
  /** When the wait began: the arrival, the attribution the eligibility waits under, or the deferral. */
  readonly at: string;
  readonly scope: 'none' | 'book' | 'house';
  readonly book: { readonly bookId: string; readonly title: string } | null;
  readonly objectSha256: string;
}

const ELIGIBILITY_CHOICES: ReadonlySet<LearningEligibilityChoice> = new Set(['book', 'house', 'excluded', 'deferred']);

function integer(value: SQLOutputValue | undefined): number {
  return typeof value === 'bigint' ? Number(value) : Number(value);
}

/**
 * Where an item stands: the latest attribution, and the latest eligibility decided under it. A new attribution sets the
 * eligibility decided before it aside — the editor decides it again for where the item now belongs, and nothing carries over.
 */
function standing(decisions: Iterable<StoredDecision>): Standing & { count: number; last: StoredDecision | null; recent: StoredDecision[] } {
  let attribution: Standing['attribution'] = null;
  let eligibility: Standing['eligibility'] = null;
  let hadEligibility = false;
  let count = 0;
  let last: StoredDecision | null = null;
  const recent: StoredDecision[] = [];
  for (const decision of decisions) {
    count += 1;
    last = decision;
    recent.push(decision);
    if (recent.length > MAX_LIBRARY_MATERIAL_DECISIONS_SHOWN) recent.shift();
    if (decision.kind === 'eligibility') hadEligibility = true;
    if (decision.kind === 'attribution') {
      attribution = decision;
      eligibility = null;
    } else if (attribution !== null && decision.attributionOrdinal === attribution.ordinal) {
      eligibility = decision;
    }
  }
  const eligibilityReset = attribution !== null && eligibility === null && hadEligibility;
  return { attribution, eligibility, eligibilityReset, count, last, recent };
}

export class LibraryMaterialLedger {
  readonly #db: DatabaseSync;
  readonly #dataRoot: string;
  readonly #previews = new Map<string, Preview>();

  constructor(db: DatabaseSync, dataRoot: string) {
    this.#db = db;
    this.#dataRoot = dataRoot;
  }

  /** Every item, oldest first, each verified: its digest and its record's agreement with its row. */
  *#materials(): IterableIterator<StoredMaterial> {
    const rows = this.#db.prepare('SELECT * FROM library_materials ORDER BY recorded_at, material_id').iterate() as IterableIterator<SqlRow>;
    for (const row of rows) yield this.#material(row);
  }

  #material(row: SqlRow): StoredMaterial {
    const json = String(row.canonical_json);
    requireLibrary(sha256Hex(json) === String(row.sha256), 'LIBRARY_MATERIAL_RECORD_INVALID', '资料库的记录已损坏。');
    const record = JSON.parse(json) as unknown;
    requireLibrary(isRecord(record) && record.schema === RECORD_SCHEMA && record.materialId === row.material_id &&
      record.recordedAt === row.recorded_at && isRecord(record.source) && record.source.sha256 === row.object_sha256 &&
      typeof record.title === 'string' && LIBRARY_MATERIAL_KINDS.includes(record.kind as LibraryMaterialKind) && typeof record.objectKey === 'string',
    'LIBRARY_MATERIAL_RECORD_INVALID', '资料库的记录已损坏。');
    return {
      materialId: String(row.material_id),
      title: record.title,
      kind: record.kind as LibraryMaterialKind,
      source: record.source as unknown as LibraryMaterialSourceProjection,
      objectKey: record.objectKey,
      recordedAt: String(row.recorded_at),
      sha256: String(row.sha256),
    };
  }

  /** One item's decisions, oldest first, each verified against its row and chained to the one before. */
  *#decisions(material: StoredMaterial): IterableIterator<StoredDecision> {
    const rows = this.#db.prepare('SELECT * FROM library_material_decisions WHERE material_id = ? ORDER BY ordinal').iterate(material.materialId) as IterableIterator<SqlRow>;
    let previous = material.sha256;
    let attributionOrdinal: number | null = null;
    let index = 0;
    for (const row of rows) {
      const json = String(row.canonical_json);
      requireLibrary(sha256Hex(json) === String(row.sha256), 'LIBRARY_MATERIAL_DECISION_INVALID', '资料库的决定记录已损坏。');
      const record = JSON.parse(json) as unknown;
      const ordinal = ++index;
      requireLibrary(isRecord(record) && record.schema === DECISION_SCHEMA && record.decisionId === row.decision_id &&
        record.materialId === material.materialId && record.materialSha256 === material.sha256 && record.ordinal === ordinal &&
        integer(row.ordinal) === ordinal && record.kind === row.kind && record.previousSha256 === previous &&
        String(row.previous_sha256) === previous && record.recordedAt === row.recorded_at && record.actor === LIBRARY_ACTOR &&
        (record.bookId ?? null) === (row.book_id ?? null),
      'LIBRARY_MATERIAL_DECISION_INVALID', '资料库的决定记录已损坏。');
      previous = String(row.sha256);
      const base = { ordinal, recordedAt: String(row.recorded_at), sha256: String(row.sha256) };
      if (record.kind === 'attribution') {
        attributionOrdinal = ordinal;
        requireLibrary((record.scope === 'book' && typeof record.bookId === 'string') || (record.scope === 'house' && record.bookId === undefined),
          'LIBRARY_MATERIAL_DECISION_INVALID', '资料库的决定记录已损坏。');
        yield record.scope === 'book'
          ? { ...base, kind: 'attribution' as const, scope: 'book' as const, bookId: String(record.bookId) }
          : { ...base, kind: 'attribution' as const, scope: 'house' as const };
        continue;
      }
      requireLibrary(record.kind === 'eligibility' && ELIGIBILITY_CHOICES.has(record.choice as LearningEligibilityChoice) &&
        record.basis === LEARNING_ELIGIBILITY_BASIS && record.attributionOrdinal === attributionOrdinal &&
        (record.choice === 'book') === (typeof record.bookId === 'string') && (record.reason === null || typeof record.reason === 'string'),
      'LIBRARY_MATERIAL_DECISION_INVALID', '资料库的决定记录已损坏。');
      yield {
        ...base,
        kind: 'eligibility' as const,
        choice: record.choice as LearningEligibilityChoice,
        bookId: typeof record.bookId === 'string' ? record.bookId : null,
        reason: record.reason as string | null,
        attributionOrdinal: attributionOrdinal!,
      };
    }
  }

  #bookTitle(bookId: string): string {
    const row = this.#db.prepare('SELECT title FROM books WHERE book_id = ?').get(bookId) as SqlRow | undefined;
    requireLibrary(row !== undefined, 'LIBRARY_MATERIAL_BOOK_NOT_FOUND', '所选图书不存在。');
    return String(row.title);
  }

  /**
   * 放入资料…'s first step: the chosen file identified, measured and digested as it would arrive, and held until the editor
   * names it. Nothing is kept: the file is copied only by 放入资料库.
   */
  async preview(path: string): Promise<LibraryMaterialPreviewProjection> {
    let size: number;
    let head: Uint8Array;
    let sha256: string;
    try {
      const metadata = await stat(path);
      requireLibrary(metadata.isFile(), 'LIBRARY_MATERIAL_FILE_INVALID', '所选的不是文件。');
      size = metadata.size;
      requireLibrary(size > 0, 'LIBRARY_MATERIAL_FILE_EMPTY', '所选文件是空的。');
      requireLibrary(size <= MAX_LIBRARY_MATERIAL_BYTES, 'LIBRARY_MATERIAL_FILE_SIZE',
        `资料库一次放入的文件要在 ${MAX_LIBRARY_MATERIAL_BYTES / 1024 / 1024 / 1024} GB 以内。`);
      const handle = await open(path, 'r');
      try {
        const buffer = new Uint8Array(Math.min(size, MANUSCRIPT_FORMAT_HEAD_BYTES));
        const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
        head = buffer.subarray(0, bytesRead);
      } finally {
        await handle.close();
      }
      sha256 = await digestFile(path);
    } catch (error) {
      if (error instanceof LibraryMaterialError) throw error;
      throw new LibraryMaterialError('LIBRARY_MATERIAL_FILE_UNREADABLE', '无法读取所选文件。');
    }
    const existing = this.#db.prepare('SELECT material_id FROM library_materials WHERE object_sha256 = ?').get(sha256) as SqlRow | undefined;
    if (existing !== undefined) {
      const known = this.#material(this.#db.prepare('SELECT * FROM library_materials WHERE material_id = ?').get(String(existing.material_id)) as SqlRow);
      throw new LibraryMaterialError('LIBRARY_MATERIAL_DUPLICATE', `资料库里已经有这份文件：「${known.title}」。`);
    }
    const displayName = basename(path);
    const source: LibraryMaterialSourceProjection = { displayName, format: identifyLibraryMaterialFormat(head, displayName), bytes: size, sha256 };
    const preview: Preview = { previewId: randomUUID(), path, source };
    this.#previews.set(preview.previewId, preview);
    while (this.#previews.size > MAX_PREVIEWS) this.#previews.delete(this.#previews.keys().next().value!);
    return { previewId: preview.previewId, source, suggestedTitle: suggestedTitle(displayName), suggestedKind: suggestedKind(source.format) };
  }

  /**
   * 放入资料库's first half, outside any transaction: the previewed file copied whole into the Agent Data Root by its digest,
   * written aside, synced and verified before it takes its name — and refused when the file is no longer what the editor saw.
   * An original already kept under the same digest is kept once.
   */
  async keep(previewId: string): Promise<{ preview: Preview; objectKey: string }> {
    requireLibrary(UUID_PATTERN.test(previewId), 'LIBRARY_MATERIAL_PREVIEW_INVALID', '放入预览标识无效。');
    const preview = this.#previews.get(previewId);
    requireLibrary(preview !== undefined, 'LIBRARY_MATERIAL_PREVIEW_EXPIRED', '这次放入的预览已经失效；请重新选择文件。');
    const digest = preview.source.sha256;
    requireLibrary(DIGEST_PATTERN.test(digest), 'LIBRARY_MATERIAL_PREVIEW_INVALID', '放入预览标识无效。');
    const fileName = `${digest}${OBJECT_EXTENSIONS[preview.source.format]}`;
    const objectKey = posix.join('sha256', digest.slice(0, 2), fileName);
    const directory = await ensureCanonicalDataDirectory(this.#dataRoot, LIBRARY_OBJECT_DIRECTORY, 'sha256', digest.slice(0, 2));
    const target = await inspectCanonicalDataFile(this.#dataRoot, directory, fileName);
    if (target.exists && (await digestFile(target.path)) === digest) return { preview, objectKey };
    const partialName = `.partial-${randomUUID()}`;
    const partial = resolve(directory, partialName);
    try {
      try {
        await copyFile(preview.path, partial, constants.COPYFILE_EXCL);
      } catch {
        throw new LibraryMaterialError('LIBRARY_MATERIAL_FILE_UNREADABLE', '无法读取所选文件；请重新选择。');
      }
      const handle = await open(partial, 'r+');
      try {
        await handle.sync();
      } finally {
        await handle.close();
      }
      requireLibrary((await digestFile(partial)) === digest, 'LIBRARY_MATERIAL_CHANGED', '所选文件在预览之后变了；请重新选择。');
      await rename(partial, target.path);
    } catch (error) {
      await rm(partial, { force: true });
      throw error;
    }
    // The partial was verified before it took its name, and a rename moves those exact bytes: it is not read a fourth time.
    const kept = await inspectCanonicalDataFile(this.#dataRoot, directory, fileName);
    requireLibrary(kept.exists, 'LIBRARY_MATERIAL_CHANGED', '所选文件在预览之后变了；请重新选择。');
    return { preview, objectKey };
  }

  /**
   * At open (Issue #427 review): what an interrupted 放入资料库 left in the Agent Data Root — a copy written aside, or an
   * original kept under its digest whose arrival was never recorded — is removed, so a stopped service leaves no file behind.
   */
  async sweep(): Promise<void> {
    if (this.#db.prepare(TABLE_PRESENT).get() === undefined) return;
    const recorded = this.#db.prepare('SELECT 1 FROM library_materials WHERE object_sha256 = ?');
    let prefixes: Awaited<ReturnType<typeof opendir>>;
    try {
      prefixes = await opendir(resolve(this.#dataRoot, LIBRARY_OBJECT_DIRECTORY, 'sha256'));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw error;
    }
    for await (const prefix of prefixes) {
      if (!prefix.isDirectory() || !PREFIX_NAME.test(prefix.name)) continue;
      const directory = await ensureCanonicalDataDirectory(this.#dataRoot, LIBRARY_OBJECT_DIRECTORY, 'sha256', prefix.name);
      for await (const entry of await opendir(directory)) {
        if (!entry.isFile()) continue;
        const object = OBJECT_NAME.exec(entry.name);
        if (PARTIAL_NAME.test(entry.name) || (object !== null && recorded.get(object[1]!) === undefined)) {
          await rm((await inspectCanonicalDataFile(this.#dataRoot, directory, entry.name)).path, { force: true });
        }
      }
    }
  }

  /**
   * 放入资料库's second half, inside the caller's transaction: the arrival record, with the title and kind the editor gave it.
   * No attribution and no eligibility come with it — both are the editor's to decide next.
   */
  record(kept: { preview: Preview; objectKey: string }, title: string, kind: LibraryMaterialKind): string {
    requireLibrary(LIBRARY_MATERIAL_KINDS.includes(kind), 'LIBRARY_MATERIAL_KIND_INVALID', '请选择这份资料是图书、论文、资料还是网页。');
    const named = libraryMaterialTitle(title);
    requireLibrary(this.#previews.get(kept.preview.previewId) === kept.preview, 'LIBRARY_MATERIAL_PREVIEW_EXPIRED', '这次放入的预览已经失效；请重新选择文件。');
    requireLibrary(this.#db.prepare('SELECT 1 FROM library_materials WHERE object_sha256 = ?').get(kept.preview.source.sha256) === undefined,
      'LIBRARY_MATERIAL_DUPLICATE', '资料库里已经有这份文件。');
    const materialId = randomUUID();
    const recordedAt = new Date().toISOString();
    const record = canonicalRecord({
      schema: RECORD_SCHEMA,
      materialId,
      title: named,
      kind,
      source: kept.preview.source,
      objectKey: kept.objectKey,
      actor: LIBRARY_ACTOR,
      recordedAt,
    });
    this.#db.prepare('INSERT INTO library_materials(material_id, object_sha256, recorded_at, canonical_json, sha256) VALUES (?, ?, ?, ?, ?)')
      .run(materialId, kept.preview.source.sha256, recordedAt, record.json, record.digest);
    this.#previews.delete(kept.preview.previewId);
    return materialId;
  }

  /**
   * 定归属 or 定学习准入 (KB-007, LEARN-004 to LEARN-007), inside the caller's transaction: one decision appended to the
   * item's chain, bound to the item's exact record, the actor, the time and — for eligibility — the attribution it was made
   * under and the editor's optional note. Refused when the chain moved since the editor read it, when the decision would
   * change nothing, or when eligibility is asked before any attribution or for a Book the item does not belong to.
   */
  decide(materialId: string, expectedDecisions: number, decision: LibraryMaterialDecisionInput): void {
    requireLibrary(UUID_PATTERN.test(materialId), 'LIBRARY_MATERIAL_INVALID', '资料标识无效。');
    const row = this.#db.prepare('SELECT * FROM library_materials WHERE material_id = ?').get(materialId) as SqlRow | undefined;
    requireLibrary(row !== undefined, 'LIBRARY_MATERIAL_NOT_FOUND', '资料库里没有这份资料。');
    const material = this.#material(row);
    const decisions = this.#decisions(material);
    const current = standing(decisions);
    requireLibrary(current.count === expectedDecisions, 'LIBRARY_MATERIAL_MOVED', '这份资料的归属或学习准入刚被改过；请看过现在的决定再定。');
    const fields: Record<string, unknown> = {};
    let bookId: string | null = null;
    if (decision.kind === 'attribution') {
      if (decision.attribution.scope === 'book') {
        requireLibrary(UUID_PATTERN.test(decision.attribution.bookId), 'LIBRARY_MATERIAL_BOOK_NOT_FOUND', '所选图书不存在。');
        this.#bookTitle(decision.attribution.bookId);
        bookId = decision.attribution.bookId;
      }
      const same = current.attribution !== null && current.attribution.scope === decision.attribution.scope &&
        (current.attribution.scope === 'house' || current.attribution.bookId === bookId);
      requireLibrary(!same, 'LIBRARY_ATTRIBUTION_UNCHANGED', '归属没有变化。');
      Object.assign(fields, { scope: decision.attribution.scope }, bookId === null ? {} : { bookId });
    } else {
      requireLibrary(ELIGIBILITY_CHOICES.has(decision.choice), 'LEARNING_ELIGIBILITY_INVALID', '学习准入的选项无效。');
      requireLibrary(current.attribution !== null, 'LIBRARY_ATTRIBUTION_REQUIRED', '先定归属，再定学习准入。');
      requireLibrary(decision.choice !== 'book' || current.attribution.scope === 'book', 'LEARNING_ELIGIBILITY_SCOPE',
        '这份资料归属社级，没有可以只纳入的那本书。');
      const reason = learningEligibilityReason(decision.reason);
      if (decision.choice === 'book' && current.attribution.scope === 'book') bookId = current.attribution.bookId;
      const same = current.eligibility !== null && current.eligibility.choice === decision.choice && current.eligibility.reason === reason;
      requireLibrary(!same, 'LEARNING_ELIGIBILITY_UNCHANGED', '学习准入没有变化。');
      Object.assign(fields, {
        choice: decision.choice,
        reason,
        basis: LEARNING_ELIGIBILITY_BASIS,
        attributionOrdinal: current.attribution.ordinal,
      }, bookId === null ? {} : { bookId });
    }
    const decisionId = randomUUID();
    const ordinal = current.count + 1;
    const previousSha256 = current.last?.sha256 ?? material.sha256;
    const recordedAt = new Date().toISOString();
    const record = canonicalRecord({
      schema: DECISION_SCHEMA,
      decisionId,
      materialId,
      materialSha256: material.sha256,
      ordinal,
      kind: decision.kind,
      ...fields,
      actor: LIBRARY_ACTOR,
      previousSha256,
      recordedAt,
    });
    this.#db.prepare(
      `INSERT INTO library_material_decisions(decision_id, material_id, ordinal, kind, book_id, previous_sha256, recorded_at, canonical_json, sha256)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(decisionId, materialId, ordinal, decision.kind, bookId, previousSha256, recordedAt, record.json, record.digest);
  }

  /**
   * 知识库 › 资料库 (KB-007): one page of items, newest first, after `after` — each with where it stands and its latest
   * decisions — so one answer always fits a service frame however many items the house collects (Issue #427 review).
   */
  page(after: LibraryMaterialCursor | null): LibraryMaterialsProjection {
    requireLibrary(after === null || (UUID_PATTERN.test(after.materialId) && typeof after.recordedAt === 'string' && !Number.isNaN(Date.parse(after.recordedAt))),
      'LIBRARY_MATERIAL_CURSOR_INVALID', '资料库列表位置无效。');
    const limit = MAX_LIBRARY_MATERIALS_PAGE + 1;
    const rows = (after === null
      ? this.#db.prepare('SELECT * FROM library_materials ORDER BY recorded_at DESC, material_id DESC LIMIT ?').all(limit)
      : this.#db.prepare(
        `SELECT * FROM library_materials WHERE recorded_at < ? OR (recorded_at = ? AND material_id < ?)
         ORDER BY recorded_at DESC, material_id DESC LIMIT ?`,
      ).all(after.recordedAt, after.recordedAt, after.materialId, limit)) as SqlRow[];
    const titles = new Map<string, string>();
    const materials = rows.slice(0, MAX_LIBRARY_MATERIALS_PAGE).map((row) => this.#view(this.#material(row), titles));
    const last = materials.at(-1);
    return {
      materials,
      nextCursor: rows.length > MAX_LIBRARY_MATERIALS_PAGE && last !== undefined ? { recordedAt: last.recordedAt, materialId: last.materialId } : null,
    };
  }

  /** One item as its card reads it: what 放入资料库 and a decision answer with, and what 待我处理 opens beyond the first page. */
  item(materialId: string): LibraryMaterialProjection {
    requireLibrary(UUID_PATTERN.test(materialId), 'LIBRARY_MATERIAL_INVALID', '资料标识无效。');
    const row = this.#db.prepare('SELECT * FROM library_materials WHERE material_id = ?').get(materialId) as SqlRow | undefined;
    requireLibrary(row !== undefined, 'LIBRARY_MATERIAL_NOT_FOUND', '资料库里没有这份资料。');
    return this.#view(this.#material(row), new Map());
  }

  /** An item's card: where it stands, whether a Task may list it, and its decisions — how many, and the latest of them. */
  #view(material: StoredMaterial, titles: Map<string, string>): LibraryMaterialProjection {
    const title = (bookId: string): string => {
      const known = titles.get(bookId) ?? this.#bookTitle(bookId);
      titles.set(bookId, known);
      return known;
    };
    const decisions = this.#decisions(material);
    const now = standing(decisions);
    const attribution: LibraryMaterialProjection['attribution'] = now.attribution === null
      ? null
      : now.attribution.scope === 'book'
        ? { scope: 'book', bookId: now.attribution.bookId, bookTitle: title(now.attribution.bookId), decidedAt: now.attribution.recordedAt }
        : { scope: 'house', decidedAt: now.attribution.recordedAt };
    const eligibility: LibraryMaterialProjection['eligibility'] = now.eligibility === null
      ? null
      : {
        choice: now.eligibility.choice,
        bookTitle: now.eligibility.bookId === null ? null : title(now.eligibility.bookId),
        reason: now.eligibility.reason,
        decidedAt: now.eligibility.recordedAt,
      };
    const reference: LibraryMaterialProjection['reference'] = attribution === null || eligibility === null || eligibility.choice === 'deferred'
      ? { state: 'pending' }
      : attribution.scope === 'book'
        ? { state: 'available', scope: 'book', bookTitle: attribution.bookTitle }
        : { state: 'available', scope: 'house' };
    return {
      materialId: material.materialId,
      title: material.title,
      kind: material.kind,
      source: material.source,
      recordedAt: material.recordedAt,
      digest: material.sha256,
      attribution,
      eligibility,
      eligibilityReset: now.eligibilityReset,
      reference,
      decisionCount: now.count,
      decisions: now.recent.map((entry): LibraryMaterialDecisionProjection => ({
        ordinal: entry.ordinal,
        recordedAt: entry.recordedAt,
        decision: entry.kind === 'attribution'
          ? entry.scope === 'book'
            ? { kind: 'attribution', scope: 'book', bookId: entry.bookId, bookTitle: title(entry.bookId) }
            : { kind: 'attribution', scope: 'house' }
          : { kind: 'eligibility', choice: entry.choice, bookTitle: entry.bookId === null ? null : title(entry.bookId), reason: entry.reason },
      })),
    };
  }

  /**
   * The items 待我处理 lists in 等待你的决定 (ATTN-009): each one without an attribution, without a Learning Eligibility
   * decided under the attribution it has, or whose eligibility was left for later — at most `limit`, oldest wait first.
   */
  attentionReadings(limit: number): LibraryMaterialAttentionReading[] {
    requireLibrary(Number.isSafeInteger(limit) && limit >= 0, 'LIBRARY_MATERIAL_CURSOR_INVALID', '资料库列表数量无效。');
    const readings: LibraryMaterialAttentionReading[] = [];
    const compare = (a: LibraryMaterialAttentionReading, b: LibraryMaterialAttentionReading): number => a.at < b.at ? -1 : a.at > b.at ? 1 : a.materialId < b.materialId ? -1 : 1;
    for (const material of this.#materials()) {
      const now = standing(this.#decisions(material));
      const scope = now.attribution === null ? 'none' as const : now.attribution.scope;
      const book = now.attribution?.scope === 'book' ? { bookId: now.attribution.bookId, title: this.#bookTitle(now.attribution.bookId) } : null;
      const base = { materialId: material.materialId, title: material.title, kind: material.kind, scope, book, objectSha256: material.source.sha256 };
      if (now.attribution === null) readings.push({ ...base, state: 'library-attribution-pending', at: material.recordedAt });
      else if (now.eligibility === null) readings.push({ ...base, state: 'learning-eligibility-pending', at: now.attribution.recordedAt });
      else if (now.eligibility.choice === 'deferred') readings.push({ ...base, state: 'learning-eligibility-deferred', at: now.eligibility.recordedAt });
      readings.sort(compare);
      if (readings.length > limit) readings.pop();
    }
    return readings;
  }
}
