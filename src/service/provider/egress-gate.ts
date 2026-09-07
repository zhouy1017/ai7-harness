import { DIGEST_PATTERN, sha256Hex } from '../analysis/canonical.js';
import { messageText, type AssembledModelPayload } from './payload.js';

/**
 * The AI7-owned final Provider Payload/Egress Gate. Immediately before every model transmission it
 * receives the complete serialized model-bound payload after DSH context assembly and compares every
 * datum with the immutable Execution Binding, the Run Source Scope (the exact unit prompts derived
 * from the bound Coverage Manifest), the Provider Resolution Plan (route and model), the Outbound Data
 * Category, and the trusted scope's Provider Processing policy pin. It returns exactly one decision:
 * `transmit-local` (the deterministic route, no egress), `transmit-remote` (never under v1), or
 * `refuse` with a safe AI7 reason. A refusal sends nothing.
 */
export const LOCAL_DETERMINISTIC_ROUTE = 'ai7-local-deterministic' as const;
export const LOCAL_DETERMINISTIC_MODEL = 'ai7-deterministic-fixture' as const;
export const DEEPSEEK_ROUTE = 'deepseek-open-platform' as const;
export const DEEPSEEK_MODEL = 'deepseek-v4-pro' as const;
/** The developer-live route of Provider Processing v4 (ADR 0065, ADR 0067): OpenCode Go with the bare model id. */
export const OPENCODE_GO_ROUTE = 'opencode-go' as const;
export const OPENCODE_GO_MODEL = 'deepseek-v4-flash' as const;

/** Every route a Provider Resolution Plan may bind; the two remote ones are served by the same adapter. */
export type ExecutionRoute = typeof LOCAL_DETERMINISTIC_ROUTE | typeof DEEPSEEK_ROUTE | typeof OPENCODE_GO_ROUTE;
export type RemoteExecutionRoute = typeof DEEPSEEK_ROUTE | typeof OPENCODE_GO_ROUTE;
/** The logical credential slots of the Main Editorial Role: one per remote route. */
export type CredentialSlot = 'deepseek-api-key' | 'opencode-go';

export interface EgressPolicyPin {
  readonly operationalScope: 'development-ci';
  readonly providerProcessingVersion: 'v1';
  readonly liveTransmissionAllowed: false;
  readonly authorizedLiveTransmissionCount: 0;
}

/** The binding facts the gate compares against; a frozen subset of the persisted Execution Binding. */
export interface EgressBindingFacts {
  readonly bindingDigest: string;
  readonly route: ExecutionRoute;
  readonly model: string;
  readonly systemPrompt: string;
  readonly outboundDataCategory: 'public-or-synthetic';
  readonly policy: EgressPolicyPin;
  /** Every admitted user-role message text, exactly as the Run Source Scope permits it to be sent. */
  readonly admittedUserMessages: ReadonlySet<string>;
}

/** Mutable per-attempt scope state the execution owner maintains between steps. */
export interface EgressAttemptScope {
  /** The binding digest currently bound for this attempt, or `null` once finished or superseded. */
  currentBindingDigest: () => string | null;
  /** SHA-256 digests of assistant texts this attempt already accepted; prior history may carry only these. */
  readonly acceptedOutputDigests: ReadonlySet<string>;
}

export type EgressRefusalReason =
  | 'binding-stale'
  | 'route-mismatch'
  | 'model-mismatch'
  | 'tools-present'
  | 'system-prompt-mismatch'
  | 'payload-out-of-scope'
  | 'unknown-message-role'
  | 'outbound-category-mismatch'
  | 'remote-route-denied-under-v1';

export interface TransmitTicket {
  readonly decision: 'transmit-remote';
  readonly bindingDigest: string;
  readonly payloadDigest: string;
}

export type EgressDecision =
  | { readonly decision: 'transmit-local'; readonly payloadDigest: string }
  | { readonly decision: 'transmit-remote'; readonly payloadDigest: string; readonly ticket: TransmitTicket }
  | { readonly decision: 'refuse'; readonly reason: EgressRefusalReason; readonly detail: string };

