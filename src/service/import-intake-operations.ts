import { randomUUID } from 'node:crypto';
import { realpath } from 'node:fs/promises';
import { basename, isAbsolute } from 'node:path';
import { DatabaseSync, type SQLOutputValue } from 'node:sqlite';
import {
  type BookHistoryCursor,
  type BookRecordPresentation,
  type BookWorkOverviewProjection,
  type ContinueImportProjection,
  type FidelityCategoryProjection,
  type ImportCommitProjection,
  type ImportDraftRecoveryProjection,
  type ImportIdentityFindingProjection,
  type ImportStartupProjection,
  type ImportStructureChoice,
  type ImportTargetSelection,
  type ManuscriptConversionProjection,
  type ManuscriptImportCommitProjection,
  type ManuscriptWindowProjection,
  type OriginalFileAccessProjection,
  type ReviewBeforeImportProjection,
  type ReviewBeforeManuscriptReimportProjection,
  type ReviewBeforeSourceImportProjection,
  type SourceFormat,
  type SourceImportCommitProjection,
  type SourceImportTargetSelection,
  type StagedImportProjection
} from '../shared/protocol.js';
import type { BoundedManuscriptStore } from './bounded-manuscript.js';
import {
  WORD_DOCX_PARSER_IDENTITY,
  type ImportFidelityPlan,
  type ParsedDocx,
  type ParsedDocxBlock,
  type ParsedWordDocx,
  type TextBoxDisposition,
  type WordTrackedCompilation
} from './docx.js';
import type { EditorialMarkStore } from './editorial-marks.js';
import {
  recordTextBoxChoice,
  recordWordPreparedIntake,
  requireWordParentSourcePin,
  stagedTextBoxParagraphs,
  type StagedImportSources,
  type WordReadingKind,
  type WordTrackedChoiceInput
} from './import-retention.js';
import * as importReviewOperations from './import-review-records.js';
import { SOURCE_IMPORT_NON_EFFECTS, SOURCE_IMPORT_RECORD_SCHEMA, canonicalDegradationDecision, commitRequestFingerprint, continuationNotice, createImportReviewDigestV6, createLegacyNewBookReviewDigestV2, createSourceImportReviewDigest, draftSourceProjection, immutableCommitResult, isNotAWordprocessingPackage, readConversionColumns, requireSourceFormat, safeDisplayName, sourceImportRetainedBoundary, type AbandonmentCleanupIntent, type CommitAttempt, type DraftSnapshot, type ImmutableManuscriptImportResult, type IngestedDocx, type ResolvedImportTarget, type ResolvedReimportTarget, type ResolvedSourceImportTarget, type ReviewedFidelity, type StoredImportCommitProjection, type WordIntakePlan } from './import-review-records.js';
import {
  createImportedMarks
} from './imported-marks.js';
import {
  editableImport
} from './manuscript-format.js';
import {
  recordStructureChoice,
  reviewStructureChoice,
  stagedHasPieces
} from './manuscript/import-structure.js';
import { insertMergedImportBlocks } from './manuscript/merged-import-blocks.js';
import {
  commitNoteSources
} from './manuscript/note-blocks.js';
import { type BuiltInWorkflowProfile } from './native-workflow-profile.js';
import {
  one,
  parseStoredJson,
  type StoreControl
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

/** Writes r1 inside the caller's existing transaction; the continuation preserves intervening workflow/receipt writes. */
export function writeImportedManuscriptRows<T>(db: DatabaseSync, args: {
  input: { draftId: string }; bookId: string; manuscriptId: string; branchId: string; revisionId: string;
  sourceVersionId: string; revisionDigest: string; workingDigest: string; now: string;
  shaped: boolean; word: Pick<WordIntakePlan, 'compiled'> | undefined; snapshot: { blockCount: number }; blockCount: number; unmappedBlocks: number;
  characterCount: number; merged: Parameters<typeof insertMergedImportBlocks>[2] | null;
  structure: Parameters<typeof insertMergedImportBlocks>[3];
}, betweenSourcesAndWorkingState: () => T, initializeImportedBranch: (branchId: string) => number): {
  blockCount: number; unmappedBlocks: number; between: T;
} {
  const { input, bookId, manuscriptId, branchId, revisionId, sourceVersionId, revisionDigest, workingDigest,
    now, shaped, word, snapshot, characterCount, merged, structure } = args;
  let { blockCount, unmappedBlocks } = args;
      db.prepare("INSERT INTO manuscripts(manuscript_id, book_id, role, created_at) VALUES (?, ?, 'primary', ?)").run(manuscriptId, bookId, now);
      db.prepare('INSERT INTO manuscript_branches(branch_id, manuscript_id, name, created_at) VALUES (?, ?, ?, ?)').run(branchId, manuscriptId, '主分支', now);
      db
        .prepare(
          `INSERT INTO manuscript_revisions(
             revision_id, manuscript_id, branch_id, ordinal, revision_label, parent_revision_id,
             source_version_id, revision_digest, created_at
           ) VALUES (?, ?, ?, 1, 'r1', NULL, ?, ?, ?)`,
        )
        .run(revisionId, manuscriptId, branchId, sourceVersionId, revisionDigest, now);
      db.prepare('UPDATE manuscript_branches SET base_revision_id = ? WHERE branch_id = ?').run(revisionId, branchId);
      if (!shaped) {
        db.prepare(
          `INSERT INTO manuscript_blocks(block_id, manuscript_id, created_revision_id)
           SELECT staged_block_id, ?, ? FROM staged_import_blocks WHERE draft_id = ? ORDER BY position`,
        ).run(manuscriptId, revisionId, input.draftId);
        db.prepare(
          `INSERT INTO manuscript_block_versions(
             revision_id, block_id, position, kind, level, text, digest, start_offset, grapheme_length
           ) SELECT ?, staged_block_id, position, kind, level, text, digest, start_offset, grapheme_length
             FROM staged_import_blocks WHERE draft_id = ? ORDER BY position`,
        ).run(revisionId, input.draftId);
        db.prepare(
          `INSERT INTO working_blocks(
             branch_id, block_id, position, kind, level, text, digest, grapheme_length
           ) SELECT ?, staged_block_id, position, kind, level, text, digest, grapheme_length
             FROM staged_import_blocks WHERE draft_id = ? ORDER BY position`,
        ).run(branchId, input.draftId);
        // ADR 0086 §3: every block of r1 is its staged body paragraph, which the staged sources name.
        const mapped = word === undefined ? db.prepare(
          `INSERT INTO manuscript_block_sources(
             revision_id, block_id, source_version_id, source_part, source_paragraph_index,
             box_ordinal, box_paragraph_ordinal, source_paragraph_digest, created_at
           ) SELECT ?, b.staged_block_id, ?, 'body', s.source_paragraph_index, NULL, NULL, b.digest, ?
             FROM staged_import_blocks b
             JOIN staged_import_block_sources s ON s.draft_id = b.draft_id AND s.position = b.position
             WHERE b.draft_id = ? ORDER BY b.position`,
        ).run(revisionId, sourceVersionId, now, input.draftId) : null;
        const noted = commitNoteSources(db, { revisionId, sourceVersionId, draftId: input.draftId, createdAt: now });
        requireStore(mapped === null || Number(mapped.changes) + noted === snapshot.blockCount, 'IMPORT_POSTCONDITION_FAILED', '稿件内容块的来源段落对应不完整。');
      } else {
        ({ blockCount, unmapped: unmappedBlocks } = insertMergedImportBlocks(db,
          { draftId: input.draftId, manuscriptId, revisionId, branchId, sourceVersionId, now }, merged ?? [], structure));
      }
  const between = betweenSourcesAndWorkingState();
      db
        .prepare(
          `INSERT INTO branch_working_state(
             branch_id, manuscript_id, base_revision_id, journal_sequence, working_digest,
             total_graphemes, history_sequence, last_checkpoint_sequence
           ) VALUES (?, ?, ?, 0, ?, ?, 0, 0)`,
        )
        .run(branchId, manuscriptId, revisionId, workingDigest, characterCount);
      requireStore(
        initializeImportedBranch(branchId) === characterCount,
        'IMPORT_POSTCONDITION_FAILED',
        '稿件索引无法由暂存快照精确建立。',
      );
  return { blockCount, unmappedBlocks, between };
}

export interface ImportIntakeOperationsHost {
  assertAvailable: () => void;
  identifySelectedManuscript: (selectedPath: string, displayName: string) => Promise<SourceFormat>;
  stageSourceOnlyDraft: (draftId: string, selectionToken: string, selectedPath: string, displayName: string, format: SourceFormat) => Promise<StagedImportProjection>;
  stageConvertedManuscriptDraft: (draftId: string, selectionToken: string, selectedPath: string, displayName: string, conversion: ManuscriptConversionProjection) => Promise<StagedImportProjection>;
  parseIntoIngest: (draftId: string, path: string, displayName: string, options?: { signal?: AbortSignal; onArchiveProgress?: (bytes: number) => void; workingRepresentation?: true; historicalReader?: true; reading?: WordReadingKind | "legacy"; textBoxDisposition?: TextBoxDisposition; }) => Promise<IngestedDocx>;
  withContentObjectLifecycle: <T>(operation: () => Promise<T>) => Promise<T>;
  persistContentObject: (source: string | Uint8Array, sourceDigest: string, format: SourceFormat) => Promise<string>;
  transaction: <T>(db: DatabaseSync, operation: () => T) => T;
  readonly authority: DatabaseSync;
  promoteIngestSnapshot: (draftId: string, ingested: IngestedDocx, createdAt: string, converted?: { sourceDigest: string; fidelity: FidelityCategoryProjection[]; }) => void;
  boundedCall: <T>(operation: () => T) => T;
  readonly boundedAuthority: BoundedManuscriptStore;
  assertForeignKeys: (db: DatabaseSync) => void;
  stagedProjection: (snapshot: DraftSnapshot) => StagedImportProjection;
  discardIngest: (ingestId: string) => void;
  requireNoAbandonmentCleanupIntent: (draftId: string) => void;
  loadCommitAttemptForDraft: (draftId: string) => CommitAttempt | null;
  reconcileCommitAttempt: (attemptInput: CommitAttempt, options?: { contentObjectAlreadyVerified?: boolean; }) => Promise<{ state: "uncommitted"; } | { state: "uncertain"; } | { state: "committed"; result: ImportCommitProjection; }>;
  recoveryProjection: (draftId: string, kind: ImportDraftRecoveryProjection["kind"]) => Promise<ImportDraftRecoveryProjection>;
  loadDraftSnapshot: (draftId: string) => DraftSnapshot;
  revalidateSnapshot: (snapshot: DraftSnapshot) => Promise<{ snapshot: DraftSnapshot; parserDrift: boolean; }>;
  originalFileAccess: (snapshot: DraftSnapshot) => Promise<OriginalFileAccessProjection>;
  identityFindings: (snapshot: DraftSnapshot) => ImportIdentityFindingProjection[];
  reconstructReviewedReimportTarget: (snapshot: DraftSnapshot) => ResolvedReimportTarget | null;
  invalidateReview: (snapshot: DraftSnapshot) => DraftSnapshot;
  reimportReviewProjection: (snapshot: DraftSnapshot, target: ResolvedReimportTarget, commitAttemptId: string | null) => ReviewBeforeManuscriptReimportProjection;
  reconstructReviewedSourceImportTarget: (snapshot: DraftSnapshot, identityFindings: ReadonlyArray<ImportIdentityFindingProjection>) => ResolvedSourceImportTarget | null;
  sourceImportReviewProjection: (snapshot: DraftSnapshot, target: ResolvedSourceImportTarget, identityFindings: ReadonlyArray<ImportIdentityFindingProjection>, commitAttemptId: string | null) => ReviewBeforeSourceImportProjection;
  reconstructReviewedImport: (snapshot: DraftSnapshot, identityFindings: ReadonlyArray<ImportIdentityFindingProjection>) => { target: ResolvedImportTarget; reviewed: ReviewedFidelity; } | null;
  reviewProjection: (snapshot: DraftSnapshot, reviewDigest: string | null, reviewed: ReviewedFidelity, accepted: boolean, target: ResolvedImportTarget, identityFindings: ReadonlyArray<ImportIdentityFindingProjection>, commitAttemptId: string | null) => ReviewBeforeImportProjection;
  readonly reimportCommitWork: Map<string, importReviewOperations.ReimportCommitWork | importReviewOperations.ReimportReplayWork>;
  reselectConvertedDraft: (selection: { draftId: string; selectionToken: string; selectedPath: string; displayName: string; }, draft: { expectedDigest: string; expectedBytes: number; expectedDraftVersion: number; previousState: string; recovered: boolean; }, sourceFormat: ManuscriptConversionProjection["sourceFormat"]) => Promise<ContinueImportProjection>;
  reselectSourceOnlyDraft: (selection: { draftId: string; selectionToken: string; selectedPath: string; displayName: string; format: SourceFormat; }, draft: { expectedDigest: string; expectedDraftVersion: number; previousState: string; recovered: boolean; }) => Promise<ContinueImportProjection>;
  loadAbandonmentCleanupIntent: (draftId: string) => AbandonmentCleanupIntent | null;
  resumeAbandonmentCleanupIntent: (intentInput: AbandonmentCleanupIntent) => Promise<void>;
  getImportStartup: () => Promise<ImportStartupProjection>;
  loadCommitAttempt: (attemptId: string) => CommitAttempt;
  resolveImportTarget: (selection: ImportTargetSelection, identityFindings: ReadonlyArray<ImportIdentityFindingProjection>) => ResolvedImportTarget;
  wordIntakePlan: (snapshot: DraftSnapshot, target: ResolvedImportTarget, disposition: TextBoxDisposition, input: unknown, draftVersion: number) => WordIntakePlan | null;
  reviewedFidelity: (snapshot: DraftSnapshot, disposition: TextBoxDisposition, word?: WordIntakePlan) => ReviewedFidelity;
  replaceStagedReading: (snapshot: DraftSnapshot, parsed: ParsedDocx | ParsedWordDocx, blocks: ReadonlyArray<Pick<ParsedDocxBlock, "position" | "kind" | "level" | "text" | "digest" | "graphemeLength" | "note">>, sources: StagedImportSources | null) => void;
  retentionCall: <T>(operation: () => T) => T;
  readonly control: StoreControl;
  readonly workflowProfile: BuiltInWorkflowProfile;
  selectLegacyWordStaging: (snapshot: DraftSnapshot) => DraftSnapshot;
  resolveSourceImportTarget: (selection: SourceImportTargetSelection, snapshot: DraftSnapshot, identityFindings: ReadonlyArray<ImportIdentityFindingProjection>) => ResolvedSourceImportTarget;
  loadStoredCommitResult: (commitId: string) => StoredImportCommitProjection;
  insertBookDimensionSet: (dimensionSetId: string, bookId: string, createdAt: string) => void;
  emptyBookImportTarget: (bookId: string) => { bookId: string; stableIdentity: string; title: string; internalNumber: string | null; dimensionSetId: string; label: string; bookStateDigest: string; };
  commitWordEvidence: (word: WordIntakePlan, input: { bookId: string; sourceVersionId: string; commitId: string; fidelityReviewId: string; revisionId: string; branchId: string; reviewDigest: string; createdAt: string; }) => number;
  importedMarkCall: <T>(operation: () => T) => T;
  readonly editorialMarks: EditorialMarkStore;
  getBookOverview: (bookId: string, historyCursor?: BookHistoryCursor | null) => BookWorkOverviewProjection;
  assertImportPostconditions: (input: { bookId: string; dimensionSetId: string; manuscriptId: string; branchId: string; revisionId: string; sourceVersionId: string; fidelityReviewId: string; degradationDecisionId: string | null; workflowInstanceId: string; importRecordId: string; blockCount: number; characterCount: number; reviewDigest: string; fidelityPlan: ImportFidelityPlan; fidelityCategoryCount: number; unmappedBlocks: number; sourceDigest: string; sourceBytes: number; conversion: ManuscriptConversionProjection | null; parserIdentity: string; word?: { commitId: string; compiled: Extract<WordTrackedCompilation, { kind: "ready"; }>; noteCount: number; }; }) => void;
  getManuscriptWindow: (manuscriptId: string, branchId: string, cursor: string | null) => ManuscriptWindowProjection;
  sourceImportAuthorityCounts: (bookId: string) => { manuscripts: number; revisions: number; workflows: number; fidelityReviews: number; manuscriptImports: number; sourceVersions: number; provenance: number; sourceImports: number; };
  bookSourceImportTarget: (bookId: string, sourceDigest: string) => Omit<Extract<ResolvedSourceImportTarget, { kind: "existing-book"; }>, "choiceId" | "sourceVersionDisposition" | "reuseSourceVersionId"> & { exactSourceVersionId: string | null; };
  sourceImportRecordPresentations: (bookId: string, recordIds: ReadonlyArray<string>) => BookRecordPresentation[];
  readonly TOKEN_PATTERN: RegExp;
  readonly workflowProjectionJson: (profile: BuiltInWorkflowProfile) => string;
  readonly nullableString: (value: SQLOutputValue | undefined) => string | null;
}

export async function stageSelectedManuscript(host: ImportIntakeOperationsHost, selectionToken: string, selectedPathInput: string): Promise<StagedImportProjection> {
    host.assertAvailable();
    requireStore(host.TOKEN_PATTERN.test(selectionToken), 'SELECTION_INVALID', '文件选择令牌无效。');
    requireStore(isAbsolute(selectedPathInput), 'SELECTION_INVALID', '文件选择结果无效。');

    const selectedPath = await realpath(selectedPathInput);
    const displayName = safeDisplayName(basename(selectedPath));
    const draftId = randomUUID();
    const format = await host.identifySelectedManuscript(selectedPath, displayName);
    // The format table owns the routing (ADR 0072 §1): read natively, read through a converter, or
    // retained source-only with the reason the surface states.
    const route = editableImport(format);
    if (!route.available) return host.stageSourceOnlyDraft(draftId, selectionToken, selectedPath, displayName, format);
    if (route.conversion) {
      return host.stageConvertedManuscriptDraft(draftId, selectionToken, selectedPath, displayName, route.conversion);
    }

    try {
      const ingested = await host.parseIntoIngest(draftId, selectedPath, displayName);
      try {
        return await host.withContentObjectLifecycle(async () => {
          const { parsed } = ingested;
          const relativeKey = await host.persistContentObject(selectedPath, parsed.sourceDigest, 'DOCX');
          const now = new Date().toISOString();
          host.transaction(host.authority, () => {
            host.authority
              .prepare(
                `INSERT INTO content_objects(object_digest, relative_key, byte_length, verified_at)
                 VALUES (?, ?, ?, ?)
                 ON CONFLICT(object_digest) DO NOTHING`,
              )
              .run(parsed.sourceDigest, relativeKey, parsed.archiveBytes, now);
            const object = one(
              host.authority.prepare('SELECT relative_key, byte_length FROM content_objects WHERE object_digest = ?').all(parsed.sourceDigest) as SqlRow[],
              'OBJECT_VERIFY_FAILED',
              '暂存对象记录缺失。',
            );
            requireStore(asString(object.relative_key) === relativeKey && asNumber(object.byte_length) === parsed.archiveBytes, 'OBJECT_VERIFY_FAILED', '暂存对象记录冲突。');
            host.authority
              .prepare(
                `INSERT INTO import_drafts(
                   draft_id, selection_token, state, draft_version, display_name, object_digest, selected_path, staged_at
                 ) VALUES (?, ?, 'staged', 1, ?, ?, ?, ?)`,
              )
              .run(draftId, selectionToken, displayName, parsed.sourceDigest, selectedPath, now);
            host.promoteIngestSnapshot(draftId, ingested, now);
            host.boundedCall(() => host.boundedAuthority.assertStagedDraftIntegrity(draftId));
            host.assertForeignKeys(host.authority);
          });

          return host.stagedProjection({
            draftId,
            state: 'staged',
            version: 1,
            displayName,
            objectDigest: parsed.sourceDigest,
            selectedPath,
            conversion: null,
            workingObjectDigest: null,
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
            sourceFormat: 'DOCX',
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
        host.discardIngest(ingested.ingestId);
      }
    } catch (error) {
      if (error instanceof StoreError) throw error;
      // A ZIP that is not a WordprocessingML package is not a format the product recognises, so it
      // is retained source-only rather than refused; every other bound stays a refusal, because a
      // hostile archive is not something to keep (ADR 0072 §1).
      if (isNotAWordprocessingPackage(error)) {
        return host.stageSourceOnlyDraft(draftId, selectionToken, selectedPath, displayName, 'UNKNOWN');
      }
      if (error instanceof Error && error.message.startsWith('DOCX_REJECTED:')) {
        throw new StoreError('DOCX_REJECTED', '该 DOCX 不符合当前受限本地导入边界。');
      }
      throw error;
    }
  }

export async function continueImportDraft(host: ImportIntakeOperationsHost, draftId: string, expectedDraftVersion: number): Promise<ContinueImportProjection> {
    host.assertAvailable();
    requireStore(UUID_PATTERN.test(draftId), 'DRAFT_INVALID', '导入草稿标识无效。');
    host.requireNoAbandonmentCleanupIntent(draftId);
    const attempt = host.loadCommitAttemptForDraft(draftId);
    if (attempt) {
      const reconciliation = await host.reconcileCommitAttempt(attempt);
      if (reconciliation.state === 'committed') {
        return { state: 'committed-recovered', result: reconciliation.result };
      }
      if (reconciliation.state === 'uncertain') {
        return {
          state: 'outcome-uncertain',
          recovery: await host.recoveryProjection(draftId, 'outcome-uncertain'),
        };
      }
    }

    let snapshot: DraftSnapshot;
    try {
      snapshot = host.loadDraftSnapshot(draftId);
      requireStore(snapshot.version === expectedDraftVersion, 'DRAFT_VERSION_CHANGED', '导入草稿版本已变化。');
      const revalidated = await host.revalidateSnapshot(snapshot);
      snapshot = revalidated.snapshot;
      if (revalidated.parserDrift) {
        const access = await host.originalFileAccess(snapshot);
        return {
          state: 'target-review-required',
          staged: host.stagedProjection(snapshot),
          originalFileAccess: access,
          reviewInvalidated: true,
          notice: '解析器版本已变化；已从精确暂存字节重新形成预检，旧复核已失效，请重新检查变化后的决定。',
        };
      }
    } catch (error) {
      if (error instanceof StoreError && error.code === 'DRAFT_VERSION_CHANGED') throw error;
      return {
        state: 'reselection-required',
        recovery: await host.recoveryProjection(draftId, 'ordinary-draft'),
      };
    }

    const access = await host.originalFileAccess(snapshot);
    if (snapshot.state === 'staged') {
      return {
        state: 'target-review-required',
        staged: host.stagedProjection(snapshot),
        originalFileAccess: access,
        reviewInvalidated: false,
        notice: continuationNotice(access),
      };
    }

    requireStore(snapshot.state === 'reviewed', 'DRAFT_STATE_CHANGED', '导入草稿状态已变化。');
    const identityFindings = host.identityFindings(snapshot);
    if (snapshot.reviewedRelationship === 'reimport') {
      const reimportTarget = host.reconstructReviewedReimportTarget(snapshot);
      if (reimportTarget === null) {
        snapshot = host.invalidateReview(snapshot);
        return {
          state: 'target-review-required',
          staged: host.stagedProjection(snapshot),
          originalFileAccess: access,
          reviewInvalidated: true,
          notice: '重新导入目标、固定点、来源关系、来源版本结果或逐块比较已变化；旧复核已失效。',
        };
      }
      return {
        state: 'review-ready',
        review: host.reimportReviewProjection(snapshot, reimportTarget, attempt?.attemptId ?? null),
        originalFileAccess: access,
        notice: continuationNotice(access),
      };
    }
    if (snapshot.reviewedRelationship === 'source-only') {
      const sourceTarget = host.reconstructReviewedSourceImportTarget(snapshot, identityFindings);
      if (sourceTarget === null) {
        snapshot = host.invalidateReview(snapshot);
        return {
          state: 'target-review-required',
          staged: host.stagedProjection(snapshot),
          originalFileAccess: access,
          reviewInvalidated: true,
          notice: '来源导入目标、关系、复用选择、保留边界或最终记录后果已变化；旧复核已失效。',
        };
      }
      return {
        state: 'review-ready',
        review: host.sourceImportReviewProjection(snapshot, sourceTarget, identityFindings, attempt?.attemptId ?? null),
        originalFileAccess: access,
        notice: continuationNotice(access),
      };
    }
    const reconstructed = host.reconstructReviewedImport(snapshot, identityFindings);
    if (reconstructed === null) {
      snapshot = host.invalidateReview(snapshot);
      return {
        state: 'target-review-required',
        staged: host.stagedProjection(snapshot),
        originalFileAccess: access,
        reviewInvalidated: true,
        notice: '导入目标、书名、保真状态或最终记录后果已变化；旧复核已失效，请从变化后的选择重新确认。',
      };
    }
    requireStore(snapshot.reviewDigest !== null, 'REVIEW_CHANGED', '导入前复核摘要已变化。');

    return {
      state: 'review-ready',
      review: host.reviewProjection(
        snapshot,
        snapshot.reviewDigest,
        reconstructed.reviewed,
        reconstructed.reviewed.plan.degradations.length > 0,
        reconstructed.target,
        identityFindings,
        attempt?.attemptId ?? null,
      ),
      originalFileAccess: access,
      notice: continuationNotice(access),
    };
  }

export async function reselectImportDraft(host: ImportIntakeOperationsHost, draftId: string, expectedDraftVersion: number, selectionToken: string, selectedPathInput: string): Promise<ContinueImportProjection> {
    host.assertAvailable();
    requireStore(UUID_PATTERN.test(draftId) && host.TOKEN_PATTERN.test(selectionToken), 'SELECTION_INVALID', '文件重选参数无效。');
    requireStore(!Array.from(host.reimportCommitWork.values()).some((work) => work.input.draftId === draftId),
      'SERVICE_BUSY', '稿件重新导入正在提交，不能重选来源文件。');
    host.requireNoAbandonmentCleanupIntent(draftId);
    requireStore(isAbsolute(selectedPathInput), 'SELECTION_INVALID', '文件选择结果无效。');
    const attempt = host.loadCommitAttemptForDraft(draftId);
    if (attempt) {
      const reconciliation = await host.reconcileCommitAttempt(attempt);
      if (reconciliation.state === 'committed') {
        return { state: 'committed-recovered', result: reconciliation.result };
      }
      if (reconciliation.state === 'uncertain') {
        return {
          state: 'outcome-uncertain',
          recovery: await host.recoveryProjection(draftId, 'outcome-uncertain'),
        };
      }
    }

    const draft = one(
      host.authority
        .prepare(
          `SELECT state, draft_version, object_digest, source_format, working_object_digest, converter_identity
           FROM import_drafts WHERE draft_id = ?`,
        )
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
    let format: SourceFormat;
    try {
      selectedPath = await realpath(selectedPathInput);
      displayName = safeDisplayName(basename(selectedPath));
      format = await host.identifySelectedManuscript(selectedPath, displayName);
    } catch (error) {
      if (error instanceof StoreFatalError) throw error;
      throw new StoreError('SNAPSHOT_RESELECTION_REQUIRED', '重选文件无法形成完整的本地暂存快照。');
    }
    // A converted draft was read through its working representation, so reselecting its original reproduces that
    // representation and restages it (Issue #611): after a converter change the draft is whole again, never only 放弃.
    // It is routed on its own row, whatever the picked file is named or identified as: the original's digest of record,
    // checked before any conversion or write, is the whole identity proof, and a draft read through a working
    // representation never takes the source-only or the DOCX path (#615's review).
    const recordedConversion = readConversionColumns(
      draft,
      draft.source_format === null || draft.source_format === undefined ? 'DOCX' : requireSourceFormat(asString(draft.source_format)),
      '导入草稿的转换记录不完整。',
    );
    if (recordedConversion !== null) {
      const original = one(
        host.authority.prepare('SELECT byte_length FROM content_objects WHERE object_digest = ?').all(expectedDigest) as SqlRow[],
        'STORE_CORRUPT',
        '导入草稿的原文件对象不存在。',
      );
      return host.reselectConvertedDraft(
        { draftId, selectionToken, selectedPath, displayName },
        { expectedDigest, expectedBytes: asNumber(original.byte_length), expectedDraftVersion, previousState, recovered: attempt !== null },
        recordedConversion.sourceFormat,
      );
    }
    // Reselection identifies the file the same way staging does, so a format the product does not
    // read as a Manuscript comes back as the same source-only draft rather than a bare refusal.
    if (format !== 'DOCX') {
      return host.reselectSourceOnlyDraft(
        { draftId, selectionToken, selectedPath, displayName, format },
        { expectedDigest, expectedDraftVersion, previousState, recovered: attempt !== null },
      );
    }
    let ingested: IngestedDocx;
    try {
      ingested = await host.parseIntoIngest(draftId, selectedPath, displayName);
    } catch (error) {
      if (error instanceof StoreFatalError) throw error;
      throw new StoreError('SNAPSHOT_RESELECTION_REQUIRED', '重选文件无法形成完整的本地暂存快照。');
    }
    try {
      const { parsed } = ingested;
      requireStore(parsed.sourceDigest === expectedDigest, 'RESELECTION_MISMATCH', '重选文件与原暂存来源身份不一致。');
      return await host.withContentObjectLifecycle(async () => {
        host.requireNoAbandonmentCleanupIntent(draftId);
        const currentDraft = one(
          host.authority
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
        const relativeKey = await host.persistContentObject(selectedPath, parsed.sourceDigest, 'DOCX');
        const nextVersion = expectedDraftVersion + 1;
        const now = new Date().toISOString();
        host.transaction(host.authority, () => {
          host.authority
            .prepare(
              `INSERT INTO content_objects(object_digest, relative_key, byte_length, verified_at)
               VALUES (?, ?, ?, ?)
               ON CONFLICT(object_digest) DO UPDATE SET
                 relative_key = excluded.relative_key,
                 byte_length = excluded.byte_length,
                 verified_at = excluded.verified_at`,
            )
            .run(parsed.sourceDigest, relativeKey, parsed.archiveBytes, now);
          host.authority.prepare('DELETE FROM manuscript_reimport_comparisons WHERE draft_id = ?').run(draftId);
          host.authority.prepare('DELETE FROM staged_import_snapshots WHERE draft_id = ?').run(draftId);
          host.promoteIngestSnapshot(draftId, ingested, now);
          const draftUpdate = host.authority
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
          host.authority.prepare("DELETE FROM import_commit_attempts WHERE draft_id = ? AND state = 'prepared'").run(draftId);
          host.boundedCall(() => host.boundedAuthority.assertStagedDraftIntegrity(draftId));
          host.assertForeignKeys(host.authority);
        });
        const snapshot = host.loadDraftSnapshot(draftId);
        return {
          state: 'target-review-required',
          staged: host.stagedProjection(snapshot),
          originalFileAccess: { state: 'available-exact', label: '原始所选文件仍可访问且身份一致' },
          reviewInvalidated: previousState === 'reviewed' || attempt !== null,
          notice: '已通过原来源摘要精确匹配完成重选，并重新形成完整暂存与预检；请重新确认全部决定。',
        };
      });
    } finally {
      host.discardIngest(ingested.ingestId);
    }
  }

export async function abandonImportDraft(host: ImportIntakeOperationsHost, draftId: string, expectedDraftVersion: number): Promise<ImportStartupProjection> {
    host.assertAvailable();
    requireStore(UUID_PATTERN.test(draftId), 'DRAFT_INVALID', '导入草稿标识无效。');
    requireStore(!Array.from(host.reimportCommitWork.values()).some((work) => work.input.draftId === draftId),
      'SERVICE_BUSY', '稿件重新导入正在提交，不能放弃草稿。');
    return host.withContentObjectLifecycle(() =>
      abandonImportDraftWithinContentObjectLifecycle(host, draftId, expectedDraftVersion),
    );
  }

export async function abandonImportDraftWithinContentObjectLifecycle(host: ImportIntakeOperationsHost, draftId: string, expectedDraftVersion: number): Promise<ImportStartupProjection> {
    const pendingCleanup = host.loadAbandonmentCleanupIntent(draftId);
    if (pendingCleanup) {
      requireStore(
        pendingCleanup.expectedDraftVersion === expectedDraftVersion,
        'DRAFT_VERSION_CHANGED',
        '导入草稿版本已变化。',
      );
      await host.resumeAbandonmentCleanupIntent(pendingCleanup);
      return host.getImportStartup();
    }
    const attempt = host.loadCommitAttemptForDraft(draftId);
    if (attempt) {
      const reconciliation = await host.reconcileCommitAttempt(attempt);
      if (reconciliation.state === 'committed') {
        return { state: 'committed-recovered', result: reconciliation.result };
      }
      if (reconciliation.state === 'uncertain') {
        return {
          state: 'outcome-uncertain',
          recovery: await host.recoveryProjection(draftId, 'outcome-uncertain'),
        };
      }
    }
    const cleanupIntent = host.transaction<AbandonmentCleanupIntent | null>(host.authority, () => {
      const draft = one(
        host.authority
          .prepare(
            `SELECT d.state, d.draft_version, d.object_digest, d.working_object_digest, co.relative_key
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
        host.authority.prepare('SELECT count(*) commits FROM import_commits WHERE draft_id = ?').all(draftId) as SqlRow[],
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
      // A converted draft owns two objects, and abandoning it removes both: the original the editor
      // selected and the working representation the product wrote beside it (ADR 0072 §2).
      const workingObjectDigest = draft.working_object_digest === null
        ? null
        : asString(draft.working_object_digest);
      const referencesBefore = one(
        host.authority
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
        host.authority
          .prepare(
            `INSERT INTO import_abandonment_cleanup_intents(
               draft_id, object_digest, expected_draft_version, relative_key, state, requested_at,
               working_object_digest
             ) VALUES (?, ?, ?, ?, 'prepared', ?, ?)`,
          )
          .run(draftId, objectDigest, expectedDraftVersion, relativeKey, requestedAt, workingObjectDigest);
        const intent: AbandonmentCleanupIntent = {
          draftId,
          objectDigest,
          expectedDraftVersion,
          relativeKey,
          state: 'prepared',
          workingObjectDigest,
        };
        host.assertForeignKeys(host.authority);
        return intent;
      }
      const deletion = host.authority
        .prepare("DELETE FROM import_drafts WHERE draft_id = ? AND draft_version = ? AND state IN ('staged', 'reviewed')")
        .run(draftId, expectedDraftVersion);
      requireStore(deletion.changes === 1, 'DRAFT_VERSION_CHANGED', '导入草稿在放弃时已变化。');
      const references = one(
        host.authority
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
      host.assertForeignKeys(host.authority);
      return null;
    });
    if (cleanupIntent) await host.resumeAbandonmentCleanupIntent(cleanupIntent);
    return host.getImportStartup();
  }

export async function acknowledgeImportCompletion(host: ImportIntakeOperationsHost, commitId: string): Promise<{ state: 'acknowledged' }> {
    host.assertAvailable();
    requireStore(UUID_PATTERN.test(commitId), 'COMMIT_INVALID', '导入提交标识无效。');
    const attempt = host.loadCommitAttempt(commitId);
    const reconciliation = await host.reconcileCommitAttempt(attempt);
    requireStore(reconciliation.state === 'committed', 'COMMIT_NOT_PROVEN', '导入提交尚未获得完整证明。');
    host.authority
      .prepare(
        `UPDATE import_commit_attempts
         SET completion_acknowledged_at = COALESCE(completion_acknowledged_at, ?)
         WHERE attempt_id = ? AND state = 'committed'`,
      )
      .run(new Date().toISOString(), commitId);
    return { state: 'acknowledged' };
  }

export function prepareNewBookReview(host: ImportIntakeOperationsHost, draftId: string, expectedDraftVersion: number, targetSelection: ImportTargetSelection, acceptDegradation: boolean, textBoxDisposition: TextBoxDisposition = 'retain', trackedChanges?: WordTrackedChoiceInput, structure?: ImportStructureChoice): ReviewBeforeImportProjection {
    host.assertAvailable();
    requireStore(UUID_PATTERN.test(draftId), 'DRAFT_INVALID', '导入草稿标识无效。');
    requireStore(textBoxDisposition === 'retain' || textBoxDisposition === 'merge', 'TEXT_BOX_CHOICE_INVALID', '文本框处理方式无效。');
    host.requireNoAbandonmentCleanupIntent(draftId);
    let snapshot = host.loadDraftSnapshot(draftId);
    requireStore(snapshot.state === 'staged', 'DRAFT_STATE_CHANGED', '导入草稿状态已变化。');
    requireStore(snapshot.version === expectedDraftVersion, 'DRAFT_VERSION_CHANGED', '导入草稿版本已变化。');
    const identityFindings = host.identityFindings(snapshot);
    const target = host.resolveImportTarget(targetSelection, identityFindings);
    const word = host.wordIntakePlan(snapshot, target, textBoxDisposition, trackedChanges, expectedDraftVersion);
    if (word !== null) {
      snapshot = { ...snapshot, parserIdentity: word.parsed.parserIdentity, contentDigest: word.parsed.contentDigest,
        structureDigest: word.parsed.structureDigest, blockCount: word.parsed.blockCount, characterCount: word.parsed.characterCount,
        fidelity: word.parsed.fidelity, titleSuggestion: word.parsed.titleSuggestion.value, titleSource: word.parsed.titleSuggestion.sourceLabel };
    }
    const reviewed: ReviewedFidelity = { ...host.reviewedFidelity(snapshot, textBoxDisposition, word ?? undefined), structure: word !== null ? null
      : host.boundedCall(() => reviewStructureChoice(host.authority, snapshot.draftId, snapshot.parserIdentity !== WORD_DOCX_PARSER_IDENTITY, structure)) };
    const { plan } = reviewed;
    if (plan.degradations.length > 0 && !acceptDegradation) {
      if (word !== null) host.transaction(host.authority, () => {
        host.replaceStagedReading(snapshot, word.parsed, word.reading.blocks, null);
        host.retentionCall(() => recordWordPreparedIntake(host.authority, word.prepared));
      });
      return host.reviewProjection(snapshot, null, reviewed, false, target, identityFindings, null);
    }
    // The ordinary import policy also applies to clean files; it records no empty degradation decision.
    const nextVersion = expectedDraftVersion + 1;
    if (word !== null) word.prepared = { ...word.prepared, draftVersion: nextVersion };
    requireStore(
      !host.control.persistLegacyReviewedDraft ||
        (target.kind === 'new-book' && target.choiceId === 'new-book' && identityFindings.length === 0),
      'E2E_CONTROL_INVALID',
      '旧版复核边界仅适用于无身份提示的新建图书。',
    );
    const reviewSnapshot = { ...snapshot, version: nextVersion };
    const reviewDigest = host.control.persistLegacyReviewedDraft
      ? createLegacyNewBookReviewDigestV2(reviewSnapshot, target.kind === 'new-book' ? target.confirmedTitle : '', nextVersion, plan)
      : createImportReviewDigestV6(reviewSnapshot, nextVersion, reviewed, target, identityFindings, host.workflowProfile);
    const persistedTargetChoiceId = host.control.persistLegacyReviewedDraft
      ? null
      : target.kind === 'new-book' ? target.choiceId : null;
    const reviewedAt = new Date().toISOString();
    host.transaction(host.authority, () => {
      if (word !== null) host.replaceStagedReading(snapshot, word.parsed, word.reading.blocks, null);
      const update = host.authority
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
      host.boundedCall(() => recordStructureChoice(host.authority, draftId, reviewed.structure ?? null));
      if (word !== null) host.retentionCall(() => recordWordPreparedIntake(host.authority, word.prepared));
    });
    return host.reviewProjection(
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
      reviewed,
      plan.degradations.length > 0,
      target,
      identityFindings,
      null,
    );
  }

export function prepareSourceImportReview(host: ImportIntakeOperationsHost, draftId: string, expectedDraftVersion: number, targetSelection: SourceImportTargetSelection): ReviewBeforeSourceImportProjection {
    host.assertAvailable();
    requireStore(UUID_PATTERN.test(draftId), 'DRAFT_INVALID', '导入草稿标识无效。');
    host.requireNoAbandonmentCleanupIntent(draftId);
    let snapshot = host.loadDraftSnapshot(draftId);
    requireStore(snapshot.state === 'staged', 'DRAFT_STATE_CHANGED', '导入草稿状态已变化。');
    requireStore(snapshot.version === expectedDraftVersion, 'DRAFT_VERSION_CHANGED', '导入草稿版本已变化。');
    snapshot = host.selectLegacyWordStaging(snapshot);
    const identityFindings = host.identityFindings(snapshot);
    const target = host.resolveSourceImportTarget(targetSelection, snapshot, identityFindings);
    const nextVersion = expectedDraftVersion + 1;
    const reviewedSnapshot = { ...snapshot, version: nextVersion };
    const reviewDigest = createSourceImportReviewDigest(reviewedSnapshot, target, identityFindings);
    const reviewedAt = new Date().toISOString();
    host.transaction(host.authority, () => {
      const update = host.authority.prepare(
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
    return host.sourceImportReviewProjection(
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

export async function commitNewBookImport(host: ImportIntakeOperationsHost, input: {
      draftId: string;
      expectedDraftVersion: number;
      reviewDigest: string;
      commitId: string;
    }, options: { interruptAfterAttempt?: boolean } = {}): Promise<ManuscriptImportCommitProjection> {
    host.assertAvailable();
    requireStore(UUID_PATTERN.test(input.draftId) && UUID_PATTERN.test(input.commitId), 'COMMIT_INVALID', '导入提交标识无效。');
    requireStore(/^[0-9a-f]{64}$/.test(input.reviewDigest), 'COMMIT_INVALID', '导入复核摘要无效。');
    host.requireNoAbandonmentCleanupIntent(input.draftId);
    const requestFingerprint = commitRequestFingerprint('manuscript-import', input);
    const existingAttempt = host.loadCommitAttemptForDraft(input.draftId);
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
      const reconciliation = await host.reconcileCommitAttempt(existingAttempt);
      if (reconciliation.state === 'committed') {
        requireStore(reconciliation.result.completionLabel === '稿件已导入', 'IDEMPOTENCY_CONFLICT', '提交类型与稿件导入不一致。');
        return reconciliation.result;
      }
      requireStore(reconciliation.state === 'uncommitted', 'IMPORT_COMMIT_OUTCOME_UNCERTAIN', '导入提交结果待确认。');
    }

    const snapshotBeforeAttempt = host.loadDraftSnapshot(input.draftId);
    requireStore(snapshotBeforeAttempt.state === 'reviewed', 'DRAFT_NOT_REVIEWED', '导入草稿尚未完成复核。');
    requireStore(snapshotBeforeAttempt.version === input.expectedDraftVersion, 'DRAFT_VERSION_CHANGED', '导入草稿版本已变化。');
    requireStore(snapshotBeforeAttempt.reviewDigest === input.reviewDigest, 'REVIEW_CHANGED', '导入前复核摘要已变化。');
    const revalidated = await host.revalidateSnapshot(snapshotBeforeAttempt);
    requireStore(!revalidated.parserDrift, 'REVIEW_CHANGED', '解析器状态已变化，请重新复核导入。');
    const snapshotForAttempt = revalidated.snapshot;
    const identityFindingsForAttempt = host.identityFindings(snapshotForAttempt);
    const reviewedForAttempt = host.reconstructReviewedImport(snapshotForAttempt, identityFindingsForAttempt);
    requireStore(reviewedForAttempt !== null, 'REVIEW_CHANGED', '导入前复核摘要无法由当前权威状态重建。');
    if (!existingAttempt) {
      const preparedAt = new Date().toISOString();
      host.transaction(host.authority, () => {
        host.authority
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

    host.transaction(host.authority, () => {
      const existing = host.authority.prepare(
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
        const stored = host.loadStoredCommitResult(input.commitId);
        requireStore(stored.completionLabel === '稿件已导入', 'IDEMPOTENCY_CONFLICT', '提交类型与稿件导入不一致。');
        result = stored;
        return;
      }

      const snapshot = host.loadDraftSnapshot(input.draftId);
      requireStore(snapshot.state === 'reviewed', 'DRAFT_NOT_REVIEWED', '导入草稿尚未完成复核。');
      requireStore(snapshot.version === input.expectedDraftVersion, 'DRAFT_VERSION_CHANGED', '导入草稿版本已变化。');
      requireStore(snapshot.reviewDigest === input.reviewDigest, 'REVIEW_CHANGED', '导入前复核摘要已变化。');
      const identityFindings = host.identityFindings(snapshot);
      const reconstructed = host.reconstructReviewedImport(snapshot, identityFindings);
      requireStore(reconstructed !== null, 'REVIEW_CHANGED', '导入前复核摘要无法由当前权威状态重建。');
      const { target, reviewed } = reconstructed;
      const { plan, fidelity: reviewedFidelity } = reviewed;
      const word = reviewed.word;
      host.boundedCall(() => host.boundedAuthority.assertStagedDraftIntegrity(input.draftId));
      // A merged review brings every text-box paragraph into r1 (ADR 0086 §2); any other review's r1 is
      // exactly the staged body.
      const merged = word === undefined && plan.textBoxDisposition === 'merge'
        ? host.retentionCall(() => stagedTextBoxParagraphs(host.authority, input.draftId))
        : null;
      let blockCount = snapshot.blockCount + (merged?.length ?? 0);
      // A confirmed structure or a split paragraph (Issue #1205) shapes r1 in the same pass a text-box merge does.
      const structure = reviewed.structure ?? null;
      const shaped = merged !== null || structure !== null || host.boundedCall(() => stagedHasPieces(host.authority, input.draftId));
      const characterCount = snapshot.characterCount +
        (merged?.reduce((total, paragraph) => total + paragraph.graphemeLength, 0) ?? 0);

      const now = new Date().toISOString();
      const bookId = target.kind === 'existing-book' ? target.bookId : randomUUID();
      const dimensionSetId = target.kind === 'existing-book' ? target.dimensionSetId : randomUUID();
      const reusedParent = word?.prepared.target.kind === 'existing-book' ? word.prepared.target.parentSourcePin : null;
      const sourceVersionId = reusedParent?.sourceVersionId ?? randomUUID();
      const provenanceId = randomUUID();
      const fidelityReviewId = randomUUID();
      const degradationDecisionId = plan.degradations.length > 0 ? randomUUID() : null;
      const manuscriptId = randomUUID();
      const branchId = randomUUID();
      const revisionId = randomUUID();
      const workflowInstanceId = randomUUID();
      const importRecordId = randomUUID();
      // A merged r1 is not the parse's body alone, so its digest names the paragraphs merged into it.
      const revisionDigest = sha256(canonicalJson({ ...(merged === null
        ? {
            schema: 'ai7.manuscript-revision/2',
            manuscriptId,
            parserIdentity: snapshot.parserIdentity,
            contentDigest: snapshot.contentDigest,
            structureDigest: snapshot.structureDigest,
            blockCount: snapshot.blockCount,
            characterCount: snapshot.characterCount,
          }
        : {
            schema: 'ai7.manuscript-revision/3',
            manuscriptId,
            parserIdentity: snapshot.parserIdentity,
            contentDigest: snapshot.contentDigest,
            structureDigest: snapshot.structureDigest,
            blockCount,
            characterCount,
            textBoxDisposition: 'merge',
            mergedTextBoxParagraphs: merged.map((paragraph) => ({
              boxOrdinal: paragraph.boxOrdinal,
              boxParagraphOrdinal: paragraph.boxParagraphOrdinal,
              sourceParagraphIndex: paragraph.sourceParagraphIndex,
              digest: paragraph.digest,
            })),
          }), ...(structure === null ? {} : { schema: 'ai7.manuscript-revision/4', structure }) }));
      const workingDigest = revisionDigest;
      let unmappedBlocks = 0;

      if (target.kind === 'new-book') {
        host.authority.prepare(
          'INSERT INTO books(book_id, stable_identity, title, created_at, internal_number) VALUES (?, ?, ?, ?, NULL)',
        ).run(bookId, `book:${bookId}`, target.confirmedTitle, now);
        host.insertBookDimensionSet(dimensionSetId, bookId, now);
      } else {
        const revalidatedTarget = host.emptyBookImportTarget(target.bookId);
        requireStore(
          revalidatedTarget.bookStateDigest === target.bookStateDigest &&
            revalidatedTarget.dimensionSetId === target.dimensionSetId,
          'REVIEW_CHANGED',
          '所选图书身份、维度集或稿件状态已变化。',
        );
      }
      if (reusedParent !== null) host.retentionCall(() => requireWordParentSourcePin(host.authority, reusedParent));
      else host.authority
        .prepare(
          `INSERT INTO source_versions(
             source_version_id, book_id, object_digest, source_digest, content_digest, structure_digest,
             parser_identity, format, display_name, created_at, working_object_digest, converter_identity
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          sourceVersionId,
          bookId,
          snapshot.objectDigest,
          snapshot.sourceDigest,
          word?.native.parsed.contentDigest ?? snapshot.contentDigest,
          word?.native.parsed.structureDigest ?? snapshot.structureDigest,
          snapshot.parserIdentity,
          snapshot.sourceFormat,
          snapshot.displayName,
          now,
          snapshot.workingObjectDigest,
          snapshot.conversion?.converterIdentity ?? null,
        );
      host.authority
        .prepare(
          `INSERT INTO source_provenance(
             provenance_id, source_version_id, acquisition_path, locality, sanitized_identity, parser_identity, recorded_at
           ) VALUES (?, ?, 'native-file-picker', 'local-provider-free', ?, ?, ?)`,
        )
        .run(provenanceId, sourceVersionId, snapshot.displayName, snapshot.parserIdentity, now);
      host.authority
        .prepare(
          `INSERT INTO import_fidelity_reviews(
             fidelity_review_id, book_id, source_version_id, review_digest, outcome, round_trip_guaranteed, created_at
           ) VALUES (?, ?, ?, ?, ?, 0, ?)`,
        )
        .run(fidelityReviewId, bookId, sourceVersionId, input.reviewDigest, plan.outcome, now);
      const insertFidelity = host.authority.prepare(
        `INSERT INTO import_fidelity_categories(
           fidelity_review_id, category_key, display_label, item_count, status, detail, position
         ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      );
      reviewedFidelity.forEach((category, index) =>
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
      if (plan.textBoxDisposition !== null) {
        host.retentionCall(() => recordTextBoxChoice(host.authority, fidelityReviewId, plan.textBoxDisposition!, now));
      }
      if (degradationDecisionId) {
        const decision = canonicalDegradationDecision(plan);
        requireStore(decision, 'FIDELITY_OUTSIDE_TRACER', '降级决定无法形成规范记录。');
        host.authority
          .prepare(
            `INSERT INTO import_degradation_decisions(
               degradation_decision_id, fidelity_review_id, decision, created_at
             ) VALUES (?, ?, ?, ?)`,
          )
          .run(degradationDecisionId, fidelityReviewId, decision, now);
      }
      const written = writeImportedManuscriptRows(host.authority, {
        input, bookId, manuscriptId, branchId, revisionId, sourceVersionId, revisionDigest, workingDigest,
        now, shaped, word, snapshot, blockCount, unmappedBlocks, characterCount, merged, structure,
      }, () => {
      host.authority
        .prepare(
          `INSERT INTO workflow_profiles(
             profile_id, profile_version, profile_name, profile_digest, projection_schema, projection_json,
             native_profile_id, native_profile_version, native_profile_digest
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(profile_id, profile_version) DO NOTHING`,
        )
        .run(
          host.workflowProfile.projection.id,
          host.workflowProfile.projection.version,
          host.workflowProfile.projection.name,
          host.workflowProfile.projection.digest,
          host.workflowProfile.projection.schema,
          host.workflowProjectionJson(host.workflowProfile),
          host.workflowProfile.native.id,
          host.workflowProfile.native.version,
          host.workflowProfile.native.digest,
        );
      const profile = one(
        host.authority
          .prepare(
            `SELECT profile_name, profile_digest, projection_schema, projection_json,
                    native_profile_id, native_profile_version, native_profile_digest
             FROM workflow_profiles WHERE profile_id = ? AND profile_version = ?`,
          )
          .all(host.workflowProfile.projection.id, host.workflowProfile.projection.version) as SqlRow[],
        'PROFILE_CONFLICT',
        '工作流程方案版本缺失。',
      );
      requireStore(
        asString(profile.profile_name) === host.workflowProfile.projection.name &&
          asString(profile.profile_digest) === host.workflowProfile.projection.digest &&
          asString(profile.projection_schema) === host.workflowProfile.projection.schema &&
          asString(profile.projection_json) === host.workflowProjectionJson(host.workflowProfile) &&
          asString(profile.native_profile_id) === host.workflowProfile.native.id &&
          asString(profile.native_profile_version) === host.workflowProfile.native.version &&
          asString(profile.native_profile_digest) === host.workflowProfile.native.digest,
        'PROFILE_CONFLICT',
        '工作流程方案版本冲突。',
      );
      host.authority
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
          host.workflowProfile.projection.id,
          host.workflowProfile.projection.version,
          host.workflowProfile.projection.digest,
          host.workflowProfile.native.id,
          host.workflowProfile.native.version,
          host.workflowProfile.native.digest,
          host.workflowProfile.projection.phases[0].label,
          now,
        );
      const immutableResult: ImmutableManuscriptImportResult = { commitId: input.commitId, importedAt: now, completionLabel: '稿件已导入',
        bookId, manuscriptId, branchId, revisionId, importRecordId, source: draftSourceProjection(snapshot),
        fidelityReview: { fidelityReviewId, outcome: plan.outcome, categories: reviewedFidelity },
        importRecord: { importRecordId, fidelityReviewId, degradationDecision: degradationDecisionId
          ? { degradationDecisionId, summaryLabel: '含已接受的降级', acceptedItems: plan.degradations } : null } };
      if (word !== undefined) host.authority.prepare(`INSERT INTO import_commits(commit_id, draft_id, request_fingerprint,
        expected_draft_version, review_digest, operation_kind, result_json, committed_at) VALUES (?, ?, ?, ?, ?, 'manuscript-import', ?, ?)`)
        .run(input.commitId, input.draftId, requestFingerprint, input.expectedDraftVersion, input.reviewDigest, canonicalJson(immutableResult), now);
      host.authority
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
        return immutableResult;
      }, (branchId) => host.boundedCall(() => host.boundedAuthority.initializeImportedBranch(branchId)));
      ({ blockCount, unmappedBlocks } = written);
      const immutableResult = written.between;
      // Issue #411 (D5): the file's comments and tracked changes become 批注 and 修改建议 on r1 in this same
      // transaction, whose source is the file's author — all of them, or no import. A staged body block keeps
      // its identity in r1 whether or not text boxes were merged.
      const stagedBlockId = host.authority.prepare('SELECT staged_block_id FROM staged_import_blocks WHERE draft_id = ? AND position = ?');
      const importedMarks = word !== undefined ? host.commitWordEvidence(word, { bookId, sourceVersionId, commitId: input.commitId,
        fidelityReviewId, revisionId, branchId, reviewDigest: input.reviewDigest, createdAt: now }) :
        host.importedMarkCall(() => createImportedMarks(host.authority, host.editorialMarks, input.draftId, {
        manuscriptId,
        branchId,
        blockIdOf: (position) => asString(one(stagedBlockId.all(input.draftId, position) as SqlRow[],
          'IMPORT_MARK_ANCHOR_FAILED', '文件中的批注或修订无法准确落在稿件文字上，本次导入没有提交。').staged_block_id),
      }));
      requireStore(importedMarks === plan.importedMarks, 'IMPORT_POSTCONDITION_FAILED', '导入的批注与修改建议与保真审阅的数量不一致。');

      result = { ...immutableResult, overview: host.getBookOverview(bookId) };
      if (word === undefined) host.authority
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
      const draftUpdate = host.authority
        .prepare(
          `UPDATE import_drafts
           SET state = 'committed', committed_commit_id = ?, committed_at = ?
           WHERE draft_id = ? AND state = 'reviewed' AND draft_version = ? AND review_digest = ?`,
        )
        .run(input.commitId, now, input.draftId, input.expectedDraftVersion, input.reviewDigest);
      requireStore(draftUpdate.changes === 1, 'DRAFT_VERSION_CHANGED', '导入草稿在提交时已变化。');
      const attemptUpdate = host.authority
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

      host.assertImportPostconditions({
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
        blockCount,
        characterCount,
        reviewDigest: input.reviewDigest,
        fidelityPlan: plan,
        fidelityCategoryCount: reviewedFidelity.length,
        unmappedBlocks,
        sourceDigest: snapshot.sourceDigest,
        sourceBytes: snapshot.sourceBytes,
        conversion: snapshot.conversion,
        parserIdentity: snapshot.parserIdentity!,
        ...(word === undefined ? {} : { word: { commitId: input.commitId, compiled: word.compiled,
          noteCount: word.reading.blocks.filter((block) => block.kind === 'note').length } }),
      });
      host.authority.prepare('DELETE FROM staged_import_snapshots WHERE draft_id = ?').run(input.draftId);
      host.assertForeignKeys(host.authority);
    });

    requireStore(result, 'COMMIT_FAILED', '导入提交未产生结果。');
    const firstWindow = host.getManuscriptWindow(result.manuscriptId, result.branchId, null);
    return { ...result, firstWindow };
  }

export async function commitSourceImport(host: ImportIntakeOperationsHost, input: {
      draftId: string;
      expectedDraftVersion: number;
      reviewDigest: string;
      commitId: string;
    }, options: { interruptAfterAttempt?: boolean } = {}): Promise<SourceImportCommitProjection> {
    host.assertAvailable();
    requireStore(
      UUID_PATTERN.test(input.draftId) && UUID_PATTERN.test(input.commitId) && DIGEST_PATTERN.test(input.reviewDigest),
      'COMMIT_INVALID',
      '来源导入提交参数无效。',
    );
    host.requireNoAbandonmentCleanupIntent(input.draftId);
    const requestFingerprint = commitRequestFingerprint('source-import', input);
    const existingAttempt = host.loadCommitAttemptForDraft(input.draftId);
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
      const reconciliation = await host.reconcileCommitAttempt(existingAttempt);
      if (reconciliation.state === 'committed') {
        requireStore(reconciliation.result.completionLabel === '来源材料已导入', 'IDEMPOTENCY_CONFLICT', '提交类型与来源导入不一致。');
        return reconciliation.result;
      }
      requireStore(reconciliation.state === 'uncommitted', 'IMPORT_COMMIT_OUTCOME_UNCERTAIN', '来源导入提交结果待确认。');
    }

    const snapshotBeforeAttempt = host.loadDraftSnapshot(input.draftId);
    requireStore(snapshotBeforeAttempt.state === 'reviewed', 'DRAFT_NOT_REVIEWED', '来源导入草稿尚未完成复核。');
    requireStore(snapshotBeforeAttempt.version === input.expectedDraftVersion, 'DRAFT_VERSION_CHANGED', '导入草稿版本已变化。');
    requireStore(snapshotBeforeAttempt.reviewDigest === input.reviewDigest, 'REVIEW_CHANGED', '来源导入复核摘要已变化。');
    const revalidated = await host.revalidateSnapshot(snapshotBeforeAttempt);
    requireStore(!revalidated.parserDrift, 'REVIEW_CHANGED', '解析器状态已变化，请重新复核来源导入。');
    const snapshotForAttempt = revalidated.snapshot;
    const identityFindingsForAttempt = host.identityFindings(snapshotForAttempt);
    requireStore(
      host.reconstructReviewedSourceImportTarget(snapshotForAttempt, identityFindingsForAttempt) !== null,
      'REVIEW_CHANGED',
      '来源导入复核无法由当前权威状态重建。',
    );
    if (!existingAttempt) {
      const preparedAt = new Date().toISOString();
      host.transaction(host.authority, () => {
        host.authority.prepare(
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
    host.transaction(host.authority, () => {
      const existing = host.authority.prepare(
        'SELECT request_fingerprint, operation_kind FROM import_commits WHERE commit_id = ?',
      ).all(input.commitId) as SqlRow[];
      if (existing.length === 1) {
        requireStore(
          asString(existing[0]!.request_fingerprint) === requestFingerprint &&
            asString(existing[0]!.operation_kind) === 'source-import',
          'IDEMPOTENCY_CONFLICT',
          '提交标识已用于另一项导入。',
        );
        const stored = host.loadStoredCommitResult(input.commitId);
        requireStore(stored.completionLabel === '来源材料已导入', 'IDEMPOTENCY_CONFLICT', '提交类型与来源导入不一致。');
        result = stored;
        return;
      }
      requireStore(existing.length === 0, 'STORE_CORRUPT', '提交标识记录不唯一。');

      const snapshot = host.loadDraftSnapshot(input.draftId);
      requireStore(snapshot.state === 'reviewed', 'DRAFT_NOT_REVIEWED', '来源导入草稿尚未完成复核。');
      requireStore(snapshot.version === input.expectedDraftVersion, 'DRAFT_VERSION_CHANGED', '导入草稿版本已变化。');
      requireStore(snapshot.reviewDigest === input.reviewDigest, 'REVIEW_CHANGED', '来源导入复核摘要已变化。');
      const identityFindings = host.identityFindings(snapshot);
      const target = host.reconstructReviewedSourceImportTarget(snapshot, identityFindings);
      requireStore(target !== null, 'REVIEW_CHANGED', '来源导入复核无法由当前权威状态重建。');
      // Only a parsed draft has a staged snapshot to assert integrity over; a retained original has
      // its exact bytes and nothing else (ADR 0072 §2).
      if (snapshot.parserIdentity !== null) {
        host.boundedCall(() => host.boundedAuthority.assertStagedDraftIntegrity(input.draftId));
      }

      const now = new Date().toISOString();
      const bookId = target.bookId;
      const dimensionSetId = target.kind === 'existing-book' ? target.dimensionSetId : randomUUID();
      const sourceVersionId = target.sourceVersionDisposition === 'reused-same-book'
        ? target.reuseSourceVersionId!
        : randomUUID();
      const provenanceId = randomUUID();
      const sourceImportRecordId = randomUUID();
      const before = target.kind === 'existing-book' ? host.sourceImportAuthorityCounts(bookId) : null;

      if (target.kind === 'new-book') {
        host.authority.prepare(
          'INSERT INTO books(book_id, stable_identity, title, created_at, internal_number) VALUES (?, ?, ?, ?, NULL)',
        ).run(bookId, target.stableIdentity, target.confirmedTitle, now);
        host.insertBookDimensionSet(dimensionSetId, bookId, now);
      } else {
        const current = host.bookSourceImportTarget(bookId, snapshot.sourceDigest);
        requireStore(
          current.bookStateDigest === target.bookStateDigest && current.dimensionSetId === target.dimensionSetId &&
            current.exactSourceVersionId === target.reuseSourceVersionId,
          'REVIEW_CHANGED',
          '所选图书、维度集、稿件状态或来源版本已变化。',
        );
      }

      if (target.sourceVersionDisposition === 'created') {
        host.authority.prepare(
          `INSERT INTO source_versions(
             source_version_id, book_id, object_digest, source_digest, content_digest, structure_digest,
             parser_identity, format, display_name, created_at, working_object_digest, converter_identity
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          sourceVersionId,
          bookId,
          snapshot.objectDigest,
          snapshot.sourceDigest,
          snapshot.contentDigest,
          snapshot.structureDigest,
          snapshot.parserIdentity,
          snapshot.sourceFormat,
          snapshot.displayName,
          now,
          snapshot.workingObjectDigest,
          snapshot.conversion?.converterIdentity ?? null,
        );
      } else {
        const source = one(host.authority.prepare(
          `SELECT book_id, object_digest, source_digest, content_digest, structure_digest,
                  parser_identity, format
           FROM source_versions WHERE source_version_id = ?`,
        ).all(sourceVersionId) as SqlRow[], 'SOURCE_VERSION_REUSE_INVALID', '明确选择的来源版本不存在。');
        requireStore(
          asString(source.book_id) === bookId && asString(source.object_digest) === snapshot.objectDigest &&
            asString(source.source_digest) === snapshot.sourceDigest &&
            host.nullableString(source.content_digest) === snapshot.contentDigest &&
            host.nullableString(source.structure_digest) === snapshot.structureDigest &&
            host.nullableString(source.parser_identity) === snapshot.parserIdentity &&
            asString(source.format) === snapshot.sourceFormat,
          'SOURCE_VERSION_REUSE_INCOMPATIBLE',
          '明确选择的同图书来源版本与当前完整文件及解析身份不一致。',
        );
      }

      host.authority.prepare(
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
      host.authority.prepare(
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

      const receiptRecords = host.sourceImportRecordPresentations(bookId, [sourceImportRecordId]);
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
        source: host.stagedProjection(snapshot).source,
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
        overview: host.getBookOverview(bookId),
      };
      host.authority.prepare(
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
      const draftUpdate = host.authority.prepare(
        `UPDATE import_drafts
         SET state = 'committed', committed_commit_id = ?, committed_at = ?
         WHERE draft_id = ? AND state = 'reviewed' AND draft_version = ? AND review_digest = ?`,
      ).run(input.commitId, importedAt, input.draftId, input.expectedDraftVersion, input.reviewDigest);
      requireStore(draftUpdate.changes === 1, 'DRAFT_VERSION_CHANGED', '来源导入草稿在提交时已变化。');
      const attemptUpdate = host.authority.prepare(
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

      const after = host.sourceImportAuthorityCounts(bookId);
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
      host.authority.prepare('DELETE FROM staged_import_snapshots WHERE draft_id = ?').run(input.draftId);
      host.assertForeignKeys(host.authority);
    });

    requireStore(result !== undefined, 'COMMIT_FAILED', '来源导入提交未产生结果。');
    return result;
  }

export function invalidateReview(host: ImportIntakeOperationsHost, snapshot: DraftSnapshot): DraftSnapshot {
    requireStore(snapshot.state === 'reviewed', 'DRAFT_STATE_CHANGED', '只有已复核草稿可以失效旧复核。');
    const nextVersion = snapshot.version + 1;
    host.transaction(host.authority, () => {
      host.authority.prepare('DELETE FROM manuscript_reimport_comparisons WHERE draft_id = ?').run(snapshot.draftId);
      const update = host.authority
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
      host.authority.prepare("DELETE FROM import_commit_attempts WHERE draft_id = ? AND state = 'prepared'").run(snapshot.draftId);
    });
    return host.loadDraftSnapshot(snapshot.draftId);
}
