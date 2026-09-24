import { randomUUID } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { basename } from 'node:path';
import type { DatabaseSync, SQLOutputValue } from 'node:sqlite';
import {
  MAX_REVIEW_GUIDELINE_FILE_BYTES,
  type ReviewGuidelineDocumentProjection,
  type ReviewGuidelinePreviewProjection,
  type ReviewGuidelineSourceProjection,
  type ReviewGuidelinesProjection,
  type ReviewGuidelineVersionProjection,
} from '../shared/protocol.js';
import { UUID_PATTERN, canonicalJson, canonicalRecord, isRecord, sha256Hex } from './analysis/canonical.js';
import { graphemeCount } from './analysis/factual-review-contract.js';
import { parseDocx } from './docx.js';
import { MANUSCRIPT_FORMAT_HEAD_BYTES, identifyManuscriptFormat } from './manuscript-format.js';
import {
  BUILTIN_REVIEW_CATEGORY_CONFIGURATION,
  type ReviewCategoryConfiguration,
  type ReviewGuidelineClause,
  type ReviewGuidelineDocument,
} from './review/category-configuration.js';

/**
 * 知识库 › 审阅规范文件 (Issue #427, plan slice S79a; V2-UX-KB-001 to KB-003, REV-012). The guideline documents a review
 * category applies are AI7's own short defaults, issued as `AI7 内置默认` at version 1 and never stored. A house imports
 * its own next version of one of them — a Word file or plain text of numbered clauses — and every Review Run prepared
 * after that applies it, while each earlier Run keeps naming the version it used: a Run snapshots its category entries,
 * guideline documents with their versions and clauses included.
 *
 * Schema revision 45 owns one relation, a ledger like the others: each row is one imported version, chained to the version
 * before it by that version's digest — version 2 to the built-in document's — appended once and never rewritten.
 */

export const REVIEW_GUIDELINE_SCHEMA_SQL = {
  review_guideline_versions: `CREATE TABLE review_guideline_versions (
  version_id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL CHECK(length(document_id) BETWEEN 1 AND 64),
  ordinal INTEGER NOT NULL CHECK(ordinal >= 2),
  previous_sha256 TEXT NOT NULL CHECK(length(previous_sha256) = 64),
  recorded_at TEXT NOT NULL,
  canonical_json TEXT NOT NULL,
  sha256 TEXT NOT NULL UNIQUE CHECK(length(sha256) = 64),
  UNIQUE(document_id, ordinal)
) STRICT`,
} as const;

export const REVIEW_GUIDELINE_TRIGGER_SQL: Readonly<Record<string, string>> = Object.fromEntries(
  Object.keys(REVIEW_GUIDELINE_SCHEMA_SQL).flatMap((table) => [
    [`${table}_no_update`, `CREATE TRIGGER ${table}_no_update
    BEFORE UPDATE ON ${table}
    BEGIN
      SELECT RAISE(ABORT, 'REVIEW_GUIDELINE_LEDGER_IMMUTABLE');
    END`],
    [`${table}_no_delete`, `CREATE TRIGGER ${table}_no_delete
    BEFORE DELETE ON ${table}
    BEGIN
      SELECT RAISE(ABORT, 'REVIEW_GUIDELINE_LEDGER_IMMUTABLE');
    END`],
  ]),
);

export const REVIEW_GUIDELINE_FOREIGN_KEYS: Readonly<Record<string, ReadonlyArray<string>>> = {
  review_guideline_versions: [],
};

export class ReviewGuidelineError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'ReviewGuidelineError';
  }
}

function requireGuideline(condition: unknown, code: string, message: string): asserts condition {
  if (!condition) throw new ReviewGuidelineError(code, message);
}

type SqlRow = Record<string, SQLOutputValue>;

const RECORD_SCHEMA = 'ai7.review-guideline-version/1';
const BUILTIN_SCHEMA = 'ai7.review-guideline-builtin/1';
/** Who issues an imported version: the house, whatever AI7 issued before it (KB-003 keeps that provenance in the chain). */
export const HOUSE_GUIDELINE_ISSUER = '本社' as const;
const TABLE_PRESENT = "SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'review_guideline_versions'";
/** The contract's own bounds on what a category may hand the model (`review-category-contract.ts`). */
export const MAX_GUIDELINE_CLAUSES = 40;
export const MAX_GUIDELINE_CLAUSE_GRAPHEMES = 300;
/** Previews wait in memory for their confirmation; a service that restarts forgets them, and the editor chooses again. */
const MAX_PREVIEWS = 16;
const CONTROL_CHARACTER = /[\p{Cc}\p{Zl}\p{Zp}]/u;
/** `1.`, `1、`, `1．`, `1)` or `1）` — and `第1条` or `第一条` — open a clause; any other paragraph continues it. */
const ARABIC_CLAUSE = /^\s*(\d{1,3})\s*[.、．)）]\s*(.*)$/u;
const CHINESE_CLAUSE = /^\s*第\s*([0-9一二三四五六七八九十百]{1,4})\s*条\s*[：:、.．]?\s*(.*)$/u;

