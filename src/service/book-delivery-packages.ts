import { randomUUID } from 'node:crypto';
import type { DatabaseSync, SQLOutputValue } from 'node:sqlite';
import {
  MAX_BOOK_DELIVERY_PACKAGE_PURPOSE_CHARACTERS,
  MAX_BOOK_DELIVERY_PACKAGE_REPORTS_LISTED,
  MAX_BOOK_DELIVERY_PACKAGE_VERSIONS_LISTED,
  PUBLICATION_CHANGE_NOTICE,
  publicationText,
  type BookDeliveryPackageConditionProjection,
  type BookDeliveryPackageContentProjection,
  type BookDeliveryPackageItemProjection,
  type BookDeliveryPackageProjection,
  type BookDeliveryPackageVersionProjection,
  type ReviewRunState,
} from '../shared/protocol.js';
import { reportExportLabel } from '../shared/report-wording.js';
import { UUID_PATTERN, canonicalRecord, sha256Hex } from './analysis/canonical.js';
import { BUILTIN_PRODUCTION_DOCUMENT_TYPES, BUILTIN_PRODUCTION_DOCUMENT_TYPES_DIGEST } from './production-document-types.js';

/**
 * 图书交付包 (Issue #416, plan slice S67a; V2-UX-BUNDLE-001 to 005, DPKG-001 to 015 as DPKG-015 binds them to the Book;
 * editor-surfaces §9; ADR 0077 §6). The Book-level total of its finished work: the Manuscript's Publication Version,
 * the latest delivered version of every Production Document not marked 本书不做, and the review reports, with each
 * document's Delivery Records. A condition table says what is still missing and where to go; `准备图书交付包` freezes
 * exactly the content the editor saw, with the purpose they wrote, as the package's next version — v1, v2 … — each
 * naming the one before it. Preparing chooses no destination, writes no file and changes no record: a package is
 * neither 发稿 nor 交付 and proves neither (BUNDLE-005, DPKG-010). Its export is S67b's.
 *
 * Schema revision 39 owns one relation, a ledger like the others: a version is appended once and never rewritten.
 */
export const BOOK_DELIVERY_PACKAGE_SCHEMA_SQL = {
  book_delivery_package_versions: `CREATE TABLE book_delivery_package_versions (
  package_version_id TEXT PRIMARY KEY,
  package_id TEXT NOT NULL CHECK(length(package_id) = 36),
  book_id TEXT NOT NULL REFERENCES books(book_id),
  version INTEGER NOT NULL CHECK(version >= 1),
  prior_version_id TEXT REFERENCES book_delivery_package_versions(package_version_id),
  purpose TEXT NOT NULL CHECK(length(purpose) BETWEEN 1 AND 80),
  publication_version_id TEXT NOT NULL REFERENCES publication_versions(publication_version_id),
  content_sha256 TEXT NOT NULL CHECK(length(content_sha256) = 64),
  actor TEXT NOT NULL CHECK(actor = '本机编辑'),
  prepared_at TEXT NOT NULL,
  canonical_json TEXT NOT NULL,
  sha256 TEXT NOT NULL UNIQUE CHECK(length(sha256) = 64),
  CHECK((version = 1) = (prior_version_id IS NULL)),
  UNIQUE(book_id, version),
  UNIQUE(package_id, version)
) STRICT`,
} as const;

export const BOOK_DELIVERY_PACKAGE_TRIGGER_SQL: Readonly<Record<string, string>> = Object.fromEntries(
  Object.keys(BOOK_DELIVERY_PACKAGE_SCHEMA_SQL).flatMap((table) => [
    [`${table}_no_update`, `CREATE TRIGGER ${table}_no_update
    BEFORE UPDATE ON ${table}
    BEGIN
      SELECT RAISE(ABORT, 'BOOK_DELIVERY_PACKAGE_LEDGER_IMMUTABLE');
    END`],
    [`${table}_no_delete`, `CREATE TRIGGER ${table}_no_delete
    BEFORE DELETE ON ${table}
    BEGIN
      SELECT RAISE(ABORT, 'BOOK_DELIVERY_PACKAGE_LEDGER_IMMUTABLE');
    END`],
  ]),
);

