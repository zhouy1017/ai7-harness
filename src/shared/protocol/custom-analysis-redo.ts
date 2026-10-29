/**
 * 同类型重做 / 重新准备 / 重新确认 of a 自定义分析维度 Task (Issue #931 into F-10 #1029, Issue #1178): the Task Drawer's three preparation
 * controls, prepared on the dimension's own ledger of the exact version the Task froze — never the baseline's — and always ending
 * in a prepared plan the editor starts with 开始任务 (ADR 0094 §6, ADR 0096 §3).
 */
export type CustomAnalysisPreparationPurpose = 'redo' | 'reprepare' | 'reconfirm';
export const CUSTOM_ANALYSIS_PREPARATION_PURPOSES: ReadonlyArray<CustomAnalysisPreparationPurpose> = ['redo', 'reprepare', 'reconfirm'];

/** The Task a preparation is made again from, and which of the three it is; absent or `null` for ②A 自定义 › 运行. */
export interface CustomAnalysisPreparationFrom {
  taskIntentId: string;
  purpose: CustomAnalysisPreparationPurpose;
}

/** On a custom Task's plan: the dimension its preparation controls prepare again, under the version its plan froze. */
export interface TaskPlanCustomDimension {
  dimensionId: string;
}
