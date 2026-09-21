import type {
  EditorialMarkCardProjection,
  EditorialMarkKind,
  PersonalHighlightColor,
  ProposalItemDisposition,
} from '../shared/protocol.js';

/**
 * The editorial wording of the Mark surface (Issue #407): kind names, who a mark comes from
 * (V2-UX-MARK-002), what state it is in, and why a menu entry is unavailable. Pure, so the wording
 * is proven without a renderer.
 */
export const MARK_KIND_LABELS: Readonly<Record<EditorialMarkKind, string>> = {
  'change-suggestion': '修改建议',
  annotation: '批注',
  'editor-note': '备注',
  'personal-highlight': '高亮',
};

/** The three personal colors carry no meaning of their own (V2-UX-MARK-001); the names only tell them apart. */
export const HIGHLIGHT_COLOR_LABELS: Readonly<Record<PersonalHighlightColor, string>> = { 1: '黄', 2: '橙', 3: '绿' };

/** The optional reason chips of V2-UX-PDEC-009; none is ever preselected, and 自行输入 stands beside them. */
export const DECISION_REASON_CHIPS: Readonly<Record<ProposalItemDisposition, ReadonlyArray<string>>> = {
  accepted: ['语言更准确', '保持作者风格'],
  rejected: ['证据不足', '方向不合适', '保持作者风格'],
  'accepted-with-edit': ['语言更准确', '保持作者风格'],
};

export function markSourceLine(card: Pick<EditorialMarkCardProjection, 'source' | 'convertedFrom'>): string {
  const { source } = card;
  const who = source.kind === 'editor'
    ? '你'
    : source.kind === 'imported-author'
      ? `${source.label ?? '作者'}（导入文件的作者）`
      : source.origin === 'analysis'
        ? 'AI7 · 分析'
        : `AI7 · ${source.origin === 'review-category' ? '审阅' : '任务'}「${source.label ?? ''}」`;
  if (card.convertedFrom === null) return who;
  const from = MARK_KIND_LABELS[card.convertedFrom.kind];
  return `${who} · 由${card.convertedFrom.sourceKind === 'ai7' ? ' AI7 的' : ''}${from}转来`;
}

export function markStateLabel(card: Pick<EditorialMarkCardProjection, 'kind' | 'status' | 'anchorState' | 'suggestion'>): string {
  const drifted = card.anchorState === 'exact' ? '' : ' · 原文已变';
  if (card.kind === 'change-suggestion') {
    // 已应用 is the state of a verified Effect Receipt, never of a decision alone (V2-UX-EAPP-011).
    if (card.status === 'applied') return card.anchorState === 'exact' ? '已应用' : '已应用 · 之后又改过';
    const disposition = card.suggestion?.decision?.disposition;
    if (disposition === 'rejected') return `已拒绝${drifted}`;
    if (disposition === 'accepted-with-edit') return `已记录 · 尚未写入稿件${drifted}`;
    return `待你处理${drifted}`;
  }
  if (card.kind === 'annotation') return `${card.status === 'resolved' ? '已处理' : '待你处理'}${drifted}`;
  return `仅自己可见${drifted}`;
}

/**
 * 原文已变 on a Mark Card: the text the mark was made on — or, for a suggestion whose Apply deleted its
 * words and which is pinned on no text, the words it deleted.
 */
export function markDriftNote(card: Pick<EditorialMarkCardProjection, 'pinnedText' | 'suggestion'>): string {
  if (card.pinnedText.length === 0 && card.suggestion !== null) {
    return `原文已变：这里删去了「${card.suggestion.currentText}」，删去处后来又改过，标记仍留在原处。`;
  }
  return `原文已变：标记时的文字是「${card.pinnedText}」，这段文字后来改过，标记仍留在原处。`;
}

/**
 * What 准备撤销本次应用 says it will write, before the button that writes it (V2-UX-EREC-010): the applied
 * text changed back to the original, or — where the Apply deleted the words — the words written in again.
 */
export function reverseApplyNote(appliedText: string, originalText: string): string {
  const write = appliedText.length === 0 ? `会在原处重新写入「${originalText}」` : `会把「${appliedText}」换回「${originalText}」`;
  return `${write}，并记为一次新的应用；原来的应用记录保留，不会被改写。`;
}

export function markTimeLabel(iso: string): string {
  const time = new Date(iso);
  if (Number.isNaN(time.getTime())) return '';
  const minutes = String(time.getMinutes()).padStart(2, '0');
  return `${time.getMonth() + 1}月${time.getDate()}日 ${String(time.getHours()).padStart(2, '0')}:${minutes}`;
}

/** Why the 编辑标记 entries cannot act on what is selected. */
export function selectionMenuReason(kind: 'none' | 'multiple-blocks' | 'unsettled'): string {
  if (kind === 'none') return '先选中一段文字，再添加标记。';
  if (kind === 'multiple-blocks') return '标记需要落在同一段落内；请只选一个段落里的文字。';
  return '这段文字还有未写入修订日志的改动，请稍候再试。';
}
