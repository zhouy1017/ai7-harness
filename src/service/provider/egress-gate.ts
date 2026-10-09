import { randomUUID } from 'node:crypto';
import type { ConfiguredCredentialSlot, ConfiguredRouteId } from '../../shared/provider-configuration.generated.js';
import { DIGEST_PATTERN, canonicalJson, sha256Hex } from '../analysis/canonical.js';
import { assistantToolCalls, messageText, toolResultOf, type AssembledContentBlock, type AssembledModelPayload } from './payload.js';
import {
  PLATFORM_TOOL_NAMES,
  canonicalPublicUrl,
  toolArgumentsDigest,
  toolSetEqualsRule,
  type PlatformToolArguments,
  type PlatformToolName,
  type PlatformToolsRule,
} from './platform-tools.js';

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
/*
 * The two bindings this gate admits today: the production connection's pair and Provider Processing
 * v5's developer-live pair. Which pairs are bindable is the policy's statement, not the provider
 * documents' (ADR 0073 §3), and moving these four from source constants to a read of the policy's
 * pinned binding is #452's gate share (S87-f3b). Until then each route is checked against the
 * configured set, so a document that renamed or dropped one fails `check` here instead of leaving a
 * binding to a route no document declares.
 */
export const DEEPSEEK_ROUTE = 'deepseek-open-platform' as const satisfies ConfiguredRouteId;
export const DEEPSEEK_MODEL = 'deepseek-v4-pro' as const;
/** The developer-live route of Provider Processing v5 (ADR 0065, ADR 0067): OpenCode Go with the bare model id. */
export const OPENCODE_GO_ROUTE = 'opencode-go' as const satisfies ConfiguredRouteId;
export const OPENCODE_GO_MODEL = 'deepseek-v4-flash' as const;

/**
 * Every route a Provider Resolution Plan may bind. No configured route beyond these two is here —
 * not the OpenCode Go plan's `/messages` and `/responses` paths, nor any route a provider document
 * declares: a declared format is a claim about the request shape, and a route becomes bindable only
 * when a Provider Processing revision names its exact binding (ADR 0073 §3). This gate is the place
 * that enforces it, so this union is a narrower statement than `RemoteExecutionRoute` rather than a
 * superset of it.
 */
export type ExecutionRoute = typeof LOCAL_DETERMINISTIC_ROUTE | typeof DEEPSEEK_ROUTE | typeof OPENCODE_GO_ROUTE;
/**
 * Every remote route a profile may be declared for, bindable or not; all of them are served by the same adapter. The
 * members are the routes the provider documents under `config/providers/` declare (ADR 0073 §2): a closed union,
 * extended by generation from reviewed documents and never by hand.
 */
export type RemoteExecutionRoute = ConfiguredRouteId;
/** The logical credential slots of the Main Editorial Role: one per configured provider (ADR 0073 §4), from the same documents. */
export type CredentialSlot = ConfiguredCredentialSlot;

/**
 * The trusted scope's Provider Processing pin, as the gate sees it. v1 denies every remote route; v5
 * admits exactly one, and only while the Run's own bounds still hold. `v8` is the `developer-live`
 * successor the platform-tools revision will be (S87-f3b, Issue #473): admitted by the type so that
 * its selection moves no gate code, and selected by nothing today.
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
      readonly providerProcessingVersion: 'v5' | 'v8';
      readonly liveTransmissionAllowed: true;
      readonly authorizedLiveTransmissionCount: 'bounded-by-run';
    };

/**
 * The Run Budget Ceiling as the gate must see it immediately before a transmission: `unset` is a
 * refusal under v5, because Provider Processing v5 requires a non-`unset` ceiling, and `reached`
 * refuses because the Run has spent its bound.
 */
export type EgressCeilingState = 'unset' | 'within' | 'reached';

/**
 * What a Run may send. Analysis sends the admitted public or synthetic material it was planned over; an Interactive Editorial
 * Dialogue (Issue #52, S17a) sends the words the editor selected in their own manuscript, and its question. A dialogue's
 * excerpt reaches only the local deterministic route until a dialogue-purpose Provider Processing revision admits it (S17c).
 */
