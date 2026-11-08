import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { BoundedManuscriptStore } from './bounded-manuscript.js';
import type { EditorialMarkStore } from './editorial-marks.js';
import type { ManuscriptApplyStore } from './manuscript-apply.js';
import { transact } from './manuscript/bounded-kernel.js';
import { replacementRevisionRationale } from '../shared/editor-revision-words.js';

// 全部替换 as editor revisions (Issue #1409, #1411): every included match of a frozen, validated replacement becomes one 修改建议
// of the editor's — `编辑替换「A」→「B」` — applied at once through AI7 Apply as an Effect of its own, so each occurrence keeps a
// durable applied card with its before and after, and is undone on its own. The whole set is one transaction: a failure on any
// occurrence writes none of them and leaves the preview frozen, exactly as the single replacement command did.

export interface ReplacementRevisionsInput {
  previewId: string;
  /** The window the editor is reading, whose marks come back with each revision. */
  windowStartBlockId: string;
}

export interface ReplacementRevisionsResult {
  previewId: string;
  branchId: string;
  revisionId: string;
  journalSequence: number;
  workingDigest: string;
  replaced: number;
  markIds: ReadonlyArray<string>;
  completionLabel: string;
}

export interface ReplacementRevisionStores {
  /** The authority connection the marks, the Apply records and `manuscript` all write through. */
  readonly db: DatabaseSync;
  readonly manuscript: BoundedManuscriptStore;
  readonly marks: EditorialMarkStore;
  readonly apply: ManuscriptApplyStore;
}

export function replacementRevisionsLabel(count: number): string {
  return `已替换 ${count.toLocaleString('zh-CN')} 处；每处都留有已应用的修订卡片，可逐处撤销`;
}

export function commitReplacementAsRevisions(stores: ReplacementRevisionStores, input: ReplacementRevisionsInput): ReplacementRevisionsResult {
  return transact(stores.db, () => {
    const plan = stores.manuscript.replacementRevisionPlan(input.previewId);
    const binding = { manuscriptId: plan.manuscriptId, branchId: plan.branchId, windowStartBlockId: input.windowStartBlockId };
    const rationale = replacementRevisionRationale(plan.query, plan.replacement);
    const markIds: string[] = [];
    for (const match of plan.matches) {
      const pin = stores.manuscript.revisionPin(plan.manuscriptId, plan.branchId, match.blockId);
      const created = stores.marks.create({
        ...binding,
        clientMarkId: randomUUID(),
        baseRevisionId: pin.revisionId,
        expectedJournalSequence: pin.journalSequence,
        blockId: match.blockId,
        baseBlockDigest: pin.blockDigest,
        fromGrapheme: match.fromGrapheme,
        toGrapheme: match.toGrapheme,
        selectedText: plan.query,
        kind: 'change-suggestion',
        highlightColor: null,
        body: '',
        proposedText: plan.replacement,
        rationale,
      });
      stores.apply.apply({
        ...binding,
        markId: created.markId,
        clientEffectId: randomUUID(),
        interaction: 'accept-and-apply',
        editedText: null,
        reason: null,
      });
      markIds.push(created.markId);
    }
    stores.manuscript.closeReplacementAsRevisions(input.previewId);
    const after = stores.manuscript.revisionPin(plan.manuscriptId, plan.branchId, plan.matches[0]!.blockId);
    return {
      previewId: input.previewId,
      branchId: plan.branchId,
      revisionId: after.revisionId,
      journalSequence: after.journalSequence,
      workingDigest: after.workingDigest,
      replaced: markIds.length,
      markIds,
      completionLabel: replacementRevisionsLabel(markIds.length),
    };
  });
}
