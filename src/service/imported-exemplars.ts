import { randomUUID } from 'node:crypto';
import { open, opendir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import type { DatabaseSync, SQLOutputValue } from 'node:sqlite';
import { ensureCanonicalDataDirectory, inspectCanonicalDataFile } from '../shared/data-root.js';
import type { ExemplarBookCursor, ExemplarBookProjection, ImportedExemplarInput, ImportedExemplarPreview, ImportedExemplarDecisionInput } from '../shared/protocol.js';
import { canonicalJson, canonicalRecord, isRecord, parseStoredJson, sha256Hex, UUID_PATTERN } from './analysis/canonical.js';
import { extractMaterialText } from './material-index.js';
import { MAX_ARCHIVE_BYTES } from './docx.js';
import { identifyManuscriptFormat, MANUSCRIPT_FORMAT_HEAD_BYTES } from './manuscript-format.js';
import { BUILTIN_PRODUCTION_DOCUMENT_TYPES, READERS_REPORT_DOCUMENT_TYPES } from './production-document-types.js';

/** Earlier published Books are knowledge provenance, never fabricated AI7 Book projects (KB-006). */
export const IMPORTED_EXEMPLAR_SCHEMA_SQL = {
  earlier_exemplar_books: `CREATE TABLE earlier_exemplar_books (
  book_id TEXT PRIMARY KEY,
  title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 200),
  recorded_at TEXT NOT NULL,
  canonical_json TEXT NOT NULL,
  sha256 TEXT NOT NULL UNIQUE CHECK(length(sha256) = 64)
) STRICT`,
  earlier_exemplar_versions: `CREATE TABLE earlier_exemplar_versions (
  revision_id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL,
  book_id TEXT NOT NULL REFERENCES earlier_exemplar_books(book_id),
  type_id TEXT NOT NULL CHECK(length(type_id) BETWEEN 1 AND 64),
  version INTEGER NOT NULL CHECK(version >= 1),
  recorded_at TEXT NOT NULL,
  canonical_json TEXT NOT NULL,
  sha256 TEXT NOT NULL UNIQUE CHECK(length(sha256) = 64),
  UNIQUE(book_id, type_id, version),
  UNIQUE(document_id, version)
) STRICT`,
  earlier_exemplar_eligibility: `CREATE TABLE earlier_exemplar_eligibility (
  decision_id TEXT PRIMARY KEY,
  revision_id TEXT NOT NULL REFERENCES earlier_exemplar_versions(revision_id),
  ordinal INTEGER NOT NULL CHECK(ordinal >= 1),
  choice TEXT NOT NULL CHECK(choice IN ('house', 'excluded', 'deferred')),
  recorded_at TEXT NOT NULL,
  canonical_json TEXT NOT NULL,
  sha256 TEXT NOT NULL UNIQUE CHECK(length(sha256) = 64),
  UNIQUE(revision_id, ordinal)
) STRICT`,
} as const;
export const IMPORTED_EXEMPLAR_TRIGGER_SQL = Object.fromEntries(Object.keys(IMPORTED_EXEMPLAR_SCHEMA_SQL).flatMap((table) =>
  ['update', 'delete'].map((operation) => [`${table}_no_${operation}`, `CREATE TRIGGER ${table}_no_${operation}
    BEFORE ${operation.toUpperCase()} ON ${table}
    BEGIN
      SELECT RAISE(ABORT, 'IMPORTED_EXEMPLAR_LEDGER_IMMUTABLE');
    END`])));
export const IMPORTED_EXEMPLAR_FOREIGN_KEYS = {
  earlier_exemplar_books: [],
  earlier_exemplar_versions: ['book_id>earlier_exemplar_books.book_id:NO ACTION/NO ACTION/NONE'],
  earlier_exemplar_eligibility: ['revision_id>earlier_exemplar_versions.revision_id:NO ACTION/NO ACTION/NONE'],
};
export const IMPORTED_EXEMPLAR_OBJECT_DIRECTORY = 'exemplar-objects';
export const IMPORTED_EXEMPLAR_TYPES = [...READERS_REPORT_DOCUMENT_TYPES.types, ...BUILTIN_PRODUCTION_DOCUMENT_TYPES.types];
const CORRUPT = '以前图书的范例记录无法读取。';
type Row = Record<string, SQLOutputValue>;
export class ImportedExemplarError extends Error {
  constructor(readonly code: string, message: string) { super(message); this.name = 'ImportedExemplarError'; }
}
function requireExemplar(condition: unknown, message: string, code = 'EXEMPLAR_IMPORT_INVALID'): asserts condition {
  if (!condition) throw new ImportedExemplarError(code, message);
}
function field(value: unknown): string {
  requireExemplar(typeof value === 'string' && value.isWellFormed(), '请填写图书名称、作者和责编。');
  const clean = value.trim().normalize('NFC');
  requireExemplar(clean.length > 0 && clean.length <= 200 && !/[\p{Cc}\p{Zl}\p{Zp}]/u.test(clean), '图书名称、作者和责编须填写，且每项在 200 字以内。');
  return clean;
}
function names(value: unknown): string[] {
  requireExemplar(Array.isArray(value) && value.length > 0 && value.length <= 20, '请填写作者和责编。');
  return [...new Set(value.map(field))];
}
function record(row: Row): Record<string, unknown> {
  requireExemplar(typeof row.canonical_json === 'string' && sha256Hex(row.canonical_json) === row.sha256, CORRUPT, 'EXEMPLAR_RECORD_INVALID');
  const value = parseStoredJson(row.canonical_json, () => new ImportedExemplarError('EXEMPLAR_RECORD_INVALID', CORRUPT));
  requireExemplar(isRecord(value) && canonicalJson(value) === row.canonical_json, CORRUPT, 'EXEMPLAR_RECORD_INVALID');
  return value;
}
export function initializeImportedExemplarSchema(db: DatabaseSync): void {
  if (db.prepare("SELECT 1 FROM sqlite_schema WHERE name = 'earlier_exemplar_books'").get() !== undefined) return;
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const sql of Object.values(IMPORTED_EXEMPLAR_SCHEMA_SQL)) db.exec(sql);
    for (const sql of Object.values(IMPORTED_EXEMPLAR_TRIGGER_SQL)) db.exec(sql);
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}

