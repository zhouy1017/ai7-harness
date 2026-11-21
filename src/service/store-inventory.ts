import { statSync } from 'node:fs';
import { openPackageStore } from './database-exports.js';

/**
 * Read-only business inventory of a store (Issue #1556; ADR 0105 §5 step 5). The R5 upgrade tool (R5-6) runs it on the
 * old and on the new store and compares.
 *
 * What it touches. The store is opened with `openPackageStore` (read-only, defensive). Nothing is written to the main file
 * or to the write-ahead log, and nothing is checkpointed or migrated. On a WAL-mode store the read-only open does leave
 * sidecar files: `<store>-shm` (the shared-memory index, rewritten by every reader) and, when absent, an empty
 * `<store>-wal`. The bytes of the main file and of a non-empty `-wal` stay unchanged; `-shm` does not. Rows still in an
 * un-checkpointed WAL are counted. A caller that needs a byte-stable directory must inventory a copy.
 *
 * Output: `entities` are the D7 business counts the upgrade must keep EQUAL; `tables` are physical row counts of every
 * carried table. A value outside a fixed vocabulary is counted in that group's `other`.
 *
 * Known differences R5-6 must expect between the old store and the upgraded one (not implemented here):
 * - `tables.manuscript_revisions`: one 「升级时的稿件」 revision more per manuscript (ADR 0105 §5), so old + `manuscripts` rows;
 * - `tables.working_offset_nodes`: dropped by the position conversion (ADR 0105 §6), so 0 after the upgrade;
 * - `tables.store_versions`: one more row, the Data Version 2 record;
 * - the other position-keyed tables are converted (ADR 0105 §6); R5-6 states any further difference when it lands.
 * `entities` carries none of these, so it is compared by plain equality.
 */

