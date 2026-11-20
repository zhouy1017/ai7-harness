import type { DatabaseSync } from 'node:sqlite';
import type {
  ApplyChangeSuggestionBatchInput,
  ApplyChangeSuggestionInput,
  ApplyReceiptProjection,
  BatchProposalDecisionDraftInput,
  CreateEditorialMarkInput,
  EditorialMarkCardProjection,
  EditorialMarkCommandProjection,
  FactualCorrectionLineageProjection,
  FindPendingMarkInput,
  InspectApplyReceiptInput,
  ManuscriptApplyCommandProjection,
  ManuscriptApplyOutcomeProjection,
  PendingMarkPlace,
  PrepareReverseApplyInput,
  ProposalConflictBindingInput,
  ProposalConflictDraftSaveProjection,
  ProposalConflictProjection,
  ProposalConflictResolutionProjection,
  ProposalDraftBatchProjection,
  ProposalWorkspaceInput,
  ProposalWorkspaceProjection,
  RecordChangeSuggestionDecisionInput,
  RecordProposalDecisionFeedbackInput,
  RecordProposalDecisionInput,
  RecordProposalDecisionReasonInput,
  ResolveProposalConflictInput,
  ReverseAppliedChangeSuggestionInput,
  ReverseApplyPreparationProjection,
  SaveProposalConflictDraftInput,
  SaveProposalDecisionDraftInput,
  UpdateEditorialMarkInput,
} from '../shared/protocol.js';
import type { AiEditLocksProjection, InspectAiEditLocksInput, SetAiEditLocksInput } from '../shared/protocol/scoped-edit.js';
import type { CommitReplacementRevisionsInput, ReplacementRevisionsProjection } from '../shared/protocol/series.js';
import { aiLockedMarkRefusal, inspectAiEditLocks as inspectLocks, scopedEditWorkingBlocks as workingBlocksWithLocks, setAiEditLocks as setLocks } from './ai-edit-locks.js';
import type { BoundedManuscriptStore } from './bounded-manuscript.js';
import type { EditorialMarkStore, ProducedEditorialMarkInput } from './editorial-marks.js';
import { decideInlineEditorRevision } from './inline-editor-revisions.js';
import type { ManuscriptApplyStore } from './manuscript-apply.js';
import type { ProposalConflictRegenerationLineage, ProposalConflictStore } from './proposal-conflicts.js';
import { commitReplacementAsRevisions } from './replacement-revisions.js';
import { requireStore } from './store-records.js';

/**
 * Editorial Marks, their Proposal Decisions, AI7 Apply and its receipts, inline editor revisions, replacement revisions,
 * AI edit locks and Proposal Conflicts (Issue #1536): the operations `EditorialStore` delegates, over the owners it
 * builds. The store keeps the connection, the transaction and the error wrappers; each operation calls them exactly
 * where the store did.
 */
export interface EditorialMarkOperationsHost {
  readonly authority: DatabaseSync;
  readonly boundedAuthority: BoundedManuscriptStore;
  readonly lifetimeId: string;
  readonly editorialMarks: EditorialMarkStore;
  readonly manuscriptApply: ManuscriptApplyStore;
  readonly proposalConflicts: ProposalConflictStore;
  markCall<T>(operation: () => T): T;
  conflictCall<T>(operation: () => T): T;
  boundedCall<T>(operation: () => T): T;
  transaction<T>(db: DatabaseSync, operation: () => T): T;
  /** A Correction Proposal's factual lineage, read through the store's verification wrapper. */
  factualLineageOfMark(markId: string): FactualCorrectionLineageProjection | null;
}

/**
 * Editorial Marks (Issue #407). They are records of the work, written on the authority connection;
 * none of these changes a character of the manuscript, and a Proposal Decision is recorded apart
 * from the item it decides.
 */
export function createEditorialMark(host: EditorialMarkOperationsHost, input: CreateEditorialMarkInput): EditorialMarkCommandProjection {
  return host.markCall(() => host.editorialMarks.create(input));
}

export function getEditorialMarkCard(host: EditorialMarkOperationsHost, manuscriptId: string, branchId: string, markId: string): EditorialMarkCardProjection {
  const card = host.markCall(() => host.editorialMarks.card(manuscriptId, branchId, markId));
  // A Correction Proposal's 修改建议 carries its factual lineage into 依据与核查 (Issue #901; CORR-012, EASSURE-012).
  const lineage = host.factualLineageOfMark(card.markId);
  return lineage === null ? card : { ...card, factualCorrection: lineage };
}

