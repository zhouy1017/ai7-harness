import { BOOK_LAST_WORKED_SQL } from './book-people.js';
import type { ManualCommandRequestPin, ManualCommandSource } from '../shared/protocol/learning.js';
import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { BoundedStoreError, BoundedStoreFatalError, requireBounded, one, asString, asNumber, canonicalJson, sha256, graphemes,
  transact, stagedBlockLength, UUID_PATTERN, DIGEST_PATTERN, BLOCK_PATTERN, HISTORY_BATCH, MIGRATION_BATCH } from './manuscript/bounded-kernel.js';
import { openRestoreStep, recordStepAnchors, recordGroupPart, RestoreConflict, stepQuote, supersedeAllSteps, type EditorStepHost } from './manuscript/editor-steps.js';
import type { BookVersionScope, BookVersionRow, ServiceOperationMap } from '../shared/protocol.js';
import {
  assignKeysAndPages, blockAtCharacter, keyAtParagraph, offsetBefore, paragraphAtKey, paragraphCount, placesOfKeys, positionsOfBlocks,
  replaceWorkingState, rewriteBlock, rowsFrom, validateBranchPositions, workingBlock as workingRow,
} from './manuscript/working-positions.js';
import { withNoteReferences } from './manuscript/note-blocks.js';
import type { ManuscriptSourceObjects } from './manuscript/source-objects.js';
import { inlineRevisionBaseline, recordInlineEditorRevision, syncInlineEditorRevision } from './inline-editor-revisions.js';
import { aiLocksOfWindow } from './ai-edit-locks.js';
import { blockReachesThroughLineage, historyStale, inverseTargetsTouchInOrder, type InverseTarget, isStructuralGroup, journalHasStructuralEdits, replayStructuralGroup, restoreRevisionMergeLineage, verifyStructuralReconstruction, writeStructuralEdit } from './manuscript/structural-edits.js';
import { blockDigest, blockShapeFromDigest, CommandEvidenceReader, recoveryCommandEvidenceDigest, recoveryWorkingDigest, validateCommandHistoryGroup, type CommandEvidenceHeader, type CommandEvidenceMember } from './manuscript/command-history.js';
export { BoundedStoreError, BoundedStoreFatalError } from './manuscript/bounded-kernel.js';
export type { CommandEvidenceHeader, CommandEvidenceMember } from './manuscript/command-history.js';
import { DatabaseSync, type SQLOutputValue } from 'node:sqlite';
import {
  acceptedSourceImportRetainedBoundaryLabels,
  type SourceFormat,
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
  fidelityStatusLabel,
  milestonePurposeKindOf,
  type DurableHistoryProjection,
  type FidelityCategoryProjection,
  type HistoricalRevisionProjection,
  type JournalAcknowledgement,
  type JournalEditInput,
  type ManuscriptBlockProjection,
  type ManuscriptEntryPositionProjection,
  type ManuscriptRailProjection,
  MAX_RAIL_CHAPTERS,
  MAX_RAIL_MARKS,
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
  EDIT_JOURNAL_FAULT_CODE,
  EDIT_JOURNAL_FAULT_REFUSED_CODE,
  isEditJournalFaultMode,
  type EditJournalFaultMode,
  type EditJournalFaultProjection,
} from '../shared/protocol.js';
import { DOCX_PARSER_IDENTITY_V1, deriveImportFidelityPlan, type FidelityConversionIdentity } from './docx.js';
import type { BuiltInWorkflowProfile } from './native-workflow-profile.js';
import {
  followBlockTextChangeForMarks,
  marksOfWindow,
  openMarkPlaces,
  resolveBranchMarksAfterRewrite,
  workingBlockDigests,
} from './editorial-marks.js';

const SEARCH_BATCH = 128;
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

type SqlRow = Record<string, SQLOutputValue>;

/** The most exact ranges one AI7 Apply may replace; a batch beyond it is prepared as more than one. */
export const MAX_EXACT_REPLACEMENT_TARGETS = 500;

/** One exact range of the working state and the text that replaces it. */
export interface ExactReplacementTarget {
  blockId: string;
  fromGrapheme: number;
  toGrapheme: number;
  expectedText: string;
  insertText: string;
  /** Internal inverse of one committed Effect target; never supplied by the renderer. */
  reversalOf?: { effectId: string; itemId: string };
}

export interface ManuscriptStateIdentity {
  revisionId: string;
  journalSequence: number;
  workingDigest: string;
}

/** What one committed Apply did: the manuscript state before and after, and where each target stands now. */
export interface ExactReplacementCommit {
  commandGroupId: string;
  bookId: string;
  before: ManuscriptStateIdentity;
  after: ManuscriptStateIdentity;
  targets: Array<{
    index: number;
    blockId: string;
    beforeBlockDigest: string;
    afterBlockDigest: string;
    resultingFromGrapheme: number;
    resultingToGrapheme: number;
  }>;
  committedAt: string;
}

/**
 * The Edit Journal write-failure injection (Issue #951, wave 12 slice 12a; T0-1): process-local, so a restart starts it
 * `off`. Unarmed — every launch but J-02's armed one — it refuses to change and never fires. Armed, `fail-next` refuses the
 * next journal write and returns to `off`, `fail-all` refuses every write until set `off`. A refused write starts nothing:
 * the store is never reached, so a retry with the same client edit id is the one write, never a second entry.
 */
export class EditJournalFaultInjection {
  #mode: EditJournalFaultMode = 'off';

  constructor(readonly armed: boolean) {}

  set(mode: unknown): EditJournalFaultProjection {
    requireBounded(this.armed, EDIT_JOURNAL_FAULT_REFUSED_CODE, '写入故障注入只在开发测试启动中可用。');
    requireBounded(isEditJournalFaultMode(mode), 'EDIT_JOURNAL_FAULT_INVALID', '写入故障模式无效。');
    this.#mode = mode;
    return { mode };
  }

  get mode(): EditJournalFaultMode {
    return this.#mode;
  }

