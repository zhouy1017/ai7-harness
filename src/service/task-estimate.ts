import { TASK_ESTIMATE_MORE, type TaskEstimateMore, type TaskEstimateProjection, type TaskPlanProjection } from '../shared/protocol/task-plan.js';

/**
 * 预计 (Issue #1670): one plain sentence of what a plan holds about its cost before the start. Every addend of `fewestRequests`
 * is a request the Run always makes; anything conditional is named under `more`, so 「至少」 stays true. It names no token figure
 * and no price, and a duration only when one was measured on this machine.
 */
const MORE_WORDS: Readonly<Record<TaskEstimateMore, string>> = {
  retry: '重试', sampling: '抽检', synthesis: '统合总结', 'tool-turns': '查找资料', 'web-search': '联网检索', reflection: '复盘',
};

/** What a Task that makes no request says instead: it only records, checks on this machine, or reads the analysis' leads. */
export type TaskEstimateLocal = 'record' | 'local-check' | 'leads';
const LOCAL_SENTENCES: Readonly<Record<TaskEstimateLocal, string>> = {
  record: '只记录这次运行，不调用模型。',
  'local-check': '只在本机检查，不调用模型。',
  leads: '只读基线分析的线索，不调用模型。',
};

const MINUTE = 60_000;

/** 不到 1 分钟; minutes rounded up; from an hour, the minutes rounded up to ten. */
export function durationWords(ms: number): string {
  if (ms < MINUTE) return '不到 1 分钟';
  const minutes = Math.ceil(ms / MINUTE);
  if (minutes < 60) return `约 ${minutes} 分钟`;
  const rounded = Math.ceil(minutes / 10) * 10;
  const hours = Math.floor(rounded / 60), rest = rounded % 60;
  return `约 ${hours} 小时${rest === 0 ? '' : ` ${rest} 分钟`}`;
}

function moreWords(more: ReadonlyArray<TaskEstimateMore>): string {
  const words = TASK_ESTIMATE_MORE.filter((entry) => more.includes(entry)).map((entry) => MORE_WORDS[entry]);
  if (words.length === 0) return '';
  const listed = words.length === 1 ? words[0]! : `${words.slice(0, -1).join('、')}或${words.at(-1)!}`;
  return `（${listed}时会更多）`;
}

export function estimateSentence(estimate: Omit<TaskEstimateProjection, 'sentence'>, local: TaskEstimateLocal | null = null, verb = '读'): string {
  if (local !== null) return LOCAL_SENTENCES[local];
  const duration = estimate.durationMs === null ? '用时暂无可靠估计' : `按最近同类任务，${durationWords(estimate.durationMs)}`;
  return `预计${verb} ${estimate.parts} 个部分，至少 ${estimate.fewestRequests} 次模型调用${moreWords(estimate.more)}` +
    `${estimate.ceiling ? '，用量到上限后不再发送新的请求' : ''}；${duration}。`;
}

export function taskEstimate(input: { parts: number; fewestRequests: number; more?: ReadonlyArray<TaskEstimateMore>; ceiling?: boolean;
  local?: TaskEstimateLocal | null; verb?: string }): TaskEstimateProjection {
  const more = TASK_ESTIMATE_MORE.filter((entry) => input.more?.includes(entry) === true);
  const estimate = { parts: input.parts, fewestRequests: input.fewestRequests, more, ceiling: input.ceiling === true, durationMs: null };
  return { ...estimate, sentence: estimateSentence(estimate, input.local ?? null, input.verb) };
}

/**
 * A ledger kind's estimate, read from its plan: one request per part read, plus the book-level step a kind always takes
 * (`afterParts`), a retry when the plan allows one, and the conditional steps the kind declares.
 */
export function ledgerPlanEstimate(plan: Pick<TaskPlanProjection, 'boundary' | 'steps'>, input: { parts: number; afterParts: number;
  sampling: boolean; webSearch: boolean; ceiling: boolean }): TaskEstimateProjection {
  const retry = plan.boundary.adaptable.some((entry) => entry.id === 'safe-retry' && !entry.removed);
  const sampling = input.sampling && plan.steps.some((step) => step.id === 'assurance-sampling' && !step.removed);
  return taskEstimate({ parts: input.parts, fewestRequests: input.parts === 0 ? 0 : input.parts + input.afterParts, ceiling: input.ceiling,
    more: [...(retry ? ['retry' as const] : []), ...(sampling ? ['sampling' as const] : []), ...(input.webSearch ? ['web-search' as const] : []), 'reflection'] });
}

/** The measured duration, when the same kind's completed Tasks give one; the sentence follows it. */
export function withMeasuredDuration<T extends { estimate?: TaskEstimateProjection }>(value: T, perPartMs: number | null, verb?: string): T {
  const estimate = value.estimate;
  if (estimate === undefined || perPartMs === null || estimate.fewestRequests === 0) return value;
  const measured = { ...estimate, durationMs: Math.round(perPartMs * estimate.parts) };
  return { ...value, estimate: { ...measured, sentence: estimateSentence(measured, null, verb) } };
}
