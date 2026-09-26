import type {
  LearningEligibilityChoice,
  LearningMaterialProjection,
  LearningMaterialState,
  LearningMaterialsBookProjection,
} from '../shared/protocol.js';

/**
 * 质量与学习's words (Issue #61, plan slice S26b; V2-UX-LEARN-002 to LEARN-012, FDBK-013): the destination, its 学习准入
 * list grouped by Book, each Learning Material's Review Card, and the unselected choice with `仅纳入当前图书` recommended.
 * Pure, so the unit suite pins every one.
 */

export const QUALITY_LEARNING_TITLE = '质量与学习';
export const QUALITY_LEARNING_LEDE = '你的反馈与改动里，哪些可以用来学习、在多大范围里学习，都由你决定；这里只是记录，不催你处理。';
export const LEARNING_HEADING = '学习准入';
export const LEARNING_EMPTY = '还没有可以用来学习的材料。你在修改建议、分析结果和审阅里写下的原因与改动，会在这里等你决定。';
export const LEARNING_OPEN = '查看…';
export const LEARNING_RECOMMENDED = '建议';
export const LEARNING_CHOICE_LEGEND = '这条材料可以用来学习吗';
export const LEARNING_NOTE_LABEL = '补充说明 / 自行输入（可不填）';
export const LEARNING_RECORD = '记录学习准入决定';
export const LEARNING_CANCEL = '取消';
export const LEARNING_NO_DECISION = '还没有决定。';
/** A material that changed after its decision (LEARN-007, interaction-spec's drift row): decided again, the old kept. */
export const LEARNING_CHANGED_NOTE = '这条材料在你决定之后改过：原来的决定不再适用于现在的内容，但仍留在记录里。';
/** What a decision here does and does not do (LEARN-009, LEARN-010), said once on every card. */
export const LEARNING_INFLUENCE =
  '纳入以后，它只可能在所选范围内帮 AI7 以后的建议更接近你的判断：不会改动稿件或它来自的记录，不会自动生效为规则，不会启用记忆，也不会被发送出去。';
/** `纳入当前书系` waits for Series (Issue #63, S28): shown, and saying why it is not there (LEARN-005). */
export const LEARNING_SERIES = '纳入当前书系';
export const LEARNING_SERIES_UNAVAILABLE = '还没有书系：书系接通后，才能把材料纳入书系。';
export const LEARNING_CARD_TERMS = {
  excerpt: '材料',
  origin: '来源',
  rationale: '为什么是学习材料',
  basis: '依据',
  influence: '以后可能的影响',
  decision: '现在的决定',
} as const;
export const LEARNING_STATUS = {
  loading: '正在读取学习准入…',
  opened: '学习准入已打开',
  unavailable: '无法读取学习准入。',
  recording: '正在记录学习准入决定…',
  recorded: '学习准入决定已记录。',
  failed: '无法记录这个决定。',
  loadingMore: '正在读取更多学习材料…',
} as const;
/** Reads the next page of materials (Issue #61 review). */
export const LEARNING_MORE = '更多学习材料…';

export const LEARNING_STATE_LABELS: Readonly<Record<LearningMaterialState, string>> = {
  pending: '待定',
  changed: '改过 · 需要重新决定',
  deferred: '稍后决定',
  decided: '已决定',
};

/** The choices in their fixed order, none selected; `仅纳入当前图书` is the recommendation, never the default (LEARN-004). */
export const LEARNING_CHOICES: ReadonlyArray<{ readonly choice: LearningEligibilityChoice; readonly label: string }> = [
  { choice: 'book', label: '仅纳入当前图书' },
  { choice: 'house', label: '纳入出版社经验' },
  { choice: 'excluded', label: '明确排除' },
  { choice: 'deferred', label: '稍后决定' },
];

export function learningChoiceLabel(choice: LearningEligibilityChoice): string {
  return LEARNING_CHOICES.find((entry) => entry.choice === choice)!.label;
}

/** Each choice's consequence, shown beside it once chosen and before it is recorded (LEARN-005, LEARN-006, LEARN-012). */
export function learningChoiceConsequence(choice: LearningEligibilityChoice, bookTitle: string): string {
  switch (choice) {
    case 'book':
      return `仅纳入当前图书：它只在《${bookTitle}》里帮 AI7 学习。`;
    case 'house':
      return '纳入出版社经验：全社以后的图书都可能从它学习。';
    case 'excluded':
      return '明确排除：它不会用来学习；它来自的反馈与改动仍原样保留。';
    case 'deferred':
      return '稍后决定：它仍然待定，不算纳入，也不算排除。';
  }
}

/** A Book's heading in the list. */
/** A Book's heading: its title and how many materials it has in all, whichever page shows them. */
export function learningBookHeading(book: Pick<LearningMaterialsBookProjection, 'title' | 'materialCount'>): string {
  return `《${book.title}》 · ${book.materialCount} 条`;
}

