import type { DatabaseSync } from 'node:sqlite';
import {
  resolveMilestonePurpose,
  type DurableHistoryProjection,
  type EditorHistoryProjection,
  type ManuscriptHistoryInput,
  type JournalAcknowledgement,
  type JournalEditInput,
  type ManuscriptEntryPositionProjection,
  type ManuscriptWindowProjection,
  type ManuscriptWindowTarget,
  type OutlineProjection,
  type ReplacementPreviewProjection,
  type SearchResultsProjection,
  type SearchSummaryProjection,
  type HistoricalRevisionProjection,
  type ManuscriptRailProjection,
  type MilestoneProjection,
  type MilestonePurposeKind,
  type RecoveryComparisonProjection,
  type RecoveryRestorationProjection,
  type RecoverySelection,
  type RecoveryWindowProjection,
  type RecoveryWindowTarget,
  type ReplacementCommitProjection,
  type ReplacementDismissalProjection,
} from '../../shared/protocol.js';
import type {
  BoundedManuscriptStore,
  ManualCommandSource,
  RecoverySnapshotCursor,
  RecoverySnapshotRecord,
  VerifiedRecoverySnapshot,
} from '../bounded-manuscript.js';
import type { RecoveryObjectStore } from '../recovery-objects.js';
import { EditorialMarkError } from '../editorial-marks.js';
import type { ManuscriptApplyStore } from '../manuscript-apply.js';
import { editorStepSummary, replayEditorStep, type EditorStepHost } from './editor-steps.js';
import { asNumber, asString, requireStore, StoreError, type SqlRow } from '../store-records.js';

/**
 * The Manuscript's windows and places, and its history — undo, redo, Historical Revisions, milestones with their
 * recovery snapshots, and recovery (Issue #1536): the operations `EditorialStore` delegates. The store keeps the
 * connections, the bounded wrapper that poisons it and the recovery-object lifecycle; each operation calls them
 * exactly where the store did. The history half is the storage-facing interface R5 replaces behind these names.
 */
export interface ManuscriptOperationsHost {
  readonly authority: DatabaseSync;
  /** The bounded manuscript store on the journal connection, as the editor's reads and edits use it. */
  readonly bounded: BoundedManuscriptStore;
  /** The bounded manuscript store on the authority connection. */
  readonly boundedAuthority: BoundedManuscriptStore;
  readonly recoveryObjects: RecoveryObjectStore;
  /** The Apply owner on the authority connection, which an editor step's Effects are written through (Issue #1654). */
  readonly manuscriptApply: ManuscriptApplyStore;
  readonly lifetimeId: string;
  assertAvailable(): void;
  boundedCall<T>(operation: () => T): T;
  withRecoveryObjectLifecycle<T>(operation: () => Promise<T>): Promise<T>;
  /** A manual command's learning capture, on the journal connection, under the launch scope read when it is called. */
  captureManual(source: ManualCommandSource): void;
  /** The Book's latest baseline Result Set Revision; it may throw, and the rail reads a throw as nothing to show. */
  analysisResultSetRevision(bookId: string): { readonly gaps: ReadonlyArray<{ readonly blockIds: ReadonlyArray<string>; readonly reason: string }> } | null;
  cancelReplacement(previewId: string): boolean;
  /** Admit one edit-journal write to the store's WAL checkpoint policy (its worker when one runs), before the write. */
  admitJournalWrite(): void;
  /** Tell the checkpoint worker, when one runs, that the admitted journal write is durable. */
  journalWritten(): void;
}

// ---- Windows, places, the edit journal, search and replacement ---------------------------------------------------------------------------------------

export function readManuscriptImageChunk(host: ManuscriptOperationsHost, input: import('../../shared/protocol.js').ServiceOperationMap['readManuscriptImageChunk']['input']) {
  const branch = host.authority.prepare('SELECT base_revision_id FROM manuscript_branches WHERE manuscript_id = ? AND branch_id = ?')
    .get(input.manuscriptId, input.branchId) as SqlRow | undefined;
  requireStore(branch !== undefined, 'MANUSCRIPT_NOT_FOUND', '稿件不存在。');
  return host.boundedCall(() => host.boundedAuthority.sourceObjects!.imageChunk(asString(branch.base_revision_id), input.sourceVersionId, input.ordinal, input.offset));
}

