import { randomUUID } from 'node:crypto';
import type { DatabaseSync, SQLOutputValue } from 'node:sqlite';
import {
  MAX_PRODUCTION_DOCUMENT_SOURCES_LISTED,
  MAX_PRODUCTION_DOCUMENT_VERSIONS_LISTED,
  type ProductionDocumentProjection,
  type ProductionDocumentsProjection,
  type ProductionDocumentSourceProjection,
  type ProductionDocumentVersionProjection,
  type SourceFormat,
} from '../shared/protocol.js';
import { UUID_PATTERN, canonicalJson, sha256Hex } from './analysis/canonical.js';
import {
  BUILTIN_PRODUCTION_DOCUMENT_TYPES,
  BUILTIN_PRODUCTION_DOCUMENT_TYPES_DIGEST,
  productionDocumentType,
} from './production-document-types.js';

/**
 * 交付 · 生产文档 (Issue #415, plan slice S66; editor-surfaces §9; V2-UX-DELIV-001, DELIV-002, WORK-013, MILE-014).
 *
 * A Production Document is a Book's Editorial Deliverable of one house type (新闻稿, 宣传文章 …), edited on the
 * Manuscript's own surface with the same marks, versioned as `版本 N` and — in S66b — delivered as a Delivery
 * Record plus an exported file. It lives in the bounded block store as a `manuscripts` row whose role is
 * `production-document`, so every editing, journal, mark and checkpoint path serves it unchanged; nothing that
 * belongs to the Manuscript alone — milestones, the 发稿版本, reimport, analysis, review, Tasks — ever binds it.
 *
 * This module owns the ledgers of `production-document-ledger.ts` and what 交付物 shows of them: one card per
 * house type in the configuration's order, each with its document or none and whether the type is `本书不做`
 * for the Book, and the Book's source-only materials a document can start from. It records `本书不做` and
 * `恢复`; making a document and saving a version need the block store and are the store's.
 */

type SqlRow = Record<string, SQLOutputValue>;

export class ProductionDocumentError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'ProductionDocumentError';
  }
}

export function requireDocument(condition: unknown, code: string, message: string): asserts condition {
  if (!condition) throw new ProductionDocumentError(code, message);
}

const text = (value: SQLOutputValue | undefined): string => {
  requireDocument(typeof value === 'string', 'PRODUCTION_DOCUMENT_RECORD_INVALID', '生产文档记录无效。');
  return value;
};
const integer = (value: SQLOutputValue | undefined): number => {
  const number = typeof value === 'bigint' ? Number(value) : value;
  requireDocument(typeof number === 'number' && Number.isSafeInteger(number), 'PRODUCTION_DOCUMENT_RECORD_INVALID', '生产文档记录无效。');
  return number;
};

/** Why no document can be made or opened: the Book has no Manuscript yet. */
export const PRODUCTION_DOCUMENTS_NEED_MANUSCRIPT = '先导入稿件，再创建生产文档' as const;

/** `版本 N`: a document's version names its place in the document's own history, never a milestone (MILE-014). */
export function productionDocumentVersionLabel(ordinal: number): string {
  return `版本 ${ordinal}`;
}

/** A document's row as the ledger holds it. */
export interface ProductionDocumentRow {
  documentId: string;
  bookId: string;
  typeId: string;
  branchId: string;
  originSourceVersionId: string;
  createdAt: string;
}

