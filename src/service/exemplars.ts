import type { DatabaseSync, SQLOutputValue } from 'node:sqlite';
import type { ExemplarBookProjection, ExemplarProjection, ExemplarsProjection } from '../shared/protocol.js';
import { BUILTIN_PRODUCTION_DOCUMENT_TYPES, productionDocumentType } from './production-document-types.js';

/**
 * 知识库 › 范例 (Issue #427, plan slice S79b; V2-UX-KB-004, KB-006): a Book the house produced with AI7 brings its delivered
 * documents into 范例 once a 发稿版本 is designated — those delivered before the designation at the designation, and every
 * one delivered after it as it is delivered — organized by Book and by document type, the Learning Eligibility `仅本社`
 * by default and nothing asked.
 *
 * It is a read. Each exemplar is one exact document version as a Delivery Record named it, of a Book that has a designation,
 * both append-only records already: the archive is exactly what those records say, so it needs no relation of its own and
 * can never disagree with them. An exemplar is referenced, never copied into a manuscript or a deliverable.
 */

type SqlRow = Record<string, SQLOutputValue>;

/** What a Book is attributed to in 范例, as its people read now. */
export interface ExemplarPeopleReader {
  current(bookId: string): { readonly authors: ReadonlyArray<string>; readonly editors: ReadonlyArray<string> };
}

function text(value: SQLOutputValue | undefined): string {
  return String(value);
}

function integer(value: SQLOutputValue | undefined): number {
  return typeof value === 'bigint' ? Number(value) : Number(value);
}

/** The later of two instants, as the records write them (ISO 8601 in UTC, so they compare as text). */
function later(a: string, b: string): string {
  return a > b ? a : b;
}

export function readExemplars(db: DatabaseSync, people: ExemplarPeopleReader): ExemplarsProjection {
  // Each Book with a 发稿版本: when it was first designated, and the latest designation it has now.
  const designated = db.prepare(
    `SELECT p.book_id, b.title,
            MIN(p.created_at) AS first_designated_at,
            MAX(p.ordinal) AS latest_ordinal
     FROM publication_versions p JOIN books b ON b.book_id = p.book_id
     GROUP BY p.book_id, b.title
     ORDER BY b.title COLLATE BINARY, p.book_id`,
  ).all() as SqlRow[];
  const deliveries = db.prepare(
    `SELECT d.book_id, d.document_id, d.ordinal, d.version, d.revision_id, d.revision_digest, d.recipient_label, d.recorded_at, p.type_id
     FROM production_document_deliveries d JOIN production_documents p ON p.document_id = d.document_id
     ORDER BY d.document_id, d.ordinal`,
  ).all() as SqlRow[];
  const typeOrder = new Map(BUILTIN_PRODUCTION_DOCUMENT_TYPES.types.map((entry, index) => [entry.typeId, index] as const));
  const books: ExemplarBookProjection[] = designated.map((row) => {
    const bookId = text(row.book_id);
    const firstDesignatedAt = text(row.first_designated_at);
    const latestOrdinal = integer(row.latest_ordinal);
    const latest = db.prepare('SELECT created_at FROM publication_versions WHERE book_id = ? AND ordinal = ?').get(bookId, latestOrdinal) as SqlRow;
    // Each document's latest Delivery Record names the version that stands as its exemplar; earlier delivered versions
    // stay named beneath it.
    const byDocument = new Map<string, SqlRow[]>();
    for (const delivery of deliveries) {
      if (text(delivery.book_id) !== bookId) continue;
      const list = byDocument.get(text(delivery.document_id)) ?? [];
      list.push(delivery);
      byDocument.set(text(delivery.document_id), list);
    }
    const exemplars: ExemplarProjection[] = Array.from(byDocument.values()).map((list): ExemplarProjection => {
      const last = list.at(-1)!;
      const typeId = text(last.type_id);
      const version = integer(last.version);
      const earlierVersions = Array.from(new Set(list.map((delivery) => integer(delivery.version)).filter((earlier) => earlier !== version))).sort((a, b) => a - b);
      return {
        documentId: text(last.document_id),
        typeId,
        typeLabel: productionDocumentType(typeId)?.label ?? typeId,
        version,
        revisionId: text(last.revision_id),
        revisionDigest: text(last.revision_digest),
        deliveredTo: text(last.recipient_label),
        deliveredAt: text(last.recorded_at),
        archivedAt: later(firstDesignatedAt, text(last.recorded_at)),
        earlierVersions,
        eligibility: 'house-only',
      };
    }).sort((a, b) => (typeOrder.get(a.typeId) ?? 99) - (typeOrder.get(b.typeId) ?? 99) || (a.documentId < b.documentId ? -1 : 1));
    const attribution = people.current(bookId);
    return {
      bookId,
      bookTitle: text(row.title),
      authors: attribution.authors,
      editors: attribution.editors,
      publicationOrdinal: latestOrdinal,
      designatedAt: text(latest.created_at),
      exemplars,
    };
  });
  return { books };
}
