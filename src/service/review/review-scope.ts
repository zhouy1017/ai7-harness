import {
  REVIEW_SCOPE_LABELS,
  type AnalysisTaskMode,
  type BaselineAnalysisSelectedRange,
  type ReviewChapterOptionProjection,
  type ReviewScopeKind,
} from '../../shared/protocol.js';
import type { ReviewCategoryExecutor } from './category-configuration.js';

/**
 * How a Review Run's scope becomes each category's Task (Issue #417, plan slice S69; V2-UX-REV-001,
 * REV-007). A scope is the editor's; a Task mode is the category ledger's. The rules are pure and live
 * here so that the sheet's per-category availability, the preparation that freezes each plan, and the
 * unit suite all read the same answer.
 */

/** 当前选区 needs a selection handed over from the manuscript, which reaches 审阅 with the Task surface. */
export const SELECTION_UNAVAILABLE_REASON = '从稿件里选中文字后发起（随任务面接入）' as const;
export const NEVER_REVIEWED_REASON = '这一类还没有审阅过，没有“改动过的章”可比；请先审全书或所选各章。' as const;
export const NOTHING_CHANGED_REASON = '稿件在这一类上次审阅之后没有改动；没有需要只审的章。' as const;
export const LEADS_ABSENT_REASON = '先完成基线分析，才有前后不一致的线索。' as const;
export const LEADS_CHANGED_REASON = '线索来自基线分析的全书结果，不按改动过的章筛选；请选全书或所选各章。' as const;
export const NO_CHAPTERS_REASON = '这份稿件还没有可选的章：它既没有标题，也还没有可分的结构单元。' as const;
/**
 * 事实核查 reads the factual kind, which prepares only its whole first Task today: its range and update
 * modes arrive with the factual surfaces (S18b, S19), so every other scope says so rather than being
 * approximated by a whole-book check.
 */
export const FACTUAL_AGAIN_REASON = '这本书已完成过一次全书事实核查；再次核查随事实核查的更新方式接入。' as const;
export const FACTUAL_CHAPTERS_REASON = '事实核查暂只能核查全书；按章核查随事实核查的更新方式接入。' as const;
export const FACTUAL_CHANGED_REASON = '事实核查暂只能核查全书；只审改动过的章随事实核查的更新方式接入。' as const;

/** One contiguous block range, inclusive, over the working manuscript's positions. */
export type ReviewBlockRange = BaselineAnalysisSelectedRange;

/** A scope once its chapters are resolved to one contiguous block range. */
export interface ResolvedReviewScope {
  readonly kind: ReviewScopeKind;
  /** The block range of 选章 and 当前选区; `null` for the whole manuscript and for the changed chapters. */
  readonly selectedRange: ReviewBlockRange | null;
}

/** What a scope asks of one category. */
export type ReviewCategoryScopePlan =
  | { readonly kind: 'task'; readonly mode: AnalysisTaskMode; readonly selectedRange: ReviewBlockRange | null }
  | { readonly kind: 'leads'; readonly selectedRange: ReviewBlockRange | null }
  | { readonly kind: 'refused'; readonly reason: string };

/** The facts of one category's ledger a scope reads: whether it has reviewed, and whether that is stale. */
export interface ReviewCategoryLedgerFacts {
  readonly hasRevision: boolean;
  /** The latest revision's freshness is `stale`: the manuscript changed since it was read. */
  readonly stale: boolean;
  /** Why `review-sync` is not offered, in the ledger's own words, when it is not. */
  readonly syncUnavailableReason: string | null;
  /** For the leads: whether the baseline analysis holds a revision to take them from. */
  readonly baselineRevision: boolean;
}

/**
 * The mode each scope reads for one category (B6):
 * - 全书 is the category's first whole review, or a review again once it has one;
 * - 只审改动过的章 is a sync, offered once the category has reviewed and the manuscript moved since;
 * - 选章 is a first range review, or a range review once the category has one;
 * - 当前选区 is not offered yet.
 * The leads read no mode at all, and 事实核查 reads only its whole first Task.
 */