export class ProductionDocuments {
  readonly #db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.#db = db;
  }

  /** 交付 · 生产文档 of one Book: one card per house type, and the materials a document can start from. */
  documents(bookId: string, hasManuscript: boolean): ProductionDocumentsProjection {
    requireDocument(UUID_PATTERN.test(bookId), 'BOOK_INVALID', '图书标识无效。');
    const decisions = this.#latestDecisions(bookId);
    const documents = new Map(this.#documentRows(bookId).map((row) => [row.typeId, row]));
    const read = this.#sources(bookId, MAX_PRODUCTION_DOCUMENT_SOURCES_LISTED + 1);
    return {
      configuration: {
        schema: BUILTIN_PRODUCTION_DOCUMENT_TYPES.schema,
        version: BUILTIN_PRODUCTION_DOCUMENT_TYPES.version,
        digest: BUILTIN_PRODUCTION_DOCUMENT_TYPES_DIGEST,
      },
      unavailableReason: hasManuscript ? null : PRODUCTION_DOCUMENTS_NEED_MANUSCRIPT,
      types: BUILTIN_PRODUCTION_DOCUMENT_TYPES.types.map((type) => {
        const row = documents.get(type.typeId);
        return {
          typeId: type.typeId,
          label: type.label,
          notForThisBook: decisions.get(type.typeId) === 'not-for-this-book',
          document: row === undefined ? null : this.document(row),
        };
      }),
      sources: read.slice(0, MAX_PRODUCTION_DOCUMENT_SOURCES_LISTED),
      sourcesTruncated: read.length > MAX_PRODUCTION_DOCUMENT_SOURCES_LISTED,
    };
  }

  /** One document as it stands: its versions newest first and whether its working text moved past the latest. */
  document(row: ProductionDocumentRow): ProductionDocumentProjection {
    const state = this.#db.prepare(
      `SELECT bws.journal_sequence, bws.working_digest, sv.display_name
       FROM branch_working_state bws
       JOIN source_versions sv ON sv.source_version_id = ?
       WHERE bws.branch_id = ? AND bws.manuscript_id = ?`,
    ).get(row.originSourceVersionId, row.branchId, row.documentId) as SqlRow | undefined;
    requireDocument(state !== undefined, 'PRODUCTION_DOCUMENT_RECORD_INVALID', '生产文档的工作状态缺失。');
    const versions = (this.#db.prepare(
      `SELECT pv.version, pv.revision_id, pv.revision_digest, pv.recorded_at
       FROM production_document_versions pv
       JOIN manuscript_revisions mr ON mr.revision_id = pv.revision_id AND mr.manuscript_id = pv.document_id AND mr.branch_id = ?
       WHERE pv.document_id = ? ORDER BY pv.version DESC LIMIT ?`,
    ).all(row.branchId, row.documentId, MAX_PRODUCTION_DOCUMENT_VERSIONS_LISTED + 1) as SqlRow[]).map((version): ProductionDocumentVersionProjection => ({
      revisionId: text(version.revision_id),
      ordinal: integer(version.version),
      label: productionDocumentVersionLabel(integer(version.version)),
      createdAt: text(version.recorded_at),
      revisionDigest: text(version.revision_digest),
    }));
    requireDocument(versions.length > 0, 'PRODUCTION_DOCUMENT_RECORD_INVALID', '生产文档没有版本。');
    const workingDigest = text(state.working_digest);
    return {
      documentId: row.documentId,
      branchId: row.branchId,
      createdAt: row.createdAt,
      origin: { sourceVersionId: row.originSourceVersionId, displayName: text(state.display_name) },
      versions: versions.slice(0, MAX_PRODUCTION_DOCUMENT_VERSIONS_LISTED),
      versionsTruncated: versions.length > MAX_PRODUCTION_DOCUMENT_VERSIONS_LISTED,
      changedSinceVersion: workingDigest !== versions[0]!.revisionDigest,
      journalSequence: integer(state.journal_sequence),
      workingDigest,
    };
  }

  /** The document of one type of a Book, or `undefined`. */
  documentOfType(bookId: string, typeId: string): ProductionDocumentRow | undefined {
    return this.#documentRows(bookId).find((row) => row.typeId === typeId);
  }

  /** The document with this identity in a Book, or `undefined`. */
  documentById(bookId: string, documentId: string): ProductionDocumentRow | undefined {
    return this.#documentRows(bookId).find((row) => row.documentId === documentId);
  }

  /** Whether the type is `本书不做` for the Book, as its latest decision records it. */
  notForThisBook(bookId: string, typeId: string): boolean {
    return this.#latestDecisions(bookId).get(typeId) === 'not-for-this-book';
  }

  /**
   * `本书不做` or `恢复` (WORK-013): one appended decision, or no change when the type already stands so. A document
   * of the type stays with its versions and history; only its place among the Book's conditions changes.
   */
  decide(bookId: string, typeId: string, notForThisBook: boolean): 'recorded' | 'unchanged' {
    requireDocument(UUID_PATTERN.test(bookId), 'BOOK_INVALID', '图书标识无效。');
    requireDocument(productionDocumentType(typeId) !== undefined, 'PRODUCTION_DOCUMENT_TYPE_INVALID', '这个文档类型不在本社的类型配置中。');
    if (this.notForThisBook(bookId, typeId) === notForThisBook) return 'unchanged';
    const last = this.#db.prepare(
      'SELECT max(sequence) sequence FROM production_document_type_decisions WHERE book_id = ? AND type_id = ?',
    ).get(bookId, typeId) as SqlRow | undefined;
    const sequence = last?.sequence === null || last?.sequence === undefined ? 1 : integer(last.sequence) + 1;
    this.#db.prepare(
      `INSERT INTO production_document_type_decisions(
         decision_id, book_id, type_id, type_configuration_version, type_configuration_digest, sequence, decision, recorded_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(randomUUID(), bookId, typeId, BUILTIN_PRODUCTION_DOCUMENT_TYPES.version, BUILTIN_PRODUCTION_DOCUMENT_TYPES_DIGEST,
      sequence, notForThisBook ? 'not-for-this-book' : 'restored', new Date().toISOString());
    return 'recorded';
  }

  /**
   * A source-only material of the Book that a document can be made from: parsed, and imported as source material
   * rather than as the Manuscript's own file. `undefined` for any other.
   */
  source(bookId: string, sourceVersionId: string): (ProductionDocumentSourceProjection & {
    objectDigest: string;
    workingObjectDigest: string | null;
    contentDigest: string;
    structureDigest: string;
  }) | undefined {
    const row = this.#db.prepare(
      `SELECT sv.source_version_id, sv.display_name, sv.format, sv.created_at, sv.object_digest, sv.working_object_digest,
              sv.content_digest, sv.structure_digest
       FROM source_versions sv
       WHERE sv.book_id = ? AND sv.source_version_id = ? AND sv.content_digest IS NOT NULL
         AND EXISTS (SELECT 1 FROM source_import_records sir WHERE sir.source_version_id = sv.source_version_id)`,
    ).get(bookId, sourceVersionId) as SqlRow | undefined;
    if (row === undefined) return undefined;
    return {
      sourceVersionId: text(row.source_version_id),
      displayName: text(row.display_name),
      format: text(row.format) as SourceFormat,
      createdAt: text(row.created_at),
      objectDigest: text(row.object_digest),
      workingObjectDigest: row.working_object_digest === null ? null : text(row.working_object_digest),
      contentDigest: text(row.content_digest),
      structureDigest: text(row.structure_digest),
    };
  }

  /** Append a document's ledger row, in the transaction that made its block-store rows. */
  record(input: {
    documentId: string;
    bookId: string;
    typeId: string;
    originSourceVersionId: string;
    parserIdentity: string;
    createdAt: string;
  }): void {
    const recordDigest = sha256Hex(canonicalJson({
      schema: 'ai7.production-document/1',
      documentId: input.documentId,
      bookId: input.bookId,
      typeId: input.typeId,
      typeConfiguration: { version: BUILTIN_PRODUCTION_DOCUMENT_TYPES.version, digest: BUILTIN_PRODUCTION_DOCUMENT_TYPES_DIGEST },
      originSourceVersionId: input.originSourceVersionId,
      parserIdentity: input.parserIdentity,
      createdAt: input.createdAt,
    }));
    this.#db.prepare(
      `INSERT INTO production_documents(
         document_id, book_id, type_id, type_configuration_version, type_configuration_digest,
         origin_source_version_id, parser_identity, record_digest, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(input.documentId, input.bookId, input.typeId, BUILTIN_PRODUCTION_DOCUMENT_TYPES.version,
      BUILTIN_PRODUCTION_DOCUMENT_TYPES_DIGEST, input.originSourceVersionId, input.parserIdentity, recordDigest, input.createdAt);
  }

  /**
   * Append a document's next version for the revision just made — in the transaction that made it — or, when the
   * revision is already the latest version (nothing changed since), no row.
   */
  recordVersion(documentId: string, revisionId: string, revisionDigest: string, origin: 'created' | 'saved' | 'delivery'): number {
    const latest = this.#db.prepare(
      'SELECT version, revision_id FROM production_document_versions WHERE document_id = ? ORDER BY version DESC LIMIT 1',
    ).get(documentId) as SqlRow | undefined;
    if (latest !== undefined && text(latest.revision_id) === revisionId) return integer(latest.version);
    const version = latest === undefined ? 1 : integer(latest.version) + 1;
    requireDocument((origin === 'created') === (version === 1), 'PRODUCTION_DOCUMENT_RECORD_INVALID', '生产文档的版本顺序无效。');
    this.#db.prepare(
      `INSERT INTO production_document_versions(document_id, version, revision_id, revision_digest, origin, recorded_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(documentId, version, revisionId, revisionDigest, origin, new Date().toISOString());
    return version;
  }

  #documentRows(bookId: string): ProductionDocumentRow[] {
    return (this.#db.prepare(
      `SELECT pd.document_id, pd.book_id, pd.type_id, pd.origin_source_version_id, pd.created_at, mb.branch_id
       FROM production_documents pd
       JOIN manuscripts m ON m.manuscript_id = pd.document_id AND m.role = 'production-document' AND m.book_id = pd.book_id
       JOIN manuscript_branches mb ON mb.manuscript_id = pd.document_id
       WHERE pd.book_id = ? ORDER BY pd.created_at, pd.document_id`,
    ).all(bookId) as SqlRow[]).map((row) => ({
      documentId: text(row.document_id),
      bookId: text(row.book_id),
      typeId: text(row.type_id),
      branchId: text(row.branch_id),
      originSourceVersionId: text(row.origin_source_version_id),
      createdAt: text(row.created_at),
    }));
  }

  #latestDecisions(bookId: string): Map<string, 'not-for-this-book' | 'restored'> {
    const rows = this.#db.prepare(
      `SELECT d.type_id, d.decision FROM production_document_type_decisions d
       WHERE d.book_id = ? AND d.sequence = (
         SELECT max(latest.sequence) FROM production_document_type_decisions latest
         WHERE latest.book_id = d.book_id AND latest.type_id = d.type_id)`,
    ).all(bookId) as SqlRow[];
    return new Map(rows.map((row) => [text(row.type_id), text(row.decision) as 'not-for-this-book' | 'restored']));
  }

  #sources(bookId: string, limit: number): ProductionDocumentSourceProjection[] {
    return (this.#db.prepare(
      `SELECT sv.source_version_id, sv.display_name, sv.format, sv.created_at
       FROM source_versions sv
       WHERE sv.book_id = ? AND sv.content_digest IS NOT NULL
         AND EXISTS (SELECT 1 FROM source_import_records sir WHERE sir.source_version_id = sv.source_version_id)
       ORDER BY sv.created_at DESC, sv.source_version_id DESC LIMIT ?`,
    ).all(bookId, limit) as SqlRow[]).map((row) => ({
      sourceVersionId: text(row.source_version_id),
      displayName: text(row.display_name),
      format: text(row.format) as SourceFormat,
      createdAt: text(row.created_at),
    }));
  }
}
