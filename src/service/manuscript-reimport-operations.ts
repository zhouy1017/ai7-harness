import { forgetBookFindings } from './book-findings.js';
import { createHash, randomUUID } from 'node:crypto';
import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readSync
} from 'node:fs';
import { DatabaseSync, type SQLOutputValue } from 'node:sqlite';
import {
  MAX_FRAME_BYTES,
  MAX_REIMPORT_EXCERPTS_PER_SIDE,
  MAX_REIMPORT_EXCERPT_GRAPHEMES,
  type BookHistoryCursor,
  type BookRecordPresentation,
  type BookWorkOverviewProjection,
  type FidelityCategoryProjection,
  type ImportCommitProjection,
  type ImportIdentityFindingProjection,
  type ManuscriptBlockProjection,
  type ManuscriptReimportCommitProjection,
  type ManuscriptReimportTargetSelection,
  type ManuscriptWindowProjection,
  type ManuscriptWindowTarget,
  type ReimportGroupProjection,
  type ReimportResolutionProjection,
  type ReimportGroupVerb,
  type ReimportLineageSourceVersionPageProjection,
  type ReimportMappingPageProjection,
  type ReviewBeforeManuscriptReimportProjection,
  type StagedImportProjection
} from '../shared/protocol.js';
import type { BoundedManuscriptStore, ReimportCheckpointBinding } from './bounded-manuscript.js';
import {
  DOCX_NOTE_PARSER_IDENTITY,
  DOCX_PARSER_IDENTITY,
  DOCX_SPLIT_PARSER_IDENTITY,
  type ImportFidelityPlan,
  type TextBoxDisposition
} from './docx.js';
import {
  type EditorialMarkStore,
  followReimportedMarks,
  resolveBranchMarksAfterRewrite,
  workingBlockDigests,
  type ReimportMarkOutcome,
  type ReimportMarkRow
} from './editorial-marks.js';
import {
  recordTextBoxChoice,
  stagedImportSourcesMatch,
  type WordReadingKind
} from './import-retention.js';
import { requireUncommittedImportDraft } from './import-editing-operations.js';
import * as importReviewOperations from './import-review-records.js';
import { MANUSCRIPT_REIMPORT_NON_EFFECTS, MANUSCRIPT_REIMPORT_RECORD_SCHEMA, REIMPORT_COMMIT_FILE_BATCH_BYTES, REIMPORT_GROUPING, REIMPORT_GROUP_PAGE_SIZE, REIMPORT_MAPPING_BATCH_SIZE, REIMPORT_WIRE_HEADROOM_BYTES, appendReimportOffsetSegment, canonicalDegradationDecision, commitRequestFingerprint, createReimportComparisonHasher, createReimportResolutionHasher, createReimportReviewDigest, degradationReview, emptyReimportResolutionDigest, manuscriptBlockDigest, type CommitAttempt, type DraftSnapshot, type IngestedDocx, type ReimportBlockFact, type ReimportCommitWork, type ReimportMappingBatch, type ReimportMappingFact, type ReimportPendingResolution, type ReimportPreparationWork, type ResolvedReimportTarget, type StoredImportCommitProjection } from './import-review-records.js';
import {
  createImportedMarks
} from './imported-marks.js';
import {
  commitNoteSources
} from './manuscript/note-blocks.js';
import {
  REIMPORT_GROUP_VERBS,
  groupReimportMappings,
  reimportGroupResolutions,
  reimportGroupVerbs,
} from './reimport-groups.js';
import {
  one
} from './store-operation-support.js';
import {
  DIGEST_PATTERN,
  StoreError,
  StoreFatalError,
  UUID_PATTERN,
  asNumber,
  asString,
  canonicalJson,
  requireStore,
  sha256,
  type SqlRow,
} from './store-records.js';

export interface ManuscriptReimportOperationsHost {
  readonly control: import('./store-operation-support.js').StoreControl;
  assertAvailable: () => void;
  reimportLineageSourceVersionPage: (bookId: string, after: string | null) => Pick<ReimportLineageSourceVersionPageProjection, 'items' | 'previousCursor' | 'nextCursor'>;
  requireNoAbandonmentCleanupIntent: (draftId: string) => void;
  loadDraftSnapshot: (draftId: string) => DraftSnapshot;
  selectLegacyWordStaging: (snapshot: DraftSnapshot) => DraftSnapshot;
  requireEditableFormat: (snapshot: DraftSnapshot) => void;
  readonly reimportPreparationWork: Map<string, importReviewOperations.ReimportPreparationWork>;
  boundedCall: <T>(operation: () => T) => T;
  readonly boundedAuthority: BoundedManuscriptStore;
  readonly authority: DatabaseSync;
  identityFindings: (snapshot: DraftSnapshot) => ImportIdentityFindingProjection[];
  transaction: <T>(db: DatabaseSync, operation: () => T) => T;
  reimportFidelity: (snapshot: DraftSnapshot) => { fidelity: FidelityCategoryProjection[]; plan: ImportFidelityPlan; };
  assertForeignKeys: (db: DatabaseSync) => void;
  readonly reimportResolutionWork: Map<string, importReviewOperations.ReimportResolutionWork>;
  loadCommitAttemptForDraft: (draftId: string) => CommitAttempt | null;
  readonly verifiedCommitObjects: Set<string>;
  readonly reimportCommitWork: Map<string, importReviewOperations.ReimportCommitWork | importReviewOperations.ReimportReplayWork>;
  reconcileCommitAttempt: (attemptInput: CommitAttempt, options?: { contentObjectAlreadyVerified?: boolean; }) => Promise<{ state: "uncommitted"; } | { state: "uncertain"; } | { state: "committed"; result: ImportCommitProjection; }>;
  contentObjectPath: (objectDigest: string, relativeKey: string) => string;
  revalidateConversion: (snapshot: DraftSnapshot, originalPath: string) => Promise<{ digest: string; byteLength: number; path: string; fidelity: FidelityCategoryProjection[]; }>;
  parseIntoIngest: (draftId: string, path: string, displayName: string, options?: { signal?: AbortSignal; onArchiveProgress?: (bytes: number) => void; workingRepresentation?: true; historicalReader?: true; reading?: WordReadingKind | "legacy"; textBoxDisposition?: TextBoxDisposition; }) => Promise<IngestedDocx>;
  discardIngest: (ingestId: string) => void;
  loadStoredCommitResult: (commitId: string) => StoredImportCommitProjection;
  markCommitAttemptUncertain: (commitId: string) => void;
  rememberVerifiedCommitObject: (commitId: string) => void;
  retentionCall: <T>(operation: () => T) => T;
  rewriteCommittedResultWithoutPresentationForTest: (commitId: string) => void;
  importedMarkCall: <T>(operation: () => T) => T;
  readonly editorialMarks: EditorialMarkStore;
  stagedProjection: (snapshot: DraftSnapshot) => StagedImportProjection;
  reimportRecordPresentations: (bookId: string, recordIds: ReadonlyArray<string>) => BookRecordPresentation[];
  getBookOverview: (bookId: string, historyCursor?: BookHistoryCursor | null) => BookWorkOverviewProjection;
  getManuscriptWindowAt: (manuscriptId: string, branchId: string, target: ManuscriptWindowTarget) => ManuscriptWindowProjection;
  readonly stableUuid: (value: string) => string;
  readonly exactBookChoiceLabel: (title: string, bookId: string, internalNumber: string | null) => string;
  readonly nullableString: (value: SQLOutputValue | undefined) => string | null;
  readonly SOURCE_VERSION_PARSER_CHANGED_MESSAGE: "这本书里已有同一个文件的来源版本，但它是用旧版 AI7 的读取方式导入的；AI7 现在读取文件的方式已经不同，不能在原来的来源版本上再次导入这个文件。可以把它作为新建图书导入。";
}

export function getReimportLineageSourceVersionPage(host: ManuscriptReimportOperationsHost, bookId: string, after: string | null): ReimportLineageSourceVersionPageProjection {
    host.assertAvailable();
    requireStore(UUID_PATTERN.test(bookId) && (after === null || UUID_PATTERN.test(after)),
      'REIMPORT_LINEAGE_INVALID', '来源关系版本分页位置无效。');
    const page = host.reimportLineageSourceVersionPage(bookId, after);
    return { bookId, after, ...page };
  }

