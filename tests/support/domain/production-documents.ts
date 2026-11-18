import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { ProductionDocumentOperationsHost } from '../../../src/service/production-document-operations.js';
import { ProductionDocumentOriginError } from '../../../src/service/production-document-origins.js';
import { ProductionDocumentWorkflow, ProductionDocumentWorkflowError } from '../../../src/service/production-document-workflow.js';
import { ProductionDocumentError, ProductionDocuments } from '../../../src/service/production-documents.js';
import { domainWorkflowPin, guarded, transaction } from './evaluation.js';

const notExercised = (): never => { throw new Error("the block store's checkpoint work is not exercised over the domain relations"); };

// 生产文档 over the domain relations. The documents' ledgers, the workflow and the block store are the production classes on
// production relations; only the Book and its primary Manuscript are seeded, minimally (an external owner's rows).

export interface ProductionDocumentFixture {
  readonly host: ProductionDocumentOperationsHost;
  readonly boundedAuthority: ProductionDocumentOperationsHost['boundedAuthority'];
  readonly productionDocuments: ProductionDocuments;
}

export async function productionDocumentFixture(db: DatabaseSync): Promise<ProductionDocumentFixture> {
  const documentWorkflow = new ProductionDocumentWorkflow(db, await domainWorkflowPin());
  const productionDocuments = new ProductionDocuments(db, () => null, documentWorkflow);
  const documentCall = guarded(ProductionDocumentError, ProductionDocumentWorkflowError, ProductionDocumentOriginError);
  // The block store is an external owner: its one read these operations make of a made document — how many graphemes the new
  // branch holds — is answered from the working blocks the operation just wrote; its checkpoint work is not exercised here.
  const boundedAuthority: ProductionDocumentOperationsHost['boundedAuthority'] = {
    initializeImportedBranch: (branchId) => Number((db.prepare('SELECT coalesce(sum(grapheme_length), 0) AS total FROM working_blocks WHERE branch_id = ?').get(branchId) as { total: number }).total),
    createManuscriptCheckpointWork: notExercised, advanceManuscriptCheckpointWork: notExercised,
    finalizeManuscriptCheckpointWork: notExercised, cancelManuscriptCheckpointWork: notExercised,
  };
  const host: ProductionDocumentOperationsHost = {
    assertAvailable: () => {},
    authority: db,
    boundedAuthority,
    boundedCall: (operation) => operation(),
    contentObjectPath: () => { throw new Error('no retained file object in the domain relations'); },
    documentCall,
    documentWorkflow,
    productionDocuments,
    transaction,
  };
  return { host, boundedAuthority, productionDocuments };
}

/** A Book with its primary Manuscript at one revision: the minimal upstream rows a blank document starts from. */
export function seedPrimaryManuscript(db: DatabaseSync, bookId: string): { manuscriptId: string; branchId: string; revisionId: string; sourceVersionId: string } {
  const manuscriptId = randomUUID();
  const branchId = randomUUID();
  const revisionId = randomUUID();
  const sourceVersionId = randomUUID();
  const now = '2026-11-17T00:00:00.000Z';
  db.prepare(`INSERT INTO source_versions(source_version_id, book_id, object_digest, source_digest, format, display_name, created_at)
    VALUES (?, ?, ?, ?, 'DOCX', '稿件.docx', ?)`).run(sourceVersionId, bookId, 'd'.repeat(64), 'e'.repeat(64), now);
  db.prepare("INSERT INTO manuscripts(manuscript_id, book_id, role, created_at) VALUES (?, ?, 'primary', ?)").run(manuscriptId, bookId, now);
  db.prepare('INSERT INTO manuscript_branches(branch_id, manuscript_id, name, base_revision_id, created_at) VALUES (?, ?, ?, ?, ?)').run(branchId, manuscriptId, 'main', revisionId, now);
  db.prepare(`INSERT INTO manuscript_revisions(revision_id, manuscript_id, branch_id, ordinal, revision_label, parent_revision_id, source_version_id, revision_digest, created_at)
    VALUES (?, ?, ?, 1, 'r1', NULL, ?, ?, ?)`).run(revisionId, manuscriptId, branchId, sourceVersionId, 'c'.repeat(64), now);
  db.prepare(`INSERT INTO branch_working_state(branch_id, manuscript_id, base_revision_id, journal_sequence, working_digest, total_graphemes, history_sequence, last_checkpoint_sequence)
    VALUES (?, ?, ?, 0, ?, 0, 0, 0)`).run(branchId, manuscriptId, revisionId, 'c'.repeat(64));
  return { manuscriptId, branchId, revisionId, sourceVersionId };
}
