import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { RESOLVE_CONFLICT_LABEL, SAFE_MERGE_LINE, markSourceLine, markStateLabel } from '../../src/renderer/editorial-mark-labels.js';
import type { EditorialMarkCardProjection } from '../../src/shared/protocol.js';
import {
  CONFLICT_COMPLETION,
  CONFLICT_CONFIRM_LABELS,
  CONFLICT_CONTEXT_NOTE,
  CONFLICT_DRAFT_STATUS,
  CONFLICT_PATHS,
  CONFLICT_PATH_LABELS,
  CONFLICT_QUICK_ACTIONS,
  CONFLICT_REBASED_NOTICE,
  CONFLICT_REGENERATE_REASON,
  CONFLICT_RESOLUTION_LABELS,
  CONFLICT_UNIT_KIND_LABELS,
  PROPOSAL_CONFLICT_CLASSIFICATION,
  PROPOSAL_CONFLICT_TITLE,
  REVERSAL_CONFLICT_LINE,
  conflictBulkSummary,
  conflictCompletionOn,
  conflictDeferredLine,
  conflictDraftUnsaved,
  conflictKeyboardHint,
  conflictPaneLabels,
  conflictPathNote,
  conflictPositionLine,
  conflictSaveReason,
  conflictUnitHeading,
} from '../../src/renderer/proposal-conflict-labels.js';

// Unit suite for the words of 稿件冲突 (Issue #57, plan slice S22; ADR 0085; V2-UX-CONFLICT-004 to 013).
// J-06 reads these sentences on screen; they are pinned here byte for byte.

const EDITOR = { kind: 'editor', origin: null, label: null, taskId: null } as const;
/** A 修改建议 whose conflict 保留当前稿件 resolved: rejected, with that outcome on record. */
const KEPT_CARD: Pick<EditorialMarkCardProjection, 'kind' | 'status' | 'anchorState' | 'suggestion' | 'conflict'> = {
  kind: 'change-suggestion',
  status: 'resolved',
  anchorState: 'drifted',
  suggestion: {
    itemId: 'item', changeType: 'replace', currentText: '原文', proposedText: '改后', rationale: '', atomicGroupId: null, application: null,
    decision: { decisionId: 'decision', disposition: 'rejected', editedText: null, reason: '保留当前稿件', reasonSource: 'suggested', recordedAt: '2026-09-22T00:00:00.000Z' },
  },
  conflict: { kind: 'suggestion', state: 'resolved', deferredAt: null, outcome: 'keep-current', newMarkId: null, resolvedAt: '2026-09-22T00:00:00.000Z' },
};

