import { randomUUID } from 'node:crypto';
import { lstat, realpath } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import type { DatabaseSync, SQLOutputValue } from 'node:sqlite';
import {
  MAX_BOOK_DELIVERY_PACKAGE_EXPORT_FILES_LISTED,
  MAX_BOOK_DELIVERY_PACKAGE_EXPORTS_LISTED,
  MAX_EXPORT_DESTINATION_CODE_UNITS,
  type ApproveBookDeliveryPackageExportInput,
  type BookDeliveryPackageExportFileOutcomeProjection,
  type BookDeliveryPackageExportOptions,
  type BookDeliveryPackageExportProjection,
  type BookDeliveryPackageExportReviewFileProjection,
  type BookDeliveryPackageExportReviewProjection,
  type BookDeliveryPackageExportSummaryProjection,
  type ManuscriptExportFormat,
  type ManuscriptExportOptions,
  type ManuscriptExportReceiptProjection,
  type PrepareBookDeliveryPackageExportInput,
  type ReviewBookDeliveryPackageExportInput,
} from '../shared/protocol.js';
import { reportExportLabel } from '../shared/report-wording.js';
import { DIGEST_PATTERN, UUID_PATTERN, canonicalRecord, isRecord, parseCanonicalJson, sha256Hex } from './analysis/canonical.js';
import { BOOK_DELIVERY_PACKAGE_STATEMENT, BOOK_DELIVERY_PACKAGE_WORDS, type PackageVersionRecord } from './book-delivery-packages.js';
import { ExportLedgerError, type ExportTargetInput, type ManuscriptExportStore, type PackageManifest } from './manuscript-export.js';
import { productionDocumentType } from './production-document-types.js';

/**
 * 图书交付包's export (Issue #416, plan slice S67b; V2-UX-BUNDLE-004, DPKG-011, DPKG-013, DPKG-014, EXP-010 to EXP-022). One
 * frozen package version is written into a folder the editor chooses: the Publication Version's revision, the delivered
 * version of every included Production Document and every review report, each as DOCX, and the package's own 交付包清单
 * in Markdown. Every file is an ordinary export of S64's ledger — its preparation, its approval and its receipt — so it is
 * atomic on its own, receipted on its own, and never retried by itself. The package never changes: an export is linked to
 * the exact version it wrote, and a changed folder or a second export is a new export, never a new package version.
 *
 * `导出…` reviews every file as S64 reviews one — how it is written, what its format keeps, each class's fidelity — under
 * 含批注 and 含修改建议 as the editor leaves them, and 备注 never go. Choosing the folder prepares: one preparation per file
 * at its place in the folder, recorded with the export that links them. A folder already holding any of the file names is
 * refused, so an export never replaces a file and never asks the platform's conflict dialog. `按上述方式导出` checks every
 * file before it writes the first — a set that drifted is refused whole and writes nothing — then approves and writes each
 * in turn; a file that fails or cannot be confirmed during the writes stops the rest, which stay unwritten.
 *
 * Schema revision 41 owns two relations, ledgers like the others: a row is appended once and never rewritten or removed.
 */
export const BOOK_DELIVERY_PACKAGE_EXPORT_SCHEMA_SQL = {
  book_delivery_package_exports: `CREATE TABLE book_delivery_package_exports (
  export_id TEXT PRIMARY KEY,
  package_version_id TEXT NOT NULL REFERENCES book_delivery_package_versions(package_version_id),
  book_id TEXT NOT NULL REFERENCES books(book_id),
  folder TEXT NOT NULL CHECK(length(folder) BETWEEN 1 AND 1024),
  file_count INTEGER NOT NULL CHECK(file_count >= 1),
  review_digest TEXT NOT NULL CHECK(length(review_digest) = 64),
  actor TEXT NOT NULL CHECK(actor = '本机编辑'),
  created_at TEXT NOT NULL,
  canonical_json TEXT NOT NULL,
  sha256 TEXT NOT NULL UNIQUE CHECK(length(sha256) = 64)
) STRICT`,
  book_delivery_package_export_files: `CREATE TABLE book_delivery_package_export_files (
  export_id TEXT NOT NULL REFERENCES book_delivery_package_exports(export_id),
  position INTEGER NOT NULL CHECK(position >= 1),
  item_key TEXT NOT NULL CHECK(length(item_key) BETWEEN 1 AND 80),
  label TEXT NOT NULL CHECK(length(label) BETWEEN 1 AND 400),
  preparation_id TEXT NOT NULL UNIQUE REFERENCES export_preparations(preparation_id),
  canonical_json TEXT NOT NULL,
  sha256 TEXT NOT NULL UNIQUE CHECK(length(sha256) = 64),
  PRIMARY KEY(export_id, position)
) STRICT`,
} as const;

