import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import type { DatabaseSync } from 'node:sqlite';
import { sha256Hex } from '../../../src/service/analysis/canonical.js';
import { BookPeople } from '../../../src/service/book-people.js';
import { ImportedExemplarError, ImportedExemplars } from '../../../src/service/imported-exemplars.js';
import { LearningEligibilityError, LearningEligibilityLedger } from '../../../src/service/learning-eligibility.js';
import {
  ProductionDocumentOriginError,
} from '../../../src/service/production-document-origins.js';
import {
  READERS_REPORT_DOCUMENT_TYPES,
  READERS_REPORT_DOCUMENT_TYPES_DIGEST,
  readersReportDocumentTypeId,
} from '../../../src/service/production-document-types.js';
import { ProductionDocumentWorkflow, ProductionDocumentWorkflowError } from '../../../src/service/production-document-workflow.js';
import { ProductionDocumentError, ProductionDocuments } from '../../../src/service/production-documents.js';
import {
  ReadersReportError,
  ReadersReports,
  readersReportExemplarsOf,
  type ReadersReportExemplarHost,
} from '../../../src/service/readers-reports.js';
import { EvaluationError } from '../../../src/service/evaluation-records.js';
import type { ExemplarSources } from '../../../src/service/exemplars.js';
import { UUID_PATTERN, asString, requireStore, type SqlRow } from '../../../src/service/store-records.js';
import { one } from '../../../src/service/store-operation-support.js';
import type { ReadersReportTemplate } from '../../../src/shared/protocol/task-kinds.js';
import { domainWorkflowPin, guarded, publicationCall, seededPublicationVersions } from './evaluation.js';
import { transaction } from './transaction.js';

// The 范例 side of 审稿意见 over the domain relations. The ledgers are the production classes on production relations; the
// store's guarded calls are test-owned (`guarded`), and the Book's 发稿版本 is read from seeded rows (an external-owner
// stand-in, as for 评估 itself).

export interface ReadersReportExemplarFixture {
  readonly host: ReadersReportExemplarHost;
  readonly productionDocuments: ProductionDocuments;
  readonly readersReports: ReadersReports;
  /** One Book's 审稿意见 draft: a Production Document of the template's type, with one saved version holding `words`. */
  draft(bookId: string, template: ReadersReportTemplate, words: ReadonlyArray<string>): { documentId: string; revisionId: string; revisionDigest: string };
}

export async function readersReportExemplarFixture(db: DatabaseSync): Promise<ReadersReportExemplarFixture> {
  const productionDocuments = new ProductionDocuments(db, () => null, new ProductionDocumentWorkflow(db, await domainWorkflowPin()));
  const readersReports = new ReadersReports(db);
  const host: ReadersReportExemplarHost = {
    authority: db,
    bookPeople: new BookPeople(db),
    documentCall: guarded(ProductionDocumentError, ProductionDocumentWorkflowError, ProductionDocumentOriginError),
    evaluationBookTitle: (bookId) => {
      requireStore(UUID_PATTERN.test(bookId), 'BOOK_INVALID', '图书标识无效。');
      return asString(one(db.prepare('SELECT title FROM books WHERE book_id = ?').all(bookId) as SqlRow[], 'BOOK_NOT_FOUND', '图书不存在。').title);
    },
    exemplarSources: (): ExemplarSources => ({
      books: () => [],
      archive: (bookId) => {
        const row = db.prepare('SELECT ordinal, created_at FROM publication_versions WHERE book_id = ? ORDER BY ordinal DESC LIMIT 1').get(bookId) as { ordinal: number; created_at: string };
        return { latest: { ordinal: row.ordinal, createdAt: row.created_at, withdrawnAt: null }, archivedAt: () => null };
      },
      documents: () => [],
      people: () => ({ authors: [], editors: [] }),
      readersReports: (bookId, designation) => readersReportExemplarsOf(host, bookId, designation),
    }),
    importedCall: guarded(ImportedExemplarError),
    importedExemplars: new ImportedExemplars(db, tmpdir()),
    learningCall: guarded(LearningEligibilityError),
    learningEligibility: new LearningEligibilityLedger(db),
    productionDocuments,
    publicationCall,
    publicationVersions: seededPublicationVersions(db),
    readersReportCall: guarded(ReadersReportError, EvaluationError),
    readersReports,
    transaction,
  };
  return {
    host, productionDocuments, readersReports,
    draft(bookId, template, words) {
      const documentId = randomUUID();
      const branchId = randomUUID();
      const revisionId = randomUUID();
      const now = new Date().toISOString();
      const typeId = readersReportDocumentTypeId(template);
      const digests = words.map((text) => sha256Hex(JSON.stringify({ kind: 'paragraph', level: null, text })));
      const revisionDigest = sha256Hex(`${documentId}\u0000${digests.join('\u0000')}`);
      db.prepare("INSERT INTO manuscripts(manuscript_id, book_id, role, created_at) VALUES (?, ?, 'production-document', ?)").run(documentId, bookId, now);
      db.prepare('INSERT INTO manuscript_branches(branch_id, manuscript_id, name, created_at) VALUES (?, ?, ?, ?)').run(branchId, documentId, '审稿意见', now);
      db.prepare(`INSERT INTO manuscript_revisions(revision_id, manuscript_id, branch_id, ordinal, revision_label, parent_revision_id, source_version_id, revision_digest, created_at)
        VALUES (?, ?, ?, 1, 'r1', NULL, ?, ?, ?)`).run(revisionId, documentId, branchId, randomUUID(), revisionDigest, now);
      let offset = 0;
      words.forEach((text, index) => {
        const blockId = `blk_${sha256Hex(`${revisionId}\u0000${index + 1}`).slice(0, 24)}`;
        const length = [...new Intl.Segmenter('zh-CN', { granularity: 'grapheme' }).segment(text)].length;
        db.prepare('INSERT INTO manuscript_blocks(block_id, manuscript_id, created_revision_id) VALUES (?, ?, ?)').run(blockId, documentId, revisionId);
        db.prepare(`INSERT INTO manuscript_block_versions(revision_id, block_id, position, kind, level, text, digest, start_offset, grapheme_length)
          VALUES (?, ?, ?, 'paragraph', NULL, ?, ?, ?, ?)`).run(revisionId, blockId, index + 1, text, digests[index]!, offset, length);
        offset += length;
      });
      productionDocuments.record({ documentId, bookId, typeId, originSourceVersionId: randomUUID(), parserIdentity: 'ai7.readers-report-draft/1', createdAt: now },
        { types: READERS_REPORT_DOCUMENT_TYPES, digest: READERS_REPORT_DOCUMENT_TYPES_DIGEST });
      productionDocuments.recordVersion(documentId, revisionId, revisionDigest, 'created');
      readersReports.recordDraft({ documentId, bookId, template, analysisRevisionId: randomUUID(), taskIntentId: randomUUID(), recordId: randomUUID(), recordedAt: now });
      return { documentId, revisionId, revisionDigest };
    },
  };
}

