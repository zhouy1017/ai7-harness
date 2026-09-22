import {
  MAX_PUBLICATION_BASIS_CHARACTERS,
  MAX_PUBLICATION_SCOPE_CHARACTERS,
  PUBLICATION_CHANGE_NOTICE,
  type DeliverablesProjection,
  type MilestoneListItemProjection,
  type MilestonePurposeKind,
  type PublicationActualsPromptProjection,
  type PublicationVersionProjection,
} from '../shared/protocol.js';

/**
 * Every word of ⑥ 交付物 (editor-surfaces §9, V2-UX-MILE-003 to MILE-014, PUB-002 to PUB-009) and of the
 * milestone form that the service projection does not already carry. The projection's own words — the
 * fixed sentence, the 发稿版本 mark, the change notice, the pending actuals line, `自「标签」后有修改`
 * and every completion — are shown as they come (`src/shared/protocol.ts`); these are the sentences
 * around them. None of them names a Publication Version 已发布, 已发送, 已交付 or 已确认送达 (PUB-009).
 * Pure, so the unit suite pins every string byte for byte. An instant arrives already formatted, so the
 * suite never depends on the host's time zone.
 */

// ---- the destination --------------------------------------------------------------------------------

export const DELIVERABLES_SECTION_LABEL = '工作 · 交付物';
/** The editor toolbar's entry in IA-006's 工作 group, after 审阅, and the heading of 工作概览's one line. */
export const DELIVERABLES_ENTRY_LABEL = '交付物';
export const DELIVERABLES_LEDE = '从稿件的里程碑版本中明确选定一版，写明发稿范围和依据，设为发稿版本；之后稿件再有修改，这里会提示。';
/** The one block S65 reaches: the manuscript's 发稿 (editor-surfaces §9's first row). */
export const DELIVERABLES_PUBLICATION_HEADING = '发稿 · 稿件';
export const DELIVERABLES_UNAVAILABLE = '无法读取这本书的交付物。';
/** The persistent actions of the destination, in the order it builds them (V2-UX-LAYER-005). */
export const DELIVERABLES_DESTINATION_ACTIONS = ['打开稿件', '工作概览'] as const;

export const MILESTONE_LIST_HEADING = '里程碑版本';
export const MILESTONE_LIST_EMPTY = '还没有里程碑版本。在稿件的导航面板里「保存为里程碑版本」后，会列在这里。';
export const PUBLICATION_HISTORY_HEADING = '设为发稿版本的记录';
export const PUBLICATION_HISTORY_EMPTY = '还没有设为发稿版本。';
/** The newest designation in the history is the Book's current 发稿版本; the older ones stay as they were. */
export const PUBLICATION_CURRENT_MARK = '当前发稿版本';

/** The label of every `data-publication-action` the destination carries, and of 工作概览's `data-deliverables-action`. */
export const PUBLICATION_ACTION_LABELS = {
  designate: '设为发稿版本…',
  confirm: '设为发稿版本',
  cancel: '取消',
  open: '打开交付物',
} as const;
export type PublicationAction = keyof typeof PUBLICATION_ACTION_LABELS;

// ---- 设为发稿版本's compact form (V2-UX-PUB-002, PUB-004) ----------------------------------------------

export const PUBLICATION_FORM_HEADING = '设为发稿版本';
export const PUBLICATION_MILESTONE_LEGEND = '选择里程碑版本';
export const PUBLICATION_SCOPE_LABEL = '发稿范围';
export const PUBLICATION_BASIS_LABEL = '依据';
export const PUBLICATION_SCOPE_HINT = '这一版可用于哪里，例如纸质版首印、电子版首发。';
export const PUBLICATION_BASIS_HINT = '为什么是这一版，例如三审意见或社里的决定。';
/**
 * What the compact surface states before commitment (PUB-004): the exact Book and Deliverable, the
 * milestone and its version, its relation to the current manuscript, the actor and the time. The scope
 * and the basis are the form's own two fields, and the fixed sentence stands beside the action.
 */
