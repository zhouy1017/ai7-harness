import type { ProviderProcessingPin, RunBudgetCeilingState } from '../shared/protocol.js';

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
