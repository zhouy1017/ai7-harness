import { randomUUID } from 'node:crypto';
import type { DatabaseSync, SQLOutputValue } from 'node:sqlite';
import {
  MAX_PRODUCTION_DOCUMENT_DELIVERIES_LISTED,
  MAX_PRODUCTION_DOCUMENT_DELIVERY_NOTE_CHARACTERS,
  MAX_PRODUCTION_DOCUMENT_RECIPIENT_CHARACTERS,
  MAX_PRODUCTION_DOCUMENT_SOURCES_LISTED,
  MAX_PRODUCTION_DOCUMENT_VERSIONS_LISTED,
  PRODUCTION_DOCUMENT_RECIPIENT_KINDS,
  PRODUCTION_DOCUMENT_RECIPIENT_LABELS,
  publicationText,
  type ManuscriptExportReceiptProjection,
  type ProductionDocumentDeliveryProjection,
  type ProductionDocumentProjection,
  type ProductionDocumentRecipientKind,
  type ProductionDocumentsProjection,
  type ProductionDocumentSourceProjection,
  type ProductionDocumentVersionProjection,
  type SourceFormat,
} from '../shared/protocol.js';
import { UUID_PATTERN, canonicalJson, canonicalRecord, sha256Hex } from './analysis/canonical.js';
import type { PackageDeliveryReading, PackageDocumentReading } from './book-delivery-packages.js';
import { ProductionDocumentOriginError, productionDocumentOriginMarks } from './production-document-origins.js';
import type { ProductionDocumentWorkflow } from './production-document-workflow.js';
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
/**
 * 从来源材料创建 reads a material's text as its tracked changes rejected, and carries none of its comments or tracked
 * changes into the document (Issue #415, S66): the document says so where it opens, never leaving them to vanish.
 */
export function productionDocumentMarksNotCarried(count: number): string {
  return `来源材料里的 ${count} 处批注与修订没有带入这份文档：文字按全部修订被拒绝时的样子读出，批注不带入。需要时请在文档里重新标出。`;
}

/** `版本 N`: a document's version names its place in the document's own history, never a milestone (MILE-014). */
export function productionDocumentVersionLabel(ordinal: number): string {
  return `版本 ${ordinal}`;
}

/** A document's row as the ledger holds it. */
/** Who a delivery goes to, in the words it is recorded with, and its note. */
export interface ProductionDocumentDeliveryParty {
  kind: ProductionDocumentRecipientKind;
  label: string;
  note: string | null;
}

export interface ProductionDocumentRow {
  documentId: string;
  bookId: string;
  typeId: string;
  branchId: string;
  originSourceVersionId: string;
  createdAt: string;
}

/**
 * A Delivery Record's file (Issue #415, S66b): the approved export of one document version between two instants that wrote
 * its file, else the newest attempt, as the export ledger reads it, or `null`.
 */
export type ProductionDocumentExportOf = (bookId: string, revisionId: string, from: string, until: string | null) => ManuscriptExportReceiptProjection | null;

export class ProductionDocuments {
  readonly #db: DatabaseSync;
  readonly #exportOf: ProductionDocumentExportOf;
  readonly #workflow: ProductionDocumentWorkflow;

  constructor(db: DatabaseSync, exportOf: ProductionDocumentExportOf, workflow: ProductionDocumentWorkflow) {
    this.#db = db;
    this.#exportOf = exportOf;
    this.#workflow = workflow;
  }