export function reviewCategoryScopePlan(
  executor: ReviewCategoryExecutor,
  unavailableReason: string | null,
  scope: ResolvedReviewScope,
  facts: ReviewCategoryLedgerFacts,
): ReviewCategoryScopePlan {
  if (executor === 'unavailable') return { kind: 'refused', reason: unavailableReason ?? '这一类暂不可用。' };
  if (scope.kind === 'selection') return { kind: 'refused', reason: SELECTION_UNAVAILABLE_REASON };
  if (executor === 'baseline-leads') {
    if (!facts.baselineRevision) return { kind: 'refused', reason: LEADS_ABSENT_REASON };
    if (scope.kind === 'changed') return { kind: 'refused', reason: LEADS_CHANGED_REASON };
    return { kind: 'leads', selectedRange: scope.kind === 'chapters' ? scope.selectedRange : null };
  }
  if (executor === 'factual-review-kind') {
    if (scope.kind === 'chapters') return { kind: 'refused', reason: FACTUAL_CHAPTERS_REASON };
    if (scope.kind === 'changed') return { kind: 'refused', reason: FACTUAL_CHANGED_REASON };
    return facts.hasRevision ? { kind: 'refused', reason: FACTUAL_AGAIN_REASON } : { kind: 'task', mode: 'whole-manuscript', selectedRange: null };
  }
  if (scope.kind === 'whole') return { kind: 'task', mode: facts.hasRevision ? 'review-again' : 'review-first', selectedRange: null };
  if (scope.kind === 'changed') {
    if (!facts.hasRevision) return { kind: 'refused', reason: NEVER_REVIEWED_REASON };
    return facts.stale
      ? { kind: 'task', mode: 'review-sync', selectedRange: null }
      : { kind: 'refused', reason: facts.syncUnavailableReason ?? NOTHING_CHANGED_REASON };
  }
  if (scope.selectedRange === null) return { kind: 'refused', reason: NO_CHAPTERS_REASON };
  return { kind: 'task', mode: facts.hasRevision ? 'review-range' : 'review-first-range', selectedRange: scope.selectedRange };
}

/** One heading of the working manuscript's outline, as the chapter options are derived from it. */
export interface ReviewOutlineHeading {
  readonly blockId: string;
  readonly position: number;
  readonly level: number;
  readonly title: string;
}

/**
 * The chapters of a manuscript with headings. A chapter runs from its heading to the block before the
 * next heading of the same or a higher level — so a chapter keeps its own subheadings — or to the last
 * block of the manuscript.
 */
export function chapterOptionsFromOutline(headings: ReadonlyArray<ReviewOutlineHeading>, totalBlocks: number): ReviewChapterOptionProjection[] {
  const ordered = [...headings].sort((left, right) => left.position - right.position);
  return ordered.map((heading, index) => {
    const next = ordered.slice(index + 1).find((candidate) => candidate.level <= heading.level);
    return {
      blockId: heading.blockId,
      title: heading.title,
      level: heading.level,
      position: heading.position,
      endPosition: next === undefined ? totalBlocks : next.position - 1,
    };
  });
}

/** One structural unit of the coverage manifest the working manuscript derives. */
export interface ReviewStructuralUnit {
  readonly ordinal: number;
  readonly startPosition: number;
  readonly endPosition: number;
  readonly firstBlockId: string;
}

/**
 * The chapters of a manuscript without headings: its analysis units, which are what every category
 * reads unit by unit. Their titles name positions only, never the manuscript's words.
 */
export function chapterOptionsFromUnits(units: ReadonlyArray<ReviewStructuralUnit>): ReviewChapterOptionProjection[] {
  return units.map((unit) => ({
    blockId: unit.firstBlockId,
    title: `第 ${unit.ordinal} 部分 · 内容块 ${unit.startPosition}–${unit.endPosition}`,
    level: 1,
    position: unit.startPosition,
    endPosition: unit.endPosition,
  }));
}

/**
 * 选章 as one contiguous block range: from the first chosen chapter's first block to the last chosen
 * chapter's last block. `null` when either chapter is not one of the options or they are out of order.
 */
export function resolveChapterRange(
  chapters: ReadonlyArray<ReviewChapterOptionProjection>,
  fromChapterBlockId: string,
  toChapterBlockId: string,
): ReviewBlockRange | null {
  const from = chapters.find((chapter) => chapter.blockId === fromChapterBlockId);
  const to = chapters.find((chapter) => chapter.blockId === toChapterBlockId);
  if (from === undefined || to === undefined || to.position < from.position) return null;
  return { startPosition: from.position, endPosition: to.endPosition };
}

/** The chapter option a block position falls in: the last chapter starting at or before it that also ends after it. */
export function chapterOfPosition(chapters: ReadonlyArray<ReviewChapterOptionProjection>, position: number): ReviewChapterOptionProjection | null {
  let found: ReviewChapterOptionProjection | null = null;
  for (const chapter of chapters) {
    if (chapter.position <= position && position <= chapter.endPosition) found = chapter;
  }
  return found;
}

/**
 * How a scope reads in a record: its label, and for 选章 the block range it resolved to. A chapter's
 * title is manuscript text, so the durable label names positions only.
 */
export function reviewScopeLabel(scope: ResolvedReviewScope): string {
  return scope.selectedRange === null
    ? REVIEW_SCOPE_LABELS[scope.kind]
    : `${REVIEW_SCOPE_LABELS[scope.kind]} · 内容块 ${scope.selectedRange.startPosition}–${scope.selectedRange.endPosition}`;
}
