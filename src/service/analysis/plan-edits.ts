import {
  EVIDENCE_ASSURANCE_LEVEL_LABELS,
  type EvidenceAssuranceLevel,
  type PlanEditsProjection,
  type PlanRevisionDiffEntryProjection,
  type RunBudgetCeilingState,
} from '../../shared/protocol.js';
import { MATERIAL_PLAN_FIELD_LABELS } from './plan-boundary.js';

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
export const PLAN_EDIT_ADAPTATION_LABELS: Readonly<Record<PlanEditableAdaptation | 'contract-retry', string>> = {
  'safe-retry': '模型服务暂时出错时，同一个阅读范围安全地再试一次',
  'contract-retry': '契约重试（同一消息再发一次）',
};

/**
 * How the Run may make a declared adaptation (Issue #422, S76d; PLAN-011, PLAN-012): on its own (`运行中 AI7 可以自己
 * 调整`), only once the editor answered its question (`这些一变就先停下来问你`), or not at all — each in the plan's words.
 */
export type AdaptationMode = 'automatic' | 'ask-first' | 'withheld';
export const ADAPTATION_MODE_WORDS: Readonly<Record<AdaptationMode, string>> = { automatic: '允许', 'ask-first': '先问你', withheld: '不允许' };

/**
 * 设置上限… (Issue #51, plan slice S16a; V2-UX-MODEL-015): the editor's own Run Budget Ceiling, in total tokens — the
 * unit every model turn reports. The largest is the launch form's: twelve digits, well inside the safe-integer range.
 */
export const PLAN_EDIT_CEILING_MAX = 999_999_999_999;
/** Why a developer-live plan takes no ceiling edit: its launch sets the Run Budget Ceiling (ADR 0065, ADR 0070). */
export const PLAN_CEILING_LAUNCH_REASON = '这次启动的预算上限由开发者实时启动参数决定，不能在计划里设置。' as const;
export type PlanEditCeiling = Extract<RunBudgetCeilingState, { kind: 'tokens' }>;

/**
 * The Evidence Assurance Level an edit names (Issue #901; EASSURE-001), as the plan states it: 标准核查 when it names none.
 * Only a factual-review Task's plan takes the edit; its ledger refuses it for every other kind.
 */
export function planEditAssuranceLevel(edits: PlanEdits): EvidenceAssuranceLevel {
  return edits.evidenceAssuranceLevel ?? 'standard';
}

/** The ceiling an edit names, as the plan states it: `unset` when the editor set none. */
export function planEditCeiling(edits: PlanEdits): RunBudgetCeilingState {
  return edits.runBudgetCeiling ?? 'unset';
}

/** A ceiling as the editor may set it: a whole count of tokens, at least one; `null` when it is not one. */
function canonicalCeiling(value: unknown): PlanEditCeiling | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const tokens = record.maxTotalTokens;
  if (Object.keys(record).length !== 2 || record.kind !== 'tokens' || typeof tokens !== 'number' || !Number.isSafeInteger(tokens) ||
      tokens < 1 || tokens > PLAN_EDIT_CEILING_MAX) return null;
  return { kind: 'tokens', maxTotalTokens: tokens };
}

/** The Run's own words for what the editor left out: the sample it does not draw, and the retry it does not make. */
export const ASSURANCE_SAMPLING_REMOVED = '按你修改的计划，这次运行不做核对与抽检；保证抽样未发起。' as const;
export const SAFE_RETRY_WITHHELD = '按你修改的计划，这次运行不自动重试' as const;

function known<T extends string>(values: ReadonlyArray<T>, value: unknown): value is T {
  return typeof value === 'string' && (values as ReadonlyArray<string>).includes(value);
}

/**
 * The canonical form of an edit: each list holds known ids only, once each, in their declared order — so two
 * requests that mean the same edit are the same record. An adaptation is withheld or asked first, never both. The
 * 先问你 list and the ceiling (Issue #51, S16a) are named only when they hold something, so every edit made before
 * them reads back byte for byte; `null` — or no ceiling at all — sets none. `null` when anything in it is not an
 * editable item.
 */