/**
 * Remember where the editor is in this Manuscript, against the Revision the branch works on now.
 * The position is durable editor state, not a record of the work: it is written on the authority
 * connection and rewritten in place for the same Book and Revision.
 */
export function recordManuscriptEntryPosition(host: ManuscriptOperationsHost, manuscriptId: string, branchId: string, blockId: string, grapheme: number): void {
  host.boundedCall(() => host.boundedAuthority.recordManuscriptEntryPosition(
    manuscriptId,
    branchId,
    blockId,
    addressableGrapheme(host, branchId, blockId, grapheme),
    new Date().toISOString(),
  ));
}

/**
 * A caret resting after a block's last grapheme is a real place to leave from, but a block addresses
 * `[0, length)`, so the last addressable offset answers for it and the editor is remembered at the
 * end of that block rather than not remembered at all. A block the working state does not hold is
 * left untouched for the bounded store to refuse, which is where `稿件位置不存在` belongs.
 */
function addressableGrapheme(host: ManuscriptOperationsHost, branchId: string, blockId: string, grapheme: number): number {
  if (!Number.isSafeInteger(grapheme) || grapheme < 0) return grapheme;
  const block = host.authority.prepare(
    'SELECT grapheme_length FROM working_blocks WHERE branch_id = ? AND block_id = ?',
  ).get(branchId, blockId) as SqlRow | undefined;
  return block === undefined ? grapheme : Math.min(grapheme, Math.max(0, asNumber(block.grapheme_length) - 1));
}

/**
 * The position rail's places (Issue #409). The ranges the analysis left unread come from the latest
 * Result Set Revision's gaps; a Book never analysed has none to show, which is `null`, not empty.
 */
export function getManuscriptRail(host: ManuscriptOperationsHost, manuscriptId: string, branchId: string): ManuscriptRailProjection {
  const bookId = host.boundedCall(() => host.bounded.bookIdOf(manuscriptId, branchId));
  let unread: Array<{ blockIds: ReadonlyArray<string>; reason: string }> | null = null;
  // The Book's analysis reads its Manuscript: a Production Document's rail has no unread ranges to show (Issue #415).
  const primary = host.authority.prepare("SELECT 1 FROM manuscripts WHERE manuscript_id = ? AND role = 'primary'").get(manuscriptId) !== undefined;
  try {
    const revision = primary ? host.analysisResultSetRevision(bookId) : null;
    if (revision !== null) unread = revision.gaps.map((gap) => ({ blockIds: gap.blockIds, reason: gap.reason }));
  } catch {
    // A Book whose analysis cannot be read has no unread ranges the rail can stand behind.
    unread = null;
  }
  return host.boundedCall(() => host.bounded.getRail(manuscriptId, branchId, unread));
}

export function getManuscriptWindow(host: ManuscriptOperationsHost, manuscriptId: string, branchId: string, cursor: string | null): ManuscriptWindowProjection {
  return host.boundedCall(() =>
    host.bounded.getWindow(
      manuscriptId,
      branchId,
      cursor === null ? { kind: 'start' } : { kind: 'cursor', cursor },
    ),
  );
}

export function getManuscriptWindowAt(
  host: ManuscriptOperationsHost,
  manuscriptId: string,
  branchId: string,
  target: ManuscriptWindowTarget,
  marks?: { afterOrdinal: number; digest: string },
): ManuscriptWindowProjection {
  return host.boundedCall(() => host.bounded.getWindow(manuscriptId, branchId, target, marks));
}

/** Where the editor last was, resolved against the working state now, or `null` if never recorded. */
export function readManuscriptEntryPosition(host: ManuscriptOperationsHost, manuscriptId: string, branchId: string): ManuscriptEntryPositionProjection | null {
  return host.boundedCall(() => host.bounded.readManuscriptEntryPosition(manuscriptId, branchId));
}