export const BOOK_DELIVERY_PACKAGE_FOREIGN_KEYS: Readonly<Record<string, ReadonlyArray<string>>> = {
  book_delivery_package_versions: [
    'book_id>books.book_id:NO ACTION/NO ACTION/NONE',
    'prior_version_id>book_delivery_package_versions.package_version_id:NO ACTION/NO ACTION/NONE',
    'publication_version_id>publication_versions.publication_version_id:NO ACTION/NO ACTION/NONE',
  ],
};

export class BookDeliveryPackageSchemaError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'BookDeliveryPackageSchemaError';
  }
}

/** Revision 39's relation, created once: a store that predates it gains one empty relation and nothing existing moves. */
export function initializeBookDeliveryPackageSchema(db: DatabaseSync): void {
  if (db.prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'book_delivery_package_versions'").get() !== undefined) return;
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const sql of Object.values(BOOK_DELIVERY_PACKAGE_SCHEMA_SQL)) db.exec(sql);
    for (const sql of Object.values(BOOK_DELIVERY_PACKAGE_TRIGGER_SQL)) db.exec(sql);
    db.exec('COMMIT');
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch (rollbackError) {
      throw new AggregateError([error, rollbackError], 'Book delivery package schema rollback failed.');
    }
    throw error;
  }
  if (db.prepare('PRAGMA foreign_key_check').all().length !== 0) {
    throw new BookDeliveryPackageSchemaError('SCHEMA_INVALID', '图书交付包的关系与已有记录不一致。');
  }
}

// ---- words ----------------------------------------------------------------------------------------------------

/** BUNDLE-005: what a package is and is not, stated beside it. */
export const BOOK_DELIVERY_PACKAGE_STATEMENT = '图书交付包把已完成的工作放在一起：它不是发稿，也不是交付；准备它不改变任何记录，也不生成文件。';
export const BOOK_DELIVERY_PACKAGE_CONDITION_LABELS = { publication: '发稿版本', workRecords: '工作记录' } as const;
export const BOOK_DELIVERY_PACKAGE_WORDS = {
  publicationMissing: '尚未设发稿版本',
  publicationNotice: `${PUBLICATION_CHANGE_NOTICE}：可以另设发稿版本，也可以按当前发稿版本打包。`,
  publicationRoute: '设为发稿版本…',
  notForThisBook: '本书不做',
  documentMissing: '尚未创建',
  documentUndelivered: '尚未交付',
  documentNotice: '交付后有修改：可以再交付，也可以按交付过的版本打包。',
  documentCreateRoute: '前往生产文档',
  documentDeliverRoute: '交付…',
  documentRedeliverRoute: '再交付…',
  noReviews: '暂无审阅记录',
  reviewRoute: '前往审阅',
  exportHistoryNone: '暂无导出记录',
  editorNotes: '备注',
  editorNotesDetail: '稿件与文档上的备注只供编辑自己参考',
  libraryOriginals: '资料库原件',
  intermediateRevisions: '中间修订版',
  intermediateRevisionsDetail: '稿件只含发稿版本，文档只含交付过的版本',
  unavailableRecords: '评估记录与定稿的审稿意见：AI7 尚未提供这两类记录，本包不含。',
} as const;

export const BOOK_DELIVERY_PACKAGE_REFUSALS = {
  changed: '图书交付包的内容在查看后又有变化，请看过新的内容再准备。',
  purpose: `请写明交付包用途（1–${MAX_BOOK_DELIVERY_PACKAGE_PURPOSE_CHARACTERS} 个字）。`,
} as const;

/** `第 2 次交付 · 版本 3`: a document's latest delivery, never 已交付 (PUB-009's words stay out of 交付物). */
function deliveryLabel(ordinal: number, versionLabel: string): string {
  return `第 ${ordinal} 次交付 · ${versionLabel}`;
}