  /** 交付 · 生产文档 of one Book: one card per house type, and the materials a document can start from. */
  documents(bookId: string, hasManuscript: boolean): ProductionDocumentsProjection {
    requireDocument(UUID_PATTERN.test(bookId), 'BOOK_INVALID', '图书标识无效。');
    const decisions = this.#latestDecisions(bookId);
    const documents = new Map(this.#documentRows(bookId).map((row) => [row.typeId, row]));
    const read = this.#sources(bookId, MAX_PRODUCTION_DOCUMENT_SOURCES_LISTED + 1);
    return {
      bookId,
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
    const deliveries = this.#deliveries(row, MAX_PRODUCTION_DOCUMENT_DELIVERIES_LISTED + 1);
    const changedSinceVersion = workingDigest !== versions[0]!.revisionDigest;
    const changedSinceDelivery = this.changedSinceDelivery(row.documentId, workingDigest);
    // What the document's own open phases wait on (Issue #415, S66c): its open 修改建议, and where its text stands against
    // its versions and deliveries.
    const openSuggestions = integer((this.#db.prepare(
      "SELECT count(*) total FROM editorial_marks WHERE manuscript_id = ? AND branch_id = ? AND kind = 'change-suggestion' AND status = 'open'",
    ).get(row.documentId, row.branchId) as SqlRow).total);
    return {
      documentId: row.documentId,
      branchId: row.branchId,
      createdAt: row.createdAt,
      origin: { sourceVersionId: row.originSourceVersionId, displayName: text(state.display_name), marksNotCarried: this.#originMarks(row) },
      versions: versions.slice(0, MAX_PRODUCTION_DOCUMENT_VERSIONS_LISTED),
      versionsTruncated: versions.length > MAX_PRODUCTION_DOCUMENT_VERSIONS_LISTED,
      changedSinceVersion,
      journalSequence: integer(state.journal_sequence),
      workingDigest,
      deliveries: deliveries.slice(0, MAX_PRODUCTION_DOCUMENT_DELIVERIES_LISTED),
      deliveriesTruncated: deliveries.length > MAX_PRODUCTION_DOCUMENT_DELIVERIES_LISTED,
      changedSinceDelivery,
      workflow: this.#workflow.projection(row.documentId, {
        changedSinceVersion, delivered: deliveries.length > 0, changedSinceDelivery, openSuggestions,
      }),
    };
  }

  /** How many of the origin material's 批注与修订 the document did not carry (Issue #547), from its own record. */
  #originMarks(row: ProductionDocumentRow): number | null {
    try {
      return productionDocumentOriginMarks(this.#db, row.documentId, row.originSourceVersionId);
    } catch (error) {
      if (error instanceof ProductionDocumentOriginError) throw new ProductionDocumentError(error.code, error.message);
      throw error;
    }
  }

