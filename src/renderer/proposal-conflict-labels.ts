import type { ConflictResolution, ConflictUnitKind } from '../shared/conflict-units.js';
import type { ProposalConflictKind } from '../shared/protocol.js';
import { markTimeLabel } from './editorial-mark-labels.js';

/**
 * The editorial wording of 稿件冲突 (Issue #57, plan slice S22; ADR 0085; V2-UX-CONFLICT-004 to 013;
 * interaction spec › Proposal conflict resolution; visual direction: conflict resolution borrows the
 * efficiency of Diff-Merge tools without their jargon). Pure, so the words are proven without a renderer.
 * Every state is said in words: nothing here is carried by colour alone.
 */

export const PROPOSAL_CONFLICT_TITLE = '稿件冲突';
export const PROPOSAL_CONFLICT_CLASSIFICATION = '需要解决冲突';
/** A reversal conflict (V2-UX-EREC-012): reversing the Apply meets later work on the words it wrote. */
export const REVERSAL_CONFLICT_LINE = '撤销这次应用时遇到冲突：应用后的文字又改过';
export const CONFLICT_CONTEXT_NOTE = '前后文为当前稿件';
export const CONFLICT_RETURN_LABEL = '返回稿件';
export const CONFLICT_NAVIGATOR_LABELS = { previous: '上一处', next: '下一处' } as const;
/** 稿件又有改动 after a draft was saved: the old draft is kept, and the comparison is made again. */
export const CONFLICT_REBASED_NOTICE = '稿件又有改动，已按最新内容重新比较';

/** The three read-only panes, persistently labelled (V2-UX-CONFLICT-004). */
export function conflictPaneLabels(kind: ProposalConflictKind): { base: string; current: string; proposed: string } {
  return {
    base: '提案基准',
    current: '当前权威稿件',
    proposed: kind === 'reversal' ? '提议内容 · 撤销后会恢复的原文' : '提议内容',
  };
}

/** What each unit of the comparison is, in words: which side changed it. */
export const CONFLICT_UNIT_KIND_LABELS: Readonly<Record<ConflictUnitKind, string>> = {
  same: '三处相同',
  'current-only': '只在当前稿件中改过',
  'proposed-only': '只在提议中改过',
  'both-same': '两边改得一样',
  conflict: '冲突',
};

/** 第 i 处，共 n 处未解决 across the manuscript; a navigator that holds more says so. */
export function conflictPositionLine(index: number | null, total: number, truncated: boolean): string {
  const count = truncated ? `共 ${total} 处以上未解决` : `共 ${total} 处未解决`;
  return index === null ? count : `第 ${index + 1} 处，${count}`;
}

export type ConflictPath = 'keep-current' | 'edit-draft' | 'regenerate' | 'defer';

/** The four unselected paths of V2-UX-CONFLICT-005, in their fixed order; none is ever preselected. */
export const CONFLICT_PATHS: ReadonlyArray<ConflictPath> = ['keep-current', 'edit-draft', 'regenerate', 'defer'];
export const CONFLICT_PATH_HEADING = '选择处理方式';
export const CONFLICT_PATH_LABELS: Readonly<Record<ConflictPath, string>> = {
  'keep-current': '保留当前稿件',
  'edit-draft': '自行编辑解决草稿',
  regenerate: '基于当前稿件重新生成建议',
  defer: '暂不处理',
};
/** 基于当前稿件重新生成建议 waits for a Task started on a selection, as every AI7 task entry on the manuscript does. */
export const CONFLICT_REGENERATE_REASON = '重新生成建议尚未接通';

/** What choosing a path will do, said before the button that does it. */
export function conflictPathNote(path: ConflictPath, kind: ProposalConflictKind): string {
  switch (path) {
    case 'keep-current':
      return kind === 'reversal'
        ? '稿件不变；这次应用保持有效，只记下这处冲突已按「保留当前稿件」处理。'
        : '稿件不变；这条修改建议记为拒绝，原因「保留当前稿件」。';
    case 'edit-draft':
      return '在下面的解决草稿里逐处选定，再保存为新提案版本；稿件不会改动。';
    case 'regenerate':
      return CONFLICT_REGENERATE_REASON;
    case 'defer':
      return '记下「暂不处理」；这处冲突仍未解决，仍列在这里，解决草稿保留，也仍不能应用。';
  }
}

export const CONFLICT_CONFIRM_LABELS = { keepCurrent: '确认保留当前稿件', defer: '暂不处理，返回稿件' } as const;

export const CONFLICT_DRAFT_HEADING = '解决草稿';
export const CONFLICT_DRAFT_NOTE = '解决草稿只是草稿：保存为新提案版本之前，稿件和这条修改建议都不会改动。';
export const CONFLICT_DRAFT_TEXT_LABEL = '解决草稿全文';

