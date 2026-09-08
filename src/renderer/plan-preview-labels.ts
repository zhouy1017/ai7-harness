import type { ProviderProcessingPin, RunAttemptState, RunBudgetCeilingState } from '../shared/protocol.js';

/**
 * The exact Run Budget Ceiling wording. `未设置任务预算上限` is true only when the plan really froze
 * `unset`; a developer-live plan freezes a required token ceiling and must say so, because the
 * ceiling is what bounds a Run that can actually transmit.
 */
export function runBudgetCeilingLabel(ceiling: RunBudgetCeilingState): string {
  return ceiling === 'unset' ? '未设置任务预算上限' : `任务运行预算上限：${ceiling.maxTotalTokens} tokens`;
}

/**
 * The exact Provider Processing pin wording. `development-ci · v1 · 拒绝 · 0 次实时传输` is the only
 * reading J-03 ever produces today; the shape carries every scope's pin so a future scope's reading
 * renders faithfully instead of repeating the development-ci constant.
 */
export function providerProcessingLabel(pin: ProviderProcessingPin): string {
  const decisionLabel = pin.decision === 'deny' ? '拒绝' : pin.decision;
  return `${pin.operationalScope} · ${pin.version} · ${decisionLabel} · ${pin.authorizedLiveTransmissionCount} 次实时传输`;
}

/**
 * The Decision Layer's form of an instant (V2-UX-LAYER-004): absolute local date and time, 24-hour, to
 * the second. It never replaces the exact instant, which sits beside it in the technical layer; an
 * unparsable value is returned as it came, because inventing a time is worse than showing a raw one.
 * `hourCycle` is stated rather than `hour12: false`, which reports midnight as hour 24 in some locales.
 */
export function localInstantLabel(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return iso;
  return at.toLocaleString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  });
}

/** How long the step in flight has been running, as `mm:ss`; hours carry into the minutes place. */
export function elapsedLabel(elapsedMs: number): string {
  const seconds = Math.max(0, Math.floor(elapsedMs / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

/** What the Provider attempt is doing, in the Decision Layer's vocabulary (V2-UX-LIVE-001). */
export function attemptStateLabel(state: RunAttemptState): string {
  if (state === 'dispatched') return '已派发';
  return state === 'awaiting-response' ? '等待模型响应' : '安全重试中';
}

/**
 * The stale threshold V2-UX-LIVE-003 sets before any step of a Run has completed: three minutes, used
 * only until the Run has measured a step of its own.
 */
export const RUN_LIVENESS_UNMEASURED_STALE_MS = 180_000;

/**
 * Whether the step in flight has run longer than this Run can account for (V2-UX-LIVE-003). The bar is
 * measured, never guessed: twice this Run's longest settled step, and only before any step has settled
 * does the fixed threshold stand in. Being over it says the step is unusual for this Run, never that
 * the Run has died — only a recorded state says that.
 */
export function runStepIsStale(elapsedMs: number, longestSettledUnitMs: number | null): boolean {
  return longestSettledUnitMs === null
    ? elapsedMs > RUN_LIVENESS_UNMEASURED_STALE_MS
    : elapsedMs > longestSettledUnitMs * 2;
}
