import type {
  EditorialMarkKind,
  ReviewFindingStatus,
  ReviewRunCategoryState,
  ReviewRunState,
} from '../../shared/protocol.js';

/**
 * What a Review Run, its categories and its findings read as (Issue #417; V2-UX-REV-004, REV-008,
 * MARK-010, FIND-002). Every one of these is derived from records and never stored beside them: a
 * finding's status is its mark's, a category's state is its last event, and a Run's state is its
 * categories'. The derivations are pure so the projection, the Report and the unit suite read them the
 * same way.
 */

/** What a finding says when the words it points at no longer stand where the review found them. */
export const ANCHOR_CHANGED_STATE_LINE = '原文已变，未能在稿件上标出' as const;

export type ReviewMarkStatus = 'open' | 'resolved' | 'applied' | 'removed' | 'converted';

export interface ReviewFindingStatusInput {
  /** An `ignored` disposition is recorded for the finding. */
  readonly ignored: boolean;
  readonly markId: string | null;
  readonly markStatus: ReviewMarkStatus | null;
  /** The latest Proposal Decision on the mark's item that is not withdrawn; `null` when there is none. */
  readonly decision: 'accepted' | 'accepted-with-edit' | 'rejected' | null;
  /** What the mark became when it was converted; `null` when it was not. */
  readonly convertedTo: EditorialMarkKind | null;
}

/**
 * B7: ignored wins; a finding that never became a mark is pending and says why; an open mark with no
 * decision is pending; everything else — resolved, applied, converted, removed, or a decision recorded —
 * is handled, and the detail says which.
 */
export function reviewFindingStatus(input: ReviewFindingStatusInput): { status: ReviewFindingStatus; statusDetail: string } {
  if (input.ignored) return { status: 'ignored', statusDetail: '已忽略并说明原因' };
  if (input.markId === null) return { status: 'pending', statusDetail: ANCHOR_CHANGED_STATE_LINE };
  if (input.decision === 'rejected') return { status: 'handled', statusDetail: '已拒绝这条修改建议' };
  if (input.markStatus === 'applied') return { status: 'handled', statusDetail: '已接受并应用' };
  if (input.decision === 'accepted-with-edit') return { status: 'handled', statusDetail: '已修改后接受，尚未应用' };
  if (input.decision === 'accepted') return { status: 'handled', statusDetail: '已接受' };
  switch (input.markStatus) {
    case 'resolved':
      return { status: 'handled', statusDetail: '已标记为已处理' };
    case 'converted':
      return { status: 'handled', statusDetail: input.convertedTo === 'change-suggestion' ? '已转为修改建议' : '已转为批注' };
    case 'removed':
      return { status: 'handled', statusDetail: '稿件上的标记已删除' };
    default:
      return { status: 'pending', statusDetail: '待处理' };
  }
}

/** The events a category of a Review Run records, in the order they can happen. */
export type ReviewRunCategoryEventState = 'dispatched' | 'settled' | 'failed' | 'interrupted' | 'refused' | 'materialized';
export const REVIEW_RUN_CATEGORY_EVENT_STATES: readonly ReviewRunCategoryEventState[] =
  ['dispatched', 'settled', 'failed', 'interrupted', 'refused', 'materialized'];

/** A category is finished exactly when its last event is one of these; 继续审阅 never repeats one. */
export const TERMINAL_CATEGORY_EVENTS: ReadonlySet<ReviewRunCategoryEventState> = new Set(['materialized', 'failed', 'interrupted', 'refused']);

export const REVIEW_RUN_CATEGORY_STATE_LABELS = {
  prepared: '计划已冻结 · 待授权',
  waiting: '等待审阅',
  running: '正在审阅',
  settled: '已完成 · 发现可处理',
  failed: '运行失败',
  interrupted: '已中断',
  refused: '未能开始',
} as const satisfies Record<ReviewRunCategoryState, string>;

export const REVIEW_RUN_STATE_LABELS = {
  prepared: '计划已冻结 · 待授权',
  running: '正在审阅',
  settled: '已完成',
  partial: '部分完成',
  failed: '未能完成',
} as const satisfies Record<ReviewRunState, string>;

/**
 * What a dispatched category's ledger Run came to, as far as a Review Run needs to know before it has
 * recorded it: it completed (a revision to write), it failed, or it did not finish — interrupted, or
 * left executing by a service that stopped under it.
 */
export type ReviewLedgerRunOutcome = 'completed' | 'failed' | 'unfinished';

export interface ReviewRunCategoryStateInput {
  readonly authorized: boolean;
  /** The Run is being driven in this service lifetime. */
  readonly driving: boolean;
  readonly lastEvent: ReviewRunCategoryEventState | null;
  /** For a dispatched category: what its ledger Run came to. */
  readonly ledgerRun: ReviewLedgerRunOutcome;
}

/**
 * One category's state as an editor reads it. While the Run is driven, a category between dispatch
 * and materialization is running. When it is not — the service stopped — a dispatched category reads
 * what its ledger Run came to: `waiting` when it completed and only its findings are left to write,
 * which 继续审阅 does, `failed` when it failed, and `interrupted` when it never finished. `pending` says
 * the category has no terminal event yet.
 */
export function reviewRunCategoryState(input: ReviewRunCategoryStateInput): { state: ReviewRunCategoryState; pending: boolean } {
  switch (input.lastEvent) {
    case null:
      return { state: input.authorized ? 'waiting' : 'prepared', pending: true };
    case 'dispatched':
      if (input.driving) return { state: 'running', pending: true };
      return { state: input.ledgerRun === 'completed' ? 'waiting' : input.ledgerRun === 'failed' ? 'failed' : 'interrupted', pending: true };
    case 'settled':
      return { state: input.driving ? 'running' : 'waiting', pending: true };
    case 'materialized':
      return { state: 'settled', pending: false };
    default:
      return { state: input.lastEvent, pending: false };
  }
}

/**
 * The Run's state from its categories': prepared until approved; running while driven with anything
 * left; `partial` with 继续审阅 when it stopped with categories left; once every category is finished,
 * `settled` if all of them reached the manuscript, `failed` if none did, and `partial` otherwise.
 */
export function reviewRunState(input: {
  readonly authorized: boolean;
  readonly driving: boolean;
  readonly categories: ReadonlyArray<{ readonly pending: boolean; readonly materialized: boolean }>;
}): { state: ReviewRunState; canContinue: boolean } {
  if (!input.authorized) return { state: 'prepared', canContinue: false };
  if (input.categories.some((category) => category.pending)) {
    return input.driving ? { state: 'running', canContinue: false } : { state: 'partial', canContinue: true };
  }
  const materialized = input.categories.filter((category) => category.materialized).length;
  if (materialized === input.categories.length) return { state: 'settled', canContinue: false };
  return { state: materialized === 0 ? 'failed' : 'partial', canContinue: false };
}

export function reviewRunStateLabel(state: ReviewRunState, canContinue: boolean): string {
  return state === 'partial' && canContinue ? '部分完成 · 可继续审阅' : REVIEW_RUN_STATE_LABELS[state];
}