  /** Called before a journal write: refuses it while a mode is in force. */
  beforeJournalWrite(): void {
    if (!this.armed || this.#mode === 'off') return;
    if (this.#mode === 'fail-next') this.#mode = 'off';
    throw new BoundedStoreError(EDIT_JOURNAL_FAULT_CODE, '修订日志暂时无法确认写入。');
  }
}

/** One journal write under the injection: the write runs only when no fault is in force. */
export function journalWriteUnderFault<T>(fault: EditJournalFaultInjection, write: () => T): T {
  fault.beforeJournalWrite();
  return write();
}

/**
 * The conversion a persisted report must be rebuilt with, from the converter identity and format a
 * row carries: a review whose loss a converter caused reconstructs only when that converter is
 * named, so a converted import and a parsed one are never read back as each other (ADR 0072 §3).
 */
function rowFidelityConversion(
  converterIdentity: SQLOutputValue | undefined,
  format: SQLOutputValue | undefined,
): FidelityConversionIdentity | undefined {
  if (converterIdentity === null || converterIdentity === undefined) return undefined;
  const sourceFormat = asString(format);
  requireBounded(
    sourceFormat === 'TXT' || sourceFormat === 'MD' || sourceFormat === 'DOC',
    'SCHEMA_INVALID',
    '转换来源格式无效。',
  );
  return { identity: asString(converterIdentity), sourceFormat };
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
      // An original staged unparsed has no snapshot: its source digest is its object's, and it has no content,
      // structure or parser identity, so those compare with IS (as the store reads a draft, `#loadDraftSnapshot`).
      const reuse = db.prepare(
        `SELECT count(*) matches
         FROM source_versions sv
         JOIN import_drafts d ON d.draft_id = ?
         LEFT JOIN staged_import_snapshots sis ON sis.draft_id = d.draft_id
         WHERE sv.source_version_id = ? AND sv.book_id = d.reviewed_existing_book_id
           AND sv.object_digest = d.object_digest AND sv.source_digest = coalesce(sis.source_digest, d.object_digest)
           AND sv.content_digest IS sis.content_digest AND sv.structure_digest IS sis.structure_digest
           AND sv.parser_identity IS sis.parser_identity`,
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
  // A working representation read through a converter, and the converter's identity beside it, exist from revision 19
  // (ADR 0072 §2); this check also reads stores at earlier revisions, which have neither column and no such representation.
  const sourceColumns = new Set(
    (db.prepare('PRAGMA table_xinfo(source_versions)').all() as SqlRow[]).map((column) => asString(column.name)),
  );
  const workingObject = sourceColumns.has('working_object_digest') ? 'sv.working_object_digest' : 'NULL';
  const converterColumn = sourceColumns.has('converter_identity') ? 'sv.converter_identity' : 'NULL';
  const rows = db.prepare(
    `SELECT sir.source_import_record_id, sir.commit_id, sir.book_id, sir.source_version_id,
            sir.provenance_id, sir.target_kind, sir.source_version_disposition,
            sir.retained_boundary_json, sir.named_non_effects_json, sir.record_digest, sir.imported_at,
            sv.object_digest, sv.source_digest, sv.content_digest, sv.structure_digest,
            sv.parser_identity, sv.format, ${workingObject} working_object_digest, ${converterColumn} converter_identity,
            co.byte_length,
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
    // The Source Version is wholly parsed or wholly unparsed, in the format it was read as (ADR 0072 §2), and the
    // record's boundary says which, exactly as the store writes it (`store.ts`, `sourceImportRetainedBoundary`).
    const parserIdentity = row.parser_identity === null ? null : asString(row.parser_identity);
    const provenanceParserIdentity = row.provenance_parser_identity === null
      ? null
      : asString(row.provenance_parser_identity);
    const contentDigest = row.content_digest === null ? null : asString(row.content_digest);
    const structureDigest = row.structure_digest === null ? null : asString(row.structure_digest);
    // Parsed exactly when it is a DOCX or was read through its converter, as the store writes a Source Version and as
    // `validateStagedDraftInventory` holds a draft to (Issue #583): an unparsed DOCX, a parsed PDF, RTF, ODT or unknown
    // file, or a parsed file with no working representation is none the store wrote.
    const format = asString(row.format);
    const workingObjectDigest = row.working_object_digest === null ? null : asString(row.working_object_digest);
    const converterIdentity = row.converter_identity === null ? null : asString(row.converter_identity);
    requireBounded(
      (parserIdentity !== null) === (format === 'DOCX' || workingObjectDigest !== null),
      'SCHEMA_INVALID',
      '来源版本的格式与是否解析不一致。',
    );
    // The conversion columns hold as the store reads them back (`store.ts`, `readConversionColumns`; Issue #583): the
    // working representation and its converter's identity are set together or null together, and set only on a format
    // the product reads through a converter. A DOCX given a working object, or a converted TXT, MD or DOC with no
    // converter named, would otherwise open and fail its first read as STORE_CORRUPT.
    requireBounded(
      (workingObjectDigest === null) === (converterIdentity === null),
      'SCHEMA_INVALID',
      '来源版本的转换记录不完整。',
    );
    requireBounded(
      workingObjectDigest === null || format === 'TXT' || format === 'MD' || format === 'DOC',
      'SCHEMA_INVALID',
      '来源版本的格式不能带有转换记录。',
    );
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
        asString(row.object_digest) === asString(row.source_digest) &&
        boundary.kind === 'complete-local-file' &&
        acceptedSourceImportRetainedBoundaryLabels(format as SourceFormat, parserIdentity !== null)
          .some((label) => label === boundary.label) &&
        boundary.format === asString(row.format) && boundary.displayName === asString(row.sanitized_identity) &&
        boundary.sourceSha256 === asString(row.source_digest) &&
        boundary.sourceBytes === asNumber(row.byte_length) &&
        boundary.contentDigest === contentDigest &&
        boundary.structureDigest === structureDigest &&
        asString(row.acquisition_path) === 'native-file-picker' && asString(row.locality) === 'local-provider-free' &&
        provenanceParserIdentity === parserIdentity &&
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
  const invalidCommits = db.prepare(
    `SELECT ic.commit_id
     FROM import_commits ic
     WHERE (ic.operation_kind = 'manuscript-import') !=
             EXISTS (SELECT 1 FROM manuscript_import_records mir WHERE mir.commit_id = ic.commit_id)
        OR (ic.operation_kind = 'source-import') !=
             EXISTS (SELECT 1 FROM source_import_records sir WHERE sir.commit_id = ic.commit_id)
        OR (ic.operation_kind = 'manuscript-reimport') !=
             EXISTS (SELECT 1 FROM manuscript_reimport_records mrr WHERE mrr.commit_id = ic.commit_id)
        OR (SELECT count(*) FROM manuscript_import_records mir WHERE mir.commit_id = ic.commit_id) +
           (SELECT count(*) FROM source_import_records sir WHERE sir.commit_id = ic.commit_id)
           + (SELECT count(*) FROM manuscript_reimport_records mrr WHERE mrr.commit_id = ic.commit_id) != 1`,
  ).all() as SqlRow[];
  requireBounded(invalidCommits.length === 0, 'SCHEMA_INVALID', '导入提交类型与结果记录不一致。');
  const invalidAttempts = db.prepare(
    `SELECT a.attempt_id
     FROM import_commit_attempts a
     JOIN import_drafts d ON d.draft_id = a.draft_id
     LEFT JOIN import_commits ic ON ic.commit_id = a.attempt_id
     WHERE a.operation_kind != CASE d.reviewed_relationship
       WHEN 'source-only' THEN 'source-import'
       WHEN 'reimport' THEN 'manuscript-reimport'
       ELSE 'manuscript-import' END
       OR (ic.commit_id IS NOT NULL AND ic.operation_kind != a.operation_kind)`,
  ).all() as SqlRow[];
  requireBounded(invalidAttempts.length === 0, 'SCHEMA_INVALID', '导入提交尝试类型与草稿或提交不一致。');
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

function requirePersistedBlockTextBounds(
  db: DatabaseSync,
  table: 'manuscript_block_versions' | 'working_blocks',
  ownerId: string,
  code: string,
  message: string,
): void {
  const ownerColumn = table === 'manuscript_block_versions' ? 'revision_id' : 'branch_id';
  const oversized = db.prepare(
    `SELECT 1 FROM ${table}
     WHERE ${ownerColumn} = ? AND (typeof(text) <> 'text' OR length(CAST(text AS BLOB)) > ?) LIMIT 1`,
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
        ((kind === 'paragraph' || kind === 'note') && level === null);
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
  // A draft holds a snapshot exactly when it was parsed: a DOCX, or a format read through its converter. An
  // original staged unparsed (a PDF, say) has none, as the store stages it (`store.ts`, `#loadDraftSnapshot`).
  // Before revision 18 every draft was a DOCX, and before revision 19 nothing was read through a converter.
  const draftColumns = new Set(
    (db.prepare('PRAGMA table_xinfo(import_drafts)').all() as SqlRow[]).map((column) => asString(column.name)),
  );
  const parsed = !draftColumns.has('source_format')
    ? '1'
    : draftColumns.has('working_object_digest')
    ? `(d.source_format = 'DOCX' OR d.working_object_digest IS NOT NULL)`
    : `(d.source_format = 'DOCX')`;
  const missingSnapshots = asNumber(one(
    db.prepare(
      `SELECT count(*) total FROM import_drafts d
       WHERE d.state IN ('staged', 'reviewed')
         AND ${parsed} = NOT EXISTS (SELECT 1 FROM staged_import_snapshots s WHERE s.draft_id = d.draft_id)`,
    ).all() as SqlRow[],
    'SCHEMA_MIGRATION_FAILED',
    '无法校验暂存稿件快照清单。',
  ).total);
  requireBounded(missingSnapshots === 0, 'SCHEMA_MIGRATION_FAILED', '暂存或已复核草稿缺少权威快照。');
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

function validateBranchOffsets(db: DatabaseSync, branchId: string): void {
  requirePersistedBlockTextBounds(db, 'working_blocks', branchId, 'SCHEMA_MIGRATION_FAILED', '工作稿文字超出有界校验范围。');
  validateBranchPositions(db, branchId);
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
  forEachSchemaId(db, 'service_lifetimes', 'lifetime_id', () => undefined);
  forEachSchemaId(db, 'recovery_snapshots', 'snapshot_id', () => undefined);
  forEachSchemaId(db, 'recovery_attention', 'attention_id', () => undefined);
  forEachSchemaId(db, 'recovery_decisions', 'decision_id', () => undefined);
  forEachSchemaId(db, 'recovery_restorations', 'restoration_id', () => undefined);
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
  return assignKeysAndPages(db, branchId);
}

export function snapshotWorkingRevision(
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
  let expectedPosition = 1;
  let offset = 0;
  while (true) {
    // A revision keeps dense positions (ADR 0105 §6): the working state's order, numbered from 1.
    const rows = rowsFrom(db, branchId, expectedPosition, MIGRATION_BATCH);
    if (rows.length === 0) break;
    for (const row of rows) {
      const length = stagedBlockLength(row.text, 'MILESTONE_INVALID', '工作稿文字超出里程碑快照边界。');
      requireBounded(
        row.position === expectedPosition && row.graphemeLength === length && blockDigest(row.kind, row.level, row.text) === row.digest,
        'MILESTONE_INVALID',
        '工作稿内容无法建立精确里程碑修订版。',
      );
      insert.run(revisionId, row.blockId, row.position, row.kind, row.level, row.text, row.digest, offset, length);
      offset += length;
      requireBounded(Number.isSafeInteger(offset), 'MILESTONE_INVALID', '工作稿字符总数无效。');
      expectedPosition += 1;
    }
  }
  requireBounded(
    expectedPosition > 1 && offset === expectedTotal && paragraphCount(db, branchId) === expectedPosition - 1,
    'MILESTONE_INVALID',
    '工作稿偏移索引与里程碑修订版不一致。',
  );
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
      const action = asString(entry.command_kind) as 'edit' | 'replacement' | 'split' | 'merge' | 'undo' | 'redo';
      requireBounded(
        sequence === journalCursor + 1 && asString(entry.base_revision_id) === checkpointRevisionId &&
          UUID_PATTERN.test(groupId) && ['edit', 'replacement', 'split', 'merge', 'undo', 'redo'].includes(action),
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
            (action !== 'undo' && action !== 'redo'
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

  // Since a split or merge the checkpoint's blocks no longer stand position for position: its owner replays them by identity.
  if (journalHasStructuralEdits(db, branchId, checkpointSequence, journalSequence)) {
    return verifyStructuralReconstruction(db, branchId, checkpointRevisionId, checkpointSequence, journalSequence);
  }
  const checkpointInventory = one(db.prepare(
    'SELECT count(*) total, coalesce(max(position), 0) maximum FROM manuscript_block_versions WHERE revision_id = ?',
  ).all(checkpointRevisionId) as SqlRow[], 'RECOVERY_CLASSIFICATION_UNCERTAIN', '恢复检查点清单缺失。');
  const workingInventory = one(db.prepare(
    'SELECT count(*) total FROM working_blocks WHERE branch_id = ?',
  ).all(branchId) as SqlRow[], 'RECOVERY_CLASSIFICATION_UNCERTAIN', '恢复工作状态清单缺失。');
  requireBounded(
    asNumber(checkpointInventory.total) > 0 &&
      asNumber(checkpointInventory.total) === asNumber(checkpointInventory.maximum) &&
      asNumber(checkpointInventory.total) === asNumber(workingInventory.total) &&
      asNumber(workingInventory.total) === paragraphCount(db, branchId),
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
    // The working blocks standing at the same paragraph numbers, read once per batch.
    const standing = new Map(rowsFrom(db, branchId, asNumber(blocks[0]!.position), blocks.length).map((row) => [row.position, row] as const));
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
      const current = standing.get(blockCursor);
      requireBounded(current !== undefined, 'RECOVERY_CLASSIFICATION_UNCERTAIN', '持久工作内容块缺失。');
      requireBounded(
        current.blockId === blockId && current.kind === kind && current.level === level &&
          current.text === content && current.digest === digest &&
          current.graphemeLength === stagedBlockLength(content, 'RECOVERY_CLASSIFICATION_UNCERTAIN', '恢复工作文字超出有界范围。'),
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
      // Issue #412 (S63): a comparison prepared with its chapter-level rows binds each row's verb after the mappings'
      // identities (`/3`); one prepared before revision 36 keeps the `/2` digest it was recorded with.
      const grouped = db.prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'manuscript_reimport_group_sets'").get() !== undefined &&
        db.prepare('SELECT 1 FROM manuscript_reimport_group_sets WHERE comparison_id = ?').get(comparisonId) !== undefined;
      const resolutionHash = createHash('sha256');
      resolutionHash.update(canonicalJson({ schema: grouped ? 'ai7.manuscript-reimport-resolutions/3' : 'ai7.manuscript-reimport-resolutions/2' }));
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
        // `claimed` is another mapping's resolution carrying this one's current identity: an insert claiming a
        // delete's. A preserved edit carries its own, which is no claim.
        const mappings = db.prepare(
          `SELECT m.*, r.resolution, r.resolved_current_block_id,
                  r.comparison_id resolution_comparison_id,
                  claimed.mapping_id claimed_mapping_id, claimed.resolution claimed_resolution
           FROM manuscript_reimport_mappings m
           LEFT JOIN manuscript_reimport_mapping_resolutions r ON r.mapping_id = m.mapping_id
           LEFT JOIN manuscript_reimport_mapping_resolutions claimed
             ON claimed.comparison_id = m.comparison_id
            AND claimed.resolved_current_block_id = m.current_block_id
            AND claimed.mapping_id <> m.mapping_id
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
      if (grouped) {
        const verbs = db.prepare(
          `SELECT g.group_id, r.verb FROM manuscript_reimport_groups g
           JOIN manuscript_reimport_group_resolutions r ON r.group_id = g.group_id
           WHERE g.comparison_id = ? ORDER BY g.ordinal`,
        ).all(comparisonId) as SqlRow[];
        for (const row of verbs) resolutionHash.update(`
${canonicalJson({ groupId: asString(row.group_id), verb: asString(row.verb) })}`);
      }
      const resolutionDigest = resolutionHash.digest('hex');
      requireBounded(resolutionDigest === asString(comparison.resolution_digest),
        'SCHEMA_INVALID', '稿件重新导入当前解决摘要无效。');
      const reviewedDraft = one(db.prepare(
        `SELECT d.draft_version, d.object_digest, d.review_digest, d.reviewed_book_state_digest,
                d.reviewed_reuse_source_version_id, d.source_format, d.converter_identity,
                b.stable_identity, co.byte_length source_bytes,
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
           WHERE rr.comparison_id = ? ORDER BY fc.position LIMIT 11`,
        ).all(comparisonId) as SqlRow[];
        reviewFidelity = fidelityRows.map((row) => {
          const status = asString(row.status) as FidelityCategoryProjection['status'];
          return {
            key: asString(row.category_key) as FidelityCategoryProjection['key'],
            label: asString(row.display_label), count: asNumber(row.item_count), status,
            statusLabel: fidelityStatusLabel(status),
            detail: asString(row.detail),
          };
        });
      }
      // A review rebuilds under the parser identity its staged file was read with (ADR 0086): the ten
      // classes of `/2`, or the eight a `/1` review recorded.
      const reviewPlan = deriveImportFidelityPlan(
        reviewFidelity,
        asString(comparison.staged_source_digest),
        asNumber(reviewedDraft.source_bytes),
        rowFidelityConversion(reviewedDraft.converter_identity, reviewedDraft.source_format),
        asString(comparison.staged_parser_identity),
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
        `SELECT rr.*, sv.source_digest, sv.format, sv.converter_identity, sv.parser_identity, co.byte_length source_bytes,
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
           FROM import_fidelity_categories WHERE fidelity_review_id = ? ORDER BY position LIMIT 11`,
        ).all(asString(record.fidelity_review_id)) as SqlRow[];
        // Ten classes under parser identity `/2`, the eight of a `/1` review otherwise (ADR 0086).
        const expectedCategoryCount = asString(record.parser_identity) === DOCX_PARSER_IDENTITY_V1 ? 8 : 10;
        requireBounded(categoryRows.length === expectedCategoryCount && categoryRows.every((row, index) => asNumber(row.position) === index + 1),
          'SCHEMA_INVALID', '稿件重新导入保真证据必须精确包含其解析器版本的全部内容类。');
        const categories = categoryRows.map((row) => {
          const status = asString(row.status) as FidelityCategoryProjection['status'];
          return {
            key: asString(row.category_key) as FidelityCategoryProjection['key'],
            label: asString(row.display_label),
            count: asNumber(row.item_count),
            status,
            statusLabel: fidelityStatusLabel(status),
            detail: asString(row.detail),
          };
        });
        const plan = deriveImportFidelityPlan(
          categories,
          asString(record.source_digest),
          asNumber(record.source_bytes),
          rowFidelityConversion(record.converter_identity, record.format),
          asString(record.parser_identity),
        );
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

/**
 * What every open checks and tidies over the manuscript core (#1634): the records' identities, the workflow semantics, the
 * import and reimport record graphs, every derived offset, the command and recovery histories and the references, then the
 * search sessions and replacement previews a stopped lifetime left open. The shape itself is `requireBaselineSchema`'s.
 */
export function validateBoundedStore(db: DatabaseSync, profile: BuiltInWorkflowProfile): void {
  transact(db, () => {
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
    terminalizeOrphanedReplacementPreviews(db);
    reclaimOrphanedSearchSessions(db);
  });
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

export type ManuscriptCheckpointPurpose =
  | 'Reimport Safety / 重新导入安全固定点'
  | 'Task Input / 任务输入'
  // Issue #413: a current revision is exported only as an exact Manuscript Revision, so unsaved edits are
  // saved as one first (V2-UX-TASK-040's low ceremony: no milestone, no signoff, no decision).
  | 'Export Input / 导出输入'
  // Issue #415: a Production Document's 保存为版本 — its working text becomes its next version.
  | 'Document Version / 文档版本';

export interface ManuscriptCheckpointBinding {
  bookId: string;
  manuscriptId: string;
  branchId: string;
  revisionId: string;
  revisionLabel: string;
  revisionDigest: string;
  journalSequence: number;
  createdForDirtyJournal: boolean;
}

export type ReimportCheckpointBinding = ManuscriptCheckpointBinding;

interface ManuscriptCheckpointWork {
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
  purpose: ManuscriptCheckpointPurpose;
  state: 'copying' | 'prepared';
  /** The 后台分析登记 dispatcher's (Issue #95, S39): cancelled when anything else asks for a checkpoint of the branch. */
  preemptible: boolean;
}

export interface ManuscriptCheckpointProgress {
  done: boolean;
  completed: number;
  total: number;
  checkpoint: ManuscriptCheckpointBinding | null;
}

export type ReimportCheckpointProgress = ManuscriptCheckpointProgress;

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

export type { ManualCommandRequestPin, ManualCommandSource } from '../shared/protocol/learning.js';

/** Where the next page starts: an exclusive member position of one exact source, and the history it was read against. */
export interface ManualCommandSourceCursor {
  readonly commandGroupId: string;
  readonly evidenceDigest: string;
  readonly afterPosition: number;
  /** The `digest` of the history an earlier page reported; null reads the immutable evidence alone. */
  readonly historyDigest: string | null;
}

/**
 * What the editor's history holds now for the command's group, beside its immutable evidence and never part of it: the
 * branch's current state, whether a history boundary (an Apply or a restoration) has crossed the group, the group's
 * status and its latest journal action, and the latest restoration made after it. These are facts as they stand, not
 * whether the change survived, was withdrawn or may be learned from.
 */
export interface ManualCommandHistory {
  readonly revisionId: string;
  readonly journalSequence: number;
  readonly workingDigest: string;
  readonly historySequence: number;
  readonly historyBoundarySequence: number;
  readonly boundaryCrossed: boolean;
  readonly groupStatus: 'applied' | 'undone' | 'superseded';
  readonly lastAction: { readonly kind: 'edit' | 'replacement' | 'undo' | 'redo'; readonly journalEntryId: string; readonly sequence: number };
  readonly restoration: {
    readonly restorationId: string;
    readonly selectedKind: 'journal' | 'checkpoint' | 'snapshot';
    readonly selectedSnapshotId: string | null;
    readonly descendantRevisionId: string;
  } | null;
  readonly digest: string;
}

/** A page member's block in the working state now: gone, holding exactly the recorded after-text, or holding other text. */
export interface ManualCommandMemberCurrent {
  readonly position: number;
  readonly block: 'absent' | 'recorded-after' | 'other-text';
}

export interface ManualCommandSourcePage {
  readonly header: CommandEvidenceHeader;
  readonly memberCount: number;
  readonly evidenceDigest: string;
  /** Whole members in position order: a page ends before the first member that would take it past its byte budget. */
  readonly members: ReadonlyArray<CommandEvidenceMember>;
  readonly current: ReadonlyArray<ManualCommandMemberCurrent>;
  readonly next: ManualCommandSourceCursor | null;
  readonly history: ManualCommandHistory;
}

const MANUAL_COMMAND_SOURCE_FIELDS = [
  'bookId', 'manuscriptId', 'branchId', 'baseRevisionId', 'journalEntryId', 'journalSequence', 'clientEditId',
  'requestFingerprint', 'durableAt', 'commandGroupId', 'commandKind', 'commandOrdinal', 'sourceGroupId',
  'beforeWorkingDigest', 'afterWorkingDigest', 'evidenceDigest', 'memberCount', 'request',
] as const;

function hasExactFields(value: object, fields: ReadonlyArray<string>): boolean {
  const own = Object.keys(value);
  return own.length === fields.length && fields.every((field) => Object.hasOwn(value, field));
}

function encodedJsonBytes(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value), 'utf8');
}

function requireManualCommandSource(source: ManualCommandSource): void {
  const request: ManualCommandRequestPin | null = typeof source?.request === 'object' ? source.request : null;
  requireBounded(
    typeof source === 'object' && source !== null && hasExactFields(source, MANUAL_COMMAND_SOURCE_FIELDS) &&
      [source.bookId, source.manuscriptId, source.branchId, source.baseRevisionId, source.journalEntryId, source.clientEditId, source.commandGroupId]
        .every((id) => typeof id === 'string' && UUID_PATTERN.test(id)) &&
      [source.requestFingerprint, source.beforeWorkingDigest, source.afterWorkingDigest, source.evidenceDigest]
        .every((digest) => typeof digest === 'string' && DIGEST_PATTERN.test(digest)) &&
      [source.journalSequence, source.commandOrdinal, source.memberCount].every((count) => Number.isSafeInteger(count) && count > 0) &&
      typeof source.durableAt === 'string' && source.durableAt.isWellFormed() && source.durableAt.length > 0 && source.durableAt.length <= 64 &&
      source.sourceGroupId === null && request !== null &&
      (request.origin === 'journal-edit'
        ? source.commandKind === 'edit' && hasExactFields(request, ['origin', 'windowStartBlockId']) &&
          typeof request.windowStartBlockId === 'string' && BLOCK_PATTERN.test(request.windowStartBlockId)
        : request.origin === 'manual-search-replacement' && source.commandKind === 'replacement' &&
          hasExactFields(request, ['origin', 'previewId']) && typeof request.previewId === 'string' && UUID_PATTERN.test(request.previewId)),
    'MANUAL_SOURCE_INVALID',
    '手动编辑来源引用无效。',
  );
}

export class BoundedManuscriptStore {
  readonly #db: DatabaseSync;
  readonly #cursorSecret = randomBytes(32);
  readonly #manuscriptCheckpointWork = new Map<string, ManuscriptCheckpointWork>();

  constructor(db: DatabaseSync, readonly sourceObjects?: ManuscriptSourceObjects) {
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
  ): { workId: string | null; total: number; checkpoint: ManuscriptCheckpointBinding | null } {
    return this.createManuscriptCheckpointWork(
      manuscriptId,
      branchId,
      'Reimport Safety / 重新导入安全固定点',
    );
  }

  /**
   * Whether a checkpoint is being built for the branch now (Issue #95, S39): the 后台分析登记 dispatcher never starts beside one.
   */
  checkpointWorkInFlight(branchId: string): boolean {
    return Array.from(this.#manuscriptCheckpointWork.values()).some((work) => work.binding.branchId === branchId);
  }

  /**
   * Whether the branch waits on a recovery attention, pending or deferred (Issue #95, S39; #713 re-review, P2-1): ordinary
   * edits and checkpoints are refused there, so the 后台分析登记 dispatcher does not begin a preparation on it either.
   */
  branchUnderRecovery(branchId: string): boolean {
    return this.#db.prepare(
      "SELECT 1 ok FROM recovery_attention WHERE branch_id = ? AND status IN ('pending', 'deferred') LIMIT 1",
    ).get(branchId) !== undefined;
  }

  /**
   * `preemptible` is the 后台分析登记 dispatcher's (Issue #95, S39; #713 review, P1-1/P1-2): its checkpoint gives way to any other
   * the branch asks for — which cancels it and goes ahead — while it never displaces one itself.
   */
  createManuscriptCheckpointWork(
    manuscriptId: string,
    branchId: string,
    purpose: ManuscriptCheckpointPurpose,
    options: { preemptible?: boolean } = {},
  ): { workId: string | null; total: number; checkpoint: ManuscriptCheckpointBinding | null } {
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
    if (options.preemptible !== true) {
      for (const work of Array.from(this.#manuscriptCheckpointWork.values())) {
        if (work.preemptible && work.binding.branchId === branchId) this.cancelManuscriptCheckpointWork(work.workId);
      }
    }
    requireBounded(!Array.from(this.#manuscriptCheckpointWork.values()).some((work) => work.binding.branchId === branchId),
      'SERVICE_BUSY', '该稿件已有固定点任务。');
    const previous = one(this.#db.prepare(
      'SELECT ordinal, source_version_id FROM manuscript_revisions WHERE revision_id = ?',
    ).all(binding.revisionId) as SqlRow[], 'REIMPORT_CHECKPOINT_INVALID', '当前稿件修订版缺失。');
    const totalBlocks = paragraphCount(this.#db, branchId);
    requireBounded(totalBlocks > 0, 'REIMPORT_CHECKPOINT_INVALID', '工作稿没有内容块。');
    this.#db.exec(
      `CREATE TEMP TABLE IF NOT EXISTS manuscript_checkpoint_rows(
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
    this.#manuscriptCheckpointWork.set(workId, {
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
      purpose,
      state: 'copying',
      preemptible: options.preemptible === true,
    });
    return { workId, total: totalBlocks, checkpoint: null };
  }

  advanceReimportCheckpointWork(workId: string): ReimportCheckpointProgress {
    return this.advanceManuscriptCheckpointWork(workId);
  }

  advanceManuscriptCheckpointWork(workId: string): ManuscriptCheckpointProgress {
    requireBounded(UUID_PATTERN.test(workId), 'JOB_INVALID', '重新导入固定点任务标识无效。');
    const work = this.#manuscriptCheckpointWork.get(workId);
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
    const rows = rowsFrom(this.#db, work.binding.branchId, work.cursor + 1, MIGRATION_BATCH);
    if (rows.length > 0) {
      const insert = this.#db.prepare(
        `INSERT INTO temp.manuscript_checkpoint_rows(
           work_id, revision_id, block_id, position, kind, level, text, digest, start_offset, grapheme_length
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      transact(this.#db, () => {
        for (const row of rows) {
          const { position, kind, level, text } = row;
          const length = stagedBlockLength(text, 'REIMPORT_CHECKPOINT_INVALID', '工作稿文字超出重新导入固定点边界。');
          requireBounded(
            position === work.expectedPosition && row.graphemeLength === length && blockDigest(kind, level, text) === row.digest,
            'REIMPORT_CHECKPOINT_INVALID',
            '工作稿内容无法建立精确重新导入固定点。',
          );
          insert.run(workId, work.revisionId, row.blockId, position, kind, level, text, row.digest, work.offset, length);
          work.cursor = position;
          work.expectedPosition += 1;
          work.offset += length;
        }
      });
      return { done: false, completed: work.cursor, total: work.totalBlocks, checkpoint: null };
    }
    requireBounded(
      work.cursor === work.totalBlocks && work.offset === work.binding.totalCharacters &&
        paragraphCount(this.#db, work.binding.branchId) === work.totalBlocks,
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
    return this.finalizeManuscriptCheckpointWork(workId, persistComparison);
  }

  finalizeManuscriptCheckpointWork(
    workId: string,
    persistCheckpointOwner: (checkpoint: ManuscriptCheckpointBinding, purpose: ManuscriptCheckpointPurpose) => void,
  ): ManuscriptCheckpointBinding {
    requireBounded(UUID_PATTERN.test(workId), 'JOB_INVALID', '重新导入固定点任务标识无效。');
    const work = this.#manuscriptCheckpointWork.get(workId);
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
           FROM temp.manuscript_checkpoint_rows WHERE work_id = ? ORDER BY position`,
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
      const completed = this.#binding(work.binding.manuscriptId, work.binding.branchId);
      const checkpoint = {
        bookId: completed.bookId,
        manuscriptId: completed.manuscriptId,
        branchId: completed.branchId,
        revisionId: completed.revisionId,
        revisionLabel: completed.revisionLabel,
        revisionDigest: completed.workingDigest,
        journalSequence: completed.journalSequence,
        createdForDirtyJournal: true,
      };
      persistCheckpointOwner(checkpoint, work.purpose);
      this.#db.prepare('DELETE FROM temp.manuscript_checkpoint_rows WHERE work_id = ?').run(workId);
      return checkpoint;
    });
    this.#manuscriptCheckpointWork.delete(workId);
    return checkpoint;
  }

  cancelReimportCheckpointWork(workId: string): boolean {
    return this.cancelManuscriptCheckpointWork(workId);
  }

  cancelManuscriptCheckpointWork(workId: string): boolean {
    requireBounded(UUID_PATTERN.test(workId), 'JOB_INVALID', '重新导入固定点任务标识无效。');
    if (!this.#manuscriptCheckpointWork.delete(workId)) return false;
    this.#db.prepare('DELETE FROM temp.manuscript_checkpoint_rows WHERE work_id = ?').run(workId);
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
    // Milestone Versions belong to the primary Manuscript alone (V2-UX-MILE-014; Issue #415): a Production Document
    // saves versions instead.
    requireBounded(
      (this.#db.prepare('SELECT role FROM manuscripts WHERE manuscript_id = ?').get(manuscriptId) as SqlRow | undefined)?.role === 'primary',
      'MILESTONE_INVALID',
      '生产文档没有里程碑版本；请用「保存为版本」。',
    );
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
    return rowsFrom(this.#db, plan.branchId, afterPosition + 1, MIGRATION_BATCH).map((row) => ({
      blockId: row.blockId, position: row.position, kind: row.kind, level: row.level, text: row.text,
      digest: row.digest, graphemeLength: row.graphemeLength,
    }));
  }

  listPriorWork(): ReadonlyArray<PriorWorkItemProjection> {
    // A Book's recent work is its Manuscript; a Production Document (Issue #415) is listed only while it has a
    // recovery to answer.
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
       WHERE m.role = 'primary' OR ra.attention_id IS NOT NULL
       ORDER BY ${BOOK_LAST_WORKED_SQL} DESC, b.book_id DESC LIMIT 20`,
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
    const rows = journal
      ? rowsFrom(this.#db, asString(attention.branch_id), start, MAX_WINDOW_BLOCKS + 1).map((row) => ({
        block_id: row.blockId, position: row.position, kind: row.kind, level: row.level, text: row.text, digest: row.digest,
      })) as SqlRow[]
      : this.#db.prepare(
        `SELECT block_id, position, kind, level, text, digest FROM manuscript_block_versions
         WHERE revision_id = ? AND position >= ? ORDER BY position LIMIT ?`,
      ).all(asString(attention.checkpoint_revision_id), start, MAX_WINDOW_BLOCKS + 1) as SqlRow[];
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
        // Which blocks the restoration leaves as they were (Issue #533): a point in one stands where it stood.
        const blocksBefore = workingBlockDigests(this.#db, binding.branchId);
        // The working state replaced whole through its positions owner (ADR 0105 §7 need 1; R5-5's restore shares it).
        const source = selection.kind === 'snapshot'
          ? this.#db.prepare('SELECT block_id, kind, level, text, digest FROM recovery_restore_stage_blocks WHERE attention_id = ? ORDER BY position').all(attentionId)
          : this.#db.prepare('SELECT block_id, kind, level, text, digest FROM manuscript_block_versions WHERE revision_id = ? ORDER BY position').all(asString(attention.checkpoint_revision_id));
        rebuiltTotal = replaceWorkingState(this.#db, binding.branchId, (source as SqlRow[]).map((row) => ({
          blockId: asString(row.block_id), kind: asString(row.kind) as ManuscriptBlockProjection['kind'], level: row.level === null ? null : asNumber(row.level),
          text: asString(row.text), digest: asString(row.digest),
        })));
        requireBounded(rebuiltTotal === expectedGraphemes, 'RECOVERY_SOURCE_INVALID', '恢复来源字符总数不一致。');
        // The working state was replaced whole, so no span exists to follow: every mark is resolved
        // against the text its block holds now, and one whose block is gone is kept as detached.
        resolveBranchMarksAfterRewrite(this.#db, binding.branchId, blocksBefore);
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
      supersedeAllSteps(this.#db, binding.branchId);
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

  getWindow(manuscriptId: string, branchId: string, target: ManuscriptWindowTarget, marks?: { afterOrdinal: number; digest: string }): ManuscriptWindowProjection {
    const binding = this.#binding(manuscriptId, branchId);
    let targetPosition = 1;
    let targetKey: number | null = null;
    let focusBlockId: string | null = null;
    let focusGrapheme: number | null = null;
    let focusCharacter: number | null = null;
    const atCharacter = (character: number, refusal: string): void => {
      const resolved = blockAtCharacter(this.#db, branchId, character);
      const row = one(this.#db.prepare('SELECT block_id, grapheme_length FROM working_blocks WHERE branch_id = ? AND order_key = ?')
        .all(branchId, resolved.key) as SqlRow[], 'WINDOW_NOT_FOUND', '全稿位置不存在。');
      targetPosition = resolved.position;
      targetKey = resolved.key;
      focusBlockId = asString(row.block_id);
      focusGrapheme = character - resolved.startCharacter;
      requireBounded(focusGrapheme >= 0 && focusGrapheme < asNumber(row.grapheme_length), 'WINDOW_INVALID', refusal);
      focusCharacter = character;
    };
    if (target.kind === 'cursor') {
      targetPosition = this.#decodeCursor(target.cursor, 'window', binding).position;
    } else if (target.kind === 'block' || target.kind === 'window-start') {
      requireBounded(BLOCK_PATTERN.test(target.blockId), 'WINDOW_INVALID', '稿件位置无效。');
      const row = workingRow(this.#db, branchId, target.blockId);
      requireBounded(row !== undefined, 'WINDOW_NOT_FOUND', '稿件位置不存在。');
      targetPosition = row.position;
      targetKey = row.key;
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
      atCharacter(target.character, '全稿位置无法精确解析到内容块。');
    } else if (target.kind === 'proportion') {
      requireBounded(Number.isFinite(target.proportion) && target.proportion >= 0 && target.proportion <= 1, 'WINDOW_INVALID', '全稿比例无效。');
      if (binding.totalCharacters > 0) {
        atCharacter(Math.min(binding.totalCharacters - 1, Math.floor(binding.totalCharacters * target.proportion)), '全稿比例无法精确解析到内容块。');
      }
    }
    const totalBlocks = paragraphCount(this.#db, branchId);
    requireBounded(totalBlocks > 0, 'WINDOW_NOT_FOUND', '稿件窗口为空。');
    const startPosition = Math.min(Math.max(1, targetPosition - (focusBlockId ? Math.floor(MAX_WINDOW_BLOCKS / 2) : 0)), Math.max(1, totalBlocks - MAX_WINDOW_BLOCKS + 1));
    const rows = rowsFrom(this.#db, branchId, startPosition, MAX_WINDOW_BLOCKS + 1);
    const visible = rows.slice(0, MAX_WINDOW_BLOCKS);
    let blocks = withNoteReferences(this.#db, branchId, binding.revisionId, visible.map((row) => ({
      blockId: row.blockId, position: row.position, kind: row.kind, level: row.level, text: row.text, digest: row.digest,
    })));
    blocks = this.sourceObjects?.project(binding.revisionId, blocks, branchId) ?? blocks;
    requireBounded(blocks.length > 0 && blocks.length <= MAX_WINDOW_BLOCKS, 'WINDOW_NOT_FOUND', '稿件窗口为空。');
    const first = visible[0]!;
    const last = visible.at(-1)!;
    const startCharacter = offsetBefore(this.#db, branchId, first.key);
    const endCharacter = offsetBefore(this.#db, branchId, last.key) + last.graphemeLength;
    const resolvedKey = focusBlockId === null ? first.key : targetKey!;
    const resolvedCharacter = focusCharacter ?? (focusBlockId === null
      ? startCharacter
      : offsetBefore(this.#db, branchId, resolvedKey));
    const structure = this.#db.prepare(
      'SELECT text FROM manuscript_outline WHERE branch_id = ? AND order_key <= ? ORDER BY order_key DESC LIMIT 1',
    ).get(branchId, resolvedKey) as SqlRow | undefined;
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
        startBlock: first.position,
        endBlock: last.position,
        totalBlocks,
        startCharacter,
        endCharacter,
        totalCharacters: binding.totalCharacters,
        proportion,
        structureLabel: structure ? asString(structure.text) : null,
        label: `${structure ? `${asString(structure.text)} · ` : ''}全稿 ${(proportion * 100).toFixed(3)}%`,
      },
      blocks,
      ...marksOfWindow(this.#db, branchId, first.position, marks),
      ...aiLocksOfWindow(this.#db, branchId, first.position),
      // A Production Document says so on every window of it, whichever way it was reached (Issue #415, S66).
      ...((this.#db.prepare('SELECT role FROM manuscripts WHERE manuscript_id = ?').get(manuscriptId) as SqlRow | undefined)?.role === 'production-document'
        ? { deliverable: 'production-document' as const }
        : {}),
    };
    return projection;
  }

  /**
   * The Whole-manuscript Position Rail's places (Issue #409): chapter ticks from the outline, the open
   * marks, and — when the caller knows them — the block runs the analysis left unread. Each place is
   * read through the offset index, so the cost follows the number of chapters and marks and never the
   * length of the manuscript; both are bounded and the projection says when a bound cut them.
   */
  /** The Book a manuscript branch belongs to, read from its working state. */
  bookIdOf(manuscriptId: string, branchId: string): string {
    return this.#binding(manuscriptId, branchId).bookId;
  }

  getRail(
    manuscriptId: string,
    branchId: string,
    unread: ReadonlyArray<{ blockIds: ReadonlyArray<string>; reason: string }> | null,
  ): ManuscriptRailProjection {
    const binding = this.#binding(manuscriptId, branchId);
    const total = Math.max(1, binding.totalCharacters);
    const proportion = (character: number): number => Math.min(1, Math.max(0, character / total));
    const outline = this.#db.prepare(
      `SELECT block_id, order_key, level, text FROM manuscript_outline WHERE branch_id = ? ORDER BY order_key LIMIT ?`,
    ).all(branchId, MAX_RAIL_CHAPTERS + 1) as SqlRow[];
    const places = openMarkPlaces(this.#db, branchId, MAX_RAIL_MARKS + 1);
    // Every offset the rail needs, in one pass over the pages (ADR 0105 §6's batch rank).
    const offsets = placesOfKeys(this.#db, branchId, [...outline.map((row) => asNumber(row.order_key)), ...places.map((place) => place.key)]);
    const offsetOf = (key: number): number => offsets.get(key)!.offset;
    const chapters = outline.slice(0, MAX_RAIL_CHAPTERS).map((row) => ({
      blockId: asString(row.block_id),
      title: asString(row.text),
      level: asNumber(row.level),
      startCharacter: offsetOf(asNumber(row.order_key)),
      suggestions: 0,
      annotations: 0,
      notes: 0,
    }));
    const firstOmitted = outline[MAX_RAIL_CHAPTERS];
    const retainedEnd = firstOmitted === undefined ? Number.POSITIVE_INFINITY : offsetOf(asNumber(firstOmitted.order_key));
    const marks = places.slice(0, MAX_RAIL_MARKS).map((place) => {
      const character = offsetOf(place.key) + place.fromGrapheme;
      // The chapter a mark belongs to is the last one that starts at or before it.
      let owner = -1;
      for (let index = 0; index < chapters.length && chapters[index]!.startCharacter <= character; index += 1) owner = index;
      if (owner >= 0 && character < (chapters[owner + 1]?.startCharacter ?? retainedEnd)) {
        const chapter = chapters[owner]!;
        if (place.kind === 'change-suggestion') chapter.suggestions += 1;
        else if (place.kind === 'annotation') chapter.annotations += 1;
        else chapter.notes += 1;
      }
      return { kind: place.kind, blockId: place.blockId, proportion: proportion(character) };
    });
    const uncovered = unread === null ? null : unread.flatMap((run) => {
      if (run.blockIds.length === 0) return [];
      const span = this.#db.prepare(
        `SELECT min(order_key) first, max(order_key) last FROM working_blocks
         WHERE branch_id = ? AND block_id IN (${run.blockIds.map(() => '?').join(', ')})`,
      ).get(branchId, ...run.blockIds) as SqlRow | undefined;
      if (span === undefined || span.first === null || span.last === null) return [];
      const lastLength = asNumber((this.#db.prepare('SELECT grapheme_length FROM working_blocks WHERE branch_id = ? AND order_key = ?').get(branchId, asNumber(span.last)) as SqlRow).grapheme_length);
      return [{
        fromProportion: proportion(offsetBefore(this.#db, branchId, asNumber(span.first))),
        toProportion: proportion(offsetBefore(this.#db, branchId, asNumber(span.last)) + lastLength),
        reason: run.reason,
      }];
    });
    return {
      manuscriptId,
      branchId,
      revisionId: binding.revisionId,
      journalSequence: binding.journalSequence,
      totalCharacters: binding.totalCharacters,
      chapters: chapters.map(({ startCharacter, ...chapter }) => ({ ...chapter, proportion: proportion(startCharacter) })),
      chaptersTruncated: outline.length > MAX_RAIL_CHAPTERS,
      marks,
      marksTruncated: places.length > MAX_RAIL_MARKS,
      uncovered,
    };
  }

  /**
   * Remember where the editor is in this Book's primary Manuscript, against the Revision the branch
   * is working on now. The pair is the window projection's own: a block the working state holds and
   * a grapheme inside that block, which is `0` for an empty one. One row per Book and Revision:
   * entering the same Revision again rewrites that row in place, and a position taken against an
   * earlier Revision stays exactly as it was recorded.
   */
  recordManuscriptEntryPosition(
    manuscriptId: string,
    branchId: string,
    blockId: string,
    grapheme: number,
    recordedAt: string,
  ): void {
    const binding = this.#binding(manuscriptId, branchId);
    requireBounded(BLOCK_PATTERN.test(blockId), 'WINDOW_INVALID', '稿件位置无效。');
    const block = one(
      this.#db.prepare('SELECT grapheme_length FROM working_blocks WHERE branch_id = ? AND block_id = ?')
        .all(branchId, blockId) as SqlRow[],
      'WINDOW_NOT_FOUND',
      '稿件位置不存在。',
    );
    requireBounded(
      Number.isSafeInteger(grapheme) && grapheme >= 0 && grapheme < Math.max(1, asNumber(block.grapheme_length)),
      'WINDOW_INVALID',
      '稿件位置无效。',
    );
    this.#db.prepare(
      `INSERT INTO manuscript_entry_positions(
         book_id, manuscript_id, branch_id, revision_id, block_id, grapheme, recorded_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(book_id, revision_id) DO UPDATE SET
         manuscript_id = excluded.manuscript_id, branch_id = excluded.branch_id,
         block_id = excluded.block_id, grapheme = excluded.grapheme, recorded_at = excluded.recorded_at`,
    ).run(binding.bookId, manuscriptId, branchId, binding.revisionId, blockId, grapheme, recordedAt);
  }

  /**
   * Where the editor last was, resolved against the working state the branch holds now. The position
   * recorded against the branch's own Revision is preferred; failing that, the most recently recorded
   * one answers, which is what makes a superseded Revision resolve to somewhere rather than to
   * nothing. The block is then looked up in the working state: when it is still there the offset is
   * clamped to what the block now holds, and when it is gone the block's place in the Revision it was
   * recorded against picks the nearest surviving block instead, at its start. `null` only when the
   * Book has no remembered position at all.
   */
  readManuscriptEntryPosition(manuscriptId: string, branchId: string): ManuscriptEntryPositionProjection | null {
    const binding = this.#binding(manuscriptId, branchId);
    // A position belongs to the manuscript it was recorded in (Issue #415): a Book's Production Documents never move
    // where its Manuscript opens.
    const select = `SELECT revision_id, block_id, grapheme FROM manuscript_entry_positions WHERE book_id = ? AND manuscript_id = ?`;
    const recorded = (this.#db.prepare(`${select} AND revision_id = ?`).get(binding.bookId, manuscriptId, binding.revisionId)
      ?? this.#db.prepare(`${select} ORDER BY recorded_at DESC, rowid DESC LIMIT 1`).get(binding.bookId, manuscriptId)) as SqlRow | undefined;
    if (recorded === undefined) return null;
    const recordedRevisionId = asString(recorded.revision_id);
    const recordedBlockId = asString(recorded.block_id);
    const recordedGrapheme = asNumber(recorded.grapheme);
    const working = this.#db.prepare(
      'SELECT grapheme_length FROM working_blocks WHERE branch_id = ? AND block_id = ?',
    ).get(branchId, recordedBlockId) as SqlRow | undefined;
    const base = { bookId: binding.bookId, manuscriptId, branchId, recordedRevisionId };
    if (working !== undefined) {
      const length = asNumber(working.grapheme_length);
      return {
        ...base,
        blockId: recordedBlockId,
        grapheme: Math.min(recordedGrapheme, Math.max(0, length - 1)),
        state: recordedRevisionId === binding.revisionId ? 'exact' : 'nearest-anchor',
      };
    }
    const recordedPosition = this.#db.prepare(
      'SELECT position FROM manuscript_block_versions WHERE revision_id = ? AND block_id = ?',
    ).get(recordedRevisionId, recordedBlockId) as SqlRow | undefined;
    // The nearest paragraph number to the one recorded: the paragraphs are numbered 1 … n with no gap.
    const total = paragraphCount(this.#db, branchId);
    if (total === 0) return null;
    const nearest = Math.min(total, Math.max(1, recordedPosition === undefined ? 1 : asNumber(recordedPosition.position)));
    const nearestKey = keyAtParagraph(this.#db, branchId, nearest);
    const nearestBlock = this.#db.prepare('SELECT block_id FROM working_blocks WHERE branch_id = ? AND order_key = ?').get(branchId, nearestKey) as SqlRow;
    return { ...base, blockId: asString(nearestBlock.block_id), grapheme: 0, state: 'nearest-anchor' };
  }

  getOutline(manuscriptId: string, branchId: string, cursor: string | null): OutlineProjection {
    const binding = this.#binding(manuscriptId, branchId);
    // The cursor carries the paragraph number of the last heading shown; its key is read back under the same working digest.
    const position = cursor === null ? 0 : this.#decodeCursor(cursor, 'outline', binding).position;
    const afterKey = position === 0 ? 0 : keyAtParagraph(this.#db, branchId, position);
    const rows = this.#db.prepare(
      `SELECT block_id, order_key, kind, level, text FROM manuscript_outline
       WHERE branch_id = ? AND order_key > ? ORDER BY order_key LIMIT ?`,
    ).all(branchId, afterKey, MAX_OUTLINE_RESULTS + 1) as SqlRow[];
    const visible = rows.slice(0, MAX_OUTLINE_RESULTS);
    const earlier = position === 0 ? undefined : this.#db.prepare(
      `SELECT order_key FROM manuscript_outline WHERE branch_id = ? AND order_key <= ? ORDER BY order_key DESC LIMIT 1 OFFSET ?`,
    ).get(branchId, afterKey, MAX_OUTLINE_RESULTS) as SqlRow | undefined;
    const places = placesOfKeys(this.#db, branchId, [...visible.map((row) => asNumber(row.order_key)), ...(earlier === undefined ? [] : [asNumber(earlier.order_key)])]);
    const projection: OutlineProjection = {
      manuscriptId,
      branchId,
      revisionId: binding.revisionId,
      workingDigest: binding.workingDigest,
      entries: visible.map((row) => {
        const display = boundedOutlineDisplay(asString(row.text));
        const character = places.get(asNumber(row.order_key))!.offset;
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
        : this.#encodeCursor('outline', binding, { position: earlier === undefined ? 0 : places.get(asNumber(earlier.order_key))!.position }),
      nextCursor: rows.length > MAX_OUTLINE_RESULTS
        ? this.#encodeCursor('outline', binding, { position: places.get(asNumber(visible.at(-1)!.order_key))!.position })
        : null,
    };
    requireBounded(
      Buffer.byteLength(JSON.stringify(projection), 'utf8') < MAX_FRAME_BYTES - 4_096,
      'OUTLINE_FRAME_INVALID',
      '结构导航响应超出协议范围。',
    );
    return projection;
  }

  flushJournalEdit(input: JournalEditInput, serviceLifetimeId: string, capture?: (source: ManualCommandSource) => void): JournalAcknowledgement {
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
      requireBounded(!this.sourceObjects?.isReadOnly(binding.revisionId, input.blockId) &&
        !(input.structure?.kind === 'merge' && this.sourceObjects?.isReadOnly(binding.revisionId, input.structure.mergedBlockId)),
      'SOURCE_OBJECT_READ_ONLY', '表格为只读内容，导出时从原文件完整恢复。');
      requireBounded(
        this.#db.prepare('SELECT 1 FROM working_blocks WHERE branch_id = ? AND block_id = ?').get(input.branchId, input.windowStartBlockId) !== undefined,
        'EDIT_BLOCK_CHANGED',
        '编辑窗口已变化，请刷新窗口。',
      );
      // Enter and Backspace at a paragraph's edge (protocol 181, Issue #1175): a structural command, journaled by its owner.
      if (input.structure !== undefined) return writeStructuralEdit(this.#db, { ...input, structure: input.structure }, fingerprint, serviceLifetimeId,
        { binding, recordLifetimeWrite: (sequence, digest, at) => this.#recordLifetimeJournalWrite(serviceLifetimeId, binding, sequence, digest, at) });
      const block = one(this.#db.prepare(
        'SELECT kind, level, text, digest, grapheme_length FROM working_blocks WHERE branch_id = ? AND block_id = ?',
      ).all(input.branchId, input.blockId) as SqlRow[], 'EDIT_BLOCK_CHANGED', '稳定内容块不存在。');
      requireBounded(asString(block.digest) === input.baseBlockDigest, 'EDIT_BLOCK_CHANGED', '内容块已变化，请刷新窗口。');
      const beforeText = asString(block.text);
      const revisionBaseline = inlineRevisionBaseline(this.#db, input, beforeText);
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
      this.#db.prepare(
        `INSERT INTO manuscript_command_groups(
           command_group_id, branch_id, ordinal, kind, status, source_group_id,
           before_working_digest, after_working_digest, created_at
         ) VALUES (?, ?, ?, 'edit', 'applied', NULL, ?, ?, ?)`,
      ).run(groupId, input.branchId, historyOrdinal, binding.workingDigest, '0'.repeat(64), durableAt);
      // Typing is an editor step (Issue #1654); opening it supersedes what was undone.
      recordGroupPart(this.#db, input.branchId, groupId, 'typing', input.blockId);
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
      requireBounded(rewriteBlock(this.#db, input.branchId, input.blockId, { kind, level, text: afterText, digest: afterDigest }, input.baseBlockDigest) !== null,
        'EDIT_BLOCK_CHANGED', '内容块在保存时已变化。');
      // The renderer derives this span from the block's two texts, as an undo's is derived here (Issue #568).
      followBlockTextChangeForMarks(this.#db, input.branchId, input.blockId, beforeText, afterText, sequence, [
        { fromGrapheme: input.fromGrapheme, toGrapheme: input.toGrapheme, insertedGraphemes: inserted.length, inserted },
      ], true);
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
      recordInlineEditorRevision(this.#db, input, revisionBaseline, groupId);
      if (capture !== undefined) capture(this.manualCommandSource(input.branchId, sequence,
        { origin: 'journal-edit', windowStartBlockId: input.windowStartBlockId }));
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
    const totalBlocks = paragraphCount(this.#db, branchId);
    requireBounded(totalBlocks > 0, 'WINDOW_NOT_FOUND', '稿件窗口为空。');
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
    const afterKey = afterPosition === 0 ? 0 : keyAtParagraph(this.#db, binding.branchId, afterPosition);
    const query = asString(session.query);
    const useTrigram = graphemes(query).length >= 3;
    const ftsQuery = `"${query.replace(/"/g, '""')}"`;
    const rows = (useTrigram
      ? this.#db.prepare(
          `SELECT wb.block_id, wb.order_key, wb.text, wb.digest
           FROM working_block_search
           JOIN working_blocks wb ON wb.branch_id = working_block_search.branch_id
             AND wb.block_id = working_block_search.block_id
           WHERE working_block_search.branch_id = ? AND working_block_search MATCH ? AND wb.order_key > ?
           ORDER BY wb.order_key LIMIT ?`,
        ).all(binding.branchId, ftsQuery, afterKey, SEARCH_BATCH)
      : this.#db.prepare(
          `SELECT block_id, order_key, text, digest FROM working_blocks
           WHERE branch_id = ? AND order_key > ? ORDER BY order_key LIMIT ?`,
        ).all(binding.branchId, afterKey, SEARCH_BATCH)) as SqlRow[];
    // The paragraph numbers and offsets of the batch in one pass over the pages.
    const places = placesOfKeys(this.#db, binding.branchId, rows.map((row) => asNumber(row.order_key)));
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
        const place = places.get(asNumber(row.order_key))!;
        scannedPosition = Math.max(scannedPosition, place.position);
        const text = graphemes(asString(row.text));
        const heading = this.#db.prepare(
          'SELECT text FROM manuscript_outline WHERE branch_id = ? AND order_key <= ? ORDER BY order_key DESC LIMIT 1',
        ).get(binding.branchId, asNumber(row.order_key)) as SqlRow | undefined;
        const headingLabel = boundedProtocolDisplay(heading ? asString(heading.text) : '正文').text;
        const blockStart = place.offset;
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

  commitReplacement(previewId: string, serviceLifetimeId: string, capture?: (source: ManualCommandSource) => void): ReplacementCommitProjection {
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
      this.#db.prepare(
        `INSERT INTO manuscript_command_groups(
           command_group_id, branch_id, ordinal, kind, status, source_group_id,
           before_working_digest, after_working_digest, created_at
         ) VALUES (?, ?, ?, 'replacement', 'applied', NULL, ?, ?, ?)`,
      ).run(groupId, binding.branchId, ordinal, binding.workingDigest, '0'.repeat(64), now);
      recordGroupPart(this.#db, binding.branchId, groupId, 'replace', null, `替换「${stepQuote(asString(preview.query))}」${asNumber(preview.included_matches).toLocaleString('zh-CN')} 处`);
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
          `SELECT DISTINCT rm.block_id, wb.order_key, wb.kind, wb.level, wb.text, wb.digest
           FROM manuscript_replacement_matches rm
           JOIN working_blocks wb ON wb.branch_id = ? AND wb.block_id = rm.block_id
           WHERE rm.preview_id = ? AND rm.included = 1 AND wb.order_key > ?
           ORDER BY wb.order_key LIMIT ?`,
        ).all(binding.branchId, previewId, blockCursor, HISTORY_BATCH) as SqlRow[];
        if (page.length === 0) break;
        for (const row of page) {
          blockCursor = asNumber(row.order_key);
          editPosition += 1;
          const blockId = asString(row.block_id);
          const beforeText = asString(row.text);
          requireBounded(!this.sourceObjects?.isReadOnly(binding.revisionId, blockId), 'SOURCE_OBJECT_READ_ONLY', '表格为只读内容，导出时从原文件完整恢复。');
          const before = graphemes(beforeText);
          const text = [...before];
          const matches = this.#db.prepare(
            `SELECT from_grapheme, to_grapheme FROM manuscript_replacement_matches
             WHERE preview_id = ? AND included = 1 AND block_id = ? ORDER BY from_grapheme DESC`,
          ).all(previewId, blockId) as SqlRow[];
          const replacement = graphemes(asString(preview.replacement));
          for (const match of matches) text.splice(asNumber(match.from_grapheme), asNumber(match.to_grapheme) - asNumber(match.from_grapheme), ...replacement);
          const markSpans = matches.map((match) => ({
            fromGrapheme: asNumber(match.from_grapheme),
            toGrapheme: asNumber(match.to_grapheme),
            insertedGraphemes: replacement.length,
            inserted: replacement,
          }));
          const afterText = text.join('');
          const after = graphemes(afterText);
          requireBounded(afterText.length <= MAX_BLOCK_CODE_UNITS && after.length <= MAX_BLOCK_GRAPHEMES, 'REPLACEMENT_TOO_LARGE', '替换后内容块超出安全范围。');
          const kind = asString(row.kind) as ManuscriptBlockProjection['kind'];
          const level = row.level === null ? null : asNumber(row.level);
          const afterDigest = blockDigest(kind, level, afterText);
          insertEdit.run(groupId, editPosition, blockId, beforeText, asString(row.digest), afterText, afterDigest);
          const delta = after.length - before.length;
          requireBounded(rewriteBlock(this.#db, binding.branchId, blockId, { kind, level, text: afterText, digest: afterDigest }, asString(row.digest)) !== null,
            'REPLACEMENT_STALE', '匹配范围在提交时已变化。');
          followBlockTextChangeForMarks(this.#db, binding.branchId, blockId, beforeText, afterText, sequence, markSpans);
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
      if (capture !== undefined) capture(this.manualCommandSource(binding.branchId, sequence,
        { origin: 'manual-search-replacement', previewId }));
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

  /**
   * 全部替换 written as per-occurrence editor revisions (Issue #1411): the frozen, fully validated matches of `previewId`, under the
   * very baseline checks `commitReplacement` makes — frozen, every included range validated, the branch still exactly at the
   * state the preview froze — in the order they can be written one at a time: earlier blocks first, and inside a block from its
   * last match back, so each range still holds its own words when its turn comes. Nothing is written here; the caller writes
   * every revision and `closeReplacementAsRevisions` in one transaction.
   */
  replacementRevisionPlan(previewId: string): {
    manuscriptId: string; branchId: string; query: string; replacement: string;
    matches: ReadonlyArray<{ blockId: string; fromGrapheme: number; toGrapheme: number }>;
  } {
    const preview = one(this.#db.prepare('SELECT * FROM manuscript_replacement_previews WHERE preview_id = ?').all(previewId) as SqlRow[], 'REPLACEMENT_NOT_FOUND', '替换预览不存在。');
    requireBounded(asString(preview.state) === 'frozen' && asNumber(preview.validated_ordinal) > 0, 'REPLACEMENT_NOT_READY', '替换尚未完成复核。');
    const unvalidated = asNumber(one(this.#db.prepare(
      'SELECT count(*) total FROM manuscript_replacement_matches WHERE preview_id = ? AND included = 1 AND ordinal > ?',
    ).all(previewId, asNumber(preview.validated_ordinal)) as SqlRow[], 'REPLACEMENT_NOT_READY', '替换匹配缺失。').total);
    requireBounded(unvalidated === 0, 'REPLACEMENT_NOT_READY', '替换尚未完成全部精确范围复核。');
    const binding = this.#binding(asString(preview.manuscript_id), asString(preview.branch_id));
    this.#requireBranchEditable(binding.branchId);
    requireBounded(
      binding.revisionId === asString(preview.revision_id) && binding.journalSequence === asNumber(preview.journal_sequence) &&
        binding.workingDigest === asString(preview.working_digest),
      'REPLACEMENT_STALE',
      '稿件已变化，替换未提交，请刷新预览。',
    );
    const rows = this.#db.prepare(
      `SELECT rm.block_id, rm.from_grapheme, rm.to_grapheme
       FROM manuscript_replacement_matches rm
       JOIN working_blocks wb ON wb.branch_id = ? AND wb.block_id = rm.block_id
       WHERE rm.preview_id = ? AND rm.included = 1
       ORDER BY wb.order_key, rm.from_grapheme DESC`,
    ).all(binding.branchId, previewId) as SqlRow[];
    requireBounded(rows.length === asNumber(preview.included_matches) && rows.length > 0, 'REPLACEMENT_NOT_READY', '替换匹配缺失。');
    return {
      manuscriptId: binding.manuscriptId, branchId: binding.branchId,
      query: asString(preview.query), replacement: asString(preview.replacement),
      matches: rows.map((row) => ({ blockId: asString(row.block_id), fromGrapheme: asNumber(row.from_grapheme), toGrapheme: asNumber(row.to_grapheme) })),
    };
  }

  /** What a revision written now stands on: the branch's revision and journal position, and the block's digest. */
  revisionPin(manuscriptId: string, branchId: string, blockId: string): { revisionId: string; journalSequence: number; workingDigest: string; blockDigest: string } {
    const binding = this.#binding(manuscriptId, branchId);
    const block = one(this.#db.prepare('SELECT digest FROM working_blocks WHERE branch_id = ? AND block_id = ?').all(branchId, blockId) as SqlRow[],
      'BLOCK_NOT_FOUND', '内容块不存在。');
    return { revisionId: binding.revisionId, journalSequence: binding.journalSequence, workingDigest: binding.workingDigest, blockDigest: asString(block.digest) };
  }

  /** The replacement preview whose matches were all written as revisions is committed: it cannot be committed again. */
  closeReplacementAsRevisions(previewId: string): void {
    requireBounded(
      this.#db.prepare("UPDATE manuscript_replacement_previews SET state = 'committed', committed_at = ? WHERE preview_id = ? AND state = 'frozen'")
        .run(new Date().toISOString(), previewId).changes === 1,
      'REPLACEMENT_STATE_CHANGED',
      '替换预览状态已变化。',
    );
    this.#pruneReplacementRecords(0);
  }

  /**
   * The one write path of AI7 Apply (Issue #408; ARCHITECTURE › Proposal and Effect). Exact ranges are
   * replaced as one atomic command: every target is rechecked against the text its block holds now —
   * the range must still hold exactly the text the caller expects — and either all of them commit or
   * none does. It journals as a `replacement` command, which is what it is to the manuscript and what
   * the recovery chain can replay; what makes it an Apply is the Effect Receipt `record` writes inside
   * this same transaction, so the text and its receipt are published together or not at all.
   *
   * A committed Apply is an `apply` command (Issue #1175; ADR 0096 §1): plain 撤销 steps over it and never takes it back,
   * because reversing it is a governed Effect of its own (V2-UX-EREC-013, UI ADR 0003).
   */
  commitExactReplacements<Result>(
    manuscriptId: string,
    branchId: string,
    targets: ReadonlyArray<ExactReplacementTarget>,
    serviceLifetimeId: string,
    record: (commit: ExactReplacementCommit) => Result,
  ): Result {
    requireBounded(UUID_PATTERN.test(serviceLifetimeId), 'LIFETIME_INVALID', '本地服务生命周期标识无效。');
    requireBounded(targets.length > 0 && targets.length <= MAX_EXACT_REPLACEMENT_TARGETS, 'APPLY_INVALID', '应用范围无效。');
    return transact(this.#db, () => {
      const binding = this.#binding(manuscriptId, branchId);
      this.#requireBranchEditable(branchId);
      const byBlock = new Map<string, Array<ExactReplacementTarget & { index: number; original?: InverseTarget['original'] }>>();
      const inverses = targets.filter((target) => target.reversalOf !== undefined);
      const reverseEffect = inverses[0]?.reversalOf?.effectId;
      requireBounded(inverses.length === 0 || inverses.length === targets.length &&
        inverses.every((target) => target.reversalOf!.effectId === reverseEffect) && new Set(inverses.map((target) => target.reversalOf!.itemId)).size === targets.length,
      'APPLY_INVALID', '撤销范围必须完整属于同一次应用。');
      targets.forEach((target, index) => {
        const entry: ExactReplacementTarget & { index: number; original?: InverseTarget['original'] } = { ...target, index };
        requireBounded(!this.sourceObjects?.isReadOnly(binding.revisionId, target.blockId), 'SOURCE_OBJECT_READ_ONLY', '表格为只读内容，导出时从原文件完整恢复。');
        if (target.reversalOf !== undefined) {
          const original = this.#db.prepare(`SELECT t.block_id, t.from_grapheme, t.to_grapheme, t.expected_text_digest, t.replacement_text_digest, i.target_count
            FROM manuscript_effect_targets t JOIN manuscript_effect_intents i ON i.effect_id = t.effect_id AND i.kind = 'apply'
            JOIN manuscript_effect_receipts r ON r.effect_id = i.effect_id
            WHERE t.effect_id = ? AND t.item_id = ? AND i.manuscript_id = ? AND i.branch_id = ?`).get(target.reversalOf.effectId, target.reversalOf.itemId, manuscriptId, branchId);
          requireBounded(original !== undefined && blockReachesThroughLineage(this.#db, branchId, asString(original.block_id), target.blockId) && original.target_count === targets.length &&
            original.expected_text_digest === sha256(target.insertText) && original.replacement_text_digest === sha256(target.expectedText) &&
            this.#db.prepare('SELECT 1 FROM manuscript_effect_intents WHERE reverses_effect_id = ? LIMIT 1').get(target.reversalOf.effectId) === undefined,
          'APPLY_INVALID', '撤销范围或文字与原应用凭据不一致。');
          entry.original = { blockId: asString(original.block_id), from: asNumber(original.from_grapheme), to: asNumber(original.to_grapheme) };
        }
        // An empty range is an insertion at that point — reversing an Apply that deleted its words: it
        // expects no text there and brings some.
        requireBounded(
          BLOCK_PATTERN.test(target.blockId) && Number.isSafeInteger(target.fromGrapheme) && Number.isSafeInteger(target.toGrapheme) &&
            target.fromGrapheme >= 0 && target.toGrapheme >= target.fromGrapheme && target.insertText.isWellFormed() &&
            target.insertText !== target.expectedText && (target.toGrapheme > target.fromGrapheme || target.expectedText === ''),
          'APPLY_INVALID',
          '应用范围无效。',
        );
        const list = byBlock.get(target.blockId);
        if (list) list.push(entry);
        else byBlock.set(target.blockId, [entry]);
      });
      const groupId = randomUUID();
      const ordinal = binding.historySequence + 1;
      const now = new Date().toISOString();
      const sequence = binding.journalSequence + 1;
      this.#db.prepare(
        `INSERT INTO manuscript_command_groups(
           command_group_id, branch_id, ordinal, kind, status, source_group_id,
           before_working_digest, after_working_digest, created_at
         ) VALUES (?, ?, ?, 'apply', 'applied', NULL, ?, ?, ?)`,
      ).run(groupId, branchId, ordinal, binding.workingDigest, '0'.repeat(64), now);
      const insertEdit = this.#db.prepare(
        `INSERT INTO manuscript_command_edits(
           command_group_id, position, block_id, before_text, before_digest, after_text, after_digest
         ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      );
      const committed: ExactReplacementCommit['targets'][number][] = [];
      const blocks = (this.#db.prepare(
        `SELECT block_id, kind, level, text, digest FROM working_blocks
         WHERE branch_id = ? AND block_id IN (${[...byBlock.keys()].map(() => '?').join(', ')}) ORDER BY order_key`,
      ).all(branchId, ...byBlock.keys()) as SqlRow[]);
      // A target whose block left the working state has drifted as surely as one whose text changed.
      requireBounded(blocks.length === byBlock.size, 'APPLY_TARGET_DRIFTED', '原文已变，本次应用没有写入稿件。');
      let editPosition = 0;
      let totalDelta = 0;
      let firstBlockId: string | undefined;
      let firstDigest: string | undefined;
      let firstInsert = '';
      for (const row of blocks) {
        const blockId = asString(row.block_id);
        const beforeText = asString(row.text);
        const before = graphemes(beforeText);
        const ordered = byBlock.get(blockId)!.sort((left, right) => left.fromGrapheme - right.fromGrapheme ||
          (left.original?.from ?? 0) - (right.original?.from ?? 0));
        ordered.forEach((target, index) => {
          // Ordinary Apply never shares an insertion point. A complete committed inverse orders touching targets only within one
          // original paragraph, by their original contiguous ranges, including adjacent deletions (ADR 0105 §2).
          const previous = index === 0 ? undefined : ordered[index - 1]!;
          requireBounded(
            target.toGrapheme <= before.length &&
              (previous === undefined || previous.toGrapheme < target.fromGrapheme ||
                (previous.toGrapheme === target.fromGrapheme && (reverseEffect === undefined ? previous.toGrapheme > previous.fromGrapheme &&
                  target.toGrapheme > target.fromGrapheme : inverseTargetsTouchInOrder(previous as InverseTarget, target as InverseTarget)))) &&
              before.slice(target.fromGrapheme, target.toGrapheme).join('') === target.expectedText,
            'APPLY_TARGET_DRIFTED',
            '原文已变，本次应用没有写入稿件。',
          );
        });
        const text = [...before];
        const spans: Array<{ fromGrapheme: number; toGrapheme: number; insertedGraphemes: number; inserted: string[] }> = [];
        for (const target of [...ordered].reverse()) {
          const inserted = graphemes(target.insertText);
          text.splice(target.fromGrapheme, target.toGrapheme - target.fromGrapheme, ...inserted);
          spans.push({ fromGrapheme: target.fromGrapheme, toGrapheme: target.toGrapheme, insertedGraphemes: inserted.length, inserted });
        }
        const afterText = text.join('');
        const after = graphemes(afterText);
        requireBounded(afterText.length <= MAX_BLOCK_CODE_UNITS && after.length <= MAX_BLOCK_GRAPHEMES, 'APPLY_TOO_LARGE', '应用后内容块超出安全范围。');
        const kind = asString(row.kind) as ManuscriptBlockProjection['kind'];
        const level = row.level === null ? null : asNumber(row.level);
        const afterDigest = blockDigest(kind, level, afterText);
        editPosition += 1;
        insertEdit.run(groupId, editPosition, blockId, beforeText, asString(row.digest), afterText, afterDigest);
        const delta = after.length - before.length;
        requireBounded(rewriteBlock(this.#db, branchId, blockId, { kind, level, text: afterText, digest: afterDigest }, asString(row.digest)) !== null,
          'APPLY_TARGET_DRIFTED', '原文已变，本次应用没有写入稿件。');
        followBlockTextChangeForMarks(this.#db, branchId, blockId, beforeText, afterText, sequence, spans);
        totalDelta += delta;
        let shift = 0;
        for (const target of ordered) {
          const insertedLength = graphemes(target.insertText).length;
          committed.push({
            index: target.index,
            blockId,
            beforeBlockDigest: asString(row.digest),
            afterBlockDigest: afterDigest,
            resultingFromGrapheme: target.fromGrapheme + shift,
            resultingToGrapheme: target.fromGrapheme + shift + insertedLength,
          });
          shift += insertedLength - (target.toGrapheme - target.fromGrapheme);
        }
        if (firstBlockId === undefined) {
          firstBlockId = blockId;
          firstDigest = afterDigest;
          firstInsert = ordered[0]!.insertText;
        }
      }
      const workingDigest = recoveryWorkingDigest(
        binding.workingDigest, sequence, 'replacement', groupId, recoveryCommandEvidenceDigest(this.#db, groupId),
      );
      requireBounded(
        this.#db.prepare(
          `UPDATE manuscript_command_groups SET after_working_digest = ?
           WHERE command_group_id = ? AND after_working_digest = ?`,
        ).run(workingDigest, groupId, '0'.repeat(64)).changes === 1,
        'HISTORY_CORRUPT',
        '应用命令证据无法绑定工作状态链。',
      );
      this.#db.prepare(
        `INSERT INTO edit_journal_entries(
           journal_entry_id, client_edit_id, request_fingerprint, manuscript_id, branch_id, base_revision_id,
           sequence, block_id, from_grapheme, to_grapheme, insert_text, resulting_block_digest,
           resulting_working_digest, durable_at, command_group_id, command_kind, service_lifetime_id
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?, ?, ?, 'replacement', ?)`,
      ).run(randomUUID(), randomUUID(), sha256(canonicalJson({ applyCommandGroupId: groupId })), manuscriptId, branchId,
        binding.revisionId, sequence, firstBlockId!, firstInsert, firstDigest!, workingDigest, now, groupId, serviceLifetimeId);
      // Supersession belongs to the editor-step owner (Issue #1654): the Apply's own step, opened by its Effect, supersedes what
      // was undone, and an Apply that an undo or redo dispatches supersedes nothing.
      const state = this.#db.prepare(
        `UPDATE branch_working_state SET journal_sequence = ?, working_digest = ?, history_sequence = ?, total_graphemes = total_graphemes + ?
         WHERE branch_id = ? AND journal_sequence = ? AND working_digest = ?`,
      ).run(sequence, workingDigest, ordinal, totalDelta, branchId, binding.journalSequence, binding.workingDigest);
      requireBounded(state.changes === 1, 'APPLY_TARGET_DRIFTED', '应用提交时稿件状态已变化。');
      this.#recordLifetimeJournalWrite(serviceLifetimeId, binding, sequence, workingDigest, now);
      return record({
        commandGroupId: groupId,
        bookId: binding.bookId,
        before: { revisionId: binding.revisionId, journalSequence: binding.journalSequence, workingDigest: binding.workingDigest },
        after: { revisionId: binding.revisionId, journalSequence: sequence, workingDigest },
        targets: committed.sort((left, right) => left.index - right.index),
        committedAt: now,
      });
    });
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
        purpose: plan.purpose, purposeKind: milestonePurposeKindOf(plan.purpose), note: plan.note, createdAt: plan.createdAt,
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

  /**
   * What the editor-step owner replays through (Issue #1654): the branch as it stands now — refused while it awaits recovery —
   * and the service lifetime's high-water mark each journal write records.
   */
  editorStepHost(manuscriptId: string, branchId: string, serviceLifetimeId: string): Pick<EditorStepHost, 'binding' | 'recordLifetimeWrite' | 'lifetimeId' | 'replaceFromRevision'> {
    requireBounded(UUID_PATTERN.test(serviceLifetimeId), 'LIFETIME_INVALID', '本地服务生命周期标识无效。');
    return {
      lifetimeId: serviceLifetimeId,
      replaceFromRevision: (revisionId, expected) => {
        const binding = this.#binding(manuscriptId, branchId);
        this.#versionBinding(binding);
        const expectedRevision = this.#versionRow(binding, expected);
        const current = this.#versionRow(binding, binding.revisionId);
        const mismatch = this.#db.prepare(`WITH working AS (SELECT row_number() OVER (ORDER BY order_key) position, block_id, kind, level, text, digest FROM working_blocks WHERE branch_id = ?),
          saved AS (SELECT position, block_id, kind, level, text, digest FROM manuscript_block_versions WHERE revision_id = ?)
          SELECT coalesce(working.position,saved.position) position, working.block_id
          FROM saved FULL JOIN working USING (block_id)
          WHERE (saved.position,saved.kind,saved.level,saved.text,saved.digest) IS NOT (working.position,working.kind,working.level,working.text,working.digest)
          ORDER BY position, working.block_id LIMIT 1`).get(branchId, expected);
        if (mismatch) throw new RestoreConflict(asNumber(mismatch.position), mismatch.block_id === null ? null : asString(mismatch.block_id));
        if (current.source_version_id !== expectedRevision.source_version_id) throw new RestoreConflict(null, null);
        this.#replaceFromVersion(binding, revisionId);
      },
      binding: () => {
        this.#requireBranchEditable(branchId);
        return this.#binding(manuscriptId, branchId);
      },
      recordLifetimeWrite: (before, sequence, digest, at) => this.#recordLifetimeJournalWrite(serviceLifetimeId, before as BranchBinding, sequence, digest, at),
    };
  }

  manualCommandSource(branchId: string, sequence: number, request: ManualCommandRequestPin): ManualCommandSource {
    const entry = one(this.#db.prepare(`SELECT e.*, g.ordinal, g.kind, g.source_group_id, g.before_working_digest,
      g.after_working_digest, m.book_id FROM edit_journal_entries e
      JOIN manuscript_command_groups g ON g.command_group_id = e.command_group_id
      JOIN manuscripts m ON m.manuscript_id = e.manuscript_id WHERE e.branch_id = ? AND e.sequence = ?`)
      .all(branchId, sequence) as SqlRow[], 'MANUAL_SOURCE_MISMATCH', '手动编辑的原始日志不存在。');
    requireBounded(entry.command_kind === 'edit' || entry.command_kind === 'replacement', 'MANUAL_SOURCE_MISMATCH', '这不是原始手动编辑。');
    const evidence = new CommandEvidenceReader(this.#db, asString(entry.command_group_id));
    while (evidence.nextBatch().length > 0) { /* The existing reader proves every whole member. */ }
    const complete = evidence.finish();
    const source: ManualCommandSource = {
      bookId: asString(entry.book_id), manuscriptId: asString(entry.manuscript_id), branchId,
      baseRevisionId: asString(entry.base_revision_id), journalEntryId: asString(entry.journal_entry_id), journalSequence: sequence,
      clientEditId: asString(entry.client_edit_id), requestFingerprint: asString(entry.request_fingerprint), durableAt: asString(entry.durable_at),
      commandGroupId: asString(entry.command_group_id), commandKind: entry.command_kind, commandOrdinal: asNumber(entry.ordinal),
      sourceGroupId: null, beforeWorkingDigest: asString(entry.before_working_digest), afterWorkingDigest: asString(entry.after_working_digest),
      evidenceDigest: complete.digest, memberCount: complete.memberCount, request,
    };
    this.readManualCommandSource(source, null, MAX_FRAME_BYTES);
    return source;
  }

  /**
   * One page of an original manual command's exact evidence (Issue #1140). The source must prove itself against the
   * real records first: its creation journal entry, command group, Book, manuscript, branch and Revision, its producer
   * request recomputed into the entry's unchanged fingerprint, and the group's working-state chain recomputed over the
   * evidence digest it names. Every page reads the whole group once through the same evidence the chain hashes, so a
   * damaged member after the page refuses it as surely as one inside it; the page keeps whole members only, packed
   * against `budgetBytes` of encoded JSON. The current history is reported beside the evidence and pinned by the
   * cursor, so pages read across a change refuse rather than mix. Reading writes nothing.
   */
  readManualCommandSource(
    source: ManualCommandSource,
    cursor: ManualCommandSourceCursor | null,
    budgetBytes: number,
  ): ManualCommandSourcePage {
    requireManualCommandSource(source);
    requireBounded(Number.isSafeInteger(budgetBytes) && budgetBytes > 0 && budgetBytes <= MAX_FRAME_BYTES, 'MANUAL_SOURCE_INVALID', '手动编辑来源分页预算无效。');
    requireBounded(
      cursor === null || (
        typeof cursor === 'object' && hasExactFields(cursor, ['commandGroupId', 'evidenceDigest', 'afterPosition', 'historyDigest']) &&
          cursor.commandGroupId === source.commandGroupId && cursor.evidenceDigest === source.evidenceDigest &&
          Number.isSafeInteger(cursor.afterPosition) && cursor.afterPosition >= 0 && cursor.afterPosition < source.memberCount &&
          (cursor.historyDigest === null || (typeof cursor.historyDigest === 'string' && DIGEST_PATTERN.test(cursor.historyDigest)))
      ),
      'MANUAL_SOURCE_INVALID',
      '手动编辑来源分页位置无效。',
    );
    const creation = this.#requireManualCommandCreation(source);
    const history = this.#manualCommandHistory(source, creation.group, creation.latestSequence);
    requireBounded(
      cursor === null || cursor.historyDigest === null || cursor.historyDigest === history.digest,
      'MANUAL_SOURCE_HISTORY_CHANGED',
      '稿件历史已变化，请从第一页重新读取。',
    );
    const after = cursor?.afterPosition ?? 0;
    const historyPin = cursor === null ? history.digest : cursor.historyDigest;
    const evidence = new CommandEvidenceReader(this.#db, source.commandGroupId);
    const header = evidence.header;
    // What the page holds besides its members, with the longest cursor it could end on.
    let bytes = encodedJsonBytes({
      header, memberCount: source.memberCount, evidenceDigest: source.evidenceDigest, members: [], current: [],
      next: { commandGroupId: source.commandGroupId, evidenceDigest: source.evidenceDigest, afterPosition: source.memberCount, historyDigest: history.digest },
      history,
    });
    const currentBlock = this.#db.prepare('SELECT digest FROM working_blocks WHERE branch_id = ? AND block_id = ?');
    const members: CommandEvidenceMember[] = [];
    const current: ManualCommandMemberCurrent[] = [];
    let first: CommandEvidenceMember | undefined;
    let full = false;
    for (let batch = evidence.nextBatch(); batch.length > 0; batch = evidence.nextBatch()) {
      first ??= batch[0];
      for (const member of batch) {
        if (full || member.position <= after) continue;
        const row = currentBlock.get(source.branchId, member.blockId) as SqlRow | undefined;
        const state: ManualCommandMemberCurrent = {
          position: member.position,
          block: row === undefined ? 'absent' : asString(row.digest) === member.afterDigest ? 'recorded-after' : 'other-text',
        };
        const added = encodedJsonBytes(member) + encodedJsonBytes(state) + (members.length > 0 ? 2 : 0);
        if (bytes + added > budgetBytes) {
          full = true;
          continue;
        }
        members.push(member);
        current.push(state);
        bytes += added;
      }
    }
    const { memberCount, digest } = evidence.finish();
    requireBounded(
      asString(creation.group.after_working_digest) === recoveryWorkingDigest(
        asString(creation.group.before_working_digest), source.journalSequence, source.commandKind, source.commandGroupId, digest,
      ),
      'HISTORY_CORRUPT',
      '命令证据与其工作状态链不一致。',
    );
    requireBounded(
      digest === source.evidenceDigest && memberCount === source.memberCount && first !== undefined &&
        header.branchId === source.branchId && header.ordinal === source.commandOrdinal && header.kind === source.commandKind &&
        header.sourceGroupId === null && first.blockId === asString(creation.entry.block_id) &&
        first.afterDigest === asString(creation.entry.resulting_block_digest),
      'MANUAL_SOURCE_MISMATCH',
      '手动编辑来源与原始命令证据不一致。',
    );
    if (source.request.origin === 'journal-edit') {
      // Freehand typing is one block: the original request is read back whole and must give the entry's fingerprint.
      const request: JournalEditInput = {
        clientEditId: source.clientEditId, manuscriptId: source.manuscriptId, branchId: source.branchId,
        baseRevisionId: source.baseRevisionId, blockId: first.blockId, windowStartBlockId: source.request.windowStartBlockId,
        baseBlockDigest: first.beforeDigest, expectedJournalSequence: source.journalSequence - 1,
        fromGrapheme: asNumber(creation.entry.from_grapheme), toGrapheme: asNumber(creation.entry.to_grapheme),
        insertText: asString(creation.entry.insert_text),
      };
      const tracking = this.#db.prepare("SELECT 1 FROM sqlite_schema WHERE name = 'editor_inline_revision_commands'").get()
        ? this.#db.prepare('SELECT session_id, auto_apply FROM editor_inline_revision_commands WHERE command_group_id = ?').get(source.commandGroupId) : undefined;
      if (tracking) request.editorRevision = { sessionId: String(tracking.session_id), autoApply: Number(tracking.auto_apply) === 1 };
      const before = graphemes(first.beforeText);
      requireBounded(
        memberCount === 1 && sha256(canonicalJson(request)) === source.requestFingerprint && request.toGrapheme <= before.length &&
          [...before.slice(0, request.fromGrapheme), request.insertText, ...before.slice(request.toGrapheme)].join('') === first.afterText,
        'MANUAL_SOURCE_MISMATCH',
        '手动编辑来源与原始编辑请求不一致。',
      );
    }
    requireBounded(members.length > 0, 'MANUAL_SOURCE_INVALID', '手动编辑来源分页预算容不下一个完整命令成员。');
    const last = members.at(-1)!.position;
    const page: ManualCommandSourcePage = {
      header, memberCount, evidenceDigest: digest, members, current,
      next: last < memberCount
        ? { commandGroupId: source.commandGroupId, evidenceDigest: digest, afterPosition: last, historyDigest: historyPin }
        : null,
      history,
    };
    requireBounded(encodedJsonBytes(page) <= budgetBytes, 'MANUAL_SOURCE_INVALID', '手动编辑来源分页超出预算。');
    return page;
  }

  /**
   * The source's creation journal entry and command group, proved against everything the source names except the
   * evidence itself: the entry is the group's one creation, every other entry of the group is a later undo or redo on
   * the same branch, and the manual Search/Replace commit's preview gives the entry's fingerprint, which no Apply's does.
   */
  #requireManualCommandCreation(source: ManualCommandSource): { entry: SqlRow; group: SqlRow; latestSequence: number } {
    const entry = one(this.#db.prepare(
      `SELECT client_edit_id, request_fingerprint, manuscript_id, branch_id, base_revision_id, sequence, block_id,
              from_grapheme, to_grapheme, insert_text, resulting_block_digest, resulting_working_digest, durable_at,
              command_group_id, command_kind
       FROM edit_journal_entries WHERE journal_entry_id = ?`,
    ).all(source.journalEntryId) as SqlRow[], 'MANUAL_SOURCE_MISMATCH', '手动编辑来源的修订日志记录不存在。');
    const group = one(this.#db.prepare(
      `SELECT branch_id, ordinal, kind, status, source_group_id, before_working_digest, after_working_digest, created_at
       FROM manuscript_command_groups WHERE command_group_id = ?`,
    ).all(source.commandGroupId) as SqlRow[], 'MANUAL_SOURCE_MISMATCH', '手动编辑来源的命令组不存在。');
    const owner = this.#db.prepare(
      `SELECT m.book_id, b.manuscript_id branch_manuscript_id, r.manuscript_id revision_manuscript_id, r.branch_id revision_branch_id
       FROM manuscripts m, manuscript_branches b, manuscript_revisions r
       WHERE m.manuscript_id = ? AND b.branch_id = ? AND r.revision_id = ?`,
    ).get(source.manuscriptId, source.branchId, source.baseRevisionId) as SqlRow | undefined;
    const bindings = one(this.#db.prepare(
      `SELECT max(sequence) latest,
              coalesce(sum(CASE WHEN journal_entry_id = ? THEN 0
                                WHEN command_kind IN ('undo', 'redo') AND branch_id = ? AND sequence > ? THEN 0
                                ELSE 1 END), 0) stray
       FROM edit_journal_entries WHERE command_group_id = ?`,
    ).all(source.journalEntryId, source.branchId, source.journalSequence, source.commandGroupId) as SqlRow[],
    'MANUAL_SOURCE_MISMATCH', '手动编辑来源的修订日志绑定无法读取。');
    requireBounded(
      owner !== undefined && owner.book_id === source.bookId && owner.branch_manuscript_id === source.manuscriptId &&
        owner.revision_manuscript_id === source.manuscriptId && owner.revision_branch_id === source.branchId &&
        entry.client_edit_id === source.clientEditId && entry.request_fingerprint === source.requestFingerprint &&
        entry.manuscript_id === source.manuscriptId && entry.branch_id === source.branchId &&
        entry.base_revision_id === source.baseRevisionId && entry.sequence === source.journalSequence &&
        entry.durable_at === source.durableAt && entry.command_group_id === source.commandGroupId &&
        entry.command_kind === source.commandKind && entry.resulting_working_digest === source.afterWorkingDigest &&
        group.branch_id === source.branchId && group.ordinal === source.commandOrdinal && group.kind === source.commandKind &&
        group.source_group_id === null && group.before_working_digest === source.beforeWorkingDigest &&
        group.after_working_digest === source.afterWorkingDigest && group.created_at === source.durableAt &&
        bindings.stray === 0,
      'MANUAL_SOURCE_MISMATCH',
      '手动编辑来源与原始修订日志、命令组或稿件绑定不一致。',
    );
    if (source.request.origin === 'manual-search-replacement') {
      requireBounded(
        sha256(canonicalJson({ previewId: source.request.previewId })) === source.requestFingerprint &&
          entry.from_grapheme === 0 && entry.to_grapheme === 0,
        'MANUAL_SOURCE_MISMATCH',
        '手动编辑来源不是该替换预览的手动提交。',
      );
    }
    return { entry, group, latestSequence: asNumber(bindings.latest) };
  }

  #manualCommandHistory(source: ManualCommandSource, group: SqlRow, latestSequence: number): ManualCommandHistory {
    const binding = this.#binding(source.manuscriptId, source.branchId);
    const latest = one(this.#db.prepare(
      'SELECT journal_entry_id, command_kind, command_group_id FROM edit_journal_entries WHERE branch_id = ? AND sequence = ?',
    ).all(source.branchId, latestSequence) as SqlRow[], 'HISTORY_CORRUPT', '命令组的最近修订日志记录缺失。');
    const latestKind = asString(latest.command_kind);
    requireBounded(
      latest.command_group_id === source.commandGroupId && ['edit', 'replacement', 'undo', 'redo'].includes(latestKind),
      'HISTORY_CORRUPT',
      '命令组的最近修订日志记录不一致。',
    );
    const restoration = this.#db.prepare(
      `SELECT r.restoration_id, r.selected_kind, r.selected_snapshot_id, r.descendant_revision_id
       FROM recovery_restorations r JOIN recovery_attention a ON a.attention_id = r.attention_id
       WHERE a.branch_id = ? AND r.pre_restore_journal_sequence >= ?
       ORDER BY r.pre_restore_journal_sequence DESC, r.created_at DESC, r.restoration_id DESC LIMIT 1`,
    ).get(source.branchId, source.journalSequence) as SqlRow | undefined;
    const facts: Omit<ManualCommandHistory, 'digest'> = {
      revisionId: binding.revisionId,
      journalSequence: binding.journalSequence,
      workingDigest: binding.workingDigest,
      historySequence: binding.historySequence,
      historyBoundarySequence: binding.historyBoundarySequence,
      boundaryCrossed: asNumber(group.ordinal) <= binding.historyBoundarySequence,
      groupStatus: asString(group.status) as ManualCommandHistory['groupStatus'],
      lastAction: {
        kind: latestKind as ManualCommandHistory['lastAction']['kind'],
        journalEntryId: asString(latest.journal_entry_id),
        sequence: latestSequence,
      },
      restoration: restoration === undefined ? null : {
        restorationId: asString(restoration.restoration_id),
        selectedKind: asString(restoration.selected_kind) as NonNullable<ManualCommandHistory['restoration']>['selectedKind'],
        selectedSnapshotId: restoration.selected_snapshot_id === null ? null : asString(restoration.selected_snapshot_id),
        descendantRevisionId: asString(restoration.descendant_revision_id),
      },
    };
    return { ...facts, digest: sha256(canonicalJson(facts)) };
  }

  #versionBinding(scope: BookVersionScope): BranchBinding {
    const binding = this.#binding(scope.manuscriptId, scope.branchId);
    requireBounded(binding.bookId === scope.bookId && this.#db.prepare("SELECT 1 FROM manuscripts WHERE manuscript_id = ? AND book_id = ? AND role = 'primary'").get(scope.manuscriptId, scope.bookId),
      'VERSION_SCOPE_INVALID', '所选版本不属于本书主稿。');
    return binding;
  }

  #versionRow(binding: BranchBinding, revisionId: string): SqlRow {
    return one(this.#db.prepare(`SELECT r.* FROM manuscript_revisions r JOIN source_versions sv ON sv.source_version_id = r.source_version_id
      WHERE r.revision_id = ? AND r.manuscript_id = ? AND r.branch_id = ? AND sv.book_id = ?`).all(revisionId, binding.manuscriptId, binding.branchId, binding.bookId) as SqlRow[],
      'VERSION_NOT_FOUND', '所选版本不存在或不属于本书主稿。');
  }

  listBookVersions(input: ServiceOperationMap['listBookVersions']['input']): ServiceOperationMap['listBookVersions']['output'] {
    const binding = this.#versionBinding(input);
    const result = this.#db.prepare(`WITH revisions AS (SELECT revision_id, revision_label, created_at, upgrade_snapshot FROM manuscript_revisions WHERE manuscript_id = ? AND branch_id = ?), versions AS (
      SELECT 'revision' kind, CASE WHEN upgrade_snapshot = 1 THEN '升级时的稿件' WHEN EXISTS (SELECT 1 FROM editor_step_restore_revisions WHERE pre_revision_id = r.revision_id) THEN '恢复前自动保存' ELSE '已保存修订' END || ' · ' || revision_label label,
        revision_id, created_at, revision_id id FROM revisions r
      UNION ALL SELECT 'milestone', '里程碑 · ' || m.label, r.revision_id, m.created_at, m.milestone_id FROM milestone_versions m JOIN revisions r USING(revision_id) WHERE m.manuscript_id = ? AND m.branch_id = ?
      UNION ALL SELECT 'publication', '发稿版本 · 第 ' || p.ordinal || ' 次', r.revision_id, p.created_at, p.publication_version_id FROM publication_versions p JOIN revisions r USING(revision_id)
        WHERE p.book_id = ? AND p.manuscript_id = ? AND p.branch_id = ?) SELECT * FROM versions ORDER BY created_at DESC, id DESC LIMIT 31 OFFSET ?`)
      .all(input.manuscriptId, input.branchId, input.manuscriptId, input.branchId, input.bookId, input.manuscriptId, input.branchId, input.offset) as SqlRow[];
    return { rows: result.slice(0, 30).map(row => ({ kind: asString(row.kind) as BookVersionRow['kind'], label: asString(row.label), revisionId: asString(row.revision_id), createdAt: asString(row.created_at) })),
      more: result.length > 30, workingDigest: binding.workingDigest, baseRevisionId: binding.revisionId };
  }

  viewBookVersion(input: ServiceOperationMap['viewBookVersion']['input']): ServiceOperationMap['viewBookVersion']['output'] {
    this.#versionRow(this.#versionBinding(input), input.revisionId);
    return this.getHistoricalRevision(input.revisionId, input.cursor);
  }

  #appendVersion(binding: BranchBinding, parent: string, sourceVersionId: string, digest: string): string {
    const revisionId = randomUUID();
    const ordinal = asNumber(this.#db.prepare('SELECT max(ordinal) + 1 n FROM manuscript_revisions WHERE manuscript_id = ?').get(binding.manuscriptId)!.n);
    this.#db.prepare(`INSERT INTO manuscript_revisions(revision_id, manuscript_id, branch_id, ordinal, revision_label, parent_revision_id, source_version_id, revision_digest, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(revisionId, binding.manuscriptId, binding.branchId, ordinal, `r${ordinal}`, parent, sourceVersionId, digest, new Date().toISOString());
    return revisionId;
  }

  #replaceFromVersion(binding: BranchBinding, revisionId: string): string {
    const revision = this.#versionRow(binding, revisionId);
    const before = workingBlockDigests(this.#db, binding.branchId);
    const rows = this.#db.prepare('SELECT block_id, kind, level, text, digest FROM manuscript_block_versions WHERE revision_id = ? ORDER BY position').all(revisionId) as SqlRow[];
    requireBounded(rows.length > 0, 'VERSION_NOT_FOUND', '所选版本没有内容块。');
    const total = replaceWorkingState(this.#db, binding.branchId, rows.map(row => ({ blockId: asString(row.block_id), kind: asString(row.kind) as ManuscriptBlockProjection['kind'],
      level: row.level === null ? null : asNumber(row.level), text: asString(row.text), digest: asString(row.digest) })));
    const digest = asString(revision.revision_digest);
    const descendant = this.#appendVersion(binding, revisionId, asString(revision.source_version_id), digest);
    restoreRevisionMergeLineage(this.#db, binding.branchId, revisionId);
    snapshotWorkingRevision(this.#db, binding.branchId, descendant, total);
    resolveBranchMarksAfterRewrite(this.#db, binding.branchId, before, true);
    this.#db.prepare(`UPDATE branch_working_state SET base_revision_id = ?, working_digest = ?, total_graphemes = ?, last_checkpoint_sequence = journal_sequence WHERE branch_id = ?`).run(descendant, digest, total, binding.branchId);
    this.#db.prepare('UPDATE manuscript_branches SET base_revision_id = ? WHERE branch_id = ?').run(descendant, binding.branchId);
    return descendant;
  }

  restoreBookVersion(input: ServiceOperationMap['restoreBookVersion']['input']): ServiceOperationMap['restoreBookVersion']['output'] {
    return transact(this.#db, () => {
      const binding = this.#versionBinding(input);
      this.#requireBranchEditable(input.branchId);
      this.#versionRow(binding, input.revisionId);
      requireBounded(binding.revisionId === input.expectedBase && binding.workingDigest === input.expectedDigest, 'VERSION_STALE', '工作稿已变化，请刷新版本列表。');
      const current = this.#versionRow(binding, binding.revisionId);
      const pre = this.#appendVersion(binding, binding.revisionId, asString(current.source_version_id), binding.workingDigest);
      snapshotWorkingRevision(this.#db, binding.branchId, pre, binding.totalCharacters);
      const marks = this.#db.prepare("SELECT mark_id FROM editorial_marks WHERE branch_id = ? AND status IN ('open','resolved','applied')").all(input.branchId).map(row => asString(row.mark_id));
      const stepId = openRestoreStep(this.#db, input.branchId, pre, input.revisionId);
      recordStepAnchors(this.#db, stepId, 'pre', marks);
      const revisionId = this.#replaceFromVersion(binding, input.revisionId);
      this.#db.prepare('UPDATE branch_working_state SET history_boundary_sequence = history_sequence WHERE branch_id = ?').run(input.branchId);
      recordStepAnchors(this.#db, stepId, 'post', marks);
      return { stepId, revisionId };
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