export type OutboundDataCategory = 'public-or-synthetic' | 'editor-selected-manuscript-excerpt';

/** The binding facts the gate compares against; a frozen subset of the persisted Execution Binding. */
export interface EgressBindingFacts {
  readonly bindingDigest: string;
  readonly route: ExecutionRoute;
  readonly model: string;
  readonly systemPrompt: string;
  readonly outboundDataCategory: OutboundDataCategory;
  readonly policy: EgressPolicyPin;
  /** Every admitted user-role message text, exactly as the Run Source Scope permits it to be sent. */
  readonly admittedUserMessages: ReadonlySet<string>;
  /**
   * The platform tools the binding's Provider Processing rule names (ADR 0080 §7.5), read from the rule by
   * `readPlatformToolsRule`; absent or `null` when the rule names none — as Provider Processing v5's one rule names none —
   * and then every tool, tool call, tool result, search call, and fetch is refused exactly as before.
   */
  readonly platformTools?: PlatformToolsRule | null;
}

/**
 * One tool result AI7 itself produced for this attempt, by tool-call id (ADR 0080 §7.2): the URL its bytes came from — the
 * search service's endpoint or the fetched page — and their SHA-256 and UTF-8 byte count. `sourceUrl` is `null` only for a
 * refusal AI7 composed itself (a duplicate call, a refused ticket), which carries no external bytes. The bytes themselves
 * live in the Research Snapshot Cache and are never logged.
 */
export interface AdmittedToolResult {
  readonly callId: string;
  readonly tool: PlatformToolName;
  readonly sourceUrl: string | null;
  readonly sha256: string;
  readonly byteCount: number;
}

