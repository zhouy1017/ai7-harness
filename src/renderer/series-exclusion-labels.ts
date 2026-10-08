import {
  SERIES_EXCLUSION_TARGET_KIND_LABELS,
  type SeriesExclusionProjection,
  type SeriesExclusionRevisionProjection,
  type SeriesExclusionTargetKind,
  type SeriesExclusionTargetProjection,
} from '../shared/protocol.js';

/**
 * 书系检索排除's words (Issue #64, plan slice S29b; V2-UX-SER-020 to SER-029): the section on a Series' page, its exclusions in
 * force, 添加检索排除… with its target and reason, 书系检索排除影响预览, and the revisions. Pure, so the unit suite pins each.
 */

export const EXCLUSIONS_HEADING = '书系检索排除';
/** SER-023, SER-029: an immediate restriction of this Series' retrieval, and nothing more. */
export const EXCLUSIONS_NOTE = '检索排除只限这个书系的检索：记录后立即生效，以后读取书系材料的任务都不再读到被排除的对象，已授权、正在运行的任务也在下一次读取前停下。它不删除、不隐藏图书或稿件，不改变书系成员，也不决定学习准入。';
export const EXCLUSIONS_EMPTY = '这个书系没有在生效的检索排除。';
export const EXCLUSIONS_ADD_OPEN = '添加检索排除…';
export const EXCLUSIONS_CHANGE_OPEN = '修改检索排除…';
export const EXCLUSIONS_END_OPEN = '停止此排除…';
export const EXCLUSIONS_KIND_LEGEND = '排除什么';
export const EXCLUSIONS_TARGET_LEGEND = '选择要排除的对象';
export const EXCLUSIONS_REASON_LABEL = '排除理由（可选）';
export const EXCLUSIONS_REASON_CHANGE_LABEL = '新的排除理由（可以留空）';
export const EXCLUSIONS_TARGETS_MORE = '更多…';
export const EXCLUSIONS_TARGETS_NONE: Readonly<Record<SeriesExclusionTargetKind, string>> = {
  'knowledge-item': '这个书系还没有书系知识条目。',
  'knowledge-class': '没有可选的知识类别。',
  book: '这个书系还没有成员图书。',
  'source-version': '这个书系的成员图书还没有来源版本。',
};
export const EXCLUSIONS_ALREADY = '已排除';
export const EXCLUSIONS_PREVIEW_ACTION = '查看影响';
export const EXCLUSIONS_REFRESH = '重新查看影响';
export const EXCLUSIONS_CANCEL = '取消';
export const EXCLUSIONS_PREVIEW_HEADING = '书系检索排除影响预览';
export const EXCLUSIONS_HISTORY_HEADING = '检索排除记录';
export const EXCLUSIONS_HISTORY_EMPTY = '还没有检索排除记录。';
export const EXCLUSIONS_HISTORY_MORE = '更早的排除记录…';
export const EXCLUSIONS_HISTORY_IMPACT = '当时显示的影响';
/** SER-028: a Source Version is recorded and read by nothing yet, and the page says so rather than imply a guard that acts. */
export const EXCLUSIONS_UNREAD_NOTE = '现在还没有哪项书系检索读取来源版本；这条排除先记下，以后读取来源版本的检索都要遵守。';
export const EXCLUSIONS_NO_REASON = '（未填写理由）';
export const EXCLUSIONS_STATUS = {
  loading: '正在读取可以排除的对象…',
  previewing: '正在计算影响…',
  committing: '正在记录检索排除…',
  loadingMore: '正在读取更多…',
  failed: '无法完成。',
} as const;

/** The kinds in the order the chooser offers them, each in its own words. */
export const EXCLUSION_KIND_CHOICES: ReadonlyArray<{ readonly kind: SeriesExclusionTargetKind; readonly label: string }> =
  (['knowledge-item', 'knowledge-class', 'book', 'source-version'] as const).map((kind) => ({ kind, label: SERIES_EXCLUSION_TARGET_KIND_LABELS[kind] }));

/** One exclusion in force: what it names and since when. */
export function exclusionLine(exclusion: Pick<SeriesExclusionProjection, 'target' | 'effectiveSince'>, instant: (iso: string) => string): string {
  return `${exclusion.target.label} · 自 ${instant(exclusion.effectiveSince)} 起排除`;
}

/** An exclusion's reason as a line: the editor's, or that none was given. */
export function exclusionReasonLine(reason: string): string {
  return reason.length === 0 ? EXCLUSIONS_NO_REASON : `理由：${reason}`;
}

/** One revision in 检索排除记录: what was done to which target. */
export function exclusionRevisionLine(revision: Pick<SeriesExclusionRevisionProjection, 'actionLabel' | 'target'>): string {
  return `${revision.actionLabel}：${revision.target.label}`;
}

/** Who recorded a revision and when, its revision number, and its reason. */
export function exclusionRevisionByline(revision: Pick<SeriesExclusionRevisionProjection, 'actor' | 'recordedAt' | 'revision' | 'reason'>,
  instant: (iso: string) => string): string {
  return `${revision.actor} · ${instant(revision.recordedAt)} · 第 ${revision.revision} 版 · ${exclusionReasonLine(revision.reason)}`;
}

/** The preview's identity rows (SER-021): exact target, scope, effective time, how far it reaches, reason and actor. */
export function exclusionPreviewRows(preview: {
  readonly target: SeriesExclusionTargetProjection;
  readonly scope: string;
  readonly effectiveTime: string;
  readonly reason: string;
  readonly actor: string;
}): Array<readonly [string, string]> {
  return [
    ['对象', preview.target.label],
    ['范围', preview.scope],
    ['生效时间', preview.effectiveTime],
    ['持续范围', preview.target.continuing],
    ['理由', preview.reason.length === 0 ? EXCLUSIONS_NO_REASON : preview.reason],
    ['操作人', preview.actor],
  ];
}

/** A target as the chooser lists it, saying when an exclusion in force names it already. */
export function exclusionChoiceLine(target: SeriesExclusionTargetProjection & { readonly excluded: boolean }): string {
  return target.excluded ? `${target.label} · ${EXCLUSIONS_ALREADY}` : target.label;
}