export const BOOK_DELIVERY_PACKAGE_EXPORT_TRIGGER_SQL: Readonly<Record<string, string>> = Object.fromEntries(
  Object.keys(BOOK_DELIVERY_PACKAGE_EXPORT_SCHEMA_SQL).flatMap((table) => [
    [`${table}_no_update`, `CREATE TRIGGER ${table}_no_update
    BEFORE UPDATE ON ${table}
    BEGIN
      SELECT RAISE(ABORT, 'BOOK_DELIVERY_PACKAGE_EXPORT_LEDGER_IMMUTABLE');
    END`],
    [`${table}_no_delete`, `CREATE TRIGGER ${table}_no_delete
    BEFORE DELETE ON ${table}
    BEGIN
      SELECT RAISE(ABORT, 'BOOK_DELIVERY_PACKAGE_EXPORT_LEDGER_IMMUTABLE');
    END`],
  ]),
);

export const BOOK_DELIVERY_PACKAGE_EXPORT_FOREIGN_KEYS: Readonly<Record<string, ReadonlyArray<string>>> = {
  book_delivery_package_exports: [
    'book_id>books.book_id:NO ACTION/NO ACTION/NONE',
    'package_version_id>book_delivery_package_versions.package_version_id:NO ACTION/NO ACTION/NONE',
  ],
  book_delivery_package_export_files: [
    'export_id>book_delivery_package_exports.export_id:NO ACTION/NO ACTION/NONE',
    'preparation_id>export_preparations.preparation_id:NO ACTION/NO ACTION/NONE',
  ],
};

export class BookDeliveryPackageExportError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'BookDeliveryPackageExportError';
  }
}

function requirePackageExport(condition: unknown, code: string, message: string): asserts condition {
  if (!condition) throw new BookDeliveryPackageExportError(code, message);
}

/** Revision 41's relations, created once: a store that predates them gains two empty relations and nothing existing moves. */
export function initializeBookDeliveryPackageExportSchema(db: DatabaseSync): void {
  if (db.prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'book_delivery_package_exports'").get() !== undefined) return;
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const sql of Object.values(BOOK_DELIVERY_PACKAGE_EXPORT_SCHEMA_SQL)) db.exec(sql);
    for (const sql of Object.values(BOOK_DELIVERY_PACKAGE_EXPORT_TRIGGER_SQL)) db.exec(sql);
    db.exec('COMMIT');
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch (rollbackError) {
      throw new AggregateError([error, rollbackError], 'Book delivery package export schema rollback failed.');
    }
    throw error;
  }
  requirePackageExport(db.prepare('PRAGMA foreign_key_check').all().length === 0, 'SCHEMA_INVALID', '图书交付包导出的关系与已有记录不一致。');
}

// ---- words ----------------------------------------------------------------------------------------------------

/** EXP-014 and EXP-015: where the files go, and that nothing is sent. */
export const BOOK_DELIVERY_PACKAGE_EXPORT_STATEMENT =
  '导出只把这些文件写到你选择的文件夹：每个文件都有自己的导出记录，交付包本身不变；AI7 不会发送任何文件。';
export const BOOK_DELIVERY_PACKAGE_EXPORT_WORDS = {
  manifest: '交付包清单',
  prepared: '已准备',
  notWritten: '未写入',
} as const;

/** What an export came to in one line: prepared, every file written, or how many files came to what. */
export function bookDeliveryPackageExportSummary(outcomes: ReadonlyArray<BookDeliveryPackageExportFileOutcomeProjection['outcome']>): string {
  const count = (outcome: BookDeliveryPackageExportFileOutcomeProjection['outcome']): number => outcomes.filter((entry) => entry === outcome).length;
  if (count('prepared') === outcomes.length) return `已准备，尚未导出 · ${outcomes.length} 个文件`;
  if (count('created') === outcomes.length) return `已导出到所选位置 · ${outcomes.length} 个文件`;
  const parts: string[] = [];
  if (count('created') > 0) parts.push(`已导出 ${count('created')} 个文件`);
  if (count('failed') > 0) parts.push(`${count('failed')} 个未能导出`);
  if (count('ambiguous') > 0) parts.push(`${count('ambiguous')} 个结果待确认`);
  if (count('not-written') > 0) parts.push(`${parts.length > 0 ? '其余 ' : ''}${count('not-written')} 个没有写入`);
  return parts.join('，');
}

type SqlRow = Record<string, SQLOutputValue>;

const text = (value: SQLOutputValue | undefined): string => {
  requirePackageExport(typeof value === 'string', 'BOOK_DELIVERY_PACKAGE_EXPORT_RECORD_INVALID', '图书交付包导出记录无效。');
  return value;
};
const integer = (value: SQLOutputValue | undefined): number => {
  requirePackageExport(typeof value === 'number' && Number.isSafeInteger(value), 'BOOK_DELIVERY_PACKAGE_EXPORT_RECORD_INVALID', '图书交付包导出记录无效。');
  return value;
};