  /**
   * 交付后有修改 (DELIV-004): an edit after a delivery — the document was delivered, and its text, saved as a new version
   * or not, is no version it was delivered at. Delivering an earlier saved version is no edit, and raises nothing.
   */
  changedSinceDelivery(documentId: string, workingDigest: string): boolean {
    const read = this.#db.prepare(
      `SELECT EXISTS (SELECT 1 FROM production_document_deliveries WHERE document_id = ?) delivered,
              EXISTS (SELECT 1 FROM production_document_deliveries WHERE document_id = ? AND revision_digest = ?) matched`,
    ).get(documentId, documentId, workingDigest) as SqlRow;
    return integer(read.delivered) === 1 && integer(read.matched) === 0;
  }

  /**
   * Who a delivery goes to and its note, as they will be recorded (DELIV-003): a recipient from the house's list or in
   * the editor's own words, and a note within its bound. Checked before anything is saved, so a refused delivery saves
   * no version either.
   */
  deliveryParty(recipient: { kind: ProductionDocumentRecipientKind; custom: string | null }, note: string | null): ProductionDocumentDeliveryParty {
    requireDocument(PRODUCTION_DOCUMENT_RECIPIENT_KINDS.includes(recipient.kind), 'PRODUCTION_DOCUMENT_DELIVERY_INVALID', '请选择交给谁。');
    const custom = recipient.kind === 'custom' ? publicationText(recipient.custom, MAX_PRODUCTION_DOCUMENT_RECIPIENT_CHARACTERS) : null;
    requireDocument((recipient.kind === 'custom') === (custom !== null) && (recipient.kind === 'custom' || recipient.custom === null),
      'PRODUCTION_DOCUMENT_DELIVERY_INVALID', `请写明交给谁（1–${MAX_PRODUCTION_DOCUMENT_RECIPIENT_CHARACTERS} 个字）。`);
    const recorded = note === null ? null : publicationText(note, MAX_PRODUCTION_DOCUMENT_DELIVERY_NOTE_CHARACTERS);
    requireDocument(note === null || recorded !== null, 'PRODUCTION_DOCUMENT_DELIVERY_INVALID',
      `备注最多 ${MAX_PRODUCTION_DOCUMENT_DELIVERY_NOTE_CHARACTERS} 个字。`);
    return { kind: recipient.kind, label: recipient.kind === 'custom' ? custom! : PRODUCTION_DOCUMENT_RECIPIENT_LABELS[recipient.kind], note: recorded };
  }

  /** What the document's text is now, saved as a version or not. */
  workingDigest(row: ProductionDocumentRow): string {
    const state = this.#db.prepare('SELECT working_digest FROM branch_working_state WHERE branch_id = ? AND manuscript_id = ?')
      .get(row.branchId, row.documentId) as SqlRow | undefined;
    requireDocument(state !== undefined, 'PRODUCTION_DOCUMENT_RECORD_INVALID', '生产文档的工作状态缺失。');
    return text(state.working_digest);
  }

  /**
   * 交付 (DELIV-003): one Delivery Record of one exact saved version of the document, to the party `deliveryParty`
   * checked. It is appended once, never sends anything, and leaves every earlier record and the Manuscript's 发稿 as
   * they were.
   */
  recordDelivery(row: ProductionDocumentRow, revisionId: string, party: ProductionDocumentDeliveryParty): string {
    const version = this.#db.prepare(
      `SELECT pv.version, pv.revision_digest FROM production_document_versions pv
       JOIN manuscript_revisions mr ON mr.revision_id = pv.revision_id AND mr.manuscript_id = pv.document_id AND mr.branch_id = ?
       WHERE pv.document_id = ? AND pv.revision_id = ?`,
    ).get(row.branchId, row.documentId, revisionId) as SqlRow | undefined;
    requireDocument(version !== undefined, 'PRODUCTION_DOCUMENT_DELIVERY_INVALID', '只能交付这份文档保存过的版本。');
    const last = this.#db.prepare('SELECT max(ordinal) ordinal FROM production_document_deliveries WHERE document_id = ?').get(row.documentId) as SqlRow | undefined;
    const ordinal = last?.ordinal === null || last?.ordinal === undefined ? 1 : integer(last.ordinal) + 1;
    const deliveryId = randomUUID();
    const recordedAt = new Date().toISOString();
    const record = canonicalRecord({
      schema: 'ai7.production-document-delivery/1',
      deliveryId,
      documentId: row.documentId,
      bookId: row.bookId,
      ordinal,
      version: integer(version.version),
      revisionId,
      revisionDigest: text(version.revision_digest),
      recipient: { kind: party.kind, label: party.label },
      note: party.note,
      actor: '本机编辑',
      recordedAt,
    });
    this.#db.prepare(
      `INSERT INTO production_document_deliveries(
         delivery_id, document_id, book_id, ordinal, version, revision_id, revision_digest, recipient_kind, recipient_label,
         note, actor, recorded_at, canonical_json, sha256
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '本机编辑', ?, ?, ?)`,
    ).run(deliveryId, row.documentId, row.bookId, ordinal, integer(version.version), revisionId, text(version.revision_digest),
      party.kind, party.label, party.note, recordedAt, record.json, record.digest);
    return deliveryId;
  }

  /** A document's Delivery Records newest first, each with what its export came to. */
  #deliveries(row: ProductionDocumentRow, limit: number): ProductionDocumentDeliveryProjection[] {
    const rows = this.#db.prepare(
      `SELECT d.*, pv.version FROM production_document_deliveries d
       JOIN production_document_versions pv ON pv.document_id = d.document_id AND pv.revision_id = d.revision_id
       WHERE d.document_id = ? ORDER BY d.ordinal DESC LIMIT ?`,
    ).all(row.documentId, limit) as SqlRow[];
    return rows.map((delivery, index): ProductionDocumentDeliveryProjection => {
      const json = text(delivery.canonical_json);
      requireDocument(sha256Hex(json) === text(delivery.sha256), 'PRODUCTION_DOCUMENT_RECORD_INVALID', '交付记录与其摘要不一致。');
      const recordedAt = text(delivery.recorded_at);
      // The next delivery of the document, newer than this one, ends the window this one's export is read in.
      const until = index === 0 ? null : text(rows[index - 1]!.recorded_at);
      const exported = this.#exportOf(row.bookId, text(delivery.revision_id), recordedAt, until);
      return {
        deliveryId: text(delivery.delivery_id),
        ordinal: integer(delivery.ordinal),
        revisionId: text(delivery.revision_id),
        versionLabel: productionDocumentVersionLabel(integer(delivery.version)),
        recipient: { kind: text(delivery.recipient_kind) as ProductionDocumentRecipientKind, label: text(delivery.recipient_label) },
        note: delivery.note === null ? null : text(delivery.note),
        recordedAt,
        export: exported === null
          ? null
          : { preparationId: exported.preparationId, outcome: exported.outcome, outcomeLabel: exported.outcomeLabel, fileName: exported.fileName },
      };
    });
  }

  /**
   * What 图书交付包 reads of the Book's Production Documents (Issue #416, S67a): every house type in the house's order,
   * whether it is 本书不做, and its document's every Delivery Record newest first, each with the exact version it
   * named, and whether the text moved past the version last delivered. A read.
   */
  packageReadings(bookId: string): PackageDocumentReading[] {
    const decisions = this.#latestDecisions(bookId);
    const rows = this.#documentRows(bookId);
    return BUILTIN_PRODUCTION_DOCUMENT_TYPES.types.map((type): PackageDocumentReading => {
      const row = rows.find((candidate) => candidate.typeId === type.typeId);
      const notForThisBook = decisions.get(type.typeId) === 'not-for-this-book';
      if (row === undefined) return { typeId: type.typeId, typeLabel: type.label, notForThisBook, document: null };
      const deliveries = Array.from(this.#deliveryReadings(row.documentId));
      const working = this.workingDigest(row);
      return {
        typeId: type.typeId,
        typeLabel: type.label,
        notForThisBook,
        // 交付后有修改 read as the document's own card reads it (DELIV-004): one check, in one place.
        document: { documentId: row.documentId, changedSinceDelivery: this.changedSinceDelivery(row.documentId, working), deliveries },
      };
    });
  }

  /**
   * What 范例 reads of the Book's Production Documents (Issue #427, S79b review): each house type's document in the house's
   * order, with its every Delivery Record newest first, each verified exactly as 图书交付包 reads it. A read.
   */
  deliveryReadings(bookId: string): Array<{ typeId: string; typeLabel: string; documentId: string; deliveries: (order: 'latest' | 'version') => Iterable<PackageDeliveryReading> }> {
    const rows = this.#documentRows(bookId);
    return BUILTIN_PRODUCTION_DOCUMENT_TYPES.types.flatMap((type) => {
      const row = rows.find((candidate) => candidate.typeId === type.typeId);
      return row === undefined ? [] : [{ typeId: type.typeId, typeLabel: type.label, documentId: row.documentId, deliveries: (order: 'latest' | 'version') => this.#deliveryReadings(row.documentId, order) }];
    });
  }

  /** A document's every Delivery Record, newest first, each verified against its digest. */
  *#deliveryReadings(documentId: string, order: 'latest' | 'version' = 'latest'): IterableIterator<PackageDeliveryReading> {
    const rows = this.#db.prepare(
      `SELECT d.delivery_id, d.ordinal, d.version, d.revision_id, d.revision_digest, d.recipient_label, d.recorded_at, d.canonical_json, d.sha256
       FROM production_document_deliveries d WHERE d.document_id = ? ORDER BY ${order === 'version' ? 'd.version, ' : ''}d.ordinal DESC`,
    ).iterate(documentId) as IterableIterator<SqlRow>;
    for (const delivery of rows) {
      requireDocument(sha256Hex(text(delivery.canonical_json)) === text(delivery.sha256), 'PRODUCTION_DOCUMENT_RECORD_INVALID', '交付记录与其摘要不一致。');
      yield {
        deliveryId: text(delivery.delivery_id),
        ordinal: integer(delivery.ordinal),
        version: integer(delivery.version),
        versionLabel: productionDocumentVersionLabel(integer(delivery.version)),
        revisionId: text(delivery.revision_id),
        revisionDigest: text(delivery.revision_digest),
        recipientLabel: text(delivery.recipient_label),
        recordedAt: text(delivery.recorded_at),
      };
    }
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
