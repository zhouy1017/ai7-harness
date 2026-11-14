/** One execution choice shared by role defaults and dispatch overrides (#1453, #1455).
 * Missing fields inherit the role default; `off` explicitly omits the effort control on the wire.
 * Effort identifiers are vendor data, not a model/level admission list.
 */
import type { PlanEditsProjection } from './protocol/analysis-plan.js';

export interface RuntimeExecutionConfig {
  readonly modelConnectionId?: string;
  readonly modelId?: string;
  readonly reasoningEffort?: string;
}

export const DISPATCH_TASK_KINDS = ['review-run', 'baseline-analysis', 'custom-analysis', 'writing', 'initial-evaluation', 'readers-report', 'evaluation-rewrite', 'scoped-ai-edit'] as const;
export type DispatchTaskKind = (typeof DISPATCH_TASK_KINDS)[number];

/** Launch operation → local preference kind, shared by ordinary and cross-Book starts. */
export const LEDGER_TASK_LAUNCH_KINDS = {
  launchBaselineAnalysis: 'baseline-analysis', launchCustomAnalysis: 'custom-analysis', launchWritingTask: 'writing',
  launchInitialEvaluation: 'initial-evaluation', launchReadersReport: 'readers-report', launchEvaluationRewrite: 'evaluation-rewrite',
} as const satisfies Readonly<Record<string, DispatchTaskKind>>;
export type LedgerTaskLaunchOperation = keyof typeof LEDGER_TASK_LAUNCH_KINDS;

export interface TaskExecutionLaunchInput {
  readonly clientCommandId: string;
  readonly executionConfig?: RuntimeExecutionConfig;
  /** A remembered catalogue choice may fall back; an explicit choice keeps upstream validation. */
  readonly rememberedChoice?: boolean;
  /** Existing optional budget/retry controls, frozen in the first plan rather than a later plan revision. */
  readonly planEdits?: PlanEditsProjection;
}

export interface TaskExecutionLaunchResult {
  readonly taskIntentId: string;
  readonly runRecordId: string;
  readonly launchNotice?: string;
}

export function validReasoningEffort(value: unknown): value is string {
  return typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,39}$/u.test(value);
}

export function sentReasoningEffort(value: string | null | undefined): string | null {
  return value === undefined || value === null || value === 'off' ? null : value;
}

export function resolveRuntimeExecutionConfig(defaults: RuntimeExecutionConfig, override: RuntimeExecutionConfig = {}): RuntimeExecutionConfig {
  return { ...defaults, ...Object.fromEntries(Object.entries(override).filter(([, value]) => value !== undefined)) };
}

/** Closed IPC shape; readiness and vendor acceptance remain the service/provider's decisions. */
export function validRuntimeExecutionConfig(value: unknown): value is RuntimeExecutionConfig {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const config = value as Record<string, unknown>;
  const text = (value: unknown, max: number): boolean => typeof value === 'string' && value.length > 0 && value.length <= max && value.isWellFormed();
  return Object.keys(config).every(key => ['modelConnectionId', 'modelId', 'reasoningEffort'].includes(key)) &&
    (config.modelConnectionId === undefined || text(config.modelConnectionId, 128)) &&
    (config.modelId === undefined || text(config.modelId, 256)) &&
    (config.reasoningEffort === undefined || validReasoningEffort(config.reasoningEffort));
}
