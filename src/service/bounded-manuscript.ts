import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { DatabaseSync, type SQLOutputValue } from 'node:sqlite';
import {
  MAX_BLOCK_CODE_UNITS,
  MAX_BLOCK_GRAPHEMES,
  MAX_EDIT_CODE_UNITS,
  MAX_EDIT_GRAPHEMES,
  MAX_FRAME_BYTES,
  MAX_OUTLINE_DISPLAY_UTF8_BYTES,
  MAX_OUTLINE_RESULTS,
  MAX_REPLACEMENT_EXCLUSIONS,
  MAX_REPLACEMENT_GRAPHEMES,
  MAX_SEARCH_QUERY_GRAPHEMES,
  MAX_SEARCH_RESULTS,
  MAX_WINDOW_BLOCKS,
  type DurableHistoryProjection,
  type FidelityCategoryProjection,
  type HistoricalRevisionProjection,
  type JournalAcknowledgement,
  type JournalEditInput,
  type ManuscriptBlockProjection,
  type ManuscriptWindowProjection,
  type ManuscriptWindowTarget,
  type MilestoneProjection,
  type OutlineProjection,
  type PriorWorkItemProjection,
  type ReplacementCommitProjection,
  type ReplacementPreviewProjection,
  type RecoveryComparisonProjection,
  type RecoveryDeferralProjection,
  type RecoveryRestorationProjection,
  type RecoverySelection,
  type RecoverySnapshotComparisonProjection,
  type RecoveryWindowProjection,
  type RecoveryWindowTarget,
  type BookWorkbenchRoute,
  type ResolvedBookWorkbenchRoute,
  type SearchMatchProjection,
  type SearchResultsProjection,
  type SearchSummaryProjection,
} from '../shared/protocol.js';
import { deriveImportFidelityPlan } from './docx.js';
import type { BuiltInWorkflowProfile } from './native-workflow-profile.js';
import {
  EDITORIAL_WORKSPACE_PROFILE_BOOK_PINS_SCHEMA_SQL,
  EDITORIAL_WORKSPACE_PROFILE_SIDECAR_REVISIONS_SCHEMA_SQL,
  EDITORIAL_WORKSPACE_PROFILE_SIDECAR_TRIGGER_SQL,
  NATIVE_ARTIFACT_BOOK_ENABLEMENTS_SCHEMA_SQL,
  NATIVE_ARTIFACT_INSTALLATIONS_SCHEMA_SQL,
} from './editorial-workspace-profile.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DIGEST_PATTERN = /^[0-9a-f]{64}$/;
const BLOCK_PATTERN = /^blk_[0-9a-f]{24}$/;
const CONTINUITY_SCHEMA_VERSION = 5;
const EDITOR_SCHEMA_VERSION = 6;
const RECOVERY_SCHEMA_VERSION = 7;
const SCHEMA_VERSION = 8;
const SOURCE_IMPORT_SCHEMA_VERSION = 9;
const MANUSCRIPT_REIMPORT_SCHEMA_VERSION = 10;
const MODEL_SERVICE_SCHEMA_VERSION = 11;
const NATIVE_ARTIFACT_SCHEMA_VERSION = 12;
const AUTHORITY_SIDECAR_SCHEMA_VERSION = 13;
const MIGRATION_BATCH = 256;
const SEARCH_BATCH = 128;
const HISTORY_BATCH = 128;
const WINDOW_STRIDE = Math.floor(MAX_WINDOW_BLOCKS / 2);
const MAX_RETAINED_TRANSIENT_SEARCHES = 32;
const MAX_RETAINED_REPLACEMENT_PREVIEWS = 8;
const MAX_RETAINED_TERMINAL_REPLACEMENTS = 4;
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
const REPLACEMENT_MATCHING_RULE = '精确字素匹配；从左向右；重叠时保留最早匹配' as const;
const REPLACEMENT_INCLUSION_RULE = '仅提交冻结时明确纳入的非重叠精确匹配' as const;

export const MODEL_SERVICE_CONNECTION_SCHEMA_SQL = `CREATE TABLE model_service_connections (
  connection_id TEXT PRIMARY KEY CHECK(connection_id = 'main-editorial-deepseek-v4-pro'),
  role_id TEXT NOT NULL CHECK(role_id = 'main-editorial'),
  connection_name TEXT NOT NULL CHECK(length(connection_name) BETWEEN 1 AND 80),
  provider_id TEXT NOT NULL CHECK(provider_id = 'deepseek-open-platform'),
  model_id TEXT NOT NULL CHECK(model_id = 'deepseek-v4-pro'),
  adapter_revision INTEGER NOT NULL CHECK(adapter_revision = 1),
  configuration_revision INTEGER NOT NULL CHECK(configuration_revision = 1),
  approved_fallback_chain TEXT NOT NULL CHECK(approved_fallback_chain = '[]'),
  credential_slot TEXT NOT NULL CHECK(credential_slot = 'deepseek-api-key'),
  credential_reference TEXT NOT NULL UNIQUE CHECK(length(credential_reference) = 36),
  credential_operation_state TEXT NOT NULL CHECK(credential_operation_state IN ('ready', 'missing', 'needs-attention')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  credential_updated_at TEXT NOT NULL
) STRICT`;

type SqlRow = Record<string, SQLOutputValue>;

const COMMON_SCHEMA_SQL = {
  content_objects: `CREATE TABLE content_objects (
    object_digest TEXT PRIMARY KEY CHECK(length(object_digest) = 64),
    relative_key TEXT NOT NULL UNIQUE,
    byte_length INTEGER NOT NULL CHECK(byte_length > 0),
    verified_at TEXT NOT NULL
  ) STRICT`,
  import_drafts: `CREATE TABLE import_drafts (
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
  ) STRICT`,
  books: `CREATE TABLE books (
    book_id TEXT PRIMARY KEY,
    stable_identity TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    created_at TEXT NOT NULL
  ) STRICT`,
  book_dimension_sets: `CREATE TABLE book_dimension_sets (
    dimension_set_id TEXT PRIMARY KEY,
    book_id TEXT NOT NULL UNIQUE REFERENCES books(book_id),
    version INTEGER NOT NULL CHECK(version = 1),
    profile_id TEXT NOT NULL,
    profile_version TEXT NOT NULL,
    definition_digest TEXT NOT NULL CHECK(length(definition_digest) = 64),
    weight_semantics TEXT NOT NULL CHECK(weight_semantics = '中性起始权重；非穷尽评分量表'),
    created_at TEXT NOT NULL
  ) STRICT`,
  book_dimensions: `CREATE TABLE book_dimensions (
    dimension_set_id TEXT NOT NULL REFERENCES book_dimension_sets(dimension_set_id),
    dimension_id TEXT NOT NULL,
    display_label TEXT NOT NULL,
    weight REAL NOT NULL CHECK(weight > 0),
    position INTEGER NOT NULL CHECK(position BETWEEN 1 AND 8),
    PRIMARY KEY(dimension_set_id, dimension_id),
    UNIQUE(dimension_set_id, position)
  ) STRICT`,
  source_versions: `CREATE TABLE source_versions (
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
  ) STRICT`,
  source_provenance: `CREATE TABLE source_provenance (
    provenance_id TEXT PRIMARY KEY,
    source_version_id TEXT NOT NULL UNIQUE REFERENCES source_versions(source_version_id),
    acquisition_path TEXT NOT NULL CHECK(acquisition_path = 'native-file-picker'),
    locality TEXT NOT NULL CHECK(locality = 'local-provider-free'),
    sanitized_identity TEXT NOT NULL,
    parser_identity TEXT NOT NULL,
    recorded_at TEXT NOT NULL
  ) STRICT`,
  import_fidelity_reviews: `CREATE TABLE import_fidelity_reviews (
    fidelity_review_id TEXT PRIMARY KEY,
    book_id TEXT NOT NULL REFERENCES books(book_id),
    source_version_id TEXT NOT NULL UNIQUE REFERENCES source_versions(source_version_id),
    review_digest TEXT NOT NULL UNIQUE,
    outcome TEXT NOT NULL CHECK(outcome IN ('clean-import-no-round-trip', 'degraded-import-no-round-trip')),
    round_trip_guaranteed INTEGER NOT NULL CHECK(round_trip_guaranteed = 0),
    created_at TEXT NOT NULL
  ) STRICT`,
  import_fidelity_categories: `CREATE TABLE import_fidelity_categories (
    fidelity_review_id TEXT NOT NULL REFERENCES import_fidelity_reviews(fidelity_review_id),
    category_key TEXT NOT NULL,
    display_label TEXT NOT NULL,
    item_count INTEGER NOT NULL CHECK(item_count >= 0),
    status TEXT NOT NULL CHECK(status IN ('preserved', 'degraded', 'unsupported')),
    detail TEXT NOT NULL,
    position INTEGER NOT NULL CHECK(position BETWEEN 1 AND 8),
    PRIMARY KEY(fidelity_review_id, category_key),
    UNIQUE(fidelity_review_id, position)
  ) STRICT`,
  import_degradation_decisions: `CREATE TABLE import_degradation_decisions (
    degradation_decision_id TEXT PRIMARY KEY,
    fidelity_review_id TEXT NOT NULL UNIQUE REFERENCES import_fidelity_reviews(fidelity_review_id),
    decision TEXT NOT NULL,
    created_at TEXT NOT NULL
  ) STRICT`,
  manuscripts: `CREATE TABLE manuscripts (
    manuscript_id TEXT PRIMARY KEY,
    book_id TEXT NOT NULL UNIQUE REFERENCES books(book_id),
    role TEXT NOT NULL CHECK(role = 'primary'),
    created_at TEXT NOT NULL
  ) STRICT`,
  manuscript_branches: `CREATE TABLE manuscript_branches (
    branch_id TEXT PRIMARY KEY,
    manuscript_id TEXT NOT NULL REFERENCES manuscripts(manuscript_id),
    name TEXT NOT NULL,
    base_revision_id TEXT REFERENCES manuscript_revisions(revision_id),
    created_at TEXT NOT NULL,
    UNIQUE(manuscript_id, name)
  ) STRICT`,
  manuscript_blocks: `CREATE TABLE manuscript_blocks (
    block_id TEXT PRIMARY KEY,
    manuscript_id TEXT NOT NULL REFERENCES manuscripts(manuscript_id),
    created_revision_id TEXT NOT NULL REFERENCES manuscript_revisions(revision_id)
  ) STRICT`,
  workflow_profiles: `CREATE TABLE workflow_profiles (
    profile_id TEXT NOT NULL,
    profile_version TEXT NOT NULL,
    profile_name TEXT NOT NULL,
    profile_digest TEXT NOT NULL CHECK(length(profile_digest) = 64),
    definition_json TEXT NOT NULL,
    PRIMARY KEY(profile_id, profile_version)
  ) STRICT`,
  workflow_instances: `CREATE TABLE workflow_instances (
    workflow_instance_id TEXT PRIMARY KEY,
    book_id TEXT NOT NULL REFERENCES books(book_id),
    manuscript_id TEXT NOT NULL UNIQUE REFERENCES manuscripts(manuscript_id),
    profile_id TEXT NOT NULL,
    profile_version TEXT NOT NULL,
    current_phase TEXT NOT NULL,
    state TEXT NOT NULL CHECK(state = 'active'),
    created_at TEXT NOT NULL,
    FOREIGN KEY(profile_id, profile_version) REFERENCES workflow_profiles(profile_id, profile_version)
  ) STRICT`,
  manuscript_import_records: `CREATE TABLE manuscript_import_records (
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
  ) STRICT`,
  import_commits: `CREATE TABLE import_commits (
    commit_id TEXT PRIMARY KEY,
    draft_id TEXT NOT NULL UNIQUE REFERENCES import_drafts(draft_id),
    request_fingerprint TEXT NOT NULL,
    expected_draft_version INTEGER NOT NULL,
    review_digest TEXT NOT NULL,
    result_json TEXT NOT NULL,
    committed_at TEXT NOT NULL
  ) STRICT`,
  import_commit_attempts: `CREATE TABLE import_commit_attempts (
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
  ) STRICT`,
  import_abandonment_cleanup_intents: `CREATE TABLE import_abandonment_cleanup_intents (
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
  ) STRICT`,
} as const;

const MIGRATED_CONTINUITY_IMPORT_DRAFT_SQL = `CREATE TABLE import_drafts (
  draft_id TEXT PRIMARY KEY,
  selection_token TEXT NOT NULL UNIQUE,
  state TEXT NOT NULL CHECK(state IN ('staged', 'reviewed', 'committed')),
  draft_version INTEGER NOT NULL CHECK(draft_version >= 1),
  display_name TEXT NOT NULL,
  object_digest TEXT NOT NULL REFERENCES content_objects(object_digest),
  reviewed_title TEXT,
  review_digest TEXT UNIQUE,
  committed_commit_id TEXT UNIQUE,
  staged_at TEXT NOT NULL,
  reviewed_at TEXT,
  committed_at TEXT,
  selected_path TEXT,
  reviewed_target_choice_id TEXT
    CHECK(reviewed_target_choice_id IS NULL OR reviewed_target_choice_id IN ('new-book', 'new-book-distinct-intended-work'))
) STRICT`;

const CONTINUITY_SCHEMA_SQL = {
  staged_import_snapshots: `CREATE TABLE staged_import_snapshots (
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
  ) STRICT`,
  staged_import_blocks: `CREATE TABLE staged_import_blocks (
    draft_id TEXT NOT NULL REFERENCES staged_import_snapshots(draft_id) ON DELETE CASCADE,
    staged_block_id TEXT NOT NULL,
    position INTEGER NOT NULL CHECK(position > 0),
    kind TEXT NOT NULL CHECK(kind IN ('title', 'heading', 'paragraph')),
    level INTEGER,
    text TEXT NOT NULL,
    digest TEXT NOT NULL CHECK(length(digest) = 64),
    PRIMARY KEY(draft_id, position),
    UNIQUE(draft_id, staged_block_id)
  ) STRICT`,
  manuscript_revisions: `CREATE TABLE manuscript_revisions (
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
  ) STRICT`,
  manuscript_block_versions: `CREATE TABLE manuscript_block_versions (
    revision_id TEXT NOT NULL REFERENCES manuscript_revisions(revision_id),
    block_id TEXT NOT NULL REFERENCES manuscript_blocks(block_id),
    position INTEGER NOT NULL CHECK(position > 0),
    kind TEXT NOT NULL CHECK(kind IN ('title', 'heading', 'paragraph')),
    level INTEGER,
    text TEXT NOT NULL,
    digest TEXT NOT NULL CHECK(length(digest) = 64),
    PRIMARY KEY(revision_id, block_id),
    UNIQUE(revision_id, position)
  ) STRICT`,
  branch_working_state: `CREATE TABLE branch_working_state (
    branch_id TEXT PRIMARY KEY REFERENCES manuscript_branches(branch_id),
    manuscript_id TEXT NOT NULL REFERENCES manuscripts(manuscript_id),
    base_revision_id TEXT NOT NULL REFERENCES manuscript_revisions(revision_id),
    journal_sequence INTEGER NOT NULL CHECK(journal_sequence >= 0),
    working_digest TEXT NOT NULL CHECK(length(working_digest) = 64)
  ) STRICT`,
  working_blocks: `CREATE TABLE working_blocks (
    branch_id TEXT NOT NULL REFERENCES manuscript_branches(branch_id),
    block_id TEXT NOT NULL REFERENCES manuscript_blocks(block_id),
    position INTEGER NOT NULL CHECK(position > 0),
    kind TEXT NOT NULL CHECK(kind IN ('title', 'heading', 'paragraph')),
    level INTEGER,
    text TEXT NOT NULL,
    digest TEXT NOT NULL CHECK(length(digest) = 64),
    PRIMARY KEY(branch_id, block_id),
    UNIQUE(branch_id, position)
  ) STRICT`,
  edit_journal_entries: `CREATE TABLE edit_journal_entries (
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
  ) STRICT`,
} as const;

const TARGET_BASE_SCHEMA_SQL = {
  import_ingest_blocks: `CREATE TABLE import_ingest_blocks (
    ingest_id TEXT NOT NULL,
    draft_id TEXT NOT NULL,
    staged_block_id TEXT NOT NULL,
    position INTEGER NOT NULL CHECK(position > 0),
    kind TEXT NOT NULL CHECK(kind IN ('title', 'heading', 'paragraph')),
    level INTEGER,
    text TEXT NOT NULL,
    digest TEXT NOT NULL CHECK(length(digest) = 64),
    start_offset INTEGER NOT NULL CHECK(start_offset >= 0),
    grapheme_length INTEGER NOT NULL CHECK(grapheme_length >= 0),
    PRIMARY KEY(ingest_id, position),
    UNIQUE(ingest_id, staged_block_id)
  ) STRICT`,
  staged_import_snapshots: `CREATE TABLE staged_import_snapshots (
    draft_id TEXT PRIMARY KEY REFERENCES import_drafts(draft_id) ON DELETE CASCADE,
    parser_identity TEXT NOT NULL,
    source_digest TEXT NOT NULL CHECK(length(source_digest) = 64),
    content_digest TEXT NOT NULL CHECK(length(content_digest) = 64),
    structure_digest TEXT NOT NULL CHECK(length(structure_digest) = 64),
    block_count INTEGER NOT NULL CHECK(block_count > 0),
    fidelity_json TEXT NOT NULL,
    title_suggestion TEXT NOT NULL,
    title_source TEXT NOT NULL,
    snapshot_created_at TEXT NOT NULL,
    character_count INTEGER NOT NULL DEFAULT 0 CHECK(character_count >= 0)
  ) STRICT`,
  staged_import_blocks: `CREATE TABLE staged_import_blocks (
    draft_id TEXT NOT NULL REFERENCES staged_import_snapshots(draft_id) ON DELETE CASCADE,
    staged_block_id TEXT NOT NULL,
    position INTEGER NOT NULL CHECK(position > 0),
    kind TEXT NOT NULL CHECK(kind IN ('title', 'heading', 'paragraph')),
    level INTEGER,
    text TEXT NOT NULL,
    digest TEXT NOT NULL CHECK(length(digest) = 64),
    start_offset INTEGER NOT NULL DEFAULT 0 CHECK(start_offset >= 0),
    grapheme_length INTEGER NOT NULL DEFAULT 0 CHECK(grapheme_length >= 0),
    PRIMARY KEY(draft_id, position),
    UNIQUE(draft_id, staged_block_id)
  ) STRICT`,
  manuscript_revisions: `CREATE TABLE manuscript_revisions (
    revision_id TEXT PRIMARY KEY,
    manuscript_id TEXT NOT NULL REFERENCES manuscripts(manuscript_id),
    branch_id TEXT NOT NULL REFERENCES manuscript_branches(branch_id),
    ordinal INTEGER NOT NULL CHECK(ordinal > 0),
    revision_label TEXT NOT NULL,
    parent_revision_id TEXT REFERENCES manuscript_revisions(revision_id),
    source_version_id TEXT NOT NULL REFERENCES source_versions(source_version_id),
    revision_digest TEXT NOT NULL CHECK(length(revision_digest) = 64),
    created_at TEXT NOT NULL,
    UNIQUE(manuscript_id, ordinal),
    UNIQUE(manuscript_id, revision_label)
  ) STRICT`,
  manuscript_block_versions: `CREATE TABLE manuscript_block_versions (
    revision_id TEXT NOT NULL REFERENCES manuscript_revisions(revision_id),
    block_id TEXT NOT NULL REFERENCES manuscript_blocks(block_id),
    position INTEGER NOT NULL CHECK(position > 0),
    kind TEXT NOT NULL CHECK(kind IN ('title', 'heading', 'paragraph')),
    level INTEGER,
    text TEXT NOT NULL,
    digest TEXT NOT NULL CHECK(length(digest) = 64),
    start_offset INTEGER NOT NULL DEFAULT 0 CHECK(start_offset >= 0),
    grapheme_length INTEGER NOT NULL DEFAULT 0 CHECK(grapheme_length >= 0),
    PRIMARY KEY(revision_id, block_id),
    UNIQUE(revision_id, position)
  ) STRICT`,
  branch_working_state: `CREATE TABLE branch_working_state (
    branch_id TEXT PRIMARY KEY REFERENCES manuscript_branches(branch_id),
    manuscript_id TEXT NOT NULL REFERENCES manuscripts(manuscript_id),
    base_revision_id TEXT NOT NULL REFERENCES manuscript_revisions(revision_id),
    journal_sequence INTEGER NOT NULL CHECK(journal_sequence >= 0),
    working_digest TEXT NOT NULL CHECK(length(working_digest) = 64),
    total_graphemes INTEGER NOT NULL DEFAULT 0 CHECK(total_graphemes >= 0),
    history_sequence INTEGER NOT NULL DEFAULT 0 CHECK(history_sequence >= 0),
    last_checkpoint_sequence INTEGER NOT NULL DEFAULT 0 CHECK(last_checkpoint_sequence >= 0)
  ) STRICT`,
  working_blocks: `CREATE TABLE working_blocks (
    branch_id TEXT NOT NULL REFERENCES manuscript_branches(branch_id),
    block_id TEXT NOT NULL REFERENCES manuscript_blocks(block_id),
    position INTEGER NOT NULL CHECK(position > 0),
    kind TEXT NOT NULL CHECK(kind IN ('title', 'heading', 'paragraph')),
    level INTEGER,
    text TEXT NOT NULL,
    digest TEXT NOT NULL CHECK(length(digest) = 64),
    start_offset INTEGER NOT NULL DEFAULT 0 CHECK(start_offset >= 0),
    grapheme_length INTEGER NOT NULL DEFAULT 0 CHECK(grapheme_length >= 0),
    PRIMARY KEY(branch_id, block_id),
    UNIQUE(branch_id, position)
  ) STRICT`,
  edit_journal_entries: `CREATE TABLE edit_journal_entries (
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
    command_group_id TEXT,
    command_kind TEXT NOT NULL DEFAULT 'edit',
    UNIQUE(branch_id, sequence)
  ) STRICT`,
  manuscript_outline: `CREATE TABLE manuscript_outline (
    branch_id TEXT NOT NULL REFERENCES manuscript_branches(branch_id),
    block_id TEXT NOT NULL REFERENCES manuscript_blocks(block_id),
    position INTEGER NOT NULL CHECK(position > 0),
    start_offset INTEGER NOT NULL CHECK(start_offset >= 0),
    kind TEXT NOT NULL CHECK(kind IN ('title', 'heading')),
    level INTEGER NOT NULL CHECK(level BETWEEN 1 AND 6),
    text TEXT NOT NULL,
    digest TEXT NOT NULL CHECK(length(digest) = 64),
    PRIMARY KEY(branch_id, block_id),
    UNIQUE(branch_id, position)
  ) STRICT`,
  manuscript_command_groups: `CREATE TABLE manuscript_command_groups (
    command_group_id TEXT PRIMARY KEY,
    branch_id TEXT NOT NULL REFERENCES manuscript_branches(branch_id),
    ordinal INTEGER NOT NULL CHECK(ordinal > 0),
    kind TEXT NOT NULL CHECK(kind IN ('edit', 'replacement')),
    status TEXT NOT NULL CHECK(status IN ('applied', 'undone', 'superseded')),
    source_group_id TEXT,
    before_working_digest TEXT NOT NULL CHECK(length(before_working_digest) = 64),
    after_working_digest TEXT NOT NULL CHECK(length(after_working_digest) = 64),
    created_at TEXT NOT NULL,
    UNIQUE(branch_id, ordinal)
  ) STRICT`,
  manuscript_command_edits: `CREATE TABLE manuscript_command_edits (
    command_group_id TEXT NOT NULL REFERENCES manuscript_command_groups(command_group_id),
    position INTEGER NOT NULL CHECK(position > 0),
    block_id TEXT NOT NULL REFERENCES manuscript_blocks(block_id),
    before_text TEXT NOT NULL,
    before_digest TEXT NOT NULL CHECK(length(before_digest) = 64),
    after_text TEXT NOT NULL,
    after_digest TEXT NOT NULL CHECK(length(after_digest) = 64),
    PRIMARY KEY(command_group_id, position),
    UNIQUE(command_group_id, block_id)
  ) STRICT`,
  milestone_versions: `CREATE TABLE milestone_versions (
    milestone_id TEXT PRIMARY KEY,
    manuscript_id TEXT NOT NULL REFERENCES manuscripts(manuscript_id),
    branch_id TEXT NOT NULL REFERENCES manuscript_branches(branch_id),
    revision_id TEXT NOT NULL REFERENCES manuscript_revisions(revision_id),
    label TEXT NOT NULL,
    purpose TEXT NOT NULL,
    note TEXT,
    actor TEXT NOT NULL CHECK(actor = '本机编辑'),
    created_at TEXT NOT NULL,
    UNIQUE(branch_id, label)
  ) STRICT`,
  manuscript_search_sessions: `CREATE TABLE manuscript_search_sessions (
    search_id TEXT PRIMARY KEY,
    manuscript_id TEXT NOT NULL REFERENCES manuscripts(manuscript_id),
    branch_id TEXT NOT NULL REFERENCES manuscript_branches(branch_id),
    revision_id TEXT NOT NULL REFERENCES manuscript_revisions(revision_id),
    journal_sequence INTEGER NOT NULL CHECK(journal_sequence >= 0),
    working_digest TEXT NOT NULL CHECK(length(working_digest) = 64),
    query TEXT NOT NULL,
    state TEXT NOT NULL CHECK(state IN ('running', 'completed', 'cancelled', 'failed')),
    scanned_position INTEGER NOT NULL DEFAULT 0 CHECK(scanned_position >= 0),
    total_blocks INTEGER NOT NULL CHECK(total_blocks > 0),
    total_matches INTEGER NOT NULL DEFAULT 0 CHECK(total_matches >= 0),
    created_at TEXT NOT NULL,
    completed_at TEXT
  ) STRICT`,
  manuscript_search_results: `CREATE TABLE manuscript_search_results (
    search_id TEXT NOT NULL REFERENCES manuscript_search_sessions(search_id) ON DELETE CASCADE,
    ordinal INTEGER NOT NULL CHECK(ordinal > 0),
    match_id TEXT NOT NULL,
    block_id TEXT NOT NULL REFERENCES manuscript_blocks(block_id),
    from_grapheme INTEGER NOT NULL CHECK(from_grapheme >= 0),
    to_grapheme INTEGER NOT NULL CHECK(to_grapheme > from_grapheme),
    global_character INTEGER NOT NULL CHECK(global_character >= 0),
    heading_label TEXT NOT NULL,
    context TEXT NOT NULL,
    range_digest TEXT NOT NULL CHECK(length(range_digest) = 64),
    PRIMARY KEY(search_id, ordinal),
    UNIQUE(search_id, match_id)
  ) STRICT`,
  manuscript_replacement_previews: `CREATE TABLE manuscript_replacement_previews (
    preview_id TEXT PRIMARY KEY,
    search_id TEXT NOT NULL REFERENCES manuscript_search_sessions(search_id),
    manuscript_id TEXT NOT NULL REFERENCES manuscripts(manuscript_id),
    branch_id TEXT NOT NULL REFERENCES manuscript_branches(branch_id),
    revision_id TEXT NOT NULL REFERENCES manuscript_revisions(revision_id),
    journal_sequence INTEGER NOT NULL CHECK(journal_sequence >= 0),
    working_digest TEXT NOT NULL CHECK(length(working_digest) = 64),
    query TEXT NOT NULL,
    replacement TEXT NOT NULL,
    state TEXT NOT NULL CHECK(state IN ('reviewing', 'frozen', 'committed', 'cancelled', 'failed')),
    total_matches INTEGER NOT NULL CHECK(total_matches > 0),
    included_matches INTEGER NOT NULL CHECK(included_matches >= 0),
    validated_ordinal INTEGER NOT NULL DEFAULT 0 CHECK(validated_ordinal >= 0),
    created_at TEXT NOT NULL,
    committed_at TEXT
  ) STRICT`,
  manuscript_replacement_matches: `CREATE TABLE manuscript_replacement_matches (
    preview_id TEXT NOT NULL REFERENCES manuscript_replacement_previews(preview_id) ON DELETE CASCADE,
    ordinal INTEGER NOT NULL CHECK(ordinal > 0),
    match_id TEXT NOT NULL,
    block_id TEXT NOT NULL REFERENCES manuscript_blocks(block_id),
    from_grapheme INTEGER NOT NULL CHECK(from_grapheme >= 0),
    to_grapheme INTEGER NOT NULL CHECK(to_grapheme > from_grapheme),
    range_digest TEXT NOT NULL CHECK(length(range_digest) = 64),
    included INTEGER NOT NULL CHECK(included IN (0, 1)),
    PRIMARY KEY(preview_id, ordinal),
    UNIQUE(preview_id, match_id)
  ) STRICT`,
  milestone_signoff_records: `CREATE TABLE milestone_signoff_records (
    signoff_record_id TEXT PRIMARY KEY,
    milestone_id TEXT NOT NULL UNIQUE REFERENCES milestone_versions(milestone_id),
    manuscript_id TEXT NOT NULL REFERENCES manuscripts(manuscript_id),
    branch_id TEXT NOT NULL REFERENCES manuscript_branches(branch_id),
    revision_id TEXT NOT NULL REFERENCES manuscript_revisions(revision_id),
    workflow_instance_id TEXT NOT NULL REFERENCES workflow_instances(workflow_instance_id),
    workflow_evidence_digest TEXT NOT NULL CHECK(length(workflow_evidence_digest) = 64),
    actor TEXT NOT NULL CHECK(actor = '本机编辑'),
    signed_at TEXT NOT NULL,
    label TEXT NOT NULL,
    stated_next_use TEXT NOT NULL
  ) STRICT`,
} as const;

const V6_TARGET_SCHEMA_SQL = {
  ...TARGET_BASE_SCHEMA_SQL,
  working_blocks: `CREATE TABLE working_blocks (
    branch_id TEXT NOT NULL REFERENCES manuscript_branches(branch_id),
    block_id TEXT NOT NULL REFERENCES manuscript_blocks(block_id),
    position INTEGER NOT NULL CHECK(position > 0),
    kind TEXT NOT NULL CHECK(kind IN ('title', 'heading', 'paragraph')),
    level INTEGER,
    text TEXT NOT NULL,
    digest TEXT NOT NULL CHECK(length(digest) = 64),
    grapheme_length INTEGER NOT NULL DEFAULT 0 CHECK(grapheme_length >= 0),
    PRIMARY KEY(branch_id, block_id),
    UNIQUE(branch_id, position)
  ) STRICT`,
  manuscript_outline: `CREATE TABLE manuscript_outline (
    branch_id TEXT NOT NULL REFERENCES manuscript_branches(branch_id),
    block_id TEXT NOT NULL REFERENCES manuscript_blocks(block_id),
    position INTEGER NOT NULL CHECK(position > 0),
    kind TEXT NOT NULL CHECK(kind IN ('title', 'heading')),
    level INTEGER NOT NULL CHECK(level BETWEEN 1 AND 6),
    text TEXT NOT NULL,
    digest TEXT NOT NULL CHECK(length(digest) = 64),
    PRIMARY KEY(branch_id, block_id),
    UNIQUE(branch_id, position)
  ) STRICT`,
  working_offset_nodes: `CREATE TABLE working_offset_nodes (
    branch_id TEXT NOT NULL,
    position INTEGER NOT NULL CHECK(position > 0),
    span_graphemes INTEGER NOT NULL CHECK(span_graphemes >= 0),
    PRIMARY KEY(branch_id, position),
    FOREIGN KEY(branch_id, position) REFERENCES working_blocks(branch_id, position) ON DELETE CASCADE
  ) STRICT`,
} as const;

const RECOVERY_SCHEMA_SQL = {
  service_lifetimes: `CREATE TABLE service_lifetimes (
    lifetime_id TEXT PRIMARY KEY,
    started_at TEXT NOT NULL,
    ended_at TEXT,
    outcome TEXT NOT NULL CHECK(outcome IN ('running', 'clean', 'interrupted')),
    CHECK(
      (outcome = 'running' AND ended_at IS NULL)
      OR (outcome IN ('clean', 'interrupted') AND ended_at IS NOT NULL)
    )
  ) STRICT`,
  service_lifetime_branch_writes: `CREATE TABLE service_lifetime_branch_writes (
    lifetime_id TEXT NOT NULL REFERENCES service_lifetimes(lifetime_id),
    branch_id TEXT NOT NULL REFERENCES manuscript_branches(branch_id),
    manuscript_id TEXT NOT NULL REFERENCES manuscripts(manuscript_id),
    checkpoint_revision_id TEXT NOT NULL REFERENCES manuscript_revisions(revision_id),
    checkpoint_sequence INTEGER NOT NULL CHECK(checkpoint_sequence >= 0),
    reconstruction_base_sequence INTEGER NOT NULL CHECK(reconstruction_base_sequence >= checkpoint_sequence),
    reconstruction_base_digest TEXT NOT NULL CHECK(length(reconstruction_base_digest) = 64),
    high_water_sequence INTEGER NOT NULL CHECK(high_water_sequence > reconstruction_base_sequence),
    high_water_digest TEXT NOT NULL CHECK(length(high_water_digest) = 64),
    last_durable_at TEXT NOT NULL,
    entry_count INTEGER NOT NULL CHECK(entry_count > 0),
    CHECK(entry_count = high_water_sequence - reconstruction_base_sequence),
    PRIMARY KEY(lifetime_id, branch_id)
  ) STRICT`,
  recovery_snapshots: `CREATE TABLE recovery_snapshots (
    snapshot_id TEXT PRIMARY KEY,
    milestone_id TEXT NOT NULL UNIQUE REFERENCES milestone_versions(milestone_id),
    book_id TEXT NOT NULL REFERENCES books(book_id),
    manuscript_id TEXT NOT NULL REFERENCES manuscripts(manuscript_id),
    branch_id TEXT NOT NULL REFERENCES manuscript_branches(branch_id),
    revision_id TEXT NOT NULL REFERENCES manuscript_revisions(revision_id),
    revision_label TEXT NOT NULL,
    revision_digest TEXT NOT NULL CHECK(length(revision_digest) = 64),
    journal_sequence INTEGER NOT NULL CHECK(journal_sequence >= 0),
    object_digest TEXT NOT NULL CHECK(length(object_digest) = 64),
    manifest_digest TEXT NOT NULL CHECK(length(manifest_digest) = 64),
    object_relative_key TEXT NOT NULL UNIQUE,
    byte_length INTEGER NOT NULL CHECK(byte_length > 0),
    block_count INTEGER NOT NULL CHECK(block_count > 0),
    total_graphemes INTEGER NOT NULL CHECK(total_graphemes >= 0),
    created_at TEXT NOT NULL,
    verified_at TEXT NOT NULL
  ) STRICT`,
  recovery_attention: `CREATE TABLE recovery_attention (
    attention_id TEXT PRIMARY KEY,
    interrupted_lifetime_id TEXT NOT NULL REFERENCES service_lifetimes(lifetime_id),
    book_id TEXT NOT NULL REFERENCES books(book_id),
    manuscript_id TEXT NOT NULL REFERENCES manuscripts(manuscript_id),
    branch_id TEXT NOT NULL REFERENCES manuscript_branches(branch_id),
    checkpoint_revision_id TEXT NOT NULL REFERENCES manuscript_revisions(revision_id),
    checkpoint_sequence INTEGER NOT NULL CHECK(checkpoint_sequence >= 0),
    journal_sequence INTEGER NOT NULL CHECK(journal_sequence > checkpoint_sequence),
    journal_working_digest TEXT NOT NULL CHECK(length(journal_working_digest) = 64),
    last_durable_at TEXT NOT NULL,
    journal_entry_count INTEGER NOT NULL CHECK(journal_entry_count > 0),
    journal_reconstruction_verified_at TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('pending', 'deferred', 'resolved')),
    attention_version INTEGER NOT NULL CHECK(attention_version >= 1),
    created_at TEXT NOT NULL,
    deferred_at TEXT,
    resolved_at TEXT,
    CHECK(
      (status = 'pending' AND deferred_at IS NULL AND resolved_at IS NULL)
      OR (status = 'deferred' AND deferred_at IS NOT NULL AND resolved_at IS NULL)
      OR (status = 'resolved' AND resolved_at IS NOT NULL)
    )
  ) STRICT`,
  recovery_restore_stages: `CREATE TABLE recovery_restore_stages (
    attention_id TEXT PRIMARY KEY REFERENCES recovery_attention(attention_id) ON DELETE CASCADE,
    selected_snapshot_id TEXT NOT NULL REFERENCES recovery_snapshots(snapshot_id),
    expected_attention_version INTEGER NOT NULL CHECK(expected_attention_version >= 1),
    expected_block_count INTEGER NOT NULL CHECK(expected_block_count > 0),
    expected_total_graphemes INTEGER NOT NULL CHECK(expected_total_graphemes >= 0),
    started_at TEXT NOT NULL
  ) STRICT`,
  recovery_restore_stage_blocks: `CREATE TABLE recovery_restore_stage_blocks (
    attention_id TEXT NOT NULL REFERENCES recovery_restore_stages(attention_id) ON DELETE CASCADE,
    block_id TEXT NOT NULL REFERENCES manuscript_blocks(block_id),
    position INTEGER NOT NULL CHECK(position > 0),
    kind TEXT NOT NULL CHECK(kind IN ('title', 'heading', 'paragraph')),
    level INTEGER,
    text TEXT NOT NULL,
    digest TEXT NOT NULL CHECK(length(digest) = 64),
    grapheme_length INTEGER NOT NULL CHECK(grapheme_length >= 0),
    PRIMARY KEY(attention_id, position),
    UNIQUE(attention_id, block_id)
  ) STRICT`,
  recovery_decisions: `CREATE TABLE recovery_decisions (
    decision_id TEXT PRIMARY KEY,
    attention_id TEXT NOT NULL REFERENCES recovery_attention(attention_id),
    attention_version INTEGER NOT NULL CHECK(attention_version >= 1),
    kind TEXT NOT NULL CHECK(kind IN ('view', 'defer', 'restore')),
    selected_kind TEXT CHECK(selected_kind IS NULL OR selected_kind IN ('journal', 'checkpoint', 'snapshot')),
    selected_snapshot_id TEXT REFERENCES recovery_snapshots(snapshot_id),
    request_fingerprint TEXT NOT NULL CHECK(length(request_fingerprint) = 64),
    decided_at TEXT NOT NULL,
    CHECK(
      (kind = 'defer' AND selected_kind IS NULL AND selected_snapshot_id IS NULL)
      OR (kind IN ('view', 'restore') AND selected_kind IS NOT NULL)
    ),
    CHECK(
      (selected_kind = 'snapshot' AND selected_snapshot_id IS NOT NULL)
      OR (selected_kind IS NULL OR selected_kind != 'snapshot') AND selected_snapshot_id IS NULL
    )
  ) STRICT`,
  recovery_restorations: `CREATE TABLE recovery_restorations (
    restoration_id TEXT PRIMARY KEY,
    decision_id TEXT NOT NULL UNIQUE REFERENCES recovery_decisions(decision_id),
    attention_id TEXT NOT NULL UNIQUE REFERENCES recovery_attention(attention_id),
    selected_kind TEXT NOT NULL CHECK(selected_kind IN ('journal', 'checkpoint', 'snapshot')),
    selected_snapshot_id TEXT REFERENCES recovery_snapshots(snapshot_id),
    source_revision_id TEXT NOT NULL REFERENCES manuscript_revisions(revision_id),
    source_working_digest TEXT NOT NULL CHECK(length(source_working_digest) = 64),
    pre_restore_revision_id TEXT NOT NULL REFERENCES manuscript_revisions(revision_id),
    pre_restore_journal_sequence INTEGER NOT NULL CHECK(pre_restore_journal_sequence >= 0),
    pre_restore_working_digest TEXT NOT NULL CHECK(length(pre_restore_working_digest) = 64),
    journal_candidate_digest TEXT NOT NULL CHECK(length(journal_candidate_digest) = 64),
    checkpoint_candidate_revision_id TEXT NOT NULL REFERENCES manuscript_revisions(revision_id),
    snapshot_candidate_id TEXT REFERENCES recovery_snapshots(snapshot_id),
    descendant_revision_id TEXT NOT NULL UNIQUE REFERENCES manuscript_revisions(revision_id),
    created_at TEXT NOT NULL,
    CHECK(
      (selected_kind = 'snapshot' AND selected_snapshot_id IS NOT NULL)
      OR (selected_kind != 'snapshot' AND selected_snapshot_id IS NULL)
    )
  ) STRICT`,
  manuscript_recovery_review_status: `CREATE TABLE manuscript_recovery_review_status (
    branch_id TEXT PRIMARY KEY REFERENCES manuscript_branches(branch_id),
    restoration_id TEXT NOT NULL UNIQUE REFERENCES recovery_restorations(restoration_id),
    recovered_revision_id TEXT NOT NULL REFERENCES manuscript_revisions(revision_id),
    state TEXT NOT NULL CHECK(state IN ('awaiting-milestone-review', 'cleared-by-milestone')),
    created_at TEXT NOT NULL,
    cleared_at TEXT,
    cleared_by_milestone_id TEXT REFERENCES milestone_versions(milestone_id),
    CHECK(
      (state = 'awaiting-milestone-review' AND cleared_at IS NULL AND cleared_by_milestone_id IS NULL)
      OR (state = 'cleared-by-milestone' AND cleared_at IS NOT NULL AND cleared_by_milestone_id IS NOT NULL)
    )
  ) STRICT`,
} as const;

const TARGET_SCHEMA_SQL = {
  ...V6_TARGET_SCHEMA_SQL,
  branch_working_state: `CREATE TABLE branch_working_state (
    branch_id TEXT PRIMARY KEY REFERENCES manuscript_branches(branch_id),
    manuscript_id TEXT NOT NULL REFERENCES manuscripts(manuscript_id),
    base_revision_id TEXT NOT NULL REFERENCES manuscript_revisions(revision_id),
    journal_sequence INTEGER NOT NULL CHECK(journal_sequence >= 0),
    working_digest TEXT NOT NULL CHECK(length(working_digest) = 64),
    total_graphemes INTEGER NOT NULL DEFAULT 0 CHECK(total_graphemes >= 0),
    history_sequence INTEGER NOT NULL DEFAULT 0 CHECK(history_sequence >= 0),
    last_checkpoint_sequence INTEGER NOT NULL DEFAULT 0 CHECK(last_checkpoint_sequence >= 0),
    history_boundary_sequence INTEGER NOT NULL DEFAULT 0 CHECK(history_boundary_sequence >= 0)
  ) STRICT`,
  edit_journal_entries: `CREATE TABLE edit_journal_entries (
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
    command_group_id TEXT,
    command_kind TEXT NOT NULL DEFAULT 'edit',
    service_lifetime_id TEXT,
    UNIQUE(branch_id, sequence)
  ) STRICT`,
  ...RECOVERY_SCHEMA_SQL,
} as const;

const PROFILE_SCHEMA_SQL = {
  import_drafts: `CREATE TABLE import_drafts (
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
      CHECK(reviewed_relationship IS NULL OR reviewed_relationship IN ('new-book-first-manuscript', 'first-manuscript')),
    reviewed_book_state_digest TEXT
      CHECK(reviewed_book_state_digest IS NULL OR length(reviewed_book_state_digest) = 64)
  ) STRICT`,
  books: `CREATE TABLE books (
    book_id TEXT PRIMARY KEY,
    stable_identity TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    created_at TEXT NOT NULL,
    internal_number TEXT
  ) STRICT`,
  workflow_profiles: `CREATE TABLE workflow_profiles (
    profile_id TEXT NOT NULL,
    profile_version TEXT NOT NULL,
    profile_name TEXT NOT NULL,
    profile_digest TEXT NOT NULL CHECK(length(profile_digest) = 64),
    projection_schema TEXT NOT NULL CHECK(projection_schema = 'ai7.workflow-profile-projection/1'),
    projection_json TEXT NOT NULL,
    native_profile_id TEXT NOT NULL,
    native_profile_version TEXT NOT NULL,
    native_profile_digest TEXT NOT NULL CHECK(length(native_profile_digest) = 64),
    PRIMARY KEY(profile_id, profile_version)
  ) STRICT`,
  workflow_instances: `CREATE TABLE workflow_instances (
    workflow_instance_id TEXT PRIMARY KEY,
    book_id TEXT NOT NULL REFERENCES books(book_id),
    manuscript_id TEXT NOT NULL UNIQUE REFERENCES manuscripts(manuscript_id),
    profile_id TEXT NOT NULL,
    profile_version TEXT NOT NULL,
    profile_digest TEXT NOT NULL CHECK(length(profile_digest) = 64),
    native_profile_id TEXT NOT NULL,
    native_profile_version TEXT NOT NULL,
    native_profile_digest TEXT NOT NULL CHECK(length(native_profile_digest) = 64),
    current_phase TEXT NOT NULL,
    state TEXT NOT NULL CHECK(state = 'active'),
    created_at TEXT NOT NULL,
    FOREIGN KEY(profile_id, profile_version) REFERENCES workflow_profiles(profile_id, profile_version)
  ) STRICT`,
} as const;

const FULL_CONTINUITY_SCHEMA_SQL = { ...COMMON_SCHEMA_SQL, ...CONTINUITY_SCHEMA_SQL } as const;
const FULL_V6_TARGET_SCHEMA_SQL = { ...COMMON_SCHEMA_SQL, ...V6_TARGET_SCHEMA_SQL } as const;
const FULL_V7_TARGET_SCHEMA_SQL = { ...COMMON_SCHEMA_SQL, ...TARGET_SCHEMA_SQL } as const;
const FULL_TARGET_SCHEMA_SQL = { ...COMMON_SCHEMA_SQL, ...TARGET_SCHEMA_SQL, ...PROFILE_SCHEMA_SQL } as const;

const SOURCE_IMPORT_SCHEMA_SQL = {
  import_drafts: `CREATE TABLE import_drafts (
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
  ) STRICT`,
  import_commits: `CREATE TABLE import_commits (
    commit_id TEXT PRIMARY KEY,
    draft_id TEXT NOT NULL UNIQUE REFERENCES import_drafts(draft_id),
    request_fingerprint TEXT NOT NULL,
    expected_draft_version INTEGER NOT NULL,
    review_digest TEXT NOT NULL,
    operation_kind TEXT NOT NULL CHECK(operation_kind IN ('manuscript-import', 'source-import')),
    result_json TEXT NOT NULL,
    committed_at TEXT NOT NULL
  ) STRICT`,
  import_commit_attempts: `CREATE TABLE import_commit_attempts (
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
  ) STRICT`,
  source_provenance: `CREATE TABLE source_provenance (
    provenance_id TEXT PRIMARY KEY,
    source_version_id TEXT NOT NULL REFERENCES source_versions(source_version_id),
    acquisition_path TEXT NOT NULL CHECK(acquisition_path = 'native-file-picker'),
    locality TEXT NOT NULL CHECK(locality = 'local-provider-free'),
    sanitized_identity TEXT NOT NULL,
    parser_identity TEXT NOT NULL,
    recorded_at TEXT NOT NULL
  ) STRICT`,
  source_import_records: `CREATE TABLE source_import_records (
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
  ) STRICT`,
} as const;

const FULL_SOURCE_IMPORT_TARGET_SCHEMA_SQL = {
  ...FULL_TARGET_SCHEMA_SQL,
  ...SOURCE_IMPORT_SCHEMA_SQL,
} as const;

const MANUSCRIPT_REIMPORT_SCHEMA_SQL = {
  import_fidelity_reviews: `CREATE TABLE import_fidelity_reviews (
    fidelity_review_id TEXT PRIMARY KEY,
    book_id TEXT NOT NULL REFERENCES books(book_id),
    source_version_id TEXT NOT NULL REFERENCES source_versions(source_version_id),
    review_digest TEXT NOT NULL UNIQUE,
    outcome TEXT NOT NULL CHECK(outcome IN ('clean-import-no-round-trip', 'degraded-import-no-round-trip')),
    round_trip_guaranteed INTEGER NOT NULL CHECK(round_trip_guaranteed = 0),
    created_at TEXT NOT NULL
  ) STRICT`,
  import_drafts: `CREATE TABLE import_drafts (
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
  ) STRICT`,
  import_commits: `CREATE TABLE import_commits (
    commit_id TEXT PRIMARY KEY,
    draft_id TEXT NOT NULL UNIQUE REFERENCES import_drafts(draft_id),
    request_fingerprint TEXT NOT NULL,
    expected_draft_version INTEGER NOT NULL,
    review_digest TEXT NOT NULL,
    operation_kind TEXT NOT NULL CHECK(operation_kind IN ('manuscript-import', 'source-import', 'manuscript-reimport')),
    result_json TEXT NOT NULL,
    committed_at TEXT NOT NULL
  ) STRICT`,
  import_commit_attempts: `CREATE TABLE import_commit_attempts (
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
  ) STRICT`,
  manuscript_reimport_comparisons: `CREATE TABLE manuscript_reimport_comparisons (
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
  ) STRICT`,
  manuscript_reimport_mappings: `CREATE TABLE manuscript_reimport_mappings (
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
  ) STRICT`,
  manuscript_reimport_mapping_resolutions: `CREATE TABLE manuscript_reimport_mapping_resolutions (
    mapping_id TEXT PRIMARY KEY REFERENCES manuscript_reimport_mappings(mapping_id) ON DELETE CASCADE,
    comparison_id TEXT NOT NULL REFERENCES manuscript_reimport_comparisons(comparison_id) ON DELETE CASCADE,
    resolution TEXT NOT NULL CHECK(resolution IN
      ('preserve-current-identity', 'create-new-identity', 'retire-current-identity')),
    resolved_current_block_id TEXT REFERENCES manuscript_blocks(block_id),
    resolved_at TEXT NOT NULL,
    UNIQUE(comparison_id, resolved_current_block_id),
    CHECK((resolution = 'preserve-current-identity') = (resolved_current_block_id IS NOT NULL))
  ) STRICT`,
  manuscript_reimport_records: `CREATE TABLE manuscript_reimport_records (
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
  ) STRICT`,
} as const;

const FULL_MANUSCRIPT_REIMPORT_TARGET_SCHEMA_SQL = {
  ...FULL_SOURCE_IMPORT_TARGET_SCHEMA_SQL,
  ...MANUSCRIPT_REIMPORT_SCHEMA_SQL,
} as const;

const TARGET_VIRTUAL_TABLE_SQL = `CREATE VIRTUAL TABLE working_block_search USING fts5(
  branch_id UNINDEXED,
  block_id UNINDEXED,
  text,
  tokenize='trigram'
)`;

const SEARCH_SHADOW_SCHEMA_SQL = {
  working_block_search_config: "CREATE TABLE 'working_block_search_config'(k PRIMARY KEY, v) WITHOUT ROWID",
  working_block_search_content: "CREATE TABLE 'working_block_search_content'(id INTEGER PRIMARY KEY, c0, c1, c2)",
  working_block_search_data: "CREATE TABLE 'working_block_search_data'(id INTEGER PRIMARY KEY, block BLOB)",
  working_block_search_docsize: "CREATE TABLE 'working_block_search_docsize'(id INTEGER PRIMARY KEY, sz BLOB)",
  working_block_search_idx: "CREATE TABLE 'working_block_search_idx'(segid, term, pgno, PRIMARY KEY(segid, term)) WITHOUT ROWID",
} as const;

const SEARCH_SCHEMA_TABLES = [
  'working_block_search',
  ...Object.keys(SEARCH_SHADOW_SCHEMA_SQL),
] as const;

const CONTINUITY_INDEX_SQL = {
  working_blocks_window: 'CREATE INDEX working_blocks_window ON working_blocks(branch_id, position)',
  journal_branch_order: 'CREATE INDEX journal_branch_order ON edit_journal_entries(branch_id, sequence)',
  import_attempts_recovery_order:
    'CREATE INDEX import_attempts_recovery_order ON import_commit_attempts(state, completion_acknowledged_at, prepared_at)',
} as const;

const V6_TARGET_INDEX_SQL = {
  ...CONTINUITY_INDEX_SQL,
  manuscript_outline_order: 'CREATE INDEX manuscript_outline_order ON manuscript_outline(branch_id, position)',
  command_history_state: 'CREATE INDEX command_history_state ON manuscript_command_groups(branch_id, status, ordinal)',
  replacement_matches_block: 'CREATE INDEX replacement_matches_block ON manuscript_replacement_matches(preview_id, included, block_id, from_grapheme)',
} as const;

const TARGET_INDEX_SQL = {
  ...V6_TARGET_INDEX_SQL,
  lifetime_outcome_order: 'CREATE INDEX lifetime_outcome_order ON service_lifetimes(outcome, started_at)',
  recovery_attention_startup: 'CREATE INDEX recovery_attention_startup ON recovery_attention(status, created_at, attention_id)',
  recovery_snapshot_branch: 'CREATE INDEX recovery_snapshot_branch ON recovery_snapshots(branch_id, revision_id, created_at DESC, snapshot_id DESC)',
  book_internal_number_unique:
    'CREATE UNIQUE INDEX book_internal_number_unique ON books(internal_number) WHERE internal_number IS NOT NULL',
} as const;

const MANUSCRIPT_REIMPORT_INDEX_SQL = {
  ...TARGET_INDEX_SQL,
  reimport_mappings_page:
    'CREATE INDEX reimport_mappings_page ON manuscript_reimport_mappings(comparison_id, position)',
  staged_reimport_identity:
    'CREATE INDEX staged_reimport_identity ON staged_import_blocks(draft_id, digest, kind, level)',
  revision_reimport_identity:
    'CREATE INDEX revision_reimport_identity ON manuscript_block_versions(revision_id, digest, kind, level)',
} as const;

const V7_TARGET_INDEX_SQL = {
  ...V6_TARGET_INDEX_SQL,
  lifetime_outcome_order: TARGET_INDEX_SQL.lifetime_outcome_order,
  recovery_attention_startup: TARGET_INDEX_SQL.recovery_attention_startup,
  recovery_snapshot_branch: TARGET_INDEX_SQL.recovery_snapshot_branch,
} as const;

const CONTINUITY_TRIGGER_DIGESTS = {
  abandonment_cleanup_validate_insert: '09ce8b29e4d81f26b3dd2ed03169da835d2d72ed1db17953a3a4554730943890',
  abandonment_cleanup_block_content_object_update: 'ebc8c2b457914325ee725b9007c29e7a25b69d104eea87b19ec752c77a9d374d',
  abandonment_cleanup_block_draft_insert: '423f4b8e6b9160beae522eb9daee757844f8defb97db028607709110015f2950',
  abandonment_cleanup_block_draft_update: 'c86550fb12ca0d1abf17c70ba790d595a34a3922ad98efdc95d8c2facfcafabd',
  abandonment_cleanup_block_source_insert: '6ce76e47b7adfd2ebdb8d4085fb0e5a1be42cc160d374bc8cb167dff6d98fa8c',
  abandonment_cleanup_block_source_update: 'aaaaa619f3ba2986675f30673ab5d1f65ac62d2a60118d1c78ae4b20cdf11b2f',
  abandonment_cleanup_block_commit_insert: '0e153594899bf6873b3880a78ae90439a664ff4b3841617f466ef81ab45c23b5',
  abandonment_cleanup_block_attempt_insert: '5b1f6a4f887a3ebf1aa51e963ea3f8e7ed60034294115a186c7af44f3af0be4f',
  abandonment_cleanup_validate_intent_update_v5: 'aa3d9f6e2659fcc53bc1b7cf2ad4c06eb6d9f913c5d2e00d4436c399bcc04f42',
  abandonment_cleanup_block_content_object_update_v5: 'f86f9c3174539f074d9e7ec78da5bd0b35f8ce801d9ed7ee04c8b19908364fc9',
  abandonment_cleanup_block_draft_update_v5: '829704af602ccf10c73592b2f0c2a54c8aba1b76abe3d526de498c7ee2f62b0f',
  abandonment_cleanup_block_source_update_v5: 'f79586f62a34dc1aa03ea6ea0561b1b7e2a3a0865878b9e04fb32f4eb0505e99',
  abandonment_cleanup_block_commit_update_v5: '1c8c1058feb0665e13be45fc0771fb85de2ce40408b91b616045cf71ba2fac2c',
  abandonment_cleanup_block_attempt_update_v5: '136f9eafe5078c8131bf6178ceda3302aedc8263962a83a2e2ccd50918d9303e',
} as const;

const SOURCE_IMPORT_TRIGGER_SQL = {
  source_import_record_excludes_manuscript_result: `CREATE TRIGGER source_import_record_excludes_manuscript_result
    BEFORE INSERT ON source_import_records
    WHEN EXISTS (SELECT 1 FROM manuscript_import_records WHERE commit_id = NEW.commit_id)
    BEGIN
      SELECT RAISE(ABORT, 'IMPORT_RESULT_KIND_CONFLICT');
    END`,
  manuscript_import_record_excludes_source_result: `CREATE TRIGGER manuscript_import_record_excludes_source_result
    BEFORE INSERT ON manuscript_import_records
    WHEN EXISTS (SELECT 1 FROM source_import_records WHERE commit_id = NEW.commit_id)
    BEGIN
      SELECT RAISE(ABORT, 'IMPORT_RESULT_KIND_CONFLICT');
    END`,
} as const;

const MANUSCRIPT_REIMPORT_TRIGGER_SQL = {
  ...SOURCE_IMPORT_TRIGGER_SQL,
  reimport_record_excludes_other_results: `CREATE TRIGGER reimport_record_excludes_other_results
    BEFORE INSERT ON manuscript_reimport_records
    WHEN EXISTS (SELECT 1 FROM manuscript_import_records WHERE commit_id = NEW.commit_id)
      OR EXISTS (SELECT 1 FROM source_import_records WHERE commit_id = NEW.commit_id)
    BEGIN
      SELECT RAISE(ABORT, 'IMPORT_RESULT_KIND_CONFLICT');
    END`,
  manuscript_import_record_excludes_reimport_result: `CREATE TRIGGER manuscript_import_record_excludes_reimport_result
    BEFORE INSERT ON manuscript_import_records
    WHEN EXISTS (SELECT 1 FROM manuscript_reimport_records WHERE commit_id = NEW.commit_id)
    BEGIN
      SELECT RAISE(ABORT, 'IMPORT_RESULT_KIND_CONFLICT');
    END`,
  source_import_record_excludes_reimport_result: `CREATE TRIGGER source_import_record_excludes_reimport_result
    BEFORE INSERT ON source_import_records
    WHEN EXISTS (SELECT 1 FROM manuscript_reimport_records WHERE commit_id = NEW.commit_id)
    BEGIN
      SELECT RAISE(ABORT, 'IMPORT_RESULT_KIND_CONFLICT');
    END`,
} as const;

const IMPORT_DRAFT_TRIGGER_SQL = {
  abandonment_cleanup_block_draft_insert: `CREATE TRIGGER abandonment_cleanup_block_draft_insert
    BEFORE INSERT ON import_drafts
    WHEN EXISTS (
      SELECT 1 FROM import_abandonment_cleanup_intents i
      WHERE i.object_digest = NEW.object_digest
    )
    BEGIN
      SELECT RAISE(ABORT, 'ABANDONMENT_CLEANUP_PENDING');
    END`,
  abandonment_cleanup_block_draft_update: `CREATE TRIGGER abandonment_cleanup_block_draft_update
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
    END`,
  abandonment_cleanup_block_draft_update_v5: `CREATE TRIGGER abandonment_cleanup_block_draft_update_v5
    BEFORE UPDATE ON import_drafts
    WHEN EXISTS (
      SELECT 1 FROM import_abandonment_cleanup_intents i
      WHERE i.draft_id = OLD.draft_id OR i.draft_id = NEW.draft_id
        OR i.object_digest = OLD.object_digest OR i.object_digest = NEW.object_digest
    )
    BEGIN
      SELECT RAISE(ABORT, 'ABANDONMENT_CLEANUP_PENDING');
    END`,
} as const;

const SCHEMA_FOREIGN_KEYS: Readonly<Record<string, ReadonlyArray<string>>> = {
  editorial_workspace_profile_sidecar_revisions: [
    'native_artifact_id>native_artifact_installations.artifact_id:NO ACTION/NO ACTION/NONE',
  ],
  editorial_workspace_profile_book_pins: [
    'book_id>native_artifact_book_enablements.book_id:NO ACTION/NO ACTION/NONE',
    'native_artifact_id>native_artifact_book_enablements.artifact_id:NO ACTION/NO ACTION/NONE',
    'sidecar_id>editorial_workspace_profile_sidecar_revisions.sidecar_id:NO ACTION/NO ACTION/NONE',
    'sidecar_revision>editorial_workspace_profile_sidecar_revisions.revision:NO ACTION/NO ACTION/NONE',
    'sidecar_sha256>editorial_workspace_profile_sidecar_revisions.sha256:NO ACTION/NO ACTION/NONE',
  ],
  native_artifact_book_enablements: [
    'artifact_id>native_artifact_installations.artifact_id:NO ACTION/NO ACTION/NONE',
    'book_id>books.book_id:NO ACTION/NO ACTION/NONE',
  ],
  import_drafts: ['object_digest>content_objects.object_digest:NO ACTION/NO ACTION/NONE'],
  book_dimension_sets: ['book_id>books.book_id:NO ACTION/NO ACTION/NONE'],
  book_dimensions: ['dimension_set_id>book_dimension_sets.dimension_set_id:NO ACTION/NO ACTION/NONE'],
  source_versions: [
    'book_id>books.book_id:NO ACTION/NO ACTION/NONE',
    'object_digest>content_objects.object_digest:NO ACTION/NO ACTION/NONE',
  ],
  source_provenance: ['source_version_id>source_versions.source_version_id:NO ACTION/NO ACTION/NONE'],
  source_import_records: [
    'book_id>books.book_id:NO ACTION/NO ACTION/NONE',
    'provenance_id>source_provenance.provenance_id:NO ACTION/NO ACTION/NONE',
    'source_version_id>source_versions.source_version_id:NO ACTION/NO ACTION/NONE',
  ],
  manuscript_reimport_comparisons: [
    'branch_id>manuscript_branches.branch_id:NO ACTION/NO ACTION/NONE',
    'checkpoint_revision_id>manuscript_revisions.revision_id:NO ACTION/NO ACTION/NONE',
    'draft_id>import_drafts.draft_id:NO ACTION/CASCADE/NONE',
    'lineage_revision_id>manuscript_revisions.revision_id:NO ACTION/NO ACTION/NONE',
    'lineage_source_version_id>source_versions.source_version_id:NO ACTION/NO ACTION/NONE',
    'manuscript_id>manuscripts.manuscript_id:NO ACTION/NO ACTION/NONE',
  ],
  manuscript_reimport_mappings: [
    'comparison_id>manuscript_reimport_comparisons.comparison_id:NO ACTION/CASCADE/NONE',
    'current_block_id>manuscript_blocks.block_id:NO ACTION/NO ACTION/NONE',
    'current_revision_id>manuscript_revisions.revision_id:NO ACTION/NO ACTION/NONE',
    'lineage_block_id>manuscript_blocks.block_id:NO ACTION/NO ACTION/NONE',
    'lineage_revision_id>manuscript_revisions.revision_id:NO ACTION/NO ACTION/NONE',
  ],
  manuscript_reimport_mapping_resolutions: [
    'comparison_id>manuscript_reimport_comparisons.comparison_id:NO ACTION/CASCADE/NONE',
    'mapping_id>manuscript_reimport_mappings.mapping_id:NO ACTION/CASCADE/NONE',
    'resolved_current_block_id>manuscript_blocks.block_id:NO ACTION/NO ACTION/NONE',
  ],
  manuscript_reimport_records: [
    'book_id>books.book_id:NO ACTION/NO ACTION/NONE',
    'branch_id>manuscript_branches.branch_id:NO ACTION/NO ACTION/NONE',
    'comparison_id>manuscript_reimport_comparisons.comparison_id:NO ACTION/NO ACTION/NONE',
    'degradation_decision_id>import_degradation_decisions.degradation_decision_id:NO ACTION/NO ACTION/NONE',
    'fidelity_review_id>import_fidelity_reviews.fidelity_review_id:NO ACTION/NO ACTION/NONE',
    'lineage_source_version_id>source_versions.source_version_id:NO ACTION/NO ACTION/NONE',
    'manuscript_id>manuscripts.manuscript_id:NO ACTION/NO ACTION/NONE',
    'previous_revision_id>manuscript_revisions.revision_id:NO ACTION/NO ACTION/NONE',
    'provenance_id>source_provenance.provenance_id:NO ACTION/NO ACTION/NONE',
    'resulting_revision_id>manuscript_revisions.revision_id:NO ACTION/NO ACTION/NONE',
    'source_version_id>source_versions.source_version_id:NO ACTION/NO ACTION/NONE',
  ],
  import_fidelity_reviews: [
    'book_id>books.book_id:NO ACTION/NO ACTION/NONE',
    'source_version_id>source_versions.source_version_id:NO ACTION/NO ACTION/NONE',
  ],
  import_fidelity_categories: ['fidelity_review_id>import_fidelity_reviews.fidelity_review_id:NO ACTION/NO ACTION/NONE'],
  import_degradation_decisions: ['fidelity_review_id>import_fidelity_reviews.fidelity_review_id:NO ACTION/NO ACTION/NONE'],
  manuscripts: ['book_id>books.book_id:NO ACTION/NO ACTION/NONE'],
  manuscript_branches: [
    'base_revision_id>manuscript_revisions.revision_id:NO ACTION/NO ACTION/NONE',
    'manuscript_id>manuscripts.manuscript_id:NO ACTION/NO ACTION/NONE',
  ],
  manuscript_blocks: [
    'created_revision_id>manuscript_revisions.revision_id:NO ACTION/NO ACTION/NONE',
    'manuscript_id>manuscripts.manuscript_id:NO ACTION/NO ACTION/NONE',
  ],
  workflow_instances: [
    'book_id>books.book_id:NO ACTION/NO ACTION/NONE',
    'manuscript_id>manuscripts.manuscript_id:NO ACTION/NO ACTION/NONE',
    'profile_id>workflow_profiles.profile_id:NO ACTION/NO ACTION/NONE',
    'profile_version>workflow_profiles.profile_version:NO ACTION/NO ACTION/NONE',
  ],
  manuscript_import_records: [
    'book_id>books.book_id:NO ACTION/NO ACTION/NONE',
    'degradation_decision_id>import_degradation_decisions.degradation_decision_id:NO ACTION/NO ACTION/NONE',
    'fidelity_review_id>import_fidelity_reviews.fidelity_review_id:NO ACTION/NO ACTION/NONE',
    'manuscript_id>manuscripts.manuscript_id:NO ACTION/NO ACTION/NONE',
    'provenance_id>source_provenance.provenance_id:NO ACTION/NO ACTION/NONE',
    'resulting_revision_id>manuscript_revisions.revision_id:NO ACTION/NO ACTION/NONE',
    'source_version_id>source_versions.source_version_id:NO ACTION/NO ACTION/NONE',
  ],
  import_commits: ['draft_id>import_drafts.draft_id:NO ACTION/NO ACTION/NONE'],
  import_commit_attempts: ['draft_id>import_drafts.draft_id:NO ACTION/CASCADE/NONE'],
  import_abandonment_cleanup_intents: [
    'draft_id>import_drafts.draft_id:NO ACTION/NO ACTION/NONE',
    'object_digest>content_objects.object_digest:NO ACTION/NO ACTION/NONE',
  ],
  staged_import_snapshots: ['draft_id>import_drafts.draft_id:NO ACTION/CASCADE/NONE'],
  staged_import_blocks: ['draft_id>staged_import_snapshots.draft_id:NO ACTION/CASCADE/NONE'],
  manuscript_revisions: [
    'branch_id>manuscript_branches.branch_id:NO ACTION/NO ACTION/NONE',
    'manuscript_id>manuscripts.manuscript_id:NO ACTION/NO ACTION/NONE',
    'parent_revision_id>manuscript_revisions.revision_id:NO ACTION/NO ACTION/NONE',
    'source_version_id>source_versions.source_version_id:NO ACTION/NO ACTION/NONE',
  ],
  manuscript_block_versions: [
    'block_id>manuscript_blocks.block_id:NO ACTION/NO ACTION/NONE',
    'revision_id>manuscript_revisions.revision_id:NO ACTION/NO ACTION/NONE',
  ],
  branch_working_state: [
    'base_revision_id>manuscript_revisions.revision_id:NO ACTION/NO ACTION/NONE',
    'branch_id>manuscript_branches.branch_id:NO ACTION/NO ACTION/NONE',
    'manuscript_id>manuscripts.manuscript_id:NO ACTION/NO ACTION/NONE',
  ],
  working_blocks: [
    'block_id>manuscript_blocks.block_id:NO ACTION/NO ACTION/NONE',
    'branch_id>manuscript_branches.branch_id:NO ACTION/NO ACTION/NONE',
  ],
  edit_journal_entries: [
    'base_revision_id>manuscript_revisions.revision_id:NO ACTION/NO ACTION/NONE',
    'block_id>manuscript_blocks.block_id:NO ACTION/NO ACTION/NONE',
    'branch_id>manuscript_branches.branch_id:NO ACTION/NO ACTION/NONE',
    'manuscript_id>manuscripts.manuscript_id:NO ACTION/NO ACTION/NONE',
  ],
  manuscript_outline: [
    'block_id>manuscript_blocks.block_id:NO ACTION/NO ACTION/NONE',
    'branch_id>manuscript_branches.branch_id:NO ACTION/NO ACTION/NONE',
  ],
  manuscript_command_groups: ['branch_id>manuscript_branches.branch_id:NO ACTION/NO ACTION/NONE'],
  manuscript_command_edits: [
    'block_id>manuscript_blocks.block_id:NO ACTION/NO ACTION/NONE',
    'command_group_id>manuscript_command_groups.command_group_id:NO ACTION/NO ACTION/NONE',
  ],
  milestone_versions: [
    'branch_id>manuscript_branches.branch_id:NO ACTION/NO ACTION/NONE',
    'manuscript_id>manuscripts.manuscript_id:NO ACTION/NO ACTION/NONE',
    'revision_id>manuscript_revisions.revision_id:NO ACTION/NO ACTION/NONE',
  ],
  manuscript_search_sessions: [
    'branch_id>manuscript_branches.branch_id:NO ACTION/NO ACTION/NONE',
    'manuscript_id>manuscripts.manuscript_id:NO ACTION/NO ACTION/NONE',
    'revision_id>manuscript_revisions.revision_id:NO ACTION/NO ACTION/NONE',
  ],
  manuscript_search_results: [
    'block_id>manuscript_blocks.block_id:NO ACTION/NO ACTION/NONE',
    'search_id>manuscript_search_sessions.search_id:NO ACTION/CASCADE/NONE',
  ],
  manuscript_replacement_previews: [
    'branch_id>manuscript_branches.branch_id:NO ACTION/NO ACTION/NONE',
    'manuscript_id>manuscripts.manuscript_id:NO ACTION/NO ACTION/NONE',
    'revision_id>manuscript_revisions.revision_id:NO ACTION/NO ACTION/NONE',
    'search_id>manuscript_search_sessions.search_id:NO ACTION/NO ACTION/NONE',
  ],
  manuscript_replacement_matches: [
    'block_id>manuscript_blocks.block_id:NO ACTION/NO ACTION/NONE',
    'preview_id>manuscript_replacement_previews.preview_id:NO ACTION/CASCADE/NONE',
  ],
  milestone_signoff_records: [
    'branch_id>manuscript_branches.branch_id:NO ACTION/NO ACTION/NONE',
    'manuscript_id>manuscripts.manuscript_id:NO ACTION/NO ACTION/NONE',
    'milestone_id>milestone_versions.milestone_id:NO ACTION/NO ACTION/NONE',
    'revision_id>manuscript_revisions.revision_id:NO ACTION/NO ACTION/NONE',
    'workflow_instance_id>workflow_instances.workflow_instance_id:NO ACTION/NO ACTION/NONE',
  ],
  working_offset_nodes: [
    'branch_id>working_blocks.branch_id:NO ACTION/CASCADE/NONE',
    'position>working_blocks.position:NO ACTION/CASCADE/NONE',
  ],
  service_lifetime_branch_writes: [
    'branch_id>manuscript_branches.branch_id:NO ACTION/NO ACTION/NONE',
    'checkpoint_revision_id>manuscript_revisions.revision_id:NO ACTION/NO ACTION/NONE',
    'lifetime_id>service_lifetimes.lifetime_id:NO ACTION/NO ACTION/NONE',
    'manuscript_id>manuscripts.manuscript_id:NO ACTION/NO ACTION/NONE',
  ],
  recovery_snapshots: [
    'book_id>books.book_id:NO ACTION/NO ACTION/NONE',
    'branch_id>manuscript_branches.branch_id:NO ACTION/NO ACTION/NONE',
    'manuscript_id>manuscripts.manuscript_id:NO ACTION/NO ACTION/NONE',
    'milestone_id>milestone_versions.milestone_id:NO ACTION/NO ACTION/NONE',
    'revision_id>manuscript_revisions.revision_id:NO ACTION/NO ACTION/NONE',
  ],
  recovery_attention: [
    'book_id>books.book_id:NO ACTION/NO ACTION/NONE',
    'branch_id>manuscript_branches.branch_id:NO ACTION/NO ACTION/NONE',
    'checkpoint_revision_id>manuscript_revisions.revision_id:NO ACTION/NO ACTION/NONE',
    'interrupted_lifetime_id>service_lifetimes.lifetime_id:NO ACTION/NO ACTION/NONE',
    'manuscript_id>manuscripts.manuscript_id:NO ACTION/NO ACTION/NONE',
  ],
  recovery_restore_stages: [
    'attention_id>recovery_attention.attention_id:NO ACTION/CASCADE/NONE',
    'selected_snapshot_id>recovery_snapshots.snapshot_id:NO ACTION/NO ACTION/NONE',
  ],
  recovery_restore_stage_blocks: [
    'attention_id>recovery_restore_stages.attention_id:NO ACTION/CASCADE/NONE',
    'block_id>manuscript_blocks.block_id:NO ACTION/NO ACTION/NONE',
  ],
  recovery_decisions: [
    'attention_id>recovery_attention.attention_id:NO ACTION/NO ACTION/NONE',
    'selected_snapshot_id>recovery_snapshots.snapshot_id:NO ACTION/NO ACTION/NONE',
  ],
  recovery_restorations: [
    'attention_id>recovery_attention.attention_id:NO ACTION/NO ACTION/NONE',
    'checkpoint_candidate_revision_id>manuscript_revisions.revision_id:NO ACTION/NO ACTION/NONE',
    'decision_id>recovery_decisions.decision_id:NO ACTION/NO ACTION/NONE',
    'descendant_revision_id>manuscript_revisions.revision_id:NO ACTION/NO ACTION/NONE',
    'pre_restore_revision_id>manuscript_revisions.revision_id:NO ACTION/NO ACTION/NONE',
    'selected_snapshot_id>recovery_snapshots.snapshot_id:NO ACTION/NO ACTION/NONE',
    'snapshot_candidate_id>recovery_snapshots.snapshot_id:NO ACTION/NO ACTION/NONE',
    'source_revision_id>manuscript_revisions.revision_id:NO ACTION/NO ACTION/NONE',
  ],
  manuscript_recovery_review_status: [
    'branch_id>manuscript_branches.branch_id:NO ACTION/NO ACTION/NONE',
    'cleared_by_milestone_id>milestone_versions.milestone_id:NO ACTION/NO ACTION/NONE',
    'recovered_revision_id>manuscript_revisions.revision_id:NO ACTION/NO ACTION/NONE',
    'restoration_id>recovery_restorations.restoration_id:NO ACTION/NO ACTION/NONE',
  ],
};

export class BoundedStoreError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'BoundedStoreError';
  }
}

export class BoundedStoreFatalError extends Error {
  constructor(cause: unknown) {
    super('Bounded SQLite transaction rollback failed.', { cause });
    this.name = 'BoundedStoreFatalError';
  }
}

function requireBounded(condition: unknown, code: string, message: string): asserts condition {
  if (!condition) throw new BoundedStoreError(code, message);
}

function one(rows: SqlRow[], code: string, message: string): SqlRow {
  requireBounded(rows.length === 1, code, message);
  return rows[0]!;
}

function asString(value: SQLOutputValue | undefined): string {
  requireBounded(typeof value === 'string' && value.isWellFormed(), 'STORE_CORRUPT', '持久化记录类型无效。');
  return value;
}

function asNumber(value: SQLOutputValue | undefined): number {
  requireBounded(typeof value === 'number' && Number.isSafeInteger(value), 'STORE_CORRUPT', '持久化数字无效。');
  return value;
}

function canonicalSchemaSql(sql: string): string {
  let result = '';
  let quoted: "'" | '"' | '`' | ']' | undefined;
  let identifierValue = '';
  for (let index = 0; index < sql.length; index += 1) {
    const character = sql[index]!;
    if (quoted !== undefined) {
      if (quoted === "'") {
        result += character;
        if (character === "'" && sql[index + 1] === "'") {
          result += sql[index + 1]!;
          index += 1;
        } else if (character === "'") {
          quoted = undefined;
        }
        continue;
      }
      const closing = quoted === ']' ? ']' : quoted;
      if (character === closing && quoted !== ']' && sql[index + 1] === closing) {
        identifierValue += closing;
        index += 1;
      } else if (character === closing) {
        const normalized = identifierValue.toLocaleLowerCase('en-US');
        result += /^[a-z_][a-z0-9_]*$/u.test(normalized) ? normalized : `⟦${normalized}⟧`;
        identifierValue = '';
        quoted = undefined;
      } else {
        identifierValue += character;
      }
      continue;
    }
    if (character === "'") {
      quoted = "'";
      result += character;
    } else if (character === '"' || character === '`') {
      quoted = character;
      identifierValue = '';
    } else if (character === '[') {
      quoted = ']';
      identifierValue = '';
    } else if (!/\s/.test(character) && character !== ';') {
      result += character.toLocaleLowerCase('en-US');
    }
  }
  requireBounded(quoted === undefined && identifierValue.length === 0, 'SCHEMA_MIGRATION_FAILED', '数据库结构 SQL 引号无效。');
  return result.replace(/^createtableifnotexists/, 'createtable');
}

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

function schemaObjectSql(db: DatabaseSync, type: 'table' | 'index' | 'trigger', name: string): string | undefined {
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
    ...(name === 'import_drafts' && canonicalSchemaSql(matchedExpectedSql) === canonicalSchemaSql(MANUSCRIPT_REIMPORT_SCHEMA_SQL.import_drafts)
      ? [
          'reviewed_branch_id>manuscript_branches.branch_id:NO ACTION/NO ACTION/NONE',
          'reviewed_checkpoint_revision_id>manuscript_revisions.revision_id:NO ACTION/NO ACTION/NONE',
          'reviewed_existing_book_id>books.book_id:NO ACTION/NO ACTION/NONE',
          'reviewed_lineage_source_version_id>source_versions.source_version_id:NO ACTION/NO ACTION/NONE',
          'reviewed_manuscript_id>manuscripts.manuscript_id:NO ACTION/NO ACTION/NONE',
          'reviewed_reuse_source_version_id>source_versions.source_version_id:NO ACTION/NO ACTION/NONE',
        ]
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

function requireContinuitySchema(db: DatabaseSync): void {
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

function requireTargetSchema(db: DatabaseSync): void {
  requireExactSchema(db, FULL_TARGET_SCHEMA_SQL, TARGET_INDEX_SQL, true);
}

function requireSourceImportTargetSchema(db: DatabaseSync): void {
  requireExactSchema(db, FULL_SOURCE_IMPORT_TARGET_SCHEMA_SQL, TARGET_INDEX_SQL, true, SOURCE_IMPORT_TRIGGER_SQL);
}

function requireManuscriptReimportTargetSchema(
  db: DatabaseSync,
  includeModelServiceTable = false,
  includeNativeArtifactTables = false,
  includeAuthoritySidecarTables = false,
): void {
  requireExactSchema(
    db,
    {
      ...FULL_MANUSCRIPT_REIMPORT_TARGET_SCHEMA_SQL,
      ...(includeModelServiceTable ? { model_service_connections: MODEL_SERVICE_CONNECTION_SCHEMA_SQL } : {}),
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
    },
    MANUSCRIPT_REIMPORT_INDEX_SQL,
    true,
    {
      ...MANUSCRIPT_REIMPORT_TRIGGER_SQL,
      ...(includeAuthoritySidecarTables ? EDITORIAL_WORKSPACE_PROFILE_SIDECAR_TRIGGER_SQL : {}),
    },
  );
}

function requireV7TargetSchema(db: DatabaseSync): void {
  requireExactSchema(db, FULL_V7_TARGET_SCHEMA_SQL, V7_TARGET_INDEX_SQL, true);
}

function requireV6TargetSchema(db: DatabaseSync): void {
  requireExactSchema(db, FULL_V6_TARGET_SCHEMA_SQL, V6_TARGET_INDEX_SQL, true);
}

function canonicalJson(value: unknown): string {
  if (typeof value === 'string') requireBounded(value.isWellFormed(), 'CANONICAL_VALUE_INVALID', '无法形成规范摘要。');
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(',')}}`;
  }
  const encoded = JSON.stringify(value);
  requireBounded(encoded !== undefined, 'CANONICAL_VALUE_INVALID', '无法形成规范摘要。');
  return encoded;
}

function validateWorkflowSemanticTruth(db: DatabaseSync, profile: BuiltInWorkflowProfile): void {
  const projectionJson = canonicalJson({
    schema: profile.projection.schema,
    id: profile.projection.id,
    name: profile.projection.name,
    version: profile.projection.version,
    phases: profile.projection.phases,
    gates: profile.projection.gates,
  });
  const profiles = db.prepare(
    `SELECT profile_id, profile_version, profile_name, profile_digest, projection_schema, projection_json,
            native_profile_id, native_profile_version, native_profile_digest
     FROM workflow_profiles ORDER BY profile_id, profile_version`,
  ).all() as SqlRow[];
  requireBounded(
    profiles.length <= 1 && profiles.every((row) =>
      asString(row.profile_id) === profile.projection.id &&
      asString(row.profile_version) === profile.projection.version &&
      asString(row.profile_name) === profile.projection.name &&
      asString(row.profile_digest) === profile.projection.digest &&
      asString(row.projection_schema) === profile.projection.schema &&
      asString(row.projection_json) === projectionJson &&
      asString(row.native_profile_id) === profile.native.id &&
      asString(row.native_profile_version) === profile.native.version &&
      asString(row.native_profile_digest) === profile.native.digest),
    'SCHEMA_INVALID',
    '工作流程方案无法由内置原生 DSH Profile 精确解释。',
  );
  const phaseLabels = new Set<string>(profile.projection.phases.map((phase) => phase.label));
  const instances = db.prepare(
    `SELECT profile_id, profile_version, profile_digest,
            native_profile_id, native_profile_version, native_profile_digest, current_phase, state
     FROM workflow_instances ORDER BY workflow_instance_id`,
  ).all() as SqlRow[];
  requireBounded(
    instances.every((row) =>
      profiles.length === 1 &&
      asString(row.profile_id) === profile.projection.id &&
      asString(row.profile_version) === profile.projection.version &&
      asString(row.profile_digest) === profile.projection.digest &&
      asString(row.native_profile_id) === profile.native.id &&
      asString(row.native_profile_version) === profile.native.version &&
      asString(row.native_profile_digest) === profile.native.digest &&
      phaseLabels.has(asString(row.current_phase)) &&
      asString(row.state) === 'active'),
    'SCHEMA_INVALID',
    '工作流程实例的精确 Profile 绑定或当前阶段无法解释。',
  );
}

function validateImportDraftTargetTruth(db: DatabaseSync): void {
  const rows = db.prepare(
    `SELECT state, reviewed_title, reviewed_target_choice_id, review_digest,
            reviewed_target_kind, reviewed_existing_book_id, reviewed_relationship,
            reviewed_book_state_digest
     FROM import_drafts ORDER BY draft_id`,
  ).all() as SqlRow[];
  requireBounded(
    rows.every((row) => {
      const state = asString(row.state);
      const isNull = (value: SQLOutputValue | undefined): boolean => value === null;
      if (state === 'staged') {
        return isNull(row.reviewed_title) && isNull(row.reviewed_target_choice_id) && isNull(row.review_digest) &&
          isNull(row.reviewed_target_kind) && isNull(row.reviewed_existing_book_id) &&
          isNull(row.reviewed_relationship) && isNull(row.reviewed_book_state_digest);
      }
      if (state !== 'reviewed' && state !== 'committed') return false;
      if (typeof row.review_digest !== 'string' || !/^[0-9a-f]{64}$/.test(row.review_digest)) return false;
      if (row.reviewed_target_kind === 'new-book') {
        return typeof row.reviewed_title === 'string' && row.reviewed_title.length > 0 &&
          (row.reviewed_target_choice_id === null || row.reviewed_target_choice_id === 'new-book' ||
            row.reviewed_target_choice_id === 'new-book-distinct-intended-work') &&
          row.reviewed_existing_book_id === null && row.reviewed_relationship === 'new-book-first-manuscript' &&
          row.reviewed_book_state_digest === null;
      }
      return row.reviewed_target_kind === 'existing-book' && row.reviewed_title === null &&
        row.reviewed_target_choice_id === null && typeof row.reviewed_existing_book_id === 'string' &&
        UUID_PATTERN.test(row.reviewed_existing_book_id) && row.reviewed_relationship === 'first-manuscript' &&
        typeof row.reviewed_book_state_digest === 'string' && /^[0-9a-f]{64}$/.test(row.reviewed_book_state_digest);
    }),
    'SCHEMA_INVALID',
    '导入草稿的目标、关系与复核证据组合矛盾。',
  );
}

function validateSourceImportDraftTargetTruth(db: DatabaseSync): void {
  const rows = db.prepare(
    `SELECT draft_id, state, reviewed_title, reviewed_target_choice_id, review_digest,
            reviewed_target_kind, reviewed_existing_book_id, reviewed_relationship,
            reviewed_book_state_digest, reviewed_reuse_source_version_id
     FROM import_drafts ORDER BY draft_id`,
  ).all() as SqlRow[];
  requireBounded(
    rows.every((row) => {
      const state = asString(row.state);
      const isNull = (value: SQLOutputValue | undefined): boolean => value === null;
      if (state === 'staged') {
        return isNull(row.reviewed_title) && isNull(row.reviewed_target_choice_id) && isNull(row.review_digest) &&
          isNull(row.reviewed_target_kind) && isNull(row.reviewed_existing_book_id) &&
          isNull(row.reviewed_relationship) && isNull(row.reviewed_book_state_digest) &&
          isNull(row.reviewed_reuse_source_version_id);
      }
      if (state !== 'reviewed' && state !== 'committed') return false;
      if (typeof row.review_digest !== 'string' || !DIGEST_PATTERN.test(row.review_digest)) return false;
      if (row.reviewed_relationship === 'reimport') {
        return row.reviewed_target_kind === 'existing-book' && row.reviewed_title === null &&
          row.reviewed_target_choice_id === null && typeof row.reviewed_existing_book_id === 'string' &&
          UUID_PATTERN.test(row.reviewed_existing_book_id) &&
          typeof row.reviewed_book_state_digest === 'string' && DIGEST_PATTERN.test(row.reviewed_book_state_digest) &&
          (row.reviewed_reuse_source_version_id === null ||
            (typeof row.reviewed_reuse_source_version_id === 'string' && UUID_PATTERN.test(row.reviewed_reuse_source_version_id)));
      }
      if (row.reviewed_relationship !== 'source-only') {
        if (row.reviewed_target_kind === 'new-book') {
          return typeof row.reviewed_title === 'string' && row.reviewed_title.length > 0 &&
            (row.reviewed_target_choice_id === null || row.reviewed_target_choice_id === 'new-book' ||
              row.reviewed_target_choice_id === 'new-book-distinct-intended-work') &&
            row.reviewed_existing_book_id === null && row.reviewed_relationship === 'new-book-first-manuscript' &&
            row.reviewed_book_state_digest === null && row.reviewed_reuse_source_version_id === null;
        }
        return row.reviewed_target_kind === 'existing-book' && row.reviewed_title === null &&
          row.reviewed_target_choice_id === null && typeof row.reviewed_existing_book_id === 'string' &&
          UUID_PATTERN.test(row.reviewed_existing_book_id) && row.reviewed_relationship === 'first-manuscript' &&
          typeof row.reviewed_book_state_digest === 'string' && DIGEST_PATTERN.test(row.reviewed_book_state_digest) &&
          row.reviewed_reuse_source_version_id === null;
      }
      if (row.reviewed_target_kind === 'new-book') {
        return typeof row.reviewed_title === 'string' && row.reviewed_title.length > 0 &&
          (row.reviewed_target_choice_id === 'new-book' ||
            row.reviewed_target_choice_id === 'new-book-distinct-intended-work') &&
          row.reviewed_existing_book_id === null && row.reviewed_book_state_digest === null &&
          row.reviewed_reuse_source_version_id === null;
      }
      if (!(row.reviewed_target_kind === 'existing-book' && row.reviewed_title === null &&
        row.reviewed_target_choice_id === null && typeof row.reviewed_existing_book_id === 'string' &&
        UUID_PATTERN.test(row.reviewed_existing_book_id) &&
        typeof row.reviewed_book_state_digest === 'string' && DIGEST_PATTERN.test(row.reviewed_book_state_digest) &&
        (row.reviewed_reuse_source_version_id === null ||
          (typeof row.reviewed_reuse_source_version_id === 'string' &&
            UUID_PATTERN.test(row.reviewed_reuse_source_version_id))))) return false;
      if (row.reviewed_reuse_source_version_id === null) return true;
      if (state === 'committed') {
        const committedReuse = db.prepare(
          `SELECT count(*) matches
           FROM import_commits ic
           JOIN source_import_records sir ON sir.commit_id = ic.commit_id
           WHERE ic.draft_id = ? AND ic.operation_kind = 'source-import'
             AND sir.book_id = ? AND sir.source_version_id = ?
             AND sir.source_version_disposition = 'reused-same-book'`,
        ).get(
          asString(row.draft_id),
          asString(row.reviewed_existing_book_id),
          asString(row.reviewed_reuse_source_version_id),
        ) as SqlRow | undefined;
        return committedReuse !== undefined && asNumber(committedReuse.matches) === 1;
      }
      const reuse = db.prepare(
        `SELECT count(*) matches
         FROM source_versions sv
         JOIN import_drafts d ON d.draft_id = ?
         JOIN staged_import_snapshots sis ON sis.draft_id = d.draft_id
         WHERE sv.source_version_id = ? AND sv.book_id = d.reviewed_existing_book_id
           AND sv.object_digest = d.object_digest AND sv.source_digest = sis.source_digest
           AND sv.content_digest = sis.content_digest AND sv.structure_digest = sis.structure_digest
           AND sv.parser_identity = sis.parser_identity`,
      ).get(asString(row.draft_id), asString(row.reviewed_reuse_source_version_id)) as SqlRow | undefined;
      return reuse !== undefined && asNumber(reuse.matches) === 1;
    }),
    'SCHEMA_INVALID',
    '导入草稿的目标、关系与复核证据组合矛盾。',
  );
}

function validateSourceImportRecordTruth(db: DatabaseSync): void {
  const namedNonEffects = [
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
  const rows = db.prepare(
    `SELECT sir.source_import_record_id, sir.commit_id, sir.book_id, sir.source_version_id,
            sir.provenance_id, sir.target_kind, sir.source_version_disposition,
            sir.retained_boundary_json, sir.named_non_effects_json, sir.record_digest, sir.imported_at,
            sv.object_digest, sv.source_digest, sv.content_digest, sv.structure_digest,
            sv.parser_identity, sv.format, co.byte_length,
            sp.acquisition_path, sp.locality, sp.sanitized_identity,
            sp.parser_identity provenance_parser_identity, sp.recorded_at,
            ic.operation_kind, ic.committed_at, d.state draft_state,
            d.committed_commit_id, d.reviewed_target_kind, d.reviewed_existing_book_id,
            d.reviewed_relationship, d.reviewed_reuse_source_version_id
     FROM source_import_records sir
     JOIN books b ON b.book_id = sir.book_id
     JOIN source_versions sv
       ON sv.source_version_id = sir.source_version_id AND sv.book_id = sir.book_id
     JOIN content_objects co ON co.object_digest = sv.object_digest
     JOIN source_provenance sp
       ON sp.provenance_id = sir.provenance_id AND sp.source_version_id = sir.source_version_id
     JOIN import_commits ic ON ic.commit_id = sir.commit_id
     JOIN import_drafts d ON d.draft_id = ic.draft_id
     ORDER BY sir.source_import_record_id`,
  ).all() as SqlRow[];
  const sourceRecordCount = asNumber(one(
    db.prepare('SELECT count(*) records FROM source_import_records').all() as SqlRow[],
    'SCHEMA_INVALID',
    '无法核对来源导入记录。',
  ).records);
  requireBounded(rows.length === sourceRecordCount, 'SCHEMA_INVALID', '来源导入记录图不完整。');
  for (const row of rows) {
    let retainedBoundary: unknown;
    let persistedNonEffects: unknown;
    try {
      retainedBoundary = JSON.parse(asString(row.retained_boundary_json)) as unknown;
      persistedNonEffects = JSON.parse(asString(row.named_non_effects_json)) as unknown;
    } catch {
      throw new BoundedStoreError('SCHEMA_INVALID', '来源导入记录的规范 JSON 无效。');
    }
    requireBounded(
      retainedBoundary !== null && typeof retainedBoundary === 'object' && !Array.isArray(retainedBoundary) &&
        Array.isArray(persistedNonEffects) && canonicalJson(persistedNonEffects) === canonicalJson(namedNonEffects),
      'SCHEMA_INVALID',
      '来源导入记录的保留边界或具名非影响无效。',
    );
    const boundary = retainedBoundary as Record<string, unknown>;
    const targetKind = asString(row.target_kind);
    const disposition = asString(row.source_version_disposition);
    const sourceVersionId = asString(row.source_version_id);
    const recordDigest = sha256(canonicalJson({
      schema: 'ai7.source-import-record/1',
      sourceImportRecordId: asString(row.source_import_record_id),
      commitId: asString(row.commit_id),
      bookId: asString(row.book_id),
      sourceVersionId,
      provenanceId: asString(row.provenance_id),
      targetKind,
      sourceVersionDisposition: disposition,
      retainedBoundary,
      namedNonEffects: persistedNonEffects,
      importedAt: asString(row.imported_at),
    }));
    requireBounded(
      (targetKind === 'new-book' || targetKind === 'existing-book') &&
        (disposition === 'created' || disposition === 'reused-same-book') &&
        asString(row.object_digest) === asString(row.source_digest) && asString(row.format) === 'DOCX' &&
        boundary.kind === 'complete-local-file' &&
        boundary.label === '保留完整所选 DOCX 文件及本地解析出的完整内容与结构身份' &&
        boundary.format === 'DOCX' && boundary.displayName === asString(row.sanitized_identity) &&
        boundary.sourceSha256 === asString(row.source_digest) &&
        boundary.sourceBytes === asNumber(row.byte_length) &&
        boundary.contentDigest === asString(row.content_digest) &&
        boundary.structureDigest === asString(row.structure_digest) &&
        asString(row.acquisition_path) === 'native-file-picker' && asString(row.locality) === 'local-provider-free' &&
        asString(row.provenance_parser_identity) === asString(row.parser_identity) &&
        typeof row.recorded_at === 'string' &&
        asString(row.operation_kind) === 'source-import' && asString(row.draft_state) === 'committed' &&
        asString(row.committed_commit_id) === asString(row.commit_id) &&
        asString(row.committed_at) === asString(row.imported_at) &&
        asString(row.reviewed_relationship) === 'source-only' &&
        asString(row.reviewed_target_kind) === targetKind &&
        (targetKind === 'new-book' ? row.reviewed_existing_book_id === null : row.reviewed_existing_book_id === row.book_id) &&
        (disposition === 'reused-same-book'
          ? row.reviewed_reuse_source_version_id === sourceVersionId
          : row.reviewed_reuse_source_version_id === null) &&
        asString(row.record_digest) === recordDigest,
      'SCHEMA_INVALID',
      '来源导入记录的图书、来源版本、来源、保留边界、结果类型或摘要无效。',
    );
    requireBounded(targetKind !== 'new-book' || disposition === 'created', 'SCHEMA_INVALID', '来源绑定新图书不能复用既有来源版本。');
  }
  const hasReimport = schemaObjectSql(db, 'table', 'manuscript_reimport_records') !== undefined;
  const invalidCommits = db.prepare(
    `SELECT ic.commit_id
     FROM import_commits ic
     WHERE (ic.operation_kind = 'manuscript-import') !=
             EXISTS (SELECT 1 FROM manuscript_import_records mir WHERE mir.commit_id = ic.commit_id)
        OR (ic.operation_kind = 'source-import') !=
             EXISTS (SELECT 1 FROM source_import_records sir WHERE sir.commit_id = ic.commit_id)
        ${hasReimport ? `OR (ic.operation_kind = 'manuscript-reimport') !=
             EXISTS (SELECT 1 FROM manuscript_reimport_records mrr WHERE mrr.commit_id = ic.commit_id)` : ''}
        OR (SELECT count(*) FROM manuscript_import_records mir WHERE mir.commit_id = ic.commit_id) +
           (SELECT count(*) FROM source_import_records sir WHERE sir.commit_id = ic.commit_id)
           ${hasReimport ? `+ (SELECT count(*) FROM manuscript_reimport_records mrr WHERE mrr.commit_id = ic.commit_id)` : ''} != 1`,
  ).all() as SqlRow[];
  requireBounded(invalidCommits.length === 0, 'SCHEMA_INVALID', '导入提交类型与结果记录不一致。');
  const invalidAttempts = db.prepare(
    `SELECT a.attempt_id
     FROM import_commit_attempts a
     JOIN import_drafts d ON d.draft_id = a.draft_id
     LEFT JOIN import_commits ic ON ic.commit_id = a.attempt_id
     WHERE a.operation_kind != CASE d.reviewed_relationship
       WHEN 'source-only' THEN 'source-import'
       ${hasReimport ? "WHEN 'reimport' THEN 'manuscript-reimport'" : ''}
       ELSE 'manuscript-import' END
       OR (ic.commit_id IS NOT NULL AND ic.operation_kind != a.operation_kind)`,
  ).all() as SqlRow[];
  requireBounded(invalidAttempts.length === 0, 'SCHEMA_INVALID', '导入提交尝试类型与草稿或提交不一致。');
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

const segmenter = new Intl.Segmenter('zh-CN', { granularity: 'grapheme' });

function graphemes(text: string): string[] {
  return Array.from(segmenter.segment(text), ({ segment }) => segment);
}

interface OffsetSegment {
  size: number;
  total: number;
}

function fenwickSpan(position: number): number {
  requireBounded(Number.isSafeInteger(position) && position > 0, 'OFFSET_INDEX_INVALID', '稿件偏移索引位置无效。');
  let remainder = position;
  let span = 1;
  while (remainder % 2 === 0) {
    remainder /= 2;
    span *= 2;
  }
  return span;
}

function appendOffsetSegment(stack: OffsetSegment[], position: number, length: number): number {
  requireBounded(Number.isSafeInteger(length) && length >= 0, 'OFFSET_INDEX_INVALID', '稿件偏移索引长度无效。');
  let segment: OffsetSegment = { size: 1, total: length };
  while (stack.at(-1)?.size === segment.size) {
    const previous = stack.pop()!;
    const total = previous.total + segment.total;
    requireBounded(Number.isSafeInteger(total), 'OFFSET_INDEX_INVALID', '稿件偏移索引总量无效。');
    segment = { size: segment.size * 2, total };
  }
  requireBounded(segment.size === fenwickSpan(position), 'OFFSET_INDEX_INVALID', '稿件偏移索引范围无效。');
  stack.push(segment);
  return segment.total;
}

function lastWorkingPosition(db: DatabaseSync, branchId: string): number {
  const row = db.prepare(
    'SELECT position FROM working_blocks WHERE branch_id = ? ORDER BY position DESC LIMIT 1',
  ).get(branchId) as SqlRow | undefined;
  requireBounded(row !== undefined, 'WINDOW_NOT_FOUND', '稿件窗口为空。');
  return asNumber(row.position);
}

function workingOffsetPrefix(db: DatabaseSync, branchId: string, throughPosition: number): number {
  requireBounded(Number.isSafeInteger(throughPosition) && throughPosition >= 0, 'OFFSET_INDEX_INVALID', '稿件偏移查询位置无效。');
  let position = throughPosition;
  let total = 0;
  const read = db.prepare('SELECT span_graphemes FROM working_offset_nodes WHERE branch_id = ? AND position = ?');
  while (position > 0) {
    const row = read.get(branchId, position) as SqlRow | undefined;
    requireBounded(row !== undefined, 'OFFSET_INDEX_INVALID', '稿件偏移索引节点缺失。');
    total += asNumber(row.span_graphemes);
    requireBounded(Number.isSafeInteger(total), 'OFFSET_INDEX_INVALID', '稿件偏移查询总量无效。');
    position -= fenwickSpan(position);
  }
  return total;
}

function workingOffsetBefore(db: DatabaseSync, branchId: string, position: number): number {
  requireBounded(Number.isSafeInteger(position) && position > 0, 'OFFSET_INDEX_INVALID', '稿件偏移查询位置无效。');
  return workingOffsetPrefix(db, branchId, position - 1);
}

function resolveWorkingCharacter(
  db: DatabaseSync,
  branchId: string,
  character: number,
  totalCharacters: number,
): { position: number; startCharacter: number } {
  const totalBlocks = lastWorkingPosition(db, branchId);
  if (totalCharacters === 0) return { position: 1, startCharacter: 0 };
  requireBounded(
    Number.isSafeInteger(character) && character >= 0 && character < totalCharacters,
    'OFFSET_INDEX_INVALID',
    '全稿字符位置超出偏移索引范围。',
  );
  let step = 1;
  while (step <= Math.floor(totalBlocks / 2)) step *= 2;
  let position = 0;
  let prefix = 0;
  const read = db.prepare('SELECT span_graphemes FROM working_offset_nodes WHERE branch_id = ? AND position = ?');
  while (step >= 1) {
    const next = position + step;
    if (next <= totalBlocks) {
      const row = read.get(branchId, next) as SqlRow | undefined;
      requireBounded(row !== undefined, 'OFFSET_INDEX_INVALID', '稿件偏移索引节点缺失。');
      const candidate = prefix + asNumber(row.span_graphemes);
      requireBounded(Number.isSafeInteger(candidate), 'OFFSET_INDEX_INVALID', '稿件偏移查询总量无效。');
      if (candidate <= character) {
        position = next;
        prefix = candidate;
      }
    }
    step /= 2;
  }
  requireBounded(position < totalBlocks, 'OFFSET_INDEX_INVALID', '全稿字符位置无法解析。');
  return { position: position + 1, startCharacter: prefix };
}

function updateWorkingOffsetNodes(db: DatabaseSync, branchId: string, position: number, delta: number): number {
  requireBounded(Number.isSafeInteger(delta), 'OFFSET_INDEX_INVALID', '稿件偏移变化无效。');
  if (delta === 0) return 0;
  const totalBlocks = lastWorkingPosition(db, branchId);
  requireBounded(position <= totalBlocks, 'OFFSET_INDEX_INVALID', '稿件偏移更新位置无效。');
  const update = db.prepare(
    'UPDATE working_offset_nodes SET span_graphemes = span_graphemes + ? WHERE branch_id = ? AND position = ?',
  );
  let nodePosition = position;
  let changes = 0;
  while (nodePosition <= totalBlocks) {
    requireBounded(
      update.run(delta, branchId, nodePosition).changes === 1,
      'OFFSET_INDEX_INVALID',
      '稿件偏移索引节点无法更新。',
    );
    changes += 1;
    nodePosition += fenwickSpan(nodePosition);
  }
  requireBounded(
    changes <= Math.ceil(Math.log2(totalBlocks)) + 1,
    'OFFSET_INDEX_INVALID',
    '稿件偏移索引更新超出对数边界。',
  );
  return changes;
}

function encodedJsonStringBytes(text: string): number {
  return Buffer.byteLength(JSON.stringify(text), 'utf8');
}

function encodedJsonContentBytes(text: string): number {
  return encodedJsonStringBytes(text) - 2;
}

function boundedProtocolDisplay(text: string): { text: string; truncated: boolean } {
  if (encodedJsonStringBytes(text) <= MAX_OUTLINE_DISPLAY_UTF8_BYTES) return { text, truncated: false };
  const suffix = '…';
  const budget = MAX_OUTLINE_DISPLAY_UTF8_BYTES - 2 - encodedJsonContentBytes(suffix);
  const parts: string[] = [];
  let bytes = 0;
  for (const part of graphemes(text)) {
    const partBytes = encodedJsonContentBytes(part);
    if (bytes + partBytes > budget) break;
    parts.push(part);
    bytes += partBytes;
  }
  const display = `${parts.join('')}${suffix}`;
  requireBounded(encodedJsonStringBytes(display) <= MAX_OUTLINE_DISPLAY_UTF8_BYTES, 'OUTLINE_FRAME_INVALID', '显示文字超出协议范围。');
  return { text: display, truncated: true };
}

function boundedOutlineDisplay(text: string): { text: string; truncated: boolean } {
  return boundedProtocolDisplay(text);
}

function boundedSearchContext(text: ReadonlyArray<string>, from: number, to: number): string {
  requireBounded(
    Number.isSafeInteger(from) && Number.isSafeInteger(to) && from >= 0 && to > from && to <= text.length,
    'SEARCH_FRAME_INVALID',
    '搜索上下文范围无效。',
  );
  const ellipsis = '…';
  const ellipsisBytes = encodedJsonContentBytes(ellipsis);
  let left = from;
  let right = to;
  let contentBytes = text.slice(from, to).reduce((total, part) => total + encodedJsonContentBytes(part), 0);
  requireBounded(contentBytes + 2 <= MAX_OUTLINE_DISPLAY_UTF8_BYTES, 'SEARCH_FRAME_INVALID', '精确搜索文字超出显示范围。');
  let preferLeft = true;
  while (left > 0 || right < text.length) {
    const tryLeft = preferLeft ? left > 0 : right >= text.length && left > 0;
    const nextLeft = tryLeft ? left - 1 : left;
    const nextRight = tryLeft ? right : right + 1;
    const part = tryLeft ? text[nextLeft]! : text[right]!;
    const projected = 2 + contentBytes + encodedJsonContentBytes(part) +
      (nextLeft > 0 ? ellipsisBytes : 0) + (nextRight < text.length ? ellipsisBytes : 0);
    if (projected <= MAX_OUTLINE_DISPLAY_UTF8_BYTES) {
      left = nextLeft;
      right = nextRight;
      contentBytes += encodedJsonContentBytes(part);
    } else if ((tryLeft && right < text.length) || (!tryLeft && left > 0)) {
      preferLeft = !preferLeft;
      const alternateLeft = preferLeft;
      const alternateNextLeft = alternateLeft ? left - 1 : left;
      const alternateNextRight = alternateLeft ? right : right + 1;
      const alternatePart = alternateLeft ? text[alternateNextLeft]! : text[right]!;
      const alternateProjected = 2 + contentBytes + encodedJsonContentBytes(alternatePart) +
        (alternateNextLeft > 0 ? ellipsisBytes : 0) + (alternateNextRight < text.length ? ellipsisBytes : 0);
      if (alternateProjected > MAX_OUTLINE_DISPLAY_UTF8_BYTES) break;
      left = alternateNextLeft;
      right = alternateNextRight;
      contentBytes += encodedJsonContentBytes(alternatePart);
    } else {
      break;
    }
    preferLeft = !preferLeft;
  }
  const context = `${left > 0 ? ellipsis : ''}${text.slice(left, right).join('')}${right < text.length ? ellipsis : ''}`;
  requireBounded(
    encodedJsonStringBytes(context) <= MAX_OUTLINE_DISPLAY_UTF8_BYTES &&
      context.includes(text.slice(from, to).join('')),
    'SEARCH_FRAME_INVALID',
    '搜索上下文显示无法保留精确匹配。',
  );
  return context;
}

function blockDigest(kind: ManuscriptBlockProjection['kind'], level: number | null, text: string): string {
  return sha256(canonicalJson({ kind, level, text }));
}

function recoveryCommandEvidenceDigest(db: DatabaseSync, groupId: string): string {
  validateCommandHistoryGroup(db, groupId);
  const group = one(db.prepare(
    `SELECT branch_id, ordinal, kind, source_group_id
     FROM manuscript_command_groups WHERE command_group_id = ?`,
  ).all(groupId) as SqlRow[], 'HISTORY_CORRUPT', '恢复命令证据缺失。');
  const digest = createHash('sha256');
  digest.update(canonicalJson({
    schema: 'ai7.recovery-command-evidence/1',
    groupId,
    branchId: asString(group.branch_id),
    ordinal: asNumber(group.ordinal),
    kind: asString(group.kind),
    sourceGroupId: group.source_group_id === null ? null : asString(group.source_group_id),
  }));
  let position = 0;
  while (true) {
    const edits = db.prepare(
      `SELECT position, block_id, before_text, before_digest, after_text, after_digest
       FROM manuscript_command_edits
       WHERE command_group_id = ? AND position > ? ORDER BY position LIMIT ?`,
    ).all(groupId, position, HISTORY_BATCH) as SqlRow[];
    if (edits.length === 0) break;
    for (const edit of edits) {
      position = asNumber(edit.position);
      digest.update(canonicalJson({
        position,
        blockId: asString(edit.block_id),
        beforeText: asString(edit.before_text),
        beforeDigest: asString(edit.before_digest),
        afterText: asString(edit.after_text),
        afterDigest: asString(edit.after_digest),
      }));
    }
  }
  requireBounded(position > 0, 'HISTORY_CORRUPT', '恢复命令证据为空。');
  return digest.digest('hex');
}

function recoveryWorkingDigest(
  previous: string,
  sequence: number,
  action: 'edit' | 'replacement' | 'undo' | 'redo',
  groupId: string,
  evidenceDigest: string,
): string {
  return sha256(canonicalJson({
    schema: 'ai7.recovery-working-digest/1', previous, sequence, action, groupId, evidenceDigest,
  }));
}

function stagedBlockId(draftId: string, position: number, digest: string): string {
  return `blk_${sha256(`${draftId}\u0000${position}\u0000${digest}`).slice(0, 24)}`;
}

function parsedBlockId(position: number, digest: string): string {
  return `blk_${sha256(`${position}\u0000${digest}`).slice(0, 24)}`;
}

function stableRevisionWorkingDigest(db: DatabaseSync, revisionId: string): string {
  requirePersistedBlockTextBounds(db, 'manuscript_block_versions', revisionId, 'SCHEMA_MIGRATION_FAILED', '旧版基础修订版文字超出有界校验范围。');
  const digest = createHash('sha256');
  digest.update('[');
  let position = 0;
  let expectedPosition = 1;
  let first = true;
  while (true) {
    const rows = db.prepare(
      `SELECT block_id, position, digest FROM manuscript_block_versions
       WHERE revision_id = ? AND position > ? ORDER BY position LIMIT ?`,
    ).all(revisionId, position, MIGRATION_BATCH) as SqlRow[];
    if (rows.length === 0) break;
    for (const row of rows) {
      const blockId = asString(row.block_id);
      position = asNumber(row.position);
      const blockDigestValue = asString(row.digest);
      requireBounded(
        position === expectedPosition && BLOCK_PATTERN.test(blockId) && DIGEST_PATTERN.test(blockDigestValue),
        'SCHEMA_MIGRATION_FAILED',
        '旧版工作稿摘要无法从基础修订版内容块精确重建。',
      );
      if (!first) digest.update(',');
      digest.update(canonicalJson({ blockId, position, digest: blockDigestValue }));
      first = false;
      expectedPosition += 1;
    }
  }
  requireBounded(!first, 'SCHEMA_MIGRATION_FAILED', '旧版工作稿基础修订版没有内容块。');
  digest.update(']');
  return digest.digest('hex');
}

function validateIdentity(manuscriptId: string, branchId: string): void {
  requireBounded(UUID_PATTERN.test(manuscriptId) && UUID_PATTERN.test(branchId), 'MANUSCRIPT_INVALID', '稿件绑定无效。');
}

function validateShortText(value: string, maximum: number, code: string, message: string, allowEmpty = false): string {
  requireBounded(value.isWellFormed(), code, message);
  const normalized = value.normalize('NFC').trim();
  requireBounded((allowEmpty || normalized.length > 0) && normalized.length <= maximum, code, message);
  return normalized;
}

function transact<T>(db: DatabaseSync, operation: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = operation();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    try {
      db.exec('ROLLBACK');
    } catch (rollbackError) {
      throw new BoundedStoreFatalError(new AggregateError([error, rollbackError], 'SQLite rollback failed.'));
    }
    throw error;
  }
}

function recreateImportDraftTable(db: DatabaseSync): void {
  const replacementSql = COMMON_SCHEMA_SQL.import_drafts.replace(
    'CREATE TABLE import_drafts (',
    'CREATE TABLE import_drafts_v6 (',
  );
  requireBounded(replacementSql !== COMMON_SCHEMA_SQL.import_drafts, 'SCHEMA_MIGRATION_FAILED', '导入草稿目标结构无法建立。');
  db.exec(`
    PRAGMA legacy_alter_table = ON;
    DROP TRIGGER abandonment_cleanup_block_draft_insert;
    DROP TRIGGER abandonment_cleanup_block_draft_update;
    DROP TRIGGER abandonment_cleanup_block_draft_update_v5;
    ${replacementSql};
    INSERT INTO import_drafts_v6(
      draft_id, selection_token, state, draft_version, display_name, object_digest, selected_path,
      reviewed_title, reviewed_target_choice_id, review_digest, committed_commit_id,
      staged_at, reviewed_at, committed_at
    )
    SELECT draft_id, selection_token, state, draft_version, display_name, object_digest, selected_path,
           reviewed_title, reviewed_target_choice_id, review_digest, committed_commit_id,
           staged_at, reviewed_at, committed_at
    FROM import_drafts;
    DROP TABLE import_drafts;
    ALTER TABLE import_drafts_v6 RENAME TO import_drafts;
    ${IMPORT_DRAFT_TRIGGER_SQL.abandonment_cleanup_block_draft_insert};
    ${IMPORT_DRAFT_TRIGGER_SQL.abandonment_cleanup_block_draft_update};
    ${IMPORT_DRAFT_TRIGGER_SQL.abandonment_cleanup_block_draft_update_v5};
    PRAGMA legacy_alter_table = OFF;
  `);
}

function recreateRevisionTable(db: DatabaseSync): void {
  db.exec(`
    PRAGMA legacy_alter_table = ON;
    CREATE TABLE manuscript_revisions_v3 (
      revision_id TEXT PRIMARY KEY,
      manuscript_id TEXT NOT NULL REFERENCES manuscripts(manuscript_id),
      branch_id TEXT NOT NULL REFERENCES manuscript_branches(branch_id),
      ordinal INTEGER NOT NULL CHECK(ordinal > 0),
      revision_label TEXT NOT NULL,
      parent_revision_id TEXT REFERENCES manuscript_revisions(revision_id),
      source_version_id TEXT NOT NULL REFERENCES source_versions(source_version_id),
      revision_digest TEXT NOT NULL CHECK(length(revision_digest) = 64),
      created_at TEXT NOT NULL,
      UNIQUE(manuscript_id, ordinal),
      UNIQUE(manuscript_id, revision_label)
    ) STRICT;
    INSERT INTO manuscript_revisions_v3 SELECT * FROM manuscript_revisions;
    DROP TABLE manuscript_revisions;
    ALTER TABLE manuscript_revisions_v3 RENAME TO manuscript_revisions;
    PRAGMA legacy_alter_table = OFF;
  `);
}

function stagedBlockLength(
  text: string,
  code = 'SCHEMA_MIGRATION_FAILED',
  message = '暂存稿件包含无法按内容块有界校验的文字。',
): number {
  requireBounded(
    text.isWellFormed() && text.length <= MAX_BLOCK_CODE_UNITS,
    code,
    message,
  );
  const length = graphemes(text).length;
  requireBounded(length <= MAX_BLOCK_GRAPHEMES, code, message);
  return length;
}

function requirePersistedBlockTextBounds(
  db: DatabaseSync,
  table: 'manuscript_block_versions' | 'working_blocks',
  ownerId: string,
  code: string,
  message: string,
): void {
  const ownerColumn = table === 'manuscript_block_versions' ? 'revision_id' : 'branch_id';
  const oversized = db.prepare(
    `SELECT position FROM ${table}
     WHERE ${ownerColumn} = ? AND (typeof(text) <> 'text' OR length(CAST(text AS BLOB)) > ?)
     ORDER BY position LIMIT 1`,
  ).get(ownerId, MAX_BLOCK_CODE_UNITS * 3) as SqlRow | undefined;
  requireBounded(oversized === undefined, code, message);
}

function validateStagedDraftContentTruth(db: DatabaseSync, draftId: string, requireCharacterCount = true): void {
  const snapshot = one(
    db.prepare(
      `SELECT content_digest, structure_digest, block_count, character_count
       FROM staged_import_snapshots WHERE draft_id = ?`,
    ).all(draftId) as SqlRow[],
    'SCHEMA_MIGRATION_FAILED',
    '暂存稿件快照缺失。',
  );
  const oversized = db.prepare(
    `SELECT position FROM staged_import_blocks
     WHERE draft_id = ? AND (typeof(text) <> 'text' OR length(CAST(text AS BLOB)) > ?)
     ORDER BY position LIMIT 1`,
  ).get(draftId, MAX_BLOCK_CODE_UNITS * 3) as SqlRow | undefined;
  requireBounded(oversized === undefined, 'SCHEMA_MIGRATION_FAILED', '暂存稿件文字超出有界校验范围。');
  const contentHash = createHash('sha256');
  const structureHash = createHash('sha256');
  structureHash.update('[');
  let position = 0;
  let expectedPosition = 1;
  let characters = 0;
  while (true) {
    const rows = db.prepare(
      `SELECT position, kind, level, text, digest FROM staged_import_blocks
       WHERE draft_id = ? AND position > ? ORDER BY position LIMIT ?`,
    ).all(draftId, position, MIGRATION_BATCH) as SqlRow[];
    if (rows.length === 0) break;
    for (const row of rows) {
      position = asNumber(row.position);
      const kind = asString(row.kind) as ManuscriptBlockProjection['kind'];
      const level = row.level === null ? null : asNumber(row.level);
      const text = asString(row.text);
      const digest = asString(row.digest);
      const shapeValid =
        (kind === 'title' && level === 1) ||
        (kind === 'heading' && level !== null && Number.isSafeInteger(level) && level >= 1 && level <= 6) ||
        (kind === 'paragraph' && level === null);
      const length = stagedBlockLength(text);
      requireBounded(
        position === expectedPosition && shapeValid && DIGEST_PATTERN.test(digest) &&
          blockDigest(kind, level, text) === digest,
        'SCHEMA_MIGRATION_FAILED',
        '暂存稿件内容块的结构、文字或摘要无法证明。',
      );
      if (expectedPosition > 1) {
        contentHash.update('\u001e');
        structureHash.update(',');
      }
      contentHash.update(text);
      structureHash.update(canonicalJson({
        blockId: parsedBlockId(position, digest),
        position,
        kind,
        level,
        digest,
      }));
      characters += length;
      requireBounded(Number.isSafeInteger(characters), 'SCHEMA_MIGRATION_FAILED', '暂存稿件字符总数无效。');
      expectedPosition += 1;
    }
  }
  const blockCount = expectedPosition - 1;
  requireBounded(
    blockCount > 0 && blockCount === asNumber(snapshot.block_count) &&
      (!requireCharacterCount || characters === asNumber(snapshot.character_count)) &&
      contentHash.digest('hex') === asString(snapshot.content_digest) &&
      structureHash.update(']').digest('hex') === asString(snapshot.structure_digest),
    'SCHEMA_MIGRATION_FAILED',
    '暂存稿件完整内容或结构身份与权威快照不一致。',
  );
}

function rekeyStagedDraftBlocks(db: DatabaseSync, draftId: string): void {
  requireBounded(UUID_PATTERN.test(draftId), 'SCHEMA_MIGRATION_FAILED', '暂存稿件草稿标识无效。');
  let position = 0;
  let expectedPosition = 1;
  while (true) {
    const rows = db.prepare(
      `SELECT staged_block_id, position, digest FROM staged_import_blocks
       WHERE draft_id = ? AND position > ? ORDER BY position LIMIT ?`,
    ).all(draftId, position, MIGRATION_BATCH) as SqlRow[];
    if (rows.length === 0) break;
    for (const row of rows) {
      position = asNumber(row.position);
      requireBounded(
        position === expectedPosition && BLOCK_PATTERN.test(asString(row.staged_block_id)) && DIGEST_PATTERN.test(asString(row.digest)),
        'SCHEMA_MIGRATION_FAILED',
        '旧暂存稿件内容块身份、顺序或摘要无效。',
      );
      expectedPosition += 1;
    }
  }
  requireBounded(expectedPosition > 1, 'SCHEMA_MIGRATION_FAILED', '暂存稿件没有内容块。');
  db.prepare(
    `UPDATE staged_import_blocks SET staged_block_id = '_ai7_migration_' || staged_block_id
     WHERE draft_id = ?`,
  ).run(draftId);
  position = 0;
  const update = db.prepare(
    'UPDATE staged_import_blocks SET staged_block_id = ? WHERE draft_id = ? AND position = ?',
  );
  while (true) {
    const rows = db.prepare(
      `SELECT position, digest FROM staged_import_blocks
       WHERE draft_id = ? AND position > ? ORDER BY position LIMIT ?`,
    ).all(draftId, position, MIGRATION_BATCH) as SqlRow[];
    if (rows.length === 0) break;
    for (const row of rows) {
      position = asNumber(row.position);
      const expected = stagedBlockId(draftId, position, asString(row.digest));
      requireBounded(
        update.run(expected, draftId, position).changes === 1,
        'SCHEMA_MIGRATION_FAILED',
        '暂存稿件稳定内容块身份无法重建。',
      );
    }
  }
}

function rebuildStagedDraftDerived(db: DatabaseSync, draftId: string): void {
  rekeyStagedDraftBlocks(db, draftId);
  const updateBlock = db.prepare(
    `UPDATE staged_import_blocks SET start_offset = ?, grapheme_length = ?
     WHERE draft_id = ? AND position = ?`,
  );
  let position = 0;
  let expectedPosition = 1;
  let offset = 0;
  while (true) {
    const rows = db.prepare(
      `SELECT position, text FROM staged_import_blocks
       WHERE draft_id = ? AND position > ? ORDER BY position LIMIT ?`,
    ).all(draftId, position, MIGRATION_BATCH) as SqlRow[];
    if (rows.length === 0) break;
    for (const row of rows) {
      position = asNumber(row.position);
      requireBounded(position === expectedPosition, 'SCHEMA_MIGRATION_FAILED', '暂存稿件内容块顺序不连续。');
      const length = stagedBlockLength(asString(row.text));
      requireBounded(Number.isSafeInteger(offset + length), 'SCHEMA_MIGRATION_FAILED', '暂存稿件字符总数无效。');
      requireBounded(
        updateBlock.run(offset, length, draftId, position).changes === 1,
        'SCHEMA_MIGRATION_FAILED',
        '暂存稿件派生偏移无法重建。',
      );
      offset += length;
      expectedPosition += 1;
    }
  }
  const snapshot = one(
    db.prepare(
      `SELECT s.block_count, d.state FROM staged_import_snapshots s
       JOIN import_drafts d ON d.draft_id = s.draft_id WHERE s.draft_id = ?`,
    ).all(draftId) as SqlRow[],
    'SCHEMA_MIGRATION_FAILED',
    '暂存稿件快照或草稿状态缺失。',
  );
  requireBounded(
    asString(snapshot.state) === 'staged' || asString(snapshot.state) === 'reviewed',
    'SCHEMA_MIGRATION_FAILED',
    '已提交导入草稿仍保留不可达暂存内容。',
  );
  requireBounded(expectedPosition - 1 === asNumber(snapshot.block_count), 'SCHEMA_MIGRATION_FAILED', '暂存稿件内容块计数不一致。');
  requireBounded(
    db.prepare('UPDATE staged_import_snapshots SET character_count = ? WHERE draft_id = ?').run(offset, draftId).changes === 1,
    'SCHEMA_MIGRATION_FAILED',
    '暂存稿件字符总数无法重建。',
  );
}

function validateStagedDraftDerived(db: DatabaseSync, draftId: string): void {
  validateStagedDraftContentTruth(db, draftId);
  const snapshot = one(
    db.prepare(
      `SELECT s.block_count, s.character_count, d.state FROM staged_import_snapshots s
       JOIN import_drafts d ON d.draft_id = s.draft_id WHERE s.draft_id = ?`,
    ).all(draftId) as SqlRow[],
    'SCHEMA_MIGRATION_FAILED',
    '暂存稿件快照或草稿状态缺失。',
  );
  const state = asString(snapshot.state);
  requireBounded(state === 'staged' || state === 'reviewed', 'SCHEMA_MIGRATION_FAILED', '暂存稿件状态与持久化内容不兼容。');
  let position = 0;
  let expectedPosition = 1;
  let offset = 0;
  while (true) {
    const rows = db.prepare(
      `SELECT staged_block_id, position, text, digest, start_offset, grapheme_length FROM staged_import_blocks
       WHERE draft_id = ? AND position > ? ORDER BY position LIMIT ?`,
    ).all(draftId, position, MIGRATION_BATCH) as SqlRow[];
    if (rows.length === 0) break;
    for (const row of rows) {
      position = asNumber(row.position);
      const length = stagedBlockLength(asString(row.text));
      requireBounded(
        position === expectedPosition && asString(row.staged_block_id) === stagedBlockId(draftId, position, asString(row.digest)) &&
          asNumber(row.start_offset) === offset && asNumber(row.grapheme_length) === length,
        'SCHEMA_MIGRATION_FAILED',
        '暂存稿件的稳定身份、内容块顺序、偏移或字素长度校验失败。',
      );
      offset += length;
      expectedPosition += 1;
    }
  }
  requireBounded(
    expectedPosition - 1 === asNumber(snapshot.block_count) && offset === asNumber(snapshot.character_count),
    'SCHEMA_MIGRATION_FAILED',
    '暂存稿件快照的内容块或字符总数校验失败。',
  );
}

function validateStagedDraftInventory(db: DatabaseSync): void {
  const missingSnapshots = asNumber(one(
    db.prepare(
      `SELECT count(*) total FROM import_drafts d
       WHERE d.state IN ('staged', 'reviewed')
         AND NOT EXISTS (SELECT 1 FROM staged_import_snapshots s WHERE s.draft_id = d.draft_id)`,
    ).all() as SqlRow[],
    'SCHEMA_MIGRATION_FAILED',
    '无法校验暂存稿件快照清单。',
  ).total);
  requireBounded(missingSnapshots === 0, 'SCHEMA_MIGRATION_FAILED', '暂存或已复核草稿缺少权威快照。');
}

function rebuildRevisionOffsets(db: DatabaseSync, revisionId: string): number {
  requirePersistedBlockTextBounds(db, 'manuscript_block_versions', revisionId, 'SCHEMA_MIGRATION_FAILED', '不可变修订版文字超出有界校验范围。');
  const updateVersion = db.prepare(
    `UPDATE manuscript_block_versions SET start_offset = ?, grapheme_length = ?
     WHERE revision_id = ? AND block_id = ?`,
  );
  let position = 0;
  let offset = 0;
  while (true) {
    const rows = db.prepare(
      `SELECT block_id, position, text FROM manuscript_block_versions
       WHERE revision_id = ? AND position > ? ORDER BY position LIMIT ?`,
    ).all(revisionId, position, MIGRATION_BATCH) as SqlRow[];
    if (rows.length === 0) break;
    for (const row of rows) {
      const blockId = asString(row.block_id);
      position = asNumber(row.position);
      const length = stagedBlockLength(asString(row.text));
      updateVersion.run(offset, length, revisionId, blockId);
      offset += length;
    }
  }
  return offset;
}

function validateRevisionOffsets(db: DatabaseSync, revisionId: string): void {
  requirePersistedBlockTextBounds(db, 'manuscript_block_versions', revisionId, 'SCHEMA_MIGRATION_FAILED', '不可变修订版文字超出有界校验范围。');
  let position = 0;
  let offset = 0;
  let blocks = 0;
  while (true) {
    const rows = db.prepare(
      `SELECT position, text, start_offset, grapheme_length FROM manuscript_block_versions
       WHERE revision_id = ? AND position > ? ORDER BY position LIMIT ?`,
    ).all(revisionId, position, MIGRATION_BATCH) as SqlRow[];
    if (rows.length === 0) break;
    for (const row of rows) {
      position = asNumber(row.position);
      const length = stagedBlockLength(asString(row.text));
      requireBounded(
        asNumber(row.start_offset) === offset && asNumber(row.grapheme_length) === length,
        'SCHEMA_MIGRATION_FAILED',
        '不可变修订版的派生偏移校验失败。',
      );
      offset += length;
      blocks += 1;
    }
  }
  requireBounded(blocks > 0, 'SCHEMA_MIGRATION_FAILED', '不可变修订版缺少内容块。');
}

function rebuildWorkingOffsetIndex(db: DatabaseSync, branchId: string): number {
  requirePersistedBlockTextBounds(db, 'working_blocks', branchId, 'SCHEMA_MIGRATION_FAILED', '工作稿文字超出有界索引范围。');
  db.prepare('DELETE FROM working_offset_nodes WHERE branch_id = ?').run(branchId);
  const insert = db.prepare(
    'INSERT INTO working_offset_nodes(branch_id, position, span_graphemes) VALUES (?, ?, ?)',
  );
  const stack: OffsetSegment[] = [];
  let position = 0;
  let expectedPosition = 1;
  let total = 0;
  while (true) {
    const rows = db.prepare(
      `SELECT position, text, grapheme_length FROM working_blocks
       WHERE branch_id = ? AND position > ? ORDER BY position LIMIT ?`,
    ).all(branchId, position, MIGRATION_BATCH) as SqlRow[];
    if (rows.length === 0) break;
    for (const row of rows) {
      position = asNumber(row.position);
      const length = stagedBlockLength(asString(row.text));
      requireBounded(
        position === expectedPosition && asNumber(row.grapheme_length) === length,
        'SCHEMA_MIGRATION_FAILED',
        '工作稿内容块顺序或字素长度无法建立偏移索引。',
      );
      insert.run(branchId, position, appendOffsetSegment(stack, position, length));
      total += length;
      requireBounded(Number.isSafeInteger(total), 'SCHEMA_MIGRATION_FAILED', '工作稿字符总数无效。');
      expectedPosition += 1;
    }
  }
  const state = one(
    db.prepare('SELECT total_graphemes FROM branch_working_state WHERE branch_id = ?').all(branchId) as SqlRow[],
    'SCHEMA_MIGRATION_FAILED',
    '工作稿状态缺失。',
  );
  requireBounded(
    expectedPosition > 1 && asNumber(state.total_graphemes) === total,
    'SCHEMA_MIGRATION_FAILED',
    '工作稿总量无法建立偏移索引。',
  );
  return total;
}

function validateBranchOffsets(db: DatabaseSync, branchId: string): void {
  requirePersistedBlockTextBounds(db, 'working_blocks', branchId, 'SCHEMA_MIGRATION_FAILED', '工作稿文字超出有界校验范围。');
  const stack: OffsetSegment[] = [];
  let position = 0;
  let expectedPosition = 1;
  let total = 0;
  while (true) {
    const rows = db.prepare(
      `SELECT wb.position, wb.text, wb.grapheme_length, oi.span_graphemes
       FROM working_blocks wb
       LEFT JOIN working_offset_nodes oi ON oi.branch_id = wb.branch_id AND oi.position = wb.position
       WHERE wb.branch_id = ? AND wb.position > ? ORDER BY wb.position LIMIT ?`,
    ).all(branchId, position, MIGRATION_BATCH) as SqlRow[];
    if (rows.length === 0) break;
    for (const row of rows) {
      position = asNumber(row.position);
      const length = stagedBlockLength(asString(row.text));
      requireBounded(
        position === expectedPosition && asNumber(row.grapheme_length) === length &&
          asNumber(row.span_graphemes) === appendOffsetSegment(stack, position, length),
        'SCHEMA_MIGRATION_FAILED',
        '工作稿的内容块顺序、字素长度或偏移索引校验失败。',
      );
      total += length;
      requireBounded(Number.isSafeInteger(total), 'SCHEMA_MIGRATION_FAILED', '工作稿字符总数无效。');
      expectedPosition += 1;
    }
  }
  const state = one(
    db.prepare('SELECT total_graphemes FROM branch_working_state WHERE branch_id = ?').all(branchId) as SqlRow[],
    'SCHEMA_MIGRATION_FAILED',
    '工作稿状态缺失。',
  );
  requireBounded(
    expectedPosition > 1 && asNumber(state.total_graphemes) === total &&
      workingOffsetPrefix(db, branchId, expectedPosition - 1) === total,
    'SCHEMA_MIGRATION_FAILED',
    '工作稿总量或偏移索引根校验失败。',
  );
}

function forEachSchemaId(
  db: DatabaseSync,
  table: string,
  column: string,
  visit: (id: string) => void,
): void {
  let cursor: string | undefined;
  while (true) {
    const rows = cursor === undefined
      ? db.prepare(`SELECT ${column} item_id FROM ${table} ORDER BY ${column} LIMIT ?`).all(MIGRATION_BATCH) as SqlRow[]
      : db.prepare(
        `SELECT ${column} item_id FROM ${table} WHERE ${column} > ? ORDER BY ${column} LIMIT ?`,
      ).all(cursor, MIGRATION_BATCH) as SqlRow[];
    if (rows.length === 0) break;
    for (const row of rows) {
      const itemId = asString(row.item_id);
      requireBounded(UUID_PATTERN.test(itemId), 'SCHEMA_MIGRATION_FAILED', '持久化稿件权威标识无效。');
      visit(itemId);
      cursor = itemId;
    }
  }
}

function validateSchemaAuthorityIds(db: DatabaseSync): void {
  forEachSchemaId(db, 'staged_import_snapshots', 'draft_id', () => undefined);
  forEachSchemaId(db, 'manuscript_revisions', 'revision_id', () => undefined);
  forEachSchemaId(db, 'branch_working_state', 'branch_id', () => undefined);
  const version = asNumber(one(db.prepare('PRAGMA user_version').all() as SqlRow[], 'SCHEMA_INVALID', '无法读取数据库版本。').user_version);
  if (version >= RECOVERY_SCHEMA_VERSION) {
    forEachSchemaId(db, 'service_lifetimes', 'lifetime_id', () => undefined);
    forEachSchemaId(db, 'recovery_snapshots', 'snapshot_id', () => undefined);
    forEachSchemaId(db, 'recovery_attention', 'attention_id', () => undefined);
    forEachSchemaId(db, 'recovery_decisions', 'decision_id', () => undefined);
    forEachSchemaId(db, 'recovery_restorations', 'restoration_id', () => undefined);
  }
}

function validateAllDerivedOffsets(db: DatabaseSync): void {
  validateStagedDraftInventory(db);
  forEachSchemaId(db, 'staged_import_snapshots', 'draft_id', (draftId) => validateStagedDraftDerived(db, draftId));
  forEachSchemaId(db, 'manuscript_revisions', 'revision_id', (revisionId) => validateRevisionOffsets(db, revisionId));
  forEachSchemaId(db, 'branch_working_state', 'branch_id', (branchId) => validateBranchOffsets(db, branchId));
}

function validateMilestoneSignoffTruth(db: DatabaseSync): void {
  const unsigned = asNumber(one(db.prepare(
    `SELECT count(*) total FROM milestone_versions mv
     WHERE NOT EXISTS (
       SELECT 1 FROM milestone_signoff_records sr WHERE sr.milestone_id = mv.milestone_id
     )`,
  ).all() as SqlRow[], 'SCHEMA_MIGRATION_FAILED', '无法读取里程碑签核覆盖。').total);
  requireBounded(unsigned === 0, 'SCHEMA_MIGRATION_FAILED', '候选数据库含有无法证明签核事实的里程碑。');
  const selectSignoffs = `SELECT sr.signoff_record_id, sr.milestone_id, sr.manuscript_id, sr.branch_id, sr.revision_id,
                                 sr.workflow_instance_id, sr.workflow_evidence_digest, sr.actor, sr.signed_at,
                                 sr.label, sr.stated_next_use,
                                 mv.manuscript_id milestone_manuscript_id, mv.branch_id milestone_branch_id,
                                 mv.revision_id milestone_revision_id, mv.label milestone_label, mv.purpose milestone_purpose,
                                 mv.actor milestone_actor, mv.created_at milestone_created_at,
                                 wi.manuscript_id workflow_manuscript_id,
                                 mr.manuscript_id revision_manuscript_id, mr.branch_id revision_branch_id,
                                 mb.manuscript_id branch_manuscript_id
                          FROM milestone_signoff_records sr
                          LEFT JOIN milestone_versions mv ON mv.milestone_id = sr.milestone_id
                          LEFT JOIN workflow_instances wi ON wi.workflow_instance_id = sr.workflow_instance_id
                          LEFT JOIN manuscript_revisions mr ON mr.revision_id = sr.revision_id
                          LEFT JOIN manuscript_branches mb ON mb.branch_id = sr.branch_id`;
  let cursor: string | undefined;
  while (true) {
    const rows = cursor === undefined
      ? db.prepare(`${selectSignoffs} ORDER BY sr.signoff_record_id LIMIT ?`).all(MIGRATION_BATCH) as SqlRow[]
      : db.prepare(
        `${selectSignoffs} WHERE sr.signoff_record_id > ? ORDER BY sr.signoff_record_id LIMIT ?`,
      ).all(cursor, MIGRATION_BATCH) as SqlRow[];
    if (rows.length === 0) break;
    for (const row of rows) {
      const signoffRecordId = asString(row.signoff_record_id);
      const milestoneId = asString(row.milestone_id);
      const manuscriptId = asString(row.manuscript_id);
      const branchId = asString(row.branch_id);
      const revisionId = asString(row.revision_id);
      const workflowInstanceId = asString(row.workflow_instance_id);
      const evidenceDigest = asString(row.workflow_evidence_digest);
      const signedAt = asString(row.signed_at);
      const signedTime = Date.parse(signedAt);
      const label = asString(row.label);
      const statedNextUse = asString(row.stated_next_use);
      requireBounded(
        UUID_PATTERN.test(signoffRecordId) && UUID_PATTERN.test(milestoneId) && UUID_PATTERN.test(manuscriptId) &&
          UUID_PATTERN.test(branchId) && UUID_PATTERN.test(revisionId) && UUID_PATTERN.test(workflowInstanceId) &&
          DIGEST_PATTERN.test(evidenceDigest) && Number.isFinite(signedTime) && new Date(signedTime).toISOString() === signedAt &&
          asString(row.actor) === '本机编辑' && asString(row.milestone_actor) === '本机编辑' &&
          manuscriptId === asString(row.milestone_manuscript_id) && manuscriptId === asString(row.workflow_manuscript_id) &&
          manuscriptId === asString(row.revision_manuscript_id) && manuscriptId === asString(row.branch_manuscript_id) &&
          branchId === asString(row.milestone_branch_id) && branchId === asString(row.revision_branch_id) &&
          revisionId === asString(row.milestone_revision_id) && label === asString(row.milestone_label) &&
          statedNextUse === asString(row.milestone_purpose) && signedAt === asString(row.milestone_created_at) &&
          label === label.normalize('NFC').trim() && label.length > 0 && label.length <= 80 &&
          statedNextUse === statedNextUse.normalize('NFC').trim() && statedNextUse.length > 0 && statedNextUse.length <= 120,
        'SCHEMA_MIGRATION_FAILED',
        '里程碑签核记录无法证明精确的修订版、流程、参与者、时间、标签或后续用途。',
      );
      cursor = signoffRecordId;
    }
  }
}

function prunePersistedReplacementRecords(db: DatabaseSync, reserve: number): void {
  requireBounded(Number.isSafeInteger(reserve) && reserve >= 0 && reserve <= 1, 'REPLACEMENT_INVALID', '替换保留参数无效。');
  const active = asNumber(one(db.prepare(
    "SELECT count(*) total FROM manuscript_replacement_previews WHERE state IN ('reviewing', 'frozen')",
  ).all() as SqlRow[], 'REPLACEMENT_INVALID', '无法读取替换保留状态。').total);
  const terminalBudget = Math.max(0, Math.min(
    MAX_RETAINED_TERMINAL_REPLACEMENTS,
    MAX_RETAINED_REPLACEMENT_PREVIEWS - active - reserve,
  ));
  db.prepare(
    `DELETE FROM manuscript_replacement_previews
     WHERE state IN ('cancelled', 'failed', 'committed')
       AND preview_id NOT IN (
         SELECT preview_id FROM manuscript_replacement_previews retained
         WHERE retained.state IN ('cancelled', 'failed', 'committed')
         ORDER BY COALESCE(committed_at, created_at) DESC, preview_id DESC
         LIMIT ?
       )`,
  ).run(terminalBudget);
  const retained = asNumber(one(db.prepare('SELECT count(*) total FROM manuscript_replacement_previews').all() as SqlRow[], 'REPLACEMENT_INVALID', '无法读取替换保留状态。').total);
  requireBounded(
    retained + reserve <= MAX_RETAINED_REPLACEMENT_PREVIEWS,
    'REPLACEMENT_RETENTION_FULL',
    '活动替换复核记录超过安全保留上限。',
  );
}

function terminalizeOrphanedReplacementPreviews(db: DatabaseSync): void {
  db.prepare(
    "UPDATE manuscript_replacement_previews SET state = 'cancelled' WHERE state IN ('reviewing', 'frozen')",
  ).run();
  prunePersistedReplacementRecords(db, 0);
}

function prunePersistedSearchSessions(db: DatabaseSync): void {
  db.prepare(
    `DELETE FROM manuscript_search_sessions
     WHERE state IN ('completed', 'cancelled', 'failed')
       AND NOT EXISTS (
         SELECT 1 FROM manuscript_replacement_previews rp
         WHERE rp.search_id = manuscript_search_sessions.search_id
       )
       AND search_id NOT IN (
         SELECT search_id FROM manuscript_search_sessions retained
         WHERE retained.state IN ('completed', 'cancelled', 'failed')
           AND NOT EXISTS (
             SELECT 1 FROM manuscript_replacement_previews rp
             WHERE rp.search_id = retained.search_id
           )
         ORDER BY COALESCE(completed_at, created_at) DESC, search_id DESC
         LIMIT ?
       )`,
  ).run(MAX_RETAINED_TRANSIENT_SEARCHES);
}

function reclaimOrphanedSearchSessions(db: DatabaseSync): void {
  db.prepare(
    "UPDATE manuscript_search_sessions SET state = 'failed', completed_at = ? WHERE state = 'running'",
  ).run(new Date().toISOString());
  prunePersistedSearchSessions(db);
}

function rebuildBranchDerived(db: DatabaseSync, branchId: string): number {
  requirePersistedBlockTextBounds(db, 'working_blocks', branchId, 'SCHEMA_MIGRATION_FAILED', '工作稿文字超出有界重建范围。');
  db.prepare('DELETE FROM manuscript_outline WHERE branch_id = ?').run(branchId);
  db.prepare('DELETE FROM working_block_search WHERE branch_id = ?').run(branchId);
  db.prepare('DELETE FROM working_offset_nodes WHERE branch_id = ?').run(branchId);
  const updateBlock = db.prepare(
    'UPDATE working_blocks SET grapheme_length = ? WHERE branch_id = ? AND block_id = ?',
  );
  const insertOutline = db.prepare(
    `INSERT INTO manuscript_outline(branch_id, block_id, position, kind, level, text, digest)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertSearch = db.prepare('INSERT INTO working_block_search(branch_id, block_id, text) VALUES (?, ?, ?)');
  const insertOffset = db.prepare(
    'INSERT INTO working_offset_nodes(branch_id, position, span_graphemes) VALUES (?, ?, ?)',
  );
  const offsetSegments: OffsetSegment[] = [];
  let position = 0;
  let expectedPosition = 1;
  let offset = 0;
  while (true) {
    const rows = db.prepare(
      `SELECT block_id, position, kind, level, text, digest FROM working_blocks
       WHERE branch_id = ? AND position > ? ORDER BY position LIMIT ?`,
    ).all(branchId, position, MIGRATION_BATCH) as SqlRow[];
    if (rows.length === 0) break;
    for (const row of rows) {
      const blockId = asString(row.block_id);
      position = asNumber(row.position);
      const kind = asString(row.kind) as ManuscriptBlockProjection['kind'];
      const level = row.level === null ? null : asNumber(row.level);
      const text = asString(row.text);
      const digest = asString(row.digest);
      const length = stagedBlockLength(text);
      requireBounded(position === expectedPosition, 'SCHEMA_MIGRATION_FAILED', '工作稿内容块顺序不连续。');
      updateBlock.run(length, branchId, blockId);
      insertOffset.run(branchId, position, appendOffsetSegment(offsetSegments, position, length));
      if (kind === 'title' || kind === 'heading') insertOutline.run(branchId, blockId, position, kind, level ?? 1, text, digest);
      insertSearch.run(branchId, blockId, text);
      offset += length;
      requireBounded(Number.isSafeInteger(offset), 'SCHEMA_MIGRATION_FAILED', '工作稿字符总数无效。');
      expectedPosition += 1;
    }
  }
  db.prepare('UPDATE branch_working_state SET total_graphemes = ? WHERE branch_id = ?').run(offset, branchId);
  requireBounded(expectedPosition > 1, 'SCHEMA_MIGRATION_FAILED', '工作稿缺少内容块。');
  return offset;
}

function snapshotWorkingRevision(
  db: DatabaseSync,
  branchId: string,
  revisionId: string,
  expectedTotal: number,
): void {
  requirePersistedBlockTextBounds(db, 'working_blocks', branchId, 'MILESTONE_INVALID', '工作稿文字超出里程碑快照边界。');
  const insert = db.prepare(
    `INSERT INTO manuscript_block_versions(
       revision_id, block_id, position, kind, level, text, digest, start_offset, grapheme_length
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  let cursor = 0;
  let expectedPosition = 1;
  let offset = 0;
  while (true) {
    const rows = db.prepare(
      `SELECT block_id, position, kind, level, text, digest, grapheme_length
       FROM working_blocks WHERE branch_id = ? AND position > ? ORDER BY position LIMIT ?`,
    ).all(branchId, cursor, MIGRATION_BATCH) as SqlRow[];
    if (rows.length === 0) break;
    for (const row of rows) {
      cursor = asNumber(row.position);
      const kind = asString(row.kind) as ManuscriptBlockProjection['kind'];
      const level = row.level === null ? null : asNumber(row.level);
      const text = asString(row.text);
      const length = stagedBlockLength(text, 'MILESTONE_INVALID', '工作稿文字超出里程碑快照边界。');
      requireBounded(
        cursor === expectedPosition && asNumber(row.grapheme_length) === length &&
          blockDigest(kind, level, text) === asString(row.digest),
        'MILESTONE_INVALID',
        '工作稿内容无法建立精确里程碑修订版。',
      );
      insert.run(revisionId, asString(row.block_id), cursor, kind, level, text, asString(row.digest), offset, length);
      offset += length;
      requireBounded(Number.isSafeInteger(offset), 'MILESTONE_INVALID', '工作稿字符总数无效。');
      expectedPosition += 1;
    }
  }
  requireBounded(
    expectedPosition > 1 && offset === expectedTotal && workingOffsetPrefix(db, branchId, expectedPosition - 1) === offset,
    'MILESTONE_INVALID',
    '工作稿偏移索引与里程碑修订版不一致。',
  );
}

function migrateLegacyJournal(db: DatabaseSync, branchId: string): number {
  const state = one(
    db.prepare('SELECT base_revision_id FROM branch_working_state WHERE branch_id = ?').all(branchId) as SqlRow[],
    'SCHEMA_MIGRATION_FAILED',
    '稿件工作状态缺失。',
  );
  db.exec(`
    CREATE TEMP TABLE IF NOT EXISTS migration_block_state (
      branch_id TEXT NOT NULL,
      block_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      level INTEGER,
      text TEXT NOT NULL,
      digest TEXT NOT NULL,
      PRIMARY KEY(branch_id, block_id)
    ) STRICT;
  `);
  db.prepare('DELETE FROM migration_block_state WHERE branch_id = ?').run(branchId);
  db.prepare(
    `INSERT INTO migration_block_state(branch_id, block_id, kind, level, text, digest)
     SELECT ?, block_id, kind, level, text, digest FROM manuscript_block_versions WHERE revision_id = ?`,
  ).run(branchId, asString(state.base_revision_id));
  let sequence = 0;
  let previousWorkingDigest = stableRevisionWorkingDigest(db, asString(state.base_revision_id));
  while (true) {
    const rows = db.prepare(
      `SELECT journal_entry_id, sequence, block_id, from_grapheme, to_grapheme, insert_text,
              resulting_block_digest, resulting_working_digest, durable_at
       FROM edit_journal_entries WHERE branch_id = ? AND sequence > ? ORDER BY sequence LIMIT ?`,
    ).all(branchId, sequence, MIGRATION_BATCH) as SqlRow[];
    if (rows.length === 0) break;
    for (const row of rows) {
      const groupId = asString(row.journal_entry_id);
      sequence = asNumber(row.sequence);
      const blockId = asString(row.block_id);
      const block = one(db.prepare('SELECT kind, level, text, digest FROM migration_block_state WHERE branch_id = ? AND block_id = ?').all(branchId, blockId) as SqlRow[], 'SCHEMA_MIGRATION_FAILED', '旧修订日志内容块缺失。');
      const beforeText = asString(block.text);
      const parts = graphemes(beforeText);
      const from = asNumber(row.from_grapheme);
      const to = asNumber(row.to_grapheme);
      const afterText = [...parts.slice(0, from), asString(row.insert_text), ...parts.slice(to)].join('');
      const afterDigest = blockDigest(asString(block.kind) as ManuscriptBlockProjection['kind'], block.level === null ? null : asNumber(block.level), afterText);
      requireBounded(afterDigest === asString(row.resulting_block_digest), 'SCHEMA_MIGRATION_FAILED', '旧修订日志无法精确重建。');
      const afterWorkingDigest = asString(row.resulting_working_digest);
      db.prepare(
        `INSERT INTO manuscript_command_groups(
           command_group_id, branch_id, ordinal, kind, status, source_group_id,
           before_working_digest, after_working_digest, created_at
         ) VALUES (?, ?, ?, 'edit', 'applied', NULL, ?, ?, ?)`,
      ).run(groupId, branchId, sequence, previousWorkingDigest, afterWorkingDigest, asString(row.durable_at));
      db.prepare(
        `INSERT INTO manuscript_command_edits(
           command_group_id, position, block_id, before_text, before_digest, after_text, after_digest
         ) VALUES (?, 1, ?, ?, ?, ?, ?)`,
      ).run(groupId, blockId, beforeText, asString(block.digest), afterText, afterDigest);
      db.prepare('UPDATE edit_journal_entries SET command_group_id = ?, command_kind = ? WHERE journal_entry_id = ?').run(groupId, 'edit', groupId);
      db.prepare('UPDATE migration_block_state SET text = ?, digest = ? WHERE branch_id = ? AND block_id = ?').run(afterText, afterDigest, branchId, blockId);
      previousWorkingDigest = afterWorkingDigest;
    }
  }
  db.prepare('DELETE FROM migration_block_state WHERE branch_id = ?').run(branchId);
  return sequence;
}

function legacyHistoryRoot(db: DatabaseSync, branchId: string): { groupId: string; baseRevisionId: string } | undefined {
  const rows = db.prepare(
    `SELECT cg.command_group_id, cg.ordinal, je.base_revision_id
     FROM manuscript_command_groups cg
     JOIN edit_journal_entries je
       ON je.journal_entry_id = cg.command_group_id
      AND je.command_group_id = cg.command_group_id
      AND je.command_kind = 'edit'
     WHERE cg.branch_id = ?
     ORDER BY cg.ordinal
     LIMIT 2`,
  ).all(branchId) as SqlRow[];
  if (rows.length === 0) return undefined;
  const root = rows[0]!;
  requireBounded(asNumber(root.ordinal) === 1, 'SCHEMA_MIGRATION_FAILED', '旧版修订日志首组顺序无效。');
  return { groupId: asString(root.command_group_id), baseRevisionId: asString(root.base_revision_id) };
}

function repairLegacyHistoryRoot(db: DatabaseSync, branchId: string): void {
  const root = legacyHistoryRoot(db, branchId);
  if (!root) return;
  const expected = stableRevisionWorkingDigest(db, root.baseRevisionId);
  requireBounded(
    db.prepare(
      'UPDATE manuscript_command_groups SET before_working_digest = ? WHERE command_group_id = ? AND branch_id = ?',
    ).run(expected, root.groupId, branchId).changes === 1,
    'SCHEMA_MIGRATION_FAILED',
    '旧版修订日志首组摘要无法修复。',
  );
}

function validateLegacyHistoryRoot(db: DatabaseSync, branchId: string): void {
  const root = legacyHistoryRoot(db, branchId);
  if (!root) return;
  const row = one(
    db.prepare('SELECT before_working_digest FROM manuscript_command_groups WHERE command_group_id = ?').all(root.groupId) as SqlRow[],
    'SCHEMA_MIGRATION_FAILED',
    '旧版修订日志首组缺失。',
  );
  requireBounded(
    asString(row.before_working_digest) === stableRevisionWorkingDigest(db, root.baseRevisionId),
    'SCHEMA_MIGRATION_FAILED',
    '旧版修订日志首组工作稿摘要校验失败。',
  );
}

function repairLegacyHistoryRoots(db: DatabaseSync): void {
  forEachSchemaId(db, 'branch_working_state', 'branch_id', (branchId) => repairLegacyHistoryRoot(db, branchId));
}

function validateLegacyHistoryRoots(db: DatabaseSync): void {
  forEachSchemaId(db, 'branch_working_state', 'branch_id', (branchId) => validateLegacyHistoryRoot(db, branchId));
}

function validateCommandHistoryGroup(db: DatabaseSync, groupId: string): void {
  requireBounded(UUID_PATTERN.test(groupId), 'HISTORY_CORRUPT', '历史命令组标识无效。');
  const group = one(
    db.prepare(
      'SELECT branch_id, status, before_working_digest, after_working_digest FROM manuscript_command_groups WHERE command_group_id = ?',
    ).all(groupId) as SqlRow[],
    'HISTORY_CORRUPT',
    '历史命令组缺失。',
  );
  requireBounded(
    UUID_PATTERN.test(asString(group.branch_id)) && DIGEST_PATTERN.test(asString(group.before_working_digest)) &&
      DIGEST_PATTERN.test(asString(group.after_working_digest)),
    'HISTORY_CORRUPT',
    '历史命令组绑定摘要无效。',
  );
  const oversized = db.prepare(
    `SELECT position FROM manuscript_command_edits
     WHERE command_group_id = ? AND (
       typeof(before_text) <> 'text' OR typeof(after_text) <> 'text' OR
       length(CAST(before_text AS BLOB)) > ? OR length(CAST(after_text AS BLOB)) > ?
     ) ORDER BY position LIMIT 1`,
  ).get(groupId, MAX_BLOCK_CODE_UNITS * 3, MAX_BLOCK_CODE_UNITS * 3) as SqlRow | undefined;
  requireBounded(oversized === undefined, 'HISTORY_CORRUPT', '历史命令文字超出有界校验范围。');
  let position = 0;
  let expectedPosition = 1;
  while (true) {
    const rows = db.prepare(
      `SELECT ce.position, ce.block_id, ce.before_text, ce.before_digest, ce.after_text, ce.after_digest,
              wb.kind, wb.level, wb.block_id working_block_id
       FROM manuscript_command_edits ce
       JOIN manuscript_command_groups cg ON cg.command_group_id = ce.command_group_id
       LEFT JOIN working_blocks wb ON wb.branch_id = cg.branch_id AND wb.block_id = ce.block_id
       WHERE ce.command_group_id = ? AND ce.position > ? ORDER BY ce.position LIMIT ?`,
    ).all(groupId, position, HISTORY_BATCH) as SqlRow[];
    if (rows.length === 0) break;
    for (const row of rows) {
      position = asNumber(row.position);
      requireBounded(position === expectedPosition, 'HISTORY_CORRUPT', '历史命令内容块顺序或绑定无效。');
      let kind: ManuscriptBlockProjection['kind'];
      let level: number | null;
      if (typeof row.working_block_id === 'string' && typeof row.kind === 'string') {
        kind = asString(row.kind) as ManuscriptBlockProjection['kind'];
        level = row.level === null ? null : asNumber(row.level);
      } else {
        requireBounded(asString(group.status) === 'superseded', 'HISTORY_CORRUPT', '历史命令内容块顺序或绑定无效。');
        const shapes = db.prepare(
          `SELECT kind, level FROM manuscript_block_versions WHERE block_id = ?
           GROUP BY kind, level ORDER BY kind, level LIMIT 2`,
        ).all(asString(row.block_id)) as SqlRow[];
        requireBounded(shapes.length === 1, 'HISTORY_CORRUPT', '已归档历史命令的内容块结构证据无效。');
        kind = asString(shapes[0]!.kind) as ManuscriptBlockProjection['kind'];
        level = shapes[0]!.level === null ? null : asNumber(shapes[0]!.level);
      }
      const shapeValid =
        (kind === 'title' && level === 1) ||
        (kind === 'heading' && level !== null && Number.isSafeInteger(level) && level >= 1 && level <= 6) ||
        (kind === 'paragraph' && level === null);
      const beforeText = asString(row.before_text);
      const afterText = asString(row.after_text);
      const beforeLength = stagedBlockLength(beforeText, 'HISTORY_CORRUPT', '历史命令文字超出内容块边界。');
      const afterLength = stagedBlockLength(afterText, 'HISTORY_CORRUPT', '历史命令文字超出内容块边界。');
      requireBounded(
        shapeValid && beforeLength <= MAX_BLOCK_GRAPHEMES && afterLength <= MAX_BLOCK_GRAPHEMES &&
          blockDigest(kind, level, beforeText) === asString(row.before_digest) &&
          blockDigest(kind, level, afterText) === asString(row.after_digest),
        'HISTORY_CORRUPT',
        '历史命令的前后文字与摘要不一致。',
      );
      expectedPosition += 1;
    }
  }
  requireBounded(expectedPosition > 1, 'HISTORY_CORRUPT', '历史命令组没有可重放内容。');
}

function validateAllCommandHistory(db: DatabaseSync): void {
  let cursor: string | undefined;
  while (true) {
    const rows = cursor === undefined
      ? db.prepare(
        'SELECT command_group_id FROM manuscript_command_groups ORDER BY command_group_id LIMIT ?',
      ).all(MIGRATION_BATCH) as SqlRow[]
      : db.prepare(
        `SELECT command_group_id FROM manuscript_command_groups
         WHERE command_group_id > ? ORDER BY command_group_id LIMIT ?`,
      ).all(cursor, MIGRATION_BATCH) as SqlRow[];
    if (rows.length === 0) break;
    for (const row of rows) {
      const groupId = asString(row.command_group_id);
      requireBounded(UUID_PATTERN.test(groupId), 'HISTORY_CORRUPT', '历史命令组标识无效。');
      validateCommandHistoryGroup(db, groupId);
      cursor = groupId;
    }
  }
}

function verifyRecoveryJournalReconstruction(
  db: DatabaseSync,
  branchId: string,
  manuscriptId: string,
  checkpointRevisionId: string,
  checkpointSequence: number,
  interruptedLifetimeId: string,
  reconstructionBaseSequence: number,
  reconstructionBaseDigest: string,
  journalSequence: number,
): void {
  requireBounded(
    UUID_PATTERN.test(branchId) && UUID_PATTERN.test(manuscriptId) && UUID_PATTERN.test(checkpointRevisionId) &&
      UUID_PATTERN.test(interruptedLifetimeId) && DIGEST_PATTERN.test(reconstructionBaseDigest) &&
      Number.isSafeInteger(checkpointSequence) && Number.isSafeInteger(reconstructionBaseSequence) &&
      Number.isSafeInteger(journalSequence) && checkpointSequence >= 0 &&
      reconstructionBaseSequence >= checkpointSequence && journalSequence > reconstructionBaseSequence,
    'RECOVERY_CLASSIFICATION_UNCERTAIN',
    '修订日志重建边界无效。',
  );
  const revision = one(db.prepare(
    `SELECT manuscript_id, branch_id, revision_digest FROM manuscript_revisions
     WHERE revision_id = ?`,
  ).all(checkpointRevisionId) as SqlRow[], 'RECOVERY_CLASSIFICATION_UNCERTAIN', '恢复检查点修订版缺失。');
  requireBounded(
    asString(revision.manuscript_id) === manuscriptId && asString(revision.branch_id) === branchId &&
      (reconstructionBaseSequence > checkpointSequence || asString(revision.revision_digest) === reconstructionBaseDigest),
    'RECOVERY_CLASSIFICATION_UNCERTAIN',
    '恢复检查点修订版绑定不一致。',
  );

  let journalCursor = checkpointSequence;
  let chainDigest = reconstructionBaseDigest;
  while (journalCursor < journalSequence) {
    const entries = db.prepare(
      `SELECT sequence, base_revision_id, block_id, resulting_block_digest,
              resulting_working_digest, command_group_id, command_kind, service_lifetime_id
       FROM edit_journal_entries
       WHERE branch_id = ? AND sequence > ? AND sequence <= ?
       ORDER BY sequence LIMIT ?`,
    ).all(branchId, journalCursor, journalSequence, HISTORY_BATCH) as SqlRow[];
    requireBounded(entries.length > 0, 'RECOVERY_CLASSIFICATION_UNCERTAIN', '修订日志序列无法连续重建。');
    for (const entry of entries) {
      const sequence = asNumber(entry.sequence);
      const groupId = asString(entry.command_group_id);
      const action = asString(entry.command_kind) as 'edit' | 'replacement' | 'undo' | 'redo';
      requireBounded(
        sequence === journalCursor + 1 && asString(entry.base_revision_id) === checkpointRevisionId &&
          UUID_PATTERN.test(groupId) && ['edit', 'replacement', 'undo', 'redo'].includes(action),
        'RECOVERY_CLASSIFICATION_UNCERTAIN',
        '修订日志的顺序或命令绑定无法精确重建。',
      );
      const evidenceDigest = recoveryCommandEvidenceDigest(db, groupId);
      const group = one(db.prepare(
        `SELECT branch_id, before_working_digest, after_working_digest
         FROM manuscript_command_groups WHERE command_group_id = ?`,
      ).all(groupId) as SqlRow[], 'RECOVERY_CLASSIFICATION_UNCERTAIN', '修订日志命令组缺失。');
      const representative = one(db.prepare(
        `SELECT block_id, before_digest, after_digest FROM manuscript_command_edits
         WHERE command_group_id = ? ORDER BY position LIMIT 1`,
      ).all(groupId) as SqlRow[], 'RECOVERY_CLASSIFICATION_UNCERTAIN', '修订日志命令证据为空。');
      const representativeDigest = action === 'undo'
        ? asString(representative.before_digest)
        : asString(representative.after_digest);
      requireBounded(
        asString(group.branch_id) === branchId && asString(representative.block_id) === asString(entry.block_id) &&
          representativeDigest === asString(entry.resulting_block_digest),
        'RECOVERY_CLASSIFICATION_UNCERTAIN',
        '修订日志代表内容块证据不一致。',
      );
      if (sequence === reconstructionBaseSequence) {
        requireBounded(
          asString(entry.resulting_working_digest) === reconstructionBaseDigest,
          'RECOVERY_CLASSIFICATION_UNCERTAIN',
          '恢复重建起点摘要不一致。',
        );
      } else if (sequence > reconstructionBaseSequence) {
        requireBounded(
          entry.service_lifetime_id !== null && asString(entry.service_lifetime_id) === interruptedLifetimeId,
          'RECOVERY_CLASSIFICATION_UNCERTAIN',
          '恢复修订日志不属于精确中断生命周期。',
        );
        const recomputed = recoveryWorkingDigest(chainDigest, sequence, action, groupId, evidenceDigest);
        requireBounded(
          recomputed === asString(entry.resulting_working_digest) &&
            ((action === 'edit' || action === 'replacement')
              ? asString(group.before_working_digest) === chainDigest && asString(group.after_working_digest) === recomputed
              : true),
          'RECOVERY_CLASSIFICATION_UNCERTAIN',
          '修订日志的工作状态链无法从不可变命令证据独立重算。',
        );
        chainDigest = recomputed;
      }
      journalCursor = sequence;
    }
  }
  requireBounded(
    journalCursor === journalSequence && chainDigest === asString(one(db.prepare(
      'SELECT working_digest FROM branch_working_state WHERE branch_id = ?',
    ).all(branchId) as SqlRow[], 'RECOVERY_CLASSIFICATION_UNCERTAIN', '恢复工作状态缺失。').working_digest),
    'RECOVERY_CLASSIFICATION_UNCERTAIN',
    '修订日志链与最近持久工作状态不一致。',
  );

  const checkpointInventory = one(db.prepare(
    'SELECT count(*) total, coalesce(max(position), 0) maximum FROM manuscript_block_versions WHERE revision_id = ?',
  ).all(checkpointRevisionId) as SqlRow[], 'RECOVERY_CLASSIFICATION_UNCERTAIN', '恢复检查点清单缺失。');
  const workingInventory = one(db.prepare(
    'SELECT count(*) total, coalesce(max(position), 0) maximum FROM working_blocks WHERE branch_id = ?',
  ).all(branchId) as SqlRow[], 'RECOVERY_CLASSIFICATION_UNCERTAIN', '恢复工作状态清单缺失。');
  requireBounded(
    asNumber(checkpointInventory.total) > 0 &&
      asNumber(checkpointInventory.total) === asNumber(checkpointInventory.maximum) &&
      asNumber(checkpointInventory.total) === asNumber(workingInventory.total) &&
      asNumber(workingInventory.total) === asNumber(workingInventory.maximum),
    'RECOVERY_CLASSIFICATION_UNCERTAIN',
    '恢复检查点与工作状态的内容块清单不一致。',
  );
  let blockCursor = 0;
  while (true) {
    const blocks = db.prepare(
      `SELECT block_id, position, kind, level, text, digest, grapheme_length
       FROM manuscript_block_versions
       WHERE revision_id = ? AND position > ? ORDER BY position LIMIT ?`,
    ).all(checkpointRevisionId, blockCursor, MIGRATION_BATCH) as SqlRow[];
    if (blocks.length === 0) break;
    for (const block of blocks) {
      blockCursor = asNumber(block.position);
      const blockId = asString(block.block_id);
      const kind = asString(block.kind) as ManuscriptBlockProjection['kind'];
      const level = block.level === null ? null : asNumber(block.level);
      let content = asString(block.text);
      let digest = asString(block.digest);
      requireBounded(
        blockCursor > 0 && stagedBlockLength(content, 'RECOVERY_CLASSIFICATION_UNCERTAIN', '恢复检查点文字超出有界范围。') === asNumber(block.grapheme_length) &&
          blockDigest(kind, level, content) === digest,
        'RECOVERY_CLASSIFICATION_UNCERTAIN',
        '恢复检查点内容块无效。',
      );
      let editSequence = checkpointSequence;
      while (editSequence < journalSequence) {
        const edits = db.prepare(
          `SELECT e.sequence, e.command_kind, ce.before_text, ce.before_digest, ce.after_text, ce.after_digest
           FROM edit_journal_entries e
           JOIN manuscript_command_edits ce ON ce.command_group_id = e.command_group_id AND ce.block_id = ?
           WHERE e.branch_id = ? AND e.sequence > ? AND e.sequence <= ?
           ORDER BY e.sequence LIMIT ?`,
        ).all(blockId, branchId, editSequence, journalSequence, HISTORY_BATCH) as SqlRow[];
        if (edits.length === 0) break;
        for (const edit of edits) {
          editSequence = asNumber(edit.sequence);
          const action = asString(edit.command_kind);
          const expectedText = action === 'undo' ? asString(edit.after_text) : asString(edit.before_text);
          const expectedDigest = action === 'undo' ? asString(edit.after_digest) : asString(edit.before_digest);
          const targetText = action === 'undo' ? asString(edit.before_text) : asString(edit.after_text);
          const targetDigest = action === 'undo' ? asString(edit.before_digest) : asString(edit.after_digest);
          requireBounded(
            content === expectedText && digest === expectedDigest && blockDigest(kind, level, targetText) === targetDigest,
            'RECOVERY_CLASSIFICATION_UNCERTAIN',
            '修订日志内容块无法从检查点精确重放。',
          );
          content = targetText;
          digest = targetDigest;
        }
      }
      const current = one(db.prepare(
        `SELECT block_id, kind, level, text, digest, grapheme_length
         FROM working_blocks WHERE branch_id = ? AND position = ?`,
      ).all(branchId, blockCursor) as SqlRow[], 'RECOVERY_CLASSIFICATION_UNCERTAIN', '持久工作内容块缺失。');
      requireBounded(
        asString(current.block_id) === blockId && asString(current.kind) === kind &&
          (current.level === null ? null : asNumber(current.level)) === level &&
          asString(current.text) === content && asString(current.digest) === digest &&
          asNumber(current.grapheme_length) === stagedBlockLength(content, 'RECOVERY_CLASSIFICATION_UNCERTAIN', '恢复工作文字超出有界范围。'),
        'RECOVERY_CLASSIFICATION_UNCERTAIN',
        '修订日志重建结果与持久工作状态不一致。',
      );
    }
  }
}

function validateRecoveryTruth(db: DatabaseSync): void {
  const invalidLifetime = db.prepare(
    `SELECT lifetime_id FROM service_lifetimes
     WHERE (outcome = 'running' AND ended_at IS NOT NULL)
        OR (outcome IN ('clean', 'interrupted') AND ended_at IS NULL)
     LIMIT 1`,
  ).get() as SqlRow | undefined;
  requireBounded(invalidLifetime === undefined, 'SCHEMA_MIGRATION_FAILED', '服务生命周期事实不完整。');
  const invalidWrite = db.prepare(
    `SELECT lw.lifetime_id FROM service_lifetime_branch_writes lw
     LEFT JOIN edit_journal_entries e ON e.branch_id = lw.branch_id
       AND e.service_lifetime_id = lw.lifetime_id AND e.sequence = lw.high_water_sequence
     WHERE e.journal_entry_id IS NULL OR e.resulting_working_digest != lw.high_water_digest
       OR lw.reconstruction_base_sequence < lw.checkpoint_sequence
       OR lw.high_water_sequence <= lw.reconstruction_base_sequence
       OR lw.entry_count != lw.high_water_sequence - lw.reconstruction_base_sequence
       OR (SELECT count(*) FROM edit_journal_entries counted
           WHERE counted.branch_id = lw.branch_id AND counted.service_lifetime_id = lw.lifetime_id
             AND counted.sequence > lw.reconstruction_base_sequence) != lw.entry_count
     LIMIT 1`,
  ).get() as SqlRow | undefined;
  requireBounded(invalidWrite === undefined, 'SCHEMA_MIGRATION_FAILED', '服务生命周期修订日志高水位事实不完整。');
  const orphanJournal = db.prepare(
    `SELECT e.journal_entry_id FROM edit_journal_entries e
     LEFT JOIN service_lifetimes sl ON sl.lifetime_id = e.service_lifetime_id
     LEFT JOIN service_lifetime_branch_writes lw ON lw.lifetime_id = e.service_lifetime_id
       AND lw.branch_id = e.branch_id
     WHERE e.service_lifetime_id IS NOT NULL
       AND (sl.lifetime_id IS NULL OR lw.lifetime_id IS NULL OR e.sequence > lw.high_water_sequence)
     LIMIT 1`,
  ).get() as SqlRow | undefined;
  requireBounded(orphanJournal === undefined, 'SCHEMA_MIGRATION_FAILED', '修订日志生命周期绑定不完整。');
  const invalidAttention = db.prepare(
    `SELECT ra.attention_id FROM recovery_attention ra
     JOIN branch_working_state bws ON bws.branch_id = ra.branch_id
     WHERE ra.status IN ('pending', 'deferred') AND (
       ra.manuscript_id != bws.manuscript_id OR ra.journal_sequence != bws.journal_sequence
       OR ra.journal_working_digest != bws.working_digest
     ) LIMIT 1`,
  ).get() as SqlRow | undefined;
  requireBounded(invalidAttention === undefined, 'SCHEMA_MIGRATION_FAILED', '恢复待确认状态与稿件工作状态不一致。');
}

function createMilestoneSignoffTable(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS milestone_signoff_records (
      signoff_record_id TEXT PRIMARY KEY,
      milestone_id TEXT NOT NULL UNIQUE REFERENCES milestone_versions(milestone_id),
      manuscript_id TEXT NOT NULL REFERENCES manuscripts(manuscript_id),
      branch_id TEXT NOT NULL REFERENCES manuscript_branches(branch_id),
      revision_id TEXT NOT NULL REFERENCES manuscript_revisions(revision_id),
      workflow_instance_id TEXT NOT NULL REFERENCES workflow_instances(workflow_instance_id),
      workflow_evidence_digest TEXT NOT NULL CHECK(length(workflow_evidence_digest) = 64),
      actor TEXT NOT NULL CHECK(actor = '本机编辑'),
      signed_at TEXT NOT NULL,
      label TEXT NOT NULL,
      stated_next_use TEXT NOT NULL
    ) STRICT;
  `);
}

function createWorkingOffsetTable(db: DatabaseSync): void {
  db.exec(V6_TARGET_SCHEMA_SQL.working_offset_nodes);
}

function migrateEditorSchemaV6ToV7(db: DatabaseSync): void {
  requireV6TargetSchema(db);
  transact(db, () => {
    db.exec(`
      ALTER TABLE branch_working_state
        ADD COLUMN history_boundary_sequence INTEGER NOT NULL DEFAULT 0 CHECK(history_boundary_sequence >= 0);
      ALTER TABLE edit_journal_entries ADD COLUMN service_lifetime_id TEXT;

      ${RECOVERY_SCHEMA_SQL.service_lifetimes};
      ${RECOVERY_SCHEMA_SQL.service_lifetime_branch_writes};
      ${RECOVERY_SCHEMA_SQL.recovery_snapshots};
      ${RECOVERY_SCHEMA_SQL.recovery_attention};
      ${RECOVERY_SCHEMA_SQL.recovery_restore_stages};
      ${RECOVERY_SCHEMA_SQL.recovery_restore_stage_blocks};
      ${RECOVERY_SCHEMA_SQL.recovery_decisions};
      ${RECOVERY_SCHEMA_SQL.recovery_restorations};
      ${RECOVERY_SCHEMA_SQL.manuscript_recovery_review_status};

      ${TARGET_INDEX_SQL.lifetime_outcome_order};
      ${TARGET_INDEX_SQL.recovery_attention_startup};
      ${TARGET_INDEX_SQL.recovery_snapshot_branch};
      PRAGMA user_version = ${RECOVERY_SCHEMA_VERSION};
    `);
  });
  requireV7TargetSchema(db);
}

function migrateRecoverySchemaV7ToV8(db: DatabaseSync, profile: BuiltInWorkflowProfile): void {
  requireV7TargetSchema(db);
  const legacyProfiles = db.prepare(
    `SELECT profile_id, profile_version, profile_name, profile_digest, definition_json
     FROM workflow_profiles ORDER BY profile_id, profile_version`,
  ).all() as SqlRow[];
  requireBounded(
    legacyProfiles.length <= 1 && legacyProfiles.every((row) =>
      asString(row.profile_id) === profile.legacy.id &&
      asString(row.profile_version) === profile.legacy.version &&
      asString(row.profile_name) === profile.legacy.name &&
      asString(row.profile_digest) === profile.legacy.digest &&
      asString(row.definition_json) === profile.legacy.definitionJson),
    'SCHEMA_MIGRATION_FAILED',
    '旧版工作流配置无法精确映射到内置原生 DSH Profile。',
  );
  const legacyInstances = db.prepare(
    `SELECT workflow_instance_id, profile_id, profile_version, current_phase, state
     FROM workflow_instances ORDER BY workflow_instance_id`,
  ).all() as SqlRow[];
  const legacyPhaseLabels = new Set<string>(profile.projection.phases.map((phase) => phase.label));
  requireBounded(
    legacyInstances.every((row) =>
      legacyProfiles.length === 1 &&
      asString(row.profile_id) === profile.legacy.id &&
      asString(row.profile_version) === profile.legacy.version &&
      legacyPhaseLabels.has(asString(row.current_phase)) &&
      asString(row.state) === 'active'),
    'SCHEMA_MIGRATION_FAILED',
    '旧版工作流实例无法精确映射到内置原生 DSH Profile。',
  );

  const legacyAlterTable = asNumber(one(
    db.prepare('PRAGMA legacy_alter_table').all() as SqlRow[],
    'SCHEMA_INVALID',
    '无法读取旧式改表状态。',
  ).legacy_alter_table);
  db.exec('PRAGMA foreign_keys = OFF; PRAGMA legacy_alter_table = OFF');
  let migrationError: unknown;
  try {
    db.exec('BEGIN IMMEDIATE');
    const disabledForeignKeys = one(
      db.prepare('PRAGMA foreign_keys').all() as SqlRow[],
      'SCHEMA_INVALID',
      '无法读取引用校验状态。',
    );
    requireBounded(
      asNumber(disabledForeignKeys.foreign_keys) === 0,
      'SCHEMA_INVALID',
      '无法暂时停用引用校验以迁移数据库。',
    );
    const modernAlterTable = one(
      db.prepare('PRAGMA legacy_alter_table').all() as SqlRow[],
      'SCHEMA_INVALID',
      '无法读取改表语义。',
    );
    requireBounded(
      asNumber(modernAlterTable.legacy_alter_table) === 0,
      'SCHEMA_INVALID',
      '无法启用可校验的改表语义。',
    );
    db.exec(`
      ALTER TABLE books ADD COLUMN internal_number TEXT;
      ALTER TABLE import_drafts ADD COLUMN reviewed_target_kind TEXT
        CHECK(reviewed_target_kind IS NULL OR reviewed_target_kind IN ('new-book', 'existing-book'));
      ALTER TABLE import_drafts ADD COLUMN reviewed_existing_book_id TEXT REFERENCES books(book_id);
      ALTER TABLE import_drafts ADD COLUMN reviewed_relationship TEXT
        CHECK(reviewed_relationship IS NULL OR reviewed_relationship IN ('new-book-first-manuscript', 'first-manuscript'));
      ALTER TABLE import_drafts ADD COLUMN reviewed_book_state_digest TEXT
        CHECK(reviewed_book_state_digest IS NULL OR length(reviewed_book_state_digest) = 64);
      UPDATE import_drafts
      SET reviewed_target_kind = 'new-book', reviewed_relationship = 'new-book-first-manuscript'
      WHERE state IN ('reviewed', 'committed');
      ${TARGET_INDEX_SQL.book_internal_number_unique};

      CREATE TABLE workflow_profiles_v8 (
        profile_id TEXT NOT NULL,
        profile_version TEXT NOT NULL,
        profile_name TEXT NOT NULL,
        profile_digest TEXT NOT NULL CHECK(length(profile_digest) = 64),
        projection_schema TEXT NOT NULL CHECK(projection_schema = 'ai7.workflow-profile-projection/1'),
        projection_json TEXT NOT NULL,
        native_profile_id TEXT NOT NULL,
        native_profile_version TEXT NOT NULL,
        native_profile_digest TEXT NOT NULL CHECK(length(native_profile_digest) = 64),
        PRIMARY KEY(profile_id, profile_version)
      ) STRICT;
      CREATE TABLE workflow_instances_v8 (
        workflow_instance_id TEXT PRIMARY KEY,
        book_id TEXT NOT NULL REFERENCES books(book_id),
        manuscript_id TEXT NOT NULL UNIQUE REFERENCES manuscripts(manuscript_id),
        profile_id TEXT NOT NULL,
        profile_version TEXT NOT NULL,
        profile_digest TEXT NOT NULL CHECK(length(profile_digest) = 64),
        native_profile_id TEXT NOT NULL,
        native_profile_version TEXT NOT NULL,
        native_profile_digest TEXT NOT NULL CHECK(length(native_profile_digest) = 64),
        current_phase TEXT NOT NULL,
        state TEXT NOT NULL CHECK(state = 'active'),
        created_at TEXT NOT NULL,
        FOREIGN KEY(profile_id, profile_version) REFERENCES workflow_profiles_v8(profile_id, profile_version)
      ) STRICT;
    `);
    if (legacyProfiles.length === 1) {
      db.prepare(
        `INSERT INTO workflow_profiles_v8(
          profile_id, profile_version, profile_name, profile_digest, projection_schema, projection_json,
          native_profile_id, native_profile_version, native_profile_digest
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        profile.projection.id,
        profile.projection.version,
        profile.projection.name,
        profile.projection.digest,
        profile.projection.schema,
        canonicalJson({
          schema: profile.projection.schema,
          id: profile.projection.id,
          name: profile.projection.name,
          version: profile.projection.version,
          phases: profile.projection.phases,
          gates: profile.projection.gates,
        }),
        profile.native.id,
        profile.native.version,
        profile.native.digest,
      );
      db.prepare(
        `INSERT INTO workflow_instances_v8(
          workflow_instance_id, book_id, manuscript_id, profile_id, profile_version, profile_digest,
          native_profile_id, native_profile_version, native_profile_digest, current_phase, state, created_at
        )
        SELECT workflow_instance_id, book_id, manuscript_id, ?, ?, ?, ?, ?, ?, current_phase, state, created_at
        FROM workflow_instances`,
      ).run(
        profile.projection.id,
        profile.projection.version,
        profile.projection.digest,
        profile.native.id,
        profile.native.version,
        profile.native.digest,
      );
    }
    db.exec(`
      DROP TABLE workflow_instances;
      DROP TABLE workflow_profiles;
      ALTER TABLE workflow_profiles_v8 RENAME TO workflow_profiles;
      ALTER TABLE workflow_instances_v8 RENAME TO workflow_instances;
      PRAGMA user_version = ${SCHEMA_VERSION};
    `);
    const violations = db.prepare('PRAGMA foreign_key_check').all();
    requireBounded(violations.length === 0, 'SCHEMA_MIGRATION_FAILED', '数据库迁移后的引用校验失败。');
    validateWorkflowSemanticTruth(db, profile);
    validateImportDraftTargetTruth(db);
    db.exec('COMMIT');
  } catch (error) {
    migrationError = error;
    try {
      db.exec('ROLLBACK');
    } catch (rollbackError) {
      migrationError = new AggregateError([error, rollbackError], 'SQLite workflow profile migration rollback failed.');
    }
  } finally {
    try {
      db.exec(`PRAGMA legacy_alter_table = ${legacyAlterTable}`);
      const restoredLegacyAlterTable = one(
        db.prepare('PRAGMA legacy_alter_table').all() as SqlRow[],
        'SCHEMA_INVALID',
        '无法读取旧式改表状态。',
      );
      requireBounded(
        asNumber(restoredLegacyAlterTable.legacy_alter_table) === legacyAlterTable,
        'SCHEMA_INVALID',
        '无法恢复旧式改表状态。',
      );
      db.exec('PRAGMA foreign_keys = ON');
      const restoredForeignKeys = one(
        db.prepare('PRAGMA foreign_keys').all() as SqlRow[],
        'SCHEMA_INVALID',
        '无法读取引用校验状态。',
      );
      requireBounded(asNumber(restoredForeignKeys.foreign_keys) === 1, 'SCHEMA_INVALID', '无法恢复引用校验。');
    } catch (restoreError) {
      migrationError = migrationError
        ? new AggregateError([migrationError, restoreError], 'SQLite workflow profile migration and foreign-key restoration failed.')
        : restoreError;
    }
  }
  if (migrationError) throw migrationError;
  requireTargetSchema(db);
}

export function validateSourceImportSchemaTruth(db: DatabaseSync, profile: BuiltInWorkflowProfile): void {
  requireSourceImportTargetSchema(db);
  validateSchemaAuthorityIds(db);
  validateWorkflowSemanticTruth(db, profile);
  validateSourceImportDraftTargetTruth(db);
  validateSourceImportRecordTruth(db);
  validateAllDerivedOffsets(db);
  validateLegacyHistoryRoots(db);
  validateAllCommandHistory(db);
  validateMilestoneSignoffTruth(db);
  validateRecoveryTruth(db);
  const violations = db.prepare('PRAGMA foreign_key_check').all();
  requireBounded(violations.length === 0, 'SCHEMA_MIGRATION_FAILED', '数据库引用校验失败。');
}

function validateManuscriptReimportTruth(db: DatabaseSync): void {
  const invalidDraft = db.prepare(
    `SELECT d.draft_id
     FROM import_drafts d
     LEFT JOIN manuscript_reimport_comparisons c ON c.draft_id = d.draft_id
     WHERE (d.reviewed_relationship = 'reimport' AND (
       d.state NOT IN ('reviewed', 'committed') OR d.reviewed_target_kind != 'existing-book'
       OR d.reviewed_existing_book_id IS NULL OR d.reviewed_book_state_digest IS NULL
       OR d.reviewed_lineage_status NOT IN ('verified', 'unconfirmed')
       OR d.reviewed_checkpoint_revision_id IS NULL OR d.reviewed_manuscript_id IS NULL
       OR d.reviewed_branch_id IS NULL OR c.comparison_id IS NULL
       OR c.manuscript_id != d.reviewed_manuscript_id OR c.branch_id != d.reviewed_branch_id
       OR c.checkpoint_revision_id != d.reviewed_checkpoint_revision_id
       OR c.lineage_status != d.reviewed_lineage_status
       OR NOT (c.lineage_source_version_id IS d.reviewed_lineage_source_version_id)
     )) OR (d.reviewed_relationship IS NOT 'reimport' AND (
       d.reviewed_lineage_status IS NOT NULL OR d.reviewed_lineage_source_version_id IS NOT NULL
       OR d.reviewed_checkpoint_revision_id IS NOT NULL OR d.reviewed_manuscript_id IS NOT NULL
       OR d.reviewed_branch_id IS NOT NULL OR c.comparison_id IS NOT NULL
     ))
     LIMIT 1`,
  ).get() as SqlRow | undefined;
  requireBounded(invalidDraft === undefined, 'SCHEMA_INVALID', '稿件重新导入草稿事实不完整。');

  const invalidComparison = db.prepare(
    `SELECT c.comparison_id
     FROM manuscript_reimport_comparisons c
     JOIN manuscripts m ON m.manuscript_id = c.manuscript_id
     JOIN manuscript_branches mb ON mb.branch_id = c.branch_id
     JOIN manuscript_revisions checkpoint ON checkpoint.revision_id = c.checkpoint_revision_id
    LEFT JOIN manuscript_revisions lineage ON lineage.revision_id = c.lineage_revision_id
    LEFT JOIN source_versions lsv ON lsv.source_version_id = c.lineage_source_version_id
    LEFT JOIN staged_import_snapshots ss ON ss.draft_id = c.draft_id
    LEFT JOIN manuscript_reimport_records rr ON rr.comparison_id = c.comparison_id
    LEFT JOIN source_versions rsv ON rsv.source_version_id = rr.source_version_id
     WHERE mb.manuscript_id != c.manuscript_id OR checkpoint.manuscript_id != c.manuscript_id
       OR checkpoint.branch_id != c.branch_id OR m.book_id != lsv.book_id
       OR (c.lineage_status = 'verified' AND (
         lineage.manuscript_id != c.manuscript_id
       )) OR COALESCE(ss.source_digest, rsv.source_digest) != c.staged_source_digest
       OR COALESCE(ss.content_digest, rsv.content_digest) != c.staged_content_digest
       OR COALESCE(ss.structure_digest, rsv.structure_digest) != c.staged_structure_digest
       OR COALESCE(ss.parser_identity, rsv.parser_identity) != c.staged_parser_identity
     LIMIT 1`,
  ).get() as SqlRow | undefined;
  requireBounded(invalidComparison === undefined, 'SCHEMA_INVALID', '稿件重新导入比较绑定无效。');

  let comparisonCursor: string | undefined;
  while (true) {
    const comparisons = comparisonCursor === undefined
      ? db.prepare(
        `SELECT c.*, m.book_id, checkpoint.revision_label actual_checkpoint_label,
                checkpoint.revision_digest actual_checkpoint_digest,
                lineage.revision_digest actual_lineage_digest
         FROM manuscript_reimport_comparisons c
         JOIN manuscripts m ON m.manuscript_id = c.manuscript_id
         JOIN manuscript_revisions checkpoint ON checkpoint.revision_id = c.checkpoint_revision_id
         LEFT JOIN manuscript_revisions lineage ON lineage.revision_id = c.lineage_revision_id
         ORDER BY c.comparison_id LIMIT 64`,
      ).all() as SqlRow[]
      : db.prepare(
        `SELECT c.*, m.book_id, checkpoint.revision_label actual_checkpoint_label,
                checkpoint.revision_digest actual_checkpoint_digest,
                lineage.revision_digest actual_lineage_digest
         FROM manuscript_reimport_comparisons c
         JOIN manuscripts m ON m.manuscript_id = c.manuscript_id
         JOIN manuscript_revisions checkpoint ON checkpoint.revision_id = c.checkpoint_revision_id
         LEFT JOIN manuscript_revisions lineage ON lineage.revision_id = c.lineage_revision_id
         WHERE c.comparison_id > ? ORDER BY c.comparison_id LIMIT 64`,
      ).all(comparisonCursor) as SqlRow[];
    if (comparisons.length === 0) break;
    for (const comparison of comparisons) {
      const comparisonId = asString(comparison.comparison_id);
      const draftId = asString(comparison.draft_id);
      requireBounded(
        asString(comparison.checkpoint_revision_label) === asString(comparison.actual_checkpoint_label) &&
          asString(comparison.checkpoint_revision_digest) === asString(comparison.actual_checkpoint_digest) &&
          (comparison.lineage_status === 'verified'
            ? comparison.lineage_revision_digest !== null && comparison.actual_lineage_digest !== null &&
              asString(comparison.lineage_revision_digest) === asString(comparison.actual_lineage_digest)
            : comparison.lineage_revision_digest === null),
        'SCHEMA_INVALID',
        '稿件重新导入固定点或来源修订版摘要绑定无效。',
      );
      if (comparison.lineage_status === 'verified') {
        const exactLineage = db.prepare(
          `SELECT 1 valid FROM (
             SELECT mir.resulting_revision_id revision_id, mir.imported_at, mir.import_record_id record_id
             FROM manuscript_import_records mir
             WHERE mir.book_id = ? AND mir.manuscript_id = ? AND mir.source_version_id = ?
             UNION ALL
             SELECT CASE rr.result_kind WHEN 'changed' THEN rr.resulting_revision_id ELSE rr.previous_revision_id END revision_id,
                    rr.imported_at, rr.reimport_record_id record_id
             FROM manuscript_reimport_records rr
             WHERE rr.book_id = ? AND rr.manuscript_id = ? AND rr.source_version_id = ?
               AND ((rr.result_kind = 'changed' AND rr.resulting_revision_id IS NOT NULL)
                 OR rr.result_kind = 'no-change')
           ) WHERE revision_id = ? LIMIT 1`,
        ).get(
          asString(comparison.book_id), asString(comparison.manuscript_id),
          asString(comparison.lineage_source_version_id), asString(comparison.book_id),
          asString(comparison.manuscript_id), asString(comparison.lineage_source_version_id),
          asString(comparison.lineage_revision_id),
        ) as SqlRow | undefined;
        requireBounded(exactLineage !== undefined,
        'SCHEMA_INVALID', '稿件重新导入来源修订版没有同图书主稿件记录证明。');
      }
      const checkpoint = {
        bookId: asString(comparison.book_id),
        manuscriptId: asString(comparison.manuscript_id),
        branchId: asString(comparison.branch_id),
        revisionId: asString(comparison.checkpoint_revision_id),
        revisionLabel: asString(comparison.checkpoint_revision_label),
        revisionDigest: asString(comparison.checkpoint_revision_digest),
        journalSequence: asNumber(comparison.checkpoint_journal_sequence),
        createdForDirtyJournal: asNumber(comparison.checkpoint_created_for_dirty_journal) === 1,
      };
      const lineage = comparison.lineage_status === 'verified'
        ? {
            status: 'verified',
            sourceVersionId: asString(comparison.lineage_source_version_id),
            revisionId: asString(comparison.lineage_revision_id),
            comparisonKind: 'three-way',
          }
        : { status: 'unconfirmed', sourceVersionId: null, revisionId: null, comparisonKind: 'two-way' };
      const comparisonHash = createHash('sha256');
      comparisonHash.update(canonicalJson({
        schema: 'ai7.manuscript-reimport-comparison/2',
        draftId,
        manuscriptId: asString(comparison.manuscript_id),
        branchId: asString(comparison.branch_id),
        checkpoint,
        lineage,
      }));
      const resolutionHash = createHash('sha256');
      resolutionHash.update(canonicalJson({ schema: 'ai7.manuscript-reimport-resolutions/2' }));
      let mappingCursor = 0;
      let expectedPosition = 1;
      let changed = false;
      let stagedCount = 0;
      let currentCount = 0;
      let finalBlockCount = 0;
      let unresolvedCount = 0;
      let resolvedChangedCount = 0;
      const duplicateAuthorityFact = db.prepare(
        `SELECT 1 invalid FROM manuscript_reimport_mappings
         WHERE comparison_id = ? AND (
           current_block_id IN (
             SELECT current_block_id FROM manuscript_reimport_mappings
             WHERE comparison_id = ? AND current_block_id IS NOT NULL
             GROUP BY current_block_id HAVING count(*) != 1
           ) OR staged_block_id IN (
             SELECT staged_block_id FROM manuscript_reimport_mappings
             WHERE comparison_id = ? AND staged_block_id IS NOT NULL
             GROUP BY staged_block_id HAVING count(*) != 1
           )
         ) LIMIT 1`,
      ).get(comparisonId, comparisonId, comparisonId) as SqlRow | undefined;
      requireBounded(duplicateAuthorityFact === undefined, 'SCHEMA_INVALID',
        '稿件重新导入当前或暂存块映射重复。');
      const committedResult = db.prepare(
        `SELECT result_kind, previous_revision_id, resulting_revision_id
         FROM manuscript_reimport_records WHERE comparison_id = ?`,
      ).get(comparisonId) as SqlRow | undefined;
      const committedRevisionId = committedResult === undefined
        ? null
        : committedResult.result_kind === 'changed'
          ? asString(committedResult.resulting_revision_id)
          : asString(committedResult.previous_revision_id);
      while (true) {
        const mappings = db.prepare(
          `SELECT m.*, r.resolution, r.resolved_current_block_id,
                  r.comparison_id resolution_comparison_id,
                  claimed.mapping_id claimed_mapping_id, claimed.resolution claimed_resolution
           FROM manuscript_reimport_mappings m
           LEFT JOIN manuscript_reimport_mapping_resolutions r ON r.mapping_id = m.mapping_id
           LEFT JOIN manuscript_reimport_mapping_resolutions claimed
             ON claimed.comparison_id = m.comparison_id
            AND claimed.resolved_current_block_id = m.current_block_id
           WHERE m.comparison_id = ? AND m.position > ? ORDER BY m.position LIMIT 64`,
        ).all(comparisonId, mappingCursor) as SqlRow[];
        if (mappings.length === 0) break;
        for (const mapping of mappings) {
          const position = asNumber(mapping.position);
          requireBounded(position === expectedPosition, 'SCHEMA_INVALID', '稿件重新导入映射顺序不连续。');
          const fact = (prefix: 'current' | 'lineage' | 'staged') => {
            const blockId = mapping[`${prefix}_block_id`];
            if (blockId === null) return null;
            const kind = asString(mapping[`${prefix}_kind`]) as ManuscriptBlockProjection['kind'];
            const level = mapping[`${prefix}_level`] === null ? null : asNumber(mapping[`${prefix}_level`]);
            const text = asString(mapping[`${prefix}_text`]);
            const digest = asString(mapping[`${prefix}_digest`]);
            requireBounded(blockDigest(kind, level, text) === digest, 'SCHEMA_INVALID', '稿件重新导入块摘要无效。');
            return { blockId: asString(blockId), position: asNumber(mapping[`${prefix}_position`]), kind, level, text, digest };
          };
          const current = fact('current');
          const lineageFact = fact('lineage');
          const staged = fact('staged');
          const changeKind = asString(mapping.change_kind);
          const exact = mapping.identity_consequence === 'preserve-current-identity';
          let resolvedChanged: number | null = null;
          if (current !== null) currentCount += 1;
          requireBounded(
            (current === null) === (mapping.current_revision_id === null) &&
              (lineageFact === null) === (mapping.lineage_revision_id === null) &&
              (staged === null) === (mapping.staged_draft_id === null) &&
              (current === null || mapping.current_revision_id === comparison.checkpoint_revision_id) &&
              (lineageFact === null || mapping.lineage_revision_id === comparison.lineage_revision_id) &&
              (staged === null || mapping.staged_draft_id === draftId) &&
              ((changeKind === 'unchanged' && exact && current !== null && staged !== null &&
                current.position === staged.position) ||
               (changeKind === 'move' && exact && current !== null && staged !== null &&
                current.position !== staged.position) ||
               (changeKind === 'edit' && !exact && current !== null && staged !== null) ||
               (changeKind === 'insert' && !exact && current === null && staged !== null) ||
               (changeKind === 'delete' && !exact && current !== null && staged === null)),
            'SCHEMA_INVALID',
            '稿件重新导入映射身份或权威绑定无效。',
          );
          const resolution = mapping.resolution === null ? null : asString(mapping.resolution);
          const resolvedCurrentBlockId = mapping.resolved_current_block_id === null
            ? null
            : asString(mapping.resolved_current_block_id);
          requireBounded(
            exact
              ? resolution === null && mapping.claimed_mapping_id === null
              : resolution === null || (
                  mapping.resolution_comparison_id === comparisonId && (
                    (resolution === 'preserve-current-identity' && resolvedCurrentBlockId !== null &&
                      ((changeKind === 'edit' && current?.blockId === resolvedCurrentBlockId) ||
                       (changeKind === 'insert' && current === null && db.prepare(
                         `SELECT 1 valid FROM manuscript_reimport_mappings
                          WHERE comparison_id = ? AND change_kind = 'delete' AND current_block_id = ? LIMIT 1`,
                       ).get(comparisonId, resolvedCurrentBlockId) !== undefined))) ||
                    (resolution === 'create-new-identity' && resolvedCurrentBlockId === null &&
                      (changeKind === 'insert' || changeKind === 'edit')) ||
                    (resolution === 'retire-current-identity' && resolvedCurrentBlockId === null &&
                      changeKind === 'delete')
                  )
                ),
            'SCHEMA_INVALID',
            '稿件重新导入解决类型、候选身份或映射种类无效。',
          );
          if (mapping.claimed_mapping_id !== null) {
            requireBounded(
              changeKind === 'delete' && resolution === null && mapping.claimed_resolution === 'preserve-current-identity' &&
                current !== null && db.prepare(
                  `SELECT 1 valid FROM manuscript_reimport_mappings claimant
                   JOIN manuscript_reimport_mapping_resolutions r ON r.mapping_id = claimant.mapping_id
                   WHERE claimant.comparison_id = ? AND claimant.mapping_id = ?
                     AND claimant.change_kind = 'insert' AND claimant.current_block_id IS NULL
                     AND r.resolution = 'preserve-current-identity' AND r.resolved_current_block_id = ? LIMIT 1`,
                ).get(comparisonId, asString(mapping.claimed_mapping_id), current.blockId) !== undefined,
              'SCHEMA_INVALID',
              '被保留的当前结构身份没有合法插入映射解决。',
            );
          }
          for (const [block, revisionId] of [[current, comparison.checkpoint_revision_id],
            [lineageFact, comparison.lineage_revision_id]] as const) {
            if (block === null || typeof revisionId !== 'string') continue;
            const actual = db.prepare(
              `SELECT position, kind, level, text, digest FROM manuscript_block_versions
               WHERE revision_id = ? AND block_id = ?`,
            ).get(revisionId, block.blockId) as SqlRow | undefined;
            requireBounded(actual !== undefined && asNumber(actual.position) === block.position &&
              asString(actual.kind) === block.kind && (actual.level === null ? null : asNumber(actual.level)) === block.level &&
              asString(actual.text) === block.text && asString(actual.digest) === block.digest,
            'SCHEMA_INVALID', '稿件重新导入映射未绑定精确修订版块。');
          }
          if (staged !== null) {
            stagedCount += 1;
            finalBlockCount += 1;
            const finalBlockId = exact
              ? current!.blockId
              : resolution === 'preserve-current-identity'
                ? resolvedCurrentBlockId
                : null;
            const priorFinal = finalBlockId === null ? undefined : db.prepare(
              `SELECT position, kind, level, text, digest FROM manuscript_block_versions
               WHERE revision_id = ? AND block_id = ?`,
            ).get(asString(comparison.checkpoint_revision_id), finalBlockId) as SqlRow | undefined;
            changed ||= priorFinal === undefined || asNumber(priorFinal.position) !== staged.position ||
              asString(priorFinal.kind) !== staged.kind ||
              (priorFinal.level === null ? null : asNumber(priorFinal.level)) !== staged.level ||
              asString(priorFinal.text) !== staged.text || asString(priorFinal.digest) !== staged.digest;
            if (exact || resolution === 'preserve-current-identity') {
              resolvedChanged = Number(priorFinal === undefined || asNumber(priorFinal.position) !== staged.position ||
                asString(priorFinal.kind) !== staged.kind ||
                (priorFinal.level === null ? null : asNumber(priorFinal.level)) !== staged.level ||
                asString(priorFinal.text) !== staged.text || asString(priorFinal.digest) !== staged.digest);
            } else if (resolution === 'create-new-identity') {
              resolvedChanged = 1;
            }
            const actualStaged = db.prepare(
              `SELECT position, kind, level, text, digest FROM staged_import_blocks
               WHERE draft_id = ? AND staged_block_id = ?`,
            ).get(draftId, staged.blockId) as SqlRow | undefined;
            const actual = actualStaged ?? (committedRevisionId === null
              ? undefined
              : db.prepare(
                `SELECT block_id, position, kind, level, text, digest FROM manuscript_block_versions
                 WHERE revision_id = ? AND position = ?`,
              ).get(committedRevisionId, staged.position) as SqlRow | undefined);
            const expectedResultBlockId = committedRevisionId === null || actualStaged !== undefined
              ? null
              : exact
                ? current!.blockId
                : resolution === 'preserve-current-identity'
                  ? resolvedCurrentBlockId
                  : resolution === 'create-new-identity'
                    ? `blk_${sha256(`${committedRevisionId}\u0000${staged.position}\u0000${staged.digest}`).slice(0, 24)}`
                    : null;
            requireBounded(actual !== undefined && asNumber(actual.position) === staged.position &&
              asString(actual.kind) === staged.kind &&
              (actual.level === null ? null : asNumber(actual.level)) === staged.level &&
              asString(actual.text) === staged.text && asString(actual.digest) === staged.digest &&
              (expectedResultBlockId === null || asString(actual.block_id) === expectedResultBlockId),
            'SCHEMA_INVALID', '稿件重新导入暂存或结果块绑定无效。');
          }
          const unresolved = !exact && mapping.resolution === null &&
            !(changeKind === 'delete' && mapping.claimed_mapping_id !== null);
          if (changeKind === 'delete') {
            resolvedChanged = resolution === 'retire-current-identity' ? 1
              : mapping.claimed_mapping_id !== null ? 0 : null;
          }
          requireBounded(
            (resolvedChanged === null && mapping.resolved_changed === null) ||
              (resolvedChanged !== null && asNumber(mapping.resolved_changed) === resolvedChanged),
            'SCHEMA_INVALID',
            '稿件重新导入映射的最终变化聚合事实无效。',
          );
          if (unresolved) unresolvedCount += 1;
          else resolvedChangedCount += resolvedChanged ?? 0;
          const draftState = db.prepare('SELECT state FROM import_drafts WHERE draft_id = ?').get(draftId) as SqlRow;
          requireBounded(draftState.state !== 'committed' || !unresolved,
            'SCHEMA_INVALID', '已提交的稿件重新导入仍有未解决结构身份。');
          if (mapping.resolution !== null) {
            resolutionHash.update(`\n${canonicalJson({
              mappingId: asString(mapping.mapping_id),
              resolution: asString(mapping.resolution),
              resolvedCurrentBlockId: mapping.resolved_current_block_id === null
                ? null : asString(mapping.resolved_current_block_id),
            })}`);
          }
          comparisonHash.update(`\n${canonicalJson({
            mappingId: asString(mapping.mapping_id), position, changeKind,
            current, lineage: lineageFact, staged,
            identityConsequence: exact ? 'preserve-current-identity' : null,
          })}`);
          mappingCursor = position;
          expectedPosition += 1;
        }
      }
      const currentAuthorityCount = asNumber(one(db.prepare(
        'SELECT count(*) total FROM manuscript_block_versions WHERE revision_id = ?',
      ).all(asString(comparison.checkpoint_revision_id)) as SqlRow[], 'SCHEMA_INVALID',
      '无法核对重新导入当前修订版块覆盖。').total);
      const stagedAuthorityCount = committedRevisionId === null
        ? asNumber(one(db.prepare(
          'SELECT count(*) total FROM staged_import_blocks WHERE draft_id = ?',
        ).all(draftId) as SqlRow[], 'SCHEMA_INVALID', '无法核对重新导入暂存块覆盖。').total)
        : asNumber(one(db.prepare(
          'SELECT count(*) total FROM manuscript_block_versions WHERE revision_id = ?',
        ).all(committedRevisionId) as SqlRow[], 'SCHEMA_INVALID', '无法核对重新导入结果块覆盖。').total);
      changed ||= finalBlockCount !== currentAuthorityCount;
      requireBounded(expectedPosition > 1 && stagedCount === asNumber(comparison.staged_block_count) &&
        currentCount === currentAuthorityCount && stagedCount === stagedAuthorityCount &&
        comparisonHash.digest('hex') === asString(comparison.comparison_digest) &&
        asNumber(comparison.total_mappings) === expectedPosition - 1 &&
        asNumber(comparison.unresolved_mappings) === unresolvedCount &&
        asNumber(comparison.changed_mappings) === resolvedChangedCount &&
        asNumber(comparison.checkpoint_block_count) === currentAuthorityCount,
      'SCHEMA_INVALID', '稿件重新导入比较摘要或当前、暂存、结果块覆盖无效。');
      const resolutionDigest = resolutionHash.digest('hex');
      requireBounded(resolutionDigest === asString(comparison.resolution_digest),
        'SCHEMA_INVALID', '稿件重新导入当前解决摘要无效。');
      const reviewedDraft = one(db.prepare(
        `SELECT d.draft_version, d.object_digest, d.review_digest, d.reviewed_book_state_digest,
                d.reviewed_reuse_source_version_id, b.stable_identity, co.byte_length source_bytes,
                ss.fidelity_json
         FROM import_drafts d
         JOIN books b ON b.book_id = ?
         JOIN content_objects co ON co.object_digest = d.object_digest
         LEFT JOIN staged_import_snapshots ss ON ss.draft_id = d.draft_id
         WHERE d.draft_id = ?`,
      ).all(asString(comparison.book_id), draftId) as SqlRow[], 'SCHEMA_INVALID', '稿件重新导入复核草稿无效。');
      let reviewFidelity: FidelityCategoryProjection[];
      if (reviewedDraft.fidelity_json !== null) {
        try {
          reviewFidelity = JSON.parse(asString(reviewedDraft.fidelity_json)) as FidelityCategoryProjection[];
        } catch {
          throw new BoundedStoreError('SCHEMA_INVALID', '稿件重新导入保真复核 JSON 无效。');
        }
      } else {
        const fidelityRows = db.prepare(
          `SELECT fc.category_key, fc.display_label, fc.item_count, fc.status, fc.detail
           FROM manuscript_reimport_records rr
           JOIN import_fidelity_categories fc ON fc.fidelity_review_id = rr.fidelity_review_id
           WHERE rr.comparison_id = ? ORDER BY fc.position LIMIT 9`,
        ).all(comparisonId) as SqlRow[];
        reviewFidelity = fidelityRows.map((row) => {
          const status = asString(row.status) as FidelityCategoryProjection['status'];
          return {
            key: asString(row.category_key) as FidelityCategoryProjection['key'],
            label: asString(row.display_label), count: asNumber(row.item_count), status,
            statusLabel: status === 'preserved' ? '完整保留' : status === 'degraded' ? '降级导入' : '不支持导入',
            detail: asString(row.detail),
          };
        });
      }
      const reviewPlan = deriveImportFidelityPlan(
        reviewFidelity,
        asString(comparison.staged_source_digest),
        asNumber(reviewedDraft.source_bytes),
      );
      requireBounded(reviewPlan !== undefined, 'SCHEMA_INVALID', '稿件重新导入保真复核不符合受限边界。');
      const degradationDecisionState = reviewPlan.degradations.length === 0
        ? 'not-required-clean-import'
        : asNumber(comparison.degradation_accepted) === 1 ? 'accepted-complete-set' : 'required-unselected';
      const reviewDigest = sha256(canonicalJson({
        schema: 'ai7.manuscript-reimport-review/1',
        draftId,
        draftVersion: asNumber(reviewedDraft.draft_version),
        target: {
          bookId: asString(comparison.book_id),
          stableIdentity: asString(reviewedDraft.stable_identity),
          manuscriptId: asString(comparison.manuscript_id),
          branchId: asString(comparison.branch_id),
          relationship: 'reimport',
          bookStateDigest: asString(reviewedDraft.reviewed_book_state_digest),
        },
        checkpoint,
        lineage,
        sourceVersionDisposition: reviewedDraft.reviewed_reuse_source_version_id === null
          ? 'created' : 'reused-same-book',
        reuseSourceVersionId: reviewedDraft.reviewed_reuse_source_version_id === null
          ? null : asString(reviewedDraft.reviewed_reuse_source_version_id),
        source: {
          objectDigest: asString(reviewedDraft.object_digest),
          sourceDigest: asString(comparison.staged_source_digest),
          contentDigest: asString(comparison.staged_content_digest),
          structureDigest: asString(comparison.staged_structure_digest),
          parserIdentity: asString(comparison.staged_parser_identity),
        },
        comparisonDigest: asString(comparison.comparison_digest),
        resolutionDigest,
        degradationDecision: degradationDecisionState,
        namedNonEffects: MANUSCRIPT_REIMPORT_NON_EFFECTS,
      }));
      requireBounded(reviewDigest === asString(reviewedDraft.review_digest),
        'SCHEMA_INVALID', '稿件重新导入复核摘要无效。');
      const record = db.prepare(
        `SELECT rr.*, sv.source_digest, co.byte_length source_bytes,
                fr.outcome fidelity_outcome, fr.review_digest fidelity_review_digest,
                dd.decision degradation_decision
         FROM manuscript_reimport_records rr
         JOIN source_versions sv ON sv.source_version_id = rr.source_version_id
         JOIN content_objects co ON co.object_digest = sv.object_digest
         JOIN import_fidelity_reviews fr ON fr.fidelity_review_id = rr.fidelity_review_id
         LEFT JOIN import_degradation_decisions dd
           ON dd.degradation_decision_id = rr.degradation_decision_id
         WHERE rr.comparison_id = ?`,
      ).get(comparisonId) as SqlRow | undefined;
      if (record !== undefined) {
        requireBounded(resolutionDigest === asString(record.resolution_digest) &&
          (changed ? record.result_kind === 'changed' : record.result_kind === 'no-change'),
        'SCHEMA_INVALID', '稿件重新导入解决摘要或结果类型无效。');
        const recordDigest = sha256(canonicalJson({
          schema: 'ai7.manuscript-reimport-record/1',
          reimportRecordId: asString(record.reimport_record_id), commitId: asString(record.commit_id),
          bookId: asString(record.book_id), manuscriptId: asString(record.manuscript_id),
          branchId: asString(record.branch_id), sourceVersionId: asString(record.source_version_id),
          provenanceId: asString(record.provenance_id), previousRevisionId: asString(record.previous_revision_id),
          resultingRevisionId: record.resulting_revision_id === null ? null : asString(record.resulting_revision_id),
          resultKind: asString(record.result_kind), resultLabel: asString(record.result_label),
          lineageStatus: asString(record.lineage_status),
          lineageSourceVersionId: record.lineage_source_version_id === null ? null : asString(record.lineage_source_version_id),
          comparisonKind: asString(record.comparison_kind), comparisonDigest: asString(record.comparison_digest),
          resolutionDigest, fidelityReviewId: asString(record.fidelity_review_id),
          degradationDecisionId: record.degradation_decision_id === null ? null : asString(record.degradation_decision_id),
          importedAt: asString(record.imported_at),
        }));
        requireBounded(recordDigest === asString(record.record_digest), 'SCHEMA_INVALID', '稿件重新导入记录摘要无效。');
        const categoryRows = db.prepare(
          `SELECT category_key, display_label, item_count, status, detail, position
           FROM import_fidelity_categories WHERE fidelity_review_id = ? ORDER BY position LIMIT 9`,
        ).all(asString(record.fidelity_review_id)) as SqlRow[];
        requireBounded(categoryRows.length === 8 && categoryRows.every((row, index) => asNumber(row.position) === index + 1),
          'SCHEMA_INVALID', '稿件重新导入保真证据必须精确包含八类。');
        const categories = categoryRows.map((row) => {
          const status = asString(row.status) as FidelityCategoryProjection['status'];
          return {
            key: asString(row.category_key) as FidelityCategoryProjection['key'],
            label: asString(row.display_label),
            count: asNumber(row.item_count),
            status,
            statusLabel: status === 'preserved' ? '完整保留' as const
              : status === 'degraded' ? '降级导入' as const : '不支持导入' as const,
            detail: asString(row.detail),
          };
        });
        const plan = deriveImportFidelityPlan(categories, asString(record.source_digest), asNumber(record.source_bytes));
        const degradationDecision = plan && plan.degradations.length > 0
          ? canonicalJson({
              schema: 'ai7.import-degradation-decision/1',
              scope: 'this-import-only',
              state: 'accepted-complete-set',
              items: plan.degradations,
            })
          : null;
        const fidelityReviewDigest = plan === undefined ? null : sha256(canonicalJson({
          schema: 'ai7.manuscript-reimport-fidelity-review/1',
          reimportRecordId: asString(record.reimport_record_id),
          sourceVersionId: asString(record.source_version_id),
          sourceDigest: asString(record.source_digest),
          sourceBytes: asNumber(record.source_bytes),
          categories,
          outcome: plan.outcome,
        }));
        requireBounded(plan !== undefined && plan.outcome === asString(record.fidelity_outcome) &&
          fidelityReviewDigest === asString(record.fidelity_review_digest) &&
          (asNumber(comparison.degradation_accepted) === (plan.degradations.length > 0 ? 1 : 0)) &&
          ((degradationDecision === null && record.degradation_decision_id === null && record.degradation_decision === null) ||
            (degradationDecision !== null && record.degradation_decision_id !== null &&
              degradationDecision === asString(record.degradation_decision))),
        'SCHEMA_INVALID', '稿件重新导入保真或降级决定证据无效。');
      }
      comparisonCursor = comparisonId;
    }
  }

  const invalidRecords = db.prepare(
    `SELECT rr.reimport_record_id
     FROM manuscript_reimport_records rr
     JOIN import_commits ic ON ic.commit_id = rr.commit_id
     JOIN import_drafts d ON d.draft_id = ic.draft_id
     JOIN manuscript_reimport_comparisons c ON c.comparison_id = rr.comparison_id AND c.draft_id = d.draft_id
     JOIN manuscripts m ON m.manuscript_id = rr.manuscript_id
     JOIN source_versions sv ON sv.source_version_id = rr.source_version_id
     JOIN source_provenance sp ON sp.provenance_id = rr.provenance_id
     JOIN manuscript_revisions previous ON previous.revision_id = rr.previous_revision_id
     LEFT JOIN manuscript_revisions resulting ON resulting.revision_id = rr.resulting_revision_id
     JOIN import_fidelity_reviews fr
       ON fr.fidelity_review_id = rr.fidelity_review_id AND fr.book_id = rr.book_id
      AND fr.source_version_id = rr.source_version_id
     LEFT JOIN import_degradation_decisions dd
       ON dd.degradation_decision_id = rr.degradation_decision_id
      AND dd.fidelity_review_id = rr.fidelity_review_id
     WHERE ic.operation_kind != 'manuscript-reimport' OR d.reviewed_relationship != 'reimport'
       OR d.state != 'committed' OR d.committed_commit_id != rr.commit_id
       OR rr.book_id != m.book_id OR sv.book_id != rr.book_id OR sp.source_version_id != rr.source_version_id
       OR previous.manuscript_id != rr.manuscript_id OR previous.branch_id != rr.branch_id
       OR rr.comparison_digest != c.comparison_digest
       OR rr.lineage_status != c.lineage_status
       OR NOT (rr.lineage_source_version_id IS c.lineage_source_version_id)
       OR rr.comparison_kind != c.comparison_kind
       OR (rr.degradation_decision_id IS NULL) != (dd.degradation_decision_id IS NULL)
       OR (rr.result_kind = 'changed' AND (
         resulting.parent_revision_id != rr.previous_revision_id OR resulting.manuscript_id != rr.manuscript_id
         OR resulting.branch_id != rr.branch_id OR resulting.source_version_id != rr.source_version_id
         OR resulting.ordinal != previous.ordinal + 1
       ))
     LIMIT 1`,
  ).get() as SqlRow | undefined;
  requireBounded(invalidRecords === undefined, 'SCHEMA_INVALID', '稿件重新导入记录图无效。');
}

export function validateManuscriptReimportSchemaTruth(
  db: DatabaseSync,
  profile: BuiltInWorkflowProfile,
  includeModelServiceTable = false,
  includeNativeArtifactTables = false,
  includeAuthoritySidecarTables = false,
): void {
  requireManuscriptReimportTargetSchema(
    db,
    includeModelServiceTable,
    includeNativeArtifactTables,
    includeAuthoritySidecarTables,
  );
  validateSchemaAuthorityIds(db);
  validateWorkflowSemanticTruth(db, profile);
  validateSourceImportDraftTargetTruth(db);
  validateSourceImportRecordTruth(db);
  validateManuscriptReimportTruth(db);
  validateAllDerivedOffsets(db);
  validateLegacyHistoryRoots(db);
  validateAllCommandHistory(db);
  validateMilestoneSignoffTruth(db);
  validateRecoveryTruth(db);
  const violations = db.prepare('PRAGMA foreign_key_check').all();
  requireBounded(violations.length === 0, 'SCHEMA_MIGRATION_FAILED', '数据库引用校验失败。');
}

export function initializeBoundedSchema(db: DatabaseSync, profile: BuiltInWorkflowProfile): void {
  const version = asNumber(one(db.prepare('PRAGMA user_version').all() as SqlRow[], 'SCHEMA_INVALID', '无法读取数据库版本。').user_version);
  requireBounded(
    version === CONTINUITY_SCHEMA_VERSION || version === EDITOR_SCHEMA_VERSION ||
      version === RECOVERY_SCHEMA_VERSION || version === SCHEMA_VERSION ||
      version === SOURCE_IMPORT_SCHEMA_VERSION || version === MANUSCRIPT_REIMPORT_SCHEMA_VERSION ||
      version === MODEL_SERVICE_SCHEMA_VERSION || version === NATIVE_ARTIFACT_SCHEMA_VERSION ||
      version === AUTHORITY_SIDECAR_SCHEMA_VERSION,
    'SCHEMA_UNSUPPORTED',
    '数据库版本不受支持。',
  );
  if (version === MANUSCRIPT_REIMPORT_SCHEMA_VERSION || version === MODEL_SERVICE_SCHEMA_VERSION ||
      version === NATIVE_ARTIFACT_SCHEMA_VERSION || version === AUTHORITY_SIDECAR_SCHEMA_VERSION) {
    transact(db, () => {
      validateManuscriptReimportSchemaTruth(
        db,
        profile,
        version >= MODEL_SERVICE_SCHEMA_VERSION,
        version >= NATIVE_ARTIFACT_SCHEMA_VERSION,
        version === AUTHORITY_SIDECAR_SCHEMA_VERSION,
      );
      terminalizeOrphanedReplacementPreviews(db);
      reclaimOrphanedSearchSessions(db);
    });
    return;
  }
  if (version === SOURCE_IMPORT_SCHEMA_VERSION) {
    transact(db, () => {
      validateSourceImportSchemaTruth(db, profile);
      terminalizeOrphanedReplacementPreviews(db);
      reclaimOrphanedSearchSessions(db);
    });
    return;
  }
  if (version === SCHEMA_VERSION) {
    requireTargetSchema(db);
    transact(db, () => {
      validateSchemaAuthorityIds(db);
      validateWorkflowSemanticTruth(db, profile);
      validateImportDraftTargetTruth(db);
      validateAllDerivedOffsets(db);
      validateLegacyHistoryRoots(db);
      validateAllCommandHistory(db);
      validateMilestoneSignoffTruth(db);
      validateRecoveryTruth(db);
      const violations = db.prepare('PRAGMA foreign_key_check').all();
      requireBounded(violations.length === 0, 'SCHEMA_MIGRATION_FAILED', '数据库引用校验失败。');
      terminalizeOrphanedReplacementPreviews(db);
      reclaimOrphanedSearchSessions(db);
    });
    return;
  }
  if (version === RECOVERY_SCHEMA_VERSION) {
    migrateRecoverySchemaV7ToV8(db, profile);
    return initializeBoundedSchema(db, profile);
  }
  if (version === EDITOR_SCHEMA_VERSION) {
    migrateEditorSchemaV6ToV7(db);
    return initializeBoundedSchema(db, profile);
  }
  requireContinuitySchema(db);
  const legacyAlterTable = asNumber(one(db.prepare('PRAGMA legacy_alter_table').all() as SqlRow[], 'SCHEMA_INVALID', '无法读取旧式改表状态。').legacy_alter_table);
  db.exec('PRAGMA foreign_keys = OFF');
  let migrationError: unknown;
  try {
    db.exec('BEGIN IMMEDIATE');
    const disabledForeignKeys = one(db.prepare('PRAGMA foreign_keys').all() as SqlRow[], 'SCHEMA_INVALID', '无法读取引用校验状态。');
    requireBounded(asNumber(disabledForeignKeys.foreign_keys) === 0, 'SCHEMA_INVALID', '无法暂时停用引用校验以迁移数据库。');
    validateSchemaAuthorityIds(db);
    recreateImportDraftTable(db);
    recreateRevisionTable(db);
    db.exec(`
      ${TARGET_BASE_SCHEMA_SQL.import_ingest_blocks};

      ALTER TABLE staged_import_snapshots ADD COLUMN character_count INTEGER NOT NULL DEFAULT 0 CHECK(character_count >= 0);
      ALTER TABLE staged_import_blocks ADD COLUMN start_offset INTEGER NOT NULL DEFAULT 0 CHECK(start_offset >= 0);
      ALTER TABLE staged_import_blocks ADD COLUMN grapheme_length INTEGER NOT NULL DEFAULT 0 CHECK(grapheme_length >= 0);
      ALTER TABLE manuscript_block_versions ADD COLUMN start_offset INTEGER NOT NULL DEFAULT 0 CHECK(start_offset >= 0);
      ALTER TABLE manuscript_block_versions ADD COLUMN grapheme_length INTEGER NOT NULL DEFAULT 0 CHECK(grapheme_length >= 0);
      ALTER TABLE working_blocks ADD COLUMN grapheme_length INTEGER NOT NULL DEFAULT 0 CHECK(grapheme_length >= 0);
      ALTER TABLE branch_working_state ADD COLUMN total_graphemes INTEGER NOT NULL DEFAULT 0 CHECK(total_graphemes >= 0);
      ALTER TABLE branch_working_state ADD COLUMN history_sequence INTEGER NOT NULL DEFAULT 0 CHECK(history_sequence >= 0);
      ALTER TABLE branch_working_state ADD COLUMN last_checkpoint_sequence INTEGER NOT NULL DEFAULT 0 CHECK(last_checkpoint_sequence >= 0);
      ALTER TABLE edit_journal_entries ADD COLUMN command_group_id TEXT;
      ALTER TABLE edit_journal_entries ADD COLUMN command_kind TEXT NOT NULL DEFAULT 'edit';

      CREATE TABLE manuscript_outline (
        branch_id TEXT NOT NULL REFERENCES manuscript_branches(branch_id),
        block_id TEXT NOT NULL REFERENCES manuscript_blocks(block_id),
        position INTEGER NOT NULL CHECK(position > 0),
        kind TEXT NOT NULL CHECK(kind IN ('title', 'heading')),
        level INTEGER NOT NULL CHECK(level BETWEEN 1 AND 6),
        text TEXT NOT NULL,
        digest TEXT NOT NULL CHECK(length(digest) = 64),
        PRIMARY KEY(branch_id, block_id),
        UNIQUE(branch_id, position)
      ) STRICT;
      CREATE INDEX manuscript_outline_order ON manuscript_outline(branch_id, position);

      CREATE VIRTUAL TABLE working_block_search USING fts5(
        branch_id UNINDEXED,
        block_id UNINDEXED,
        text,
        tokenize='trigram'
      );

      CREATE TABLE manuscript_command_groups (
        command_group_id TEXT PRIMARY KEY,
        branch_id TEXT NOT NULL REFERENCES manuscript_branches(branch_id),
        ordinal INTEGER NOT NULL CHECK(ordinal > 0),
        kind TEXT NOT NULL CHECK(kind IN ('edit', 'replacement')),
        status TEXT NOT NULL CHECK(status IN ('applied', 'undone', 'superseded')),
        source_group_id TEXT,
        before_working_digest TEXT NOT NULL CHECK(length(before_working_digest) = 64),
        after_working_digest TEXT NOT NULL CHECK(length(after_working_digest) = 64),
        created_at TEXT NOT NULL,
        UNIQUE(branch_id, ordinal)
      ) STRICT;
      CREATE TABLE manuscript_command_edits (
        command_group_id TEXT NOT NULL REFERENCES manuscript_command_groups(command_group_id),
        position INTEGER NOT NULL CHECK(position > 0),
        block_id TEXT NOT NULL REFERENCES manuscript_blocks(block_id),
        before_text TEXT NOT NULL,
        before_digest TEXT NOT NULL CHECK(length(before_digest) = 64),
        after_text TEXT NOT NULL,
        after_digest TEXT NOT NULL CHECK(length(after_digest) = 64),
        PRIMARY KEY(command_group_id, position),
        UNIQUE(command_group_id, block_id)
      ) STRICT;
      CREATE INDEX command_history_state ON manuscript_command_groups(branch_id, status, ordinal);

      CREATE TABLE milestone_versions (
        milestone_id TEXT PRIMARY KEY,
        manuscript_id TEXT NOT NULL REFERENCES manuscripts(manuscript_id),
        branch_id TEXT NOT NULL REFERENCES manuscript_branches(branch_id),
        revision_id TEXT NOT NULL REFERENCES manuscript_revisions(revision_id),
        label TEXT NOT NULL,
        purpose TEXT NOT NULL,
        note TEXT,
        actor TEXT NOT NULL CHECK(actor = '本机编辑'),
        created_at TEXT NOT NULL,
        UNIQUE(branch_id, label)
      ) STRICT;

      CREATE TABLE manuscript_search_sessions (
        search_id TEXT PRIMARY KEY,
        manuscript_id TEXT NOT NULL REFERENCES manuscripts(manuscript_id),
        branch_id TEXT NOT NULL REFERENCES manuscript_branches(branch_id),
        revision_id TEXT NOT NULL REFERENCES manuscript_revisions(revision_id),
        journal_sequence INTEGER NOT NULL CHECK(journal_sequence >= 0),
        working_digest TEXT NOT NULL CHECK(length(working_digest) = 64),
        query TEXT NOT NULL,
        state TEXT NOT NULL CHECK(state IN ('running', 'completed', 'cancelled', 'failed')),
        scanned_position INTEGER NOT NULL DEFAULT 0 CHECK(scanned_position >= 0),
        total_blocks INTEGER NOT NULL CHECK(total_blocks > 0),
        total_matches INTEGER NOT NULL DEFAULT 0 CHECK(total_matches >= 0),
        created_at TEXT NOT NULL,
        completed_at TEXT
      ) STRICT;
      CREATE TABLE manuscript_search_results (
        search_id TEXT NOT NULL REFERENCES manuscript_search_sessions(search_id) ON DELETE CASCADE,
        ordinal INTEGER NOT NULL CHECK(ordinal > 0),
        match_id TEXT NOT NULL,
        block_id TEXT NOT NULL REFERENCES manuscript_blocks(block_id),
        from_grapheme INTEGER NOT NULL CHECK(from_grapheme >= 0),
        to_grapheme INTEGER NOT NULL CHECK(to_grapheme > from_grapheme),
        global_character INTEGER NOT NULL CHECK(global_character >= 0),
        heading_label TEXT NOT NULL,
        context TEXT NOT NULL,
        range_digest TEXT NOT NULL CHECK(length(range_digest) = 64),
        PRIMARY KEY(search_id, ordinal),
        UNIQUE(search_id, match_id)
      ) STRICT;

      CREATE TABLE manuscript_replacement_previews (
        preview_id TEXT PRIMARY KEY,
        search_id TEXT NOT NULL REFERENCES manuscript_search_sessions(search_id),
        manuscript_id TEXT NOT NULL REFERENCES manuscripts(manuscript_id),
        branch_id TEXT NOT NULL REFERENCES manuscript_branches(branch_id),
        revision_id TEXT NOT NULL REFERENCES manuscript_revisions(revision_id),
        journal_sequence INTEGER NOT NULL CHECK(journal_sequence >= 0),
        working_digest TEXT NOT NULL CHECK(length(working_digest) = 64),
        query TEXT NOT NULL,
        replacement TEXT NOT NULL,
        state TEXT NOT NULL CHECK(state IN ('reviewing', 'frozen', 'committed', 'cancelled', 'failed')),
        total_matches INTEGER NOT NULL CHECK(total_matches > 0),
        included_matches INTEGER NOT NULL CHECK(included_matches >= 0),
        validated_ordinal INTEGER NOT NULL DEFAULT 0 CHECK(validated_ordinal >= 0),
        created_at TEXT NOT NULL,
        committed_at TEXT
      ) STRICT;
      CREATE TABLE manuscript_replacement_matches (
        preview_id TEXT NOT NULL REFERENCES manuscript_replacement_previews(preview_id) ON DELETE CASCADE,
        ordinal INTEGER NOT NULL CHECK(ordinal > 0),
        match_id TEXT NOT NULL,
        block_id TEXT NOT NULL REFERENCES manuscript_blocks(block_id),
        from_grapheme INTEGER NOT NULL CHECK(from_grapheme >= 0),
        to_grapheme INTEGER NOT NULL CHECK(to_grapheme > from_grapheme),
        range_digest TEXT NOT NULL CHECK(length(range_digest) = 64),
        included INTEGER NOT NULL CHECK(included IN (0, 1)),
        PRIMARY KEY(preview_id, ordinal),
        UNIQUE(preview_id, match_id)
      ) STRICT;
      CREATE INDEX replacement_matches_block ON manuscript_replacement_matches(preview_id, included, block_id, from_grapheme);
    `);
    createMilestoneSignoffTable(db);
    createWorkingOffsetTable(db);
    requireV6TargetSchema(db);
    reclaimOrphanedSearchSessions(db);

    validateStagedDraftInventory(db);
    forEachSchemaId(db, 'staged_import_snapshots', 'draft_id', (draftId) => {
      validateStagedDraftContentTruth(db, draftId, false);
      rebuildStagedDraftDerived(db, draftId);
    });

    forEachSchemaId(db, 'manuscript_revisions', 'revision_id', (revisionId) => rebuildRevisionOffsets(db, revisionId));

    forEachSchemaId(db, 'branch_working_state', 'branch_id', (branchId) => {
      const history = migrateLegacyJournal(db, branchId);
      db.prepare('UPDATE branch_working_state SET history_sequence = ? WHERE branch_id = ?').run(history, branchId);
      rebuildBranchDerived(db, branchId);
    });
    db.exec('DROP TABLE IF EXISTS temp.migration_block_state');
    validateAllDerivedOffsets(db);
    validateLegacyHistoryRoots(db);
    validateAllCommandHistory(db);
    validateMilestoneSignoffTruth(db);
    const violations = db.prepare('PRAGMA foreign_key_check').all();
    requireBounded(violations.length === 0, 'SCHEMA_MIGRATION_FAILED', '数据库迁移后的引用校验失败。');
    db.exec(`PRAGMA user_version = ${EDITOR_SCHEMA_VERSION}; COMMIT;`);
  } catch (error) {
    migrationError = error;
    try {
      db.exec('ROLLBACK');
    } catch (rollbackError) {
      migrationError = new AggregateError([error, rollbackError], 'SQLite bounded schema migration rollback failed.');
    }
  } finally {
    try {
      db.exec(`PRAGMA legacy_alter_table = ${legacyAlterTable}`);
      const restoredLegacyAlterTable = one(db.prepare('PRAGMA legacy_alter_table').all() as SqlRow[], 'SCHEMA_INVALID', '无法读取旧式改表状态。');
      requireBounded(asNumber(restoredLegacyAlterTable.legacy_alter_table) === legacyAlterTable, 'SCHEMA_INVALID', '无法恢复旧式改表状态。');
      db.exec('PRAGMA foreign_keys = ON');
      const restoredForeignKeys = one(db.prepare('PRAGMA foreign_keys').all() as SqlRow[], 'SCHEMA_INVALID', '无法读取引用校验状态。');
      requireBounded(asNumber(restoredForeignKeys.foreign_keys) === 1, 'SCHEMA_INVALID', '无法恢复引用校验。');
    } catch (restoreError) {
      migrationError = migrationError
        ? new AggregateError([migrationError, restoreError], 'SQLite bounded schema migration and foreign-key restoration failed.')
        : restoreError;
    }
  }
  if (migrationError) throw migrationError;
  migrateEditorSchemaV6ToV7(db);
  initializeBoundedSchema(db, profile);
}

interface BranchBinding {
  bookId: string;
  manuscriptId: string;
  branchId: string;
  revisionId: string;
  revisionLabel: string;
  journalSequence: number;
  workingDigest: string;
  totalCharacters: number;
  historySequence: number;
  historyBoundarySequence: number;
  lastCheckpointSequence: number;
}

export interface ReimportCheckpointBinding {
  bookId: string;
  manuscriptId: string;
  branchId: string;
  revisionId: string;
  revisionLabel: string;
  revisionDigest: string;
  journalSequence: number;
  createdForDirtyJournal: boolean;
}

interface ReimportCheckpointWork {
  workId: string;
  binding: BranchBinding;
  revisionId: string;
  revisionLabel: string;
  sourceVersionId: string;
  totalBlocks: number;
  cursor: number;
  expectedPosition: number;
  offset: number;
  createdAt: string;
  state: 'copying' | 'prepared';
}

export interface ReimportCheckpointProgress {
  done: boolean;
  completed: number;
  total: number;
  checkpoint: ReimportCheckpointBinding | null;
}

export interface RecoverySnapshotPlan {
  snapshotId: string;
  milestoneId: string;
  signoffRecordId: string;
  bookId: string;
  manuscriptId: string;
  branchId: string;
  expectedBaseRevisionId: string;
  expectedJournalSequence: number;
  expectedWorkingDigest: string;
  revisionId: string;
  revisionLabel: string;
  sourceVersionId: string;
  blockCount: number;
  totalGraphemes: number;
  label: string;
  purpose: string;
  note: string | null;
  createdAt: string;
}

export interface RecoverySnapshotObjectMetadata {
  objectDigest: string;
  manifestDigest: string;
  objectRelativeKey: string;
  byteLength: number;
  blockCount: number;
  verifiedAt: string;
  newlyPromoted?: boolean;
}

export interface RecoverySnapshotBlock {
  blockId: string;
  position: number;
  kind: ManuscriptBlockProjection['kind'];
  level: number | null;
  text: string;
  digest: string;
  graphemeLength: number;
}

export interface RecoverySnapshotRecord extends RecoverySnapshotObjectMetadata {
  snapshotId: string;
  bookId: string;
  manuscriptId: string;
  branchId: string;
  revisionId: string;
  revisionLabel: string;
  revisionDigest: string;
  journalSequence: number;
  totalGraphemes: number;
  createdAt: string;
}

export interface RecoverySnapshotCursor {
  createdAt: string;
  snapshotId: string;
}

export type VerifiedRecoverySnapshot =
  | { state: 'eligible'; record: RecoverySnapshotRecord }
  | {
      state: 'unavailable';
      snapshotId: string;
      verification: '对象缺失' | '摘要不匹配' | '对象不完整';
      limitation: string;
    }
  | { state: 'none' };

export class BoundedManuscriptStore {
  readonly #db: DatabaseSync;
  readonly #cursorSecret = randomBytes(32);
  readonly #reimportCheckpointWork = new Map<string, ReimportCheckpointWork>();

  constructor(db: DatabaseSync) {
    this.#db = db;
    transact(this.#db, () => {
      terminalizeOrphanedReplacementPreviews(this.#db);
      reclaimOrphanedSearchSessions(this.#db);
      this.#db.prepare('DELETE FROM recovery_restore_stages').run();
    });
  }

  assertStagedDraftIntegrity(draftId: string): void {
    requireBounded(UUID_PATTERN.test(draftId), 'DRAFT_INVALID', '暂存稿件草稿标识无效。');
    validateStagedDraftDerived(this.#db, draftId);
  }

  initializeImportedBranch(branchId: string): number {
    return rebuildBranchDerived(this.#db, branchId);
  }

  createReimportCheckpointWork(
    manuscriptId: string,
    branchId: string,
  ): { workId: string | null; total: number; checkpoint: ReimportCheckpointBinding | null } {
    const binding = this.#binding(manuscriptId, branchId);
    this.#requireBranchEditable(branchId);
    if (binding.journalSequence === binding.lastCheckpointSequence) {
      return {
        workId: null,
        total: 0,
        checkpoint: {
          bookId: binding.bookId,
          manuscriptId,
          branchId,
          revisionId: binding.revisionId,
          revisionLabel: binding.revisionLabel,
          revisionDigest: binding.workingDigest,
          journalSequence: binding.journalSequence,
          createdForDirtyJournal: false,
        },
      };
    }
    requireBounded(!Array.from(this.#reimportCheckpointWork.values()).some((work) => work.binding.branchId === branchId),
      'SERVICE_BUSY', '该稿件已有重新导入固定点任务。');
    const previous = one(this.#db.prepare(
      'SELECT ordinal, source_version_id FROM manuscript_revisions WHERE revision_id = ?',
    ).all(binding.revisionId) as SqlRow[], 'REIMPORT_CHECKPOINT_INVALID', '当前稿件修订版缺失。');
    const totalBlocks = lastWorkingPosition(this.#db, branchId);
    requireBounded(totalBlocks > 0, 'REIMPORT_CHECKPOINT_INVALID', '工作稿没有内容块。');
    this.#db.exec(
      `CREATE TEMP TABLE IF NOT EXISTS reimport_checkpoint_rows(
         work_id TEXT NOT NULL,
         revision_id TEXT NOT NULL,
         block_id TEXT NOT NULL,
         position INTEGER NOT NULL,
         kind TEXT NOT NULL,
         level INTEGER,
         text TEXT NOT NULL,
         digest TEXT NOT NULL,
         start_offset INTEGER NOT NULL,
         grapheme_length INTEGER NOT NULL,
         PRIMARY KEY(work_id, position)
       ) WITHOUT ROWID`,
    );
    const workId = randomUUID();
    this.#reimportCheckpointWork.set(workId, {
      workId,
      binding,
      revisionId: randomUUID(),
      revisionLabel: `r${asNumber(previous.ordinal) + 1}`,
      sourceVersionId: asString(previous.source_version_id),
      totalBlocks,
      cursor: 0,
      expectedPosition: 1,
      offset: 0,
      createdAt: new Date().toISOString(),
      state: 'copying',
    });
    return { workId, total: totalBlocks, checkpoint: null };
  }

  advanceReimportCheckpointWork(workId: string): ReimportCheckpointProgress {
    requireBounded(UUID_PATTERN.test(workId), 'JOB_INVALID', '重新导入固定点任务标识无效。');
    const work = this.#reimportCheckpointWork.get(workId);
    requireBounded(work !== undefined, 'JOB_NOT_FOUND', '重新导入固定点任务不存在或已结束。');
    if (work.state === 'prepared') {
      return {
        done: true,
        completed: work.totalBlocks,
        total: work.totalBlocks,
        checkpoint: {
          bookId: work.binding.bookId,
          manuscriptId: work.binding.manuscriptId,
          branchId: work.binding.branchId,
          revisionId: work.revisionId,
          revisionLabel: work.revisionLabel,
          revisionDigest: work.binding.workingDigest,
          journalSequence: work.binding.journalSequence,
          createdForDirtyJournal: true,
        },
      };
    }
    const current = this.#binding(work.binding.manuscriptId, work.binding.branchId);
    requireBounded(
      current.revisionId === work.binding.revisionId &&
        current.journalSequence === work.binding.journalSequence &&
        current.workingDigest === work.binding.workingDigest &&
        current.totalCharacters === work.binding.totalCharacters,
      'REIMPORT_CHECKPOINT_STALE',
      '建立重新导入安全固定点时稿件已变化。',
    );
    const rows = this.#db.prepare(
      `SELECT block_id, position, kind, level, text, digest, grapheme_length
       FROM working_blocks WHERE branch_id = ? AND position > ? ORDER BY position LIMIT ?`,
    ).all(work.binding.branchId, work.cursor, MIGRATION_BATCH) as SqlRow[];
    if (rows.length > 0) {
      const insert = this.#db.prepare(
        `INSERT INTO temp.reimport_checkpoint_rows(
           work_id, revision_id, block_id, position, kind, level, text, digest, start_offset, grapheme_length
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      transact(this.#db, () => {
        for (const row of rows) {
          const position = asNumber(row.position);
          const kind = asString(row.kind) as ManuscriptBlockProjection['kind'];
          const level = row.level === null ? null : asNumber(row.level);
          const text = asString(row.text);
          const length = stagedBlockLength(text, 'REIMPORT_CHECKPOINT_INVALID', '工作稿文字超出重新导入固定点边界。');
          requireBounded(
            position === work.expectedPosition && asNumber(row.grapheme_length) === length &&
              blockDigest(kind, level, text) === asString(row.digest),
            'REIMPORT_CHECKPOINT_INVALID',
            '工作稿内容无法建立精确重新导入固定点。',
          );
          insert.run(workId, work.revisionId, asString(row.block_id), position, kind, level, text,
            asString(row.digest), work.offset, length);
          work.cursor = position;
          work.expectedPosition += 1;
          work.offset += length;
        }
      });
      return { done: false, completed: work.cursor, total: work.totalBlocks, checkpoint: null };
    }
    requireBounded(
      work.cursor === work.totalBlocks && work.offset === work.binding.totalCharacters &&
        workingOffsetPrefix(this.#db, work.binding.branchId, work.totalBlocks) === work.offset,
      'REIMPORT_CHECKPOINT_INVALID',
      '工作稿偏移索引与重新导入固定点不一致。',
    );
    work.state = 'prepared';
    return {
      done: true,
      completed: work.totalBlocks,
      total: work.totalBlocks,
      checkpoint: {
        bookId: work.binding.bookId,
        manuscriptId: work.binding.manuscriptId,
        branchId: work.binding.branchId,
        revisionId: work.revisionId,
        revisionLabel: work.revisionLabel,
        revisionDigest: work.binding.workingDigest,
        journalSequence: work.binding.journalSequence,
        createdForDirtyJournal: true,
      },
    };
  }

  finalizeReimportCheckpointWork(workId: string, persistComparison: () => void): ReimportCheckpointBinding {
    requireBounded(UUID_PATTERN.test(workId), 'JOB_INVALID', '重新导入固定点任务标识无效。');
    const work = this.#reimportCheckpointWork.get(workId);
    requireBounded(work !== undefined && work.state === 'prepared', 'REIMPORT_CHECKPOINT_INVALID',
      '重新导入固定点尚未完成有界准备。');
    const checkpoint = transact(this.#db, () => {
      const exact = this.#binding(work.binding.manuscriptId, work.binding.branchId);
      requireBounded(
        exact.revisionId === work.binding.revisionId && exact.journalSequence === work.binding.journalSequence &&
          exact.workingDigest === work.binding.workingDigest && exact.totalCharacters === work.binding.totalCharacters,
        'REIMPORT_CHECKPOINT_STALE', '建立重新导入安全固定点时稿件已变化。',
      );
      this.#db.prepare(
        `INSERT INTO manuscript_revisions(
           revision_id, manuscript_id, branch_id, ordinal, revision_label, parent_revision_id,
           source_version_id, revision_digest, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(work.revisionId, work.binding.manuscriptId, work.binding.branchId,
        Number(work.revisionLabel.slice(1)), work.revisionLabel, work.binding.revisionId,
        work.sourceVersionId, work.binding.workingDigest, work.createdAt);
      const copied = this.#db.prepare(
        `INSERT INTO manuscript_block_versions(
           revision_id, block_id, position, kind, level, text, digest, start_offset, grapheme_length
         ) SELECT ?, block_id, position, kind, level, text, digest, start_offset, grapheme_length
           FROM temp.reimport_checkpoint_rows WHERE work_id = ? ORDER BY position`,
      ).run(work.revisionId, workId);
      requireBounded(copied.changes === work.totalBlocks, 'REIMPORT_CHECKPOINT_INVALID',
        '重新导入固定点内容块不完整。');
      requireBounded(this.#db.prepare(
        `UPDATE branch_working_state SET base_revision_id = ?, last_checkpoint_sequence = ?
         WHERE branch_id = ? AND base_revision_id = ? AND journal_sequence = ? AND working_digest = ?`,
      ).run(work.revisionId, work.binding.journalSequence, work.binding.branchId, work.binding.revisionId,
        work.binding.journalSequence, work.binding.workingDigest).changes === 1,
      'REIMPORT_CHECKPOINT_STALE', '建立重新导入安全固定点时稿件已变化。');
      requireBounded(this.#db.prepare(
        'UPDATE manuscript_branches SET base_revision_id = ? WHERE branch_id = ? AND base_revision_id = ?',
      ).run(work.revisionId, work.binding.branchId, work.binding.revisionId).changes === 1,
      'REIMPORT_CHECKPOINT_STALE', '建立重新导入安全固定点时分支已变化。');
      persistComparison();
      this.#db.prepare('DELETE FROM temp.reimport_checkpoint_rows WHERE work_id = ?').run(workId);
      const completed = this.#binding(work.binding.manuscriptId, work.binding.branchId);
      return {
        bookId: completed.bookId,
        manuscriptId: completed.manuscriptId,
        branchId: completed.branchId,
        revisionId: completed.revisionId,
        revisionLabel: completed.revisionLabel,
        revisionDigest: completed.workingDigest,
        journalSequence: completed.journalSequence,
        createdForDirtyJournal: true,
      };
    });
    this.#reimportCheckpointWork.delete(workId);
    return checkpoint;
  }

  cancelReimportCheckpointWork(workId: string): boolean {
    requireBounded(UUID_PATTERN.test(workId), 'JOB_INVALID', '重新导入固定点任务标识无效。');
    if (!this.#reimportCheckpointWork.delete(workId)) return false;
    this.#db.prepare('DELETE FROM temp.reimport_checkpoint_rows WHERE work_id = ?').run(workId);
    return true;
  }

  startServiceLifetime(lifetimeId: string, startedAt: string): void {
    requireBounded(UUID_PATTERN.test(lifetimeId) && startedAt.isWellFormed(), 'LIFETIME_INVALID', '本地服务生命周期标识无效。');
    transact(this.#db, () => {
      const interrupted = this.#db.prepare(
        "SELECT lifetime_id FROM service_lifetimes WHERE outcome = 'running' ORDER BY started_at, lifetime_id",
      ).all() as SqlRow[];
      for (const row of interrupted) {
        const interruptedLifetimeId = asString(row.lifetime_id);
        requireBounded(
          this.#db.prepare(
            "UPDATE service_lifetimes SET outcome = 'interrupted', ended_at = ? WHERE lifetime_id = ? AND outcome = 'running'",
          ).run(startedAt, interruptedLifetimeId).changes === 1,
          'LIFETIME_STATE_CHANGED',
          '本地服务生命周期状态已变化。',
        );
        const branches = this.#db.prepare(
          `SELECT b.book_id, lw.manuscript_id, lw.branch_id, lw.checkpoint_revision_id,
                  lw.checkpoint_sequence, lw.reconstruction_base_sequence, lw.reconstruction_base_digest,
                  lw.high_water_sequence, lw.high_water_digest,
                  lw.last_durable_at, lw.entry_count,
                  bws.base_revision_id, bws.last_checkpoint_sequence, bws.journal_sequence, bws.working_digest
           FROM service_lifetime_branch_writes lw
           JOIN branch_working_state bws ON bws.branch_id = lw.branch_id
           JOIN manuscripts m ON m.manuscript_id = bws.manuscript_id
           JOIN books b ON b.book_id = m.book_id
           WHERE lw.lifetime_id = ? AND lw.high_water_sequence > bws.last_checkpoint_sequence
           ORDER BY lw.branch_id`,
        ).all(interruptedLifetimeId) as SqlRow[];
        for (const branch of branches) {
          requireBounded(
            asString(branch.checkpoint_revision_id) === asString(branch.base_revision_id) &&
              asNumber(branch.checkpoint_sequence) === asNumber(branch.last_checkpoint_sequence) &&
              asNumber(branch.reconstruction_base_sequence) >= asNumber(branch.checkpoint_sequence) &&
              asNumber(branch.reconstruction_base_sequence) < asNumber(branch.high_water_sequence) &&
              asNumber(branch.high_water_sequence) === asNumber(branch.journal_sequence) &&
              asString(branch.high_water_digest) === asString(branch.working_digest),
            'RECOVERY_CLASSIFICATION_UNCERTAIN',
            '无法精确判定中断生命周期的最近持久写入边界。',
          );
          const evidence = one(this.#db.prepare(
            `SELECT count(*) total, max(sequence) high_water
             FROM edit_journal_entries
             WHERE branch_id = ? AND service_lifetime_id = ? AND sequence > ?`,
          ).all(asString(branch.branch_id), interruptedLifetimeId, asNumber(branch.reconstruction_base_sequence)) as SqlRow[],
          'RECOVERY_CLASSIFICATION_UNCERTAIN', '无法读取中断生命周期的修订日志证据。');
          requireBounded(
            asNumber(evidence.total) === asNumber(branch.entry_count) &&
              asNumber(evidence.high_water) === asNumber(branch.high_water_sequence),
            'RECOVERY_CLASSIFICATION_UNCERTAIN',
            '中断生命周期高水位与修订日志证据不一致。',
          );
          const finalEntry = one(this.#db.prepare(
            `SELECT resulting_working_digest, durable_at FROM edit_journal_entries
             WHERE branch_id = ? AND sequence = ? AND service_lifetime_id = ?`,
          ).all(asString(branch.branch_id), asNumber(branch.high_water_sequence), interruptedLifetimeId) as SqlRow[],
          'RECOVERY_CLASSIFICATION_UNCERTAIN', '无法精确读取中断生命周期的最近持久写入记录。');
          requireBounded(
            asString(finalEntry.resulting_working_digest) === asString(branch.working_digest),
            'RECOVERY_CLASSIFICATION_UNCERTAIN',
            '中断生命周期的工作状态摘要不一致。',
          );
          verifyRecoveryJournalReconstruction(
            this.#db,
            asString(branch.branch_id),
            asString(branch.manuscript_id),
            asString(branch.checkpoint_revision_id),
            asNumber(branch.checkpoint_sequence),
            interruptedLifetimeId,
            asNumber(branch.reconstruction_base_sequence),
            asString(branch.reconstruction_base_digest),
            asNumber(branch.journal_sequence),
          );
          const unresolved = this.#db.prepare(
            "SELECT 1 ok FROM recovery_attention WHERE branch_id = ? AND status IN ('pending', 'deferred') LIMIT 1",
          ).get(asString(branch.branch_id));
          if (unresolved !== undefined) continue;
          this.#db.prepare(
            `INSERT INTO recovery_attention(
               attention_id, interrupted_lifetime_id, book_id, manuscript_id, branch_id,
               checkpoint_revision_id, checkpoint_sequence, journal_sequence, journal_working_digest,
               last_durable_at, journal_entry_count, journal_reconstruction_verified_at,
               status, attention_version, created_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 1, ?)`,
          ).run(
            randomUUID(), interruptedLifetimeId, asString(branch.book_id), asString(branch.manuscript_id),
            asString(branch.branch_id), asString(branch.checkpoint_revision_id), asNumber(branch.checkpoint_sequence),
            asNumber(branch.journal_sequence), asString(branch.working_digest), asString(finalEntry.durable_at),
            asNumber(branch.journal_sequence) - asNumber(branch.checkpoint_sequence), startedAt, startedAt,
          );
        }
      }
      this.#db.prepare(
        "INSERT INTO service_lifetimes(lifetime_id, started_at, outcome) VALUES (?, ?, 'running')",
      ).run(lifetimeId, startedAt);
    });
  }

  markServiceLifetimeClean(lifetimeId: string, endedAt: string): void {
    requireBounded(UUID_PATTERN.test(lifetimeId) && endedAt.isWellFormed(), 'LIFETIME_INVALID', '本地服务生命周期标识无效。');
    transact(this.#db, () => {
      requireBounded(
        this.#db.prepare(
          "UPDATE service_lifetimes SET outcome = 'clean', ended_at = ? WHERE lifetime_id = ? AND outcome = 'running'",
        ).run(endedAt, lifetimeId).changes === 1,
        'LIFETIME_STATE_CHANGED',
        '本地服务生命周期无法重复结束。',
      );
    });
  }

  prepareMilestoneRecoverySnapshot(
    manuscriptId: string,
    branchId: string,
    labelInput: string,
    purposeInput: string,
    noteInput: string,
  ): RecoverySnapshotPlan {
    const label = validateShortText(labelInput, 80, 'MILESTONE_INVALID', '里程碑标签必须为 1–80 个字符。');
    const purpose = validateShortText(purposeInput, 120, 'MILESTONE_INVALID', '里程碑用途必须为 1–120 个字符。');
    const note = validateShortText(noteInput, 500, 'MILESTONE_INVALID', '里程碑备注过长。', true) || null;
    const binding = this.#binding(manuscriptId, branchId);
    this.#requireBranchEditable(branchId);
    requireBounded(
      this.#db.prepare('SELECT 1 ok FROM milestone_versions WHERE branch_id = ? AND label = ?').get(branchId, label) === undefined,
      'MILESTONE_LABEL_EXISTS',
      '该分支已存在同名里程碑。',
    );
    const previous = one(this.#db.prepare(
      'SELECT source_version_id, ordinal FROM manuscript_revisions WHERE revision_id = ?',
    ).all(binding.revisionId) as SqlRow[], 'MILESTONE_INVALID', '当前修订版缺失。');
    const dirty = binding.journalSequence > binding.lastCheckpointSequence;
    const revisionId = dirty ? randomUUID() : binding.revisionId;
    const revisionLabel = dirty ? `r${asNumber(previous.ordinal) + 1}` : binding.revisionLabel;
    const count = one(this.#db.prepare(
      'SELECT count(*) block_count FROM working_blocks WHERE branch_id = ?',
    ).all(branchId) as SqlRow[], 'MILESTONE_INVALID', '工作稿内容块无法读取。');
    const blockCount = asNumber(count.block_count);
    requireBounded(blockCount > 0, 'MILESTONE_INVALID', '工作稿没有可保存内容。');
    return {
      snapshotId: randomUUID(), milestoneId: randomUUID(), signoffRecordId: randomUUID(),
      bookId: binding.bookId, manuscriptId, branchId, expectedBaseRevisionId: binding.revisionId,
      expectedJournalSequence: binding.journalSequence, expectedWorkingDigest: binding.workingDigest,
      revisionId, revisionLabel, sourceVersionId: asString(previous.source_version_id), blockCount,
      totalGraphemes: binding.totalCharacters, label, purpose, note, createdAt: new Date().toISOString(),
    };
  }

  getRecoverySnapshotBlocks(plan: RecoverySnapshotPlan, afterPosition: number): ReadonlyArray<RecoverySnapshotBlock> {
    requireBounded(Number.isSafeInteger(afterPosition) && afterPosition >= 0, 'SNAPSHOT_INVALID', '恢复快照批次位置无效。');
    const binding = this.#binding(plan.manuscriptId, plan.branchId);
    requireBounded(
      binding.revisionId === plan.expectedBaseRevisionId &&
        binding.journalSequence === plan.expectedJournalSequence &&
        binding.workingDigest === plan.expectedWorkingDigest,
      'MILESTONE_STALE',
      '稿件已变化，里程碑与恢复快照未提交。',
    );
    return (this.#db.prepare(
      `SELECT block_id, position, kind, level, text, digest, grapheme_length
       FROM working_blocks WHERE branch_id = ? AND position > ? ORDER BY position LIMIT ?`,
    ).all(plan.branchId, afterPosition, MIGRATION_BATCH) as SqlRow[]).map((row) => ({
      blockId: asString(row.block_id), position: asNumber(row.position),
      kind: asString(row.kind) as ManuscriptBlockProjection['kind'],
      level: row.level === null ? null : asNumber(row.level), text: asString(row.text),
      digest: asString(row.digest), graphemeLength: asNumber(row.grapheme_length),
    }));
  }

  listPriorWork(): ReadonlyArray<PriorWorkItemProjection> {
    const rows = this.#db.prepare(
      `SELECT b.book_id, b.title, m.manuscript_id, mb.branch_id, mb.name branch_name,
              mr.revision_id, mr.revision_label, bws.journal_sequence, bws.working_digest, bws.total_graphemes,
              mv.milestone_id, mv.label milestone_label, mv.purpose milestone_purpose, mvr.revision_label milestone_revision_label,
              ra.attention_id, ra.attention_version, ra.status attention_status
       FROM branch_working_state bws
       JOIN manuscript_branches mb ON mb.branch_id = bws.branch_id
       JOIN manuscripts m ON m.manuscript_id = bws.manuscript_id
       JOIN books b ON b.book_id = m.book_id
       JOIN manuscript_revisions mr ON mr.revision_id = bws.base_revision_id
       LEFT JOIN milestone_versions mv ON mv.milestone_id = (
         SELECT milestone_id FROM milestone_versions WHERE branch_id = mb.branch_id ORDER BY created_at DESC, milestone_id DESC LIMIT 1
       )
       LEFT JOIN manuscript_revisions mvr ON mvr.revision_id = mv.revision_id
       LEFT JOIN recovery_attention ra ON ra.attention_id = (
         SELECT attention_id FROM recovery_attention
         WHERE branch_id = mb.branch_id AND status IN ('pending', 'deferred')
         ORDER BY created_at, attention_id LIMIT 1
       )
       ORDER BY b.created_at DESC, b.book_id DESC LIMIT 20`,
    ).all() as SqlRow[];
    return rows.map((row) => ({
      bookId: asString(row.book_id),
      bookTitle: asString(row.title),
      manuscriptId: asString(row.manuscript_id),
      branchId: asString(row.branch_id),
      branchName: asString(row.branch_name),
      revisionId: asString(row.revision_id),
      revisionLabel: asString(row.revision_label),
      journalSequence: asNumber(row.journal_sequence),
      workingDigest: asString(row.working_digest),
      totalCharacters: asNumber(row.total_graphemes),
      latestMilestone: row.milestone_id === null ? null : {
        milestoneId: asString(row.milestone_id),
        label: asString(row.milestone_label),
        purpose: asString(row.milestone_purpose),
        revisionLabel: asString(row.milestone_revision_label),
      },
      recoveryAttention: row.attention_id === null ? null : {
        attentionId: asString(row.attention_id),
        attentionVersion: asNumber(row.attention_version),
        status: asString(row.attention_status) as 'pending' | 'deferred',
        label: '恢复待确认状态',
      },
    }));
  }

  resolveBookWorkbenchRoute(route: BookWorkbenchRoute): ResolvedBookWorkbenchRoute {
    if (route.kind === 'book') {
      requireBounded(UUID_PATTERN.test(route.bookId), 'BOOK_INVALID', '图书标识无效。');
      const book = one(this.#db.prepare(
        'SELECT book_id, title FROM books WHERE book_id = ?',
      ).all(route.bookId) as SqlRow[], 'BOOK_NOT_FOUND', '图书不存在。');
      return {
        kind: 'book',
        bookId: asString(book.book_id),
        bookTitle: asString(book.title),
      };
    }
    requireBounded(UUID_PATTERN.test(route.revisionId), 'REVISION_INVALID', '稿件修订版标识无效。');
    const revision = one(this.#db.prepare(
      `SELECT b.book_id, b.title, mr.manuscript_id, mr.branch_id, mr.revision_id, mr.revision_label
       FROM manuscript_revisions mr
       JOIN manuscripts m ON m.manuscript_id = mr.manuscript_id
       JOIN manuscript_branches branch ON branch.branch_id = mr.branch_id
         AND branch.manuscript_id = mr.manuscript_id
       JOIN books b ON b.book_id = m.book_id
       JOIN source_versions source ON source.source_version_id = mr.source_version_id
         AND source.book_id = m.book_id
       LEFT JOIN manuscript_revisions parent ON parent.revision_id = mr.parent_revision_id
         AND parent.manuscript_id = mr.manuscript_id AND parent.branch_id = mr.branch_id
       WHERE mr.revision_id = ? AND (mr.parent_revision_id IS NULL OR parent.revision_id IS NOT NULL)`,
    ).all(route.revisionId) as SqlRow[], 'REVISION_NOT_FOUND', '稿件修订版不存在。');
    return {
      kind: 'revision',
      bookId: asString(revision.book_id),
      bookTitle: asString(revision.title),
      manuscriptId: asString(revision.manuscript_id),
      branchId: asString(revision.branch_id),
      revisionId: asString(revision.revision_id),
      revisionLabel: asString(revision.revision_label),
    };
  }

  getHistoricalRevision(revisionId: string, cursor: string | null): HistoricalRevisionProjection {
    requireBounded(UUID_PATTERN.test(revisionId), 'REVISION_INVALID', '稿件修订版标识无效。');
    const revision = one(this.#db.prepare(
      `SELECT b.book_id, b.title, mr.manuscript_id, mr.branch_id, mr.revision_id, mr.revision_label,
              mr.revision_digest, mr.parent_revision_id, mr.source_version_id, mr.created_at,
              count(mbv.block_id) total_blocks,
              COALESCE(sum(mbv.grapheme_length), 0) total_characters
       FROM manuscript_revisions mr
       JOIN manuscripts m ON m.manuscript_id = mr.manuscript_id
       JOIN manuscript_branches branch ON branch.branch_id = mr.branch_id
         AND branch.manuscript_id = mr.manuscript_id
       JOIN books b ON b.book_id = m.book_id
       JOIN source_versions source ON source.source_version_id = mr.source_version_id
         AND source.book_id = m.book_id
       LEFT JOIN manuscript_revisions parent ON parent.revision_id = mr.parent_revision_id
         AND parent.manuscript_id = mr.manuscript_id AND parent.branch_id = mr.branch_id
       JOIN manuscript_block_versions mbv ON mbv.revision_id = mr.revision_id
       JOIN manuscript_blocks block ON block.block_id = mbv.block_id
         AND block.manuscript_id = mr.manuscript_id
       JOIN manuscript_revisions created ON created.revision_id = block.created_revision_id
         AND created.manuscript_id = mr.manuscript_id
       WHERE mr.revision_id = ? AND (mr.parent_revision_id IS NULL OR parent.revision_id IS NOT NULL)
       GROUP BY b.book_id, b.title, mr.manuscript_id, mr.branch_id, mr.revision_id, mr.revision_label,
                mr.revision_digest, mr.parent_revision_id, mr.source_version_id, mr.created_at`,
    ).all(revisionId) as SqlRow[], 'REVISION_NOT_FOUND', '稿件修订版不存在或内容不完整。');
    const totalBlocks = asNumber(revision.total_blocks);
    const totalCharacters = asNumber(revision.total_characters);
    requireBounded(totalBlocks > 0 && totalCharacters >= 0, 'REVISION_INVALID', '稿件修订版内容不完整。');
    const startPosition = cursor === null
      ? 1
      : this.#decodeSimpleCursor(cursor, `historical-revision:${revisionId}`);
    requireBounded(startPosition >= 1 && startPosition <= totalBlocks, 'CURSOR_INVALID', '稿件修订版位置已失效。');
    const rows = this.#db.prepare(
      `SELECT version.block_id, version.position, version.kind, version.level, version.text,
              version.digest, version.start_offset, version.grapheme_length
       FROM manuscript_block_versions version
       JOIN manuscript_blocks block ON block.block_id = version.block_id AND block.manuscript_id = ?
       WHERE version.revision_id = ? AND version.position >= ?
       ORDER BY version.position LIMIT ?`,
    ).all(asString(revision.manuscript_id), revisionId, startPosition, MAX_WINDOW_BLOCKS + 1) as SqlRow[];
    const visible = rows.slice(0, MAX_WINDOW_BLOCKS);
    requireBounded(visible.length > 0 && visible.length <= MAX_WINDOW_BLOCKS, 'REVISION_NOT_FOUND', '稿件修订版窗口为空。');
    const first = visible[0]!;
    const last = visible.at(-1)!;
    const structure = this.#db.prepare(
      `SELECT version.text FROM manuscript_block_versions version
       JOIN manuscript_blocks block ON block.block_id = version.block_id AND block.manuscript_id = ?
       WHERE version.revision_id = ? AND version.position <= ? AND version.kind IN ('title', 'heading')
       ORDER BY version.position DESC LIMIT 1`,
    ).get(asString(revision.manuscript_id), revisionId, asNumber(first.position)) as SqlRow | undefined;
    const startCharacter = asNumber(first.start_offset);
    const endCharacter = asNumber(last.start_offset) + asNumber(last.grapheme_length);
    return {
      mode: 'historical-revision',
      readOnly: true,
      bookId: asString(revision.book_id),
      bookTitle: asString(revision.title),
      manuscriptId: asString(revision.manuscript_id),
      branchId: asString(revision.branch_id),
      revisionId: asString(revision.revision_id),
      revisionLabel: asString(revision.revision_label),
      revisionDigest: asString(revision.revision_digest),
      parentRevisionId: revision.parent_revision_id === null ? null : asString(revision.parent_revision_id),
      sourceVersionId: asString(revision.source_version_id),
      createdAt: asString(revision.created_at),
      previousCursor: startPosition > 1
        ? this.#encodeSimpleCursor(`historical-revision:${revisionId}`, Math.max(1, startPosition - WINDOW_STRIDE))
        : null,
      nextCursor: rows.length > MAX_WINDOW_BLOCKS
        ? this.#encodeSimpleCursor(`historical-revision:${revisionId}`, startPosition + WINDOW_STRIDE)
        : null,
      position: {
        startBlock: asNumber(first.position),
        endBlock: asNumber(last.position),
        totalBlocks,
        startCharacter,
        endCharacter,
        totalCharacters,
        structureLabel: structure ? asString(structure.text) : null,
        label: `${structure ? `${asString(structure.text)} · ` : ''}只读修订版 ${asNumber(first.position)}–${asNumber(last.position)} / ${totalBlocks} 个内容块`,
      },
      blocks: visible.map((row) => ({
        blockId: asString(row.block_id),
        position: asNumber(row.position),
        kind: asString(row.kind) as ManuscriptBlockProjection['kind'],
        level: row.level === null ? null : asNumber(row.level),
        text: asString(row.text),
        digest: asString(row.digest),
      })),
    };
  }

  firstRecoveryAttentionId(): string | null {
    const row = this.#db.prepare(
      `SELECT attention_id FROM recovery_attention WHERE status IN ('pending', 'deferred')
       ORDER BY created_at, attention_id LIMIT 1`,
    ).get() as SqlRow | undefined;
    return row === undefined ? null : asString(row.attention_id);
  }

  nextRecoverySnapshotForAttention(
    attentionId: string,
    before: RecoverySnapshotCursor | null,
  ): RecoverySnapshotRecord | null {
    requireBounded(UUID_PATTERN.test(attentionId), 'RECOVERY_INVALID', '恢复待确认标识无效。');
    if (before !== null) {
      requireBounded(
        before.createdAt.isWellFormed() && UUID_PATTERN.test(before.snapshotId),
        'RECOVERY_SNAPSHOT_INELIGIBLE',
        '恢复快照遍历边界无效。',
      );
    }
    const row = this.#db.prepare(
      `SELECT rs.* FROM recovery_attention ra
       JOIN recovery_snapshots rs ON rs.branch_id = ra.branch_id
         AND rs.revision_id = ra.checkpoint_revision_id
       WHERE ra.attention_id = ? AND ra.status IN ('pending', 'deferred')
         AND (? IS NULL OR rs.created_at < ? OR (rs.created_at = ? AND rs.snapshot_id < ?))
       ORDER BY rs.created_at DESC, rs.snapshot_id DESC LIMIT 1`,
    ).get(attentionId, before?.createdAt ?? null, before?.createdAt ?? null,
      before?.createdAt ?? null, before?.snapshotId ?? null) as SqlRow | undefined;
    return row === undefined ? null : this.#snapshotRecord(row);
  }

  recoverySnapshotByIdForAttention(attentionId: string, snapshotId: string): RecoverySnapshotRecord {
    return this.#snapshotRecord(this.#requireAttentionSnapshot(attentionId, snapshotId));
  }

  getRecoveryComparison(attentionId: string, snapshot: VerifiedRecoverySnapshot): RecoveryComparisonProjection {
    requireBounded(UUID_PATTERN.test(attentionId), 'RECOVERY_INVALID', '恢复待确认标识无效。');
    const row = one(this.#db.prepare(
      `SELECT ra.*, b.title book_title, mb.name branch_name,
              mr.revision_label checkpoint_revision_label, mr.revision_digest checkpoint_revision_digest,
              mr.created_at checkpoint_created_at,
              mv.milestone_id, mv.label milestone_label, mv.created_at milestone_created_at
       FROM recovery_attention ra
       JOIN books b ON b.book_id = ra.book_id
       JOIN manuscript_branches mb ON mb.branch_id = ra.branch_id
       JOIN manuscript_revisions mr ON mr.revision_id = ra.checkpoint_revision_id
       LEFT JOIN milestone_versions mv ON mv.milestone_id = (
         SELECT milestone_id FROM milestone_versions WHERE revision_id = ra.checkpoint_revision_id
         ORDER BY created_at DESC, milestone_id DESC LIMIT 1
       )
       WHERE ra.attention_id = ? AND ra.status IN ('pending', 'deferred')`,
    ).all(attentionId) as SqlRow[], 'RECOVERY_NOT_FOUND', '恢复待确认状态不存在或已经处理。');
    const checkpointSequence = asNumber(row.checkpoint_sequence);
    const journalSequence = asNumber(row.journal_sequence);
    const journalEntryCount = asNumber(row.journal_entry_count);
    const checkpointLabel = asString(row.checkpoint_revision_label);
    const extent = `从检查点日志序号 ${checkpointSequence} 到最近持久序号 ${journalSequence}，覆盖 ${journalEntryCount} 条已确认修订日志`;
    const journal = {
      kind: 'journal', candidateId: `${attentionId}:journal`, title: '恢复的工作状态',
      revisionId: asString(row.checkpoint_revision_id), revisionLabel: `${checkpointLabel} + 修订日志`,
      revisionDigest: asString(row.journal_working_digest), journalSequence,
      durableAt: asString(row.last_durable_at), coveredChangeExtent: extent,
      verification: '已从检查点有界重放并与 SQLite 持久工作状态核对',
      limitation: '仅保证最近持久写入边界以内的已确认修订日志；未确认的进程内输入不属于恢复证据。',
      snapshotId: null,
    } satisfies RecoveryComparisonProjection['journal'];
    const checkpointTitle = row.milestone_id === null
      ? '相关稿件检查点'
      : `相关里程碑版本「${asString(row.milestone_label)}」`;
    const checkpoint = {
      kind: 'checkpoint', candidateId: `${attentionId}:checkpoint`, title: checkpointTitle,
      revisionId: asString(row.checkpoint_revision_id), revisionLabel: checkpointLabel,
      revisionDigest: asString(row.checkpoint_revision_digest), journalSequence: checkpointSequence,
      durableAt: row.milestone_created_at === null ? asString(row.checkpoint_created_at) : asString(row.milestone_created_at),
      coveredChangeExtent: `不可变修订版 ${checkpointLabel}，不含其后 ${journalEntryCount} 条已确认修订日志`,
      verification: '已由 SQLite 权威记录核对',
      limitation: '选择此状态不会删除更新的修订日志恢复材料。', snapshotId: null,
    } satisfies RecoveryComparisonProjection['checkpoint'];
    let snapshotProjection: RecoverySnapshotComparisonProjection;
    if (snapshot.state === 'none') {
      snapshotProjection = { state: 'none', limitation: '没有适用的恢复快照' };
    } else if (snapshot.state === 'unavailable') {
      snapshotProjection = {
        state: 'unavailable', snapshotId: snapshot.snapshotId, verification: snapshot.verification,
        limitation: snapshot.limitation,
      };
    } else {
      const record = snapshot.record;
      snapshotProjection = {
        state: 'eligible',
        candidate: {
          kind: 'snapshot', candidateId: `${attentionId}:snapshot:${record.snapshotId}`,
          title: '已验证恢复快照', revisionId: record.revisionId, revisionLabel: record.revisionLabel,
          revisionDigest: record.revisionDigest, journalSequence: record.journalSequence,
          durableAt: record.verifiedAt,
          coveredChangeExtent: `${record.blockCount} 个内容块 · ${record.totalGraphemes.toLocaleString('zh-CN')} 个字素`,
          verification: '已独立校验快照对象',
          limitation: '快照只覆盖其成功里程碑边界，不包含其后的修订日志。', snapshotId: record.snapshotId,
        },
      };
    }
    const unresolved = one(this.#db.prepare(
      "SELECT count(*) total FROM recovery_attention WHERE status IN ('pending', 'deferred')",
    ).all() as SqlRow[], 'RECOVERY_INVALID', '无法读取恢复待确认数量。');
    return {
      attentionId, attentionVersion: asNumber(row.attention_version),
      status: asString(row.status) as 'pending' | 'deferred', unresolvedCount: asNumber(unresolved.total),
      bookId: asString(row.book_id), bookTitle: asString(row.book_title),
      manuscriptId: asString(row.manuscript_id), branchId: asString(row.branch_id), branchName: asString(row.branch_name),
      lastDurableEditBoundary: {
        journalSequence, durableAt: asString(row.last_durable_at), coveredChangeExtent: extent,
        uncertainty: '最近持久写入边界之后、未获得修订日志确认的输入可能不存在；AI7 不把渲染器或进程内缓冲描述为可恢复。',
      },
      journal, checkpoint, snapshot: snapshotProjection,
      otherPriorWork: this.listPriorWork().filter((item) => item.branchId !== asString(row.branch_id)),
    };
  }

  recordRecoveryView(
    attentionId: string,
    expectedAttentionVersion: number,
    selection: RecoverySelection,
  ): void {
    const attention = this.#requireRecoveryAttention(attentionId, expectedAttentionVersion);
    const snapshotId = selection.kind === 'snapshot' ? selection.snapshotId : null;
    if (snapshotId !== null) this.#requireAttentionSnapshot(attentionId, snapshotId);
    const decidedAt = new Date().toISOString();
    this.#db.prepare(
      `INSERT INTO recovery_decisions(
         decision_id, attention_id, attention_version, kind, selected_kind, selected_snapshot_id,
         request_fingerprint, decided_at
       ) VALUES (?, ?, ?, 'view', ?, ?, ?, ?)`,
    ).run(randomUUID(), attentionId, asNumber(attention.attention_version), selection.kind, snapshotId,
      sha256(canonicalJson({ attentionId, expectedAttentionVersion, selection })), decidedAt);
  }

  getRecoveryDatabaseWindow(
    attentionId: string,
    selection: Exclude<RecoverySelection, { kind: 'snapshot' }>,
    target: RecoveryWindowTarget,
  ): RecoveryWindowProjection {
    const attention = this.#requireRecoveryAttention(attentionId);
    const start = target.kind === 'start' ? 1 : target.position + 1;
    requireBounded(Number.isSafeInteger(start) && start > 0, 'RECOVERY_WINDOW_INVALID', '恢复只读窗口位置无效。');
    const journal = selection.kind === 'journal';
    if (journal) {
      const binding = this.#binding(asString(attention.manuscript_id), asString(attention.branch_id));
      requireBounded(
        binding.journalSequence === asNumber(attention.journal_sequence) &&
          binding.workingDigest === asString(attention.journal_working_digest),
        'RECOVERY_STATE_CHANGED',
        '恢复的工作状态已变化，无法继续只读查看。',
      );
    }
    const source = journal ? 'working_blocks' : 'manuscript_block_versions';
    const ownerColumn = journal ? 'branch_id' : 'revision_id';
    const ownerId = journal ? asString(attention.branch_id) : asString(attention.checkpoint_revision_id);
    const rows = this.#db.prepare(
      `SELECT block_id, position, kind, level, text, digest FROM ${source}
       WHERE ${ownerColumn} = ? AND position >= ? ORDER BY position LIMIT ?`,
    ).all(ownerId, start, MAX_WINDOW_BLOCKS + 1) as SqlRow[];
    const visible = rows.slice(0, MAX_WINDOW_BLOCKS);
    requireBounded(visible.length > 0, 'RECOVERY_WINDOW_NOT_FOUND', '恢复只读内容窗口为空。');
    const revision = one(this.#db.prepare(
      'SELECT revision_label FROM manuscript_revisions WHERE revision_id = ?',
    ).all(asString(attention.checkpoint_revision_id)) as SqlRow[], 'RECOVERY_INVALID', '恢复检查点修订版缺失。');
    return {
      attentionId, selection, title: journal ? '恢复的工作状态' : '相关稿件检查点',
      revisionId: asString(attention.checkpoint_revision_id),
      revisionLabel: journal ? `${asString(revision.revision_label)} + 修订日志` : asString(revision.revision_label),
      readonly: true,
      blocks: visible.map((item) => ({
        blockId: asString(item.block_id), position: asNumber(item.position),
        kind: asString(item.kind) as ManuscriptBlockProjection['kind'],
        level: item.level === null ? null : asNumber(item.level), text: asString(item.text), digest: asString(item.digest),
      })),
      nextTarget: rows.length > MAX_WINDOW_BLOCKS
        ? { kind: 'after', position: asNumber(visible.at(-1)!.position) }
        : null,
    };
  }

  deferRecovery(
    attentionId: string,
    expectedAttentionVersion: number,
  ): Omit<RecoveryDeferralProjection, 'next'> {
    return transact(this.#db, () => {
      const attention = this.#requireRecoveryAttention(attentionId, expectedAttentionVersion);
      const decidedAt = new Date().toISOString();
      const nextVersion = asNumber(attention.attention_version) + 1;
      requireBounded(
        this.#db.prepare(
          `UPDATE recovery_attention SET status = 'deferred', attention_version = ?, deferred_at = ?
           WHERE attention_id = ? AND attention_version = ? AND status IN ('pending', 'deferred')`,
        ).run(nextVersion, decidedAt, attentionId, expectedAttentionVersion).changes === 1,
        'RECOVERY_STATE_CHANGED',
        '恢复待确认状态已变化。',
      );
      this.#db.prepare(
        `INSERT INTO recovery_decisions(
           decision_id, attention_id, attention_version, kind, selected_kind, selected_snapshot_id,
           request_fingerprint, decided_at
         ) VALUES (?, ?, ?, 'defer', NULL, NULL, ?, ?)`,
      ).run(randomUUID(), attentionId, expectedAttentionVersion,
        sha256(canonicalJson({ attentionId, expectedAttentionVersion, kind: 'defer' })), decidedAt);
      return {
        attentionId, attentionVersion: nextVersion, status: 'deferred',
        completionLabel: '已保留恢复待确认状态',
      };
    });
  }

  isRecoveryObjectReferenced(objectRelativeKey: string): boolean {
    return this.#db.prepare(
      'SELECT 1 ok FROM recovery_snapshots WHERE object_relative_key = ? LIMIT 1',
    ).get(objectRelativeKey) !== undefined;
  }

  beginRecoverySnapshotStage(attentionId: string, expectedAttentionVersion: number, snapshotId: string): void {
    const attention = this.#requireRecoveryAttention(attentionId);
    const snapshot = this.#requireAttentionSnapshot(attentionId, snapshotId);
    requireBounded(
      asNumber(attention.attention_version) === expectedAttentionVersion &&
      asString(snapshot.branch_id) === asString(attention.branch_id) &&
        asString(snapshot.revision_id) === asString(attention.checkpoint_revision_id),
      'RECOVERY_SNAPSHOT_INELIGIBLE',
      '恢复快照不适用于当前待确认状态。',
    );
    transact(this.#db, () => {
      this.#db.prepare('DELETE FROM recovery_restore_stages WHERE attention_id = ?').run(attentionId);
      this.#db.prepare(
        `INSERT INTO recovery_restore_stages(
           attention_id, selected_snapshot_id, expected_attention_version,
           expected_block_count, expected_total_graphemes, started_at
         ) VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(attentionId, snapshotId, expectedAttentionVersion, asNumber(snapshot.block_count),
        asNumber(snapshot.total_graphemes), new Date().toISOString());
    });
  }

  stageRecoverySnapshotBlocks(attentionId: string, blocks: ReadonlyArray<RecoverySnapshotBlock>): void {
    requireBounded(UUID_PATTERN.test(attentionId), 'RECOVERY_SNAPSHOT_INELIGIBLE', '恢复快照暂存标识无效。');
    requireBounded(blocks.length > 0 && blocks.length <= MIGRATION_BATCH, 'RECOVERY_SNAPSHOT_INELIGIBLE', '恢复快照批次无效。');
    this.#recoveryStageBinding(attentionId);
    const current = asNumber(one(this.#db.prepare(
      'SELECT count(*) total FROM recovery_restore_stage_blocks WHERE attention_id = ?',
    ).all(attentionId) as SqlRow[], 'RECOVERY_SNAPSHOT_INELIGIBLE', '恢复快照暂存计数缺失。').total);
    const insert = this.#db.prepare(
      `INSERT INTO recovery_restore_stage_blocks(
         attention_id, block_id, position, kind, level, text, digest, grapheme_length
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    transact(this.#db, () => {
      for (const [index, block] of blocks.entries()) {
        requireBounded(
          block.position === current + index + 1 && BLOCK_PATTERN.test(block.blockId) &&
            DIGEST_PATTERN.test(block.digest) && block.text.isWellFormed() &&
            block.text.length <= MAX_BLOCK_CODE_UNITS && stagedBlockLength(block.text, 'RECOVERY_SNAPSHOT_INELIGIBLE', '恢复快照文字超出有界范围。') === block.graphemeLength &&
            blockDigest(block.kind, block.level, block.text) === block.digest,
          'RECOVERY_SNAPSHOT_INELIGIBLE',
          '恢复快照批次无法精确校验。',
        );
        insert.run(attentionId, block.blockId, block.position, block.kind, block.level,
          block.text, block.digest, block.graphemeLength);
      }
    });
  }

  clearRecoveryStage(attentionId: string): void {
    requireBounded(UUID_PATTERN.test(attentionId), 'RECOVERY_SOURCE_INVALID', '恢复来源暂存标识无效。');
    this.#db.prepare('DELETE FROM recovery_restore_stages WHERE attention_id = ?').run(attentionId);
  }

  existingRecoveryRestoration(
    restorationId: string,
    attentionId: string,
    expectedAttentionVersion: number,
    selection: RecoverySelection,
  ): RecoveryRestorationProjection | null {
    requireBounded(UUID_PATTERN.test(restorationId), 'RECOVERY_INVALID', '恢复决定标识无效。');
    const row = this.#db.prepare(
      `SELECT rr.*, rd.request_fingerprint
       FROM recovery_restorations rr
       JOIN recovery_decisions rd ON rd.decision_id = rr.decision_id
       WHERE rr.restoration_id = ?`,
    ).get(restorationId) as SqlRow | undefined;
    if (row === undefined) return null;
    const fingerprint = sha256(canonicalJson({ restorationId, attentionId, expectedAttentionVersion, selection }));
    requireBounded(
      asString(row.attention_id) === attentionId && asString(row.request_fingerprint) === fingerprint,
      'RECOVERY_DECISION_CONFLICT',
      '恢复决定标识已绑定到其他请求。',
    );
    return this.#restorationProjection(row, selection);
  }

  restoreRecovery(
    restorationId: string,
    attentionId: string,
    expectedAttentionVersion: number,
    selection: RecoverySelection,
    comparisonSnapshotId: string | null,
  ): RecoveryRestorationProjection {
    requireBounded(UUID_PATTERN.test(restorationId), 'RECOVERY_INVALID', '恢复决定标识无效。');
    const fingerprint = sha256(canonicalJson({ restorationId, attentionId, expectedAttentionVersion, selection }));
    const existing = this.existingRecoveryRestoration(restorationId, attentionId, expectedAttentionVersion, selection);
    if (existing !== null) return existing;
    let result: RecoveryRestorationProjection | undefined;
    transact(this.#db, () => {
      const attention = this.#requireRecoveryAttention(attentionId, expectedAttentionVersion);
      const selectedSnapshotId = selection.kind === 'snapshot' ? selection.snapshotId : null;
      let snapshot: SqlRow | null = null;
      if (selectedSnapshotId !== null) {
        snapshot = this.#requireAttentionSnapshot(attentionId, selectedSnapshotId);
        const stage = this.#recoveryStageBinding(attentionId);
        requireBounded(
          asString(stage.selected_snapshot_id) === selectedSnapshotId &&
            asNumber(stage.expected_attention_version) === expectedAttentionVersion,
          'RECOVERY_STATE_CHANGED',
          '恢复快照暂存与决定不一致。',
        );
      }
      if (comparisonSnapshotId !== null) this.#requireAttentionSnapshot(attentionId, comparisonSnapshotId);
      const binding = this.#binding(asString(attention.manuscript_id), asString(attention.branch_id));
      requireBounded(
        binding.journalSequence === asNumber(attention.journal_sequence) &&
          binding.workingDigest === asString(attention.journal_working_digest),
        'RECOVERY_STATE_CHANGED',
        '恢复待确认工作状态已变化。',
      );
      const revision = one(this.#db.prepare(
        'SELECT max(ordinal) maximum, source_version_id FROM manuscript_revisions WHERE manuscript_id = ?',
      ).all(binding.manuscriptId) as SqlRow[], 'RECOVERY_SOURCE_INVALID', '稿件修订版序列缺失。');
      const descendantRevisionId = randomUUID();
      const descendantOrdinal = asNumber(revision.maximum) + 1;
      const descendantRevisionLabel = `r${descendantOrdinal}`;
      const sourceRevisionId = selection.kind === 'snapshot' ? asString(snapshot!.revision_id) : asString(attention.checkpoint_revision_id);
      const sourceWorkingDigest = selection.kind === 'journal'
        ? asString(attention.journal_working_digest)
        : selection.kind === 'snapshot' ? asString(snapshot!.revision_digest) : asString(one(this.#db.prepare(
            'SELECT revision_digest FROM manuscript_revisions WHERE revision_id = ?',
          ).all(sourceRevisionId) as SqlRow[], 'RECOVERY_SOURCE_INVALID', '恢复来源修订版缺失。').revision_digest);
      const now = new Date().toISOString();
      let rebuiltTotal = binding.totalCharacters;
      if (selection.kind !== 'journal') {
        let expectedBlocks: number;
        let expectedGraphemes: number;
        if (selection.kind === 'snapshot') {
          const staged = this.#validateRecoveryStageBlocks(attentionId, binding.manuscriptId);
          expectedBlocks = asNumber(snapshot!.block_count);
          expectedGraphemes = asNumber(snapshot!.total_graphemes);
          requireBounded(
            staged.blockCount === expectedBlocks && staged.totalGraphemes === expectedGraphemes,
            'RECOVERY_SOURCE_INVALID',
            '恢复快照暂存不完整。',
          );
        } else {
          const inventory = one(this.#db.prepare(
            `SELECT count(*) total, coalesce(sum(grapheme_length), 0) graphemes
             FROM manuscript_block_versions WHERE revision_id = ?`,
          ).all(asString(attention.checkpoint_revision_id)) as SqlRow[], 'RECOVERY_SOURCE_INVALID', '恢复检查点清单缺失。');
          expectedBlocks = asNumber(inventory.total);
          expectedGraphemes = asNumber(inventory.graphemes);
        }
        requireBounded(expectedBlocks > 0, 'RECOVERY_SOURCE_INVALID', '恢复来源没有内容块。');
        this.#db.prepare('DELETE FROM working_blocks WHERE branch_id = ?').run(binding.branchId);
        if (selection.kind === 'snapshot') {
          this.#db.prepare(
            `INSERT INTO working_blocks(branch_id, block_id, position, kind, level, text, digest, grapheme_length)
             SELECT ?, block_id, position, kind, level, text, digest, grapheme_length
             FROM recovery_restore_stage_blocks WHERE attention_id = ? ORDER BY position`,
          ).run(binding.branchId, attentionId);
        } else {
          this.#db.prepare(
            `INSERT INTO working_blocks(branch_id, block_id, position, kind, level, text, digest, grapheme_length)
             SELECT ?, block_id, position, kind, level, text, digest, grapheme_length
             FROM manuscript_block_versions WHERE revision_id = ? ORDER BY position`,
          ).run(binding.branchId, asString(attention.checkpoint_revision_id));
        }
        rebuiltTotal = rebuildBranchDerived(this.#db, binding.branchId);
        requireBounded(rebuiltTotal === expectedGraphemes, 'RECOVERY_SOURCE_INVALID', '恢复来源字符总数不一致。');
      }
      this.#db.prepare(
        `INSERT INTO manuscript_revisions(
           revision_id, manuscript_id, branch_id, ordinal, revision_label, parent_revision_id,
           source_version_id, revision_digest, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(descendantRevisionId, binding.manuscriptId, binding.branchId, descendantOrdinal, descendantRevisionLabel,
        binding.revisionId, asString(revision.source_version_id), sourceWorkingDigest, now);
      snapshotWorkingRevision(this.#db, binding.branchId, descendantRevisionId, rebuiltTotal);
      this.#db.prepare(
        `UPDATE manuscript_command_groups SET status = 'superseded'
         WHERE branch_id = ? AND ordinal <= ? AND status IN ('applied', 'undone')`,
      ).run(binding.branchId, binding.historySequence);
      requireBounded(
        this.#db.prepare(
          `UPDATE branch_working_state SET base_revision_id = ?, working_digest = ?, total_graphemes = ?,
             last_checkpoint_sequence = journal_sequence, history_boundary_sequence = history_sequence
           WHERE branch_id = ? AND base_revision_id = ? AND journal_sequence = ? AND working_digest = ?`,
        ).run(descendantRevisionId, sourceWorkingDigest, rebuiltTotal, binding.branchId, binding.revisionId,
          binding.journalSequence, binding.workingDigest).changes === 1,
        'RECOVERY_STATE_CHANGED',
        '恢复提交时稿件状态已变化。',
      );
      this.#db.prepare('UPDATE manuscript_branches SET base_revision_id = ? WHERE branch_id = ?')
        .run(descendantRevisionId, binding.branchId);
      const decisionId = randomUUID();
      this.#db.prepare(
        `INSERT INTO recovery_decisions(
           decision_id, attention_id, attention_version, kind, selected_kind, selected_snapshot_id,
           request_fingerprint, decided_at
         ) VALUES (?, ?, ?, 'restore', ?, ?, ?, ?)`,
      ).run(decisionId, attentionId, expectedAttentionVersion, selection.kind, selectedSnapshotId, fingerprint, now);
      this.#db.prepare(
        `INSERT INTO recovery_restorations(
           restoration_id, decision_id, attention_id, selected_kind, selected_snapshot_id,
           source_revision_id, source_working_digest, pre_restore_revision_id, pre_restore_journal_sequence,
           pre_restore_working_digest, journal_candidate_digest, checkpoint_candidate_revision_id,
           snapshot_candidate_id, descendant_revision_id, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(restorationId, decisionId, attentionId, selection.kind, selectedSnapshotId, sourceRevisionId,
        sourceWorkingDigest, binding.revisionId, binding.journalSequence, binding.workingDigest,
        asString(attention.journal_working_digest), asString(attention.checkpoint_revision_id),
        comparisonSnapshotId, descendantRevisionId, now);
      this.#db.prepare(
        `INSERT INTO manuscript_recovery_review_status(
           branch_id, restoration_id, recovered_revision_id, state, created_at
         ) VALUES (?, ?, ?, 'awaiting-milestone-review', ?)
         ON CONFLICT(branch_id) DO UPDATE SET restoration_id=excluded.restoration_id,
           recovered_revision_id=excluded.recovered_revision_id, state='awaiting-milestone-review',
           created_at=excluded.created_at, cleared_at=NULL, cleared_by_milestone_id=NULL`,
      ).run(binding.branchId, restorationId, descendantRevisionId, now);
      requireBounded(
        this.#db.prepare(
          `UPDATE recovery_attention SET status='resolved', attention_version=attention_version+1, resolved_at=?
           WHERE attention_id=? AND attention_version=? AND status IN ('pending', 'deferred')`,
        ).run(now, attentionId, expectedAttentionVersion).changes === 1,
        'RECOVERY_STATE_CHANGED',
        '恢复待确认状态已变化。',
      );
      this.#db.prepare('DELETE FROM recovery_restore_stages WHERE attention_id = ?').run(attentionId);
      result = {
        restorationId, attentionId, selected: selection, sourceRevisionId,
        descendantRevisionId, descendantRevisionLabel, reviewStatus: '当前为恢复的工作状态',
        preservedHistoryLabel: '既有修订版、修订日志、命令记录、里程碑、恢复快照与稿件固定点均保持原位',
        window: this.getWindow(binding.manuscriptId, binding.branchId, { kind: 'start' }),
      };
    });
    requireBounded(result !== undefined, 'RECOVERY_RESTORE_FAILED', '恢复决定未产生结果。');
    return result;
  }

  getWindow(manuscriptId: string, branchId: string, target: ManuscriptWindowTarget): ManuscriptWindowProjection {
    const binding = this.#binding(manuscriptId, branchId);
    let targetPosition = 1;
    let focusBlockId: string | null = null;
    let focusGrapheme: number | null = null;
    let focusCharacter: number | null = null;
    if (target.kind === 'cursor') {
      targetPosition = this.#decodeCursor(target.cursor, 'window', binding).position;
    } else if (target.kind === 'block' || target.kind === 'window-start') {
      requireBounded(BLOCK_PATTERN.test(target.blockId), 'WINDOW_INVALID', '稿件位置无效。');
      const row = one(this.#db.prepare('SELECT position FROM working_blocks WHERE branch_id = ? AND block_id = ?').all(branchId, target.blockId) as SqlRow[], 'WINDOW_NOT_FOUND', '稿件位置不存在。');
      targetPosition = asNumber(row.position);
      if (target.kind === 'block') {
        focusBlockId = target.blockId;
        focusGrapheme = 0;
      }
    } else if (target.kind === 'character') {
      requireBounded(
        Number.isSafeInteger(target.character) && target.character >= 0 && target.character < binding.totalCharacters,
        'WINDOW_INVALID',
        '全稿位置超出稿件范围。',
      );
      const character = target.character;
      const resolved = resolveWorkingCharacter(this.#db, branchId, character, binding.totalCharacters);
      const row = one(this.#db.prepare(
        'SELECT block_id, grapheme_length FROM working_blocks WHERE branch_id = ? AND position = ?',
      ).all(branchId, resolved.position) as SqlRow[], 'WINDOW_NOT_FOUND', '全稿位置不存在。');
      targetPosition = resolved.position;
      focusBlockId = asString(row.block_id);
      focusGrapheme = character - resolved.startCharacter;
      requireBounded(focusGrapheme >= 0 && focusGrapheme < asNumber(row.grapheme_length), 'WINDOW_INVALID', '全稿位置无法精确解析到内容块。');
      focusCharacter = character;
    } else if (target.kind === 'proportion') {
      requireBounded(Number.isFinite(target.proportion) && target.proportion >= 0 && target.proportion <= 1, 'WINDOW_INVALID', '全稿比例无效。');
      if (binding.totalCharacters > 0) {
        const character = Math.min(binding.totalCharacters - 1, Math.floor(binding.totalCharacters * target.proportion));
        const resolved = resolveWorkingCharacter(this.#db, branchId, character, binding.totalCharacters);
        const row = one(this.#db.prepare(
          'SELECT block_id, grapheme_length FROM working_blocks WHERE branch_id = ? AND position = ?',
        ).all(branchId, resolved.position) as SqlRow[], 'WINDOW_NOT_FOUND', '全稿位置不存在。');
        targetPosition = resolved.position;
        focusBlockId = asString(row.block_id);
        focusGrapheme = character - resolved.startCharacter;
        requireBounded(focusGrapheme >= 0 && focusGrapheme < asNumber(row.grapheme_length), 'WINDOW_INVALID', '全稿比例无法精确解析到内容块。');
        focusCharacter = character;
      }
    }
    const totalBlocks = lastWorkingPosition(this.#db, branchId);
    const startPosition = Math.min(Math.max(1, targetPosition - (focusBlockId ? Math.floor(MAX_WINDOW_BLOCKS / 2) : 0)), Math.max(1, totalBlocks - MAX_WINDOW_BLOCKS + 1));
    const rows = this.#db.prepare(
      `SELECT block_id, position, kind, level, text, digest, grapheme_length
       FROM working_blocks WHERE branch_id = ? AND position >= ? ORDER BY position LIMIT ?`,
    ).all(branchId, startPosition, MAX_WINDOW_BLOCKS + 1) as SqlRow[];
    const visible = rows.slice(0, MAX_WINDOW_BLOCKS);
    const blocks = visible.map((row) => ({
      blockId: asString(row.block_id),
      position: asNumber(row.position),
      kind: asString(row.kind) as ManuscriptBlockProjection['kind'],
      level: row.level === null ? null : asNumber(row.level),
      text: asString(row.text),
      digest: asString(row.digest),
    }));
    requireBounded(blocks.length > 0 && blocks.length <= MAX_WINDOW_BLOCKS, 'WINDOW_NOT_FOUND', '稿件窗口为空。');
    const first = visible[0]!;
    const last = visible.at(-1)!;
    const startCharacter = workingOffsetBefore(this.#db, branchId, asNumber(first.position));
    const endCharacter = workingOffsetPrefix(this.#db, branchId, asNumber(last.position));
    const resolvedPosition = focusBlockId === null ? asNumber(first.position) : targetPosition;
    const resolvedCharacter = focusCharacter ?? (focusBlockId === null
      ? startCharacter
      : workingOffsetBefore(this.#db, branchId, resolvedPosition));
    const structure = this.#db.prepare(
      'SELECT text FROM manuscript_outline WHERE branch_id = ? AND position <= ? ORDER BY position DESC LIMIT 1',
    ).get(branchId, resolvedPosition) as SqlRow | undefined;
    const proportion = binding.totalCharacters === 0 ? 0 : resolvedCharacter / binding.totalCharacters;
    const cursorBinding = { ...binding };
    const projection: ManuscriptWindowProjection = {
      bookId: binding.bookId,
      manuscriptId,
      branchId,
      revisionId: binding.revisionId,
      revisionLabel: binding.revisionLabel,
      journalSequence: binding.journalSequence,
      workingDigest: binding.workingDigest,
      recoveredStateReview: this.#recoveredStateReview(branchId),
      focusBlockId,
      focusGrapheme,
      previousCursor: startPosition > 1 ? this.#encodeCursor('window', cursorBinding, { position: Math.max(1, startPosition - WINDOW_STRIDE) }) : null,
      nextCursor: rows.length > MAX_WINDOW_BLOCKS ? this.#encodeCursor('window', cursorBinding, { position: startPosition + WINDOW_STRIDE }) : null,
      position: {
        startBlock: asNumber(first.position),
        endBlock: asNumber(last.position),
        totalBlocks,
        startCharacter,
        endCharacter,
        totalCharacters: binding.totalCharacters,
        proportion,
        structureLabel: structure ? asString(structure.text) : null,
        label: `${structure ? `${asString(structure.text)} · ` : ''}全稿 ${(proportion * 100).toFixed(3)}%`,
      },
      blocks,
    };
    return projection;
  }

  getOutline(manuscriptId: string, branchId: string, cursor: string | null): OutlineProjection {
    const binding = this.#binding(manuscriptId, branchId);
    const position = cursor === null ? 0 : this.#decodeCursor(cursor, 'outline', binding).position;
    const rows = this.#db.prepare(
      `SELECT block_id, position, kind, level, text FROM manuscript_outline
       WHERE branch_id = ? AND position > ? ORDER BY position LIMIT ?`,
    ).all(branchId, position, MAX_OUTLINE_RESULTS + 1) as SqlRow[];
    const visible = rows.slice(0, MAX_OUTLINE_RESULTS);
    const projection: OutlineProjection = {
      manuscriptId,
      branchId,
      revisionId: binding.revisionId,
      workingDigest: binding.workingDigest,
      entries: visible.map((row) => {
        const display = boundedOutlineDisplay(asString(row.text));
        const character = workingOffsetBefore(this.#db, branchId, asNumber(row.position));
        return {
          outlineId: `${branchId}:${asString(row.block_id)}`,
          blockId: asString(row.block_id),
          kind: asString(row.kind) as 'title' | 'heading',
          level: asNumber(row.level),
          text: display.text,
          displayTextTruncated: display.truncated,
          character,
          proportion: binding.totalCharacters === 0 ? 0 : character / binding.totalCharacters,
        };
      }),
      previousCursor: position === 0
        ? null
        : this.#encodeCursor('outline', binding, {
            position: asNumber((this.#db.prepare(
              `SELECT COALESCE((
                 SELECT position FROM manuscript_outline
                 WHERE branch_id = ? AND position <= ?
                 ORDER BY position DESC LIMIT 1 OFFSET ?
               ), 0) position`,
            ).get(branchId, position, MAX_OUTLINE_RESULTS) as SqlRow).position),
          }),
      nextCursor: rows.length > MAX_OUTLINE_RESULTS
        ? this.#encodeCursor('outline', binding, { position: asNumber(visible.at(-1)!.position) })
        : null,
    };
    requireBounded(
      Buffer.byteLength(JSON.stringify(projection), 'utf8') < MAX_FRAME_BYTES - 4_096,
      'OUTLINE_FRAME_INVALID',
      '结构导航响应超出协议范围。',
    );
    return projection;
  }

  flushJournalEdit(input: JournalEditInput, serviceLifetimeId: string): JournalAcknowledgement {
    validateIdentity(input.manuscriptId, input.branchId);
    requireBounded(UUID_PATTERN.test(serviceLifetimeId), 'LIFETIME_INVALID', '本地服务生命周期标识无效。');
    requireBounded(UUID_PATTERN.test(input.clientEditId) && UUID_PATTERN.test(input.baseRevisionId) && BLOCK_PATTERN.test(input.blockId) && BLOCK_PATTERN.test(input.windowStartBlockId) && DIGEST_PATTERN.test(input.baseBlockDigest), 'EDIT_INVALID', '编辑标识无效。');
    requireBounded(input.insertText.isWellFormed() && input.insertText.length <= MAX_EDIT_CODE_UNITS, 'EDIT_TOO_LARGE', '单次编辑超出安全范围。');
    const inserted = graphemes(input.insertText);
    requireBounded(inserted.length <= MAX_EDIT_GRAPHEMES, 'EDIT_TOO_LARGE', '单次编辑超出安全范围。');
    const fingerprint = sha256(canonicalJson(input));
    const prior = this.#db.prepare(
      `SELECT client_edit_id, request_fingerprint, branch_id, base_revision_id, block_id, sequence,
              resulting_block_digest, resulting_working_digest, durable_at
       FROM edit_journal_entries WHERE client_edit_id = ?`,
    ).all(input.clientEditId) as SqlRow[];
    if (prior.length === 1) {
      requireBounded(asString(prior[0]!.request_fingerprint) === fingerprint, 'IDEMPOTENCY_CONFLICT', '编辑标识已用于另一项修改。');
      return this.#journalAck(prior[0]!, input);
    }
    transact(this.#db, () => {
      const binding = this.#binding(input.manuscriptId, input.branchId);
      this.#requireBranchEditable(input.branchId);
      requireBounded(binding.revisionId === input.baseRevisionId, 'EDIT_BINDING_CHANGED', '编辑绑定已变化。');
      requireBounded(binding.journalSequence === input.expectedJournalSequence, 'EDIT_SEQUENCE_CHANGED', '修订日志已前进，请刷新窗口。');
      requireBounded(
        this.#db.prepare('SELECT 1 FROM working_blocks WHERE branch_id = ? AND block_id = ?').get(input.branchId, input.windowStartBlockId) !== undefined,
        'EDIT_BLOCK_CHANGED',
        '编辑窗口已变化，请刷新窗口。',
      );
      const block = one(this.#db.prepare(
        'SELECT position, kind, level, text, digest, grapheme_length FROM working_blocks WHERE branch_id = ? AND block_id = ?',
      ).all(input.branchId, input.blockId) as SqlRow[], 'EDIT_BLOCK_CHANGED', '稳定内容块不存在。');
      requireBounded(asString(block.digest) === input.baseBlockDigest, 'EDIT_BLOCK_CHANGED', '内容块已变化，请刷新窗口。');
      const beforeText = asString(block.text);
      const before = graphemes(beforeText);
      requireBounded(Number.isSafeInteger(input.fromGrapheme) && Number.isSafeInteger(input.toGrapheme) && input.fromGrapheme >= 0 && input.toGrapheme >= input.fromGrapheme && input.toGrapheme <= before.length && input.toGrapheme - input.fromGrapheme <= MAX_EDIT_GRAPHEMES, 'EDIT_RANGE_INVALID', '编辑字素范围无效。');
      const afterText = [...before.slice(0, input.fromGrapheme), ...inserted, ...before.slice(input.toGrapheme)].join('');
      const after = graphemes(afterText);
      requireBounded(afterText.length <= MAX_BLOCK_CODE_UNITS && after.length <= MAX_BLOCK_GRAPHEMES, 'EDIT_TOO_LARGE', '编辑后内容块超出安全范围。');
      const kind = asString(block.kind) as ManuscriptBlockProjection['kind'];
      const level = block.level === null ? null : asNumber(block.level);
      const afterDigest = blockDigest(kind, level, afterText);
      const sequence = binding.journalSequence + 1;
      const groupId = randomUUID();
      const historyOrdinal = binding.historySequence + 1;
      const durableAt = new Date().toISOString();
      this.#db.prepare("UPDATE manuscript_command_groups SET status = 'superseded' WHERE branch_id = ? AND status = 'undone'").run(input.branchId);
      this.#db.prepare(
        `INSERT INTO manuscript_command_groups(
           command_group_id, branch_id, ordinal, kind, status, source_group_id,
           before_working_digest, after_working_digest, created_at
         ) VALUES (?, ?, ?, 'edit', 'applied', NULL, ?, ?, ?)`,
      ).run(groupId, input.branchId, historyOrdinal, binding.workingDigest, '0'.repeat(64), durableAt);
      this.#db.prepare(
        `INSERT INTO manuscript_command_edits(
           command_group_id, position, block_id, before_text, before_digest, after_text, after_digest
         ) VALUES (?, 1, ?, ?, ?, ?, ?)`,
      ).run(groupId, input.blockId, beforeText, input.baseBlockDigest, afterText, afterDigest);
      const workingDigest = recoveryWorkingDigest(
        binding.workingDigest, sequence, 'edit', groupId, recoveryCommandEvidenceDigest(this.#db, groupId),
      );
      requireBounded(
        this.#db.prepare(
          `UPDATE manuscript_command_groups SET after_working_digest = ?
           WHERE command_group_id = ? AND after_working_digest = ?`,
        ).run(workingDigest, groupId, '0'.repeat(64)).changes === 1,
        'HISTORY_CORRUPT',
        '编辑命令证据无法绑定工作状态链。',
      );
      const delta = after.length - before.length;
      const updated = this.#db.prepare(
        `UPDATE working_blocks SET text = ?, digest = ?, grapheme_length = ?
         WHERE branch_id = ? AND block_id = ? AND digest = ?`,
      ).run(afterText, afterDigest, after.length, input.branchId, input.blockId, input.baseBlockDigest);
      requireBounded(updated.changes === 1, 'EDIT_BLOCK_CHANGED', '内容块在保存时已变化。');
      updateWorkingOffsetNodes(this.#db, input.branchId, asNumber(block.position), delta);
      this.#refreshBlockIndexes(input.branchId, input.blockId, asNumber(block.position), kind, level, afterText, afterDigest);
      this.#db.prepare(
        `INSERT INTO edit_journal_entries(
           journal_entry_id, client_edit_id, request_fingerprint, manuscript_id, branch_id, base_revision_id,
           sequence, block_id, from_grapheme, to_grapheme, insert_text, resulting_block_digest,
           resulting_working_digest, durable_at, command_group_id, command_kind, service_lifetime_id
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'edit', ?)`,
      ).run(randomUUID(), input.clientEditId, fingerprint, input.manuscriptId, input.branchId, input.baseRevisionId,
        sequence, input.blockId, input.fromGrapheme, input.toGrapheme, input.insertText, afterDigest,
        workingDigest, durableAt, groupId, serviceLifetimeId);
      const state = this.#db.prepare(
        `UPDATE branch_working_state SET journal_sequence = ?, working_digest = ?, total_graphemes = total_graphemes + ?, history_sequence = ?
         WHERE branch_id = ? AND journal_sequence = ? AND working_digest = ?`,
      ).run(sequence, workingDigest, delta, historyOrdinal, input.branchId, binding.journalSequence, binding.workingDigest);
      requireBounded(state.changes === 1, 'EDIT_SEQUENCE_CHANGED', '修订日志在保存时已前进。');
      this.#recordLifetimeJournalWrite(serviceLifetimeId, binding, sequence, workingDigest, durableAt);
    });
    const committed = one(this.#db.prepare(
      `SELECT client_edit_id, request_fingerprint, branch_id, base_revision_id, block_id, sequence,
              resulting_block_digest, resulting_working_digest, durable_at
       FROM edit_journal_entries WHERE client_edit_id = ?`,
    ).all(input.clientEditId) as SqlRow[], 'JOURNAL_ACK_FAILED', '修订日志已提交但无法读取确认。');
    return this.#journalAck(committed, input);
  }

  createSearch(manuscriptId: string, branchId: string, queryInput: string): SearchSummaryProjection & { scannedPosition: number; totalBlocks: number } {
    const query = validateShortText(queryInput, 256, 'SEARCH_INVALID', '搜索文字必须为有效的短文本。');
    requireBounded(graphemes(query).length <= MAX_SEARCH_QUERY_GRAPHEMES, 'SEARCH_INVALID', '搜索文字过长。');
    const binding = this.#binding(manuscriptId, branchId);
    this.#pruneTransientSearches();
    const totalBlocks = lastWorkingPosition(this.#db, branchId);
    const searchId = randomUUID();
    this.#db.prepare(
      `INSERT INTO manuscript_search_sessions(
         search_id, manuscript_id, branch_id, revision_id, journal_sequence, working_digest, query, state,
         scanned_position, total_blocks, total_matches, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, 'running', 0, ?, 0, ?)`,
    ).run(searchId, manuscriptId, branchId, binding.revisionId, binding.journalSequence, binding.workingDigest, query, totalBlocks, new Date().toISOString());
    return {
      searchId, manuscriptId, branchId, revisionId: binding.revisionId, journalSequence: binding.journalSequence,
      workingDigest: binding.workingDigest, query, scopeLabel: '全稿', totalMatches: 0, scannedPosition: 0, totalBlocks,
    };
  }

  advanceSearch(searchId: string): { done: boolean; summary: SearchSummaryProjection; scannedPosition: number; totalBlocks: number } {
    requireBounded(UUID_PATTERN.test(searchId), 'SEARCH_INVALID', '搜索标识无效。');
    const session = one(this.#db.prepare('SELECT * FROM manuscript_search_sessions WHERE search_id = ?').all(searchId) as SqlRow[], 'SEARCH_NOT_FOUND', '搜索不存在。');
    const state = asString(session.state);
    requireBounded(state === 'running' || state === 'completed', state === 'cancelled' ? 'JOB_CANCELLED' : 'SEARCH_FAILED', state === 'cancelled' ? '搜索已取消。' : '搜索已失效。');
    const summary = this.#searchSummary(session);
    if (state === 'completed') return { done: true, summary, scannedPosition: asNumber(session.total_blocks), totalBlocks: asNumber(session.total_blocks) };
    const binding = this.#binding(asString(session.manuscript_id), asString(session.branch_id));
    if (
      binding.revisionId !== asString(session.revision_id) ||
      binding.journalSequence !== asNumber(session.journal_sequence) ||
      binding.workingDigest !== asString(session.working_digest)
    ) {
      this.#db.prepare("UPDATE manuscript_search_sessions SET state = 'failed', completed_at = ? WHERE search_id = ?").run(new Date().toISOString(), searchId);
      this.#pruneTransientSearches();
      throw new BoundedStoreError('SEARCH_STALE', '稿件已变化，请刷新搜索。');
    }
    const afterPosition = asNumber(session.scanned_position);
    const query = asString(session.query);
    const useTrigram = graphemes(query).length >= 3;
    const ftsQuery = `"${query.replace(/"/g, '""')}"`;
    const rows = (useTrigram
      ? this.#db.prepare(
          `SELECT wb.block_id, wb.position, wb.text, wb.digest
           FROM working_block_search
           JOIN working_blocks wb ON wb.branch_id = working_block_search.branch_id
             AND wb.block_id = working_block_search.block_id
           WHERE working_block_search.branch_id = ? AND working_block_search MATCH ? AND wb.position > ?
           ORDER BY wb.position LIMIT ?`,
        ).all(binding.branchId, ftsQuery, afterPosition, SEARCH_BATCH)
      : this.#db.prepare(
          `SELECT block_id, position, text, digest FROM working_blocks
           WHERE branch_id = ? AND position > ? ORDER BY position LIMIT ?`,
        ).all(binding.branchId, afterPosition, SEARCH_BATCH)) as SqlRow[];
    let scannedPosition = afterPosition;
    let nextOrdinal = asNumber(session.total_matches);
    const needle = graphemes(query);
    const insert = this.#db.prepare(
      `INSERT INTO manuscript_search_results(
         search_id, ordinal, match_id, block_id, from_grapheme, to_grapheme,
         global_character, heading_label, context, range_digest
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    transact(this.#db, () => {
      for (const row of rows) {
        const blockId = asString(row.block_id);
        const blockPosition = asNumber(row.position);
        scannedPosition = Math.max(scannedPosition, blockPosition);
        const text = graphemes(asString(row.text));
        const heading = this.#db.prepare(
          'SELECT text FROM manuscript_outline WHERE branch_id = ? AND position <= ? ORDER BY position DESC LIMIT 1',
        ).get(binding.branchId, blockPosition) as SqlRow | undefined;
        const headingLabel = boundedProtocolDisplay(heading ? asString(heading.text) : '正文').text;
        const blockStart = workingOffsetBefore(this.#db, binding.branchId, blockPosition);
        for (let start = 0; start <= text.length - needle.length; start += 1) {
          if (!needle.every((part, index) => text[start + index] === part)) continue;
          nextOrdinal += 1;
          const to = start + needle.length;
          const rangeDigest = sha256(canonicalJson({ blockDigest: asString(row.digest), from: start, to, query }));
          const matchId = `hit_${sha256(`${searchId}\u0000${blockId}\u0000${start}`).slice(0, 24)}`;
          insert.run(
            searchId,
            nextOrdinal,
            matchId,
            blockId,
            start,
            to,
            blockStart + start,
            headingLabel,
            boundedSearchContext(text, start, to),
            rangeDigest,
          );
          start = to - 1;
        }
      }
      const done = useTrigram ? rows.length < SEARCH_BATCH : rows.length < SEARCH_BATCH;
      if (done) {
        this.#db.prepare(
          "UPDATE manuscript_search_sessions SET state = 'completed', scanned_position = total_blocks, total_matches = ?, completed_at = ? WHERE search_id = ?",
        ).run(nextOrdinal, new Date().toISOString(), searchId);
      } else {
        this.#db.prepare('UPDATE manuscript_search_sessions SET scanned_position = ?, total_matches = ? WHERE search_id = ?').run(scannedPosition, nextOrdinal, searchId);
      }
    });
    const updated = one(this.#db.prepare('SELECT * FROM manuscript_search_sessions WHERE search_id = ?').all(searchId) as SqlRow[], 'SEARCH_NOT_FOUND', '搜索不存在。');
    if (asString(updated.state) === 'completed') this.#pruneTransientSearches();
    return { done: asString(updated.state) === 'completed', summary: this.#searchSummary(updated), scannedPosition: asNumber(updated.scanned_position), totalBlocks: asNumber(updated.total_blocks) };
  }

  cancelSearch(searchId: string): void {
    this.#db.prepare("UPDATE manuscript_search_sessions SET state = 'cancelled', completed_at = ? WHERE search_id = ? AND state = 'running'").run(new Date().toISOString(), searchId);
    this.#pruneTransientSearches();
  }

  getSearchResults(searchId: string, cursor: string | null): SearchResultsProjection {
    const session = one(this.#db.prepare('SELECT * FROM manuscript_search_sessions WHERE search_id = ?').all(searchId) as SqlRow[], 'SEARCH_NOT_FOUND', '搜索不存在。');
    requireBounded(asString(session.state) === 'completed', 'SEARCH_NOT_READY', '搜索仍在进行。');
    const binding = this.#binding(asString(session.manuscript_id), asString(session.branch_id));
    if (
      binding.revisionId !== asString(session.revision_id) ||
      binding.journalSequence !== asNumber(session.journal_sequence) ||
      binding.workingDigest !== asString(session.working_digest)
    ) {
      this.#db.prepare("UPDATE manuscript_search_sessions SET state = 'failed', completed_at = ? WHERE search_id = ? AND state = 'completed'")
        .run(new Date().toISOString(), searchId);
      this.#pruneTransientSearches();
      throw new BoundedStoreError('SEARCH_STALE', '稿件已变化，请刷新搜索。');
    }
    const offset = cursor === null ? 0 : this.#decodeSimpleCursor(cursor, `search:${searchId}`);
    const rows = this.#db.prepare(
      `SELECT ordinal, match_id, block_id, from_grapheme, to_grapheme, global_character,
              heading_label, context, range_digest
       FROM manuscript_search_results WHERE search_id = ? AND ordinal > ? ORDER BY ordinal LIMIT ?`,
    ).all(searchId, offset, MAX_SEARCH_RESULTS + 1) as SqlRow[];
    const visible = rows.slice(0, MAX_SEARCH_RESULTS);
    const results = visible.map((row) => this.#searchMatch(row));
    const projection: SearchResultsProjection = {
      ...this.#searchSummary(session),
      results,
      previousCursor: offset > 0 ? this.#encodeSimpleCursor(`search:${searchId}`, Math.max(0, offset - MAX_SEARCH_RESULTS)) : null,
      nextCursor: rows.length > MAX_SEARCH_RESULTS ? this.#encodeSimpleCursor(`search:${searchId}`, asNumber(visible.at(-1)!.ordinal)) : null,
    };
    requireBounded(
      Buffer.byteLength(JSON.stringify(projection), 'utf8') < MAX_FRAME_BYTES,
      'SEARCH_FRAME_INVALID',
      '搜索结果响应超出协议范围。',
    );
    return projection;
  }

  prepareReplacement(searchId: string, replacementInput: string, excludedMatchIds: ReadonlyArray<string>): ReplacementPreviewProjection {
    requireBounded(replacementInput.isWellFormed() && replacementInput.length <= 1_024, 'REPLACEMENT_INVALID', '替换文字无效。');
    const replacement = replacementInput.normalize('NFC');
    requireBounded(graphemes(replacement).length <= MAX_REPLACEMENT_GRAPHEMES, 'REPLACEMENT_INVALID', '替换文字过长。');
    requireBounded(
      excludedMatchIds.length <= MAX_REPLACEMENT_EXCLUSIONS && new Set(excludedMatchIds).size === excludedMatchIds.length &&
        excludedMatchIds.every((id) => /^hit_[0-9a-f]{24}$/.test(id)),
      'REPLACEMENT_INVALID',
      '替换排除项无效。',
    );
    const search = one(this.#db.prepare('SELECT * FROM manuscript_search_sessions WHERE search_id = ?').all(searchId) as SqlRow[], 'SEARCH_NOT_FOUND', '搜索不存在。');
    requireBounded(asString(search.state) === 'completed' && asNumber(search.total_matches) > 0, 'REPLACEMENT_INVALID', '没有可供替换的精确匹配。');
    const binding = this.#binding(asString(search.manuscript_id), asString(search.branch_id));
    requireBounded(
      binding.revisionId === asString(search.revision_id) &&
        binding.journalSequence === asNumber(search.journal_sequence) &&
        binding.workingDigest === asString(search.working_digest),
      'SEARCH_STALE',
      '稿件已变化，请刷新搜索。',
    );
    const totalMatches = asNumber(search.total_matches);
    requireBounded(excludedMatchIds.length < totalMatches, 'REPLACEMENT_INVALID', '至少保留一项替换。');
    const previewId = randomUUID();
    transact(this.#db, () => {
      this.#pruneReplacementRecords(1);
      const retained = asNumber(one(this.#db.prepare('SELECT count(*) total FROM manuscript_replacement_previews').all() as SqlRow[], 'REPLACEMENT_INVALID', '无法读取替换保留状态。').total);
      requireBounded(retained < MAX_RETAINED_REPLACEMENT_PREVIEWS, 'SERVICE_BUSY', '替换复核记录已达到安全上限；请先完成或取消现有替换。');
      this.#db.prepare(
        `INSERT INTO manuscript_replacement_previews(
           preview_id, search_id, manuscript_id, branch_id, revision_id, journal_sequence, working_digest,
           query, replacement, state, total_matches, included_matches, validated_ordinal, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'reviewing', ?, ?, 0, ?)`,
      ).run(previewId, searchId, binding.manuscriptId, binding.branchId, binding.revisionId, binding.journalSequence, binding.workingDigest,
        asString(search.query), replacement, totalMatches, totalMatches - excludedMatchIds.length, new Date().toISOString());
      const insertExcluded = this.#db.prepare(
        `INSERT INTO manuscript_replacement_matches(
           preview_id, ordinal, match_id, block_id, from_grapheme, to_grapheme, range_digest, included
         ) SELECT ?, ordinal, match_id, block_id, from_grapheme, to_grapheme, range_digest, 0
           FROM manuscript_search_results WHERE search_id = ? AND match_id = ?`,
      );
      for (const matchId of excludedMatchIds) {
        requireBounded(insertExcluded.run(previewId, searchId, matchId).changes === 1, 'REPLACEMENT_INVALID', '替换排除项不属于当前搜索。');
      }
      const initialOrdinal = Math.min(totalMatches, SEARCH_BATCH);
      this.#db.prepare(
        `INSERT OR IGNORE INTO manuscript_replacement_matches(
           preview_id, ordinal, match_id, block_id, from_grapheme, to_grapheme, range_digest, included
         ) SELECT ?, ordinal, match_id, block_id, from_grapheme, to_grapheme, range_digest, 1
           FROM manuscript_search_results WHERE search_id = ? AND ordinal <= ? ORDER BY ordinal`,
      ).run(previewId, searchId, initialOrdinal);
      this.#validatePreparedReplacementRange(previewId, 0, initialOrdinal);
      this.#db.prepare('UPDATE manuscript_replacement_previews SET validated_ordinal = ? WHERE preview_id = ?').run(initialOrdinal, previewId);
    });
    return this.#replacementProjection(previewId);
  }

  freezeReplacement(previewId: string, excludedMatchIds: ReadonlyArray<string>): ReplacementPreviewProjection {
    requireBounded(UUID_PATTERN.test(previewId) && excludedMatchIds.length <= MAX_REPLACEMENT_EXCLUSIONS && new Set(excludedMatchIds).size === excludedMatchIds.length && excludedMatchIds.every((id) => /^hit_[0-9a-f]{24}$/.test(id)), 'REPLACEMENT_INVALID', '替换排除项无效。');
    transact(this.#db, () => {
      const preview = one(this.#db.prepare('SELECT * FROM manuscript_replacement_previews WHERE preview_id = ?').all(previewId) as SqlRow[], 'REPLACEMENT_NOT_FOUND', '替换预览不存在。');
      requireBounded(asString(preview.state) === 'reviewing', 'REPLACEMENT_STATE_CHANGED', '替换预览状态已变化。');
      const binding = this.#binding(asString(preview.manuscript_id), asString(preview.branch_id));
      requireBounded(
        binding.revisionId === asString(preview.revision_id) &&
          binding.journalSequence === asNumber(preview.journal_sequence) &&
          binding.workingDigest === asString(preview.working_digest),
        'REPLACEMENT_STALE',
        '稿件已变化，替换未冻结，请刷新预览。',
      );
      const total = asNumber(preview.total_matches);
      requireBounded(asNumber(preview.validated_ordinal) === total, 'REPLACEMENT_NOT_READY', '替换预览仍在有界准备中。');
      const copied = asNumber(one(this.#db.prepare('SELECT count(*) total FROM manuscript_replacement_matches WHERE preview_id = ?').all(previewId) as SqlRow[], 'REPLACEMENT_NOT_FOUND', '替换匹配缺失。').total);
      requireBounded(copied === total, 'REPLACEMENT_NOT_READY', '替换预览尚未完整准备。');
      const reviewedExcluded = (this.#db.prepare(
        'SELECT match_id FROM manuscript_replacement_matches WHERE preview_id = ? AND included = 0 ORDER BY match_id',
      ).all(previewId) as SqlRow[]).map((row) => asString(row.match_id));
      const requestedExcluded = [...excludedMatchIds].sort();
      requireBounded(
        reviewedExcluded.join('\n') === requestedExcluded.join('\n'),
        'REPLACEMENT_INCLUSION_CHANGED',
        '排除清单与已审阅预览不一致，请重新准备替换。',
      );
      const included = asNumber(one(this.#db.prepare('SELECT count(*) total FROM manuscript_replacement_matches WHERE preview_id = ? AND included = 1').all(previewId) as SqlRow[], 'REPLACEMENT_NOT_FOUND', '替换匹配缺失。').total);
      requireBounded(included > 0 && included === asNumber(preview.included_matches), 'REPLACEMENT_INVALID', '已审阅纳入集合不完整。');
      requireBounded(
        this.#db.prepare("UPDATE manuscript_replacement_previews SET state = 'frozen', validated_ordinal = 0 WHERE preview_id = ? AND state = 'reviewing'").run(previewId).changes === 1,
        'REPLACEMENT_STATE_CHANGED',
        '替换预览状态已变化。',
      );
    });
    return this.#replacementProjection(previewId);
  }

  advanceReplacementWork(previewId: string): {
    phase: 'preparing' | 'validating';
    done: boolean;
    completed: number;
    total: number;
    preview: ReplacementPreviewProjection | null;
  } {
    const preview = one(this.#db.prepare('SELECT * FROM manuscript_replacement_previews WHERE preview_id = ?').all(previewId) as SqlRow[], 'REPLACEMENT_NOT_FOUND', '替换预览不存在。');
    const state = asString(preview.state);
    requireBounded(state === 'reviewing' || state === 'frozen', 'REPLACEMENT_STATE_CHANGED', '替换预览状态已变化。');
    const binding = this.#binding(asString(preview.manuscript_id), asString(preview.branch_id));
    requireBounded(
      binding.revisionId === asString(preview.revision_id) &&
        binding.journalSequence === asNumber(preview.journal_sequence) &&
        binding.workingDigest === asString(preview.working_digest),
      'REPLACEMENT_STALE',
      '稿件已变化，替换未提交，请刷新预览。',
    );
    if (state === 'reviewing') {
      const total = asNumber(preview.total_matches);
      const after = asNumber(preview.validated_ordinal);
      requireBounded(after <= total, 'REPLACEMENT_INVALID', '替换准备游标无效。');
      if (after < total) {
        const rows = this.#db.prepare(
          `SELECT ordinal, match_id, block_id, from_grapheme, to_grapheme, range_digest
           FROM manuscript_search_results WHERE search_id = ? AND ordinal > ? ORDER BY ordinal LIMIT ?`,
        ).all(asString(preview.search_id), after, SEARCH_BATCH) as SqlRow[];
        requireBounded(rows.length > 0, 'REPLACEMENT_INVALID', '替换搜索结果不完整。');
        const next = asNumber(rows.at(-1)!.ordinal);
        transact(this.#db, () => {
          const insert = this.#db.prepare(
            `INSERT OR IGNORE INTO manuscript_replacement_matches(
               preview_id, ordinal, match_id, block_id, from_grapheme, to_grapheme, range_digest, included
             ) VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
          );
          for (const row of rows) {
            insert.run(previewId, asNumber(row.ordinal), asString(row.match_id), asString(row.block_id), asNumber(row.from_grapheme), asNumber(row.to_grapheme), asString(row.range_digest));
          }
          this.#validatePreparedReplacementRange(previewId, after, next);
          requireBounded(
            this.#db.prepare("UPDATE manuscript_replacement_previews SET validated_ordinal = ? WHERE preview_id = ? AND state = 'reviewing' AND validated_ordinal = ?").run(next, previewId, after).changes === 1,
            'REPLACEMENT_STATE_CHANGED',
            '替换准备状态已变化。',
          );
        });
      }
      const refreshed = one(this.#db.prepare('SELECT validated_ordinal, total_matches, included_matches FROM manuscript_replacement_previews WHERE preview_id = ?').all(previewId) as SqlRow[], 'REPLACEMENT_NOT_FOUND', '替换预览不存在。');
      const completed = asNumber(refreshed.validated_ordinal);
      const done = completed === asNumber(refreshed.total_matches);
      if (done) {
        const counts = one(this.#db.prepare(
          'SELECT count(*) total, sum(included) included FROM manuscript_replacement_matches WHERE preview_id = ?',
        ).all(previewId) as SqlRow[], 'REPLACEMENT_INVALID', '替换准备计数缺失。');
        requireBounded(asNumber(counts.total) === asNumber(refreshed.total_matches) && asNumber(counts.included) === asNumber(refreshed.included_matches), 'REPLACEMENT_INVALID', '替换准备集合不完整。');
      }
      return { phase: 'preparing', done, completed, total, preview: done ? this.#replacementProjection(previewId) : null };
    }
    const after = asNumber(preview.validated_ordinal);
    const rows = this.#db.prepare(
      `SELECT rm.ordinal, rm.block_id, rm.from_grapheme, rm.to_grapheme, rm.range_digest,
              wb.text, wb.digest
       FROM manuscript_replacement_matches rm
       JOIN working_blocks wb ON wb.branch_id = ? AND wb.block_id = rm.block_id
       WHERE rm.preview_id = ? AND rm.included = 1 AND rm.ordinal > ? ORDER BY rm.ordinal LIMIT ?`,
    ).all(binding.branchId, previewId, after, SEARCH_BATCH) as SqlRow[];
    let validated = after;
    const query = graphemes(asString(preview.query));
    for (const row of rows) {
      const text = graphemes(asString(row.text));
      const from = asNumber(row.from_grapheme);
      const to = asNumber(row.to_grapheme);
      const digest = sha256(canonicalJson({ blockDigest: asString(row.digest), from, to, query: asString(preview.query) }));
      requireBounded(digest === asString(row.range_digest) && to - from === query.length && query.every((part, index) => text[from + index] === part), 'REPLACEMENT_STALE', '匹配范围已变化，替换未提交，请刷新预览。');
      this.#requirePriorIncludedRangeDoesNotOverlap(previewId, asString(row.block_id), asNumber(row.ordinal), from);
      validated = asNumber(row.ordinal);
    }
    this.#db.prepare('UPDATE manuscript_replacement_previews SET validated_ordinal = ? WHERE preview_id = ? AND state = ?').run(validated, previewId, 'frozen');
    const remaining = asNumber(one(this.#db.prepare('SELECT count(*) total FROM manuscript_replacement_matches WHERE preview_id = ? AND included = 1 AND ordinal > ?').all(previewId, validated) as SqlRow[], 'REPLACEMENT_NOT_FOUND', '替换匹配缺失。').total);
    return {
      phase: 'validating',
      done: remaining === 0,
      completed: asNumber(preview.included_matches) - remaining,
      total: asNumber(preview.included_matches),
      preview: null,
    };
  }

  commitReplacement(previewId: string, serviceLifetimeId: string): ReplacementCommitProjection {
    requireBounded(UUID_PATTERN.test(serviceLifetimeId), 'LIFETIME_INVALID', '本地服务生命周期标识无效。');
    const result = transact(this.#db, () => {
      const preview = one(this.#db.prepare('SELECT * FROM manuscript_replacement_previews WHERE preview_id = ?').all(previewId) as SqlRow[], 'REPLACEMENT_NOT_FOUND', '替换预览不存在。');
      requireBounded(asString(preview.state) === 'frozen' && asNumber(preview.validated_ordinal) > 0, 'REPLACEMENT_NOT_READY', '替换尚未完成复核。');
      const unvalidated = asNumber(one(this.#db.prepare(
        'SELECT count(*) total FROM manuscript_replacement_matches WHERE preview_id = ? AND included = 1 AND ordinal > ?',
      ).all(previewId, asNumber(preview.validated_ordinal)) as SqlRow[], 'REPLACEMENT_NOT_READY', '替换匹配缺失。').total);
      requireBounded(unvalidated === 0, 'REPLACEMENT_NOT_READY', '替换尚未完成全部精确范围复核。');
      const binding = this.#binding(asString(preview.manuscript_id), asString(preview.branch_id));
      this.#requireBranchEditable(binding.branchId);
      requireBounded(
        binding.revisionId === asString(preview.revision_id) &&
          binding.journalSequence === asNumber(preview.journal_sequence) &&
          binding.workingDigest === asString(preview.working_digest),
        'REPLACEMENT_STALE',
        '稿件已变化，替换未提交，请刷新预览。',
      );
      const groupId = randomUUID();
      const ordinal = binding.historySequence + 1;
      const now = new Date().toISOString();
      const sequence = binding.journalSequence + 1;
      this.#db.prepare("UPDATE manuscript_command_groups SET status = 'superseded' WHERE branch_id = ? AND status = 'undone'").run(binding.branchId);
      this.#db.prepare(
        `INSERT INTO manuscript_command_groups(
           command_group_id, branch_id, ordinal, kind, status, source_group_id,
           before_working_digest, after_working_digest, created_at
         ) VALUES (?, ?, ?, 'replacement', 'applied', NULL, ?, ?, ?)`,
      ).run(groupId, binding.branchId, ordinal, binding.workingDigest, '0'.repeat(64), now);
      const insertEdit = this.#db.prepare(
        `INSERT INTO manuscript_command_edits(
           command_group_id, position, block_id, before_text, before_digest, after_text, after_digest
         ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      );
      let blockCursor = 0;
      let editPosition = 0;
      let firstBlockId: string | undefined;
      let firstDigest: string | undefined;
      let totalDelta = 0;
      while (true) {
        const page = this.#db.prepare(
          `SELECT DISTINCT rm.block_id, wb.position, wb.kind, wb.level, wb.text, wb.digest
           FROM manuscript_replacement_matches rm
           JOIN working_blocks wb ON wb.branch_id = ? AND wb.block_id = rm.block_id
           WHERE rm.preview_id = ? AND rm.included = 1 AND wb.position > ?
           ORDER BY wb.position LIMIT ?`,
        ).all(binding.branchId, previewId, blockCursor, HISTORY_BATCH) as SqlRow[];
        if (page.length === 0) break;
        for (const row of page) {
          blockCursor = asNumber(row.position);
          editPosition += 1;
          const blockId = asString(row.block_id);
          const beforeText = asString(row.text);
          const before = graphemes(beforeText);
          const text = [...before];
          const matches = this.#db.prepare(
            `SELECT from_grapheme, to_grapheme FROM manuscript_replacement_matches
             WHERE preview_id = ? AND included = 1 AND block_id = ? ORDER BY from_grapheme DESC`,
          ).all(previewId, blockId) as SqlRow[];
          const replacement = graphemes(asString(preview.replacement));
          for (const match of matches) text.splice(asNumber(match.from_grapheme), asNumber(match.to_grapheme) - asNumber(match.from_grapheme), ...replacement);
          const afterText = text.join('');
          const after = graphemes(afterText);
          requireBounded(afterText.length <= MAX_BLOCK_CODE_UNITS && after.length <= MAX_BLOCK_GRAPHEMES, 'REPLACEMENT_TOO_LARGE', '替换后内容块超出安全范围。');
          const kind = asString(row.kind) as ManuscriptBlockProjection['kind'];
          const level = row.level === null ? null : asNumber(row.level);
          const afterDigest = blockDigest(kind, level, afterText);
          insertEdit.run(groupId, editPosition, blockId, beforeText, asString(row.digest), afterText, afterDigest);
          const delta = after.length - before.length;
          const update = this.#db.prepare(
            'UPDATE working_blocks SET text = ?, digest = ?, grapheme_length = ? WHERE branch_id = ? AND block_id = ? AND digest = ?',
          ).run(afterText, afterDigest, after.length, binding.branchId, blockId, asString(row.digest));
          requireBounded(update.changes === 1, 'REPLACEMENT_STALE', '匹配范围在提交时已变化。');
          updateWorkingOffsetNodes(this.#db, binding.branchId, blockCursor, delta);
          this.#refreshBlockIndexes(binding.branchId, blockId, blockCursor, kind, level, afterText, afterDigest);
          totalDelta += delta;
          requireBounded(Number.isSafeInteger(totalDelta), 'REPLACEMENT_TOO_LARGE', '替换后的全稿字符总数无效。');
          firstBlockId ??= blockId;
          firstDigest ??= afterDigest;
        }
        if (page.length < HISTORY_BATCH) break;
      }
      requireBounded(firstBlockId && firstDigest, 'REPLACEMENT_NOT_READY', '替换匹配缺失。');
      const workingDigest = recoveryWorkingDigest(
        binding.workingDigest, sequence, 'replacement', groupId, recoveryCommandEvidenceDigest(this.#db, groupId),
      );
      requireBounded(
        this.#db.prepare(
          `UPDATE manuscript_command_groups SET after_working_digest = ?
           WHERE command_group_id = ? AND after_working_digest = ?`,
        ).run(workingDigest, groupId, '0'.repeat(64)).changes === 1,
        'HISTORY_CORRUPT',
        '替换命令证据无法绑定工作状态链。',
      );
      this.#db.prepare(
        `INSERT INTO edit_journal_entries(
           journal_entry_id, client_edit_id, request_fingerprint, manuscript_id, branch_id, base_revision_id,
           sequence, block_id, from_grapheme, to_grapheme, insert_text, resulting_block_digest,
           resulting_working_digest, durable_at, command_group_id, command_kind, service_lifetime_id
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?, ?, ?, 'replacement', ?)`,
      ).run(randomUUID(), randomUUID(), sha256(canonicalJson({ previewId })), binding.manuscriptId, binding.branchId,
        binding.revisionId, sequence, firstBlockId, asString(preview.replacement), firstDigest, workingDigest, now, groupId,
        serviceLifetimeId);
      const state = this.#db.prepare(
        `UPDATE branch_working_state SET journal_sequence = ?, working_digest = ?, history_sequence = ?,
           total_graphemes = total_graphemes + ?
         WHERE branch_id = ? AND journal_sequence = ? AND working_digest = ?`,
      ).run(sequence, workingDigest, ordinal, totalDelta, binding.branchId, binding.journalSequence, binding.workingDigest);
      requireBounded(state.changes === 1, 'REPLACEMENT_STALE', '替换提交时稿件状态已变化。');
      this.#recordLifetimeJournalWrite(serviceLifetimeId, binding, sequence, workingDigest, now);
      requireBounded(
        this.#db.prepare("UPDATE manuscript_replacement_previews SET state = 'committed', committed_at = ? WHERE preview_id = ? AND state = 'frozen'").run(now, previewId).changes === 1,
        'REPLACEMENT_STATE_CHANGED',
        '替换预览状态已变化。',
      );
      this.#pruneReplacementRecords(0);
      return {
        previewId,
        branchId: binding.branchId,
        revisionId: binding.revisionId,
        journalSequence: sequence,
        workingDigest,
        committedCount: asNumber(preview.included_matches),
        completionLabel: `已原子替换 ${asNumber(preview.included_matches)} 处并写入修订日志`,
      };
    });
    return result;
  }

  cancelReplacement(previewId: string): boolean {
    requireBounded(UUID_PATTERN.test(previewId), 'REPLACEMENT_INVALID', '替换预览标识无效。');
    return transact(this.#db, () => {
      const row = this.#db.prepare('SELECT state FROM manuscript_replacement_previews WHERE preview_id = ?').get(previewId) as SqlRow | undefined;
      if (row === undefined) return false;
      const state = asString(row.state);
      let cancelled = state === 'cancelled';
      if (state === 'reviewing' || state === 'frozen') {
        cancelled = this.#db.prepare(
          "UPDATE manuscript_replacement_previews SET state = 'cancelled' WHERE preview_id = ? AND state = ?",
        ).run(previewId, state).changes === 1;
      }
      this.#pruneReplacementRecords(0);
      return cancelled;
    });
  }

  saveMilestone(plan: RecoverySnapshotPlan, object: RecoverySnapshotObjectMetadata): MilestoneProjection {
    requireBounded(
      DIGEST_PATTERN.test(object.objectDigest) &&
        DIGEST_PATTERN.test(object.manifestDigest) &&
        object.objectRelativeKey.isWellFormed() &&
        object.objectRelativeKey.length > 0 &&
        Number.isSafeInteger(object.byteLength) && object.byteLength > 0 &&
        object.blockCount === plan.blockCount,
      'SNAPSHOT_INVALID',
      '恢复快照对象元数据无效。',
    );
    return transact(this.#db, () => {
      let binding = this.#binding(plan.manuscriptId, plan.branchId);
      this.#requireBranchEditable(plan.branchId);
      requireBounded(
        binding.revisionId === plan.expectedBaseRevisionId &&
          binding.journalSequence === plan.expectedJournalSequence &&
          binding.workingDigest === plan.expectedWorkingDigest &&
          binding.totalCharacters === plan.totalGraphemes,
        'MILESTONE_STALE',
        '稿件已变化，里程碑与恢复快照未提交。',
      );
      if (plan.revisionId !== binding.revisionId) {
        const previous = one(this.#db.prepare(
          'SELECT ordinal FROM manuscript_revisions WHERE revision_id = ?',
        ).all(binding.revisionId) as SqlRow[], 'MILESTONE_INVALID', '当前修订版缺失。');
        requireBounded(plan.revisionLabel === `r${asNumber(previous.ordinal) + 1}`, 'MILESTONE_INVALID', '里程碑修订版计划无效。');
        this.#db.prepare(
          `INSERT INTO manuscript_revisions(
             revision_id, manuscript_id, branch_id, ordinal, revision_label, parent_revision_id,
             source_version_id, revision_digest, created_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(plan.revisionId, plan.manuscriptId, plan.branchId, asNumber(previous.ordinal) + 1, plan.revisionLabel,
          binding.revisionId, plan.sourceVersionId, binding.workingDigest, plan.createdAt);
        snapshotWorkingRevision(this.#db, plan.branchId, plan.revisionId, binding.totalCharacters);
        this.#db.prepare(
          `UPDATE branch_working_state SET base_revision_id = ?, last_checkpoint_sequence = ?
           WHERE branch_id = ? AND base_revision_id = ? AND journal_sequence = ?`,
        ).run(plan.revisionId, binding.journalSequence, plan.branchId, binding.revisionId, binding.journalSequence);
        this.#db.prepare('UPDATE manuscript_branches SET base_revision_id = ? WHERE branch_id = ?').run(plan.revisionId, plan.branchId);
        binding = this.#binding(plan.manuscriptId, plan.branchId);
      }
      const workflow = one(this.#db.prepare(
        `SELECT workflow_instance_id, profile_id, profile_version, current_phase, state
         FROM workflow_instances WHERE manuscript_id = ?`,
      ).all(plan.manuscriptId) as SqlRow[], 'MILESTONE_INVALID', '稿件工作流程证据缺失。');
      const workflowEvidenceDigest = sha256(canonicalJson({
        workflowInstanceId: asString(workflow.workflow_instance_id),
        profileId: asString(workflow.profile_id),
        profileVersion: asString(workflow.profile_version),
        phase: asString(workflow.current_phase),
        state: asString(workflow.state),
        revisionId: plan.revisionId,
        revisionDigest: binding.workingDigest,
        journalSequence: binding.journalSequence,
      }));
      this.#db.prepare(
        `INSERT INTO milestone_versions(
           milestone_id, manuscript_id, branch_id, revision_id, label, purpose, note, actor, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, '本机编辑', ?)`,
      ).run(plan.milestoneId, plan.manuscriptId, plan.branchId, plan.revisionId,
        plan.label, plan.purpose, plan.note, plan.createdAt);
      this.#db.prepare(
        `INSERT INTO milestone_signoff_records(
           signoff_record_id, milestone_id, manuscript_id, branch_id, revision_id,
           workflow_instance_id, workflow_evidence_digest, actor, signed_at, label, stated_next_use
         ) VALUES (?, ?, ?, ?, ?, ?, ?, '本机编辑', ?, ?, ?)`,
      ).run(plan.signoffRecordId, plan.milestoneId, plan.manuscriptId, plan.branchId, plan.revisionId,
        asString(workflow.workflow_instance_id), workflowEvidenceDigest, plan.createdAt, plan.label, plan.purpose);
      this.#db.prepare(
        `INSERT INTO recovery_snapshots(
           snapshot_id, milestone_id, book_id, manuscript_id, branch_id, revision_id, revision_label,
           revision_digest, journal_sequence, object_digest, manifest_digest, object_relative_key, byte_length,
           block_count, total_graphemes, created_at, verified_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        plan.snapshotId, plan.milestoneId, plan.bookId, plan.manuscriptId, plan.branchId, plan.revisionId,
        plan.revisionLabel, binding.workingDigest, binding.journalSequence, object.objectDigest,
        object.manifestDigest, object.objectRelativeKey, object.byteLength, object.blockCount, plan.totalGraphemes,
        plan.createdAt, object.verifiedAt,
      );
      this.#db.prepare(
        `UPDATE manuscript_recovery_review_status
         SET state = 'cleared-by-milestone', cleared_at = ?, cleared_by_milestone_id = ?
         WHERE branch_id = ? AND state = 'awaiting-milestone-review'`,
      ).run(plan.createdAt, plan.milestoneId, plan.branchId);
      return {
        milestoneId: plan.milestoneId, manuscriptId: plan.manuscriptId, branchId: plan.branchId,
        revisionId: plan.revisionId, revisionLabel: plan.revisionLabel, label: plan.label,
        purpose: plan.purpose, note: plan.note, createdAt: plan.createdAt,
        journalSequence: binding.journalSequence, workingDigest: binding.workingDigest,
        signoffRecordId: plan.signoffRecordId, workflowEvidenceDigest, actor: '本机编辑',
        signedAt: plan.createdAt, statedNextUse: plan.purpose,
        completionLabel: `已保存里程碑版本「${plan.label}」 · ${plan.revisionLabel}`,
        recoverySnapshot: {
          snapshotId: plan.snapshotId, blockCount: object.blockCount,
          verification: '已独立校验快照对象',
        },
      };
    });
  }

  undo(manuscriptId: string, branchId: string, expectedWorkingDigest: string, serviceLifetimeId: string): DurableHistoryProjection {
    return this.#applyHistory('undo', manuscriptId, branchId, expectedWorkingDigest, serviceLifetimeId);
  }

  redo(manuscriptId: string, branchId: string, expectedWorkingDigest: string, serviceLifetimeId: string): DurableHistoryProjection {
    return this.#applyHistory('redo', manuscriptId, branchId, expectedWorkingDigest, serviceLifetimeId);
  }

  #applyHistory(
    action: 'undo' | 'redo',
    manuscriptId: string,
    branchId: string,
    expectedWorkingDigest: string,
    serviceLifetimeId: string,
  ): DurableHistoryProjection {
    requireBounded(DIGEST_PATTERN.test(expectedWorkingDigest), 'HISTORY_INVALID', '历史状态绑定无效。');
    requireBounded(UUID_PATTERN.test(serviceLifetimeId), 'LIFETIME_INVALID', '本地服务生命周期标识无效。');
    return transact(this.#db, () => {
      const binding = this.#binding(manuscriptId, branchId);
      this.#requireBranchEditable(branchId);
      requireBounded(binding.workingDigest === expectedWorkingDigest, 'HISTORY_STALE', '稿件已变化，请刷新历史状态。');
      const group = one(this.#db.prepare(
        action === 'undo'
          ? "SELECT * FROM manuscript_command_groups WHERE branch_id = ? AND status = 'applied' AND ordinal > ? ORDER BY ordinal DESC LIMIT 1"
          : "SELECT * FROM manuscript_command_groups WHERE branch_id = ? AND status = 'undone' AND ordinal > ? ORDER BY ordinal ASC LIMIT 1",
      ).all(branchId, binding.historyBoundarySequence) as SqlRow[], action === 'undo' ? 'NOTHING_TO_UNDO' : 'NOTHING_TO_REDO', action === 'undo' ? '没有可撤销的编辑。' : '没有可重做的编辑。');
      const groupId = asString(group.command_group_id);
      validateCommandHistoryGroup(this.#db, groupId);
      let cursor = 0;
      let totalDelta = 0;
      while (true) {
        const rows = this.#db.prepare(
          `SELECT position, block_id, before_text, before_digest, after_text, after_digest
           FROM manuscript_command_edits WHERE command_group_id = ? AND position > ? ORDER BY position LIMIT ?`,
        ).all(groupId, cursor, HISTORY_BATCH) as SqlRow[];
        if (rows.length === 0) break;
        for (const row of rows) {
          cursor = asNumber(row.position);
          const expectedDigest = action === 'undo' ? asString(row.after_digest) : asString(row.before_digest);
          const targetText = action === 'undo' ? asString(row.before_text) : asString(row.after_text);
          const targetDigest = action === 'undo' ? asString(row.before_digest) : asString(row.after_digest);
          const current = one(this.#db.prepare(
            'SELECT position, kind, level, grapheme_length FROM working_blocks WHERE branch_id = ? AND block_id = ?',
          ).all(branchId, asString(row.block_id)) as SqlRow[], 'HISTORY_STALE', '稿件历史内容块缺失。');
          const kind = asString(current.kind) as ManuscriptBlockProjection['kind'];
          const level = current.level === null ? null : asNumber(current.level);
          const targetLength = graphemes(targetText).length;
          const delta = targetLength - asNumber(current.grapheme_length);
          const update = this.#db.prepare(
            'UPDATE working_blocks SET text = ?, digest = ?, grapheme_length = ? WHERE branch_id = ? AND block_id = ? AND digest = ?',
          ).run(targetText, targetDigest, targetLength, branchId, asString(row.block_id), expectedDigest);
          requireBounded(update.changes === 1, 'HISTORY_STALE', '稿件历史无法在当前状态精确重放。');
          updateWorkingOffsetNodes(this.#db, branchId, asNumber(current.position), delta);
          this.#refreshBlockIndexes(branchId, asString(row.block_id), asNumber(current.position), kind, level, targetText, targetDigest);
          totalDelta += delta;
          requireBounded(Number.isSafeInteger(totalDelta), 'HISTORY_CORRUPT', '历史命令字符变化无效。');
        }
      }
      const sequence = binding.journalSequence + 1;
      const nextDigest = recoveryWorkingDigest(
        binding.workingDigest, sequence, action, groupId, recoveryCommandEvidenceDigest(this.#db, groupId),
      );
      const now = new Date().toISOString();
      requireBounded(
        this.#db.prepare('UPDATE manuscript_command_groups SET status = ? WHERE command_group_id = ? AND status = ?').run(action === 'undo' ? 'undone' : 'applied', groupId, action === 'undo' ? 'applied' : 'undone').changes === 1,
        'HISTORY_STALE',
        '稿件历史状态已变化。',
      );
      const representative = one(this.#db.prepare('SELECT block_id, before_digest, after_digest FROM manuscript_command_edits WHERE command_group_id = ? ORDER BY position LIMIT 1').all(groupId) as SqlRow[], 'HISTORY_CORRUPT', '历史命令内容缺失。');
      this.#db.prepare(
        `INSERT INTO edit_journal_entries(
           journal_entry_id, client_edit_id, request_fingerprint, manuscript_id, branch_id, base_revision_id,
           sequence, block_id, from_grapheme, to_grapheme, insert_text, resulting_block_digest,
           resulting_working_digest, durable_at, command_group_id, command_kind, service_lifetime_id
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, '', ?, ?, ?, ?, ?, ?)`,
      ).run(randomUUID(), randomUUID(), sha256(canonicalJson({ action, groupId, sequence })), manuscriptId, branchId,
        binding.revisionId, sequence, asString(representative.block_id), action === 'undo' ? asString(representative.before_digest) : asString(representative.after_digest),
        nextDigest, now, groupId, action, serviceLifetimeId);
      const state = this.#db.prepare(
        `UPDATE branch_working_state SET journal_sequence = ?, working_digest = ?,
           total_graphemes = total_graphemes + ?
         WHERE branch_id = ? AND journal_sequence = ? AND working_digest = ?`,
      ).run(sequence, nextDigest, totalDelta, branchId, binding.journalSequence, binding.workingDigest);
      requireBounded(state.changes === 1, 'HISTORY_STALE', '稿件历史提交时工作状态已变化。');
      this.#recordLifetimeJournalWrite(serviceLifetimeId, binding, sequence, nextDigest, now);
      const refreshed = this.#binding(manuscriptId, branchId);
      return {
        action, branchId, revisionId: refreshed.revisionId, revisionLabel: refreshed.revisionLabel,
        journalSequence: sequence, workingDigest: nextDigest, commandGroupId: groupId,
        completionLabel: action === 'undo' ? '已撤销并写入修订日志' : '已重做并写入修订日志',
        canUndo: this.#hasHistory(branchId, 'applied'), canRedo: this.#hasHistory(branchId, 'undone'),
      };
    });
  }

  #binding(manuscriptId: string, branchId: string): BranchBinding {
    validateIdentity(manuscriptId, branchId);
    const row = one(this.#db.prepare(
      `SELECT m.book_id, bws.manuscript_id, bws.branch_id, bws.base_revision_id, mr.revision_label,
              bws.journal_sequence, bws.working_digest, bws.total_graphemes, bws.history_sequence,
              bws.history_boundary_sequence, bws.last_checkpoint_sequence
       FROM branch_working_state bws
       JOIN manuscripts m ON m.manuscript_id = bws.manuscript_id
       JOIN manuscript_revisions mr ON mr.revision_id = bws.base_revision_id
       WHERE bws.manuscript_id = ? AND bws.branch_id = ?`,
    ).all(manuscriptId, branchId) as SqlRow[], 'MANUSCRIPT_NOT_FOUND', '稿件工作状态不存在。');
    return {
      bookId: asString(row.book_id), manuscriptId, branchId, revisionId: asString(row.base_revision_id),
      revisionLabel: asString(row.revision_label), journalSequence: asNumber(row.journal_sequence),
      workingDigest: asString(row.working_digest), totalCharacters: asNumber(row.total_graphemes),
      historySequence: asNumber(row.history_sequence),
      historyBoundarySequence: asNumber(row.history_boundary_sequence),
      lastCheckpointSequence: asNumber(row.last_checkpoint_sequence),
    };
  }

  #recoveredStateReview(branchId: string): ManuscriptWindowProjection['recoveredStateReview'] {
    const row = this.#db.prepare(
      `SELECT restoration_id, recovered_revision_id FROM manuscript_recovery_review_status
       WHERE branch_id = ? AND state = 'awaiting-milestone-review'`,
    ).get(branchId) as SqlRow | undefined;
    return row === undefined ? null : {
      restorationId: asString(row.restoration_id),
      recoveredRevisionId: asString(row.recovered_revision_id),
      label: '当前为恢复的工作状态',
    };
  }

  #refreshBlockIndexes(branchId: string, blockId: string, position: number, kind: ManuscriptBlockProjection['kind'], level: number | null, text: string, digest: string): void {
    this.#db.prepare('DELETE FROM working_block_search WHERE branch_id = ? AND block_id = ?').run(branchId, blockId);
    this.#db.prepare('INSERT INTO working_block_search(branch_id, block_id, text) VALUES (?, ?, ?)').run(branchId, blockId, text);
    if (kind === 'title' || kind === 'heading') {
      this.#db.prepare(
        `INSERT INTO manuscript_outline(branch_id, block_id, position, kind, level, text, digest)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(branch_id, block_id) DO UPDATE SET position=excluded.position,
           kind=excluded.kind, level=excluded.level, text=excluded.text, digest=excluded.digest`,
      ).run(branchId, blockId, position, kind, level ?? 1, text, digest);
    }
  }

  #searchSummary(row: SqlRow): SearchSummaryProjection {
    return {
      searchId: asString(row.search_id), manuscriptId: asString(row.manuscript_id), branchId: asString(row.branch_id),
      revisionId: asString(row.revision_id), journalSequence: asNumber(row.journal_sequence),
      workingDigest: asString(row.working_digest), query: asString(row.query),
      scopeLabel: '全稿', totalMatches: asNumber(row.total_matches),
    };
  }

  #searchMatch(row: SqlRow): SearchMatchProjection {
    return {
      matchId: asString(row.match_id), blockId: asString(row.block_id), fromGrapheme: asNumber(row.from_grapheme),
      toGrapheme: asNumber(row.to_grapheme), globalCharacter: asNumber(row.global_character),
      headingLabel: boundedProtocolDisplay(asString(row.heading_label)).text,
      context: boundedProtocolDisplay(asString(row.context)).text,
      rangeDigest: asString(row.range_digest),
    };
  }

  #replacementProjection(previewId: string): ReplacementPreviewProjection {
    const row = one(this.#db.prepare('SELECT * FROM manuscript_replacement_previews WHERE preview_id = ?').all(previewId) as SqlRow[], 'REPLACEMENT_NOT_FOUND', '替换预览不存在。');
    const contexts = this.#db.prepare(
      `SELECT sr.match_id, sr.block_id, sr.from_grapheme, sr.to_grapheme, sr.global_character,
               sr.heading_label, sr.context, sr.range_digest
       FROM manuscript_replacement_matches rm
       JOIN manuscript_search_results sr ON sr.search_id = ? AND sr.match_id = rm.match_id
       WHERE rm.preview_id = ? AND rm.included = 1 ORDER BY rm.ordinal LIMIT 6`,
    ).all(asString(row.search_id), previewId) as SqlRow[];
    const revision = one(this.#db.prepare('SELECT revision_label FROM manuscript_revisions WHERE revision_id = ?').all(asString(row.revision_id)) as SqlRow[], 'REPLACEMENT_NOT_FOUND', '替换绑定的修订版不存在。');
    const state = asString(row.state);
    requireBounded(state === 'reviewing' || state === 'frozen', 'REPLACEMENT_STATE_CHANGED', '替换预览状态已变化。');
    const excludedMatchIds = (this.#db.prepare(
      'SELECT match_id FROM manuscript_replacement_matches WHERE preview_id = ? AND included = 0 ORDER BY match_id',
    ).all(previewId) as SqlRow[]).map((match) => asString(match.match_id));
    requireBounded(excludedMatchIds.length <= MAX_REPLACEMENT_EXCLUSIONS, 'REPLACEMENT_INVALID', '替换排除清单超出安全范围。');
    return {
      previewId, searchId: asString(row.search_id), manuscriptId: asString(row.manuscript_id), branchId: asString(row.branch_id),
      revisionId: asString(row.revision_id), journalSequence: asNumber(row.journal_sequence),
      workingDigest: asString(row.working_digest), query: asString(row.query),
      replacement: asString(row.replacement), scopeLabel: '全稿', matchingRule: REPLACEMENT_MATCHING_RULE,
      inclusionRule: REPLACEMENT_INCLUSION_RULE, revisionLabel: asString(revision.revision_label),
      totalMatches: asNumber(row.total_matches), includedMatches: asNumber(row.included_matches),
      excludedMatches: asNumber(row.total_matches) - asNumber(row.included_matches), state,
      excludedMatchIds,
      representativeContexts: contexts.map((context) => this.#searchMatch(context)),
    };
  }

  #validatePreparedReplacementRange(previewId: string, after: number, through: number): void {
    const rows = this.#db.prepare(
      `SELECT rm.ordinal, rm.match_id, rm.block_id, rm.from_grapheme, rm.to_grapheme, rm.range_digest, rm.included,
              sr.match_id source_match_id, sr.block_id source_block_id, sr.from_grapheme source_from,
              sr.to_grapheme source_to, sr.range_digest source_digest
       FROM manuscript_replacement_matches rm
       JOIN manuscript_replacement_previews rp ON rp.preview_id = rm.preview_id
       JOIN manuscript_search_results sr ON sr.search_id = rp.search_id AND sr.ordinal = rm.ordinal
       WHERE rm.preview_id = ? AND rm.ordinal > ? AND rm.ordinal <= ? ORDER BY rm.ordinal`,
    ).all(previewId, after, through) as SqlRow[];
    requireBounded(rows.length === through - after, 'REPLACEMENT_INVALID', '替换准备批次不完整。');
    for (const row of rows) {
      requireBounded(
        asString(row.match_id) === asString(row.source_match_id) && asString(row.block_id) === asString(row.source_block_id) &&
          asNumber(row.from_grapheme) === asNumber(row.source_from) && asNumber(row.to_grapheme) === asNumber(row.source_to) &&
          asString(row.range_digest) === asString(row.source_digest),
        'REPLACEMENT_INVALID',
        '替换准备批次与搜索结果不一致。',
      );
      if (asNumber(row.included) === 1) {
        this.#requirePriorIncludedRangeDoesNotOverlap(previewId, asString(row.block_id), asNumber(row.ordinal), asNumber(row.from_grapheme));
      }
    }
  }

  #requirePriorIncludedRangeDoesNotOverlap(previewId: string, blockId: string, ordinal: number, from: number): void {
    const prior = this.#db.prepare(
      `SELECT to_grapheme FROM manuscript_replacement_matches
       WHERE preview_id = ? AND included = 1 AND block_id = ? AND ordinal < ?
       ORDER BY from_grapheme DESC LIMIT 1`,
    ).get(previewId, blockId, ordinal) as SqlRow | undefined;
    requireBounded(prior === undefined || asNumber(prior.to_grapheme) <= from, 'REPLACEMENT_INVALID', '替换集合包含重叠范围。');
  }

  #pruneReplacementRecords(reserve: number): void {
    prunePersistedReplacementRecords(this.#db, reserve);
    this.#pruneTransientSearches();
  }

  #pruneTransientSearches(): void {
    prunePersistedSearchSessions(this.#db);
  }

  #requireBranchEditable(branchId: string): void {
    requireBounded(
      this.#db.prepare(
        "SELECT 1 ok FROM recovery_attention WHERE branch_id = ? AND status IN ('pending', 'deferred') LIMIT 1",
      ).get(branchId) === undefined,
      'RECOVERY_ATTENTION_REQUIRED',
      '该稿件分支仍有恢复待确认状态；普通编辑保持只读。',
    );
  }

  #recordLifetimeJournalWrite(
    serviceLifetimeId: string,
    binding: BranchBinding,
    sequence: number,
    workingDigest: string,
    durableAt: string,
  ): void {
    const lifetime = one(this.#db.prepare(
      'SELECT outcome FROM service_lifetimes WHERE lifetime_id = ?',
    ).all(serviceLifetimeId) as SqlRow[], 'LIFETIME_INVALID', '本地服务生命周期记录缺失。');
    requireBounded(asString(lifetime.outcome) === 'running', 'LIFETIME_STATE_CHANGED', '本地服务生命周期已经结束。');
    const prior = this.#db.prepare(
      `SELECT manuscript_id, checkpoint_revision_id, checkpoint_sequence,
              reconstruction_base_sequence, reconstruction_base_digest,
              high_water_sequence, high_water_digest, entry_count
       FROM service_lifetime_branch_writes WHERE lifetime_id = ? AND branch_id = ?`,
    ).get(serviceLifetimeId, binding.branchId) as SqlRow | undefined;
    if (prior === undefined || asNumber(prior.checkpoint_sequence) < binding.lastCheckpointSequence) {
      requireBounded(sequence === binding.journalSequence + 1 && sequence > binding.lastCheckpointSequence,
        'LIFETIME_STATE_CHANGED', '修订日志高水位无法从当前检查点开始。');
      this.#db.prepare(
        `INSERT INTO service_lifetime_branch_writes(
           lifetime_id, branch_id, manuscript_id, checkpoint_revision_id, checkpoint_sequence,
           reconstruction_base_sequence, reconstruction_base_digest,
           high_water_sequence, high_water_digest, last_durable_at, entry_count
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
         ON CONFLICT(lifetime_id, branch_id) DO UPDATE SET
           manuscript_id=excluded.manuscript_id,
           checkpoint_revision_id=excluded.checkpoint_revision_id,
           checkpoint_sequence=excluded.checkpoint_sequence,
           reconstruction_base_sequence=excluded.reconstruction_base_sequence,
           reconstruction_base_digest=excluded.reconstruction_base_digest,
           high_water_sequence=excluded.high_water_sequence,
           high_water_digest=excluded.high_water_digest,
           last_durable_at=excluded.last_durable_at,
           entry_count=1`,
      ).run(serviceLifetimeId, binding.branchId, binding.manuscriptId, binding.revisionId,
        binding.lastCheckpointSequence, binding.journalSequence, binding.workingDigest,
        sequence, workingDigest, durableAt);
      return;
    }
    requireBounded(
      asString(prior.manuscript_id) === binding.manuscriptId &&
        asString(prior.checkpoint_revision_id) === binding.revisionId &&
        asNumber(prior.checkpoint_sequence) === binding.lastCheckpointSequence &&
        asNumber(prior.reconstruction_base_sequence) <= binding.journalSequence &&
        DIGEST_PATTERN.test(asString(prior.reconstruction_base_digest)) &&
        asNumber(prior.high_water_sequence) === binding.journalSequence &&
        asString(prior.high_water_digest) === binding.workingDigest &&
        asNumber(prior.entry_count) === binding.journalSequence - asNumber(prior.reconstruction_base_sequence) &&
        sequence === binding.journalSequence + 1,
      'LIFETIME_STATE_CHANGED',
      '修订日志高水位与当前生命周期不连续。',
    );
    requireBounded(
      this.#db.prepare(
        `UPDATE service_lifetime_branch_writes
         SET high_water_sequence = ?, high_water_digest = ?, last_durable_at = ?, entry_count = entry_count + 1
         WHERE lifetime_id = ? AND branch_id = ? AND high_water_sequence = ?`,
      ).run(sequence, workingDigest, durableAt, serviceLifetimeId, binding.branchId,
        binding.journalSequence).changes === 1,
      'LIFETIME_STATE_CHANGED',
      '修订日志高水位在提交时已变化。',
    );
  }

  #requireRecoveryAttention(attentionId: string, expectedAttentionVersion?: number): SqlRow {
    requireBounded(UUID_PATTERN.test(attentionId), 'RECOVERY_INVALID', '恢复待确认标识无效。');
    const row = one(this.#db.prepare(
      `SELECT * FROM recovery_attention
       WHERE attention_id = ? AND status IN ('pending', 'deferred')`,
    ).all(attentionId) as SqlRow[], 'RECOVERY_NOT_FOUND', '恢复待确认状态不存在或已经处理。');
    if (expectedAttentionVersion !== undefined) {
      requireBounded(
        Number.isSafeInteger(expectedAttentionVersion) && expectedAttentionVersion >= 1 &&
          asNumber(row.attention_version) === expectedAttentionVersion,
        'RECOVERY_STATE_CHANGED',
        '恢复待确认状态已变化。',
      );
    }
    return row;
  }

  #requireAttentionSnapshot(attentionId: string, snapshotId: string): SqlRow {
    requireBounded(UUID_PATTERN.test(snapshotId), 'RECOVERY_SNAPSHOT_INELIGIBLE', '恢复快照标识无效。');
    return one(this.#db.prepare(
      `SELECT rs.* FROM recovery_attention ra
       JOIN recovery_snapshots rs ON rs.snapshot_id = ? AND rs.branch_id = ra.branch_id
         AND rs.revision_id = ra.checkpoint_revision_id
       WHERE ra.attention_id = ? AND ra.status IN ('pending', 'deferred')`,
    ).all(snapshotId, attentionId) as SqlRow[], 'RECOVERY_SNAPSHOT_INELIGIBLE', '恢复快照不适用于当前待确认状态。');
  }

  #snapshotRecord(row: SqlRow): RecoverySnapshotRecord {
    return {
      snapshotId: asString(row.snapshot_id), bookId: asString(row.book_id),
      manuscriptId: asString(row.manuscript_id), branchId: asString(row.branch_id),
      revisionId: asString(row.revision_id), revisionLabel: asString(row.revision_label),
      revisionDigest: asString(row.revision_digest), journalSequence: asNumber(row.journal_sequence),
      objectDigest: asString(row.object_digest), manifestDigest: asString(row.manifest_digest),
      objectRelativeKey: asString(row.object_relative_key),
      byteLength: asNumber(row.byte_length), blockCount: asNumber(row.block_count),
      totalGraphemes: asNumber(row.total_graphemes), createdAt: asString(row.created_at),
      verifiedAt: asString(row.verified_at),
    };
  }

  #recoveryStageBinding(attentionId: string): SqlRow {
    return one(this.#db.prepare(
      `SELECT attention_id, selected_snapshot_id, expected_attention_version,
              expected_block_count, expected_total_graphemes
       FROM recovery_restore_stages WHERE attention_id = ?`,
    ).all(attentionId) as SqlRow[], 'RECOVERY_SOURCE_INVALID', '恢复来源暂存不存在。');
  }

  #validateRecoveryStageBlocks(
    attentionId: string,
    manuscriptId: string,
  ): { blockCount: number; totalGraphemes: number } {
    const stage = this.#recoveryStageBinding(attentionId);
    let position = 0;
    let totalGraphemes = 0;
    while (true) {
      const blocks = this.#db.prepare(
        `SELECT s.block_id, s.position, s.kind, s.level, s.text, s.digest, s.grapheme_length,
                mb.manuscript_id
         FROM recovery_restore_stage_blocks s
         LEFT JOIN manuscript_blocks mb ON mb.block_id = s.block_id
         WHERE s.attention_id = ? AND s.position > ? ORDER BY s.position LIMIT ?`,
      ).all(attentionId, position, MIGRATION_BATCH) as SqlRow[];
      if (blocks.length === 0) break;
      for (const block of blocks) {
        position += 1;
        const kind = asString(block.kind) as ManuscriptBlockProjection['kind'];
        const level = block.level === null ? null : asNumber(block.level);
        const content = asString(block.text);
        const length = stagedBlockLength(content, 'RECOVERY_SOURCE_INVALID', '恢复快照暂存文字超出有界范围。');
        requireBounded(
          asNumber(block.position) === position && asString(block.manuscript_id) === manuscriptId &&
            length === asNumber(block.grapheme_length) && blockDigest(kind, level, content) === asString(block.digest),
          'RECOVERY_SOURCE_INVALID',
          '恢复快照暂存内容无法精确校验。',
        );
        totalGraphemes += length;
        requireBounded(Number.isSafeInteger(totalGraphemes), 'RECOVERY_SOURCE_INVALID', '恢复快照暂存字符计数无效。');
      }
    }
    requireBounded(
      position === asNumber(stage.expected_block_count) &&
        totalGraphemes === asNumber(stage.expected_total_graphemes),
      'RECOVERY_SOURCE_INVALID',
      '恢复快照暂存未完成全部有界批次。',
    );
    return { blockCount: position, totalGraphemes };
  }

  #restorationProjection(row: SqlRow, selection: RecoverySelection): RecoveryRestorationProjection {
    const descendantRevisionId = asString(row.descendant_revision_id);
    const revision = one(this.#db.prepare(
      'SELECT manuscript_id, branch_id, revision_label FROM manuscript_revisions WHERE revision_id = ?',
    ).all(descendantRevisionId) as SqlRow[], 'RECOVERY_RESTORE_FAILED', '恢复后代修订版缺失。');
    return {
      restorationId: asString(row.restoration_id), attentionId: asString(row.attention_id), selected: selection,
      sourceRevisionId: asString(row.source_revision_id), descendantRevisionId,
      descendantRevisionLabel: asString(revision.revision_label), reviewStatus: '当前为恢复的工作状态',
      preservedHistoryLabel: '既有修订版、修订日志、命令记录、里程碑、恢复快照与稿件固定点均保持原位',
      window: this.getWindow(asString(revision.manuscript_id), asString(revision.branch_id), { kind: 'start' }),
    };
  }

  #hasHistory(branchId: string, state: 'applied' | 'undone'): boolean {
    return this.#db.prepare(
      `SELECT 1 ok FROM manuscript_command_groups g
       JOIN branch_working_state bws ON bws.branch_id = g.branch_id
       WHERE g.branch_id = ? AND g.status = ? AND g.ordinal > bws.history_boundary_sequence LIMIT 1`,
    ).get(branchId, state) !== undefined;
  }

  #journalAck(row: SqlRow, input: JournalEditInput): JournalAcknowledgement {
    const acknowledgement = {
      clientEditId: asString(row.client_edit_id), branchId: asString(row.branch_id), baseRevisionId: asString(row.base_revision_id),
      blockId: asString(row.block_id), sequence: asNumber(row.sequence), resultingBlockDigest: asString(row.resulting_block_digest),
      resultingWorkingDigest: asString(row.resulting_working_digest), durableAt: asString(row.durable_at), completionLabel: '已写入修订日志',
    } satisfies Omit<JournalAcknowledgement, 'window'>;
    const window = this.getWindow(input.manuscriptId, input.branchId, { kind: 'window-start', blockId: input.windowStartBlockId });
    requireBounded(
      window.journalSequence === acknowledgement.sequence && window.workingDigest === acknowledgement.resultingWorkingDigest,
      'JOURNAL_ACK_FAILED',
      '修订日志已提交但窗口确认已变化。',
    );
    return { ...acknowledgement, window };
  }

  #encodeCursor(kind: string, binding: BranchBinding, value: { position: number }): string {
    const payload = Buffer.from(JSON.stringify({ kind, manuscriptId: binding.manuscriptId, branchId: binding.branchId, revisionId: binding.revisionId, workingDigest: binding.workingDigest, position: value.position }), 'utf8').toString('base64url');
    const signature = createHmac('sha256', this.#cursorSecret).update(payload).digest('base64url');
    return `${payload}.${signature}`;
  }

  #decodeCursor(cursor: string, kind: string, binding: BranchBinding): { position: number } {
    const [payload, signature, extra] = cursor.split('.');
    requireBounded(payload && signature && extra === undefined, 'CURSOR_INVALID', '稿件位置已失效。');
    const expected = createHmac('sha256', this.#cursorSecret).update(payload).digest();
    const supplied = Buffer.from(signature, 'base64url');
    requireBounded(expected.length === supplied.length && timingSafeEqual(expected, supplied), 'CURSOR_INVALID', '稿件位置已失效。');
    let value: unknown;
    try { value = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')); } catch { throw new BoundedStoreError('CURSOR_INVALID', '稿件位置已失效。'); }
    requireBounded(value !== null && typeof value === 'object' && !Array.isArray(value), 'CURSOR_INVALID', '稿件位置已失效。');
    const row = value as Record<string, unknown>;
    requireBounded(row.kind === kind && row.manuscriptId === binding.manuscriptId && row.branchId === binding.branchId && row.revisionId === binding.revisionId && row.workingDigest === binding.workingDigest && typeof row.position === 'number' && Number.isSafeInteger(row.position) && row.position >= 0, 'CURSOR_INVALID', '稿件位置已失效。');
    return { position: Number(row.position) };
  }

  #encodeSimpleCursor(kind: string, position: number): string {
    const payload = Buffer.from(JSON.stringify({ kind, position }), 'utf8').toString('base64url');
    return `${payload}.${createHmac('sha256', this.#cursorSecret).update(payload).digest('base64url')}`;
  }

  #decodeSimpleCursor(cursor: string, kind: string): number {
    const [payload, signature, extra] = cursor.split('.');
    requireBounded(payload && signature && extra === undefined, 'CURSOR_INVALID', '结果位置已失效。');
    const expected = createHmac('sha256', this.#cursorSecret).update(payload).digest();
    const supplied = Buffer.from(signature, 'base64url');
    requireBounded(expected.length === supplied.length && timingSafeEqual(expected, supplied), 'CURSOR_INVALID', '结果位置已失效。');
    let value: unknown;
    try { value = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')); } catch { throw new BoundedStoreError('CURSOR_INVALID', '结果位置已失效。'); }
    requireBounded(value !== null && typeof value === 'object' && !Array.isArray(value), 'CURSOR_INVALID', '结果位置已失效。');
    const row = value as Record<string, unknown>;
    requireBounded(row.kind === kind && typeof row.position === 'number' && Number.isSafeInteger(row.position) && row.position >= 0, 'CURSOR_INVALID', '结果位置已失效。');
    return Number(row.position);
  }
}
