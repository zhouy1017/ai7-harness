import type { PlanEditsProjection, PlanRevisionDiffEntryProjection } from '../../shared/protocol.js';

/**
 * The editable plan (Issue #419, plan slice S73; V2-UX-PLAN-011): the edits an editor may make to a baseline analysis
 * plan, and only those its Run honours. The analysis's steps are its procedure, so of them only 核对与抽检 — the
 * Assurance Sampling suboperation — can be left out with the result still formed; and the one declared Plan
 * Adaptation, the safe retry, can be withdrawn — or, from S76d (Issue #422), moved into 先问你, so the Run asks the
 * editor before it makes it. Rewriting, adding or reordering a step, and the reference the update stands on, have
 * nothing in the Run to change, so they are not offered.
 */
export const PLAN_EDITABLE_STEPS = ['assurance-sampling'] as const;
export type PlanEditableStep = (typeof PLAN_EDITABLE_STEPS)[number];
export const PLAN_EDITABLE_ADAPTATIONS = ['safe-retry'] as const;
export type PlanEditableAdaptation = (typeof PLAN_EDITABLE_ADAPTATIONS)[number];

/** What an edited plan leaves out; the plan AI7 proposed leaves out nothing. */
export type PlanEdits = PlanEditsProjection;
export const NO_PLAN_EDITS: PlanEdits = Object.freeze({ removedSteps: [], disallowedAdaptations: [] });

/** The words the plan and its revisions use for each editable item. */
export const PLAN_EDIT_STEP_LABELS: Readonly<Record<PlanEditableStep, string>> = { 'assurance-sampling': '核对与抽检' };
export const PLAN_EDIT_ADAPTATION_LABELS: Readonly<Record<PlanEditableAdaptation, string>> = {
  'safe-retry': '模型服务暂时出错时，同一个阅读范围安全地再试一次',
};

/**
 * How the Run may make a declared adaptation (Issue #422, S76d; PLAN-011, PLAN-012): on its own (`运行中 AI7 可以自己
 * 调整`), only once the editor answered its question (`这些一变就先停下来问你`), or not at all — each in the plan's words.
 */
export type AdaptationMode = 'automatic' | 'ask-first' | 'withheld';
export const ADAPTATION_MODE_WORDS: Readonly<Record<AdaptationMode, string>> = { automatic: '允许', 'ask-first': '先问你', withheld: '不允许' };

/** The Run's own words for what the editor left out: the sample it does not draw, and the retry it does not make. */
export const ASSURANCE_SAMPLING_REMOVED = '按你修改的计划，这次运行不做核对与抽检；保证抽样未发起。' as const;
export const SAFE_RETRY_WITHHELD = '按你修改的计划，这次运行不自动重试' as const;

function known<T extends string>(values: ReadonlyArray<T>, value: unknown): value is T {
  return typeof value === 'string' && (values as ReadonlyArray<string>).includes(value);
}

/**
 * The canonical form of an edit: each list holds known ids only, once each, in their declared order — so two
 * requests that mean the same edit are the same record. An adaptation is withheld or asked first, never both. The
 * 先问你 list is named only when it holds something, so every edit made before it existed reads back byte for byte.
 * `null` when anything in it is not an editable item.
 */
export function canonicalPlanEdits(input: { removedSteps: unknown; disallowedAdaptations: unknown; askFirstAdaptations?: unknown }): PlanEdits | null {
  const { removedSteps, disallowedAdaptations } = input;
  const askFirst = input.askFirstAdaptations === undefined ? [] : input.askFirstAdaptations;
  if (!Array.isArray(removedSteps) || !Array.isArray(disallowedAdaptations) || !Array.isArray(askFirst)) return null;
  if (!removedSteps.every((entry) => known(PLAN_EDITABLE_STEPS, entry))) return null;
  if (!disallowedAdaptations.every((entry) => known(PLAN_EDITABLE_ADAPTATIONS, entry))) return null;
  if (!askFirst.every((entry) => known(PLAN_EDITABLE_ADAPTATIONS, entry))) return null;
  if (new Set(removedSteps).size !== removedSteps.length || new Set(disallowedAdaptations).size !== disallowedAdaptations.length ||
      new Set(askFirst).size !== askFirst.length) return null;
  if (askFirst.some((entry) => disallowedAdaptations.includes(entry))) return null;
  const asked = PLAN_EDITABLE_ADAPTATIONS.filter((adaptation) => askFirst.includes(adaptation));
  return {
    removedSteps: PLAN_EDITABLE_STEPS.filter((step) => removedSteps.includes(step)),
    disallowedAdaptations: PLAN_EDITABLE_ADAPTATIONS.filter((adaptation) => disallowedAdaptations.includes(adaptation)),
    ...(asked.length === 0 ? {} : { askFirstAdaptations: asked }),
  };
}

