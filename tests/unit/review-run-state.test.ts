import { describe, expect, it } from 'vitest';
import {
  ANCHOR_CHANGED_STATE_LINE,
  reviewFindingStatus,
  reviewRunCategoryState,
  reviewRunState,
  reviewRunStateLabel,
  type ReviewFindingStatusInput,
} from '../../src/service/review/review-run-state.js';

// Unit suite for what a Review Run, its categories and its findings read as (Issue #417; REV-004,
// REV-008, MARK-010). Every state is derived; nothing here reads a store.

const OPEN: ReviewFindingStatusInput = { ignored: false, markId: 'm', markStatus: 'open', decision: null, convertedTo: null };

describe('a finding\'s status, derived from its mark (MARK-010)', () => {
  it('is pending while its mark is open and undecided, and when it never reached the manuscript', () => {
    expect(reviewFindingStatus(OPEN)).toEqual({ status: 'pending', statusDetail: '待处理' });
    expect(reviewFindingStatus({ ...OPEN, markId: null, markStatus: null })).toEqual({ status: 'pending', statusDetail: ANCHOR_CHANGED_STATE_LINE });
  });

  it('is handled once anything was done with its mark, and says what', () => {
    expect(reviewFindingStatus({ ...OPEN, markStatus: 'resolved' }).statusDetail).toBe('已标记为已处理');
    expect(reviewFindingStatus({ ...OPEN, markStatus: 'applied', decision: 'accepted' }).statusDetail).toBe('已接受并应用');
    expect(reviewFindingStatus({ ...OPEN, markStatus: 'resolved', decision: 'rejected' }).statusDetail).toBe('已拒绝这条修改建议');
    expect(reviewFindingStatus({ ...OPEN, decision: 'accepted-with-edit' }).statusDetail).toBe('已修改后接受，尚未应用');
    expect(reviewFindingStatus({ ...OPEN, markStatus: 'converted', convertedTo: 'change-suggestion' }).statusDetail).toBe('已转为修改建议');
    expect(reviewFindingStatus({ ...OPEN, markStatus: 'converted', convertedTo: 'annotation' }).statusDetail).toBe('已转为批注');
    expect(reviewFindingStatus({ ...OPEN, markStatus: 'removed' }).statusDetail).toBe('稿件上的标记已删除');
    for (const input of [
      { ...OPEN, markStatus: 'resolved' as const }, { ...OPEN, markStatus: 'applied' as const }, { ...OPEN, decision: 'rejected' as const },
      { ...OPEN, markStatus: 'converted' as const }, { ...OPEN, markStatus: 'removed' as const },
    ]) {
      expect(reviewFindingStatus(input).status).toBe('handled');
    }
  });

  it('is ignored once a disposition says so, whatever its mark reads', () => {
    expect(reviewFindingStatus({ ...OPEN, ignored: true, markStatus: 'removed' }).status).toBe('ignored');
    expect(reviewFindingStatus({ ...OPEN, ignored: true, markId: null, markStatus: null }).status).toBe('ignored');
  });
});

describe('a category\'s state inside its Run', () => {
  it('is prepared before the approval and waits after it', () => {
    expect(reviewRunCategoryState({ authorized: false, driving: false, lastEvent: null, ledgerRun: 'unfinished' })).toEqual({ state: 'prepared', pending: true });
    expect(reviewRunCategoryState({ authorized: true, driving: true, lastEvent: null, ledgerRun: 'unfinished' })).toEqual({ state: 'waiting', pending: true });
  });

  it('runs from dispatch until its findings are on the manuscript, while the Run is driven', () => {
    expect(reviewRunCategoryState({ authorized: true, driving: true, lastEvent: 'dispatched', ledgerRun: 'unfinished' }).state).toBe('running');
    expect(reviewRunCategoryState({ authorized: true, driving: true, lastEvent: 'settled', ledgerRun: 'completed' }).state).toBe('running');
    expect(reviewRunCategoryState({ authorized: true, driving: true, lastEvent: 'materialized', ledgerRun: 'completed' })).toEqual({ state: 'settled', pending: false });
  });

  it('reads what its ledger Run came to when the service stopped under it, and waits when only its findings were left to write', () => {
    expect(reviewRunCategoryState({ authorized: true, driving: false, lastEvent: 'dispatched', ledgerRun: 'unfinished' })).toEqual({ state: 'interrupted', pending: true });
    expect(reviewRunCategoryState({ authorized: true, driving: false, lastEvent: 'dispatched', ledgerRun: 'failed' })).toEqual({ state: 'failed', pending: true });
    expect(reviewRunCategoryState({ authorized: true, driving: false, lastEvent: 'dispatched', ledgerRun: 'completed' })).toEqual({ state: 'waiting', pending: true });
    expect(reviewRunCategoryState({ authorized: true, driving: false, lastEvent: 'settled', ledgerRun: 'completed' })).toEqual({ state: 'waiting', pending: true });
  });

  it('keeps a finished category finished', () => {
    for (const lastEvent of ['failed', 'interrupted', 'refused'] as const) {
      expect(reviewRunCategoryState({ authorized: true, driving: true, lastEvent, ledgerRun: 'completed' })).toEqual({ state: lastEvent, pending: false });
    }
  });
});

describe('a Review Run\'s state', () => {
  const done = { pending: false, materialized: true };
  const lost = { pending: false, materialized: false };
  const left = { pending: true, materialized: false };

  it('is prepared, then running, then settled when every category reached the manuscript', () => {
    expect(reviewRunState({ authorized: false, driving: false, categories: [left] })).toEqual({ state: 'prepared', canContinue: false });
    expect(reviewRunState({ authorized: true, driving: true, categories: [done, left] })).toEqual({ state: 'running', canContinue: false });
    expect(reviewRunState({ authorized: true, driving: false, categories: [done, done] })).toEqual({ state: 'settled', canContinue: false });
  });

  it('offers 继续审阅 when it stopped with categories left, and is partial or failed when it finished short', () => {
    expect(reviewRunState({ authorized: true, driving: false, categories: [done, left] })).toEqual({ state: 'partial', canContinue: true });
    expect(reviewRunState({ authorized: true, driving: false, categories: [left, left] })).toEqual({ state: 'partial', canContinue: true });
    expect(reviewRunState({ authorized: true, driving: false, categories: [done, lost] })).toEqual({ state: 'partial', canContinue: false });
    expect(reviewRunState({ authorized: true, driving: false, categories: [lost, lost] })).toEqual({ state: 'failed', canContinue: false });
    expect(reviewRunStateLabel('partial', true)).toBe('部分完成 · 可继续审阅');
    expect(reviewRunStateLabel('partial', false)).toBe('部分完成');
  });
});