function publicationLabel(milestoneLabel: string, revisionLabel: string): string {
  return `发稿版本「${milestoneLabel}」 · ${revisionLabel}`;
}

export function bookDeliveryPackageNotReady(unmet: ReadonlyArray<string>): string {
  return `还不能准备图书交付包：${unmet.join('、')}未满足。`;
}

// ---- what the store reads for it -----------------------------------------------------------------------------------

/** The Book's current Publication Version, and whether the manuscript moved past it. */
export interface PackagePublicationReading {
  publicationVersionId: string;
  ordinal: number;
  milestoneId: string;
  milestoneLabel: string;
  revisionId: string;
  revisionLabel: string;
  revisionDigest: string;
  scope: string;
  basis: string;
  changedSince: boolean;
}

/** One Delivery Record, as the package names it. */
export interface PackageDeliveryReading {
  deliveryId: string;
  ordinal: number;
  version: number;
  versionLabel: string;
  revisionId: string;
  revisionDigest: string;
  recipientLabel: string;
  recordedAt: string;
}

/** One house type, in the house's order: its latest decision, and its document's Delivery Records newest first. */
export interface PackageDocumentReading {
  typeId: string;
  typeLabel: string;
  notForThisBook: boolean;
  document: null | { documentId: string; changedSinceDelivery: boolean; deliveries: ReadonlyArray<PackageDeliveryReading> };
}

/** One Review Run of the Book, oldest first: its state and its newest report version. */
export interface PackageReviewRunReading {
  reviewRunId: string;
  ordinal: number;
  label: string;
  state: ReviewRunState;
  report: null | { reportId: string; version: number; digest: string; generatedAt: string };
}

export interface BookDeliveryPackageSources {
  publication(bookId: string): PackagePublicationReading | null;
  documents(bookId: string): ReadonlyArray<PackageDocumentReading>;
  reviewRuns(bookId: string): ReadonlyArray<PackageReviewRunReading>;
}

export class BookDeliveryPackageError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'BookDeliveryPackageError';
  }
}

function requirePackage(condition: unknown, code: string, message: string): asserts condition {
  if (!condition) throw new BookDeliveryPackageError(code, message);
}

type SqlRow = Record<string, SQLOutputValue>;

const text = (value: SQLOutputValue | undefined): string => {
  requirePackage(typeof value === 'string', 'BOOK_DELIVERY_PACKAGE_RECORD_INVALID', '图书交付包记录无效。');
  return value;
};
const integer = (value: SQLOutputValue | undefined): number => {
  requirePackage(typeof value === 'number' && Number.isSafeInteger(value), 'BOOK_DELIVERY_PACKAGE_RECORD_INVALID', '图书交付包记录无效。');
  return value;
};

/** What a package holds apart from its purpose: exactly what `contentDigest` names. */
interface PackageContent {
  schema: 'ai7.book-delivery-package-content/1';
  bookId: string;
  publication: null | Omit<PackagePublicationReading, 'changedSince'>;
  documents: ReadonlyArray<
    | { typeId: string; disposition: 'included'; documentId: string; version: number; revisionId: string; revisionDigest: string; deliveryId: string; deliveryIds: ReadonlyArray<string> }
    | { typeId: string; disposition: 'not-for-this-book' }
  >;
  reviewReports: ReadonlyArray<{ reviewRunId: string; reportId: string; version: number; digest: string }>;
  exclusions: ReadonlyArray<string>;
  limitations: ReadonlyArray<string>;
  typeConfiguration: { version: string; digest: string };
}

/** Everything a read derives from the records: the table, the preview, and the content to freeze. */
interface PackageReading {
  conditions: BookDeliveryPackageConditionProjection[];
  unmet: string[];
  content: PackageContent;
  contentDigest: string;
  preview: BookDeliveryPackageContentProjection;
}