/** Revision 45's relation, created once: a store that predates it gains one empty relation and nothing existing moves. */
export function initializeReviewGuidelineSchema(db: DatabaseSync): void {
  if (db.prepare(TABLE_PRESENT).get() !== undefined) return;
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const sql of Object.values(REVIEW_GUIDELINE_SCHEMA_SQL)) db.exec(sql);
    for (const sql of Object.values(REVIEW_GUIDELINE_TRIGGER_SQL)) db.exec(sql);
    db.exec('COMMIT');
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch (rollbackError) {
      throw new AggregateError([error, rollbackError], 'Review guideline schema rollback failed.');
    }
    throw error;
  }
}

/** A number written in Chinese, 一 to 九百九十九, as a clause may be numbered. */
function chineseNumber(text: string): number | null {
  if (/^\d+$/u.test(text)) return Number(text);
  const digits: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  let total = 0;
  let current = 0;
  for (const character of text) {
    if (character in digits) current = digits[character]!;
    else if (character === '十') { total += (current === 0 ? 1 : current) * 10; current = 0; }
    else if (character === '百') { total += (current === 0 ? 1 : current) * 100; current = 0; }
    else return null;
  }
  return total + current;
}

/** Where a clause's identity comes from: the prefix of the built-in document's clause ids, and the clause's number. */
function clausePrefix(document: ReviewGuidelineDocument): string {
  const first = document.clauses[0]?.clauseId ?? `${document.documentId.replace(/^ai7-builtin\//u, '')}/1`;
  return first.slice(0, first.lastIndexOf('/'));
}

/**
 * The numbered clauses of a guideline file's paragraphs (KB-003): a paragraph that opens with a number begins a clause and
 * each paragraph after it continues that clause, until the next number. What comes before the first clause — the title,
 * a preamble — is not a clause. The numbering runs 1, 2, 3 … without a gap, exactly as findings will cite it.
 */
export function parseGuidelineClauses(paragraphs: ReadonlyArray<string>, prefix: string): ReviewGuidelineClause[] {
  const clauses: Array<{ number: number; parts: string[] }> = [];
  for (const raw of paragraphs) {
    const paragraph = raw.replace(/\s+/gu, ' ').trim();
    if (paragraph.length === 0) continue;
    const arabic = ARABIC_CLAUSE.exec(paragraph);
    const chinese = arabic === null ? CHINESE_CLAUSE.exec(paragraph) : null;
    const number = arabic !== null ? Number(arabic[1]) : chinese !== null ? chineseNumber(chinese[1]!) : null;
    const rest = (arabic?.[2] ?? chinese?.[2] ?? '').trim();
    if (number !== null) {
      requireGuideline(number === clauses.length + 1, 'REVIEW_GUIDELINE_NUMBERING',
        clauses.length === 0 ? `条款编号要从 1 开始：第一条写的是第 ${number} 条。` : `条款编号要连续：第 ${clauses.length} 条之后是第 ${number} 条。`);
      clauses.push({ number, parts: rest.length === 0 ? [] : [rest] });
    } else if (clauses.length > 0) {
      clauses.at(-1)!.parts.push(paragraph);
    }
  }
  requireGuideline(clauses.length > 0, 'REVIEW_GUIDELINE_NO_CLAUSES', '没有找到编号条款：每一条要以“1.”或“第1条”这样的编号开头。');
  requireGuideline(clauses.length <= MAX_GUIDELINE_CLAUSES, 'REVIEW_GUIDELINE_TOO_MANY', `条款多于 ${MAX_GUIDELINE_CLAUSES} 条；一份审阅规范文件最多 ${MAX_GUIDELINE_CLAUSES} 条。`);
  return clauses.map((clause) => {
    const text = clause.parts.join(' ').trim();
    requireGuideline(text.length > 0, 'REVIEW_GUIDELINE_EMPTY_CLAUSE', `第 ${clause.number} 条只有编号，没有内容。`);
    requireGuideline(graphemeCount(text) <= MAX_GUIDELINE_CLAUSE_GRAPHEMES, 'REVIEW_GUIDELINE_CLAUSE_TOO_LONG',
      `第 ${clause.number} 条超过 ${MAX_GUIDELINE_CLAUSE_GRAPHEMES} 字；请拆成几条。`);
    requireGuideline(!CONTROL_CHARACTER.test(text), 'REVIEW_GUIDELINE_CLAUSE_INVALID', `第 ${clause.number} 条含有不能显示的控制字符。`);
    return { clauseId: `${prefix}/${clause.number}`, text };
  });
}

