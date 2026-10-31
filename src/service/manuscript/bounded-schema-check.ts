import { ANALYSIS_LEDGER_EXPECTED_SCHEMA_SQL, PRE_17_ANALYSIS_LEDGER_EXPECTED_SCHEMA_SQL, PRE_17_ANALYSIS_LEDGER_TRIGGER_SQL, MODEL_SERVICE_CONNECTION_REVISION_11_SQL, MODEL_SERVICE_CONNECTION_REVISION_72_SQL, MODEL_SERVICE_CONNECTION_REVISION_84_SQL, MODEL_SERVICE_CONNECTION_SCHEMA_SQL, MANUSCRIPT_ENTRY_POSITION_SCHEMA_SQL, COMMON_SCHEMA_SQL, MIGRATED_CONTINUITY_IMPORT_DRAFT_SQL, PROFILE_SCHEMA_SQL, FULL_CONTINUITY_SCHEMA_SQL, FULL_V6_TARGET_SCHEMA_SQL, FULL_V7_TARGET_SCHEMA_SQL, FULL_TARGET_SCHEMA_SQL, SOURCE_IMPORT_SCHEMA_SQL, FULL_SOURCE_IMPORT_TARGET_SCHEMA_SQL, MANUSCRIPT_REIMPORT_SCHEMA_SQL, FULL_MANUSCRIPT_REIMPORT_TARGET_SCHEMA_SQL, TARGET_VIRTUAL_TABLE_SQL, SEARCH_SHADOW_SCHEMA_SQL, SEARCH_SCHEMA_TABLES, CONTINUITY_INDEX_SQL, V6_TARGET_INDEX_SQL, TARGET_INDEX_SQL, MANUSCRIPT_REIMPORT_INDEX_SQL, V7_TARGET_INDEX_SQL, CONTINUITY_TRIGGER_DIGESTS, SOURCE_IMPORT_TRIGGER_SQL, MANUSCRIPT_REIMPORT_TRIGGER_SQL, SCHEMA_FOREIGN_KEYS } from './bounded-schema-sql.js';
import { EDITABLE_PROCEDURE_SCHEMA_SQL, EDITABLE_PROCEDURE_TRIGGER_SQL } from '../procedures/editable-schema.js';
import { HOUSE_WORD_LIST_SCHEMA_VERSION, HOUSE_WORD_LIST_SCHEMA_SQL, HOUSE_WORD_LIST_TRIGGER_SQL } from '../review/house-word-list.js';
import { LOCAL_REVIEW_SCHEMA_VERSION, GLOBAL_AGENT_SCHEMA_VERSION, ANALYSIS_LEDGER_REVISION_15_SQL, REVIEW_CONTRACT_SCHEMA_VERSION, SEARCH_BACKEND_CONNECTIONS_SQL, SEARCH_FALLBACK_SCHEMA_VERSION, SEARCH_BACKEND_FALLBACK_SQL, ANALYSIS_LEDGER_TRIGGER_SQL, IMPORTED_EXEMPLAR_SCHEMA_VERSION, EVALUATION_PROFILE_SCHEMA_VERSION, DIALOGUE_LIVE_BINDING_SCHEMA_VERSION, MODEL_SERVICE_ROUTES_SCHEMA_VERSION, ADMITTED_CHANNELS_SCHEMA_VERSION, SEARCH_BACKEND_SCHEMA_VERSION, RESEARCH_EVIDENCE_SCHEMA_VERSION, MATERIAL_INDEX_LAYER_SCHEMA_VERSION, FACTUAL_VERIFICATION_SCHEMA_VERSION, HOUSE_REVIEW_PREFERENCE_SCHEMA_VERSION, TASK_INTENT_DRAFT_SCHEMA_VERSION, IMPORTED_SKILL_SCHEMA_VERSION, CUSTOM_ANALYSIS_SCHEMA_VERSION, IMPORTED_SKILL_UPDATE_SCHEMA_VERSION, MODEL_SELECTION_SCHEMA_VERSION, PROCEDURE_DEFINITION_SCHEMA_VERSION, EDITORIAL_LEARNING_SCHEMA_VERSION, WORD_TRACKED_IMPORT_SCHEMA_VERSION, TASK_AUTHORIZATION_SCHEMA_SQL, TASK_AUTHORIZATION_TRIGGER_SQL } from '../task-authorization.js';
import { LOCAL_STAGE_SCHEMA_SQL, LOCAL_STAGE_TRIGGER_SQL, validateLocalStageArtifacts, REVIEW_RUN_SCHEMA_SQL, REVIEW_RUN_TRIGGER_SQL } from '../review/review-runs.js';
import { PROCEDURE_DEFINITION_SCHEMA_SQL, PROCEDURE_PLAN_PINS_V2_SQL, PROCEDURE_DEFINITION_TRIGGER_SQL, validateProcedureDefinitions } from '../procedures/definition-store.js';
import { EDITORIAL_LEARNING_SCHEMA_SQL, EDITORIAL_LEARNING_TRIGGER_SQL } from '../learning/ledger.js';
import { DIALOGUE_TASKS_REVISION_86_SQL, DIALOGUE_EXECUTION_BINDINGS_REVISION_60_SQL, DIALOGUE_EXECUTION_BINDINGS_REVISION_71_SQL, DIALOGUE_EXECUTION_BINDINGS_REVISION_72_SQL, DIALOGUE_SCHEMA_SQL, DIALOGUE_TRIGGER_SQL } from '../dialogue/dialogue-ledger.js';
import { SUPERVISION_SCHEMA_SQL, SUPERVISION_TRIGGER_SQL } from '../learning/supervision-directives.js';
import { IMPORTED_SKILL_SCHEMA_SQL, IMPORTED_SKILL_TRIGGER_SQL, IMPORTED_SKILL_UPDATE_SCHEMA_SQL, IMPORTED_SKILL_UPDATE_TRIGGER_SQL } from '../imported-skill-schema.js';
import { HOUSE_REVIEW_PREFERENCE_SCHEMA_SQL, HOUSE_REVIEW_PREFERENCE_TRIGGER_SQL } from '../house-review-preference.js';
import { TASK_INTENT_DRAFT_SCHEMA_SQL, TASK_INTENT_DRAFT_TRIGGER_SQL } from '../task-intent-drafts.js';
import { CUSTOM_ANALYSIS_DIMENSION_SCHEMA_SQL, CUSTOM_ANALYSIS_DIMENSION_TRIGGER_SQL } from '../custom-analysis-dimensions.js';
import { requireBounded, one, asNumber, sha256, canonicalSchemaSql, type SqlRow } from './bounded-kernel.js';
import { STRUCTURAL_EDIT_SCHEMA_SQL } from './structural-schema.js';
import { NOTE_BLOCK_SCHEMA_SQL, NOTE_BLOCK_TRIGGER_SQL, widenedBlockKindTables } from './note-schema.js';
import { IMPORT_STRUCTURE_SCHEMA_SQL, IMPORT_STRUCTURE_TRIGGER_SQL } from './structure-schema.js';
import { DatabaseSync } from 'node:sqlite';
import { EDITORIAL_WORKSPACE_PROFILE_BOOK_PINS_SCHEMA_SQL, EDITORIAL_WORKSPACE_PROFILE_SIDECAR_REVISIONS_SCHEMA_SQL, EDITORIAL_WORKSPACE_PROFILE_SIDECAR_TRIGGER_SQL, NATIVE_ARTIFACT_BOOK_ENABLEMENTS_SCHEMA_SQL, NATIVE_ARTIFACT_INSTALLATIONS_SCHEMA_SQL } from '../editorial-workspace-profile.js';
import { EDITORIAL_MARK_REVISION_22_SQL, EDITORIAL_MARK_SCHEMA_SQL, PROPOSAL_ITEM_DECISIONS_PRE77_SQL, PROPOSAL_REVIEW_SCHEMA_SQL, PROPOSAL_REVIEW_TRIGGER_SQL, EDITORIAL_MARK_TRIGGER_SQL, PROPOSAL_CHANGE_ITEMS_REVISION_27_SQL } from '../editorial-marks.js';
import { IMPORTED_MARK_SCHEMA_SQL } from '../imported-marks.js';
import { EXPORT_LEDGER_SCHEMA_SQL, EXPORT_LEDGER_TRIGGER_SQL } from '../manuscript-export.js';
import { DEFAULT_EXECUTION_RULE_SCHEMA_SQL, DEFAULT_EXECUTION_RULE_TRIGGER_SQL } from '../default-execution-rules.js';
import { RUN_CHECKPOINT_SCHEMA_SQL, RUN_CHECKPOINT_TRIGGER_SQL } from '../analysis/run-checkpoints.js';
import { CLARIFICATION_SCHEMA_SQL, CLARIFICATION_REVISION_72_SQL, CLARIFICATION_TRIGGER_SQL } from '../analysis/clarifications.js';
import { REIMPORT_GROUP_SCHEMA_SQL } from '../reimport-group-ledger.js';
import { MANUSCRIPTS_REVISION_37_SQL, PRODUCTION_DOCUMENT_DELIVERY_SCHEMA_SQL, PRODUCTION_DOCUMENT_DELIVERY_TRIGGER_SQL, PRODUCTION_DOCUMENT_INDEX_SQL, PRODUCTION_DOCUMENT_SCHEMA_SQL, PRODUCTION_DOCUMENT_TRIGGER_SQL } from '../production-document-ledger.js';
import { BOOK_DELIVERY_PACKAGE_SCHEMA_SQL, BOOK_DELIVERY_PACKAGE_TRIGGER_SQL } from '../book-delivery-packages.js';
import { PRODUCTION_DOCUMENT_WORKFLOW_SCHEMA_SQL, PRODUCTION_DOCUMENT_WORKFLOW_TRIGGER_SQL } from '../production-document-workflow.js';
import { BOOK_DELIVERY_PACKAGE_EXPORT_SCHEMA_SQL, BOOK_DELIVERY_PACKAGE_EXPORT_TRIGGER_SQL } from '../book-delivery-package-exports.js';
import { PRODUCTION_DOCUMENT_ORIGIN_SCHEMA_SQL, PRODUCTION_DOCUMENT_ORIGIN_TRIGGER_SQL } from '../production-document-origins.js';
import { MAINTENANCE_CASE_SCHEMA_SQL, MAINTENANCE_CASE_TRIGGER_SQL } from '../maintenance-cases.js';
import { BOOK_PEOPLE_SCHEMA_SQL, BOOK_PEOPLE_TRIGGER_SQL } from '../book-people.js';
import { REVIEW_GUIDELINE_SCHEMA_SQL, REVIEW_GUIDELINE_TRIGGER_SQL } from '../review-guidelines.js';
import { LIBRARY_MATERIAL_SCHEMA_SQL, LIBRARY_MATERIAL_TRIGGER_SQL } from '../library-materials.js';
import { EVALUATION_RECORD_SCHEMA_SQL, EVALUATION_RECORD_TRIGGER_SQL, EVALUATION_INITIAL_DRAFT_SCHEMA_SQL, EVALUATION_INITIAL_DRAFT_TRIGGER_SQL } from '../evaluation-records.js';
import { ANALYSIS_FEEDBACK_SCHEMA_SQL, ANALYSIS_FEEDBACK_TRIGGER_SQL } from '../analysis-feedback.js';
import { DECISION_FEEDBACK_SCHEMA_SQL, DECISION_FEEDBACK_TRIGGER_SQL } from '../decision-feedback.js';
import { LEARNING_ELIGIBILITY_SCHEMA_SQL, LEARNING_ELIGIBILITY_TRIGGER_SQL } from '../learning-eligibility.js';
import { EVALUATION_CALIBRATION_SCHEMA_SQL, EVALUATION_CALIBRATION_TRIGGER_SQL } from '../evaluation-calibration.js';
import { SERIES_SCHEMA_SQL, SERIES_TRIGGER_SQL } from '../series.js';
import { SERIES_KNOWLEDGE_SCHEMA_SQL, SERIES_KNOWLEDGE_TRIGGER_SQL } from '../series-knowledge.js';
import { DATA_VERSION_SCHEMA_SQL, DATA_VERSION_TRIGGER_SQL } from '../data-version.js';
import { DATABASE_EXPORT_SCHEMA_SQL, DATABASE_EXPORT_TRIGGER_SQL } from '../database-exports.js';
import { SCHEDULED_BACKUP_SCHEMA_SQL, SCHEDULED_BACKUP_TRIGGER_SQL } from '../scheduled-backups.js';
import { DATABASE_REPLACEMENT_SCHEMA_SQL, DATABASE_REPLACEMENT_TRIGGER_SQL } from '../database-replacement.js';
import { DATABASE_MERGE_SCHEMA_SQL, DATABASE_MERGE_TRIGGER_SQL } from '../database-merge.js';
import { CAPTURED_PROCEDURE_SCHEMA_SQL, CAPTURED_PROCEDURE_TRIGGER_SQL } from '../captured-procedures.js';
import { EVALUATION_REWRITE_SCHEMA_SQL, EVALUATION_REWRITE_TRIGGER_SQL } from '../evaluation-rewrites.js';
import { WRITING_TASK_SCHEMA_SQL, WRITING_TASK_TRIGGER_SQL } from '../writing-tasks.js';
import { MATERIAL_INDEX_LAYER_SCHEMA_SQL, MATERIAL_INDEX_LAYER_TRIGGER_SQL, MATERIAL_TRANSLATION_ATTEMPT_SCHEMA_SQL, MATERIAL_TRANSLATION_ATTEMPT_TRIGGER_SQL, validateMaterialTranslationAttemptSchema, MATERIAL_INDEX_SCHEMA_SQL, MATERIAL_INDEX_TRIGGER_SQL } from '../material-index.js';
import { EVALUATION_PROFILE_SCHEMA_SQL, EVALUATION_PROFILE_TRIGGER_SQL } from '../evaluation-profiles.js';
import { IMPORTED_EXEMPLAR_SCHEMA_SQL, IMPORTED_EXEMPLAR_TRIGGER_SQL } from '../imported-exemplars.js';
import { RESEARCH_EVIDENCE_SCHEMA_SQL, RESEARCH_EVIDENCE_TRIGGER_SQL } from '../research-evidence-schema.js';
import { FACTUAL_CLAIM_SCHEMA_SQL, FACTUAL_CLAIM_TRIGGER_SQL, FACTUAL_VERIFICATION_SCHEMA_SQL, FACTUAL_VERIFICATION_TRIGGER_SQL } from '../factual-verification-schema.js';
import { OUTCOME_RESOLUTION_SCHEMA_SQL, OUTCOME_RESOLUTION_TRIGGER_SQL } from '../analysis/outcome-resolutions.js';
import { BACKGROUND_ANALYSIS_ENROLLMENT_SCHEMA_SQL, BACKGROUND_PROCESSING_ENROLLMENT_SCHEMA_SQL, BACKGROUND_ANALYSIS_ENROLLMENT_TRIGGER_SQL } from '../background-analysis-enrollments.js';
import { SERIES_RETRIEVAL_EXCLUSION_SCHEMA_SQL, SERIES_RETRIEVAL_EXCLUSION_TRIGGER_SQL } from '../series-exclusions.js';
import { READERS_REPORT_SCHEMA_SQL, READERS_REPORT_TRIGGER_SQL } from '../readers-reports.js';
import { MANUSCRIPT_EFFECT_SCHEMA_SQL, MANUSCRIPT_EFFECT_TRIGGER_SQL } from '../manuscript-apply.js';
import { PUBLICATION_VERSION_SCHEMA_SQL, PUBLICATION_VERSION_TRIGGER_SQL } from '../publication-versions.js';
import { PROPOSAL_CONFLICT_SCHEMA_SQL, PROPOSAL_CONFLICT_TRIGGER_SQL } from '../proposal-conflicts.js';
import { IMPORT_FIDELITY_CATEGORIES_SQL, IMPORT_RETENTION_SCHEMA_SQL, IMPORT_RETENTION_TRIGGER_SQL, WORD_IMPORT_RETENTION_SCHEMA_SQL, WORD_IMPORT_RETENTION_TRIGGER_SQL } from '../import-retention.js';
function tableColumnSignature(row: SqlRow): string {
  requireBounded(
    typeof row.cid === 'number' && Number.isSafeInteger(row.cid) && typeof row.name === 'string' &&
      typeof row.type === 'string' && typeof row.notnull === 'number' && Number.isSafeInteger(row.notnull) &&
      (row.dflt_value === null || typeof row.dflt_value === 'string') &&
      typeof row.pk === 'number' && Number.isSafeInteger(row.pk) &&
      typeof row.hidden === 'number' && Number.isSafeInteger(row.hidden),
    'SCHEMA_MIGRATION_FAILED',
    '数据库列结构无效。',
  );
  return JSON.stringify([
    row.cid,
    row.name,
    row.type.toLocaleUpperCase('en-US'),
    row.notnull,
    row.dflt_value,
    row.pk,
    row.hidden,
  ]);
}

