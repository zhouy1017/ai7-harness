import {
  MAX_EXEMPLAR_BOOKS_PAGE,
  MAX_EXEMPLAR_EARLIER_VERSIONS,
  type ExemplarBookCursor,
  type ExemplarBookProjection,
  type ExemplarProjection,
  type ExemplarsProjection,
} from '../shared/protocol.js';

/**
 * 知识库 › 范例 (Issue #427, plan slice S79b; V2-UX-KB-004, KB-006): a Book the house produced with AI7 brings its delivered
 * documents into 范例 once a 发稿版本 is designated — those delivered before the designation at the designation, and every
 * one delivered after it as it is delivered — organized by Book and by document type, the Learning Eligibility `仅本社`
 * by default and nothing asked.
 *
 * A designation a 撤回 holds is no longer used for 发稿 in AI7 (ADR 0040), so what the Book delivers after the 撤回 waits
 * for the next designation, and comes in at it; what came in before stays, as ADR 0040 keeps the archive.
 *
 * It is a read. Each exemplar is one exact document version as a Delivery Record named it, of a Book that has a designation,
 * both append-only records already, read through their owners, which verify them exactly as 交付物 and 图书交付包 do: the
 * archive is what those records say, so it needs no relation of its own. An exemplar is referenced, never copied into a
 * manuscript or a deliverable.
 */

/** One designation as 范例 reads it: when it was set, and when a 撤回 came to hold it. */
export interface ExemplarDesignationReading {
  readonly ordinal: number;
  readonly createdAt: string;
  readonly withdrawnAt: string | null;
}

interface ExemplarDeliveryReading {
  readonly version: number;
  readonly revisionId: string;
  readonly revisionDigest: string;
  readonly recipientLabel: string;
  readonly recordedAt: string;
}

/** One house type's document, with streamed Delivery Records in either required order. */
export interface ExemplarDocumentReading {
  readonly typeId: string;
  readonly typeLabel: string;
  readonly documentId: string;
  readonly deliveries: (order: 'latest' | 'version') => Iterable<ExemplarDeliveryReading>;
}

/** What 范例 reads, each through the owner of the record. */
export interface ExemplarSources {
  /** The Books with a 发稿版本, by title, after the cursor, at most `limit` of them. */
  books(after: ExemplarBookCursor | null, limit: number): ReadonlyArray<{ readonly bookId: string; readonly title: string }>;
  /** Validate the designation ledger, retaining its latest entry and exact time lookup only. */
  archive(bookId: string): { latest: ExemplarDesignationReading; archivedAt(at: string): string | null };
  documents(bookId: string): ReadonlyArray<ExemplarDocumentReading>;
  /** Who the Book is attributed to, as its people read now. */
  people(bookId: string): { readonly authors: ReadonlyArray<string>; readonly editors: ReadonlyArray<string> };
}

/** One document's exemplar: the version its latest delivery that came into 范例 named, or `null` when none came in. */
function exemplarOf(document: ExemplarDocumentReading, archive: ReturnType<ExemplarSources['archive']>): ExemplarProjection | null {
  let latest: { delivery: ExemplarDeliveryReading; archivedAt: string } | undefined;
  // Visit every record, even after finding the latest, so old corruption cannot disappear behind a page.
  for (const delivery of document.deliveries('latest')) {
    const archivedAt = archive.archivedAt(delivery.recordedAt);
    if (latest === undefined && archivedAt !== null) latest = { delivery, archivedAt };
  }
  if (latest === undefined) return null;
  const { delivery, archivedAt } = latest;
  const earlier: number[] = [];
  let earlierVersionCount = 0;
  let lastVersion: number | undefined;
  // Version ordering makes duplicate delivery records adjacent; no history-sized Set is needed.
  for (const entry of document.deliveries('version')) {
    if (entry.version === delivery.version || entry.version === lastVersion || archive.archivedAt(entry.recordedAt) === null) continue;
    lastVersion = entry.version;
    earlierVersionCount += 1;
    earlier.push(entry.version);
    if (earlier.length > MAX_EXEMPLAR_EARLIER_VERSIONS) earlier.shift();
  }
  return {
    documentId: document.documentId,
    typeId: document.typeId,
    typeLabel: document.typeLabel,
    version: delivery.version,
    revisionId: delivery.revisionId,
    revisionDigest: delivery.revisionDigest,
    deliveredTo: delivery.recipientLabel,
    deliveredAt: delivery.recordedAt,
    archivedAt,
    earlierVersionCount,
    earlierVersions: earlier,
    eligibility: 'house-only',
  };
}

/** One page of 范例: the published Books after the cursor, by title, each with its exemplars by document type. */
export function readExemplars(sources: ExemplarSources, after: ExemplarBookCursor | null): ExemplarsProjection {
  const page = sources.books(after, MAX_EXEMPLAR_BOOKS_PAGE + 1);
  const books = page.slice(0, MAX_EXEMPLAR_BOOKS_PAGE).map((book): ExemplarBookProjection => {
    const archive = sources.archive(book.bookId);
    const latest = archive.latest;
    const attribution = sources.people(book.bookId);
    return {
      bookId: book.bookId,
      bookTitle: book.title,
      authors: attribution.authors,
      editors: attribution.editors,
      publicationOrdinal: latest.ordinal,
      designatedAt: latest.createdAt,
      withdrawn: latest.withdrawnAt !== null,
      exemplars: sources.documents(book.bookId).flatMap((document) => {
        const exemplar = exemplarOf(document, archive);
        return exemplar === null ? [] : [exemplar];
      }),
    };
  });
  const last = books.at(-1);
  return { books, nextCursor: page.length > MAX_EXEMPLAR_BOOKS_PAGE && last !== undefined ? { title: last.bookTitle, bookId: last.bookId } : null };
}