/** Mutable per-attempt scope state the execution owner maintains between steps. */
export interface EgressAttemptScope {
  /** The binding digest currently bound for this attempt, or `null` once finished or superseded. */
  currentBindingDigest: () => string | null;
  /** SHA-256 digests of assistant texts this attempt already accepted; prior history may carry only these. */
  readonly acceptedOutputDigests: ReadonlySet<string>;
  /** The ceiling state from accumulated usage, evaluated at this instant; `unset` on the deterministic route. */
  ceilingState?: () => EgressCeilingState;
  /** Digests (`assistantToolCallDigest`) of the tool-call messages this attempt's adapter returned (Issue #473). */
  readonly acceptedToolCallDigests?: ReadonlySet<string>;
  /** The tool results AI7 produced for this attempt, by `toolResultKey(callId, tool)` (Issue #473). */
  readonly admittedToolResults?: ReadonlyMap<string, AdmittedToolResult>;
  /** The unit's circuit breaker (ADR 0080 §7.4); intact when absent. */
  breakerState?: () => 'intact' | 'tripped';
  /** Whether a canonical URL is one the model cited or the search returned in this attempt (ADR 0079 §4.3). */
  citationAdmits?: (url: string) => boolean;
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
  | 'run-budget-ceiling-reached'
  | 'platform-tools-not-named'
  | 'ticket-book-foreign'
  | 'circuit-breaker-tripped'
  | 'fetch-target-invalid'
  | 'fetch-target-not-cited';

export interface TransmitTicket {
  readonly decision: 'transmit-remote';
  readonly bindingDigest: string;
  readonly payloadDigest: string;
}

/**
 * One `call-search-service` decision (ADR 0080 §7.2): the search service host the rule names and the canonical-argument
 * digest of the one query it may carry. Single-use: `EgressTicketBook.redeem` admits it once.
 */
export interface SearchServiceTicket {
  readonly decision: 'call-search-service';
  readonly ticketId: string;
  readonly bindingDigest: string;
  readonly host: string;
  readonly argumentsDigest: string;
}

/**
 * One `fetch-public-source` decision (ADR 0074 §3, ADR 0080 §7.2): one cited public URL, its host, and the canonical-argument
 * digest. Single-use, and the only way per-ticket host admission ever opens a host.
 */
export interface PublicSourceTicket {
  readonly decision: 'fetch-public-source';
  readonly ticketId: string;
  readonly bindingDigest: string;
  readonly url: string;
  readonly host: string;
  readonly argumentsDigest: string;
}

export type PlatformToolTicket = SearchServiceTicket | PublicSourceTicket;

export interface PlatformToolRefusal {
  readonly decision: 'refuse';
  readonly reason: EgressRefusalReason;
  readonly detail: string;
}
export type SearchServiceDecision = { readonly decision: 'call-search-service'; readonly ticket: SearchServiceTicket } | PlatformToolRefusal;
export type PublicSourceDecision = { readonly decision: 'fetch-public-source'; readonly ticket: PublicSourceTicket } | PlatformToolRefusal;
export type PlatformToolEgressDecision = SearchServiceDecision | PublicSourceDecision;

/** What the gate keeps for one ticket book: the binding it was opened for, that binding's rule, and its unredeemed tickets. */
interface TicketBookState {
  readonly bindingDigest: string;
  readonly rule: PlatformToolsRule;
  readonly currentBindingDigest: () => string | null;
  /** Each unredeemed ticket by id, as the exact frozen object the gate issued. */
  readonly outstanding: Map<string, PlatformToolTicket>;
}

/** Every book the gate opened (#676): a book is the gate's only when it is here, and the state lives nowhere else. */
const ticketBooks = new WeakMap<EgressTicketBook, TicketBookState>();
/** The key only `EgressTicketBook.open` holds: a book constructed any other way throws before it holds anything. */
const TICKET_BOOK_KEY: unique symbol = Symbol('egress-ticket-book');

/**
 * The single-use tickets of one attempt's platform-tool decisions (ADR 0080 §7.2; #676). Only the gate opens a book — for
 * one binding whose rule names the platform tools — and only the gate's two decision functions issue into it: the book has
 * no method that issues, and its state is held by this module, not by the object. A forwarder redeems through
 * `redeemEgressTicket` the exact ticket it was handed before it sends a byte; a ticket redeems once, only from the book
 * that issued it, and only while the binding it was issued for is still the attempt's current binding.
 */
export class EgressTicketBook {
  private constructor(key: typeof TICKET_BOOK_KEY, state: TicketBookState) {
    if (key !== TICKET_BOOK_KEY) throw new Error('EGRESS_TICKET_BOOK_NOT_OPENED_BY_GATE');
    ticketBooks.set(this, state);
  }

  /**
   * Open the ticket book of one attempt: for this binding, whose rule must name the platform tools under developer-live, and
   * this scope, whose current binding every redemption re-reads. Under Provider Processing v5 no rule names them, so no
   * book can be opened at all.
   */
  static open(binding: EgressBindingFacts, scope: Pick<EgressAttemptScope, 'currentBindingDigest'>): EgressTicketBook {
    const rule = platformToolsOf(binding);
    if (rule === null || !DIGEST_PATTERN.test(binding.bindingDigest)) throw new Error('PLATFORM_TOOLS_NOT_NAMED');
    return new EgressTicketBook(TICKET_BOOK_KEY, {
      bindingDigest: binding.bindingDigest,
      rule,
      currentBindingDigest: scope.currentBindingDigest,
      outstanding: new Map(),
    });
  }

  /** Withdraw an issued ticket unredeemed — the call was answered from the Research Snapshot Cache and sends nothing. */
  revoke(ticket: PlatformToolTicket): void {
    const state = ticketBooks.get(this);
    if (state !== undefined && state.outstanding.get(ticket.ticketId) === ticket) state.outstanding.delete(ticket.ticketId);
  }