describe('the words of 稿件冲突', () => {
  it('names the workspace, its classification and a reversal conflict in the editor\'s words', () => {
    expect(PROPOSAL_CONFLICT_TITLE).toBe('稿件冲突');
    expect(PROPOSAL_CONFLICT_CLASSIFICATION).toBe('需要解决冲突');
    expect(REVERSAL_CONFLICT_LINE).toBe('撤销这次应用时遇到冲突：应用后的文字又改过');
    expect(CONFLICT_CONTEXT_NOTE).toBe('前后文为当前稿件');
    expect(CONFLICT_REBASED_NOTICE).toBe('稿件又有改动，已按最新内容重新比较');
  });

  it('labels the three panes persistently, and says what a reversal would restore', () => {
    expect(conflictPaneLabels('suggestion')).toEqual({ base: '提案基准', current: '当前权威稿件', proposed: '提议内容' });
    expect(conflictPaneLabels('reversal')).toEqual({ base: '提案基准', current: '当前权威稿件', proposed: '提议内容 · 撤销后会恢复的原文' });
  });

  it('says where a conflict is among the manuscript\'s unresolved ones', () => {
    expect(conflictPositionLine(0, 3, false)).toBe('第 1 处，共 3 处未解决');
    expect(conflictPositionLine(2, 3, false)).toBe('第 3 处，共 3 处未解决');
    expect(conflictPositionLine(null, 2, false)).toBe('共 2 处未解决');
    expect(conflictPositionLine(4, 200, true)).toBe('第 5 处，共 200 处以上未解决');
  });

  it('offers the four paths in their order, none preselected, and regenerating waits for the Task surface', () => {
    expect(CONFLICT_PATHS).toEqual(['keep-current', 'edit-draft', 'regenerate', 'defer']);
    expect(CONFLICT_PATHS.map((path) => CONFLICT_PATH_LABELS[path])).toEqual(['保留当前稿件', '自行编辑解决草稿', '基于当前稿件重新生成建议', '暂不处理']);
    expect(CONFLICT_REGENERATE_REASON).toBe('重新生成建议尚未接通');
    expect(CONFLICT_CONFIRM_LABELS).toEqual({ keepCurrent: '确认保留当前稿件', defer: '暂不处理，返回稿件' });
    expect(conflictPathNote('keep-current', 'suggestion')).toBe('稿件不变；这条修改建议记为拒绝，原因「保留当前稿件」。');
    expect(conflictPathNote('keep-current', 'reversal')).toBe('稿件不变；这次应用保持有效，只记下这处冲突已按「保留当前稿件」处理。');
    expect(conflictPathNote('defer', 'suggestion')).toContain('仍未解决');
    expect(conflictPathNote('regenerate', 'suggestion')).toBe(CONFLICT_REGENERATE_REASON);
  });

  it('names every quick action with its full words, and no action resolves everything at once', () => {
    expect(CONFLICT_QUICK_ACTIONS).toMatchObject({
      takeCurrent: '采用当前内容', takeProposed: '采用提议内容', keepBoth: '两者都保留', currentFirst: '当前后接提议', proposedFirst: '提议后接当前',
      edit: '编辑合并结果', undo: '撤销', redo: '重做', previousUnresolved: '上一处未解决', nextUnresolved: '下一处未解决',
      includeNonConflicting: '将全部无冲突更改加入解决草稿', saveVersion: '保存为新提案版本',
    });
    expect(Object.values(CONFLICT_QUICK_ACTIONS).some((label) => label.includes('自动解决'))).toBe(false);
  });

  it('says what every unit is and where it stands, in words', () => {
    expect(CONFLICT_UNIT_KIND_LABELS).toEqual({
      same: '三处相同', 'current-only': '只在当前稿件中改过', 'proposed-only': '只在提议中改过', 'both-same': '两边改得一样', conflict: '冲突',
    });
    expect(CONFLICT_RESOLUTION_LABELS.unresolved).toBe('未解决');
    expect(conflictUnitHeading(2, 'conflict', 'both-proposed-first')).toBe('第 2 处 · 冲突 · 两者都保留 · 提议后接当前');
    expect(conflictUnitHeading(1, 'current-only', 'edited')).toBe('第 1 处 · 只在当前稿件中改过 · 已编辑合并结果');
    expect(conflictBulkSummary(2, 1)).toBe('已加入 2 处无冲突更改；还有 1 处冲突需要你决定。');
    expect(conflictBulkSummary(3, 0)).toBe('已加入 3 处无冲突更改。');
  });

  it('says why 保存为新提案版本 is unavailable, and nothing once it can be saved', () => {
    expect(conflictSaveReason(null, 0)).toBeNull();
    expect(conflictSaveReason('unresolved', 2)).toBe('还有 2 处未解决；每一处都选定后才能保存为新提案版本。');
    expect(conflictSaveReason('unchanged', 0)).toBe('解决结果与当前稿件相同，请选「保留当前稿件」。');
    expect(conflictSaveReason('target-deleted', 1)).toBe('原文已被删去，不能在原处生成新版本；可选「保留当前稿件」或「暂不处理」。');
    // On a Production Document the text kept is the document's (Issue #543 follow-up); the other completions name no 稿件.
    expect(conflictCompletionOn(true, CONFLICT_COMPLETION.keepCurrent)).toBe('已保留文档现在的文字；文档没有改动。');
    expect(conflictCompletionOn(false, CONFLICT_COMPLETION.keepCurrent)).toBe('已保留当前稿件；稿件没有改动。');
    expect(conflictCompletionOn(true, CONFLICT_COMPLETION.defer)).toBe(CONFLICT_COMPLETION.defer);
    expect(conflictCompletionOn(true, CONFLICT_COMPLETION.newVersion)).toBe(CONFLICT_COMPLETION.newVersion);
  });

  it('are the words J-06 checks the page for, so the Journey and the surface never drift apart', () => {
    // `e2e/run-j06.mjs` is runner infrastructure outside the typed program, so its pinned words are read
    // from its source, one `const NAME = '…';` line each.
    const runner = readFileSync(fileURLToPath(new URL('../../e2e/run-j06.mjs', import.meta.url)), 'utf8');
    const literal = (name: string): string | undefined => new RegExp(`^const ${name} = '([^']*)';\\r?$`, 'mu').exec(runner)?.[1];
    const expected: Readonly<Record<string, string>> = {
      TITLE: PROPOSAL_CONFLICT_TITLE,
      CLASSIFICATION: PROPOSAL_CONFLICT_CLASSIFICATION,
      REVERSAL_LINE: REVERSAL_CONFLICT_LINE,
      REVERSAL_PROPOSED_LABEL: conflictPaneLabels('reversal').proposed,
      CONTEXT_NOTE: CONFLICT_CONTEXT_NOTE,
      REGENERATE_REASON: CONFLICT_REGENERATE_REASON,
      RESOLVE_CONFLICT: RESOLVE_CONFLICT_LABEL,
      SAFE_MERGE: SAFE_MERGE_LINE,
      DRAFT_SAVED: CONFLICT_DRAFT_STATUS.saved,
      UNRESOLVED_REASON: conflictSaveReason('unresolved', 1)!,
      UNCHANGED_REASON: conflictSaveReason('unchanged', 0)!,
      NEW_VERSION_DONE: CONFLICT_COMPLETION.newVersion,
      KEEP_CURRENT_DONE: CONFLICT_COMPLETION.keepCurrent,
      DEFER_DONE: CONFLICT_COMPLETION.defer,
      KEPT_STATE: markStateLabel({ ...KEPT_CARD }),
      NEW_VERSION_SOURCE: markSourceLine({ source: EDITOR, convertedFrom: null, resolvedFrom: { markId: 'mark', conflictKind: 'suggestion' } }).replace('你 · ', ''),
      CORRECTION_SOURCE: markSourceLine({ source: EDITOR, convertedFrom: null, resolvedFrom: { markId: 'mark', conflictKind: 'reversal' } }).replace('你 · ', ''),
    };
    for (const [name, words] of Object.entries(expected)) expect(literal(name), name).toBe(words);
  });

  it('says whether the draft is durable, and what each way out did', () => {
    expect(CONFLICT_DRAFT_STATUS).toEqual({ saving: '正在保存草稿…', saved: '草稿已保存', unsaved: '草稿尚未保存' });
    expect(conflictDraftUnsaved('稿件又有改动，请重新比较。')).toBe('草稿未保存：稿件又有改动，请重新比较。');
    expect(CONFLICT_COMPLETION.newVersion).toBe('已保存为新提案版本 · 尚未应用');
    expect(conflictDeferredLine(new Date(2026, 8, 22, 9, 5).toISOString())).toBe('已于 9月22日 09:05 暂不处理；这处冲突仍未解决。');
    expect(conflictKeyboardHint('win32')).toBe('Ctrl+Z 撤销 · Ctrl+Shift+Z 或 Ctrl+Y 重做（在解决草稿内）');
    expect(conflictKeyboardHint('darwin')).toBe('Command+Z 撤销 · Command+Shift+Z 或 Command+Y 重做（在解决草稿内）');
  });
});