export function canonicalPlanEdits(input: {
  removedSteps: unknown;
  disallowedAdaptations: unknown;
  askFirstAdaptations?: unknown;
  runBudgetCeiling?: unknown;
  evidenceAssuranceLevel?: unknown;
}): PlanEdits | null {
  const { removedSteps, disallowedAdaptations } = input;
  // The level is named only when it is not the default (Issue #901), so a plan at 标准核查 reads back as it always did.
  const level = input.evidenceAssuranceLevel;
  if (level !== undefined && level !== 'quick' && level !== 'standard' && level !== 'strict') return null;
  const askFirst = input.askFirstAdaptations === undefined ? [] : input.askFirstAdaptations;
  const ceiling = input.runBudgetCeiling === undefined || input.runBudgetCeiling === null ? null : canonicalCeiling(input.runBudgetCeiling);
  if (ceiling === null && input.runBudgetCeiling !== undefined && input.runBudgetCeiling !== null) return null;
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
    ...(ceiling === null ? {} : { runBudgetCeiling: ceiling }),
    ...(level === undefined || level === 'standard' ? {} : { evidenceAssuranceLevel: level }),
  };
}

/** The edits a stored execution plan carries: none when it names none, and refused when what it names is not one. */
export function planEditsOf(executionPlan: unknown): PlanEdits {
  const record = executionPlan !== null && typeof executionPlan === 'object' ? (executionPlan as Record<string, unknown>).editorEdits : undefined;
  if (record === undefined) return NO_PLAN_EDITS;
  const edits = record !== null && typeof record === 'object'
    ? canonicalPlanEdits(record as { removedSteps: unknown; disallowedAdaptations: unknown; askFirstAdaptations?: unknown; runBudgetCeiling?: unknown; evidenceAssuranceLevel?: unknown })
    : null;
  // A stored level is only ever the non-default one; a stored `standard` is not a record this ledger wrote.
  if (edits === null || planEditsAreEmpty(edits) || (record as { evidenceAssuranceLevel?: unknown }).evidenceAssuranceLevel === 'standard') throw new Error('PLAN_EDITS_INVALID');
  return edits;
}

export function planEditsAreEmpty(edits: PlanEdits): boolean {
  return edits.removedSteps.length === 0 && edits.disallowedAdaptations.length === 0 && (edits.askFirstAdaptations ?? []).length === 0 &&
    edits.runBudgetCeiling === undefined && edits.evidenceAssuranceLevel === undefined;
}

export function samePlanEdits(left: PlanEdits, right: PlanEdits): boolean {
  return JSON.stringify(left.removedSteps) === JSON.stringify(right.removedSteps) &&
    JSON.stringify(left.disallowedAdaptations) === JSON.stringify(right.disallowedAdaptations) &&
    JSON.stringify(left.askFirstAdaptations ?? []) === JSON.stringify(right.askFirstAdaptations ?? []) &&
    sameCeiling(planEditCeiling(left), planEditCeiling(right)) && planEditAssuranceLevel(left) === planEditAssuranceLevel(right);
}

function sameCeiling(left: RunBudgetCeilingState, right: RunBudgetCeilingState): boolean {
  return left === 'unset' || right === 'unset' ? left === right : left.maxTotalTokens === right.maxTotalTokens;
}

/** The same edits without a ceiling: what a plan keeps where the launch, not the editor, sets the ceiling. */
export function withoutCeiling(edits: PlanEdits): PlanEdits {
  if (edits.runBudgetCeiling === undefined) return edits;
  return {
    removedSteps: edits.removedSteps,
    disallowedAdaptations: edits.disallowedAdaptations,
    ...(edits.askFirstAdaptations === undefined ? {} : { askFirstAdaptations: edits.askFirstAdaptations }),
    ...(edits.evidenceAssuranceLevel === undefined ? {} : { evidenceAssuranceLevel: edits.evidenceAssuranceLevel }),
  };
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
  // The ceiling is a material field (ADR 0009), so its line names the field the Plan Revision diff always has; it is the
  // editor's own change all the same (Issue #51, S16a).
  const before = planEditCeiling(prior);
  const after = planEditCeiling(next);
  if (!sameCeiling(before, after)) {
    entries.push({ field: 'runBudgetCeiling', label: MATERIAL_PLAN_FIELD_LABELS.runBudgetCeiling, prior: before, proposed: after, materiality: 'edited' });
  }
  const levelBefore = planEditAssuranceLevel(prior);
  const levelAfter = planEditAssuranceLevel(next);
  if (levelBefore !== levelAfter) {
    entries.push({ field: 'evidenceAssuranceLevel', label: '证据保证级别', prior: EVIDENCE_ASSURANCE_LEVEL_LABELS[levelBefore],
      proposed: EVIDENCE_ASSURANCE_LEVEL_LABELS[levelAfter], materiality: 'edited' });
  }
  return entries;
}