const expectedColumnSignatures = new Map<string, ReadonlyArray<string>>();

function expectedTableColumnSignatures(name: string, expectedSql: string): ReadonlyArray<string> {
  const key = `${name}\u0000${expectedSql}`;
  const cached = expectedColumnSignatures.get(key);
  if (cached) return cached;
  const expected = new DatabaseSync(':memory:');
  try {
    expected.exec(expectedSql);
    const signatures = (expected.prepare(`PRAGMA table_xinfo(${quotedIdentifier(name)})`).all() as SqlRow[])
      .map(tableColumnSignature);
    requireBounded(signatures.length > 0, 'SCHEMA_MIGRATION_FAILED', `目标数据库表 ${name} 缺少列定义。`);
    expectedColumnSignatures.set(key, signatures);
    return signatures;
  } finally {
    expected.close();
  }
}

function quotedIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

export function schemaObjectSql(db: DatabaseSync, type: 'table' | 'index' | 'trigger', name: string): string | undefined {
  const row = db.prepare('SELECT sql FROM sqlite_schema WHERE type = ? AND name = ?').get(type, name) as SqlRow | undefined;
  if (row === undefined) return undefined;
  requireBounded(typeof row.sql === 'string', 'SCHEMA_MIGRATION_FAILED', `数据库结构对象 ${name} 无有效 SQL。`);
  return row.sql;
}

