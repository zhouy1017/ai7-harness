/**
 * Closed AI7 classification of model-request failures and of usage against an explicit Run Budget
 * Ceiling. Failure classification keys on the pinned DSH failure-code constants, which the composing
 * harness supplies at runtime from `@deepseek-ai/dsh-llm` (they are values, so they are injected
 * rather than imported here to keep every third-party load behind the network denial).
 */
export interface DshFailureCodes {
  readonly QUOTA_EXCEEDED_CODE: string;
  readonly INVALID_CREDENTIAL_CODE: string;
  readonly CONTEXT_WINDOW_EXCEEDED_CODE: string;
}

/** AI7-owned codes for outcomes DSH does not name. */
export const AI7_FAILURE_CODES = {
  INTERRUPTED: 'ABORTED',
  NETWORK_DENIED: 'AI7_OUTBOUND_NETWORK_DENIED',
  EGRESS_REFUSED: 'AI7_EGRESS_REFUSED',
  TRANSMIT_TICKET_ABSENT: 'AI7_TRANSMIT_TICKET_ABSENT',
  FIXTURE_MISMATCH: 'AI7_FIXTURE_MISMATCH',
  RATE_LIMIT: 'RATE_LIMIT',
  PROVIDER_ERROR: 'PROVIDER_ERROR',
  INVALID_RESPONSE: 'INVALID_RESPONSE',
  TRANSPORT_FAILED: 'TRANSPORT_FAILED',
} as const;

export interface ModelFailureFacts {
  readonly code: string;
  readonly message: string;
  readonly status?: number;
}

export type ModelFailureClass =
  | 'provider-account-limit'
  | 'invalid-credential'
  | 'context-window-exceeded'
  | 'interrupted'
  | 'egress-refused'
  | 'network-denied'
  | 'fixture-mismatch'
  | 'rate-limit'
  | 'adapter-failure';

export interface ClassifiedModelFailure {
  readonly signal: 'failed' | 'interrupted';
  readonly failureClass: ModelFailureClass;
  /** Safe, payload-free reason for records and the UI. */
  readonly reason: string;
  readonly code: string;
  /** The transport status the failure carried, when any; `null` otherwise. */
  readonly status: number | null;
  /** Whether the closed retry-safe table admits exactly one in-envelope safe retry of the same unit request. */
  readonly retrySafe: boolean;
}

/**
 * The closed retry-safe classification table (Issue #48, the `safe-retry` Plan Adaptation): a failed
 * unit request may be repeated once inside the unchanged Plan Envelope only when its code is
 * `RATE_LIMIT`, `TRANSPORT_FAILED`, or `PROVIDER_ERROR` carrying a 5xx server status. Every other
 * code — Provider Account Limit, invalid credential, context-window exceeded, interruption, egress
 * refusal, network denial, fixture mismatch, invalid response, and any unknown adapter code — is
 * never retried and keeps its first-attempt meaning.
 */
export const RETRY_SAFE_FAILURE_TABLE: Readonly<Record<string, 'any-status' | 'server-status-only'>> = {
  [AI7_FAILURE_CODES.RATE_LIMIT]: 'any-status',
  [AI7_FAILURE_CODES.TRANSPORT_FAILED]: 'any-status',
  [AI7_FAILURE_CODES.PROVIDER_ERROR]: 'server-status-only',
};

export function isRetrySafeFailure(failure: ModelFailureFacts): boolean {
  const rule = Object.hasOwn(RETRY_SAFE_FAILURE_TABLE, failure.code) ? RETRY_SAFE_FAILURE_TABLE[failure.code] : undefined;
  if (rule === undefined) return false;
  if (rule === 'any-status') return true;
  return typeof failure.status === 'number' && Number.isSafeInteger(failure.status) && failure.status >= 500 && failure.status <= 599;
}