interface VersionRecord {
  schema: 'ai7.book-delivery-package/1';
  packageVersionId: string;
  packageId: string;
  bookId: string;
  version: number;
  priorVersionId: string | null;
  purpose: string;
  content: PackageContent;
  contentDigest: string;
  actor: '本机编辑';
  preparedAt: string;
}

export class BookDeliveryPackages {
  readonly #db: DatabaseSync;
  readonly #sources: BookDeliveryPackageSources;

  constructor(db: DatabaseSync, sources: BookDeliveryPackageSources) {
    this.#db = db;
    this.#sources = sources;
  }

  /** 图书交付包 of one Book: the condition table, what a package made now would hold, and its frozen versions. */
  inspect(bookId: string): BookDeliveryPackageProjection {
    requirePackage(UUID_PATTERN.test(bookId), 'BOOK_INVALID', '图书标识无效。');
    requirePackage(this.#db.prepare('SELECT 1 FROM books WHERE book_id = ?').get(bookId) !== undefined, 'BOOK_NOT_FOUND', '图书不存在。');
    const reading = this.#read(bookId);
    const rows = this.#db.prepare(
      'SELECT * FROM book_delivery_package_versions WHERE book_id = ? ORDER BY version DESC LIMIT ?',
    ).all(bookId, MAX_BOOK_DELIVERY_PACKAGE_VERSIONS_LISTED + 1) as SqlRow[];
    const versions = rows.slice(0, MAX_BOOK_DELIVERY_PACKAGE_VERSIONS_LISTED).map((row, index) => this.#version(row, index === 0));
    return {
      bookId,
      statement: BOOK_DELIVERY_PACKAGE_STATEMENT,
      conditions: reading.conditions,
      ready: reading.unmet.length === 0,
      unmet: reading.unmet,
      content: reading.preview,
      versions,
      versionsTruncated: rows.length > MAX_BOOK_DELIVERY_PACKAGE_VERSIONS_LISTED,
      changedSinceLatest: versions[0] !== undefined && versions[0].technical.contentDigest !== reading.contentDigest,
    };
  }

  /**
   * `准备图书交付包` (BUNDLE-003, BUNDLE-004, DPKG-007, DPKG-008): inside the caller's transaction, the content read
   * again must be the content the editor saw and every condition must hold. The same content and purpose as the newest
   * version is that version, unchanged; anything else is the next version, naming the one before it. Nothing is
   * written anywhere else, and no file is made.
   */
  prepare(input: { bookId: string; purpose: string; expectedContentDigest: string }): { outcome: 'prepared' | 'unchanged'; version: number } {
    requirePackage(UUID_PATTERN.test(input.bookId), 'BOOK_INVALID', '图书标识无效。');
    requirePackage(this.#db.prepare('SELECT 1 FROM books WHERE book_id = ?').get(input.bookId) !== undefined, 'BOOK_NOT_FOUND', '图书不存在。');
    const purpose = publicationText(input.purpose, MAX_BOOK_DELIVERY_PACKAGE_PURPOSE_CHARACTERS);
    requirePackage(purpose !== null, 'BOOK_DELIVERY_PACKAGE_PURPOSE_INVALID', BOOK_DELIVERY_PACKAGE_REFUSALS.purpose);
    const reading = this.#read(input.bookId);
    requirePackage(reading.contentDigest === input.expectedContentDigest, 'BOOK_DELIVERY_PACKAGE_CHANGED', BOOK_DELIVERY_PACKAGE_REFUSALS.changed);
    requirePackage(reading.unmet.length === 0 && reading.content.publication !== null, 'BOOK_DELIVERY_PACKAGE_NOT_READY', bookDeliveryPackageNotReady(reading.unmet));
    const latest = this.#db.prepare(
      'SELECT package_version_id, package_id, version, purpose, content_sha256 FROM book_delivery_package_versions WHERE book_id = ? ORDER BY version DESC LIMIT 1',
    ).get(input.bookId) as SqlRow | undefined;
    if (latest !== undefined && text(latest.content_sha256) === reading.contentDigest && text(latest.purpose) === purpose) {
      return { outcome: 'unchanged', version: integer(latest.version) };
    }
    const version = latest === undefined ? 1 : integer(latest.version) + 1;
    const record: VersionRecord = {
      schema: 'ai7.book-delivery-package/1',
      packageVersionId: randomUUID(),
      packageId: latest === undefined ? randomUUID() : text(latest.package_id),
      bookId: input.bookId,
      version,
      priorVersionId: latest === undefined ? null : text(latest.package_version_id),
      purpose,
      content: reading.content,
      contentDigest: reading.contentDigest,
      actor: '本机编辑',
      preparedAt: new Date().toISOString(),
    };
    const canonical = canonicalRecord(record);
    this.#db.prepare(
      `INSERT INTO book_delivery_package_versions(
         package_version_id, package_id, book_id, version, prior_version_id, purpose, publication_version_id, content_sha256,
         actor, prepared_at, canonical_json, sha256
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, '本机编辑', ?, ?, ?)`,
    ).run(record.packageVersionId, record.packageId, record.bookId, version, record.priorVersionId, purpose,
      reading.content.publication.publicationVersionId, reading.contentDigest, record.preparedAt, canonical.json, canonical.digest);
    return { outcome: 'prepared', version };
  }