function foreignKeySignature(row: SqlRow): string {
  requireBounded(
    typeof row.from === 'string' && typeof row.table === 'string' && typeof row.to === 'string' &&
      typeof row.on_update === 'string' && typeof row.on_delete === 'string' && typeof row.match === 'string',
    'SCHEMA_MIGRATION_FAILED',
    '数据库引用结构无效。',
  );
  return `${row.from}>${row.table}.${row.to}:${row.on_update}/${row.on_delete}/${row.match}`;
}

function requireExactTableSchema(db: DatabaseSync, name: string, expectedSql: string | ReadonlyArray<string>): void {
  const actualSql = schemaObjectSql(db, 'table', name);
  const expectedCandidates = typeof expectedSql === 'string' ? [expectedSql] : expectedSql;
  const matchedExpectedSql = actualSql === undefined
    ? undefined
    : expectedCandidates.find((candidate) => canonicalSchemaSql(actualSql) === canonicalSchemaSql(candidate));
  requireBounded(
    matchedExpectedSql !== undefined,
    'SCHEMA_MIGRATION_FAILED',
    `数据库表 ${name} 的类型、空值、键、唯一性、检查约束或 SQL 不兼容。`,
  );
  const table = one(
    db.prepare("SELECT type, strict, wr FROM pragma_table_list WHERE schema = 'main' AND name = ?").all(name) as SqlRow[],
    'SCHEMA_MIGRATION_FAILED',
    `数据库表 ${name} 缺失。`,
  );
  requireBounded(
    table.type === 'table' && asNumber(table.strict) === 1 && asNumber(table.wr) === 0,
    'SCHEMA_MIGRATION_FAILED',
    `数据库表 ${name} 必须是有行标识的 STRICT 表。`,
  );
  const actualColumns = (db.prepare(`PRAGMA table_xinfo(${quotedIdentifier(name)})`).all() as SqlRow[])
    .map(tableColumnSignature);
  const expectedColumns = expectedTableColumnSignatures(name, matchedExpectedSql);
  requireBounded(
    actualColumns.length === expectedColumns.length &&
      actualColumns.every((signature, index) => signature === expectedColumns[index]),
    'SCHEMA_MIGRATION_FAILED',
    `数据库表 ${name} 的列名、类型、空值、默认值、主键顺序或隐藏状态不兼容。`,
  );
  const actualForeignKeys = (db.prepare(`PRAGMA foreign_key_list(${quotedIdentifier(name)})`).all() as SqlRow[])
    .map(foreignKeySignature)
    .sort();
  const expectedForeignKeys = [
    ...(SCHEMA_FOREIGN_KEYS[name] ?? []),
    ...(name === 'import_drafts' && canonicalSchemaSql(matchedExpectedSql) === canonicalSchemaSql(PROFILE_SCHEMA_SQL.import_drafts)
      ? ['reviewed_existing_book_id>books.book_id:NO ACTION/NO ACTION/NONE']
      : []),
    ...(name === 'import_drafts' && canonicalSchemaSql(matchedExpectedSql) === canonicalSchemaSql(SOURCE_IMPORT_SCHEMA_SQL.import_drafts)
      ? [
          'reviewed_existing_book_id>books.book_id:NO ACTION/NO ACTION/NONE',
          'reviewed_reuse_source_version_id>source_versions.source_version_id:NO ACTION/NO ACTION/NONE',
        ]
      : []),
    ...(name === 'import_drafts' && MANUSCRIPT_REIMPORT_SCHEMA_SQL.import_drafts.some(
      (candidate) => canonicalSchemaSql(matchedExpectedSql) === canonicalSchemaSql(candidate),
    )
      ? [
          'reviewed_branch_id>manuscript_branches.branch_id:NO ACTION/NO ACTION/NONE',
          'reviewed_checkpoint_revision_id>manuscript_revisions.revision_id:NO ACTION/NO ACTION/NONE',
          'reviewed_existing_book_id>books.book_id:NO ACTION/NO ACTION/NONE',
          'reviewed_lineage_source_version_id>source_versions.source_version_id:NO ACTION/NO ACTION/NONE',
          'reviewed_manuscript_id>manuscripts.manuscript_id:NO ACTION/NO ACTION/NONE',
          'reviewed_reuse_source_version_id>source_versions.source_version_id:NO ACTION/NO ACTION/NONE',
        ]
      : []),
    // Revision 16 (Issue #93): an update Task names the predecessor Result Set Revision it updates.
    // Every shape from 16 onwards carries it; only the revision-15 shape does not.
    ...(name === 'analysis_task_intents' && canonicalSchemaSql(matchedExpectedSql) !== canonicalSchemaSql(ANALYSIS_LEDGER_REVISION_15_SQL.analysis_task_intents)
      ? ['predecessor_revision_id>analysis_result_set_revisions.revision_id:NO ACTION/NO ACTION/NONE']
      : []),
    // Revision 19 (Issue #356): a Source Version may link the working representation it was read
    // through, which is a content object of its own beside the original.
    ...(name === 'source_versions' &&
      canonicalSchemaSql(matchedExpectedSql) === canonicalSchemaSql(COMMON_SCHEMA_SQL.source_versions[2]!)
      ? ['working_object_digest>content_objects.object_digest:NO ACTION/NO ACTION/NONE']
      : []),
  ].sort();
  requireBounded(
    actualForeignKeys.join('\n') === expectedForeignKeys.join('\n'),
    'SCHEMA_MIGRATION_FAILED',
    `数据库表 ${name} 的引用列、目标或动作不兼容。`,
  );
}

function requireExactIndexSchema(
  db: DatabaseSync,
  expectedIndexes: Readonly<Record<string, string>>,
): void {
  const expectedNames = new Set(Object.keys(expectedIndexes));
  for (const [name, expectedSql] of Object.entries(expectedIndexes)) {
    const actualSql = schemaObjectSql(db, 'index', name);
    requireBounded(
      actualSql !== undefined && canonicalSchemaSql(actualSql) === canonicalSchemaSql(expectedSql),
      'SCHEMA_MIGRATION_FAILED',
      `数据库索引 ${name} 不兼容。`,
    );
  }
  const explicit = db.prepare(
    "SELECT name FROM sqlite_schema WHERE type = 'index' AND sql IS NOT NULL",
  ).all() as SqlRow[];
  requireBounded(
    explicit.every((row) => typeof row.name === 'string' && expectedNames.has(row.name)) && explicit.length === expectedNames.size,
    'SCHEMA_MIGRATION_FAILED',
    '数据库显式索引集合不兼容。',
  );
  const views = db.prepare("SELECT name FROM sqlite_schema WHERE type = 'view'").all() as SqlRow[];
  requireBounded(views.length === 0, 'SCHEMA_MIGRATION_FAILED', '数据库包含未授权视图。');
}

function requireExactTriggerSchema(
  db: DatabaseSync,
  additional: Readonly<Record<string, string>> = {},
): void {
  const expectedDigests = {
    ...CONTINUITY_TRIGGER_DIGESTS,
    ...Object.fromEntries(Object.entries(additional).map(([name, sql]) => [name, sha256(canonicalSchemaSql(sql))])),
  };
  const expectedNames = new Set(Object.keys(expectedDigests));
  const actual = db.prepare("SELECT name, sql FROM sqlite_schema WHERE type = 'trigger'").all() as SqlRow[];
  requireBounded(
    actual.length === expectedNames.size &&
      actual.every((row) => typeof row.name === 'string' && expectedNames.has(row.name)),
    'SCHEMA_MIGRATION_FAILED',
    '数据库触发器集合不兼容。',
  );
  for (const [name, expectedDigest] of Object.entries(expectedDigests)) {
    const actualSql = schemaObjectSql(db, 'trigger', name);
    requireBounded(
      actualSql !== undefined && sha256(canonicalSchemaSql(actualSql)) === expectedDigest,
      'SCHEMA_MIGRATION_FAILED',
      `数据库触发器 ${name} 不兼容。`,
    );
  }
}

function requireExactSearchSchema(db: DatabaseSync): void {
  const searchSql = schemaObjectSql(db, 'table', 'working_block_search');
  requireBounded(
    searchSql !== undefined && canonicalSchemaSql(searchSql) === canonicalSchemaSql(TARGET_VIRTUAL_TABLE_SQL),
    'SCHEMA_MIGRATION_FAILED',
    '数据库 CJK 字符串检索结构不兼容。',
  );
  const virtualTable = one(
    db.prepare("SELECT type, strict, wr FROM pragma_table_list WHERE schema = 'main' AND name = 'working_block_search'").all() as SqlRow[],
    'SCHEMA_MIGRATION_FAILED',
    '数据库 CJK 字符串检索结构缺失。',
  );
  requireBounded(
    virtualTable.type === 'virtual' && asNumber(virtualTable.strict) === 0 && asNumber(virtualTable.wr) === 0,
    'SCHEMA_MIGRATION_FAILED',
    '数据库 CJK 字符串检索表类型不兼容。',
  );
  for (const [name, expectedSql] of Object.entries(SEARCH_SHADOW_SCHEMA_SQL)) {
    const actualSql = schemaObjectSql(db, 'table', name);
    requireBounded(
      actualSql !== undefined && canonicalSchemaSql(actualSql) === canonicalSchemaSql(expectedSql),
      'SCHEMA_MIGRATION_FAILED',
      `数据库 CJK 字符串检索派生表 ${name} 不兼容。`,
    );
    const table = one(
      db.prepare("SELECT type, strict, wr FROM pragma_table_list WHERE schema = 'main' AND name = ?").all(name) as SqlRow[],
      'SCHEMA_MIGRATION_FAILED',
      `数据库 CJK 字符串检索派生表 ${name} 缺失。`,
    );
    const withoutRowId = name === 'working_block_search_config' || name === 'working_block_search_idx';
    requireBounded(
      table.type === 'shadow' && asNumber(table.strict) === 0 && asNumber(table.wr) === (withoutRowId ? 1 : 0),
      'SCHEMA_MIGRATION_FAILED',
      `数据库 CJK 字符串检索派生表 ${name} 类型不兼容。`,
    );
  }
}

