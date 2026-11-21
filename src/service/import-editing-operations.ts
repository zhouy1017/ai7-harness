import type { DatabaseSync } from 'node:sqlite';
import type { ReturnImportToEditingProjection, ImportEditingChoices } from '../shared/protocol/import-intake.js';
import type { ImportIntakeOperationsHost } from './import-intake-operations.js';
import type { CommitAttempt } from './import-review-records.js';
import { createReimportReviewDigest, degradationReview } from './import-review-records.js';
import { reimportEvidence, reimportReviewProjection, reconstructReviewedReimportTarget, type ManuscriptReimportOperationsHost } from './manuscript-reimport-operations.js';
import { requireStore, StoreError, UUID_PATTERN } from './store-records.js';

/** Draft work may change only before any committed or uncertain evidence exists. */
export function requireUncommittedImportDraft(host: {
  authority: DatabaseSync;
  requireNoAbandonmentCleanupIntent: (draftId: string) => void;
  loadCommitAttemptForDraft: (draftId: string) => CommitAttempt | null;
}, draftId: string): void {
  try { host.requireNoAbandonmentCleanupIntent(draftId); } catch (error) {
    if (error instanceof StoreError && error.code === 'ABANDON_CLEANUP_PENDING') {
      throw new StoreError('ABANDON_CLEANUP_PENDING', '这次导入正在取消，请在导入页重试取消。');
    }
    throw error;
  }
  const attempt = host.loadCommitAttemptForDraft(draftId);
  requireStore(attempt?.state !== 'uncertain', 'IMPORT_COMMIT_OUTCOME_UNCERTAIN',
    '上次导入是否完成还在确认，请重新打开 AI7 后查看导入结果。');
  requireStore(attempt?.state !== 'committed' && host.authority.prepare('SELECT 1 FROM import_commits WHERE draft_id = ?').get(draftId) === undefined,
    'DRAFT_STATE_CHANGED', '这次导入已经完成，请从稿件页导入新版本。');
}

export function returnImportToEditing(host: ImportIntakeOperationsHost, reimport: ManuscriptReimportOperationsHost,
  draftId: string, expectedDraftVersion: number): ReturnImportToEditingProjection {
  host.assertAvailable();
  requireStore(UUID_PATTERN.test(draftId), 'DRAFT_INVALID', '导入草稿标识无效。');
  requireUncommittedImportDraft(host, draftId);
  requireStore(![...reimport.reimportPreparationWork.values(), ...reimport.reimportResolutionWork.values()]
    .some((work) => work.draftId === draftId) && !Array.from(reimport.reimportCommitWork.values()).some((work) => work.input.draftId === draftId),
    'SERVICE_BUSY', '这次导入还在处理中，请等待完成或取消当前操作后再返回修改。');
  const snapshot = host.loadDraftSnapshot(draftId);
  requireStore(snapshot.version === expectedDraftVersion, 'DRAFT_VERSION_CHANGED', '导入进度已更新，请使用最新显示的选择继续。');
  requireStore(snapshot.state === 'reviewed', 'DRAFT_STATE_CHANGED', '请先打开导入详情，再返回修改。');
  const nextVersion = snapshot.version + 1;
  let reviewDigest: string | null = null;
  let editingChoices: ImportEditingChoices | null = null;
  if (snapshot.reviewedRelationship !== 'reimport') {
    const findings = host.identityFindings(snapshot);
    if (snapshot.reviewedRelationship === 'source-only') {
      const target = host.reconstructReviewedSourceImportTarget(snapshot, findings);
      requireStore(target !== null, 'REVIEW_CHANGED', '导入目标已变化，请重新选择导入目标。');
      const review = host.sourceImportReviewProjection(snapshot, target, findings, null);
      editingChoices = { target: review.target, relationship: 'source-only', title: snapshot.reviewedTitle,
        textBoxDisposition: null, trackedChanges: null, structure: null, acceptance: false };
    } else {
      const prior = host.reconstructReviewedImport(snapshot, findings);
      requireStore(prior !== null, 'REVIEW_CHANGED', '导入目标已变化，请重新选择导入目标。');
      const review = host.reviewProjection(snapshot, snapshot.reviewDigest, prior.reviewed, true, prior.target, findings, null);
      editingChoices = { target: review.target, relationship: 'first-manuscript', title: snapshot.reviewedTitle,
        textBoxDisposition: review.textBoxDisposition, trackedChanges: review.trackedChanges ?? null,
        structure: review.structure?.choice ?? null, acceptance: review.degradationDecision.state === 'accepted-complete-set' };
    }
  }
  if (snapshot.reviewedRelationship === 'reimport') {
    const target = reconstructReviewedReimportTarget(reimport, snapshot);
    requireStore(target !== null, 'REVIEW_CHANGED', '稿件已变化，请重新比较新旧稿件后再修改。');
    const evidence = reimportEvidence(reimport, draftId);
    const currentReview = reimportReviewProjection(reimport, snapshot, target, null);
    reviewDigest = createReimportReviewDigest({ ...snapshot, version: nextVersion }, target,
      evidence.comparisonDigest, evidence.resolutionDigest,
      degradationReview(reimport.reimportFidelity(snapshot).plan, currentReview.degradationDecision.state === 'accepted-complete-set').state);
  }
  host.transaction(host.authority, () => {
    const update = reviewDigest === null
      ? host.authority.prepare(`UPDATE import_drafts SET state = 'staged', draft_version = ?,
          reviewed_title = NULL, reviewed_target_choice_id = NULL, reviewed_target_kind = NULL,
          reviewed_existing_book_id = NULL, reviewed_relationship = NULL, reviewed_book_state_digest = NULL,
          reviewed_reuse_source_version_id = NULL, review_digest = NULL, reviewed_at = NULL
          WHERE draft_id = ? AND state = 'reviewed' AND draft_version = ?`).run(nextVersion, draftId, expectedDraftVersion)
      : host.authority.prepare(`UPDATE import_drafts SET draft_version = ?, review_digest = ?, reviewed_at = ?
          WHERE draft_id = ? AND state = 'reviewed' AND draft_version = ?`)
          .run(nextVersion, reviewDigest, new Date().toISOString(), draftId, expectedDraftVersion);
    requireStore(update.changes === 1, 'DRAFT_VERSION_CHANGED', '导入进度已更新，请使用最新显示的选择继续。');
    host.authority.prepare("DELETE FROM import_commit_attempts WHERE draft_id = ? AND state = 'prepared'").run(draftId);
  });
  const refreshed = host.loadDraftSnapshot(draftId);
  if (reviewDigest === null) return { state: 'staged', draftVersion: nextVersion, staged: host.stagedProjection(refreshed), editingChoices: editingChoices! };
  const target = reconstructReviewedReimportTarget(reimport, refreshed);
  requireStore(target !== null, 'REVIEW_CHANGED', '稿件已变化，请重新比较新旧稿件后再修改。');
  return { state: 'reimport', draftVersion: nextVersion, review: reimportReviewProjection(reimport, refreshed, target, null) };
}
