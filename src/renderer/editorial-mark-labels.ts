import type {
  EditorialMarkAnchorProjection,
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

/**
 * ADR 0085 §2 beside an available 接受并应用: the paragraph changed elsewhere after the suggestion was made,
 * and its own words did not. A label only — it records and decides nothing.
 */
export const SAFE_MERGE_LINE = '本段后来改过别处，没有碰到这条建议的原文';

/** The entry into 稿件冲突 beside every action a conflict blocks (Issue #57). */
export const RESOLVE_CONFLICT_LABEL = '解决冲突…';

/** A reversal conflict resolved by a new version: the Correction Proposal waits on the manuscript. */
export const REVERSAL_CORRECTION_LINE = '已为这处冲突生成更正建议；它在稿件上等你处理，尚未应用。';

export function markSourceLine(card: Pick<EditorialMarkCardProjection, 'source' | 'convertedFrom'> & Partial<Pick<EditorialMarkCardProjection, 'resolvedFrom'>>): string {
  const { source } = card;
  const who = source.kind === 'editor'
    ? '你'
    : source.kind === 'imported-author'
      ? `${source.label ?? '作者'}（导入文件的作者）`
      : source.origin === 'analysis'
        ? 'AI7 · 分析'
        : `AI7 · ${source.origin === 'review-category' ? '审阅' : '任务'}「${source.label ?? ''}」`;
  // A version saved from a conflict is no conversion: it says what it came from (Issue #57).
  if (card.resolvedFrom) return `${who} · ${card.resolvedFrom.conflictKind === 'reversal' ? '由撤销冲突生成的更正建议' : '由冲突解决生成的新版本'}`;
  if (card.convertedFrom === null) return who;
  const from = MARK_KIND_LABELS[card.convertedFrom.kind];
  return `${who} · 由${card.convertedFrom.sourceKind === 'ai7' ? ' AI7 的' : ''}${from}转来`;
}

export function markStateLabel(
  card: Pick<EditorialMarkCardProjection, 'kind' | 'status' | 'anchorState' | 'suggestion'> & Partial<Pick<EditorialMarkCardProjection, 'conflict'>>,
): string {
  const drifted = card.anchorState === 'exact' ? '' : ' · 原文已变';
  // 暂不处理 is a record of the conflict, not a decision: the state still says what the suggestion is (ADR 0085 §3).
  const deferred = card.conflict?.state === 'deferred' && card.conflict.deferredAt !== null ? ` · 暂不处理 · ${markTimeLabel(card.conflict.deferredAt)}` : '';
  const keptCurrent = card.conflict?.state === 'resolved' && card.conflict.outcome === 'keep-current';
  if (card.kind === 'change-suggestion') {
    // 已应用 is the state of a verified Effect Receipt, never of a decision alone (V2-UX-EAPP-011).
    if (card.status === 'applied') {
      if (keptCurrent) return '已保留当前稿件';
      return card.anchorState === 'exact' ? '已应用' : `已应用 · 之后又改过${deferred}`;
    }
    const disposition = card.suggestion?.decision?.disposition;
    if (disposition === 'rejected') return keptCurrent ? '已拒绝 · 保留当前稿件' : `已拒绝${drifted}`;
    if (disposition === 'accepted-with-edit') return `已记录 · 尚未写入稿件${drifted}${deferred}`;
    return `待你处理${drifted}${deferred}`;
  }
  if (card.kind === 'annotation') return `${card.status === 'resolved' ? '已处理' : '待你处理'}${drifted}`;
  return `仅自己可见${drifted}`;
}

/**
 * 原文已变 on a Mark Card: the text the mark was made on — or, for a suggestion pinned on no text, the words
 * its Apply deleted there, or the words it would insert there (Issue #411).
 */
export function markDriftNote(card: Pick<EditorialMarkCardProjection, 'pinnedText' | 'suggestion'>): string {
  if (card.pinnedText.length === 0 && card.suggestion !== null) {
    if (card.suggestion.changeType === 'insert') {
      return `原文已变：这里原本建议插入「${card.suggestion.proposedText}」，插入处后来又改过，标记仍留在原处。`;
    }
    return `原文已变：这里删去了「${card.suggestion.currentText}」，删去处后来又改过，标记仍留在原处。`;
  }
  return `原文已变：标记时的文字是「${card.pinnedText}」，这段文字后来改过，标记仍留在原处。`;
}

/**
 * What 准备撤销本次应用 says it will write, before the button that writes it (V2-UX-EREC-010): the applied
 * text changed back to the original; where the Apply deleted the words, the words written in again; and
 * where it inserted words at a point (Issue #411), those words taken out again.
 */
export function reverseApplyNote(appliedText: string, originalText: string): string {
  const write = appliedText.length === 0
    ? `会在原处重新写入「${originalText}」`
    : originalText.length === 0
      ? `会删去在此插入的「${appliedText}」`
      : `会把「${appliedText}」换回「${originalText}」`;
  return `${write}，并记为一次新的应用；原来的应用记录保留，不会被改写。`;
}

/** What a 修改建议 that inserts proposes (Issue #411, D7): its words, written at the point it stands on. */
export function insertionLine(text: string): string {
  return `在此插入「${text}」`;
}

/** Why an insertion offers no 转为批注: a 批注 needs text to stand on, and an insertion stands at a point. */
export const INSERTION_CONVERT_REASON = '插入建议没有原文可以批注，不能转为批注。';

/**
 * The name of the point drawn where a mark stands on no text: the words an applied deletion took away, the
 * words a pending insertion would write there (Issue #411), or — for a mark whose own words an edit removed
 * — which kind of mark waits there.
 */
export function markPointLabel(
  mark: Pick<EditorialMarkAnchorProjection, 'kind' | 'deletedText'> & Partial<Pick<EditorialMarkAnchorProjection, 'insertedText'>>,
  drifted: boolean,
): string {
  const what = mark.insertedText !== null && mark.insertedText !== undefined
    ? `待插入「${mark.insertedText}」`
    : mark.deletedText === null ? MARK_KIND_LABELS[mark.kind] : `已删去「${mark.deletedText}」`;
  return drifted ? `${what} · 原文已变` : what;
}

/** Which point a mark draws where it stands on no text: a pending insertion, an applied deletion, or another. */
export function markPointKind(mark: Pick<EditorialMarkAnchorProjection, 'deletedText' | 'insertedText'>): 'insertion' | 'deletion' | 'mark' {
  return mark.insertedText !== null ? 'insertion' : mark.deletedText !== null ? 'deletion' : 'mark';
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