export function flushJournalEdit(host: ManuscriptOperationsHost, input: JournalEditInput): JournalAcknowledgement {
  host.assertAvailable();
  host.admitJournalWrite();
  const ack = host.boundedCall(() => host.bounded.flushJournalEdit(input, host.lifetimeId, (source) =>
    host.captureManual(source)));
  host.journalWritten();
  return ack;
}

export function getOutline(host: ManuscriptOperationsHost, manuscriptId: string, branchId: string, cursor: string | null): OutlineProjection {
  return host.boundedCall(() => host.bounded.getOutline(manuscriptId, branchId, cursor));
}

export function createSearch(host: ManuscriptOperationsHost, manuscriptId: string, branchId: string, query: string): SearchSummaryProjection & {
  scannedPosition: number;
  totalBlocks: number;
} {
  return host.boundedCall(() => host.bounded.createSearch(manuscriptId, branchId, query));
}

export function advanceSearch(host: ManuscriptOperationsHost, searchId: string): {
  done: boolean;
  summary: SearchSummaryProjection;
  scannedPosition: number;
  totalBlocks: number;
} {
  return host.boundedCall(() => host.bounded.advanceSearch(searchId));
}

export function cancelSearch(host: ManuscriptOperationsHost, searchId: string): void {
  host.boundedCall(() => host.bounded.cancelSearch(searchId));
}

export function getSearchResults(host: ManuscriptOperationsHost, searchId: string, cursor: string | null): SearchResultsProjection {
  return host.boundedCall(() => host.bounded.getSearchResults(searchId, cursor));
}

export function prepareReplacement(
  host: ManuscriptOperationsHost,
  searchId: string,
  replacement: string,
  excludedMatchIds: ReadonlyArray<string>,
): ReplacementPreviewProjection {
  return host.boundedCall(() => host.bounded.prepareReplacement(searchId, replacement, excludedMatchIds));
}

export function freezeReplacement(
  host: ManuscriptOperationsHost,
  previewId: string,
  excludedMatchIds: ReadonlyArray<string>,
): ReplacementPreviewProjection {
  return host.boundedCall(() => host.bounded.freezeReplacement(previewId, excludedMatchIds));
}

export function advanceReplacementWork(host: ManuscriptOperationsHost, previewId: string): {
  phase: 'preparing' | 'validating';
  done: boolean;
  completed: number;
  total: number;
  preview: ReplacementPreviewProjection | null;
} {
  return host.boundedCall(() => host.bounded.advanceReplacementWork(previewId));
}

export function cancelReplacement(host: ManuscriptOperationsHost, previewId: string): boolean {
  return host.boundedCall(() => host.bounded.cancelReplacement(previewId));
}

export function commitReplacement(host: ManuscriptOperationsHost, previewId: string): ReplacementCommitProjection {
  return host.boundedCall(() => host.bounded.commitReplacement(previewId, host.lifetimeId, (source) =>
    host.captureManual(source)));
}

export function dismissReplacementPreview(host: ManuscriptOperationsHost, previewId: string): ReplacementDismissalProjection {
  const cancelled = host.cancelReplacement(previewId);
  requireStore(cancelled, 'REPLACEMENT_STATE_CHANGED', '替换预览已提交、失败或不再可取消。');
  return { previewId, state: 'cancelled' };
}

// ---- History: the storage-facing interface for R5 (undo, redo, revisions, milestones, recovery) -----------------

/**
 * Ctrl+Z and redo by editor step (Issue #1654), on the authority connection: a step may hold Apply Effects, which only the Apply
 * owner there writes. A refusal of the Apply owner reaches the caller as the store's own refusal.
 */
function editorStep(host: ManuscriptOperationsHost, action: 'undo' | 'redo', input: ManuscriptHistoryInput): DurableHistoryProjection {
  const binding = { manuscriptId: input.manuscriptId, branchId: input.branchId };
  const stepHost: EditorStepHost = {
    db: host.authority, ...host.boundedAuthority.editorStepHost(input.manuscriptId, input.branchId, host.lifetimeId),
    reverseEffect: (effectId, interaction) => host.manuscriptApply.reverseForStep(binding, effectId, interaction),
    reapplyEffect: (effectId, interaction) => host.manuscriptApply.reapplyForStep(binding, effectId, interaction),
  };
  try {
    return host.boundedCall(() => replayEditorStep(stepHost, action, input.expectedWorkingDigest, input.expectedStepId));
  } catch (error) {
    if (error instanceof EditorialMarkError) throw new StoreError(error.code, error.message);
    throw error;
  }
}