/** One guideline file read into paragraphs: a Word document through the manuscript parser's blocks, or UTF-8 text by lines. */
export async function readGuidelineFile(path: string): Promise<{ source: ReviewGuidelineSourceProjection; paragraphs: string[] }> {
  let bytes: Buffer;
  try {
    const metadata = await stat(path);
    requireGuideline(metadata.isFile(), 'REVIEW_GUIDELINE_FILE_INVALID', '所选的不是文件。');
    requireGuideline(metadata.size > 0 && metadata.size <= MAX_REVIEW_GUIDELINE_FILE_BYTES, 'REVIEW_GUIDELINE_FILE_SIZE',
      `审阅规范文件要在 ${MAX_REVIEW_GUIDELINE_FILE_BYTES / 1024 / 1024} MB 以内，且不是空文件。`);
    bytes = await readFile(path);
  } catch (error) {
    if (error instanceof ReviewGuidelineError) throw error;
    throw new ReviewGuidelineError('REVIEW_GUIDELINE_FILE_UNREADABLE', '无法读取所选文件。');
  }
  const displayName = basename(path);
  const sha256 = sha256Hex(bytes);
  const format = identifyManuscriptFormat(bytes.subarray(0, MANUSCRIPT_FORMAT_HEAD_BYTES), displayName);
  if (format === 'DOCX') {
    const paragraphs: string[] = [];
    try {
      await parseDocx(path, displayName, (block) => { paragraphs.push(block.text); }, { digest: sha256, bytes: bytes.length }, { formatIdentified: true });
    } catch {
      throw new ReviewGuidelineError('REVIEW_GUIDELINE_FILE_UNREADABLE', '这个 Word 文件无法读取；请另存为 .docx 后再选。');
    }
    return { source: { displayName, format: 'docx', sha256, bytes: bytes.length }, paragraphs };
  }
  requireGuideline(format === 'TXT' || format === 'MD', 'REVIEW_GUIDELINE_FORMAT', '审阅规范文件请用 Word（.docx）或纯文本（.txt、.md）。');
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new ReviewGuidelineError('REVIEW_GUIDELINE_ENCODING', '纯文本文件要用 UTF-8 编码保存。');
  }
  return { source: { displayName, format: 'text', sha256, bytes: bytes.length }, paragraphs: text.replace(/^﻿/u, '').split(/\r\n|\r|\n/u) };
}

interface StoredVersion {
  readonly versionId: string;
  readonly documentId: string;
  readonly ordinal: number;
  readonly title: string;
  readonly issuer: string;
  readonly clauses: ReadonlyArray<ReviewGuidelineClause>;
  readonly source: ReviewGuidelineSourceProjection;
  readonly previousSha256: string;
  readonly recordedAt: string;
  readonly sha256: string;
}

interface Preview {
  readonly previewId: string;
  readonly documentId: string;
  readonly ordinal: number;
  readonly previousSha256: string;
  readonly clauses: ReadonlyArray<ReviewGuidelineClause>;
  readonly source: ReviewGuidelineSourceProjection;
}

/** The built-in documents in the order the categories apply them, each once, with the categories that apply it. */
function builtinDocuments(): Array<{ document: ReviewGuidelineDocument; appliedBy: Array<{ categoryId: string; label: string }> }> {
  const found = new Map<string, { document: ReviewGuidelineDocument; appliedBy: Array<{ categoryId: string; label: string }> }>();
  for (const entry of BUILTIN_REVIEW_CATEGORY_CONFIGURATION.categories) {
    for (const document of entry.guidelineDocuments) {
      const known = found.get(document.documentId) ?? { document, appliedBy: [] };
      known.appliedBy.push({ categoryId: entry.categoryId, label: entry.label });
      found.set(document.documentId, known);
    }
  }
  return Array.from(found.values());
}