  /** The condition table and the content, read from the records as they stand. */
  #read(bookId: string): PackageReading {
    const conditions: BookDeliveryPackageConditionProjection[] = [];
    const included: BookDeliveryPackageItemProjection[] = [];
    const excluded: BookDeliveryPackageItemProjection[] = [];
    const limitations: string[] = [];

    // 发稿版本: the Book's current designation.
    const publication = this.#sources.publication(bookId);
    conditions.push({
      key: 'publication',
      typeId: null,
      label: BOOK_DELIVERY_PACKAGE_CONDITION_LABELS.publication,
      met: publication !== null,
      stateLabel: publication === null ? BOOK_DELIVERY_PACKAGE_WORDS.publicationMissing : publicationLabel(publication.milestoneLabel, publication.revisionLabel),
      notice: publication?.changedSince === true ? BOOK_DELIVERY_PACKAGE_WORDS.publicationNotice : null,
      route: publication === null || publication.changedSince ? 'publication' : null,
      routeLabel: publication === null || publication.changedSince ? BOOK_DELIVERY_PACKAGE_WORDS.publicationRoute : null,
    });
    if (publication !== null) {
      included.push({ kind: 'publication', label: publicationLabel(publication.milestoneLabel, publication.revisionLabel), detail: `发稿范围：${publication.scope}` });
      if (publication.changedSince) limitations.push(`稿件：${PUBLICATION_CHANGE_NOTICE}，本包按发稿版本。`);
    }