export function createManuscriptReimportPreparationWork(host: ManuscriptReimportOperationsHost, draftId: string, expectedDraftVersion: number, targetSelection: ManuscriptReimportTargetSelection): { workId: string; total: number } {
    host.assertAvailable();
    requireStore(UUID_PATTERN.test(draftId), 'DRAFT_INVALID', '导入草稿标识无效。');
    host.requireNoAbandonmentCleanupIntent(draftId);
    let snapshot = host.loadDraftSnapshot(draftId);
    requireStore(snapshot.state === 'staged', 'DRAFT_STATE_CHANGED', '导入草稿状态已变化。');
    requireStore(snapshot.version === expectedDraftVersion, 'DRAFT_VERSION_CHANGED', '导入草稿版本已变化。');
    snapshot = host.selectLegacyWordStaging(snapshot);
    // Reimport compares bounded parsed pieces; their source paragraph and ordinal remain explicit lineage at commit.
    host.requireEditableFormat(snapshot);
    const binding = reimportManuscriptBinding(host, targetSelection.bookId);
    requireStore(!Array.from(host.reimportPreparationWork.values()).some((work) => work.draftId === draftId),
      'SERVICE_BUSY', '该重新导入草稿已有比较准备任务。');
    const checkpointStart = host.boundedCall(() =>
      host.boundedAuthority.createReimportCheckpointWork(binding.manuscriptId, binding.branchId));
    host.authority.exec(
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
      host.authority.exec(
        `CREATE UNIQUE INDEX IF NOT EXISTS temp.reimport_checkpoint_identity
           ON manuscript_checkpoint_rows(work_id, block_id)`,
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
      const target = resolveReimportTarget(host,
        targetSelection, snapshot, checkpointStart.checkpoint, host.identityFindings(snapshot));
      const checkpointBlockCount = asNumber(one(host.authority.prepare(
        'SELECT count(*) total FROM manuscript_block_versions WHERE revision_id = ?',
      ).all(target.checkpoint.revisionId) as SqlRow[], 'REIMPORT_COMPARISON_INVALID', '无法核对当前固定点块数。').total);
      requireStore(checkpointBlockCount > 0, 'REIMPORT_COMPARISON_INVALID', '当前固定点没有稿件块。');
      initializeReimportPreparationMapping(host, work, target, checkpointBlockCount);
    }
    host.reimportPreparationWork.set(workId, work);
    return { workId, total: work.totalUpperBound };
  }

export function initializeReimportPreparationMapping(host: ManuscriptReimportOperationsHost, work: ReimportPreparationWork, target: ResolvedReimportTarget, checkpointBlockCount: number): void {
    const lineageBlockCount = target.lineage.status === 'verified'
      ? asNumber(one(host.authority.prepare(
        `SELECT position FROM manuscript_block_versions
         WHERE revision_id = ? ORDER BY position DESC LIMIT 1`,
      ).all(target.lineage.revisionId) as SqlRow[], 'REIMPORT_LINEAGE_UNVERIFIED', '无法核对来源关系修订版块数。').position)
      : 0;
    work.phase = 'staged-occurrences';
    work.target = target;
    work.comparisonId = host.stableUuid(`ai7.reimport-comparison/1\u0000${work.draftId}`);
    work.comparisonHasher = createReimportComparisonHasher(work.draftId, target);
    work.batches = null;
    work.occurrenceCursor = 0;
    work.checkpointBlockCount = checkpointBlockCount;
    work.totalUpperBound = work.checkpointCompleted +
      (work.snapshot.blockCount * 2) + (checkpointBlockCount * 2) + lineageBlockCount;
  }

export function advanceReimportOccurrenceFacts(host: ManuscriptReimportOperationsHost, work: ReimportPreparationWork): number {
    requireStore(work.target !== null && work.phase !== 'checkpoint' && work.phase !== 'mapping',
      'REIMPORT_COMPARISON_INVALID', '重新导入唯一性准备状态无效。');
    const sourceKind = work.phase === 'staged-occurrences'
      ? 'staged'
      : work.phase === 'current-occurrences' ? 'current' : 'lineage';
    let rows: SqlRow[];
    if (sourceKind === 'staged') {
      rows = host.authority.prepare(
        `SELECT staged_block_id block_id, position, kind, level, text, digest
         FROM staged_import_blocks
         WHERE draft_id = ? AND position > ? ORDER BY position LIMIT ${REIMPORT_MAPPING_BATCH_SIZE}`,
      ).all(work.draftId, work.occurrenceCursor) as SqlRow[];
    } else if (sourceKind === 'current' && work.checkpointWorkId !== null) {
      rows = host.authority.prepare(
        `SELECT block_id, position, kind, level, text, digest
         FROM temp.manuscript_checkpoint_rows
         WHERE work_id = ? AND position > ? ORDER BY position LIMIT ${REIMPORT_MAPPING_BATCH_SIZE}`,
      ).all(work.checkpointWorkId, work.occurrenceCursor) as SqlRow[];
    } else {
      const revisionId = sourceKind === 'current'
        ? work.target.checkpoint.revisionId
        : work.target.lineage.revisionId;
      if (revisionId === null) rows = [];
      else {
        rows = host.authority.prepare(
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
        work.batches = reimportMappingBatches(host,
          work.workId, work.draftId, work.target, work.checkpointWorkId);
      }
      return 0;
    }
    host.transaction(host.authority, () => {
      const upsert = host.authority.prepare(
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

export function advanceManuscriptReimportPreparationWork(host: ManuscriptReimportOperationsHost, workId: string): ReimportPreparationProgress {
    host.assertAvailable();
    requireStore(UUID_PATTERN.test(workId), 'JOB_INVALID', '重新导入比较任务标识无效。');
    const work = host.reimportPreparationWork.get(workId);
    requireStore(work !== undefined, 'JOB_NOT_FOUND', '重新导入比较任务不存在或已结束。');
    if (work.phase === 'checkpoint') {
      requireStore(work.checkpointWorkId !== null, 'REIMPORT_CHECKPOINT_INVALID', '重新导入固定点任务缺失。');
      const checkpoint = host.boundedCall(() =>
        host.boundedAuthority.advanceReimportCheckpointWork(work.checkpointWorkId!));
      work.checkpointCompleted = checkpoint.completed;
      if (!checkpoint.done) {
        return { done: false, completed: checkpoint.completed, total: work.totalUpperBound, review: null };
      }
      requireStore(checkpoint.checkpoint !== null, 'REIMPORT_CHECKPOINT_INVALID', '重新导入固定点未完成。');
      const target = resolveReimportTarget(host,
        work.targetSelection, work.snapshot, checkpoint.checkpoint, host.identityFindings(work.snapshot), true);
      const checkpointBlockCount = asNumber(one(host.authority.prepare(
        'SELECT count(*) total FROM temp.manuscript_checkpoint_rows WHERE work_id = ?',
      ).all(work.checkpointWorkId) as SqlRow[], 'REIMPORT_COMPARISON_INVALID', '无法核对当前固定点块数。').total);
      requireStore(checkpointBlockCount > 0, 'REIMPORT_COMPARISON_INVALID', '当前固定点没有稿件块。');
      initializeReimportPreparationMapping(host, work, target, checkpointBlockCount);
      return { done: false, completed: checkpoint.total, total: work.totalUpperBound, review: null };
    }
    if (work.phase !== 'mapping') {
      work.completed += advanceReimportOccurrenceFacts(host, work);
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
      host.transaction(host.authority, () => {
        const insert = host.authority.prepare(
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
    const snapshot = host.loadDraftSnapshot(work.draftId);
    requireStore(snapshot.state === 'staged' && snapshot.version === work.expectedDraftVersion &&
      snapshot.sourceDigest === work.snapshot.sourceDigest && snapshot.contentDigest === work.snapshot.contentDigest &&
      snapshot.structureDigest === work.snapshot.structureDigest && snapshot.parserIdentity === work.snapshot.parserIdentity,
    'DRAFT_VERSION_CHANGED', '重新导入草稿在比较准备期间已变化。');
    const target = resolveReimportTarget(host,
      work.targetSelection,
      snapshot,
      work.target.checkpoint,
      host.identityFindings(snapshot),
      work.checkpointWorkId !== null,
    );
    requireStore(canonicalJson(target) === canonicalJson(work.target), 'REVIEW_CHANGED', '重新导入目标在比较准备期间已变化。');
    const comparisonDigest = work.comparisonHasher.digest();
    const nextVersion = work.expectedDraftVersion + 1;
    const resolutionDigest = emptyReimportResolutionDigest();
    const reviewDigest = createReimportReviewDigest(
      { ...snapshot, version: nextVersion }, target, comparisonDigest, resolutionDigest,
      degradationReview(host.reimportFidelity(snapshot).plan, false).state,
    );
    const reviewedAt = new Date().toISOString();
    const persistComparison = (): void => {
      host.authority.prepare(
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
          ? asString(one(host.authority.prepare('SELECT revision_digest FROM manuscript_revisions WHERE revision_id = ?')
            .all(target.lineage.revisionId) as SqlRow[], 'REIMPORT_LINEAGE_UNVERIFIED', '来源修订版不存在。').revision_digest)
          : null,
        target.lineage.comparisonKind, snapshot.sourceDigest, snapshot.contentDigest, snapshot.structureDigest,
        snapshot.parserIdentity, snapshot.blockCount, work.checkpointBlockCount, work.mappingCount,
        work.unresolvedMappings, work.changedMappings, comparisonDigest, resolutionDigest, 0, reviewedAt,
      );
      const copied = host.authority.prepare(
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
      persistReimportGroups(host, work.comparisonId!, work.draftId, workId);
      const update = host.authority.prepare(
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
      host.authority.prepare('DELETE FROM temp.reimport_preparation_rows WHERE work_id = ?').run(workId);
      host.authority.prepare('DELETE FROM temp.reimport_preparation_occurrences WHERE work_id = ?').run(workId);
      host.assertForeignKeys(host.authority);
    };
    if (work.checkpointWorkId === null) {
      host.transaction(host.authority, persistComparison);
    } else {
      host.boundedCall(() =>
        host.boundedAuthority.finalizeReimportCheckpointWork(work.checkpointWorkId!, persistComparison));
    }
    host.reimportPreparationWork.delete(workId);
    const review = reimportReviewProjection(host, host.loadDraftSnapshot(work.draftId), target, null);
    return { done: true, completed: work.totalUpperBound, total: work.totalUpperBound, review };
  }

export function cancelManuscriptReimportPreparationWork(host: ManuscriptReimportOperationsHost, workId: string): boolean {
    host.assertAvailable();
    requireStore(UUID_PATTERN.test(workId), 'JOB_INVALID', '重新导入比较任务标识无效。');
    const work = host.reimportPreparationWork.get(workId);
    if (work === undefined) return false;
    if (work.checkpointWorkId !== null) {
      host.boundedCall(() => host.boundedAuthority.cancelReimportCheckpointWork(work.checkpointWorkId!));
    }
    host.reimportPreparationWork.delete(workId);
    host.authority.prepare('DELETE FROM temp.reimport_preparation_rows WHERE work_id = ?').run(workId);
    host.authority.prepare('DELETE FROM temp.reimport_preparation_occurrences WHERE work_id = ?').run(workId);
    return true;
  }

export function getReimportMappingPage(host: ManuscriptReimportOperationsHost, draftId: string, expectedDraftVersion: number, after: number | null): ReimportMappingPageProjection {
    host.assertAvailable();
    requireStore(UUID_PATTERN.test(draftId) && (after === null || (Number.isSafeInteger(after) && after >= 0)),
      'REIMPORT_MAPPING_INVALID', '重新导入对应分页参数无效。');
    const snapshot = host.loadDraftSnapshot(draftId);
    requireStore(snapshot.state === 'reviewed' && snapshot.reviewedRelationship === 'reimport' &&
      snapshot.version === expectedDraftVersion && snapshot.reviewDigest !== null,
    'DRAFT_VERSION_CHANGED', '重新导入复核已变化。');
    const comparison = one(host.authority.prepare(
      'SELECT comparison_id FROM manuscript_reimport_comparisons WHERE draft_id = ?',
    ).all(draftId) as SqlRow[], 'REIMPORT_COMPARISON_INVALID', '重新导入比较不存在。');
    const comparisonId = asString(comparison.comparison_id);
    const rows = host.authority.prepare(
      `SELECT g.*, r.verb FROM manuscript_reimport_groups g
       LEFT JOIN manuscript_reimport_group_resolutions r ON r.group_id = g.group_id
       WHERE g.comparison_id = ? AND g.ordinal > ? ORDER BY g.ordinal LIMIT ${REIMPORT_GROUP_PAGE_SIZE + 1}`,
    ).all(comparisonId, after ?? 0) as SqlRow[];
    const page = rows.slice(0, REIMPORT_GROUP_PAGE_SIZE);
    const excerpts = host.authority.prepare(
      `SELECT CASE WHEN gm.side = 'current' THEN m.current_position ELSE m.staged_position END position,
              CASE WHEN gm.side = 'current' THEN m.current_text ELSE m.staged_text END text
       FROM manuscript_reimport_group_members gm
       JOIN manuscript_reimport_mappings m ON m.mapping_id = gm.mapping_id
       WHERE gm.group_id = ? AND gm.side = ? ORDER BY gm.member_order LIMIT ${MAX_REIMPORT_EXCERPTS_PER_SIDE}`,
    );
    const segmenter = new Intl.Segmenter('zh-CN', { granularity: 'grapheme' });
    const side = (row: SqlRow, name: 'current' | 'staged'): ReimportGroupProjection['current'] => ({
      count: asNumber(row[`${name}_count`]),
      from: row[`${name}_from`] === null ? null : asNumber(row[`${name}_from`]),
      to: row[`${name}_to`] === null ? null : asNumber(row[`${name}_to`]),
      excerpts: (excerpts.all(asString(row.group_id), name) as SqlRow[]).map((excerpt) => {
        const graphemes = Array.from(segmenter.segment(asString(excerpt.text)), ({ segment }) => segment);
        return {
          position: asNumber(excerpt.position),
          text: graphemes.slice(0, MAX_REIMPORT_EXCERPT_GRAPHEMES).join(''),
          truncated: graphemes.length > MAX_REIMPORT_EXCERPT_GRAPHEMES,
        };
      }),
    });
    const projection: ReimportMappingPageProjection = {
      draftId,
      draftVersion: snapshot.version,
      reviewDigest: snapshot.reviewDigest,
      items: page.map((row): ReimportGroupProjection => ({
        groupId: asString(row.group_id),
        ordinal: asNumber(row.ordinal),
        chapterLabel: row.chapter_label === null ? null : asString(row.chapter_label),
        current: side(row, 'current'),
        staged: side(row, 'staged'),
        verbs: reimportGroupVerbs(asNumber(row.current_count), asNumber(row.staged_count)),
        verb: row.verb === null ? null : asString(row.verb) as ReimportGroupVerb,
      })),
      previousCursor: after === null || after <= REIMPORT_GROUP_PAGE_SIZE ? null : after - REIMPORT_GROUP_PAGE_SIZE,
      nextCursor: rows.length > REIMPORT_GROUP_PAGE_SIZE ? asNumber(page.at(-1)!.ordinal) : null,
    };
    requireStore(Buffer.byteLength(JSON.stringify(projection), 'utf8') <= MAX_FRAME_BYTES - REIMPORT_WIRE_HEADROOM_BYTES,
      'REIMPORT_MAPPING_INVALID', '重新导入对应页超出有界服务帧。');
    return projection;
  }

export function acceptReimportDegradation(host: ManuscriptReimportOperationsHost, draftId: string, expectedDraftVersion: number): ReviewBeforeManuscriptReimportProjection {
    host.assertAvailable();
    requireStore(UUID_PATTERN.test(draftId), 'DRAFT_INVALID', '导入草稿标识无效。');
    requireUncommittedImportDraft(host, draftId);
    const snapshot = host.loadDraftSnapshot(draftId);
    requireStore(snapshot.state === 'reviewed' && snapshot.reviewedRelationship === 'reimport' &&
      snapshot.version === expectedDraftVersion, 'DRAFT_VERSION_CHANGED', '重新导入复核已变化。');
    const target = reconstructReviewedReimportTarget(host, snapshot);
    requireStore(target !== null, 'REVIEW_CHANGED', '重新导入复核无法由当前权威状态重建。');
    const { plan } = host.reimportFidelity(snapshot);
    requireStore(plan.degradations.length > 0, 'DEGRADATION_ACCEPTANCE_INVALID', '本次重新导入不需要降级接受。');
    const evidence = reimportEvidence(host, draftId);
    const nextVersion = expectedDraftVersion + 1;
    const nextSnapshot = { ...snapshot, version: nextVersion };
    const reviewDigest = createReimportReviewDigest(
      nextSnapshot, target, evidence.comparisonDigest, evidence.resolutionDigest, 'accepted-complete-set',
    );
    host.transaction(host.authority, () => {
      requireStore(host.authority.prepare(
        `UPDATE manuscript_reimport_comparisons SET degradation_accepted = 1
         WHERE draft_id = ? AND degradation_accepted = 0`,
      ).run(draftId).changes === 1, 'DEGRADATION_ACCEPTANCE_INVALID', '重新导入降级接受状态已变化。');
      requireStore(host.authority.prepare(
        `UPDATE import_drafts SET draft_version = ?, review_digest = ?, reviewed_at = ?
         WHERE draft_id = ? AND state = 'reviewed' AND reviewed_relationship = 'reimport'
           AND draft_version = ?`,
      ).run(nextVersion, reviewDigest, new Date().toISOString(), draftId, expectedDraftVersion).changes === 1,
      'DRAFT_VERSION_CHANGED', '重新导入降级接受期间复核已变化。');
      host.authority.prepare("DELETE FROM import_commit_attempts WHERE draft_id = ? AND state = 'prepared'").run(draftId);
    });
    const refreshed = host.loadDraftSnapshot(draftId);
    const refreshedTarget = reconstructReviewedReimportTarget(host, refreshed);
    requireStore(refreshedTarget !== null, 'REVIEW_CHANGED', '重新导入复核无法重建。');
    return reimportReviewProjection(host, refreshed, refreshedTarget, null);
  }

export function createReimportResolutionWork(host: ManuscriptReimportOperationsHost, draftId: string, expectedDraftVersion: number, groupId: string, verb: ReimportGroupVerb): { workId: string; total: number } {
    host.assertAvailable();
    requireStore(UUID_PATTERN.test(draftId) && UUID_PATTERN.test(groupId) && REIMPORT_GROUP_VERBS.includes(verb),
      'REIMPORT_MAPPING_INVALID', '重新导入对应行的解决参数无效。');
    requireUncommittedImportDraft(host, draftId);
    requireStore(!Array.from(host.reimportCommitWork.values()).some((work) => work.input.draftId === draftId),
      'SERVICE_BUSY', '这次导入正在提交，请等待完成或取消当前提交后再改选。');
    const snapshot = host.loadDraftSnapshot(draftId);
    requireStore(snapshot.state === 'reviewed' && snapshot.reviewedRelationship === 'reimport' &&
      snapshot.version === expectedDraftVersion, 'DRAFT_VERSION_CHANGED', '重新导入复核已变化。');
    const target = reconstructReviewedReimportTarget(host, snapshot);
    requireStore(target !== null, 'REVIEW_CHANGED', '重新导入复核无法由当前权威状态重建。');
    const group = one(host.authority.prepare(
      `SELECT g.group_id, g.comparison_id, g.current_count, g.staged_count, c.degradation_accepted, c.total_mappings, r.verb
       FROM manuscript_reimport_groups g
       JOIN manuscript_reimport_comparisons c ON c.comparison_id = g.comparison_id
       LEFT JOIN manuscript_reimport_group_resolutions r ON r.group_id = g.group_id
       WHERE c.draft_id = ? AND g.group_id = ?`,
    ).all(draftId, groupId) as SqlRow[], 'REIMPORT_MAPPING_INVALID', '重新导入对应行不存在。');

    requireStore(reimportGroupVerbs(asNumber(group.current_count), asNumber(group.staged_count)).includes(verb),
      'REIMPORT_MAPPING_INVALID', '所选动词与这一行的内容不相容。');
    requireStore(!Array.from(host.reimportResolutionWork.values()).some((work) => work.draftId === draftId),
      'SERVICE_BUSY', '该重新导入复核已有对应行解决任务。');
    const comparisonId = asString(group.comparison_id);
    const pending = new Map<string, ReimportPendingResolution>();
    for (const resolution of reimportGroupResolutions(verb, reimportGroupMembers(host, groupId, 'current'), reimportGroupMembers(host, groupId, 'staged'))) {
      pending.set(resolution.mappingId, resolution);
    }
    requireReimportPendingOpen(host, comparisonId, pending, groupId);
    const totalMappings = asNumber(group.total_mappings);
    const workId = randomUUID();
    host.reimportResolutionWork.set(workId, {
      workId, draftId, expectedDraftVersion, groupId, verb, pending,
      snapshot, target, comparisonId,
      degradationAccepted: asNumber(group.degradation_accepted) === 1,
      totalMappings, resolutionHasher: createReimportResolutionHasher(), completed: 0,
    });
    return { workId, total: totalMappings };
  }

/** The mappings on one side of a row, in the row's order, with what the commit needs of each. */
export function reimportGroupMembers(host: ManuscriptReimportOperationsHost, groupId: string, side: 'current' | 'staged'): Array<{ mappingId: string; changeKind: 'unchanged' | 'move' | 'edit' | 'insert' | 'delete'; currentBlockId: string | null }> {
    return (host.authority.prepare(
      `SELECT m.mapping_id, m.change_kind, m.current_block_id
       FROM manuscript_reimport_group_members gm JOIN manuscript_reimport_mappings m ON m.mapping_id = gm.mapping_id
       WHERE gm.group_id = ? AND gm.side = ? ORDER BY gm.member_order`,
    ).all(groupId, side) as SqlRow[]).map((row) => ({
      mappingId: asString(row.mapping_id),
      changeKind: asString(row.change_kind) as 'unchanged' | 'move' | 'edit' | 'insert' | 'delete',
      currentBlockId: row.current_block_id === null ? null : asString(row.current_block_id),
    }));
  }

/** Every identity a verb writes is still unwritten, and every current identity it carries still unclaimed. */
export function requireReimportPendingOpen(host: ManuscriptReimportOperationsHost, comparisonId: string, pending: ReadonlyMap<string, ReimportPendingResolution>, groupId: string): void {
    for (const resolution of pending.values()) {
      if (resolution.resolution === 'preserve-current-identity') {
        const claimed = host.authority.prepare(
          `SELECT 1 FROM manuscript_reimport_mapping_resolutions r WHERE comparison_id = ? AND resolved_current_block_id = ?
           AND NOT EXISTS (SELECT 1 FROM manuscript_reimport_group_members gm WHERE gm.group_id = ? AND gm.mapping_id = r.mapping_id)`,
        ).get(comparisonId, resolution.currentBlockId, groupId);
        requireStore(claimed === undefined, 'REIMPORT_MAPPING_INVALID', '这一行要延续的当前结构身份已被占用。');
      }
    }
  }

export function advanceReimportResolutionWork(host: ManuscriptReimportOperationsHost, workId: string): ReimportResolutionProgress {
    host.assertAvailable();
    requireStore(UUID_PATTERN.test(workId), 'JOB_INVALID', '对应行解决任务标识无效。');
    const work = host.reimportResolutionWork.get(workId);
    requireStore(work !== undefined, 'JOB_NOT_FOUND', '对应行解决任务不存在或已结束。');
    const rows = host.authority.prepare(
      `SELECT m.mapping_id, m.position, r.resolution, r.resolved_current_block_id,
              EXISTS (SELECT 1 FROM manuscript_reimport_group_members gm WHERE gm.group_id = ? AND gm.mapping_id = m.mapping_id) replacing
       FROM manuscript_reimport_mappings m
       LEFT JOIN manuscript_reimport_mapping_resolutions r ON r.mapping_id = m.mapping_id
       WHERE m.comparison_id = ? AND m.position > ? ORDER BY m.position LIMIT ${REIMPORT_MAPPING_BATCH_SIZE}`,
    ).all(work.groupId, work.comparisonId, work.completed) as SqlRow[];
    if (rows.length > 0) {
      for (const row of rows) {
        const mappingId = asString(row.mapping_id);
        const pending = work.pending.get(mappingId);
        if (pending !== undefined) {

          work.resolutionHasher.update(mappingId, pending.resolution, pending.currentBlockId);
        } else if (row.resolution !== null && asNumber(row.replacing) === 0) {
          work.resolutionHasher.update(
            mappingId,
            asString(row.resolution) as ReimportPendingResolution['resolution'],
            row.resolved_current_block_id === null ? null : asString(row.resolved_current_block_id),
          );
        }
        work.completed = asNumber(row.position);
      }
      return { done: false, completed: work.completed, total: work.totalMappings, review: null };
    }
    requireStore(work.completed === work.totalMappings, 'REIMPORT_COMPARISON_INVALID',
      '对应行解决扫描未覆盖完整比较。');
    requireUncommittedImportDraft(host, work.draftId);
    const snapshot = host.loadDraftSnapshot(work.draftId);
    requireStore(snapshot.state === 'reviewed' && snapshot.reviewedRelationship === 'reimport' &&
      snapshot.version === work.expectedDraftVersion && snapshot.reviewDigest === work.snapshot.reviewDigest,
    'DRAFT_VERSION_CHANGED', '重新导入复核在对应行解决期间已变化。');
    const target = reconstructReviewedReimportTarget(host, snapshot);
    requireStore(target !== null && canonicalJson(target) === canonicalJson(work.target),
      'REVIEW_CHANGED', '重新导入目标在对应行解决期间已变化。');
    requireReimportPendingOpen(host, work.comparisonId, work.pending, work.groupId);
    // The verbs of every resolved row, this one included, in the rows' order.
    const verbs = host.authority.prepare(
      `SELECT g.group_id, r.verb FROM manuscript_reimport_groups g
       LEFT JOIN manuscript_reimport_group_resolutions r ON r.group_id = g.group_id
       WHERE g.comparison_id = ? ORDER BY g.ordinal`,
    ).all(work.comparisonId) as SqlRow[];
    for (const row of verbs) {
      const groupId = asString(row.group_id);
      if (groupId === work.groupId) work.resolutionHasher.group(groupId, work.verb);
      else if (row.verb !== null) work.resolutionHasher.group(groupId, asString(row.verb) as ReimportGroupVerb);
    }
    const comparison = one(host.authority.prepare(
      'SELECT comparison_digest FROM manuscript_reimport_comparisons WHERE comparison_id = ?',
    ).all(work.comparisonId) as SqlRow[], 'REIMPORT_COMPARISON_INVALID', '重新导入比较不存在。');
    // Whether each written identity changes the manuscript: a new or retired one always does; a carried one does
    // when the block it carries to differs from the one it came from in place, kind, level or words.
    const mappingRow = host.authority.prepare('SELECT * FROM manuscript_reimport_mappings WHERE mapping_id = ?');
    const claimedRow = host.authority.prepare(
      `SELECT mapping_id, current_position, current_kind, current_level, current_text, current_digest
       FROM manuscript_reimport_mappings WHERE comparison_id = ? AND change_kind = 'delete' AND current_block_id = ?`,
    );
    const writes: Array<{ resolution: ReimportPendingResolution; changed: number; claimedMappingId: string | null }> = [];
    for (const resolution of work.pending.values()) {
      const mapping = mappingRow.get(resolution.mappingId) as SqlRow | undefined;
      requireStore(mapping !== undefined, 'REIMPORT_MAPPING_INVALID', '对应行的映射已变化。');
      let claimed: SqlRow | undefined;
      if (resolution.resolution === 'preserve-current-identity' && asString(mapping.change_kind) === 'insert') {
        claimed = claimedRow.get(work.comparisonId, resolution.currentBlockId) as SqlRow | undefined;
        requireStore(claimed !== undefined, 'REIMPORT_MAPPING_INVALID', '要延续的当前结构身份不在这一行中。');
      }
      const identitySource = claimed ?? mapping;
      const changed = resolution.resolution !== 'preserve-current-identity'
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
      writes.push({ resolution, changed, claimedMappingId: claimed === undefined ? null : asString(claimed.mapping_id) });
    }
    const resolutionDigest = work.resolutionHasher.digest();
    const nextVersion = work.expectedDraftVersion + 1;
    const reviewDigest = createReimportReviewDigest(
      { ...snapshot, version: nextVersion }, target, asString(comparison.comparison_digest), resolutionDigest,
      degradationReview(host.reimportFidelity(snapshot).plan, work.degradationAccepted).state,
    );
    host.transaction(host.authority, () => {
      const resolvedAt = new Date().toISOString();
      // Only uncommitted comparison work is replaced; committed evidence is fenced above.
      host.authority.prepare(`DELETE FROM manuscript_reimport_mapping_resolutions WHERE mapping_id IN
        (SELECT mapping_id FROM manuscript_reimport_group_members WHERE group_id = ?)`).run(work.groupId);
      host.authority.prepare('DELETE FROM manuscript_reimport_group_resolutions WHERE group_id = ?').run(work.groupId);
      if (host.control.interruptReimportResolutionAfterDelete) throw new StoreError('REIMPORT_RESOLUTION_INTERRUPTED', '对应行修改已中断，请重新选择。');
      host.authority.prepare(`UPDATE manuscript_reimport_mappings SET resolved_changed = NULL WHERE mapping_id IN
        (SELECT mapping_id FROM manuscript_reimport_group_members WHERE group_id = ?)`).run(work.groupId);

      host.authority.prepare(
        'INSERT INTO manuscript_reimport_group_resolutions(group_id, comparison_id, verb, resolved_at) VALUES (?, ?, ?, ?)',
      ).run(work.groupId, work.comparisonId, work.verb, resolvedAt);
      const insert = host.authority.prepare(
        `INSERT INTO manuscript_reimport_mapping_resolutions(
           mapping_id, comparison_id, resolution, resolved_current_block_id, resolved_at
         ) VALUES (?, ?, ?, ?, ?)`,
      );
      const markChanged = host.authority.prepare(
        'UPDATE manuscript_reimport_mappings SET resolved_changed = ? WHERE mapping_id = ? AND resolved_changed IS NULL',
      );
      for (const write of writes) {
        requireStore(insert.run(write.resolution.mappingId, work.comparisonId, write.resolution.resolution,
          write.resolution.currentBlockId, resolvedAt).changes === 1, 'REIMPORT_MAPPING_INVALID', '结构身份解决无法持久化。');
        requireStore(markChanged.run(write.changed, write.resolution.mappingId).changes === 1,
          'REIMPORT_MAPPING_INVALID', '结构身份结果已变化。');
        if (write.claimedMappingId !== null) {
          requireStore(markChanged.run(0, write.claimedMappingId).changes === 1,
            'REIMPORT_MAPPING_INVALID', '当前结构身份候选已变化。');
        }
      }
      requireStore(host.authority.prepare(
        `UPDATE manuscript_reimport_comparisons
         SET unresolved_mappings = (SELECT count(*) FROM manuscript_reimport_mappings WHERE comparison_id = ? AND resolved_changed IS NULL),
             changed_mappings = (SELECT count(*) FROM manuscript_reimport_mappings WHERE comparison_id = ? AND resolved_changed = 1), resolution_digest = ?
         WHERE comparison_id = ?`,
      ).run(work.comparisonId, work.comparisonId, resolutionDigest, work.comparisonId).changes === 1,
      'REIMPORT_COMPARISON_INVALID', '重新导入比较聚合状态已变化。');
      requireStore(host.authority.prepare(
        `UPDATE import_drafts SET draft_version = ?, review_digest = ?, reviewed_at = ?
         WHERE draft_id = ? AND state = 'reviewed' AND reviewed_relationship = 'reimport' AND draft_version = ?`,
      ).run(nextVersion, reviewDigest, resolvedAt, work.draftId, work.expectedDraftVersion).changes === 1,
      'DRAFT_VERSION_CHANGED', '重新导入对应行解决期间复核已变化。');
      host.authority.prepare("DELETE FROM import_commit_attempts WHERE draft_id = ? AND state = 'prepared'").run(work.draftId);
    });
    host.reimportResolutionWork.delete(workId);
    const refreshed = host.loadDraftSnapshot(work.draftId);
    const refreshedTarget = reconstructReviewedReimportTarget(host, refreshed);
    requireStore(refreshedTarget !== null, 'REVIEW_CHANGED', '重新导入复核无法重建。');
    return {
      done: true,
      completed: work.totalMappings,
      total: work.totalMappings,
      review: {
        ...reimportReviewProjection(host, refreshed, refreshedTarget, null),
        row: getReimportMappingPage(host, work.draftId, refreshed.version,
          asNumber(one(host.authority.prepare('SELECT ordinal FROM manuscript_reimport_groups WHERE group_id = ?')
            .all(work.groupId) as SqlRow[], 'REIMPORT_MAPPING_INVALID', '对应行不存在。').ordinal) - 1).items[0]!,
        unresolvedGroups: reimportEvidence(host, work.draftId).unresolvedGroups,
      },
    };
  }

/**
   * The resolved rows of a comparison as the marks see them (Issue #412, S63): each row's blocks in the revision the
   * reimport replaced, and the blocks the commit put in its place, read from the commit's own rows.
   */
export function reimportMarkRows(host: ManuscriptReimportOperationsHost, comparisonId: string, commitWorkId: string): ReimportMarkRow[] {
    const current = host.authority.prepare(
      `SELECT m.current_block_id, m.current_position FROM manuscript_reimport_group_members gm
       JOIN manuscript_reimport_mappings m ON m.mapping_id = gm.mapping_id
       WHERE gm.group_id = ? AND gm.side = 'current' ORDER BY gm.member_order`,
    );
    const placed = host.authority.prepare(
      `SELECT cr.block_id FROM manuscript_reimport_group_members gm
       JOIN manuscript_reimport_mappings m ON m.mapping_id = gm.mapping_id
       JOIN temp.reimport_commit_rows cr ON cr.work_id = ? AND cr.position = m.staged_position
       WHERE gm.group_id = ? AND gm.side = 'staged' ORDER BY gm.member_order`,
    );
    return (host.authority.prepare(
      `SELECT g.group_id, g.ordinal, g.staged_count, r.verb FROM manuscript_reimport_groups g
       JOIN manuscript_reimport_group_resolutions r ON r.group_id = g.group_id
       WHERE g.comparison_id = ? ORDER BY g.ordinal`,
    ).all(comparisonId) as SqlRow[]).map((group) => {
      const groupId = asString(group.group_id);
      const newBlockIds = (placed.all(commitWorkId, groupId) as SqlRow[]).map((row) => asString(row.block_id));
      requireStore(newBlockIds.length === asNumber(group.staged_count), 'REIMPORT_COMPARISON_INVALID', '重新导入对应行的新段落不完整。');
      return {
        ordinal: asNumber(group.ordinal),
        verb: asString(group.verb) as ReimportGroupVerb,
        current: (current.all(groupId) as SqlRow[]).map((row) => ({ blockId: asString(row.current_block_id), position: asNumber(row.current_position) })),
        newBlockIds,
      };
    });
  }

/**
   * The chapter-level rows of one comparison (Issue #412, plan slice S63), from the mappings just recorded: runs of
   * changed blocks between exact ones, each with its members on either side, the heading it stands under, and the
   * set that marks the comparison as grouped. In the caller's transaction, before the preparation rows are dropped.
   */
export function persistReimportGroups(host: ManuscriptReimportOperationsHost, comparisonId: string, draftId: string, workId: string): void {
    const mappings = (host.authority.prepare(
      `SELECT mapping_id, change_kind, current_position, staged_position
       FROM temp.reimport_preparation_rows WHERE work_id = ? ORDER BY position`,
    ).all(workId) as SqlRow[]).map((row) => ({
      mappingId: asString(row.mapping_id),
      changeKind: asString(row.change_kind) as 'unchanged' | 'move' | 'edit' | 'insert' | 'delete',
      currentPosition: row.current_position === null ? null : asNumber(row.current_position),
      stagedPosition: row.staged_position === null ? null : asNumber(row.staged_position),
    }));
    const headings = (host.authority.prepare(
      `SELECT current_position, current_kind, current_level, current_text
       FROM temp.reimport_preparation_rows
       WHERE work_id = ? AND current_kind IN ('title', 'heading') ORDER BY current_position`,
    ).all(workId) as SqlRow[]).map((row) => ({
      position: asNumber(row.current_position),
      kind: asString(row.current_kind) as 'title' | 'heading',
      level: row.current_level === null ? null : asNumber(row.current_level),
      text: asString(row.current_text),
    }));
    const groups = groupReimportMappings(mappings, headings);
    const exact = mappings.filter((mapping) => mapping.changeKind === 'unchanged' || mapping.changeKind === 'move').length;
    host.authority.prepare(
      'INSERT INTO manuscript_reimport_group_sets(comparison_id, grouping, group_count, anchor_count) VALUES (?, ?, ?, ?)',
    ).run(comparisonId, REIMPORT_GROUPING, groups.length, exact);
    const insertGroup = host.authority.prepare(
      `INSERT INTO manuscript_reimport_groups(
         group_id, comparison_id, ordinal, current_count, staged_count, current_from, current_to, staged_from, staged_to, chapter_label
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const insertMember = host.authority.prepare(
      'INSERT INTO manuscript_reimport_group_members(group_id, mapping_id, side, member_order) VALUES (?, ?, ?, ?)',
    );
    for (const group of groups) {
      const groupId = host.stableUuid(`ai7.reimport-group/1\u0000${draftId}\u0000${group.ordinal}`);
      const chapter = group.chapterLabel === null ? null : Array.from(group.chapterLabel.replace(/\s+/gu, ' ').trim()).slice(0, 200).join('');
      insertGroup.run(groupId, comparisonId, group.ordinal, group.currentMembers.length, group.stagedMembers.length,
        group.currentFrom, group.currentTo, group.stagedFrom, group.stagedTo, chapter === '' ? null : chapter);
      group.currentMembers.forEach((mappingId, index) => insertMember.run(groupId, mappingId, 'current', index + 1));
      group.stagedMembers.forEach((mappingId, index) => insertMember.run(groupId, mappingId, 'staged', index + 1));
    }
  }

export function cancelReimportResolutionWork(host: ManuscriptReimportOperationsHost, workId: string): boolean {
    host.assertAvailable();
    requireStore(UUID_PATTERN.test(workId), 'JOB_INVALID', '结构身份解决任务标识无效。');
    return host.reimportResolutionWork.delete(workId);
  }

/** The accepted review is the ordinary accept step's review, including on restart/replay of the original request. */
function acceptedReimportSubmission(host: ManuscriptReimportOperationsHost,
  input: { draftId: string; expectedDraftVersion: number; reviewDigest: string; commitId: string; acceptDegradation?: boolean }, allowAccept = true) {
  const { acceptDegradation, ...commit } = input;
  if (acceptDegradation !== true) return commit;
  const row = host.authority.prepare(`SELECT c.*, d.*, b.stable_identity FROM manuscript_reimport_comparisons c
    JOIN import_drafts d ON d.draft_id = c.draft_id JOIN books b ON b.book_id = d.reviewed_existing_book_id
    WHERE c.draft_id = ?`).get(input.draftId) as SqlRow | undefined;
  if (row === undefined || asNumber(row.unresolved_mappings) > 0) return commit;
  if (asNumber(row.degradation_accepted) === 0) {
    if (!allowAccept || row.state === 'committed') return commit;
    const snapshot = host.loadDraftSnapshot(input.draftId);
    if (host.reimportFidelity(snapshot).plan.degradations.length === 0) return commit;
    requireStore(snapshot.version === input.expectedDraftVersion && snapshot.reviewDigest === input.reviewDigest,
      'DRAFT_VERSION_CHANGED', '重新导入复核已变化。');
    requireStore(!Array.from(host.reimportCommitWork.values()).some((work) => work.input.draftId === input.draftId),
      'SERVICE_BUSY', '这次导入正在提交，请等待完成或取消当前提交后再改选。');
    const accepted = acceptReimportDegradation(host, input.draftId, input.expectedDraftVersion);
    return { ...commit, expectedDraftVersion: accepted.draftVersion, reviewDigest: accepted.reviewDigest };
  }
  if (asNumber(row.draft_version) !== input.expectedDraftVersion + 1) return commit;
  // Committed Books have advanced, so reconstruct the submitted review from its frozen comparison facts.
  const target: Parameters<typeof createReimportReviewDigest>[1] = {
    bookId: asString(row.reviewed_existing_book_id), stableIdentity: asString(row.stable_identity),
    manuscriptId: asString(row.reviewed_manuscript_id), branchId: asString(row.reviewed_branch_id), bookStateDigest: asString(row.reviewed_book_state_digest),
    sourceVersionDisposition: row.reviewed_reuse_source_version_id === null ? 'created' : 'reused-same-book',
    reuseSourceVersionId: row.reviewed_reuse_source_version_id === null ? null : asString(row.reviewed_reuse_source_version_id),
    checkpoint: { bookId: asString(row.reviewed_existing_book_id), manuscriptId: asString(row.reviewed_manuscript_id), branchId: asString(row.reviewed_branch_id),
      revisionId: asString(row.checkpoint_revision_id), revisionLabel: asString(row.checkpoint_revision_label),
      revisionDigest: asString(row.checkpoint_revision_digest), journalSequence: asNumber(row.checkpoint_journal_sequence),
      createdForDirtyJournal: asNumber(row.checkpoint_created_for_dirty_journal) === 1 },
    lineage: row.lineage_status === 'verified'
      ? { status: 'verified', sourceVersionId: asString(row.lineage_source_version_id), revisionId: asString(row.lineage_revision_id), comparisonKind: 'three-way' }
      : { status: 'unconfirmed', sourceVersionId: null, revisionId: null, comparisonKind: 'two-way' },
  };
  const oldDigest = createReimportReviewDigest({ draftId: input.draftId, version: input.expectedDraftVersion,
    objectDigest: asString(row.object_digest), sourceDigest: asString(row.staged_source_digest),
    contentDigest: asString(row.staged_content_digest), structureDigest: asString(row.staged_structure_digest),
    parserIdentity: asString(row.staged_parser_identity) }, target,
    asString(row.comparison_digest), asString(row.resolution_digest), 'required-unselected');
  if (input.reviewDigest !== oldDigest) return commit;
  return { ...commit, expectedDraftVersion: asNumber(row.draft_version), reviewDigest: asString(row.review_digest) };
}

export function resolveAcknowledgedManuscriptReimportReplay(host: ManuscriptReimportOperationsHost, input: { draftId: string; expectedDraftVersion: number; reviewDigest: string; commitId: string; acceptDegradation?: boolean }): { draftId: string; commitId: string; bookId: string } {
    host.assertAvailable();
    requireStore(
      UUID_PATTERN.test(input.draftId) && UUID_PATTERN.test(input.commitId) &&
        Number.isSafeInteger(input.expectedDraftVersion) && input.expectedDraftVersion >= 1 &&
        DIGEST_PATTERN.test(input.reviewDigest),
      'COMMIT_REPLAY_INVALID',
      '已确认的稿件重新导入提交重放证据不匹配。',
    );
    input = acceptedReimportSubmission(host, input, false);
    const requestFingerprint = commitRequestFingerprint('manuscript-reimport', input);
    const attempt = host.loadCommitAttemptForDraft(input.draftId);
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
      host.authority.prepare(
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

export async function createManuscriptReimportCommitWork(host: ManuscriptReimportOperationsHost, input: { draftId: string; expectedDraftVersion: number; reviewDigest: string; commitId: string; acceptDegradation?: boolean }, options: {
      interruptAfterAttempt?: boolean;
      interruptAfterCommit?: boolean;
      legacyResultWithoutPresentation?: boolean;
    } = {}): Promise<{ workId: string | null; total: number; result: ManuscriptReimportCommitProjection | null }> {
    host.assertAvailable();
    requireStore(
      UUID_PATTERN.test(input.draftId) && UUID_PATTERN.test(input.commitId) && DIGEST_PATTERN.test(input.reviewDigest),
      'COMMIT_INVALID',
      '稿件重新导入提交参数无效。',
    );
    host.requireNoAbandonmentCleanupIntent(input.draftId);
    input = acceptedReimportSubmission(host, input);
    const requestFingerprint = commitRequestFingerprint('manuscript-reimport', input);
    const existingAttempt = host.loadCommitAttemptForDraft(input.draftId);
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
      if (existingAttempt.state === 'committed' && !host.verifiedCommitObjects.has(existingAttempt.attemptId)) {
        requireStore(!Array.from(host.reimportCommitWork.values()).some((work) => work.input.draftId === input.draftId),
          'SERVICE_BUSY', '该重新导入复核已有提交任务。');
        return createManuscriptReimportReplayWork(host, input, existingAttempt);
      }
      const reconciliation = await host.reconcileCommitAttempt(existingAttempt, { contentObjectAlreadyVerified: true });
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
    const snapshotBeforeAttempt = host.loadDraftSnapshot(input.draftId);
    requireStore(snapshotBeforeAttempt.state === 'reviewed' && snapshotBeforeAttempt.reviewedRelationship === 'reimport',
      'DRAFT_NOT_REVIEWED', '稿件重新导入草稿尚未完成复核。');
    requireStore(snapshotBeforeAttempt.version === input.expectedDraftVersion, 'DRAFT_VERSION_CHANGED', '导入草稿版本已变化。');
    requireStore(snapshotBeforeAttempt.reviewDigest === input.reviewDigest, 'REVIEW_CHANGED', '稿件重新导入复核摘要已变化。');
    requireStore(snapshotBeforeAttempt.parserIdentity === DOCX_PARSER_IDENTITY || snapshotBeforeAttempt.parserIdentity === DOCX_NOTE_PARSER_IDENTITY || snapshotBeforeAttempt.parserIdentity === DOCX_SPLIT_PARSER_IDENTITY,
      'REVIEW_CHANGED', '解析器状态已变化，请重新复核稿件重新导入。');
    const targetBeforeAttempt = reconstructReviewedReimportTarget(host, snapshotBeforeAttempt);
    requireStore(targetBeforeAttempt !== null, 'REVIEW_CHANGED', '稿件重新导入复核无法由当前权威状态重建。');
    requireStore(!Array.from(host.reimportCommitWork.values()).some((work) => work.input.draftId === input.draftId),
      'SERVICE_BUSY', '该重新导入复核已有提交任务。');
    const evidence = reimportEvidence(host, input.draftId);
    requireStore(evidence.unresolvedMappings === 0,
      'REIMPORT_MAPPING_UNRESOLVED', '仍有逐块映射未明确解决。');
    const acceptance = one(host.authority.prepare('SELECT degradation_accepted FROM manuscript_reimport_comparisons WHERE draft_id = ?')
      .all(input.draftId) as SqlRow[], 'REIMPORT_COMPARISON_INVALID', '重新导入比较不存在。');
    requireStore(host.reimportFidelity(snapshotBeforeAttempt).plan.degradations.length === 0 ||
      asNumber(acceptance.degradation_accepted) === 1,
      'DEGRADATION_ACCEPTANCE_REQUIRED', '部分格式无法保留，请先确认按所列方式导入，再提交。');
    const object = one(host.authority.prepare(
      'SELECT relative_key, byte_length FROM content_objects WHERE object_digest = ?',
    ).all(snapshotBeforeAttempt.objectDigest) as SqlRow[], 'SNAPSHOT_RESELECTION_REQUIRED', '暂存对象记录缺失。');
    requireStore(snapshotBeforeAttempt.objectDigest === snapshotBeforeAttempt.sourceDigest &&
      asNumber(object.byte_length) === snapshotBeforeAttempt.sourceBytes,
    'SNAPSHOT_RESELECTION_REQUIRED', '暂存对象身份记录不一致。');
    const objectPath = host.contentObjectPath(snapshotBeforeAttempt.objectDigest, asString(object.relative_key));
    const pathInfo = lstatSync(objectPath);
    requireStore(pathInfo.isFile() && !pathInfo.isSymbolicLink() && pathInfo.size === snapshotBeforeAttempt.sourceBytes,
      'SNAPSHOT_RESELECTION_REQUIRED', '暂存对象长度无效。');
    host.authority.exec(
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
      converted: null,
      parsedIngest: null,
      parseFailure: null,
      mappingPosition: 0,
      stagedBlocks: 0,
      stagedCharacters: 0,
      offsetSegments: [],
    };
    host.reimportCommitWork.set(workId, work);
    // A converted source was read through its working representation (ADR 0072 §2), and the kept original is not a Word
    // document: the commit re-reads the working representation, after reproducing the conversion from the original, as
    // revalidation does (Issue #597). Its parse progress still counts against the original's bytes.
    const parseSource = async (): Promise<IngestedDocx> => {
      const converted = snapshotBeforeAttempt.conversion === null
        ? null
        : await host.revalidateConversion(snapshotBeforeAttempt, objectPath);
      work.converted = converted;
      return host.parseIntoIngest(input.draftId, converted?.path ?? objectPath, snapshotBeforeAttempt.displayName, {
        ...(converted !== null ? { workingRepresentation: true } :
          host.authority.prepare('SELECT draft_id FROM staged_word_revision_intakes WHERE draft_id = ?').get(input.draftId) === undefined
            ? { historicalReader: true } : { reading: 'legacy' }),
        signal: abortController.signal,
        onArchiveProgress: (bytes) => {
          if (host.reimportCommitWork.get(workId) === work) {
            // The segment is sized by the original's bytes; a working representation's parse is scaled into it.
            const scaled = converted === null ? bytes : Math.round(bytes * snapshotBeforeAttempt.sourceBytes / converted.byteLength);
            work.parseBytes = Math.min(scaled, snapshotBeforeAttempt.sourceBytes);
          }
        },
      });
    };
    void parseSource().then((ingested) => {
      if (host.reimportCommitWork.get(workId) === work) work.parsedIngest = ingested;
      else host.discardIngest(ingested.ingestId);
    }).catch((error: unknown) => {
      if (host.reimportCommitWork.get(workId) === work) work.parseFailure = error;
    });
    return { workId, total: work.total, result: null };
  }

export function createManuscriptReimportReplayWork(host: ManuscriptReimportOperationsHost, input: { draftId: string; expectedDraftVersion: number; reviewDigest: string; commitId: string; acceptDegradation?: boolean }, attempt: CommitAttempt): { workId: string; total: number; result: null } {
    let openedFd: number | null = null;
    try {
      const stored = host.loadStoredCommitResult(attempt.attemptId);
      requireStore(stored.completionLabel === '稿件已重新导入' || stored.completionLabel === '未发现稿件变化',
        'IDEMPOTENCY_CONFLICT', '提交类型与稿件重新导入不一致。');
      const object = one(host.authority.prepare(
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
      const objectPath = host.contentObjectPath(expectedDigest, asString(object.relative_key));
      const info = lstatSync(objectPath);
      requireStore(info.isFile() && !info.isSymbolicLink() && info.size === total,
        'COMMIT_PROOF_INCONCLUSIVE', '重新导入重放来源对象长度无效。');
      const objectFd = openSync(objectPath, constants.O_RDONLY);
      openedFd = objectFd;
      const opened = fstatSync(objectFd);
      requireStore(opened.isFile() && opened.size === total,
        'COMMIT_PROOF_INCONCLUSIVE', '重新导入重放来源对象打开后身份无效。');
      const workId = randomUUID();
      host.reimportCommitWork.set(workId, {
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
      host.markCommitAttemptUncertain(attempt.attemptId);
      if (error instanceof StoreFatalError) throw error;
      throw new StoreError('IMPORT_COMMIT_OUTCOME_UNCERTAIN', '已提交重新导入的来源对象无法完成重放校验。');
    }
  }

export async function advanceManuscriptReimportCommitWork(host: ManuscriptReimportOperationsHost, workId: string): Promise<ReimportCommitProgress> {
    host.assertAvailable();
    requireStore(UUID_PATTERN.test(workId), 'JOB_INVALID', '稿件重新导入提交任务标识无效。');
    const work = host.reimportCommitWork.get(workId);
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
        const reconciliation = await host.reconcileCommitAttempt(work.attempt, { contentObjectAlreadyVerified: true });
        requireStore(reconciliation.state === 'committed' &&
          (reconciliation.result.completionLabel === '稿件已重新导入' ||
            reconciliation.result.completionLabel === '未发现稿件变化'),
        'IMPORT_COMMIT_OUTCOME_UNCERTAIN', '已提交重新导入无法由持久证据精确重放。');
        host.rememberVerifiedCommitObject(work.input.commitId);
        host.reimportCommitWork.delete(workId);
        return { done: true, completed: work.total, total: work.total, result: reconciliation.result };
      } catch (error) {
        if (work.objectFd !== null) closeSync(work.objectFd);
        work.objectFd = null;
        host.reimportCommitWork.delete(workId);
        host.markCommitAttemptUncertain(work.attempt.attemptId);
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
      const parsedSources = work.parsedIngest.sources;
      requireStore(parsedSources !== null, 'SNAPSHOT_RESELECTION_REQUIRED', '重新导入缺少实际历史读法的来源对应。');
      // A converted source is checked against its reproduced working representation, and its fidelity is the
      // conversion's, as revalidation checks it (Issue #597).
      const converted = work.snapshot.conversion === null ? null : work.converted;
      requireStore(
        parsed.sourceDigest === (converted?.digest ?? work.snapshot.sourceDigest) &&
          parsed.archiveBytes === (converted?.byteLength ?? work.snapshot.sourceBytes) &&
          parsed.parserIdentity === work.snapshot.parserIdentity &&
          parsed.contentDigest === work.snapshot.contentDigest &&
          parsed.structureDigest === work.snapshot.structureDigest &&
          parsed.blockCount === work.snapshot.blockCount &&
          parsed.characterCount === work.snapshot.characterCount &&
          canonicalJson(converted?.fidelity ?? parsed.fidelity) === canonicalJson(work.snapshot.fidelity) &&
          parsed.titleSuggestion.value === work.snapshot.titleSuggestion &&
          parsed.titleSuggestion.sourceLabel === work.snapshot.titleSource &&
          host.retentionCall(() => stagedImportSourcesMatch(host.authority, work.input.draftId, parsedSources)),
        'SNAPSHOT_RESELECTION_REQUIRED',
        '暂存来源身份或解析证据无法精确重建。',
      );
      work.parseBytes = work.snapshot.sourceBytes;
      work.phase = 'mappings';
      return { done: false, completed: work.parseBytes, total: work.total, result: null };
    }
    requireStore(work.parsedIngest !== null, 'SNAPSHOT_RESELECTION_REQUIRED', '暂存解析计划缺失。');
    const rows = host.authority.prepare(
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
        AND claimed.mapping_id <> m.mapping_id
       LEFT JOIN staged_import_blocks sib
         ON sib.draft_id = c.draft_id AND sib.staged_block_id = m.staged_block_id
       LEFT JOIN import_ingest_blocks iib
         ON iib.ingest_id = ? AND iib.draft_id = c.draft_id AND iib.staged_block_id = m.staged_block_id
       WHERE c.draft_id = ? AND m.position > ? ORDER BY m.position LIMIT ${REIMPORT_MAPPING_BATCH_SIZE}`,
    ).all(work.parsedIngest.ingestId, work.input.draftId, work.mappingPosition) as SqlRow[];
    if (rows.length > 0) {
      const insert = host.authority.prepare(
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
    host.discardIngest(work.parsedIngest.ingestId);
    work.parsedIngest = null;
    const currentSnapshot = host.loadDraftSnapshot(work.input.draftId);
    requireStore(currentSnapshot.state === 'reviewed' && currentSnapshot.reviewedRelationship === 'reimport' &&
      currentSnapshot.version === work.input.expectedDraftVersion &&
      currentSnapshot.reviewDigest === work.input.reviewDigest,
    'REVIEW_CHANGED', '稿件重新导入复核在提交计划期间已变化。');
    const currentTarget = reconstructReviewedReimportTarget(host, currentSnapshot);
    requireStore(currentTarget !== null && canonicalJson(currentTarget) === canonicalJson(work.target),
      'REVIEW_CHANGED', '稿件重新导入目标在提交计划期间已变化。');
    const currentEvidence = reimportEvidence(host, work.input.draftId);
    requireStore(currentEvidence.unresolvedMappings === 0 &&
      canonicalJson(currentEvidence) === canonicalJson(work.evidence),
    'REIMPORT_MAPPING_UNRESOLVED', '稿件重新导入证据在提交计划期间已变化。');
    if (!work.attemptExists) {
      host.transaction(host.authority, () => {
        host.authority.prepare(
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
    const result = finalizeManuscriptReimportCommit(host, work);
    host.rememberVerifiedCommitObject(work.input.commitId);
    host.reimportCommitWork.delete(workId);
    host.authority.prepare('DELETE FROM temp.reimport_commit_rows WHERE work_id = ?').run(workId);
    if (work.legacyResultWithoutPresentation) {
      host.rewriteCommittedResultWithoutPresentationForTest(work.input.commitId);
    }
    if (work.interruptAfterCommit || work.legacyResultWithoutPresentation) {
      throw new StoreFatalError(new Error('E2E interruption after committed manuscript reimport and before response.'));
    }
    return { done: true, completed: work.total, total: work.total, result };
  }

export function cancelManuscriptReimportCommitWork(host: ManuscriptReimportOperationsHost, workId: string): boolean {
    host.assertAvailable();
    requireStore(UUID_PATTERN.test(workId), 'JOB_INVALID', '稿件重新导入提交任务标识无效。');
    const work = host.reimportCommitWork.get(workId);
    if (work === undefined) return false;
    if (work.mode === 'committed-replay') {
      if (work.objectFd !== null) closeSync(work.objectFd);
      host.reimportCommitWork.delete(workId);
      return true;
    }
    work.abortController.abort();
    if (work.parsedIngest !== null) host.discardIngest(work.parsedIngest.ingestId);
    host.reimportCommitWork.delete(workId);
    host.authority.prepare('DELETE FROM temp.reimport_commit_rows WHERE work_id = ?').run(workId);
    return true;
  }

export function finalizeManuscriptReimportCommit(host: ManuscriptReimportOperationsHost, work: ReimportCommitWork): ManuscriptReimportCommitProjection {
    const input = work.input;
    const requestFingerprint = work.requestFingerprint;

    let result: ManuscriptReimportCommitProjection | undefined;
    let committedResult: Omit<ManuscriptReimportCommitProjection, 'receipt' | 'overview' | 'window'> | undefined;
    host.transaction(host.authority, () => {
      const existing = host.authority.prepare(
        'SELECT request_fingerprint, operation_kind FROM import_commits WHERE commit_id = ?',
      ).all(input.commitId) as SqlRow[];
      if (existing.length === 1) {
        requireStore(asString(existing[0]!.request_fingerprint) === requestFingerprint &&
          asString(existing[0]!.operation_kind) === 'manuscript-reimport',
        'IDEMPOTENCY_CONFLICT', '提交标识已用于另一项导入。');
        const stored = host.loadStoredCommitResult(input.commitId);
        requireStore(stored.completionLabel === '稿件已重新导入' || stored.completionLabel === '未发现稿件变化',
          'IDEMPOTENCY_CONFLICT', '提交类型与稿件重新导入不一致。');
        result = stored;
        return;
      }
      requireStore(existing.length === 0, 'STORE_CORRUPT', '提交标识记录不唯一。');

      const snapshot = host.loadDraftSnapshot(input.draftId);
      requireStore(snapshot.state === 'reviewed' && snapshot.version === input.expectedDraftVersion &&
        snapshot.reviewDigest === input.reviewDigest && snapshot.reviewedRelationship === 'reimport',
      'REVIEW_CHANGED', '稿件重新导入复核已变化。');
      const target = reconstructReviewedReimportTarget(host, snapshot);
      requireStore(target !== null && canonicalJson(target) === canonicalJson(work.target),
        'REVIEW_CHANGED', '稿件重新导入复核无法由当前权威状态重建。');
      const evidence = reimportEvidence(host, input.draftId);
      requireStore(evidence.unresolvedMappings === 0 && canonicalJson(evidence) === canonicalJson(work.evidence),
        'REIMPORT_MAPPING_UNRESOLVED', '重新导入比较证据在提交期间已变化。');
      const { fidelity: reimportFidelity, plan: fidelityPlan } = host.reimportFidelity(snapshot);
      const degradationAcceptance = one(host.authority.prepare(
        'SELECT degradation_accepted FROM manuscript_reimport_comparisons WHERE draft_id = ?',
      ).all(input.draftId) as SqlRow[], 'REIMPORT_COMPARISON_INVALID', '重新导入比较不存在。');
      requireStore(fidelityPlan.degradations.length === 0 || asNumber(degradationAcceptance.degradation_accepted) === 1,
        'DEGRADATION_ACCEPTANCE_REQUIRED', '部分格式无法保留，请先确认按所列方式导入，再提交。');

      const now = new Date().toISOString();
      const before = reimportAuthorityCounts(host, target.bookId);
      const sourceVersionId = target.sourceVersionDisposition === 'reused-same-book'
        ? target.reuseSourceVersionId!
        : randomUUID();
      const provenanceId = randomUUID();
      const reimportRecordId = randomUUID();
      const fidelityReviewId = randomUUID();
      const comparisonId = asString(one(host.authority.prepare(
        'SELECT comparison_id FROM manuscript_reimport_comparisons WHERE draft_id = ?',
      ).all(input.draftId) as SqlRow[], 'REIMPORT_COMPARISON_INVALID', '重新导入比较不存在。').comparison_id);
      // What each mark of a changed row came to (Issue #412, S63), recorded beside the record once it exists.
      let markOutcomes: ReimportMarkOutcome[] = [];
      const degradationDecisionId = fidelityPlan.degradations.length > 0 ? randomUUID() : null;
      if (target.sourceVersionDisposition === 'created') {
        host.authority.prepare(
          `INSERT INTO source_versions(
             source_version_id, book_id, object_digest, source_digest, content_digest, structure_digest,
             parser_identity, format, display_name, created_at, working_object_digest, converter_identity
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(sourceVersionId, target.bookId, snapshot.objectDigest, snapshot.sourceDigest,
          snapshot.contentDigest, snapshot.structureDigest, snapshot.parserIdentity, snapshot.sourceFormat,
          snapshot.displayName, now, snapshot.workingObjectDigest,
          snapshot.conversion?.converterIdentity ?? null);
      } else {
        const source = one(host.authority.prepare(
          `SELECT book_id, object_digest, source_digest, content_digest, structure_digest, parser_identity, format,
                  working_object_digest, converter_identity
           FROM source_versions WHERE source_version_id = ?`,
        ).all(sourceVersionId) as SqlRow[], 'SOURCE_VERSION_REUSE_INVALID', '明确选择的来源版本不存在。');
        requireStore(asString(source.book_id) === target.bookId && asString(source.object_digest) === snapshot.objectDigest &&
          asString(source.source_digest) === snapshot.sourceDigest && asString(source.content_digest) === snapshot.contentDigest &&
          asString(source.structure_digest) === snapshot.structureDigest && asString(source.parser_identity) === snapshot.parserIdentity &&
          asString(source.format) === snapshot.sourceFormat &&
          (source.working_object_digest ?? null) === snapshot.workingObjectDigest &&
          (source.converter_identity ?? null) === (snapshot.conversion?.converterIdentity ?? null),
        'SOURCE_VERSION_REUSE_INCOMPATIBLE', '明确选择的同图书来源版本与暂存快照不一致。');
      }
      host.authority.prepare(
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
        categories: reimportFidelity,
        outcome: fidelityPlan.outcome,
      }));
      host.authority.prepare(
        `INSERT INTO import_fidelity_reviews(
           fidelity_review_id, book_id, source_version_id, review_digest, outcome,
           round_trip_guaranteed, created_at
         ) VALUES (?, ?, ?, ?, ?, 0, ?)`,
      ).run(fidelityReviewId, target.bookId, sourceVersionId, fidelityReviewDigest, fidelityPlan.outcome, now);
      const insertFidelity = host.authority.prepare(
        `INSERT INTO import_fidelity_categories(
           fidelity_review_id, category_key, display_label, item_count, status, detail, position
         ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      );
      reimportFidelity.forEach((category, index) => insertFidelity.run(
        fidelityReviewId, category.key, category.label, category.count, category.status, category.detail, index + 1,
      ));
      // A reimport offers no text-box choice (ADR 0086 §2): the file's text boxes stay with it, and the
      // review records that it kept them.
      if (fidelityPlan.textBoxDisposition !== null) {
        requireStore(fidelityPlan.textBoxDisposition === 'retain', 'FIDELITY_OUTSIDE_TRACER', '重新导入只能保留文本框。');
        host.retentionCall(() => recordTextBoxChoice(host.authority, fidelityReviewId, 'retain', now));
      }
      if (degradationDecisionId !== null) {
        const decision = canonicalDegradationDecision(fidelityPlan);
        requireStore(decision !== null, 'FIDELITY_OUTSIDE_TRACER', '重新导入降级决定无法形成规范记录。');
        host.authority.prepare(
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
        const previous = one(host.authority.prepare(
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
        host.authority.prepare(
          `INSERT INTO manuscript_revisions(
             revision_id, manuscript_id, branch_id, ordinal, revision_label, parent_revision_id,
             source_version_id, revision_digest, created_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(resultingRevisionId, target.manuscriptId, target.branchId, ordinal, `r${ordinal}`,
          target.checkpoint.revisionId, sourceVersionId, revisionDigest, now);
        const createdIdentities = host.authority.prepare(
          `INSERT INTO manuscript_blocks(block_id, manuscript_id, created_revision_id)
           SELECT block_id, ?, ? FROM temp.reimport_commit_rows
           WHERE work_id = ? AND creates_identity = 1 ORDER BY position`,
        ).run(target.manuscriptId, resultingRevisionId, work.workId);
        requireStore(createdIdentities.changes === asNumber(one(host.authority.prepare(
          'SELECT count(*) total FROM temp.reimport_commit_rows WHERE work_id = ? AND creates_identity = 1',
        ).all(work.workId) as SqlRow[], 'REIMPORT_COMPARISON_INVALID', '无法核对新结构身份计划。').total),
        'REIMPORT_COMPARISON_INVALID', '新结构身份计划无法完整提交。');
        const insertedVersions = host.authority.prepare(
          `INSERT INTO manuscript_block_versions(
             revision_id, block_id, position, kind, level, text, digest, start_offset, grapheme_length
           )
           SELECT ?, block_id, position, kind, level, text, digest, start_offset, grapheme_length
           FROM temp.reimport_commit_rows WHERE work_id = ? ORDER BY position`,
        ).run(resultingRevisionId, work.workId);
        requireStore(insertedVersions.changes === snapshot.blockCount,
          'REIMPORT_COMPARISON_INVALID', '重新导入结果修订版块无法完整提交。');
        // ADR 0086 §3: every block of the resulting revision stands at its staged position, and the staged
        // sources name the paragraph of the reimported file it came from.
        const mappedSources = host.authority.prepare(
          `INSERT INTO manuscript_block_sources(
             revision_id, block_id, source_version_id, source_part, source_paragraph_index,
             box_ordinal, box_paragraph_ordinal, source_paragraph_digest, created_at
           ) SELECT ?, r.block_id, ?, 'body', s.source_paragraph_index, NULL, NULL, COALESCE(p.source_paragraph_digest, r.digest), ?
             FROM temp.reimport_commit_rows r
             JOIN staged_import_block_sources s ON s.draft_id = ? AND s.position = r.position
             LEFT JOIN staged_import_paragraph_pieces p ON p.draft_id = s.draft_id AND p.position = s.position
             WHERE r.work_id = ? ORDER BY r.position`,
        ).run(resultingRevisionId, sourceVersionId, now, input.draftId, work.workId);
        const notedSources = commitNoteSources(host.authority, { revisionId: resultingRevisionId, sourceVersionId, draftId: input.draftId, createdAt: now, reimportWorkId: work.workId });
        const splitPieces = host.authority.prepare(`INSERT INTO manuscript_import_lineage(
          revision_id, block_id, first_block_id, source_paragraph_index, piece_ordinal, piece_count, method)
          SELECT ?, r.block_id, first.block_id, p.source_paragraph_index, p.piece_ordinal,
            (SELECT count(*) FROM staged_import_paragraph_pieces n WHERE n.draft_id = p.draft_id AND n.source_paragraph_index = p.source_paragraph_index),
            CASE WHEN EXISTS(SELECT 1 FROM staged_import_paragraph_pieces n WHERE n.draft_id = p.draft_id
              AND n.source_paragraph_index = p.source_paragraph_index AND n.joint = 'bound') THEN 'blocks' ELSE 'soft-break' END
          FROM staged_import_paragraph_pieces p JOIN temp.reimport_commit_rows r ON r.work_id = ? AND r.position = p.position
          JOIN staged_import_paragraph_pieces head ON head.draft_id = p.draft_id AND head.source_paragraph_index = p.source_paragraph_index AND head.piece_ordinal = 1
          JOIN temp.reimport_commit_rows first ON first.work_id = r.work_id AND first.position = head.position
          WHERE p.draft_id = ?`).run(resultingRevisionId, work.workId, input.draftId);
        const splitHeads = asNumber((host.authority.prepare(`SELECT count(*) total FROM staged_import_paragraph_pieces WHERE draft_id = ? AND piece_ordinal = 1`)
          .get(input.draftId) as SqlRow).total);
        requireStore(Number(mappedSources.changes) + notedSources + Number(splitPieces.changes) - splitHeads === snapshot.blockCount,
          'REIMPORT_COMPARISON_INVALID', '重新导入结果修订版的来源段落对应无法完整提交。');
        host.authority.prepare(
          `UPDATE manuscript_command_groups SET status = 'superseded'
           WHERE branch_id = ? AND status IN ('applied', 'undone')`,
        ).run(target.branchId);
        host.authority.prepare('DELETE FROM manuscript_outline WHERE branch_id = ?').run(target.branchId);
        host.authority.prepare('DELETE FROM working_block_search WHERE branch_id = ?').run(target.branchId);
        host.authority.prepare('DELETE FROM working_offset_nodes WHERE branch_id = ?').run(target.branchId);
        // Which blocks the rewrite leaves as they were (Issue #533): a point in one stands where it stood.
        const blocksBefore = workingBlockDigests(host.authority, target.branchId);
        host.authority.prepare('DELETE FROM working_blocks WHERE branch_id = ?').run(target.branchId);
        const insertedWorking = host.authority.prepare(
          `INSERT INTO working_blocks(branch_id, block_id, position, kind, level, text, digest, grapheme_length)
           SELECT ?, block_id, position, kind, level, text, digest, grapheme_length
           FROM temp.reimport_commit_rows WHERE work_id = ? ORDER BY position`,
        ).run(target.branchId, work.workId);
        requireStore(insertedWorking.changes === snapshot.blockCount,
          'REIMPORT_COMPARISON_INVALID', '重新导入工作稿块无法完整提交。');
        const insertedOutline = host.authority.prepare(
          `INSERT INTO manuscript_outline(branch_id, block_id, position, kind, level, text, digest)
           SELECT ?, block_id, position, kind,
                  CASE WHEN kind = 'title' THEN 1 ELSE COALESCE(level, 1) END,
                  text, digest
           FROM temp.reimport_commit_rows
           WHERE work_id = ? AND kind IN ('title', 'heading') ORDER BY position`,
        ).run(target.branchId, work.workId);
        const plannedOutline = asNumber(one(host.authority.prepare(
          `SELECT count(*) total FROM temp.reimport_commit_rows
           WHERE work_id = ? AND kind IN ('title', 'heading')`,
        ).all(work.workId) as SqlRow[], 'REIMPORT_COMPARISON_INVALID', '无法核对重新导入大纲计划。').total);
        requireStore(insertedOutline.changes === plannedOutline,
          'REIMPORT_COMPARISON_INVALID', '重新导入大纲计划无法完整提交。');
        const insertedSearch = host.authority.prepare(
          `INSERT INTO working_block_search(branch_id, block_id, text)
           SELECT ?, block_id, text FROM temp.reimport_commit_rows
           WHERE work_id = ? ORDER BY position`,
        ).run(target.branchId, work.workId);
        requireStore(insertedSearch.changes === snapshot.blockCount,
          'REIMPORT_COMPARISON_INVALID', '重新导入搜索投影无法完整提交。');
        const insertedOffsets = host.authority.prepare(
          `INSERT INTO working_offset_nodes(branch_id, position, span_graphemes)
           SELECT ?, position, offset_span FROM temp.reimport_commit_rows
           WHERE work_id = ? ORDER BY position`,
        ).run(target.branchId, work.workId);
        requireStore(insertedOffsets.changes === snapshot.blockCount,
          'REIMPORT_COMPARISON_INVALID', '重新导入偏移投影无法完整提交。');
        const stateUpdate = host.authority.prepare(
          `UPDATE branch_working_state
           SET base_revision_id = ?, working_digest = ?, total_graphemes = ?, last_checkpoint_sequence = journal_sequence,
               history_boundary_sequence = history_sequence
           WHERE manuscript_id = ? AND branch_id = ? AND base_revision_id = ? AND working_digest = ?`,
        ).run(resultingRevisionId, revisionDigest, snapshot.characterCount, target.manuscriptId, target.branchId,
          target.checkpoint.revisionId, target.checkpoint.revisionDigest);
        requireStore(stateUpdate.changes === 1, 'REIMPORT_TARGET_CHANGED', '重新导入提交时主稿件已变化。');
        requireStore(host.authority.prepare(
          'UPDATE manuscript_branches SET base_revision_id = ? WHERE branch_id = ? AND base_revision_id = ?',
        ).run(resultingRevisionId, target.branchId, target.checkpoint.revisionId).changes === 1,
        'REIMPORT_TARGET_CHANGED', '重新导入提交时分支已变化。');
        // Issue #407: the working state was replaced whole. A mark whose block kept its identity is
        // resolved against the text that block holds now; one whose block was retired stays readable
        // as detached instead of pointing into a block that is no longer there.
        resolveBranchMarksAfterRewrite(host.authority, target.branchId, blocksBefore);
        // Issue #412 (S63): the marks of every changed row follow the new file to their words, or are set aside and
        // listed — never moved onto words they were not on.
        markOutcomes = followReimportedMarks(host.authority, target.branchId, reimportMarkRows(host, comparisonId, work.workId));
      }
      // Issue #412 (S63; MARK-009): the new file's comments and tracked changes become 批注 and 修改建议 by their author
      // on the manuscript in this same transaction — all of them, or no reimport — after the editor's own marks have
      // followed. One that already stands there as it is, exactly on its words — the file's comment still in the file — is
      // not made twice; one that drifted or was set aside no longer shows the file's comment, so the new file's makes it.
      // A point — a pending insertion — is never found by its words, so the rewrite leaves it drifted where it stood: the
      // file's insertion at that same place is that one, set exact again rather than made twice.
      // A 修改建议's words are only where it stands: what it proposes lives in its Proposal Change Item, so a tracked
      // change stands as it is only while it proposes the same words — an insertion as an insertion. One the author
      // rewrote is a new one, made beside the old, which stays the editor's to settle. Each standing mark is at most one
      // file mark: two changes alike at one place are two marks, each set again as itself.
      if (fidelityPlan.importedMarks > 0) {
        const placedAt = host.authority.prepare('SELECT block_id FROM temp.reimport_commit_rows WHERE work_id = ? AND position = ?');
        const standing = host.authority.prepare(
          `SELECT em.mark_id, em.anchor_state FROM editorial_marks em
           WHERE em.branch_id = ? AND em.block_id = ? AND em.source_kind = 'imported-author' AND em.source_label = ? AND em.kind = ?
             AND em.pinned_text = ? AND em.body = ? AND em.from_grapheme = ? AND em.to_grapheme = ?
             AND em.status IN ('open', 'resolved', 'applied')
             AND (em.anchor_state = 'exact' OR (em.anchor_state = 'drifted' AND em.pinned_text = ''))
             AND (em.kind <> 'change-suggestion' OR EXISTS (
               SELECT 1 FROM proposal_change_items i
               WHERE i.mark_id = em.mark_id AND i.proposed_text = ? AND (em.pinned_text <> '' OR i.change_type = 'insert')))
           ORDER BY em.rowid`,
        );
        const answered = new Set<string>();
        const followedAt = asNumber(one(
          host.authority.prepare('SELECT journal_sequence FROM branch_working_state WHERE branch_id = ?').all(target.branchId) as SqlRow[],
          'REIMPORT_TARGET_CHANGED', '重新导入提交时分支已变化。',
        ).journal_sequence);
        const repin = host.authority.prepare(
          "UPDATE editorial_marks SET anchor_state = 'exact', followed_journal_sequence = ? WHERE mark_id = ? AND anchor_state = 'drifted'",
        );
        let alreadyStanding = 0;
        const created = host.importedMarkCall(() => createImportedMarks(host.authority, host.editorialMarks, input.draftId, {
          manuscriptId: target.manuscriptId,
          branchId: target.branchId,
          blockIdOf: (position) => asString(one(placedAt.all(work.workId, position) as SqlRow[],
            'IMPORT_MARK_ANCHOR_FAILED', '文件中的批注或修订无法准确落在稿件文字上，本次重新导入没有提交。').block_id),
          alreadyStanding: (mark, blockId) => {
            const found = (standing.all(target.branchId, blockId, mark.authorLabel, mark.kind, mark.pinnedText, mark.body,
              mark.fromGrapheme, mark.toGrapheme, mark.proposedText ?? '') as SqlRow[])
              .find((row) => !answered.has(asString(row.mark_id)));
            if (found === undefined) return false;
            const markId = asString(found.mark_id);
            answered.add(markId);
            if (asString(found.anchor_state) === 'drifted') repin.run(followedAt, markId);
            alreadyStanding += 1;
            return true;
          },
        }));
        requireStore(created + alreadyStanding === fidelityPlan.importedMarks, 'IMPORT_POSTCONDITION_FAILED',
          '重新导入的批注与修改建议与保真审阅的数量不一致。');
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
      host.authority.prepare(
        `INSERT INTO manuscript_reimport_records(
           reimport_record_id, comparison_id, commit_id, book_id, manuscript_id, branch_id, source_version_id,
           provenance_id, previous_revision_id, resulting_revision_id, result_kind, result_label,
           lineage_status, lineage_source_version_id, comparison_kind, comparison_digest,
           resolution_digest, fidelity_review_id, degradation_decision_id, record_digest, imported_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(reimportRecordId, comparisonId,
        input.commitId, target.bookId, target.manuscriptId, target.branchId,
        sourceVersionId, provenanceId, target.checkpoint.revisionId, resultingRevisionId, resultKind,
        completionLabel, target.lineage.status, target.lineage.sourceVersionId, target.lineage.comparisonKind,
        evidence.comparisonDigest, evidence.resolutionDigest, fidelityReviewId, degradationDecisionId, recordDigest, now);
      const insertOutcome = host.authority.prepare(
        `INSERT INTO manuscript_reimport_mark_outcomes(
           reimport_record_id, mark_id, group_ordinal, outcome, kind, words, from_position, to_block_id, recorded_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      for (const outcome of markOutcomes) {
        insertOutcome.run(reimportRecordId, outcome.markId, outcome.ordinal, outcome.outcome, outcome.kind, outcome.words,
          outcome.fromPosition, outcome.toBlockId, now);
      }

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
        source: host.stagedProjection(snapshot).source,
      };
      host.authority.prepare(
        `INSERT INTO import_commits(
           commit_id, draft_id, request_fingerprint, expected_draft_version, review_digest,
           operation_kind, result_json, committed_at
         ) VALUES (?, ?, ?, ?, ?, 'manuscript-reimport', ?, ?)`,
      ).run(input.commitId, input.draftId, requestFingerprint, input.expectedDraftVersion,
        input.reviewDigest, canonicalJson(committedResult), now);
      requireStore(host.authority.prepare(
        `UPDATE import_drafts SET state = 'committed', committed_commit_id = ?, committed_at = ?
         WHERE draft_id = ? AND state = 'reviewed' AND draft_version = ? AND review_digest = ?`,
      ).run(input.commitId, now, input.draftId, input.expectedDraftVersion, input.reviewDigest).changes === 1,
      'DRAFT_VERSION_CHANGED', '重新导入草稿在提交时已变化。');
      requireStore(host.authority.prepare(
        `UPDATE import_commit_attempts
         SET state = 'committed', committed_at = ?, uncertain_at = NULL, uncertainty_code = NULL
         WHERE attempt_id = ? AND draft_id = ? AND state = 'prepared'
           AND operation_kind = 'manuscript-reimport' AND request_fingerprint = ?
           AND expected_draft_version = ? AND review_digest = ?`,
      ).run(now, input.commitId, input.draftId, requestFingerprint,
        input.expectedDraftVersion, input.reviewDigest).changes === 1,
      'COMMIT_ATTEMPT_CHANGED', '稿件重新导入持久提交尝试状态已变化。');
      const after = reimportAuthorityCounts(host, target.bookId);
      requireStore(
        after.manuscripts === before.manuscripts &&
          after.revisions === before.revisions + (evidence.changed ? 1 : 0) &&
          after.sourceVersions === before.sourceVersions + (target.sourceVersionDisposition === 'created' ? 1 : 0) &&
          after.provenance === before.provenance + 1 && after.reimports === before.reimports + 1,
        'IMPORT_POSTCONDITION_FAILED',
        '稿件重新导入的原子记录图或无变化边界不成立。',
      );
      host.authority.prepare('DELETE FROM staged_import_snapshots WHERE draft_id = ?').run(input.draftId);
    });
    if (result !== undefined) return result;
    requireStore(committedResult !== undefined, 'COMMIT_FAILED', '稿件重新导入提交未产生结果。');
    forgetBookFindings(host.authority, committedResult.bookId);
    const reimportReceipt = host.reimportRecordPresentations(committedResult.bookId, [committedResult.reimportRecordId])
      .find((record) => record.kind === 'manuscript-reimport-record');
    requireStore(reimportReceipt?.kind === 'manuscript-reimport-record',
      'IMPORT_POSTCONDITION_FAILED', '稿件重新导入完成凭据不完整。');
    const overview = host.getBookOverview(committedResult.bookId);
    return {
      ...committedResult,
      receipt: reimportReceipt,
      overview,
      window: reimportLandingWindow(host, overview, committedResult.manuscriptId, committedResult.branchId),
    };
  }

export function reimportLandingWindow(host: ManuscriptReimportOperationsHost, overview: BookWorkOverviewProjection, manuscriptId: string, branchId: string): ManuscriptWindowProjection {
    const entry = overview.manuscriptAnchor?.entry ?? null;
    return host.getManuscriptWindowAt(manuscriptId, branchId,
      entry === null ? { kind: 'start' } : { kind: 'block', blockId: entry.blockId });
  }

export function reimportAuthorityCounts(host: ManuscriptReimportOperationsHost, bookId: string): {
    manuscripts: number;
    revisions: number;
    sourceVersions: number;
    provenance: number;
    reimports: number;
  } {
    const row = one(host.authority.prepare(
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

export function sourceImportAuthorityCounts(host: ManuscriptReimportOperationsHost, bookId: string): {
    manuscripts: number;
    revisions: number;
    workflows: number;
    fidelityReviews: number;
    manuscriptImports: number;
    sourceVersions: number;
    provenance: number;
    sourceImports: number;
  } {
    const row = one(host.authority.prepare(
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

export function reimportManuscriptBinding(host: ManuscriptReimportOperationsHost, bookId: string): { manuscriptId: string; branchId: string } {
    requireStore(UUID_PATTERN.test(bookId), 'TARGET_CHOICE_INVALID', '稿件重新导入目标无效。');
    const rows = host.authority.prepare(
      `SELECT m.manuscript_id, mb.branch_id
       FROM manuscripts m
       JOIN manuscript_branches mb ON mb.manuscript_id = m.manuscript_id
       WHERE m.book_id = ? AND m.role = 'primary'
       ORDER BY m.manuscript_id, mb.branch_id`,
    ).all(bookId) as SqlRow[];
    requireStore(rows.length === 1, 'REIMPORT_TARGET_INVALID', '所选图书必须有且仅有一份主稿件及其现行分支。');
    return { manuscriptId: asString(rows[0]!.manuscript_id), branchId: asString(rows[0]!.branch_id) };
  }

export function populatedBookReimportTarget(host: ManuscriptReimportOperationsHost, bookId: string, sourceDigest: string, checkpoint: ReimportCheckpointBinding, preparedCheckpoint = false): Omit<ResolvedReimportTarget, 'sourceVersionDisposition' | 'reuseSourceVersionId' | 'lineage'> & {
    exactSourceVersionId: string | null;
  } {
    const overview = host.getBookOverview(bookId);
    requireStore(overview.manuscriptState.state === 'populated', 'REIMPORT_TARGET_INVALID', '所选图书尚无可重新导入的主稿件。');
    const binding = reimportManuscriptBinding(host, bookId);
    requireStore(
      binding.manuscriptId === checkpoint.manuscriptId && binding.branchId === checkpoint.branchId &&
        checkpoint.bookId === bookId,
      'REIMPORT_TARGET_CHANGED',
      '所选图书的主稿件或分支已变化。',
    );
    const current = one(host.authority.prepare(
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
    const matches = host.authority.prepare(
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
      label: host.exactBookChoiceLabel(overview.book.title, bookId, overview.book.internalNumber),
      manuscriptId: binding.manuscriptId,
      branchId: binding.branchId,
      bookStateDigest,
      checkpoint,
      exactSourceVersionId: matches.length === 0 ? null : asString(matches[0]!.source_version_id),
    };
  }

export function requireSameParser(host: ManuscriptReimportOperationsHost, sourceVersionId: string, snapshot: DraftSnapshot): void {
    const row = one(
      host.authority.prepare('SELECT parser_identity FROM source_versions WHERE source_version_id = ?').all(sourceVersionId) as SqlRow[],
      'SOURCE_VERSION_REUSE_INVALID',
      '明确选择的来源版本不存在。',
    );
    requireStore(host.nullableString(row.parser_identity) === snapshot.parserIdentity, 'SOURCE_VERSION_PARSER_CHANGED', host.SOURCE_VERSION_PARSER_CHANGED_MESSAGE);
  }

export function resolveReimportTarget(host: ManuscriptReimportOperationsHost, selection: ManuscriptReimportTargetSelection, snapshot: DraftSnapshot, checkpoint: ReimportCheckpointBinding, identityFindings: ReadonlyArray<ImportIdentityFindingProjection>, preparedCheckpoint = false): ResolvedReimportTarget {
    requireStore(
      selection.kind === 'existing-book' && UUID_PATTERN.test(selection.bookId) && selection.relationship === 'reimport' &&
        (selection.reuseSourceVersionId === null || UUID_PATTERN.test(selection.reuseSourceVersionId)),
      'TARGET_CHOICE_INVALID',
      '稿件重新导入目标、关系或来源版本选择无效。',
    );
    const current = populatedBookReimportTarget(host,
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
      requireSameParser(host, current.exactSourceVersionId, snapshot);
    }
    let lineage: ResolvedReimportTarget['lineage'];
    if (selection.lineage.kind === 'unconfirmed') {
      lineage = { status: 'unconfirmed', sourceVersionId: null, revisionId: null, comparisonKind: 'two-way' };
    } else {
      const lineageSourceVersionId = selection.lineage.sourceVersionId;
      requireStore(UUID_PATTERN.test(lineageSourceVersionId), 'REIMPORT_LINEAGE_INVALID', '来源关系选择无效。');
      const revisionId = verifiedReimportLineageRevision(host,
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

export function verifiedReimportLineageRevision(host: ManuscriptReimportOperationsHost, bookId: string, manuscriptId: string, sourceVersionId: string): string | null {
    const revision = host.authority.prepare(
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

export function reimportBlockFact(host: ManuscriptReimportOperationsHost, row: SqlRow, prefix: 'current' | 'lineage' | 'staged'): ReimportBlockFact | null {
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

export function* reimportMappingBatches(host: ManuscriptReimportOperationsHost, workId: string, draftId: string, target: ResolvedReimportTarget, checkpointWorkId: string | null = null): Generator<ReimportMappingBatch> {
    const checkpointTable = checkpointWorkId === null
      ? 'manuscript_block_versions'
      : 'temp.manuscript_checkpoint_rows';
    const checkpointScopeColumn = checkpointWorkId === null ? 'revision_id' : 'work_id';
    const checkpointScopeId = checkpointWorkId ?? target.checkpoint.revisionId;
    const stagedCount = asNumber(one(host.authority.prepare(
      'SELECT block_count FROM staged_import_snapshots WHERE draft_id = ?',
    ).all(draftId) as SqlRow[], 'REIMPORT_COMPARISON_INVALID', '无法核对暂存块数量。').block_count);
    let after = 0;
    for (;;) {
      const rows = host.authority.prepare(
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
        const current = reimportBlockFact(host, row, 'current');
        const staged = reimportBlockFact(host, row, 'staged')!;
        const lineage = reimportBlockFact(host, row, 'lineage');
        const position = staged.position;
        const exactCurrentId = row.exact_current_block_id === null ? null : asString(row.exact_current_block_id);
        const exactLineageId = row.exact_lineage_block_id === null ? null : asString(row.exact_lineage_block_id);
        const autoPreserve = exactCurrentId !== null &&
          (exactLineageId === null || exactLineageId === exactCurrentId);
        batch.push({
          mappingId: host.stableUuid(`ai7.reimport-mapping/2\u0000${draftId}\u0000${position}`),
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
      const rows = host.authority.prepare(
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
        const current = reimportBlockFact(host, row, 'current')!;
        after = current.position;
        if (asNumber(row.matched) === 1) continue;
        const position = stagedCount + (++deleted);
        batch.push({
          mappingId: host.stableUuid(`ai7.reimport-mapping/2\u0000${draftId}\u0000${position}`),
          position,
          changeKind: 'delete',
          current,
          lineage: reimportBlockFact(host, row, 'lineage'),
          staged: null,
          identityConsequence: null,
        });
      }
      yield { mappings: batch, scanned: rows.length };
    }
  }

export function reimportEvidence(host: ManuscriptReimportOperationsHost, draftId: string): {
    comparisonDigest: string;
    resolutionDigest: string;
    totalMappings: number;
    unresolvedMappings: number;
    changed: boolean;
    groups: number;
    unresolvedGroups: number;
    exactBlocks: number;
  } {
    const comparison = one(host.authority.prepare(
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
      ...reimportGroupCounts(host, draftId),
    };
  }

/** The chapter-level rows of a comparison: how many, how many are unresolved, and how many blocks matched exactly. */
export function reimportGroupCounts(host: ManuscriptReimportOperationsHost, draftId: string): { groups: number; unresolvedGroups: number; exactBlocks: number } {
    const counts = one(host.authority.prepare(
      `SELECT gs.group_count, gs.anchor_count,
              (SELECT count(*) FROM manuscript_reimport_groups g
               LEFT JOIN manuscript_reimport_group_resolutions r ON r.group_id = g.group_id
               WHERE g.comparison_id = c.comparison_id AND r.group_id IS NULL) unresolved
       FROM manuscript_reimport_comparisons c
       JOIN manuscript_reimport_group_sets gs ON gs.comparison_id = c.comparison_id
       WHERE c.draft_id = ?`,
    ).all(draftId) as SqlRow[], 'REIMPORT_COMPARISON_INVALID', '重新导入比较没有章节对应。');
    return { groups: asNumber(counts.group_count), unresolvedGroups: asNumber(counts.unresolved), exactBlocks: asNumber(counts.anchor_count) };
  }

export function reconstructReviewedReimportTarget(host: ManuscriptReimportOperationsHost, snapshot: DraftSnapshot): ResolvedReimportTarget | null {
    if (snapshot.reviewDigest === null || snapshot.reviewedRelationship !== 'reimport' ||
      snapshot.reviewedExistingBookId === null || snapshot.reviewedBookStateDigest === null ||
      snapshot.reviewedLineageStatus === null || snapshot.reviewedCheckpointRevisionId === null ||
      snapshot.reviewedManuscriptId === null || snapshot.reviewedBranchId === null) return null;
    try {
      const comparison = one(host.authority.prepare(
        `SELECT lineage_status, lineage_source_version_id, lineage_revision_id, lineage_revision_digest,
                comparison_kind, checkpoint_revision_digest, checkpoint_created_for_dirty_journal,
                staged_source_digest, staged_content_digest, staged_structure_digest,
                staged_parser_identity, staged_block_count, degradation_accepted
         FROM manuscript_reimport_comparisons WHERE draft_id = ?`,
      ).all(snapshot.draftId) as SqlRow[], 'REIMPORT_COMPARISON_INVALID', '重新导入比较不存在。');
      const revision = one(host.authority.prepare(
        `SELECT revision_label, revision_digest
         FROM manuscript_revisions WHERE revision_id = ? AND manuscript_id = ? AND branch_id = ?`,
      ).all(
        snapshot.reviewedCheckpointRevisionId,
        snapshot.reviewedManuscriptId,
        snapshot.reviewedBranchId,
      ) as SqlRow[], 'REIMPORT_CHECKPOINT_INVALID', '重新导入安全固定点不存在。');
      const state = one(host.authority.prepare(
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
      const current = populatedBookReimportTarget(host, snapshot.reviewedExistingBookId, snapshot.sourceDigest, checkpoint);
      if (current.bookStateDigest !== snapshot.reviewedBookStateDigest ||
        current.manuscriptId !== snapshot.reviewedManuscriptId || current.branchId !== snapshot.reviewedBranchId ||
        current.exactSourceVersionId !== snapshot.reviewedReuseSourceVersionId) return null;
      // The Source Version it reuses must have been read the way this draft is (Issue #532). A review made before an update
      // that changed the parser is caught earlier, by `#revalidateSnapshot`'s parser drift; this catches a review an earlier
      // build prepared under this same parser over a Source Version an earlier parser read. It does not come back ready, and
      // preparing it again says why.
      if (current.exactSourceVersionId !== null) requireSameParser(host, current.exactSourceVersionId, snapshot);
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
        if (verifiedReimportLineageRevision(host,
          snapshot.reviewedExistingBookId,
          snapshot.reviewedManuscriptId,
          lineage.sourceVersionId,
        ) !== lineage.revisionId) return null;
        const lineageRevision = host.authority.prepare(
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
      const evidence = reimportEvidence(host, snapshot.draftId);
      return createReimportReviewDigest(
        snapshot,
        target,
        evidence.comparisonDigest,
        evidence.resolutionDigest,
        degradationReview(
          host.reimportFidelity(snapshot).plan,
          asNumber(comparison.degradation_accepted) === 1,
        ).state,
      ) === snapshot.reviewDigest
        ? target
        : null;
    } catch {
      return null;
    }
  }

export function reimportReviewProjection(host: ManuscriptReimportOperationsHost, snapshot: DraftSnapshot, target: ResolvedReimportTarget, commitAttemptId: string | null): ReviewBeforeManuscriptReimportProjection {
    const evidence = reimportEvidence(host, snapshot.draftId);
    const comparison = one(host.authority.prepare(
      'SELECT degradation_accepted FROM manuscript_reimport_comparisons WHERE draft_id = ?',
    ).all(snapshot.draftId) as SqlRow[], 'REIMPORT_COMPARISON_INVALID', '重新导入比较不存在。');
    const { fidelity, plan } = host.reimportFidelity(snapshot);
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
      source: host.stagedProjection(snapshot).source,
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
        groups: evidence.groups,
        unresolvedGroups: evidence.unresolvedGroups,
        exactBlocks: evidence.exactBlocks,
      },
      fidelity,
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

export interface ReimportPreparationProgress {
  done: boolean;
  completed: number;
  total: number;
  review: ReviewBeforeManuscriptReimportProjection | null;
}
export interface ReimportResolutionProgress {
  done: boolean;
  completed: number;
  total: number;
  review: ReimportResolutionProjection | null;
}
export interface ReimportCommitProgress {
  done: boolean;
  completed: number;
  total: number;
  result: ManuscriptReimportCommitProjection | null;
}