/** Tables that are carried by the upgrade and counted. Every table of a store is here or in `NOT_COUNTED`. */
export const INVENTORY_TABLES = [
  'ai_edit_lock_events',
  'analysis_clarification_answers',
  'analysis_clarification_requests',
  'analysis_execution_attempts',
  'analysis_execution_bindings',
  'analysis_feedback_signals',
  'analysis_harness_spans',
  'analysis_outcome_resolutions',
  'analysis_plan_adaptations',
  'analysis_plan_records',
  'analysis_plan_revisions',
  'analysis_plan_versions',
  'analysis_result_set_revisions',
  'analysis_result_sets',
  'analysis_run_authorizations',
  'analysis_run_records',
  'analysis_run_states',
  'analysis_task_input_checkpoints',
  'analysis_task_intents',
  'analysis_task_outcomes',
  'analysis_unit_checkpoints',
  'analysis_unit_results',
  'background_analysis_enrollment_states',
  'background_analysis_enrollment_versions',
  'background_analysis_enrollments',
  'backup_preferences',
  'book_delivery_package_export_files',
  'book_delivery_package_exports',
  'book_delivery_package_versions',
  'book_dimension_sets',
  'book_dimensions',
  'book_people_versions',
  'books',
  'branch_working_state',
  'captured_procedure_states',
  'captured_procedure_versions',
  'captured_procedures',
  'content_objects',
  'correction_proposals',
  'custom_analysis_dimension_states',
  'custom_analysis_dimension_versions',
  'custom_analysis_dimensions',
  'database_export_approvals',
  'database_export_preparations',
  'database_export_receipts',
  'database_merge_books',
  'database_merges',
  'database_replacements',
  'default_execution_rule_states',
  'default_execution_rule_versions',
  'default_execution_rules',
  'developer_capability_proposal_exports',
  'developer_capability_proposals',
  'dialogue_attempt_outcomes',
  'dialogue_attempts',
  'dialogue_conversions',
  'dialogue_execution_bindings',
  'dialogue_harness_spans',
  'dialogue_tasks',
  'earlier_exemplar_books',
  'earlier_exemplar_eligibility',
  'earlier_exemplar_versions',
  'edit_journal_entries',
  'editor_inline_revision_commands',
  'editor_inline_revision_marks',
  'editorial_learning_controls',
  'editorial_mark_replies',
  'editorial_marks',
  'editorial_workspace_profile_book_pins',
  'editorial_workspace_profile_sidecar_revisions',
  'evaluation_initial_drafts',
  'evaluation_preferences',
  'evaluation_profile_versions',
  'evaluation_record_entries',
  'evaluation_records',
  'evaluation_rewrite_decisions',
  'evaluation_rewrite_tasks',
  'execution_plans',
  'export_approvals',
  'export_preparations',
  'export_receipts',
  'factual_claim_events',
  'factual_claim_ledgers',
  'factual_claim_sessions',
  'factual_review_decisions',
  'factual_run_assurance',
  'factual_verification_results',
  'global_editorial_memory_item_versions',
  'global_editorial_memory_items',
  'house_review_preference_versions',
  'house_word_list_versions',
  'import_abandonment_cleanup_intents',
  'import_commit_attempts',
  'import_commits',
  'import_degradation_decisions',
  'import_drafts',
  'import_fidelity_categories',
  'import_fidelity_choices',
  'import_fidelity_reviews',
  'import_ingest_blocks',
  'imported_skill_current_selections',
  'imported_skill_revisions',
  'imported_skill_snapshots',
  'imported_skill_states',
  'imported_skill_update_candidates',
  'imported_skill_update_rules',
  'imported_skills',
  'initial_evaluation_tasks',
  'learning_eligibility_decisions',
  'learning_signals',
  'learning_supervision_directives',
  'library_material_decisions',
  'library_materials',
  'maintenance_case_revisions',
  'maintenance_cases',
  'maintenance_errata_versions',
  'manuscript_block_lineage',
  'manuscript_block_sources',
  'manuscript_block_versions',
  'manuscript_blocks',
  'manuscript_branches',
  'manuscript_command_edits',
  'manuscript_command_groups',
  'manuscript_effect_approvals',
  'manuscript_effect_dispatches',
  'manuscript_effect_intents',
  'manuscript_effect_receipts',
  'manuscript_effect_targets',
  'manuscript_entry_positions',
  'manuscript_import_lineage',
  'manuscript_import_records',
  'manuscript_note_sources',
  'manuscript_outcome_recovery',
  'manuscript_outline',
  'manuscript_recovery_review_status',
  'manuscript_reimport_comparisons',
  'manuscript_reimport_group_members',
  'manuscript_reimport_group_resolutions',
  'manuscript_reimport_group_sets',
  'manuscript_reimport_groups',
  'manuscript_reimport_mapping_resolutions',
  'manuscript_reimport_mappings',
  'manuscript_reimport_mark_outcomes',
  'manuscript_reimport_records',
  'manuscript_revisions',
  'manuscripts',
  'material_index_builds',
  'material_index_segments',
  'material_index_translations',
  'material_index_vectors',
  'material_translation_attempts',
  'milestone_signoff_records',
  'milestone_versions',
  'model_service_connections',
  'model_role_choices', // R5-F1a
  'native_artifact_book_enablements',
  'native_artifact_installations',
  'plan_envelopes',
  'procedure_definition_versions',
  'procedure_definitions',
  'procedure_plan_pins',
  'procedure_run_choices',
  'procedure_version_origins',
  'procedure_version_stops',
  'production_document_categories',
  'production_document_deliveries',
  'production_document_metadata',
  'production_document_origin_readings',
  'production_document_phase_transitions',
  'production_document_type_decisions',
  'production_document_versions',
  'production_document_workflow_instances',
  'production_documents',
  'proposal_atomic_groups',
  'proposal_change_items',
  'proposal_conflict_deferrals',
  'proposal_conflict_drafts',
  'proposal_conflict_outcomes',
  'proposal_decision_drafts',
  'proposal_decision_feedback',
  'proposal_decision_reasons',
  'proposal_decisions',
  'proposal_item_decisions',
  'proposal_review_positions',
  'provider_resolution_plans',
  'public_release_permissions',
  'publication_actuals',
  'publication_events',
  'publication_versions',
  'quality_signals',
  'readers_report_drafts',
  'readers_report_tasks',
  'recovery_attention',
  'recovery_decisions',
  'recovery_restorations',
  'recovery_restore_stage_blocks',
  'recovery_restore_stages',
  'recovery_snapshots',
  'research_evidence',
  'research_evidence_contents',
  'research_evidence_materials',
  'research_evidence_unit_revisions',
  'research_evidence_units',
  'review_excluded_findings',
  'review_finding_dispositions',
  'review_findings',
  'review_guideline_versions',
  'review_local_stage_artifacts',
  'review_reports',
  'review_run_authorizations',
  'review_run_category_events',
  'review_run_preference_pins',
  'review_run_procedure_pins',
  'review_run_synthesis',
  'review_runs',
  'run_authorizations',
  'run_records',
  'run_source_scopes',
  'scheduled_backup_removals',
  'scheduled_backups',
  'search_backend_connections',
  'search_backend_fallback',
  'series',
  'series_knowledge_candidates',
  'series_knowledge_conflicts',
  'series_knowledge_items',
  'series_knowledge_promotions',
  'series_knowledge_revisions',
  'series_membership_changes',
  'series_retrieval_exclusions',
  'service_lifetime_branch_writes',
  'service_lifetimes',
  'source_import_records',
  'source_provenance',
  'source_versions',
  'staged_import_block_sources',
  'staged_import_blocks',
  'staged_import_marks',
  'staged_import_note_sources',
  'staged_import_paragraph_pieces',
  'staged_import_snapshots',
  'staged_import_structure_choices',
  'staged_import_text_box_paragraphs',
  'staged_word_revision_intakes',
  'store_versions',
  'task_artifact_pins',
  'task_input_checkpoints',
  'task_intent_draft_promotions',
  'task_intent_draft_versions',
  'task_intent_drafts',
  'task_intents',
  'task_manuscript_pins',
  'word_import_mark_sources',
  'word_manuscript_source_segments',
  'word_revision_imports',
  'word_revision_sources',
  'word_tracked_edit_sample_imports',
  'word_tracked_edit_samples',
  'workflow_instances',
  'workflow_profiles',
  'working_blocks',
  'working_offset_nodes',
  'writing_drafts',
  'writing_tasks',
] as const;

