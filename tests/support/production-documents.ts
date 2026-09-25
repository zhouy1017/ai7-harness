import type { DatabaseSync } from 'node:sqlite';

/**
 * The relations schema revisions 37 to 47 add (Issue #415, S66a to S66c; Issue #416, S67a and S67b; Issue #547; Issue #426,
 * S68a; Issue #431, S83; Issue #427, S79a and S79c; Issue #429, S81a), in drop order: the Evaluation Records' entries and the
 * records (revision 47), the 资料库 items' decisions and the items (revision 46),
 * the imported review guideline versions (revision 45), each Book's people (revision 44), the 维护事项 of each 发稿版本 (revision 43), how a
 * document's origin material was read (revision 42), a package's exports and their files (revision 41), a document's phase
 * moves and workflow instance (revision 40), the Book's 图书交付包 versions, which name documents' deliveries, then a
 * document's Delivery Records, decisions and versions before the document. A suite that plants a store at an earlier
 * revision drops them with whatever else later revisions added: a store that old never held them. Revision 37 also rebuilt
 * `manuscripts`; a planted store keeps the rebuilt relation and its partial index, which every earlier revision's
 * validation accepts, exactly as a store an earlier build planted after this one would hold them.
 */
export const PRODUCTION_DOCUMENT_RELATIONS_DROP_ORDER: ReadonlyArray<string> = [
  'evaluation_record_entries',
  'evaluation_records',
  'library_material_decisions',
  'library_materials',
  'review_guideline_versions',
  'book_people_versions',
  'maintenance_case_revisions',
  'maintenance_errata_versions',
  'maintenance_cases',
  'production_document_origin_readings',
  'book_delivery_package_export_files',
  'book_delivery_package_exports',
  'production_document_phase_transitions',
  'production_document_workflow_instances',
  'book_delivery_package_versions',
  'production_document_deliveries',
  'production_document_type_decisions',
  'production_document_versions',
  'production_documents',
];

/** Drop the relations revisions 37 to 47 added, foreign keys off around it. The caller sets the version. */
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