    // One row per house type: 本书不做, or its latest delivered version.
    const documents: PackageContent['documents'][number][] = [];
    for (const type of this.#sources.documents(bookId)) {
      const latest = type.document?.deliveries[0];
      const met = type.notForThisBook || latest !== undefined;
      const notice = !type.notForThisBook && latest !== undefined && type.document!.changedSinceDelivery ? BOOK_DELIVERY_PACKAGE_WORDS.documentNotice : null;
      const route = type.notForThisBook ? null : latest === undefined || notice !== null ? 'document' : null;
      conditions.push({
        key: 'document',
        typeId: type.typeId,
        label: type.typeLabel,
        met,
        stateLabel: type.notForThisBook
          ? BOOK_DELIVERY_PACKAGE_WORDS.notForThisBook
          : latest !== undefined
            ? deliveryLabel(latest.ordinal, latest.versionLabel)
            : type.document === null ? BOOK_DELIVERY_PACKAGE_WORDS.documentMissing : BOOK_DELIVERY_PACKAGE_WORDS.documentUndelivered,
        notice,
        route,
        routeLabel: route === null
          ? null
          : type.document === null
            ? BOOK_DELIVERY_PACKAGE_WORDS.documentCreateRoute
            : latest === undefined ? BOOK_DELIVERY_PACKAGE_WORDS.documentDeliverRoute : BOOK_DELIVERY_PACKAGE_WORDS.documentRedeliverRoute,
      });
      if (type.notForThisBook) {
        documents.push({ typeId: type.typeId, disposition: 'not-for-this-book' });
        excluded.push({ kind: 'not-for-this-book', label: type.typeLabel, detail: BOOK_DELIVERY_PACKAGE_WORDS.notForThisBook });
      } else if (latest !== undefined) {
        const deliveries = type.document!.deliveries;
        documents.push({
          typeId: type.typeId,
          disposition: 'included',
          documentId: type.document!.documentId,
          version: latest.version,
          revisionId: latest.revisionId,
          revisionDigest: latest.revisionDigest,
          deliveryId: latest.deliveryId,
          deliveryIds: deliveries.map((delivery) => delivery.deliveryId),
        });
        included.push({
          kind: 'document',
          label: `${type.typeLabel} · ${latest.versionLabel}`,
          detail: `${deliveryLabel(latest.ordinal, latest.versionLabel)} · ${latest.recipientLabel}；交付记录 ${deliveries.length} 条`,
        });
        if (notice !== null) limitations.push(`${type.typeLabel}：交付后有修改，本包按交付时的${latest.versionLabel}。`);
      }
    }

    // 工作记录: every Review Run that ran, finished and reported.
    const runs = this.#sources.reviewRuns(bookId);
    const reports: PackageContent['reviewReports'][number][] = [];
    const reportItems: BookDeliveryPackageItemProjection[] = [];
    const reviewLimitations: string[] = [];
    let unfinished: string | null = null;
    for (const run of runs) {
      if (run.state === 'prepared') {
        reviewLimitations.push(`${run.label}审阅没有开始，不在包中。`);
        continue;
      }
      if (run.state === 'running') {
        unfinished ??= `${run.label}审阅正在进行`;
        continue;
      }
      if (run.report === null) {
        unfinished ??= `${run.label}审阅尚未生成报告`;
        continue;
      }
      reports.push({ reviewRunId: run.reviewRunId, reportId: run.report.reportId, version: run.report.version, digest: run.report.digest });
      reportItems.push({ kind: 'review-report', label: reportExportLabel(run.label, run.report.version), detail: null });
      if (run.state === 'partial') reviewLimitations.push(`${run.label}审阅部分完成，报告按它的实际结果写出。`);
      if (run.state === 'failed') reviewLimitations.push(`${run.label}审阅未能完成，报告写明了原因。`);
    }
    conditions.push({
      key: 'work-records',
      typeId: null,
      label: BOOK_DELIVERY_PACKAGE_CONDITION_LABELS.workRecords,
      met: unfinished === null,
      stateLabel: unfinished ?? (reports.length === 0 ? BOOK_DELIVERY_PACKAGE_WORDS.noReviews : `审阅报告 ${reports.length} 份`),
      notice: null,
      route: unfinished === null ? null : 'review',
      routeLabel: unfinished === null ? null : BOOK_DELIVERY_PACKAGE_WORDS.reviewRoute,
    });
    // The newest reports first in the preview, as far as it lists them; the content holds every one.
    included.push(...reportItems.reverse().slice(0, MAX_BOOK_DELIVERY_PACKAGE_REPORTS_LISTED));
    limitations.push(...reviewLimitations);

    excluded.push(
      { kind: 'exclusion', label: BOOK_DELIVERY_PACKAGE_WORDS.editorNotes, detail: BOOK_DELIVERY_PACKAGE_WORDS.editorNotesDetail },
      { kind: 'exclusion', label: BOOK_DELIVERY_PACKAGE_WORDS.libraryOriginals, detail: null },
      { kind: 'exclusion', label: BOOK_DELIVERY_PACKAGE_WORDS.intermediateRevisions, detail: BOOK_DELIVERY_PACKAGE_WORDS.intermediateRevisionsDetail },
    );
    limitations.push(BOOK_DELIVERY_PACKAGE_WORDS.unavailableRecords);

