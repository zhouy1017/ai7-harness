import type { DatabaseSync } from 'node:sqlite';

/**
 * The relations schema revisions 37 to 63 add (Issue #415, S66a to S66c; Issue #416, S67a and S67b; Issue #547; Issue #426,
 * S68a; Issue #431, S83; Issue #427, S79a and S79c; Issue #429, S81a and S81b1; Issue #94, S38; Issue #61, S26a and S26b; Issue #430, S82;
 * Issue #63, S28a and S28b; Issue #433, S85a; Issue #434, S86a to S86d; Issue #52, S17a; Issue #64, S29b; Issue #429, S81c; Issue #65, S30), in drop order: the Developer Capability Proposals' files and versions,
 * the Review Runs' procedure pins, the Captured Procedures' states, versions and identities (revision 63), the 审稿意见 drafts and Tasks
 * (revision 62), the Series Retrieval Exclusions (revision 61), the dialogue Tasks' conversions,
 * outcomes, spans, bindings, attempts and the Tasks (revision 60), the AI7 初评 each Evaluation Record version began from (revision 59), the merges of a package's Books and the Books each took (revision 58), the replacements of the local data (revision 57), the scheduled backups (revision 56), the database exports (revision 55), the store's version records (revision 54), Series Knowledge's promotion decisions, revisions, candidates and items (revision 53),
 * the Series membership changes and the Series (revision 52), the house's evaluation
 * preferences and the 定价与首印 entries (revision 51), the Learning Eligibility decisions (revision 50), the Proposal Decisions' feedback (revision 49), the analysis feedback signals (revision 48), the Evaluation Records' entries and the records (revision 47), the 资料库 items' decisions and the items (revision 46),
 * the imported review guideline versions (revision 45), each Book's people (revision 44), the 维护事项 of each 发稿版本 (revision 43), how a
 * document's origin material was read (revision 42), a package's exports and their files (revision 41), a document's phase
 * moves and workflow instance (revision 40), the Book's 图书交付包 versions, which name documents' deliveries, then a
 * document's Delivery Records, decisions and versions before the document. A suite that plants a store at an earlier
 * revision drops them with whatever else later revisions added: a store that old never held them. Revision 37 also rebuilt
 * `manuscripts`; a planted store keeps the rebuilt relation and its partial index, which every earlier revision's
 * validation accepts, exactly as a store an earlier build planted after this one would hold them.
 */
export const PRODUCTION_DOCUMENT_RELATIONS_DROP_ORDER: ReadonlyArray<string> = [
  // 资料索引 (revision 67; Issue #428, S80a): the segments, then the builds, which name 资料库 items.
  'material_index_segments',
  'material_index_builds',
  // 写作任务 (revision 65; Issue #432, S84a): its drafts, which name documents, and its Tasks.
  'writing_drafts',
  'writing_tasks',
  // 按我的评分重写评语 (revision 64; Issue #429, S81b2): its decisions and Task records.
  'evaluation_rewrite_decisions',
  'evaluation_rewrite_tasks',
  'developer_capability_proposal_exports',
  'developer_capability_proposals',
  'review_run_procedure_pins',
  'captured_procedure_states',
  'captured_procedure_versions',
  'captured_procedures',
  // 审稿意见 (revision 62; Issue #429, S81c): its drafts and Tasks.
  'readers_report_drafts',
  'readers_report_tasks',
  // 书系检索排除 (revision 61; Issue #64, S29b): each revision of an exclusion (Issue #674).
  'series_retrieval_exclusions',
  'dialogue_conversions',
  'dialogue_attempt_outcomes',
  'dialogue_harness_spans',
  'dialogue_execution_bindings',
  'dialogue_attempts',
  'dialogue_tasks',
  'evaluation_initial_drafts',
  'database_merge_books',
  'database_merges',
  'database_replacements',
  'scheduled_backup_removals',
  'scheduled_backups',
  'backup_preferences',
  'database_export_receipts',
  'database_export_approvals',
  'database_export_preparations',
  'store_versions',
  'series_knowledge_conflicts',
  'series_knowledge_promotions',
  'series_knowledge_revisions',
  'series_knowledge_candidates',
  'series_knowledge_items',
  'series_membership_changes',
  'series',
  'evaluation_preferences',
  'publication_actuals',
  'learning_eligibility_decisions',
  'proposal_decision_feedback',
  'analysis_feedback_signals',
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

/**
 * The relation an open writes by itself (Issue #433, S85a): the store's record of the versions that opened it. Every other
 * relation a migration adds starts empty.
 */
export const OPENING_RECORD_RELATIONS: ReadonlyArray<string> = ['store_versions'];
/** The relations revisions 37 to 63 add that a migration leaves empty: all but the store's version record. */
export const MIGRATION_EMPTY_RELATIONS: ReadonlyArray<string> = PRODUCTION_DOCUMENT_RELATIONS_DROP_ORDER.filter((relation) => !OPENING_RECORD_RELATIONS.includes(relation));

/** Drop the relations revisions 37 to 63 added, foreign keys off around it. The caller sets the version. */
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
