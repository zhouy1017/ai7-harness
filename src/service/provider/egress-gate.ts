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
/** The developer-live route of Provider Processing v5 (ADR 0065, ADR 0067): OpenCode Go with the bare model id. */
export const OPENCODE_GO_ROUTE = 'opencode-go' as const;
export const OPENCODE_GO_MODEL = 'deepseek-v4-flash' as const;
/**
 * The same OpenCode Go plan reached over its Anthropic-compatible `/messages` path (ADR 0067). A
 * second route because the endpoint and the request shape differ; the same credential slot because
 * the credential does not, so declaring it moves no credential boundary.
 */
export const OPENCODE_GO_MESSAGES_ROUTE = 'opencode-go-messages' as const;
/**
 * The same plan reached over its OpenAI-compatible `/responses` path (ADR 0067), which the Go page
 * documents for its GPT and Grok models. A third route for the reason the second one exists: the
 * endpoint and the request shape differ, and the credential does not.
 */
export const OPENCODE_GO_RESPONSES_ROUTE = 'opencode-go-responses' as const;

/**
 * Every route a Provider Resolution Plan may bind. Neither `opencode-go-messages` nor
 * `opencode-go-responses` is here: no Run may bind a route whose every model is inert, and this gate
 * is the place that enforces it, so this union is a narrower statement than `RemoteExecutionRoute`
 * rather than a superset of it.
 */
export type ExecutionRoute = typeof LOCAL_DETERMINISTIC_ROUTE | typeof DEEPSEEK_ROUTE | typeof OPENCODE_GO_ROUTE;
/** Every remote route a profile may be declared for, bindable or not; all of them are served by the same adapter. */
export type RemoteExecutionRoute =
  | typeof DEEPSEEK_ROUTE
  | typeof OPENCODE_GO_ROUTE
  | typeof OPENCODE_GO_MESSAGES_ROUTE
  | typeof OPENCODE_GO_RESPONSES_ROUTE;
/** The logical credential slots of the Main Editorial Role: one per remote route. */
export type CredentialSlot = 'deepseek-api-key' | 'opencode-go';

/**
 * The trusted scope's Provider Processing pin, as the gate sees it. v1 denies every remote route; v5
 * admits exactly one, and only while the Run's own bounds still hold.
 */
export type EgressPolicyPin =
  | {
      readonly operationalScope: 'development-ci';
      readonly providerProcessingVersion: 'v1';
      readonly liveTransmissionAllowed: false;
      readonly authorizedLiveTransmissionCount: 0;
    }
  | {
      readonly operationalScope: 'developer-live';
      readonly providerProcessingVersion: 'v5';
      readonly liveTransmissionAllowed: true;
      readonly authorizedLiveTransmissionCount: 'bounded-by-run';
    };

/**
 * The Run Budget Ceiling as the gate must see it immediately before a transmission: `unset` is a
 * refusal under v5, because Provider Processing v5 requires a non-`unset` ceiling, and `reached`
 * refuses because the Run has spent its bound.
 */
export type EgressCeilingState = 'unset' | 'within' | 'reached';

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
  /** The ceiling state from accumulated usage, evaluated at this instant; `unset` on the deterministic route. */
  ceilingState?: () => EgressCeilingState;
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
  | 'remote-route-denied-under-v1'
  | 'run-budget-ceiling-unset'
  | 'run-budget-ceiling-reached';

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
  if (binding.policy.operationalScope === 'development-ci') {
    return refuse('remote-route-denied-under-v1', 'development-ci · Provider Processing v1 允许 0 次实时传输；未发送任何内容。');
  }
  // Under v5 the ceiling is a precondition of the decision itself, evaluated here from accumulated
  // usage, so no dispatch can precede it and no ceiling state can be assumed from an earlier turn.
  const ceiling = scope.ceilingState?.() ?? 'unset';
  if (ceiling === 'unset') {
    return refuse('run-budget-ceiling-unset', 'Provider Processing v5 要求非 unset 的任务运行预算上限；未发送任何内容。');
  }
  if (ceiling === 'reached') {
    return refuse('run-budget-ceiling-reached', '任务运行预算上限已达到；未发送任何内容。');
  }
  return { decision: 'transmit-remote', payloadDigest: digest, ticket: { decision: 'transmit-remote', bindingDigest: binding.bindingDigest, payloadDigest: digest } };
}