export const PUBLICATION_SUMMARY_TERMS = ['图书', '稿件', '里程碑版本', '与当前稿件', '操作人', '时间'] as const;
export const PUBLICATION_SUMMARY_DELIVERABLE = '主稿件';
export const PUBLICATION_SUMMARY_UNCHOSEN = '先选择一个里程碑版本';
export const PUBLICATION_SUMMARY_TIME = '确认时记录';
/** Who records a designation: the local editor, as every Publication Version names its actor. */
export const PUBLICATION_ACTOR: PublicationVersionProjection['actor'] = '本机编辑';
/** A milestone the manuscript has not changed since. */
export const MILESTONE_CURRENT_RELATION = '与当前稿件一致';

/** Whether 发稿范围 or 依据 can be recorded as it stands, judged exactly as the service judges it. */
export type PublicationTextState = 'empty' | 'ready' | 'too-long' | 'ill-formed';

/**
 * How many characters 发稿范围 or 依据 holds as it would be recorded: NFC-normalized and trimmed, counted
 * as code points — the count `publicationText` bounds, never the UTF-16 units an HTML `maxLength` counts.
 */
export function publicationCharacterCount(value: string): number {
  return [...(value.isWellFormed() ? value.normalize('NFC') : value).trim()].length;
}

export function publicationTextState(value: string, maximum: number): PublicationTextState {
  if (!value.isWellFormed()) return 'ill-formed';
  const count = publicationCharacterCount(value);
  if (count === 0) return 'empty';
  return count > maximum ? 'too-long' : 'ready';
}

export function publicationCountLine(value: string, maximum: number): string {
  return `${publicationCharacterCount(value)} / ${maximum} 个字符`;
}

/** The problem a field states beside itself; an empty field is not a problem, only not yet done. */
export function publicationFieldProblem(field: '发稿范围' | '依据', value: string, maximum: number): string | null {
  const state = publicationTextState(value, maximum);
  if (state === 'too-long') return `${field}最多 ${maximum} 个字符，现在 ${publicationCharacterCount(value)} 个。`;
  if (state === 'ill-formed') return `${field}含有无法保存的字符。`;
  return null;
}

/** What 设为发稿版本 still needs before it can be confirmed, in the order the form asks for it. */
export function publicationDesignateBlockers(state: { milestoneChosen: boolean; scope: string; basis: string }): string[] {
  const blockers: string[] = [];
  if (!state.milestoneChosen) blockers.push('选择一个里程碑版本');
  const fields: ReadonlyArray<readonly ['发稿范围' | '依据', string, number]> = [
    ['发稿范围', state.scope, MAX_PUBLICATION_SCOPE_CHARACTERS],
    ['依据', state.basis, MAX_PUBLICATION_BASIS_CHARACTERS],
  ];
  for (const [field, value, maximum] of fields) {
    const text = publicationTextState(value, maximum);
    if (text === 'empty') blockers.push(`填写${field}`);
    else if (text === 'too-long') blockers.push(`把${field}缩短到 ${maximum} 个字符以内`);
    else if (text === 'ill-formed') blockers.push(`去掉${field}中无法保存的字符`);
  }
  return blockers;
}

/** The reason beside a disabled confirm, in words and not only by the control's state. */
export function publicationDesignateReason(blockers: ReadonlyArray<string>): string | null {
  return blockers.length === 0 ? null : `还需要${blockers.join('、')}。`;
}

/** A milestone as the form offers it: its purpose, its exact version and when it was saved. */
export function publicationMilestoneOptionLine(item: Pick<MilestoneListItemProjection, 'purposeLabel' | 'revisionLabel'>, savedAt: string): string {
  return `用途：${item.purposeLabel} · 修订版 ${item.revisionLabel} · ${savedAt} 保存`;
}

/** 里程碑版本 in the summary: the exact label and version, and when it was saved. */
export function publicationSummaryMilestone(item: Pick<MilestoneListItemProjection, 'label' | 'revisionLabel'>, savedAt: string): string {
  return `「${item.label}」 · ${item.revisionLabel} · ${savedAt} 保存`;
}