function requireExactSchema(
  db: DatabaseSync,
  expectedTables: Readonly<Record<string, string | ReadonlyArray<string>>>,
  expectedIndexes: Readonly<Record<string, string>>,
  includeSearch: boolean,
  additionalTriggers: Readonly<Record<string, string>> = {},
): void {
  for (const [name, expectedSql] of Object.entries(expectedTables)) requireExactTableSchema(db, name, expectedSql);
  requireExactIndexSchema(db, expectedIndexes);
  requireExactTriggerSchema(db, additionalTriggers);
  const expectedNames = new Set([
    ...Object.keys(expectedTables),
    ...(includeSearch ? SEARCH_SCHEMA_TABLES : []),
  ]);
  const actualTables = db.prepare("SELECT name FROM sqlite_schema WHERE type = 'table'").all() as SqlRow[];
  requireBounded(
    actualTables.length === expectedNames.size &&
      actualTables.every((row) => typeof row.name === 'string' && expectedNames.has(row.name)),
    'SCHEMA_MIGRATION_FAILED',
    '数据库表集合与精确版本结构不兼容。',
  );
  if (includeSearch) requireExactSearchSchema(db);
}

export function requireContinuitySchema(db: DatabaseSync): void {
  requireExactSchema(
    db,
    {
      ...FULL_CONTINUITY_SCHEMA_SQL,
      import_drafts: [COMMON_SCHEMA_SQL.import_drafts, MIGRATED_CONTINUITY_IMPORT_DRAFT_SQL],
    },
    CONTINUITY_INDEX_SQL,
    false,
  );
}

export function requireTargetSchema(db: DatabaseSync): void {
  requireExactSchema(db, FULL_TARGET_SCHEMA_SQL, TARGET_INDEX_SQL, true);
}

export function requireSourceImportTargetSchema(db: DatabaseSync): void {
  requireExactSchema(db, FULL_SOURCE_IMPORT_TARGET_SCHEMA_SQL, TARGET_INDEX_SQL, true, SOURCE_IMPORT_TRIGGER_SQL);
}

