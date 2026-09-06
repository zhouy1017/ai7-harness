import {
  BASELINE_ANALYSIS_MODE_GOALS,
  BASELINE_ANALYSIS_MODE_LABELS,
  type BaselineAnalysisGoal,
  type BaselineAnalysisTaskMode,
} from '../../shared/protocol.js';

/**
 * Exact identities of the one covered-analysis kind this slice implements. Baseline Manuscript
 * Analysis is one exact-versioned kind with its own Result Set identity; no Editorial Dimension,
 * Plugin, or user-defined kind exists (Issue #92, S36 / bounded J-04). Issue #93 adds the three
 * exact update modes over the same kind, each with one fixed goal text; the mode is the Task's
 * exact update meaning and the goal is its user-facing statement.
 */
export const BASELINE_ANALYSIS_KIND = 'baseline-manuscript-analysis' as const;
export const BASELINE_ANALYSIS_CONTRACT_VERSION = 'ai7.baseline-manuscript-analysis/1' as const;
export const BASELINE_ANALYSIS_TASK_GOAL = '对当前书稿执行基线稿件分析，形成覆盖全部结构单元的结果集修订版。' as const;
export const BASELINE_ANALYSIS_EXPECTED_OUTCOME = '稿件分析结果集修订版（基线稿件分析契约 v1）' as const;
export const TASK_INPUT_CHECKPOINT_PURPOSE = 'Task Input / 任务输入' as const;
export const BASELINE_ANALYSIS_TASK_MODES: readonly BaselineAnalysisTaskMode[] = ['first-baseline', 'sync-current', 'reanalyze-range', 'reanalyze-book'];
export { BASELINE_ANALYSIS_MODE_GOALS, BASELINE_ANALYSIS_MODE_LABELS };

export function goalForMode(mode: BaselineAnalysisTaskMode): BaselineAnalysisGoal {
  return BASELINE_ANALYSIS_MODE_GOALS[mode];
}

export function modeForGoal(goal: string): BaselineAnalysisTaskMode | null {
  return BASELINE_ANALYSIS_TASK_MODES.find((mode) => BASELINE_ANALYSIS_MODE_GOALS[mode] === goal) ?? null;
}
