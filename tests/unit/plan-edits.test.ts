import { describe, expect, it } from 'vitest';
import {
  ASSURANCE_SAMPLING_REMOVED,
  NO_PLAN_EDITS,
  PLAN_EDIT_ADAPTATION_LABELS,
  PLAN_EDIT_STEP_LABELS,
  SAFE_RETRY_WITHHELD,
  assuranceSamplingKept,
  canonicalPlanEdits,
  planEditDiff,
  planEditsAreEmpty,
  planEditsOf,
  safeRetryAllowed,
  samePlanEdits,
} from '../../src/service/analysis/plan-edits.js';
import { planBoundarySplit } from '../../src/service/analysis/plan-boundary.js';

// The editable plan (Issue #419, plan slice S73; V2-UX-PLAN-011): the two edits a baseline analysis plan takes — the
// step the Run can do without and the adaptation it can be denied — as one canonical record, the diff its Plan Revision
// carries, and the envelope's split without a withdrawn adaptation.

describe('what an editor may leave out of a baseline analysis plan', () => {
  it('names only what the Run honours, in the plan\'s words', () => {
    expect(PLAN_EDIT_STEP_LABELS).toEqual({ 'assurance-sampling': '核对与抽检' });
    expect(PLAN_EDIT_ADAPTATION_LABELS).toEqual({ 'safe-retry': '模型服务暂时出错时，同一个阅读范围安全地再试一次' });
    expect(ASSURANCE_SAMPLING_REMOVED).toBe('按你修改的计划，这次运行不做核对与抽检；保证抽样未发起。');
    expect(SAFE_RETRY_WITHHELD).toBe('按你修改的计划，这次运行不自动重试');
  });

  it('reads two requests that mean the same edit as one record, and refuses anything else', () => {
    expect(canonicalPlanEdits({ removedSteps: ['assurance-sampling'], disallowedAdaptations: ['safe-retry'] }))
      .toEqual({ removedSteps: ['assurance-sampling'], disallowedAdaptations: ['safe-retry'] });
    expect(canonicalPlanEdits({ removedSteps: [], disallowedAdaptations: [] })).toEqual(NO_PLAN_EDITS);
    // A step the analysis cannot do without, an unknown adaptation, a repeat, or a list that is not one.
    expect(canonicalPlanEdits({ removedSteps: ['units'], disallowedAdaptations: [] })).toBeNull();
    expect(canonicalPlanEdits({ removedSteps: [], disallowedAdaptations: ['ask-first'] })).toBeNull();
    expect(canonicalPlanEdits({ removedSteps: ['assurance-sampling', 'assurance-sampling'], disallowedAdaptations: [] })).toBeNull();
    expect(canonicalPlanEdits({ removedSteps: 'assurance-sampling', disallowedAdaptations: [] })).toBeNull();
  });

  it('reads a stored plan: nothing named is nothing left out; an empty or foreign record is refused', () => {
    expect(planEditsOf({ steps: ['逐单元分析'] })).toEqual(NO_PLAN_EDITS);
    expect(planEditsOf({ editorEdits: { removedSteps: ['assurance-sampling'], disallowedAdaptations: [] } }))
      .toEqual({ removedSteps: ['assurance-sampling'], disallowedAdaptations: [] });
    expect(() => planEditsOf({ editorEdits: { removedSteps: [], disallowedAdaptations: [] } })).toThrow('PLAN_EDITS_INVALID');
    expect(() => planEditsOf({ editorEdits: { removedSteps: ['reduction'], disallowedAdaptations: [] } })).toThrow('PLAN_EDITS_INVALID');
  });

  it('says what each edit means for the Run', () => {
    const both = { removedSteps: ['assurance-sampling'] as const, disallowedAdaptations: ['safe-retry'] as const };
    expect([assuranceSamplingKept(NO_PLAN_EDITS), safeRetryAllowed(NO_PLAN_EDITS), planEditsAreEmpty(NO_PLAN_EDITS)]).toEqual([true, true, true]);
    expect([assuranceSamplingKept(both), safeRetryAllowed(both), planEditsAreEmpty(both)]).toEqual([false, false, false]);
    expect(samePlanEdits(both, { removedSteps: ['assurance-sampling'], disallowedAdaptations: ['safe-retry'] })).toBe(true);
    expect(samePlanEdits(both, NO_PLAN_EDITS)).toBe(false);
  });

  it('diffs one line per item whose state changed, each the editor\'s own edit', () => {
    const removed = { removedSteps: ['assurance-sampling'] as const, disallowedAdaptations: [] };
    expect(planEditDiff(NO_PLAN_EDITS, removed)).toEqual([
      { field: 'steps.assurance-sampling', label: '核对与抽检', prior: '要做', proposed: '不做', materiality: 'edited' },
    ]);
    expect(planEditDiff(removed, { removedSteps: [], disallowedAdaptations: ['safe-retry'] })).toEqual([
      { field: 'steps.assurance-sampling', label: '核对与抽检', prior: '不做', proposed: '要做', materiality: 'edited' },
      { field: 'adaptations.safe-retry', label: '模型服务暂时出错时，同一个阅读范围安全地再试一次', prior: '允许', proposed: '不允许', materiality: 'edited' },
    ]);
    expect(planEditDiff(removed, removed)).toEqual([]);
  });

  it('leaves a withdrawn adaptation out of the envelope\'s split, which the Run Authorization binds', () => {
    expect(planBoundarySplit().adaptable.map((entry) => entry.adaptationClass)).toEqual(['safe-retry']);
    expect(planBoundarySplit(['safe-retry']).adaptable).toEqual([]);
    expect(planBoundarySplit(['safe-retry']).material).toEqual(planBoundarySplit().material);
  });
});
