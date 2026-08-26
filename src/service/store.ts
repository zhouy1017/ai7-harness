import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { constants, createReadStream } from 'node:fs';
import { copyFile, open, realpath, rename, rm } from 'node:fs/promises';
import { basename, isAbsolute, posix, relative, resolve, sep } from 'node:path';
import { DatabaseSync, type SQLOutputValue } from 'node:sqlite';
import type {
  FidelityCategoryProjection,
  ImportCommitProjection,
  ImportDegradationDecisionReviewProjection,
  JournalAcknowledgement,
  JournalEditInput,
  ManuscriptBlockProjection,
  ManuscriptWindowProjection,
  ReviewBeforeImportProjection,
  StagedImportProjection,
} from '../shared/protocol.js';
import {
  MAX_BLOCK_CODE_UNITS,
  MAX_BLOCK_GRAPHEMES,
  MAX_EDIT_CODE_UNITS,
  MAX_EDIT_GRAPHEMES,
  MAX_WINDOW_BLOCKS,
} from '../shared/protocol.js';
import {
  deriveImportFidelityPlan,
  parseDocx,
  type ImportFidelityPlan,
  type ParsedDocxBlock,
} from './docx.js';
import {
  createCanonicalExternalDataRoot,
  ensureCanonicalDataDirectory,
  inspectCanonicalDataFile,
} from '../shared/data-root.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOKEN_PATTERN = UUID_PATTERN;
const SCHEMA_VERSION = 2;
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

function stableWorkingDigest(rows: Array<{ blockId: string; position: number; digest: string }>): string {
  return sha256(canonicalJson(rows));
}