/** The Diff-Merge Quick Actions of V2-UX-CONFLICT-006, in words beside every unit. */
export const CONFLICT_QUICK_ACTIONS = {
  takeCurrent: '采用当前内容',
  takeProposed: '采用提议内容',
  keepBoth: '两者都保留',
  currentFirst: '当前后接提议',
  proposedFirst: '提议后接当前',
  edit: '编辑合并结果',
  doneEditing: '完成编辑',
  undo: '撤销',
  redo: '重做',
  previousUnresolved: '上一处未解决',
  nextUnresolved: '下一处未解决',
  includeNonConflicting: '将全部无冲突更改加入解决草稿',
  saveVersion: '保存为新提案版本',
} as const;

export const CONFLICT_KEEP_BOTH_PROMPT = '两者都保留：请选择先后顺序';
export const CONFLICT_EDIT_REFERENCE = { current: '当前内容', proposed: '提议内容' } as const;
export const CONFLICT_EDIT_FIELD = '合并结果';

/** Where one changed unit stands in the draft. */
export const CONFLICT_RESOLUTION_LABELS: Readonly<Record<ConflictResolution, string>> = {
  unresolved: '未解决',
  current: '已采用当前内容',
  proposed: '已采用提议内容',
  'both-current-first': '两者都保留 · 当前后接提议',
  'both-proposed-first': '两者都保留 · 提议后接当前',
  edited: '已编辑合并结果',
};

/** 第 k 处 · what the unit is · where it stands. */
export function conflictUnitHeading(ordinal: number, kind: ConflictUnitKind, resolution: ConflictResolution): string {
  return `第 ${ordinal} 处 · ${CONFLICT_UNIT_KIND_LABELS[kind]} · ${CONFLICT_RESOLUTION_LABELS[resolution]}`;
}

/** How a unit with no words on one side reads, so an empty pane is never mistaken for a missing one. */
export const CONFLICT_EMPTY_WORDS = '（无文字）';

export function conflictBulkSummary(included: number, conflictsLeft: number): string {
  return conflictsLeft === 0
    ? `已加入 ${included} 处无冲突更改。`
    : `已加入 ${included} 处无冲突更改；还有 ${conflictsLeft} 处冲突需要你决定。`;
}

export type ConflictSaveBlocker = 'unresolved' | 'unchanged' | 'target-deleted';

/**
 * Why 保存为新提案版本 is unavailable, in words beside it; `null` once it can be saved. A draft that says
 * what the current manuscript already says is no new version: that is 保留当前稿件.
 */
export function conflictSaveReason(blocker: ConflictSaveBlocker | null, unresolved: number): string | null {
  switch (blocker) {
    case null:
      return null;
    case 'unresolved':
      return `还有 ${unresolved} 处未解决；每一处都选定后才能保存为新提案版本。`;
    case 'unchanged':
      return '解决结果与当前稿件相同，请选「保留当前稿件」。';
    case 'target-deleted':
      return '原文已被删去，不能在原处生成新版本；可选「保留当前稿件」或「暂不处理」。';
  }
}

/** The Resolution Draft's durable state (V2-UX-CONFLICT-012). */
export const CONFLICT_DRAFT_STATUS = {
  saving: '正在保存草稿…',
  saved: '草稿已保存',
  unsaved: '草稿尚未保存',
} as const;

export function conflictDraftUnsaved(reason: string): string {
  return `草稿未保存：${reason}`;
}

export function conflictDeferredLine(deferredAt: string): string {
  return `已于 ${markTimeLabel(deferredAt)} 暂不处理；这处冲突仍未解决。`;
}

export const CONFLICT_COMPLETION = {
  newVersion: '已保存为新提案版本 · 尚未应用',
  keepCurrent: '已保留当前稿件；稿件没有改动。',
  defer: '已记下暂不处理；这处冲突仍未解决。',
} as const;

/** 保留当前稿件's completion on a Production Document (Issue #543 follow-up), where the text kept is the document's. */
export const CONFLICT_KEEP_CURRENT_ON_DOCUMENT = '已保留文档现在的文字；文档没有改动。';

/** A completion in the words of what the conflict was on: a document's own words for its text, the manuscript's otherwise. */
export function conflictCompletionOn(onDocument: boolean, completion: string): string {
  return onDocument && completion === CONFLICT_COMPLETION.keepCurrent ? CONFLICT_KEEP_CURRENT_ON_DOCUMENT : completion;
}

export const CONFLICT_STATUS_LINES = {
  opening: '正在打开稿件冲突…',
  opened: '稿件冲突已打开；三处文字只读，稿件不会改动。',
  openFailed: '无法打开稿件冲突。',
  returning: '正在返回稿件…',
  returnFailed: '无法返回稿件。',
  resolving: '正在记录你的处理…',
  resolveFailed: '你的处理未能记录。',
} as const;

/** The draft's keyboard, discoverable beside its buttons (V2-UX-CONFLICT-012; interaction spec › Diff-Merge interaction). */
export function conflictKeyboardHint(platform: 'win32' | 'darwin'): string {
  const modifier = platform === 'darwin' ? 'Command' : 'Ctrl';
  return `${modifier}+Z 撤销 · ${modifier}+Shift+Z 或 ${modifier}+Y 重做（在解决草稿内）`;
}
