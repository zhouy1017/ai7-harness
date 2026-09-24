import type { DatabaseSync } from 'node:sqlite';

/**
 * The relations schema revisions 37 to 39 add (Issue #415, S66a and S66b; Issue #416, S67a), in drop order: the Book's
 * 图书交付包 versions, which name documents' deliveries, then a document's Delivery Records, decisions and versions
 * before the document. A suite that plants a store at an earlier revision drops them with whatever
 * else later revisions added: a store that old never held them. Revision 37 also rebuilt `manuscripts`; a planted store
 * keeps the rebuilt relation and its partial index, which every earlier revision's validation accepts, exactly as a store
 * an earlier build planted after this one would hold them.
 */
export const PRODUCTION_DOCUMENT_RELATIONS_DROP_ORDER: ReadonlyArray<string> = [
  'book_delivery_package_versions',
  'production_document_deliveries',
  'production_document_type_decisions',
  'production_document_versions',
  'production_documents',
];

/** Drop the relations revisions 37 to 39 added, foreign keys off around it. The caller sets the version. */
export function dropProductionDocumentRelations(database: DatabaseSync): void {
  database.exec('PRAGMA foreign_keys = OFF');
  try {
    database.exec('BEGIN IMMEDIATE');
    try {
      // A suite may plant one earlier revision over another, so a relation already gone stays gone.
      for (const relation of PRODUCTION_DOCUMENT_RELATIONS_DROP_ORDER) database.exec(`DROP TABLE IF EXISTS ${relation}`);
      database.exec('COMMIT');
    } catch (error) {
      database.exec('ROLLBACK');
      throw error;
    }
  } finally {
    database.exec('PRAGMA foreign_keys = ON');
  }
}
