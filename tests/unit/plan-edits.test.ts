import { describe, expect, it } from 'vitest';
import {
  ADAPTATION_MODE_WORDS,
  ASSURANCE_SAMPLING_REMOVED,
  NO_PLAN_EDITS,
  PLAN_CEILING_LAUNCH_REASON,
  PLAN_EDIT_ADAPTATION_LABELS,
  PLAN_EDIT_CEILING_MAX,
  PLAN_EDIT_STEP_LABELS,
  SAFE_RETRY_WITHHELD,
  adaptationMode,
  assuranceSamplingKept,
  canonicalPlanEdits,
  planEditCeiling,
  planEditDiff,
  planEditsAreEmpty,
  planEditsOf,
  safeRetryAllowed,
  samePlanEdits,
  withoutCeiling,
} from '../../src/service/analysis/plan-edits.js';
import { ASK_FIRST_SAFE_RETRY_STATEMENT, planBoundarySplit } from '../../src/service/analysis/plan-boundary.js';

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

// Issue #422 (plan slice S76d; PLAN-011, PLAN-012): the safe retry moved into 先问你 — the Run asks the editor before
// it makes it — as the canonical edit names it, the diff says it, and the envelope's split holds it apart.
describe('先问你 (S76d)', () => {
  const asked = { removedSteps: [], disallowedAdaptations: [], askFirstAdaptations: ['safe-retry'] as const };

  it('names the move only when something is asked first, and never with the same adaptation withheld', () => {
    expect(canonicalPlanEdits({ removedSteps: [], disallowedAdaptations: [], askFirstAdaptations: ['safe-retry'] })).toEqual(asked);
    // Absent or empty, the record reads as it did before S76d, byte for byte.
    expect(canonicalPlanEdits({ removedSteps: [], disallowedAdaptations: [], askFirstAdaptations: [] })).toEqual(NO_PLAN_EDITS);
    expect(canonicalPlanEdits({ removedSteps: [], disallowedAdaptations: [], askFirstAdaptations: [] })).not.toHaveProperty('askFirstAdaptations');
    expect(canonicalPlanEdits({ removedSteps: [], disallowedAdaptations: ['safe-retry'], askFirstAdaptations: ['safe-retry'] })).toBeNull();
    expect(canonicalPlanEdits({ removedSteps: [], disallowedAdaptations: [], askFirstAdaptations: ['assurance-sampling'] })).toBeNull();
    expect(canonicalPlanEdits({ removedSteps: [], disallowedAdaptations: [], askFirstAdaptations: 'safe-retry' })).toBeNull();
    expect(planEditsOf({ editorEdits: asked })).toEqual(asked);
  });

  it('says how the Run may make the retry, and diffs each change in the plan\'s words', () => {
    expect([adaptationMode(NO_PLAN_EDITS, 'safe-retry'), adaptationMode(asked, 'safe-retry'),
      adaptationMode({ removedSteps: [], disallowedAdaptations: ['safe-retry'] }, 'safe-retry')]).toEqual(['automatic', 'ask-first', 'withheld']);
    expect([safeRetryAllowed(asked), planEditsAreEmpty(asked), samePlanEdits(asked, NO_PLAN_EDITS)]).toEqual([true, false, false]);
    expect(ADAPTATION_MODE_WORDS).toEqual({ automatic: '允许', 'ask-first': '先问你', withheld: '不允许' });
    expect(planEditDiff(NO_PLAN_EDITS, asked)).toEqual([
      { field: 'adaptations.safe-retry', label: '模型服务暂时出错时，同一个阅读范围安全地再试一次', prior: '允许', proposed: '先问你', materiality: 'edited' },
    ]);
    expect(planEditDiff(asked, { removedSteps: [], disallowedAdaptations: ['safe-retry'] })[0]).toMatchObject({ prior: '先问你', proposed: '不允许' });
  });

  it('holds an asked adaptation apart in the split, and says where the editor may be asked', () => {
    const split = planBoundarySplit([], ['safe-retry']);
    expect(split.adaptable).toEqual([]);
    expect(split.askFirst?.map((entry) => entry.adaptationClass)).toEqual(['safe-retry']);
    expect(split.participation).toEqual({ expected: true, statement: ASK_FIRST_SAFE_RETRY_STATEMENT });
    expect(ASK_FIRST_SAFE_RETRY_STATEMENT).toBe('模型服务暂时出错时，先问你要不要把这个阅读范围安全地再试一次；只有等你回答的这一步会停下。');
    // A split with nothing asked first is the one every earlier plan froze.
    expect(planBoundarySplit()).not.toHaveProperty('askFirst');
    expect(planBoundarySplit().participation).toEqual({ expected: false, statement: '预计无需中途参与' });
  });
});