const EXPORT_SCHEMA = 'ai7.book-delivery-package-export/1';
const FILE_SCHEMA = 'ai7.book-delivery-package-export-file/1';
const REVIEW_SCHEMA = 'ai7.book-delivery-package-export-review/1';
const INVALID_FILE_NAME_CHARACTERS = /[\\/:*?"<>|\u0000-\u001F]/gu;

/** What the package owner hands its export: a version's record, verified. */
export interface BookDeliveryPackageExportSources {
  record(bookId: string, packageVersionId: string): { record: PackageVersionRecord; digest: string } | null;
}

/** One file of a version's export as the review planned it. */
interface PlannedFile extends BookDeliveryPackageExportReviewFileProjection {
  target: ExportTargetInput;
  revisionId: string;
  reviewDigest: string;
}

/** The options each file is written under: the editor's two switches, and never 备注 (the package leaves them out). */
function requirePackageOptions(value: unknown): ManuscriptExportOptions {
  requirePackageExport(isRecord(value) && Object.keys(value).length === 2 && typeof value.includeAnnotations === 'boolean' &&
    typeof value.includeSuggestions === 'boolean', 'BOOK_DELIVERY_PACKAGE_EXPORT_INVALID', '图书交付包导出请求无效。');
  return { includeAnnotations: value.includeAnnotations, includeSuggestions: value.includeSuggestions, includeEditorNotes: false };
}

/** A refusal before anything was written names the file that drifted, and says nothing was written. */
function driftLine(fileName: string, code: string, message: string): string {
  if (code === 'EXPORT_PAYLOAD_CHANGED') return `「${fileName}」的内容在准备导出后有了变化，没有写入任何文件。请重新查看导出。`;
  if (code === 'EXPORT_TARGET_CHANGED' || code === 'EXPORT_TARGET_UNREADABLE') {
    return `所选文件夹在准备导出后有了变化，「${fileName}」已不能按准备的方式写入，没有写入任何文件。请重新选择位置。`;
  }
  return message;
}
const DRIFT_CODES: ReadonlySet<string> = new Set(['EXPORT_PAYLOAD_CHANGED', 'EXPORT_TARGET_CHANGED', 'EXPORT_TARGET_UNREADABLE']);

export class BookDeliveryPackageExports {
  readonly #db: DatabaseSync;
  readonly #exports: ManuscriptExportStore;
  readonly #sources: BookDeliveryPackageExportSources;

  constructor(db: DatabaseSync, exports: ManuscriptExportStore, sources: BookDeliveryPackageExportSources) {
    this.#db = db;
    this.#exports = exports;
    this.#sources = sources;
  }

  /** `导出…` of one package version: the files it writes, each reviewed as S64 reviews a file (EXP-007 to EXP-010). */
  async review(input: ReviewBookDeliveryPackageExportInput, available: boolean): Promise<BookDeliveryPackageExportReviewProjection> {
    requirePackageExport(isRecord(input) && typeof input.bookId === 'string' && UUID_PATTERN.test(input.bookId) &&
      typeof input.packageVersionId === 'string' && UUID_PATTERN.test(input.packageVersionId),
    'BOOK_DELIVERY_PACKAGE_EXPORT_INVALID', '图书交付包导出请求无效。');
    const options = requirePackageOptions(input.options);
    const { versionLabel, files, reviewDigest } = await this.#plan(input.bookId, input.packageVersionId, options, available);
    return {
      bookId: input.bookId,
      packageVersionId: input.packageVersionId,
      versionLabel,
      options: { includeAnnotations: options.includeAnnotations, includeSuggestions: options.includeSuggestions },
      files: files.slice(0, MAX_BOOK_DELIVERY_PACKAGE_EXPORT_FILES_LISTED).map((file) => ({
        key: file.key,
        label: file.label,
        fileName: file.fileName,
        format: file.format,
        restoration: file.restoration,
        restorationLine: file.restorationLine,
        formatLine: file.formatLine,
        fidelity: file.fidelity,
        degraded: file.degraded,
      })),
      filesTruncated: files.length > MAX_BOOK_DELIVERY_PACKAGE_EXPORT_FILES_LISTED,
      degraded: files.some((file) => file.degraded),
      statement: BOOK_DELIVERY_PACKAGE_EXPORT_STATEMENT,
      reviewDigest,
    };
  }

  /**
   * The folder the system dialog returned (EXP-010): the review must still be exactly the one the editor read, and the
   * folder must hold none of the file names. Every file's preparation is recorded, then the export that links them.
   */
  async prepare(input: PrepareBookDeliveryPackageExportInput, available: boolean): Promise<BookDeliveryPackageExportProjection> {
    requirePackageExport(isRecord(input) && typeof input.bookId === 'string' && UUID_PATTERN.test(input.bookId) &&
      typeof input.packageVersionId === 'string' && UUID_PATTERN.test(input.packageVersionId) &&
      typeof input.reviewDigest === 'string' && DIGEST_PATTERN.test(input.reviewDigest),
    'BOOK_DELIVERY_PACKAGE_EXPORT_INVALID', '图书交付包导出请求无效。');
    const options = requirePackageOptions(input.options);
    const folder = await requireFolder(input.folder);
    const plan = await this.#plan(input.bookId, input.packageVersionId, options, available);
    requirePackageExport(plan.reviewDigest === input.reviewDigest, 'BOOK_DELIVERY_PACKAGE_EXPORT_CHANGED',
      '要导出的文件在查看后有了变化，请重新查看导出。');
    for (const file of plan.files) {
      requirePackageExport(!(await exists(join(folder, file.fileName))), 'BOOK_DELIVERY_PACKAGE_EXPORT_FOLDER_TAKEN',
        `所选文件夹里已有「${file.fileName}」。请选择一个空文件夹，或在对话框里新建一个。`);
    }
    const preparations: string[] = [];
    for (const file of plan.files) {
      const preparation = await this.#exports.preparePackageFile({
        bookId: input.bookId,
        target: file.target,
        format: file.format,
        options,
        revisionId: file.revisionId,
        reviewDigest: file.reviewDigest,
        destination: join(folder, file.fileName),
      }, available);
      preparations.push(preparation.preparationId);
    }
    const exportId = randomUUID();
    const createdAt = new Date().toISOString();
    const record = canonicalRecord({
      schema: EXPORT_SCHEMA,
      exportId,
      packageVersionId: input.packageVersionId,
      bookId: input.bookId,
      folder,
      fileCount: plan.files.length,
      reviewDigest: plan.reviewDigest,
      actor: '本机编辑',
      createdAt,
    });
    this.#transaction(() => {
      this.#db.prepare(
        `INSERT INTO book_delivery_package_exports(
           export_id, package_version_id, book_id, folder, file_count, review_digest, actor, created_at, canonical_json, sha256
         ) VALUES (?, ?, ?, ?, ?, ?, '本机编辑', ?, ?, ?)`,
      ).run(exportId, input.packageVersionId, input.bookId, folder, plan.files.length, plan.reviewDigest, createdAt, record.json, record.digest);
      const insert = this.#db.prepare(
        `INSERT INTO book_delivery_package_export_files(export_id, position, item_key, label, preparation_id, canonical_json, sha256)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      );
      plan.files.forEach((file, index) => {
        const fileRecord = canonicalRecord({
          schema: FILE_SCHEMA, exportId, position: index + 1, key: file.key, label: file.label, preparationId: preparations[index]!,
        });
        insert.run(exportId, index + 1, file.key, file.label, preparations[index]!, fileRecord.json, fileRecord.digest);
      });
    });
    return this.#projection(input.bookId, exportId);
  }

  /**
   * `按上述方式导出`: each file approved and written in turn by S64's own approval, with its receipt (EXP-012, EXP-013). A
   * file that fails or cannot be confirmed stops the rest (EXP-021): they stay unwritten, and nothing retries by itself. An
   * export already approved answers with what it came to — never a second write.
   */
  async approve(input: ApproveBookDeliveryPackageExportInput, available: boolean): Promise<BookDeliveryPackageExportProjection> {
    requirePackageExport(isRecord(input) && typeof input.bookId === 'string' && UUID_PATTERN.test(input.bookId) &&
      typeof input.exportId === 'string' && UUID_PATTERN.test(input.exportId),
    'BOOK_DELIVERY_PACKAGE_EXPORT_INVALID', '图书交付包导出请求无效。');
    const files = this.#files(input.bookId, input.exportId);
    if (files.some((file) => this.#exports.approvedReceipt(input.bookId, file.preparationId) !== null)) {
      return this.#projection(input.bookId, input.exportId);
    }
    // Every file is checked before the first is written (External Export Policy v2, multi-file): a set that drifted since
    // the folder was chosen — a file whose content moved, a name taken in the folder — is refused whole, nothing is
    // written, and the export stays as prepared. Only a failure during the writes stops the rest.
    for (const file of files) {
      try {
        await this.#exports.checkPrepared(input.bookId, file.preparationId, available);
      } catch (error) {
        if (!(error instanceof ExportLedgerError) || !DRIFT_CODES.has(error.code)) throw error;
        const { fileName } = this.#exports.preparationOf(input.bookId, file.preparationId);
        throw new BookDeliveryPackageExportError(error.code, driftLine(fileName, error.code, error.message));
      }
    }
    let written = 0;
    let stopped: BookDeliveryPackageExportProjection['stopped'] = null;
    for (const file of files) {
      try {
        const receipt = await this.#exports.approve({ bookId: input.bookId, preparationId: file.preparationId }, available);
        if (receipt.outcome !== 'created') {
          // Failed, or written with no confirmation: the receipt says which, and nothing after it is tried (EXP-021).
          stopped = { fileName: receipt.fileName, reason: receipt.detail };
          break;
        }
        written += 1;
      } catch (error) {
        // Refused before anything was written: the export stays prepared, and the refusal is the answer. Refused after
        // files were written — a file put in the folder while the others were written, say — the written ones stand, and
        // the answer says which file stopped the rest and why.
        if (!(error instanceof ExportLedgerError) || written === 0) throw error;
        stopped = { fileName: this.#exports.preparationOf(input.bookId, file.preparationId).fileName, reason: error.message };
        break;
      }
    }
    return { ...this.#projection(input.bookId, input.exportId), stopped };
  }

  /**
   * A version's Package Export History (DPKG-011): its exports newest first, as far as they are listed, and how many there
   * were. A folder chosen and never approved wrote nothing and is no export.
   */
  history(bookId: string, packageVersionId: string): { exports: BookDeliveryPackageExportSummaryProjection[]; total: number } {
    const rows = this.#db.prepare(
      'SELECT export_id FROM book_delivery_package_exports WHERE book_id = ? AND package_version_id = ? ORDER BY created_at DESC, rowid DESC',
    ).iterate(bookId, packageVersionId);
    let total = 0;
    const exports: BookDeliveryPackageExportSummaryProjection[] = [];
    for (const row of rows) {
      const exportId = text(row.export_id);
      const files = this.#files(bookId, exportId);
      const receipts = files.map((file) => this.#exports.approvedReceipt(bookId, file.preparationId));
      if (receipts.every((receipt) => receipt === null)) continue;
      total += 1;
      if (exports.length >= MAX_BOOK_DELIVERY_PACKAGE_EXPORTS_LISTED) continue;
      const projection = this.#projection(bookId, exportId);
      const recorded = receipts.flatMap((receipt) => (receipt === null || receipt.recordedAt === null ? [] : [receipt.recordedAt])).sort();
      exports.push({
        exportId,
        folder: projection.folder,
        state: projection.state === 'exported' ? 'exported' : 'incomplete',
        summary: projection.summary,
        exportedAt: recorded.at(-1) ?? projection.createdAt,
        fileCount: files.length,
        revealPreparationId: receipts.find((receipt) => receipt?.revealAvailable === true)?.preparationId ?? null,
      });
    }
    return { exports, total };
  }

  /**
   * One version's 交付包清单 (D2): what it holds, each document's Delivery Records, what it leaves out and why, in the words
   * of the package itself. It is written from the version's record alone, so its words never change.
   */
  manifest(bookId: string, packageVersionId: string): PackageManifest | null {
    const found = this.#sources.record(bookId, packageVersionId);
    if (found === null) return null;
    const { record } = found;
    const { versionLabel, revisionId } = versionOf(record);
    const book = this.#db.prepare('SELECT title FROM books WHERE book_id = ?').get(bookId) as SqlRow | undefined;
    requirePackageExport(book !== undefined, 'BOOK_NOT_FOUND', '图书不存在。');
    const lines: string[] = [
      `# ${text(book.title)} · 图书交付包 v${record.version}`,
      '',
      `- 用途：${record.purpose}`,
      `- 准备于：${record.preparedAt}`,
      `- 内容摘要：${record.contentDigest}`,
      '',
      '## 包含',
      '',
    ];
    const publication = record.content.publication;
    if (publication !== null) {
      lines.push(`- 稿件 · 发稿版本「${publication.milestoneLabel}」 · ${publication.revisionLabel}（发稿范围：${publication.scope}）`);
    }
    const deliveries: string[] = [];
    for (const entry of record.content.documents) {
      if (entry.disposition !== 'included') continue;
      const typeLabel = productionDocumentType(entry.typeId)?.label ?? entry.typeId;
      lines.push(`- ${typeLabel} · 版本 ${entry.version}`);
      deliveries.push('', `### ${typeLabel}`, '');
      for (const deliveryId of entry.deliveryIds) {
        const row = this.#db.prepare(
          'SELECT ordinal, version, recipient_label, note, recorded_at FROM production_document_deliveries WHERE delivery_id = ? AND book_id = ?',
        ).get(deliveryId, bookId) as SqlRow | undefined;
        requirePackageExport(row !== undefined, 'BOOK_DELIVERY_PACKAGE_EXPORT_RECORD_INVALID', '交付包记下的交付记录不存在。');
        const note = row.note === null ? '' : `（备注：${text(row.note)}）`;
        deliveries.push(`- 第 ${integer(row.ordinal)} 次交付 · ${text(row.recipient_label)} · 版本 ${integer(row.version)} · ${text(row.recorded_at)}${note}`);
      }
    }
    for (const report of record.content.reviewReports) {
      lines.push(`- ${reportExportLabel(this.#runLabel(report.reportId), report.version)}`);
    }
    if (deliveries.length > 0) lines.push('', '## 交付记录', ...deliveries);
    const notForThisBook = record.content.documents
      .filter((entry) => entry.disposition === 'not-for-this-book')
      .map((entry) => productionDocumentType(entry.typeId)?.label ?? entry.typeId);
    lines.push(
      '',
      '## 不包含',
      '',
      `- ${BOOK_DELIVERY_PACKAGE_WORDS.editorNotes}：${BOOK_DELIVERY_PACKAGE_WORDS.editorNotesDetail}`,
      `- ${BOOK_DELIVERY_PACKAGE_WORDS.libraryOriginals}`,
      `- ${BOOK_DELIVERY_PACKAGE_WORDS.intermediateRevisions}：${BOOK_DELIVERY_PACKAGE_WORDS.intermediateRevisionsDetail}`,
      ...(notForThisBook.length === 0 ? [] : [`- ${BOOK_DELIVERY_PACKAGE_WORDS.notForThisBook}：${notForThisBook.join('、')}`]),
      '',
      '## 说明',
      '',
      ...record.content.limitations.map((limitation) => `- ${limitation}`),
      `- ${BOOK_DELIVERY_PACKAGE_STATEMENT}`,
      '',
    );
    const markdown = lines.join('\n');
    return { versionLabel, markdown, digest: sha256Hex(markdown), revisionId };
  }

  /** One version's label and the revision its 发稿版本 names, from its frozen record alone: an export's files read by it. */
  version(bookId: string, packageVersionId: string): { versionLabel: string; revisionId: string } | null {
    const found = this.#sources.record(bookId, packageVersionId);
    return found === null ? null : versionOf(found.record);
  }

  // ---- reading ------------------------------------------------------------------------------------------------

  /** The files a version writes, in order, each reviewed under the options chosen; and the digest that binds them. */
  async #plan(
    bookId: string,
    packageVersionId: string,
    options: ManuscriptExportOptions,
    available: boolean,
  ): Promise<{ versionLabel: string; files: PlannedFile[]; reviewDigest: string }> {
    const found = this.#sources.record(bookId, packageVersionId);
    requirePackageExport(found !== null, 'BOOK_DELIVERY_PACKAGE_EXPORT_NOT_FOUND', '所选交付包版本不属于这本书。');
    const { record } = found;
    requirePackageExport(record.content.publication !== null, 'BOOK_DELIVERY_PACKAGE_EXPORT_NOT_FOUND', '这一版交付包没有发稿版本。');
    const planned: Array<{ key: string; target: ExportTargetInput; format: ManuscriptExportFormat }> = [
      { key: 'publication', target: { kind: 'milestone', milestoneId: record.content.publication.milestoneId }, format: 'docx' },
      ...record.content.documents.flatMap((entry) => (entry.disposition === 'included'
        ? [{ key: `document:${entry.typeId}`, target: { kind: 'document' as const, documentId: entry.documentId, revisionId: entry.revisionId }, format: 'docx' as const }]
        : [])),
      ...record.content.reviewReports.map((report) => ({ key: `report:${report.reportId}`, target: { kind: 'report' as const, reportId: report.reportId }, format: 'docx' as const })),
      { key: 'manifest', target: { kind: 'package-manifest', packageVersionId }, format: 'markdown' },
    ];
    const taken = new Set<string>();
    const files: PlannedFile[] = [];
    for (const item of planned) {
      const review = await this.#exports.reviewPackageFile(bookId, item.target, item.format, options, available);
      // A report is written from the version the package froze: another version of it is another package.
      if (review.target.report !== null) {
        const frozen = record.content.reviewReports.find((report) => report.reportId === review.target.report!.reportId);
        requirePackageExport(frozen !== undefined && frozen.version === review.target.report.version, 'BOOK_DELIVERY_PACKAGE_EXPORT_CHANGED',
          '交付包记下的审阅报告已不是这一版，请重新查看导出。');
      }
      files.push({
        key: item.key,
        label: labelOf(review.target, item.key),
        fileName: uniqueName(review.suggestedFileName, taken),
        format: item.format,
        restoration: review.restoration,
        restorationLine: review.restorationLine,
        formatLine: review.formatLine,
        fidelity: review.fidelity,
        degraded: review.degraded,
        target: item.target,
        revisionId: review.target.revisionId,
        reviewDigest: review.reviewDigest,
      });
    }
    const reviewDigest = canonicalRecord({
      schema: REVIEW_SCHEMA,
      bookId,
      packageVersionId,
      options,
      files: files.map((file) => ({ key: file.key, fileName: file.fileName, format: file.format, revisionId: file.revisionId, reviewDigest: file.reviewDigest })),
    }).digest;
    return { versionLabel: `v${record.version}`, files, reviewDigest };
  }

  #files(bookId: string, exportId: string): Array<{ position: number; key: string; label: string; preparationId: string }> {
    const exportRow = this.#db.prepare('SELECT * FROM book_delivery_package_exports WHERE export_id = ? AND book_id = ?').get(exportId, bookId) as SqlRow | undefined;
    requirePackageExport(exportRow !== undefined, 'BOOK_DELIVERY_PACKAGE_EXPORT_NOT_FOUND', '这次导出不属于这本书。');
    requirePackageExport(sha256Hex(text(exportRow.canonical_json)) === text(exportRow.sha256), 'BOOK_DELIVERY_PACKAGE_EXPORT_RECORD_INVALID',
      '图书交付包导出记录与其摘要不一致。');
    const rows = this.#db.prepare('SELECT * FROM book_delivery_package_export_files WHERE export_id = ? ORDER BY position').all(exportId) as SqlRow[];
    requirePackageExport(rows.length === integer(exportRow.file_count), 'BOOK_DELIVERY_PACKAGE_EXPORT_RECORD_INVALID', '图书交付包导出记录不完整。');
    return rows.map((row, index) => {
      const file = { position: integer(row.position), key: text(row.item_key), label: text(row.label), preparationId: text(row.preparation_id) };
      const expected = canonicalRecord({ schema: FILE_SCHEMA, exportId, position: file.position, key: file.key, label: file.label, preparationId: file.preparationId });
      requirePackageExport(file.position === index + 1 && expected.json === text(row.canonical_json) && expected.digest === text(row.sha256),
        'BOOK_DELIVERY_PACKAGE_EXPORT_RECORD_INVALID', '图书交付包导出记录与其内容不一致。');
      return file;
    });
  }

  /** An export as its records stand: each file prepared, written, stopped, or left unwritten after one that stopped. */
  #projection(bookId: string, exportId: string): BookDeliveryPackageExportProjection {
    const row = this.#db.prepare('SELECT * FROM book_delivery_package_exports WHERE export_id = ? AND book_id = ?').get(exportId, bookId) as SqlRow | undefined;
    requirePackageExport(row !== undefined, 'BOOK_DELIVERY_PACKAGE_EXPORT_NOT_FOUND', '这次导出不属于这本书。');
    const files = this.#files(bookId, exportId);
    const receipts = files.map((file) => this.#exports.approvedReceipt(bookId, file.preparationId));
    const approved = receipts.some((receipt) => receipt !== null);
    const outcomes: BookDeliveryPackageExportFileOutcomeProjection[] = files.map((file, index) => {
      const receipt = receipts[index]!;
      const preparation = this.#exports.preparationOf(bookId, file.preparationId);
      return {
        key: file.key,
        label: file.label,
        fileName: preparation.fileName,
        format: preparation.format,
        preparationId: file.preparationId,
        ...(receipt === null
          ? approved
            ? { outcome: 'not-written' as const, outcomeLabel: BOOK_DELIVERY_PACKAGE_EXPORT_WORDS.notWritten, revealAvailable: false }
            : { outcome: 'prepared' as const, outcomeLabel: BOOK_DELIVERY_PACKAGE_EXPORT_WORDS.prepared, revealAvailable: false }
          : { outcome: outcomeOf(receipt), outcomeLabel: receipt.outcomeLabel, revealAvailable: receipt.revealAvailable }),
      };
    });
    const written = outcomes.filter((file) => file.outcome === 'created').length;
    const state = !approved ? 'prepared' : written === outcomes.length ? 'exported' : 'incomplete';
    const summary = bookDeliveryPackageExportSummary(outcomes.map((file) => file.outcome));
    const record = this.#sources.record(bookId, text(row.package_version_id));
    requirePackageExport(record !== null, 'BOOK_DELIVERY_PACKAGE_EXPORT_RECORD_INVALID', '导出所属的交付包版本不存在。');
    return {
      exportId,
      packageVersionId: text(row.package_version_id),
      versionLabel: `v${record.record.version}`,
      folder: text(row.folder),
      state,
      summary,
      createdAt: text(row.created_at),
      files: outcomes.slice(0, MAX_BOOK_DELIVERY_PACKAGE_EXPORT_FILES_LISTED),
      filesTruncated: outcomes.length > MAX_BOOK_DELIVERY_PACKAGE_EXPORT_FILES_LISTED,
      stopped: null,
    };
  }

  /** A report's Review Run's own words, from the report's record. */
  #runLabel(reportId: string): string {
    const row = this.#db.prepare('SELECT canonical_json, sha256 FROM review_reports WHERE report_id = ?').get(reportId) as SqlRow | undefined;
    requirePackageExport(row !== undefined && sha256Hex(text(row.canonical_json)) === text(row.sha256), 'BOOK_DELIVERY_PACKAGE_EXPORT_RECORD_INVALID',
      '交付包记下的审阅报告不存在。');
    const record = parseCanonicalJson(text(row.canonical_json));
    const run = isRecord(record) ? record.run : undefined;
    requirePackageExport(isRecord(run) && typeof run.label === 'string', 'BOOK_DELIVERY_PACKAGE_EXPORT_RECORD_INVALID', '审阅报告记录无效。');
    return run.label;
  }

  #transaction(body: () => void): void {
    this.#db.exec('BEGIN IMMEDIATE');
    try {
      body();
      this.#db.exec('COMMIT');
    } catch (error) {
      try { this.#db.exec('ROLLBACK'); } catch (rollbackError) {
        throw new AggregateError([error, rollbackError], 'Book delivery package export rollback failed.');
      }
      throw error;
    }
  }
}