/** 稿件 in the summary: the Deliverable is the Book's primary Manuscript, read as it stands now. */
export function publicationSummaryManuscript(manuscript: NonNullable<DeliverablesProjection['manuscript']>): string {
  return `${PUBLICATION_SUMMARY_DELIVERABLE} · 当前修订版 ${manuscript.revisionLabel} · 修订日志序号 ${manuscript.journalSequence}`;
}

/** 与当前稿件: the current-versus-selected relationship (PUB-004), in the milestone's own words when it changed. */
export function milestoneRelationLine(item: Pick<MilestoneListItemProjection, 'changedSinceLabel'>): string {
  return item.changedSinceLabel ?? MILESTONE_CURRENT_RELATION;
}

// ---- the lists ----------------------------------------------------------------------------------------

/** A Book's primary Manuscript as the block names it; 发稿 always reads the manuscript as it stands. */
export function deliverablesManuscriptLine(manuscript: DeliverablesProjection['manuscript']): string {
  return manuscript === null
    ? '这本书还没有稿件；导入稿件后才能保存里程碑版本。'
    : `当前稿件：修订版 ${manuscript.revisionLabel} · 修订日志序号 ${manuscript.journalSequence}`;
}

export function milestoneLabelText(label: string): string {
  return `「${label}」`;
}

/** One listed milestone's purpose, exact version, actor and time (V2-UX-MILE-008). */
export function milestoneMetaLine(item: Pick<MilestoneListItemProjection, 'purposeLabel' | 'revisionLabel' | 'actor'>, savedAt: string): string {
  return `用途：${item.purposeLabel} · 修订版 ${item.revisionLabel} · ${item.actor} · ${savedAt}`;
}

export function milestoneNoteLine(note: string): string {
  return `说明：${note}`;
}

export function milestonesTruncatedLine(listed: number): string {
  return `这里列出最近的 ${listed} 个里程碑版本；更早的仍然保留，也仍可设为发稿版本。`;
}

/** 第 N 次 设为发稿版本: the exact milestone and version it designated, which never moves (PUB-007). */
export function publicationVersionHeading(item: Pick<PublicationVersionProjection, 'ordinal' | 'milestoneLabel' | 'revisionLabel'>): string {
  return `第 ${item.ordinal} 次设为发稿版本 · 「${item.milestoneLabel}」 · ${item.revisionLabel}`;
}

export function publicationScopeLine(scope: string): string {
  return `${PUBLICATION_SCOPE_LABEL}：${scope}`;
}

export function publicationBasisLine(basis: string): string {
  return `${PUBLICATION_BASIS_LABEL}：${basis}`;
}

export function publicationRecordedLine(actor: string, recordedAt: string): string {
  return `${actor} · ${recordedAt}`;
}

export function publicationsTruncatedLine(listed: number): string {
  return `这里列出最近的 ${listed} 次；更早的记录仍然保留。`;
}

/**
 * The Publication Version Change Notice's exact change relationship (PUB-006) and the two ways on: the
 * designation keeps its version, and a newer one is a separate designation of a new milestone (PUB-007).
 */
export function publicationChangeNoticeDetail(notice: NonNullable<DeliverablesProjection['publication']['changeNotice']>): string {
  return `发稿版本定在 ${notice.revisionLabel}，稿件此后有修改。这一版保持不变；需要时先保存新的里程碑版本，再另设发稿版本。`;
}

/** The pending line a designation leaves (V2-UX-EVAL-010): recorded now, with no action until evaluation takes it up. */
export function publicationActualsPromptLine(prompt: Pick<PublicationActualsPromptProjection, 'label' | 'stateLabel'>): string {
  return `${prompt.label} · ${prompt.stateLabel}`;
}

/** Where a Book's 发稿 stands, as the block and 工作概览's line both name it. */
export type PublicationState = 'no-manuscript' | 'no-milestone' | 'undesignated' | 'designated';

export function publicationStateOf(projection: Pick<DeliverablesProjection, 'manuscript' | 'publication'>): PublicationState {
  if (projection.manuscript === null) return 'no-manuscript';
  if (projection.publication.milestones.length === 0) return 'no-milestone';
  return projection.publication.designations.length === 0 ? 'undesignated' : 'designated';
}