export function classifyModelFailure(failure: ModelFailureFacts, codes: DshFailureCodes): ClassifiedModelFailure {
  const code = failure.code;
  const status = typeof failure.status === 'number' && Number.isSafeInteger(failure.status) ? failure.status : null;
  const classified = (signal: 'failed' | 'interrupted', failureClass: ModelFailureClass, reason: string): ClassifiedModelFailure =>
    ({ signal, failureClass, reason, code, status, retrySafe: isRetrySafeFailure(failure) });
  if (code === codes.QUOTA_EXCEEDED_CODE) {
    return classified('failed', 'provider-account-limit', 'Provider Account Limit：模型服务账户限额阻止了本次请求。');
  }
  if (code === codes.INVALID_CREDENTIAL_CODE) {
    return classified('failed', 'invalid-credential', '凭据不可用：模型服务拒绝了所提供的凭据。');
  }
  if (code === codes.CONTEXT_WINDOW_EXCEEDED_CODE) {
    return classified('failed', 'context-window-exceeded', '上下文窗口超限：单元请求超出模型上下文容量。');
  }
  if (code === AI7_FAILURE_CODES.INTERRUPTED) {
    return classified('interrupted', 'interrupted', '请求被中断。');
  }
  if (code === AI7_FAILURE_CODES.EGRESS_REFUSED) {
    return classified('interrupted', 'egress-refused', 'Provider Payload/Egress Gate 拒绝发送；尝试已暂停。');
  }
  if (code === AI7_FAILURE_CODES.NETWORK_DENIED) {
    return classified('failed', 'network-denied', '出站网络在当前产品区间内被禁用。');
  }
  if (code === AI7_FAILURE_CODES.FIXTURE_MISMATCH) {
    return classified('failed', 'fixture-mismatch', '确定性夹具没有该单元与请求摘要对应的响应。');
  }
  if (code === AI7_FAILURE_CODES.RATE_LIMIT) {
    return classified('failed', 'rate-limit', '模型服务速率限制拒绝了本次请求。');
  }
  return classified('failed', 'adapter-failure', `适配器失败（${code}${status === null ? '' : ` · ${status}`}）。`);
}

/** Exact Run Budget Ceiling state bound in the Plan Envelope: `unset` by default, otherwise an explicit token ceiling. */
export type RunBudgetCeiling = { readonly kind: 'unset' } | { readonly kind: 'tokens'; readonly maxTotalTokens: number };

export interface UsageFacts {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheReadTokens?: number;
  readonly cacheWriteTokens?: number;
  readonly reasoningTokens?: number;
}

export type RunBudgetEvaluation =
  | { readonly state: 'not-evaluated'; readonly ceiling: 'unset'; readonly totalTokens: number }
  | { readonly state: 'within'; readonly ceiling: number; readonly totalTokens: number; readonly remainingTokens: number }
  | { readonly state: 'reached'; readonly ceiling: number; readonly totalTokens: number; readonly overrunTokens: number };

export function totalTokens(usages: ReadonlyArray<UsageFacts>): number {
  return usages.reduce((total, usage) =>
    total + usage.inputTokens + usage.outputTokens + (usage.cacheReadTokens ?? 0) + (usage.cacheWriteTokens ?? 0) + (usage.reasoningTokens ?? 0), 0);
}

/** `unset` means no product-side ceiling applies, never that Provider service is free or unlimited. */
export function evaluateRunBudgetCeiling(usages: ReadonlyArray<UsageFacts>, ceiling: RunBudgetCeiling): RunBudgetEvaluation {
  const total = totalTokens(usages);
  if (ceiling.kind === 'unset') return { state: 'not-evaluated', ceiling: 'unset', totalTokens: total };
  if (!Number.isSafeInteger(ceiling.maxTotalTokens) || ceiling.maxTotalTokens <= 0) throw new Error('RUN_BUDGET_CEILING_INVALID');
  return total >= ceiling.maxTotalTokens
    ? { state: 'reached', ceiling: ceiling.maxTotalTokens, totalTokens: total, overrunTokens: total - ceiling.maxTotalTokens }
    : { state: 'within', ceiling: ceiling.maxTotalTokens, totalTokens: total, remainingTokens: ceiling.maxTotalTokens - total };
}