/** A version's label and the revision its 发稿版本 names. */
function versionOf(record: PackageVersionRecord): { versionLabel: string; revisionId: string } {
  return { versionLabel: `v${record.version}`, revisionId: record.content.publication?.revisionId ?? '' };
}

/** What a file holds, in the editor's words, from the target its review resolved. */
function labelOf(target: BookDeliveryPackageExportReviewTarget, key: string): string {
  if (key === 'manifest') return BOOK_DELIVERY_PACKAGE_EXPORT_WORDS.manifest;
  if (target.report !== null) return reportExportLabel(target.report.runLabel, target.report.version);
  if (target.document !== null) return `${target.document.typeLabel} · ${target.document.versionLabel}`;
  return `稿件 · 发稿版本「${target.milestoneLabel ?? ''}」 · ${target.revisionLabel}`;
}

type BookDeliveryPackageExportReviewTarget = Awaited<ReturnType<ManuscriptExportStore['reviewPackageFile']>>['target'];

/** A file name no other file of the export has, however a platform folds case: ` (2)` before its extension when it would. */
function uniqueName(name: string, taken: Set<string>): string {
  const safe = name.normalize('NFC').replace(INVALID_FILE_NAME_CHARACTERS, '_');
  const dot = safe.lastIndexOf('.');
  const stem = dot > 0 ? safe.slice(0, dot) : safe;
  const extension = dot > 0 ? safe.slice(dot) : '';
  let candidate = safe;
  for (let copy = 2; taken.has(candidate.toLowerCase()); copy += 1) candidate = `${stem} (${copy})${extension}`;
  taken.add(candidate.toLowerCase());
  return candidate;
}

