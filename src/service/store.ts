import { createHash, randomUUID } from 'node:crypto';
import { constants, createReadStream, lstatSync } from 'node:fs';
import { copyFile, lstat, open, realpath, rename, rm } from 'node:fs/promises';
import { basename, isAbsolute, posix, relative, resolve, sep } from 'node:path';
import { DatabaseSync, type SQLOutputValue } from 'node:sqlite';
import type {
  FidelityCategoryProjection,
  ImportCommitProjection,
  ImportDegradationDecisionReviewProjection,
  ImportDraftRecoveryProjection,
  ImportIdentityFindingProjection,
  ImportStartupProjection,
  JournalAcknowledgement,
  JournalEditInput,
  ManuscriptWindowProjection,
  NewBookImportTargetChoiceId,
  OriginalFileAccessProjection,
  ReviewBeforeImportProjection,
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
} from '../shared/protocol.js';
import {
  deriveImportFidelityPlan,
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
  type RecoverySnapshotCursor,
  type RecoverySnapshotRecord,
  type VerifiedRecoverySnapshot,
} from './bounded-manuscript.js';
import { RecoveryObjectStore } from './recovery-objects.js';
import {
  createCanonicalExternalDataRoot,
  ensureCanonicalDataDirectory,
  inspectCanonicalDataFile,
} from '../shared/data-root.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOKEN_PATTERN = UUID_PATTERN;
const CORE_SCHEMA_VERSION = 5;
const EDITOR_SCHEMA_VERSION = 6;
const SCHEMA_VERSION = 7;
const INGEST_BATCH_SIZE = 256;
const WORKFLOW_PROFILE = {
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
const DEGRADATION_DECISION_SCHEMA = 'ai7.import-degradation-decision/1';

type SqlRow = Record<string, SQLOutputValue>;

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

const WORKFLOW_PROFILE_DIGEST = sha256(canonicalJson(WORKFLOW_PROFILE));
const BASELINE_EDITORIAL_DIMENSION_SET_DIGEST = sha256(canonicalJson(BASELINE_EDITORIAL_DIMENSION_SET));
const EDITORIAL_DIMENSIONS = BASELINE_EDITORIAL_DIMENSION_SET.dimensions;

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

function configureDatabase(db: DatabaseSync): void {
  db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = FULL;
    PRAGMA busy_timeout = 5000;
    PRAGMA trusted_schema = OFF;
    PRAGMA secure_delete = ON;
    PRAGMA temp_store = MEMORY;
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
      currentVersion === SCHEMA_VERSION,
    'SCHEMA_UNSUPPORTED',
    '数据库版本不受支持。',
  );
  if (
    currentVersion === CORE_SCHEMA_VERSION ||
    currentVersion === EDITOR_SCHEMA_VERSION ||
    currentVersion === SCHEMA_VERSION
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

interface DraftSnapshot {
  draftId: string;
  state: string;
  version: number;
  displayName: string;
  objectDigest: string;
  selectedPath: string | null;
  reviewedTitle: string | null;
  reviewedTargetChoiceId: NewBookImportTargetChoiceId | null;
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
  induceAbandonObjectRemovalFailure: boolean;
  interruptAfterAbandonObjectRemoval: boolean;
}

function continuationNotice(access: OriginalFileAccessProjection): string {
  if (access.state === 'available-exact') return '已重新校验完整暂存快照；原始所选文件仍可访问且身份一致。';
  return `${access.label}。已重新校验完整暂存快照，不会从原路径读取或替换暂存内容。`;
}

function recordsToCreate(plan: ImportFidelityPlan): ReadonlyArray<string> {
  if (plan.degradations.length === 0) return BASE_RECORDS_TO_CREATE;
  return [...BASE_RECORDS_TO_CREATE.slice(0, 4), '导入降级决定', ...BASE_RECORDS_TO_CREATE.slice(4)];
}

function nonEffects(plan: ImportFidelityPlan): ReadonlyArray<string> {
  return plan.degradations.length === 0 ? [...NON_EFFECTS, CLEAN_IMPORT_NON_EFFECT] : NON_EFFECTS;
}

function newBookTargetChoice(
  identityFindings: ReadonlyArray<ImportIdentityFindingProjection>,
): StagedImportProjection['targetChoices'][number] {
  return identityFindings.length > 0
    ? { id: 'new-book-distinct-intended-work', label: '新建图书（作为不同作品）', selected: false }
    : { id: 'new-book', label: '新建图书', selected: false };
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
      workflowProfile: { ...WORKFLOW_PROFILE, digest: WORKFLOW_PROFILE_DIGEST },
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
      workflowProfile: { ...WORKFLOW_PROFILE, digest: WORKFLOW_PROFILE_DIGEST },
      editorialDimensionSet: {
        ...BASELINE_EDITORIAL_DIMENSION_SET,
        digest: BASELINE_EDITORIAL_DIMENSION_SET_DIGEST,
      },
    }),
  );
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
  readonly #lifetimeId: string;
  readonly #control: StoreControl;
  #contentObjectLifecycleTail: Promise<void> = Promise.resolve();
  #recoveryObjectLifecycleTail: Promise<void> = Promise.resolve();
  #cleanShutdownMarked = false;
  #poisoned = false;

  private constructor(
    dataRoot: string,
    objectsRoot: string,
    authority: DatabaseSync,
    journal: DatabaseSync,
    ingest: DatabaseSync,
    boundedAuthority: BoundedManuscriptStore,
    bounded: BoundedManuscriptStore,
    recoveryObjects: RecoveryObjectStore,
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
    this.#lifetimeId = lifetimeId;
    this.#control = control;
  }

  static async open(
    dataRootInput: string,
    codeRoot: string,
    control: StoreControl = {
      induceUnprovableReconciliation: false,
      persistLegacyReviewedDraft: false,
      induceAbandonObjectRemovalFailure: false,
      interruptAfterAbandonObjectRemoval: false,
    },
  ): Promise<EditorialStore> {
    requireStore(isAbsolute(dataRootInput), 'DATA_ROOT_INVALID', 'Agent Data Root 必须是绝对路径。');
    const dataRoot = await createCanonicalExternalDataRoot(dataRootInput, codeRoot);
    const objectsRoot = await ensureCanonicalDataDirectory(dataRoot, 'objects');
    const recoveryObjects = await RecoveryObjectStore.open(dataRoot);
    const storeRoot = await ensureCanonicalDataDirectory(dataRoot, 'store');
    const { path: databasePath } = await inspectCanonicalDataFile(dataRoot, storeRoot, 'ai7.sqlite');
    for (const sidecar of ['ai7.sqlite-journal', 'ai7.sqlite-shm', 'ai7.sqlite-wal']) {
      await inspectCanonicalDataFile(dataRoot, storeRoot, sidecar);
    }
    const authority = new DatabaseSync(databasePath);
    configureDatabase(authority);
    initializeSchema(authority);
    initializeBoundedSchema(authority);
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

  close(): void {
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
      newestUnavailable ??= verified;
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
    const plan = this.#requireFidelityPlan(snapshot);
    const identityFindings = this.#identityFindings(snapshot);
    const currentTarget = newBookTargetChoice(identityFindings);
    let title: string | null = null;
    try {
      title = snapshot.reviewedTitle === null ? null : safeTitle(snapshot.reviewedTitle);
    } catch {
      title = null;
    }
    const reconstructedTarget =
      title === null ? null : reconstructReviewedTargetChoice(snapshot, title, plan, identityFindings);
    if (
      reconstructedTarget === null ||
      reconstructedTarget !== currentTarget.id ||
      snapshot.reviewedTargetChoiceId !== reconstructedTarget
    ) {
      snapshot = this.#invalidateReview(snapshot);
      return {
        state: 'target-review-required',
        staged: this.#stagedProjection(snapshot),
        originalFileAccess: access,
        reviewInvalidated: true,
        notice: '导入目标、书名、保真状态或最终记录后果已变化；旧复核已失效，请从变化后的选择重新确认。',
      };
    }
    requireStore(title !== null, 'REVIEW_CHANGED', '导入前复核书名已变化。');
    requireStore(snapshot.reviewDigest !== null, 'REVIEW_CHANGED', '导入前复核摘要已变化。');

    return {
      state: 'review-ready',
      review: this.#reviewProjection(
        snapshot,
        title,
        snapshot.reviewDigest,
        plan,
        plan.degradations.length > 0,
        currentTarget.id,
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
          this.#authority.prepare('DELETE FROM staged_import_snapshots WHERE draft_id = ?').run(draftId);
          this.#promoteIngestSnapshot(draftId, ingested, now);
          const draftUpdate = this.#authority
            .prepare(
              `UPDATE import_drafts
               SET selection_token = ?, state = 'staged', draft_version = ?, display_name = ?, object_digest = ?,
                   selected_path = ?, reviewed_title = NULL, reviewed_target_choice_id = NULL,
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
    targetChoiceId: NewBookImportTargetChoiceId,
    confirmedTitleInput: string,
    acceptDegradation: boolean,
  ): ReviewBeforeImportProjection {
    this.#assertAvailable();
    requireStore(UUID_PATTERN.test(draftId), 'DRAFT_INVALID', '导入草稿标识无效。');
    this.#requireNoAbandonmentCleanupIntent(draftId);
    const confirmedTitle = safeTitle(confirmedTitleInput);
    const snapshot = this.#loadDraftSnapshot(draftId);
    requireStore(snapshot.state === 'staged', 'DRAFT_STATE_CHANGED', '导入草稿状态已变化。');
    requireStore(snapshot.version === expectedDraftVersion, 'DRAFT_VERSION_CHANGED', '导入草稿版本已变化。');
    const identityFindings = this.#identityFindings(snapshot);
    const targetChoice = newBookTargetChoice(identityFindings);
    requireStore(targetChoiceId === targetChoice.id, 'TARGET_CHOICE_CHANGED', '导入目标选择已变化，请重新选择。');
    const plan = this.#requireFidelityPlan(snapshot);
    if (plan.degradations.length > 0 && !acceptDegradation) {
      return this.#reviewProjection(snapshot, confirmedTitle, null, plan, false, targetChoiceId, identityFindings, null);
    }
    requireStore(
      plan.degradations.length > 0 || !acceptDegradation,
      'DEGRADATION_ACCEPTANCE_INVALID',
      '本次导入不需要降级接受。',
    );
    const nextVersion = expectedDraftVersion + 1;
    requireStore(
      !this.#control.persistLegacyReviewedDraft ||
        (targetChoiceId === 'new-book' && identityFindings.length === 0),
      'E2E_CONTROL_INVALID',
      '旧版复核边界仅适用于无身份提示的新建图书。',
    );
    const reviewSnapshot = { ...snapshot, version: nextVersion };
    const reviewDigest = this.#control.persistLegacyReviewedDraft
      ? createLegacyNewBookReviewDigestV2(reviewSnapshot, confirmedTitle, nextVersion, plan)
      : createNewBookReviewDigestV4(
          reviewSnapshot,
          confirmedTitle,
          nextVersion,
          plan,
          targetChoiceId,
          identityFindings,
        );
    const persistedTargetChoiceId = this.#control.persistLegacyReviewedDraft ? null : targetChoiceId;
    const reviewedAt = new Date().toISOString();
    this.#transaction(this.#authority, () => {
      const update = this.#authority
        .prepare(
          `UPDATE import_drafts
           SET state = 'reviewed', draft_version = ?, reviewed_title = ?, reviewed_target_choice_id = ?,
               review_digest = ?, reviewed_at = ?
           WHERE draft_id = ? AND state = 'staged' AND draft_version = ?`,
        )
        .run(nextVersion, confirmedTitle, persistedTargetChoiceId, reviewDigest, reviewedAt, draftId, expectedDraftVersion);
      requireStore(update.changes === 1, 'DRAFT_VERSION_CHANGED', '导入草稿在复核时已变化。');
    });
    return this.#reviewProjection(
      {
        ...snapshot,
        state: 'reviewed',
        version: nextVersion,
        reviewedTitle: confirmedTitle,
        reviewedTargetChoiceId: persistedTargetChoiceId,
        reviewDigest,
      },
      confirmedTitle,
      reviewDigest,
      plan,
      plan.degradations.length > 0,
      targetChoiceId,
      identityFindings,
      null,
    );
  }

  async commitNewBookImport(
    input: {
      draftId: string;
      expectedDraftVersion: number;
      reviewDigest: string;
      commitId: string;
    },
    options: { interruptAfterAttempt?: boolean } = {},
  ): Promise<ImportCommitProjection> {
    this.#assertAvailable();
    requireStore(UUID_PATTERN.test(input.draftId) && UUID_PATTERN.test(input.commitId), 'COMMIT_INVALID', '导入提交标识无效。');
    requireStore(/^[0-9a-f]{64}$/.test(input.reviewDigest), 'COMMIT_INVALID', '导入复核摘要无效。');
    this.#requireNoAbandonmentCleanupIntent(input.draftId);
    const requestFingerprint = sha256(canonicalJson(input));
    const existingAttempt = this.#loadCommitAttemptForDraft(input.draftId);
    if (existingAttempt) {
      requireStore(
        existingAttempt.attemptId === input.commitId &&
          existingAttempt.requestFingerprint === requestFingerprint &&
          existingAttempt.expectedDraftVersion === input.expectedDraftVersion &&
          existingAttempt.reviewDigest === input.reviewDigest,
        'IDEMPOTENCY_CONFLICT',
        '该导入草稿已绑定另一项持久提交尝试。',
      );
      const reconciliation = await this.#reconcileCommitAttempt(existingAttempt);
      if (reconciliation.state === 'committed') return reconciliation.result;
      requireStore(reconciliation.state === 'uncommitted', 'IMPORT_COMMIT_OUTCOME_UNCERTAIN', '导入提交结果待确认。');
    }

    const snapshotBeforeAttempt = this.#loadDraftSnapshot(input.draftId);
    requireStore(snapshotBeforeAttempt.state === 'reviewed', 'DRAFT_NOT_REVIEWED', '导入草稿尚未完成复核。');
    requireStore(snapshotBeforeAttempt.version === input.expectedDraftVersion, 'DRAFT_VERSION_CHANGED', '导入草稿版本已变化。');
    requireStore(snapshotBeforeAttempt.reviewDigest === input.reviewDigest, 'REVIEW_CHANGED', '导入前复核摘要已变化。');
    const revalidated = await this.#revalidateSnapshot(snapshotBeforeAttempt);
    requireStore(!revalidated.parserDrift, 'REVIEW_CHANGED', '解析器状态已变化，请重新复核导入。');
    const snapshotForAttempt = revalidated.snapshot;
    requireStore(snapshotForAttempt.reviewedTitle, 'REVIEW_CHANGED', '确认书名缺失。');
    const planForAttempt = this.#requireFidelityPlan(snapshotForAttempt);
    const identityFindingsForAttempt = this.#identityFindings(snapshotForAttempt);
    const targetChoiceForAttempt = newBookTargetChoice(identityFindingsForAttempt);
    requireStore(
      snapshotForAttempt.reviewedTargetChoiceId === targetChoiceForAttempt.id,
      'REVIEW_CHANGED',
      '导入目标无法与当前复核证据精确对应。',
    );
    requireStore(
      createNewBookReviewDigestV4(
        snapshotForAttempt,
        snapshotForAttempt.reviewedTitle,
        snapshotForAttempt.version,
        planForAttempt,
        targetChoiceForAttempt.id,
        identityFindingsForAttempt,
      ) === input.reviewDigest,
      'REVIEW_CHANGED',
      '导入前复核摘要无法由当前权威快照重建。',
    );
    if (!existingAttempt) {
      const preparedAt = new Date().toISOString();
      this.#transaction(this.#authority, () => {
        this.#authority
          .prepare(
            `INSERT INTO import_commit_attempts(
               attempt_id, draft_id, request_fingerprint, expected_draft_version, review_digest,
               state, prepared_at
             ) VALUES (?, ?, ?, ?, ?, 'prepared', ?)`,
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
    let result: Omit<ImportCommitProjection, 'firstWindow'> | undefined;

    this.#transaction(this.#authority, () => {
      const existing = this.#authority.prepare('SELECT request_fingerprint, result_json FROM import_commits WHERE commit_id = ?').all(input.commitId) as SqlRow[];
      if (existing.length === 1) {
        requireStore(asString(existing[0]!.request_fingerprint) === requestFingerprint, 'IDEMPOTENCY_CONFLICT', '提交标识已用于另一项导入。');
        const storedResult = parseStoredJson(asString(existing[0]!.result_json), '导入提交结果记录无效。');
        requireStore(storedResult !== null && typeof storedResult === 'object' && !Array.isArray(storedResult), 'STORE_CORRUPT', '导入提交结果记录无效。');
        result = this.#loadStoredCommitResult(input.commitId);
        return;
      }

      const snapshot = this.#loadDraftSnapshot(input.draftId);
      requireStore(snapshot.state === 'reviewed', 'DRAFT_NOT_REVIEWED', '导入草稿尚未完成复核。');
      requireStore(snapshot.version === input.expectedDraftVersion, 'DRAFT_VERSION_CHANGED', '导入草稿版本已变化。');
      requireStore(snapshot.reviewDigest === input.reviewDigest, 'REVIEW_CHANGED', '导入前复核摘要已变化。');
      requireStore(snapshot.reviewedTitle, 'REVIEW_CHANGED', '确认书名缺失。');
      const plan = this.#requireFidelityPlan(snapshot);
      const identityFindings = this.#identityFindings(snapshot);
      const targetChoice = newBookTargetChoice(identityFindings);
      requireStore(
        snapshot.reviewedTargetChoiceId === targetChoice.id,
        'REVIEW_CHANGED',
        '导入目标无法与当前复核证据精确对应。',
      );
      const currentReviewDigest = createNewBookReviewDigestV4(
        snapshot,
        snapshot.reviewedTitle,
        snapshot.version,
        plan,
        targetChoice.id,
        identityFindings,
      );
      requireStore(
        currentReviewDigest === input.reviewDigest,
        'REVIEW_CHANGED',
        '导入前复核摘要无法由当前权威快照重建。',
      );
      this.#boundedCall(() => this.#boundedAuthority.assertStagedDraftIntegrity(input.draftId));

      const now = new Date().toISOString();
      const bookId = randomUUID();
      const dimensionSetId = randomUUID();
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

      this.#authority.prepare('INSERT INTO books(book_id, stable_identity, title, created_at) VALUES (?, ?, ?, ?)').run(bookId, `book:${bookId}`, snapshot.reviewedTitle, now);
      this.#authority
        .prepare(
          `INSERT INTO book_dimension_sets(
             dimension_set_id, book_id, version, profile_id, profile_version, definition_digest,
             weight_semantics, created_at
           ) VALUES (?, ?, 1, ?, ?, ?, ?, ?)`,
        )
        .run(
          dimensionSetId,
          bookId,
          BASELINE_EDITORIAL_DIMENSION_SET.profileId,
          BASELINE_EDITORIAL_DIMENSION_SET.profileVersion,
          BASELINE_EDITORIAL_DIMENSION_SET_DIGEST,
          BASELINE_EDITORIAL_DIMENSION_SET.weightSemantics,
          now,
        );
      const insertDimension = this.#authority.prepare(
        'INSERT INTO book_dimensions(dimension_set_id, dimension_id, display_label, weight, position) VALUES (?, ?, ?, ?, ?)',
      );
      EDITORIAL_DIMENSIONS.forEach((dimension, index) =>
        insertDimension.run(dimensionSetId, dimension.id, dimension.label, dimension.weight, index + 1),
      );
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
          `INSERT INTO workflow_profiles(profile_id, profile_version, profile_name, profile_digest, definition_json)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(profile_id, profile_version) DO NOTHING`,
        )
        .run(
          WORKFLOW_PROFILE.id,
          WORKFLOW_PROFILE.version,
          WORKFLOW_PROFILE.name,
          WORKFLOW_PROFILE_DIGEST,
          canonicalJson(WORKFLOW_PROFILE),
        );
      const profile = one(
        this.#authority
          .prepare('SELECT profile_digest, definition_json FROM workflow_profiles WHERE profile_id = ? AND profile_version = ?')
          .all(WORKFLOW_PROFILE.id, WORKFLOW_PROFILE.version) as SqlRow[],
        'PROFILE_CONFLICT',
        '工作流程方案版本缺失。',
      );
      requireStore(
        asString(profile.profile_digest) === WORKFLOW_PROFILE_DIGEST && asString(profile.definition_json) === canonicalJson(WORKFLOW_PROFILE),
        'PROFILE_CONFLICT',
        '工作流程方案版本冲突。',
      );
      this.#authority
        .prepare(
          `INSERT INTO workflow_instances(
             workflow_instance_id, book_id, manuscript_id, profile_id, profile_version, current_phase, state, created_at
           ) VALUES (?, ?, ?, ?, ?, ?, 'active', ?)`,
        )
        .run(
          workflowInstanceId,
          bookId,
          manuscriptId,
          WORKFLOW_PROFILE.id,
          WORKFLOW_PROFILE.version,
          WORKFLOW_PROFILE.phases[0],
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
      };
      this.#authority
        .prepare(
          `INSERT INTO import_commits(
             commit_id, draft_id, request_fingerprint, expected_draft_version, review_digest, result_json, committed_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          input.commitId,
          input.draftId,
          requestFingerprint,
          input.expectedDraftVersion,
          input.reviewDigest,
          canonicalJson(result),
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
                  state, prepared_at, completion_acknowledged_at
           FROM import_commit_attempts WHERE attempt_id = ?`,
        )
        .all(attemptId) as SqlRow[],
      'COMMIT_ATTEMPT_NOT_FOUND',
      '导入提交尝试不存在。',
    );
    const state = asString(row.state);
    requireStore(state === 'prepared' || state === 'uncertain' || state === 'committed', 'STORE_CORRUPT', '导入提交尝试状态无效。');
    return {
      attemptId: asString(row.attempt_id),
      draftId: asString(row.draft_id),
      requestFingerprint: asString(row.request_fingerprint),
      expectedDraftVersion: asNumber(row.expected_draft_version),
      reviewDigest: asString(row.review_digest),
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
        attempt.requestFingerprint ===
          sha256(
            canonicalJson({
              draftId: attempt.draftId,
              expectedDraftVersion: attempt.expectedDraftVersion,
              reviewDigest: attempt.reviewDigest,
              commitId: attempt.attemptId,
            }),
          ),
        'COMMIT_PROOF_INCONCLUSIVE',
        '导入提交尝试绑定无法重建。',
      );
      const counts = one(
        this.#authority
          .prepare(
            `SELECT
               (SELECT count(*) FROM import_commits WHERE commit_id = ?) commits,
               (SELECT count(*) FROM manuscript_import_records WHERE commit_id = ?) import_records`,
          )
          .all(attempt.attemptId, attempt.attemptId) as SqlRow[],
        'STORE_CORRUPT',
        '无法读取导入提交证据。',
      );
      const commitCount = asNumber(counts.commits);
      const importRecordCount = asNumber(counts.import_records);
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
            `SELECT draft_id, request_fingerprint, expected_draft_version, review_digest, result_json, committed_at
             FROM import_commits WHERE commit_id = ?`,
          )
          .all(attempt.attemptId) as SqlRow[],
        'COMMIT_PROOF_INCONCLUSIVE',
        '导入提交证据缺失。',
      );
      requireStore(
        asString(commit.draft_id) === attempt.draftId &&
          asString(commit.request_fingerprint) === attempt.requestFingerprint &&
          asNumber(commit.expected_draft_version) === attempt.expectedDraftVersion &&
          asString(commit.review_digest) === attempt.reviewDigest &&
          draftState === 'committed' &&
          committedCommitId === attempt.attemptId,
        'COMMIT_PROOF_INCONCLUSIVE',
        '导入提交证据无法与持久尝试精确对应。',
      );
      const stored = this.#loadStoredCommitResult(attempt.attemptId);
      requireStore(
        asString(commit.result_json) === canonicalJson(stored),
        'COMMIT_PROOF_INCONCLUSIVE',
        '导入提交结果与权威记录图不一致。',
      );
      this.#assertRecoveredCommitGraph(stored);
      await this.#verifyCommittedContentObject(stored);
      this.#authority
        .prepare(
          `UPDATE import_commit_attempts
           SET state = 'committed', committed_at = ?, uncertain_at = NULL, uncertainty_code = NULL
           WHERE attempt_id = ?`,
        )
        .run(asString(commit.committed_at), attempt.attemptId);
      return {
        state: 'committed',
        result: { ...stored, firstWindow: this.getManuscriptWindow(stored.manuscriptId, stored.branchId, null) },
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
                  d.reviewed_target_choice_id, a.attempt_id
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
    const targetLabel =
      reviewedTarget === 'new-book'
        ? '新建图书'
        : reviewedTarget === 'new-book-distinct-intended-work'
          ? '新建图书（作为不同作品）'
          : null;
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

  #assertRecoveredCommitGraph(result: Omit<ImportCommitProjection, 'firstWindow'>): void {
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
                WHERE book_id = ? AND manuscript_id = ? AND state = 'active') workflows,
             (SELECT count(*) FROM manuscript_import_records
                WHERE import_record_id = ? AND commit_id = ? AND book_id = ? AND manuscript_id = ?
                  AND resulting_revision_id = ?) import_records,
             (SELECT count(*) FROM source_provenance sp
                JOIN manuscript_import_records ir ON ir.source_version_id = sp.source_version_id
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

  async #verifyCommittedContentObject(result: Omit<ImportCommitProjection, 'firstWindow'>): Promise<void> {
    const row = one(
      this.#authority
        .prepare(
          `SELECT co.object_digest, co.relative_key, co.byte_length
           FROM manuscript_import_records ir
           JOIN source_versions sv ON sv.source_version_id = ir.source_version_id
           JOIN content_objects co ON co.object_digest = sv.object_digest
           WHERE ir.import_record_id = ? AND ir.commit_id = ?`,
        )
        .all(result.importRecordId, result.commitId) as SqlRow[],
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
      this.#authority.prepare('DELETE FROM staged_import_snapshots WHERE draft_id = ?').run(snapshot.draftId);
      this.#promoteIngestSnapshot(snapshot.draftId, ingested, now);
      const update = this.#authority
        .prepare(
          `UPDATE import_drafts
           SET state = 'staged', draft_version = ?, reviewed_title = NULL, reviewed_target_choice_id = NULL,
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
      const update = this.#authority
        .prepare(
          `UPDATE import_drafts
           SET state = 'staged', draft_version = ?, reviewed_title = NULL, reviewed_target_choice_id = NULL,
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

  async #parseIntoIngest(draftId: string, path: string, displayName: string): Promise<IngestedDocx> {
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
      });
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
      targetChoices: [targetChoice],
      fidelity: snapshot.fidelity,
      detectedBlockCount: snapshot.blockCount,
    };
  }

  #reviewProjection(
    snapshot: DraftSnapshot,
    confirmedTitle: string,
    reviewDigest: string | null,
    plan: ImportFidelityPlan,
    accepted: boolean,
    targetChoiceId: NewBookImportTargetChoiceId,
    identityFindings: ReadonlyArray<ImportIdentityFindingProjection>,
    commitAttemptId: string | null,
  ): ReviewBeforeImportProjection {
    const targetChoice = newBookTargetChoice(identityFindings);
    requireStore(targetChoiceId === targetChoice.id, 'TARGET_CHOICE_CHANGED', '导入目标选择已变化，请重新选择。');
    return {
      draftId: snapshot.draftId,
      draftVersion: snapshot.version,
      reviewDigest,
      commitAttemptId,
      target: {
        choiceId: targetChoiceId,
        kind: 'new-book',
        label: targetChoice.label,
        confirmedTitle,
      },
      source: this.#stagedProjection(snapshot).source,
      identityFindings,
      fidelity: snapshot.fidelity,
      recordsToCreate: recordsToCreate(plan),
      nonEffects: nonEffects(plan),
      workflowProfile: {
        id: WORKFLOW_PROFILE.id,
        name: WORKFLOW_PROFILE.name,
        version: WORKFLOW_PROFILE.version,
        digest: WORKFLOW_PROFILE_DIGEST,
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
                sv.structure_digest, sv.parser_identity, sv.display_name, ir.import_record_id
         FROM source_versions sv
         JOIN books b ON b.book_id = sv.book_id
         JOIN manuscript_import_records ir
           ON ir.book_id = sv.book_id
          AND ir.source_version_id = sv.source_version_id
         ORDER BY b.title COLLATE BINARY, b.book_id, sv.source_version_id, ir.import_record_id`,
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
    return {
      draftId: asString(row.draft_id),
      state: asString(row.state),
      version: asNumber(row.draft_version),
      displayName: asString(row.display_name),
      objectDigest: asString(row.object_digest),
      selectedPath,
      reviewedTitle: row.reviewed_title === null ? null : asString(row.reviewed_title),
      reviewedTargetChoiceId,
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

  #loadStoredCommitResult(commitId: string): Omit<ImportCommitProjection, 'firstWindow'> {
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
             (SELECT count(*) FROM workflow_instances WHERE workflow_instance_id = ?) workflows,
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