/** The digest version 2 of a document chains to: its built-in first version, as the configuration states it. */
function builtinDigest(document: ReviewGuidelineDocument): string {
  return sha256Hex(canonicalJson({ schema: BUILTIN_SCHEMA, document }));
}

function sameClauses(a: ReadonlyArray<ReviewGuidelineClause>, b: ReadonlyArray<ReviewGuidelineClause>): boolean {
  return a.length === b.length && a.every((clause, index) => clause.clauseId === b[index]!.clauseId && clause.text === b[index]!.text);
}

/** How a new version's clauses differ from the current ones, by number. */
function clauseChanges(current: ReadonlyArray<ReviewGuidelineClause>, next: ReadonlyArray<ReviewGuidelineClause>): { changed: number; added: number; removed: number } {
  const shared = Math.min(current.length, next.length);
  let changed = 0;
  for (let index = 0; index < shared; index += 1) if (current[index]!.text !== next[index]!.text) changed += 1;
  return { changed, added: Math.max(0, next.length - current.length), removed: Math.max(0, current.length - next.length) };
}

/** What a Review Run's snapshot says about the guideline documents its categories applied, and at which version. */
interface RunReading {
  readonly reviewRunId: string;
  readonly bookId: string;
  readonly bookTitle: string;
  readonly ordinal: number;
  readonly createdAt: string;
  /** documentId → version, and the categories of this Run that applied it. */
  readonly documents: ReadonlyMap<string, { version: number; categoryIds: string[] }>;
}

function integer(value: SQLOutputValue | undefined): number {
  return typeof value === 'bigint' ? Number(value) : Number(value);
}

export class ReviewGuidelineLedger {
  readonly #db: DatabaseSync;
  readonly #previews = new Map<string, Preview>();

  constructor(db: DatabaseSync) {
    this.#db = db;
  }