/** 上一条 / 下一条待处理 under a filter (Issue #1604): a read of the Book's open marks, outside any write. */
export function findPendingMark(host: EditorialMarkOperationsHost, input: FindPendingMarkInput): { mark: PendingMarkPlace | null } {
  return host.markCall(() => host.editorialMarks.findPending(input));
}

export function updateEditorialMark(host: EditorialMarkOperationsHost, input: UpdateEditorialMarkInput): EditorialMarkCommandProjection {
  if (input.action === 'apply-inline-revision' || input.action === 'revert-inline-revision') {
    return host.markCall(() => host.boundedCall(() => decideInlineEditorRevision(host.authority, host.boundedAuthority, host.lifetimeId, input)));
  }
  return host.markCall(() => host.editorialMarks.update(input));
}

export function recordChangeSuggestionDecision(host: EditorialMarkOperationsHost, input: RecordChangeSuggestionDecisionInput): EditorialMarkCommandProjection {
  return host.markCall(() => host.editorialMarks.decide(input));
}

export function recordProposalDecisionReason(host: EditorialMarkOperationsHost, input: RecordProposalDecisionReasonInput): EditorialMarkCommandProjection {
  return host.markCall(() => host.editorialMarks.recordDecisionReason(input));
}

/** `不说明` or `改原因` after a Proposal Decision (Issue #61, S26a). */
export function recordProposalDecisionFeedback(host: EditorialMarkOperationsHost, input: RecordProposalDecisionFeedbackInput): EditorialMarkCommandProjection {
  return host.markCall(() => host.editorialMarks.recordDecisionFeedback(input));
}

/**
 * AI7 Apply for Change Suggestions (Issue #408): the one path by which a suggestion's text reaches
 * the manuscript, each commit written with its Effect Receipt in one transaction on the authority
 * connection.
 */
export function applyChangeSuggestion(host: EditorialMarkOperationsHost, input: ApplyChangeSuggestionInput): ManuscriptApplyCommandProjection {
  refuseAiLocked(host, input.branchId, [input.markId]);
  return host.markCall(() => host.boundedCall(() => host.manuscriptApply.apply(input)));
}

export function applyChangeSuggestionBatch(host: EditorialMarkOperationsHost, input: ApplyChangeSuggestionBatchInput): ManuscriptApplyCommandProjection {
  refuseAiLocked(host, input.branchId, input.markIds);
  return host.markCall(() => host.boundedCall(() => host.manuscriptApply.applyBatch(input)));
}

/** 🔒 锁定 (Issue #1412): an AI7 suggestion is never applied to a block locked now, whichever task made it. */
function refuseAiLocked(host: EditorialMarkOperationsHost, branchId: unknown, markIds: unknown): void {
  if (typeof branchId !== 'string' || !Array.isArray(markIds) || !markIds.every((markId) => typeof markId === 'string')) return;
  const refusal = host.markCall(() => aiLockedMarkRefusal(host.authority, branchId, markIds as string[]));
  requireStore(refusal === null, 'AI_EDIT_LOCKED', refusal ?? '');
}

/**
 * 全部替换 as per-occurrence revision cards (Issue #1411): Lane 3A's `commitReplacementAsRevisions` in
 * `./replacement-revisions.js`, on the authority connection the marks and the Apply records write through, so every
 * occurrence's revision is written in one transaction or none is.
 */
export function commitReplacementRevisions(host: EditorialMarkOperationsHost, input: CommitReplacementRevisionsInput): ReplacementRevisionsProjection {
  return host.markCall(() => host.boundedCall(() => commitReplacementAsRevisions({
    db: host.authority, manuscript: host.boundedAuthority, marks: host.editorialMarks, apply: host.manuscriptApply,
  }, input)));
}

/** 🔒 锁定 (Issue #1412): a manuscript branch's AI edit locks. */
export function inspectAiEditLocks(host: EditorialMarkOperationsHost, input: InspectAiEditLocksInput): AiEditLocksProjection {
  return host.markCall(() => inspectLocks(host.authority, input));
}

/** Lock or unlock blocks or sections against the lock set the editor saw; one appended row per changed target. */
export function setAiEditLocks(host: EditorialMarkOperationsHost, input: SetAiEditLocksInput): AiEditLocksProjection {
  return host.markCall(() => setLocks(host.authority, input, (work) => host.transaction(host.authority, work)));
}