export function undoManuscript(host: ManuscriptOperationsHost, input: ManuscriptHistoryInput): DurableHistoryProjection {
  return editorStep(host, 'undo', input);
}

export function redoManuscript(host: ManuscriptOperationsHost, input: ManuscriptHistoryInput): DurableHistoryProjection {
  return editorStep(host, 'redo', input);
}

/** The steps Ctrl+Z and redo would take next (Issue #1654): the busy line of a large undo, and 撤销本批应用's step. */
export function inspectEditorHistory(host: ManuscriptOperationsHost, manuscriptId: string, branchId: string): EditorHistoryProjection {
  return host.boundedCall(() => {
    host.boundedAuthority.bookIdOf(manuscriptId, branchId);
    return { branchId, undo: editorStepSummary(host.authority, branchId, 'undo'), redo: editorStepSummary(host.authority, branchId, 'redo') };
  });
}

export function getHistoricalRevision(host: ManuscriptOperationsHost, revisionId: string, cursor: string | null): HistoricalRevisionProjection {
  return host.boundedCall(() => host.bounded.getHistoricalRevision(revisionId, cursor));
}

/**
 * 保存里程碑版本. The purpose is one of the four frozen purposes or the editor's own words (Issue
 * #414); either way it is stored as words — a frozen purpose as its own label — so the bounded store
 * keeps its one purpose rule and every milestone reads its kind back from what it holds.
 */
export async function saveMilestone(
  host: ManuscriptOperationsHost,
  manuscriptId: string,
  branchId: string,
  label: string,
  purposeKind: MilestonePurposeKind,
  purpose: string | null,
  note: string,
): Promise<MilestoneProjection> {
  host.assertAvailable();
  const resolved = resolveMilestonePurpose(purposeKind, purpose);
  requireStore(resolved !== null, 'MILESTONE_INVALID', '请选择里程碑用途，或自行输入 1–120 个字符。');
  let result: MilestoneProjection | undefined;
  await host.withRecoveryObjectLifecycle(async () => {
    const plan = host.boundedCall(() =>
      host.boundedAuthority.prepareMilestoneRecoverySnapshot(manuscriptId, branchId, label, resolved.purpose, note));
    const object = await host.recoveryObjects.form(
      plan,
      (afterPosition) => host.boundedCall(() =>
        host.boundedAuthority.getRecoverySnapshotBlocks(plan, afterPosition)),
    );
    try {
      result = host.boundedCall(() => host.boundedAuthority.saveMilestone(plan, object));
    } catch (error) {
      const referenced = host.boundedCall(() =>
        host.boundedAuthority.isRecoveryObjectReferenced(object.objectRelativeKey));
      await host.recoveryObjects.removeUnreferenced(object, referenced);
      throw error;
    }
  });
  requireStore(result !== undefined, 'MILESTONE_INVALID', '里程碑与恢复快照未产生结果。');
  return result;
}

async function preferredRecoverySnapshot(host: ManuscriptOperationsHost, attentionId: string): Promise<{
  verified: VerifiedRecoverySnapshot;
  record: RecoverySnapshotRecord | null;
  comparisonSnapshotId: string | null;
}> {
  let cursor: RecoverySnapshotCursor | null = null;
  let newestUnavailable: Extract<VerifiedRecoverySnapshot, { state: 'unavailable' }> | null = null;
  let newestSnapshotId: string | null = null;
  while (true) {
    const record = host.boundedCall(() =>
      host.boundedAuthority.nextRecoverySnapshotForAttention(attentionId, cursor));
    if (record === null) {
      return {
        verified: newestUnavailable ?? { state: 'none' },
        record: null,
        comparisonSnapshotId: newestSnapshotId,
      };
    }
    newestSnapshotId ??= record.snapshotId;
    const verified = await host.recoveryObjects.verify(record);
    if (verified.state === 'eligible') {
      return { verified, record, comparisonSnapshotId: record.snapshotId };
    }
    if (verified.state === 'unavailable') {
      newestUnavailable ??= verified;
    }
    cursor = { createdAt: record.createdAt, snapshotId: record.snapshotId };
  }
}