/** 工作概览's one line of 交付物 (editor-surfaces §2: 交付物一行计数). No percentage (WORK-007). */
export function deliverablesOverviewLine(projection: Pick<DeliverablesProjection, 'manuscript' | 'publication'>): string {
  const publication = projection.publication;
  if (projection.manuscript === null) return '发稿 · 这本书还没有稿件';
  const listed = publication.milestones.length;
  const milestones = listed === 0
    ? '还没有里程碑版本'
    : `里程碑版本 ${listed} 个${publication.milestonesTruncated ? '以上' : ''}`;
  const current = publication.designations.find((designation) => designation.current) ?? null;
  const designation = current === null
    ? '还没有设为发稿版本'
    : `发稿版本「${current.milestoneLabel}」 · ${current.revisionLabel} · ${current.scope}`;
  const notice = publication.changeNotice === null ? '' : ` · ${PUBLICATION_CHANGE_NOTICE}`;
  return `发稿 · ${milestones} · ${designation}${notice}`;
}

// ---- the technical layer (V2-UX-LAYER-001) -------------------------------------------------------------

/** The rows under each 查看技术详情: identities, digests and exact instants, never ordinary editorial words. */
export const DELIVERABLES_TECHNICAL_TERMS = {
  book: '图书 ID',
  manuscript: '稿件 ID',
  branch: '分支 ID',
  revision: '修订版 ID',
  journal: '修订日志序号',
  workingDigest: '当前工作摘要',
  milestone: '里程碑版本 ID',
  milestoneRecord: '里程碑内部记录 ID',
  savedAt: '保存时刻',
  publicationVersion: '发稿版本 ID',
  revisionDigest: '修订版摘要',
  recordDigest: '记录摘要',
  permission: '内部许可记录 ID',
  events: '事件记录',
  recordedAt: '记录时刻',
} as const;

export function publicationEventsLine(events: PublicationVersionProjection['technical']['events']): string {
  return events.map((event) => `${event.kind} · ${event.eventId}`).join('；');
}

// ---- status lines -------------------------------------------------------------------------------------

export const DELIVERABLES_STATUS_LINES = {
  opened: '交付物已打开',
  leaving: '正在保存并打开交付物…',
  opening: '正在打开交付物…',
  openFailed: '无法打开交付物。',
  refreshFailed: '无法刷新交付物。',
  designating: '正在设为发稿版本…',
  designateFailed: '未能设为发稿版本。',
} as const;

// ---- 保存为里程碑版本 (V2-UX-MILE-003; interaction spec › Milestone rules) --------------------------------

/**
 * The milestone form in the manuscript's 导航 panel: 标签, an unselected purpose card set plus 自行输入,
 * and an optional 说明. Submission is 保存里程碑版本, never 签发.
 */
export const MILESTONE_FORM_WORDS = {
  summary: '保存为里程碑版本',
  label: '标签',
  purpose: '用途',
  customPurpose: '自行输入的用途',
  note: '说明（可选）',
  save: '保存里程碑版本',
} as const;
/** V2-UX-MILE-009: a purpose states the intended next use only and grants nothing. */
export const MILESTONE_PURPOSE_NOTE = '用途只说明这一版接下来打算做什么；选「交付候选」不会导出，也不会设为发稿版本。';

/** What saving a milestone still needs: a label, a purpose, and the editor's words for 自行输入. */
export function milestoneFormBlockers(state: { label: string; purposeKind: MilestonePurposeKind | null; customWords: string }): string[] {
  const blockers: string[] = [];
  if (state.label.trim().length === 0) blockers.push('填写标签');
  if (state.purposeKind === null) blockers.push('选择用途');
  else if (state.purposeKind === 'custom' && state.customWords.trim().length === 0) blockers.push('写下自行输入的用途');
  return blockers;
}

export function milestoneSaveReason(blockers: ReadonlyArray<string>): string | null {
  return blockers.length === 0 ? null : `还需要${blockers.join('、')}，才能保存里程碑版本。`;
}
