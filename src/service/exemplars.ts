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

/** One house type's document of a Book, with its every Delivery Record newest first. */
export interface ExemplarDocumentReading {
  readonly typeId: string;
  readonly typeLabel: string;
  readonly documentId: string;
  readonly deliveries: ReadonlyArray<{
    readonly version: number;
    readonly revisionId: string;
    readonly revisionDigest: string;
    readonly recipientLabel: string;
    readonly recordedAt: string;
  }>;
}

/** What 范例 reads, each through the owner of the record. */
export interface ExemplarSources {
  /** The Books with a 发稿版本, by title, after the cursor, at most `limit` of them. */
  books(after: ExemplarBookCursor | null, limit: number): ReadonlyArray<{ readonly bookId: string; readonly title: string }>;
  /** Every designation of the Book, oldest first. */
  designations(bookId: string): ReadonlyArray<ExemplarDesignationReading>;
  documents(bookId: string): ReadonlyArray<ExemplarDocumentReading>;
  /** Who the Book is attributed to, as its people read now. */
  people(bookId: string): { readonly authors: ReadonlyArray<string>; readonly editors: ReadonlyArray<string> };
}

/**
 * When a delivery recorded at `at` came into 范例: at once while a designation stood in AI7 — the Book's newest designation
 * then, which no 撤回 recorded by then holds — and otherwise at the next designation after it, as one delivered before the
 * first comes in at the first. `null` while none has come since: delivered after a 撤回, it waits for another 发稿版本.
 * The instants are ISO 8601 in UTC, as the records write them, so they compare as text.
 */
export function exemplarArchivedAt(at: string, designations: ReadonlyArray<ExemplarDesignationReading>): string | null {
  const standing = designations.filter((designation) => designation.createdAt <= at).at(-1);
  if (standing !== undefined && (standing.withdrawnAt === null || standing.withdrawnAt > at)) return at;
  return designations.find((designation) => designation.createdAt > at)?.createdAt ?? null;
}

/** One document's exemplar: the version its latest delivery that came into 范例 named, or `null` when none came in. */
function exemplarOf(document: ExemplarDocumentReading, designations: ReadonlyArray<ExemplarDesignationReading>): ExemplarProjection | null {
  const admitted = document.deliveries.flatMap((delivery) => {
    const archivedAt = exemplarArchivedAt(delivery.recordedAt, designations);
    return archivedAt === null ? [] : [{ delivery, archivedAt }];
  });
  const latest = admitted[0];
  if (latest === undefined) return null;
  const { delivery, archivedAt } = latest;
  const earlier = Array.from(new Set(admitted.slice(1).map((entry) => entry.delivery.version).filter((version) => version !== delivery.version)))
    .sort((a, b) => a - b);
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
    earlierVersionCount: earlier.length,
    earlierVersions: earlier.slice(-MAX_EXEMPLAR_EARLIER_VERSIONS),
    eligibility: 'house-only',
  };
}

/** One page of 范例: the published Books after the cursor, by title, each with its exemplars by document type. */
export function readExemplars(sources: ExemplarSources, after: ExemplarBookCursor | null): ExemplarsProjection {
  const page = sources.books(after, MAX_EXEMPLAR_BOOKS_PAGE + 1);
  const books = page.slice(0, MAX_EXEMPLAR_BOOKS_PAGE).map((book): ExemplarBookProjection => {
    const designations = sources.designations(book.bookId);
    const latest = designations.at(-1)!;
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
        const exemplar = exemplarOf(document, designations);
        return exemplar === null ? [] : [exemplar];
      }),
    };
  });
  const last = books.at(-1);
  return { books, nextCursor: page.length > MAX_EXEMPLAR_BOOKS_PAGE && last !== undefined ? { title: last.bookTitle, bookId: last.bookId } : null };
}