export async function getRecoveryComparison(host: ManuscriptOperationsHost, attentionId: string): Promise<RecoveryComparisonProjection> {
  host.assertAvailable();
  const { verified } = await preferredRecoverySnapshot(host, attentionId);
  return host.boundedCall(() => host.boundedAuthority.getRecoveryComparison(attentionId, verified));
}

export async function viewRecoveryCandidate(
  host: ManuscriptOperationsHost,
  attentionId: string,
  expectedAttentionVersion: number,
  selection: RecoverySelection,
  target: RecoveryWindowTarget,
): Promise<RecoveryWindowProjection> {
  host.assertAvailable();
  if (selection.kind !== 'snapshot') {
    const projection = host.boundedCall(() =>
      host.boundedAuthority.getRecoveryDatabaseWindow(attentionId, selection, target));
    host.boundedCall(() =>
      host.boundedAuthority.recordRecoveryView(attentionId, expectedAttentionVersion, selection));
    return projection;
  }
  const record = host.boundedCall(() =>
    host.boundedAuthority.recoverySnapshotByIdForAttention(attentionId, selection.snapshotId));
  let window: Awaited<ReturnType<RecoveryObjectStore['readWindow']>>;
  try {
    // readWindow performs the complete digest-bound scan while retaining only the requested bounded window.
    window = await host.recoveryObjects.readWindow(record, target);
  } catch {
    throw new StoreError('RECOVERY_SNAPSHOT_INELIGIBLE', '恢复快照未通过独立校验。');
  }
  host.boundedCall(() =>
    host.boundedAuthority.recordRecoveryView(attentionId, expectedAttentionVersion, selection));
  return {
    attentionId, selection, title: '已验证恢复快照', revisionId: record.revisionId,
    revisionLabel: record.revisionLabel, readonly: true, blocks: window.blocks, nextTarget: window.nextTarget,
  };
}

export async function restoreRecovery(
  host: ManuscriptOperationsHost,
  restorationId: string,
  attentionId: string,
  expectedAttentionVersion: number,
  selection: RecoverySelection,
): Promise<RecoveryRestorationProjection> {
  host.assertAvailable();
  const existing = host.boundedCall(() => host.boundedAuthority.existingRecoveryRestoration(
    restorationId, attentionId, expectedAttentionVersion, selection,
  ));
  if (existing !== null) return existing;
  let snapshotStageStarted = false;
  try {
    let comparisonSnapshotId: string | null;
    if (selection.kind === 'snapshot') {
      const record = host.boundedCall(() =>
        host.boundedAuthority.recoverySnapshotByIdForAttention(attentionId, selection.snapshotId));
      comparisonSnapshotId = record.snapshotId;
      host.boundedCall(() =>
        host.boundedAuthority.beginRecoverySnapshotStage(attentionId, expectedAttentionVersion, record.snapshotId));
      snapshotStageStarted = true;
      try {
        // forEachBatch verifies the complete object and leaves only bounded batches in process memory.
        await host.recoveryObjects.forEachBatch(record, (blocks) => {
          host.boundedCall(() => host.boundedAuthority.stageRecoverySnapshotBlocks(attentionId, blocks));
        });
      } catch {
        throw new StoreError('RECOVERY_SNAPSHOT_INELIGIBLE', '恢复快照未通过独立校验。');
      }
    } else {
      ({ comparisonSnapshotId } = await preferredRecoverySnapshot(host, attentionId));
    }
    return host.boundedCall(() => host.boundedAuthority.restoreRecovery(
      restorationId, attentionId, expectedAttentionVersion, selection, comparisonSnapshotId,
    ));
  } finally {
    if (snapshotStageStarted) {
      host.boundedCall(() => host.boundedAuthority.clearRecoveryStage(attentionId));
    }
  }
}