/** Validates immutable content on every exact read, including the writing Task's frozen reference. */
export function readImportedExemplar(db: DatabaseSync, revisionId: string): { text: string; digest: string } | null {
  if (db.prepare("SELECT 1 FROM sqlite_schema WHERE name = 'earlier_exemplar_versions'").get() === undefined) return null;
  const row = db.prepare('SELECT * FROM earlier_exemplar_versions WHERE revision_id = ?').get(revisionId) as Row | undefined;
  if (row === undefined) return null;
  const value = record(row);
  requireExemplar(value.schema === 'ai7.earlier-exemplar-version/1' && value.revisionId === row.revision_id && value.documentId === row.document_id &&
    value.bookId === row.book_id && value.typeId === row.type_id && value.version === row.version && value.recordedAt === row.recorded_at &&
    typeof value.parser === 'string' && isRecord(value.source) && typeof value.source.displayName === 'string' &&
    typeof value.source.sha256 === 'string' && /^[0-9a-f]{64}$/u.test(value.source.sha256) &&
    ['DOCX', 'TXT', 'MD'].includes(String(value.source.format)) &&
    typeof value.source.bytes === 'number' && Number.isSafeInteger(value.source.bytes) && value.source.bytes > 0 && value.source.bytes <= MAX_ARCHIVE_BYTES &&
    value.source.objectKey === `${value.source.sha256}.${String(value.source.format).toLowerCase()}` &&
    Array.isArray(value.paragraphs) && value.paragraphs.length > 0 && value.paragraphs.every((line) => typeof line === 'string' && line.isWellFormed()),
  CORRUPT, 'EXEMPLAR_RECORD_INVALID');
  return { text: (value.paragraphs as string[]).join('\n'), digest: String(row.sha256) };
}