function segmentGraphemes(text: string): string[] {
  return Array.from(new Intl.Segmenter('zh-CN', { granularity: 'grapheme' }).segment(text), (part) => part.segment);
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

function initializeSchema(db: DatabaseSync): void {
  const versionRow = one(db.prepare('PRAGMA user_version').all() as SqlRow[], 'SCHEMA_INVALID', '无法读取数据库版本。');
  const currentVersion = asNumber(versionRow.user_version);
  requireStore(currentVersion === 0 || currentVersion === 1 || currentVersion === SCHEMA_VERSION, 'SCHEMA_UNSUPPORTED', '数据库版本不受支持。');
  if (currentVersion === SCHEMA_VERSION) return;
  if (currentVersion === 1) {
    migrateSchemaV1ToV2(db);
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
      reviewed_title TEXT,
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

    CREATE INDEX working_blocks_window ON working_blocks(branch_id, position);
    CREATE INDEX journal_branch_order ON edit_journal_entries(branch_id, sequence);

    PRAGMA user_version = 2;
    COMMIT;
  `);
}

interface DraftSnapshot {
  draftId: string;
  state: string;
  version: number;
  displayName: string;
  objectDigest: string;
  reviewedTitle: string | null;
  reviewDigest: string | null;
  parserIdentity: string;
  sourceDigest: string;
  sourceBytes: number;
  contentDigest: string;
  structureDigest: string;
  blockCount: number;
  fidelity: FidelityCategoryProjection[];
  titleSuggestion: string;
  titleSource: StagedImportProjection['titleSuggestion']['sourceLabel'];
}

function recordsToCreate(plan: ImportFidelityPlan): ReadonlyArray<string> {
  if (plan.degradations.length === 0) return BASE_RECORDS_TO_CREATE;
  return [...BASE_RECORDS_TO_CREATE.slice(0, 4), '导入降级决定', ...BASE_RECORDS_TO_CREATE.slice(4)];
}

function nonEffects(plan: ImportFidelityPlan): ReadonlyArray<string> {
  return plan.degradations.length === 0 ? [...NON_EFFECTS, CLEAN_IMPORT_NON_EFFECT] : NON_EFFECTS;
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

function createNewBookReviewDigest(
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

export class EditorialStore {
  readonly #dataRoot: string;
  readonly #objectsRoot: string;
  readonly #authority: DatabaseSync;
  readonly #journal: DatabaseSync;
  readonly #cursorSecret = randomBytes(32);
  #poisoned = false;

  private constructor(dataRoot: string, objectsRoot: string, authority: DatabaseSync, journal: DatabaseSync) {
    this.#dataRoot = dataRoot;
    this.#objectsRoot = objectsRoot;
    this.#authority = authority;
    this.#journal = journal;
  }

  static async open(dataRootInput: string, codeRoot: string): Promise<EditorialStore> {
    requireStore(isAbsolute(dataRootInput), 'DATA_ROOT_INVALID', 'Agent Data Root 必须是绝对路径。');
    const dataRoot = await createCanonicalExternalDataRoot(dataRootInput, codeRoot);
    const objectsRoot = await ensureCanonicalDataDirectory(dataRoot, 'objects');
    const storeRoot = await ensureCanonicalDataDirectory(dataRoot, 'store');
    const { path: databasePath } = await inspectCanonicalDataFile(dataRoot, storeRoot, 'ai7.sqlite');
    for (const sidecar of ['ai7.sqlite-journal', 'ai7.sqlite-shm', 'ai7.sqlite-wal']) {
      await inspectCanonicalDataFile(dataRoot, storeRoot, sidecar);
    }
    const authority = new DatabaseSync(databasePath);
    configureDatabase(authority);
    initializeSchema(authority);
    const journal = new DatabaseSync(databasePath);
    configureDatabase(journal);
    return new EditorialStore(dataRoot, objectsRoot, authority, journal);
  }

  close(): void {
    try {
      this.#journal.close();
    } finally {
      this.#authority.close();
    }
  }

  async stageSelectedDocx(selectionToken: string, selectedPathInput: string): Promise<StagedImportProjection> {
    this.#assertAvailable();
    requireStore(TOKEN_PATTERN.test(selectionToken), 'SELECTION_INVALID', '文件选择令牌无效。');
    requireStore(isAbsolute(selectedPathInput), 'SELECTION_INVALID', '文件选择结果无效。');

    try {
      const selectedPath = await realpath(selectedPathInput);
      const displayName = safeDisplayName(basename(selectedPath));
      const parsed = await parseDocx(selectedPath, displayName);
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
        if (inspectedObject.exists) await rm(objectPath, { force: true });
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
          requireStore(inspectedTemporary.exists && inspectedTemporary.path === temporary, 'OBJECT_PATH_INVALID', '暂存对象路径无效。');
          const handle = await open(temporary, 'r+');
          try {
            await handle.sync();
          } finally {
            await handle.close();
          }
          requireStore((await digestFile(temporary)) === parsed.sourceDigest, 'OBJECT_VERIFY_FAILED', '暂存对象校验失败。');
          requireStore(
            !(await inspectCanonicalDataFile(this.#dataRoot, objectDirectory, objectFileName)).exists,
            'OBJECT_PATH_INVALID',
            '对象路径在提交前发生变化。',
          );
          await rename(temporary, objectPath);
          const activated = await inspectCanonicalDataFile(this.#dataRoot, objectDirectory, objectFileName);
          requireStore(activated.exists && activated.path === objectPath, 'OBJECT_PATH_INVALID', '暂存对象激活无效。');
        } catch (error) {
          const cleanup = await inspectCanonicalDataFile(this.#dataRoot, objectDirectory, temporaryName);
          if (cleanup.exists) await rm(cleanup.path, { force: true });
          throw error;
        }
      }

      const draftId = randomUUID();
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
               draft_id, selection_token, state, draft_version, display_name, object_digest, staged_at
             ) VALUES (?, ?, 'staged', 1, ?, ?, ?)`,
          )
          .run(draftId, selectionToken, displayName, parsed.sourceDigest, now);
        this.#authority
          .prepare(
            `INSERT INTO staged_import_snapshots(
               draft_id, parser_identity, source_digest, content_digest, structure_digest, block_count,
               fidelity_json, title_suggestion, title_source, snapshot_created_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            draftId,
            parsed.parserIdentity,
            parsed.sourceDigest,
            parsed.contentDigest,
            parsed.structureDigest,
            parsed.blocks.length,
            canonicalJson(parsed.fidelity),
            parsed.titleSuggestion.value,
            parsed.titleSuggestion.sourceLabel,
            now,
          );
        const insertBlock = this.#authority.prepare(
          `INSERT INTO staged_import_blocks(
             draft_id, staged_block_id, position, kind, level, text, digest
           ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        );
        for (const block of parsed.blocks) {
          insertBlock.run(draftId, block.blockId, block.position, block.kind, block.level, block.text, block.digest);
        }
        this.#assertForeignKeys(this.#authority);
      });

      return this.#stagedProjection({
        draftId,
        state: 'staged',
        version: 1,
        displayName,
        objectDigest: parsed.sourceDigest,
        reviewedTitle: null,
        reviewDigest: null,
        parserIdentity: parsed.parserIdentity,
        sourceDigest: parsed.sourceDigest,
        sourceBytes: parsed.archiveBytes,
        contentDigest: parsed.contentDigest,
        structureDigest: parsed.structureDigest,
        blockCount: parsed.blocks.length,
        fidelity: parsed.fidelity,
        titleSuggestion: parsed.titleSuggestion.value,
        titleSource: parsed.titleSuggestion.sourceLabel,
      });
    } catch (error) {
      if (error instanceof StoreError) throw error;
      if (error instanceof Error && error.message.startsWith('DOCX_REJECTED:')) {
        throw new StoreError('DOCX_REJECTED', '该 DOCX 不符合当前受限本地导入边界。');
      }
      throw error;
    }
  }

  prepareNewBookReview(
    draftId: string,
    expectedDraftVersion: number,
    confirmedTitleInput: string,
    acceptDegradation: boolean,
  ): ReviewBeforeImportProjection {
    this.#assertAvailable();
    requireStore(UUID_PATTERN.test(draftId), 'DRAFT_INVALID', '导入草稿标识无效。');
    const confirmedTitle = safeTitle(confirmedTitleInput);
    const snapshot = this.#loadDraftSnapshot(draftId);
    requireStore(snapshot.state === 'staged', 'DRAFT_STATE_CHANGED', '导入草稿状态已变化。');
    requireStore(snapshot.version === expectedDraftVersion, 'DRAFT_VERSION_CHANGED', '导入草稿版本已变化。');
    const plan = this.#requireFidelityPlan(snapshot);
    if (plan.degradations.length > 0 && !acceptDegradation) {
      return this.#reviewProjection(snapshot, confirmedTitle, null, plan, false);
    }
    requireStore(
      plan.degradations.length > 0 || !acceptDegradation,
      'DEGRADATION_ACCEPTANCE_INVALID',
      '本次导入不需要降级接受。',
    );
    const nextVersion = expectedDraftVersion + 1;
    const reviewDigest = createNewBookReviewDigest(snapshot, confirmedTitle, nextVersion, plan);
    const reviewedAt = new Date().toISOString();
    this.#transaction(this.#authority, () => {
      const update = this.#authority
        .prepare(
          `UPDATE import_drafts
           SET state = 'reviewed', draft_version = ?, reviewed_title = ?, review_digest = ?, reviewed_at = ?
           WHERE draft_id = ? AND state = 'staged' AND draft_version = ?`,
        )
        .run(nextVersion, confirmedTitle, reviewDigest, reviewedAt, draftId, expectedDraftVersion);
      requireStore(update.changes === 1, 'DRAFT_VERSION_CHANGED', '导入草稿在复核时已变化。');
    });
    return this.#reviewProjection(
      { ...snapshot, state: 'reviewed', version: nextVersion, reviewedTitle: confirmedTitle, reviewDigest },
      confirmedTitle,
      reviewDigest,
      plan,
      plan.degradations.length > 0,
    );
  }

  commitNewBookImport(input: {
    draftId: string;
    expectedDraftVersion: number;
    reviewDigest: string;
    commitId: string;
  }): ImportCommitProjection {
    this.#assertAvailable();
    requireStore(UUID_PATTERN.test(input.draftId) && UUID_PATTERN.test(input.commitId), 'COMMIT_INVALID', '导入提交标识无效。');
    requireStore(/^[0-9a-f]{64}$/.test(input.reviewDigest), 'COMMIT_INVALID', '导入复核摘要无效。');
    const requestFingerprint = sha256(canonicalJson(input));
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
      requireStore(
        createNewBookReviewDigest(snapshot, snapshot.reviewedTitle, snapshot.version, plan) === input.reviewDigest,
        'REVIEW_CHANGED',
        '导入前复核摘要无法由当前权威快照重建。',
      );
      const stagedBlocks = this.#loadStagedBlocks(input.draftId);
      requireStore(stagedBlocks.length === snapshot.blockCount, 'SNAPSHOT_INCOMPLETE', '暂存快照不完整。');

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
      const authoritativeBlocks = stagedBlocks.map((block) => ({
        ...block,
        blockId: `blk_${sha256(`${manuscriptId}\u0000${block.position}\u0000${block.digest}`).slice(0, 24)}`,
      }));
      const revisionDigest = sha256(
        canonicalJson(authoritativeBlocks.map(({ blockId, position, kind, level, digest }) => ({ blockId, position, kind, level, digest }))),
      );
      const workingDigest = stableWorkingDigest(
        authoritativeBlocks.map(({ blockId, position, digest }) => ({ blockId, position, digest })),
      );

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
      const insertBlockIdentity = this.#authority.prepare(
        'INSERT INTO manuscript_blocks(block_id, manuscript_id, created_revision_id) VALUES (?, ?, ?)',
      );
      const insertBlockVersion = this.#authority.prepare(
        `INSERT INTO manuscript_block_versions(revision_id, block_id, position, kind, level, text, digest)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      );
      const insertWorkingBlock = this.#authority.prepare(
        `INSERT INTO working_blocks(branch_id, block_id, position, kind, level, text, digest)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      );
      for (const block of authoritativeBlocks) {
        insertBlockIdentity.run(block.blockId, manuscriptId, revisionId);
        insertBlockVersion.run(revisionId, block.blockId, block.position, block.kind, block.level, block.text, block.digest);
        insertWorkingBlock.run(branchId, block.blockId, block.position, block.kind, block.level, block.text, block.digest);
      }
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
             branch_id, manuscript_id, base_revision_id, journal_sequence, working_digest
           ) VALUES (?, ?, ?, 0, ?)`,
        )
        .run(branchId, manuscriptId, revisionId, workingDigest);

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
        blockCount: authoritativeBlocks.length,
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
    this.#assertAvailable();
    requireStore(UUID_PATTERN.test(manuscriptId) && UUID_PATTERN.test(branchId), 'WINDOW_INVALID', '稿件窗口标识无效。');
    const binding = one(
      this.#authority
        .prepare(
          `SELECT m.book_id, bws.base_revision_id, bws.journal_sequence
           FROM manuscripts m
           JOIN manuscript_branches mb ON mb.manuscript_id = m.manuscript_id
           JOIN branch_working_state bws ON bws.branch_id = mb.branch_id
           WHERE m.manuscript_id = ? AND mb.branch_id = ?`,
        )
        .all(manuscriptId, branchId) as SqlRow[],
      'WINDOW_NOT_FOUND',
      '稿件窗口不存在。',
    );
    const revisionId = asString(binding.base_revision_id);
    const journalSequence = asNumber(binding.journal_sequence);
    const offset = cursor === null ? 0 : this.#decodeCursor(cursor, { manuscriptId, branchId, revisionId, journalSequence });
    requireStore(offset >= 0 && Number.isSafeInteger(offset), 'CURSOR_INVALID', '稿件窗口游标无效。');
    const totalRow = one(
      this.#authority.prepare('SELECT count(*) total FROM working_blocks WHERE branch_id = ?').all(branchId) as SqlRow[],
      'WINDOW_NOT_FOUND',
      '稿件窗口计数缺失。',
    );
    const totalBlocks = asNumber(totalRow.total);
    requireStore(offset < totalBlocks, 'CURSOR_INVALID', '稿件窗口游标越界。');
    const rows = this.#authority
      .prepare(
        `SELECT block_id, position, kind, level, text, digest
         FROM working_blocks WHERE branch_id = ? ORDER BY position LIMIT ? OFFSET ?`,
      )
      .all(branchId, MAX_WINDOW_BLOCKS + 1, offset) as SqlRow[];
    const visibleRows = rows.slice(0, MAX_WINDOW_BLOCKS);
    const blocks: ManuscriptBlockProjection[] = visibleRows.map((row) => ({
      blockId: asString(row.block_id),
      position: asNumber(row.position),
      kind: asString(row.kind) as ManuscriptBlockProjection['kind'],
      level: row.level === null ? null : asNumber(row.level),
      text: asString(row.text),
      digest: asString(row.digest),
    }));
    requireStore(blocks.length > 0 && blocks.length <= MAX_WINDOW_BLOCKS, 'WINDOW_NOT_FOUND', '稿件窗口为空。');
    const startBlock = blocks[0]!.position;
    const endBlock = blocks.at(-1)!.position;
    const cursorBinding = { manuscriptId, branchId, revisionId, journalSequence };
    return {
      bookId: asString(binding.book_id),
      manuscriptId,
      branchId,
      revisionId,
      revisionLabel: 'r1',
      journalSequence,
      previousCursor: offset > 0 ? this.#encodeCursor({ ...cursorBinding, offset: Math.max(0, offset - MAX_WINDOW_BLOCKS) }) : null,
      nextCursor: rows.length > MAX_WINDOW_BLOCKS ? this.#encodeCursor({ ...cursorBinding, offset: offset + MAX_WINDOW_BLOCKS }) : null,
      position: {
        startBlock,
        endBlock,
        totalBlocks,
        label: `第 ${startBlock}–${endBlock} 段，共 ${totalBlocks} 段`,
      },
      blocks,
    };
  }

  flushJournalEdit(input: JournalEditInput): JournalAcknowledgement {
    this.#assertAvailable();
    requireStore(
      UUID_PATTERN.test(input.clientEditId) &&
        UUID_PATTERN.test(input.manuscriptId) &&
        UUID_PATTERN.test(input.branchId) &&
        UUID_PATTERN.test(input.baseRevisionId),
      'EDIT_INVALID',
      '编辑标识无效。',
    );
    requireStore(/^blk_[0-9a-f]{24}$/.test(input.blockId), 'EDIT_INVALID', '稳定内容块标识无效。');
    requireStore(/^[0-9a-f]{64}$/.test(input.baseBlockDigest), 'EDIT_INVALID', '内容块摘要无效。');
    requireStore(input.insertText.isWellFormed(), 'EDIT_INVALID', '编辑文本无效。');
    requireStore(
      Number.isSafeInteger(input.expectedJournalSequence) && input.expectedJournalSequence >= 0,
      'EDIT_INVALID',
      '修订日志序号无效。',
    );
    const insertedGraphemes = segmentGraphemes(input.insertText);
    requireStore(
      input.insertText.length <= MAX_EDIT_CODE_UNITS && insertedGraphemes.length <= MAX_EDIT_GRAPHEMES,
      'EDIT_TOO_LARGE',
      '单次编辑超出安全范围。',
    );
    const requestFingerprint = sha256(canonicalJson(input));
    const prior = this.#journal
      .prepare(
        `SELECT client_edit_id, request_fingerprint, branch_id, base_revision_id, block_id, sequence,
                resulting_block_digest, resulting_working_digest, durable_at
         FROM edit_journal_entries WHERE client_edit_id = ?`,
      )
      .all(input.clientEditId) as SqlRow[];
    if (prior.length === 1) {
      requireStore(asString(prior[0]!.request_fingerprint) === requestFingerprint, 'IDEMPOTENCY_CONFLICT', '编辑标识已用于另一项修改。');
      return this.#journalAck(prior[0]!);
    }

    this.#transaction(this.#journal, () => {
      const state = one(
        this.#journal
          .prepare(
            `SELECT manuscript_id, base_revision_id, journal_sequence
             FROM branch_working_state WHERE branch_id = ?`,
          )
          .all(input.branchId) as SqlRow[],
        'EDIT_BINDING_CHANGED',
        '稿件分支状态已变化。',
      );
      requireStore(
        asString(state.manuscript_id) === input.manuscriptId && asString(state.base_revision_id) === input.baseRevisionId,
        'EDIT_BINDING_CHANGED',
        '编辑绑定已变化。',
      );
      const currentSequence = asNumber(state.journal_sequence);
      requireStore(currentSequence === input.expectedJournalSequence, 'EDIT_SEQUENCE_CHANGED', '修订日志已前进，请刷新窗口。');
      const block = one(
        this.#journal
          .prepare('SELECT position, kind, level, text, digest FROM working_blocks WHERE branch_id = ? AND block_id = ?')
          .all(input.branchId, input.blockId) as SqlRow[],
        'EDIT_BLOCK_CHANGED',
        '稳定内容块不存在。',
      );
      requireStore(asString(block.digest) === input.baseBlockDigest, 'EDIT_BLOCK_CHANGED', '内容块已变化，请刷新窗口。');
      const originalGraphemes = segmentGraphemes(asString(block.text));
      requireStore(
        Number.isSafeInteger(input.fromGrapheme) &&
          Number.isSafeInteger(input.toGrapheme) &&
          input.fromGrapheme >= 0 &&
          input.toGrapheme >= input.fromGrapheme &&
          input.toGrapheme <= originalGraphemes.length &&
          input.toGrapheme - input.fromGrapheme <= MAX_EDIT_GRAPHEMES,
        'EDIT_RANGE_INVALID',
        '编辑字素范围无效。',
      );
      const resultingText = [
        ...originalGraphemes.slice(0, input.fromGrapheme),
        ...insertedGraphemes,
        ...originalGraphemes.slice(input.toGrapheme),
      ].join('');
      requireStore(
        resultingText.length <= MAX_BLOCK_CODE_UNITS && segmentGraphemes(resultingText).length <= MAX_BLOCK_GRAPHEMES,
        'EDIT_TOO_LARGE',
        '编辑后内容块超出安全范围。',
      );
      const kind = asString(block.kind) as ManuscriptBlockProjection['kind'];
      const level = block.level === null ? null : asNumber(block.level);
      const resultingBlockDigest = sha256(canonicalJson({ kind, level, text: resultingText }));
      const update = this.#journal
        .prepare('UPDATE working_blocks SET text = ?, digest = ? WHERE branch_id = ? AND block_id = ? AND digest = ?')
        .run(resultingText, resultingBlockDigest, input.branchId, input.blockId, input.baseBlockDigest);
      requireStore(update.changes === 1, 'EDIT_BLOCK_CHANGED', '内容块在保存时已变化。');
      const digestRows = this.#journal
        .prepare('SELECT block_id, position, digest FROM working_blocks WHERE branch_id = ? ORDER BY position')
        .all(input.branchId) as SqlRow[];
      const resultingWorkingDigest = stableWorkingDigest(
        digestRows.map((row) => ({
          blockId: asString(row.block_id),
          position: asNumber(row.position),
          digest: asString(row.digest),
        })),
      );
      const sequence = currentSequence + 1;
      const durableAt = new Date().toISOString();
      this.#journal
        .prepare(
          `INSERT INTO edit_journal_entries(
             journal_entry_id, client_edit_id, request_fingerprint, manuscript_id, branch_id, base_revision_id,
             sequence, block_id, from_grapheme, to_grapheme, insert_text, resulting_block_digest,
             resulting_working_digest, durable_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          randomUUID(),
          input.clientEditId,
          requestFingerprint,
          input.manuscriptId,
          input.branchId,
          input.baseRevisionId,
          sequence,
          input.blockId,
          input.fromGrapheme,
          input.toGrapheme,
          input.insertText,
          resultingBlockDigest,
          resultingWorkingDigest,
          durableAt,
        );
      const stateUpdate = this.#journal
        .prepare(
          `UPDATE branch_working_state SET journal_sequence = ?, working_digest = ?
           WHERE branch_id = ? AND journal_sequence = ?`,
        )
        .run(sequence, resultingWorkingDigest, input.branchId, currentSequence);
      requireStore(stateUpdate.changes === 1, 'EDIT_SEQUENCE_CHANGED', '修订日志在保存时已前进。');
      this.#assertForeignKeys(this.#journal);
    });

    const committed = one(
      this.#journal
        .prepare(
          `SELECT client_edit_id, request_fingerprint, branch_id, base_revision_id, block_id, sequence,
                  resulting_block_digest, resulting_working_digest, durable_at
           FROM edit_journal_entries WHERE client_edit_id = ?`,
        )
        .all(input.clientEditId) as SqlRow[],
      'JOURNAL_ACK_FAILED',
      '修订日志已提交但无法读取确认。',
    );
    requireStore(asString(committed.request_fingerprint) === requestFingerprint, 'JOURNAL_ACK_FAILED', '修订日志确认不匹配。');
    return this.#journalAck(committed);
  }

  #stagedProjection(snapshot: DraftSnapshot): StagedImportProjection {
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
      targetChoices: [{ id: 'new-book', label: '新建图书', selected: false }],
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
  ): ReviewBeforeImportProjection {
    return {
      draftId: snapshot.draftId,
      draftVersion: snapshot.version,
      reviewDigest,
      target: { kind: 'new-book', label: '新建图书', confirmedTitle },
      source: this.#stagedProjection(snapshot).source,
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

  #loadDraftSnapshot(draftId: string): DraftSnapshot {
    const row = one(
      this.#authority
        .prepare(
          `SELECT d.draft_id, d.state, d.draft_version, d.display_name, d.object_digest,
                  d.reviewed_title, d.review_digest, s.parser_identity, s.source_digest,
                  s.content_digest, s.structure_digest, s.block_count, s.fidelity_json,
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
    return {
      draftId: asString(row.draft_id),
      state: asString(row.state),
      version: asNumber(row.draft_version),
      displayName: asString(row.display_name),
      objectDigest: asString(row.object_digest),
      reviewedTitle: row.reviewed_title === null ? null : asString(row.reviewed_title),
      reviewDigest: row.review_digest === null ? null : asString(row.review_digest),
      parserIdentity: asString(row.parser_identity),
      sourceDigest,
      sourceBytes,
      contentDigest: asString(row.content_digest),
      structureDigest: asString(row.structure_digest),
      blockCount: asNumber(row.block_count),
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

  #loadStagedBlocks(draftId: string): ParsedDocxBlock[] {
    return (
      this.#authority
        .prepare(
          `SELECT staged_block_id, position, kind, level, text, digest
           FROM staged_import_blocks WHERE draft_id = ? ORDER BY position`,
        )
        .all(draftId) as SqlRow[]
    ).map((row) => ({
      blockId: asString(row.staged_block_id),
      position: asNumber(row.position),
      kind: asString(row.kind) as ParsedDocxBlock['kind'],
      level: row.level === null ? null : asNumber(row.level),
      text: asString(row.text),
      digest: asString(row.digest),
    }));
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

  #encodeCursor(value: {
    manuscriptId: string;
    branchId: string;
    revisionId: string;
    journalSequence: number;
    offset: number;
  }): string {
    const payload = Buffer.from(canonicalJson({ version: 1, ...value }), 'utf8').toString('base64url');
    const signature = createHmac('sha256', this.#cursorSecret).update(payload).digest('base64url');
    return `${payload}.${signature}`;
  }

  #decodeCursor(
    cursor: string,
    expected: { manuscriptId: string; branchId: string; revisionId: string; journalSequence: number },
  ): number {
    const [payload, signature, extra] = cursor.split('.');
    requireStore(payload && signature && extra === undefined, 'CURSOR_INVALID', '稿件窗口游标无效。');
    const actual = createHmac('sha256', this.#cursorSecret).update(payload).digest();
    const supplied = Buffer.from(signature, 'base64url');
    requireStore(actual.length === supplied.length && timingSafeEqual(actual, supplied), 'CURSOR_INVALID', '稿件窗口游标无效。');
    const value = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Record<string, unknown>;
    requireStore(
      value.version === 1 &&
        value.manuscriptId === expected.manuscriptId &&
        value.branchId === expected.branchId &&
        value.revisionId === expected.revisionId &&
        value.journalSequence === expected.journalSequence &&
        typeof value.offset === 'number' &&
        Number.isSafeInteger(value.offset),
      'CURSOR_CHANGED',
      '稿件窗口绑定已变化。',
    );
    return value.offset;
  }

  #journalAck(row: SqlRow): JournalAcknowledgement {
    return {
      clientEditId: asString(row.client_edit_id),
      branchId: asString(row.branch_id),
      baseRevisionId: asString(row.base_revision_id),
      blockId: asString(row.block_id),
      sequence: asNumber(row.sequence),
      resultingBlockDigest: asString(row.resulting_block_digest),
      resultingWorkingDigest: asString(row.resulting_working_digest),
      durableAt: asString(row.durable_at),
      completionLabel: '已写入修订日志',
    };
  }
}