/** Tables that are deliberately not counted, with why. ADR 0105 §5 drops the five UI-session tables and rebuilds the FTS search tables; every other table is copied. */
export const NOT_COUNTED: Readonly<Record<string, string>> = {
  manuscript_search_sessions: 'UI session: an open search; ADR 0105 §5 drops it',
  manuscript_search_results: 'UI session: an open search; ADR 0105 §5 drops it',
  manuscript_replacement_previews: 'UI session: an open 全部替换 preview; ADR 0105 §5 drops it',
  manuscript_replacement_matches: 'UI session: an open 全部替换 preview; ADR 0105 §5 drops it',
  task_launch_snapshots: 'UI session: instance-local launch commands; ADR 0105 §5 drops it',
  working_block_search: 'search index (FTS virtual table); rebuilt by the upgrade (ADR 0105 §5)',
  working_block_search_config: 'search index shadow table; rebuilt by the upgrade (ADR 0105 §5)',
  working_block_search_content: 'search index shadow table; rebuilt by the upgrade (ADR 0105 §5)',
  working_block_search_data: 'search index shadow table; rebuilt by the upgrade (ADR 0105 §5)',
  working_block_search_docsize: 'search index shadow table; rebuilt by the upgrade (ADR 0105 §5)',
  working_block_search_idx: 'search index shadow table; rebuilt by the upgrade (ADR 0105 §5)',
};

/** Tables that are neither counted nor listed as not counted, or are both. The guard of the policy test. */
export function inventoryCoverageGaps(tables: Iterable<string>): { readonly missing: string[]; readonly both: string[] } {
  const counted = new Set<string>(INVENTORY_TABLES);
  const missing: string[] = [];
  const both: string[] = [];
  for (const table of tables) {
    const inCounted = counted.has(table);
    const inNot = Object.hasOwn(NOT_COUNTED, table);
    if (!inCounted && !inNot) missing.push(table);
    if (inCounted && inNot) both.push(table);
  }
  return { missing, both };
}

/** House review preference versions have no title field; non-empty line text is counted instead.
 * Memory activation is /1's state; /2 uses state and operationalScope. Learning control switch values
 * carry enablement. These are persisted counts, never a calculation of effective usability.
 */