export function requireManuscriptReimportTargetSchema(
  db: DatabaseSync,
  includeModelServiceTable = false,
  includeNativeArtifactTables = false,
  includeAuthoritySidecarTables = false,
  includeTaskAuthorizationTables = false,
  includeAnalysisLedgerTables = false,
  includePlanVersionTables = false,
  includeManuscriptEntryPositionTable = false,
  includeEditorialMarkTables = false,
  includeManuscriptEffectTables = false,
  includeReviewRunTables = false,
  includePublicationVersionTables = false,
  includeProposalConflictTables = false,
  includeImportRetentionTables = false,
  includeImportedMarkTables = false,
  includeExportLedgerTables = false,
  includeDefaultExecutionRuleTables = false,
  includeRunCheckpointTables = false,
  includeClarificationTables = false,
  includeReimportGroupTables = false,
  includeProductionDocumentTables = false,
  includeProductionDocumentDeliveryTables = false,
  includeBookDeliveryPackageTables = false,
  includeProductionDocumentWorkflowTables = false,
  includeBookDeliveryPackageExportTables = false,
  includeProductionDocumentOriginTables = false,
  includeMaintenanceCaseTables = false,
  includeBookPeopleTables = false,
  includeReviewGuidelineTables = false,
  includeLibraryMaterialTables = false,
  includeEvaluationRecordTables = false,
  includeAnalysisFeedbackTables = false,
  includeDecisionFeedbackTables = false,
  includeLearningEligibilityTables = false,
  includeEvaluationCalibrationTables = false,
  includeSeriesTables = false,
  includeSeriesKnowledgeTables = false,
  includeDataVersionTables = false,
  includeDatabaseExportTables = false,
  includeScheduledBackupTables = false,
  includeDatabaseReplacementTables = false,
  includeDatabaseMergeTables = false,
  includeEvaluationInitialDraftTables = false,
  includeDialogueTables = false,
  includeSeriesRetrievalExclusionTables = false,
  includeReadersReportTables = false,
  includeCapturedProcedureTables = false,
  includeEvaluationRewriteTables = false,
  includeWritingTaskTables = false,
  includeBackgroundAnalysisEnrollmentTables = false,
  includeMaterialIndexTables = false,
  includeOutcomeResolutionTables = false,
): void {
  const analysisTables = includePlanVersionTables ? ANALYSIS_LEDGER_EXPECTED_SCHEMA_SQL : PRE_17_ANALYSIS_LEDGER_EXPECTED_SCHEMA_SQL;
  const analysisTriggers = includePlanVersionTables ? ANALYSIS_LEDGER_TRIGGER_SQL : PRE_17_ANALYSIS_LEDGER_TRIGGER_SQL;
  // From revision 21 on, an upgrade step commits its revision's relations in a transaction of its own and the version
  // stamp follows in another (Issue #596), so a store that stopped between them holds all of a revision's relations
  // below that revision. They count as the revision's: the exact check accepts them, the step skips relations that
  // exist, and the next open stamps the version. None of them present still requires their absence, and only some of
  // them present is still refused.
  const committed = (relations: Readonly<Record<string, unknown>>): boolean =>
    Object.keys(relations).every((name) => schemaObjectSql(db, 'table', name) !== undefined);
  includeManuscriptEntryPositionTable ||= committed({ manuscript_entry_positions: MANUSCRIPT_ENTRY_POSITION_SCHEMA_SQL });
  includeEditorialMarkTables ||= committed(EDITORIAL_MARK_SCHEMA_SQL);
  includeManuscriptEffectTables ||= committed(MANUSCRIPT_EFFECT_SCHEMA_SQL);
  includeReviewRunTables ||= committed(REVIEW_RUN_SCHEMA_SQL);
  const legacyReview = Number(db.prepare('PRAGMA user_version').get()?.user_version) < REVIEW_CONTRACT_SCHEMA_VERSION &&
    schemaObjectSql(db, 'table', 'review_excluded_findings') === undefined;
  const reviewTables = legacyReview ? Object.fromEntries(Object.entries(REVIEW_RUN_SCHEMA_SQL).filter(([name]) => name !== 'review_excluded_findings')) : REVIEW_RUN_SCHEMA_SQL;
  const reviewTriggers = legacyReview ? Object.fromEntries(Object.entries(REVIEW_RUN_TRIGGER_SQL).filter(([name]) => !name.startsWith('review_excluded_findings_'))) : REVIEW_RUN_TRIGGER_SQL;
  const includeHouseWordList = Number(db.prepare('PRAGMA user_version').get()?.user_version) >= HOUSE_WORD_LIST_SCHEMA_VERSION || committed(HOUSE_WORD_LIST_SCHEMA_SQL);
  const includeLocalStage = Number(db.prepare('PRAGMA user_version').get()?.user_version) >= LOCAL_REVIEW_SCHEMA_VERSION || committed(LOCAL_STAGE_SCHEMA_SQL);
  includePublicationVersionTables ||= committed(PUBLICATION_VERSION_SCHEMA_SQL);
  includeProposalConflictTables ||= committed(PROPOSAL_CONFLICT_SCHEMA_SQL);
  includeImportRetentionTables ||= committed(IMPORT_RETENTION_SCHEMA_SQL);
  includeImportedMarkTables ||= committed(IMPORTED_MARK_SCHEMA_SQL);
  includeExportLedgerTables ||= committed(EXPORT_LEDGER_SCHEMA_SQL);
  includeDefaultExecutionRuleTables ||= committed(DEFAULT_EXECUTION_RULE_SCHEMA_SQL);
  includeRunCheckpointTables ||= committed(RUN_CHECKPOINT_SCHEMA_SQL);
  includeClarificationTables ||= committed(CLARIFICATION_SCHEMA_SQL);
  includeReimportGroupTables ||= committed(REIMPORT_GROUP_SCHEMA_SQL);
  includeProductionDocumentTables ||= committed(PRODUCTION_DOCUMENT_SCHEMA_SQL);
  includeProductionDocumentDeliveryTables ||= committed(PRODUCTION_DOCUMENT_DELIVERY_SCHEMA_SQL);
  includeBookDeliveryPackageTables ||= committed(BOOK_DELIVERY_PACKAGE_SCHEMA_SQL);
  includeProductionDocumentWorkflowTables ||= committed(PRODUCTION_DOCUMENT_WORKFLOW_SCHEMA_SQL);
  includeBookDeliveryPackageExportTables ||= committed(BOOK_DELIVERY_PACKAGE_EXPORT_SCHEMA_SQL);
  includeProductionDocumentOriginTables ||= committed(PRODUCTION_DOCUMENT_ORIGIN_SCHEMA_SQL);
  includeMaintenanceCaseTables ||= committed(MAINTENANCE_CASE_SCHEMA_SQL);
  includeBookPeopleTables ||= committed(BOOK_PEOPLE_SCHEMA_SQL);
  includeReviewGuidelineTables ||= committed(REVIEW_GUIDELINE_SCHEMA_SQL);
  includeLibraryMaterialTables ||= committed(LIBRARY_MATERIAL_SCHEMA_SQL);
  includeEvaluationRecordTables ||= committed(EVALUATION_RECORD_SCHEMA_SQL);
  includeAnalysisFeedbackTables ||= committed(ANALYSIS_FEEDBACK_SCHEMA_SQL);
  includeDecisionFeedbackTables ||= committed(DECISION_FEEDBACK_SCHEMA_SQL);
  includeLearningEligibilityTables ||= committed(LEARNING_ELIGIBILITY_SCHEMA_SQL);
  includeEvaluationCalibrationTables ||= committed(EVALUATION_CALIBRATION_SCHEMA_SQL);
  includeSeriesTables ||= committed(SERIES_SCHEMA_SQL);
  includeSeriesKnowledgeTables ||= committed(SERIES_KNOWLEDGE_SCHEMA_SQL);
  includeDataVersionTables ||= committed(DATA_VERSION_SCHEMA_SQL);
  includeDatabaseExportTables ||= committed(DATABASE_EXPORT_SCHEMA_SQL);
  includeScheduledBackupTables ||= committed(SCHEDULED_BACKUP_SCHEMA_SQL);
  includeDatabaseReplacementTables ||= committed(DATABASE_REPLACEMENT_SCHEMA_SQL);
  includeDatabaseMergeTables ||= committed(DATABASE_MERGE_SCHEMA_SQL);
  includeEvaluationInitialDraftTables ||= committed(EVALUATION_INITIAL_DRAFT_SCHEMA_SQL);
  includeDialogueTables ||= committed(DIALOGUE_SCHEMA_SQL);
  includeSeriesRetrievalExclusionTables ||= committed(SERIES_RETRIEVAL_EXCLUSION_SCHEMA_SQL);
  includeReadersReportTables ||= committed(READERS_REPORT_SCHEMA_SQL);
  includeCapturedProcedureTables ||= committed(CAPTURED_PROCEDURE_SCHEMA_SQL);
  includeEvaluationRewriteTables ||= committed(EVALUATION_REWRITE_SCHEMA_SQL);
  includeWritingTaskTables ||= committed(WRITING_TASK_SCHEMA_SQL);
  includeBackgroundAnalysisEnrollmentTables ||= committed(BACKGROUND_ANALYSIS_ENROLLMENT_SCHEMA_SQL);
  includeMaterialIndexTables ||= committed(MATERIAL_INDEX_SCHEMA_SQL);
  includeOutcomeResolutionTables ||= committed(OUTCOME_RESOLUTION_SCHEMA_SQL);
  const includeEvaluationProfileTables = Number(db.prepare('PRAGMA user_version').get()?.user_version) >= EVALUATION_PROFILE_SCHEMA_VERSION || committed(EVALUATION_PROFILE_SCHEMA_SQL);
  const includeImportedExemplarTables = Number(db.prepare('PRAGMA user_version').get()?.user_version) >= IMPORTED_EXEMPLAR_SCHEMA_VERSION || committed(IMPORTED_EXEMPLAR_SCHEMA_SQL);
  // Revision 75 (Issue #425, S70): the retained external evidence of research Runs.
  const includeResearchEvidenceTables = Number(db.prepare('PRAGMA user_version').get()?.user_version) >= RESEARCH_EVIDENCE_SCHEMA_VERSION || committed(RESEARCH_EVIDENCE_SCHEMA_SQL);
  // Revision 76 (Issue #892): the Material Index's similarity vectors and 来源译文.
  const includeMaterialIndexLayerTables = Number(db.prepare('PRAGMA user_version').get()?.user_version) >= MATERIAL_INDEX_LAYER_SCHEMA_VERSION || committed(MATERIAL_INDEX_LAYER_SCHEMA_SQL);
  const includeMaterialTranslationAttempts = Number(db.prepare('PRAGMA user_version').get()?.user_version) >= MODEL_SELECTION_SCHEMA_VERSION || committed(MATERIAL_TRANSLATION_ATTEMPT_SCHEMA_SQL);
  // Revision 77 (Issue #901): factual verification results, review decisions and Correction Proposal lineage.
  const includeFactualClaimTables = Number(db.prepare('PRAGMA user_version').get()?.user_version) >= 97 || committed(FACTUAL_CLAIM_SCHEMA_SQL);
  const includeFactualVerificationTables = Number(db.prepare('PRAGMA user_version').get()?.user_version) >= FACTUAL_VERIFICATION_SCHEMA_VERSION || committed(FACTUAL_VERIFICATION_SCHEMA_SQL);
  // Revision 86 (Issue #1082): reference-only Learning Signals, the learning controls and explicit editorial memory.
  const includeEditorialLearningTables = Number(db.prepare('PRAGMA user_version').get()?.user_version) >= EDITORIAL_LEARNING_SCHEMA_VERSION || committed(EDITORIAL_LEARNING_SCHEMA_SQL);
  const includeWordImportRetentionTables = Number(db.prepare('PRAGMA user_version').get()?.user_version) >= WORD_TRACKED_IMPORT_SCHEMA_VERSION || committed(WORD_IMPORT_RETENTION_SCHEMA_SQL);
  // Revision 79 (Issue #911): 本社审阅偏好 versions and each review category Task's pin of the version it read.
  const includeHousePreferenceTables = Number(db.prepare('PRAGMA user_version').get()?.user_version) >= HOUSE_REVIEW_PREFERENCE_SCHEMA_VERSION || committed(HOUSE_REVIEW_PREFERENCE_SCHEMA_SQL);
  // Revision 87 (Issue #1083): the editor's Learning Supervision Directives.
  const includeSupervisionTables = Number(db.prepare('PRAGMA user_version').get()?.user_version) >= GLOBAL_AGENT_SCHEMA_VERSION || committed(SUPERVISION_SCHEMA_SQL);
  // Revision 80 (Issue #423, slice 7a): the editor's Task Intent Drafts, their versions and their one promotion each.
  const includeTaskIntentDraftTables = Number(db.prepare('PRAGMA user_version').get()?.user_version) >= TASK_INTENT_DRAFT_SCHEMA_VERSION || committed(TASK_INTENT_DRAFT_SCHEMA_SQL);
  // Revision 81 (Issue #66; ADR 0090): imported Skills, their source snapshots, working revisions and lifecycle states.
  const includeImportedSkillTables = Number(db.prepare('PRAGMA user_version').get()?.user_version) >= IMPORTED_SKILL_SCHEMA_VERSION || committed(IMPORTED_SKILL_SCHEMA_SQL);
  // Revision 82 (Issue #922, slice 7f): the house's 自定义分析维度, their versions and their states.
  const includeCustomAnalysisTables = Number(db.prepare('PRAGMA user_version').get()?.user_version) >= CUSTOM_ANALYSIS_SCHEMA_VERSION || committed(CUSTOM_ANALYSIS_DIMENSION_SCHEMA_SQL);
  // Revision 83 (Issue #89; ADR 0090 §3): foreign Skill update candidates, the Artifact Update Rule ledger and current selections.
  const includeImportedSkillUpdateTables = Number(db.prepare('PRAGMA user_version').get()?.user_version) >= IMPORTED_SKILL_UPDATE_SCHEMA_VERSION || committed(IMPORTED_SKILL_UPDATE_SCHEMA_SQL);
  // Revision 85 (Issue #1081, F-26a; ADR 0095 §1): the pre-installed Procedure Definition versions and the plans' sibling pins.
  const includeEditableProcedures = Number(db.prepare('PRAGMA user_version').get()?.user_version) >= 98 || committed(EDITABLE_PROCEDURE_SCHEMA_SQL);
  const includeStructuralEdits = Number(db.prepare('PRAGMA user_version').get()?.user_version) >= 100 || committed({ manuscript_block_lineage: '' });
  const includeNoteBlocks = Number(db.prepare('PRAGMA user_version').get()?.user_version) >= 101 || committed({ manuscript_note_sources: '' }); const includeImportStructure = Number(db.prepare('PRAGMA user_version').get()?.user_version) >= 102 || committed({ manuscript_import_lineage: '' });
  const includeProcedureDefinitions = Number(db.prepare('PRAGMA user_version').get()?.user_version) >= PROCEDURE_DEFINITION_SCHEMA_VERSION || committed(PROCEDURE_DEFINITION_SCHEMA_SQL);
  requireExactSchema(
    db,
    {
      ...FULL_MANUSCRIPT_REIMPORT_TARGET_SCHEMA_SQL,
      ...(Number(db.prepare('PRAGMA user_version').get()?.user_version) >= SEARCH_BACKEND_SCHEMA_VERSION || db.prepare("SELECT 1 FROM sqlite_schema WHERE name = 'search_backend_connections'").get() !== undefined ? { search_backend_connections: SEARCH_BACKEND_CONNECTIONS_SQL } : {}), ...(Number(db.prepare('PRAGMA user_version').get()?.user_version) >= SEARCH_FALLBACK_SCHEMA_VERSION || db.prepare("SELECT 1 FROM sqlite_schema WHERE name = 'search_backend_fallback'").get() !== undefined ? { search_backend_fallback: SEARCH_BACKEND_FALLBACK_SQL } : {}),
      // Revisions 72, 84 and 103 (Issues #811, #1044, #1225) widen the model-service connections: a store below one may still hold
      // the text before it.
      ...(includeModelServiceTable
        ? { model_service_connections: [MODEL_SERVICE_CONNECTION_REVISION_11_SQL, MODEL_SERVICE_CONNECTION_REVISION_72_SQL, MODEL_SERVICE_CONNECTION_REVISION_84_SQL, MODEL_SERVICE_CONNECTION_SCHEMA_SQL]
          .slice([MODEL_SERVICE_ROUTES_SCHEMA_VERSION, MODEL_SELECTION_SCHEMA_VERSION, ADMITTED_CHANNELS_SCHEMA_VERSION, Infinity]
            .findIndex((revision) => Number(db.prepare('PRAGMA user_version').get()?.user_version) < revision)) }
        : {}),
      ...(includeNativeArtifactTables
        ? {
            native_artifact_installations: NATIVE_ARTIFACT_INSTALLATIONS_SCHEMA_SQL,
            native_artifact_book_enablements: NATIVE_ARTIFACT_BOOK_ENABLEMENTS_SCHEMA_SQL,
          }
        : {}),
      ...(includeAuthoritySidecarTables
        ? {
            editorial_workspace_profile_sidecar_revisions:
              EDITORIAL_WORKSPACE_PROFILE_SIDECAR_REVISIONS_SCHEMA_SQL,
            editorial_workspace_profile_book_pins: EDITORIAL_WORKSPACE_PROFILE_BOOK_PINS_SCHEMA_SQL,
          }
        : {}),
      ...(includeTaskAuthorizationTables ? TASK_AUTHORIZATION_SCHEMA_SQL : {}),
      ...(includeAnalysisLedgerTables ? analysisTables : {}),
      ...(includeManuscriptEntryPositionTable
        ? { manuscript_entry_positions: MANUSCRIPT_ENTRY_POSITION_SCHEMA_SQL }
        : {}),
      // Revision 23 widened `editorial_marks` in the transaction that created the Effect relations: a
      // store without them holds revision 22's text of it — or, when this build's revision-22 step ran and the
      // upgrade stopped before revision 23's (Issue #596), the widened text this build creates, which revision 23's
      // step leaves as it is — and a store with them only the widened one.
      ...(includeEditorialMarkTables
        ? {
            ...EDITORIAL_MARK_SCHEMA_SQL,
            proposal_item_decisions: committed(PROPOSAL_REVIEW_SCHEMA_SQL) ? [EDITORIAL_MARK_SCHEMA_SQL.proposal_item_decisions] : [PROPOSAL_ITEM_DECISIONS_PRE77_SQL, EDITORIAL_MARK_SCHEMA_SQL.proposal_item_decisions],
            ...(includeManuscriptEffectTables
              ? {}
              : { editorial_marks: [EDITORIAL_MARK_REVISION_22_SQL.editorial_marks, EDITORIAL_MARK_SCHEMA_SQL.editorial_marks] }),
          }
        : {}),
      ...(committed(PROPOSAL_REVIEW_SCHEMA_SQL) ? PROPOSAL_REVIEW_SCHEMA_SQL : {}),
      ...(includeManuscriptEffectTables ? MANUSCRIPT_EFFECT_SCHEMA_SQL : {}),
      // Revision 24 (Issue #417) adds the Review Run relations beside the three analysis relations it
      // rebuilds; they join this exact table set, the trigger set and `SCHEMA_FOREIGN_KEYS` behind a
      // flag of their own, as revisions 22 and 23 did.
      ...(includeReviewRunTables ? reviewTables : {}),
      ...(includeLocalStage ? LOCAL_STAGE_SCHEMA_SQL : {}),
      ...(includeHouseWordList ? HOUSE_WORD_LIST_SCHEMA_SQL : {}),
      // Revision 25 (Issue #414) adds the Publication Version relations the same way, behind a flag of
      // their own, and revision 26 (Issue #57) the proposal-conflict relations.
      ...(includePublicationVersionTables ? PUBLICATION_VERSION_SCHEMA_SQL : {}),
      ...(includeProposalConflictTables ? PROPOSAL_CONFLICT_SCHEMA_SQL : {}),
      // Revision 27 (Issue #410) adds the import-retention relations the same way, and widened
      // `import_fidelity_categories` in the transaction that created them: a store with them holds only
      // the widened text of it.
      ...(includeImportRetentionTables
        ? { ...IMPORT_RETENTION_SCHEMA_SQL, import_fidelity_categories: IMPORT_FIDELITY_CATEGORIES_SQL }
        : {}),
      ...(includeWordImportRetentionTables ? WORD_IMPORT_RETENTION_SCHEMA_SQL : {}),
      // Revision 28 (Issue #411) adds the staged imported marks the same way and widened
      // `proposal_change_items` in the transaction that created them: a store with them holds only the
      // widened text, and one below it revision 27's — or, planted from this build, the widened one with the
      // rows this build wrote, which `initializeImportedMarkSchema` leaves as they are.
      ...(includeEditorialMarkTables && !includeImportedMarkTables
        ? { proposal_change_items: [PROPOSAL_CHANGE_ITEMS_REVISION_27_SQL, EDITORIAL_MARK_SCHEMA_SQL.proposal_change_items] }
        : {}),
      ...(includeImportedMarkTables ? IMPORTED_MARK_SCHEMA_SQL : {}),
      // Revision 29 (Issue #413) adds the export ledger the same way, behind a flag of its own, revision 31
      // (Issue #421) the default-execution-rule ledger, and revision 33 (Issue #422) the Run's unit checkpoints.
      ...(includeExportLedgerTables ? EXPORT_LEDGER_SCHEMA_SQL : {}),
      ...(includeDefaultExecutionRuleTables ? DEFAULT_EXECUTION_RULE_SCHEMA_SQL : {}),
      ...(includeRunCheckpointTables ? RUN_CHECKPOINT_SCHEMA_SQL : {}),
      // Revision 35 (Issue #422) the Run's Clarification Requests and answers.
      ...(includeClarificationTables ? {
        ...CLARIFICATION_SCHEMA_SQL,
        // Revision 73 is additive; accept the predecessor only before the terminal version is stamped.
        analysis_clarification_requests: Number(db.prepare('PRAGMA user_version').get()!.user_version) < 73
          ? [CLARIFICATION_REVISION_72_SQL.analysis_clarification_requests, CLARIFICATION_SCHEMA_SQL.analysis_clarification_requests]
          : CLARIFICATION_SCHEMA_SQL.analysis_clarification_requests,
      } : {}),
      // Revision 36 (Issue #412) the chapter-level Reimport Comparison's groups, verbs and mark outcomes.
      ...(includeReimportGroupTables ? REIMPORT_GROUP_SCHEMA_SQL : {}),
      // Revision 37 (Issue #415) rebuilt `manuscripts` for Production Documents beside the two ledgers it created.
      ...(includeProductionDocumentTables ? { ...PRODUCTION_DOCUMENT_SCHEMA_SQL, manuscripts: MANUSCRIPTS_REVISION_37_SQL } : {}),
      // Revision 38 (Issue #415, S66b) adds the documents' Delivery Records.
      ...(includeProductionDocumentDeliveryTables ? PRODUCTION_DOCUMENT_DELIVERY_SCHEMA_SQL : {}),
      ...(includeBookDeliveryPackageTables ? BOOK_DELIVERY_PACKAGE_SCHEMA_SQL : {}),
      // Revision 40 (Issue #415, S66c) adds each document's workflow instance and phase moves.
      ...(includeProductionDocumentWorkflowTables ? PRODUCTION_DOCUMENT_WORKFLOW_SCHEMA_SQL : {}),
      // Revision 41 (Issue #416, S67b) adds each package export and the files it links.
      ...(includeBookDeliveryPackageExportTables ? BOOK_DELIVERY_PACKAGE_EXPORT_SCHEMA_SQL : {}),
      // Revision 42 (Issue #547) adds how each Production Document's origin material was read.
      ...(includeProductionDocumentOriginTables ? PRODUCTION_DOCUMENT_ORIGIN_SCHEMA_SQL : {}),
      // Revision 43 (Issue #426, S68a) adds the 维护事项 of each 发稿版本.
      ...(includeMaintenanceCaseTables ? MAINTENANCE_CASE_SCHEMA_SQL : {}),
      // Revision 44 (Issue #431, S83) adds each Book's 作者, 责编 and 相关人.
      ...(includeBookPeopleTables ? BOOK_PEOPLE_SCHEMA_SQL : {}),
      // Revision 45 (Issue #427, S79a) adds the versions a house imports of its review guideline documents.
      ...(includeReviewGuidelineTables ? REVIEW_GUIDELINE_SCHEMA_SQL : {}),
      // Revision 46 (Issue #427, S79c) adds the items an editor put into 资料库 and their decisions.
      ...(includeLibraryMaterialTables ? LIBRARY_MATERIAL_SCHEMA_SQL : {}),
      // Revision 47 (Issue #429, S81a) adds each Book's Evaluation Records and their chains of saves.
      ...(includeEvaluationRecordTables ? EVALUATION_RECORD_SCHEMA_SQL : {}),
      // Revision 48 (Issue #94, S38) adds the editor's judgments of analysis results.
      ...(includeAnalysisFeedbackTables ? ANALYSIS_FEEDBACK_SCHEMA_SQL : {}),
      // Revision 49 (Issue #61, S26a) adds the 不说明 and later reasons of Proposal Decisions.
      ...(includeDecisionFeedbackTables ? DECISION_FEEDBACK_SCHEMA_SQL : {}),
      // Revision 50 (Issue #61, S26b) adds the editor's Learning Eligibility decisions.
      ...(includeLearningEligibilityTables ? LEARNING_ELIGIBILITY_SCHEMA_SQL : {}),
      // Revision 51 (Issue #430, S82) adds each Book's 定价与首印 and the house's evaluation preferences.
      ...(includeEvaluationCalibrationTables ? EVALUATION_CALIBRATION_SCHEMA_SQL : {}),
      // Revision 52 (Issue #63, S28a) adds the house's Series and their membership changes.
      ...(includeSeriesTables ? SERIES_SCHEMA_SQL : {}),
      // Revision 53 (Issue #63, S28b) adds Series Knowledge: candidates, items, revisions and promotion decisions.
      ...(includeSeriesKnowledgeTables ? SERIES_KNOWLEDGE_SCHEMA_SQL : {}),
      // Revision 54 (Issue #433, S85a) adds the versions that opened the store.
      ...(includeDataVersionTables ? DATA_VERSION_SCHEMA_SQL : {}),
      // Revision 55 (Issue #434, S86a) adds the database exports' preparations, approvals and receipts.
      ...(includeDatabaseExportTables ? DATABASE_EXPORT_SCHEMA_SQL : {}),
      // Revision 56 (Issue #434, S86b) adds the 定期自动备份 switch's changes, the backups made and those removed.
      ...(includeScheduledBackupTables ? SCHEDULED_BACKUP_SCHEMA_SQL : {}),
      // Revision 57 (Issue #434, S86c) adds the replacements of the local data by a database package.
      ...(includeDatabaseReplacementTables ? DATABASE_REPLACEMENT_SCHEMA_SQL : {}),
      // Revision 58 (Issue #434, S86d) adds the merges of a database package's Books into the local data.
      ...(includeDatabaseMergeTables ? DATABASE_MERGE_SCHEMA_SQL : {}),
      // Revision 59 (Issue #429, S81b1) adds the AI7 初评 each Evaluation Record version began from.
      ...(includeEvaluationInitialDraftTables ? EVALUATION_INITIAL_DRAFT_SCHEMA_SQL : {}),
      // Revision 60 (Issue #52, S17a) adds the dialogue Tasks, their attempts, bindings, spans, outcomes and conversions;
      // revision 71 (S17c) widens the bindings for the live route, and revision 72 (Issue #811) for ordinary production: a store
      // below 71 may still hold revision 60's or 71's text, and one at 71 revision 71's.
      ...(includeDialogueTables ? DIALOGUE_SCHEMA_SQL : {}),
      // Revision 87 (Issue #1083) admits an all-null binding for a Book-less turn: a store below it may still hold the earlier text.
      ...(includeDialogueTables && Number(db.prepare('PRAGMA user_version').get()?.user_version) < GLOBAL_AGENT_SCHEMA_VERSION
        ? { dialogue_tasks: [DIALOGUE_TASKS_REVISION_86_SQL, DIALOGUE_SCHEMA_SQL.dialogue_tasks] } : {}),
      ...(includeDialogueTables && Number(db.prepare('PRAGMA user_version').get()?.user_version) < ADMITTED_CHANNELS_SCHEMA_VERSION
        ? {
            dialogue_execution_bindings: [DIALOGUE_EXECUTION_BINDINGS_REVISION_60_SQL, DIALOGUE_EXECUTION_BINDINGS_REVISION_71_SQL, DIALOGUE_EXECUTION_BINDINGS_REVISION_72_SQL, DIALOGUE_SCHEMA_SQL.dialogue_execution_bindings]
              .slice([DIALOGUE_LIVE_BINDING_SCHEMA_VERSION, MODEL_SERVICE_ROUTES_SCHEMA_VERSION, ADMITTED_CHANNELS_SCHEMA_VERSION]
                .findIndex((revision) => Number(db.prepare('PRAGMA user_version').get()?.user_version) < revision)),
          }
        : {}),
      // Revision 61 (Issue #64, S29b) adds the revisions of the Series Retrieval Exclusions.
      ...(includeSeriesRetrievalExclusionTables ? SERIES_RETRIEVAL_EXCLUSION_SCHEMA_SQL : {}),
      // Revision 62 (Issue #429, S81c) adds which 定稿 version each 审稿意见 Task drafts from, and which result became a draft.
      ...(includeReadersReportTables ? READERS_REPORT_SCHEMA_SQL : {}),
      // Revision 63 (Issue #65, S30) adds the Captured Procedures, their versions, states and pins, and the Developer Capability
      // Proposals with the files they were written to.
      ...(includeCapturedProcedureTables ? CAPTURED_PROCEDURE_SCHEMA_SQL : {}),
      // Revision 64 (Issue #429, S81b2) adds which version and saved entry each 按我的评分重写评语 Task rewrites, and the decisions.
      ...(includeEvaluationRewriteTables ? EVALUATION_REWRITE_SCHEMA_SQL : {}),
      // Revision 65 (Issue #432, S84a) adds which type, words and reference set each writing Task drafts from, and its drafts.
      ...(includeWritingTaskTables ? WRITING_TASK_SCHEMA_SQL : {}),
      // Revision 66 (Issue #95, S39) adds each Book's Background Analysis Enrollment, its versions and its states.
      ...(includeBackgroundAnalysisEnrollmentTables ? Object.fromEntries(Object.entries(BACKGROUND_ANALYSIS_ENROLLMENT_SCHEMA_SQL).map(([table, sql]) => [table, [sql, BACKGROUND_PROCESSING_ENROLLMENT_SCHEMA_SQL[table]!]])) : {}),
      // Revision 67 (Issue #428, S80a) adds each 资料库 item's Material Index build and the segments of a complete one.
      ...(includeMaterialIndexTables ? MATERIAL_INDEX_SCHEMA_SQL : {}),
      // Revision 68 (Issue #757) adds the editor's 人工结果确认 over requests whose results cannot be known.
      ...(includeOutcomeResolutionTables ? OUTCOME_RESOLUTION_SCHEMA_SQL : {}),
      ...(includeImportedExemplarTables ? IMPORTED_EXEMPLAR_SCHEMA_SQL : {}),
      ...(includeEvaluationProfileTables ? EVALUATION_PROFILE_SCHEMA_SQL : {}),
      ...(includeResearchEvidenceTables ? RESEARCH_EVIDENCE_SCHEMA_SQL : {}),
      ...(includeMaterialIndexLayerTables ? MATERIAL_INDEX_LAYER_SCHEMA_SQL : {}),
      ...(includeMaterialTranslationAttempts ? MATERIAL_TRANSLATION_ATTEMPT_SCHEMA_SQL : {}),
      ...(includeFactualVerificationTables ? FACTUAL_VERIFICATION_SCHEMA_SQL : {}),
      ...(includeFactualClaimTables ? FACTUAL_CLAIM_SCHEMA_SQL : {}),
      ...(includeHousePreferenceTables ? HOUSE_REVIEW_PREFERENCE_SCHEMA_SQL : {}),
      ...(includeEditorialLearningTables ? EDITORIAL_LEARNING_SCHEMA_SQL : {}),
      ...(includeSupervisionTables ? SUPERVISION_SCHEMA_SQL : {}),
      ...(includeTaskIntentDraftTables ? TASK_INTENT_DRAFT_SCHEMA_SQL : {}),
      ...(includeImportedSkillTables ? IMPORTED_SKILL_SCHEMA_SQL : {}),
      ...(includeCustomAnalysisTables ? CUSTOM_ANALYSIS_DIMENSION_SCHEMA_SQL : {}),
      ...(includeImportedSkillUpdateTables ? IMPORTED_SKILL_UPDATE_SCHEMA_SQL : {}),
      ...(includeProcedureDefinitions ? PROCEDURE_DEFINITION_SCHEMA_SQL : {}),
      ...(includeEditableProcedures ? { ...EDITABLE_PROCEDURE_SCHEMA_SQL, procedure_plan_pins: PROCEDURE_PLAN_PINS_V2_SQL } : {}),
      // Revision 100 (Issue #1175) rebuilds the two command relations beside the lineage relation it adds.
      ...(includeStructuralEdits ? STRUCTURAL_EDIT_SCHEMA_SQL : {}),
      // Revision 101 (Issue #1204) widens every block-kind CHECK to the note kind beside the note sources it adds.
      ...(includeNoteBlocks ? { ...widenedBlockKindTables(FULL_MANUSCRIPT_REIMPORT_TARGET_SCHEMA_SQL), ...NOTE_BLOCK_SCHEMA_SQL } : {}), ...(includeImportStructure ? IMPORT_STRUCTURE_SCHEMA_SQL : {}),
    },
    // The partial index that keeps one primary Manuscript per Book stands with the rebuilt relation, whatever the version.
    {
      ...MANUSCRIPT_REIMPORT_INDEX_SQL,
      ...(includeProductionDocumentTables || schemaObjectSql(db, 'table', 'manuscripts')?.includes("'production-document'") === true
        ? PRODUCTION_DOCUMENT_INDEX_SQL
        : {}),
    },
    true,
    {
      ...MANUSCRIPT_REIMPORT_TRIGGER_SQL,
      ...(includeAuthoritySidecarTables ? EDITORIAL_WORKSPACE_PROFILE_SIDECAR_TRIGGER_SQL : {}),
      ...(includeTaskAuthorizationTables ? TASK_AUTHORIZATION_TRIGGER_SQL : {}),
      ...(includeAnalysisLedgerTables ? analysisTriggers : {}),
      ...(committed(PROPOSAL_REVIEW_SCHEMA_SQL) ? PROPOSAL_REVIEW_TRIGGER_SQL : {}),
      ...(includeEditorialMarkTables ? EDITORIAL_MARK_TRIGGER_SQL : {}),
      ...(includeManuscriptEffectTables ? MANUSCRIPT_EFFECT_TRIGGER_SQL : {}),
      ...(includeReviewRunTables ? reviewTriggers : {}),
      ...(includeLocalStage ? LOCAL_STAGE_TRIGGER_SQL : {}),
      ...(includeHouseWordList ? HOUSE_WORD_LIST_TRIGGER_SQL : {}),
      ...(includePublicationVersionTables ? PUBLICATION_VERSION_TRIGGER_SQL : {}),
      ...(includeProposalConflictTables ? PROPOSAL_CONFLICT_TRIGGER_SQL : {}),
      ...(includeImportRetentionTables ? IMPORT_RETENTION_TRIGGER_SQL : {}),
      ...(includeWordImportRetentionTables ? WORD_IMPORT_RETENTION_TRIGGER_SQL : {}),
      ...(includeExportLedgerTables ? EXPORT_LEDGER_TRIGGER_SQL : {}),
      ...(includeDefaultExecutionRuleTables ? DEFAULT_EXECUTION_RULE_TRIGGER_SQL : {}),
      ...(includeRunCheckpointTables ? RUN_CHECKPOINT_TRIGGER_SQL : {}),
      ...(includeClarificationTables ? CLARIFICATION_TRIGGER_SQL : {}),
      ...(includeProductionDocumentTables ? PRODUCTION_DOCUMENT_TRIGGER_SQL : {}),
      ...(includeProductionDocumentDeliveryTables ? PRODUCTION_DOCUMENT_DELIVERY_TRIGGER_SQL : {}),
      ...(includeBookDeliveryPackageTables ? BOOK_DELIVERY_PACKAGE_TRIGGER_SQL : {}),
      ...(includeProductionDocumentWorkflowTables ? PRODUCTION_DOCUMENT_WORKFLOW_TRIGGER_SQL : {}),
      ...(includeBookDeliveryPackageExportTables ? BOOK_DELIVERY_PACKAGE_EXPORT_TRIGGER_SQL : {}),
      ...(includeProductionDocumentOriginTables ? PRODUCTION_DOCUMENT_ORIGIN_TRIGGER_SQL : {}),
      ...(includeMaintenanceCaseTables ? MAINTENANCE_CASE_TRIGGER_SQL : {}),
      ...(includeBookPeopleTables ? BOOK_PEOPLE_TRIGGER_SQL : {}),
      ...(includeReviewGuidelineTables ? REVIEW_GUIDELINE_TRIGGER_SQL : {}),
      ...(includeLibraryMaterialTables ? LIBRARY_MATERIAL_TRIGGER_SQL : {}),
      ...(includeEvaluationRecordTables ? EVALUATION_RECORD_TRIGGER_SQL : {}),
      ...(includeAnalysisFeedbackTables ? ANALYSIS_FEEDBACK_TRIGGER_SQL : {}),
      ...(includeDecisionFeedbackTables ? DECISION_FEEDBACK_TRIGGER_SQL : {}),
      ...(includeLearningEligibilityTables ? LEARNING_ELIGIBILITY_TRIGGER_SQL : {}),
      ...(includeEvaluationCalibrationTables ? EVALUATION_CALIBRATION_TRIGGER_SQL : {}),
      ...(includeSeriesTables ? SERIES_TRIGGER_SQL : {}),
      ...(includeSeriesKnowledgeTables ? SERIES_KNOWLEDGE_TRIGGER_SQL : {}),
      ...(includeDataVersionTables ? DATA_VERSION_TRIGGER_SQL : {}),
      ...(includeDatabaseExportTables ? DATABASE_EXPORT_TRIGGER_SQL : {}),
      ...(includeScheduledBackupTables ? SCHEDULED_BACKUP_TRIGGER_SQL : {}),
      ...(includeDatabaseReplacementTables ? DATABASE_REPLACEMENT_TRIGGER_SQL : {}),
      ...(includeDatabaseMergeTables ? DATABASE_MERGE_TRIGGER_SQL : {}),
      ...(includeEvaluationInitialDraftTables ? EVALUATION_INITIAL_DRAFT_TRIGGER_SQL : {}),
      ...(includeDialogueTables ? DIALOGUE_TRIGGER_SQL : {}),
      ...(includeSeriesRetrievalExclusionTables ? SERIES_RETRIEVAL_EXCLUSION_TRIGGER_SQL : {}),
      ...(includeReadersReportTables ? READERS_REPORT_TRIGGER_SQL : {}),
      ...(includeCapturedProcedureTables ? CAPTURED_PROCEDURE_TRIGGER_SQL : {}),
      ...(includeEvaluationRewriteTables ? EVALUATION_REWRITE_TRIGGER_SQL : {}),
      ...(includeWritingTaskTables ? WRITING_TASK_TRIGGER_SQL : {}),
      ...(includeBackgroundAnalysisEnrollmentTables ? BACKGROUND_ANALYSIS_ENROLLMENT_TRIGGER_SQL : {}),
      ...(includeMaterialIndexTables ? MATERIAL_INDEX_TRIGGER_SQL : {}),
      ...(includeOutcomeResolutionTables ? OUTCOME_RESOLUTION_TRIGGER_SQL : {}),
      ...(includeImportedExemplarTables ? IMPORTED_EXEMPLAR_TRIGGER_SQL : {}),
      ...(includeEvaluationProfileTables ? EVALUATION_PROFILE_TRIGGER_SQL : {}),
      ...(includeResearchEvidenceTables ? RESEARCH_EVIDENCE_TRIGGER_SQL : {}),
      ...(includeMaterialIndexLayerTables ? MATERIAL_INDEX_LAYER_TRIGGER_SQL : {}),
      ...(includeMaterialTranslationAttempts ? MATERIAL_TRANSLATION_ATTEMPT_TRIGGER_SQL : {}),
      ...(includeFactualVerificationTables ? FACTUAL_VERIFICATION_TRIGGER_SQL : {}),
      ...(includeFactualClaimTables ? FACTUAL_CLAIM_TRIGGER_SQL : {}),
      ...(includeHousePreferenceTables ? HOUSE_REVIEW_PREFERENCE_TRIGGER_SQL : {}),
      ...(includeEditorialLearningTables ? EDITORIAL_LEARNING_TRIGGER_SQL : {}),
      ...(includeSupervisionTables ? SUPERVISION_TRIGGER_SQL : {}),
      ...(includeTaskIntentDraftTables ? TASK_INTENT_DRAFT_TRIGGER_SQL : {}),
      ...(includeImportedSkillTables ? IMPORTED_SKILL_TRIGGER_SQL : {}),
      ...(includeCustomAnalysisTables ? CUSTOM_ANALYSIS_DIMENSION_TRIGGER_SQL : {}),
      ...(includeImportedSkillUpdateTables ? IMPORTED_SKILL_UPDATE_TRIGGER_SQL : {}),
      ...(includeProcedureDefinitions ? PROCEDURE_DEFINITION_TRIGGER_SQL : {}),
      ...(includeEditableProcedures ? EDITABLE_PROCEDURE_TRIGGER_SQL : {}),
      ...(includeNoteBlocks ? NOTE_BLOCK_TRIGGER_SQL : {}), ...(includeImportStructure ? IMPORT_STRUCTURE_TRIGGER_SQL : {}),
    },
  );
  if (includeMaterialTranslationAttempts) validateMaterialTranslationAttemptSchema(db);
  if (includeProcedureDefinitions) { validateProcedureDefinitions(db, Number(db.prepare('PRAGMA user_version').get()?.user_version) < HOUSE_WORD_LIST_SCHEMA_VERSION); }
  if (includeLocalStage) validateLocalStageArtifacts(db);
}

export function requireV7TargetSchema(db: DatabaseSync): void {
  requireExactSchema(db, FULL_V7_TARGET_SCHEMA_SQL, V7_TARGET_INDEX_SQL, true);
}

export function requireV6TargetSchema(db: DatabaseSync): void {
  requireExactSchema(db, FULL_V6_TARGET_SCHEMA_SQL, V6_TARGET_INDEX_SQL, true);
}
