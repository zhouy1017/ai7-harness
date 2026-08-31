import { createHash, randomUUID } from 'node:crypto';
import { closeSync, constants, createReadStream, fstatSync, lstatSync, openSync, readSync } from 'node:fs';
import { copyFile, lstat, open, realpath, rename, rm } from 'node:fs/promises';
import { basename, isAbsolute, posix, relative, resolve, sep } from 'node:path';
import { DatabaseSync, type SQLOutputValue } from 'node:sqlite';
import { MAX_BLOCK_CODE_UNITS, MAX_FRAME_BYTES } from '../shared/protocol.js';
import type {
  BookCreationCommitProjection,
  BookCreationReviewProjection,
  BookHistoryCursor,
  BookSummaryCursor,
  BookSummaryPageProjection,
  BookRecordPresentation,
  BookWorkOverviewProjection,
  EditorialWorkspaceProfileProjection,
  FidelityCategoryProjection,
  HistoricalRevisionProjection,
  ImportCommitProjection,
  ImportDegradationDecisionReviewProjection,
  ImportDraftRecoveryProjection,
  ImportIdentityFindingProjection,
  ImportStartupProjection,
  ImportTargetSelection,
  ManuscriptImportCommitProjection,
  ManuscriptBlockProjection,
  ManuscriptReimportCommitProjection,
  ManuscriptReimportTargetSelection,
  JournalAcknowledgement,
  JournalEditInput,
  ManuscriptWindowProjection,
  ModelCredentialOperationState,
  ModelServiceConnectionProjection,
  NewBookImportTargetChoiceId,
  OriginalFileAccessProjection,
  ReviewBeforeImportProjection,
  ReviewBeforeSourceImportProjection,
  ReviewBeforeManuscriptReimportProjection,
  ReimportIdentityCandidatePageProjection,
  ReimportLineageSourceVersionPageProjection,
  ReimportMappingPageProjection,
  SourceImportCommitProjection,
  SourceImportTargetSelection,
  StagedImportProjection,
  ContinueImportProjection,
  DurableHistoryProjection,
  ManuscriptWindowTarget,
  MilestoneProjection,
  OutlineProjection,
  PriorWorkItemProjection,
  ReplacementCommitProjection,
  ReplacementDismissalProjection,
  ReplacementPreviewProjection,
  RecoveryComparisonProjection,
  RecoveryDeferralProjection,
  RecoveryRestorationProjection,
  RecoverySelection,
  RecoveryWindowProjection,
  RecoveryWindowTarget,
  SearchResultsProjection,
  SearchSummaryProjection,
  StartupProjection,
  BookWorkbenchRoute,
  ResolvedBookWorkbenchRoute,
} from '../shared/protocol.js';
import {
  deriveImportFidelityPlan,
  DOCX_PARSER_IDENTITY,
  parseDocx,
  type ImportFidelityPlan,
  type ParsedDocx,
  type ParsedDocxBlock,
} from './docx.js';
import {
  BoundedManuscriptStore,
  BoundedStoreError,
  BoundedStoreFatalError,
  initializeBoundedSchema,
  MODEL_SERVICE_CONNECTION_SCHEMA_SQL,
  validateManuscriptReimportSchemaTruth,
  validateSourceImportSchemaTruth,
  type RecoverySnapshotCursor,
  type RecoverySnapshotRecord,
  type ReimportCheckpointBinding,
  type VerifiedRecoverySnapshot,
} from './bounded-manuscript.js';
import { RecoveryObjectStore } from './recovery-objects.js';
import {
  createCanonicalExternalDataRoot,
  ensureCanonicalDataDirectory,
  inspectCanonicalDataFile,
} from '../shared/data-root.js';
import {
  loadBuiltInManuscriptProfile,
  type BuiltInWorkflowProfile,
} from './native-workflow-profile.js';
import {
  EDITORIAL_WORKSPACE_PROFILE_SCHEMA_VERSION,
  EditorialWorkspaceProfileError,
  EditorialWorkspaceProfileFatalError,
  EditorialWorkspaceProfileStore,
  initializeEditorialWorkspaceProfileSchema,
  validateEditorialWorkspaceProfileSchema,
} from './editorial-workspace-profile.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOKEN_PATTERN = UUID_PATTERN;
const DIGEST_PATTERN = /^[0-9a-f]{64}$/;
const CORE_SCHEMA_VERSION = 5;
const EDITOR_SCHEMA_VERSION = 6;
const RECOVERY_SCHEMA_VERSION = 7;
const SCHEMA_VERSION = 8;
const SOURCE_IMPORT_SCHEMA_VERSION = 9;
const MANUSCRIPT_REIMPORT_SCHEMA_VERSION = 10;
const MODEL_SERVICE_SCHEMA_VERSION = 11;
const BOOK_SUMMARY_PAGE_SIZE = 20;
const BOOK_HISTORY_PAGE_SIZE = 8;
const INGEST_BATCH_SIZE = 256;
const REIMPORT_MAPPING_BATCH_SIZE = 64;
const REIMPORT_COMMIT_FILE_BATCH_BYTES = 256 * 1024;
const REIMPORT_MAX_JSON_BLOCK_BYTES = MAX_BLOCK_CODE_UNITS * 6;
const REIMPORT_WIRE_HEADROOM_BYTES = 4_096;
const REIMPORT_MAPPING_PAGE_SIZE = 4;
const REIMPORT_IDENTITY_CANDIDATE_PAGE_SIZE = 16;
const REIMPORT_LINEAGE_CHOICE_LIMIT = 32;
const LEGACY_WORKFLOW_PROFILE = {
  id: 'ai7.manuscript.editorial.zh-CN',
  name: '基础书稿编辑流程',
  version: '1.0.0',
  phases: ['接收与准备', '来源建设', '起草', '审阅与核查', '定稿', '交付', '维护'],
} as const;
const BASELINE_EDITORIAL_DIMENSION_SET = {
  profileId: 'ai7.editorial.baseline',
  name: '基础图书编辑维度集',
  profileVersion: '1.0.0',
  weightSemantics: '中性起始权重；非穷尽评分量表',
  dimensions: [
    { id: 'literary-quality-voice', label: '文学质量与声音', weight: 1 },
    { id: 'theme-values-social-cultural-context', label: '主题、价值观与社会文化语境', weight: 1 },
    { id: 'structure-narrative-coherence', label: '结构与叙事连贯性', weight: 1 },
    { id: 'chinese-language-style', label: '中文语言与风格', weight: 1 },
    { id: 'factual-source-integrity', label: '事实与来源完整性', weight: 1 },
    { id: 'readership-market-positioning', label: '读者与市场定位', weight: 1 },
    { id: 'legal-rights-ethical-policy-risk', label: '法律、权利、伦理与出版政策风险', weight: 1 },
    { id: 'production-cross-deliverable-consistency', label: '制作与跨交付物一致性', weight: 1 },
  ],
} as const;
const BASE_RECORDS_TO_CREATE = [
  '图书与稳定标识',
  '图书编辑维度集（8 项）',
  '源材料版本与来源记录',
  '导入保真审阅',
  '主稿件',
  '稿件分支',
  '稿件修订版 r1 与有序稳定内容块',
  '工作流程实例与精确方案版本绑定',
  '稿件导入记录',
] as const;
const NON_EFFECTS = [
  '不创建书系或书系成员关系',
  '不创建编辑学习准入决定',
  '不授予或执行模型提供方传输',
  '不创建发稿版本',
  '不创建公开发布许可或公开发布事实',
  '不导出、不发送、不交付、不发布',
  '不承诺 DOCX 往返或版式复原',
] as const;
const CLEAN_IMPORT_NON_EFFECT = '符合当前范围的导入不创建导入降级决定';
const EMPTY_BOOK_NON_EFFECTS = [
  '不创建稿件、来源、修订版、工作流实例或导入记录',
  '不创建书系或书系成员关系',
  '不创建编辑学习准入决定',
  '不授予或执行模型提供方传输',
  '不创建发稿版本',
  '不创建公开发布许可或公开发布事实',
  '不导出、不发送、不交付、不发布',
] as const;
const DEGRADATION_DECISION_SCHEMA = 'ai7.import-degradation-decision/1';
const SOURCE_IMPORT_RECORD_SCHEMA = 'ai7.source-import-record/1';
const SOURCE_IMPORT_RETAINED_BOUNDARY_LABEL =
  '保留完整所选 DOCX 文件及本地解析出的完整内容与结构身份' as const;
const SOURCE_IMPORT_NON_EFFECTS = [
  '不创建稿件',
  '不创建稿件修订版',
  '不创建工作流实例',
  '不创建运行来源范围',
  '不创建事实状态或事实核查结论',
  '不创建书系或书系成员关系',
  '不创建编辑学习准入决定',
  '不授予或执行模型提供方传输',
  '不创建发稿版本、公开发布许可或公开发布事实',
  '不导出、不发送、不交付、不发布',
] as const;
const MANUSCRIPT_REIMPORT_RECORD_SCHEMA = 'ai7.manuscript-reimport-record/1';
const MANUSCRIPT_REIMPORT_NON_EFFECTS = [
  '不创建第二份主稿件或并行稿件分支',
  '不把来源关系未确认解释为导入阻断、来源确认或血缘证明',
  '不执行模糊匹配或通用合并',
  '不创建里程碑、恢复快照、恢复决定或恢复注意事项',
  '不改变图书稳定标识、内部编号、编辑维度集或工作流程实例',
  '不创建运行来源范围、事实状态或事实核查结论',
  '不创建书系或书系成员关系',
  '不创建编辑学习准入决定',
  '不授予或执行模型提供方传输',
  '不创建发稿版本、公开发布许可或公开发布事实',
  '不导出、不发送、不交付、不发布',
] as const;

const SOURCE_IMPORT_SCHEMA_SQL = `CREATE TABLE source_import_records (
  source_import_record_id TEXT PRIMARY KEY,
  commit_id TEXT NOT NULL UNIQUE,
  book_id TEXT NOT NULL REFERENCES books(book_id),
  source_version_id TEXT NOT NULL REFERENCES source_versions(source_version_id),
  provenance_id TEXT NOT NULL UNIQUE REFERENCES source_provenance(provenance_id),
  target_kind TEXT NOT NULL CHECK(target_kind IN ('new-book', 'existing-book')),
  source_version_disposition TEXT NOT NULL CHECK(source_version_disposition IN ('created', 'reused-same-book')),
  retained_boundary_json TEXT NOT NULL,
  named_non_effects_json TEXT NOT NULL,
  record_digest TEXT NOT NULL UNIQUE CHECK(length(record_digest) = 64),
  imported_at TEXT NOT NULL
) STRICT`;
const SOURCE_PROVENANCE_V9_SCHEMA_SQL = `CREATE TABLE source_provenance (
  provenance_id TEXT PRIMARY KEY,
  source_version_id TEXT NOT NULL REFERENCES source_versions(source_version_id),
  acquisition_path TEXT NOT NULL CHECK(acquisition_path = 'native-file-picker'),
  locality TEXT NOT NULL CHECK(locality = 'local-provider-free'),
  sanitized_identity TEXT NOT NULL,
  parser_identity TEXT NOT NULL,
  recorded_at TEXT NOT NULL
) STRICT`;
const SOURCE_IMPORT_DRAFT_V9_SCHEMA_SQL = `CREATE TABLE import_drafts (
  draft_id TEXT PRIMARY KEY,
  selection_token TEXT NOT NULL UNIQUE,
  state TEXT NOT NULL CHECK(state IN ('staged', 'reviewed', 'committed')),
  draft_version INTEGER NOT NULL CHECK(draft_version >= 1),
  display_name TEXT NOT NULL,
  object_digest TEXT NOT NULL REFERENCES content_objects(object_digest),
  selected_path TEXT,
  reviewed_title TEXT,
  reviewed_target_choice_id TEXT
    CHECK(reviewed_target_choice_id IS NULL OR reviewed_target_choice_id IN ('new-book', 'new-book-distinct-intended-work')),
  review_digest TEXT UNIQUE,
  committed_commit_id TEXT UNIQUE,
  staged_at TEXT NOT NULL,
  reviewed_at TEXT,
  committed_at TEXT,
  reviewed_target_kind TEXT CHECK(reviewed_target_kind IS NULL OR reviewed_target_kind IN ('new-book', 'existing-book')),
  reviewed_existing_book_id TEXT REFERENCES books(book_id),
  reviewed_relationship TEXT
    CHECK(reviewed_relationship IS NULL OR reviewed_relationship IN ('new-book-first-manuscript', 'first-manuscript', 'source-only')),
  reviewed_book_state_digest TEXT
    CHECK(reviewed_book_state_digest IS NULL OR length(reviewed_book_state_digest) = 64),
  reviewed_reuse_source_version_id TEXT REFERENCES source_versions(source_version_id)
) STRICT`;
const SOURCE_IMPORT_COMMIT_V9_SCHEMA_SQL = `CREATE TABLE import_commits (
  commit_id TEXT PRIMARY KEY,
  draft_id TEXT NOT NULL UNIQUE REFERENCES import_drafts(draft_id),
  request_fingerprint TEXT NOT NULL,
  expected_draft_version INTEGER NOT NULL,
  review_digest TEXT NOT NULL,
  operation_kind TEXT NOT NULL CHECK(operation_kind IN ('manuscript-import', 'source-import')),
  result_json TEXT NOT NULL,
  committed_at TEXT NOT NULL
) STRICT`;
const SOURCE_IMPORT_ATTEMPT_V9_SCHEMA_SQL = `CREATE TABLE import_commit_attempts (
  attempt_id TEXT PRIMARY KEY,
  draft_id TEXT NOT NULL UNIQUE REFERENCES import_drafts(draft_id) ON DELETE CASCADE,
  request_fingerprint TEXT NOT NULL,
  expected_draft_version INTEGER NOT NULL CHECK(expected_draft_version >= 1),
  review_digest TEXT NOT NULL CHECK(length(review_digest) = 64),
  operation_kind TEXT NOT NULL CHECK(operation_kind IN ('manuscript-import', 'source-import')),
  state TEXT NOT NULL CHECK(state IN ('prepared', 'uncertain', 'committed')),
  prepared_at TEXT NOT NULL,
  committed_at TEXT,
  uncertain_at TEXT,
  uncertainty_code TEXT,
  completion_acknowledged_at TEXT,
  CHECK(
    (state = 'prepared' AND committed_at IS NULL AND uncertain_at IS NULL
      AND uncertainty_code IS NULL AND completion_acknowledged_at IS NULL)
    OR (state = 'uncertain' AND committed_at IS NULL AND uncertain_at IS NOT NULL
      AND uncertainty_code = 'COMMIT_PROOF_INCONCLUSIVE' AND completion_acknowledged_at IS NULL)
    OR (state = 'committed' AND committed_at IS NOT NULL AND uncertain_at IS NULL
      AND uncertainty_code IS NULL)
  )
) STRICT`;
const REIMPORT_DRAFT_V10_SCHEMA_SQL = `CREATE TABLE import_drafts (
  draft_id TEXT PRIMARY KEY,
  selection_token TEXT NOT NULL UNIQUE,
  state TEXT NOT NULL CHECK(state IN ('staged', 'reviewed', 'committed')),
  draft_version INTEGER NOT NULL CHECK(draft_version >= 1),
  display_name TEXT NOT NULL,
  object_digest TEXT NOT NULL REFERENCES content_objects(object_digest),
  selected_path TEXT,
  reviewed_title TEXT,
  reviewed_target_choice_id TEXT
    CHECK(reviewed_target_choice_id IS NULL OR reviewed_target_choice_id IN ('new-book', 'new-book-distinct-intended-work')),
  review_digest TEXT UNIQUE,
  committed_commit_id TEXT UNIQUE,
  staged_at TEXT NOT NULL,
  reviewed_at TEXT,
  committed_at TEXT,
  reviewed_target_kind TEXT CHECK(reviewed_target_kind IS NULL OR reviewed_target_kind IN ('new-book', 'existing-book')),
  reviewed_existing_book_id TEXT REFERENCES books(book_id),
  reviewed_relationship TEXT
    CHECK(reviewed_relationship IS NULL OR reviewed_relationship IN ('new-book-first-manuscript', 'first-manuscript', 'source-only', 'reimport')),
  reviewed_book_state_digest TEXT
    CHECK(reviewed_book_state_digest IS NULL OR length(reviewed_book_state_digest) = 64),
  reviewed_reuse_source_version_id TEXT REFERENCES source_versions(source_version_id),
  reviewed_lineage_status TEXT CHECK(reviewed_lineage_status IS NULL OR reviewed_lineage_status IN ('verified', 'unconfirmed')),
  reviewed_lineage_source_version_id TEXT REFERENCES source_versions(source_version_id),
  reviewed_checkpoint_revision_id TEXT REFERENCES manuscript_revisions(revision_id),
  reviewed_manuscript_id TEXT REFERENCES manuscripts(manuscript_id),
  reviewed_branch_id TEXT REFERENCES manuscript_branches(branch_id)
) STRICT`;
const REIMPORT_COMMIT_V10_SCHEMA_SQL = `CREATE TABLE import_commits (
  commit_id TEXT PRIMARY KEY,
  draft_id TEXT NOT NULL UNIQUE REFERENCES import_drafts(draft_id),
  request_fingerprint TEXT NOT NULL,
  expected_draft_version INTEGER NOT NULL,
  review_digest TEXT NOT NULL,
  operation_kind TEXT NOT NULL CHECK(operation_kind IN ('manuscript-import', 'source-import', 'manuscript-reimport')),
  result_json TEXT NOT NULL,
  committed_at TEXT NOT NULL
) STRICT`;
const REIMPORT_ATTEMPT_V10_SCHEMA_SQL = `CREATE TABLE import_commit_attempts (
  attempt_id TEXT PRIMARY KEY,
  draft_id TEXT NOT NULL UNIQUE REFERENCES import_drafts(draft_id) ON DELETE CASCADE,
  request_fingerprint TEXT NOT NULL,
  expected_draft_version INTEGER NOT NULL CHECK(expected_draft_version >= 1),
  review_digest TEXT NOT NULL CHECK(length(review_digest) = 64),
  operation_kind TEXT NOT NULL CHECK(operation_kind IN ('manuscript-import', 'source-import', 'manuscript-reimport')),
  state TEXT NOT NULL CHECK(state IN ('prepared', 'uncertain', 'committed')),
  prepared_at TEXT NOT NULL,
  committed_at TEXT,
  uncertain_at TEXT,
  uncertainty_code TEXT,
  completion_acknowledged_at TEXT,
  CHECK(
    (state = 'prepared' AND committed_at IS NULL AND uncertain_at IS NULL
      AND uncertainty_code IS NULL AND completion_acknowledged_at IS NULL)
    OR (state = 'uncertain' AND committed_at IS NULL AND uncertain_at IS NOT NULL
      AND uncertainty_code = 'COMMIT_PROOF_INCONCLUSIVE' AND completion_acknowledged_at IS NULL)
    OR (state = 'committed' AND committed_at IS NOT NULL AND uncertain_at IS NULL
      AND uncertainty_code IS NULL)
  )
) STRICT`;
const REIMPORT_FACT_SCHEMA_SQL = `
  CREATE TABLE manuscript_reimport_comparisons (
    comparison_id TEXT PRIMARY KEY,
    draft_id TEXT NOT NULL UNIQUE REFERENCES import_drafts(draft_id) ON DELETE CASCADE,
    manuscript_id TEXT NOT NULL REFERENCES manuscripts(manuscript_id),
    branch_id TEXT NOT NULL REFERENCES manuscript_branches(branch_id),
    checkpoint_revision_id TEXT NOT NULL REFERENCES manuscript_revisions(revision_id),
    checkpoint_revision_label TEXT NOT NULL,
    checkpoint_revision_digest TEXT NOT NULL CHECK(length(checkpoint_revision_digest) = 64),
    checkpoint_journal_sequence INTEGER NOT NULL CHECK(checkpoint_journal_sequence >= 0),
    checkpoint_created_for_dirty_journal INTEGER NOT NULL CHECK(checkpoint_created_for_dirty_journal IN (0, 1)),
    lineage_status TEXT NOT NULL CHECK(lineage_status IN ('verified', 'unconfirmed')),
    lineage_source_version_id TEXT REFERENCES source_versions(source_version_id),
    lineage_revision_id TEXT REFERENCES manuscript_revisions(revision_id),
    lineage_revision_digest TEXT CHECK(lineage_revision_digest IS NULL OR length(lineage_revision_digest) = 64),
    comparison_kind TEXT NOT NULL CHECK(comparison_kind IN ('three-way', 'two-way')),
    staged_source_digest TEXT NOT NULL CHECK(length(staged_source_digest) = 64),
    staged_content_digest TEXT NOT NULL CHECK(length(staged_content_digest) = 64),
    staged_structure_digest TEXT NOT NULL CHECK(length(staged_structure_digest) = 64),
    staged_parser_identity TEXT NOT NULL,
    staged_block_count INTEGER NOT NULL CHECK(staged_block_count > 0),
    checkpoint_block_count INTEGER NOT NULL CHECK(checkpoint_block_count > 0),
    total_mappings INTEGER NOT NULL CHECK(total_mappings > 0),
    unresolved_mappings INTEGER NOT NULL CHECK(unresolved_mappings >= 0 AND unresolved_mappings <= total_mappings),
    changed_mappings INTEGER NOT NULL CHECK(changed_mappings >= 0 AND changed_mappings <= total_mappings),
    comparison_digest TEXT NOT NULL UNIQUE CHECK(length(comparison_digest) = 64),
    resolution_digest TEXT NOT NULL CHECK(length(resolution_digest) = 64),
    degradation_accepted INTEGER NOT NULL CHECK(degradation_accepted IN (0, 1)),
    created_at TEXT NOT NULL,
    CHECK(
      (lineage_status = 'verified' AND lineage_source_version_id IS NOT NULL
        AND lineage_revision_id IS NOT NULL AND comparison_kind = 'three-way')
      OR (lineage_status = 'unconfirmed' AND lineage_source_version_id IS NULL
        AND lineage_revision_id IS NULL AND comparison_kind = 'two-way')
    )
  ) STRICT;
  CREATE TABLE manuscript_reimport_mappings (
    mapping_id TEXT PRIMARY KEY,
    comparison_id TEXT NOT NULL REFERENCES manuscript_reimport_comparisons(comparison_id) ON DELETE CASCADE,
    position INTEGER NOT NULL CHECK(position > 0),
    change_kind TEXT NOT NULL CHECK(change_kind IN ('unchanged', 'move', 'edit', 'insert', 'delete')),
    current_block_id TEXT REFERENCES manuscript_blocks(block_id),
    current_revision_id TEXT REFERENCES manuscript_revisions(revision_id),
    current_position INTEGER CHECK(current_position IS NULL OR current_position > 0),
    lineage_block_id TEXT REFERENCES manuscript_blocks(block_id),
    lineage_revision_id TEXT REFERENCES manuscript_revisions(revision_id),
    lineage_position INTEGER CHECK(lineage_position IS NULL OR lineage_position > 0),
    staged_block_id TEXT,
    staged_draft_id TEXT,
    staged_position INTEGER CHECK(staged_position IS NULL OR staged_position > 0),
    identity_consequence TEXT CHECK(identity_consequence IS NULL OR identity_consequence IN
      ('preserve-current-identity', 'create-new-identity', 'retire-current-identity')),
    current_kind TEXT CHECK(current_kind IS NULL OR current_kind IN ('title', 'heading', 'paragraph')),
    current_level INTEGER,
    current_text TEXT,
    current_digest TEXT CHECK(current_digest IS NULL OR length(current_digest) = 64),
    lineage_kind TEXT CHECK(lineage_kind IS NULL OR lineage_kind IN ('title', 'heading', 'paragraph')),
    lineage_level INTEGER,
    lineage_text TEXT,
    lineage_digest TEXT CHECK(lineage_digest IS NULL OR length(lineage_digest) = 64),
    staged_kind TEXT CHECK(staged_kind IS NULL OR staged_kind IN ('title', 'heading', 'paragraph')),
    staged_level INTEGER,
    staged_text TEXT,
    staged_digest TEXT CHECK(staged_digest IS NULL OR length(staged_digest) = 64),
    resolved_changed INTEGER CHECK(resolved_changed IS NULL OR resolved_changed IN (0, 1)),
    UNIQUE(comparison_id, position),
    CHECK(current_block_id IS NOT NULL OR staged_block_id IS NOT NULL),
    CHECK((current_block_id IS NULL) = (current_kind IS NULL)),
    CHECK((current_block_id IS NULL) = (current_text IS NULL)),
    CHECK((current_block_id IS NULL) = (current_digest IS NULL)),
    CHECK((lineage_block_id IS NULL) = (lineage_kind IS NULL)),
    CHECK((lineage_block_id IS NULL) = (lineage_text IS NULL)),
    CHECK((lineage_block_id IS NULL) = (lineage_digest IS NULL)),
    CHECK((staged_block_id IS NULL) = (staged_kind IS NULL)),
    CHECK((staged_block_id IS NULL) = (staged_text IS NULL)),
    CHECK((staged_block_id IS NULL) = (staged_digest IS NULL)),
    CHECK(
      (change_kind = 'unchanged' AND current_block_id IS NOT NULL AND staged_block_id IS NOT NULL
        AND current_position = staged_position AND identity_consequence = 'preserve-current-identity')
      OR (change_kind = 'move' AND current_block_id IS NOT NULL AND staged_block_id IS NOT NULL
        AND current_position != staged_position AND identity_consequence = 'preserve-current-identity')
      OR (change_kind = 'edit' AND current_block_id IS NOT NULL AND staged_block_id IS NOT NULL
        AND identity_consequence IS NULL)
      OR (change_kind = 'insert' AND current_block_id IS NULL AND staged_block_id IS NOT NULL
        AND identity_consequence IS NULL)
      OR (change_kind = 'delete' AND current_block_id IS NOT NULL AND staged_block_id IS NULL
        AND identity_consequence IS NULL)
    )
  ) STRICT;
  CREATE TABLE manuscript_reimport_mapping_resolutions (
    mapping_id TEXT PRIMARY KEY REFERENCES manuscript_reimport_mappings(mapping_id) ON DELETE CASCADE,
    comparison_id TEXT NOT NULL REFERENCES manuscript_reimport_comparisons(comparison_id) ON DELETE CASCADE,
    resolution TEXT NOT NULL CHECK(resolution IN
      ('preserve-current-identity', 'create-new-identity', 'retire-current-identity')),
    resolved_current_block_id TEXT REFERENCES manuscript_blocks(block_id),
    resolved_at TEXT NOT NULL,
    UNIQUE(comparison_id, resolved_current_block_id),
    CHECK((resolution = 'preserve-current-identity') = (resolved_current_block_id IS NOT NULL))
  ) STRICT;
  CREATE TABLE manuscript_reimport_records (
    reimport_record_id TEXT PRIMARY KEY,
    comparison_id TEXT NOT NULL UNIQUE REFERENCES manuscript_reimport_comparisons(comparison_id),
    commit_id TEXT NOT NULL UNIQUE,
    book_id TEXT NOT NULL REFERENCES books(book_id),
    manuscript_id TEXT NOT NULL REFERENCES manuscripts(manuscript_id),
    branch_id TEXT NOT NULL REFERENCES manuscript_branches(branch_id),
    source_version_id TEXT NOT NULL REFERENCES source_versions(source_version_id),
    provenance_id TEXT NOT NULL UNIQUE REFERENCES source_provenance(provenance_id),
    previous_revision_id TEXT NOT NULL REFERENCES manuscript_revisions(revision_id),
    resulting_revision_id TEXT REFERENCES manuscript_revisions(revision_id),
    result_kind TEXT NOT NULL CHECK(result_kind IN ('changed', 'no-change')),
    result_label TEXT NOT NULL CHECK(result_label IN ('稿件已重新导入', '未发现稿件变化')),
    lineage_status TEXT NOT NULL CHECK(lineage_status IN ('verified', 'unconfirmed')),
    lineage_source_version_id TEXT REFERENCES source_versions(source_version_id),
    comparison_kind TEXT NOT NULL CHECK(comparison_kind IN ('three-way', 'two-way')),
    comparison_digest TEXT NOT NULL CHECK(length(comparison_digest) = 64),
    resolution_digest TEXT NOT NULL CHECK(length(resolution_digest) = 64),
    fidelity_review_id TEXT NOT NULL UNIQUE REFERENCES import_fidelity_reviews(fidelity_review_id),
    degradation_decision_id TEXT REFERENCES import_degradation_decisions(degradation_decision_id),
    record_digest TEXT NOT NULL UNIQUE CHECK(length(record_digest) = 64),
    imported_at TEXT NOT NULL,
    CHECK(
      (result_kind = 'changed' AND result_label = '稿件已重新导入' AND resulting_revision_id IS NOT NULL)
      OR (result_kind = 'no-change' AND result_label = '未发现稿件变化' AND resulting_revision_id IS NULL)
    ),
    CHECK(
      (lineage_status = 'verified' AND lineage_source_version_id IS NOT NULL AND comparison_kind = 'three-way')
      OR (lineage_status = 'unconfirmed' AND lineage_source_version_id IS NULL AND comparison_kind = 'two-way')
    )
  ) STRICT;
`;
const SOURCE_IMPORT_REBUILT_TRIGGER_SQL = `
  CREATE TRIGGER abandonment_cleanup_block_draft_insert
  BEFORE INSERT ON import_drafts
  WHEN EXISTS (
    SELECT 1 FROM import_abandonment_cleanup_intents i
    WHERE i.object_digest = NEW.object_digest
  )
  BEGIN
    SELECT RAISE(ABORT, 'ABANDONMENT_CLEANUP_PENDING');
  END;
  CREATE TRIGGER abandonment_cleanup_block_draft_update
  BEFORE UPDATE ON import_drafts
  WHEN EXISTS (SELECT 1 FROM import_abandonment_cleanup_intents i WHERE i.draft_id = OLD.draft_id)
    OR EXISTS (SELECT 1 FROM import_abandonment_cleanup_intents i WHERE i.object_digest = NEW.object_digest)
  BEGIN
    SELECT RAISE(ABORT, 'ABANDONMENT_CLEANUP_PENDING');
  END;
  CREATE TRIGGER abandonment_cleanup_block_draft_update_v5
  BEFORE UPDATE ON import_drafts
  WHEN EXISTS (
    SELECT 1 FROM import_abandonment_cleanup_intents i
    WHERE i.draft_id = OLD.draft_id OR i.draft_id = NEW.draft_id
      OR i.object_digest = OLD.object_digest OR i.object_digest = NEW.object_digest
  )
  BEGIN
    SELECT RAISE(ABORT, 'ABANDONMENT_CLEANUP_PENDING');
  END;
  CREATE TRIGGER abandonment_cleanup_block_commit_insert
  BEFORE INSERT ON import_commits
  WHEN EXISTS (SELECT 1 FROM import_abandonment_cleanup_intents i WHERE i.draft_id = NEW.draft_id)
  BEGIN
    SELECT RAISE(ABORT, 'ABANDONMENT_CLEANUP_PENDING');
  END;
  CREATE TRIGGER abandonment_cleanup_block_commit_update_v5
  BEFORE UPDATE ON import_commits
  WHEN EXISTS (
    SELECT 1 FROM import_abandonment_cleanup_intents i
    WHERE i.draft_id = OLD.draft_id OR i.draft_id = NEW.draft_id
  )
  BEGIN
    SELECT RAISE(ABORT, 'ABANDONMENT_CLEANUP_PENDING');
  END;
  CREATE TRIGGER abandonment_cleanup_block_attempt_insert
  BEFORE INSERT ON import_commit_attempts
  WHEN EXISTS (SELECT 1 FROM import_abandonment_cleanup_intents i WHERE i.draft_id = NEW.draft_id)
  BEGIN
    SELECT RAISE(ABORT, 'ABANDONMENT_CLEANUP_PENDING');
  END;
  CREATE TRIGGER abandonment_cleanup_block_attempt_update_v5
  BEFORE UPDATE ON import_commit_attempts
  WHEN EXISTS (
    SELECT 1 FROM import_abandonment_cleanup_intents i
    WHERE i.draft_id = OLD.draft_id OR i.draft_id = NEW.draft_id
  )
  BEGIN
    SELECT RAISE(ABORT, 'ABANDONMENT_CLEANUP_PENDING');
  END;
  CREATE TRIGGER source_import_record_excludes_manuscript_result
  BEFORE INSERT ON source_import_records
  WHEN EXISTS (SELECT 1 FROM manuscript_import_records WHERE commit_id = NEW.commit_id)
  BEGIN
    SELECT RAISE(ABORT, 'IMPORT_RESULT_KIND_CONFLICT');
  END;
  CREATE TRIGGER manuscript_import_record_excludes_source_result
  BEFORE INSERT ON manuscript_import_records
  WHEN EXISTS (SELECT 1 FROM source_import_records WHERE commit_id = NEW.commit_id)
  BEGIN
    SELECT RAISE(ABORT, 'IMPORT_RESULT_KIND_CONFLICT');
  END;
`;

type SqlRow = Record<string, SQLOutputValue>;
type StoredImportCommitProjection =
  | Omit<ManuscriptImportCommitProjection, 'firstWindow'>
  | SourceImportCommitProjection
  | ManuscriptReimportCommitProjection;

export class StoreError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'StoreError';
  }
}

export class StoreFatalError extends Error {
  constructor(cause: unknown) {
    super('AI7 authority transaction boundary failed.', { cause });
    this.name = 'StoreFatalError';
  }
}

function requireStore(condition: unknown, code: string, message: string): asserts condition {
  if (!condition) throw new StoreError(code, message);
}

function requireBoundedBookOverview(projection: BookWorkOverviewProjection): BookWorkOverviewProjection {
  requireStore(
    Buffer.byteLength(JSON.stringify(projection), 'utf8') <= MAX_FRAME_BYTES - REIMPORT_WIRE_HEADROOM_BYTES,
    'BOOK_HISTORY_PAGE_INVALID',
    '图书概览历史页超出有界服务帧。',
  );
  return projection;
}

function canonicalJson(value: unknown): string {
  if (typeof value === 'string') {
    requireStore(value.isWellFormed(), 'CANONICAL_VALUE_INVALID', '无法形成规范记录摘要。');
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(',')}}`;
  }
  const encoded = JSON.stringify(value);
  if (encoded === undefined) throw new StoreError('CANONICAL_VALUE_INVALID', '无法形成规范记录摘要。');
  return encoded;
}

function sha256(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

function stableUuid(value: string): string {
  const digest = sha256(value).slice(0, 32).split('');
  digest[12] = '5';
  digest[16] = '8';
  return `${digest.slice(0, 8).join('')}-${digest.slice(8, 12).join('')}-${digest.slice(12, 16).join('')}-${digest.slice(16, 20).join('')}-${digest.slice(20).join('')}`;
}

function commitRequestFingerprint(
  operationKind: 'manuscript-import' | 'source-import' | 'manuscript-reimport',
  input: { draftId: string; expectedDraftVersion: number; reviewDigest: string; commitId: string },
): string {
  return sha256(canonicalJson({ schema: 'ai7.import-commit-request/1', operationKind, input }));
}

function immutableCommitResult(result: StoredImportCommitProjection): Record<string, unknown> {
  if ('reimportRecordId' in result) {
    const { overview: _freshOverview, window: _freshWindow, receipt: _freshReceipt, ...immutable } = result;
    return immutable;
  }
  if ('sourceImportRecordId' in result) {
    const { overview: _freshOverview, receipt: _freshReceipt, ...immutable } = result;
    return immutable;
  }
  const { overview: _freshProjection, ...immutable } = result;
  return immutable;
}

const LEGACY_WORKFLOW_PROFILE_DIGEST = sha256(canonicalJson(LEGACY_WORKFLOW_PROFILE));
const BASELINE_EDITORIAL_DIMENSION_SET_DIGEST = sha256(canonicalJson(BASELINE_EDITORIAL_DIMENSION_SET));
const EDITORIAL_DIMENSIONS = BASELINE_EDITORIAL_DIMENSION_SET.dimensions;

function workflowProjectionJson(profile: BuiltInWorkflowProfile): string {
  return canonicalJson({
    schema: profile.projection.schema,
    id: profile.projection.id,
    name: profile.projection.name,
    version: profile.projection.version,
    phases: profile.projection.phases,
    gates: profile.projection.gates,
  });
}

function one<T extends SqlRow>(rows: T[], code: string, message: string): T {
  requireStore(rows.length === 1, code, message);
  return rows[0]!;
}

function asString(value: SQLOutputValue | undefined, code = 'STORE_CORRUPT'): string {
  requireStore(typeof value === 'string' && value.isWellFormed(), code, '持久化记录类型无效。');
  return value;
}

function asNumber(value: SQLOutputValue | undefined, code = 'STORE_CORRUPT'): number {
  requireStore(typeof value === 'number' && Number.isSafeInteger(value), code, '持久化数字无效。');
  return value;
}

function safeTitle(input: string): string {
  requireStore(input.isWellFormed(), 'TITLE_INVALID', '书名必须是有效文本。');
  const title = input.normalize('NFC').replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim();
  requireStore(title.length > 0 && title.length <= 180, 'TITLE_INVALID', '书名必须为 1–180 个字符。');
  return title;
}

function safeInternalNumber(input: string | null): string | null {
  if (input === null) return null;
  requireStore(input.isWellFormed(), 'INTERNAL_NUMBER_INVALID', '内部编号必须是有效文本。');
  const internalNumber = input.normalize('NFC').replace(/[\u0000-\u001f\u007f]/g, '').trim();
  requireStore(
    internalNumber.length > 0 && internalNumber.length <= 80,
    'INTERNAL_NUMBER_INVALID',
    '内部编号必须为 1–80 个字符，或留空。',
  );
  return internalNumber;
}

function exactBookChoiceLabel(title: string, bookId: string, internalNumber: string | null): string {
  return `${title} · ${internalNumber === null ? '' : `内部编号 ${internalNumber} · `}图书 ID ${bookId}`;
}

function safeDisplayName(input: string): string {
  requireStore(input.isWellFormed(), 'SOURCE_IDENTITY_INVALID', '来源标识无效。');
  const name = input.normalize('NFC').replace(/[\u0000-\u001f\u007f]/g, '').trim();
  requireStore(name.length > 0 && name.length <= 180 && !/[\\/]/.test(name), 'SOURCE_IDENTITY_INVALID', '来源标识无效。');
  requireStore(name.toLowerCase().endsWith('.docx'), 'SOURCE_IDENTITY_INVALID', '来源必须是 DOCX。');
  return name;
}

async function digestFile(path: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

function isInside(parent: string, child: string): boolean {
  const relation = relative(parent, child);
  return relation === '' || (!relation.startsWith(`..${sep}`) && relation !== '..' && !isAbsolute(relation));
}

function configureDatabase(db: DatabaseSync, tempStore: 'MEMORY' | 'FILE' = 'MEMORY'): void {
  db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = FULL;
    PRAGMA busy_timeout = 5000;
    PRAGMA trusted_schema = OFF;
    PRAGMA secure_delete = ON;
    PRAGMA temp_store = ${tempStore};
  `);
}

const ABANDONMENT_CLEANUP_SCHEMA = `
  CREATE TABLE import_abandonment_cleanup_intents (
    draft_id TEXT PRIMARY KEY REFERENCES import_drafts(draft_id),
    object_digest TEXT NOT NULL UNIQUE REFERENCES content_objects(object_digest),
    expected_draft_version INTEGER NOT NULL CHECK(expected_draft_version >= 1),
    relative_key TEXT NOT NULL,
    state TEXT NOT NULL CHECK(state IN ('prepared', 'bytes-removed')),
    requested_at TEXT NOT NULL,
    bytes_removed_at TEXT,
    CHECK(
      (state = 'prepared' AND bytes_removed_at IS NULL)
      OR (state = 'bytes-removed' AND bytes_removed_at IS NOT NULL)
    )
  ) STRICT;

  CREATE TRIGGER abandonment_cleanup_validate_insert
  BEFORE INSERT ON import_abandonment_cleanup_intents
  WHEN NOT EXISTS (
      SELECT 1
      FROM import_drafts d
      JOIN content_objects co ON co.object_digest = d.object_digest
      WHERE d.draft_id = NEW.draft_id
        AND d.state IN ('staged', 'reviewed')
        AND d.draft_version = NEW.expected_draft_version
        AND d.object_digest = NEW.object_digest
        AND co.relative_key = NEW.relative_key
    )
    OR EXISTS (SELECT 1 FROM source_versions sv WHERE sv.object_digest = NEW.object_digest)
    OR (SELECT count(*) FROM import_drafts d WHERE d.object_digest = NEW.object_digest) != 1
    OR EXISTS (SELECT 1 FROM import_commits c WHERE c.draft_id = NEW.draft_id)
    OR EXISTS (
      SELECT 1 FROM import_commit_attempts a
      WHERE a.draft_id = NEW.draft_id AND a.state != 'prepared'
    )
  BEGIN
    SELECT RAISE(ABORT, 'ABANDONMENT_CLEANUP_INVALID');
  END;

  CREATE TRIGGER abandonment_cleanup_block_content_object_update
  BEFORE UPDATE ON content_objects
  WHEN EXISTS (
    SELECT 1 FROM import_abandonment_cleanup_intents i
    WHERE i.object_digest = OLD.object_digest
  )
  BEGIN
    SELECT RAISE(ABORT, 'ABANDONMENT_CLEANUP_PENDING');
  END;

  CREATE TRIGGER abandonment_cleanup_block_draft_insert
  BEFORE INSERT ON import_drafts
  WHEN EXISTS (
    SELECT 1 FROM import_abandonment_cleanup_intents i
    WHERE i.object_digest = NEW.object_digest
  )
  BEGIN
    SELECT RAISE(ABORT, 'ABANDONMENT_CLEANUP_PENDING');
  END;

  CREATE TRIGGER abandonment_cleanup_block_draft_update
  BEFORE UPDATE ON import_drafts
  WHEN EXISTS (
      SELECT 1 FROM import_abandonment_cleanup_intents i
      WHERE i.draft_id = OLD.draft_id
    )
    OR EXISTS (
      SELECT 1 FROM import_abandonment_cleanup_intents i
      WHERE i.object_digest = NEW.object_digest
    )
  BEGIN
    SELECT RAISE(ABORT, 'ABANDONMENT_CLEANUP_PENDING');
  END;

  CREATE TRIGGER abandonment_cleanup_block_source_insert
  BEFORE INSERT ON source_versions
  WHEN EXISTS (
    SELECT 1 FROM import_abandonment_cleanup_intents i
    WHERE i.object_digest = NEW.object_digest
  )
  BEGIN
    SELECT RAISE(ABORT, 'ABANDONMENT_CLEANUP_PENDING');
  END;

  CREATE TRIGGER abandonment_cleanup_block_source_update
  BEFORE UPDATE OF object_digest ON source_versions
  WHEN EXISTS (
    SELECT 1 FROM import_abandonment_cleanup_intents i
    WHERE i.object_digest = NEW.object_digest
  )
  BEGIN
    SELECT RAISE(ABORT, 'ABANDONMENT_CLEANUP_PENDING');
  END;

  CREATE TRIGGER abandonment_cleanup_block_commit_insert
  BEFORE INSERT ON import_commits
  WHEN EXISTS (
    SELECT 1 FROM import_abandonment_cleanup_intents i
    WHERE i.draft_id = NEW.draft_id
  )
  BEGIN
    SELECT RAISE(ABORT, 'ABANDONMENT_CLEANUP_PENDING');
  END;

  CREATE TRIGGER abandonment_cleanup_block_attempt_insert
  BEFORE INSERT ON import_commit_attempts
  WHEN EXISTS (
    SELECT 1 FROM import_abandonment_cleanup_intents i
    WHERE i.draft_id = NEW.draft_id
  )
  BEGIN
    SELECT RAISE(ABORT, 'ABANDONMENT_CLEANUP_PENDING');
  END;
`;

const ABANDONMENT_CLEANUP_UPDATE_GUARDS_SCHEMA = `
  CREATE TRIGGER abandonment_cleanup_validate_intent_update_v5
  BEFORE UPDATE ON import_abandonment_cleanup_intents
  WHEN NEW.draft_id != OLD.draft_id
    OR NEW.object_digest != OLD.object_digest
    OR NEW.expected_draft_version != OLD.expected_draft_version
    OR NEW.relative_key != OLD.relative_key
    OR NEW.requested_at != OLD.requested_at
    OR NOT (
      (
        OLD.state = 'prepared' AND OLD.bytes_removed_at IS NULL
        AND NEW.state = 'bytes-removed' AND NEW.bytes_removed_at IS NOT NULL
      )
      OR (
        OLD.state = 'bytes-removed' AND NEW.state = 'bytes-removed'
        AND NEW.bytes_removed_at = OLD.bytes_removed_at
      )
    )
  BEGIN
    SELECT RAISE(ABORT, 'ABANDONMENT_CLEANUP_INTENT_IMMUTABLE');
  END;

  CREATE TRIGGER abandonment_cleanup_block_content_object_update_v5
  BEFORE UPDATE ON content_objects
  WHEN EXISTS (
    SELECT 1 FROM import_abandonment_cleanup_intents i
    WHERE i.object_digest = OLD.object_digest OR i.object_digest = NEW.object_digest
  )
  BEGIN
    SELECT RAISE(ABORT, 'ABANDONMENT_CLEANUP_PENDING');
  END;

  CREATE TRIGGER abandonment_cleanup_block_draft_update_v5
  BEFORE UPDATE ON import_drafts
  WHEN EXISTS (
    SELECT 1 FROM import_abandonment_cleanup_intents i
    WHERE i.draft_id = OLD.draft_id OR i.draft_id = NEW.draft_id
      OR i.object_digest = OLD.object_digest OR i.object_digest = NEW.object_digest
  )
  BEGIN
    SELECT RAISE(ABORT, 'ABANDONMENT_CLEANUP_PENDING');
  END;

  CREATE TRIGGER abandonment_cleanup_block_source_update_v5
  BEFORE UPDATE ON source_versions
  WHEN EXISTS (
    SELECT 1 FROM import_abandonment_cleanup_intents i
    WHERE i.object_digest = OLD.object_digest OR i.object_digest = NEW.object_digest
  )
  BEGIN
    SELECT RAISE(ABORT, 'ABANDONMENT_CLEANUP_PENDING');
  END;

  CREATE TRIGGER abandonment_cleanup_block_commit_update_v5
  BEFORE UPDATE ON import_commits
  WHEN EXISTS (
    SELECT 1 FROM import_abandonment_cleanup_intents i
    WHERE i.draft_id = OLD.draft_id OR i.draft_id = NEW.draft_id
  )
  BEGIN
    SELECT RAISE(ABORT, 'ABANDONMENT_CLEANUP_PENDING');
  END;

  CREATE TRIGGER abandonment_cleanup_block_attempt_update_v5
  BEFORE UPDATE ON import_commit_attempts
  WHEN EXISTS (
    SELECT 1 FROM import_abandonment_cleanup_intents i
    WHERE i.draft_id = OLD.draft_id OR i.draft_id = NEW.draft_id
  )
  BEGIN
    SELECT RAISE(ABORT, 'ABANDONMENT_CLEANUP_PENDING');
  END;
`;

function migrateSchemaV1ToV2(db: DatabaseSync): void {
  db.exec('PRAGMA foreign_keys = OFF');
  let migrationError: unknown;
  try {
    const foreignKeys = one(db.prepare('PRAGMA foreign_keys').all() as SqlRow[], 'SCHEMA_INVALID', '无法读取引用校验状态。');
    requireStore(asNumber(foreignKeys.foreign_keys) === 0, 'SCHEMA_INVALID', '无法暂时停用引用校验以迁移数据库。');
    db.exec(`
      BEGIN IMMEDIATE;

      CREATE TABLE import_fidelity_reviews_v2 (
        fidelity_review_id TEXT PRIMARY KEY,
        book_id TEXT NOT NULL REFERENCES books(book_id),
        source_version_id TEXT NOT NULL UNIQUE REFERENCES source_versions(source_version_id),
        review_digest TEXT NOT NULL UNIQUE,
        outcome TEXT NOT NULL CHECK(outcome IN ('clean-import-no-round-trip', 'degraded-import-no-round-trip')),
        round_trip_guaranteed INTEGER NOT NULL CHECK(round_trip_guaranteed = 0),
        created_at TEXT NOT NULL
      ) STRICT;

      INSERT INTO import_fidelity_reviews_v2(
        fidelity_review_id, book_id, source_version_id, review_digest, outcome, round_trip_guaranteed, created_at
      )
      SELECT fidelity_review_id, book_id, source_version_id, review_digest, outcome, round_trip_guaranteed, created_at
      FROM import_fidelity_reviews;

      CREATE TABLE manuscript_import_records_v2 (
        import_record_id TEXT PRIMARY KEY,
        commit_id TEXT NOT NULL UNIQUE,
        book_id TEXT NOT NULL UNIQUE REFERENCES books(book_id),
        manuscript_id TEXT NOT NULL UNIQUE REFERENCES manuscripts(manuscript_id),
        source_version_id TEXT NOT NULL UNIQUE REFERENCES source_versions(source_version_id),
        fidelity_review_id TEXT NOT NULL UNIQUE REFERENCES import_fidelity_reviews_v2(fidelity_review_id),
        degradation_decision_id TEXT REFERENCES import_degradation_decisions(degradation_decision_id),
        resulting_revision_id TEXT NOT NULL UNIQUE REFERENCES manuscript_revisions(revision_id),
        provenance_id TEXT NOT NULL UNIQUE REFERENCES source_provenance(provenance_id),
        imported_at TEXT NOT NULL
      ) STRICT;

      INSERT INTO manuscript_import_records_v2(
        import_record_id, commit_id, book_id, manuscript_id, source_version_id, fidelity_review_id,
        degradation_decision_id, resulting_revision_id, provenance_id, imported_at
      )
      SELECT import_record_id, commit_id, book_id, manuscript_id, source_version_id, fidelity_review_id,
             degradation_decision_id, resulting_revision_id, provenance_id, imported_at
      FROM manuscript_import_records;

      DROP TABLE manuscript_import_records;
      DROP TABLE import_fidelity_reviews;
      ALTER TABLE import_fidelity_reviews_v2 RENAME TO import_fidelity_reviews;
      ALTER TABLE manuscript_import_records_v2 RENAME TO manuscript_import_records;
      PRAGMA user_version = 2;
    `);
    const violations = db.prepare('PRAGMA foreign_key_check').all();
    requireStore(violations.length === 0, 'SCHEMA_MIGRATION_FAILED', '数据库迁移后的引用校验失败。');
    db.exec('COMMIT');
  } catch (error) {
    migrationError = error;
    try {
      db.exec('ROLLBACK');
    } catch (rollbackError) {
      migrationError = new AggregateError([error, rollbackError], 'SQLite schema migration rollback failed.');
    }
  } finally {
    try {
      db.exec('PRAGMA foreign_keys = ON');
      const foreignKeys = one(db.prepare('PRAGMA foreign_keys').all() as SqlRow[], 'SCHEMA_INVALID', '无法读取引用校验状态。');
      requireStore(asNumber(foreignKeys.foreign_keys) === 1, 'SCHEMA_INVALID', '无法恢复引用校验。');
    } catch (restoreError) {
      migrationError = migrationError
        ? new AggregateError([migrationError, restoreError], 'SQLite schema migration and foreign-key restoration failed.')
        : restoreError;
    }
  }
  if (migrationError) throw migrationError;
}

function migrateSchemaV2ToV3(db: DatabaseSync): void {
  try {
    db.exec(`
      BEGIN IMMEDIATE;

      ALTER TABLE import_drafts ADD COLUMN selected_path TEXT;
      ALTER TABLE import_drafts ADD COLUMN reviewed_target_choice_id TEXT
        CHECK(reviewed_target_choice_id IS NULL OR reviewed_target_choice_id IN ('new-book', 'new-book-distinct-intended-work'));

      CREATE TABLE import_commit_attempts (
        attempt_id TEXT PRIMARY KEY,
        draft_id TEXT NOT NULL UNIQUE REFERENCES import_drafts(draft_id) ON DELETE CASCADE,
        request_fingerprint TEXT NOT NULL,
        expected_draft_version INTEGER NOT NULL CHECK(expected_draft_version >= 1),
        review_digest TEXT NOT NULL CHECK(length(review_digest) = 64),
        state TEXT NOT NULL CHECK(state IN ('prepared', 'uncertain', 'committed')),
        prepared_at TEXT NOT NULL,
        committed_at TEXT,
        uncertain_at TEXT,
        uncertainty_code TEXT,
        completion_acknowledged_at TEXT,
        CHECK(
          (state = 'prepared' AND committed_at IS NULL AND uncertain_at IS NULL
            AND uncertainty_code IS NULL AND completion_acknowledged_at IS NULL)
          OR (state = 'uncertain' AND committed_at IS NULL AND uncertain_at IS NOT NULL
            AND uncertainty_code = 'COMMIT_PROOF_INCONCLUSIVE' AND completion_acknowledged_at IS NULL)
          OR (state = 'committed' AND committed_at IS NOT NULL AND uncertain_at IS NULL
            AND uncertainty_code IS NULL)
        )
      ) STRICT;

      INSERT INTO import_commit_attempts(
        attempt_id, draft_id, request_fingerprint, expected_draft_version, review_digest,
        state, prepared_at, committed_at
      )
      SELECT commit_id, draft_id, request_fingerprint, expected_draft_version, review_digest,
             'committed', committed_at, committed_at
      FROM import_commits;

      CREATE INDEX import_attempts_recovery_order
        ON import_commit_attempts(state, completion_acknowledged_at, prepared_at);

      PRAGMA user_version = 3;
      COMMIT;
    `);
  } catch (error) {
    try {
      db.exec('ROLLBACK');
    } catch (rollbackError) {
      throw new AggregateError([error, rollbackError], 'SQLite schema v3 migration rollback failed.');
    }
    throw error;
  }
}

function migrateSchemaV3ToV4(db: DatabaseSync): void {
  try {
    db.exec(`
      BEGIN IMMEDIATE;
      ${ABANDONMENT_CLEANUP_SCHEMA}
      PRAGMA user_version = 4;
      COMMIT;
    `);
  } catch (error) {
    try {
      db.exec('ROLLBACK');
    } catch (rollbackError) {
      throw new AggregateError([error, rollbackError], 'SQLite schema v4 migration rollback failed.');
    }
    throw error;
  }
}

function migrateSchemaV4ToV5(db: DatabaseSync): void {
  try {
    db.exec(`
      BEGIN IMMEDIATE;
      ${ABANDONMENT_CLEANUP_UPDATE_GUARDS_SCHEMA}
      PRAGMA user_version = 5;
      COMMIT;
    `);
  } catch (error) {
    try {
      db.exec('ROLLBACK');
    } catch (rollbackError) {
      throw new AggregateError([error, rollbackError], 'SQLite schema v5 migration rollback failed.');
    }
    throw error;
  }
}

function initializeSchema(db: DatabaseSync): void {
  const versionRow = one(db.prepare('PRAGMA user_version').all() as SqlRow[], 'SCHEMA_INVALID', '无法读取数据库版本。');
  const currentVersion = asNumber(versionRow.user_version);
  requireStore(
    currentVersion === 0 ||
      currentVersion === 1 ||
      currentVersion === 2 ||
      currentVersion === 3 ||
      currentVersion === 4 ||
      currentVersion === CORE_SCHEMA_VERSION ||
      currentVersion === EDITOR_SCHEMA_VERSION ||
      currentVersion === RECOVERY_SCHEMA_VERSION ||
      currentVersion === SCHEMA_VERSION ||
      currentVersion === SOURCE_IMPORT_SCHEMA_VERSION ||
      currentVersion === MANUSCRIPT_REIMPORT_SCHEMA_VERSION ||
      currentVersion === MODEL_SERVICE_SCHEMA_VERSION ||
      currentVersion === EDITORIAL_WORKSPACE_PROFILE_SCHEMA_VERSION,
    'SCHEMA_UNSUPPORTED',
    '数据库版本不受支持。',
  );
  if (
    currentVersion === CORE_SCHEMA_VERSION ||
    currentVersion === EDITOR_SCHEMA_VERSION ||
    currentVersion === RECOVERY_SCHEMA_VERSION ||
    currentVersion === SCHEMA_VERSION ||
    currentVersion === SOURCE_IMPORT_SCHEMA_VERSION ||
    currentVersion === MANUSCRIPT_REIMPORT_SCHEMA_VERSION ||
    currentVersion === MODEL_SERVICE_SCHEMA_VERSION ||
    currentVersion === EDITORIAL_WORKSPACE_PROFILE_SCHEMA_VERSION
  ) return;
  if (currentVersion === 1) {
    migrateSchemaV1ToV2(db);
    migrateSchemaV2ToV3(db);
    migrateSchemaV3ToV4(db);
    migrateSchemaV4ToV5(db);
    return;
  }
  if (currentVersion === 2) {
    migrateSchemaV2ToV3(db);
    migrateSchemaV3ToV4(db);
    migrateSchemaV4ToV5(db);
    return;
  }
  if (currentVersion === 3) {
    migrateSchemaV3ToV4(db);
    migrateSchemaV4ToV5(db);
    return;
  }
  if (currentVersion === 4) {
    migrateSchemaV4ToV5(db);
    return;
  }

  db.exec(`
    BEGIN IMMEDIATE;

    CREATE TABLE content_objects (
      object_digest TEXT PRIMARY KEY CHECK(length(object_digest) = 64),
      relative_key TEXT NOT NULL UNIQUE,
      byte_length INTEGER NOT NULL CHECK(byte_length > 0),
      verified_at TEXT NOT NULL
    ) STRICT;

    CREATE TABLE import_drafts (
      draft_id TEXT PRIMARY KEY,
      selection_token TEXT NOT NULL UNIQUE,
      state TEXT NOT NULL CHECK(state IN ('staged', 'reviewed', 'committed')),
      draft_version INTEGER NOT NULL CHECK(draft_version >= 1),
      display_name TEXT NOT NULL,
      object_digest TEXT NOT NULL REFERENCES content_objects(object_digest),
      selected_path TEXT,
      reviewed_title TEXT,
      reviewed_target_choice_id TEXT
        CHECK(reviewed_target_choice_id IS NULL OR reviewed_target_choice_id IN ('new-book', 'new-book-distinct-intended-work')),
      review_digest TEXT UNIQUE,
      committed_commit_id TEXT UNIQUE,
      staged_at TEXT NOT NULL,
      reviewed_at TEXT,
      committed_at TEXT
    ) STRICT;

    CREATE TABLE staged_import_snapshots (
      draft_id TEXT PRIMARY KEY REFERENCES import_drafts(draft_id) ON DELETE CASCADE,
      parser_identity TEXT NOT NULL,
      source_digest TEXT NOT NULL CHECK(length(source_digest) = 64),
      content_digest TEXT NOT NULL CHECK(length(content_digest) = 64),
      structure_digest TEXT NOT NULL CHECK(length(structure_digest) = 64),
      block_count INTEGER NOT NULL CHECK(block_count > 0),
      fidelity_json TEXT NOT NULL,
      title_suggestion TEXT NOT NULL,
      title_source TEXT NOT NULL,
      snapshot_created_at TEXT NOT NULL
    ) STRICT;

    CREATE TABLE staged_import_blocks (
      draft_id TEXT NOT NULL REFERENCES staged_import_snapshots(draft_id) ON DELETE CASCADE,
      staged_block_id TEXT NOT NULL,
      position INTEGER NOT NULL CHECK(position > 0),
      kind TEXT NOT NULL CHECK(kind IN ('title', 'heading', 'paragraph')),
      level INTEGER,
      text TEXT NOT NULL,
      digest TEXT NOT NULL CHECK(length(digest) = 64),
      PRIMARY KEY(draft_id, position),
      UNIQUE(draft_id, staged_block_id)
    ) STRICT;

    CREATE TABLE books (
      book_id TEXT PRIMARY KEY,
      stable_identity TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      created_at TEXT NOT NULL
    ) STRICT;

    CREATE TABLE book_dimension_sets (
      dimension_set_id TEXT PRIMARY KEY,
      book_id TEXT NOT NULL UNIQUE REFERENCES books(book_id),
      version INTEGER NOT NULL CHECK(version = 1),
      profile_id TEXT NOT NULL,
      profile_version TEXT NOT NULL,
      definition_digest TEXT NOT NULL CHECK(length(definition_digest) = 64),
      weight_semantics TEXT NOT NULL CHECK(weight_semantics = '中性起始权重；非穷尽评分量表'),
      created_at TEXT NOT NULL
    ) STRICT;

    CREATE TABLE book_dimensions (
      dimension_set_id TEXT NOT NULL REFERENCES book_dimension_sets(dimension_set_id),
      dimension_id TEXT NOT NULL,
      display_label TEXT NOT NULL,
      weight REAL NOT NULL CHECK(weight > 0),
      position INTEGER NOT NULL CHECK(position BETWEEN 1 AND 8),
      PRIMARY KEY(dimension_set_id, dimension_id),
      UNIQUE(dimension_set_id, position)
    ) STRICT;

    CREATE TABLE source_versions (
      source_version_id TEXT PRIMARY KEY,
      book_id TEXT NOT NULL REFERENCES books(book_id),
      object_digest TEXT NOT NULL REFERENCES content_objects(object_digest),
      source_digest TEXT NOT NULL CHECK(length(source_digest) = 64),
      content_digest TEXT NOT NULL CHECK(length(content_digest) = 64),
      structure_digest TEXT NOT NULL CHECK(length(structure_digest) = 64),
      parser_identity TEXT NOT NULL,
      format TEXT NOT NULL CHECK(format = 'DOCX'),
      display_name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(book_id, source_digest)
    ) STRICT;

    CREATE TABLE source_provenance (
      provenance_id TEXT PRIMARY KEY,
      source_version_id TEXT NOT NULL UNIQUE REFERENCES source_versions(source_version_id),
      acquisition_path TEXT NOT NULL CHECK(acquisition_path = 'native-file-picker'),
      locality TEXT NOT NULL CHECK(locality = 'local-provider-free'),
      sanitized_identity TEXT NOT NULL,
      parser_identity TEXT NOT NULL,
      recorded_at TEXT NOT NULL
    ) STRICT;

    CREATE TABLE import_fidelity_reviews (
      fidelity_review_id TEXT PRIMARY KEY,
      book_id TEXT NOT NULL REFERENCES books(book_id),
      source_version_id TEXT NOT NULL UNIQUE REFERENCES source_versions(source_version_id),
      review_digest TEXT NOT NULL UNIQUE,
      outcome TEXT NOT NULL CHECK(outcome IN ('clean-import-no-round-trip', 'degraded-import-no-round-trip')),
      round_trip_guaranteed INTEGER NOT NULL CHECK(round_trip_guaranteed = 0),
      created_at TEXT NOT NULL
    ) STRICT;

    CREATE TABLE import_fidelity_categories (
      fidelity_review_id TEXT NOT NULL REFERENCES import_fidelity_reviews(fidelity_review_id),
      category_key TEXT NOT NULL,
      display_label TEXT NOT NULL,
      item_count INTEGER NOT NULL CHECK(item_count >= 0),
      status TEXT NOT NULL CHECK(status IN ('preserved', 'degraded', 'unsupported')),
      detail TEXT NOT NULL,
      position INTEGER NOT NULL CHECK(position BETWEEN 1 AND 8),
      PRIMARY KEY(fidelity_review_id, category_key),
      UNIQUE(fidelity_review_id, position)
    ) STRICT;

    CREATE TABLE import_degradation_decisions (
      degradation_decision_id TEXT PRIMARY KEY,
      fidelity_review_id TEXT NOT NULL UNIQUE REFERENCES import_fidelity_reviews(fidelity_review_id),
      decision TEXT NOT NULL,
      created_at TEXT NOT NULL
    ) STRICT;

    CREATE TABLE manuscripts (
      manuscript_id TEXT PRIMARY KEY,
      book_id TEXT NOT NULL UNIQUE REFERENCES books(book_id),
      role TEXT NOT NULL CHECK(role = 'primary'),
      created_at TEXT NOT NULL
    ) STRICT;

    CREATE TABLE manuscript_branches (
      branch_id TEXT PRIMARY KEY,
      manuscript_id TEXT NOT NULL REFERENCES manuscripts(manuscript_id),
      name TEXT NOT NULL,
      base_revision_id TEXT REFERENCES manuscript_revisions(revision_id),
      created_at TEXT NOT NULL,
      UNIQUE(manuscript_id, name)
    ) STRICT;

    CREATE TABLE manuscript_revisions (
      revision_id TEXT PRIMARY KEY,
      manuscript_id TEXT NOT NULL REFERENCES manuscripts(manuscript_id),
      branch_id TEXT NOT NULL REFERENCES manuscript_branches(branch_id),
      ordinal INTEGER NOT NULL CHECK(ordinal = 1),
      revision_label TEXT NOT NULL CHECK(revision_label = 'r1'),
      parent_revision_id TEXT REFERENCES manuscript_revisions(revision_id),
      source_version_id TEXT NOT NULL REFERENCES source_versions(source_version_id),
      revision_digest TEXT NOT NULL CHECK(length(revision_digest) = 64),
      created_at TEXT NOT NULL,
      UNIQUE(manuscript_id, ordinal),
      UNIQUE(manuscript_id, revision_label)
    ) STRICT;

    CREATE TABLE manuscript_blocks (
      block_id TEXT PRIMARY KEY,
      manuscript_id TEXT NOT NULL REFERENCES manuscripts(manuscript_id),
      created_revision_id TEXT NOT NULL REFERENCES manuscript_revisions(revision_id)
    ) STRICT;

    CREATE TABLE manuscript_block_versions (
      revision_id TEXT NOT NULL REFERENCES manuscript_revisions(revision_id),
      block_id TEXT NOT NULL REFERENCES manuscript_blocks(block_id),
      position INTEGER NOT NULL CHECK(position > 0),
      kind TEXT NOT NULL CHECK(kind IN ('title', 'heading', 'paragraph')),
      level INTEGER,
      text TEXT NOT NULL,
      digest TEXT NOT NULL CHECK(length(digest) = 64),
      PRIMARY KEY(revision_id, block_id),
      UNIQUE(revision_id, position)
    ) STRICT;

    CREATE TABLE workflow_profiles (
      profile_id TEXT NOT NULL,
      profile_version TEXT NOT NULL,
      profile_name TEXT NOT NULL,
      profile_digest TEXT NOT NULL CHECK(length(profile_digest) = 64),
      definition_json TEXT NOT NULL,
      PRIMARY KEY(profile_id, profile_version)
    ) STRICT;

    CREATE TABLE workflow_instances (
      workflow_instance_id TEXT PRIMARY KEY,
      book_id TEXT NOT NULL REFERENCES books(book_id),
      manuscript_id TEXT NOT NULL UNIQUE REFERENCES manuscripts(manuscript_id),
      profile_id TEXT NOT NULL,
      profile_version TEXT NOT NULL,
      current_phase TEXT NOT NULL,
      state TEXT NOT NULL CHECK(state = 'active'),
      created_at TEXT NOT NULL,
      FOREIGN KEY(profile_id, profile_version) REFERENCES workflow_profiles(profile_id, profile_version)
    ) STRICT;

    CREATE TABLE manuscript_import_records (
      import_record_id TEXT PRIMARY KEY,
      commit_id TEXT NOT NULL UNIQUE,
      book_id TEXT NOT NULL UNIQUE REFERENCES books(book_id),
      manuscript_id TEXT NOT NULL UNIQUE REFERENCES manuscripts(manuscript_id),
      source_version_id TEXT NOT NULL UNIQUE REFERENCES source_versions(source_version_id),
      fidelity_review_id TEXT NOT NULL UNIQUE REFERENCES import_fidelity_reviews(fidelity_review_id),
      degradation_decision_id TEXT REFERENCES import_degradation_decisions(degradation_decision_id),
      resulting_revision_id TEXT NOT NULL UNIQUE REFERENCES manuscript_revisions(revision_id),
      provenance_id TEXT NOT NULL UNIQUE REFERENCES source_provenance(provenance_id),
      imported_at TEXT NOT NULL
    ) STRICT;

    CREATE TABLE import_commits (
      commit_id TEXT PRIMARY KEY,
      draft_id TEXT NOT NULL UNIQUE REFERENCES import_drafts(draft_id),
      request_fingerprint TEXT NOT NULL,
      expected_draft_version INTEGER NOT NULL,
      review_digest TEXT NOT NULL,
      result_json TEXT NOT NULL,
      committed_at TEXT NOT NULL
    ) STRICT;

    CREATE TABLE import_commit_attempts (
      attempt_id TEXT PRIMARY KEY,
      draft_id TEXT NOT NULL UNIQUE REFERENCES import_drafts(draft_id) ON DELETE CASCADE,
      request_fingerprint TEXT NOT NULL,
      expected_draft_version INTEGER NOT NULL CHECK(expected_draft_version >= 1),
      review_digest TEXT NOT NULL CHECK(length(review_digest) = 64),
      state TEXT NOT NULL CHECK(state IN ('prepared', 'uncertain', 'committed')),
      prepared_at TEXT NOT NULL,
      committed_at TEXT,
      uncertain_at TEXT,
      uncertainty_code TEXT,
      completion_acknowledged_at TEXT,
      CHECK(
        (state = 'prepared' AND committed_at IS NULL AND uncertain_at IS NULL
          AND uncertainty_code IS NULL AND completion_acknowledged_at IS NULL)
        OR (state = 'uncertain' AND committed_at IS NULL AND uncertain_at IS NOT NULL
          AND uncertainty_code = 'COMMIT_PROOF_INCONCLUSIVE' AND completion_acknowledged_at IS NULL)
        OR (state = 'committed' AND committed_at IS NOT NULL AND uncertain_at IS NULL
          AND uncertainty_code IS NULL)
      )
    ) STRICT;

    CREATE TABLE branch_working_state (
      branch_id TEXT PRIMARY KEY REFERENCES manuscript_branches(branch_id),
      manuscript_id TEXT NOT NULL REFERENCES manuscripts(manuscript_id),
      base_revision_id TEXT NOT NULL REFERENCES manuscript_revisions(revision_id),
      journal_sequence INTEGER NOT NULL CHECK(journal_sequence >= 0),
      working_digest TEXT NOT NULL CHECK(length(working_digest) = 64)
    ) STRICT;

    CREATE TABLE working_blocks (
      branch_id TEXT NOT NULL REFERENCES manuscript_branches(branch_id),
      block_id TEXT NOT NULL REFERENCES manuscript_blocks(block_id),
      position INTEGER NOT NULL CHECK(position > 0),
      kind TEXT NOT NULL CHECK(kind IN ('title', 'heading', 'paragraph')),
      level INTEGER,
      text TEXT NOT NULL,
      digest TEXT NOT NULL CHECK(length(digest) = 64),
      PRIMARY KEY(branch_id, block_id),
      UNIQUE(branch_id, position)
    ) STRICT;

    CREATE TABLE edit_journal_entries (
      journal_entry_id TEXT PRIMARY KEY,
      client_edit_id TEXT NOT NULL UNIQUE,
      request_fingerprint TEXT NOT NULL,
      manuscript_id TEXT NOT NULL REFERENCES manuscripts(manuscript_id),
      branch_id TEXT NOT NULL REFERENCES manuscript_branches(branch_id),
      base_revision_id TEXT NOT NULL REFERENCES manuscript_revisions(revision_id),
      sequence INTEGER NOT NULL CHECK(sequence > 0),
      block_id TEXT NOT NULL REFERENCES manuscript_blocks(block_id),
      from_grapheme INTEGER NOT NULL CHECK(from_grapheme >= 0),
      to_grapheme INTEGER NOT NULL CHECK(to_grapheme >= from_grapheme),
      insert_text TEXT NOT NULL,
      resulting_block_digest TEXT NOT NULL CHECK(length(resulting_block_digest) = 64),
      resulting_working_digest TEXT NOT NULL CHECK(length(resulting_working_digest) = 64),
      durable_at TEXT NOT NULL,
      UNIQUE(branch_id, sequence)
    ) STRICT;

    ${ABANDONMENT_CLEANUP_SCHEMA}
    ${ABANDONMENT_CLEANUP_UPDATE_GUARDS_SCHEMA}

    CREATE INDEX working_blocks_window ON working_blocks(branch_id, position);
    CREATE INDEX journal_branch_order ON edit_journal_entries(branch_id, sequence);
    CREATE INDEX import_attempts_recovery_order
      ON import_commit_attempts(state, completion_acknowledged_at, prepared_at);

    PRAGMA user_version = 5;
    COMMIT;
  `);
}

function initializeSourceImportSchema(db: DatabaseSync, profile: BuiltInWorkflowProfile): void {
  const version = asNumber(
    one(db.prepare('PRAGMA user_version').all() as SqlRow[], 'SCHEMA_INVALID', '无法读取数据库版本。').user_version,
  );
  requireStore(
    version === SCHEMA_VERSION || version === SOURCE_IMPORT_SCHEMA_VERSION ||
      version === MANUSCRIPT_REIMPORT_SCHEMA_VERSION || version === MODEL_SERVICE_SCHEMA_VERSION ||
      version === EDITORIAL_WORKSPACE_PROFILE_SCHEMA_VERSION,
    'SCHEMA_UNSUPPORTED',
    '数据库版本不受支持。',
  );
  if (version === SOURCE_IMPORT_SCHEMA_VERSION || version === MANUSCRIPT_REIMPORT_SCHEMA_VERSION ||
      version === MODEL_SERVICE_SCHEMA_VERSION || version === EDITORIAL_WORKSPACE_PROFILE_SCHEMA_VERSION) return;
  const legacyAlterTable = asNumber(
    one(db.prepare('PRAGMA legacy_alter_table').all() as SqlRow[], 'SCHEMA_INVALID', '无法读取旧式改表状态。').legacy_alter_table,
  );
  db.exec('PRAGMA foreign_keys = OFF; PRAGMA legacy_alter_table = ON;');
  let migrationError: unknown;
  try {
    db.exec(`
      BEGIN IMMEDIATE;
      DROP TRIGGER abandonment_cleanup_block_draft_insert;
      DROP TRIGGER abandonment_cleanup_block_draft_update;
      DROP TRIGGER abandonment_cleanup_block_draft_update_v5;
      DROP TRIGGER abandonment_cleanup_block_commit_insert;
      DROP TRIGGER abandonment_cleanup_block_commit_update_v5;
      DROP TRIGGER abandonment_cleanup_block_attempt_insert;
      DROP TRIGGER abandonment_cleanup_block_attempt_update_v5;
      ALTER TABLE import_commit_attempts RENAME TO import_commit_attempts_v8;
      ALTER TABLE import_commits RENAME TO import_commits_v8;
      ALTER TABLE import_drafts RENAME TO import_drafts_v8;
      ALTER TABLE source_provenance RENAME TO source_provenance_v8;
      ${SOURCE_IMPORT_DRAFT_V9_SCHEMA_SQL};
      INSERT INTO import_drafts(
        draft_id, selection_token, state, draft_version, display_name, object_digest, selected_path,
        reviewed_title, reviewed_target_choice_id, review_digest, committed_commit_id, staged_at,
        reviewed_at, committed_at, reviewed_target_kind, reviewed_existing_book_id,
        reviewed_relationship, reviewed_book_state_digest, reviewed_reuse_source_version_id
      )
      SELECT draft_id, selection_token, state, draft_version, display_name, object_digest, selected_path,
             reviewed_title, reviewed_target_choice_id, review_digest, committed_commit_id, staged_at,
             reviewed_at, committed_at, reviewed_target_kind, reviewed_existing_book_id,
             reviewed_relationship, reviewed_book_state_digest, NULL
      FROM import_drafts_v8 ORDER BY draft_id;
      ${SOURCE_IMPORT_COMMIT_V9_SCHEMA_SQL};
      INSERT INTO import_commits(
        commit_id, draft_id, request_fingerprint, expected_draft_version, review_digest,
        operation_kind, result_json, committed_at
      )
      SELECT commit_id, draft_id, request_fingerprint, expected_draft_version, review_digest,
             'manuscript-import', result_json, committed_at
      FROM import_commits_v8 ORDER BY commit_id;
      ${SOURCE_IMPORT_ATTEMPT_V9_SCHEMA_SQL};
      INSERT INTO import_commit_attempts(
        attempt_id, draft_id, request_fingerprint, expected_draft_version, review_digest,
        operation_kind, state, prepared_at, committed_at, uncertain_at, uncertainty_code,
        completion_acknowledged_at
      )
      SELECT attempt_id, draft_id, request_fingerprint, expected_draft_version, review_digest,
             'manuscript-import', state, prepared_at, committed_at, uncertain_at, uncertainty_code,
             completion_acknowledged_at
      FROM import_commit_attempts_v8 ORDER BY attempt_id;
      ${SOURCE_PROVENANCE_V9_SCHEMA_SQL};
      INSERT INTO source_provenance(
        provenance_id, source_version_id, acquisition_path, locality,
        sanitized_identity, parser_identity, recorded_at
      )
      SELECT provenance_id, source_version_id, acquisition_path, locality,
             sanitized_identity, parser_identity, recorded_at
      FROM source_provenance_v8
      ORDER BY provenance_id;
      DROP TABLE import_commit_attempts_v8;
      DROP TABLE import_commits_v8;
      DROP TABLE import_drafts_v8;
      DROP TABLE source_provenance_v8;
      ${SOURCE_IMPORT_SCHEMA_SQL};
      CREATE INDEX import_attempts_recovery_order
        ON import_commit_attempts(state, completion_acknowledged_at, prepared_at);
      ${SOURCE_IMPORT_REBUILT_TRIGGER_SQL}
    `);
    validateSourceImportSchemaTruth(db, profile);
    db.exec(`PRAGMA user_version = ${SOURCE_IMPORT_SCHEMA_VERSION}; COMMIT;`);
  } catch (error) {
    migrationError = error;
    try {
      db.exec('ROLLBACK');
    } catch (rollbackError) {
      migrationError = new AggregateError([error, rollbackError], 'SQLite source import schema migration rollback failed.');
    }
  } finally {
    try {
      db.exec(`PRAGMA legacy_alter_table = ${legacyAlterTable}; PRAGMA foreign_keys = ON;`);
    } catch (restoreError) {
      migrationError = migrationError
        ? new AggregateError([migrationError, restoreError], 'SQLite source import migration and pragma restoration failed.')
        : restoreError;
    }
  }
  if (migrationError) throw migrationError;
  const violations = db.prepare('PRAGMA foreign_key_check').all();
  requireStore(violations.length === 0, 'SCHEMA_MIGRATION_FAILED', '数据库引用校验失败。');
}

function initializeManuscriptReimportSchema(db: DatabaseSync, profile: BuiltInWorkflowProfile): void {
  const version = asNumber(
    one(db.prepare('PRAGMA user_version').all() as SqlRow[], 'SCHEMA_INVALID', '无法读取数据库版本。').user_version,
  );
  requireStore(
    version === SOURCE_IMPORT_SCHEMA_VERSION || version === MANUSCRIPT_REIMPORT_SCHEMA_VERSION ||
      version === MODEL_SERVICE_SCHEMA_VERSION || version === EDITORIAL_WORKSPACE_PROFILE_SCHEMA_VERSION,
    'SCHEMA_UNSUPPORTED',
    '数据库版本不受支持。',
  );
  if (version === MANUSCRIPT_REIMPORT_SCHEMA_VERSION || version === MODEL_SERVICE_SCHEMA_VERSION ||
      version === EDITORIAL_WORKSPACE_PROFILE_SCHEMA_VERSION) return;
  validateSourceImportSchemaTruth(db, profile);
  const legacyAlterTable = asNumber(
    one(db.prepare('PRAGMA legacy_alter_table').all() as SqlRow[], 'SCHEMA_INVALID', '无法读取旧式改表状态。').legacy_alter_table,
  );
  db.exec('PRAGMA foreign_keys = OFF; PRAGMA legacy_alter_table = ON;');
  let migrationError: unknown;
  try {
    db.exec(`
      BEGIN IMMEDIATE;
      DROP TRIGGER abandonment_cleanup_block_draft_insert;
      DROP TRIGGER abandonment_cleanup_block_draft_update;
      DROP TRIGGER abandonment_cleanup_block_draft_update_v5;
      DROP TRIGGER abandonment_cleanup_block_commit_insert;
      DROP TRIGGER abandonment_cleanup_block_commit_update_v5;
      DROP TRIGGER abandonment_cleanup_block_attempt_insert;
      DROP TRIGGER abandonment_cleanup_block_attempt_update_v5;
      DROP TRIGGER source_import_record_excludes_manuscript_result;
      DROP TRIGGER manuscript_import_record_excludes_source_result;
      ALTER TABLE import_commit_attempts RENAME TO import_commit_attempts_v9;
      ALTER TABLE import_commits RENAME TO import_commits_v9;
      ALTER TABLE import_drafts RENAME TO import_drafts_v9;
      ${REIMPORT_DRAFT_V10_SCHEMA_SQL};
      INSERT INTO import_drafts(
        draft_id, selection_token, state, draft_version, display_name, object_digest, selected_path,
        reviewed_title, reviewed_target_choice_id, review_digest, committed_commit_id, staged_at,
        reviewed_at, committed_at, reviewed_target_kind, reviewed_existing_book_id,
        reviewed_relationship, reviewed_book_state_digest, reviewed_reuse_source_version_id,
        reviewed_lineage_status, reviewed_lineage_source_version_id, reviewed_checkpoint_revision_id,
        reviewed_manuscript_id, reviewed_branch_id
      )
      SELECT draft_id, selection_token, state, draft_version, display_name, object_digest, selected_path,
             reviewed_title, reviewed_target_choice_id, review_digest, committed_commit_id, staged_at,
             reviewed_at, committed_at, reviewed_target_kind, reviewed_existing_book_id,
             reviewed_relationship, reviewed_book_state_digest, reviewed_reuse_source_version_id,
             NULL, NULL, NULL, NULL, NULL
      FROM import_drafts_v9 ORDER BY draft_id;
      ${REIMPORT_COMMIT_V10_SCHEMA_SQL};
      INSERT INTO import_commits(
        commit_id, draft_id, request_fingerprint, expected_draft_version, review_digest,
        operation_kind, result_json, committed_at
      )
      SELECT commit_id, draft_id, request_fingerprint, expected_draft_version, review_digest,
             operation_kind, result_json, committed_at
      FROM import_commits_v9 ORDER BY commit_id;
      ${REIMPORT_ATTEMPT_V10_SCHEMA_SQL};
      INSERT INTO import_commit_attempts(
        attempt_id, draft_id, request_fingerprint, expected_draft_version, review_digest,
        operation_kind, state, prepared_at, committed_at, uncertain_at, uncertainty_code,
        completion_acknowledged_at
      )
      SELECT attempt_id, draft_id, request_fingerprint, expected_draft_version, review_digest,
             operation_kind, state, prepared_at, committed_at, uncertain_at, uncertainty_code,
             completion_acknowledged_at
      FROM import_commit_attempts_v9 ORDER BY attempt_id;
      DROP TABLE import_commit_attempts_v9;
      DROP TABLE import_commits_v9;
      DROP TABLE import_drafts_v9;
      CREATE TABLE import_fidelity_reviews_v10 (
        fidelity_review_id TEXT PRIMARY KEY,
        book_id TEXT NOT NULL REFERENCES books(book_id),
        source_version_id TEXT NOT NULL REFERENCES source_versions(source_version_id),
        review_digest TEXT NOT NULL UNIQUE,
        outcome TEXT NOT NULL CHECK(outcome IN ('clean-import-no-round-trip', 'degraded-import-no-round-trip')),
        round_trip_guaranteed INTEGER NOT NULL CHECK(round_trip_guaranteed = 0),
        created_at TEXT NOT NULL
      ) STRICT;
      CREATE TABLE import_fidelity_categories_v10 (
        fidelity_review_id TEXT NOT NULL REFERENCES import_fidelity_reviews(fidelity_review_id),
        category_key TEXT NOT NULL,
        display_label TEXT NOT NULL,
        item_count INTEGER NOT NULL CHECK(item_count >= 0),
        status TEXT NOT NULL CHECK(status IN ('preserved', 'degraded', 'unsupported')),
        detail TEXT NOT NULL,
        position INTEGER NOT NULL CHECK(position BETWEEN 1 AND 8),
        PRIMARY KEY(fidelity_review_id, category_key),
        UNIQUE(fidelity_review_id, position)
      ) STRICT;
      CREATE TABLE import_degradation_decisions_v10 (
        degradation_decision_id TEXT PRIMARY KEY,
        fidelity_review_id TEXT NOT NULL UNIQUE REFERENCES import_fidelity_reviews(fidelity_review_id),
        decision TEXT NOT NULL,
        created_at TEXT NOT NULL
      ) STRICT;
      CREATE TABLE manuscript_import_records_v10 (
        import_record_id TEXT PRIMARY KEY,
        commit_id TEXT NOT NULL UNIQUE,
        book_id TEXT NOT NULL UNIQUE REFERENCES books(book_id),
        manuscript_id TEXT NOT NULL UNIQUE REFERENCES manuscripts(manuscript_id),
        source_version_id TEXT NOT NULL UNIQUE REFERENCES source_versions(source_version_id),
        fidelity_review_id TEXT NOT NULL UNIQUE REFERENCES import_fidelity_reviews(fidelity_review_id),
        degradation_decision_id TEXT REFERENCES import_degradation_decisions(degradation_decision_id),
        resulting_revision_id TEXT NOT NULL UNIQUE REFERENCES manuscript_revisions(revision_id),
        provenance_id TEXT NOT NULL UNIQUE REFERENCES source_provenance(provenance_id),
        imported_at TEXT NOT NULL
      ) STRICT;
      INSERT INTO import_fidelity_reviews_v10 SELECT * FROM import_fidelity_reviews ORDER BY fidelity_review_id;
      INSERT INTO import_fidelity_categories_v10 SELECT * FROM import_fidelity_categories
        ORDER BY fidelity_review_id, position;
      INSERT INTO import_degradation_decisions_v10 SELECT * FROM import_degradation_decisions
        ORDER BY degradation_decision_id;
      INSERT INTO manuscript_import_records_v10 SELECT * FROM manuscript_import_records ORDER BY import_record_id;
      DROP TABLE manuscript_import_records;
      DROP TABLE import_degradation_decisions;
      DROP TABLE import_fidelity_categories;
      DROP TABLE import_fidelity_reviews;
      ALTER TABLE import_fidelity_reviews_v10 RENAME TO import_fidelity_reviews;
      ALTER TABLE import_fidelity_categories_v10 RENAME TO import_fidelity_categories;
      ALTER TABLE import_degradation_decisions_v10 RENAME TO import_degradation_decisions;
      ALTER TABLE manuscript_import_records_v10 RENAME TO manuscript_import_records;
      ${REIMPORT_FACT_SCHEMA_SQL}
      CREATE INDEX import_attempts_recovery_order
        ON import_commit_attempts(state, completion_acknowledged_at, prepared_at);
      CREATE INDEX reimport_mappings_page
        ON manuscript_reimport_mappings(comparison_id, position);
      CREATE INDEX staged_reimport_identity
        ON staged_import_blocks(draft_id, digest, kind, level);
      CREATE INDEX revision_reimport_identity
        ON manuscript_block_versions(revision_id, digest, kind, level);
      ${SOURCE_IMPORT_REBUILT_TRIGGER_SQL}
      CREATE TRIGGER reimport_record_excludes_other_results
      BEFORE INSERT ON manuscript_reimport_records
      WHEN EXISTS (SELECT 1 FROM manuscript_import_records WHERE commit_id = NEW.commit_id)
        OR EXISTS (SELECT 1 FROM source_import_records WHERE commit_id = NEW.commit_id)
      BEGIN
        SELECT RAISE(ABORT, 'IMPORT_RESULT_KIND_CONFLICT');
      END;
      CREATE TRIGGER manuscript_import_record_excludes_reimport_result
      BEFORE INSERT ON manuscript_import_records
      WHEN EXISTS (SELECT 1 FROM manuscript_reimport_records WHERE commit_id = NEW.commit_id)
      BEGIN
        SELECT RAISE(ABORT, 'IMPORT_RESULT_KIND_CONFLICT');
      END;
      CREATE TRIGGER source_import_record_excludes_reimport_result
      BEFORE INSERT ON source_import_records
      WHEN EXISTS (SELECT 1 FROM manuscript_reimport_records WHERE commit_id = NEW.commit_id)
      BEGIN
        SELECT RAISE(ABORT, 'IMPORT_RESULT_KIND_CONFLICT');
      END;
      PRAGMA user_version = ${MANUSCRIPT_REIMPORT_SCHEMA_VERSION};
    `);
    validateManuscriptReimportSchemaTruth(db, profile);
    db.exec('COMMIT;');
  } catch (error) {
    migrationError = error;
    try {
      db.exec('ROLLBACK');
    } catch (rollbackError) {
      migrationError = new AggregateError([error, rollbackError], 'SQLite manuscript reimport migration rollback failed.');
    }
  } finally {
    try {
      db.exec(`PRAGMA legacy_alter_table = ${legacyAlterTable}; PRAGMA foreign_keys = ON;`);
    } catch (restoreError) {
      migrationError = migrationError
        ? new AggregateError([migrationError, restoreError], 'SQLite manuscript reimport migration and pragma restoration failed.')
        : restoreError;
    }
  }
  if (migrationError) throw migrationError;
  const violations = db.prepare('PRAGMA foreign_key_check').all();
  requireStore(violations.length === 0, 'SCHEMA_MIGRATION_FAILED', '数据库引用校验失败。');
}

function validateModelServiceSchema(db: DatabaseSync, profile: BuiltInWorkflowProfile): void {
  const version = asNumber(
    one(db.prepare('PRAGMA user_version').all() as SqlRow[], 'SCHEMA_INVALID', '无法读取数据库版本。').user_version,
  );
  validateManuscriptReimportSchemaTruth(
    db,
    profile,
    true,
    version === EDITORIAL_WORKSPACE_PROFILE_SCHEMA_VERSION,
  );
  const invalid = db.prepare(
    `SELECT 1 FROM model_service_connections
     WHERE connection_id != 'main-editorial-deepseek-v4-pro'
        OR role_id != 'main-editorial'
        OR provider_id != 'deepseek-open-platform'
        OR model_id != 'deepseek-v4-pro'
        OR adapter_revision != 1 OR configuration_revision != 1
        OR approved_fallback_chain != '[]'
        OR credential_slot != 'deepseek-api-key'
     LIMIT 1`,
  ).get();
  requireStore(invalid === undefined, 'SCHEMA_INVALID', '模型服务连接记录超出当前固定绑定。');
}

function initializeModelServiceSchema(db: DatabaseSync, profile: BuiltInWorkflowProfile): void {
  const version = asNumber(
    one(db.prepare('PRAGMA user_version').all() as SqlRow[], 'SCHEMA_INVALID', '无法读取数据库版本。').user_version,
  );
  requireStore(
    version === MANUSCRIPT_REIMPORT_SCHEMA_VERSION || version === MODEL_SERVICE_SCHEMA_VERSION ||
      version === EDITORIAL_WORKSPACE_PROFILE_SCHEMA_VERSION,
    'SCHEMA_UNSUPPORTED',
    '数据库版本不受支持。',
  );
  if (version === MODEL_SERVICE_SCHEMA_VERSION || version === EDITORIAL_WORKSPACE_PROFILE_SCHEMA_VERSION) {
    validateModelServiceSchema(db, profile);
    if (version === EDITORIAL_WORKSPACE_PROFILE_SCHEMA_VERSION) validateEditorialWorkspaceProfileSchema(db);
    return;
  }
  try {
    db.exec(`
      BEGIN IMMEDIATE;
      ${MODEL_SERVICE_CONNECTION_SCHEMA_SQL};
      PRAGMA user_version = ${MODEL_SERVICE_SCHEMA_VERSION};
    `);
    validateModelServiceSchema(db, profile);
    db.exec('COMMIT;');
  } catch (error) {
    try {
      db.exec('ROLLBACK;');
    } catch (rollbackError) {
      throw new AggregateError([error, rollbackError], 'SQLite model-service schema migration rollback failed.');
    }
    throw error;
  }
}

interface DraftSnapshot {
  draftId: string;
  state: string;
  version: number;
  displayName: string;
  objectDigest: string;
  selectedPath: string | null;
  reviewedTitle: string | null;
  reviewedTargetChoiceId: NewBookImportTargetChoiceId | null;
  reviewedTargetKind: 'new-book' | 'existing-book' | null;
  reviewedExistingBookId: string | null;
  reviewedRelationship: 'new-book-first-manuscript' | 'first-manuscript' | 'source-only' | 'reimport' | null;
  reviewedBookStateDigest: string | null;
  reviewedReuseSourceVersionId: string | null;
  reviewedLineageStatus: 'verified' | 'unconfirmed' | null;
  reviewedLineageSourceVersionId: string | null;
  reviewedCheckpointRevisionId: string | null;
  reviewedManuscriptId: string | null;
  reviewedBranchId: string | null;
  reviewDigest: string | null;
  stagedAt: string;
  parserIdentity: string;
  sourceDigest: string;
  sourceBytes: number;
  contentDigest: string;
  structureDigest: string;
  blockCount: number;
  characterCount: number;
  fidelity: FidelityCategoryProjection[];
  titleSuggestion: string;
  titleSource: StagedImportProjection['titleSuggestion']['sourceLabel'];
}

interface IngestedDocx {
  ingestId: string;
  parsed: ParsedDocx;
}

interface CommitAttempt {
  attemptId: string;
  draftId: string;
  requestFingerprint: string;
  expectedDraftVersion: number;
  reviewDigest: string;
  operationKind: 'manuscript-import' | 'source-import' | 'manuscript-reimport';
  state: 'prepared' | 'uncertain' | 'committed';
  preparedAt: string;
  completionAcknowledgedAt: string | null;
}

interface AbandonmentCleanupIntent {
  draftId: string;
  objectDigest: string;
  expectedDraftVersion: number;
  relativeKey: string;
  state: 'prepared' | 'bytes-removed';
}

interface StoreControl {
  induceUnprovableReconciliation: boolean;
  persistLegacyReviewedDraft: boolean;
  induceReimportProofTamper: boolean;
  induceAbandonObjectRemovalFailure: boolean;
  interruptAfterAbandonObjectRemoval: boolean;
}

function continuationNotice(access: OriginalFileAccessProjection): string {
  if (access.state === 'available-exact') return '已重新校验完整暂存快照；原始所选文件仍可访问且身份一致。';
  return `${access.label}。已重新校验完整暂存快照，不会从原路径读取或替换暂存内容。`;
}

function recordsToCreate(
  plan: ImportFidelityPlan,
  targetKind: 'new-book' | 'existing-book' = 'new-book',
): ReadonlyArray<string> {
  const records = targetKind === 'existing-book' ? BASE_RECORDS_TO_CREATE.slice(2) : BASE_RECORDS_TO_CREATE;
  if (plan.degradations.length === 0) return records;
  const fidelityIndex = records.indexOf('导入保真审阅');
  return [...records.slice(0, fidelityIndex + 1), '导入降级决定', ...records.slice(fidelityIndex + 1)];
}

function nonEffects(plan: ImportFidelityPlan): ReadonlyArray<string> {
  return plan.degradations.length === 0 ? [...NON_EFFECTS, CLEAN_IMPORT_NON_EFFECT] : NON_EFFECTS;
}

function newBookTargetChoice(
  identityFindings: ReadonlyArray<ImportIdentityFindingProjection>,
): Extract<StagedImportProjection['targetChoices'][number], { kind: 'new-book' }> {
  return identityFindings.length > 0
    ? { kind: 'new-book', id: 'new-book-distinct-intended-work', label: '新建图书（作为不同作品）', selected: false }
    : { kind: 'new-book', id: 'new-book', label: '新建图书', selected: false };
}

function degradationReview(
  plan: ImportFidelityPlan,
  accepted: boolean,
): ImportDegradationDecisionReviewProjection {
  if (plan.degradations.length === 0) return { state: 'not-required-clean-import', items: [] };
  return {
    state: accepted ? 'accepted-complete-set' : 'required-unselected',
    items: plan.degradations,
  };
}

function canonicalDegradationDecision(plan: ImportFidelityPlan): string | null {
  if (plan.degradations.length === 0) return null;
  return canonicalJson({
    schema: DEGRADATION_DECISION_SCHEMA,
    scope: 'this-import-only',
    state: 'accepted-complete-set',
    items: plan.degradations,
  });
}

function parseStoredJson(value: string, message: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw new StoreError('STORE_CORRUPT', message);
  }
}

function createLegacyNewBookReviewDigestV2(
  snapshot: DraftSnapshot,
  confirmedTitle: string,
  draftVersion: number,
  plan: ImportFidelityPlan,
): string {
  return sha256(
    canonicalJson({
      schema: 'ai7.new-book-import-review/2',
      draftId: snapshot.draftId,
      draftVersion,
      target: 'new-book',
      confirmedTitle,
      source: {
        displayName: snapshot.displayName,
        provenance: 'native-file-picker/local-provider-free',
        objectDigest: snapshot.objectDigest,
        parserIdentity: snapshot.parserIdentity,
        sourceDigest: snapshot.sourceDigest,
        sourceBytes: snapshot.sourceBytes,
        contentDigest: snapshot.contentDigest,
        structureDigest: snapshot.structureDigest,
      },
      fidelity: snapshot.fidelity,
      degradationDecision:
        plan.degradations.length === 0
          ? null
          : {
              schema: DEGRADATION_DECISION_SCHEMA,
              scope: 'this-import-only',
              state: 'accepted-complete-set',
              items: plan.degradations,
            },
      recordsToCreate: recordsToCreate(plan),
      nonEffects: nonEffects(plan),
      workflowProfile: { ...LEGACY_WORKFLOW_PROFILE, digest: LEGACY_WORKFLOW_PROFILE_DIGEST },
      editorialDimensionSet: {
        ...BASELINE_EDITORIAL_DIMENSION_SET,
        digest: BASELINE_EDITORIAL_DIMENSION_SET_DIGEST,
      },
    }),
  );
}

function createNewBookReviewDigestV4(
  snapshot: DraftSnapshot,
  confirmedTitle: string,
  draftVersion: number,
  plan: ImportFidelityPlan,
  targetChoiceId: NewBookImportTargetChoiceId,
  identityFindings: ReadonlyArray<ImportIdentityFindingProjection>,
): string {
  return sha256(
    canonicalJson({
      schema: 'ai7.new-book-import-review/4',
      draftId: snapshot.draftId,
      draftVersion,
      target:
        targetChoiceId === 'new-book-distinct-intended-work'
          ? { choiceId: targetChoiceId, kind: 'new-book', relationship: 'distinct-intended-work' }
          : { choiceId: targetChoiceId, kind: 'new-book' },
      confirmedTitle,
      source: {
        displayName: snapshot.displayName,
        provenance: 'native-file-picker/local-provider-free',
        objectDigest: snapshot.objectDigest,
        parserIdentity: snapshot.parserIdentity,
        sourceDigest: snapshot.sourceDigest,
        sourceBytes: snapshot.sourceBytes,
        contentDigest: snapshot.contentDigest,
        structureDigest: snapshot.structureDigest,
      },
      identityFindings,
      fidelity: snapshot.fidelity,
      degradationDecision:
        plan.degradations.length === 0
          ? null
          : {
              schema: DEGRADATION_DECISION_SCHEMA,
              scope: 'this-import-only',
              state: 'accepted-complete-set',
              items: plan.degradations,
            },
      recordsToCreate: recordsToCreate(plan),
      nonEffects: nonEffects(plan),
      workflowProfile: { ...LEGACY_WORKFLOW_PROFILE, digest: LEGACY_WORKFLOW_PROFILE_DIGEST },
      editorialDimensionSet: {
        ...BASELINE_EDITORIAL_DIMENSION_SET,
        digest: BASELINE_EDITORIAL_DIMENSION_SET_DIGEST,
      },
    }),
  );
}

type ResolvedImportTarget =
  | {
      kind: 'new-book';
      choiceId: NewBookImportTargetChoiceId;
      confirmedTitle: string;
      label: '新建图书' | '新建图书（作为不同作品）';
    }
  | {
      kind: 'existing-book';
      choiceId: string;
      bookId: string;
      stableIdentity: string;
      title: string;
      internalNumber: string | null;
      dimensionSetId: string;
      label: string;
      relationship: 'first-manuscript';
      bookStateDigest: string;
    };

type ResolvedSourceImportTarget =
  | {
      kind: 'new-book';
      choiceId: NewBookImportTargetChoiceId;
      confirmedTitle: string;
      label: '新建图书' | '新建图书（作为不同作品）';
      bookId: string;
      stableIdentity: string;
      sourceVersionDisposition: 'created';
      reuseSourceVersionId: null;
    }
  | {
      kind: 'existing-book';
      choiceId: string;
      bookId: string;
      stableIdentity: string;
      title: string;
      internalNumber: string | null;
      dimensionSetId: string;
      label: string;
      bookStateDigest: string;
      sourceVersionDisposition: 'created' | 'reused-same-book';
      reuseSourceVersionId: string | null;
    };

type ResolvedReimportTarget = {
  kind: 'existing-book';
  choiceId: string;
  bookId: string;
  stableIdentity: string;
  title: string;
  internalNumber: string | null;
  label: string;
  manuscriptId: string;
  branchId: string;
  bookStateDigest: string;
  sourceVersionDisposition: 'created' | 'reused-same-book';
  reuseSourceVersionId: string | null;
  checkpoint: ReimportCheckpointBinding;
  lineage:
    | { status: 'verified'; sourceVersionId: string; revisionId: string; comparisonKind: 'three-way' }
    | { status: 'unconfirmed'; sourceVersionId: null; revisionId: null; comparisonKind: 'two-way' };
};

interface ReimportBlockFact {
  blockId: string;
  position: number;
  kind: ManuscriptBlockProjection['kind'];
  level: number | null;
  text: string;
  digest: string;
}

interface ReimportMappingFact {
  mappingId: string;
  position: number;
  changeKind: 'unchanged' | 'move' | 'edit' | 'insert' | 'delete';
  current: ReimportBlockFact | null;
  lineage: ReimportBlockFact | null;
  staged: ReimportBlockFact | null;
  identityConsequence: 'preserve-current-identity' | null;
}

interface ReimportMappingBatch {
  readonly mappings: ReadonlyArray<ReimportMappingFact>;
  readonly scanned: number;
}

interface ReimportPreparationWork {
  readonly workId: string;
  readonly draftId: string;
  readonly expectedDraftVersion: number;
  readonly targetSelection: ManuscriptReimportTargetSelection;
  readonly snapshot: DraftSnapshot;
  phase: 'checkpoint' | 'staged-occurrences' | 'current-occurrences' | 'lineage-occurrences' | 'mapping';
  checkpointWorkId: string | null;
  checkpointCompleted: number;
  target: ResolvedReimportTarget | null;
  comparisonId: string | null;
  comparisonHasher: ReturnType<typeof createReimportComparisonHasher> | null;
  batches: Generator<ReimportMappingBatch> | null;
  occurrenceCursor: number;
  checkpointBlockCount: number;
  totalUpperBound: number;
  completed: number;
  mappingCount: number;
  unresolvedMappings: number;
  changedMappings: number;
}

export interface ReimportPreparationProgress {
  done: boolean;
  completed: number;
  total: number;
  review: ReviewBeforeManuscriptReimportProjection | null;
}

interface ReimportResolutionWork {
  readonly workId: string;
  readonly draftId: string;
  readonly expectedDraftVersion: number;
  readonly mappingId: string;
  readonly resolution: 'preserve-current-identity' | 'create-new-identity' | 'retire-current-identity';
  readonly currentBlockId: string | null;
  readonly snapshot: DraftSnapshot;
  readonly target: ResolvedReimportTarget;
  readonly comparisonId: string;
  readonly degradationAccepted: boolean;
  readonly totalMappings: number;
  readonly resolutionHasher: ReturnType<typeof createReimportResolutionHasher>;
  completed: number;
}

export interface ReimportResolutionProgress {
  done: boolean;
  completed: number;
  total: number;
  review: ReviewBeforeManuscriptReimportProjection | null;
}

interface ReimportCommitWork {
  readonly mode: 'commit';
  readonly workId: string;
  readonly input: { draftId: string; expectedDraftVersion: number; reviewDigest: string; commitId: string };
  readonly requestFingerprint: string;
  readonly snapshot: DraftSnapshot;
  readonly target: ResolvedReimportTarget;
  readonly evidence: {
    comparisonDigest: string;
    resolutionDigest: string;
    totalMappings: number;
    unresolvedMappings: number;
    changed: boolean;
  };
  readonly resultingRevisionId: string | null;
  readonly objectPath: string;
  readonly abortController: AbortController;
  readonly total: number;
  readonly attemptExists: boolean;
  readonly interruptAfterAttempt: boolean;
  readonly interruptAfterCommit: boolean;
  readonly legacyResultWithoutPresentation: boolean;
  phase: 'parse' | 'mappings';
  parseBytes: number;
  parsedIngest: IngestedDocx | null;
  parseFailure: unknown;
  mappingPosition: number;
  stagedBlocks: number;
  stagedCharacters: number;
  readonly offsetSegments: ReimportOffsetSegment[];
}

interface ReimportReplayWork {
  readonly mode: 'committed-replay';
  readonly workId: string;
  readonly input: { draftId: string; expectedDraftVersion: number; reviewDigest: string; commitId: string };
  readonly attempt: CommitAttempt;
  readonly result: ManuscriptReimportCommitProjection;
  readonly objectPath: string;
  objectFd: number | null;
  readonly objectHasher: ReturnType<typeof createHash>;
  readonly expectedDigest: string;
  readonly total: number;
  completed: number;
}

export interface ReimportCommitProgress {
  done: boolean;
  completed: number;
  total: number;
  result: ManuscriptReimportCommitProjection | null;
}

interface ReimportOffsetSegment {
  size: number;
  total: number;
}

function appendReimportOffsetSegment(
  stack: ReimportOffsetSegment[],
  position: number,
  length: number,
): number {
  requireStore(Number.isSafeInteger(length) && length >= 0,
    'REIMPORT_COMPARISON_INVALID', '重新导入偏移索引长度无效。');
  let segment: ReimportOffsetSegment = { size: 1, total: length };
  while (stack.at(-1)?.size === segment.size) {
    const previous = stack.pop()!;
    const total = previous.total + segment.total;
    requireStore(Number.isSafeInteger(total), 'REIMPORT_COMPARISON_INVALID', '重新导入偏移索引总量无效。');
    segment = { size: segment.size * 2, total };
  }
  let remainder = position;
  let expectedSize = 1;
  while (remainder % 2 === 0) {
    remainder /= 2;
    expectedSize *= 2;
  }
  requireStore(segment.size === expectedSize, 'REIMPORT_COMPARISON_INVALID', '重新导入偏移索引范围无效。');
  stack.push(segment);
  return segment.total;
}

function manuscriptBlockDigest(kind: ManuscriptBlockProjection['kind'], level: number | null, text: string): string {
  return sha256(canonicalJson({ kind, level, text }));
}

function createReimportComparisonHasher(draftId: string, target: ResolvedReimportTarget) {
  const hash = createHash('sha256');
  hash.update(canonicalJson({
    schema: 'ai7.manuscript-reimport-comparison/2',
    draftId,
    manuscriptId: target.manuscriptId,
    branchId: target.branchId,
    checkpoint: target.checkpoint,
    lineage: target.lineage,
  }));
  return {
    update: (mapping: ReimportMappingFact) => hash.update(`\n${canonicalJson(mapping)}`),
    digest: () => hash.digest('hex'),
  };
}

function createReimportResolutionHasher() {
  const hash = createHash('sha256');
  hash.update(canonicalJson({ schema: 'ai7.manuscript-reimport-resolutions/2' }));
  return {
    update: (
      mappingId: string,
      resolution: 'preserve-current-identity' | 'create-new-identity' | 'retire-current-identity',
      resolvedCurrentBlockId: string | null,
    ) => hash.update(`\n${canonicalJson({ mappingId, resolution, resolvedCurrentBlockId })}`),
    digest: () => hash.digest('hex'),
  };
}

function emptyReimportResolutionDigest(): string {
  return createReimportResolutionHasher().digest();
}

function createReimportReviewDigest(
  snapshot: DraftSnapshot,
  target: ResolvedReimportTarget,
  comparisonDigest: string,
  resolutionDigest: string,
  degradationDecisionState: ImportDegradationDecisionReviewProjection['state'],
): string {
  return sha256(canonicalJson({
    schema: 'ai7.manuscript-reimport-review/1',
    draftId: snapshot.draftId,
    draftVersion: snapshot.version,
    target: {
      bookId: target.bookId,
      stableIdentity: target.stableIdentity,
      manuscriptId: target.manuscriptId,
      branchId: target.branchId,
      relationship: 'reimport',
      bookStateDigest: target.bookStateDigest,
    },
    checkpoint: target.checkpoint,
    lineage: target.lineage,
    sourceVersionDisposition: target.sourceVersionDisposition,
    reuseSourceVersionId: target.reuseSourceVersionId,
    source: {
      objectDigest: snapshot.objectDigest,
      sourceDigest: snapshot.sourceDigest,
      contentDigest: snapshot.contentDigest,
      structureDigest: snapshot.structureDigest,
      parserIdentity: snapshot.parserIdentity,
    },
    comparisonDigest,
    resolutionDigest,
    degradationDecision: degradationDecisionState,
    namedNonEffects: MANUSCRIPT_REIMPORT_NON_EFFECTS,
  }));
}

function sourceImportRecordsToCreate(
  target: ResolvedSourceImportTarget,
): ReadonlyArray<string> {
  const bookRecords = target.kind === 'new-book' ? ['图书与稳定标识', '图书编辑维度集（8 项）'] : [];
  const sourceRecords = target.sourceVersionDisposition === 'created'
    ? ['图书拥有的来源版本', '来源记录']
    : ['复用已明确选择的同图书来源版本与来源记录'];
  return [...bookRecords, ...sourceRecords, '来源导入记录'];
}

function sourceImportRetainedBoundary(snapshot: DraftSnapshot): ReviewBeforeSourceImportProjection['retainedBoundary'] {
  return {
    kind: 'complete-local-file',
    label: SOURCE_IMPORT_RETAINED_BOUNDARY_LABEL,
    format: 'DOCX',
    displayName: snapshot.displayName,
    sourceSha256: snapshot.sourceDigest,
    sourceBytes: snapshot.sourceBytes,
    contentDigest: snapshot.contentDigest,
    structureDigest: snapshot.structureDigest,
  };
}

function createSourceImportReviewDigest(
  snapshot: DraftSnapshot,
  target: ResolvedSourceImportTarget,
  identityFindings: ReadonlyArray<ImportIdentityFindingProjection>,
): string {
  return sha256(canonicalJson({
    schema: 'ai7.source-import-review/1',
    draftId: snapshot.draftId,
    draftVersion: snapshot.version,
    target: target.kind === 'new-book'
      ? {
          kind: target.kind,
          choiceId: target.choiceId,
          confirmedTitle: target.confirmedTitle,
          bookId: target.bookId,
          stableIdentity: target.stableIdentity,
          relationship: 'source-only',
        }
      : {
          kind: target.kind,
          bookId: target.bookId,
          stableIdentity: target.stableIdentity,
          title: target.title,
          internalNumber: target.internalNumber,
          relationship: 'source-only',
          bookStateDigest: target.bookStateDigest,
          sourceVersionDisposition: target.sourceVersionDisposition,
          reuseSourceVersionId: target.reuseSourceVersionId,
        },
    retainedBoundary: sourceImportRetainedBoundary(snapshot),
    provenance: {
      acquisitionPath: 'native-file-picker',
      locality: 'local-provider-free',
      acquiredAt: snapshot.stagedAt,
    },
    parserIdentity: snapshot.parserIdentity,
    objectDigest: snapshot.objectDigest,
    identityFindings,
    recordsToCreate: sourceImportRecordsToCreate(target),
    namedNonEffects: SOURCE_IMPORT_NON_EFFECTS,
    editorialDimensionSet: target.kind === 'new-book'
      ? { ...BASELINE_EDITORIAL_DIMENSION_SET, digest: BASELINE_EDITORIAL_DIMENSION_SET_DIGEST }
      : { preservedBookStateDigest: target.bookStateDigest },
  }));
}

function createImportReviewDigestV5(
  snapshot: DraftSnapshot,
  draftVersion: number,
  plan: ImportFidelityPlan,
  target: ResolvedImportTarget,
  identityFindings: ReadonlyArray<ImportIdentityFindingProjection>,
  profile: BuiltInWorkflowProfile,
): string {
  return sha256(canonicalJson({
    schema: 'ai7.manuscript-import-review/5',
    draftId: snapshot.draftId,
    draftVersion,
    target: target.kind === 'new-book'
      ? {
          kind: 'new-book',
          choiceId: target.choiceId,
          confirmedTitle: target.confirmedTitle,
        }
      : {
          kind: 'existing-book',
          bookId: target.bookId,
          stableIdentity: target.stableIdentity,
          title: target.title,
          internalNumber: target.internalNumber,
          relationship: target.relationship,
          bookStateDigest: target.bookStateDigest,
        },
    source: {
      displayName: snapshot.displayName,
      provenance: 'native-file-picker/local-provider-free',
      objectDigest: snapshot.objectDigest,
      parserIdentity: snapshot.parserIdentity,
      sourceDigest: snapshot.sourceDigest,
      sourceBytes: snapshot.sourceBytes,
      contentDigest: snapshot.contentDigest,
      structureDigest: snapshot.structureDigest,
    },
    identityFindings,
    fidelity: snapshot.fidelity,
    degradationDecision: plan.degradations.length === 0
      ? null
      : {
          schema: DEGRADATION_DECISION_SCHEMA,
          scope: 'this-import-only',
          state: 'accepted-complete-set',
          items: plan.degradations,
        },
    recordsToCreate: recordsToCreate(plan, target.kind),
    nonEffects: nonEffects(plan),
    workflowProfile: {
      projection: profile.projection,
      native: profile.native,
    },
    editorialDimensionSet: target.kind === 'new-book'
      ? { ...BASELINE_EDITORIAL_DIMENSION_SET, digest: BASELINE_EDITORIAL_DIMENSION_SET_DIGEST }
      : { preservedBookStateDigest: target.bookStateDigest },
  }));
}

function reconstructReviewedTargetChoice(
  snapshot: DraftSnapshot,
  confirmedTitle: string,
  plan: ImportFidelityPlan,
  identityFindings: ReadonlyArray<ImportIdentityFindingProjection>,
): NewBookImportTargetChoiceId | null {
  const targetChoice = newBookTargetChoice(identityFindings);
  if (
    createNewBookReviewDigestV4(
      snapshot,
      confirmedTitle,
      snapshot.version,
      plan,
      targetChoice.id,
      identityFindings,
    ) === snapshot.reviewDigest
  ) {
    return targetChoice.id;
  }
  return null;
}

export class EditorialStore {
  readonly #dataRoot: string;
  readonly #objectsRoot: string;
  readonly #authority: DatabaseSync;
  readonly #journal: DatabaseSync;
  readonly #ingest: DatabaseSync;
  readonly #boundedAuthority: BoundedManuscriptStore;
  readonly #bounded: BoundedManuscriptStore;
  readonly #recoveryObjects: RecoveryObjectStore;
  readonly #editorialWorkspaceProfile: EditorialWorkspaceProfileStore;
  readonly #workflowProfile: BuiltInWorkflowProfile;
  readonly #lifetimeId: string;
  readonly #control: StoreControl;
  #contentObjectLifecycleTail: Promise<void> = Promise.resolve();
  #recoveryObjectLifecycleTail: Promise<void> = Promise.resolve();
  #cleanShutdownMarked = false;
  #poisoned = false;
  readonly #reimportPreparationWork = new Map<string, ReimportPreparationWork>();
  readonly #reimportResolutionWork = new Map<string, ReimportResolutionWork>();
  readonly #reimportCommitWork = new Map<string, ReimportCommitWork | ReimportReplayWork>();
  readonly #verifiedCommitObjects = new Set<string>();

  private constructor(
    dataRoot: string,
    objectsRoot: string,
    authority: DatabaseSync,
    journal: DatabaseSync,
    ingest: DatabaseSync,
    boundedAuthority: BoundedManuscriptStore,
    bounded: BoundedManuscriptStore,
    recoveryObjects: RecoveryObjectStore,
    editorialWorkspaceProfile: EditorialWorkspaceProfileStore,
    workflowProfile: BuiltInWorkflowProfile,
    lifetimeId: string,
    control: StoreControl,
  ) {
    this.#dataRoot = dataRoot;
    this.#objectsRoot = objectsRoot;
    this.#authority = authority;
    this.#journal = journal;
    this.#ingest = ingest;
    this.#boundedAuthority = boundedAuthority;
    this.#bounded = bounded;
    this.#recoveryObjects = recoveryObjects;
    this.#editorialWorkspaceProfile = editorialWorkspaceProfile;
    this.#workflowProfile = workflowProfile;
    this.#lifetimeId = lifetimeId;
    this.#control = control;
  }

  static async open(
    dataRootInput: string,
    codeRoot: string,
    control: StoreControl = {
      induceUnprovableReconciliation: false,
      persistLegacyReviewedDraft: false,
      induceReimportProofTamper: false,
      induceAbandonObjectRemovalFailure: false,
      interruptAfterAbandonObjectRemoval: false,
    },
  ): Promise<EditorialStore> {
    requireStore(isAbsolute(dataRootInput), 'DATA_ROOT_INVALID', 'Agent Data Root 必须是绝对路径。');
    const workflowProfile = await loadBuiltInManuscriptProfile(codeRoot);
    const dataRoot = await createCanonicalExternalDataRoot(dataRootInput, codeRoot);
    const objectsRoot = await ensureCanonicalDataDirectory(dataRoot, 'objects');
    const recoveryObjects = await RecoveryObjectStore.open(dataRoot);
    const storeRoot = await ensureCanonicalDataDirectory(dataRoot, 'store');
    const { path: databasePath } = await inspectCanonicalDataFile(dataRoot, storeRoot, 'ai7.sqlite');
    for (const sidecar of ['ai7.sqlite-journal', 'ai7.sqlite-shm', 'ai7.sqlite-wal']) {
      await inspectCanonicalDataFile(dataRoot, storeRoot, sidecar);
    }
    const authority = new DatabaseSync(databasePath);
    configureDatabase(authority, 'FILE');
    initializeSchema(authority);
    initializeBoundedSchema(authority, workflowProfile);
    initializeSourceImportSchema(authority, workflowProfile);
    if (control.induceReimportProofTamper) {
      requireStore(authority.prepare(
        `UPDATE manuscript_reimport_mappings SET staged_text = staged_text || '篡改'
         WHERE mapping_id = (SELECT mapping_id FROM manuscript_reimport_mappings ORDER BY mapping_id LIMIT 1)`,
      ).run().changes === 1, 'E2E_CONTROL_INVALID', '没有可用于启动校验的重新导入证明。');
    }
    initializeManuscriptReimportSchema(authority, workflowProfile);
    initializeModelServiceSchema(authority, workflowProfile);
    initializeEditorialWorkspaceProfileSchema(authority);
    initializeBoundedSchema(authority, workflowProfile);
    validateEditorialWorkspaceProfileSchema(authority);
    const editorialWorkspaceProfile = await EditorialWorkspaceProfileStore.open(authority, dataRoot, codeRoot);
    const journal = new DatabaseSync(databasePath);
    configureDatabase(journal);
    const ingest = new DatabaseSync(databasePath);
    configureDatabase(ingest);
    const lifetimeId = randomUUID();
    const store = new EditorialStore(
      dataRoot,
      objectsRoot,
      authority,
      journal,
      ingest,
      new BoundedManuscriptStore(authority),
      new BoundedManuscriptStore(journal),
      recoveryObjects,
      editorialWorkspaceProfile,
      workflowProfile,
      lifetimeId,
      control,
    );
    store.#transaction(authority, () => {
      authority.prepare('DELETE FROM import_ingest_blocks').run();
    });
    await store.#resumeAbandonmentCleanupIntents();
    store.#normalizeMigratedReviewedTargets();
    await store.#sweepUnreferencedContentObjects();
    await recoveryObjects.cleanup((relativeKey) =>
      store.#boundedCall(() => store.#boundedAuthority.isRecoveryObjectReferenced(relativeKey)));
    store.#boundedCall(() => store.#boundedAuthority.startServiceLifetime(lifetimeId, new Date().toISOString()));
    return store;
  }

  markCleanShutdown(): void {
    this.#assertAvailable();
    requireStore(!this.#cleanShutdownMarked, 'LIFETIME_STATE_CHANGED', '本地服务生命周期无法重复结束。');
    this.#boundedCall(() => this.#boundedAuthority.markServiceLifetimeClean(this.#lifetimeId, new Date().toISOString()));
    this.#cleanShutdownMarked = true;
  }

  async inspectEditorialWorkspaceProfile(bookId: string): Promise<EditorialWorkspaceProfileProjection> {
    return this.#artifactCall(() => this.#editorialWorkspaceProfile.inspect(bookId));
  }

  async installEditorialWorkspaceProfile(bookId: string): Promise<EditorialWorkspaceProfileProjection> {
    return this.#artifactCall(() => this.#editorialWorkspaceProfile.install(bookId));
  }

  async enableEditorialWorkspaceProfile(bookId: string): Promise<EditorialWorkspaceProfileProjection> {
    return this.#artifactCall(() => this.#editorialWorkspaceProfile.enable(bookId));
  }

  close(): void {
    for (const workId of Array.from(this.#reimportPreparationWork.keys())) {
      this.cancelManuscriptReimportPreparationWork(workId);
    }
    for (const workId of Array.from(this.#reimportResolutionWork.keys())) {
      this.cancelReimportResolutionWork(workId);
    }
    for (const workId of Array.from(this.#reimportCommitWork.keys())) {
      this.cancelManuscriptReimportCommitWork(workId);
    }
    try {
      this.#ingest.close();
    } finally {
      try {
        this.#journal.close();
      } finally {
        this.#authority.close();
      }
    }
  }

  prepareBookCreation(titleInput: string, internalNumberInput: string | null): BookCreationReviewProjection {
    this.#assertAvailable();
    const title = safeTitle(titleInput);
    const internalNumber = safeInternalNumber(internalNumberInput);
    if (internalNumber !== null) {
      requireStore(
        this.#authority.prepare('SELECT 1 FROM books WHERE internal_number = ?').get(internalNumber) === undefined,
        'INTERNAL_NUMBER_CONFLICT',
        '内部编号已被另一图书使用。',
      );
    }
    const bookId = randomUUID();
    const proposed = { bookId, stableIdentity: `book:${bookId}`, title, internalNumber };
    const reviewDigest = sha256(canonicalJson({
      schema: 'ai7.empty-book-creation-review/1',
      proposed,
      editorialDimensionSet: {
        ...BASELINE_EDITORIAL_DIMENSION_SET,
        digest: BASELINE_EDITORIAL_DIMENSION_SET_DIGEST,
      },
      recordsToCreate: ['图书与稳定标识', '图书编辑维度集（8 项）'],
      nonEffects: EMPTY_BOOK_NON_EFFECTS,
    }));
    return {
      reviewDigest,
      proposed,
      recordsToCreate: ['图书与稳定标识', '图书编辑维度集（8 项）'],
      nonEffects: EMPTY_BOOK_NON_EFFECTS,
      editorialDimensionSet: {
        ...BASELINE_EDITORIAL_DIMENSION_SET,
        digest: BASELINE_EDITORIAL_DIMENSION_SET_DIGEST,
      },
    };
  }

  commitBookCreation(input: {
    bookId: string;
    stableIdentity: string;
    title: string;
    internalNumber: string | null;
    reviewDigest: string;
  }): BookCreationCommitProjection {
    this.#assertAvailable();
    requireStore(UUID_PATTERN.test(input.bookId), 'BOOK_CREATION_INVALID', '拟创建图书标识无效。');
    requireStore(input.stableIdentity === `book:${input.bookId}`, 'BOOK_CREATION_INVALID', '拟创建图书稳定标识无效。');
    requireStore(DIGEST_PATTERN.test(input.reviewDigest), 'BOOK_CREATION_INVALID', '图书创建复核摘要无效。');
    const title = safeTitle(input.title);
    const internalNumber = safeInternalNumber(input.internalNumber);
    const expected = this.prepareBookCreationReviewForExactIdentity(
      input.bookId,
      input.stableIdentity,
      title,
      internalNumber,
    );
    requireStore(expected.reviewDigest === input.reviewDigest, 'REVIEW_CHANGED', '图书创建复核已变化。');
    const now = new Date().toISOString();
    const dimensionSetId = randomUUID();
    let committedOverview: BookWorkOverviewProjection | undefined;
    this.#transaction(this.#authority, () => {
      const existing = this.#authority.prepare(
        `SELECT book_id, stable_identity, title, internal_number
         FROM books WHERE book_id = ? OR stable_identity = ? ORDER BY book_id`,
      ).all(input.bookId, input.stableIdentity) as SqlRow[];
      if (existing.length > 0) {
        const row = existing[0]!;
        const exactIdentity = existing.length === 1 && asString(row.book_id) === input.bookId &&
          asString(row.stable_identity) === input.stableIdentity && asString(row.title) === title &&
          (row.internal_number === null ? internalNumber === null : asString(row.internal_number) === internalNumber);
        requireStore(exactIdentity, 'BOOK_IDENTITY_CONFLICT', '拟创建图书身份或字段与已存在记录冲突。');
        const forbidden = one(
          this.#authority.prepare(
            `SELECT
               (SELECT count(*) FROM manuscripts WHERE book_id = ?) manuscripts,
               (SELECT count(*) FROM source_versions WHERE book_id = ?) sources,
               (SELECT count(*) FROM import_fidelity_reviews WHERE book_id = ?) fidelity_reviews,
               (SELECT count(*) FROM workflow_instances WHERE book_id = ?) workflows,
               (SELECT count(*) FROM manuscript_import_records WHERE book_id = ?) imports,
               (SELECT count(*) FROM source_import_records WHERE book_id = ?) source_imports,
               (SELECT count(*) FROM native_artifact_book_enablements WHERE book_id = ?) artifact_enablements,
               (SELECT count(*) FROM import_drafts WHERE reviewed_existing_book_id = ?) reviewed_drafts`,
          ).all(
            input.bookId, input.bookId, input.bookId, input.bookId,
            input.bookId, input.bookId, input.bookId, input.bookId,
          ) as SqlRow[],
          'BOOK_IDENTITY_CONFLICT',
          '无法核对已存在图书的空状态。',
        );
        requireStore(
          asNumber(forbidden.manuscripts) === 0 && asNumber(forbidden.sources) === 0 &&
            asNumber(forbidden.fidelity_reviews) === 0 && asNumber(forbidden.workflows) === 0 &&
            asNumber(forbidden.imports) === 0 && asNumber(forbidden.source_imports) === 0 &&
            asNumber(forbidden.artifact_enablements) === 0 &&
            asNumber(forbidden.reviewed_drafts) === 0,
          'BOOK_IDENTITY_CONFLICT',
          '已存在图书不再是创建响应丢失后的精确空图书。',
        );
        try {
          const overview = this.getBookOverview(input.bookId);
          requireStore(
            overview.manuscriptState.state === 'empty' && overview.records.length === 1 &&
              overview.records[0]?.kind === 'book',
            'BOOK_IDENTITY_CONFLICT',
            '已存在图书不再是创建响应丢失后的精确空图书。',
          );
          committedOverview = overview;
        } catch (error) {
          if (error instanceof StoreError && error.code === 'BOOK_IDENTITY_CONFLICT') throw error;
          throw new StoreError('BOOK_IDENTITY_CONFLICT', '已存在图书的编辑维度记录与已复核创建不一致。');
        }
        return;
      }
      if (internalNumber !== null) {
        requireStore(
          this.#authority.prepare('SELECT 1 FROM books WHERE internal_number = ?').get(internalNumber) === undefined,
          'INTERNAL_NUMBER_CONFLICT',
          '内部编号已被另一图书使用。',
        );
      }
      this.#authority.prepare(
        'INSERT INTO books(book_id, stable_identity, title, created_at, internal_number) VALUES (?, ?, ?, ?, ?)',
      ).run(input.bookId, input.stableIdentity, title, now, internalNumber);
      this.#insertBookDimensionSet(dimensionSetId, input.bookId, now);
      const forbidden = one(
        this.#authority.prepare(
          `SELECT
             (SELECT count(*) FROM manuscripts WHERE book_id = ?) manuscripts,
             (SELECT count(*) FROM source_versions WHERE book_id = ?) sources,
             (SELECT count(*) FROM workflow_instances WHERE book_id = ?) workflows,
             (SELECT count(*) FROM manuscript_import_records WHERE book_id = ?) imports,
             (SELECT count(*) FROM source_import_records WHERE book_id = ?) source_imports,
             (SELECT count(*) FROM native_artifact_book_enablements WHERE book_id = ?) artifact_enablements`,
        ).all(input.bookId, input.bookId, input.bookId, input.bookId, input.bookId, input.bookId) as SqlRow[],
        'BOOK_CREATION_FAILED',
        '无法核对空图书创建结果。',
      );
      requireStore(
        asNumber(forbidden.manuscripts) === 0 && asNumber(forbidden.sources) === 0 &&
          asNumber(forbidden.workflows) === 0 && asNumber(forbidden.imports) === 0 &&
          asNumber(forbidden.source_imports) === 0 && asNumber(forbidden.artifact_enablements) === 0,
        'BOOK_CREATION_FAILED',
        '空图书创建意外形成了稿件或导入记录。',
      );
      this.#assertForeignKeys(this.#authority);
    });
    return { completionLabel: '图书已创建', overview: committedOverview ?? this.getBookOverview(input.bookId) };
  }

  getBookOverview(bookId: string, historyCursor: BookHistoryCursor | null = null): BookWorkOverviewProjection {
    this.#assertAvailable();
    requireStore(UUID_PATTERN.test(bookId), 'BOOK_INVALID', '图书标识无效。');
    const book = one(
      this.#authority.prepare(
        `SELECT b.book_id, b.stable_identity, b.title, b.internal_number, b.created_at,
                ds.dimension_set_id, ds.definition_digest, ds.profile_id, ds.profile_version,
                ds.weight_semantics
         FROM books b
         JOIN book_dimension_sets ds ON ds.book_id = b.book_id
         WHERE b.book_id = ?`,
      ).all(bookId) as SqlRow[],
      'BOOK_NOT_FOUND',
      '图书不存在或维度集不完整。',
    );
    const dimensions = (this.#authority.prepare(
      `SELECT dimension_id, display_label, weight
       FROM book_dimensions WHERE dimension_set_id = ? ORDER BY position`,
    ).all(asString(book.dimension_set_id)) as SqlRow[]).map((row) => ({
      id: asString(row.dimension_id),
      label: asString(row.display_label),
      weight: asNumber(row.weight),
    }));
    requireStore(
      asString(book.profile_id) === BASELINE_EDITORIAL_DIMENSION_SET.profileId &&
        asString(book.profile_version) === BASELINE_EDITORIAL_DIMENSION_SET.profileVersion &&
        asString(book.definition_digest) === BASELINE_EDITORIAL_DIMENSION_SET_DIGEST &&
        asString(book.weight_semantics) === BASELINE_EDITORIAL_DIMENSION_SET.weightSemantics &&
        canonicalJson(dimensions) === canonicalJson(EDITORIAL_DIMENSIONS),
      'BOOK_DIMENSIONS_INVALID',
      '图书编辑维度集不完整或已漂移。',
    );
    const bookProjection = {
      bookId: asString(book.book_id),
      stableIdentity: asString(book.stable_identity),
      title: asString(book.title),
      internalNumber: book.internal_number === null ? null : asString(book.internal_number),
      createdAt: asString(book.created_at),
    };
    const bookRecord = {
      kind: 'book' as const,
      label: '图书' as const,
      ...bookProjection,
      dimensionSetId: asString(book.dimension_set_id),
      dimensionSetDigest: asString(book.definition_digest),
    };
    const history = this.#bookHistorySelection(bookId, historyCursor);
    const sourceImportRecords = this.#sourceImportRecordPresentations(bookId, history.sourceImportRecordIds);
    const reimportRecords = this.#reimportRecordPresentations(bookId, history.reimportRecordIds);
    const manuscripts = this.#authority.prepare(
      `SELECT m.manuscript_id, m.created_at, mb.branch_id, mr.revision_id, mr.revision_label,
              mr.revision_digest, mr.source_version_id, mr.created_at revision_created_at,
              sv.display_name, sv.source_digest, sv.content_digest, sv.structure_digest, sv.parser_identity,
              co.byte_length source_bytes,
              sp.provenance_id, sp.acquisition_path, sp.locality,
              wi.workflow_instance_id, wi.current_phase, wi.state, wi.profile_id, wi.profile_version,
              wi.profile_digest, wi.native_profile_id, wi.native_profile_version, wi.native_profile_digest,
              wp.projection_json,
              ir.import_record_id, ir.commit_id, ir.fidelity_review_id, ir.degradation_decision_id,
              ir.provenance_id import_provenance_id, ir.imported_at, fr.outcome fidelity_outcome
       FROM manuscripts m
       JOIN manuscript_branches mb ON mb.manuscript_id = m.manuscript_id
       JOIN manuscript_revisions mr
         ON mr.manuscript_id = m.manuscript_id AND mr.branch_id = mb.branch_id AND mr.ordinal = 1
       JOIN source_versions sv ON sv.source_version_id = mr.source_version_id
       JOIN content_objects co ON co.object_digest = sv.object_digest
       JOIN workflow_instances wi ON wi.manuscript_id = m.manuscript_id AND wi.book_id = m.book_id
       JOIN workflow_profiles wp ON wp.profile_id = wi.profile_id AND wp.profile_version = wi.profile_version
       JOIN manuscript_import_records ir
         ON ir.manuscript_id = m.manuscript_id AND ir.book_id = m.book_id
        AND ir.source_version_id = sv.source_version_id AND ir.resulting_revision_id = mr.revision_id
       JOIN source_provenance sp
         ON sp.provenance_id = ir.provenance_id AND sp.source_version_id = sv.source_version_id
       JOIN import_fidelity_reviews fr
         ON fr.fidelity_review_id = ir.fidelity_review_id
        AND fr.book_id = m.book_id AND fr.source_version_id = sv.source_version_id
       WHERE m.book_id = ? AND m.role = 'primary'
       ORDER BY m.created_at, m.manuscript_id`,
    ).all(bookId) as SqlRow[];
    const manuscriptAuthority = one(
      this.#authority.prepare('SELECT count(*) manuscript_count FROM manuscripts WHERE book_id = ?').all(bookId) as SqlRow[],
      'BOOK_MANUSCRIPT_STATE_INVALID',
      '无法核对图书主稿件关系。',
    );
    requireStore(
      asNumber(manuscriptAuthority.manuscript_count) === manuscripts.length && manuscripts.length <= 1,
      'BOOK_MANUSCRIPT_STATE_INVALID',
      '图书主稿件关系或记录图不完整。',
    );
    if (manuscripts.length === 0) {
      return requireBoundedBookOverview({
        book: bookProjection,
        manuscriptState: { state: 'empty', label: '尚无稿件' },
        primaryAction: { kind: 'import-first-manuscript', label: '导入首份稿件', bookId },
        records: [bookRecord, ...sourceImportRecords],
        historyPage: history.page,
      });
    }
    const row = manuscripts[0]!;
    requireStore(
      asString(row.revision_label) === 'r1' && asString(row.state) === 'active' &&
        asString(row.acquisition_path) === 'native-file-picker' && asString(row.locality) === 'local-provider-free' &&
        asString(row.provenance_id) === asString(row.import_provenance_id) &&
        asString(row.profile_id) === this.#workflowProfile.projection.id &&
        asString(row.profile_version) === this.#workflowProfile.projection.version &&
        asString(row.profile_digest) === this.#workflowProfile.projection.digest &&
        asString(row.projection_json) === workflowProjectionJson(this.#workflowProfile) &&
        asString(row.native_profile_id) === this.#workflowProfile.native.id &&
        asString(row.native_profile_version) === this.#workflowProfile.native.version &&
        asString(row.native_profile_digest) === this.#workflowProfile.native.digest,
      'BOOK_RECORD_GRAPH_INVALID',
      '图书稿件记录图不完整。',
    );
    const manuscriptId = asString(row.manuscript_id);
    const branchId = asString(row.branch_id);
    const revisionId = asString(row.revision_id);
    const sourceVersionId = asString(row.source_version_id);
    const fidelityReviewId = asString(row.fidelity_review_id);
    const fidelityCategories = this.#loadPersistedFidelity(fidelityReviewId);
    const fidelityPlan = deriveImportFidelityPlan(
      fidelityCategories,
      asString(row.source_digest),
      asNumber(row.source_bytes),
    );
    const fidelityOutcome = asString(row.fidelity_outcome);
    requireStore(
      fidelityPlan !== undefined && fidelityOutcome === fidelityPlan.outcome &&
        ((fidelityPlan.degradations.length === 0 && row.degradation_decision_id === null) ||
          (fidelityPlan.degradations.length > 0 && row.degradation_decision_id !== null)),
      'BOOK_RECORD_GRAPH_INVALID',
      '稿件导入记录的保真结果不完整。',
    );
    const revisionRecords = history.revisionIds.length === 0 ? [] : (this.#authority.prepare(
      `SELECT revision_id, revision_label, revision_digest, source_version_id, created_at
       FROM manuscript_revisions WHERE manuscript_id = ? AND branch_id = ?
         AND revision_id IN (${history.revisionIds.map(() => '?').join(', ')}) ORDER BY ordinal`,
    ).all(manuscriptId, branchId, ...history.revisionIds) as SqlRow[]).map((revision) => ({
      kind: 'revision' as const,
      label: `修订版 ${asString(revision.revision_label)}`,
      revisionId: asString(revision.revision_id),
      manuscriptId,
      branchId,
      revisionLabel: asString(revision.revision_label),
      revisionDigest: asString(revision.revision_digest),
      sourceVersionId: asString(revision.source_version_id),
      createdAt: asString(revision.created_at),
    }));
    const presentedSourceIds = new Set([sourceVersionId]);
    const additionalRecords = [...sourceImportRecords, ...reimportRecords].filter((record) => {
      if (record.kind !== 'source') return true;
      if (presentedSourceIds.has(record.sourceVersionId)) return false;
      presentedSourceIds.add(record.sourceVersionId);
      return true;
    });
    return requireBoundedBookOverview({
      book: bookProjection,
      manuscriptState: { state: 'populated', label: '已有主稿件', manuscriptId },
      primaryAction: { kind: 'open-manuscript', label: '打开稿件', manuscriptId, branchId },
      records: [
        bookRecord,
        { kind: 'manuscript', label: '主稿件', manuscriptId, bookId, role: 'primary', createdAt: asString(row.created_at) },
        ...revisionRecords,
        {
          kind: 'source', label: '来源版本与来源记录', sourceVersionId,
          provenanceId: asString(row.provenance_id), bookId, displayName: asString(row.display_name),
          sourceDigest: asString(row.source_digest), contentDigest: asString(row.content_digest),
          structureDigest: asString(row.structure_digest), parserIdentity: asString(row.parser_identity),
          acquisitionPath: 'native-file-picker', locality: 'local-provider-free',
        },
        {
          kind: 'workflow', label: '工作流实例与精确 Profile 绑定',
          workflowInstanceId: asString(row.workflow_instance_id), bookId, manuscriptId,
          currentPhase: asString(row.current_phase), state: 'active',
          projection: {
            id: asString(row.profile_id), version: asString(row.profile_version), digest: asString(row.profile_digest),
          },
          nativeProfile: {
            id: asString(row.native_profile_id), version: asString(row.native_profile_version),
            digest: asString(row.native_profile_digest),
          },
        },
        {
          kind: 'import-record', label: '稿件导入记录', importRecordId: asString(row.import_record_id),
          commitId: asString(row.commit_id), bookId, manuscriptId, sourceVersionId,
          fidelityReviewId,
          fidelityOutcome: fidelityOutcome as 'clean-import-no-round-trip' | 'degraded-import-no-round-trip',
          fidelityCategories,
          degradationDecisionId: row.degradation_decision_id === null ? null : asString(row.degradation_decision_id),
          degradationDecision: row.degradation_decision_id === null
            ? null
            : { summaryLabel: '含已接受的降级', acceptedItems: fidelityPlan.degradations },
          resultingRevisionId: revisionId, provenanceId: asString(row.provenance_id), importedAt: asString(row.imported_at),
        },
        ...additionalRecords,
      ],
      historyPage: history.page,
    });
  }

  #bookHistorySelection(bookId: string, cursor: BookHistoryCursor | null): {
    revisionIds: string[];
    sourceImportRecordIds: string[];
    reimportRecordIds: string[];
    page: BookWorkOverviewProjection['historyPage'];
  } {
    if (cursor !== null) {
      requireStore(
        cursor.occurredAt.isWellFormed() && cursor.occurredAt.length <= 64 &&
          Number.isSafeInteger(cursor.kindRank) && cursor.kindRank >= 1 && cursor.kindRank <= 3 &&
          UUID_PATTERN.test(cursor.stableId) && (cursor.direction === 'forward' || cursor.direction === 'backward'),
        'BOOK_HISTORY_CURSOR_INVALID',
        '图书历史分页位置无效。',
      );
    }
    const direction = cursor?.direction ?? 'backward';
    const comparator = direction === 'forward' ? '>' : '<';
    const order = direction === 'forward' ? 'ASC' : 'DESC';
    const boundary = cursor === null ? '' : `AND (
      occurred_at ${comparator} ? OR
      (occurred_at = ? AND kind_rank ${comparator} ?) OR
      (occurred_at = ? AND kind_rank = ? AND stable_id ${comparator} ?)
    )`;
    const sql = `SELECT occurred_at, kind_rank, stable_id, event_kind FROM (
      SELECT mr.created_at occurred_at, 1 kind_rank, mr.revision_id stable_id, 'revision' event_kind, m.book_id
      FROM manuscript_revisions mr JOIN manuscripts m ON m.manuscript_id = mr.manuscript_id
      UNION ALL
      SELECT sir.imported_at, 2, sir.source_import_record_id, 'source-import', sir.book_id
      FROM source_import_records sir
      UNION ALL
      SELECT rr.imported_at, 3, rr.reimport_record_id, 'reimport', rr.book_id
      FROM manuscript_reimport_records rr
    ) WHERE book_id = ? ${boundary}
    ORDER BY occurred_at ${order}, kind_rank ${order}, stable_id ${order}
    LIMIT ${BOOK_HISTORY_PAGE_SIZE + 1}`;
    const parameters: Array<string | number> = [bookId];
    if (cursor !== null) {
      parameters.push(
        cursor.occurredAt, cursor.occurredAt, cursor.kindRank,
        cursor.occurredAt, cursor.kindRank, cursor.stableId,
      );
    }
    const fetched = this.#authority.prepare(sql).all(...parameters) as SqlRow[];
    const hasMore = fetched.length > BOOK_HISTORY_PAGE_SIZE;
    const selected = fetched.slice(0, BOOK_HISTORY_PAGE_SIZE);
    if (direction === 'backward') selected.reverse();
    const first = selected[0];
    const last = selected.at(-1);
    const asCursor = (row: SqlRow, nextDirection: 'forward' | 'backward'): BookHistoryCursor => ({
      occurredAt: asString(row.occurred_at),
      kindRank: asNumber(row.kind_rank),
      stableId: asString(row.stable_id),
      direction: nextDirection,
    });
    const previousCursor = first === undefined || (cursor === null && direction === 'forward')
      ? null
      : direction === 'backward'
        ? hasMore ? asCursor(first, 'backward') : null
        : asCursor(first, 'backward');
    const nextCursor = last === undefined || (cursor === null && direction === 'backward')
      ? null
      : direction === 'forward'
        ? hasMore ? asCursor(last, 'forward') : null
        : asCursor(last, 'forward');
    return {
      revisionIds: selected.filter((row) => row.event_kind === 'revision').map((row) => asString(row.stable_id)),
      sourceImportRecordIds: selected.filter((row) => row.event_kind === 'source-import').map((row) => asString(row.stable_id)),
      reimportRecordIds: selected.filter((row) => row.event_kind === 'reimport').map((row) => asString(row.stable_id)),
      page: { previousCursor, nextCursor },
    };
  }

  #reimportRecordPresentations(
    bookId: string,
    recordIds: ReadonlyArray<string>,
  ): BookRecordPresentation[] {
    if (recordIds.length === 0) return [];
    const rows = this.#authority.prepare(
      `SELECT rr.*, sv.display_name, sv.source_digest, sv.content_digest, sv.structure_digest,
              sv.parser_identity, co.byte_length source_bytes, sp.acquisition_path, sp.locality,
              fr.outcome fidelity_outcome, fr.review_digest fidelity_review_digest,
              dd.decision degradation_decision
       FROM manuscript_reimport_records rr
       JOIN source_versions sv ON sv.source_version_id = rr.source_version_id AND sv.book_id = rr.book_id
       JOIN content_objects co ON co.object_digest = sv.object_digest
       JOIN source_provenance sp ON sp.provenance_id = rr.provenance_id AND sp.source_version_id = rr.source_version_id
       JOIN import_fidelity_reviews fr
         ON fr.fidelity_review_id = rr.fidelity_review_id AND fr.source_version_id = rr.source_version_id
       LEFT JOIN import_degradation_decisions dd
         ON dd.degradation_decision_id = rr.degradation_decision_id
        AND dd.fidelity_review_id = rr.fidelity_review_id
       WHERE rr.book_id = ? AND rr.reimport_record_id IN (${recordIds.map(() => '?').join(', ')})
       ORDER BY rr.imported_at, rr.reimport_record_id`,
    ).all(bookId, ...recordIds) as SqlRow[];
    const records: BookRecordPresentation[] = [];
    const presentedSources = new Set<string>();
    for (const row of rows) {
      const sourceVersionId = asString(row.source_version_id);
      const provenanceId = asString(row.provenance_id);
      const resultKind = asString(row.result_kind) as 'changed' | 'no-change';
      const resultLabel = asString(row.result_label) as '稿件已重新导入' | '未发现稿件变化';
      const lineageStatus = asString(row.lineage_status) as 'verified' | 'unconfirmed';
      const lineageSourceVersionId = row.lineage_source_version_id === null
        ? null
        : asString(row.lineage_source_version_id);
      const comparisonKind = asString(row.comparison_kind) as 'three-way' | 'two-way';
      const fidelityReviewId = asString(row.fidelity_review_id);
      const fidelityCategories = this.#loadPersistedFidelity(fidelityReviewId);
      const fidelityPlan = deriveImportFidelityPlan(
        fidelityCategories,
        asString(row.source_digest),
        asNumber(row.source_bytes),
      );
      requireStore(fidelityPlan !== undefined && fidelityPlan.outcome === asString(row.fidelity_outcome) &&
        ((fidelityPlan.degradations.length === 0 && row.degradation_decision_id === null && row.degradation_decision === null) ||
          (fidelityPlan.degradations.length > 0 && row.degradation_decision_id !== null &&
            row.degradation_decision === canonicalDegradationDecision(fidelityPlan))),
      'BOOK_RECORD_GRAPH_INVALID', '稿件重新导入保真与降级证据不完整。');
      const recordDigest = sha256(canonicalJson({
        schema: MANUSCRIPT_REIMPORT_RECORD_SCHEMA,
        reimportRecordId: asString(row.reimport_record_id),
        commitId: asString(row.commit_id),
        bookId: asString(row.book_id),
        manuscriptId: asString(row.manuscript_id),
        branchId: asString(row.branch_id),
        sourceVersionId,
        provenanceId,
        previousRevisionId: asString(row.previous_revision_id),
        resultingRevisionId: row.resulting_revision_id === null ? null : asString(row.resulting_revision_id),
        resultKind,
        resultLabel,
        lineageStatus,
        lineageSourceVersionId,
        comparisonKind,
        comparisonDigest: asString(row.comparison_digest),
        resolutionDigest: asString(row.resolution_digest),
        fidelityReviewId,
        degradationDecisionId: row.degradation_decision_id === null ? null : asString(row.degradation_decision_id),
        importedAt: asString(row.imported_at),
      }));
      requireStore(
        (resultKind === 'changed' || resultKind === 'no-change') &&
          (lineageStatus === 'verified' || lineageStatus === 'unconfirmed') &&
          (comparisonKind === 'three-way' || comparisonKind === 'two-way') &&
          asString(row.acquisition_path) === 'native-file-picker' && asString(row.locality) === 'local-provider-free' &&
          recordDigest === asString(row.record_digest),
        'BOOK_RECORD_GRAPH_INVALID',
        '稿件重新导入记录图或摘要无效。',
      );
      if (!presentedSources.has(sourceVersionId)) {
        records.push({
          kind: 'source',
          label: '来源版本与来源记录',
          sourceVersionId,
          provenanceId,
          bookId,
          displayName: asString(row.display_name),
          sourceDigest: asString(row.source_digest),
          contentDigest: asString(row.content_digest),
          structureDigest: asString(row.structure_digest),
          parserIdentity: asString(row.parser_identity),
          acquisitionPath: 'native-file-picker',
          locality: 'local-provider-free',
        });
        presentedSources.add(sourceVersionId);
      }
      records.push({
        kind: 'manuscript-reimport-record',
        label: '稿件重新导入记录',
        reimportRecordId: asString(row.reimport_record_id),
        commitId: asString(row.commit_id),
        bookId,
        manuscriptId: asString(row.manuscript_id),
        sourceVersionId,
        provenanceId,
        previousRevisionId: asString(row.previous_revision_id),
        resultingRevisionId: row.resulting_revision_id === null ? null : asString(row.resulting_revision_id),
        resultKind,
        resultLabel,
        lineageStatus,
        lineageLabel: lineageStatus === 'verified' ? '来源关系已确认' : '来源关系未确认',
        lineageSourceVersionId,
        comparisonKind,
        comparisonDigest: asString(row.comparison_digest),
        resolutionDigest: asString(row.resolution_digest),
        fidelityReviewId,
        fidelityOutcome: fidelityPlan.outcome,
        fidelityCategories,
        degradationDecisionId: row.degradation_decision_id === null ? null : asString(row.degradation_decision_id),
        degradationDecision: row.degradation_decision_id === null
          ? null
          : { summaryLabel: '含已接受的降级', acceptedItems: fidelityPlan.degradations },
        recordDigest,
        importedAt: asString(row.imported_at),
      });
    }
    return records;
  }

  #sourceImportRecordPresentations(
    bookId: string,
    recordIds: ReadonlyArray<string>,
  ): BookRecordPresentation[] {
    if (recordIds.length === 0) return [];
    const rows = this.#authority.prepare(
      `SELECT sir.source_import_record_id, sir.commit_id, sir.book_id, sir.source_version_id,
              sir.provenance_id, sir.target_kind, sir.source_version_disposition, sir.retained_boundary_json,
              sir.named_non_effects_json, sir.record_digest, sir.imported_at,
              sv.display_name, sv.source_digest, sv.content_digest, sv.structure_digest,
              sv.parser_identity, co.byte_length, sp.acquisition_path, sp.locality,
              sp.sanitized_identity
       FROM source_import_records sir
       JOIN source_versions sv
         ON sv.source_version_id = sir.source_version_id AND sv.book_id = sir.book_id
       JOIN content_objects co ON co.object_digest = sv.object_digest
       JOIN source_provenance sp
         ON sp.provenance_id = sir.provenance_id AND sp.source_version_id = sir.source_version_id
       WHERE sir.book_id = ? AND sir.source_import_record_id IN (${recordIds.map(() => '?').join(', ')})
       ORDER BY sir.imported_at, sir.source_import_record_id`,
    ).all(bookId, ...recordIds) as SqlRow[];
    const records: BookRecordPresentation[] = [];
    const presentedSources = new Set<string>();
    for (const row of rows) {
      const sourceVersionId = asString(row.source_version_id);
      const provenanceId = asString(row.provenance_id);
      const disposition = asString(row.source_version_disposition);
      const targetKind = asString(row.target_kind);
      requireStore(
        (targetKind === 'new-book' || targetKind === 'existing-book') &&
          (disposition === 'created' || disposition === 'reused-same-book') &&
          asString(row.acquisition_path) === 'native-file-picker' && asString(row.locality) === 'local-provider-free',
        'BOOK_RECORD_GRAPH_INVALID',
        '来源导入记录图不完整。',
      );
      const retained = parseStoredJson(asString(row.retained_boundary_json), '来源导入保留边界无效。');
      const namedNonEffects = parseStoredJson(asString(row.named_non_effects_json), '来源导入非影响记录无效。');
      requireStore(
        retained !== null && typeof retained === 'object' && !Array.isArray(retained) &&
          Array.isArray(namedNonEffects) && namedNonEffects.every((item) => typeof item === 'string') &&
          canonicalJson(namedNonEffects) === canonicalJson(SOURCE_IMPORT_NON_EFFECTS),
        'BOOK_RECORD_GRAPH_INVALID',
        '来源导入保留边界或非影响记录不完整。',
      );
      const boundary = retained as Record<string, unknown>;
      requireStore(
        boundary.kind === 'complete-local-file' && boundary.label === SOURCE_IMPORT_RETAINED_BOUNDARY_LABEL &&
          boundary.format === 'DOCX' && boundary.displayName === asString(row.sanitized_identity) &&
          boundary.sourceSha256 === asString(row.source_digest) &&
          boundary.contentDigest === asString(row.content_digest) &&
          boundary.structureDigest === asString(row.structure_digest) &&
          typeof boundary.sourceBytes === 'number' && Number.isSafeInteger(boundary.sourceBytes) &&
          boundary.sourceBytes === asNumber(row.byte_length),
        'BOOK_RECORD_GRAPH_INVALID',
        '来源导入保留边界与来源版本不一致。',
      );
      const recordDigest = sha256(canonicalJson({
        schema: SOURCE_IMPORT_RECORD_SCHEMA,
        sourceImportRecordId: asString(row.source_import_record_id),
        commitId: asString(row.commit_id),
        bookId: asString(row.book_id),
        sourceVersionId,
        provenanceId,
        targetKind,
        sourceVersionDisposition: disposition,
        retainedBoundary: retained,
        namedNonEffects,
        importedAt: asString(row.imported_at),
      }));
      requireStore(recordDigest === asString(row.record_digest), 'BOOK_RECORD_GRAPH_INVALID', '来源导入记录摘要无效。');
      if (!presentedSources.has(sourceVersionId)) {
        records.push({
          kind: 'source',
          label: '来源版本与来源记录',
          sourceVersionId,
          provenanceId,
          bookId,
          displayName: asString(row.display_name),
          sourceDigest: asString(row.source_digest),
          contentDigest: asString(row.content_digest),
          structureDigest: asString(row.structure_digest),
          parserIdentity: asString(row.parser_identity),
          acquisitionPath: 'native-file-picker',
          locality: 'local-provider-free',
        });
        presentedSources.add(sourceVersionId);
      }
      records.push({
        kind: 'source-import-record',
        label: '来源导入记录',
        sourceImportRecordId: asString(row.source_import_record_id),
        commitId: asString(row.commit_id),
        bookId,
        sourceVersionId,
        provenanceId,
        targetKind,
        sourceVersionDisposition: disposition,
        retainedBoundary: {
          kind: 'complete-local-file',
          format: 'DOCX',
          displayName: asString(row.sanitized_identity),
          sourceSha256: asString(row.source_digest),
          sourceBytes: boundary.sourceBytes,
          contentDigest: asString(row.content_digest),
          structureDigest: asString(row.structure_digest),
        },
        namedNonEffects: namedNonEffects as string[],
        recordDigest,
        importedAt: asString(row.imported_at),
      });
    }
    return records;
  }

  listBooks(after: BookSummaryCursor | null): BookSummaryPageProjection {
    this.#assertAvailable();
    if (after !== null) {
      requireStore(
        UUID_PATTERN.test(after.bookId) && after.title === safeTitle(after.title),
        'BOOK_SUMMARY_CURSOR_INVALID',
        '图书列表位置无效。',
      );
    }
    const sql = `SELECT b.book_id, b.stable_identity, b.title, b.internal_number,
                        CASE WHEN EXISTS (SELECT 1 FROM manuscripts m WHERE m.book_id = b.book_id)
                          THEN 'populated' ELSE 'empty' END manuscript_state
                 FROM books b
                 ${after === null ? '' : 'WHERE b.title COLLATE BINARY > ? COLLATE BINARY OR (b.title = ? COLLATE BINARY AND b.book_id > ?)'}
                 ORDER BY b.title COLLATE BINARY, b.book_id
                 LIMIT ${BOOK_SUMMARY_PAGE_SIZE + 1}`;
    const rows = (after === null
      ? this.#authority.prepare(sql).all()
      : this.#authority.prepare(sql).all(after.title, after.title, after.bookId)) as SqlRow[];
    const summaries = rows.map((row) => {
      const bookId = asString(row.book_id);
      const stableIdentity = asString(row.stable_identity);
      const title = asString(row.title);
      const internalNumber = row.internal_number === null ? null : asString(row.internal_number);
      const manuscriptState = asString(row.manuscript_state);
      requireStore(
        UUID_PATTERN.test(bookId) && stableIdentity === `book:${bookId}` && title === safeTitle(title) &&
          (internalNumber === null || internalNumber === safeInternalNumber(internalNumber)) &&
          (manuscriptState === 'empty' || manuscriptState === 'populated'),
        'BOOK_SUMMARY_INVALID',
        '图书列表记录无法安全呈现。',
      );
      const projectedManuscriptState: 'empty' | 'populated' =
        manuscriptState === 'empty' ? 'empty' : 'populated';
      const lineagePage = projectedManuscriptState === 'empty'
        ? { items: [] as string[], nextCursor: null }
        : this.#reimportLineageSourceVersionPage(bookId, null);
      return {
        bookId,
        stableIdentity,
        title,
        internalNumber,
        manuscriptState: projectedManuscriptState,
        manuscriptStateLabel: projectedManuscriptState === 'empty' ? '尚无稿件' as const : '已有主稿件' as const,
        reimportLineageSourceVersionIds: lineagePage.items,
        reimportLineageNextCursor: lineagePage.nextCursor,
      };
    });
    const items = summaries.slice(0, BOOK_SUMMARY_PAGE_SIZE);
    const last = items.at(-1);
    return {
      items,
      nextCursor: summaries.length > BOOK_SUMMARY_PAGE_SIZE && last
        ? { title: last.title, bookId: last.bookId }
        : null,
    };
  }

  getReimportLineageSourceVersionPage(
    bookId: string,
    after: string | null,
  ): ReimportLineageSourceVersionPageProjection {
    this.#assertAvailable();
    requireStore(UUID_PATTERN.test(bookId) && (after === null || UUID_PATTERN.test(after)),
      'REIMPORT_LINEAGE_INVALID', '来源关系版本分页位置无效。');
    const page = this.#reimportLineageSourceVersionPage(bookId, after);
    return { bookId, after, ...page };
  }

  #reimportLineageSourceVersionPage(bookId: string, after: string | null): {
    items: string[];
    previousCursor: string | null;
    nextCursor: string | null;
  } {
    const rows = (this.#authority.prepare(
      `SELECT source_version_id FROM (
         SELECT mir.source_version_id
         FROM manuscript_import_records mir
         WHERE mir.book_id = ?
         UNION
         SELECT rr.source_version_id
         FROM manuscript_reimport_records rr
         WHERE rr.book_id = ? AND
           ((rr.result_kind = 'changed' AND rr.resulting_revision_id IS NOT NULL) OR rr.result_kind = 'no-change')
       ) ${after === null ? '' : 'WHERE source_version_id < ?'}
       ORDER BY source_version_id DESC LIMIT ${REIMPORT_LINEAGE_CHOICE_LIMIT + 1}`,
    ).all(...(after === null ? [bookId, bookId] : [bookId, bookId, after])) as SqlRow[]);
    const items = rows.slice(0, REIMPORT_LINEAGE_CHOICE_LIMIT).map((row) => asString(row.source_version_id));
    const previousRows = after === null ? [] : this.#authority.prepare(
      `SELECT source_version_id FROM (
         SELECT mir.source_version_id FROM manuscript_import_records mir WHERE mir.book_id = ?
         UNION
         SELECT rr.source_version_id FROM manuscript_reimport_records rr
         WHERE rr.book_id = ? AND
           ((rr.result_kind = 'changed' AND rr.resulting_revision_id IS NOT NULL) OR rr.result_kind = 'no-change')
       ) WHERE source_version_id > ? ORDER BY source_version_id ASC LIMIT ${REIMPORT_LINEAGE_CHOICE_LIMIT}`,
    ).all(bookId, bookId, after) as SqlRow[];
    return {
      items,
      previousCursor: previousRows.length === REIMPORT_LINEAGE_CHOICE_LIMIT
        ? asString(previousRows.at(-1)!.source_version_id)
        : null,
      nextCursor: rows.length > REIMPORT_LINEAGE_CHOICE_LIMIT ? items.at(-1)! : null,
    };
  }

  private prepareBookCreationReviewForExactIdentity(
    bookId: string,
    stableIdentity: string,
    title: string,
    internalNumber: string | null,
  ): BookCreationReviewProjection {
    const proposed = { bookId, stableIdentity, title, internalNumber };
    return {
      reviewDigest: sha256(canonicalJson({
        schema: 'ai7.empty-book-creation-review/1',
        proposed,
        editorialDimensionSet: {
          ...BASELINE_EDITORIAL_DIMENSION_SET,
          digest: BASELINE_EDITORIAL_DIMENSION_SET_DIGEST,
        },
        recordsToCreate: ['图书与稳定标识', '图书编辑维度集（8 项）'],
        nonEffects: EMPTY_BOOK_NON_EFFECTS,
      })),
      proposed,
      recordsToCreate: ['图书与稳定标识', '图书编辑维度集（8 项）'],
      nonEffects: EMPTY_BOOK_NON_EFFECTS,
      editorialDimensionSet: {
        ...BASELINE_EDITORIAL_DIMENSION_SET,
        digest: BASELINE_EDITORIAL_DIMENSION_SET_DIGEST,
      },
    };
  }

  #insertBookDimensionSet(dimensionSetId: string, bookId: string, createdAt: string): void {
    this.#authority.prepare(
      `INSERT INTO book_dimension_sets(
         dimension_set_id, book_id, version, profile_id, profile_version, definition_digest,
         weight_semantics, created_at
       ) VALUES (?, ?, 1, ?, ?, ?, ?, ?)`,
    ).run(
      dimensionSetId,
      bookId,
      BASELINE_EDITORIAL_DIMENSION_SET.profileId,
      BASELINE_EDITORIAL_DIMENSION_SET.profileVersion,
      BASELINE_EDITORIAL_DIMENSION_SET_DIGEST,
      BASELINE_EDITORIAL_DIMENSION_SET.weightSemantics,
      createdAt,
    );
    const insertDimension = this.#authority.prepare(
      'INSERT INTO book_dimensions(dimension_set_id, dimension_id, display_label, weight, position) VALUES (?, ?, ?, ?, ?)',
    );
    EDITORIAL_DIMENSIONS.forEach((dimension, index) =>
      insertDimension.run(dimensionSetId, dimension.id, dimension.label, dimension.weight, index + 1),
    );
  }

  async stageSelectedDocx(selectionToken: string, selectedPathInput: string): Promise<StagedImportProjection> {
    this.#assertAvailable();
    requireStore(TOKEN_PATTERN.test(selectionToken), 'SELECTION_INVALID', '文件选择令牌无效。');
    requireStore(isAbsolute(selectedPathInput), 'SELECTION_INVALID', '文件选择结果无效。');

    try {
      const selectedPath = await realpath(selectedPathInput);
      const displayName = safeDisplayName(basename(selectedPath));
      const draftId = randomUUID();
      const ingested = await this.#parseIntoIngest(draftId, selectedPath, displayName);
      try {
        return await this.#withContentObjectLifecycle(async () => {
          const { parsed } = ingested;
          const relativeKey = await this.#persistContentObject(selectedPath, parsed);
          const now = new Date().toISOString();
          this.#transaction(this.#authority, () => {
            this.#authority
              .prepare(
                `INSERT INTO content_objects(object_digest, relative_key, byte_length, verified_at)
                 VALUES (?, ?, ?, ?)
                 ON CONFLICT(object_digest) DO NOTHING`,
              )
              .run(parsed.sourceDigest, relativeKey, parsed.archiveBytes, now);
            const object = one(
              this.#authority.prepare('SELECT relative_key, byte_length FROM content_objects WHERE object_digest = ?').all(parsed.sourceDigest) as SqlRow[],
              'OBJECT_VERIFY_FAILED',
              '暂存对象记录缺失。',
            );
            requireStore(asString(object.relative_key) === relativeKey && asNumber(object.byte_length) === parsed.archiveBytes, 'OBJECT_VERIFY_FAILED', '暂存对象记录冲突。');
            this.#authority
              .prepare(
                `INSERT INTO import_drafts(
                   draft_id, selection_token, state, draft_version, display_name, object_digest, selected_path, staged_at
                 ) VALUES (?, ?, 'staged', 1, ?, ?, ?, ?)`,
              )
              .run(draftId, selectionToken, displayName, parsed.sourceDigest, selectedPath, now);
            this.#promoteIngestSnapshot(draftId, ingested, now);
            this.#boundedCall(() => this.#boundedAuthority.assertStagedDraftIntegrity(draftId));
            this.#assertForeignKeys(this.#authority);
          });

          return this.#stagedProjection({
            draftId,
            state: 'staged',
            version: 1,
            displayName,
            objectDigest: parsed.sourceDigest,
            selectedPath,
            reviewedTitle: null,
            reviewedTargetChoiceId: null,
            reviewedTargetKind: null,
            reviewedExistingBookId: null,
            reviewedRelationship: null,
            reviewedBookStateDigest: null,
            reviewedReuseSourceVersionId: null,
            reviewedLineageStatus: null,
            reviewedLineageSourceVersionId: null,
            reviewedCheckpointRevisionId: null,
            reviewedManuscriptId: null,
            reviewedBranchId: null,
            reviewDigest: null,
            stagedAt: now,
            parserIdentity: parsed.parserIdentity,
            sourceDigest: parsed.sourceDigest,
            sourceBytes: parsed.archiveBytes,
            contentDigest: parsed.contentDigest,
            structureDigest: parsed.structureDigest,
            blockCount: parsed.blockCount,
            characterCount: parsed.characterCount,
            fidelity: parsed.fidelity,
            titleSuggestion: parsed.titleSuggestion.value,
            titleSource: parsed.titleSuggestion.sourceLabel,
          });
        });
      } finally {
        this.#discardIngest(ingested.ingestId);
      }
    } catch (error) {
      if (error instanceof StoreError) throw error;
      if (error instanceof Error && error.message.startsWith('DOCX_REJECTED:')) {
        throw new StoreError('DOCX_REJECTED', '该 DOCX 不符合当前受限本地导入边界。');
      }
      throw error;
    }
  }

  async getImportStartup(): Promise<ImportStartupProjection> {
    this.#assertAvailable();
    const attempts = this.#authority
      .prepare(
        `SELECT attempt_id
         FROM import_commit_attempts
         WHERE state != 'committed' OR completion_acknowledged_at IS NULL
         ORDER BY CASE state WHEN 'uncertain' THEN 0 WHEN 'prepared' THEN 1 ELSE 2 END, prepared_at, attempt_id`,
      )
      .all() as SqlRow[];
    let committed: ImportCommitProjection | undefined;
    for (const row of attempts) {
      const attempt = this.#loadCommitAttempt(asString(row.attempt_id));
      const reconciliation = await this.#reconcileCommitAttempt(attempt);
      if (reconciliation.state === 'uncertain') {
        return {
          state: 'outcome-uncertain',
          recovery: await this.#recoveryProjection(attempt.draftId, 'outcome-uncertain'),
        };
      }
      if (reconciliation.state === 'committed' && attempt.completionAcknowledgedAt === null && !committed) {
        committed = reconciliation.result;
      }
    }
    if (committed) return { state: 'committed-recovered', result: committed };

    const cleanupIntents = this.#authority
      .prepare('SELECT draft_id FROM import_abandonment_cleanup_intents ORDER BY requested_at, draft_id')
      .all() as SqlRow[];
    if (cleanupIntents.length > 0) {
      return {
        state: 'draft-recovery',
        recovery: await this.#recoveryProjection(
          asString(cleanupIntents[0]!.draft_id),
          'abandonment-cleanup',
        ),
      };
    }

    const drafts = this.#authority
      .prepare(
        `SELECT draft_id
         FROM import_drafts
         WHERE state IN ('staged', 'reviewed')
         ORDER BY staged_at, draft_id`,
      )
      .all() as SqlRow[];
    if (drafts.length === 0) return { state: 'none' };
    return {
      state: 'draft-recovery',
      recovery: await this.#recoveryProjection(asString(drafts[0]!.draft_id), 'ordinary-draft'),
    };
  }

  async getStartup(): Promise<StartupProjection> {
    this.#assertAvailable();
    const attentionId = this.#boundedCall(() => this.#boundedAuthority.firstRecoveryAttentionId());
    if (attentionId !== null) {
      return { state: 'manuscript-recovery', recovery: await this.getRecoveryComparison(attentionId) };
    }
    const startup = await this.getImportStartup();
    if (startup.state !== 'none') return { state: 'import', startup };
    return { state: 'prior-work', priorWork: this.listPriorWork() };
  }

  async #preferredRecoverySnapshot(attentionId: string): Promise<{
    verified: VerifiedRecoverySnapshot;
    record: RecoverySnapshotRecord | null;
    comparisonSnapshotId: string | null;
  }> {
    let cursor: RecoverySnapshotCursor | null = null;
    let newestUnavailable: Extract<VerifiedRecoverySnapshot, { state: 'unavailable' }> | null = null;
    let newestSnapshotId: string | null = null;
    while (true) {
      const record = this.#boundedCall(() =>
        this.#boundedAuthority.nextRecoverySnapshotForAttention(attentionId, cursor));
      if (record === null) {
        return {
          verified: newestUnavailable ?? { state: 'none' },
          record: null,
          comparisonSnapshotId: newestSnapshotId,
        };
      }
      newestSnapshotId ??= record.snapshotId;
      const verified = await this.#recoveryObjects.verify(record);
      if (verified.state === 'eligible') {
        return { verified, record, comparisonSnapshotId: record.snapshotId };
      }
      if (verified.state === 'unavailable') {
        newestUnavailable ??= verified;
      }
      cursor = { createdAt: record.createdAt, snapshotId: record.snapshotId };
    }
  }

  async getRecoveryComparison(attentionId: string): Promise<RecoveryComparisonProjection> {
    this.#assertAvailable();
    const { verified } = await this.#preferredRecoverySnapshot(attentionId);
    return this.#boundedCall(() => this.#boundedAuthority.getRecoveryComparison(attentionId, verified));
  }

  async viewRecoveryCandidate(
    attentionId: string,
    expectedAttentionVersion: number,
    selection: RecoverySelection,
    target: RecoveryWindowTarget,
  ): Promise<RecoveryWindowProjection> {
    this.#assertAvailable();
    if (selection.kind !== 'snapshot') {
      const projection = this.#boundedCall(() =>
        this.#boundedAuthority.getRecoveryDatabaseWindow(attentionId, selection, target));
      this.#boundedCall(() =>
        this.#boundedAuthority.recordRecoveryView(attentionId, expectedAttentionVersion, selection));
      return projection;
    }
    const record = this.#boundedCall(() =>
      this.#boundedAuthority.recoverySnapshotByIdForAttention(attentionId, selection.snapshotId));
    let window: Awaited<ReturnType<RecoveryObjectStore['readWindow']>>;
    try {
      // readWindow performs the complete digest-bound scan while retaining only the requested bounded window.
      window = await this.#recoveryObjects.readWindow(record, target);
    } catch {
      throw new StoreError('RECOVERY_SNAPSHOT_INELIGIBLE', '恢复快照未通过独立校验。');
    }
    this.#boundedCall(() =>
      this.#boundedAuthority.recordRecoveryView(attentionId, expectedAttentionVersion, selection));
    return {
      attentionId, selection, title: '已验证恢复快照', revisionId: record.revisionId,
      revisionLabel: record.revisionLabel, readonly: true, blocks: window.blocks, nextTarget: window.nextTarget,
    };
  }

  async deferRecovery(attentionId: string, expectedAttentionVersion: number): Promise<RecoveryDeferralProjection> {
    this.#assertAvailable();
    const deferred = this.#boundedCall(() =>
      this.#boundedAuthority.deferRecovery(attentionId, expectedAttentionVersion));
    const startup = await this.getImportStartup();
    return {
      ...deferred,
      next: startup.state === 'none'
        ? { state: 'prior-work', priorWork: this.listPriorWork() }
        : { state: 'import', startup },
    };
  }

  async restoreRecovery(
    restorationId: string,
    attentionId: string,
    expectedAttentionVersion: number,
    selection: RecoverySelection,
  ): Promise<RecoveryRestorationProjection> {
    this.#assertAvailable();
    const existing = this.#boundedCall(() => this.#boundedAuthority.existingRecoveryRestoration(
      restorationId, attentionId, expectedAttentionVersion, selection,
    ));
    if (existing !== null) return existing;
    let snapshotStageStarted = false;
    try {
      let comparisonSnapshotId: string | null;
      if (selection.kind === 'snapshot') {
        const record = this.#boundedCall(() =>
          this.#boundedAuthority.recoverySnapshotByIdForAttention(attentionId, selection.snapshotId));
        comparisonSnapshotId = record.snapshotId;
        this.#boundedCall(() =>
          this.#boundedAuthority.beginRecoverySnapshotStage(attentionId, expectedAttentionVersion, record.snapshotId));
        snapshotStageStarted = true;
        try {
          // forEachBatch verifies the complete object and leaves only bounded batches in process memory.
          await this.#recoveryObjects.forEachBatch(record, (blocks) => {
            this.#boundedCall(() => this.#boundedAuthority.stageRecoverySnapshotBlocks(attentionId, blocks));
          });
        } catch {
          throw new StoreError('RECOVERY_SNAPSHOT_INELIGIBLE', '恢复快照未通过独立校验。');
        }
      } else {
        ({ comparisonSnapshotId } = await this.#preferredRecoverySnapshot(attentionId));
      }
      return this.#boundedCall(() => this.#boundedAuthority.restoreRecovery(
        restorationId, attentionId, expectedAttentionVersion, selection, comparisonSnapshotId,
      ));
    } finally {
      if (snapshotStageStarted) {
        this.#boundedCall(() => this.#boundedAuthority.clearRecoveryStage(attentionId));
      }
    }
  }

  async continueImportDraft(draftId: string, expectedDraftVersion: number): Promise<ContinueImportProjection> {
    this.#assertAvailable();
    requireStore(UUID_PATTERN.test(draftId), 'DRAFT_INVALID', '导入草稿标识无效。');
    this.#requireNoAbandonmentCleanupIntent(draftId);
    const attempt = this.#loadCommitAttemptForDraft(draftId);
    if (attempt) {
      const reconciliation = await this.#reconcileCommitAttempt(attempt);
      if (reconciliation.state === 'committed') {
        return { state: 'committed-recovered', result: reconciliation.result };
      }
      if (reconciliation.state === 'uncertain') {
        return {
          state: 'outcome-uncertain',
          recovery: await this.#recoveryProjection(draftId, 'outcome-uncertain'),
        };
      }
    }

    let snapshot: DraftSnapshot;
    try {
      snapshot = this.#loadDraftSnapshot(draftId);
      requireStore(snapshot.version === expectedDraftVersion, 'DRAFT_VERSION_CHANGED', '导入草稿版本已变化。');
      const revalidated = await this.#revalidateSnapshot(snapshot);
      snapshot = revalidated.snapshot;
      if (revalidated.parserDrift) {
        const access = await this.#originalFileAccess(snapshot);
        return {
          state: 'target-review-required',
          staged: this.#stagedProjection(snapshot),
          originalFileAccess: access,
          reviewInvalidated: true,
          notice: '解析器版本已变化；已从精确暂存字节重新形成预检，旧复核已失效，请重新检查变化后的决定。',
        };
      }
    } catch (error) {
      if (error instanceof StoreError && error.code === 'DRAFT_VERSION_CHANGED') throw error;
      return {
        state: 'reselection-required',
        recovery: await this.#recoveryProjection(draftId, 'ordinary-draft'),
      };
    }

    const access = await this.#originalFileAccess(snapshot);
    if (snapshot.state === 'staged') {
      return {
        state: 'target-review-required',
        staged: this.#stagedProjection(snapshot),
        originalFileAccess: access,
        reviewInvalidated: false,
        notice: continuationNotice(access),
      };
    }

    requireStore(snapshot.state === 'reviewed', 'DRAFT_STATE_CHANGED', '导入草稿状态已变化。');
    const identityFindings = this.#identityFindings(snapshot);
    if (snapshot.reviewedRelationship === 'reimport') {
      const reimportTarget = this.#reconstructReviewedReimportTarget(snapshot);
      if (reimportTarget === null) {
        snapshot = this.#invalidateReview(snapshot);
        return {
          state: 'target-review-required',
          staged: this.#stagedProjection(snapshot),
          originalFileAccess: access,
          reviewInvalidated: true,
          notice: '重新导入目标、固定点、来源关系、来源版本结果或逐块比较已变化；旧复核已失效。',
        };
      }
      return {
        state: 'review-ready',
        review: this.#reimportReviewProjection(snapshot, reimportTarget, attempt?.attemptId ?? null),
        originalFileAccess: access,
        notice: continuationNotice(access),
      };
    }
    if (snapshot.reviewedRelationship === 'source-only') {
      const sourceTarget = this.#reconstructReviewedSourceImportTarget(snapshot, identityFindings);
      if (sourceTarget === null) {
        snapshot = this.#invalidateReview(snapshot);
        return {
          state: 'target-review-required',
          staged: this.#stagedProjection(snapshot),
          originalFileAccess: access,
          reviewInvalidated: true,
          notice: '来源导入目标、关系、复用选择、保留边界或最终记录后果已变化；旧复核已失效。',
        };
      }
      return {
        state: 'review-ready',
        review: this.#sourceImportReviewProjection(snapshot, sourceTarget, identityFindings, attempt?.attemptId ?? null),
        originalFileAccess: access,
        notice: continuationNotice(access),
      };
    }
    const plan = this.#requireFidelityPlan(snapshot);
    const reconstructedTarget = this.#reconstructReviewedImportTarget(snapshot, plan, identityFindings);
    if (reconstructedTarget === null) {
      snapshot = this.#invalidateReview(snapshot);
      return {
        state: 'target-review-required',
        staged: this.#stagedProjection(snapshot),
        originalFileAccess: access,
        reviewInvalidated: true,
        notice: '导入目标、书名、保真状态或最终记录后果已变化；旧复核已失效，请从变化后的选择重新确认。',
      };
    }
    requireStore(snapshot.reviewDigest !== null, 'REVIEW_CHANGED', '导入前复核摘要已变化。');

    return {
      state: 'review-ready',
      review: this.#reviewProjection(
        snapshot,
        snapshot.reviewDigest,
        plan,
        plan.degradations.length > 0,
        reconstructedTarget,
        identityFindings,
        attempt?.attemptId ?? null,
      ),
      originalFileAccess: access,
      notice: continuationNotice(access),
    };
  }

  async reselectImportDraft(
    draftId: string,
    expectedDraftVersion: number,
    selectionToken: string,
    selectedPathInput: string,
  ): Promise<ContinueImportProjection> {
    this.#assertAvailable();
    requireStore(UUID_PATTERN.test(draftId) && TOKEN_PATTERN.test(selectionToken), 'SELECTION_INVALID', '文件重选参数无效。');
    requireStore(!Array.from(this.#reimportCommitWork.values()).some((work) => work.input.draftId === draftId),
      'SERVICE_BUSY', '稿件重新导入正在提交，不能重选来源文件。');
    this.#requireNoAbandonmentCleanupIntent(draftId);
    requireStore(isAbsolute(selectedPathInput), 'SELECTION_INVALID', '文件选择结果无效。');
    const attempt = this.#loadCommitAttemptForDraft(draftId);
    if (attempt) {
      const reconciliation = await this.#reconcileCommitAttempt(attempt);
      if (reconciliation.state === 'committed') {
        return { state: 'committed-recovered', result: reconciliation.result };
      }
      if (reconciliation.state === 'uncertain') {
        return {
          state: 'outcome-uncertain',
          recovery: await this.#recoveryProjection(draftId, 'outcome-uncertain'),
        };
      }
    }

    const draft = one(
      this.#authority
        .prepare('SELECT state, draft_version, object_digest FROM import_drafts WHERE draft_id = ?')
        .all(draftId) as SqlRow[],
      'DRAFT_NOT_FOUND',
      '导入草稿不存在。',
    );
    const previousState = asString(draft.state);
    requireStore(previousState === 'staged' || previousState === 'reviewed', 'DRAFT_STATE_CHANGED', '导入草稿状态已变化。');
    requireStore(asNumber(draft.draft_version) === expectedDraftVersion, 'DRAFT_VERSION_CHANGED', '导入草稿版本已变化。');
    const expectedDigest = asString(draft.object_digest);

    let selectedPath: string;
    let displayName: string;
    let ingested: IngestedDocx;
    try {
      selectedPath = await realpath(selectedPathInput);
      displayName = safeDisplayName(basename(selectedPath));
      ingested = await this.#parseIntoIngest(draftId, selectedPath, displayName);
    } catch (error) {
      if (error instanceof StoreFatalError) throw error;
      throw new StoreError('SNAPSHOT_RESELECTION_REQUIRED', '重选文件无法形成完整的本地暂存快照。');
    }
    try {
      const { parsed } = ingested;
      requireStore(parsed.sourceDigest === expectedDigest, 'RESELECTION_MISMATCH', '重选文件与原暂存来源身份不一致。');
      return await this.#withContentObjectLifecycle(async () => {
        this.#requireNoAbandonmentCleanupIntent(draftId);
        const currentDraft = one(
          this.#authority
            .prepare('SELECT state, draft_version, object_digest FROM import_drafts WHERE draft_id = ?')
            .all(draftId) as SqlRow[],
          'DRAFT_NOT_FOUND',
          '导入草稿不存在。',
        );
        requireStore(
          (asString(currentDraft.state) === 'staged' || asString(currentDraft.state) === 'reviewed') &&
            asNumber(currentDraft.draft_version) === expectedDraftVersion &&
            asString(currentDraft.object_digest) === expectedDigest,
          'DRAFT_VERSION_CHANGED',
          '导入草稿在重选持久化前已变化。',
        );
        const relativeKey = await this.#persistContentObject(selectedPath, parsed);
        const nextVersion = expectedDraftVersion + 1;
        const now = new Date().toISOString();
        this.#transaction(this.#authority, () => {
          this.#authority
            .prepare(
              `INSERT INTO content_objects(object_digest, relative_key, byte_length, verified_at)
               VALUES (?, ?, ?, ?)
               ON CONFLICT(object_digest) DO UPDATE SET
                 relative_key = excluded.relative_key,
                 byte_length = excluded.byte_length,
                 verified_at = excluded.verified_at`,
            )
            .run(parsed.sourceDigest, relativeKey, parsed.archiveBytes, now);
          this.#authority.prepare('DELETE FROM manuscript_reimport_comparisons WHERE draft_id = ?').run(draftId);
          this.#authority.prepare('DELETE FROM staged_import_snapshots WHERE draft_id = ?').run(draftId);
          this.#promoteIngestSnapshot(draftId, ingested, now);
          const draftUpdate = this.#authority
            .prepare(
              `UPDATE import_drafts
               SET selection_token = ?, state = 'staged', draft_version = ?, display_name = ?, object_digest = ?,
                   selected_path = ?, reviewed_title = NULL, reviewed_target_choice_id = NULL,
                   reviewed_target_kind = NULL, reviewed_existing_book_id = NULL,
                   reviewed_relationship = NULL, reviewed_book_state_digest = NULL,
                   reviewed_reuse_source_version_id = NULL,
                   reviewed_lineage_status = NULL, reviewed_lineage_source_version_id = NULL,
                   reviewed_checkpoint_revision_id = NULL, reviewed_manuscript_id = NULL, reviewed_branch_id = NULL,
                   review_digest = NULL, reviewed_at = NULL
               WHERE draft_id = ? AND draft_version = ? AND state IN ('staged', 'reviewed')`,
            )
            .run(selectionToken, nextVersion, displayName, parsed.sourceDigest, selectedPath, draftId, expectedDraftVersion);
          requireStore(draftUpdate.changes === 1, 'DRAFT_VERSION_CHANGED', '导入草稿在重选时已变化。');
          this.#authority.prepare("DELETE FROM import_commit_attempts WHERE draft_id = ? AND state = 'prepared'").run(draftId);
          this.#boundedCall(() => this.#boundedAuthority.assertStagedDraftIntegrity(draftId));
          this.#assertForeignKeys(this.#authority);
        });
        const snapshot = this.#loadDraftSnapshot(draftId);
        return {
          state: 'target-review-required',
          staged: this.#stagedProjection(snapshot),
          originalFileAccess: { state: 'available-exact', label: '原始所选文件仍可访问且身份一致' },
          reviewInvalidated: previousState === 'reviewed' || attempt !== null,
          notice: '已通过原来源摘要精确匹配完成重选，并重新形成完整暂存与预检；请重新确认全部决定。',
        };
      });
    } finally {
      this.#discardIngest(ingested.ingestId);
    }
  }

  async abandonImportDraft(draftId: string, expectedDraftVersion: number): Promise<ImportStartupProjection> {
    this.#assertAvailable();
    requireStore(UUID_PATTERN.test(draftId), 'DRAFT_INVALID', '导入草稿标识无效。');
    requireStore(!Array.from(this.#reimportCommitWork.values()).some((work) => work.input.draftId === draftId),
      'SERVICE_BUSY', '稿件重新导入正在提交，不能放弃草稿。');
    return this.#withContentObjectLifecycle(() =>
      this.#abandonImportDraftWithinContentObjectLifecycle(draftId, expectedDraftVersion),
    );
  }

  async #abandonImportDraftWithinContentObjectLifecycle(
    draftId: string,
    expectedDraftVersion: number,
  ): Promise<ImportStartupProjection> {
    const pendingCleanup = this.#loadAbandonmentCleanupIntent(draftId);
    if (pendingCleanup) {
      requireStore(
        pendingCleanup.expectedDraftVersion === expectedDraftVersion,
        'DRAFT_VERSION_CHANGED',
        '导入草稿版本已变化。',
      );
      await this.#resumeAbandonmentCleanupIntent(pendingCleanup);
      return this.getImportStartup();
    }
    const attempt = this.#loadCommitAttemptForDraft(draftId);
    if (attempt) {
      const reconciliation = await this.#reconcileCommitAttempt(attempt);
      if (reconciliation.state === 'committed') {
        return { state: 'committed-recovered', result: reconciliation.result };
      }
      if (reconciliation.state === 'uncertain') {
        return {
          state: 'outcome-uncertain',
          recovery: await this.#recoveryProjection(draftId, 'outcome-uncertain'),
        };
      }
    }
    const cleanupIntent = this.#transaction<AbandonmentCleanupIntent | null>(this.#authority, () => {
      const draft = one(
        this.#authority
          .prepare(
            `SELECT d.state, d.draft_version, d.object_digest, co.relative_key
             FROM import_drafts d
             JOIN content_objects co ON co.object_digest = d.object_digest
             WHERE d.draft_id = ?`,
          )
          .all(draftId) as SqlRow[],
        'DRAFT_NOT_FOUND',
        '导入草稿不存在。',
      );
      const draftState = asString(draft.state);
      requireStore(
        draftState === 'staged' || draftState === 'reviewed',
        'DRAFT_STATE_CHANGED',
        '该导入已经提交，不能放弃。',
      );
      requireStore(
        asNumber(draft.draft_version) === expectedDraftVersion,
        'DRAFT_VERSION_CHANGED',
        '导入草稿版本已变化。',
      );
      const commitEvidence = one(
        this.#authority.prepare('SELECT count(*) commits FROM import_commits WHERE draft_id = ?').all(draftId) as SqlRow[],
        'STORE_CORRUPT',
        '无法核对导入提交证据。',
      );
      requireStore(
        asNumber(commitEvidence.commits) === 0,
        'COMMIT_EVIDENCE_PRESENT',
        '存在导入提交证据，不能放弃或清理。',
      );
      const objectDigest = asString(draft.object_digest);
      const relativeKey = asString(draft.relative_key);
      const referencesBefore = one(
        this.#authority
          .prepare(
            `SELECT
               (SELECT count(*) FROM source_versions WHERE object_digest = ?) source_refs,
               (SELECT count(*) FROM import_drafts WHERE object_digest = ?) draft_refs`,
          )
          .all(objectDigest, objectDigest) as SqlRow[],
        'STORE_CORRUPT',
        '无法核对放弃前的暂存对象引用。',
      );
      const sourceReferences = asNumber(referencesBefore.source_refs);
      const draftReferences = asNumber(referencesBefore.draft_refs);
      requireStore(draftReferences >= 1, 'STORE_CORRUPT', '导入草稿未引用其暂存对象。');
      if (sourceReferences === 0 && draftReferences === 1) {
        const requestedAt = new Date().toISOString();
        this.#authority
          .prepare(
            `INSERT INTO import_abandonment_cleanup_intents(
               draft_id, object_digest, expected_draft_version, relative_key, state, requested_at
             ) VALUES (?, ?, ?, ?, 'prepared', ?)`,
          )
          .run(draftId, objectDigest, expectedDraftVersion, relativeKey, requestedAt);
        const intent: AbandonmentCleanupIntent = {
          draftId,
          objectDigest,
          expectedDraftVersion,
          relativeKey,
          state: 'prepared',
        };
        this.#assertForeignKeys(this.#authority);
        return intent;
      }
      const deletion = this.#authority
        .prepare("DELETE FROM import_drafts WHERE draft_id = ? AND draft_version = ? AND state IN ('staged', 'reviewed')")
        .run(draftId, expectedDraftVersion);
      requireStore(deletion.changes === 1, 'DRAFT_VERSION_CHANGED', '导入草稿在放弃时已变化。');
      const references = one(
        this.#authority
          .prepare(
            `SELECT
               (SELECT count(*) FROM source_versions WHERE object_digest = ?) source_refs,
               (SELECT count(*) FROM import_drafts WHERE object_digest = ?) draft_refs`,
          )
          .all(objectDigest, objectDigest) as SqlRow[],
        'STORE_CORRUPT',
        '无法核对暂存对象引用。',
      );
      requireStore(
        asNumber(references.source_refs) + asNumber(references.draft_refs) > 0,
        'ABANDON_REFERENCE_CHANGED',
        '共享暂存对象在放弃时失去权威引用；已中止清理。',
      );
      this.#assertForeignKeys(this.#authority);
      return null;
    });
    if (cleanupIntent) await this.#resumeAbandonmentCleanupIntent(cleanupIntent);
    return this.getImportStartup();
  }

  async acknowledgeImportCompletion(commitId: string): Promise<{ state: 'acknowledged' }> {
    this.#assertAvailable();
    requireStore(UUID_PATTERN.test(commitId), 'COMMIT_INVALID', '导入提交标识无效。');
    const attempt = this.#loadCommitAttempt(commitId);
    const reconciliation = await this.#reconcileCommitAttempt(attempt);
    requireStore(reconciliation.state === 'committed', 'COMMIT_NOT_PROVEN', '导入提交尚未获得完整证明。');
    this.#authority
      .prepare(
        `UPDATE import_commit_attempts
         SET completion_acknowledged_at = COALESCE(completion_acknowledged_at, ?)
         WHERE attempt_id = ? AND state = 'committed'`,
      )
      .run(new Date().toISOString(), commitId);
    return { state: 'acknowledged' };
  }

  prepareNewBookReview(
    draftId: string,
    expectedDraftVersion: number,
    targetSelection: ImportTargetSelection,
    acceptDegradation: boolean,
  ): ReviewBeforeImportProjection {
    this.#assertAvailable();
    requireStore(UUID_PATTERN.test(draftId), 'DRAFT_INVALID', '导入草稿标识无效。');
    this.#requireNoAbandonmentCleanupIntent(draftId);
    const snapshot = this.#loadDraftSnapshot(draftId);
    requireStore(snapshot.state === 'staged', 'DRAFT_STATE_CHANGED', '导入草稿状态已变化。');
    requireStore(snapshot.version === expectedDraftVersion, 'DRAFT_VERSION_CHANGED', '导入草稿版本已变化。');
    const identityFindings = this.#identityFindings(snapshot);
    const target = this.#resolveImportTarget(targetSelection, identityFindings);
    const plan = this.#requireFidelityPlan(snapshot);
    if (plan.degradations.length > 0 && !acceptDegradation) {
      return this.#reviewProjection(snapshot, null, plan, false, target, identityFindings, null);
    }
    requireStore(
      plan.degradations.length > 0 || !acceptDegradation,
      'DEGRADATION_ACCEPTANCE_INVALID',
      '本次导入不需要降级接受。',
    );
    const nextVersion = expectedDraftVersion + 1;
    requireStore(
      !this.#control.persistLegacyReviewedDraft ||
        (target.kind === 'new-book' && target.choiceId === 'new-book' && identityFindings.length === 0),
      'E2E_CONTROL_INVALID',
      '旧版复核边界仅适用于无身份提示的新建图书。',
    );
    const reviewSnapshot = { ...snapshot, version: nextVersion };
    const reviewDigest = this.#control.persistLegacyReviewedDraft
      ? createLegacyNewBookReviewDigestV2(reviewSnapshot, target.kind === 'new-book' ? target.confirmedTitle : '', nextVersion, plan)
      : createImportReviewDigestV5(reviewSnapshot, nextVersion, plan, target, identityFindings, this.#workflowProfile);
    const persistedTargetChoiceId = this.#control.persistLegacyReviewedDraft
      ? null
      : target.kind === 'new-book' ? target.choiceId : null;
    const reviewedAt = new Date().toISOString();
    this.#transaction(this.#authority, () => {
      const update = this.#authority
        .prepare(
          `UPDATE import_drafts
           SET state = 'reviewed', draft_version = ?, reviewed_title = ?, reviewed_target_choice_id = ?,
               reviewed_target_kind = ?, reviewed_existing_book_id = ?, reviewed_relationship = ?,
               reviewed_book_state_digest = ?, reviewed_reuse_source_version_id = NULL,
               review_digest = ?, reviewed_at = ?
           WHERE draft_id = ? AND state = 'staged' AND draft_version = ?`,
        )
        .run(
          nextVersion,
          target.kind === 'new-book' ? target.confirmedTitle : null,
          persistedTargetChoiceId,
          target.kind,
          target.kind === 'existing-book' ? target.bookId : null,
          target.kind === 'existing-book' ? 'first-manuscript' : 'new-book-first-manuscript',
          target.kind === 'existing-book' ? target.bookStateDigest : null,
          reviewDigest,
          reviewedAt,
          draftId,
          expectedDraftVersion,
        );
      requireStore(update.changes === 1, 'DRAFT_VERSION_CHANGED', '导入草稿在复核时已变化。');
    });
    return this.#reviewProjection(
      {
        ...snapshot,
        state: 'reviewed',
        version: nextVersion,
        reviewedTitle: target.kind === 'new-book' ? target.confirmedTitle : null,
        reviewedTargetChoiceId: persistedTargetChoiceId,
        reviewedTargetKind: target.kind,
        reviewedExistingBookId: target.kind === 'existing-book' ? target.bookId : null,
        reviewedRelationship: target.kind === 'existing-book' ? 'first-manuscript' : 'new-book-first-manuscript',
        reviewedBookStateDigest: target.kind === 'existing-book' ? target.bookStateDigest : null,
        reviewDigest,
      },
      reviewDigest,
      plan,
      plan.degradations.length > 0,
      target,
      identityFindings,
      null,
    );
  }

  prepareSourceImportReview(
    draftId: string,
    expectedDraftVersion: number,
    targetSelection: SourceImportTargetSelection,
  ): ReviewBeforeSourceImportProjection {
    this.#assertAvailable();
    requireStore(UUID_PATTERN.test(draftId), 'DRAFT_INVALID', '导入草稿标识无效。');
    this.#requireNoAbandonmentCleanupIntent(draftId);
    const snapshot = this.#loadDraftSnapshot(draftId);
    requireStore(snapshot.state === 'staged', 'DRAFT_STATE_CHANGED', '导入草稿状态已变化。');
    requireStore(snapshot.version === expectedDraftVersion, 'DRAFT_VERSION_CHANGED', '导入草稿版本已变化。');
    const identityFindings = this.#identityFindings(snapshot);
    const target = this.#resolveSourceImportTarget(targetSelection, snapshot, identityFindings);
    const nextVersion = expectedDraftVersion + 1;
    const reviewedSnapshot = { ...snapshot, version: nextVersion };
    const reviewDigest = createSourceImportReviewDigest(reviewedSnapshot, target, identityFindings);
    const reviewedAt = new Date().toISOString();
    this.#transaction(this.#authority, () => {
      const update = this.#authority.prepare(
        `UPDATE import_drafts
         SET state = 'reviewed', draft_version = ?, reviewed_title = ?, reviewed_target_choice_id = ?,
             reviewed_target_kind = ?, reviewed_existing_book_id = ?, reviewed_relationship = 'source-only',
             reviewed_book_state_digest = ?, reviewed_reuse_source_version_id = ?,
             review_digest = ?, reviewed_at = ?
         WHERE draft_id = ? AND state = 'staged' AND draft_version = ?`,
      ).run(
        nextVersion,
        target.kind === 'new-book' ? target.confirmedTitle : null,
        target.kind === 'new-book' ? target.choiceId : null,
        target.kind,
        target.kind === 'existing-book' ? target.bookId : null,
        target.kind === 'existing-book' ? target.bookStateDigest : null,
        target.reuseSourceVersionId,
        reviewDigest,
        reviewedAt,
        draftId,
        expectedDraftVersion,
      );
      requireStore(update.changes === 1, 'DRAFT_VERSION_CHANGED', '导入草稿在来源复核时已变化。');
    });
    return this.#sourceImportReviewProjection(
      {
        ...reviewedSnapshot,
        state: 'reviewed',
        reviewedTitle: target.kind === 'new-book' ? target.confirmedTitle : null,
        reviewedTargetChoiceId: target.kind === 'new-book' ? target.choiceId : null,
        reviewedTargetKind: target.kind,
        reviewedExistingBookId: target.kind === 'existing-book' ? target.bookId : null,
        reviewedRelationship: 'source-only',
        reviewedBookStateDigest: target.kind === 'existing-book' ? target.bookStateDigest : null,
        reviewedReuseSourceVersionId: target.reuseSourceVersionId,
        reviewDigest,
      },
      target,
      identityFindings,
      null,
    );
  }

  createManuscriptReimportPreparationWork(
    draftId: string,
    expectedDraftVersion: number,
    targetSelection: ManuscriptReimportTargetSelection,
  ): { workId: string; total: number } {
    this.#assertAvailable();
    requireStore(UUID_PATTERN.test(draftId), 'DRAFT_INVALID', '导入草稿标识无效。');
    this.#requireNoAbandonmentCleanupIntent(draftId);
    const snapshot = this.#loadDraftSnapshot(draftId);
    requireStore(snapshot.state === 'staged', 'DRAFT_STATE_CHANGED', '导入草稿状态已变化。');
    requireStore(snapshot.version === expectedDraftVersion, 'DRAFT_VERSION_CHANGED', '导入草稿版本已变化。');
    const binding = this.#reimportManuscriptBinding(targetSelection.bookId);
    requireStore(!Array.from(this.#reimportPreparationWork.values()).some((work) => work.draftId === draftId),
      'SERVICE_BUSY', '该重新导入草稿已有比较准备任务。');
    const checkpointStart = this.#boundedCall(() =>
      this.#boundedAuthority.createReimportCheckpointWork(binding.manuscriptId, binding.branchId));
    this.#authority.exec(
      `CREATE TEMP TABLE IF NOT EXISTS reimport_preparation_rows(
         work_id TEXT NOT NULL,
         mapping_id TEXT NOT NULL,
         position INTEGER NOT NULL,
         change_kind TEXT NOT NULL,
         current_block_id TEXT, current_revision_id TEXT, current_position INTEGER,
         lineage_block_id TEXT, lineage_revision_id TEXT, lineage_position INTEGER,
         staged_block_id TEXT, staged_draft_id TEXT, staged_position INTEGER,
         identity_consequence TEXT, resolved_changed INTEGER,
         current_kind TEXT, current_level INTEGER, current_text TEXT, current_digest TEXT,
         lineage_kind TEXT, lineage_level INTEGER, lineage_text TEXT, lineage_digest TEXT,
         staged_kind TEXT, staged_level INTEGER, staged_text TEXT, staged_digest TEXT,
         PRIMARY KEY(work_id, position)
       ) WITHOUT ROWID;
       CREATE TEMP TABLE IF NOT EXISTS reimport_preparation_occurrences(
         work_id TEXT NOT NULL,
         source_kind TEXT NOT NULL CHECK(source_kind IN ('staged', 'current', 'lineage')),
         kind TEXT NOT NULL,
         level_key INTEGER NOT NULL,
         digest TEXT NOT NULL,
         text TEXT NOT NULL,
         occurrences INTEGER NOT NULL CHECK(occurrences > 0),
         single_block_id TEXT NOT NULL,
         single_position INTEGER NOT NULL CHECK(single_position > 0),
         PRIMARY KEY(work_id, source_kind, kind, level_key, digest, text)
       ) WITHOUT ROWID;`,
    );
    if (checkpointStart.workId !== null) {
      this.#authority.exec(
        `CREATE UNIQUE INDEX IF NOT EXISTS temp.reimport_checkpoint_identity
           ON reimport_checkpoint_rows(work_id, block_id)`,
      );
    }
    const workId = randomUUID();
    const work: ReimportPreparationWork = {
      workId,
      draftId,
      expectedDraftVersion,
      targetSelection: structuredClone(targetSelection),
      snapshot,
      phase: checkpointStart.checkpoint === null ? 'checkpoint' : 'staged-occurrences',
      checkpointWorkId: checkpointStart.workId,
      checkpointCompleted: 0,
      target: null,
      comparisonId: null,
      comparisonHasher: null,
      batches: null,
      occurrenceCursor: 0,
      checkpointBlockCount: 0,
      totalUpperBound: snapshot.blockCount + checkpointStart.total,
      completed: 0,
      mappingCount: 0,
      unresolvedMappings: 0,
      changedMappings: 0,
    };
    if (checkpointStart.checkpoint !== null) {
      const target = this.#resolveReimportTarget(
        targetSelection, snapshot, checkpointStart.checkpoint, this.#identityFindings(snapshot));
      const checkpointBlockCount = asNumber(one(this.#authority.prepare(
        'SELECT count(*) total FROM manuscript_block_versions WHERE revision_id = ?',
      ).all(target.checkpoint.revisionId) as SqlRow[], 'REIMPORT_COMPARISON_INVALID', '无法核对当前固定点块数。').total);
      requireStore(checkpointBlockCount > 0, 'REIMPORT_COMPARISON_INVALID', '当前固定点没有稿件块。');
      this.#initializeReimportPreparationMapping(work, target, checkpointBlockCount);
    }
    this.#reimportPreparationWork.set(workId, work);
    return { workId, total: work.totalUpperBound };
  }

  #initializeReimportPreparationMapping(
    work: ReimportPreparationWork,
    target: ResolvedReimportTarget,
    checkpointBlockCount: number,
  ): void {
    const lineageBlockCount = target.lineage.status === 'verified'
      ? asNumber(one(this.#authority.prepare(
        `SELECT position FROM manuscript_block_versions
         WHERE revision_id = ? ORDER BY position DESC LIMIT 1`,
      ).all(target.lineage.revisionId) as SqlRow[], 'REIMPORT_LINEAGE_UNVERIFIED', '无法核对来源关系修订版块数。').position)
      : 0;
    work.phase = 'staged-occurrences';
    work.target = target;
    work.comparisonId = stableUuid(`ai7.reimport-comparison/1\u0000${work.draftId}`);
    work.comparisonHasher = createReimportComparisonHasher(work.draftId, target);
    work.batches = null;
    work.occurrenceCursor = 0;
    work.checkpointBlockCount = checkpointBlockCount;
    work.totalUpperBound = work.checkpointCompleted +
      (work.snapshot.blockCount * 2) + (checkpointBlockCount * 2) + lineageBlockCount;
  }

  #advanceReimportOccurrenceFacts(work: ReimportPreparationWork): number {
    requireStore(work.target !== null && work.phase !== 'checkpoint' && work.phase !== 'mapping',
      'REIMPORT_COMPARISON_INVALID', '重新导入唯一性准备状态无效。');
    const sourceKind = work.phase === 'staged-occurrences'
      ? 'staged'
      : work.phase === 'current-occurrences' ? 'current' : 'lineage';
    let rows: SqlRow[];
    if (sourceKind === 'staged') {
      rows = this.#authority.prepare(
        `SELECT staged_block_id block_id, position, kind, level, text, digest
         FROM staged_import_blocks
         WHERE draft_id = ? AND position > ? ORDER BY position LIMIT ${REIMPORT_MAPPING_BATCH_SIZE}`,
      ).all(work.draftId, work.occurrenceCursor) as SqlRow[];
    } else if (sourceKind === 'current' && work.checkpointWorkId !== null) {
      rows = this.#authority.prepare(
        `SELECT block_id, position, kind, level, text, digest
         FROM temp.reimport_checkpoint_rows
         WHERE work_id = ? AND position > ? ORDER BY position LIMIT ${REIMPORT_MAPPING_BATCH_SIZE}`,
      ).all(work.checkpointWorkId, work.occurrenceCursor) as SqlRow[];
    } else {
      const revisionId = sourceKind === 'current'
        ? work.target.checkpoint.revisionId
        : work.target.lineage.revisionId;
      if (revisionId === null) rows = [];
      else {
        rows = this.#authority.prepare(
          `SELECT block_id, position, kind, level, text, digest
           FROM manuscript_block_versions
           WHERE revision_id = ? AND position > ? ORDER BY position LIMIT ${REIMPORT_MAPPING_BATCH_SIZE}`,
        ).all(revisionId, work.occurrenceCursor) as SqlRow[];
      }
    }
    if (rows.length === 0) {
      work.occurrenceCursor = 0;
      if (work.phase === 'staged-occurrences') work.phase = 'current-occurrences';
      else if (work.phase === 'current-occurrences' && work.target.lineage.status === 'verified') {
        work.phase = 'lineage-occurrences';
      } else {
        work.phase = 'mapping';
        work.batches = this.#reimportMappingBatches(
          work.workId, work.draftId, work.target, work.checkpointWorkId);
      }
      return 0;
    }
    this.#transaction(this.#authority, () => {
      const upsert = this.#authority.prepare(
        `INSERT INTO temp.reimport_preparation_occurrences(
           work_id, source_kind, kind, level_key, digest, text,
           occurrences, single_block_id, single_position
         ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
         ON CONFLICT(work_id, source_kind, kind, level_key, digest, text)
         DO UPDATE SET occurrences = occurrences + 1`,
      );
      for (const row of rows) {
        upsert.run(
          work.workId,
          sourceKind,
          asString(row.kind),
          row.level === null ? -1 : asNumber(row.level),
          asString(row.digest),
          asString(row.text),
          asString(row.block_id),
          asNumber(row.position),
        );
      }
    });
    work.occurrenceCursor = asNumber(rows.at(-1)!.position);
    return rows.length;
  }

  advanceManuscriptReimportPreparationWork(workId: string): ReimportPreparationProgress {
    this.#assertAvailable();
    requireStore(UUID_PATTERN.test(workId), 'JOB_INVALID', '重新导入比较任务标识无效。');
    const work = this.#reimportPreparationWork.get(workId);
    requireStore(work !== undefined, 'JOB_NOT_FOUND', '重新导入比较任务不存在或已结束。');
    if (work.phase === 'checkpoint') {
      requireStore(work.checkpointWorkId !== null, 'REIMPORT_CHECKPOINT_INVALID', '重新导入固定点任务缺失。');
      const checkpoint = this.#boundedCall(() =>
        this.#boundedAuthority.advanceReimportCheckpointWork(work.checkpointWorkId!));
      work.checkpointCompleted = checkpoint.completed;
      if (!checkpoint.done) {
        return { done: false, completed: checkpoint.completed, total: work.totalUpperBound, review: null };
      }
      requireStore(checkpoint.checkpoint !== null, 'REIMPORT_CHECKPOINT_INVALID', '重新导入固定点未完成。');
      const target = this.#resolveReimportTarget(
        work.targetSelection, work.snapshot, checkpoint.checkpoint, this.#identityFindings(work.snapshot), true);
      const checkpointBlockCount = asNumber(one(this.#authority.prepare(
        'SELECT count(*) total FROM temp.reimport_checkpoint_rows WHERE work_id = ?',
      ).all(work.checkpointWorkId) as SqlRow[], 'REIMPORT_COMPARISON_INVALID', '无法核对当前固定点块数。').total);
      requireStore(checkpointBlockCount > 0, 'REIMPORT_COMPARISON_INVALID', '当前固定点没有稿件块。');
      this.#initializeReimportPreparationMapping(work, target, checkpointBlockCount);
      return { done: false, completed: checkpoint.total, total: work.totalUpperBound, review: null };
    }
    if (work.phase !== 'mapping') {
      work.completed += this.#advanceReimportOccurrenceFacts(work);
      return {
        done: false,
        completed: work.checkpointCompleted + work.completed,
        total: work.totalUpperBound,
        review: null,
      };
    }
    requireStore(work.batches !== null && work.target !== null && work.comparisonHasher !== null &&
      work.comparisonId !== null, 'REIMPORT_COMPARISON_INVALID', '重新导入比较任务状态不完整。');
    const step = work.batches.next();
    if (!step.done) {
      this.#transaction(this.#authority, () => {
        const insert = this.#authority.prepare(
          `INSERT INTO temp.reimport_preparation_rows(
             work_id, mapping_id, position, change_kind,
             current_block_id, current_revision_id, current_position,
             lineage_block_id, lineage_revision_id, lineage_position,
             staged_block_id, staged_draft_id, staged_position, identity_consequence, resolved_changed,
             current_kind, current_level, current_text, current_digest,
             lineage_kind, lineage_level, lineage_text, lineage_digest,
             staged_kind, staged_level, staged_text, staged_digest
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        );
        for (const mapping of step.value.mappings) {
          work.comparisonHasher!.update(mapping);
          const resolvedChanged = mapping.identityConsequence === 'preserve-current-identity'
            ? Number(mapping.current === null || mapping.staged === null ||
              mapping.current.position !== mapping.staged.position || mapping.current.kind !== mapping.staged.kind ||
              mapping.current.level !== mapping.staged.level || mapping.current.text !== mapping.staged.text ||
              mapping.current.digest !== mapping.staged.digest)
            : null;
          insert.run(
            workId, mapping.mappingId, mapping.position, mapping.changeKind,
            mapping.current?.blockId ?? null, mapping.current === null ? null : work.target!.checkpoint.revisionId,
            mapping.current?.position ?? null,
            mapping.lineage?.blockId ?? null, mapping.lineage === null ? null : work.target!.lineage.revisionId,
            mapping.lineage?.position ?? null,
            mapping.staged?.blockId ?? null, mapping.staged === null ? null : work.draftId,
            mapping.staged?.position ?? null, mapping.identityConsequence, resolvedChanged,
            mapping.current?.kind ?? null, mapping.current?.level ?? null, mapping.current?.text ?? null,
            mapping.current?.digest ?? null,
            mapping.lineage?.kind ?? null, mapping.lineage?.level ?? null, mapping.lineage?.text ?? null,
            mapping.lineage?.digest ?? null,
            mapping.staged?.kind ?? null, mapping.staged?.level ?? null, mapping.staged?.text ?? null,
            mapping.staged?.digest ?? null,
          );
          work.mappingCount += 1;
          if (mapping.identityConsequence === null) work.unresolvedMappings += 1;
          if (resolvedChanged === 1) work.changedMappings += 1;
        }
      });
      work.completed += step.value.scanned;
      return { done: false, completed: work.checkpointCompleted + work.completed, total: work.totalUpperBound, review: null };
    }

    requireStore(work.mappingCount > 0, 'REIMPORT_COMPARISON_INVALID', '重新导入比较没有内容块。');
    const snapshot = this.#loadDraftSnapshot(work.draftId);
    requireStore(snapshot.state === 'staged' && snapshot.version === work.expectedDraftVersion &&
      snapshot.sourceDigest === work.snapshot.sourceDigest && snapshot.contentDigest === work.snapshot.contentDigest &&
      snapshot.structureDigest === work.snapshot.structureDigest && snapshot.parserIdentity === work.snapshot.parserIdentity,
    'DRAFT_VERSION_CHANGED', '重新导入草稿在比较准备期间已变化。');
    const target = this.#resolveReimportTarget(
      work.targetSelection,
      snapshot,
      work.target.checkpoint,
      this.#identityFindings(snapshot),
      work.checkpointWorkId !== null,
    );
    requireStore(canonicalJson(target) === canonicalJson(work.target), 'REVIEW_CHANGED', '重新导入目标在比较准备期间已变化。');
    const comparisonDigest = work.comparisonHasher.digest();
    const nextVersion = work.expectedDraftVersion + 1;
    const resolutionDigest = emptyReimportResolutionDigest();
    const reviewDigest = createReimportReviewDigest(
      { ...snapshot, version: nextVersion }, target, comparisonDigest, resolutionDigest,
      degradationReview(this.#requireFidelityPlan(snapshot), false).state,
    );
    const reviewedAt = new Date().toISOString();
    const persistComparison = (): void => {
      this.#authority.prepare(
        `INSERT INTO manuscript_reimport_comparisons(
           comparison_id, draft_id, manuscript_id, branch_id, checkpoint_revision_id,
           checkpoint_revision_label, checkpoint_revision_digest, checkpoint_journal_sequence,
           checkpoint_created_for_dirty_journal,
           lineage_status, lineage_source_version_id, lineage_revision_id, lineage_revision_digest,
           comparison_kind, staged_source_digest, staged_content_digest, staged_structure_digest,
           staged_parser_identity, staged_block_count, checkpoint_block_count, total_mappings,
           unresolved_mappings, changed_mappings, comparison_digest, resolution_digest,
           degradation_accepted, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        work.comparisonId, work.draftId, target.manuscriptId, target.branchId,
        target.checkpoint.revisionId, target.checkpoint.revisionLabel, target.checkpoint.revisionDigest,
        target.checkpoint.journalSequence, target.checkpoint.createdForDirtyJournal ? 1 : 0,
        target.lineage.status, target.lineage.sourceVersionId, target.lineage.revisionId,
        target.lineage.status === 'verified'
          ? asString(one(this.#authority.prepare('SELECT revision_digest FROM manuscript_revisions WHERE revision_id = ?')
            .all(target.lineage.revisionId) as SqlRow[], 'REIMPORT_LINEAGE_UNVERIFIED', '来源修订版不存在。').revision_digest)
          : null,
        target.lineage.comparisonKind, snapshot.sourceDigest, snapshot.contentDigest, snapshot.structureDigest,
        snapshot.parserIdentity, snapshot.blockCount, work.checkpointBlockCount, work.mappingCount,
        work.unresolvedMappings, work.changedMappings, comparisonDigest, resolutionDigest, 0, reviewedAt,
      );
      const copied = this.#authority.prepare(
        `INSERT INTO manuscript_reimport_mappings(
           mapping_id, comparison_id, position, change_kind,
           current_block_id, current_revision_id, current_position,
           lineage_block_id, lineage_revision_id, lineage_position,
           staged_block_id, staged_draft_id, staged_position, identity_consequence, resolved_changed,
           current_kind, current_level, current_text, current_digest,
           lineage_kind, lineage_level, lineage_text, lineage_digest,
           staged_kind, staged_level, staged_text, staged_digest
         ) SELECT mapping_id, ?, position, change_kind,
                  current_block_id, current_revision_id, current_position,
                  lineage_block_id, lineage_revision_id, lineage_position,
                  staged_block_id, staged_draft_id, staged_position, identity_consequence, resolved_changed,
                  current_kind, current_level, current_text, current_digest,
                  lineage_kind, lineage_level, lineage_text, lineage_digest,
                  staged_kind, staged_level, staged_text, staged_digest
           FROM temp.reimport_preparation_rows WHERE work_id = ? ORDER BY position`,
      ).run(work.comparisonId, workId);
      requireStore(copied.changes === work.mappingCount, 'REIMPORT_COMPARISON_INVALID',
        '重新导入映射在持久化期间发生变化。');
      const update = this.#authority.prepare(
        `UPDATE import_drafts
         SET state = 'reviewed', draft_version = ?, reviewed_title = NULL,
             reviewed_target_choice_id = NULL, reviewed_target_kind = 'existing-book',
             reviewed_existing_book_id = ?, reviewed_relationship = 'reimport',
             reviewed_book_state_digest = ?, reviewed_reuse_source_version_id = ?,
             reviewed_lineage_status = ?, reviewed_lineage_source_version_id = ?,
             reviewed_checkpoint_revision_id = ?, reviewed_manuscript_id = ?, reviewed_branch_id = ?,
             review_digest = ?, reviewed_at = ?
         WHERE draft_id = ? AND state = 'staged' AND draft_version = ?`,
      ).run(
        nextVersion,
        target.bookId,
        target.bookStateDigest,
        target.reuseSourceVersionId,
        target.lineage.status,
        target.lineage.sourceVersionId,
        target.checkpoint.revisionId,
        target.manuscriptId,
        target.branchId,
        reviewDigest,
        reviewedAt,
        work.draftId,
        work.expectedDraftVersion,
      );
      requireStore(update.changes === 1, 'DRAFT_VERSION_CHANGED', '导入草稿在重新导入复核时已变化。');
      this.#authority.prepare('DELETE FROM temp.reimport_preparation_rows WHERE work_id = ?').run(workId);
      this.#authority.prepare('DELETE FROM temp.reimport_preparation_occurrences WHERE work_id = ?').run(workId);
      this.#assertForeignKeys(this.#authority);
    };
    if (work.checkpointWorkId === null) {
      this.#transaction(this.#authority, persistComparison);
    } else {
      this.#boundedCall(() =>
        this.#boundedAuthority.finalizeReimportCheckpointWork(work.checkpointWorkId!, persistComparison));
    }
    this.#reimportPreparationWork.delete(workId);
    const review = this.#reimportReviewProjection(this.#loadDraftSnapshot(work.draftId), target, null);
    return { done: true, completed: work.totalUpperBound, total: work.totalUpperBound, review };
  }

  cancelManuscriptReimportPreparationWork(workId: string): boolean {
    this.#assertAvailable();
    requireStore(UUID_PATTERN.test(workId), 'JOB_INVALID', '重新导入比较任务标识无效。');
    const work = this.#reimportPreparationWork.get(workId);
    if (work === undefined) return false;
    if (work.checkpointWorkId !== null) {
      this.#boundedCall(() => this.#boundedAuthority.cancelReimportCheckpointWork(work.checkpointWorkId!));
    }
    this.#reimportPreparationWork.delete(workId);
    this.#authority.prepare('DELETE FROM temp.reimport_preparation_rows WHERE work_id = ?').run(workId);
    this.#authority.prepare('DELETE FROM temp.reimport_preparation_occurrences WHERE work_id = ?').run(workId);
    return true;
  }

  getReimportMappingPage(
    draftId: string,
    expectedDraftVersion: number,
    after: number | null,
  ): ReimportMappingPageProjection {
    this.#assertAvailable();
    requireStore(UUID_PATTERN.test(draftId) && (after === null || (Number.isSafeInteger(after) && after >= 0)),
      'REIMPORT_MAPPING_INVALID', '重新导入映射分页参数无效。');
    const snapshot = this.#loadDraftSnapshot(draftId);
    requireStore(snapshot.state === 'reviewed' && snapshot.reviewedRelationship === 'reimport' &&
      snapshot.version === expectedDraftVersion && snapshot.reviewDigest !== null,
    'DRAFT_VERSION_CHANGED', '重新导入复核已变化。');
    const comparison = one(this.#authority.prepare(
      'SELECT comparison_id FROM manuscript_reimport_comparisons WHERE draft_id = ?',
    ).all(draftId) as SqlRow[], 'REIMPORT_COMPARISON_INVALID', '重新导入比较不存在。');
    const rows = this.#authority.prepare(
      `SELECT m.*, r.resolution, r.resolved_current_block_id,
              claimed.mapping_id claimed_mapping_id,
              claimed.resolved_current_block_id claimed_current_block_id
       FROM manuscript_reimport_mappings m
       LEFT JOIN manuscript_reimport_mapping_resolutions r ON r.mapping_id = m.mapping_id
       LEFT JOIN manuscript_reimport_mapping_resolutions claimed
         ON claimed.comparison_id = m.comparison_id
        AND claimed.resolved_current_block_id = m.current_block_id
       WHERE m.comparison_id = ? AND m.position > ? ORDER BY m.position LIMIT ${REIMPORT_MAPPING_PAGE_SIZE + 1}`,
    ).all(asString(comparison.comparison_id), after ?? 0) as SqlRow[];
    const page = rows.slice(0, REIMPORT_MAPPING_PAGE_SIZE);
    requireStore(
      REIMPORT_MAPPING_PAGE_SIZE * 3 * REIMPORT_MAX_JSON_BLOCK_BYTES <=
        MAX_FRAME_BYTES - REIMPORT_WIRE_HEADROOM_BYTES,
      'REIMPORT_MAPPING_INVALID',
      '重新导入完整块比较页无法满足服务帧上限。',
    );
    const projection: ReimportMappingPageProjection = {
      draftId,
      draftVersion: snapshot.version,
      reviewDigest: snapshot.reviewDigest,
      items: page.map((row) => {
        return {
          mappingId: asString(row.mapping_id),
          position: asNumber(row.position),
          changeKind: asString(row.change_kind) as 'unchanged' | 'move' | 'edit' | 'insert' | 'delete',
          currentBlockId: row.current_block_id === null ? null : asString(row.current_block_id),
          lineageBlockId: row.lineage_block_id === null ? null : asString(row.lineage_block_id),
          stagedBlockId: row.staged_block_id === null ? null : asString(row.staged_block_id),
          currentText: row.current_text === null ? null : asString(row.current_text),
          lineageText: row.lineage_text === null ? null : asString(row.lineage_text),
          stagedText: row.staged_text === null ? null : asString(row.staged_text),
          state: row.identity_consequence === 'preserve-current-identity' || row.resolution !== null ||
            row.claimed_mapping_id !== null
            ? 'resolved' as const
            : 'unresolved' as const,
          identityConsequence: row.identity_consequence === null
            ? row.resolution === null
              ? row.claimed_mapping_id === null ? null : 'preserve-current-identity' as const
              : asString(row.resolution) as
                'preserve-current-identity' | 'create-new-identity' | 'retire-current-identity'
            : 'preserve-current-identity' as const,
          resolution: row.resolution === null
            ? null
            : asString(row.resolution) as
              'preserve-current-identity' | 'create-new-identity' | 'retire-current-identity',
          resolvedCurrentBlockId: row.resolved_current_block_id === null
            ? row.claimed_current_block_id === null ? null : asString(row.claimed_current_block_id)
            : asString(row.resolved_current_block_id),
        };
      }),
      previousCursor: after === null || after <= REIMPORT_MAPPING_PAGE_SIZE
        ? null
        : after - REIMPORT_MAPPING_PAGE_SIZE,
      nextCursor: rows.length > REIMPORT_MAPPING_PAGE_SIZE ? asNumber(page.at(-1)!.position) : null,
    };
    requireStore(Buffer.byteLength(JSON.stringify(projection), 'utf8') <=
      MAX_FRAME_BYTES - REIMPORT_WIRE_HEADROOM_BYTES,
      'REIMPORT_MAPPING_INVALID', '重新导入映射页超出有界服务帧。');
    return projection;
  }

  acceptReimportDegradation(
    draftId: string,
    expectedDraftVersion: number,
  ): ReviewBeforeManuscriptReimportProjection {
    this.#assertAvailable();
    requireStore(UUID_PATTERN.test(draftId), 'DRAFT_INVALID', '导入草稿标识无效。');
    const snapshot = this.#loadDraftSnapshot(draftId);
    requireStore(snapshot.state === 'reviewed' && snapshot.reviewedRelationship === 'reimport' &&
      snapshot.version === expectedDraftVersion, 'DRAFT_VERSION_CHANGED', '重新导入复核已变化。');
    const target = this.#reconstructReviewedReimportTarget(snapshot);
    requireStore(target !== null, 'REVIEW_CHANGED', '重新导入复核无法由当前权威状态重建。');
    const plan = this.#requireFidelityPlan(snapshot);
    requireStore(plan.degradations.length > 0, 'DEGRADATION_ACCEPTANCE_INVALID', '本次重新导入不需要降级接受。');
    const evidence = this.#reimportEvidence(draftId);
    const nextVersion = expectedDraftVersion + 1;
    const nextSnapshot = { ...snapshot, version: nextVersion };
    const reviewDigest = createReimportReviewDigest(
      nextSnapshot, target, evidence.comparisonDigest, evidence.resolutionDigest, 'accepted-complete-set',
    );
    this.#transaction(this.#authority, () => {
      requireStore(this.#authority.prepare(
        `UPDATE manuscript_reimport_comparisons SET degradation_accepted = 1
         WHERE draft_id = ? AND degradation_accepted = 0`,
      ).run(draftId).changes === 1, 'DEGRADATION_ACCEPTANCE_INVALID', '重新导入降级接受状态已变化。');
      requireStore(this.#authority.prepare(
        `UPDATE import_drafts SET draft_version = ?, review_digest = ?, reviewed_at = ?
         WHERE draft_id = ? AND state = 'reviewed' AND reviewed_relationship = 'reimport'
           AND draft_version = ?`,
      ).run(nextVersion, reviewDigest, new Date().toISOString(), draftId, expectedDraftVersion).changes === 1,
      'DRAFT_VERSION_CHANGED', '重新导入降级接受期间复核已变化。');
      this.#authority.prepare("DELETE FROM import_commit_attempts WHERE draft_id = ? AND state = 'prepared'").run(draftId);
    });
    const refreshed = this.#loadDraftSnapshot(draftId);
    const refreshedTarget = this.#reconstructReviewedReimportTarget(refreshed);
    requireStore(refreshedTarget !== null, 'REVIEW_CHANGED', '重新导入复核无法重建。');
    return this.#reimportReviewProjection(refreshed, refreshedTarget, null);
  }

  getReimportIdentityCandidatePage(
    draftId: string,
    expectedDraftVersion: number,
    mappingId: string,
    after: number | null,
  ): ReimportIdentityCandidatePageProjection {
    this.#assertAvailable();
    requireStore(UUID_PATTERN.test(draftId) && UUID_PATTERN.test(mappingId) &&
      (after === null || (Number.isSafeInteger(after) && after >= 0)),
    'REIMPORT_MAPPING_INVALID', '结构身份候选分页参数无效。');
    const snapshot = this.#loadDraftSnapshot(draftId);
    requireStore(snapshot.state === 'reviewed' && snapshot.reviewedRelationship === 'reimport' &&
      snapshot.version === expectedDraftVersion, 'DRAFT_VERSION_CHANGED', '重新导入复核已变化。');
    const mapping = one(this.#authority.prepare(
      `SELECT m.comparison_id, m.change_kind, m.current_block_id, m.current_position,
              m.current_kind, m.current_level, m.current_text, m.current_digest
       FROM manuscript_reimport_mappings m
       JOIN manuscript_reimport_comparisons c ON c.comparison_id = m.comparison_id
       WHERE c.draft_id = ? AND m.mapping_id = ?`,
    ).all(draftId, mappingId) as SqlRow[], 'REIMPORT_MAPPING_INVALID', '重新导入映射不存在。');
    const comparisonId = asString(mapping.comparison_id);
    const changeKind = asString(mapping.change_kind);
    requireStore(changeKind === 'insert' || changeKind === 'edit',
      'REIMPORT_MAPPING_INVALID', '该映射不需要选择保留的当前结构身份。');
    const rows = changeKind === 'edit'
      ? (after === null || after < asNumber(mapping.current_position)
          ? [mapping]
          : [])
      : this.#authority.prepare(
        `SELECT d.current_block_id, d.current_position, d.current_kind, d.current_level,
                d.current_text, d.current_digest
         FROM manuscript_reimport_mappings d
         LEFT JOIN manuscript_reimport_mapping_resolutions own ON own.mapping_id = d.mapping_id
         LEFT JOIN manuscript_reimport_mapping_resolutions claimed
           ON claimed.comparison_id = d.comparison_id
          AND claimed.resolved_current_block_id = d.current_block_id
         WHERE d.comparison_id = ? AND d.change_kind = 'delete' AND d.current_position > ?
           AND own.mapping_id IS NULL AND claimed.mapping_id IS NULL
         ORDER BY d.current_position LIMIT ${REIMPORT_IDENTITY_CANDIDATE_PAGE_SIZE + 1}`,
    ).all(comparisonId, after ?? 0) as SqlRow[];
    const page = rows.slice(0, REIMPORT_IDENTITY_CANDIDATE_PAGE_SIZE);
    requireStore(
      REIMPORT_IDENTITY_CANDIDATE_PAGE_SIZE * REIMPORT_MAX_JSON_BLOCK_BYTES <=
        MAX_FRAME_BYTES - REIMPORT_WIRE_HEADROOM_BYTES,
      'REIMPORT_MAPPING_INVALID',
      '结构身份完整块候选页无法满足服务帧上限。',
    );
    const projection: ReimportIdentityCandidatePageProjection = {
      draftId,
      draftVersion: snapshot.version,
      mappingId,
      items: page.map((row) => {
        return {
          currentBlockId: asString(row.current_block_id),
          position: asNumber(row.current_position),
          kind: asString(row.current_kind) as ManuscriptBlockProjection['kind'],
          level: row.current_level === null ? null : asNumber(row.current_level),
          text: asString(row.current_text),
          digest: asString(row.current_digest),
        };
      }),
      previousCursor: null,
      nextCursor: rows.length > REIMPORT_IDENTITY_CANDIDATE_PAGE_SIZE
        ? asNumber(page.at(-1)!.current_position)
        : null,
    };
    requireStore(Buffer.byteLength(JSON.stringify(projection), 'utf8') <=
      MAX_FRAME_BYTES - REIMPORT_WIRE_HEADROOM_BYTES,
      'REIMPORT_MAPPING_INVALID', '结构身份候选页超出有界服务帧。');
    return projection;
  }

  createReimportResolutionWork(
    draftId: string,
    expectedDraftVersion: number,
    mappingId: string,
    resolution: 'preserve-current-identity' | 'create-new-identity' | 'retire-current-identity',
    currentBlockId: string | null,
  ): { workId: string; total: number } {
    this.#assertAvailable();
    requireStore(UUID_PATTERN.test(draftId) && UUID_PATTERN.test(mappingId) &&
      ['preserve-current-identity', 'create-new-identity', 'retire-current-identity'].includes(resolution) &&
      (currentBlockId === null || /^blk_[0-9a-f]{24}$/.test(currentBlockId)),
      'REIMPORT_MAPPING_INVALID', '重新导入映射解决参数无效。');
    const snapshot = this.#loadDraftSnapshot(draftId);
    requireStore(snapshot.state === 'reviewed' && snapshot.reviewedRelationship === 'reimport' &&
      snapshot.version === expectedDraftVersion, 'DRAFT_VERSION_CHANGED', '重新导入复核已变化。');
    const target = this.#reconstructReviewedReimportTarget(snapshot);
    requireStore(target !== null, 'REVIEW_CHANGED', '重新导入复核无法由当前权威状态重建。');
    const mapping = one(this.#authority.prepare(
      `SELECT m.comparison_id, m.change_kind, m.current_block_id, c.degradation_accepted
       FROM manuscript_reimport_mappings m
       JOIN manuscript_reimport_comparisons c ON c.comparison_id = m.comparison_id
       WHERE c.draft_id = ? AND m.mapping_id = ?`,
    ).all(draftId, mappingId) as SqlRow[], 'REIMPORT_MAPPING_INVALID', '重新导入映射不存在。');
    requireStore(
      ((asString(mapping.change_kind) === 'insert' || asString(mapping.change_kind) === 'edit') &&
        resolution === 'create-new-identity' && currentBlockId === null) ||
        ((asString(mapping.change_kind) === 'insert' || asString(mapping.change_kind) === 'edit') &&
          resolution === 'preserve-current-identity' && currentBlockId !== null) ||
        (asString(mapping.change_kind) === 'delete' && resolution === 'retire-current-identity'),
      'REIMPORT_MAPPING_INVALID',
      '结构身份后果与该映射不相容。',
    );
    requireStore(!Array.from(this.#reimportResolutionWork.values()).some((work) => work.draftId === draftId),
      'SERVICE_BUSY', '该重新导入复核已有结构身份解决任务。');
    if (resolution === 'preserve-current-identity') {
      if (asString(mapping.change_kind) === 'edit') {
        requireStore(mapping.current_block_id !== null && asString(mapping.current_block_id) === currentBlockId,
          'REIMPORT_MAPPING_INVALID', '该编辑映射的当前结构身份候选已变化。');
      } else {
        const candidate = this.#authority.prepare(
          `SELECT d.mapping_id
           FROM manuscript_reimport_mappings d
           LEFT JOIN manuscript_reimport_mapping_resolutions own ON own.mapping_id = d.mapping_id
           LEFT JOIN manuscript_reimport_mapping_resolutions claimed
             ON claimed.comparison_id = d.comparison_id AND claimed.resolved_current_block_id = d.current_block_id
           WHERE d.comparison_id = ? AND d.change_kind = 'delete' AND d.current_block_id = ?
             AND own.mapping_id IS NULL AND claimed.mapping_id IS NULL`,
        ).get(asString(mapping.comparison_id), currentBlockId) as SqlRow | undefined;
        requireStore(candidate !== undefined, 'REIMPORT_MAPPING_INVALID', '所选当前结构身份已被占用或不再可用。');
      }
    }
    const totalMappings = asNumber(one(this.#authority.prepare(
      'SELECT total_mappings FROM manuscript_reimport_comparisons WHERE comparison_id = ?',
    ).all(asString(mapping.comparison_id)) as SqlRow[], 'REIMPORT_COMPARISON_INVALID', '重新导入比较不存在。').total_mappings);
    const workId = randomUUID();
    this.#reimportResolutionWork.set(workId, {
      workId, draftId, expectedDraftVersion, mappingId, resolution, currentBlockId,
      snapshot, target, comparisonId: asString(mapping.comparison_id),
      degradationAccepted: asNumber(mapping.degradation_accepted) === 1,
      totalMappings, resolutionHasher: createReimportResolutionHasher(), completed: 0,
    });
    return { workId, total: totalMappings };
  }

  advanceReimportResolutionWork(workId: string): ReimportResolutionProgress {
    this.#assertAvailable();
    requireStore(UUID_PATTERN.test(workId), 'JOB_INVALID', '结构身份解决任务标识无效。');
    const work = this.#reimportResolutionWork.get(workId);
    requireStore(work !== undefined, 'JOB_NOT_FOUND', '结构身份解决任务不存在或已结束。');
    const rows = this.#authority.prepare(
      `SELECT m.mapping_id, m.position, r.resolution, r.resolved_current_block_id
       FROM manuscript_reimport_mappings m
       LEFT JOIN manuscript_reimport_mapping_resolutions r ON r.mapping_id = m.mapping_id
       WHERE m.comparison_id = ? AND m.position > ? ORDER BY m.position LIMIT ${REIMPORT_MAPPING_BATCH_SIZE}`,
    ).all(work.comparisonId, work.completed) as SqlRow[];
    if (rows.length > 0) {
      for (const row of rows) {
        const mappingId = asString(row.mapping_id);
        if (mappingId === work.mappingId) {
          requireStore(row.resolution === null, 'REIMPORT_MAPPING_INVALID', '该结构身份映射已经解决。');
          work.resolutionHasher.update(mappingId, work.resolution, work.currentBlockId);
        } else if (row.resolution !== null) {
          work.resolutionHasher.update(
            mappingId,
            asString(row.resolution) as ReimportResolutionWork['resolution'],
            row.resolved_current_block_id === null ? null : asString(row.resolved_current_block_id),
          );
        }
        work.completed = asNumber(row.position);
      }
      return { done: false, completed: work.completed, total: work.totalMappings, review: null };
    }
    requireStore(work.completed === work.totalMappings, 'REIMPORT_COMPARISON_INVALID',
      '结构身份解决扫描未覆盖完整比较。');
    const snapshot = this.#loadDraftSnapshot(work.draftId);
    requireStore(snapshot.state === 'reviewed' && snapshot.reviewedRelationship === 'reimport' &&
      snapshot.version === work.expectedDraftVersion && snapshot.reviewDigest === work.snapshot.reviewDigest,
    'DRAFT_VERSION_CHANGED', '重新导入复核在结构身份解决期间已变化。');
    const target = this.#reconstructReviewedReimportTarget(snapshot);
    requireStore(target !== null && canonicalJson(target) === canonicalJson(work.target),
      'REVIEW_CHANGED', '重新导入目标在结构身份解决期间已变化。');
    const mapping = one(this.#authority.prepare(
      `SELECT m.*, c.comparison_digest, c.unresolved_mappings, c.changed_mappings
       FROM manuscript_reimport_mappings m
       JOIN manuscript_reimport_comparisons c ON c.comparison_id = m.comparison_id
       LEFT JOIN manuscript_reimport_mapping_resolutions r ON r.mapping_id = m.mapping_id
       WHERE m.comparison_id = ? AND m.mapping_id = ? AND r.mapping_id IS NULL`,
    ).all(work.comparisonId, work.mappingId) as SqlRow[], 'REIMPORT_MAPPING_INVALID',
    '结构身份映射已变化或已解决。');
    let claimedMapping: SqlRow | null = null;
    if (work.resolution === 'preserve-current-identity') {
      if (asString(mapping.change_kind) === 'edit') {
        requireStore(mapping.current_block_id !== null && asString(mapping.current_block_id) === work.currentBlockId,
          'REIMPORT_MAPPING_INVALID', '该编辑映射的当前结构身份候选已变化。');
      } else {
        const candidate = this.#authority.prepare(
          `SELECT d.mapping_id, d.current_position, d.current_kind, d.current_level,
                  d.current_text, d.current_digest
           FROM manuscript_reimport_mappings d
           LEFT JOIN manuscript_reimport_mapping_resolutions own ON own.mapping_id = d.mapping_id
           LEFT JOIN manuscript_reimport_mapping_resolutions claimed
             ON claimed.comparison_id = d.comparison_id AND claimed.resolved_current_block_id = d.current_block_id
           WHERE d.comparison_id = ? AND d.change_kind = 'delete' AND d.current_block_id = ?
             AND own.mapping_id IS NULL AND claimed.mapping_id IS NULL`,
        ).get(work.comparisonId, work.currentBlockId) as SqlRow | undefined;
        requireStore(candidate !== undefined, 'REIMPORT_MAPPING_INVALID', '所选当前结构身份已被占用或不再可用。');
        claimedMapping = candidate;
      }
    }
    const identitySource = claimedMapping ?? mapping;
    const resolvedChanged = work.resolution === 'retire-current-identity' || work.resolution === 'create-new-identity'
      ? 1
      : Number(
          identitySource.current_position === null ||
          asNumber(identitySource.current_position) !== asNumber(mapping.staged_position) ||
          asString(identitySource.current_kind) !== asString(mapping.staged_kind) ||
          (identitySource.current_level === null ? null : asNumber(identitySource.current_level)) !==
            (mapping.staged_level === null ? null : asNumber(mapping.staged_level)) ||
          asString(identitySource.current_text) !== asString(mapping.staged_text) ||
          asString(identitySource.current_digest) !== asString(mapping.staged_digest),
        );
    const resolutionDigest = work.resolutionHasher.digest();
    const nextVersion = work.expectedDraftVersion + 1;
    const reviewDigest = createReimportReviewDigest(
      { ...snapshot, version: nextVersion }, target, asString(mapping.comparison_digest), resolutionDigest,
      degradationReview(this.#requireFidelityPlan(snapshot), work.degradationAccepted).state,
    );
    this.#transaction(this.#authority, () => {
      requireStore(this.#authority.prepare(
        `INSERT INTO manuscript_reimport_mapping_resolutions(
           mapping_id, comparison_id, resolution, resolved_current_block_id, resolved_at
         ) VALUES (?, ?, ?, ?, ?)`,
      ).run(work.mappingId, work.comparisonId, work.resolution, work.currentBlockId, new Date().toISOString()).changes === 1,
      'REIMPORT_MAPPING_INVALID', '结构身份解决无法持久化。');
      requireStore(this.#authority.prepare(
        'UPDATE manuscript_reimport_mappings SET resolved_changed = ? WHERE mapping_id = ? AND resolved_changed IS NULL',
      ).run(resolvedChanged, work.mappingId).changes === 1, 'REIMPORT_MAPPING_INVALID', '结构身份结果已变化。');
      if (claimedMapping !== null) {
        requireStore(this.#authority.prepare(
          'UPDATE manuscript_reimport_mappings SET resolved_changed = 0 WHERE mapping_id = ? AND resolved_changed IS NULL',
        ).run(asString(claimedMapping.mapping_id)).changes === 1, 'REIMPORT_MAPPING_INVALID', '当前结构身份候选已变化。');
      }
      requireStore(this.#authority.prepare(
        `UPDATE manuscript_reimport_comparisons
         SET unresolved_mappings = unresolved_mappings - ?, changed_mappings = changed_mappings + ?,
             resolution_digest = ?
         WHERE comparison_id = ? AND unresolved_mappings >= ?`,
      ).run(claimedMapping === null ? 1 : 2, resolvedChanged, resolutionDigest, work.comparisonId,
        claimedMapping === null ? 1 : 2).changes === 1,
      'REIMPORT_COMPARISON_INVALID', '重新导入比较聚合状态已变化。');
      requireStore(this.#authority.prepare(
        `UPDATE import_drafts SET draft_version = ?, review_digest = ?, reviewed_at = ?
         WHERE draft_id = ? AND state = 'reviewed' AND reviewed_relationship = 'reimport' AND draft_version = ?`,
      ).run(nextVersion, reviewDigest, new Date().toISOString(), work.draftId, work.expectedDraftVersion).changes === 1,
      'DRAFT_VERSION_CHANGED', '重新导入映射解决期间复核已变化。');
      this.#authority.prepare("DELETE FROM import_commit_attempts WHERE draft_id = ? AND state = 'prepared'").run(work.draftId);
    });
    this.#reimportResolutionWork.delete(workId);
    const refreshed = this.#loadDraftSnapshot(work.draftId);
    const refreshedTarget = this.#reconstructReviewedReimportTarget(refreshed);
    requireStore(refreshedTarget !== null, 'REVIEW_CHANGED', '重新导入复核无法重建。');
    return {
      done: true,
      completed: work.totalMappings,
      total: work.totalMappings,
      review: this.#reimportReviewProjection(refreshed, refreshedTarget, null),
    };
  }

  cancelReimportResolutionWork(workId: string): boolean {
    this.#assertAvailable();
    requireStore(UUID_PATTERN.test(workId), 'JOB_INVALID', '结构身份解决任务标识无效。');
    return this.#reimportResolutionWork.delete(workId);
  }

  async commitNewBookImport(
    input: {
      draftId: string;
      expectedDraftVersion: number;
      reviewDigest: string;
      commitId: string;
    },
    options: { interruptAfterAttempt?: boolean } = {},
  ): Promise<ManuscriptImportCommitProjection> {
    this.#assertAvailable();
    requireStore(UUID_PATTERN.test(input.draftId) && UUID_PATTERN.test(input.commitId), 'COMMIT_INVALID', '导入提交标识无效。');
    requireStore(/^[0-9a-f]{64}$/.test(input.reviewDigest), 'COMMIT_INVALID', '导入复核摘要无效。');
    this.#requireNoAbandonmentCleanupIntent(input.draftId);
    const requestFingerprint = commitRequestFingerprint('manuscript-import', input);
    const existingAttempt = this.#loadCommitAttemptForDraft(input.draftId);
    if (existingAttempt) {
      requireStore(
        existingAttempt.attemptId === input.commitId &&
          existingAttempt.operationKind === 'manuscript-import' &&
          existingAttempt.requestFingerprint === requestFingerprint &&
          existingAttempt.expectedDraftVersion === input.expectedDraftVersion &&
          existingAttempt.reviewDigest === input.reviewDigest,
        'IDEMPOTENCY_CONFLICT',
        '该导入草稿已绑定另一项持久提交尝试。',
      );
      const reconciliation = await this.#reconcileCommitAttempt(existingAttempt);
      if (reconciliation.state === 'committed') {
        requireStore(reconciliation.result.completionLabel === '稿件已导入', 'IDEMPOTENCY_CONFLICT', '提交类型与稿件导入不一致。');
        return reconciliation.result;
      }
      requireStore(reconciliation.state === 'uncommitted', 'IMPORT_COMMIT_OUTCOME_UNCERTAIN', '导入提交结果待确认。');
    }

    const snapshotBeforeAttempt = this.#loadDraftSnapshot(input.draftId);
    requireStore(snapshotBeforeAttempt.state === 'reviewed', 'DRAFT_NOT_REVIEWED', '导入草稿尚未完成复核。');
    requireStore(snapshotBeforeAttempt.version === input.expectedDraftVersion, 'DRAFT_VERSION_CHANGED', '导入草稿版本已变化。');
    requireStore(snapshotBeforeAttempt.reviewDigest === input.reviewDigest, 'REVIEW_CHANGED', '导入前复核摘要已变化。');
    const revalidated = await this.#revalidateSnapshot(snapshotBeforeAttempt);
    requireStore(!revalidated.parserDrift, 'REVIEW_CHANGED', '解析器状态已变化，请重新复核导入。');
    const snapshotForAttempt = revalidated.snapshot;
    const planForAttempt = this.#requireFidelityPlan(snapshotForAttempt);
    const identityFindingsForAttempt = this.#identityFindings(snapshotForAttempt);
    const targetForAttempt = this.#reconstructReviewedImportTarget(
      snapshotForAttempt,
      planForAttempt,
      identityFindingsForAttempt,
    );
    requireStore(targetForAttempt !== null, 'REVIEW_CHANGED', '导入前复核摘要无法由当前权威状态重建。');
    if (!existingAttempt) {
      const preparedAt = new Date().toISOString();
      this.#transaction(this.#authority, () => {
        this.#authority
          .prepare(
            `INSERT INTO import_commit_attempts(
               attempt_id, draft_id, request_fingerprint, expected_draft_version, review_digest,
               operation_kind, state, prepared_at
             ) VALUES (?, ?, ?, ?, ?, 'manuscript-import', 'prepared', ?)`,
          )
          .run(
            input.commitId,
            input.draftId,
            requestFingerprint,
            input.expectedDraftVersion,
            input.reviewDigest,
            preparedAt,
          );
      });
    }
    if (options.interruptAfterAttempt) {
      throw new StoreFatalError(new Error('E2E interruption after durable import attempt preparation.'));
    }
    let result: Omit<ManuscriptImportCommitProjection, 'firstWindow'> | undefined;

    this.#transaction(this.#authority, () => {
      const existing = this.#authority.prepare(
        'SELECT request_fingerprint, operation_kind, result_json FROM import_commits WHERE commit_id = ?',
      ).all(input.commitId) as SqlRow[];
      if (existing.length === 1) {
        requireStore(
          asString(existing[0]!.request_fingerprint) === requestFingerprint &&
            asString(existing[0]!.operation_kind) === 'manuscript-import',
          'IDEMPOTENCY_CONFLICT',
          '提交标识已用于另一项导入。',
        );
        const storedResult = parseStoredJson(asString(existing[0]!.result_json), '导入提交结果记录无效。');
        requireStore(storedResult !== null && typeof storedResult === 'object' && !Array.isArray(storedResult), 'STORE_CORRUPT', '导入提交结果记录无效。');
        const stored = this.#loadStoredCommitResult(input.commitId);
        requireStore(stored.completionLabel === '稿件已导入', 'IDEMPOTENCY_CONFLICT', '提交类型与稿件导入不一致。');
        result = stored;
        return;
      }

      const snapshot = this.#loadDraftSnapshot(input.draftId);
      requireStore(snapshot.state === 'reviewed', 'DRAFT_NOT_REVIEWED', '导入草稿尚未完成复核。');
      requireStore(snapshot.version === input.expectedDraftVersion, 'DRAFT_VERSION_CHANGED', '导入草稿版本已变化。');
      requireStore(snapshot.reviewDigest === input.reviewDigest, 'REVIEW_CHANGED', '导入前复核摘要已变化。');
      const plan = this.#requireFidelityPlan(snapshot);
      const identityFindings = this.#identityFindings(snapshot);
      const target = this.#reconstructReviewedImportTarget(snapshot, plan, identityFindings);
      requireStore(target !== null, 'REVIEW_CHANGED', '导入前复核摘要无法由当前权威状态重建。');
      this.#boundedCall(() => this.#boundedAuthority.assertStagedDraftIntegrity(input.draftId));

      const now = new Date().toISOString();
      const bookId = target.kind === 'existing-book' ? target.bookId : randomUUID();
      const dimensionSetId = target.kind === 'existing-book' ? target.dimensionSetId : randomUUID();
      const sourceVersionId = randomUUID();
      const provenanceId = randomUUID();
      const fidelityReviewId = randomUUID();
      const degradationDecisionId = plan.degradations.length > 0 ? randomUUID() : null;
      const manuscriptId = randomUUID();
      const branchId = randomUUID();
      const revisionId = randomUUID();
      const workflowInstanceId = randomUUID();
      const importRecordId = randomUUID();
      const revisionDigest = sha256(
        canonicalJson({
          schema: 'ai7.manuscript-revision/2',
          manuscriptId,
          parserIdentity: snapshot.parserIdentity,
          contentDigest: snapshot.contentDigest,
          structureDigest: snapshot.structureDigest,
          blockCount: snapshot.blockCount,
          characterCount: snapshot.characterCount,
        }),
      );
      const workingDigest = revisionDigest;

      if (target.kind === 'new-book') {
        this.#authority.prepare(
          'INSERT INTO books(book_id, stable_identity, title, created_at, internal_number) VALUES (?, ?, ?, ?, NULL)',
        ).run(bookId, `book:${bookId}`, target.confirmedTitle, now);
        this.#insertBookDimensionSet(dimensionSetId, bookId, now);
      } else {
        const revalidatedTarget = this.#emptyBookImportTarget(target.bookId);
        requireStore(
          revalidatedTarget.bookStateDigest === target.bookStateDigest &&
            revalidatedTarget.dimensionSetId === target.dimensionSetId,
          'REVIEW_CHANGED',
          '所选图书身份、维度集或稿件状态已变化。',
        );
      }
      this.#authority
        .prepare(
          `INSERT INTO source_versions(
             source_version_id, book_id, object_digest, source_digest, content_digest, structure_digest,
             parser_identity, format, display_name, created_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, 'DOCX', ?, ?)`,
        )
        .run(
          sourceVersionId,
          bookId,
          snapshot.objectDigest,
          snapshot.sourceDigest,
          snapshot.contentDigest,
          snapshot.structureDigest,
          snapshot.parserIdentity,
          snapshot.displayName,
          now,
        );
      this.#authority
        .prepare(
          `INSERT INTO source_provenance(
             provenance_id, source_version_id, acquisition_path, locality, sanitized_identity, parser_identity, recorded_at
           ) VALUES (?, ?, 'native-file-picker', 'local-provider-free', ?, ?, ?)`,
        )
        .run(provenanceId, sourceVersionId, snapshot.displayName, snapshot.parserIdentity, now);
      this.#authority
        .prepare(
          `INSERT INTO import_fidelity_reviews(
             fidelity_review_id, book_id, source_version_id, review_digest, outcome, round_trip_guaranteed, created_at
           ) VALUES (?, ?, ?, ?, ?, 0, ?)`,
        )
        .run(fidelityReviewId, bookId, sourceVersionId, input.reviewDigest, plan.outcome, now);
      const insertFidelity = this.#authority.prepare(
        `INSERT INTO import_fidelity_categories(
           fidelity_review_id, category_key, display_label, item_count, status, detail, position
         ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      );
      snapshot.fidelity.forEach((category, index) =>
        insertFidelity.run(
          fidelityReviewId,
          category.key,
          category.label,
          category.count,
          category.status,
          category.detail,
          index + 1,
        ),
      );
      if (degradationDecisionId) {
        const decision = canonicalDegradationDecision(plan);
        requireStore(decision, 'FIDELITY_OUTSIDE_TRACER', '降级决定无法形成规范记录。');
        this.#authority
          .prepare(
            `INSERT INTO import_degradation_decisions(
               degradation_decision_id, fidelity_review_id, decision, created_at
             ) VALUES (?, ?, ?, ?)`,
          )
          .run(degradationDecisionId, fidelityReviewId, decision, now);
      }
      this.#authority.prepare("INSERT INTO manuscripts(manuscript_id, book_id, role, created_at) VALUES (?, ?, 'primary', ?)").run(manuscriptId, bookId, now);
      this.#authority.prepare('INSERT INTO manuscript_branches(branch_id, manuscript_id, name, created_at) VALUES (?, ?, ?, ?)').run(branchId, manuscriptId, '主分支', now);
      this.#authority
        .prepare(
          `INSERT INTO manuscript_revisions(
             revision_id, manuscript_id, branch_id, ordinal, revision_label, parent_revision_id,
             source_version_id, revision_digest, created_at
           ) VALUES (?, ?, ?, 1, 'r1', NULL, ?, ?, ?)`,
        )
        .run(revisionId, manuscriptId, branchId, sourceVersionId, revisionDigest, now);
      this.#authority.prepare('UPDATE manuscript_branches SET base_revision_id = ? WHERE branch_id = ?').run(revisionId, branchId);
      this.#authority.prepare(
        `INSERT INTO manuscript_blocks(block_id, manuscript_id, created_revision_id)
         SELECT staged_block_id, ?, ? FROM staged_import_blocks WHERE draft_id = ? ORDER BY position`,
      ).run(manuscriptId, revisionId, input.draftId);
      this.#authority.prepare(
        `INSERT INTO manuscript_block_versions(
           revision_id, block_id, position, kind, level, text, digest, start_offset, grapheme_length
         ) SELECT ?, staged_block_id, position, kind, level, text, digest, start_offset, grapheme_length
           FROM staged_import_blocks WHERE draft_id = ? ORDER BY position`,
      ).run(revisionId, input.draftId);
      this.#authority.prepare(
        `INSERT INTO working_blocks(
           branch_id, block_id, position, kind, level, text, digest, grapheme_length
         ) SELECT ?, staged_block_id, position, kind, level, text, digest, grapheme_length
           FROM staged_import_blocks WHERE draft_id = ? ORDER BY position`,
      ).run(branchId, input.draftId);
      this.#authority
        .prepare(
          `INSERT INTO workflow_profiles(
             profile_id, profile_version, profile_name, profile_digest, projection_schema, projection_json,
             native_profile_id, native_profile_version, native_profile_digest
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(profile_id, profile_version) DO NOTHING`,
        )
        .run(
          this.#workflowProfile.projection.id,
          this.#workflowProfile.projection.version,
          this.#workflowProfile.projection.name,
          this.#workflowProfile.projection.digest,
          this.#workflowProfile.projection.schema,
          workflowProjectionJson(this.#workflowProfile),
          this.#workflowProfile.native.id,
          this.#workflowProfile.native.version,
          this.#workflowProfile.native.digest,
        );
      const profile = one(
        this.#authority
          .prepare(
            `SELECT profile_name, profile_digest, projection_schema, projection_json,
                    native_profile_id, native_profile_version, native_profile_digest
             FROM workflow_profiles WHERE profile_id = ? AND profile_version = ?`,
          )
          .all(this.#workflowProfile.projection.id, this.#workflowProfile.projection.version) as SqlRow[],
        'PROFILE_CONFLICT',
        '工作流程方案版本缺失。',
      );
      requireStore(
        asString(profile.profile_name) === this.#workflowProfile.projection.name &&
          asString(profile.profile_digest) === this.#workflowProfile.projection.digest &&
          asString(profile.projection_schema) === this.#workflowProfile.projection.schema &&
          asString(profile.projection_json) === workflowProjectionJson(this.#workflowProfile) &&
          asString(profile.native_profile_id) === this.#workflowProfile.native.id &&
          asString(profile.native_profile_version) === this.#workflowProfile.native.version &&
          asString(profile.native_profile_digest) === this.#workflowProfile.native.digest,
        'PROFILE_CONFLICT',
        '工作流程方案版本冲突。',
      );
      this.#authority
        .prepare(
          `INSERT INTO workflow_instances(
             workflow_instance_id, book_id, manuscript_id, profile_id, profile_version, profile_digest,
             native_profile_id, native_profile_version, native_profile_digest, current_phase, state, created_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)`,
        )
        .run(
          workflowInstanceId,
          bookId,
          manuscriptId,
          this.#workflowProfile.projection.id,
          this.#workflowProfile.projection.version,
          this.#workflowProfile.projection.digest,
          this.#workflowProfile.native.id,
          this.#workflowProfile.native.version,
          this.#workflowProfile.native.digest,
          this.#workflowProfile.projection.phases[0].label,
          now,
        );
      this.#authority
        .prepare(
          `INSERT INTO manuscript_import_records(
             import_record_id, commit_id, book_id, manuscript_id, source_version_id, fidelity_review_id,
             degradation_decision_id, resulting_revision_id, provenance_id, imported_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          importRecordId,
          input.commitId,
          bookId,
          manuscriptId,
          sourceVersionId,
          fidelityReviewId,
          degradationDecisionId,
          revisionId,
          provenanceId,
          now,
        );
      this.#authority
        .prepare(
          `INSERT INTO branch_working_state(
             branch_id, manuscript_id, base_revision_id, journal_sequence, working_digest,
             total_graphemes, history_sequence, last_checkpoint_sequence
           ) VALUES (?, ?, ?, 0, ?, ?, 0, 0)`,
        )
        .run(branchId, manuscriptId, revisionId, workingDigest, snapshot.characterCount);
      requireStore(
        this.#boundedCall(() => this.#boundedAuthority.initializeImportedBranch(branchId)) === snapshot.characterCount,
        'IMPORT_POSTCONDITION_FAILED',
        '稿件索引无法由暂存快照精确建立。',
      );

      result = {
        commitId: input.commitId,
        importedAt: now,
        completionLabel: '稿件已导入',
        bookId,
        manuscriptId,
        branchId,
        revisionId,
        importRecordId,
        source: this.#stagedProjection(snapshot).source,
        fidelityReview: {
          fidelityReviewId,
          outcome: plan.outcome,
          categories: snapshot.fidelity,
        },
        importRecord: {
          importRecordId,
          fidelityReviewId,
          degradationDecision: degradationDecisionId
            ? {
                degradationDecisionId,
                summaryLabel: '含已接受的降级',
                acceptedItems: plan.degradations,
              }
            : null,
        },
        overview: this.getBookOverview(bookId),
      };
      this.#authority
        .prepare(
          `INSERT INTO import_commits(
             commit_id, draft_id, request_fingerprint, expected_draft_version, review_digest,
             operation_kind, result_json, committed_at
           ) VALUES (?, ?, ?, ?, ?, 'manuscript-import', ?, ?)`,
        )
        .run(
          input.commitId,
          input.draftId,
          requestFingerprint,
          input.expectedDraftVersion,
          input.reviewDigest,
          canonicalJson(immutableCommitResult(result)),
          now,
        );
      const draftUpdate = this.#authority
        .prepare(
          `UPDATE import_drafts
           SET state = 'committed', committed_commit_id = ?, committed_at = ?
           WHERE draft_id = ? AND state = 'reviewed' AND draft_version = ? AND review_digest = ?`,
        )
        .run(input.commitId, now, input.draftId, input.expectedDraftVersion, input.reviewDigest);
      requireStore(draftUpdate.changes === 1, 'DRAFT_VERSION_CHANGED', '导入草稿在提交时已变化。');
      const attemptUpdate = this.#authority
        .prepare(
          `UPDATE import_commit_attempts
           SET state = 'committed', committed_at = ?, uncertain_at = NULL, uncertainty_code = NULL
           WHERE attempt_id = ? AND draft_id = ? AND state = 'prepared'
             AND operation_kind = 'manuscript-import'
             AND request_fingerprint = ? AND expected_draft_version = ? AND review_digest = ?`,
        )
        .run(
          now,
          input.commitId,
          input.draftId,
          requestFingerprint,
          input.expectedDraftVersion,
          input.reviewDigest,
        );
      requireStore(attemptUpdate.changes === 1, 'COMMIT_ATTEMPT_CHANGED', '持久提交尝试状态已变化。');

      this.#assertImportPostconditions({
        bookId,
        dimensionSetId,
        manuscriptId,
        branchId,
        revisionId,
        sourceVersionId,
        fidelityReviewId,
        degradationDecisionId,
        workflowInstanceId,
        importRecordId,
        blockCount: snapshot.blockCount,
        characterCount: snapshot.characterCount,
        reviewDigest: input.reviewDigest,
        fidelityPlan: plan,
        sourceDigest: snapshot.sourceDigest,
        sourceBytes: snapshot.sourceBytes,
      });
      this.#authority.prepare('DELETE FROM staged_import_snapshots WHERE draft_id = ?').run(input.draftId);
      this.#assertForeignKeys(this.#authority);
    });

    requireStore(result, 'COMMIT_FAILED', '导入提交未产生结果。');
    const firstWindow = this.getManuscriptWindow(result.manuscriptId, result.branchId, null);
    return { ...result, firstWindow };
  }

  async commitSourceImport(
    input: {
      draftId: string;
      expectedDraftVersion: number;
      reviewDigest: string;
      commitId: string;
    },
    options: { interruptAfterAttempt?: boolean } = {},
  ): Promise<SourceImportCommitProjection> {
    this.#assertAvailable();
    requireStore(
      UUID_PATTERN.test(input.draftId) && UUID_PATTERN.test(input.commitId) && DIGEST_PATTERN.test(input.reviewDigest),
      'COMMIT_INVALID',
      '来源导入提交参数无效。',
    );
    this.#requireNoAbandonmentCleanupIntent(input.draftId);
    const requestFingerprint = commitRequestFingerprint('source-import', input);
    const existingAttempt = this.#loadCommitAttemptForDraft(input.draftId);
    if (existingAttempt) {
      requireStore(
        existingAttempt.attemptId === input.commitId &&
          existingAttempt.operationKind === 'source-import' &&
          existingAttempt.requestFingerprint === requestFingerprint &&
          existingAttempt.expectedDraftVersion === input.expectedDraftVersion &&
          existingAttempt.reviewDigest === input.reviewDigest,
        'IDEMPOTENCY_CONFLICT',
        '该来源导入草稿已绑定另一项持久提交尝试。',
      );
      const reconciliation = await this.#reconcileCommitAttempt(existingAttempt);
      if (reconciliation.state === 'committed') {
        requireStore(reconciliation.result.completionLabel === '来源材料已导入', 'IDEMPOTENCY_CONFLICT', '提交类型与来源导入不一致。');
        return reconciliation.result;
      }
      requireStore(reconciliation.state === 'uncommitted', 'IMPORT_COMMIT_OUTCOME_UNCERTAIN', '来源导入提交结果待确认。');
    }

    const snapshotBeforeAttempt = this.#loadDraftSnapshot(input.draftId);
    requireStore(snapshotBeforeAttempt.state === 'reviewed', 'DRAFT_NOT_REVIEWED', '来源导入草稿尚未完成复核。');
    requireStore(snapshotBeforeAttempt.version === input.expectedDraftVersion, 'DRAFT_VERSION_CHANGED', '导入草稿版本已变化。');
    requireStore(snapshotBeforeAttempt.reviewDigest === input.reviewDigest, 'REVIEW_CHANGED', '来源导入复核摘要已变化。');
    const revalidated = await this.#revalidateSnapshot(snapshotBeforeAttempt);
    requireStore(!revalidated.parserDrift, 'REVIEW_CHANGED', '解析器状态已变化，请重新复核来源导入。');
    const snapshotForAttempt = revalidated.snapshot;
    const identityFindingsForAttempt = this.#identityFindings(snapshotForAttempt);
    requireStore(
      this.#reconstructReviewedSourceImportTarget(snapshotForAttempt, identityFindingsForAttempt) !== null,
      'REVIEW_CHANGED',
      '来源导入复核无法由当前权威状态重建。',
    );
    if (!existingAttempt) {
      const preparedAt = new Date().toISOString();
      this.#transaction(this.#authority, () => {
        this.#authority.prepare(
          `INSERT INTO import_commit_attempts(
             attempt_id, draft_id, request_fingerprint, expected_draft_version, review_digest,
             operation_kind, state, prepared_at
           ) VALUES (?, ?, ?, ?, ?, 'source-import', 'prepared', ?)`,
        ).run(
          input.commitId,
          input.draftId,
          requestFingerprint,
          input.expectedDraftVersion,
          input.reviewDigest,
          preparedAt,
        );
      });
    }
    if (options.interruptAfterAttempt) {
      throw new StoreFatalError(new Error('E2E interruption after durable source import attempt preparation.'));
    }

    let result: SourceImportCommitProjection | undefined;
    this.#transaction(this.#authority, () => {
      const existing = this.#authority.prepare(
        'SELECT request_fingerprint, operation_kind FROM import_commits WHERE commit_id = ?',
      ).all(input.commitId) as SqlRow[];
      if (existing.length === 1) {
        requireStore(
          asString(existing[0]!.request_fingerprint) === requestFingerprint &&
            asString(existing[0]!.operation_kind) === 'source-import',
          'IDEMPOTENCY_CONFLICT',
          '提交标识已用于另一项导入。',
        );
        const stored = this.#loadStoredCommitResult(input.commitId);
        requireStore(stored.completionLabel === '来源材料已导入', 'IDEMPOTENCY_CONFLICT', '提交类型与来源导入不一致。');
        result = stored;
        return;
      }
      requireStore(existing.length === 0, 'STORE_CORRUPT', '提交标识记录不唯一。');

      const snapshot = this.#loadDraftSnapshot(input.draftId);
      requireStore(snapshot.state === 'reviewed', 'DRAFT_NOT_REVIEWED', '来源导入草稿尚未完成复核。');
      requireStore(snapshot.version === input.expectedDraftVersion, 'DRAFT_VERSION_CHANGED', '导入草稿版本已变化。');
      requireStore(snapshot.reviewDigest === input.reviewDigest, 'REVIEW_CHANGED', '来源导入复核摘要已变化。');
      const identityFindings = this.#identityFindings(snapshot);
      const target = this.#reconstructReviewedSourceImportTarget(snapshot, identityFindings);
      requireStore(target !== null, 'REVIEW_CHANGED', '来源导入复核无法由当前权威状态重建。');
      this.#boundedCall(() => this.#boundedAuthority.assertStagedDraftIntegrity(input.draftId));

      const now = new Date().toISOString();
      const bookId = target.bookId;
      const dimensionSetId = target.kind === 'existing-book' ? target.dimensionSetId : randomUUID();
      const sourceVersionId = target.sourceVersionDisposition === 'reused-same-book'
        ? target.reuseSourceVersionId!
        : randomUUID();
      const provenanceId = randomUUID();
      const sourceImportRecordId = randomUUID();
      const before = target.kind === 'existing-book' ? this.#sourceImportAuthorityCounts(bookId) : null;

      if (target.kind === 'new-book') {
        this.#authority.prepare(
          'INSERT INTO books(book_id, stable_identity, title, created_at, internal_number) VALUES (?, ?, ?, ?, NULL)',
        ).run(bookId, target.stableIdentity, target.confirmedTitle, now);
        this.#insertBookDimensionSet(dimensionSetId, bookId, now);
      } else {
        const current = this.#bookSourceImportTarget(bookId, snapshot.sourceDigest);
        requireStore(
          current.bookStateDigest === target.bookStateDigest && current.dimensionSetId === target.dimensionSetId &&
            current.exactSourceVersionId === target.reuseSourceVersionId,
          'REVIEW_CHANGED',
          '所选图书、维度集、稿件状态或来源版本已变化。',
        );
      }

      if (target.sourceVersionDisposition === 'created') {
        this.#authority.prepare(
          `INSERT INTO source_versions(
             source_version_id, book_id, object_digest, source_digest, content_digest, structure_digest,
             parser_identity, format, display_name, created_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, 'DOCX', ?, ?)`,
        ).run(
          sourceVersionId,
          bookId,
          snapshot.objectDigest,
          snapshot.sourceDigest,
          snapshot.contentDigest,
          snapshot.structureDigest,
          snapshot.parserIdentity,
          snapshot.displayName,
          now,
        );
      } else {
        const source = one(this.#authority.prepare(
          `SELECT book_id, object_digest, source_digest, content_digest, structure_digest,
                  parser_identity, format
           FROM source_versions WHERE source_version_id = ?`,
        ).all(sourceVersionId) as SqlRow[], 'SOURCE_VERSION_REUSE_INVALID', '明确选择的来源版本不存在。');
        requireStore(
          asString(source.book_id) === bookId && asString(source.object_digest) === snapshot.objectDigest &&
            asString(source.source_digest) === snapshot.sourceDigest &&
            asString(source.content_digest) === snapshot.contentDigest &&
            asString(source.structure_digest) === snapshot.structureDigest &&
            asString(source.parser_identity) === snapshot.parserIdentity && asString(source.format) === 'DOCX',
          'SOURCE_VERSION_REUSE_INCOMPATIBLE',
          '明确选择的同图书来源版本与当前完整文件及解析身份不一致。',
        );
      }

      this.#authority.prepare(
        `INSERT INTO source_provenance(
           provenance_id, source_version_id, acquisition_path, locality, sanitized_identity, parser_identity, recorded_at
         ) VALUES (?, ?, 'native-file-picker', 'local-provider-free', ?, ?, ?)`,
      ).run(provenanceId, sourceVersionId, snapshot.displayName, snapshot.parserIdentity, snapshot.stagedAt);

      const retainedBoundary = sourceImportRetainedBoundary(snapshot);
      const importedAt = now;
      const recordDigest = sha256(canonicalJson({
        schema: SOURCE_IMPORT_RECORD_SCHEMA,
        sourceImportRecordId,
        commitId: input.commitId,
        bookId,
        sourceVersionId,
        provenanceId,
        targetKind: target.kind,
        sourceVersionDisposition: target.sourceVersionDisposition,
        retainedBoundary,
        namedNonEffects: SOURCE_IMPORT_NON_EFFECTS,
        importedAt,
      }));
      this.#authority.prepare(
        `INSERT INTO source_import_records(
           source_import_record_id, commit_id, book_id, source_version_id, provenance_id,
           target_kind, source_version_disposition, retained_boundary_json, named_non_effects_json,
           record_digest, imported_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        sourceImportRecordId,
        input.commitId,
        bookId,
        sourceVersionId,
        provenanceId,
        target.kind,
        target.sourceVersionDisposition,
        canonicalJson(retainedBoundary),
        canonicalJson(SOURCE_IMPORT_NON_EFFECTS),
        recordDigest,
        importedAt,
      );

      const receiptRecords = this.#sourceImportRecordPresentations(bookId, [sourceImportRecordId]);
      const receiptSource = receiptRecords.find((record) => record.kind === 'source');
      const receiptRecord = receiptRecords.find((record) => record.kind === 'source-import-record');
      requireStore(receiptSource?.kind === 'source' && receiptRecord?.kind === 'source-import-record',
        'SOURCE_IMPORT_POSTCONDITION_FAILED', '来源导入完成凭据不完整。');

      result = {
        commitId: input.commitId,
        importedAt,
        completionLabel: '来源材料已导入',
        targetKind: target.kind,
        createdBook: target.kind === 'new-book',
        bookId,
        sourceVersionId,
        sourceImportRecordId,
        sourceVersionDisposition: target.sourceVersionDisposition,
        source: this.#stagedProjection(snapshot).source,
        retainedBoundary,
        provenance: {
          acquisitionPath: 'native-file-picker',
          locality: 'local-provider-free',
          label: '本机文件选择器 · 本地解析 · 未联网',
          acquiredAt: snapshot.stagedAt,
          provenanceId,
        },
        namedNonEffects: SOURCE_IMPORT_NON_EFFECTS,
        receipt: { source: receiptSource, record: receiptRecord },
        overview: this.getBookOverview(bookId),
      };
      this.#authority.prepare(
        `INSERT INTO import_commits(
           commit_id, draft_id, request_fingerprint, expected_draft_version, review_digest,
           operation_kind, result_json, committed_at
         ) VALUES (?, ?, ?, ?, ?, 'source-import', ?, ?)`,
      ).run(
        input.commitId,
        input.draftId,
        requestFingerprint,
        input.expectedDraftVersion,
        input.reviewDigest,
        canonicalJson(immutableCommitResult(result)),
        importedAt,
      );
      const draftUpdate = this.#authority.prepare(
        `UPDATE import_drafts
         SET state = 'committed', committed_commit_id = ?, committed_at = ?
         WHERE draft_id = ? AND state = 'reviewed' AND draft_version = ? AND review_digest = ?`,
      ).run(input.commitId, importedAt, input.draftId, input.expectedDraftVersion, input.reviewDigest);
      requireStore(draftUpdate.changes === 1, 'DRAFT_VERSION_CHANGED', '来源导入草稿在提交时已变化。');
      const attemptUpdate = this.#authority.prepare(
        `UPDATE import_commit_attempts
         SET state = 'committed', committed_at = ?, uncertain_at = NULL, uncertainty_code = NULL
         WHERE attempt_id = ? AND draft_id = ? AND state = 'prepared'
           AND operation_kind = 'source-import'
           AND request_fingerprint = ? AND expected_draft_version = ? AND review_digest = ?`,
      ).run(
        importedAt,
        input.commitId,
        input.draftId,
        requestFingerprint,
        input.expectedDraftVersion,
        input.reviewDigest,
      );
      requireStore(attemptUpdate.changes === 1, 'COMMIT_ATTEMPT_CHANGED', '来源导入持久提交尝试状态已变化。');

      const after = this.#sourceImportAuthorityCounts(bookId);
      const expectedBefore = before ?? {
        manuscripts: 0,
        revisions: 0,
        workflows: 0,
        fidelityReviews: 0,
        manuscriptImports: 0,
        sourceVersions: 0,
        provenance: 0,
        sourceImports: 0,
      };
      requireStore(
        after.manuscripts === expectedBefore.manuscripts && after.revisions === expectedBefore.revisions &&
          after.workflows === expectedBefore.workflows && after.fidelityReviews === expectedBefore.fidelityReviews &&
          after.manuscriptImports === expectedBefore.manuscriptImports &&
          after.sourceVersions === expectedBefore.sourceVersions + (target.sourceVersionDisposition === 'created' ? 1 : 0) &&
          after.provenance === expectedBefore.provenance + 1 && after.sourceImports === expectedBefore.sourceImports + 1,
        'IMPORT_POSTCONDITION_FAILED',
        '来源导入的记录图或具名非影响边界不成立。',
      );
      this.#authority.prepare('DELETE FROM staged_import_snapshots WHERE draft_id = ?').run(input.draftId);
      this.#assertForeignKeys(this.#authority);
    });

    requireStore(result !== undefined, 'COMMIT_FAILED', '来源导入提交未产生结果。');
    return result;
  }

  resolveAcknowledgedManuscriptReimportReplay(
    input: { draftId: string; expectedDraftVersion: number; reviewDigest: string; commitId: string },
  ): { draftId: string; commitId: string; bookId: string } {
    this.#assertAvailable();
    requireStore(
      UUID_PATTERN.test(input.draftId) && UUID_PATTERN.test(input.commitId) &&
        Number.isSafeInteger(input.expectedDraftVersion) && input.expectedDraftVersion >= 1 &&
        DIGEST_PATTERN.test(input.reviewDigest),
      'COMMIT_REPLAY_INVALID',
      '已确认的稿件重新导入提交重放证据不匹配。',
    );
    const requestFingerprint = commitRequestFingerprint('manuscript-reimport', input);
    const attempt = this.#loadCommitAttemptForDraft(input.draftId);
    requireStore(
      attempt !== null &&
        attempt.attemptId === input.commitId &&
        attempt.operationKind === 'manuscript-reimport' &&
        attempt.requestFingerprint === requestFingerprint &&
        attempt.expectedDraftVersion === input.expectedDraftVersion &&
        attempt.reviewDigest === input.reviewDigest &&
        attempt.state === 'committed' &&
        attempt.completionAcknowledgedAt !== null,
      'COMMIT_REPLAY_INVALID',
      '已确认的稿件重新导入提交重放证据不匹配。',
    );
    const record = one(
      this.#authority.prepare(
        `SELECT ic.draft_id, ic.request_fingerprint, ic.expected_draft_version, ic.review_digest,
                ic.operation_kind, rr.book_id
         FROM import_commits ic
         JOIN manuscript_reimport_records rr ON rr.commit_id = ic.commit_id
         WHERE ic.commit_id = ?`,
      ).all(input.commitId) as SqlRow[],
      'STORE_CORRUPT',
      '已确认的稿件重新导入提交记录图不完整。',
    );
    const bookId = asString(record.book_id);
    requireStore(
      asString(record.draft_id) === input.draftId &&
        asString(record.request_fingerprint) === requestFingerprint &&
        asNumber(record.expected_draft_version) === input.expectedDraftVersion &&
        asString(record.review_digest) === input.reviewDigest &&
        asString(record.operation_kind) === 'manuscript-reimport' &&
        UUID_PATTERN.test(bookId),
      'STORE_CORRUPT',
      '已确认的稿件重新导入提交记录图不一致。',
    );
    return { draftId: input.draftId, commitId: input.commitId, bookId };
  }

  async createManuscriptReimportCommitWork(
    input: { draftId: string; expectedDraftVersion: number; reviewDigest: string; commitId: string },
    options: {
      interruptAfterAttempt?: boolean;
      interruptAfterCommit?: boolean;
      legacyResultWithoutPresentation?: boolean;
    } = {},
  ): Promise<{ workId: string | null; total: number; result: ManuscriptReimportCommitProjection | null }> {
    this.#assertAvailable();
    requireStore(
      UUID_PATTERN.test(input.draftId) && UUID_PATTERN.test(input.commitId) && DIGEST_PATTERN.test(input.reviewDigest),
      'COMMIT_INVALID',
      '稿件重新导入提交参数无效。',
    );
    this.#requireNoAbandonmentCleanupIntent(input.draftId);
    const requestFingerprint = commitRequestFingerprint('manuscript-reimport', input);
    const existingAttempt = this.#loadCommitAttemptForDraft(input.draftId);
    if (existingAttempt) {
      requireStore(
        existingAttempt.attemptId === input.commitId && existingAttempt.operationKind === 'manuscript-reimport' &&
          existingAttempt.requestFingerprint === requestFingerprint &&
          existingAttempt.expectedDraftVersion === input.expectedDraftVersion &&
          existingAttempt.reviewDigest === input.reviewDigest,
        'IDEMPOTENCY_CONFLICT',
        '该重新导入草稿已绑定另一项持久提交尝试。',
      );
      requireStore(existingAttempt.state !== 'uncertain', 'IMPORT_COMMIT_OUTCOME_UNCERTAIN',
        '稿件重新导入提交结果待启动恢复确认。');
      if (existingAttempt.state === 'committed' && !this.#verifiedCommitObjects.has(existingAttempt.attemptId)) {
        requireStore(!Array.from(this.#reimportCommitWork.values()).some((work) => work.input.draftId === input.draftId),
          'SERVICE_BUSY', '该重新导入复核已有提交任务。');
        return this.#createManuscriptReimportReplayWork(input, existingAttempt);
      }
      const reconciliation = await this.#reconcileCommitAttempt(existingAttempt, { contentObjectAlreadyVerified: true });
      if (reconciliation.state === 'committed') {
        requireStore(
          reconciliation.result.completionLabel === '稿件已重新导入' ||
            reconciliation.result.completionLabel === '未发现稿件变化',
          'IDEMPOTENCY_CONFLICT',
          '提交类型与稿件重新导入不一致。',
        );
        return { workId: null, total: 0, result: reconciliation.result };
      }
      requireStore(reconciliation.state === 'uncommitted', 'IMPORT_COMMIT_OUTCOME_UNCERTAIN', '稿件重新导入提交结果待确认。');
    }
    const snapshotBeforeAttempt = this.#loadDraftSnapshot(input.draftId);
    requireStore(snapshotBeforeAttempt.state === 'reviewed' && snapshotBeforeAttempt.reviewedRelationship === 'reimport',
      'DRAFT_NOT_REVIEWED', '稿件重新导入草稿尚未完成复核。');
    requireStore(snapshotBeforeAttempt.version === input.expectedDraftVersion, 'DRAFT_VERSION_CHANGED', '导入草稿版本已变化。');
    requireStore(snapshotBeforeAttempt.reviewDigest === input.reviewDigest, 'REVIEW_CHANGED', '稿件重新导入复核摘要已变化。');
    requireStore(snapshotBeforeAttempt.parserIdentity === DOCX_PARSER_IDENTITY,
      'REVIEW_CHANGED', '解析器状态已变化，请重新复核稿件重新导入。');
    const targetBeforeAttempt = this.#reconstructReviewedReimportTarget(snapshotBeforeAttempt);
    requireStore(targetBeforeAttempt !== null, 'REVIEW_CHANGED', '稿件重新导入复核无法由当前权威状态重建。');
    requireStore(!Array.from(this.#reimportCommitWork.values()).some((work) => work.input.draftId === input.draftId),
      'SERVICE_BUSY', '该重新导入复核已有提交任务。');
    const evidence = this.#reimportEvidence(input.draftId);
    requireStore(evidence.unresolvedMappings === 0,
      'REIMPORT_MAPPING_UNRESOLVED', '仍有逐块映射未明确解决。');
    const object = one(this.#authority.prepare(
      'SELECT relative_key, byte_length FROM content_objects WHERE object_digest = ?',
    ).all(snapshotBeforeAttempt.objectDigest) as SqlRow[], 'SNAPSHOT_RESELECTION_REQUIRED', '暂存对象记录缺失。');
    requireStore(snapshotBeforeAttempt.objectDigest === snapshotBeforeAttempt.sourceDigest &&
      asNumber(object.byte_length) === snapshotBeforeAttempt.sourceBytes,
    'SNAPSHOT_RESELECTION_REQUIRED', '暂存对象身份记录不一致。');
    const objectPath = this.#contentObjectPath(snapshotBeforeAttempt.objectDigest, asString(object.relative_key));
    const pathInfo = lstatSync(objectPath);
    requireStore(pathInfo.isFile() && !pathInfo.isSymbolicLink() && pathInfo.size === snapshotBeforeAttempt.sourceBytes,
      'SNAPSHOT_RESELECTION_REQUIRED', '暂存对象长度无效。');
    this.#authority.exec(
      `CREATE TEMP TABLE IF NOT EXISTS reimport_commit_rows(
         work_id TEXT NOT NULL,
         position INTEGER NOT NULL,
         block_id TEXT NOT NULL,
         kind TEXT NOT NULL,
         level INTEGER,
         text TEXT NOT NULL,
         digest TEXT NOT NULL,
         start_offset INTEGER NOT NULL,
         grapheme_length INTEGER NOT NULL,
         offset_span INTEGER NOT NULL,
         creates_identity INTEGER NOT NULL CHECK(creates_identity IN (0, 1)),
         PRIMARY KEY(work_id, position),
         UNIQUE(work_id, block_id)
       ) WITHOUT ROWID`,
    );
    const workId = randomUUID();
    const abortController = new AbortController();
    const work: ReimportCommitWork = {
      mode: 'commit',
      workId,
      input,
      requestFingerprint,
      snapshot: snapshotBeforeAttempt,
      target: targetBeforeAttempt,
      evidence,
      resultingRevisionId: evidence.changed ? randomUUID() : null,
      objectPath,
      abortController,
      total: snapshotBeforeAttempt.sourceBytes + evidence.totalMappings,
      attemptExists: existingAttempt !== null,
      interruptAfterAttempt: options.interruptAfterAttempt === true,
      interruptAfterCommit: options.interruptAfterCommit === true,
      legacyResultWithoutPresentation: options.legacyResultWithoutPresentation === true,
      phase: 'parse',
      parseBytes: 0,
      parsedIngest: null,
      parseFailure: null,
      mappingPosition: 0,
      stagedBlocks: 0,
      stagedCharacters: 0,
      offsetSegments: [],
    };
    this.#reimportCommitWork.set(workId, work);
    void this.#parseIntoIngest(input.draftId, objectPath, snapshotBeforeAttempt.displayName, {
      signal: abortController.signal,
      onArchiveProgress: (bytes) => {
        if (this.#reimportCommitWork.get(workId) === work) {
          work.parseBytes = Math.min(bytes, snapshotBeforeAttempt.sourceBytes);
        }
      },
    }).then((ingested) => {
      if (this.#reimportCommitWork.get(workId) === work) work.parsedIngest = ingested;
      else this.#discardIngest(ingested.ingestId);
    }).catch((error: unknown) => {
      if (this.#reimportCommitWork.get(workId) === work) work.parseFailure = error;
    });
    return { workId, total: work.total, result: null };
  }

  #createManuscriptReimportReplayWork(
    input: { draftId: string; expectedDraftVersion: number; reviewDigest: string; commitId: string },
    attempt: CommitAttempt,
  ): { workId: string; total: number; result: null } {
    let openedFd: number | null = null;
    try {
      const stored = this.#loadStoredCommitResult(attempt.attemptId);
      requireStore(stored.completionLabel === '稿件已重新导入' || stored.completionLabel === '未发现稿件变化',
        'IDEMPOTENCY_CONFLICT', '提交类型与稿件重新导入不一致。');
      const object = one(this.#authority.prepare(
        `SELECT co.object_digest, co.relative_key, co.byte_length
         FROM manuscript_reimport_records rr
         JOIN source_versions sv ON sv.source_version_id = rr.source_version_id
         JOIN content_objects co ON co.object_digest = sv.object_digest
         WHERE rr.commit_id = ? AND rr.reimport_record_id = ?`,
      ).all(attempt.attemptId, stored.reimportRecordId) as SqlRow[],
      'COMMIT_PROOF_INCONCLUSIVE', '重新导入重放来源对象记录缺失。');
      const expectedDigest = asString(object.object_digest);
      const total = asNumber(object.byte_length);
      requireStore(total > 0 && expectedDigest === stored.source.sourceSha256 && total === stored.source.sourceBytes,
        'COMMIT_PROOF_INCONCLUSIVE', '重新导入重放来源对象身份不一致。');
      const objectPath = this.#contentObjectPath(expectedDigest, asString(object.relative_key));
      const info = lstatSync(objectPath);
      requireStore(info.isFile() && !info.isSymbolicLink() && info.size === total,
        'COMMIT_PROOF_INCONCLUSIVE', '重新导入重放来源对象长度无效。');
      const objectFd = openSync(objectPath, constants.O_RDONLY);
      openedFd = objectFd;
      const opened = fstatSync(objectFd);
      requireStore(opened.isFile() && opened.size === total,
        'COMMIT_PROOF_INCONCLUSIVE', '重新导入重放来源对象打开后身份无效。');
      const workId = randomUUID();
      this.#reimportCommitWork.set(workId, {
        mode: 'committed-replay',
        workId,
        input,
        attempt,
        result: stored,
        objectPath,
        objectFd,
        objectHasher: createHash('sha256'),
        expectedDigest,
        total,
        completed: 0,
      });
      openedFd = null;
      return { workId, total, result: null };
    } catch (error) {
      if (openedFd !== null) closeSync(openedFd);
      this.#markCommitAttemptUncertain(attempt.attemptId);
      if (error instanceof StoreFatalError) throw error;
      throw new StoreError('IMPORT_COMMIT_OUTCOME_UNCERTAIN', '已提交重新导入的来源对象无法完成重放校验。');
    }
  }

  async advanceManuscriptReimportCommitWork(workId: string): Promise<ReimportCommitProgress> {
    this.#assertAvailable();
    requireStore(UUID_PATTERN.test(workId), 'JOB_INVALID', '稿件重新导入提交任务标识无效。');
    const work = this.#reimportCommitWork.get(workId);
    requireStore(work !== undefined, 'JOB_NOT_FOUND', '稿件重新导入提交任务不存在或已结束。');
    if (work.mode === 'committed-replay') {
      try {
        requireStore(work.objectFd !== null, 'COMMIT_PROOF_INCONCLUSIVE', '重新导入重放来源对象句柄已关闭。');
        const remaining = work.total - work.completed;
        const buffer = Buffer.allocUnsafe(Math.min(REIMPORT_COMMIT_FILE_BATCH_BYTES, remaining));
        const read = readSync(work.objectFd, buffer, 0, buffer.length, work.completed);
        requireStore(read > 0, 'COMMIT_PROOF_INCONCLUSIVE', '重新导入重放来源对象提前结束。');
        work.objectHasher.update(buffer.subarray(0, read));
        work.completed += read;
        if (work.completed < work.total) {
          return { done: false, completed: work.completed, total: work.total, result: null };
        }
        closeSync(work.objectFd);
        work.objectFd = null;
        requireStore(work.objectHasher.digest('hex') === work.expectedDigest,
          'COMMIT_PROOF_INCONCLUSIVE', '重新导入重放来源对象摘要无效。');
        const reconciliation = await this.#reconcileCommitAttempt(work.attempt, { contentObjectAlreadyVerified: true });
        requireStore(reconciliation.state === 'committed' &&
          (reconciliation.result.completionLabel === '稿件已重新导入' ||
            reconciliation.result.completionLabel === '未发现稿件变化'),
        'IMPORT_COMMIT_OUTCOME_UNCERTAIN', '已提交重新导入无法由持久证据精确重放。');
        this.#rememberVerifiedCommitObject(work.input.commitId);
        this.#reimportCommitWork.delete(workId);
        return { done: true, completed: work.total, total: work.total, result: reconciliation.result };
      } catch (error) {
        if (work.objectFd !== null) closeSync(work.objectFd);
        work.objectFd = null;
        this.#reimportCommitWork.delete(workId);
        this.#markCommitAttemptUncertain(work.attempt.attemptId);
        if (error instanceof StoreFatalError) throw error;
        throw new StoreError('IMPORT_COMMIT_OUTCOME_UNCERTAIN', '已提交重新导入的重放校验无法证明结果。');
      }
    }
    if (work.phase === 'parse') {
      if (work.parseFailure !== null) {
        if (work.parseFailure instanceof StoreFatalError) throw work.parseFailure;
        throw new StoreError('SNAPSHOT_RESELECTION_REQUIRED', '暂存对象无法重新解析并核对。');
      }
      if (work.parsedIngest === null) {
        return { done: false, completed: work.parseBytes, total: work.total, result: null };
      }
      const parsed = work.parsedIngest.parsed;
      requireStore(
        parsed.sourceDigest === work.snapshot.sourceDigest && parsed.archiveBytes === work.snapshot.sourceBytes &&
          parsed.parserIdentity === work.snapshot.parserIdentity &&
          parsed.contentDigest === work.snapshot.contentDigest &&
          parsed.structureDigest === work.snapshot.structureDigest &&
          parsed.blockCount === work.snapshot.blockCount &&
          parsed.characterCount === work.snapshot.characterCount &&
          canonicalJson(parsed.fidelity) === canonicalJson(work.snapshot.fidelity) &&
          parsed.titleSuggestion.value === work.snapshot.titleSuggestion &&
          parsed.titleSuggestion.sourceLabel === work.snapshot.titleSource,
        'SNAPSHOT_RESELECTION_REQUIRED',
        '暂存来源身份或解析证据无法精确重建。',
      );
      work.parseBytes = work.snapshot.sourceBytes;
      work.phase = 'mappings';
      return { done: false, completed: work.parseBytes, total: work.total, result: null };
    }
    requireStore(work.parsedIngest !== null, 'SNAPSHOT_RESELECTION_REQUIRED', '暂存解析计划缺失。');
    const rows = this.#authority.prepare(
      `SELECT m.*, r.resolution, r.resolved_current_block_id,
              claimed.mapping_id claimed_mapping_id,
              sib.staged_block_id actual_staged_block_id, sib.position actual_staged_position,
              sib.kind actual_staged_kind, sib.level actual_staged_level, sib.text actual_staged_text,
              sib.digest actual_staged_digest, sib.start_offset, sib.grapheme_length,
              iib.staged_block_id ingest_staged_block_id, iib.position ingest_position,
              iib.kind ingest_kind, iib.level ingest_level, iib.text ingest_text,
              iib.digest ingest_digest, iib.start_offset ingest_start_offset,
              iib.grapheme_length ingest_grapheme_length
       FROM manuscript_reimport_mappings m
       JOIN manuscript_reimport_comparisons c ON c.comparison_id = m.comparison_id
       LEFT JOIN manuscript_reimport_mapping_resolutions r ON r.mapping_id = m.mapping_id
       LEFT JOIN manuscript_reimport_mapping_resolutions claimed
         ON claimed.comparison_id = m.comparison_id
        AND claimed.resolved_current_block_id = m.current_block_id
       LEFT JOIN staged_import_blocks sib
         ON sib.draft_id = c.draft_id AND sib.staged_block_id = m.staged_block_id
       LEFT JOIN import_ingest_blocks iib
         ON iib.ingest_id = ? AND iib.draft_id = c.draft_id AND iib.staged_block_id = m.staged_block_id
       WHERE c.draft_id = ? AND m.position > ? ORDER BY m.position LIMIT ${REIMPORT_MAPPING_BATCH_SIZE}`,
    ).all(work.parsedIngest.ingestId, work.input.draftId, work.mappingPosition) as SqlRow[];
    if (rows.length > 0) {
      const insert = this.#authority.prepare(
        `INSERT INTO temp.reimport_commit_rows(
           work_id, position, block_id, kind, level, text, digest, start_offset, grapheme_length,
           offset_span, creates_identity
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      for (const row of rows) {
        const mappingPosition = asNumber(row.position);
        requireStore(mappingPosition === work.mappingPosition + 1,
          'REIMPORT_COMPARISON_INVALID', '重新导入提交映射顺序不连续。');
        work.mappingPosition = mappingPosition;
        if (row.staged_block_id === null) {
          requireStore(row.current_block_id !== null &&
            (row.resolution === 'retire-current-identity' || row.claimed_mapping_id !== null),
          'REIMPORT_MAPPING_UNRESOLVED', '重新导入删除身份后果不完整。');
          continue;
        }
        requireStore(row.actual_staged_block_id !== null &&
          asString(row.staged_block_id) === asString(row.actual_staged_block_id) &&
          asNumber(row.staged_position) === asNumber(row.actual_staged_position) &&
          asString(row.staged_kind) === asString(row.actual_staged_kind) &&
          (row.staged_level === null ? null : asNumber(row.staged_level)) ===
            (row.actual_staged_level === null ? null : asNumber(row.actual_staged_level)) &&
          asString(row.staged_text) === asString(row.actual_staged_text) &&
          asString(row.staged_digest) === asString(row.actual_staged_digest) &&
          manuscriptBlockDigest(
            asString(row.staged_kind) as ManuscriptBlockProjection['kind'],
            row.staged_level === null ? null : asNumber(row.staged_level),
            asString(row.staged_text),
          ) === asString(row.staged_digest),
        'REIMPORT_COMPARISON_INVALID', '重新导入提交映射不再绑定精确暂存块。');
        requireStore(row.ingest_staged_block_id !== null &&
          asString(row.ingest_staged_block_id) === asString(row.actual_staged_block_id) &&
          asNumber(row.ingest_position) === asNumber(row.actual_staged_position) &&
          asString(row.ingest_kind) === asString(row.actual_staged_kind) &&
          (row.ingest_level === null ? null : asNumber(row.ingest_level)) ===
            (row.actual_staged_level === null ? null : asNumber(row.actual_staged_level)) &&
          asString(row.ingest_text) === asString(row.actual_staged_text) &&
          asString(row.ingest_digest) === asString(row.actual_staged_digest) &&
          asNumber(row.ingest_start_offset) === asNumber(row.start_offset) &&
          asNumber(row.ingest_grapheme_length) === asNumber(row.grapheme_length),
        'SNAPSHOT_RESELECTION_REQUIRED', '重新解析结果与暂存稿件块不一致。');
        const position = asNumber(row.staged_position);
        const graphemeLength = Array.from(new Intl.Segmenter('zh-CN', { granularity: 'grapheme' })
          .segment(asString(row.staged_text))).length;
        requireStore(position === work.stagedBlocks + 1 && asNumber(row.start_offset) === work.stagedCharacters &&
          asNumber(row.grapheme_length) === graphemeLength,
        'REIMPORT_COMPARISON_INVALID', '重新导入提交暂存块偏移或字素长度无效。');
        const preservesExact = row.identity_consequence === 'preserve-current-identity';
        const preservesSelected = row.resolution === 'preserve-current-identity';
        const createsIdentity = row.resolution === 'create-new-identity';
        requireStore(preservesExact || preservesSelected || createsIdentity,
          'REIMPORT_MAPPING_UNRESOLVED', '重新导入结构身份后果不完整。');
        const blockId = preservesExact
          ? asString(row.current_block_id)
          : preservesSelected
            ? asString(row.resolved_current_block_id)
            : `blk_${sha256(`${work.resultingRevisionId}\u0000${position}\u0000${asString(row.staged_digest)}`).slice(0, 24)}`;
        requireStore(!createsIdentity || work.resultingRevisionId !== null,
          'REIMPORT_COMPARISON_INVALID', '无变化重新导入不能创建结构身份。');
        const offsetSpan = appendReimportOffsetSegment(work.offsetSegments, position, graphemeLength);
        insert.run(workId, position, blockId, asString(row.staged_kind),
          row.staged_level === null ? null : asNumber(row.staged_level), asString(row.staged_text),
          asString(row.staged_digest), asNumber(row.start_offset), graphemeLength, offsetSpan, createsIdentity ? 1 : 0);
        work.stagedBlocks += 1;
        work.stagedCharacters += graphemeLength;
      }
      return {
        done: false,
        completed: work.parseBytes + work.mappingPosition,
        total: work.total,
        result: null,
      };
    }
    requireStore(work.mappingPosition === work.evidence.totalMappings &&
      work.stagedBlocks === work.snapshot.blockCount && work.stagedCharacters === work.snapshot.characterCount,
    'REIMPORT_COMPARISON_INVALID', '重新导入提交有界证明未覆盖完整稿件。');
    this.#discardIngest(work.parsedIngest.ingestId);
    work.parsedIngest = null;
    const currentSnapshot = this.#loadDraftSnapshot(work.input.draftId);
    requireStore(currentSnapshot.state === 'reviewed' && currentSnapshot.reviewedRelationship === 'reimport' &&
      currentSnapshot.version === work.input.expectedDraftVersion &&
      currentSnapshot.reviewDigest === work.input.reviewDigest,
    'REVIEW_CHANGED', '稿件重新导入复核在提交计划期间已变化。');
    const currentTarget = this.#reconstructReviewedReimportTarget(currentSnapshot);
    requireStore(currentTarget !== null && canonicalJson(currentTarget) === canonicalJson(work.target),
      'REVIEW_CHANGED', '稿件重新导入目标在提交计划期间已变化。');
    const currentEvidence = this.#reimportEvidence(work.input.draftId);
    requireStore(currentEvidence.unresolvedMappings === 0 &&
      canonicalJson(currentEvidence) === canonicalJson(work.evidence),
    'REIMPORT_MAPPING_UNRESOLVED', '稿件重新导入证据在提交计划期间已变化。');
    if (!work.attemptExists) {
      this.#transaction(this.#authority, () => {
        this.#authority.prepare(
          `INSERT INTO import_commit_attempts(
             attempt_id, draft_id, request_fingerprint, expected_draft_version, review_digest,
             operation_kind, state, prepared_at
           ) VALUES (?, ?, ?, ?, ?, 'manuscript-reimport', 'prepared', ?)`,
        ).run(work.input.commitId, work.input.draftId, work.requestFingerprint,
          work.input.expectedDraftVersion, work.input.reviewDigest, new Date().toISOString());
      });
    }
    if (work.interruptAfterAttempt) {
      throw new StoreFatalError(new Error('E2E interruption after durable manuscript reimport attempt preparation.'));
    }
    const result = this.#finalizeManuscriptReimportCommit(work);
    this.#rememberVerifiedCommitObject(work.input.commitId);
    this.#reimportCommitWork.delete(workId);
    this.#authority.prepare('DELETE FROM temp.reimport_commit_rows WHERE work_id = ?').run(workId);
    if (work.legacyResultWithoutPresentation) {
      this.rewriteCommittedResultWithoutPresentationForTest(work.input.commitId);
    }
    if (work.interruptAfterCommit || work.legacyResultWithoutPresentation) {
      throw new StoreFatalError(new Error('E2E interruption after committed manuscript reimport and before response.'));
    }
    return { done: true, completed: work.total, total: work.total, result };
  }

  cancelManuscriptReimportCommitWork(workId: string): boolean {
    this.#assertAvailable();
    requireStore(UUID_PATTERN.test(workId), 'JOB_INVALID', '稿件重新导入提交任务标识无效。');
    const work = this.#reimportCommitWork.get(workId);
    if (work === undefined) return false;
    if (work.mode === 'committed-replay') {
      if (work.objectFd !== null) closeSync(work.objectFd);
      this.#reimportCommitWork.delete(workId);
      return true;
    }
    work.abortController.abort();
    if (work.parsedIngest !== null) this.#discardIngest(work.parsedIngest.ingestId);
    this.#reimportCommitWork.delete(workId);
    this.#authority.prepare('DELETE FROM temp.reimport_commit_rows WHERE work_id = ?').run(workId);
    return true;
  }

  rewriteCommittedResultWithoutPresentationForTest(commitId: string): void {
    requireStore(UUID_PATTERN.test(commitId), 'COMMIT_INVALID', '测试提交标识无效。');
    const row = one(this.#authority.prepare(
      'SELECT result_json FROM import_commits WHERE commit_id = ?',
    ).all(commitId) as SqlRow[], 'COMMIT_PROOF_INCONCLUSIVE', '测试提交结果不存在。');
    const parsed = JSON.parse(asString(row.result_json)) as Record<string, unknown>;
    delete parsed.receipt;
    delete parsed.overview;
    delete parsed.window;
    requireStore(this.#authority.prepare(
      'UPDATE import_commits SET result_json = ? WHERE commit_id = ?',
    ).run(canonicalJson(parsed), commitId).changes === 1,
    'COMMIT_PROOF_INCONCLUSIVE', '无法建立旧版无展示字段提交结果。');
  }

  #finalizeManuscriptReimportCommit(work: ReimportCommitWork): ManuscriptReimportCommitProjection {
    const input = work.input;
    const requestFingerprint = work.requestFingerprint;

    let result: ManuscriptReimportCommitProjection | undefined;
    let committedResult: Omit<ManuscriptReimportCommitProjection, 'receipt' | 'overview' | 'window'> | undefined;
    this.#transaction(this.#authority, () => {
      const existing = this.#authority.prepare(
        'SELECT request_fingerprint, operation_kind FROM import_commits WHERE commit_id = ?',
      ).all(input.commitId) as SqlRow[];
      if (existing.length === 1) {
        requireStore(asString(existing[0]!.request_fingerprint) === requestFingerprint &&
          asString(existing[0]!.operation_kind) === 'manuscript-reimport',
        'IDEMPOTENCY_CONFLICT', '提交标识已用于另一项导入。');
        const stored = this.#loadStoredCommitResult(input.commitId);
        requireStore(stored.completionLabel === '稿件已重新导入' || stored.completionLabel === '未发现稿件变化',
          'IDEMPOTENCY_CONFLICT', '提交类型与稿件重新导入不一致。');
        result = stored;
        return;
      }
      requireStore(existing.length === 0, 'STORE_CORRUPT', '提交标识记录不唯一。');

      const snapshot = this.#loadDraftSnapshot(input.draftId);
      requireStore(snapshot.state === 'reviewed' && snapshot.version === input.expectedDraftVersion &&
        snapshot.reviewDigest === input.reviewDigest && snapshot.reviewedRelationship === 'reimport',
      'REVIEW_CHANGED', '稿件重新导入复核已变化。');
      const target = this.#reconstructReviewedReimportTarget(snapshot);
      requireStore(target !== null && canonicalJson(target) === canonicalJson(work.target),
        'REVIEW_CHANGED', '稿件重新导入复核无法由当前权威状态重建。');
      const evidence = this.#reimportEvidence(input.draftId);
      requireStore(evidence.unresolvedMappings === 0 && canonicalJson(evidence) === canonicalJson(work.evidence),
        'REIMPORT_MAPPING_UNRESOLVED', '重新导入比较证据在提交期间已变化。');
      const fidelityPlan = this.#requireFidelityPlan(snapshot);
      const degradationAcceptance = one(this.#authority.prepare(
        'SELECT degradation_accepted FROM manuscript_reimport_comparisons WHERE draft_id = ?',
      ).all(input.draftId) as SqlRow[], 'REIMPORT_COMPARISON_INVALID', '重新导入比较不存在。');
      requireStore(fidelityPlan.degradations.length === 0 || asNumber(degradationAcceptance.degradation_accepted) === 1,
        'DEGRADATION_ACCEPTANCE_REQUIRED', '必须明确接受本次重新导入的完整降级集合。');

      const now = new Date().toISOString();
      const before = this.#reimportAuthorityCounts(target.bookId);
      const sourceVersionId = target.sourceVersionDisposition === 'reused-same-book'
        ? target.reuseSourceVersionId!
        : randomUUID();
      const provenanceId = randomUUID();
      const reimportRecordId = randomUUID();
      const fidelityReviewId = randomUUID();
      const degradationDecisionId = fidelityPlan.degradations.length > 0 ? randomUUID() : null;
      if (target.sourceVersionDisposition === 'created') {
        this.#authority.prepare(
          `INSERT INTO source_versions(
             source_version_id, book_id, object_digest, source_digest, content_digest, structure_digest,
             parser_identity, format, display_name, created_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, 'DOCX', ?, ?)`,
        ).run(sourceVersionId, target.bookId, snapshot.objectDigest, snapshot.sourceDigest,
          snapshot.contentDigest, snapshot.structureDigest, snapshot.parserIdentity, snapshot.displayName, now);
      } else {
        const source = one(this.#authority.prepare(
          `SELECT book_id, object_digest, source_digest, content_digest, structure_digest, parser_identity, format
           FROM source_versions WHERE source_version_id = ?`,
        ).all(sourceVersionId) as SqlRow[], 'SOURCE_VERSION_REUSE_INVALID', '明确选择的来源版本不存在。');
        requireStore(asString(source.book_id) === target.bookId && asString(source.object_digest) === snapshot.objectDigest &&
          asString(source.source_digest) === snapshot.sourceDigest && asString(source.content_digest) === snapshot.contentDigest &&
          asString(source.structure_digest) === snapshot.structureDigest && asString(source.parser_identity) === snapshot.parserIdentity &&
          asString(source.format) === 'DOCX', 'SOURCE_VERSION_REUSE_INCOMPATIBLE', '明确选择的同图书来源版本与暂存快照不一致。');
      }
      this.#authority.prepare(
        `INSERT INTO source_provenance(
           provenance_id, source_version_id, acquisition_path, locality, sanitized_identity, parser_identity, recorded_at
         ) VALUES (?, ?, 'native-file-picker', 'local-provider-free', ?, ?, ?)`,
      ).run(provenanceId, sourceVersionId, snapshot.displayName, snapshot.parserIdentity, snapshot.stagedAt);
      const fidelityReviewDigest = sha256(canonicalJson({
        schema: 'ai7.manuscript-reimport-fidelity-review/1',
        reimportRecordId,
        sourceVersionId,
        sourceDigest: snapshot.sourceDigest,
        sourceBytes: snapshot.sourceBytes,
        categories: snapshot.fidelity,
        outcome: fidelityPlan.outcome,
      }));
      this.#authority.prepare(
        `INSERT INTO import_fidelity_reviews(
           fidelity_review_id, book_id, source_version_id, review_digest, outcome,
           round_trip_guaranteed, created_at
         ) VALUES (?, ?, ?, ?, ?, 0, ?)`,
      ).run(fidelityReviewId, target.bookId, sourceVersionId, fidelityReviewDigest, fidelityPlan.outcome, now);
      const insertFidelity = this.#authority.prepare(
        `INSERT INTO import_fidelity_categories(
           fidelity_review_id, category_key, display_label, item_count, status, detail, position
         ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      );
      snapshot.fidelity.forEach((category, index) => insertFidelity.run(
        fidelityReviewId, category.key, category.label, category.count, category.status, category.detail, index + 1,
      ));
      if (degradationDecisionId !== null) {
        const decision = canonicalDegradationDecision(fidelityPlan);
        requireStore(decision !== null, 'FIDELITY_OUTSIDE_TRACER', '重新导入降级决定无法形成规范记录。');
        this.#authority.prepare(
          `INSERT INTO import_degradation_decisions(
             degradation_decision_id, fidelity_review_id, decision, created_at
           ) VALUES (?, ?, ?, ?)`,
        ).run(degradationDecisionId, fidelityReviewId, decision, now);
      }

      const resultKind = evidence.changed ? 'changed' as const : 'no-change' as const;
      const completionLabel = evidence.changed ? '稿件已重新导入' as const : '未发现稿件变化' as const;
      let resultingRevisionId: string | null = null;
      if (evidence.changed) {
        resultingRevisionId = work.resultingRevisionId;
        requireStore(resultingRevisionId !== null, 'REIMPORT_COMPARISON_INVALID', '重新导入结果修订版计划缺失。');
        const previous = one(this.#authority.prepare(
          'SELECT ordinal FROM manuscript_revisions WHERE revision_id = ?',
        ).all(target.checkpoint.revisionId) as SqlRow[], 'REIMPORT_CHECKPOINT_INVALID', '重新导入安全固定点缺失。');
        const ordinal = asNumber(previous.ordinal) + 1;
        const revisionDigest = sha256(canonicalJson({
          schema: 'ai7.manuscript-reimport-revision/1',
          manuscriptId: target.manuscriptId,
          parentRevisionId: target.checkpoint.revisionId,
          sourceVersionId,
          contentDigest: snapshot.contentDigest,
          structureDigest: snapshot.structureDigest,
          comparisonDigest: evidence.comparisonDigest,
          resolutionDigest: evidence.resolutionDigest,
        }));
        this.#authority.prepare(
          `INSERT INTO manuscript_revisions(
             revision_id, manuscript_id, branch_id, ordinal, revision_label, parent_revision_id,
             source_version_id, revision_digest, created_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(resultingRevisionId, target.manuscriptId, target.branchId, ordinal, `r${ordinal}`,
          target.checkpoint.revisionId, sourceVersionId, revisionDigest, now);
        const createdIdentities = this.#authority.prepare(
          `INSERT INTO manuscript_blocks(block_id, manuscript_id, created_revision_id)
           SELECT block_id, ?, ? FROM temp.reimport_commit_rows
           WHERE work_id = ? AND creates_identity = 1 ORDER BY position`,
        ).run(target.manuscriptId, resultingRevisionId, work.workId);
        requireStore(createdIdentities.changes === asNumber(one(this.#authority.prepare(
          'SELECT count(*) total FROM temp.reimport_commit_rows WHERE work_id = ? AND creates_identity = 1',
        ).all(work.workId) as SqlRow[], 'REIMPORT_COMPARISON_INVALID', '无法核对新结构身份计划。').total),
        'REIMPORT_COMPARISON_INVALID', '新结构身份计划无法完整提交。');
        const insertedVersions = this.#authority.prepare(
          `INSERT INTO manuscript_block_versions(
             revision_id, block_id, position, kind, level, text, digest, start_offset, grapheme_length
           )
           SELECT ?, block_id, position, kind, level, text, digest, start_offset, grapheme_length
           FROM temp.reimport_commit_rows WHERE work_id = ? ORDER BY position`,
        ).run(resultingRevisionId, work.workId);
        requireStore(insertedVersions.changes === snapshot.blockCount,
          'REIMPORT_COMPARISON_INVALID', '重新导入结果修订版块无法完整提交。');
        this.#authority.prepare(
          `UPDATE manuscript_command_groups SET status = 'superseded'
           WHERE branch_id = ? AND status IN ('applied', 'undone')`,
        ).run(target.branchId);
        this.#authority.prepare('DELETE FROM manuscript_outline WHERE branch_id = ?').run(target.branchId);
        this.#authority.prepare('DELETE FROM working_block_search WHERE branch_id = ?').run(target.branchId);
        this.#authority.prepare('DELETE FROM working_offset_nodes WHERE branch_id = ?').run(target.branchId);
        this.#authority.prepare('DELETE FROM working_blocks WHERE branch_id = ?').run(target.branchId);
        const insertedWorking = this.#authority.prepare(
          `INSERT INTO working_blocks(branch_id, block_id, position, kind, level, text, digest, grapheme_length)
           SELECT ?, block_id, position, kind, level, text, digest, grapheme_length
           FROM temp.reimport_commit_rows WHERE work_id = ? ORDER BY position`,
        ).run(target.branchId, work.workId);
        requireStore(insertedWorking.changes === snapshot.blockCount,
          'REIMPORT_COMPARISON_INVALID', '重新导入工作稿块无法完整提交。');
        const insertedOutline = this.#authority.prepare(
          `INSERT INTO manuscript_outline(branch_id, block_id, position, kind, level, text, digest)
           SELECT ?, block_id, position, kind,
                  CASE WHEN kind = 'title' THEN 1 ELSE COALESCE(level, 1) END,
                  text, digest
           FROM temp.reimport_commit_rows
           WHERE work_id = ? AND kind IN ('title', 'heading') ORDER BY position`,
        ).run(target.branchId, work.workId);
        const plannedOutline = asNumber(one(this.#authority.prepare(
          `SELECT count(*) total FROM temp.reimport_commit_rows
           WHERE work_id = ? AND kind IN ('title', 'heading')`,
        ).all(work.workId) as SqlRow[], 'REIMPORT_COMPARISON_INVALID', '无法核对重新导入大纲计划。').total);
        requireStore(insertedOutline.changes === plannedOutline,
          'REIMPORT_COMPARISON_INVALID', '重新导入大纲计划无法完整提交。');
        const insertedSearch = this.#authority.prepare(
          `INSERT INTO working_block_search(branch_id, block_id, text)
           SELECT ?, block_id, text FROM temp.reimport_commit_rows
           WHERE work_id = ? ORDER BY position`,
        ).run(target.branchId, work.workId);
        requireStore(insertedSearch.changes === snapshot.blockCount,
          'REIMPORT_COMPARISON_INVALID', '重新导入搜索投影无法完整提交。');
        const insertedOffsets = this.#authority.prepare(
          `INSERT INTO working_offset_nodes(branch_id, position, span_graphemes)
           SELECT ?, position, offset_span FROM temp.reimport_commit_rows
           WHERE work_id = ? ORDER BY position`,
        ).run(target.branchId, work.workId);
        requireStore(insertedOffsets.changes === snapshot.blockCount,
          'REIMPORT_COMPARISON_INVALID', '重新导入偏移投影无法完整提交。');
        const stateUpdate = this.#authority.prepare(
          `UPDATE branch_working_state
           SET base_revision_id = ?, working_digest = ?, total_graphemes = ?, last_checkpoint_sequence = journal_sequence,
               history_boundary_sequence = history_sequence
           WHERE manuscript_id = ? AND branch_id = ? AND base_revision_id = ? AND working_digest = ?`,
        ).run(resultingRevisionId, revisionDigest, snapshot.characterCount, target.manuscriptId, target.branchId,
          target.checkpoint.revisionId, target.checkpoint.revisionDigest);
        requireStore(stateUpdate.changes === 1, 'REIMPORT_TARGET_CHANGED', '重新导入提交时主稿件已变化。');
        requireStore(this.#authority.prepare(
          'UPDATE manuscript_branches SET base_revision_id = ? WHERE branch_id = ? AND base_revision_id = ?',
        ).run(resultingRevisionId, target.branchId, target.checkpoint.revisionId).changes === 1,
        'REIMPORT_TARGET_CHANGED', '重新导入提交时分支已变化。');
      }

      const recordDigest = sha256(canonicalJson({
        schema: MANUSCRIPT_REIMPORT_RECORD_SCHEMA,
        reimportRecordId,
        commitId: input.commitId,
        bookId: target.bookId,
        manuscriptId: target.manuscriptId,
        branchId: target.branchId,
        sourceVersionId,
        provenanceId,
        previousRevisionId: target.checkpoint.revisionId,
        resultingRevisionId,
        resultKind,
        resultLabel: completionLabel,
        lineageStatus: target.lineage.status,
        lineageSourceVersionId: target.lineage.sourceVersionId,
        comparisonKind: target.lineage.comparisonKind,
        comparisonDigest: evidence.comparisonDigest,
        resolutionDigest: evidence.resolutionDigest,
        fidelityReviewId,
        degradationDecisionId,
        importedAt: now,
      }));
      this.#authority.prepare(
        `INSERT INTO manuscript_reimport_records(
           reimport_record_id, comparison_id, commit_id, book_id, manuscript_id, branch_id, source_version_id,
           provenance_id, previous_revision_id, resulting_revision_id, result_kind, result_label,
           lineage_status, lineage_source_version_id, comparison_kind, comparison_digest,
           resolution_digest, fidelity_review_id, degradation_decision_id, record_digest, imported_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(reimportRecordId, asString(one(this.#authority.prepare(
        'SELECT comparison_id FROM manuscript_reimport_comparisons WHERE draft_id = ?',
      ).all(input.draftId) as SqlRow[], 'REIMPORT_COMPARISON_INVALID', '重新导入比较不存在。').comparison_id),
        input.commitId, target.bookId, target.manuscriptId, target.branchId,
        sourceVersionId, provenanceId, target.checkpoint.revisionId, resultingRevisionId, resultKind,
        completionLabel, target.lineage.status, target.lineage.sourceVersionId, target.lineage.comparisonKind,
        evidence.comparisonDigest, evidence.resolutionDigest, fidelityReviewId, degradationDecisionId, recordDigest, now);

      committedResult = {
        commitId: input.commitId,
        importedAt: now,
        completionLabel,
        resultKind,
        bookId: target.bookId,
        manuscriptId: target.manuscriptId,
        branchId: target.branchId,
        previousRevisionId: target.checkpoint.revisionId,
        resultingRevisionId,
        reimportRecordId,
        sourceVersionId,
        sourceVersionDisposition: target.sourceVersionDisposition,
        provenanceId,
        lineageStatus: target.lineage.status,
        lineageLabel: target.lineage.status === 'verified' ? '来源关系已确认' : '来源关系未确认',
        comparisonKind: target.lineage.comparisonKind,
        comparisonDigest: evidence.comparisonDigest,
        resolutionDigest: evidence.resolutionDigest,
        source: this.#stagedProjection(snapshot).source,
      };
      this.#authority.prepare(
        `INSERT INTO import_commits(
           commit_id, draft_id, request_fingerprint, expected_draft_version, review_digest,
           operation_kind, result_json, committed_at
         ) VALUES (?, ?, ?, ?, ?, 'manuscript-reimport', ?, ?)`,
      ).run(input.commitId, input.draftId, requestFingerprint, input.expectedDraftVersion,
        input.reviewDigest, canonicalJson(committedResult), now);
      requireStore(this.#authority.prepare(
        `UPDATE import_drafts SET state = 'committed', committed_commit_id = ?, committed_at = ?
         WHERE draft_id = ? AND state = 'reviewed' AND draft_version = ? AND review_digest = ?`,
      ).run(input.commitId, now, input.draftId, input.expectedDraftVersion, input.reviewDigest).changes === 1,
      'DRAFT_VERSION_CHANGED', '重新导入草稿在提交时已变化。');
      requireStore(this.#authority.prepare(
        `UPDATE import_commit_attempts
         SET state = 'committed', committed_at = ?, uncertain_at = NULL, uncertainty_code = NULL
         WHERE attempt_id = ? AND draft_id = ? AND state = 'prepared'
           AND operation_kind = 'manuscript-reimport' AND request_fingerprint = ?
           AND expected_draft_version = ? AND review_digest = ?`,
      ).run(now, input.commitId, input.draftId, requestFingerprint,
        input.expectedDraftVersion, input.reviewDigest).changes === 1,
      'COMMIT_ATTEMPT_CHANGED', '稿件重新导入持久提交尝试状态已变化。');
      const after = this.#reimportAuthorityCounts(target.bookId);
      requireStore(
        after.manuscripts === before.manuscripts &&
          after.revisions === before.revisions + (evidence.changed ? 1 : 0) &&
          after.sourceVersions === before.sourceVersions + (target.sourceVersionDisposition === 'created' ? 1 : 0) &&
          after.provenance === before.provenance + 1 && after.reimports === before.reimports + 1,
        'IMPORT_POSTCONDITION_FAILED',
        '稿件重新导入的原子记录图或无变化边界不成立。',
      );
      this.#authority.prepare('DELETE FROM staged_import_snapshots WHERE draft_id = ?').run(input.draftId);
    });
    if (result !== undefined) return result;
    requireStore(committedResult !== undefined, 'COMMIT_FAILED', '稿件重新导入提交未产生结果。');
    const reimportReceipt = this.#reimportRecordPresentations(committedResult.bookId, [committedResult.reimportRecordId])
      .find((record) => record.kind === 'manuscript-reimport-record');
    requireStore(reimportReceipt?.kind === 'manuscript-reimport-record',
      'IMPORT_POSTCONDITION_FAILED', '稿件重新导入完成凭据不完整。');
    return {
      ...committedResult,
      receipt: reimportReceipt,
      overview: this.getBookOverview(committedResult.bookId),
      window: this.getManuscriptWindow(committedResult.manuscriptId, committedResult.branchId, null),
    };
  }

  #reimportAuthorityCounts(bookId: string): {
    manuscripts: number;
    revisions: number;
    sourceVersions: number;
    provenance: number;
    reimports: number;
  } {
    const row = one(this.#authority.prepare(
      `SELECT
         (SELECT count(*) FROM manuscripts WHERE book_id = ?) manuscripts,
         (SELECT count(*) FROM manuscript_revisions mr JOIN manuscripts m ON m.manuscript_id = mr.manuscript_id
          WHERE m.book_id = ?) revisions,
         (SELECT count(*) FROM source_versions WHERE book_id = ?) source_versions,
         (SELECT count(*) FROM source_provenance sp JOIN source_versions sv ON sv.source_version_id = sp.source_version_id
          WHERE sv.book_id = ?) provenance,
         (SELECT count(*) FROM manuscript_reimport_records WHERE book_id = ?) reimports`,
    ).all(bookId, bookId, bookId, bookId, bookId) as SqlRow[],
    'STORE_CORRUPT', '无法核对稿件重新导入权威记录。');
    return {
      manuscripts: asNumber(row.manuscripts),
      revisions: asNumber(row.revisions),
      sourceVersions: asNumber(row.source_versions),
      provenance: asNumber(row.provenance),
      reimports: asNumber(row.reimports),
    };
  }

  #sourceImportAuthorityCounts(bookId: string): {
    manuscripts: number;
    revisions: number;
    workflows: number;
    fidelityReviews: number;
    manuscriptImports: number;
    sourceVersions: number;
    provenance: number;
    sourceImports: number;
  } {
    const row = one(this.#authority.prepare(
      `SELECT
         (SELECT count(*) FROM manuscripts WHERE book_id = ?) manuscripts,
         (SELECT count(*) FROM manuscript_revisions mr
            JOIN manuscripts m ON m.manuscript_id = mr.manuscript_id WHERE m.book_id = ?) revisions,
         (SELECT count(*) FROM workflow_instances WHERE book_id = ?) workflows,
         (SELECT count(*) FROM import_fidelity_reviews WHERE book_id = ?) fidelity_reviews,
         (SELECT count(*) FROM manuscript_import_records WHERE book_id = ?) manuscript_imports,
         (SELECT count(*) FROM source_versions WHERE book_id = ?) source_versions,
         (SELECT count(*) FROM source_provenance sp
            JOIN source_versions sv ON sv.source_version_id = sp.source_version_id WHERE sv.book_id = ?) provenance,
         (SELECT count(*) FROM source_import_records WHERE book_id = ?) source_imports`,
    ).all(bookId, bookId, bookId, bookId, bookId, bookId, bookId, bookId) as SqlRow[],
    'STORE_CORRUPT', '无法核对来源导入权威记录。');
    return {
      manuscripts: asNumber(row.manuscripts),
      revisions: asNumber(row.revisions),
      workflows: asNumber(row.workflows),
      fidelityReviews: asNumber(row.fidelity_reviews),
      manuscriptImports: asNumber(row.manuscript_imports),
      sourceVersions: asNumber(row.source_versions),
      provenance: asNumber(row.provenance),
      sourceImports: asNumber(row.source_imports),
    };
  }

  getManuscriptWindow(manuscriptId: string, branchId: string, cursor: string | null): ManuscriptWindowProjection {
    return this.#boundedCall(() =>
      this.#bounded.getWindow(
        manuscriptId,
        branchId,
        cursor === null ? { kind: 'start' } : { kind: 'cursor', cursor },
      ),
    );
  }

  flushJournalEdit(input: JournalEditInput): JournalAcknowledgement {
    return this.#boundedCall(() => this.#bounded.flushJournalEdit(input, this.#lifetimeId));
  }

  listPriorWork(): ReadonlyArray<PriorWorkItemProjection> {
    return this.#boundedCall(() => this.#bounded.listPriorWork());
  }

  resolveBookWorkbenchRoute(route: BookWorkbenchRoute): ResolvedBookWorkbenchRoute {
    return this.#boundedCall(() => this.#bounded.resolveBookWorkbenchRoute(route));
  }

  getHistoricalRevision(revisionId: string, cursor: string | null): HistoricalRevisionProjection {
    return this.#boundedCall(() => this.#bounded.getHistoricalRevision(revisionId, cursor));
  }

  getModelServiceConnection(): ModelServiceConnectionProjection | null {
    this.#assertAvailable();
    const row = this.#authority.prepare(
      `SELECT connection_id, role_id, connection_name, provider_id, model_id,
              adapter_revision, configuration_revision, approved_fallback_chain,
              credential_slot, credential_reference, credential_operation_state,
              created_at, updated_at, credential_updated_at
       FROM model_service_connections
       WHERE connection_id = 'main-editorial-deepseek-v4-pro'`,
    ).get() as SqlRow | undefined;
    if (row === undefined) return null;
    const state = asString(row.credential_operation_state);
    requireStore(
      state === 'ready' || state === 'missing' || state === 'needs-attention',
      'STORE_CORRUPT',
      '模型服务凭据状态无效。',
    );
    const credentialReference = asString(row.credential_reference);
    requireStore(
      UUID_PATTERN.test(credentialReference),
      'STORE_CORRUPT',
      '模型服务凭据引用无效。',
    );
    return {
      connectionId: 'main-editorial-deepseek-v4-pro',
      roleId: 'main-editorial',
      connectionName: asString(row.connection_name),
      binding: {
        providerId: 'deepseek-open-platform',
        providerLabel: 'DeepSeek 开放平台（官方）',
        modelId: 'deepseek-v4-pro',
        modelLabel: 'DeepSeek V4 Pro High',
        adapterRevision: 1,
        configurationRevision: 1,
        approvedFallbackChain: [],
        credentialSlot: 'deepseek-api-key',
      },
      credentialReference,
      credentialOperationState: state,
      createdAt: asString(row.created_at),
      updatedAt: asString(row.updated_at),
      credentialUpdatedAt: asString(row.credential_updated_at),
    };
  }

  saveModelServiceConnection(
    connectionNameInput: string,
    credentialReference: string,
    credentialOperationState: 'ready' | 'needs-attention',
  ): ModelServiceConnectionProjection {
    this.#assertAvailable();
    const connectionName = connectionNameInput.trim();
    requireStore(
      connectionName.length > 0 && connectionName.length <= 80 && connectionName.isWellFormed(),
      'MODEL_SERVICE_CONNECTION_INVALID',
      '连接名称必须为 1 至 80 个有效字符。',
    );
    requireStore(UUID_PATTERN.test(credentialReference), 'MODEL_SERVICE_CONNECTION_INVALID', '凭据引用无效。');
    const current = this.getModelServiceConnection();
    requireStore(
      current === null || current.credentialReference === credentialReference,
      'MODEL_SERVICE_CONNECTION_CONFLICT',
      '已存连接的凭据引用不可替换。',
    );
    const now = new Date().toISOString();
    this.#transaction(this.#authority, () => {
      if (current === null) {
        this.#authority.prepare(
          `INSERT INTO model_service_connections(
             connection_id, role_id, connection_name, provider_id, model_id,
             adapter_revision, configuration_revision, approved_fallback_chain,
             credential_slot, credential_reference, credential_operation_state,
             created_at, updated_at, credential_updated_at
           ) VALUES (
             'main-editorial-deepseek-v4-pro', 'main-editorial', ?, 'deepseek-open-platform', 'deepseek-v4-pro',
             1, 1, '[]', 'deepseek-api-key', ?, ?, ?, ?, ?
           )`,
        ).run(connectionName, credentialReference, credentialOperationState, now, now, now);
      } else {
        requireStore(
          this.#authority.prepare(
            `UPDATE model_service_connections
             SET connection_name = ?, credential_operation_state = ?, updated_at = ?, credential_updated_at = ?
             WHERE connection_id = 'main-editorial-deepseek-v4-pro' AND credential_reference = ?`,
          ).run(connectionName, credentialOperationState, now, now, credentialReference).changes === 1,
          'MODEL_SERVICE_CONNECTION_CONFLICT',
          '模型服务连接状态已变化。',
        );
      }
    });
    return this.getModelServiceConnection()!;
  }

  setModelServiceCredentialState(
    credentialReference: string,
    credentialOperationState: ModelCredentialOperationState,
  ): ModelServiceConnectionProjection {
    this.#assertAvailable();
    requireStore(UUID_PATTERN.test(credentialReference), 'MODEL_SERVICE_CONNECTION_INVALID', '凭据引用无效。');
    const now = new Date().toISOString();
    this.#transaction(this.#authority, () => {
      requireStore(
        this.#authority.prepare(
          `UPDATE model_service_connections
           SET credential_operation_state = ?, updated_at = ?, credential_updated_at = ?
           WHERE connection_id = 'main-editorial-deepseek-v4-pro' AND credential_reference = ?`,
        ).run(credentialOperationState, now, now, credentialReference).changes === 1,
        'MODEL_SERVICE_CONNECTION_CONFLICT',
        '模型服务连接状态已变化。',
      );
    });
    return this.getModelServiceConnection()!;
  }

  getManuscriptWindowAt(
    manuscriptId: string,
    branchId: string,
    target: ManuscriptWindowTarget,
  ): ManuscriptWindowProjection {
    return this.#boundedCall(() => this.#bounded.getWindow(manuscriptId, branchId, target));
  }

  getOutline(manuscriptId: string, branchId: string, cursor: string | null): OutlineProjection {
    return this.#boundedCall(() => this.#bounded.getOutline(manuscriptId, branchId, cursor));
  }

  createSearch(manuscriptId: string, branchId: string, query: string): SearchSummaryProjection & {
    scannedPosition: number;
    totalBlocks: number;
  } {
    return this.#boundedCall(() => this.#bounded.createSearch(manuscriptId, branchId, query));
  }

  advanceSearch(searchId: string): {
    done: boolean;
    summary: SearchSummaryProjection;
    scannedPosition: number;
    totalBlocks: number;
  } {
    return this.#boundedCall(() => this.#bounded.advanceSearch(searchId));
  }

  cancelSearch(searchId: string): void {
    this.#boundedCall(() => this.#bounded.cancelSearch(searchId));
  }

  getSearchResults(searchId: string, cursor: string | null): SearchResultsProjection {
    return this.#boundedCall(() => this.#bounded.getSearchResults(searchId, cursor));
  }

  prepareReplacement(
    searchId: string,
    replacement: string,
    excludedMatchIds: ReadonlyArray<string>,
  ): ReplacementPreviewProjection {
    return this.#boundedCall(() => this.#bounded.prepareReplacement(searchId, replacement, excludedMatchIds));
  }

  freezeReplacement(
    previewId: string,
    excludedMatchIds: ReadonlyArray<string>,
  ): ReplacementPreviewProjection {
    return this.#boundedCall(() => this.#bounded.freezeReplacement(previewId, excludedMatchIds));
  }

  advanceReplacementWork(previewId: string): {
    phase: 'preparing' | 'validating';
    done: boolean;
    completed: number;
    total: number;
    preview: ReplacementPreviewProjection | null;
  } {
    return this.#boundedCall(() => this.#bounded.advanceReplacementWork(previewId));
  }

  commitReplacement(previewId: string): ReplacementCommitProjection {
    return this.#boundedCall(() => this.#bounded.commitReplacement(previewId, this.#lifetimeId));
  }

  cancelReplacement(previewId: string): boolean {
    return this.#boundedCall(() => this.#bounded.cancelReplacement(previewId));
  }

  dismissReplacementPreview(previewId: string): ReplacementDismissalProjection {
    const cancelled = this.cancelReplacement(previewId);
    requireStore(cancelled, 'REPLACEMENT_STATE_CHANGED', '替换预览已提交、失败或不再可取消。');
    return { previewId, state: 'cancelled' };
  }

  async saveMilestone(
    manuscriptId: string,
    branchId: string,
    label: string,
    purpose: string,
    note: string,
  ): Promise<MilestoneProjection> {
    this.#assertAvailable();
    let result: MilestoneProjection | undefined;
    await this.#withRecoveryObjectLifecycle(async () => {
      const plan = this.#boundedCall(() =>
        this.#boundedAuthority.prepareMilestoneRecoverySnapshot(manuscriptId, branchId, label, purpose, note));
      const object = await this.#recoveryObjects.form(
        plan,
        (afterPosition) => this.#boundedCall(() =>
          this.#boundedAuthority.getRecoverySnapshotBlocks(plan, afterPosition)),
      );
      try {
        result = this.#boundedCall(() => this.#boundedAuthority.saveMilestone(plan, object));
      } catch (error) {
        const referenced = this.#boundedCall(() =>
          this.#boundedAuthority.isRecoveryObjectReferenced(object.objectRelativeKey));
        await this.#recoveryObjects.removeUnreferenced(object, referenced);
        throw error;
      }
    });
    requireStore(result !== undefined, 'MILESTONE_INVALID', '里程碑与恢复快照未产生结果。');
    return result;
  }

  undoManuscript(manuscriptId: string, branchId: string, expectedWorkingDigest: string): DurableHistoryProjection {
    return this.#boundedCall(() => this.#bounded.undo(manuscriptId, branchId, expectedWorkingDigest, this.#lifetimeId));
  }

  redoManuscript(manuscriptId: string, branchId: string, expectedWorkingDigest: string): DurableHistoryProjection {
    return this.#boundedCall(() => this.#bounded.redo(manuscriptId, branchId, expectedWorkingDigest, this.#lifetimeId));
  }

  #loadCommitAttempt(attemptId: string): CommitAttempt {
    const row = one(
      this.#authority
        .prepare(
          `SELECT attempt_id, draft_id, request_fingerprint, expected_draft_version, review_digest,
                  operation_kind, state, prepared_at, completion_acknowledged_at
           FROM import_commit_attempts WHERE attempt_id = ?`,
        )
        .all(attemptId) as SqlRow[],
      'COMMIT_ATTEMPT_NOT_FOUND',
      '导入提交尝试不存在。',
    );
    const state = asString(row.state);
    const operationKind = asString(row.operation_kind);
    requireStore(state === 'prepared' || state === 'uncertain' || state === 'committed', 'STORE_CORRUPT', '导入提交尝试状态无效。');
    requireStore(
      operationKind === 'manuscript-import' || operationKind === 'source-import' || operationKind === 'manuscript-reimport',
      'STORE_CORRUPT',
      '导入提交尝试类型无效。',
    );
    return {
      attemptId: asString(row.attempt_id),
      draftId: asString(row.draft_id),
      requestFingerprint: asString(row.request_fingerprint),
      expectedDraftVersion: asNumber(row.expected_draft_version),
      reviewDigest: asString(row.review_digest),
      operationKind,
      state,
      preparedAt: asString(row.prepared_at),
      completionAcknowledgedAt:
        row.completion_acknowledged_at === null ? null : asString(row.completion_acknowledged_at),
    };
  }

  #loadCommitAttemptForDraft(draftId: string): CommitAttempt | null {
    const rows = this.#authority
      .prepare('SELECT attempt_id FROM import_commit_attempts WHERE draft_id = ?')
      .all(draftId) as SqlRow[];
    requireStore(rows.length <= 1, 'STORE_CORRUPT', '导入草稿关联了多个提交尝试。');
    return rows.length === 0 ? null : this.#loadCommitAttempt(asString(rows[0]!.attempt_id));
  }

  async #reconcileCommitAttempt(
    attemptInput: CommitAttempt,
    options: { contentObjectAlreadyVerified?: boolean } = {},
  ): Promise<
    | { state: 'uncommitted' }
    | { state: 'uncertain' }
    | { state: 'committed'; result: ImportCommitProjection }
  > {
    const attempt = this.#loadCommitAttempt(attemptInput.attemptId);
    try {
      if (this.#control.induceUnprovableReconciliation && attempt.state !== 'committed') {
        throw new Error('E2E induced failure at the production reconciliation proof boundary.');
      }
      requireStore(
        attempt.requestFingerprint === commitRequestFingerprint(attempt.operationKind, {
          draftId: attempt.draftId,
          expectedDraftVersion: attempt.expectedDraftVersion,
          reviewDigest: attempt.reviewDigest,
          commitId: attempt.attemptId,
        }) || (
          attempt.operationKind === 'manuscript-import' &&
          attempt.requestFingerprint === sha256(canonicalJson({
            draftId: attempt.draftId,
            expectedDraftVersion: attempt.expectedDraftVersion,
            reviewDigest: attempt.reviewDigest,
            commitId: attempt.attemptId,
          }))
        ),
        'COMMIT_PROOF_INCONCLUSIVE',
        '导入提交尝试绑定无法重建。',
      );
      const counts = one(
        this.#authority
          .prepare(
            `SELECT
               (SELECT count(*) FROM import_commits WHERE commit_id = ?) commits,
               (SELECT count(*) FROM manuscript_import_records WHERE commit_id = ?) manuscript_import_records,
               (SELECT count(*) FROM source_import_records WHERE commit_id = ?) source_import_records,
               (SELECT count(*) FROM manuscript_reimport_records WHERE commit_id = ?) reimport_records`,
          )
          .all(attempt.attemptId, attempt.attemptId, attempt.attemptId, attempt.attemptId) as SqlRow[],
        'STORE_CORRUPT',
        '无法读取导入提交证据。',
      );
      const commitCount = asNumber(counts.commits);
      const manuscriptImportRecordCount = asNumber(counts.manuscript_import_records);
      const sourceImportRecordCount = asNumber(counts.source_import_records);
      const reimportRecordCount = asNumber(counts.reimport_records);
      const importRecordCount = manuscriptImportRecordCount + sourceImportRecordCount + reimportRecordCount;
      const draft = one(
        this.#authority
          .prepare(
            'SELECT state, draft_version, review_digest, committed_commit_id FROM import_drafts WHERE draft_id = ?',
          )
          .all(attempt.draftId) as SqlRow[],
        'STORE_CORRUPT',
        '导入提交尝试缺少草稿。',
      );
      const draftState = asString(draft.state);
      const draftReviewDigest = draft.review_digest === null ? null : asString(draft.review_digest);
      const committedCommitId = draft.committed_commit_id === null ? null : asString(draft.committed_commit_id);
      requireStore(
        asNumber(draft.draft_version) === attempt.expectedDraftVersion && draftReviewDigest === attempt.reviewDigest,
        'COMMIT_PROOF_INCONCLUSIVE',
        '导入提交尝试与当前复核版本不一致。',
      );
      if (commitCount === 0 && importRecordCount === 0) {
        requireStore(
          draftState === 'reviewed' && committedCommitId === null && attempt.state !== 'committed',
          'COMMIT_PROOF_INCONCLUSIVE',
          '无法证明导入尚未提交。',
        );
        if (attempt.state === 'uncertain') {
          this.#authority
            .prepare(
              `UPDATE import_commit_attempts
               SET state = 'prepared', uncertain_at = NULL, uncertainty_code = NULL
               WHERE attempt_id = ? AND state = 'uncertain'`,
            )
            .run(attempt.attemptId);
        }
        return { state: 'uncommitted' };
      }
      requireStore(commitCount === 1 && importRecordCount === 1, 'COMMIT_PROOF_INCONCLUSIVE', '导入提交证据不完整。');
      const commit = one(
        this.#authority
          .prepare(
            `SELECT draft_id, request_fingerprint, expected_draft_version, review_digest,
                    operation_kind, result_json, committed_at
             FROM import_commits WHERE commit_id = ?`,
          )
          .all(attempt.attemptId) as SqlRow[],
        'COMMIT_PROOF_INCONCLUSIVE',
        '导入提交证据缺失。',
      );
      requireStore(
        asString(commit.draft_id) === attempt.draftId &&
          asString(commit.request_fingerprint) === attempt.requestFingerprint &&
          asString(commit.operation_kind) === attempt.operationKind &&
          asNumber(commit.expected_draft_version) === attempt.expectedDraftVersion &&
          asString(commit.review_digest) === attempt.reviewDigest &&
          draftState === 'committed' &&
          committedCommitId === attempt.attemptId,
        'COMMIT_PROOF_INCONCLUSIVE',
        '导入提交证据无法与持久尝试精确对应。',
      );
      const stored = this.#loadStoredCommitResult(attempt.attemptId);
      requireStore(
        (attempt.operationKind === 'manuscript-import' && stored.completionLabel === '稿件已导入') ||
          (attempt.operationKind === 'source-import' && stored.completionLabel === '来源材料已导入') ||
          (attempt.operationKind === 'manuscript-reimport' &&
            (stored.completionLabel === '稿件已重新导入' || stored.completionLabel === '未发现稿件变化')),
        'COMMIT_PROOF_INCONCLUSIVE',
        '导入提交类型与权威结果记录不一致。',
      );
      const legacyStored = immutableCommitResult(stored);
      const immutableResultJson = canonicalJson(legacyStored);
      const persistedResultJson = asString(commit.result_json);
      requireStore(
        persistedResultJson === canonicalJson(stored) || persistedResultJson === immutableResultJson,
        'COMMIT_PROOF_INCONCLUSIVE',
        '导入提交结果与权威记录图不一致。',
      );
      if (persistedResultJson !== immutableResultJson) {
        this.#authority.prepare(
          'UPDATE import_commits SET result_json = ? WHERE commit_id = ? AND result_json = ?',
        ).run(immutableResultJson, attempt.attemptId, persistedResultJson);
      }
      this.#assertRecoveredCommitGraph(stored);
      if (!options.contentObjectAlreadyVerified) {
        await this.#verifyCommittedContentObject(stored);
        this.#rememberVerifiedCommitObject(attempt.attemptId);
      }
      this.#authority
        .prepare(
          `UPDATE import_commit_attempts
           SET state = 'committed', committed_at = ?, uncertain_at = NULL, uncertainty_code = NULL
           WHERE attempt_id = ?`,
        )
        .run(asString(commit.committed_at), attempt.attemptId);
      return {
        state: 'committed',
        result: stored.completionLabel === '稿件已导入'
          ? { ...stored, firstWindow: this.getManuscriptWindow(stored.manuscriptId, stored.branchId, null) }
          : stored,
      };
    } catch {
      const now = new Date().toISOString();
      this.#authority
        .prepare(
          `UPDATE import_commit_attempts
           SET state = 'uncertain', committed_at = NULL, uncertain_at = COALESCE(uncertain_at, ?),
                uncertainty_code = 'COMMIT_PROOF_INCONCLUSIVE', completion_acknowledged_at = NULL
           WHERE attempt_id = ?`,
        )
        .run(now, attempt.attemptId);
      return { state: 'uncertain' };
    }
  }

  #rememberVerifiedCommitObject(commitId: string): void {
    this.#verifiedCommitObjects.delete(commitId);
    this.#verifiedCommitObjects.add(commitId);
    while (this.#verifiedCommitObjects.size > 32) {
      const oldest = this.#verifiedCommitObjects.values().next().value as string | undefined;
      if (oldest === undefined) break;
      this.#verifiedCommitObjects.delete(oldest);
    }
  }

  #markCommitAttemptUncertain(commitId: string): void {
    this.#verifiedCommitObjects.delete(commitId);
    this.#authority.prepare(
      `UPDATE import_commit_attempts
       SET state = 'uncertain', committed_at = NULL, uncertain_at = COALESCE(uncertain_at, ?),
           uncertainty_code = 'COMMIT_PROOF_INCONCLUSIVE', completion_acknowledged_at = NULL
       WHERE attempt_id = ? AND state IN ('committed', 'uncertain')`,
    ).run(new Date().toISOString(), commitId);
  }

  async #recoveryProjection(
    draftId: string,
    kind: ImportDraftRecoveryProjection['kind'],
  ): Promise<ImportDraftRecoveryProjection> {
    let snapshot: DraftSnapshot | null = null;
    let staged: StagedImportProjection | null = null;
    let originalFileAccess: OriginalFileAccessProjection = {
      state: 'unknown',
      label: '旧版草稿未保留原始路径，将从完整暂存快照继续',
    };
    try {
      snapshot = this.#loadDraftSnapshot(draftId);
      await this.#inspectSnapshotCompleteness(snapshot);
      originalFileAccess = await this.#originalFileAccess(snapshot);
      staged = this.#stagedProjection(snapshot);
    } catch {
      snapshot = null;
      staged = null;
    }
    const row = one(
      this.#authority
        .prepare(
          `SELECT d.draft_version, d.staged_at, d.display_name, d.state, d.reviewed_title,
                  d.reviewed_target_choice_id, d.reviewed_target_kind, d.reviewed_existing_book_id,
                  d.reviewed_relationship, a.attempt_id
           FROM import_drafts d
           LEFT JOIN import_commit_attempts a ON a.draft_id = d.draft_id
           WHERE d.draft_id = ?`,
        )
        .all(draftId) as SqlRow[],
      'DRAFT_NOT_FOUND',
      '导入草稿不存在。',
    );
    const reviewedTarget = row.reviewed_target_choice_id === null ? null : asString(row.reviewed_target_choice_id);
    requireStore(
      reviewedTarget === null || reviewedTarget === 'new-book' || reviewedTarget === 'new-book-distinct-intended-work',
      'STORE_CORRUPT',
      '导入复核目标无效。',
    );
    const reviewedTargetKind = row.reviewed_target_kind === null ? null : asString(row.reviewed_target_kind);
    const targetBookId = row.reviewed_existing_book_id === null ? null : asString(row.reviewed_existing_book_id);
    const relationship = row.reviewed_relationship === null ? null : asString(row.reviewed_relationship);
    let targetLabel: string | null = null;
    if (reviewedTargetKind === 'existing-book' && targetBookId !== null) {
      const target = this.#authority.prepare('SELECT title FROM books WHERE book_id = ?').get(targetBookId) as SqlRow | undefined;
      targetLabel = target === undefined ? null : asString(target.title);
    } else {
      targetLabel = reviewedTarget === 'new-book'
        ? '新建图书'
        : reviewedTarget === 'new-book-distinct-intended-work'
          ? '新建图书（作为不同作品）'
          : null;
    }
    const attemptId = row.attempt_id === null ? null : asString(row.attempt_id);
    const draftState = asString(row.state);
    return {
      kind,
      draftId,
      draftVersion: asNumber(row.draft_version),
      stagedAt: asString(row.staged_at),
      sourceDisplayName: asString(row.display_name),
      snapshotState: staged === null ? 'reselection-required' : 'complete',
      lastCompletedStep:
        kind === 'abandonment-cleanup'
          ? 'abandonment-cleanup'
          : kind === 'outcome-uncertain'
          ? 'commit-outcome-uncertain'
          : attemptId
            ? 'commit-attempt'
            : draftState === 'reviewed'
              ? 'review'
              : 'staging',
      reviewedTitle: row.reviewed_title === null ? null : asString(row.reviewed_title),
      targetLabel,
      targetBookId,
      relationshipLabel: relationship === 'first-manuscript' || relationship === 'new-book-first-manuscript'
        ? '作为首份稿件导入'
        : relationship === 'source-only'
          ? '作为来源材料导入'
          : relationship === 'reimport' ? '重新导入主稿件' : null,
      originalFileAccess,
      staged,
      commitAttemptId: attemptId,
      supportCode:
        kind === 'abandonment-cleanup'
          ? 'ABANDON_CLEANUP_PENDING'
          : kind === 'outcome-uncertain'
          ? 'COMMIT_PROOF_INCONCLUSIVE'
          : staged === null
            ? 'SNAPSHOT_RESELECTION_REQUIRED'
            : null,
    };
  }

  #assertRecoveredCommitGraph(result: StoredImportCommitProjection): void {
    if ('sourceImportRecordId' in result) {
      this.#assertRecoveredSourceImportGraph(result);
      return;
    }
    if ('reimportRecordId' in result) {
      this.#assertRecoveredReimportGraph(result);
      return;
    }
    this.#assertForeignKeys(this.#authority);
    const counts = one(
      this.#authority
        .prepare(
          `SELECT
             (SELECT count(*) FROM books WHERE book_id = ?) books,
             (SELECT count(*) FROM book_dimension_sets WHERE book_id = ?) dimension_sets,
             (SELECT count(*) FROM book_dimensions bd
                JOIN book_dimension_sets bds ON bds.dimension_set_id = bd.dimension_set_id
                WHERE bds.book_id = ?) dimensions,
             (SELECT count(*) FROM manuscripts WHERE manuscript_id = ? AND book_id = ? AND role = 'primary') manuscripts,
             (SELECT count(*) FROM manuscript_branches
                WHERE branch_id = ? AND manuscript_id = ? AND base_revision_id = ?) branches,
             (SELECT count(*) FROM manuscript_revisions
                WHERE revision_id = ? AND manuscript_id = ? AND branch_id = ?
                  AND ordinal = 1 AND revision_label = 'r1' AND parent_revision_id IS NULL) revisions,
             (SELECT count(*) FROM manuscript_block_versions WHERE revision_id = ?) revision_blocks,
             (SELECT count(*) FROM working_blocks WHERE branch_id = ?) working_blocks,
             (SELECT count(*) FROM workflow_instances
                WHERE book_id = ? AND manuscript_id = ? AND state = 'active'
                  AND profile_id = ? AND profile_version = ? AND profile_digest = ?
                  AND native_profile_id = ? AND native_profile_version = ? AND native_profile_digest = ?) workflows,
             (SELECT count(*) FROM manuscript_import_records
                WHERE import_record_id = ? AND commit_id = ? AND book_id = ? AND manuscript_id = ?
                  AND resulting_revision_id = ?) import_records,
             (SELECT count(*) FROM source_provenance sp
                JOIN manuscript_import_records ir
                  ON ir.source_version_id = sp.source_version_id AND ir.provenance_id = sp.provenance_id
                WHERE ir.import_record_id = ?) provenance`,
        )
        .all(
          result.bookId,
          result.bookId,
          result.bookId,
          result.manuscriptId,
          result.bookId,
          result.branchId,
          result.manuscriptId,
          result.revisionId,
          result.revisionId,
          result.manuscriptId,
          result.branchId,
          result.revisionId,
          result.branchId,
          result.bookId,
          result.manuscriptId,
          this.#workflowProfile.projection.id,
          this.#workflowProfile.projection.version,
          this.#workflowProfile.projection.digest,
          this.#workflowProfile.native.id,
          this.#workflowProfile.native.version,
          this.#workflowProfile.native.digest,
          result.importRecordId,
          result.commitId,
          result.bookId,
          result.manuscriptId,
          result.revisionId,
          result.importRecordId,
        ) as SqlRow[],
      'COMMIT_PROOF_INCONCLUSIVE',
      '无法核对完整导入记录图。',
    );
    const revisionBlocks = asNumber(counts.revision_blocks);
    requireStore(
      asNumber(counts.books) === 1 &&
        asNumber(counts.dimension_sets) === 1 &&
        asNumber(counts.dimensions) === 8 &&
        asNumber(counts.manuscripts) === 1 &&
        asNumber(counts.branches) === 1 &&
        asNumber(counts.revisions) === 1 &&
        revisionBlocks > 0 &&
        asNumber(counts.working_blocks) === revisionBlocks &&
        asNumber(counts.workflows) === 1 &&
        asNumber(counts.import_records) === 1 &&
        asNumber(counts.provenance) === 1,
      'COMMIT_PROOF_INCONCLUSIVE',
      '导入提交未形成完整权威记录图。',
    );
  }

  #assertRecoveredReimportGraph(result: ManuscriptReimportCommitProjection): void {
    this.#assertForeignKeys(this.#authority);
    const row = one(this.#authority.prepare(
      `SELECT
         (SELECT count(*) FROM manuscript_reimport_records
          WHERE reimport_record_id = ? AND commit_id = ? AND book_id = ? AND manuscript_id = ?
            AND branch_id = ? AND source_version_id = ? AND provenance_id = ?
            AND previous_revision_id = ? AND result_kind = ?
            AND resulting_revision_id IS ?) records,
         (SELECT count(*) FROM source_versions WHERE source_version_id = ? AND book_id = ?) sources,
         (SELECT count(*) FROM source_provenance WHERE provenance_id = ? AND source_version_id = ?) provenance`,
    ).all(
      result.reimportRecordId, result.commitId, result.bookId, result.manuscriptId, result.branchId,
      result.sourceVersionId, result.provenanceId, result.previousRevisionId, result.resultKind,
      result.resultingRevisionId, result.sourceVersionId, result.bookId, result.provenanceId, result.sourceVersionId,
    ) as SqlRow[], 'COMMIT_PROOF_INCONCLUSIVE', '无法核对稿件重新导入记录图。');
    requireStore(asNumber(row.records) === 1 && asNumber(row.sources) === 1 && asNumber(row.provenance) === 1,
      'COMMIT_PROOF_INCONCLUSIVE', '稿件重新导入提交未形成完整权威记录图。');
  }

  #assertRecoveredSourceImportGraph(result: SourceImportCommitProjection): void {
    this.#assertForeignKeys(this.#authority);
    const row = one(this.#authority.prepare(
      `SELECT
         (SELECT count(*) FROM books WHERE book_id = ?) books,
         (SELECT count(*) FROM book_dimension_sets WHERE book_id = ?) dimension_sets,
         (SELECT count(*) FROM book_dimensions bd
            JOIN book_dimension_sets bds ON bds.dimension_set_id = bd.dimension_set_id
            WHERE bds.book_id = ?) dimensions,
         (SELECT count(*) FROM source_versions
            WHERE source_version_id = ? AND book_id = ?) source_versions,
         (SELECT count(*) FROM source_provenance
            WHERE provenance_id = ? AND source_version_id = ?) provenance,
         (SELECT count(*) FROM source_import_records
            WHERE source_import_record_id = ? AND commit_id = ? AND book_id = ?
              AND source_version_id = ? AND provenance_id = ?) source_import_records`,
    ).all(
      result.bookId,
      result.bookId,
      result.bookId,
      result.sourceVersionId,
      result.bookId,
      result.provenance.provenanceId,
      result.sourceVersionId,
      result.sourceImportRecordId,
      result.commitId,
      result.bookId,
      result.sourceVersionId,
      result.provenance.provenanceId,
    ) as SqlRow[], 'COMMIT_PROOF_INCONCLUSIVE', '无法核对完整来源导入记录图。');
    requireStore(
      asNumber(row.books) === 1 && asNumber(row.dimension_sets) === 1 && asNumber(row.dimensions) === 8 &&
        asNumber(row.source_versions) === 1 && asNumber(row.provenance) === 1 &&
        asNumber(row.source_import_records) === 1,
      'COMMIT_PROOF_INCONCLUSIVE',
      '来源导入提交未形成完整权威记录图。',
    );
  }

  async #verifyCommittedContentObject(result: StoredImportCommitProjection): Promise<void> {
    const recordQuery = result.completionLabel === '稿件已导入'
      ? {
          sql: `SELECT co.object_digest, co.relative_key, co.byte_length
                FROM manuscript_import_records ir
                JOIN source_versions sv ON sv.source_version_id = ir.source_version_id
                JOIN content_objects co ON co.object_digest = sv.object_digest
                WHERE ir.import_record_id = ? AND ir.commit_id = ?`,
          recordId: result.importRecordId,
        }
      : result.completionLabel === '来源材料已导入'
        ? {
            sql: `SELECT co.object_digest, co.relative_key, co.byte_length
                  FROM source_import_records sir
                  JOIN source_versions sv ON sv.source_version_id = sir.source_version_id
                  JOIN content_objects co ON co.object_digest = sv.object_digest
                  WHERE sir.source_import_record_id = ? AND sir.commit_id = ?`,
            recordId: result.sourceImportRecordId,
          }
        : {
            sql: `SELECT co.object_digest, co.relative_key, co.byte_length
                  FROM manuscript_reimport_records rr
                  JOIN source_versions sv ON sv.source_version_id = rr.source_version_id
                  JOIN content_objects co ON co.object_digest = sv.object_digest
                  WHERE rr.reimport_record_id = ? AND rr.commit_id = ?`,
            recordId: result.reimportRecordId,
          };
    const row = one(
      this.#authority
        .prepare(recordQuery.sql)
        .all(recordQuery.recordId, result.commitId) as SqlRow[],
      'COMMIT_PROOF_INCONCLUSIVE',
      '导入提交来源对象记录缺失。',
    );
    const digest = asString(row.object_digest);
    requireStore(
      digest === result.source.sourceSha256 && asNumber(row.byte_length) === result.source.sourceBytes,
      'COMMIT_PROOF_INCONCLUSIVE',
      '导入提交来源对象身份不一致。',
    );
    const path = this.#contentObjectPath(digest, asString(row.relative_key));
    const info = await lstat(path);
    requireStore(
      info.isFile() && !info.isSymbolicLink() && info.size === result.source.sourceBytes,
      'COMMIT_PROOF_INCONCLUSIVE',
      '导入提交来源对象长度无效。',
    );
    requireStore(
      (await digestFile(path)) === digest,
      'COMMIT_PROOF_INCONCLUSIVE',
      '导入提交来源对象摘要无效。',
    );
  }

  async #originalFileAccess(snapshot: DraftSnapshot): Promise<OriginalFileAccessProjection> {
    if (snapshot.selectedPath === null) {
      return { state: 'unknown', label: '旧版草稿未保留原始路径，将从完整暂存快照继续' };
    }
    try {
      const info = await lstat(snapshot.selectedPath);
      if (!info.isFile() || info.isSymbolicLink() || info.size !== snapshot.sourceBytes) {
        return { state: 'changed', label: '原始所选路径的文件已变化，将从完整暂存快照继续' };
      }
      const currentPath = await realpath(snapshot.selectedPath);
      if (currentPath !== snapshot.selectedPath || (await digestFile(currentPath)) !== snapshot.sourceDigest) {
        return { state: 'changed', label: '原始所选路径的文件已变化，将从完整暂存快照继续' };
      }
      return { state: 'available-exact', label: '原始所选文件仍可访问且身份一致' };
    } catch {
      return { state: 'unavailable', label: '原始所选文件已无法访问，将从完整暂存快照继续' };
    }
  }

  async #inspectSnapshotCompleteness(snapshot: DraftSnapshot): Promise<void> {
    const object = one(
      this.#authority
        .prepare('SELECT relative_key, byte_length FROM content_objects WHERE object_digest = ?')
        .all(snapshot.objectDigest) as SqlRow[],
      'SNAPSHOT_RESELECTION_REQUIRED',
      '暂存对象记录缺失。',
    );
    requireStore(
      snapshot.objectDigest === snapshot.sourceDigest && asNumber(object.byte_length) === snapshot.sourceBytes,
      'SNAPSHOT_RESELECTION_REQUIRED',
      '暂存对象身份记录不一致。',
    );
    const path = this.#contentObjectPath(snapshot.objectDigest, asString(object.relative_key));
    const info = await lstat(path);
    requireStore(
      info.isFile() && !info.isSymbolicLink() && info.size === snapshot.sourceBytes,
      'SNAPSHOT_RESELECTION_REQUIRED',
      '暂存对象长度无效。',
    );
    requireStore(
      (await digestFile(path)) === snapshot.sourceDigest,
      'SNAPSHOT_RESELECTION_REQUIRED',
      '暂存对象摘要无效。',
    );
    this.#boundedCall(() => this.#boundedAuthority.assertStagedDraftIntegrity(snapshot.draftId));
  }

  async #revalidateSnapshot(snapshot: DraftSnapshot): Promise<{ snapshot: DraftSnapshot; parserDrift: boolean }> {
    try {
      const object = one(
        this.#authority
          .prepare('SELECT relative_key, byte_length FROM content_objects WHERE object_digest = ?')
          .all(snapshot.objectDigest) as SqlRow[],
        'SNAPSHOT_RESELECTION_REQUIRED',
        '暂存对象记录缺失。',
      );
      const relativeKey = asString(object.relative_key);
      const byteLength = asNumber(object.byte_length);
      requireStore(
        snapshot.objectDigest === snapshot.sourceDigest && byteLength === snapshot.sourceBytes,
        'SNAPSHOT_RESELECTION_REQUIRED',
        '暂存对象身份记录不一致。',
      );
      const objectPath = this.#contentObjectPath(snapshot.objectDigest, relativeKey);
      const info = await lstat(objectPath);
      requireStore(
        info.isFile() && !info.isSymbolicLink() && info.size === snapshot.sourceBytes,
        'SNAPSHOT_RESELECTION_REQUIRED',
        '暂存对象长度无效。',
      );
      requireStore(
        (await digestFile(objectPath)) === snapshot.sourceDigest,
        'SNAPSHOT_RESELECTION_REQUIRED',
        '暂存对象摘要无效。',
      );
      const ingested = await this.#parseIntoIngest(snapshot.draftId, objectPath, snapshot.displayName);
      try {
        const { parsed } = ingested;
        requireStore(
          parsed.sourceDigest === snapshot.sourceDigest && parsed.archiveBytes === snapshot.sourceBytes,
          'SNAPSHOT_RESELECTION_REQUIRED',
          '暂存来源身份无法重建。',
        );
        if (parsed.parserIdentity !== snapshot.parserIdentity) {
          return { snapshot: this.#refreshSnapshotForParserDrift(snapshot, ingested), parserDrift: true };
        }
        requireStore(
          parsed.contentDigest === snapshot.contentDigest &&
            parsed.structureDigest === snapshot.structureDigest &&
            parsed.blockCount === snapshot.blockCount &&
            parsed.characterCount === snapshot.characterCount &&
            canonicalJson(parsed.fidelity) === canonicalJson(snapshot.fidelity) &&
            parsed.titleSuggestion.value === snapshot.titleSuggestion &&
            parsed.titleSuggestion.sourceLabel === snapshot.titleSource &&
            this.#ingestMatchesSnapshot(ingested.ingestId, snapshot.draftId),
          'SNAPSHOT_RESELECTION_REQUIRED',
          '暂存解析或预检状态不完整。',
        );
        this.#boundedCall(() => this.#boundedAuthority.assertStagedDraftIntegrity(snapshot.draftId));
        return { snapshot, parserDrift: false };
      } finally {
        this.#discardIngest(ingested.ingestId);
      }
    } catch (error) {
      if (error instanceof StoreFatalError) throw error;
      if (error instanceof StoreError && error.code === 'DRAFT_VERSION_CHANGED') throw error;
      throw new StoreError('SNAPSHOT_RESELECTION_REQUIRED', '暂存快照不完整或已损坏，需要精确重选原文件。');
    }
  }

  #refreshSnapshotForParserDrift(snapshot: DraftSnapshot, ingested: IngestedDocx): DraftSnapshot {
    const nextVersion = snapshot.version + 1;
    const now = new Date().toISOString();
    this.#transaction(this.#authority, () => {
      this.#authority.prepare('DELETE FROM manuscript_reimport_comparisons WHERE draft_id = ?').run(snapshot.draftId);
      this.#authority.prepare('DELETE FROM staged_import_snapshots WHERE draft_id = ?').run(snapshot.draftId);
      this.#promoteIngestSnapshot(snapshot.draftId, ingested, now);
      const update = this.#authority
        .prepare(
          `UPDATE import_drafts
           SET state = 'staged', draft_version = ?, reviewed_title = NULL, reviewed_target_choice_id = NULL,
               reviewed_target_kind = NULL, reviewed_existing_book_id = NULL,
               reviewed_relationship = NULL, reviewed_book_state_digest = NULL,
               reviewed_reuse_source_version_id = NULL,
               reviewed_lineage_status = NULL, reviewed_lineage_source_version_id = NULL,
               reviewed_checkpoint_revision_id = NULL, reviewed_manuscript_id = NULL, reviewed_branch_id = NULL,
               review_digest = NULL, reviewed_at = NULL
           WHERE draft_id = ? AND draft_version = ? AND state IN ('staged', 'reviewed')`,
        )
        .run(nextVersion, snapshot.draftId, snapshot.version);
      requireStore(update.changes === 1, 'DRAFT_VERSION_CHANGED', '导入草稿在重新预检时已变化。');
      this.#authority.prepare("DELETE FROM import_commit_attempts WHERE draft_id = ? AND state = 'prepared'").run(snapshot.draftId);
      this.#boundedCall(() => this.#boundedAuthority.assertStagedDraftIntegrity(snapshot.draftId));
    });
    return this.#loadDraftSnapshot(snapshot.draftId);
  }

  #invalidateReview(snapshot: DraftSnapshot): DraftSnapshot {
    requireStore(snapshot.state === 'reviewed', 'DRAFT_STATE_CHANGED', '只有已复核草稿可以失效旧复核。');
    const nextVersion = snapshot.version + 1;
    this.#transaction(this.#authority, () => {
      this.#authority.prepare('DELETE FROM manuscript_reimport_comparisons WHERE draft_id = ?').run(snapshot.draftId);
      const update = this.#authority
        .prepare(
          `UPDATE import_drafts
           SET state = 'staged', draft_version = ?, reviewed_title = NULL, reviewed_target_choice_id = NULL,
               reviewed_target_kind = NULL, reviewed_existing_book_id = NULL,
               reviewed_relationship = NULL, reviewed_book_state_digest = NULL,
               reviewed_reuse_source_version_id = NULL,
               reviewed_lineage_status = NULL, reviewed_lineage_source_version_id = NULL,
               reviewed_checkpoint_revision_id = NULL, reviewed_manuscript_id = NULL, reviewed_branch_id = NULL,
               review_digest = NULL, reviewed_at = NULL
           WHERE draft_id = ? AND draft_version = ? AND state = 'reviewed'`,
        )
        .run(nextVersion, snapshot.draftId, snapshot.version);
      requireStore(update.changes === 1, 'DRAFT_VERSION_CHANGED', '导入草稿在复核失效时已变化。');
      this.#authority.prepare("DELETE FROM import_commit_attempts WHERE draft_id = ? AND state = 'prepared'").run(snapshot.draftId);
    });
    return this.#loadDraftSnapshot(snapshot.draftId);
  }

  async #persistContentObject(selectedPath: string, parsed: ParsedDocx): Promise<string> {
    this.#requireNoAbandonmentCleanupForObject(parsed.sourceDigest);
    const relativeKey = posix.join('sha256', parsed.sourceDigest.slice(0, 2), `${parsed.sourceDigest}.docx`);
    const objectDirectory = await ensureCanonicalDataDirectory(
      this.#dataRoot,
      'objects',
      'sha256',
      parsed.sourceDigest.slice(0, 2),
    );
    const objectFileName = `${parsed.sourceDigest}.docx`;
    const inspectedObject = await inspectCanonicalDataFile(this.#dataRoot, objectDirectory, objectFileName);
    const objectPath = inspectedObject.path;
    requireStore(isInside(this.#objectsRoot, objectPath), 'OBJECT_PATH_INVALID', '对象路径越界。');
    if (!inspectedObject.exists || (await digestFile(objectPath)) !== parsed.sourceDigest) {
      const temporary = `${objectPath}.${process.pid}.${randomUUID()}.partial`;
      const temporaryName = basename(temporary);
      requireStore(
        !(await inspectCanonicalDataFile(this.#dataRoot, objectDirectory, temporaryName)).exists,
        'OBJECT_PATH_INVALID',
        '暂存对象路径已存在。',
      );
      try {
        await copyFile(selectedPath, temporary, constants.COPYFILE_EXCL);
        const inspectedTemporary = await inspectCanonicalDataFile(this.#dataRoot, objectDirectory, temporaryName);
        requireStore(
          inspectedTemporary.exists && inspectedTemporary.path === temporary,
          'OBJECT_PATH_INVALID',
          '暂存对象路径无效。',
        );
        const handle = await open(temporary, 'r+');
        try {
          await handle.sync();
        } finally {
          await handle.close();
        }
        requireStore((await digestFile(temporary)) === parsed.sourceDigest, 'OBJECT_VERIFY_FAILED', '暂存对象校验失败。');
        await rename(temporary, objectPath);
        const activated = await inspectCanonicalDataFile(this.#dataRoot, objectDirectory, objectFileName);
        requireStore(
          activated.exists && activated.path === objectPath && (await digestFile(objectPath)) === parsed.sourceDigest,
          'OBJECT_PATH_INVALID',
          '暂存对象激活无效。',
        );
      } catch (error) {
        const cleanup = await inspectCanonicalDataFile(this.#dataRoot, objectDirectory, temporaryName);
        if (cleanup.exists) await rm(cleanup.path, { force: true });
        throw error;
      }
    }
    return relativeKey;
  }

  async #parseIntoIngest(
    draftId: string,
    path: string,
    displayName: string,
    options: { signal?: AbortSignal; onArchiveProgress?: (bytes: number) => void } = {},
  ): Promise<IngestedDocx> {
    requireStore(UUID_PATTERN.test(draftId), 'DRAFT_INVALID', '导入草稿标识无效。');
    const ingestId = randomUUID();
    let inserted = 0;
    let startOffset = 0;
    const batch: Array<{
      stagedBlockId: string;
      position: number;
      kind: ParsedDocxBlock['kind'];
      level: ParsedDocxBlock['level'];
      text: string;
      digest: string;
      startOffset: number;
      graphemeLength: number;
    }> = [];
    const insert = this.#ingest.prepare(
      `INSERT INTO import_ingest_blocks(
         ingest_id, draft_id, staged_block_id, position, kind, level, text, digest, start_offset, grapheme_length
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const flushBatch = (): void => {
      if (batch.length === 0) return;
      this.#ingest.exec('BEGIN IMMEDIATE');
      try {
        for (const row of batch) {
          insert.run(
            ingestId,
            draftId,
            row.stagedBlockId,
            row.position,
            row.kind,
            row.level,
            row.text,
            row.digest,
            row.startOffset,
            row.graphemeLength,
          );
        }
        this.#ingest.exec('COMMIT');
        inserted += batch.length;
        batch.length = 0;
      } catch (error) {
        try {
          this.#ingest.exec('ROLLBACK');
        } catch (rollbackError) {
          this.#poisoned = true;
          throw new StoreFatalError(new AggregateError([error, rollbackError], 'SQLite ingest rollback failed.'));
        }
        throw error;
      }
    };
    try {
      const parsed = await parseDocx(path, displayName, (block: ParsedDocxBlock) => {
        const stagedBlockId = `blk_${sha256(`${draftId}\u0000${block.position}\u0000${block.digest}`).slice(0, 24)}`;
        batch.push({
          stagedBlockId,
          position: block.position,
          kind: block.kind,
          level: block.level,
          text: block.text,
          digest: block.digest,
          startOffset,
          graphemeLength: block.graphemeLength,
        });
        startOffset += block.graphemeLength;
        if (batch.length === INGEST_BATCH_SIZE) flushBatch();
      }, undefined, options);
      flushBatch();
      requireStore(
        parsed.blockCount === inserted && parsed.characterCount === startOffset && inserted > 0,
        'SNAPSHOT_INCOMPLETE',
        '暂存解析未形成完整有界摄入。',
      );
      return { ingestId, parsed };
    } catch (error) {
      this.#discardIngest(ingestId);
      throw error;
    }
  }

  #discardIngest(ingestId: string): void {
    requireStore(UUID_PATTERN.test(ingestId), 'SNAPSHOT_INCOMPLETE', '暂存摄入标识无效。');
    try {
      this.#ingest.prepare('DELETE FROM import_ingest_blocks WHERE ingest_id = ?').run(ingestId);
      const remaining = this.#ingest
        .prepare('SELECT count(*) total FROM import_ingest_blocks WHERE ingest_id = ?')
        .get(ingestId) as SqlRow | undefined;
      requireStore(remaining !== undefined && asNumber(remaining.total) === 0, 'SNAPSHOT_INCOMPLETE', '暂存摄入清理无法确认。');
    } catch (error) {
      this.#poisoned = true;
      throw new StoreFatalError(error);
    }
  }

  #promoteIngestSnapshot(draftId: string, ingested: IngestedDocx, createdAt: string): void {
    const { parsed } = ingested;
    this.#authority
      .prepare(
        `INSERT INTO staged_import_snapshots(
           draft_id, parser_identity, source_digest, content_digest, structure_digest, block_count,
           fidelity_json, title_suggestion, title_source, snapshot_created_at, character_count
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        draftId,
        parsed.parserIdentity,
        parsed.sourceDigest,
        parsed.contentDigest,
        parsed.structureDigest,
        parsed.blockCount,
        canonicalJson(parsed.fidelity),
        parsed.titleSuggestion.value,
        parsed.titleSuggestion.sourceLabel,
        createdAt,
        parsed.characterCount,
      );
    const inserted = this.#authority.prepare(
      `INSERT INTO staged_import_blocks(
         draft_id, staged_block_id, position, kind, level, text, digest, start_offset, grapheme_length
       ) SELECT ?, staged_block_id, position, kind, level, text, digest, start_offset, grapheme_length
         FROM import_ingest_blocks WHERE ingest_id = ? AND draft_id = ? ORDER BY position`,
    ).run(draftId, ingested.ingestId, draftId);
    requireStore(inserted.changes === parsed.blockCount, 'SNAPSHOT_INCOMPLETE', '暂存摄入无法完整提升为权威快照。');
    const removed = this.#authority
      .prepare('DELETE FROM import_ingest_blocks WHERE ingest_id = ? AND draft_id = ?')
      .run(ingested.ingestId, draftId);
    requireStore(removed.changes === parsed.blockCount, 'SNAPSHOT_INCOMPLETE', '暂存摄入无法完成原子清理。');
  }

  #ingestMatchesSnapshot(ingestId: string, draftId: string): boolean {
    const difference = this.#authority.prepare(
      `SELECT
         (SELECT count(*) FROM (
           SELECT staged_block_id, position, kind, level, text, digest, start_offset, grapheme_length
           FROM import_ingest_blocks WHERE ingest_id = ? AND draft_id = ?
           EXCEPT
           SELECT staged_block_id, position, kind, level, text, digest, start_offset, grapheme_length
           FROM staged_import_blocks WHERE draft_id = ?
         )) +
         (SELECT count(*) FROM (
           SELECT staged_block_id, position, kind, level, text, digest, start_offset, grapheme_length
           FROM staged_import_blocks WHERE draft_id = ?
           EXCEPT
           SELECT staged_block_id, position, kind, level, text, digest, start_offset, grapheme_length
           FROM import_ingest_blocks WHERE ingest_id = ? AND draft_id = ?
         )) total`,
    ).get(ingestId, draftId, draftId, draftId, ingestId, draftId) as SqlRow | undefined;
    return difference !== undefined && asNumber(difference.total) === 0;
  }

  #contentObjectPath(objectDigest: string, relativeKey: string): string {
    requireStore(/^[0-9a-f]{64}$/.test(objectDigest), 'OBJECT_PATH_INVALID', '对象摘要无效。');
    const expectedKey = posix.join('sha256', objectDigest.slice(0, 2), `${objectDigest}.docx`);
    requireStore(relativeKey === expectedKey, 'OBJECT_PATH_INVALID', '对象相对路径无效。');
    const path = resolve(this.#objectsRoot, ...relativeKey.split('/'));
    requireStore(isInside(this.#objectsRoot, path), 'OBJECT_PATH_INVALID', '对象路径越界。');
    return path;
  }

  #loadAbandonmentCleanupIntent(draftId: string): AbandonmentCleanupIntent | null {
    const rows = this.#authority
      .prepare(
        `SELECT draft_id, object_digest, expected_draft_version, relative_key, state
         FROM import_abandonment_cleanup_intents
         WHERE draft_id = ?`,
      )
      .all(draftId) as SqlRow[];
    requireStore(rows.length <= 1, 'STORE_CORRUPT', '导入草稿关联了多个放弃清理意图。');
    if (rows.length === 0) return null;
    const row = rows[0]!;
    const state = asString(row.state);
    requireStore(state === 'prepared' || state === 'bytes-removed', 'STORE_CORRUPT', '放弃清理意图状态无效。');
    return {
      draftId: asString(row.draft_id),
      objectDigest: asString(row.object_digest),
      expectedDraftVersion: asNumber(row.expected_draft_version),
      relativeKey: asString(row.relative_key),
      state,
    };
  }

  #requireNoAbandonmentCleanupIntent(draftId: string): void {
    requireStore(
      this.#loadAbandonmentCleanupIntent(draftId) === null,
      'ABANDON_CLEANUP_PENDING',
      '该导入已进入持久放弃清理；只能重试清理，不能继续、重选或提交。',
    );
  }

  #requireNoAbandonmentCleanupForObject(objectDigest: string): void {
    const pending = one(
      this.#authority
        .prepare('SELECT count(*) pending FROM import_abandonment_cleanup_intents WHERE object_digest = ?')
        .all(objectDigest) as SqlRow[],
      'STORE_CORRUPT',
      '无法核对暂存对象清理状态。',
    );
    requireStore(
      asNumber(pending.pending) === 0,
      'ABANDON_CLEANUP_PENDING',
      '该暂存对象已进入持久放弃清理；清理完成前不能重新持久化或创建权威引用。',
    );
  }

  #assertAbandonmentCleanupAuthority(intent: AbandonmentCleanupIntent): void {
    const proof = one(
      this.#authority
        .prepare(
          `SELECT
             (SELECT count(*)
                FROM import_abandonment_cleanup_intents i
                WHERE i.draft_id = ? AND i.object_digest = ? AND i.expected_draft_version = ?
                  AND i.relative_key = ?) intents,
             (SELECT count(*)
                FROM import_drafts d
                WHERE d.draft_id = ? AND d.state IN ('staged', 'reviewed')
                  AND d.draft_version = ? AND d.object_digest = ?) exact_drafts,
             (SELECT count(*) FROM import_drafts d WHERE d.object_digest = ?) draft_refs,
             (SELECT count(*) FROM source_versions sv WHERE sv.object_digest = ?) source_refs,
             (SELECT count(*) FROM import_commits c WHERE c.draft_id = ?) commits,
             (SELECT count(*) FROM import_commit_attempts a
                WHERE a.draft_id = ? AND a.state != 'prepared') unsafe_attempts,
             (SELECT count(*) FROM content_objects co
                WHERE co.object_digest = ? AND co.relative_key = ?) objects`,
        )
        .all(
          intent.draftId,
          intent.objectDigest,
          intent.expectedDraftVersion,
          intent.relativeKey,
          intent.draftId,
          intent.expectedDraftVersion,
          intent.objectDigest,
          intent.objectDigest,
          intent.objectDigest,
          intent.draftId,
          intent.draftId,
          intent.objectDigest,
          intent.relativeKey,
        ) as SqlRow[],
      'STORE_CORRUPT',
      '无法核对持久放弃清理意图。',
    );
    requireStore(
      asNumber(proof.intents) === 1 &&
        asNumber(proof.exact_drafts) === 1 &&
        asNumber(proof.draft_refs) === 1 &&
        asNumber(proof.source_refs) === 0 &&
        asNumber(proof.commits) === 0 &&
        asNumber(proof.unsafe_attempts) === 0 &&
        asNumber(proof.objects) === 1,
      'ABANDON_CLEANUP_INCONCLUSIVE',
      '持久放弃清理证据不再完整；已阻止删除、继续和新权威引用。',
    );
  }

  async #contentObjectIsAbsent(intent: AbandonmentCleanupIntent): Promise<boolean> {
    try {
      await lstat(this.#contentObjectPath(intent.objectDigest, intent.relativeKey));
      return false;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return true;
      throw new StoreError('ABANDON_CLEANUP_FAILED', '无法证明未共享暂存对象已经删除；放弃清理意图仍保留。');
    }
  }

  #requireContentObjectAbsentForFinalization(intent: AbandonmentCleanupIntent): void {
    try {
      lstatSync(this.#contentObjectPath(intent.objectDigest, intent.relativeKey));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw new StoreError(
        'ABANDON_CLEANUP_INCONCLUSIVE',
        '无法在权威清理事务内证明暂存对象仍然缺失；持久放弃清理意图与导入草稿仍保留。',
      );
    }
    throw new StoreError(
      'ABANDON_CLEANUP_INCONCLUSIVE',
      '暂存对象在权威清理事务前再次出现；持久放弃清理意图与导入草稿仍保留。',
    );
  }

  async #resumeAbandonmentCleanupIntent(intentInput: AbandonmentCleanupIntent): Promise<void> {
    this.#assertAvailable();
    let intent = this.#loadAbandonmentCleanupIntent(intentInput.draftId);
    requireStore(intent !== null, 'ABANDON_CLEANUP_INCONCLUSIVE', '持久放弃清理意图缺失。');
    requireStore(
      intent.objectDigest === intentInput.objectDigest &&
        intent.expectedDraftVersion === intentInput.expectedDraftVersion &&
        intent.relativeKey === intentInput.relativeKey,
      'ABANDON_CLEANUP_INCONCLUSIVE',
      '持久放弃清理意图绑定已变化。',
    );
    this.#assertAbandonmentCleanupAuthority(intent);
    try {
      if (this.#control.induceAbandonObjectRemovalFailure) {
        throw new Error('E2E induced failure at the production unshared-object removal boundary.');
      }
      await rm(this.#contentObjectPath(intent.objectDigest, intent.relativeKey), { force: true });
      requireStore(
        await this.#contentObjectIsAbsent(intent),
        'ABANDON_CLEANUP_FAILED',
        '无法证明未共享暂存对象已经删除；放弃清理意图仍保留。',
      );
    } catch (error) {
      if (error instanceof StoreFatalError) throw error;
      throw new StoreError('ABANDON_CLEANUP_FAILED', '无法安全删除未共享的暂存对象；持久放弃清理意图与导入草稿仍保留。');
    }
    if (this.#control.interruptAfterAbandonObjectRemoval) {
      throw new StoreFatalError(new Error('E2E interruption after object removal and before authority cleanup finalization.'));
    }
    const removedAt = new Date().toISOString();
    this.#transaction(this.#authority, () => {
      const update = this.#authority
        .prepare(
          `UPDATE import_abandonment_cleanup_intents
           SET state = 'bytes-removed', bytes_removed_at = COALESCE(bytes_removed_at, ?)
           WHERE draft_id = ? AND object_digest = ? AND expected_draft_version = ?
             AND relative_key = ? AND state IN ('prepared', 'bytes-removed')`,
        )
        .run(
          removedAt,
          intent!.draftId,
          intent!.objectDigest,
          intent!.expectedDraftVersion,
          intent!.relativeKey,
        );
      requireStore(update.changes === 1, 'ABANDON_CLEANUP_INCONCLUSIVE', '无法持久确认暂存对象删除结果。');
      this.#assertForeignKeys(this.#authority);
    });
    intent = this.#loadAbandonmentCleanupIntent(intent.draftId);
    requireStore(intent?.state === 'bytes-removed', 'ABANDON_CLEANUP_INCONCLUSIVE', '暂存对象删除确认缺失。');
    requireStore(
      await this.#contentObjectIsAbsent(intent),
      'ABANDON_CLEANUP_INCONCLUSIVE',
      '暂存对象在权威清理前再次出现；已阻止最终清理。',
    );
    this.#transaction(this.#authority, () => {
      this.#assertAbandonmentCleanupAuthority(intent!);
      this.#requireContentObjectAbsentForFinalization(intent!);
      const intentDeletion = this.#authority
        .prepare(
          `DELETE FROM import_abandonment_cleanup_intents
           WHERE draft_id = ? AND object_digest = ? AND expected_draft_version = ?
             AND relative_key = ? AND state = 'bytes-removed'`,
        )
        .run(intent!.draftId, intent!.objectDigest, intent!.expectedDraftVersion, intent!.relativeKey);
      requireStore(intentDeletion.changes === 1, 'ABANDON_CLEANUP_INCONCLUSIVE', '放弃清理意图无法完成。');
      const draftDeletion = this.#authority
        .prepare(
          `DELETE FROM import_drafts
           WHERE draft_id = ? AND draft_version = ? AND object_digest = ?
             AND state IN ('staged', 'reviewed')`,
        )
        .run(intent!.draftId, intent!.expectedDraftVersion, intent!.objectDigest);
      requireStore(draftDeletion.changes === 1, 'ABANDON_CLEANUP_INCONCLUSIVE', '放弃清理草稿无法完成。');
      const references = one(
        this.#authority
          .prepare(
            `SELECT
               (SELECT count(*) FROM source_versions WHERE object_digest = ?) source_refs,
               (SELECT count(*) FROM import_drafts WHERE object_digest = ?) draft_refs`,
          )
          .all(intent!.objectDigest, intent!.objectDigest) as SqlRow[],
        'STORE_CORRUPT',
        '无法核对最终放弃清理引用。',
      );
      requireStore(
        asNumber(references.source_refs) === 0 && asNumber(references.draft_refs) === 0,
        'ABANDON_REFERENCE_CHANGED',
        '暂存对象在最终放弃清理时出现权威引用。',
      );
      const objectDeletion = this.#authority
        .prepare('DELETE FROM content_objects WHERE object_digest = ? AND relative_key = ?')
        .run(intent!.objectDigest, intent!.relativeKey);
      requireStore(objectDeletion.changes === 1, 'ABANDON_CLEANUP_INCONCLUSIVE', '暂存对象权威记录无法完成清理。');
      this.#assertForeignKeys(this.#authority);
    });
  }

  async #resumeAbandonmentCleanupIntents(): Promise<void> {
    const rows = this.#authority
      .prepare('SELECT draft_id FROM import_abandonment_cleanup_intents ORDER BY requested_at, draft_id')
      .all() as SqlRow[];
    for (const row of rows) {
      const intent = this.#loadAbandonmentCleanupIntent(asString(row.draft_id));
      if (!intent) continue;
      try {
        await this.#resumeAbandonmentCleanupIntent(intent);
      } catch (error) {
        if (error instanceof StoreFatalError) throw error;
      }
    }
  }

  async #sweepUnreferencedContentObjects(): Promise<void> {
    const rows = this.#authority
      .prepare(
        `SELECT co.object_digest, co.relative_key
         FROM content_objects co
         WHERE NOT EXISTS (SELECT 1 FROM source_versions sv WHERE sv.object_digest = co.object_digest)
           AND NOT EXISTS (SELECT 1 FROM import_drafts d WHERE d.object_digest = co.object_digest)
         ORDER BY co.object_digest`,
      )
      .all() as SqlRow[];
    for (const row of rows) {
      const digest = asString(row.object_digest);
      try {
        await rm(this.#contentObjectPath(digest, asString(row.relative_key)), { force: true });
      } catch {
        continue;
      }
      this.#transaction(this.#authority, () => {
        this.#authority
          .prepare(
            `DELETE FROM content_objects
             WHERE object_digest = ?
               AND NOT EXISTS (SELECT 1 FROM source_versions sv WHERE sv.object_digest = content_objects.object_digest)
               AND NOT EXISTS (SELECT 1 FROM import_drafts d WHERE d.object_digest = content_objects.object_digest)`,
          )
          .run(digest);
      });
    }
  }

  #normalizeMigratedReviewedTargets(): void {
    const rows = this.#authority
      .prepare(
        `SELECT draft_id
         FROM import_drafts
         WHERE state = 'reviewed' AND reviewed_target_choice_id IS NULL
           AND reviewed_relationship IN ('new-book-first-manuscript', 'first-manuscript')
           AND NOT EXISTS (
             SELECT 1 FROM import_abandonment_cleanup_intents i
             WHERE i.draft_id = import_drafts.draft_id
           )
         ORDER BY staged_at, draft_id`,
      )
      .all() as SqlRow[];
    for (const row of rows) {
      const draftId = asString(row.draft_id);
      let snapshot: DraftSnapshot;
      let confirmedTitle: string;
      let targetChoiceId: NewBookImportTargetChoiceId | null;
      try {
        snapshot = this.#loadDraftSnapshot(draftId);
        requireStore(snapshot.reviewedTitle !== null && snapshot.reviewDigest !== null, 'REVIEW_CHANGED', '旧版导入复核证据不完整。');
        confirmedTitle = safeTitle(snapshot.reviewedTitle);
        const plan = this.#requireFidelityPlan(snapshot);
        const identityFindings = this.#identityFindings(snapshot);
        targetChoiceId = reconstructReviewedTargetChoice(snapshot, confirmedTitle, plan, identityFindings);
      } catch {
        continue;
      }
      if (targetChoiceId === null) continue;
      this.#transaction(this.#authority, () => {
        this.#authority
          .prepare(
            `UPDATE import_drafts
             SET reviewed_target_choice_id = ?
             WHERE draft_id = ? AND state = 'reviewed' AND draft_version = ?
               AND review_digest = ? AND reviewed_target_choice_id IS NULL`,
          )
          .run(targetChoiceId, draftId, snapshot.version, snapshot.reviewDigest);
      });
    }
  }

  #stagedProjection(snapshot: DraftSnapshot): StagedImportProjection {
    const identityFindings = this.#identityFindings(snapshot);
    const targetChoice = newBookTargetChoice(identityFindings);
    const bookPage = this.listBooks(null);
    const existingBooks = bookPage.items.map((book) => {
      return {
        kind: 'existing-book' as const,
        id: `existing-book:${book.bookId}`,
        bookId: book.bookId,
        label: exactBookChoiceLabel(book.title, book.bookId, book.internalNumber),
        internalNumber: book.internalNumber,
        manuscriptState: book.manuscriptState,
        reimportLineageSourceVersionIds: book.reimportLineageSourceVersionIds,
        reimportLineagePageAfter: null,
        reimportLineagePreviousCursor: null,
        reimportLineageNextCursor: book.reimportLineageNextCursor,
        selected: false as const,
      };
    });
    return {
      draftId: snapshot.draftId,
      draftVersion: snapshot.version,
      source: {
        displayName: snapshot.displayName,
        format: 'DOCX',
        sourceSha256: snapshot.sourceDigest,
        sourceBytes: snapshot.sourceBytes,
        provenanceLabel: '本机文件选择器 · 本地解析 · 未联网',
      },
      titleSuggestion: { value: snapshot.titleSuggestion, sourceLabel: snapshot.titleSource },
      identityFindings,
      targetChoices: [targetChoice, ...existingBooks],
      nextBookCursor: bookPage.nextCursor,
      fidelity: snapshot.fidelity,
      detectedBlockCount: snapshot.blockCount,
    };
  }

  #emptyBookImportTarget(bookId: string): {
    bookId: string;
    stableIdentity: string;
    title: string;
    internalNumber: string | null;
    dimensionSetId: string;
    label: string;
    bookStateDigest: string;
  } {
    const overview = this.getBookOverview(bookId);
    requireStore(overview.manuscriptState.state === 'empty', 'BOOK_ALREADY_POPULATED', '所选图书已有稿件，不能导入首份稿件。');
    const bookRecord = overview.records[0];
    requireStore(bookRecord?.kind === 'book', 'BOOK_RECORD_GRAPH_INVALID', '所选图书记录不完整。');
    const bookStateDigest = sha256(canonicalJson({
      schema: 'ai7.empty-book-import-target/1',
      book: overview.book,
      dimensionSet: {
        dimensionSetId: bookRecord.dimensionSetId,
        definitionDigest: bookRecord.dimensionSetDigest,
        profileId: BASELINE_EDITORIAL_DIMENSION_SET.profileId,
        profileVersion: BASELINE_EDITORIAL_DIMENSION_SET.profileVersion,
        weightSemantics: BASELINE_EDITORIAL_DIMENSION_SET.weightSemantics,
        dimensions: EDITORIAL_DIMENSIONS,
      },
      manuscriptState: 'empty',
    }));
    return {
      bookId,
      stableIdentity: overview.book.stableIdentity,
      title: overview.book.title,
      internalNumber: overview.book.internalNumber,
      dimensionSetId: bookRecord.dimensionSetId,
      label: exactBookChoiceLabel(overview.book.title, bookId, overview.book.internalNumber),
      bookStateDigest,
    };
  }

  #bookSourceImportTarget(bookId: string, sourceDigest: string): Omit<
    Extract<ResolvedSourceImportTarget, { kind: 'existing-book' }>,
    'choiceId' | 'sourceVersionDisposition' | 'reuseSourceVersionId'
  > & { exactSourceVersionId: string | null } {
    const overview = this.getBookOverview(bookId);
    const bookRecord = overview.records[0];
    requireStore(bookRecord?.kind === 'book', 'BOOK_RECORD_GRAPH_INVALID', '所选图书记录不完整。');
    const matches = this.#authority.prepare(
      `SELECT source_version_id
       FROM source_versions
       WHERE book_id = ? AND source_digest = ?
       ORDER BY source_version_id`,
    ).all(bookId, sourceDigest) as SqlRow[];
    requireStore(matches.length <= 1, 'BOOK_RECORD_GRAPH_INVALID', '所选图书的来源版本身份不唯一。');
    const bookStateDigest = sha256(canonicalJson({
      schema: 'ai7.source-import-target-book-state/1',
      overview,
      dimensionSet: {
        dimensionSetId: bookRecord.dimensionSetId,
        definitionDigest: bookRecord.dimensionSetDigest,
        profileId: BASELINE_EDITORIAL_DIMENSION_SET.profileId,
        profileVersion: BASELINE_EDITORIAL_DIMENSION_SET.profileVersion,
        weightSemantics: BASELINE_EDITORIAL_DIMENSION_SET.weightSemantics,
        dimensions: EDITORIAL_DIMENSIONS,
      },
    }));
    return {
      kind: 'existing-book',
      bookId,
      stableIdentity: overview.book.stableIdentity,
      title: overview.book.title,
      internalNumber: overview.book.internalNumber,
      dimensionSetId: bookRecord.dimensionSetId,
      label: exactBookChoiceLabel(overview.book.title, bookId, overview.book.internalNumber),
      bookStateDigest,
      exactSourceVersionId: matches.length === 0 ? null : asString(matches[0]!.source_version_id),
    };
  }

  #reimportManuscriptBinding(bookId: string): { manuscriptId: string; branchId: string } {
    requireStore(UUID_PATTERN.test(bookId), 'TARGET_CHOICE_INVALID', '稿件重新导入目标无效。');
    const rows = this.#authority.prepare(
      `SELECT m.manuscript_id, mb.branch_id
       FROM manuscripts m
       JOIN manuscript_branches mb ON mb.manuscript_id = m.manuscript_id
       WHERE m.book_id = ? AND m.role = 'primary'
       ORDER BY m.manuscript_id, mb.branch_id`,
    ).all(bookId) as SqlRow[];
    requireStore(rows.length === 1, 'REIMPORT_TARGET_INVALID', '所选图书必须有且仅有一份主稿件及其现行分支。');
    return { manuscriptId: asString(rows[0]!.manuscript_id), branchId: asString(rows[0]!.branch_id) };
  }

  #populatedBookReimportTarget(
    bookId: string,
    sourceDigest: string,
    checkpoint: ReimportCheckpointBinding,
    preparedCheckpoint = false,
  ): Omit<ResolvedReimportTarget, 'sourceVersionDisposition' | 'reuseSourceVersionId' | 'lineage'> & {
    exactSourceVersionId: string | null;
  } {
    const overview = this.getBookOverview(bookId);
    requireStore(overview.manuscriptState.state === 'populated', 'REIMPORT_TARGET_INVALID', '所选图书尚无可重新导入的主稿件。');
    const binding = this.#reimportManuscriptBinding(bookId);
    requireStore(
      binding.manuscriptId === checkpoint.manuscriptId && binding.branchId === checkpoint.branchId &&
        checkpoint.bookId === bookId,
      'REIMPORT_TARGET_CHANGED',
      '所选图书的主稿件或分支已变化。',
    );
    const current = one(this.#authority.prepare(
      `SELECT base_revision_id, journal_sequence, working_digest
       FROM branch_working_state WHERE manuscript_id = ? AND branch_id = ?`,
    ).all(binding.manuscriptId, binding.branchId) as SqlRow[], 'REIMPORT_TARGET_INVALID', '主稿件工作状态缺失。');
    requireStore(
      (preparedCheckpoint || asString(current.base_revision_id) === checkpoint.revisionId) &&
        asNumber(current.journal_sequence) === checkpoint.journalSequence &&
        asString(current.working_digest) === checkpoint.revisionDigest,
      'REIMPORT_TARGET_CHANGED',
      '主稿件在重新导入复核期间已变化。',
    );
    const matches = this.#authority.prepare(
      'SELECT source_version_id FROM source_versions WHERE book_id = ? AND source_digest = ? ORDER BY source_version_id',
    ).all(bookId, sourceDigest) as SqlRow[];
    requireStore(matches.length <= 1, 'BOOK_RECORD_GRAPH_INVALID', '所选图书的精确来源版本身份不唯一。');
    const bookStateDigest = sha256(canonicalJson({
      schema: 'ai7.manuscript-reimport-target/1',
      book: overview.book,
      manuscriptId: binding.manuscriptId,
      branchId: binding.branchId,
      checkpoint,
    }));
    return {
      kind: 'existing-book',
      choiceId: `existing-book:${bookId}`,
      bookId,
      stableIdentity: overview.book.stableIdentity,
      title: overview.book.title,
      internalNumber: overview.book.internalNumber,
      label: exactBookChoiceLabel(overview.book.title, bookId, overview.book.internalNumber),
      manuscriptId: binding.manuscriptId,
      branchId: binding.branchId,
      bookStateDigest,
      checkpoint,
      exactSourceVersionId: matches.length === 0 ? null : asString(matches[0]!.source_version_id),
    };
  }

  #resolveReimportTarget(
    selection: ManuscriptReimportTargetSelection,
    snapshot: DraftSnapshot,
    checkpoint: ReimportCheckpointBinding,
    identityFindings: ReadonlyArray<ImportIdentityFindingProjection>,
    preparedCheckpoint = false,
  ): ResolvedReimportTarget {
    requireStore(
      selection.kind === 'existing-book' && UUID_PATTERN.test(selection.bookId) && selection.relationship === 'reimport' &&
        (selection.reuseSourceVersionId === null || UUID_PATTERN.test(selection.reuseSourceVersionId)),
      'TARGET_CHOICE_INVALID',
      '稿件重新导入目标、关系或来源版本选择无效。',
    );
    const current = this.#populatedBookReimportTarget(
      selection.bookId, snapshot.sourceDigest, checkpoint, preparedCheckpoint);
    if (current.exactSourceVersionId === null) {
      requireStore(selection.reuseSourceVersionId === null, 'SOURCE_VERSION_REUSE_INVALID', '所选来源版本不能在该图书中复用。');
    } else {
      requireStore(
        selection.reuseSourceVersionId === current.exactSourceVersionId && identityFindings.some((finding) =>
          finding.bookId === current.bookId && finding.sourceVersionId === current.exactSourceVersionId &&
          finding.identityClass.kind === 'immutable-original'),
        'SOURCE_VERSION_REUSE_REQUIRED',
        '同图书已有精确来源版本；必须明确选择后才能复用。',
      );
    }
    let lineage: ResolvedReimportTarget['lineage'];
    if (selection.lineage.kind === 'unconfirmed') {
      lineage = { status: 'unconfirmed', sourceVersionId: null, revisionId: null, comparisonKind: 'two-way' };
    } else {
      const lineageSourceVersionId = selection.lineage.sourceVersionId;
      requireStore(UUID_PATTERN.test(lineageSourceVersionId), 'REIMPORT_LINEAGE_INVALID', '来源关系选择无效。');
      const revisionId = this.#verifiedReimportLineageRevision(
        current.bookId, current.manuscriptId, lineageSourceVersionId,
      );
      requireStore(revisionId !== null,
        'REIMPORT_LINEAGE_UNVERIFIED', '所选来源版本没有主稿件修订版血缘证明。');
      lineage = {
        status: 'verified',
        sourceVersionId: lineageSourceVersionId,
        revisionId,
        comparisonKind: 'three-way',
      };
    }
    const { exactSourceVersionId, ...target } = current;
    return {
      ...target,
      sourceVersionDisposition: exactSourceVersionId === null ? 'created' : 'reused-same-book',
      reuseSourceVersionId: exactSourceVersionId,
      lineage,
    };
  }

  #verifiedReimportLineageRevision(bookId: string, manuscriptId: string, sourceVersionId: string): string | null {
    const revision = this.#authority.prepare(
      `SELECT revision_id
       FROM (
         SELECT mir.resulting_revision_id revision_id, mir.imported_at, mir.import_record_id record_id
         FROM manuscript_import_records mir
         WHERE mir.book_id = ? AND mir.manuscript_id = ? AND mir.source_version_id = ?
         UNION ALL
         SELECT CASE rr.result_kind WHEN 'changed' THEN rr.resulting_revision_id ELSE rr.previous_revision_id END revision_id,
                rr.imported_at, rr.reimport_record_id record_id
         FROM manuscript_reimport_records rr
         WHERE rr.book_id = ? AND rr.manuscript_id = ? AND rr.source_version_id = ?
           AND ((rr.result_kind = 'changed' AND rr.resulting_revision_id IS NOT NULL) OR rr.result_kind = 'no-change')
       ) ORDER BY imported_at DESC, record_id DESC LIMIT 1`,
    ).get(bookId, manuscriptId, sourceVersionId, bookId, manuscriptId, sourceVersionId) as SqlRow | undefined;
    return revision === undefined || revision.revision_id === null ? null : asString(revision.revision_id);
  }

  #reimportBlockFact(row: SqlRow, prefix: 'current' | 'lineage' | 'staged'): ReimportBlockFact | null {
    const blockId = row[`${prefix}_block_id`];
    if (blockId === null) return null;
    return {
      blockId: asString(blockId),
      position: asNumber(row[`${prefix}_position`]),
      kind: asString(row[`${prefix}_kind`]) as ManuscriptBlockProjection['kind'],
      level: row[`${prefix}_level`] === null ? null : asNumber(row[`${prefix}_level`]),
      text: asString(row[`${prefix}_text`]),
      digest: asString(row[`${prefix}_digest`]),
    };
  }

  *#reimportMappingBatches(
    workId: string,
    draftId: string,
    target: ResolvedReimportTarget,
    checkpointWorkId: string | null = null,
  ): Generator<ReimportMappingBatch> {
    const checkpointTable = checkpointWorkId === null
      ? 'manuscript_block_versions'
      : 'temp.reimport_checkpoint_rows';
    const checkpointScopeColumn = checkpointWorkId === null ? 'revision_id' : 'work_id';
    const checkpointScopeId = checkpointWorkId ?? target.checkpoint.revisionId;
    const stagedCount = asNumber(one(this.#authority.prepare(
      'SELECT block_count FROM staged_import_snapshots WHERE draft_id = ?',
    ).all(draftId) as SqlRow[], 'REIMPORT_COMPARISON_INVALID', '无法核对暂存块数量。').block_count);
    let after = 0;
    for (;;) {
      const rows = this.#authority.prepare(
        `SELECT sb.staged_block_id, sb.position staged_position, sb.kind staged_kind,
                sb.level staged_level, sb.text staged_text, sb.digest staged_digest,
                COALESCE(co.single_block_id, lc.block_id) current_block_id,
                COALESCE(co.single_position, lc.position) current_position,
                COALESCE(co.kind, lc.kind) current_kind,
                CASE WHEN co.source_kind IS NULL THEN lc.level
                     WHEN co.level_key = -1 THEN NULL ELSE co.level_key END current_level,
                COALESCE(co.text, lc.text) current_text,
                COALESCE(co.digest, lc.digest) current_digest,
                COALESCE(lo.single_block_id, li.block_id) lineage_block_id,
                COALESCE(lo.single_position, li.position) lineage_position,
                COALESCE(lo.kind, li.kind) lineage_kind,
                CASE WHEN lo.source_kind IS NULL THEN li.level
                     WHEN lo.level_key = -1 THEN NULL ELSE lo.level_key END lineage_level,
                COALESCE(lo.text, li.text) lineage_text,
                COALESCE(lo.digest, li.digest) lineage_digest,
                co.single_block_id exact_current_block_id,
                lo.single_block_id exact_lineage_block_id
         FROM staged_import_blocks sb
         LEFT JOIN temp.reimport_preparation_occurrences so
           ON so.work_id = ? AND so.source_kind = 'staged' AND so.occurrences = 1
          AND so.kind = sb.kind AND so.level_key = COALESCE(sb.level, -1)
          AND so.digest = sb.digest AND so.text = sb.text
         LEFT JOIN temp.reimport_preparation_occurrences co
           ON so.work_id IS NOT NULL AND co.work_id = ? AND co.source_kind = 'current' AND co.occurrences = 1
          AND co.kind = sb.kind AND co.level_key = COALESCE(sb.level, -1)
          AND co.digest = sb.digest AND co.text = sb.text
         LEFT JOIN temp.reimport_preparation_occurrences lo
           ON so.work_id IS NOT NULL AND lo.work_id = ? AND lo.source_kind = 'lineage' AND lo.occurrences = 1
          AND lo.kind = sb.kind AND lo.level_key = COALESCE(sb.level, -1)
          AND lo.digest = sb.digest AND lo.text = sb.text
         LEFT JOIN ${checkpointTable} lc
           ON lc.${checkpointScopeColumn} = ? AND lc.block_id = lo.single_block_id
         LEFT JOIN manuscript_block_versions li
           ON li.revision_id = ? AND li.block_id = co.single_block_id
         WHERE sb.draft_id = ? AND sb.position > ?
         ORDER BY sb.position LIMIT ${REIMPORT_MAPPING_BATCH_SIZE}`,
      ).all(
        workId,
        workId,
        workId,
        checkpointScopeId,
        target.lineage.revisionId,
        draftId,
        after,
      ) as SqlRow[];
      if (rows.length === 0) break;
      const batch: ReimportMappingFact[] = [];
      for (const row of rows) {
        const current = this.#reimportBlockFact(row, 'current');
        const staged = this.#reimportBlockFact(row, 'staged')!;
        const lineage = this.#reimportBlockFact(row, 'lineage');
        const position = staged.position;
        const exactCurrentId = row.exact_current_block_id === null ? null : asString(row.exact_current_block_id);
        const exactLineageId = row.exact_lineage_block_id === null ? null : asString(row.exact_lineage_block_id);
        const autoPreserve = exactCurrentId !== null &&
          (exactLineageId === null || exactLineageId === exactCurrentId);
        batch.push({
          mappingId: stableUuid(`ai7.reimport-mapping/2\u0000${draftId}\u0000${position}`),
          position,
          changeKind: autoPreserve
            ? current!.position === staged.position ? 'unchanged' : 'move'
            : current === null ? 'insert' : 'edit',
          current,
          lineage,
          staged,
          identityConsequence: autoPreserve ? 'preserve-current-identity' : null,
        });
        after = staged.position;
      }
      yield { mappings: batch, scanned: rows.length };
    }

    after = 0;
    let deleted = 0;
    for (;;) {
      const rows = this.#authority.prepare(
        `SELECT cb.block_id current_block_id, cb.position current_position, cb.kind current_kind,
                cb.level current_level, cb.text current_text, cb.digest current_digest,
                lb.block_id lineage_block_id, lb.position lineage_position, lb.kind lineage_kind,
                lb.level lineage_level, lb.text lineage_text, lb.digest lineage_digest,
                NULL staged_block_id,
                CASE WHEN cu.occurrences = 1 AND su.occurrences = 1 THEN 1
                     WHEN lu.occurrences = 1 AND sl.occurrences = 1 THEN 1
                     ELSE 0 END matched
         FROM ${checkpointTable} cb
         LEFT JOIN manuscript_block_versions lb
           ON lb.revision_id = ? AND lb.block_id = cb.block_id
         LEFT JOIN temp.reimport_preparation_occurrences cu
           ON cu.work_id = ? AND cu.source_kind = 'current'
          AND cu.kind = cb.kind AND cu.level_key = COALESCE(cb.level, -1)
          AND cu.digest = cb.digest AND cu.text = cb.text
         LEFT JOIN temp.reimport_preparation_occurrences su
           ON su.work_id = ? AND su.source_kind = 'staged'
          AND su.kind = cb.kind AND su.level_key = COALESCE(cb.level, -1)
          AND su.digest = cb.digest AND su.text = cb.text
         LEFT JOIN temp.reimport_preparation_occurrences lu
           ON lu.work_id = ? AND lu.source_kind = 'lineage'
          AND lu.kind = lb.kind AND lu.level_key = COALESCE(lb.level, -1)
          AND lu.digest = lb.digest AND lu.text = lb.text
         LEFT JOIN temp.reimport_preparation_occurrences sl
           ON sl.work_id = ? AND sl.source_kind = 'staged'
          AND sl.kind = lb.kind AND sl.level_key = COALESCE(lb.level, -1)
          AND sl.digest = lb.digest AND sl.text = lb.text
         WHERE cb.${checkpointScopeColumn} = ? AND cb.position > ?
         ORDER BY cb.position LIMIT ${REIMPORT_MAPPING_BATCH_SIZE}`,
      ).all(
        target.lineage.revisionId,
        workId,
        workId,
        workId,
        workId,
        checkpointScopeId,
        after,
      ) as SqlRow[];
      if (rows.length === 0) break;
      const batch: ReimportMappingFact[] = [];
      for (const row of rows) {
        const current = this.#reimportBlockFact(row, 'current')!;
        after = current.position;
        if (asNumber(row.matched) === 1) continue;
        const position = stagedCount + (++deleted);
        batch.push({
          mappingId: stableUuid(`ai7.reimport-mapping/2\u0000${draftId}\u0000${position}`),
          position,
          changeKind: 'delete',
          current,
          lineage: this.#reimportBlockFact(row, 'lineage'),
          staged: null,
          identityConsequence: null,
        });
      }
      yield { mappings: batch, scanned: rows.length };
    }
  }

  #resolveSourceImportTarget(
    selection: SourceImportTargetSelection,
    snapshot: DraftSnapshot,
    identityFindings: ReadonlyArray<ImportIdentityFindingProjection>,
  ): ResolvedSourceImportTarget {
    if (selection.kind === 'new-book') {
      requireStore(selection.relationship === 'source-only', 'TARGET_CHOICE_INVALID', '来源导入关系选择无效。');
      const targetChoice = newBookTargetChoice(identityFindings);
      requireStore(selection.choiceId === targetChoice.id, 'TARGET_CHOICE_CHANGED', '导入目标选择已变化，请重新选择。');
      const bookId = stableUuid(`ai7.source-bound-book/1\u0000${snapshot.draftId}`);
      return {
        kind: 'new-book',
        choiceId: selection.choiceId,
        confirmedTitle: safeTitle(selection.confirmedTitle),
        label: targetChoice.label,
        bookId,
        stableIdentity: `book:${bookId}`,
        sourceVersionDisposition: 'created',
        reuseSourceVersionId: null,
      };
    }
    requireStore(
      UUID_PATTERN.test(selection.bookId) && selection.relationship === 'source-only' &&
        (selection.reuseSourceVersionId === null || UUID_PATTERN.test(selection.reuseSourceVersionId)),
      'TARGET_CHOICE_INVALID',
      '来源导入目标、关系或来源版本选择无效。',
    );
    const target = this.#bookSourceImportTarget(selection.bookId, snapshot.sourceDigest);
    if (target.exactSourceVersionId !== null) {
      requireStore(
        selection.reuseSourceVersionId === target.exactSourceVersionId && identityFindings.some((finding) =>
          finding.bookId === target.bookId && finding.sourceVersionId === target.exactSourceVersionId &&
          finding.identityClass.kind === 'immutable-original'),
        'SOURCE_VERSION_REUSE_REQUIRED',
        '同图书已有精确来源版本；必须明确选择后才能复用。',
      );
    } else {
      requireStore(selection.reuseSourceVersionId === null, 'SOURCE_VERSION_REUSE_INVALID', '所选来源版本不能在该图书中复用。');
    }
    const { exactSourceVersionId, ...resolved } = target;
    return {
      ...resolved,
      choiceId: `existing-book:${target.bookId}`,
      sourceVersionDisposition: exactSourceVersionId === null ? 'created' : 'reused-same-book',
      reuseSourceVersionId: exactSourceVersionId,
    };
  }

  #reconstructReviewedSourceImportTarget(
    snapshot: DraftSnapshot,
    identityFindings: ReadonlyArray<ImportIdentityFindingProjection>,
  ): ResolvedSourceImportTarget | null {
    if (snapshot.reviewDigest === null || snapshot.reviewedRelationship !== 'source-only') return null;
    let target: ResolvedSourceImportTarget;
    try {
      if (snapshot.reviewedTargetKind === 'new-book') {
        if (snapshot.reviewedTitle === null || snapshot.reviewedTargetChoiceId === null) return null;
        target = this.#resolveSourceImportTarget({
          kind: 'new-book',
          choiceId: snapshot.reviewedTargetChoiceId,
          confirmedTitle: snapshot.reviewedTitle,
          relationship: 'source-only',
        }, snapshot, identityFindings);
      } else if (snapshot.reviewedTargetKind === 'existing-book') {
        if (snapshot.reviewedExistingBookId === null || snapshot.reviewedBookStateDigest === null) return null;
        target = this.#resolveSourceImportTarget({
          kind: 'existing-book',
          bookId: snapshot.reviewedExistingBookId,
          relationship: 'source-only',
          reuseSourceVersionId: snapshot.reviewedReuseSourceVersionId,
        }, snapshot, identityFindings);
        if (target.kind !== 'existing-book' || target.bookStateDigest !== snapshot.reviewedBookStateDigest) return null;
      } else {
        return null;
      }
    } catch {
      return null;
    }
    return createSourceImportReviewDigest(snapshot, target, identityFindings) === snapshot.reviewDigest ? target : null;
  }

  #sourceImportReviewProjection(
    snapshot: DraftSnapshot,
    target: ResolvedSourceImportTarget,
    identityFindings: ReadonlyArray<ImportIdentityFindingProjection>,
    commitAttemptId: string | null,
  ): ReviewBeforeSourceImportProjection {
    return {
      draftId: snapshot.draftId,
      draftVersion: snapshot.version,
      reviewDigest: snapshot.reviewDigest ?? createSourceImportReviewDigest(snapshot, target, identityFindings),
      commitAttemptId,
      target: target.kind === 'new-book'
        ? {
            choiceId: target.choiceId,
            kind: 'new-book',
            label: target.label,
            confirmedTitle: target.confirmedTitle,
            bookId: target.bookId,
            stableIdentity: target.stableIdentity,
            relationship: 'source-only',
            relationshipLabel: '作为来源材料导入',
          }
        : {
            choiceId: target.choiceId,
            kind: 'existing-book',
            label: target.label,
            bookId: target.bookId,
            stableIdentity: target.stableIdentity,
            internalNumber: target.internalNumber,
            relationship: 'source-only',
            relationshipLabel: '作为来源材料导入',
            bookStateDigest: target.bookStateDigest,
          },
      source: this.#stagedProjection(snapshot).source,
      identityFindings,
      retainedBoundary: sourceImportRetainedBoundary(snapshot),
      provenance: {
        acquisitionPath: 'native-file-picker',
        locality: 'local-provider-free',
        label: '本机文件选择器 · 本地解析 · 未联网',
        acquiredAt: snapshot.stagedAt,
      },
      sourceVersionResult: target.sourceVersionDisposition === 'created'
        ? { disposition: 'created', label: '创建所选图书拥有的新来源版本', sourceVersionId: null }
        : {
            disposition: 'reused-same-book',
            label: '复用已明确选择的同图书来源版本',
            sourceVersionId: target.reuseSourceVersionId!,
          },
      recordsToCreate: sourceImportRecordsToCreate(target),
      namedNonEffects: SOURCE_IMPORT_NON_EFFECTS,
      editorialDimensionSet: {
        createdWithBook: target.kind === 'new-book',
        ...BASELINE_EDITORIAL_DIMENSION_SET,
        digest: BASELINE_EDITORIAL_DIMENSION_SET_DIGEST,
      },
    };
  }

  #reimportEvidence(draftId: string): {
    comparisonDigest: string;
    resolutionDigest: string;
    totalMappings: number;
    unresolvedMappings: number;
    changed: boolean;
  } {
    const comparison = one(this.#authority.prepare(
      `SELECT comparison_digest, resolution_digest, total_mappings, unresolved_mappings,
              changed_mappings, staged_block_count, checkpoint_block_count
       FROM manuscript_reimport_comparisons WHERE draft_id = ?`,
    ).all(draftId) as SqlRow[], 'REIMPORT_COMPARISON_INVALID', '重新导入比较不存在。');
    const totalMappings = asNumber(comparison.total_mappings);
    const unresolvedMappings = asNumber(comparison.unresolved_mappings);
    requireStore(totalMappings > 0 && unresolvedMappings <= totalMappings,
      'REIMPORT_COMPARISON_INVALID', '重新导入比较聚合状态无效。');
    return {
      comparisonDigest: asString(comparison.comparison_digest),
      resolutionDigest: asString(comparison.resolution_digest),
      totalMappings,
      unresolvedMappings,
      changed: asNumber(comparison.changed_mappings) > 0 ||
        asNumber(comparison.staged_block_count) !== asNumber(comparison.checkpoint_block_count),
    };
  }

  #reconstructReviewedReimportTarget(snapshot: DraftSnapshot): ResolvedReimportTarget | null {
    if (snapshot.reviewDigest === null || snapshot.reviewedRelationship !== 'reimport' ||
      snapshot.reviewedExistingBookId === null || snapshot.reviewedBookStateDigest === null ||
      snapshot.reviewedLineageStatus === null || snapshot.reviewedCheckpointRevisionId === null ||
      snapshot.reviewedManuscriptId === null || snapshot.reviewedBranchId === null) return null;
    try {
      const comparison = one(this.#authority.prepare(
        `SELECT lineage_status, lineage_source_version_id, lineage_revision_id, lineage_revision_digest,
                comparison_kind, checkpoint_revision_digest, checkpoint_created_for_dirty_journal,
                staged_source_digest, staged_content_digest, staged_structure_digest,
                staged_parser_identity, staged_block_count, degradation_accepted
         FROM manuscript_reimport_comparisons WHERE draft_id = ?`,
      ).all(snapshot.draftId) as SqlRow[], 'REIMPORT_COMPARISON_INVALID', '重新导入比较不存在。');
      const revision = one(this.#authority.prepare(
        `SELECT revision_label, revision_digest
         FROM manuscript_revisions WHERE revision_id = ? AND manuscript_id = ? AND branch_id = ?`,
      ).all(
        snapshot.reviewedCheckpointRevisionId,
        snapshot.reviewedManuscriptId,
        snapshot.reviewedBranchId,
      ) as SqlRow[], 'REIMPORT_CHECKPOINT_INVALID', '重新导入安全固定点不存在。');
      const state = one(this.#authority.prepare(
        `SELECT journal_sequence, working_digest, base_revision_id
         FROM branch_working_state WHERE manuscript_id = ? AND branch_id = ?`,
      ).all(snapshot.reviewedManuscriptId, snapshot.reviewedBranchId) as SqlRow[],
      'REIMPORT_CHECKPOINT_INVALID', '重新导入主稿件状态不存在。');
      if (asString(state.base_revision_id) !== snapshot.reviewedCheckpointRevisionId ||
        asString(state.working_digest) !== asString(revision.revision_digest) ||
        asString(comparison.checkpoint_revision_digest) !== asString(revision.revision_digest) ||
        asString(comparison.staged_source_digest) !== snapshot.sourceDigest ||
        asString(comparison.staged_content_digest) !== snapshot.contentDigest ||
        asString(comparison.staged_structure_digest) !== snapshot.structureDigest ||
        asString(comparison.staged_parser_identity) !== snapshot.parserIdentity ||
        asNumber(comparison.staged_block_count) !== snapshot.blockCount) return null;
      const checkpoint: ReimportCheckpointBinding = {
        bookId: snapshot.reviewedExistingBookId,
        manuscriptId: snapshot.reviewedManuscriptId,
        branchId: snapshot.reviewedBranchId,
        revisionId: snapshot.reviewedCheckpointRevisionId,
        revisionLabel: asString(revision.revision_label),
        revisionDigest: asString(revision.revision_digest),
        journalSequence: asNumber(state.journal_sequence),
        createdForDirtyJournal: asNumber(comparison.checkpoint_created_for_dirty_journal) === 1,
      };
      const current = this.#populatedBookReimportTarget(snapshot.reviewedExistingBookId, snapshot.sourceDigest, checkpoint);
      if (current.bookStateDigest !== snapshot.reviewedBookStateDigest ||
        current.manuscriptId !== snapshot.reviewedManuscriptId || current.branchId !== snapshot.reviewedBranchId ||
        current.exactSourceVersionId !== snapshot.reviewedReuseSourceVersionId) return null;
      const lineage = comparison.lineage_status === 'verified'
        ? {
            status: 'verified' as const,
            sourceVersionId: asString(comparison.lineage_source_version_id),
            revisionId: asString(comparison.lineage_revision_id),
            comparisonKind: 'three-way' as const,
          }
        : {
            status: 'unconfirmed' as const,
            sourceVersionId: null,
            revisionId: null,
            comparisonKind: 'two-way' as const,
          };
      if (lineage.status !== snapshot.reviewedLineageStatus ||
        lineage.sourceVersionId !== snapshot.reviewedLineageSourceVersionId ||
        comparison.comparison_kind !== lineage.comparisonKind) return null;
      if (lineage.status === 'verified') {
        if (this.#verifiedReimportLineageRevision(
          snapshot.reviewedExistingBookId,
          snapshot.reviewedManuscriptId,
          lineage.sourceVersionId,
        ) !== lineage.revisionId) return null;
        const lineageRevision = this.#authority.prepare(
          'SELECT revision_digest FROM manuscript_revisions WHERE revision_id = ?',
        ).get(lineage.revisionId) as SqlRow | undefined;
        if (lineageRevision === undefined || comparison.lineage_revision_digest === null ||
          asString(lineageRevision.revision_digest) !== asString(comparison.lineage_revision_digest)) return null;
      } else if (comparison.lineage_revision_digest !== null) return null;
      const { exactSourceVersionId, ...base } = current;
      const target: ResolvedReimportTarget = {
        ...base,
        sourceVersionDisposition: exactSourceVersionId === null ? 'created' : 'reused-same-book',
        reuseSourceVersionId: exactSourceVersionId,
        lineage,
      };
      const evidence = this.#reimportEvidence(snapshot.draftId);
      return createReimportReviewDigest(
        snapshot,
        target,
        evidence.comparisonDigest,
        evidence.resolutionDigest,
        degradationReview(
          this.#requireFidelityPlan(snapshot),
          asNumber(comparison.degradation_accepted) === 1,
        ).state,
      ) === snapshot.reviewDigest
        ? target
        : null;
    } catch {
      return null;
    }
  }

  #reimportReviewProjection(
    snapshot: DraftSnapshot,
    target: ResolvedReimportTarget,
    commitAttemptId: string | null,
  ): ReviewBeforeManuscriptReimportProjection {
    const evidence = this.#reimportEvidence(snapshot.draftId);
    const comparison = one(this.#authority.prepare(
      'SELECT degradation_accepted FROM manuscript_reimport_comparisons WHERE draft_id = ?',
    ).all(snapshot.draftId) as SqlRow[], 'REIMPORT_COMPARISON_INVALID', '重新导入比较不存在。');
    const plan = this.#requireFidelityPlan(snapshot);
    const degradationAccepted = asNumber(comparison.degradation_accepted) === 1;
    requireStore(snapshot.reviewDigest !== null, 'REVIEW_CHANGED', '重新导入复核摘要缺失。');
    return {
      draftId: snapshot.draftId,
      draftVersion: snapshot.version,
      reviewDigest: snapshot.reviewDigest,
      commitAttemptId,
      target: {
        kind: 'existing-book',
        bookId: target.bookId,
        stableIdentity: target.stableIdentity,
        label: target.label,
        internalNumber: target.internalNumber,
        manuscriptId: target.manuscriptId,
        branchId: target.branchId,
        relationship: 'reimport',
        relationshipLabel: '重新导入主稿件',
        bookStateDigest: target.bookStateDigest,
      },
      checkpoint: target.checkpoint,
      lineage: target.lineage.status === 'verified'
        ? {
            status: 'verified',
            label: '来源关系已确认',
            comparisonKind: 'three-way',
            sourceVersionId: target.lineage.sourceVersionId,
            revisionId: target.lineage.revisionId,
          }
        : {
            status: 'unconfirmed',
            label: '来源关系未确认',
            comparisonKind: 'two-way',
            sourceVersionId: null,
            revisionId: null,
          },
      source: this.#stagedProjection(snapshot).source,
      sourceVersionResult: target.sourceVersionDisposition === 'created'
        ? { disposition: 'created', label: '创建所选图书拥有的新来源版本', sourceVersionId: null }
        : {
            disposition: 'reused-same-book',
            label: '复用已明确选择的同图书来源版本',
            sourceVersionId: target.reuseSourceVersionId!,
          },
      comparison: {
        comparisonDigest: evidence.comparisonDigest,
        totalMappings: evidence.totalMappings,
        unresolvedMappings: evidence.unresolvedMappings,
        changed: evidence.changed,
        resultPreviewLabel: evidence.changed ? '稿件将重新导入' : '未发现稿件变化',
      },
      fidelity: snapshot.fidelity,
      degradationDecision: degradationReview(plan, degradationAccepted),
      commitReady: evidence.unresolvedMappings === 0 &&
        (plan.degradations.length === 0 || degradationAccepted),
      recordsToCreate: [
        ...(target.sourceVersionDisposition === 'created' ? ['图书拥有的来源版本'] : ['复用已明确选择的同图书来源版本']),
        '来源记录',
        '稿件重新导入记录',
        ...(evidence.changed ? ['一份后代稿件修订版'] : ['未发现稿件变化证据；不创建空修订版']),
      ],
      namedNonEffects: MANUSCRIPT_REIMPORT_NON_EFFECTS,
    };
  }

  #resolveImportTarget(
    selection: ImportTargetSelection,
    identityFindings: ReadonlyArray<ImportIdentityFindingProjection>,
  ): ResolvedImportTarget {
    if (selection.kind === 'new-book') {
      const targetChoice = newBookTargetChoice(identityFindings);
      requireStore(selection.choiceId === targetChoice.id, 'TARGET_CHOICE_CHANGED', '导入目标选择已变化，请重新选择。');
      return {
        kind: 'new-book',
        choiceId: selection.choiceId,
        confirmedTitle: safeTitle(selection.confirmedTitle),
        label: targetChoice.label,
      };
    }
    requireStore(
      UUID_PATTERN.test(selection.bookId) && selection.relationship === 'first-manuscript',
      'TARGET_CHOICE_INVALID',
      '导入目标或稿件关系选择无效。',
    );
    const target = this.#emptyBookImportTarget(selection.bookId);
    return {
      kind: 'existing-book',
      choiceId: `existing-book:${target.bookId}`,
      ...target,
      relationship: 'first-manuscript',
    };
  }

  #reconstructReviewedImportTarget(
    snapshot: DraftSnapshot,
    plan: ImportFidelityPlan,
    identityFindings: ReadonlyArray<ImportIdentityFindingProjection>,
  ): ResolvedImportTarget | null {
    if (snapshot.reviewDigest === null) return null;
    if (snapshot.reviewedTargetKind === 'existing-book') {
      if (
        snapshot.reviewedExistingBookId === null ||
        snapshot.reviewedRelationship !== 'first-manuscript' ||
        snapshot.reviewedBookStateDigest === null
      ) return null;
      let target: ResolvedImportTarget;
      try {
        target = this.#resolveImportTarget(
          { kind: 'existing-book', bookId: snapshot.reviewedExistingBookId, relationship: 'first-manuscript' },
          identityFindings,
        );
      } catch {
        return null;
      }
      if (target.kind !== 'existing-book' || target.bookStateDigest !== snapshot.reviewedBookStateDigest) return null;
      return createImportReviewDigestV5(
        snapshot,
        snapshot.version,
        plan,
        target,
        identityFindings,
        this.#workflowProfile,
      ) === snapshot.reviewDigest ? target : null;
    }
    if (snapshot.reviewedTargetKind !== 'new-book' || snapshot.reviewedTitle === null) return null;
    let confirmedTitle: string;
    try {
      confirmedTitle = safeTitle(snapshot.reviewedTitle);
    } catch {
      return null;
    }
    const currentChoice = newBookTargetChoice(identityFindings);
    if (snapshot.reviewedTargetChoiceId !== currentChoice.id) return null;
    const target: ResolvedImportTarget = {
      kind: 'new-book',
      choiceId: currentChoice.id,
      confirmedTitle,
      label: currentChoice.label,
    };
    if (createImportReviewDigestV5(
      snapshot,
      snapshot.version,
      plan,
      target,
      identityFindings,
      this.#workflowProfile,
    ) === snapshot.reviewDigest) return target;
    return reconstructReviewedTargetChoice(snapshot, confirmedTitle, plan, identityFindings) === currentChoice.id
      ? target
      : null;
  }

  #reviewProjection(
    snapshot: DraftSnapshot,
    reviewDigest: string | null,
    plan: ImportFidelityPlan,
    accepted: boolean,
    target: ResolvedImportTarget,
    identityFindings: ReadonlyArray<ImportIdentityFindingProjection>,
    commitAttemptId: string | null,
  ): ReviewBeforeImportProjection {
    return {
      draftId: snapshot.draftId,
      draftVersion: snapshot.version,
      reviewDigest,
      commitAttemptId,
      target: target.kind === 'new-book'
        ? {
            choiceId: target.choiceId,
            kind: 'new-book',
            label: target.label,
            confirmedTitle: target.confirmedTitle,
          }
        : {
            choiceId: target.choiceId,
            kind: 'existing-book',
            label: target.label,
            bookId: target.bookId,
            stableIdentity: target.stableIdentity,
            internalNumber: target.internalNumber,
            relationship: target.relationship,
            relationshipLabel: '作为首份稿件导入',
            bookStateDigest: target.bookStateDigest,
          },
      source: this.#stagedProjection(snapshot).source,
      identityFindings,
      fidelity: snapshot.fidelity,
      recordsToCreate: recordsToCreate(plan, target.kind),
      nonEffects: nonEffects(plan),
      workflowProfile: {
        id: this.#workflowProfile.projection.id,
        name: this.#workflowProfile.projection.name,
        version: this.#workflowProfile.projection.version,
        digest: this.#workflowProfile.projection.digest,
        nativeProfile: {
          id: this.#workflowProfile.native.id,
          version: this.#workflowProfile.native.version,
          digest: this.#workflowProfile.native.digest,
        },
      },
      editorialDimensionSet: {
        ...BASELINE_EDITORIAL_DIMENSION_SET,
        digest: BASELINE_EDITORIAL_DIMENSION_SET_DIGEST,
      },
      degradationDecision: degradationReview(plan, accepted),
    };
  }

  #identityFindings(snapshot: DraftSnapshot): ImportIdentityFindingProjection[] {
    const rows = this.#authority
      .prepare(
        `SELECT b.book_id, b.title, sv.source_version_id, sv.source_digest, sv.content_digest,
                sv.structure_digest, sv.parser_identity, sv.display_name,
                records.import_record_id, records.record_kind
         FROM source_versions sv
         JOIN books b ON b.book_id = sv.book_id
         JOIN (
           SELECT book_id, source_version_id, import_record_id, 'manuscript-import' record_kind
           FROM manuscript_import_records
           UNION ALL
           SELECT book_id, source_version_id, source_import_record_id, 'source-import' record_kind
           FROM source_import_records
           UNION ALL
           SELECT book_id, source_version_id, reimport_record_id, 'manuscript-reimport' record_kind
           FROM manuscript_reimport_records
         ) records
           ON records.book_id = sv.book_id
          AND records.source_version_id = sv.source_version_id
         ORDER BY b.title COLLATE BINARY, b.book_id, sv.source_version_id,
                  records.record_kind, records.import_record_id`,
      )
      .all() as SqlRow[];
    const findings = new Map<string, ImportIdentityFindingProjection>();
    for (const row of rows) {
      const sourceDigest = asString(row.source_digest);
      const contentDigest = asString(row.content_digest);
      const structureDigest = asString(row.structure_digest);
      const parserIdentity = asString(row.parser_identity);
      const displayName = asString(row.display_name);
      const identityClass =
        sourceDigest === snapshot.sourceDigest
          ? ({ kind: 'immutable-original', label: '精确原始文件身份' } as const)
          : parserIdentity === snapshot.parserIdentity &&
              contentDigest === snapshot.contentDigest &&
              structureDigest === snapshot.structureDigest
            ? ({ kind: 'parsed-content-structure', label: '发现相同内容' } as const)
            : displayName === snapshot.displayName &&
                (sourceDigest !== snapshot.sourceDigest ||
                  contentDigest !== snapshot.contentDigest ||
                  structureDigest !== snapshot.structureDigest)
              ? ({ kind: 'filename-collision', label: '名称相同，内容不同' } as const)
              : undefined;
      if (!identityClass) continue;
      const finding = {
        bookId: asString(row.book_id),
        bookTitle: asString(row.title),
        sourceVersionId: asString(row.source_version_id),
        importRecordId: asString(row.import_record_id),
        recordKind: asString(row.record_kind) as ImportIdentityFindingProjection['recordKind'],
        recordLabel: asString(row.record_kind) === 'manuscript-import'
          ? '稿件导入记录'
          : asString(row.record_kind) === 'source-import'
            ? '来源导入记录'
            : '稿件重新导入记录',
        identityClass,
      } satisfies ImportIdentityFindingProjection;
      const key = `${finding.bookId}\u0000${finding.sourceVersionId}\u0000${finding.importRecordId}`;
      if (!findings.has(key)) findings.set(key, finding);
    }
    return [...findings.values()];
  }

  #loadDraftSnapshot(draftId: string): DraftSnapshot {
    const row = one(
      this.#authority
        .prepare(
          `SELECT d.draft_id, d.state, d.draft_version, d.display_name, d.object_digest,
                  d.selected_path, d.reviewed_title, d.reviewed_target_choice_id, d.review_digest,
                  d.reviewed_target_kind, d.reviewed_existing_book_id, d.reviewed_relationship,
                  d.reviewed_book_state_digest, d.reviewed_reuse_source_version_id,
                  d.reviewed_lineage_status, d.reviewed_lineage_source_version_id,
                  d.reviewed_checkpoint_revision_id, d.reviewed_manuscript_id, d.reviewed_branch_id,
                  d.staged_at, s.parser_identity, s.source_digest,
                  s.content_digest, s.structure_digest, s.block_count, s.character_count, s.fidelity_json,
                  s.title_suggestion, s.title_source, co.byte_length
           FROM import_drafts d
           JOIN staged_import_snapshots s ON s.draft_id = d.draft_id
           JOIN content_objects co ON co.object_digest = d.object_digest
           WHERE d.draft_id = ?`,
        )
        .all(draftId) as SqlRow[],
      'DRAFT_NOT_FOUND',
      '导入草稿不存在或已完成。',
    );
    const sourceDigest = asString(row.source_digest);
    const sourceBytes = asNumber(row.byte_length);
    requireStore(asString(row.object_digest) === sourceDigest, 'STORE_CORRUPT', '暂存对象与来源摘要不一致。');
    const fidelityValue = parseStoredJson(asString(row.fidelity_json), '导入保真快照无效。');
    const plan = deriveImportFidelityPlan(fidelityValue, sourceDigest, sourceBytes);
    requireStore(plan, 'FIDELITY_OUTSIDE_TRACER', '持久化导入保真快照不符合当前受限边界。');
    const titleSource = asString(row.title_source);
    requireStore(titleSource === 'DOCX 标题元数据' || titleSource === '文件名', 'STORE_CORRUPT', '书名建议来源无效。');
    const reviewedTargetChoiceId =
      row.reviewed_target_choice_id === null ? null : asString(row.reviewed_target_choice_id);
    requireStore(
      reviewedTargetChoiceId === null ||
        reviewedTargetChoiceId === 'new-book' ||
        reviewedTargetChoiceId === 'new-book-distinct-intended-work',
      'STORE_CORRUPT',
      '导入复核目标无效。',
    );
    const selectedPath = row.selected_path === null ? null : asString(row.selected_path);
    requireStore(selectedPath === null || isAbsolute(selectedPath), 'STORE_CORRUPT', '原始所选路径无效。');
    const reviewedTargetKind = row.reviewed_target_kind === null ? null : asString(row.reviewed_target_kind);
    const reviewedExistingBookId = row.reviewed_existing_book_id === null ? null : asString(row.reviewed_existing_book_id);
    const reviewedRelationship = row.reviewed_relationship === null ? null : asString(row.reviewed_relationship);
    const reviewedBookStateDigest = row.reviewed_book_state_digest === null ? null : asString(row.reviewed_book_state_digest);
    const reviewedReuseSourceVersionId = row.reviewed_reuse_source_version_id === null
      ? null
      : asString(row.reviewed_reuse_source_version_id);
    const reviewedLineageStatus = row.reviewed_lineage_status === null ? null : asString(row.reviewed_lineage_status);
    const reviewedLineageSourceVersionId = row.reviewed_lineage_source_version_id === null
      ? null
      : asString(row.reviewed_lineage_source_version_id);
    const reviewedCheckpointRevisionId = row.reviewed_checkpoint_revision_id === null
      ? null
      : asString(row.reviewed_checkpoint_revision_id);
    const reviewedManuscriptId = row.reviewed_manuscript_id === null ? null : asString(row.reviewed_manuscript_id);
    const reviewedBranchId = row.reviewed_branch_id === null ? null : asString(row.reviewed_branch_id);
    requireStore(
      (reviewedTargetKind === null || reviewedTargetKind === 'new-book' || reviewedTargetKind === 'existing-book') &&
        (reviewedExistingBookId === null || UUID_PATTERN.test(reviewedExistingBookId)) &&
        (reviewedRelationship === null || reviewedRelationship === 'new-book-first-manuscript' ||
          reviewedRelationship === 'first-manuscript' || reviewedRelationship === 'source-only' ||
          reviewedRelationship === 'reimport') &&
        (reviewedBookStateDigest === null || DIGEST_PATTERN.test(reviewedBookStateDigest)) &&
        (reviewedReuseSourceVersionId === null || UUID_PATTERN.test(reviewedReuseSourceVersionId)) &&
        (reviewedLineageStatus === null || reviewedLineageStatus === 'verified' || reviewedLineageStatus === 'unconfirmed') &&
        (reviewedLineageSourceVersionId === null || UUID_PATTERN.test(reviewedLineageSourceVersionId)) &&
        (reviewedCheckpointRevisionId === null || UUID_PATTERN.test(reviewedCheckpointRevisionId)) &&
        (reviewedManuscriptId === null || UUID_PATTERN.test(reviewedManuscriptId)) &&
        (reviewedBranchId === null || UUID_PATTERN.test(reviewedBranchId)),
      'STORE_CORRUPT',
      '导入复核目标记录无效。',
    );
    return {
      draftId: asString(row.draft_id),
      state: asString(row.state),
      version: asNumber(row.draft_version),
      displayName: asString(row.display_name),
      objectDigest: asString(row.object_digest),
      selectedPath,
      reviewedTitle: row.reviewed_title === null ? null : asString(row.reviewed_title),
      reviewedTargetChoiceId,
      reviewedTargetKind: reviewedTargetKind as DraftSnapshot['reviewedTargetKind'],
      reviewedExistingBookId,
      reviewedRelationship: reviewedRelationship as DraftSnapshot['reviewedRelationship'],
      reviewedBookStateDigest,
      reviewedReuseSourceVersionId,
      reviewedLineageStatus: reviewedLineageStatus as DraftSnapshot['reviewedLineageStatus'],
      reviewedLineageSourceVersionId,
      reviewedCheckpointRevisionId,
      reviewedManuscriptId,
      reviewedBranchId,
      reviewDigest: row.review_digest === null ? null : asString(row.review_digest),
      stagedAt: asString(row.staged_at),
      parserIdentity: asString(row.parser_identity),
      sourceDigest,
      sourceBytes,
      contentDigest: asString(row.content_digest),
      structureDigest: asString(row.structure_digest),
      blockCount: asNumber(row.block_count),
      characterCount: asNumber(row.character_count),
      fidelity: fidelityValue as FidelityCategoryProjection[],
      titleSuggestion: asString(row.title_suggestion),
      titleSource,
    };
  }

  #requireFidelityPlan(snapshot: DraftSnapshot): ImportFidelityPlan {
    const plan = deriveImportFidelityPlan(snapshot.fidelity, snapshot.sourceDigest, snapshot.sourceBytes);
    requireStore(plan, 'FIDELITY_OUTSIDE_TRACER', '当前导入的保真计划不符合受限边界。');
    return plan;
  }

  #loadPersistedFidelity(fidelityReviewId: string): FidelityCategoryProjection[] {
    return (
      this.#authority
        .prepare(
          `SELECT category_key, display_label, item_count, status, detail
           FROM import_fidelity_categories WHERE fidelity_review_id = ? ORDER BY position`,
        )
        .all(fidelityReviewId) as SqlRow[]
    ).map((row) => {
      const status = asString(row.status);
      requireStore(status === 'preserved' || status === 'degraded' || status === 'unsupported', 'STORE_CORRUPT', '保真状态无效。');
      return {
        key: asString(row.category_key) as FidelityCategoryProjection['key'],
        label: asString(row.display_label),
        count: asNumber(row.item_count),
        status,
        statusLabel: status === 'preserved' ? '完整保留' : status === 'degraded' ? '降级导入' : '不支持导入',
        detail: asString(row.detail),
      };
    });
  }

  #loadStoredCommitResult(commitId: string): StoredImportCommitProjection {
    const counts = one(this.#authority.prepare(
      `SELECT
         (SELECT count(*) FROM manuscript_import_records WHERE commit_id = ?) manuscript_imports,
         (SELECT count(*) FROM source_import_records WHERE commit_id = ?) source_imports,
         (SELECT count(*) FROM manuscript_reimport_records WHERE commit_id = ?) reimports`,
    ).all(commitId, commitId, commitId) as SqlRow[], 'STORE_CORRUPT', '无法判定导入提交记录类型。');
    const manuscriptImports = asNumber(counts.manuscript_imports);
    const sourceImports = asNumber(counts.source_imports);
    const reimports = asNumber(counts.reimports);
    requireStore(manuscriptImports + sourceImports + reimports === 1, 'STORE_CORRUPT', '导入提交记录类型不唯一。');
    return reimports === 1
      ? this.#loadStoredReimportResult(commitId)
      : sourceImports === 1
      ? this.#loadStoredSourceImportResult(commitId)
      : this.#loadStoredManuscriptImportResult(commitId);
  }

  #loadStoredReimportResult(commitId: string): ManuscriptReimportCommitProjection {
    const row = one(this.#authority.prepare(
      `SELECT ic.commit_id, ic.committed_at, rr.*, sv.display_name, sv.source_digest,
              co.byte_length, d.reviewed_reuse_source_version_id
       FROM import_commits ic
       JOIN manuscript_reimport_records rr ON rr.commit_id = ic.commit_id
       JOIN source_versions sv ON sv.source_version_id = rr.source_version_id AND sv.book_id = rr.book_id
       JOIN content_objects co ON co.object_digest = sv.object_digest
       JOIN import_drafts d ON d.draft_id = ic.draft_id
       WHERE ic.commit_id = ? AND ic.operation_kind = 'manuscript-reimport'`,
    ).all(commitId) as SqlRow[], 'STORE_CORRUPT', '稿件重新导入提交记录图不完整。');
    const resultKind = asString(row.result_kind) as 'changed' | 'no-change';
    const completionLabel = asString(row.result_label) as '稿件已重新导入' | '未发现稿件变化';
    const lineageStatus = asString(row.lineage_status) as 'verified' | 'unconfirmed';
    const comparisonKind = asString(row.comparison_kind) as 'three-way' | 'two-way';
    const manuscriptId = asString(row.manuscript_id);
    const branchId = asString(row.branch_id);
    const bookId = asString(row.book_id);
    const reimportRecordId = asString(row.reimport_record_id);
    const receipt = this.#reimportRecordPresentations(bookId, [reimportRecordId])
      .find((record) => record.kind === 'manuscript-reimport-record');
    requireStore(receipt?.kind === 'manuscript-reimport-record', 'STORE_CORRUPT', '稿件重新导入完成凭据不完整。');
    return {
      commitId: asString(row.commit_id),
      importedAt: asString(row.committed_at),
      completionLabel,
      resultKind,
      bookId,
      manuscriptId,
      branchId,
      previousRevisionId: asString(row.previous_revision_id),
      resultingRevisionId: row.resulting_revision_id === null ? null : asString(row.resulting_revision_id),
      reimportRecordId,
      sourceVersionId: asString(row.source_version_id),
      sourceVersionDisposition: row.reviewed_reuse_source_version_id === null ? 'created' : 'reused-same-book',
      provenanceId: asString(row.provenance_id),
      lineageStatus,
      lineageLabel: lineageStatus === 'verified' ? '来源关系已确认' : '来源关系未确认',
      comparisonKind,
      comparisonDigest: asString(row.comparison_digest),
      resolutionDigest: asString(row.resolution_digest),
      source: {
        displayName: asString(row.display_name),
        format: 'DOCX',
        sourceSha256: asString(row.source_digest),
        sourceBytes: asNumber(row.byte_length),
        provenanceLabel: '本机文件选择器 · 本地解析 · 未联网',
      },
      receipt,
      overview: this.getBookOverview(bookId),
      window: this.getManuscriptWindow(manuscriptId, branchId, null),
    };
  }

  #loadStoredManuscriptImportResult(commitId: string): Omit<ManuscriptImportCommitProjection, 'firstWindow'> {
    const row = one(
      this.#authority
        .prepare(
          `SELECT ic.commit_id, ic.committed_at, ir.import_record_id, ir.book_id, ir.manuscript_id,
                  ir.fidelity_review_id, ir.degradation_decision_id, ir.resulting_revision_id,
                  mr.branch_id, sv.display_name, sv.object_digest, sv.source_digest, co.byte_length,
                  fr.outcome, fr.round_trip_guaranteed, dd.fidelity_review_id decision_fidelity_review_id,
                  dd.decision
           FROM import_commits ic
           JOIN manuscript_import_records ir ON ir.commit_id = ic.commit_id
           JOIN manuscript_revisions mr
             ON mr.revision_id = ir.resulting_revision_id
            AND mr.manuscript_id = ir.manuscript_id
            AND mr.source_version_id = ir.source_version_id
           JOIN source_versions sv
             ON sv.source_version_id = ir.source_version_id
            AND sv.book_id = ir.book_id
           JOIN content_objects co ON co.object_digest = sv.object_digest
           JOIN import_fidelity_reviews fr
             ON fr.fidelity_review_id = ir.fidelity_review_id
            AND fr.book_id = ir.book_id
            AND fr.source_version_id = ir.source_version_id
           LEFT JOIN import_degradation_decisions dd
             ON dd.degradation_decision_id = ir.degradation_decision_id
            AND dd.fidelity_review_id = ir.fidelity_review_id
           WHERE ic.commit_id = ?`,
        )
        .all(commitId) as SqlRow[],
      'STORE_CORRUPT',
      '导入提交记录图不完整。',
    );
    const fidelityReviewId = asString(row.fidelity_review_id);
    const sourceDigest = asString(row.source_digest);
    const sourceBytes = asNumber(row.byte_length);
    requireStore(asString(row.object_digest) === sourceDigest, 'STORE_CORRUPT', '提交来源对象与来源摘要不一致。');
    const categories = this.#loadPersistedFidelity(fidelityReviewId);
    const plan = deriveImportFidelityPlan(categories, sourceDigest, sourceBytes);
    requireStore(plan, 'STORE_CORRUPT', '导入提交保真记录无效。');
    requireStore(asString(row.outcome) === plan.outcome && asNumber(row.round_trip_guaranteed) === 0, 'STORE_CORRUPT', '导入保真结论无效。');
    const degradationDecisionId = row.degradation_decision_id === null ? null : asString(row.degradation_decision_id);
    if (plan.degradations.length === 0) {
      requireStore(degradationDecisionId === null && row.decision === null, 'STORE_CORRUPT', '洁净导入意外关联了降级决定。');
    } else {
      requireStore(
        degradationDecisionId !== null &&
          asString(row.decision_fidelity_review_id) === fidelityReviewId &&
          asString(row.decision) === canonicalDegradationDecision(plan),
        'STORE_CORRUPT',
        '导入降级决定无效。',
      );
    }
    const importRecordId = asString(row.import_record_id);
    return {
      commitId: asString(row.commit_id),
      importedAt: asString(row.committed_at),
      completionLabel: '稿件已导入',
      bookId: asString(row.book_id),
      manuscriptId: asString(row.manuscript_id),
      branchId: asString(row.branch_id),
      revisionId: asString(row.resulting_revision_id),
      importRecordId,
      source: {
        displayName: asString(row.display_name),
        format: 'DOCX',
        sourceSha256: sourceDigest,
        sourceBytes,
        provenanceLabel: '本机文件选择器 · 本地解析 · 未联网',
      },
      fidelityReview: { fidelityReviewId, outcome: plan.outcome, categories },
      importRecord: {
        importRecordId,
        fidelityReviewId,
        degradationDecision: degradationDecisionId
          ? {
              degradationDecisionId,
              summaryLabel: '含已接受的降级',
              acceptedItems: plan.degradations,
            }
          : null,
      },
      overview: this.getBookOverview(asString(row.book_id)),
    };
  }

  #loadStoredSourceImportResult(commitId: string): SourceImportCommitProjection {
    const row = one(this.#authority.prepare(
      `SELECT ic.commit_id, ic.committed_at, sir.source_import_record_id, sir.book_id,
              sir.source_version_id, sir.provenance_id, sir.target_kind,
              sir.source_version_disposition, sir.retained_boundary_json,
              sir.named_non_effects_json, sir.record_digest, sir.imported_at,
              sv.display_name, sv.object_digest, sv.source_digest, sv.content_digest,
              sv.structure_digest, sv.parser_identity, co.byte_length,
              sp.acquisition_path, sp.locality, sp.sanitized_identity, sp.recorded_at
       FROM import_commits ic
       JOIN source_import_records sir ON sir.commit_id = ic.commit_id
       JOIN source_versions sv
         ON sv.source_version_id = sir.source_version_id AND sv.book_id = sir.book_id
       JOIN content_objects co ON co.object_digest = sv.object_digest
       JOIN source_provenance sp
         ON sp.provenance_id = sir.provenance_id AND sp.source_version_id = sir.source_version_id
       WHERE ic.commit_id = ?`,
    ).all(commitId) as SqlRow[], 'STORE_CORRUPT', '来源导入提交记录图不完整。');
    const targetKind = asString(row.target_kind);
    const disposition = asString(row.source_version_disposition);
    requireStore(
      (targetKind === 'new-book' || targetKind === 'existing-book') &&
        (disposition === 'created' || disposition === 'reused-same-book') &&
        asString(row.object_digest) === asString(row.source_digest) &&
        asString(row.acquisition_path) === 'native-file-picker' && asString(row.locality) === 'local-provider-free' &&
        asString(row.imported_at) === asString(row.committed_at),
      'STORE_CORRUPT',
      '来源导入提交身份或来源记录无效。',
    );
    const retained = parseStoredJson(asString(row.retained_boundary_json), '来源导入保留边界无效。');
    const namedNonEffects = parseStoredJson(asString(row.named_non_effects_json), '来源导入非影响记录无效。');
    requireStore(
      retained !== null && typeof retained === 'object' && !Array.isArray(retained) &&
        Array.isArray(namedNonEffects) && canonicalJson(namedNonEffects) === canonicalJson(SOURCE_IMPORT_NON_EFFECTS),
      'STORE_CORRUPT',
      '来源导入保留边界或非影响记录无效。',
    );
    const boundary = retained as ReviewBeforeSourceImportProjection['retainedBoundary'];
    requireStore(
      boundary.kind === 'complete-local-file' && boundary.label === SOURCE_IMPORT_RETAINED_BOUNDARY_LABEL &&
        boundary.format === 'DOCX' && boundary.displayName === asString(row.sanitized_identity) &&
        boundary.sourceSha256 === asString(row.source_digest) &&
        boundary.sourceBytes === asNumber(row.byte_length) &&
        boundary.contentDigest === asString(row.content_digest) &&
        boundary.structureDigest === asString(row.structure_digest),
      'STORE_CORRUPT',
      '来源导入保留边界与来源版本不一致。',
    );
    const sourceImportRecordId = asString(row.source_import_record_id);
    const bookId = asString(row.book_id);
    const sourceVersionId = asString(row.source_version_id);
    const provenanceId = asString(row.provenance_id);
    const importedAt = asString(row.imported_at);
    const recordDigest = sha256(canonicalJson({
      schema: SOURCE_IMPORT_RECORD_SCHEMA,
      sourceImportRecordId,
      commitId: asString(row.commit_id),
      bookId,
      sourceVersionId,
      provenanceId,
      targetKind,
      sourceVersionDisposition: disposition,
      retainedBoundary: retained,
      namedNonEffects,
      importedAt,
    }));
    requireStore(recordDigest === asString(row.record_digest), 'STORE_CORRUPT', '来源导入记录摘要无效。');
    const receiptRecords = this.#sourceImportRecordPresentations(bookId, [sourceImportRecordId]);
    const receiptSource = receiptRecords.find((record) => record.kind === 'source');
    const receiptRecord = receiptRecords.find((record) => record.kind === 'source-import-record');
    requireStore(receiptSource?.kind === 'source' && receiptRecord?.kind === 'source-import-record',
      'STORE_CORRUPT', '来源导入完成凭据不完整。');
    return {
      commitId: asString(row.commit_id),
      importedAt,
      completionLabel: '来源材料已导入',
      targetKind,
      createdBook: targetKind === 'new-book',
      bookId,
      sourceVersionId,
      sourceImportRecordId,
      sourceVersionDisposition: disposition,
      source: {
        displayName: boundary.displayName,
        format: 'DOCX',
        sourceSha256: boundary.sourceSha256,
        sourceBytes: boundary.sourceBytes,
        provenanceLabel: '本机文件选择器 · 本地解析 · 未联网',
      },
      retainedBoundary: boundary,
      provenance: {
        acquisitionPath: 'native-file-picker',
        locality: 'local-provider-free',
        label: '本机文件选择器 · 本地解析 · 未联网',
        acquiredAt: asString(row.recorded_at),
        provenanceId,
      },
      namedNonEffects: namedNonEffects as string[],
      receipt: { source: receiptSource, record: receiptRecord },
      overview: this.getBookOverview(bookId),
    };
  }

  #assertImportPostconditions(input: {
    bookId: string;
    dimensionSetId: string;
    manuscriptId: string;
    branchId: string;
    revisionId: string;
    sourceVersionId: string;
    fidelityReviewId: string;
    degradationDecisionId: string | null;
    workflowInstanceId: string;
    importRecordId: string;
    blockCount: number;
    characterCount: number;
    reviewDigest: string;
    fidelityPlan: ImportFidelityPlan;
    sourceDigest: string;
    sourceBytes: number;
  }): void {
    const counts = one(
      this.#authority
        .prepare(
          `SELECT
             (SELECT count(*) FROM books WHERE book_id = ?) books,
             (SELECT count(*) FROM book_dimensions WHERE dimension_set_id = ?) dimensions,
             (SELECT count(*) FROM manuscripts WHERE manuscript_id = ? AND role = 'primary') manuscripts,
             (SELECT count(*) FROM manuscript_branches WHERE branch_id = ? AND base_revision_id = ?) branches,
             (SELECT count(*) FROM manuscript_revisions WHERE revision_id = ? AND revision_label = 'r1' AND parent_revision_id IS NULL) revisions,
             (SELECT count(*) FROM manuscript_block_versions WHERE revision_id = ?) blocks,
             (SELECT count(*) FROM working_blocks WHERE branch_id = ?) working_blocks,
             (SELECT count(*) FROM working_offset_nodes WHERE branch_id = ?) offset_nodes,
             (SELECT count(*) FROM branch_working_state
                WHERE branch_id = ? AND total_graphemes = ?) working_state,
             (SELECT count(*) FROM source_versions
                WHERE source_version_id = ? AND object_digest = ? AND source_digest = ?) sources,
             (SELECT count(*) FROM import_fidelity_reviews
                WHERE fidelity_review_id = ? AND book_id = ? AND source_version_id = ?
                  AND outcome = ? AND review_digest = ?
                  AND round_trip_guaranteed = 0) fidelity_reviews,
             (SELECT count(*) FROM import_fidelity_categories WHERE fidelity_review_id = ?) fidelity_categories,
             (SELECT count(*) FROM import_degradation_decisions WHERE fidelity_review_id = ?) degradation_decisions,
             (SELECT count(*) FROM workflow_instances
                WHERE workflow_instance_id = ?
                  AND profile_id = ? AND profile_version = ? AND profile_digest = ?
                  AND native_profile_id = ? AND native_profile_version = ? AND native_profile_digest = ?) workflows,
             (SELECT count(*) FROM manuscript_import_records
                WHERE import_record_id = ? AND book_id = ? AND manuscript_id = ?
                  AND source_version_id = ? AND fidelity_review_id = ? AND resulting_revision_id = ?
                  AND degradation_decision_id IS ?) imports`,
        )
        .all(
          input.bookId,
          input.dimensionSetId,
          input.manuscriptId,
          input.branchId,
          input.revisionId,
          input.revisionId,
          input.revisionId,
          input.branchId,
          input.branchId,
          input.branchId,
          input.characterCount,
          input.sourceVersionId,
          input.sourceDigest,
          input.sourceDigest,
          input.fidelityReviewId,
          input.bookId,
          input.sourceVersionId,
          input.fidelityPlan.outcome,
          input.reviewDigest,
          input.fidelityReviewId,
          input.fidelityReviewId,
          input.workflowInstanceId,
          this.#workflowProfile.projection.id,
          this.#workflowProfile.projection.version,
          this.#workflowProfile.projection.digest,
          this.#workflowProfile.native.id,
          this.#workflowProfile.native.version,
          this.#workflowProfile.native.digest,
          input.importRecordId,
          input.bookId,
          input.manuscriptId,
          input.sourceVersionId,
          input.fidelityReviewId,
          input.revisionId,
          input.degradationDecisionId,
        ) as SqlRow[],
      'IMPORT_POSTCONDITION_FAILED',
      '导入提交后置条件缺失。',
    );
    requireStore(
      asNumber(counts.books) === 1 &&
        asNumber(counts.dimensions) === 8 &&
        asNumber(counts.manuscripts) === 1 &&
        asNumber(counts.branches) === 1 &&
        asNumber(counts.revisions) === 1 &&
        asNumber(counts.blocks) === input.blockCount &&
        asNumber(counts.working_blocks) === input.blockCount &&
        asNumber(counts.offset_nodes) === input.blockCount &&
        asNumber(counts.working_state) === 1 &&
        asNumber(counts.sources) === 1 &&
        asNumber(counts.fidelity_reviews) === 1 &&
        asNumber(counts.fidelity_categories) === 8 &&
        asNumber(counts.degradation_decisions) === (input.degradationDecisionId === null ? 0 : 1) &&
        asNumber(counts.workflows) === 1 &&
        asNumber(counts.imports) === 1,
      'IMPORT_POSTCONDITION_FAILED',
      '导入提交未形成完整记录图。',
    );
    const categories = this.#loadPersistedFidelity(input.fidelityReviewId);
    const persistedPlan = deriveImportFidelityPlan(categories, input.sourceDigest, input.sourceBytes);
    requireStore(
      persistedPlan && canonicalJson(persistedPlan) === canonicalJson(input.fidelityPlan),
      'IMPORT_POSTCONDITION_FAILED',
      '导入提交未形成精确保真分类。',
    );
    const decisions = this.#authority
      .prepare(
        `SELECT degradation_decision_id, decision
         FROM import_degradation_decisions WHERE fidelity_review_id = ?`,
      )
      .all(input.fidelityReviewId) as SqlRow[];
    if (input.degradationDecisionId === null) {
      requireStore(decisions.length === 0, 'IMPORT_POSTCONDITION_FAILED', '洁净导入意外创建了降级决定。');
    } else {
      const decision = one(decisions, 'IMPORT_POSTCONDITION_FAILED', '降级导入未形成唯一决定。');
      requireStore(
        asString(decision.degradation_decision_id) === input.degradationDecisionId &&
          asString(decision.decision) === canonicalDegradationDecision(input.fidelityPlan),
        'IMPORT_POSTCONDITION_FAILED',
        '降级导入决定与保真审阅不匹配。',
      );
    }
  }

  #assertForeignKeys(db: DatabaseSync): void {
    const violations = db.prepare('PRAGMA foreign_key_check').all();
    requireStore(violations.length === 0, 'FOREIGN_KEY_FAILED', '持久化引用校验失败。');
  }

  async #withContentObjectLifecycle<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.#contentObjectLifecycleTail;
    let release = (): void => {};
    this.#contentObjectLifecycleTail = new Promise<void>((resolve) => {
      release = () => resolve();
    });
    await previous;
    try {
      this.#assertAvailable();
      return await operation();
    } finally {
      release();
    }
  }

  async #withRecoveryObjectLifecycle<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.#recoveryObjectLifecycleTail;
    let release = (): void => {};
    this.#recoveryObjectLifecycleTail = new Promise<void>((resolve) => {
      release = () => resolve();
    });
    await previous;
    try {
      this.#assertAvailable();
      return await operation();
    } finally {
      release();
    }
  }

  #boundedCall<T>(operation: () => T): T {
    this.#assertAvailable();
    try {
      return operation();
    } catch (error) {
      if (error instanceof BoundedStoreFatalError) {
        this.#poisoned = true;
        throw new StoreFatalError(error);
      }
      if (error instanceof BoundedStoreError) throw new StoreError(error.code, error.message);
      throw error;
    }
  }

  async #artifactCall<T>(operation: () => Promise<T>): Promise<T> {
    this.#assertAvailable();
    try {
      return await operation();
    } catch (error) {
      if (error instanceof EditorialWorkspaceProfileFatalError) {
        this.#poisoned = true;
        throw new StoreFatalError(error);
      }
      if (error instanceof EditorialWorkspaceProfileError) throw new StoreError(error.code, error.message);
      throw error;
    }
  }

  #transaction<T>(db: DatabaseSync, operation: () => T): T {
    this.#assertAvailable();
    db.exec('BEGIN IMMEDIATE');
    try {
      const result = operation();
      db.exec('COMMIT');
      return result;
    } catch (error) {
      try {
        db.exec('ROLLBACK');
      } catch (rollbackError) {
        this.#poisoned = true;
        throw new StoreFatalError(new AggregateError([error, rollbackError], 'SQLite rollback failed.'));
      }
      throw error;
    }
  }

  #assertAvailable(): void {
    if (this.#poisoned) throw new StoreFatalError(new Error('Authority store is poisoned.'));
  }

}