/** Who the Book's decisions are attributed to (FDBK-013). */
export function learningPeopleLine(book: Pick<LearningMaterialsBookProjection, 'authors' | 'editors'>): string {
  if (book.authors.length === 0 && book.editors.length === 0) return '作者与责编：尚未填写';
  return `作者：${book.authors.length === 0 ? '尚未填写' : book.authors.join('、')} · 责编：${book.editors.length === 0 ? '尚未填写' : book.editors.join('、')}`;
}

/** Where a material came from and when. */
export function learningOriginLine(material: Pick<LearningMaterialProjection, 'originLabel' | 'recordedAt'>, instant: (iso: string) => string): string {
  return `${material.originLabel} · 记录于 ${instant(material.recordedAt)}`;
}

/** The decision that stands — or, for a changed material, the one it had — as the card states it. */
export function learningDecisionLine(material: Pick<LearningMaterialProjection, 'decision'>, instant: (iso: string) => string): string {
  if (material.decision === null) return LEARNING_NO_DECISION;
  const note = material.decision.note === null ? '' : ` · ${material.decision.note}`;
  return `${learningChoiceLabel(material.decision.choice)} · ${instant(material.decision.decidedAt)}${note}`;
}

// ---- 反馈历史 (Issue #61, plan slice S26c; V2-UX-FDBK-009, FDBK-010, FDBK-013) ----------------------------------------------

export const QUALITY_LEARNING_TABS: ReadonlyArray<{ readonly tab: 'feedback' | 'learning'; readonly label: string }> = [
  { tab: 'feedback', label: '反馈历史' },
  { tab: 'learning', label: '学习准入' },
];
export const QUALITY_LEARNING_TABS_LABEL = '质量与学习的内容';
export const FEEDBACK_HISTORY_HEADING = '反馈历史';
/** What the history is and is not (FDBK-007, FDBK-010), said once above it. */
export const FEEDBACK_HISTORY_NOTE = '这里只是记录你给过的反馈：不会催你补充原因，也不会把没有说明当作认可。';
export const FEEDBACK_HISTORY_EMPTY = '还没有反馈记录。你对修改建议、分析结果和审阅发现的处理与原因，会记在这里。';
export const FEEDBACK_HISTORY_NONE_MATCH = '没有符合的反馈记录。';
export const FEEDBACK_HISTORY_TRUNCATED = '还有更早的记录，可继续查看。';
export const FEEDBACK_HISTORY_OPEN = '打开…';
/** In place of 打开… when the paragraph a 修改建议 was made on is gone from the manuscript (Issue #61 review). */
export const FEEDBACK_HISTORY_DETACHED = '这条修改建议所在的段落已不在稿件中。';
export const FEEDBACK_HISTORY_ALL = '全部';
export const FEEDBACK_HISTORY_FILTERS = { book: '图书', origin: '来源', author: '作者', editor: '责编' } as const;
export const FEEDBACK_HISTORY_STATUS = {
  loading: '正在读取反馈历史…',
  opened: '反馈历史已打开',
  unavailable: '无法读取反馈历史。',
  opening: '正在打开这条反馈所在的记录…',
  openFailed: '无法打开这条反馈所在的记录。',
} as const;

export const FEEDBACK_ORIGIN_LABELS: Readonly<Record<'proposal-decision' | 'analysis-feedback' | 'review-disposition', string>> = {
  'proposal-decision': '修改建议',
  'analysis-feedback': '分析反馈',
  'review-disposition': '审阅',
};

/** One entry's first line: where it came from, what it is about, and what the editor decided or judged. */
export function feedbackEntryLine(entry: { readonly origin: keyof typeof FEEDBACK_ORIGIN_LABELS; readonly dimension: string | null; readonly signal: string }): string {
  return `${FEEDBACK_ORIGIN_LABELS[entry.origin]}${entry.dimension === null ? '' : ` · ${entry.dimension}`} · ${entry.signal}`;
}

/**
 * The people an entry is attributed to — the Book's as they stood when it was given (FDBK-013; Issue #61 review) — said on
 * the entry only where they are not the Book's people now, which its heading names.
 */
export function feedbackAttributionLine(people: { readonly authors: ReadonlyArray<string>; readonly editors: ReadonlyArray<string> }): string {
  return `当时的人员 · ${learningPeopleLine(people)}`;
}

/** Its reason as it stands; neither 不说明 nor silence is read as anything more (FDBK-007). */
export function feedbackReasonLine(entry: { readonly reason: string | null; readonly reasonState: 'given' | 'dismissed' | 'none' }): string {
  if (entry.reasonState === 'given' && entry.reason !== null) return `原因：${entry.reason}`;
  return entry.reasonState === 'dismissed' ? '选择了不说明原因' : '没有说明原因';
}