  /** Every stored version of one document, oldest first, each verified: its digest, and its chain to the one before. */
  #versions(document: ReviewGuidelineDocument): StoredVersion[] {
    const rows = this.#db.prepare('SELECT * FROM review_guideline_versions WHERE document_id = ? ORDER BY ordinal').all(document.documentId) as SqlRow[];
    let previous = builtinDigest(document);
    return rows.map((row, index) => {
      const json = String(row.canonical_json);
      requireGuideline(sha256Hex(json) === String(row.sha256), 'REVIEW_GUIDELINE_RECORD_INVALID', '审阅规范文件的版本记录已损坏。');
      const record = JSON.parse(json) as unknown;
      requireGuideline(isRecord(record) && record.schema === RECORD_SCHEMA && record.versionId === row.version_id &&
        record.documentId === document.documentId && record.ordinal === index + 2 && integer(row.ordinal) === index + 2 &&
        record.previousSha256 === previous && String(row.previous_sha256) === previous && record.recordedAt === row.recorded_at &&
        Array.isArray(record.clauses) && isRecord(record.source),
      'REVIEW_GUIDELINE_RECORD_INVALID', '审阅规范文件的版本记录已损坏。');
      previous = String(row.sha256);
      return {
        versionId: String(row.version_id),
        documentId: document.documentId,
        ordinal: index + 2,
        title: String(record.title),
        issuer: String(record.issuer),
        clauses: record.clauses as ReviewGuidelineClause[],
        source: record.source as unknown as ReviewGuidelineSourceProjection,
        previousSha256: String(row.previous_sha256),
        recordedAt: String(row.recorded_at),
        sha256: String(row.sha256),
      };
    });
  }

  /** A document as it now applies: its latest imported version, or the built-in first. */
  #current(document: ReviewGuidelineDocument): { document: ReviewGuidelineDocument; digest: string } {
    const latest = this.#versions(document).at(-1);
    return latest === undefined
      ? { document, digest: builtinDigest(document) }
      : {
        document: { documentId: document.documentId, title: latest.title, issuer: latest.issuer, version: String(latest.ordinal), clauses: latest.clauses },
        digest: latest.sha256,
      };
  }

  /**
   * The review category configuration as it now applies (REV-012): the built-in one with each guideline document at its
   * latest version. A Review Run prepared now snapshots exactly this.
   */
  configuration(): ReviewCategoryConfiguration {
    const current = new Map(builtinDocuments().map(({ document }) => [document.documentId, this.#current(document).document] as const));
    return {
      ...BUILTIN_REVIEW_CATEGORY_CONFIGURATION,
      categories: BUILTIN_REVIEW_CATEGORY_CONFIGURATION.categories.map((entry) => ({
        ...entry,
        guidelineDocuments: entry.guidelineDocuments.map((document) => current.get(document.documentId) ?? document),
      })),
    };
  }

  /**
   * 导入新版本's first step (KB-003): the clauses a file holds, as the next version of one document would read them, held
   * until the editor confirms it. Nothing is recorded.
   */
  preview(documentId: string, read: { source: ReviewGuidelineSourceProjection; paragraphs: ReadonlyArray<string> }): ReviewGuidelinePreviewProjection {
    const known = builtinDocuments().find((entry) => entry.document.documentId === documentId);
    requireGuideline(known !== undefined, 'REVIEW_GUIDELINE_UNKNOWN', '没有这份审阅规范文件。');
    const builtin = known.document;
    const versions = this.#versions(builtin);
    const current = this.#current(builtin);
    const clauses = parseGuidelineClauses(read.paragraphs, clausePrefix(builtin));
    requireGuideline(!sameClauses(clauses, current.document.clauses), 'REVIEW_GUIDELINE_UNCHANGED',
      `与当前的第 ${current.document.version} 版条款完全相同，不需要导入新版本。`);
    const preview: Preview = {
      previewId: randomUUID(),
      documentId,
      ordinal: versions.length + 2,
      previousSha256: current.digest,
      clauses,
      source: read.source,
    };
    this.#previews.set(preview.previewId, preview);
    while (this.#previews.size > MAX_PREVIEWS) this.#previews.delete(this.#previews.keys().next().value!);
    return {
      previewId: preview.previewId,
      documentId,
      title: builtin.title,
      ordinal: preview.ordinal,
      currentOrdinal: Number(current.document.version),
      source: read.source,
      clauses: clauses.map((clause, index) => ({ clauseId: clause.clauseId, number: index + 1, text: clause.text })),
      changes: clauseChanges(current.document.clauses, clauses),
    };
  }

  /**
   * 确认导入 (KB-003): the previewed clauses become the document's next version, issued by the house and chained to the
   * version it follows — refused when another version was imported meanwhile. The caller holds the transaction.
   */
  commit(previewId: string): void {
    requireGuideline(UUID_PATTERN.test(previewId), 'REVIEW_GUIDELINE_PREVIEW_INVALID', '导入预览标识无效。');
    const preview = this.#previews.get(previewId);
    requireGuideline(preview !== undefined, 'REVIEW_GUIDELINE_PREVIEW_EXPIRED', '这次导入的预览已经失效；请重新选择文件。');
    const builtin = builtinDocuments().find((entry) => entry.document.documentId === preview.documentId)!.document;
    const current = this.#current(builtin);
    requireGuideline(current.digest === preview.previousSha256 && this.#versions(builtin).length + 2 === preview.ordinal,
      'REVIEW_GUIDELINE_MOVED', '这份审阅规范文件在预览之后又有了新版本；请重新选择文件。');
    const versionId = randomUUID();
    const recordedAt = new Date().toISOString();
    const record = canonicalRecord({
      schema: RECORD_SCHEMA,
      versionId,
      documentId: preview.documentId,
      ordinal: preview.ordinal,
      title: builtin.title,
      issuer: HOUSE_GUIDELINE_ISSUER,
      clauses: preview.clauses,
      source: preview.source,
      previousSha256: preview.previousSha256,
      recordedAt,
    });
    this.#db.prepare(
      'INSERT INTO review_guideline_versions(version_id, document_id, ordinal, previous_sha256, recorded_at, canonical_json, sha256) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ).run(versionId, preview.documentId, preview.ordinal, preview.previousSha256, recordedAt, record.json, record.digest);
    this.#previews.delete(previewId);
  }

  /** What each Review Run's snapshot applied: every guideline document of its categories, at the version it used. */
  #runReadings(): RunReading[] {
    const rows = this.#db.prepare(
      `SELECT r.review_run_id, r.book_id, r.ordinal, r.created_at, r.canonical_json, b.title
       FROM review_runs r JOIN books b ON b.book_id = r.book_id
       ORDER BY r.created_at, r.review_run_id`,
    ).all() as SqlRow[];
    return rows.map((row) => {
      const snapshot = JSON.parse(String(row.canonical_json)) as unknown;
      const documents = new Map<string, { version: number; categoryIds: string[] }>();
      const categories = isRecord(snapshot) && Array.isArray(snapshot.categories) ? snapshot.categories : [];
      for (const category of categories) {
        if (!isRecord(category) || !isRecord(category.entry) || !Array.isArray(category.entry.guidelineDocuments)) continue;
        for (const document of category.entry.guidelineDocuments) {
          if (!isRecord(document) || typeof document.documentId !== 'string') continue;
          const version = Number(document.version);
          const known = documents.get(document.documentId) ?? { version, categoryIds: [] };
          known.categoryIds.push(String(category.categoryId));
          documents.set(document.documentId, known);
        }
      }
      return {
        reviewRunId: String(row.review_run_id),
        bookId: String(row.book_id),
        bookTitle: String(row.title),
        ordinal: integer(row.ordinal),
        createdAt: String(row.created_at),
        documents,
      };
    });
  }

  /**
   * 知识库 › 审阅规范文件 (KB-001 to KB-003): each document with its current version and the categories that apply it; its
   * clauses, each with how many findings of the Runs that applied this version cite it; every version with the Review
   * Runs that used it; and the Books whose latest Review Run applying it used an older version.
   */
  projection(): ReviewGuidelinesProjection {
    const runs = this.#runReadings();
    const citations = this.#db.prepare(
      `SELECT review_run_id, category_id, clause_ref, finding_id FROM review_findings WHERE clause_ref IS NOT NULL`,
    ).all() as SqlRow[];
    const documents: ReviewGuidelineDocumentProjection[] = builtinDocuments().map(({ document: builtin, appliedBy }) => {
      const stored = this.#versions(builtin);
      const current = this.#current(builtin);
      const currentOrdinal = Number(current.document.version);
      const usedBy = (ordinal: number) => runs
        .filter((run) => run.documents.get(builtin.documentId)?.version === ordinal)
        .map((run) => ({ bookId: run.bookId, bookTitle: run.bookTitle, reviewRunId: run.reviewRunId, reviewOrdinal: run.ordinal, createdAt: run.createdAt }));
      // A finding cites a clause of the version its Run applied; the same finding found again by a later Run counts once.
      const citing = new Map<string, Set<string>>();
      for (const row of citations) {
        const run = runs.find((candidate) => candidate.reviewRunId === String(row.review_run_id));
        const applied = run?.documents.get(builtin.documentId);
        if (applied === undefined || applied.version !== currentOrdinal || !applied.categoryIds.includes(String(row.category_id))) continue;
        const clauseId = String(row.clause_ref);
        const findings = citing.get(clauseId) ?? new Set<string>();
        findings.add(String(row.finding_id));
        citing.set(clauseId, findings);
      }
      const versions: ReviewGuidelineVersionProjection[] = [
        {
          ordinal: 1,
          issuer: builtin.issuer,
          versionId: null,
          recordedAt: null,
          source: null,
          clauseCount: builtin.clauses.length,
          digest: builtinDigest(builtin),
          usedBy: usedBy(1),
        },
        ...stored.map((version) => ({
          ordinal: version.ordinal,
          issuer: version.issuer,
          versionId: version.versionId,
          recordedAt: version.recordedAt,
          source: version.source,
          clauseCount: version.clauses.length,
          digest: version.sha256,
          usedBy: usedBy(version.ordinal),
        })),
      ].reverse();
      // A Book's latest Review Run that applied this document names the version it still reads under.
      const latestByBook = new Map<string, RunReading>();
      for (const run of runs) {
        if (!run.documents.has(builtin.documentId)) continue;
        const known = latestByBook.get(run.bookId);
        if (known === undefined || run.ordinal > known.ordinal) latestByBook.set(run.bookId, run);
      }
      const olderVersionBooks = Array.from(latestByBook.values())
        .filter((run) => run.documents.get(builtin.documentId)!.version < currentOrdinal)
        .map((run) => ({ bookId: run.bookId, bookTitle: run.bookTitle, ordinal: run.documents.get(builtin.documentId)!.version }))
        .sort((a, b) => (a.bookTitle < b.bookTitle ? -1 : a.bookTitle > b.bookTitle ? 1 : a.bookId < b.bookId ? -1 : 1));
      return {
        documentId: builtin.documentId,
        title: current.document.title,
        issuer: current.document.issuer,
        currentOrdinal,
        appliedBy,
        clauses: current.document.clauses.map((clause, index) => ({
          clauseId: clause.clauseId,
          number: index + 1,
          text: clause.text,
          citations: citing.get(clause.clauseId)?.size ?? 0,
        })),
        versions,
        olderVersionBooks,
      };
    });
    return { documents };
  }
}