// 设置上限… (Issue #51, plan slice S16a; V2-UX-MODEL-015): the editor's own Run Budget Ceiling, in total tokens, as one more
// edit of the plan — named only when set, so every earlier edit reads back byte for byte.
describe('the editor\'s Run Budget Ceiling (S16a)', () => {
  const ceiling = (maxTotalTokens: number) => ({ kind: 'tokens' as const, maxTotalTokens });

  it('takes a whole count of tokens from one up, named only when set', () => {
    expect(canonicalPlanEdits({ removedSteps: [], disallowedAdaptations: [], runBudgetCeiling: ceiling(5000) }))
      .toEqual({ removedSteps: [], disallowedAdaptations: [], runBudgetCeiling: ceiling(5000) });
    // No ceiling, or `null`, sets none, and the record never names the key.
    expect(canonicalPlanEdits({ removedSteps: [], disallowedAdaptations: [], runBudgetCeiling: null })).toEqual(NO_PLAN_EDITS);
    expect(canonicalPlanEdits({ removedSteps: [], disallowedAdaptations: [] })).not.toHaveProperty('runBudgetCeiling');
    expect(canonicalPlanEdits({ removedSteps: [], disallowedAdaptations: [], runBudgetCeiling: ceiling(PLAN_EDIT_CEILING_MAX) })?.runBudgetCeiling)
      .toEqual(ceiling(999_999_999_999));
    for (const refused of [ceiling(0), ceiling(-1), ceiling(1.5), ceiling(PLAN_EDIT_CEILING_MAX + 1), { kind: 'usd', maxTotalTokens: 5 },
      { kind: 'tokens', maxTotalTokens: '5000' }, { kind: 'tokens', maxTotalTokens: 5000, extra: true }, 'unset', 5000, []]) {
      expect(canonicalPlanEdits({ removedSteps: [], disallowedAdaptations: [], runBudgetCeiling: refused })).toBeNull();
    }
  });

  it('reads a stored ceiling back, and states none as unset', () => {
    const edits = planEditsOf({ editorEdits: { removedSteps: ['assurance-sampling'], disallowedAdaptations: [], runBudgetCeiling: ceiling(20000) } });
    expect(planEditCeiling(edits)).toEqual(ceiling(20000));
    expect(planEditCeiling(NO_PLAN_EDITS)).toBe('unset');
    // A ceiling alone is an edit; a stored record that names only an empty one is refused, as any empty edit is.
    expect(planEditsAreEmpty({ removedSteps: [], disallowedAdaptations: [], runBudgetCeiling: ceiling(1) })).toBe(false);
    expect(() => planEditsOf({ editorEdits: { removedSteps: [], disallowedAdaptations: [], runBudgetCeiling: null } })).toThrow('PLAN_EDITS_INVALID');
  });

  it('compares and diffs the ceiling as the editor\'s own change to a material field', () => {
    const set = { removedSteps: [], disallowedAdaptations: [], runBudgetCeiling: ceiling(5000) };
    expect(samePlanEdits(set, { ...set, runBudgetCeiling: ceiling(5000) })).toBe(true);
    expect(samePlanEdits(set, { ...set, runBudgetCeiling: ceiling(20000) })).toBe(false);
    expect(samePlanEdits(set, NO_PLAN_EDITS)).toBe(false);
    expect(planEditDiff(NO_PLAN_EDITS, set)).toEqual([
      { field: 'runBudgetCeiling', label: 'Run Budget Ceiling 状态', prior: 'unset', proposed: ceiling(5000), materiality: 'edited' },
    ]);
    expect(planEditDiff(set, { ...set, runBudgetCeiling: ceiling(20000) })).toEqual([
      { field: 'runBudgetCeiling', label: 'Run Budget Ceiling 状态', prior: ceiling(5000), proposed: ceiling(20000), materiality: 'edited' },
    ]);
    // Removing it is a change too; the steps and adaptations come first, in their declared order.
    expect(planEditDiff({ ...set, removedSteps: ['assurance-sampling'] }, NO_PLAN_EDITS).map((entry) => entry.field))
      .toEqual(['steps.assurance-sampling', 'runBudgetCeiling']);
  });

  it('leaves the ceiling to the launch where the launch sets it, keeping the rest of the edit', () => {
    const edits = { removedSteps: ['assurance-sampling' as const], disallowedAdaptations: [], askFirstAdaptations: ['safe-retry' as const], runBudgetCeiling: ceiling(5000) };
    expect(withoutCeiling(edits)).toEqual({ removedSteps: ['assurance-sampling'], disallowedAdaptations: [], askFirstAdaptations: ['safe-retry'] });
    expect(withoutCeiling(NO_PLAN_EDITS)).toBe(NO_PLAN_EDITS);
    expect(PLAN_CEILING_LAUNCH_REASON).toBe('这次启动的预算上限由开发者实时启动参数决定，不能在计划里设置。');
  });
});