/** The working blocks a scoped AI edit reads, with their locks now (Issue #1412): a read of the authority's working state. */
export function scopedEditWorkingBlocks(host: EditorialMarkOperationsHost, manuscriptId: string, branchId: string,
  selector: Parameters<typeof workingBlocksWithLocks>[2]): ReturnType<typeof workingBlocksWithLocks> {
  return host.markCall(() => {
    requireStore(host.authority.prepare('SELECT 1 FROM manuscript_branches WHERE manuscript_id = ? AND branch_id = ?').get(manuscriptId, branchId) !== undefined,
      'MANUSCRIPT_NOT_FOUND', '稿件不存在。');
    return workingBlocksWithLocks(host.authority, branchId, selector);
  });
}

export function reverseAppliedChangeSuggestion(host: EditorialMarkOperationsHost, input: ReverseAppliedChangeSuggestionInput): ManuscriptApplyCommandProjection {
  return host.markCall(() => host.boundedCall(() => host.manuscriptApply.reverse(input)));
}

export function inspectProposalWorkspace(host: EditorialMarkOperationsHost, input: ProposalWorkspaceInput): ProposalWorkspaceProjection { return host.markCall(() => host.editorialMarks.inspectProposalWorkspace(input)); }
export function saveProposalDecisionDraft(host: EditorialMarkOperationsHost, input: SaveProposalDecisionDraftInput): ProposalWorkspaceProjection { return host.markCall(() => host.editorialMarks.saveProposalDecisionDraft(input)); }
export function batchProposalDecisionDraft(host: EditorialMarkOperationsHost, input: BatchProposalDecisionDraftInput): ProposalDraftBatchProjection { return host.markCall(() => host.editorialMarks.batchProposalDecisionDraft(input)); }
export function recordProposalDecision(host: EditorialMarkOperationsHost, input: RecordProposalDecisionInput): ProposalWorkspaceProjection { return host.markCall(() => host.editorialMarks.recordProposalDecision(input)); }
export function inspectApplyReceipt(host: EditorialMarkOperationsHost, input: InspectApplyReceiptInput): ApplyReceiptProjection { return host.markCall(() => host.manuscriptApply.inspectApplyReceipt(input)); }
export function prepareReverseApply(host: EditorialMarkOperationsHost, input: PrepareReverseApplyInput): ReverseApplyPreparationProjection { return host.markCall(() => host.manuscriptApply.prepareReverseApply(input)); }
export function getManuscriptApplyOutcome(host: EditorialMarkOperationsHost, manuscriptId: string, branchId: string, clientEffectId: string): ManuscriptApplyOutcomeProjection {
  return host.markCall(() => host.manuscriptApply.outcome(manuscriptId, branchId, clientEffectId));
}

/** A mark AI7 or an import produces; the manuscript surface is never its caller. */
export function createProducedEditorialMark(host: EditorialMarkOperationsHost, input: ProducedEditorialMarkInput): string {
  return host.markCall(() => host.editorialMarks.createProduced(input));
}

/**
 * Several marks AI7 produces in one transaction (润色这段, Issue #842), each verified as one is: an input whose words no longer
 * stand at its range is `null` in the list, and `record` receives the list inside the same transaction.
 */
export function createProducedEditorialMarks<T>(host: EditorialMarkOperationsHost, inputs: ReadonlyArray<ProducedEditorialMarkInput>,
  record: (markIds: ReadonlyArray<string | null>) => T): T {
  return host.markCall(() => host.editorialMarks.createProducedMany(inputs, record));
}

/** The Three-way Proposal Conflict of one 修改建议, read against the working state as it is now. */
export function inspectProposalConflict(host: EditorialMarkOperationsHost, input: ProposalConflictBindingInput): ProposalConflictProjection {
  return host.conflictCall(() => host.proposalConflicts.inspect(input));
}

/** Save the Resolution Draft on exactly the basis the editor saw; the manuscript is untouched. */
export function saveProposalConflictDraft(host: EditorialMarkOperationsHost, input: SaveProposalConflictDraftInput): ProposalConflictDraftSaveProjection {
  return host.conflictCall(() => host.proposalConflicts.saveDraft(input));
}

/** 基于当前稿件重新生成建议 (Issue #842): its Resolution Draft, saved as any other with the regeneration's lineage beside it. */
export function saveRegeneratedProposalConflictDraft(host: EditorialMarkOperationsHost, input: SaveProposalConflictDraftInput,
  lineage: ProposalConflictRegenerationLineage): ProposalConflictDraftSaveProjection {
  return host.conflictCall(() => host.proposalConflicts.saveDraft(input, lineage));
}

/** 保留当前稿件, 暂不处理, or 保存为新提案版本 — none of which writes the manuscript. */
export function resolveProposalConflict(host: EditorialMarkOperationsHost, input: ResolveProposalConflictInput): ProposalConflictResolutionProjection {
  return host.conflictCall(() => host.proposalConflicts.resolve(input));
}