export const EGRESS_REFUSED_CODE = 'AI7_EGRESS_REFUSED';

function refuse(reason: EgressRefusalReason, detail: string): EgressDecision {
  return { decision: 'refuse', reason, detail };
}

/** A digest over the whole payload; recorded, never the payload itself. */
export function payloadDigest(payload: AssembledModelPayload): string {
  const texts = payload.messages.map((message) => `${message.role}\u0000${messageText(message) ?? '\u0001'}`);
  return sha256Hex([payload.provider, payload.model, payload.system ?? '', ...texts].join('\u0002'));
}

export function evaluateEgress(
  payload: AssembledModelPayload,
  binding: EgressBindingFacts,
  scope: EgressAttemptScope,
): EgressDecision {
  if (!DIGEST_PATTERN.test(binding.bindingDigest) || scope.currentBindingDigest() !== binding.bindingDigest) {
    return refuse('binding-stale', '执行绑定已不是当前绑定；未发送任何内容。');
  }
  if (binding.outboundDataCategory !== 'public-or-synthetic') {
    return refuse('outbound-category-mismatch', '外发数据类别不是 public-or-synthetic；未发送任何内容。');
  }
  if (payload.provider !== binding.route) return refuse('route-mismatch', '请求路由与执行绑定不一致；未发送任何内容。');
  if (payload.model !== binding.model) return refuse('model-mismatch', '请求模型与执行绑定不一致；未发送任何内容。');
  if (payload.tools !== undefined && payload.tools.length > 0) return refuse('tools-present', '组合运行时向模型暴露了工具；未发送任何内容。');
  if ((payload.system ?? '') !== binding.systemPrompt) {
    return refuse('system-prompt-mismatch', '系统提示与冻结的提示契约不一致；未发送任何内容。');
  }
  if (payload.messages.length === 0) return refuse('payload-out-of-scope', '请求不含任何单元消息；未发送任何内容。');
  for (const [index, message] of payload.messages.entries()) {
    const text = messageText(message);
    if (text === null) return refuse('payload-out-of-scope', `第 ${index + 1} 条消息含非文本内容块；未发送任何内容。`);
    if (message.role === 'user') {
      if (message.source.kind !== 'user' || !binding.admittedUserMessages.has(text)) {
        return refuse('payload-out-of-scope', `第 ${index + 1} 条用户消息不在任务运行来源范围内；未发送任何内容。`);
      }
      continue;
    }
    if (message.role === 'assistant') {
      if (message.source.kind !== 'model' || message.source.provider !== binding.route || message.source.model !== binding.model ||
          !scope.acceptedOutputDigests.has(sha256Hex(text))) {
        return refuse('payload-out-of-scope', `第 ${index + 1} 条模型消息不是本次尝试已接受的输出；未发送任何内容。`);
      }
      continue;
    }
    return refuse('unknown-message-role', `第 ${index + 1} 条消息角色不在闭合集合内；未发送任何内容。`);
  }
  const last = payload.messages[payload.messages.length - 1]!;
  if (last.role !== 'user') return refuse('payload-out-of-scope', '请求末尾不是单元消息；未发送任何内容。');
  const digest = payloadDigest(payload);
  if (binding.route === LOCAL_DETERMINISTIC_ROUTE) return { decision: 'transmit-local', payloadDigest: digest };
  if (binding.policy.operationalScope === 'development-ci' && binding.policy.providerProcessingVersion === 'v1' &&
      binding.policy.liveTransmissionAllowed === false) {
    return refuse('remote-route-denied-under-v1', 'development-ci · Provider Processing v1 允许 0 次实时传输；未发送任何内容。');
  }
  // Unreachable while the policy pin type admits only v1; kept so the decision set stays complete.
  return { decision: 'transmit-remote', payloadDigest: digest, ticket: { decision: 'transmit-remote', bindingDigest: binding.bindingDigest, payloadDigest: digest } };
}