/** The edits a stored execution plan carries: none when it names none, and refused when what it names is not one. */
export function planEditsOf(executionPlan: unknown): PlanEdits {
  const record = executionPlan !== null && typeof executionPlan === 'object' ? (executionPlan as Record<string, unknown>).editorEdits : undefined;
  if (record === undefined) return NO_PLAN_EDITS;
  const edits = record !== null && typeof record === 'object'
    ? canonicalPlanEdits(record as { removedSteps: unknown; disallowedAdaptations: unknown; askFirstAdaptations?: unknown })
    : null;
  if (edits === null || planEditsAreEmpty(edits)) throw new Error('PLAN_EDITS_INVALID');
  return edits;
}

export function planEditsAreEmpty(edits: PlanEdits): boolean {
  return edits.removedSteps.length === 0 && edits.disallowedAdaptations.length === 0 && (edits.askFirstAdaptations ?? []).length === 0;
}

export function samePlanEdits(left: PlanEdits, right: PlanEdits): boolean {
  return JSON.stringify(left.removedSteps) === JSON.stringify(right.removedSteps) &&
    JSON.stringify(left.disallowedAdaptations) === JSON.stringify(right.disallowedAdaptations) &&
    JSON.stringify(left.askFirstAdaptations ?? []) === JSON.stringify(right.askFirstAdaptations ?? []);
}

/** How the Run this plan binds may make an adaptation it declares (Issue #422, S76d). */
export function adaptationMode(edits: PlanEdits, adaptation: PlanEditableAdaptation): AdaptationMode {
  if (edits.disallowedAdaptations.includes(adaptation)) return 'withheld';
  return (edits.askFirstAdaptations ?? []).includes(adaptation) ? 'ask-first' : 'automatic';
}

/** Whether the Run this plan binds may make the safe retry at all — on its own, or once the editor said so. */
export function safeRetryAllowed(edits: PlanEdits): boolean {
  return adaptationMode(edits, 'safe-retry') !== 'withheld';
}

/** Whether the Run this plan binds draws the assurance sample. */
export function assuranceSamplingKept(edits: PlanEdits): boolean {
  return !edits.removedSteps.includes('assurance-sampling');
}

/**
 * The Plan Revision diff of an edit (PLAN-009, PLAN-011): one line per item whose state changed, each `edited` — the
 * editor's own change, neither a material drift nor its derived consequence.
 */
export function planEditDiff(prior: PlanEdits, next: PlanEdits): PlanRevisionDiffEntryProjection[] {
  const entries: PlanRevisionDiffEntryProjection[] = [];
  for (const step of PLAN_EDITABLE_STEPS) {
    const before = prior.removedSteps.includes(step);
    const after = next.removedSteps.includes(step);
    if (before !== after) {
      entries.push({ field: `steps.${step}`, label: PLAN_EDIT_STEP_LABELS[step], prior: before ? '不做' : '要做', proposed: after ? '不做' : '要做', materiality: 'edited' });
    }
  }
  for (const adaptation of PLAN_EDITABLE_ADAPTATIONS) {
    const before = adaptationMode(prior, adaptation);
    const after = adaptationMode(next, adaptation);
    if (before !== after) {
      entries.push({
        field: `adaptations.${adaptation}`,
        label: PLAN_EDIT_ADAPTATION_LABELS[adaptation],
        prior: ADAPTATION_MODE_WORDS[before],
        proposed: ADAPTATION_MODE_WORDS[after],
        materiality: 'edited',
      });
    }
  }
  return entries;
}