  /** How many issued tickets have not been redeemed. */
  get outstanding(): number {
    return ticketBooks.get(this)?.outstanding.size ?? 0;
  }
}

/** Issue one ticket into a book the gate opened. Module-private: the two decision functions are its only callers. */
function issueTicket<T extends PlatformToolTicket>(state: TicketBookState, body: Omit<T, 'ticketId'>): T {
  const ticket = Object.freeze({ ...body, ticketId: randomUUID() }) as T;
  state.outstanding.set(ticket.ticketId, ticket);
  return ticket;
}

/**
 * Redeem one ticket exactly once (#676), and return the rule of the binding it was issued under — the only rule a forwarder
 * may build its request from. `null` — and nothing may be sent — for a book the gate did not open, a ticket this book did
 * not issue (a copy of an issued ticket included), one already redeemed or revoked, or one whose binding is no longer the
 * attempt's current binding; a ticket refused for a stale binding is spent and never redeems later.
 */
export function redeemEgressTicket(book: EgressTicketBook, ticket: PlatformToolTicket): PlatformToolsRule | null {
  const state = ticketBooks.get(book);
  if (state === undefined) return null;
  if (state.outstanding.get(ticket.ticketId) !== ticket) return null;
  state.outstanding.delete(ticket.ticketId);
  if (ticket.bindingDigest !== state.bindingDigest || state.currentBindingDigest() !== state.bindingDigest) return null;
  return state.rule;
}

export type EgressDecision =
  | { readonly decision: 'transmit-local'; readonly payloadDigest: string }
  | { readonly decision: 'transmit-remote'; readonly payloadDigest: string; readonly ticket: TransmitTicket }
  | { readonly decision: 'refuse'; readonly reason: EgressRefusalReason; readonly detail: string };

export const EGRESS_REFUSED_CODE = 'AI7_EGRESS_REFUSED';

function refuse(reason: EgressRefusalReason, detail: string): EgressDecision {
  return { decision: 'refuse', reason, detail };
}

/**
 * A digest over the whole payload; recorded, never the payload itself. A text-only message contributes its text, exactly
 * as it always has; a message with any other block — a tool call or a tool result, admitted only under a rule naming the
 * platform tools — contributes its canonical blocks, so two different tool exchanges never share a digest.
 */
export function payloadDigest(payload: AssembledModelPayload): string {
  const texts = payload.messages.map((message) => `${message.role}\u0000${messageText(message) ?? `\u0001${canonicalJson(message.content)}`}`);
  return sha256Hex([payload.provider, payload.model, payload.system ?? '', ...texts].join('\u0002'));
}

/**
 * The digest an assistant tool-call message is accepted by (Issue #473): SHA-256 over its text and tool-call blocks in
 * order, each reduced to the fields the model produced. The execution owner records it when the adapter returns the
 * message; the gate admits the message back into history only when the digest is recorded.
 */
export function assistantToolCallDigest(content: ReadonlyArray<AssembledContentBlock>): string {
  return sha256Hex(canonicalJson(content.map((block) => block.type === 'tool-call'
    ? { type: 'tool-call', id: block.id ?? null, name: block.name ?? null, arguments: block.arguments ?? null }
    : { type: block.type, text: block.text ?? null })));
}

/** Whether a binding carries a rule naming the platform tools under the one scope that may name them. */
function platformToolsOf(binding: EgressBindingFacts): PlatformToolsRule | null {
  const rule = binding.platformTools ?? null;
  return rule !== null && binding.policy.operationalScope === 'developer-live' ? rule : null;
}

/**
 * The tool branch of the message walk: an assistant message carrying tool calls, or a user-role tool result. Reached only
 * under a rule naming the platform tools; every other binding keeps refusing both as the non-text messages they are.
 * Returns the refusal, or `null` when the message is admitted.
 */
function evaluateToolMessage(
  message: AssembledModelPayload['messages'][number],
  index: number,
  binding: EgressBindingFacts,
  rule: PlatformToolsRule,
  scope: EgressAttemptScope,
  calls: { readonly open: Map<string, PlatformToolName>; readonly seen: Set<string> },
): EgressDecision | null {
  const toolCalls = assistantToolCalls(message);
  if (toolCalls !== null) {
    if (message.source.kind !== 'model' || message.source.provider !== binding.route || message.source.model !== binding.model ||
        !toolCalls.calls.every((call) => (PLATFORM_TOOL_NAMES as ReadonlyArray<string>).includes(call.name)) ||
        !(scope.acceptedToolCallDigests?.has(assistantToolCallDigest(message.content)) ?? false)) {
      return refuse('payload-out-of-scope', `第 ${index + 1} 条模型工具调用不是本次尝试已接受的输出；未发送任何内容。`);
    }
    // A call id names one call for the whole history: a gateway that reuses ids would let one result answer two calls.
    for (const call of toolCalls.calls) {
      if (calls.seen.has(call.id)) return refuse('payload-out-of-scope', `第 ${index + 1} 条模型工具调用重复使用了调用标识；未发送任何内容。`);
      calls.seen.add(call.id);
      calls.open.set(call.id, call.name as PlatformToolName);
    }
    return null;
  }
  const result = toolResultOf(message);
  const tool = result === null ? undefined : calls.open.get(result.callId);
  const admitted = result === null || tool === undefined ? undefined : scope.admittedToolResults?.get(toolResultKey(result.callId, tool));
  if (result === null || tool === undefined || admitted === undefined || admitted.callId !== result.callId || admitted.tool !== tool ||
      sha256Hex(result.text) !== admitted.sha256 || Buffer.byteLength(result.text, 'utf8') !== admitted.byteCount ||
      !toolResultSourceAdmitted(admitted, rule, scope)) {
    return refuse('payload-out-of-scope', `第 ${index + 1} 条工具结果不是本次尝试已取得的结果；未发送任何内容。`);
  }
  // One result per call: a second message answering the same call is not a result AI7 produced.
  calls.open.delete(result.callId);
  return null;
}

/** The key one admitted tool result is held under: the call id and the tool that call named (the review of #671). */
export function toolResultKey(callId: string, tool: PlatformToolName): string {
  return JSON.stringify([callId, tool]);
}

/** Whether a tool result's URL is one its tool may have read: the rule's search host, or a cited public page. */
function toolResultSourceAdmitted(admitted: AdmittedToolResult, rule: PlatformToolsRule, scope: EgressAttemptScope): boolean {
  if (admitted.sourceUrl === null) return true;
  if (admitted.tool === 'websearch') {
    try {
      const url = new URL(admitted.sourceUrl);
      return url.protocol === 'https:' && url.hostname === rule.websearch.host;
    } catch {
      return false;
    }
  }
  const canonical = canonicalPublicUrl(admitted.sourceUrl);
  return canonical !== null && canonical === admitted.sourceUrl && (scope.citationAdmits?.(canonical) ?? false);
}

export function evaluateEgress(
  payload: AssembledModelPayload,
  binding: EgressBindingFacts,
  scope: EgressAttemptScope,
): EgressDecision {
  if (!DIGEST_PATTERN.test(binding.bindingDigest) || scope.currentBindingDigest() !== binding.bindingDigest) {
    return refuse('binding-stale', '执行绑定已不是当前绑定；未发送任何内容。');
  }
  if (binding.outboundDataCategory !== 'public-or-synthetic' &&
      !(binding.outboundDataCategory === 'editor-selected-manuscript-excerpt' && binding.route === LOCAL_DETERMINISTIC_ROUTE)) {
    return refuse('outbound-category-mismatch', '外发数据类别不允许经这条路由发送；未发送任何内容。');
  }
  if (payload.provider !== binding.route) return refuse('route-mismatch', '请求路由与执行绑定不一致；未发送任何内容。');
  if (payload.model !== binding.model) return refuse('model-mismatch', '请求模型与执行绑定不一致；未发送任何内容。');
  // ADR 0080 §7.2: a payload may expose tools only when its tool set equals exactly the platform tools the binding's rule
  // names. A rule that names none — Provider Processing v5's — matches no tool set, so every tool is refused as before.
  const rule = platformToolsOf(binding);
  if (payload.tools !== undefined && payload.tools.length > 0 && !toolSetEqualsRule(payload.tools, rule)) {
    return refuse('tools-present', '组合运行时向模型暴露了规则未命名的工具；未发送任何内容。');
  }
  if ((payload.system ?? '') !== binding.systemPrompt) {
    return refuse('system-prompt-mismatch', '系统提示与冻结的提示契约不一致；未发送任何内容。');
  }
  if (payload.messages.length === 0) return refuse('payload-out-of-scope', '请求不含任何单元消息；未发送任何内容。');
  const calls = { open: new Map<string, PlatformToolName>(), seen: new Set<string>() };
  for (const [index, message] of payload.messages.entries()) {
    // The tool branch is reached only under a rule naming the platform tools and only for a message that is a tool call
    // or a tool result; every other message — and both kinds under every other rule — takes the unchanged branches below,
    // where a non-text block is still a refusal.
    if (rule !== null && (assistantToolCalls(message) !== null || (message.role === 'user' && message.source.kind === 'tool'))) {
      const refused = evaluateToolMessage(message, index, binding, rule, scope, calls);
      if (refused !== null) return refused;
      continue;
    }
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
  // ADR 0080 §7.4: a unit past the breaker ends there, with 联网核查未完成 on its affected findings — the model is not asked
  // again with the refusal in hand, so a looping model stops transmitting rather than running into the Run's ceiling.
  if (rule !== null && last.source.kind === 'tool' && (scope.breakerState?.() ?? 'intact') === 'tripped') {
    return refuse('circuit-breaker-tripped', '联网核查未完成：本单元的工具往返已达到熔断上限，本单元到此结束；未发送任何内容。');
  }
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

function refuseTool(reason: EgressRefusalReason, detail: string): PlatformToolRefusal {
  return { decision: 'refuse', reason, detail };
}

/**
 * The one outbound category a platform-tool call may carry (ADR 0080 §7.2 and its Question 2): a query or a fetched URL is
 * written by a model that read only the binding's admitted material, so its category is the binding's own — and the
 * platform tools exist only for a binding of public or synthetic material.
 *
 * This constant widens with the policy and never ahead of it (#724 review, P3-3; Issue #473 S87-f3b). Provider Processing
 * v8 names the platform tools on its analysis rule alone, whose `allowedOutboundDataCategories` is exactly
 * `public-or-synthetic`; its dialogue rule carries `editor-selected-manuscript-excerpt` with `webSearchToolAllowed: false`
 * (ADR 0088 §1.5), so no excerpt may reach a search service or a fetched page. A later revision that admits another
 * category to a rule naming the tools is the Owner's byte review, and this constant moves in the same pull request.
 */
const PLATFORM_TOOL_OUTBOUND_CATEGORY: OutboundDataCategory = 'public-or-synthetic';

/**
 * The preconditions both platform-tool decisions share; the refusal, or what they may proceed under. Everything is read
 * from the binding, its selected rule, the scope, and the gate's own book — nothing from the call — so no caller can make a
 * narrowing compare a value with itself (#676).
 */
function platformToolPreconditions(binding: EgressBindingFacts, scope: EgressAttemptScope, book: EgressTicketBook):
  PlatformToolRefusal | { readonly rule: PlatformToolsRule; readonly state: TicketBookState } {
  if (!DIGEST_PATTERN.test(binding.bindingDigest) || scope.currentBindingDigest() !== binding.bindingDigest) {
    return refuseTool('binding-stale', '执行绑定已不是当前绑定；未发送任何内容。');
  }
  if (binding.policy.operationalScope === 'development-ci') {
    return refuseTool('remote-route-denied-under-v1', 'development-ci · Provider Processing v1 允许 0 次实时传输；未发送任何内容。');
  }
  const rule = platformToolsOf(binding);
  if (rule === null) {
    return refuseTool('platform-tools-not-named', '执行绑定的处理规则未命名平台工具；未发送任何内容。');
  }
  // A ticket goes only into a book the gate opened for exactly this binding and its rule: the rule a forwarder builds from
  // at redemption is the book's, so a decision over any other rule would name a host the request never goes to.
  const state = ticketBooks.get(book);
  if (state === undefined || state.bindingDigest !== binding.bindingDigest || canonicalJson(state.rule) !== canonicalJson(rule)) {
    return refuseTool('ticket-book-foreign', '票据簿不是出口闸门为本执行绑定开立的；未发送任何内容。');
  }
  // Derived from the binding, never passed in by the call: the query's category is the binding's (ADR 0080 §7.2).
  if (binding.outboundDataCategory !== PLATFORM_TOOL_OUTBOUND_CATEGORY) {
    return refuseTool('outbound-category-mismatch', '平台工具只承载公开或合成材料，执行绑定的外发数据类别不是；未发送任何内容。');
  }
  if ((scope.breakerState?.() ?? 'intact') === 'tripped') {
    return refuseTool('circuit-breaker-tripped', '本单元的工具往返已触发熔断；未发送任何内容。');
  }
  const ceiling = scope.ceilingState?.() ?? 'unset';
  if (ceiling === 'unset') {
    return refuseTool('run-budget-ceiling-unset', '平台工具要求非 unset 的任务运行预算上限；未发送任何内容。');
  }
  if (ceiling === 'reached') return refuseTool('run-budget-ceiling-reached', '任务运行预算上限已达到；未发送任何内容。');
  return { rule, state };
}

/**
 * The `call-search-service` decision (ADR 0080 §7.2), beside `transmit-remote`: one model-emitted `websearch` call may be
 * forwarded only to the host the binding's rule names, only with the binding's own outbound category — which must be
 * public or synthetic — only while the unit's breaker is intact and the Run's ceiling holds. The call brings only its
 * arguments: the host and the category are derived here from the selected rule and the binding (#676), never taken from
 * the caller. One decision is one single-use ticket in the gate's own book; the forwarder sends with the `fetch` the service
 * captured before installing network denial. A binding whose rule names no platform tools — every binding under Provider
 * Processing v5 — is refused before anything else is read.
 */
export function evaluateSearchServiceCall(
  request: { readonly arguments: Extract<PlatformToolArguments, { tool: 'websearch' }> },
  binding: EgressBindingFacts,
  scope: EgressAttemptScope,
  book: EgressTicketBook,
): SearchServiceDecision {
  const admitted = platformToolPreconditions(binding, scope, book);
  if ('decision' in admitted) return admitted;
  const ticket = issueTicket<SearchServiceTicket>(admitted.state, {
    decision: 'call-search-service',
    bindingDigest: binding.bindingDigest,
    host: admitted.rule.websearch.host,
    argumentsDigest: toolArgumentsDigest(request.arguments),
  });
  return { decision: 'call-search-service', ticket };
}

/**
 * The `fetch-public-source` decision (ADR 0074 §3) as `webfetch` rides it (ADR 0080 §7.2): one canonical public `https`
 * URL the model cited or the search returned — bounded by citations, not by a host list — under a rule naming the platform
 * tools, for a public or synthetic binding, while the breaker is intact and the ceiling holds. One decision is one
 * single-use ticket in the gate's own book, and the ticket is the only thing per-ticket host admission opens a host for.
 */
export function evaluatePublicSourceFetch(
  request: { readonly arguments: Extract<PlatformToolArguments, { tool: 'webfetch' }> },
  binding: EgressBindingFacts,
  scope: EgressAttemptScope,
  book: EgressTicketBook,
): PublicSourceDecision {
  const admitted = platformToolPreconditions(binding, scope, book);
  if ('decision' in admitted) return admitted;
  const url = canonicalPublicUrl(request.arguments.url);
  if (url === null || url !== request.arguments.url) {
    return refuseTool('fetch-target-invalid', '取回地址不是规范的公开 https 地址；未发送任何内容。');
  }
  if (!(scope.citationAdmits?.(url) ?? false)) {
    return refuseTool('fetch-target-not-cited', '取回地址不是本次尝试引用或搜索返回的来源；未发送任何内容。');
  }
  const ticket = issueTicket<PublicSourceTicket>(admitted.state, {
    decision: 'fetch-public-source',
    bindingDigest: binding.bindingDigest,
    url,
    host: new URL(url).hostname,
    argumentsDigest: toolArgumentsDigest(request.arguments),
  });
  return { decision: 'fetch-public-source', ticket };
}