export function inventoryStore(path: string): string {
  if (statSync(path).size === 0) throw new Error('STORE_INVENTORY_EMPTY_FILE: the store file is empty');
  const db = openPackageStore(path);
  try {
    // One read snapshot; its read lock lasts only until this connection closes. No checkpoint or migration.
    db.exec('BEGIN');
    const exists = (table: string): boolean => db.prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = ?").get(table) !== undefined;
    if (!exists('books') || !exists('store_versions')) throw new Error('STORE_INVENTORY_NOT_A_STORE: the file has no books or store_versions relation');
    const count = (table: string, where = '1'): number => exists(table)
      ? Number(db.prepare(`SELECT count(*) AS n FROM "${table}" WHERE ${where}`).get()!.n) : 0;
    const tables = Object.fromEntries(INVENTORY_TABLES.map((table) => [table, count(table)]));
    // Fixed vocabularies keep arbitrary stored strings (including titles and identifiers) out of JSON keys.
    // A value outside the vocabulary (or null) is counted in `other`, so no row drops out of a group silently.
    const groups = (table: string, expression: string, values: readonly string[], where = '1'): Record<string, number> => {
      const known = Object.fromEntries(values.map((value) => [value, count(table, `(${where}) AND (${expression}) = '${value}'`)]));
      return { ...known, other: count(table, where) - Object.values(known).reduce((sum, n) => sum + n, 0) };
    };
    const scopes = ['ordinary-production', 'developer-live', 'development-ci'] as const;
    const memory = (current: boolean) => {
      const table = 'global_editorial_memory_item_versions';
      const where = current ? 'ordinal = (SELECT max(v.ordinal) FROM global_editorial_memory_item_versions v WHERE v.item_id = global_editorial_memory_item_versions.item_id)' : '1';
      return {
        total: count(table, where),
        withTitle: count(table, `(${where}) AND length(trim(json_extract(canonical_json, '$.title'))) > 0`),
        byState: groups(table, "coalesce(json_extract(canonical_json, '$.state'), json_extract(canonical_json, '$.activation'))", ['proposed', 'active', 'inactive', 'frozen'], where),
        titledByState: groups(table, "coalesce(json_extract(canonical_json, '$.state'), json_extract(canonical_json, '$.activation'))", ['proposed', 'active', 'inactive', 'frozen'], `(${where}) AND length(trim(json_extract(canonical_json, '$.title'))) > 0`),
        byScope: groups(table, "coalesce(json_extract(canonical_json, '$.operationalScope'), 'legacy')", [...scopes, 'legacy'], where),
      };
    };
    const preferences = Object.fromEntries(scopes.map((scope) => {
      const table = 'house_review_preference_versions';
      const lines = (nonEmpty: boolean): number => exists(table) ? Number(db.prepare(`SELECT count(*) AS n FROM house_review_preference_versions, json_each(canonical_json, '$.lines') line
        WHERE json_extract(canonical_json, '$.operationalScope') = ? ${nonEmpty ? "AND length(trim(json_extract(line.value, '$.text'))) > 0" : ''}`).get(scope)!.n) : 0;
      return [scope, { versions: count(table, `json_extract(canonical_json, '$.operationalScope') = '${scope}'`), lines: lines(false), withText: lines(true) }];
    }));
    // The D7 entities. Relations the upgrade changes by design (revisions, offset nodes, store versions) are left out.
    const relations = ['books', 'production_documents', 'production_document_versions', 'content_objects', 'source_versions', 'editorial_mark_replies',
      'milestone_versions', 'publication_versions', 'analysis_result_sets', 'review_runs', 'review_findings', 'review_reports', 'review_run_synthesis',
      'evaluation_records', 'readers_report_drafts', 'writing_drafts', 'model_service_connections', 'model_role_choices', 'search_backend_connections', 'backup_preferences', 'evaluation_preferences'];
    return JSON.stringify({
      entities: {
        relations: Object.fromEntries(relations.map((table) => [table, tables[table]])),
        manuscripts: groups('manuscripts', 'role', ['primary', 'production-document']),
        marks: {
          byKind: groups('editorial_marks', 'kind', ['change-suggestion', 'annotation', 'editor-note', 'personal-highlight']),
          byStatus: groups('editorial_marks', 'status', ['open', 'resolved', 'applied', 'removed', 'converted']),
          byAuthorKind: groups('editorial_marks', 'source_kind', ['editor', 'ai7', 'imported-author']),
        },
        memory: { versions: memory(false), currentItems: memory(true) },
        preferences,
        learningControls: Object.fromEntries(['switch', 'book'].map((kind) => [kind,
          groups('editorial_learning_controls', 'value', ['0', '1'], `kind = '${kind}'`)])),
      },
      tables,
    });
  } finally {
    db.close();
  }
}