    const content: PackageContent = {
      schema: 'ai7.book-delivery-package-content/1',
      bookId,
      publication: publication === null ? null : {
        publicationVersionId: publication.publicationVersionId,
        ordinal: publication.ordinal,
        milestoneId: publication.milestoneId,
        milestoneLabel: publication.milestoneLabel,
        revisionId: publication.revisionId,
        revisionLabel: publication.revisionLabel,
        revisionDigest: publication.revisionDigest,
        scope: publication.scope,
        basis: publication.basis,
      },
      documents,
      reviewReports: reports,
      exclusions: ['editor-notes', 'library-originals', 'intermediate-revisions'],
      limitations,
      typeConfiguration: { version: BUILTIN_PRODUCTION_DOCUMENT_TYPES.version, digest: BUILTIN_PRODUCTION_DOCUMENT_TYPES_DIGEST },
    };
    const contentDigest = canonicalRecord(content).digest;
    const unmet = conditions.filter((condition) => !condition.met).map((condition) => condition.label);
    return {
      conditions,
      unmet,
      content,
      contentDigest,
      preview: {
        digest: contentDigest,
        included,
        includedTruncated: reportItems.length > MAX_BOOK_DELIVERY_PACKAGE_REPORTS_LISTED,
        excluded,
        // The Manuscript's and the documents' lines, the newest Runs' as far as the preview lists them, and the fixed one.
        limitations: [
          ...limitations.slice(0, limitations.length - reviewLimitations.length - 1),
          ...reviewLimitations.slice(-MAX_BOOK_DELIVERY_PACKAGE_REPORTS_LISTED),
          BOOK_DELIVERY_PACKAGE_WORDS.unavailableRecords,
        ],
        limitationsTruncated: reviewLimitations.length > MAX_BOOK_DELIVERY_PACKAGE_REPORTS_LISTED,
      },
    };
  }

  /** One frozen version, its record verified against its digest. */
  #version(row: SqlRow, current: boolean): BookDeliveryPackageVersionProjection {
    const json = text(row.canonical_json);
    const digest = text(row.sha256);
    requirePackage(sha256Hex(json) === digest, 'BOOK_DELIVERY_PACKAGE_RECORD_INVALID', '图书交付包记录与其摘要不一致。');
    const record = JSON.parse(json) as VersionRecord;
    const version = integer(row.version);
    requirePackage(
      record.schema === 'ai7.book-delivery-package/1' && record.packageVersionId === text(row.package_version_id) && record.version === version &&
        record.contentDigest === text(row.content_sha256) && canonicalRecord(record.content).digest === record.contentDigest,
      'BOOK_DELIVERY_PACKAGE_RECORD_INVALID',
      '图书交付包记录无效。',
    );
    const publication = record.content.publication;
    const includedDocuments = record.content.documents.filter((entry) => entry.disposition === 'included').length;
    const notForThisBook = record.content.documents.length - includedDocuments;
    return {
      packageVersionId: record.packageVersionId,
      packageId: record.packageId,
      version,
      label: `v${version}`,
      purpose: record.purpose,
      preparedAt: record.preparedAt,
      current,
      summary: [
        publication === null ? BOOK_DELIVERY_PACKAGE_WORDS.publicationMissing : publicationLabel(publication.milestoneLabel, publication.revisionLabel),
        `生产文档 ${includedDocuments} 份`,
        `本书不做 ${notForThisBook} 类`,
        `审阅报告 ${record.content.reviewReports.length} 份`,
      ].join(' · '),
      exportHistoryLabel: BOOK_DELIVERY_PACKAGE_WORDS.exportHistoryNone,
      technical: { contentDigest: record.contentDigest, digest, priorVersionId: record.priorVersionId },
    };
  }
}