function outcomeOf(receipt: ManuscriptExportReceiptProjection): BookDeliveryPackageExportFileOutcomeProjection['outcome'] {
  // A package export only creates files, so a receipt reads `created`, `failed` or `ambiguous`.
  return receipt.outcome === 'replaced' ? 'created' : receipt.outcome;
}

/** The folder the dialog returned: a folder that exists, outside nothing in particular — each file's own check does that. */
async function requireFolder(value: unknown): Promise<string> {
  requirePackageExport(typeof value === 'string' && value.isWellFormed() && value.length > 0 && value.length <= MAX_EXPORT_DESTINATION_CODE_UNITS &&
    !value.includes('\u0000') && isAbsolute(value), 'BOOK_DELIVERY_PACKAGE_EXPORT_FOLDER_INVALID', '所选文件夹无效。');
  try {
    const resolved = await realpath(value);
    requirePackageExport((await lstat(resolved)).isDirectory(), 'BOOK_DELIVERY_PACKAGE_EXPORT_FOLDER_INVALID', '所选位置不是文件夹。');
  } catch (error) {
    if (error instanceof BookDeliveryPackageExportError) throw error;
    throw new BookDeliveryPackageExportError('BOOK_DELIVERY_PACKAGE_EXPORT_FOLDER_INVALID', '所选文件夹无法访问。');
  }
  return value;
}

async function exists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (isRecord(error) && error.code === 'ENOENT') return false;
    throw new BookDeliveryPackageExportError('BOOK_DELIVERY_PACKAGE_EXPORT_FOLDER_INVALID', '所选文件夹无法访问。');
  }
}