interface Preview { path: string; bytes: Uint8Array; paragraphs: string[]; parser: string; source: ImportedExemplarPreview; }
export class ImportedExemplars {
  readonly #previews = new Map<string, Preview>();
  constructor(readonly db: DatabaseSync, readonly dataRoot: string) {}

  async preview(path: string): Promise<ImportedExemplarPreview> {
    let bytes: Uint8Array;
    try {
      const metadata = await stat(path);
      requireExemplar(metadata.isFile() && metadata.size > 0 && metadata.size <= MAX_ARCHIVE_BYTES, '范例文件不能为空，且须在 64 MB 以内。');
      bytes = await readFile(path);
      requireExemplar(bytes.length > 0 && bytes.length <= MAX_ARCHIVE_BYTES, '范例文件大小无效。');
    } catch (error) {
      if (error instanceof ImportedExemplarError) throw error;
      throw new ImportedExemplarError('EXEMPLAR_FILE_UNREADABLE', '无法读取所选范例文件。');
    }
    const displayName = basename(path);
    const format = identifyManuscriptFormat(bytes.subarray(0, MANUSCRIPT_FORMAT_HEAD_BYTES), displayName);
    requireExemplar(format === 'DOCX' || format === 'TXT' || format === 'MD', '范例请用 Word（.docx）或纯文本（.txt、.md）。');
    const digest = sha256Hex(bytes);
    const extracted = await extractMaterialText({ originalPath: path, displayName, format, objectSha256: digest, bytes: bytes.length, dataRoot: this.dataRoot });
    requireExemplar(extracted.state === 'complete', '范例文件无法提取文字；请检查文件、编码和格式后再选。');
    const paragraphs = extracted.blocks.map((block) => block.text);
    requireExemplar(paragraphs.some((line) => line.trim().length > 0) && paragraphs.join('\n').length <= 4_000_000, '范例文字为空或过长。');
    const source: ImportedExemplarPreview = { previewId: randomUUID(), displayName, format, sha256: digest, bytes: bytes.length, excerpt: paragraphs.join('\n').slice(0, 1000), types: IMPORTED_EXEMPLAR_TYPES };
    // Previews are ephemeral and bounded; their originals never enter a repository or a diagnostic.
    while (this.#previews.size >= 4) this.#previews.delete(this.#previews.keys().next().value!);
    this.#previews.set(source.previewId, { path, bytes, paragraphs, parser: extracted.converter, source });
    return source;
  }

  #book(bookId: string): { title: string; authors: string[]; editors: string[]; recordedAt: string } {
    const row = this.db.prepare('SELECT * FROM earlier_exemplar_books WHERE book_id = ?').get(bookId) as Row | undefined;
    requireExemplar(row !== undefined, '这本以前出版的图书已不存在。');
    const value = record(row);
    requireExemplar(value.schema === 'ai7.earlier-exemplar-book/1' && value.bookId === bookId && value.title === row.title && value.recordedAt === row.recorded_at, CORRUPT, 'EXEMPLAR_RECORD_INVALID');
    return { title: field(value.title), authors: names(value.authors), editors: names(value.editors), recordedAt: String(row.recorded_at) };
  }
  #versions(bookId: string, typeId: string): { latest: Row | undefined; count: number; earlier: number[] } {
    const rows = this.db.prepare('SELECT * FROM earlier_exemplar_versions WHERE book_id = ? AND type_id = ? ORDER BY version').iterate(bookId, typeId) as Iterable<Row>;
    let previous = this.db.prepare('SELECT sha256 FROM earlier_exemplar_books WHERE book_id = ?').get(bookId)?.sha256;
    let latest: Row | undefined;
    let count = 0;
    const earlier: number[] = [];
    for (const row of rows) {
      const value = record(row);
      readImportedExemplar(this.db, String(row.revision_id));
      requireExemplar(row.version === count + 1 && value.previousSha256 === previous && (latest === undefined || row.document_id === latest.document_id), CORRUPT, 'EXEMPLAR_RECORD_INVALID');
      if (latest !== undefined) {
        earlier.push(Number(latest.version));
        if (earlier.length > 10) earlier.shift();
      }
      count += 1;
      latest = row;
      previous = row.sha256;
    }
    return { latest, count, earlier };
  }
  #decisions(revisionId: string): Row[] {
    const rows = this.db.prepare('SELECT * FROM earlier_exemplar_eligibility WHERE revision_id = ? ORDER BY ordinal').all(revisionId) as Row[];
    let previous = this.db.prepare('SELECT sha256 FROM earlier_exemplar_versions WHERE revision_id = ?').get(revisionId)?.sha256;
    for (const [index, row] of rows.entries()) {
      const value = record(row);
      requireExemplar(value.schema === 'ai7.earlier-exemplar-eligibility/1' && value.decisionId === row.decision_id && value.revisionId === revisionId && value.ordinal === row.ordinal &&
        row.ordinal === index + 1 && value.choice === row.choice && value.recordedAt === row.recorded_at && value.previousSha256 === previous && value.actor === '本机编辑', CORRUPT, 'EXEMPLAR_RECORD_INVALID');
      previous = row.sha256;
    }
    return rows;
  }
  #decision(revisionId: string, choice: 'house' | 'excluded' | 'deferred', basis: string): void {
    const decisions = this.#decisions(revisionId);
    const decisionId = randomUUID();
    const recordedAt = new Date().toISOString();
    const previousSha256 = decisions.at(-1)?.sha256 ?? this.db.prepare('SELECT sha256 FROM earlier_exemplar_versions WHERE revision_id = ?').get(revisionId)!.sha256;
    const ordinal = decisions.length + 1;
    const result = canonicalRecord({ schema: 'ai7.earlier-exemplar-eligibility/1', decisionId, revisionId, ordinal, choice, basis, actor: '本机编辑', recordedAt, previousSha256 });
    this.db.prepare('INSERT INTO earlier_exemplar_eligibility VALUES (?, ?, ?, ?, ?, ?, ?)').run(decisionId, revisionId, ordinal, choice, recordedAt, result.json, result.digest);
  }
  async import(input: ImportedExemplarInput): Promise<ExemplarBookProjection> {
    requireExemplar(isRecord(input) && UUID_PATTERN.test(input.previewId), '请重新选择范例文件。');
    const preview = this.#previews.get(input.previewId);
    requireExemplar(preview !== undefined, '范例预览已失效，请重新选择文件。');
    requireExemplar(IMPORTED_EXEMPLAR_TYPES.some((type) => type.typeId === input.typeId), '请选择文档类型。');
    requireExemplar(Number.isSafeInteger(input.expectedVersion) && input.expectedVersion >= 0, '范例版本无效。');
    const creating = input.bookId === null;
    const bookId = creating ? randomUUID() : input.bookId;
    requireExemplar(typeof bookId === 'string' && UUID_PATTERN.test(bookId), '图书标识无效。');
    requireExemplar(typeof input.bookTitle === 'string' && input.bookTitle.trim().normalize('NFC').length <= 180, '图书名称须在 180 字以内。');
    const people = creating ? { title: field(input.bookTitle).replace(/\s+/gu, ' '), authors: names(input.authors), editors: names(input.editors) } : this.#book(bookId);
    let original: Uint8Array;
    try { original = await readFile(preview.path); } catch { throw new ImportedExemplarError('EXEMPLAR_FILE_CHANGED', '范例文件已改变或无法读取，请重新选择。'); }
    requireExemplar(sha256Hex(original) === preview.source.sha256, '范例文件已改变，请重新选择。', 'EXEMPLAR_FILE_CHANGED');
    const directory = await ensureCanonicalDataDirectory(this.dataRoot, IMPORTED_EXEMPLAR_OBJECT_DIRECTORY);
    const objectKey = `${preview.source.sha256}.${preview.source.format.toLowerCase()}`;
    const target = await inspectCanonicalDataFile(this.dataRoot, directory, objectKey);
    // Written aside, synced and verified, then named: a stop mid-write leaves only a partial the open-time sweep removes, and an
    // original under its digest is always whole (as 放入资料库 keeps its originals).
    if (!(target.exists && sha256Hex(await readFile(target.path)) === preview.source.sha256)) {
      const partial = resolve(directory, `.partial-${randomUUID()}`);
      try {
        await writeFile(partial, preview.bytes, { flag: 'wx' });
        const handle = await open(partial, 'r+');
        try { await handle.sync(); } finally { await handle.close(); }
        requireExemplar(sha256Hex(await readFile(partial)) === preview.source.sha256, '范例原件无法保存，请重试。', 'EXEMPLAR_FILE_DAMAGED');
        await rename(partial, target.path);
      } catch (error) {
        await rm(partial, { force: true });
        throw error;
      }
    }
    const recordedAt = new Date().toISOString();
    this.db.exec('BEGIN IMMEDIATE');
    try {
      if (creating) {
        const book = canonicalRecord({ schema: 'ai7.earlier-exemplar-book/1', bookId, ...people, recordedAt });
        this.db.prepare('INSERT INTO earlier_exemplar_books VALUES (?, ?, ?, ?, ?)').run(bookId, people.title, recordedAt, book.json, book.digest);
      }
      const versions = this.#versions(bookId, input.typeId);
      requireExemplar(versions.count === input.expectedVersion, '范例已添了新版本，请看过当前版本再导入。', 'EXEMPLAR_VERSION_CHANGED');
      const revisionId = randomUUID();
      const documentId = String(versions.latest?.document_id ?? randomUUID());
      const version = versions.count + 1;
      const previousSha256 = versions.latest?.sha256 ?? this.db.prepare('SELECT sha256 FROM earlier_exemplar_books WHERE book_id = ?').get(bookId)!.sha256;
      const value = canonicalRecord({ schema: 'ai7.earlier-exemplar-version/1', revisionId, documentId, bookId, typeId: input.typeId, version, recordedAt, previousSha256,
        source: { displayName: preview.source.displayName, format: preview.source.format, sha256: preview.source.sha256, bytes: preview.source.bytes, objectKey }, parser: preview.parser, paragraphs: preview.paragraphs });
      this.db.prepare('INSERT INTO earlier_exemplar_versions VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(revisionId, documentId, bookId, input.typeId, version, recordedAt, value.json, value.digest);
      this.#decision(revisionId, 'house', 'KB-006 默认仅本社');
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
    this.#previews.delete(input.previewId);
    return this.book(bookId);
  }
  /**
   * At open: what an interrupted or refused 导入范例 left in the Agent Data Root — a partial written aside, or an original kept
   * under its digest that no recorded version names — is removed, so no unrecorded earlier-Book text stays behind.
   */
  async sweep(): Promise<void> {
    if (this.db.prepare("SELECT 1 FROM sqlite_schema WHERE name = 'earlier_exemplar_versions'").get() === undefined) return;
    let entries: Awaited<ReturnType<typeof opendir>>;
    try { entries = await opendir(resolve(this.dataRoot, IMPORTED_EXEMPLAR_OBJECT_DIRECTORY)); } catch (error) {
      if (isRecord(error) && error.code === 'ENOENT') return;
      throw error;
    }
    const recorded = this.db.prepare("SELECT 1 FROM earlier_exemplar_versions WHERE json_extract(canonical_json, '$.source.objectKey') = ?");
    const directory = await ensureCanonicalDataDirectory(this.dataRoot, IMPORTED_EXEMPLAR_OBJECT_DIRECTORY);
    for await (const entry of entries) {
      if (!entry.isFile()) continue;
      const partial = /^\.partial-[0-9a-f-]{36}$/u.test(entry.name);
      const object = /^[0-9a-f]{64}\.(?:docx|txt|md)$/u.test(entry.name);
      if (partial || (object && recorded.get(entry.name) === undefined)) {
        await rm((await inspectCanonicalDataFile(this.dataRoot, directory, entry.name)).path, { force: true });
      }
    }
  }
  decide(input: ImportedExemplarDecisionInput): ExemplarBookProjection {
    requireExemplar(isRecord(input) && UUID_PATTERN.test(input.revisionId) && ['house', 'excluded', 'deferred'].includes(input.choice), '学习准入参数无效。');
    const revision = readImportedExemplar(this.db, input.revisionId);
    requireExemplar(revision !== null && revision.digest === input.revisionDigest, '要决定的范例版本已改变。');
    const row = this.db.prepare('SELECT book_id, type_id, version FROM earlier_exemplar_versions WHERE revision_id = ?').get(input.revisionId)!;
    requireExemplar(this.#versions(String(row.book_id), String(row.type_id)).latest?.version === row.version, '请决定当前范例版本的学习准入。');
    this.db.exec('BEGIN IMMEDIATE');
    try {
      requireExemplar(this.#decisions(input.revisionId).length === input.expectedDecisions, '学习准入已改变，请看过当前决定再定。', 'EXEMPLAR_ELIGIBILITY_CHANGED');
      this.#decision(input.revisionId, input.choice, '编辑决定');
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
    return this.book(String(row.book_id));
  }
  books(after: ExemplarBookCursor | null, limit: number): Array<{ bookId: string; title: string }> {
    return (this.db.prepare('SELECT book_id, title FROM earlier_exemplar_books WHERE (? IS NULL OR title > ? COLLATE BINARY OR (title = ? AND book_id > ?)) ORDER BY title COLLATE BINARY, book_id LIMIT ?')
      .all(after?.title ?? null, after?.title ?? '', after?.title ?? '', after?.bookId ?? '', limit) as Row[]).map((row) => ({ bookId: String(row.book_id), title: String(row.title) }));
  }
  /**
   * The imported 审稿意见 exemplars a draft may seed from, by Book title as 范例 lists them, one item at a time and each
   * exact version read on its own (Issue #778): a damaged Book or version record, or a damaged decision ledger, makes only
   * that item's `revisionId` `null` — listed as damaged with its Book, type and version named — while the rest still read.
   */
  readersReportExemplarCandidates(): Array<{ title: string; revisionId: string | null }> {
    if (this.db.prepare("SELECT 1 FROM sqlite_schema WHERE name = 'earlier_exemplar_versions'").get() === undefined) return [];
    const candidates: Array<{ title: string; revisionId: string | null }> = [];
    for (const book of this.db.prepare('SELECT book_id, title FROM earlier_exemplar_books ORDER BY title COLLATE BINARY, book_id').iterate() as Iterable<Row>) {
      const bookId = String(book.book_id);
      let bookReads = true;
      try { this.#book(bookId); } catch (error) {
        if (!(error instanceof ImportedExemplarError)) throw error;
        bookReads = false;
      }
      for (const type of IMPORTED_EXEMPLAR_TYPES) {
        if (!type.typeId.startsWith('readers-report-')) continue;
        const latest = this.db.prepare('SELECT revision_id, version FROM earlier_exemplar_versions WHERE book_id = ? AND type_id = ? ORDER BY version DESC, revision_id LIMIT 1')
          .get(bookId, type.typeId) as Row | undefined;
        if (latest === undefined) continue;
        const title = `${String(book.title)} · ${type.label} · 版本 ${String(latest.version)}`;
        let revisionId: string | null = String(latest.revision_id);
        try {
          requireExemplar(bookReads, CORRUPT, 'EXEMPLAR_RECORD_INVALID');
          const versions = this.#versions(bookId, type.typeId);
          requireExemplar(versions.latest?.revision_id === revisionId, CORRUPT, 'EXEMPLAR_RECORD_INVALID');
          const decisions = this.#decisions(revisionId);
          requireExemplar(decisions.length > 0, CORRUPT, 'EXEMPLAR_RECORD_INVALID');
          if (decisions.at(-1)?.choice !== 'house') continue;
        } catch (error) {
          if (!(error instanceof ImportedExemplarError)) throw error;
          revisionId = null;
        }
        candidates.push({ title, revisionId });
      }
    }
    return candidates;
  }
  book(bookId: string): ExemplarBookProjection {
    const book = this.#book(bookId);
    return this.#projection(bookId, book, IMPORTED_EXEMPLAR_TYPES.flatMap((type) => this.#exemplar(bookId, type)));
  }
  /**
   * The Book as the 写作任务 scan reads it, one item at a time (Issue #789, as #778 did for 审稿意见): a type whose versions or
   * decision ledger no longer read — or any type of a Book whose own record does not — is left out of `book.exemplars` and named in
   * `damaged` by Book, type and latest version, while every other type of the Book still reads. `title` is the Book's listed title.
   */
  bookForWriting(bookId: string, title: string): { book: ExemplarBookProjection; damaged: Array<{ typeId: string; title: string }> } {
    let head: { title: string; authors: string[]; editors: string[]; recordedAt: string } | null = null;
    try { head = this.#book(bookId); } catch (error) { if (!(error instanceof ImportedExemplarError)) throw error; }
    const exemplars: Array<ExemplarBookProjection['exemplars'][number]> = [];
    const damaged: Array<{ typeId: string; title: string }> = [];
    for (const type of IMPORTED_EXEMPLAR_TYPES) {
      const latest = this.db.prepare('SELECT version FROM earlier_exemplar_versions WHERE book_id = ? AND type_id = ? ORDER BY version DESC LIMIT 1').get(bookId, type.typeId);
      if (latest === undefined) continue;
      try {
        requireExemplar(head !== null, CORRUPT, 'EXEMPLAR_RECORD_INVALID');
        exemplars.push(...this.#exemplar(bookId, type));
      } catch (error) {
        if (!(error instanceof ImportedExemplarError)) throw error;
        damaged.push({ typeId: type.typeId, title: `${title} · ${type.label} · 版本 ${String(latest.version)}` });
      }
    }
    return { book: this.#projection(bookId, head ?? { title, authors: [], editors: [], recordedAt: '' }, exemplars), damaged };
  }
  #projection(bookId: string, book: { title: string; authors: string[]; editors: string[]; recordedAt: string }, exemplars: ExemplarBookProjection['exemplars']): ExemplarBookProjection {
    return { bookId, bookTitle: book.title, authors: book.authors, editors: book.editors, imported: true, publicationOrdinal: 0, designatedAt: book.recordedAt, withdrawn: false, readersReports: [], exemplars };
  }
  #exemplar(bookId: string, type: (typeof IMPORTED_EXEMPLAR_TYPES)[number]): ExemplarBookProjection['exemplars'] {
    const versions = this.#versions(bookId, type.typeId);
    const row = versions.latest;
    if (row === undefined) return [];
    const decisions = this.#decisions(String(row.revision_id));
    requireExemplar(decisions.length > 0, CORRUPT, 'EXEMPLAR_RECORD_INVALID');
    const choice = decisions.at(-1)!.choice;
    return [{ documentId: String(row.document_id), typeId: type.typeId, typeLabel: type.label, revisionId: String(row.revision_id), revisionDigest: String(row.sha256), version: Number(row.version),
      deliveredTo: '', deliveredAt: String(row.recorded_at), archivedAt: String(row.recorded_at), earlierVersionCount: versions.count - 1, earlierVersions: versions.earlier,
      eligibility: choice === 'house' ? 'house-only' as const : choice === 'excluded' ? 'excluded' as const : 'deferred' as const,
      imported: { decisions: decisions.length, sourceName: String((record(row).source as Record<string, unknown>).displayName) } }];
  }
}
