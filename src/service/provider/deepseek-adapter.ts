import type { GenerateOptions, LlmAdapter, LlmProviderInfo, LlmResolvedModelInfo, StreamChunk } from '@deepseek-ai/dsh-llm';
import { canonicalJson, isRecord, sha256Hex } from '../analysis/canonical.js';
import { AI7_FAILURE_CODES, type DshFailureCodes } from './classification.js';
import type { CredentialBroker, CredentialSlotBinding } from './credential-broker.js';
import {
  DEEPSEEK_ROUTE,
  OPENCODE_GO_ROUTE,
  type CredentialSlot,
  type RemoteExecutionRoute,
  type TransmitTicket,
} from './egress-gate.js';
import {
  ADR_0067_DOCUMENTATION,
  DEEPSEEK_V4_PRO_PROFILE,
  PRODUCTION_BASELINE,
  type CapabilityEvidence,
  type ProviderModelProfile,
} from './model-profile.js';
import { messageText, type AssembledModelPayload } from './payload.js';
import { normalizeModelResponse, type CanonicalModelResult } from './response-normalization.js';

/**
 * The AI7-owned OpenAI-compatible Provider adapter, revision 1. One adapter serves both remote
 * routes, composed from two profiles: a **route profile** — endpoint, credential slot, header
 * policy, limit reading — says how to reach a model, and a **model profile**
 * (`./model-profile.ts`) says how to speak to one. They are separate because one route serves many
 * models, so a model's capabilities cannot hang off the route that carries it.
 * `deepseek-open-platform` is the unchanged production route
 * (`POST https://api.deepseek.com/chat/completions`, model `deepseek-v4-pro`, thinking enabled at
 * high reasoning effort). `opencode-go` is the developer-live route of Provider Processing v4
 * (`POST https://opencode.ai/zen/go/v1/chat/completions`, bare model id `deepseek-v4-flash`, a
 * standard chat-completions body with no DeepSeek-specific parameters, and the technical Session id
 * in `x-opencode-session` for the gateway's prompt cache).
 *
 * Neither route exposes provider-native tools. The adapter assembles a deterministic request from the
 * frozen prompt contract, records the request digest, and transmits only after a `transmit-remote`
 * decision the gate issued for the same binding. The credential enters only the `authorization`
 * header inside the broker's release callback; the assembled request and its digest never contain it.
 */
export const DEEPSEEK_ADAPTER_REVISION = 1 as const;
export const DEEPSEEK_CONFIGURATION_REVISION = 1 as const;
export const DEEPSEEK_ENDPOINT = 'https://api.deepseek.com/chat/completions' as const;
export const DEEPSEEK_REASONING_EFFORT = 'high' as const;
/** The OpenCode Go chat-completions endpoint of the developer-live route (verified 2026-09-06). */
export const OPENCODE_GO_ENDPOINT = 'https://opencode.ai/zen/go/v1/chat/completions' as const;
/** The opaque per-request Session header the gateway uses for prompt caching; it carries the Session id and nothing else. */
export const OPENCODE_GO_SESSION_HEADER = 'x-opencode-session' as const;
/** The specific User-Agent the developer-live route sends: the product and the trusted scope, no host or user detail. */
export const OPENCODE_GO_USER_AGENT = 'AI7-Harness/1.0 (developer-live)' as const;

/**
 * How one remote route is reached: everything that is true of the route whichever model it carries.
 * What differs between models — the body shape, the reasoning parameters, the channels a response is
 * read from — is declared by a `ProviderModelProfile` instead, because the `opencode-go` gateway
 * serves seven vendors' models through this one route (ADR 0067).
 */
export interface ProviderRouteProfile {
  readonly route: RemoteExecutionRoute;
  readonly endpoint: string;
  readonly credentialSlot: CredentialSlot;
  /**
   * How a rate-limit-shaped response is read. The production route keeps `429 → RATE_LIMIT`, which is
   * retry-safe. On the developer-live route a 429, a 402, or a body naming the usage limit is one
   * thing — the development account's limit — so it classifies as a Provider Account Limit, which is
   * not retry-safe and ends the Run. The gateway's limit shape is undocumented, so all three are read
   * the same way rather than guessing which one it sends.
   */
  readonly limitPolicy: 'rate-limit-retryable' | 'account-limit-terminal';
  /** Whether the mandatory DSH attribution headers travel with the request; only the production route sends them. */
  readonly dshAttribution: boolean;
  /** Whether the request carries the technical Session id in `x-opencode-session`. */
  readonly sessionHeader: boolean;
  /**
   * The per-turn output cap this route's shape forces the request to name, or `null` for a shape that
   * requires none. It is a request-side declaration and nothing more: the Run Budget Ceiling remains
   * the authority over the Run, and a shape that names no cap sends no field, so declaring one here
   * cannot move the bytes of a route that does not need it. A shape that requires a cap on a route
   * declaring `null` refuses to assemble rather than inventing a number.
   */
  readonly maxOutputTokens: number | null;
  /**
   * How this route's credential header form was established. A model profile says the provenance of
   * every capability it declares; a route says the provenance of the one fact that decides whether a
   * credential reaches the endpoint at all, so that a new route cannot be added without stating where
   * its header form came from.
   */
  readonly credentialHeaderEvidence: CapabilityEvidence;
  readonly displayName: string;
}

export const DEEPSEEK_ROUTE_PROFILE: ProviderRouteProfile = {
  route: DEEPSEEK_ROUTE,
  endpoint: DEEPSEEK_ENDPOINT,
  credentialSlot: 'deepseek-api-key',
  limitPolicy: 'rate-limit-retryable',
  dshAttribution: true,
  sessionHeader: false,
  // Chat completions names no output cap, so this route sends no such field and its bytes cannot move.
  maxOutputTokens: null,
  // `authorization: Bearer` is what adapter revision 1 has always sent on this route.
  credentialHeaderEvidence: PRODUCTION_BASELINE,
  displayName: 'DeepSeek 开放平台（官方）',
};

export const OPENCODE_GO_ROUTE_PROFILE: ProviderRouteProfile = {
  route: OPENCODE_GO_ROUTE,
  endpoint: OPENCODE_GO_ENDPOINT,
  credentialSlot: 'opencode-go',
  limitPolicy: 'account-limit-terminal',
  dshAttribution: false,
  sessionHeader: true,
  maxOutputTokens: null,
  credentialHeaderEvidence: ADR_0067_DOCUMENTATION,
  displayName: 'OpenCode Go（开发者实时）',
};

export const PROVIDER_ROUTE_PROFILES: Readonly<Record<RemoteExecutionRoute, ProviderRouteProfile>> = {
  [DEEPSEEK_ROUTE]: DEEPSEEK_ROUTE_PROFILE,
  [OPENCODE_GO_ROUTE]: OPENCODE_GO_ROUTE_PROFILE,
};

export interface DeepSeekRequestAssembly {
  readonly url: string;
  readonly method: 'POST';
  /** Headers without the credential: content type, and whatever else the route profile declares. */
  readonly headers: Readonly<Record<string, string>>;
  /** Canonical JSON body; the digest is over exactly these bytes. */
  readonly body: string;
  readonly requestDigest: string;
  readonly promptContractDigest: string;
}

export interface ProviderRequestContext {
  readonly attribution: Readonly<Record<string, string>>;
  readonly promptContractDigest: string;
  /** The technical Session id of the turn in flight; required by a profile that sends the Session header. */
  readonly sessionId?: string;
}

/** The turn's user and assistant messages as both shapes carry them; where the system prompt goes is each shape's own business. */
function conversationMessages(payload: AssembledModelPayload): Array<{ role: string; content: string }> {
  const messages: Array<{ role: string; content: string }> = [];
  for (const message of payload.messages) {
    const text = messageText(message);
    if (text === null) throw new Error('DEEPSEEK_REQUEST_NON_TEXT_CONTENT');
    if (message.role !== 'user' && message.role !== 'assistant') throw new Error('DEEPSEEK_REQUEST_ROLE_INVALID');
    messages.push({ role: message.role, content: text });
  }
  return messages;
}

/** The system prompt of one payload, or `null` when the payload carries none. */
function systemPromptOf(payload: AssembledModelPayload): string | null {
  return payload.system !== undefined && payload.system.length > 0 ? payload.system : null;
}

/**
 * The chat-completions body, exactly as adapter revision 1 has always assembled it: the system prompt
 * is the first message, and both frozen request digests are over these bytes.
 *
 * Of the structured-output constraints only `json-object` is implemented, as exactly one body field —
 * `response_format: {"type":"json_object"}`, the chat-completions spelling — and `json-schema` and
 * `tool-call` still refuse, because naming a constraint is not implementing it. Implementing one is
 * still not sending it: the field travels only for a model whose profile declares `json-object`, and
 * that declaration needs the live evidence the profile table demands (Issue #306).
 */
function chatCompletionsBody(model: ProviderModelProfile, payload: AssembledModelPayload): string {
  const structuredOutput = model.capabilities.structuredOutput;
  if (structuredOutput !== 'none' && structuredOutput !== 'json-object') throw new Error('PROVIDER_STRUCTURED_OUTPUT_UNSUPPORTED');
  const system = systemPromptOf(payload);
  const messages = system === null
    ? conversationMessages(payload)
    : [{ role: 'system', content: system }, ...conversationMessages(payload)];
  return canonicalJson({
    model: model.model,
    messages,
    stream: false,
    ...(model.capabilities.reasoningControl === 'deepseek-thinking'
      ? { thinking: { type: 'enabled' }, reasoning_effort: DEEPSEEK_REASONING_EFFORT }
      : {}),
    // One field, and nothing else moves: a profile that declares `json-object` sends the body it
    // would have sent anyway plus this key, so the constraint can be added to or withdrawn from a
    // model without any other byte of the request changing.
    ...(structuredOutput === 'json-object' ? { response_format: { type: 'json_object' } } : {}),
  });
}

/**
 * The Anthropic-compatible body, from the Anthropic Messages API reference read on 2026-09-08
 * (`https://platform.claude.com/docs/en/api/messages`): `{ model, max_tokens, system?, messages }`.
 *
 * Two facts of this shape are worth stating where they are implemented. The system prompt is a
 * top-level field and never a message, so the same `AssembledModelPayload` that puts it first in a
 * chat-completions array puts it beside the array here, and nothing above the adapter learns the
 * difference. And `max_tokens` is mandatory, so it is taken from the route's declaration or the
 * request refuses: a cap the assembler invented would be a bound nobody authorized.
 *
 * The reasoning and structured-output spellings this adapter implements are the chat-completions
 * ones, so a profile that declares either on this shape refuses rather than sending a field the
 * endpoint never documented.
 */
function anthropicMessagesBody(
  profile: ProviderRouteProfile,
  model: ProviderModelProfile,
  payload: AssembledModelPayload,
): string {
  if (model.capabilities.structuredOutput !== 'none') throw new Error('PROVIDER_STRUCTURED_OUTPUT_UNSUPPORTED');
  if (model.capabilities.reasoningControl !== 'none') throw new Error('PROVIDER_REASONING_CONTROL_UNSUPPORTED');
  if (profile.maxOutputTokens === null) throw new Error('PROVIDER_MAX_OUTPUT_TOKENS_ABSENT');
  const system = systemPromptOf(payload);
  return canonicalJson({
    model: model.model,
    max_tokens: profile.maxOutputTokens,
    ...(system === null ? {} : { system }),
    messages: conversationMessages(payload),
  });
}

/**
 * Assemble one request. The header set comes from the route profile, the body from the model
 * profile's declared capabilities, and nothing is read from anywhere else — which is what makes a
 * new model a new row in the profile table rather than a new branch here.
 *
 * Two of the three shapes ADR 0067 documents behind the Go gateway's paths are implemented and
 * `openai-responses` still refuses rather than guessing. The branch is on `requestShape` alone: no
 * route, model id, or endpoint is consulted, so a model behind an Anthropic-compatible endpoint is a
 * profile rather than a branch, and nothing above this function learns which shape it got.
 */
export function assembleProviderRequest(
  profile: ProviderRouteProfile,
  model: ProviderModelProfile,
  payload: AssembledModelPayload,
  context: ProviderRequestContext,
): DeepSeekRequestAssembly {
  if (model.route !== profile.route) throw new Error('PROVIDER_MODEL_ROUTE_MISMATCH');
  const shape = model.capabilities.requestShape;
  if (shape !== 'openai-chat-completions' && shape !== 'anthropic-messages') throw new Error('PROVIDER_REQUEST_SHAPE_UNSUPPORTED');
  const body = shape === 'anthropic-messages'
    ? anthropicMessagesBody(profile, model, payload)
    : chatCompletionsBody(model, payload);
  if (profile.sessionHeader && (context.sessionId === undefined || context.sessionId.length === 0)) {
    throw new Error('PROVIDER_REQUEST_SESSION_ABSENT');
  }
  return {
    url: profile.endpoint,
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
      ...(profile.dshAttribution ? context.attribution : {}),
      ...(profile.sessionHeader ? { [OPENCODE_GO_SESSION_HEADER]: context.sessionId!, 'user-agent': OPENCODE_GO_USER_AGENT } : {}),
    },
    body,
    requestDigest: sha256Hex(body),
    promptContractDigest: context.promptContractDigest,
  };
}

/** The production route's assembly, unchanged in url, headers, body, and digest. */
export function assembleDeepSeekRequest(
  payload: AssembledModelPayload,
  attribution: Readonly<Record<string, string>>,
  promptContractDigest: string,
): DeepSeekRequestAssembly {
  return assembleProviderRequest(DEEPSEEK_ROUTE_PROFILE, DEEPSEEK_V4_PRO_PROFILE, payload, { attribution, promptContractDigest });
}

export function authorizationHeader(secret: string): Readonly<Record<string, string>> {
  return { authorization: `Bearer ${secret}` };
}

/**
 * One response as everything above the adapter may see it: either this route's transport-level
 * failure, or the canonical result the model profile's declared channels yielded. No caller learns
 * the vendor's body shape, and none of them ever receives an empty answer disguised as an answer.
 */
export type ProviderResponseOutcome =
  | CanonicalModelResult
  | { readonly kind: 'failure'; readonly code: string; readonly message: string; readonly status: number };

/** The error text of one response, lowercased, for the limit and context-window shapes to be read from. */
function errorTextOf(body: unknown): string {
  const errorRecord = isRecord(body) && isRecord(body.error) ? body.error : null;
  return errorRecord === null
    ? ''
    : [errorRecord.code, errorRecord.type, errorRecord.message].filter((part) => typeof part === 'string').join(' ').toLocaleLowerCase('en-US');
}

/**
 * Whether one response is this route's Provider Account Limit. Only a route whose `limitPolicy` is
 * `account-limit-terminal` reads a 429 this way; on the production route a 429 stays a retry-safe
 * rate limit, exactly as it was.
 */
export function isProviderAccountLimit(profile: ProviderRouteProfile, status: number, body: unknown): boolean {
  const limitText = /insufficient[_ ]?(balance|quota)|quota|balance|usage limit|credit/u.test(errorTextOf(body));
  if (status === 402 || limitText) return true;
  return profile.limitPolicy === 'account-limit-terminal' && status === 429;
}

/**
 * Read one response: first the status, which is the route's to classify, then the body, which is the
 * model profile's. The split matters — a 429 means the same thing whichever model answered it, while
 * where the answer text lives is a property of the model alone.
 */
export function parseProviderResponse(
  status: number,
  body: unknown,
  codes: DshFailureCodes,
  profile: ProviderRouteProfile,
  model: ProviderModelProfile,
): ProviderResponseOutcome {
  const errorText = errorTextOf(body);
  if (status === 401 || status === 403) return { kind: 'failure', code: codes.INVALID_CREDENTIAL_CODE, message: '模型服务拒绝了凭据。', status };
  if (isProviderAccountLimit(profile, status, body)) {
    return { kind: 'failure', code: codes.QUOTA_EXCEEDED_CODE, message: '模型服务账户限额或余额不足。', status };
  }
  if (status === 429) return { kind: 'failure', code: AI7_FAILURE_CODES.RATE_LIMIT, message: '模型服务速率限制。', status };
  if (status === 400 && /context|maximum length|too long|tokens/u.test(errorText)) {
    return { kind: 'failure', code: codes.CONTEXT_WINDOW_EXCEEDED_CODE, message: '请求超出模型上下文窗口。', status };
  }
  if (status >= 500) return { kind: 'failure', code: AI7_FAILURE_CODES.PROVIDER_ERROR, message: '模型服务返回服务端错误。', status };
  if (status !== 200) return { kind: 'failure', code: AI7_FAILURE_CODES.INVALID_RESPONSE, message: '模型服务返回了无法分类的状态。', status };
  return normalizeModelResponse(model, body);
}

/** Classify a transport-level rejection (network denial, abort, other) into failure facts. */
export function classifyTransportError(error: unknown): { code: string; message: string } {
  const code = isRecord(error) && typeof error.code === 'string' ? error.code : null;
  const name = isRecord(error) && typeof error.name === 'string' ? error.name : null;
  if (code === AI7_FAILURE_CODES.NETWORK_DENIED) return { code, message: '出站网络在当前产品区间内被禁用。' };
  if (name === 'AbortError') return { code: AI7_FAILURE_CODES.INTERRUPTED, message: '请求被中断。' };
  return { code: AI7_FAILURE_CODES.TRANSPORT_FAILED, message: '模型服务传输失败。' };
}

export interface TransmitTicketSource {
  /** Take the single-use `transmit-remote` ticket the gate issued for this exact step, or `null`. */
  take(): TransmitTicket | null;
}

export interface DeepSeekTransportResponse {
  readonly status: number;
  json(): Promise<unknown>;
}

export type DeepSeekTransport = (
  url: string,
  init: { method: 'POST'; headers: Record<string, string>; body: string; signal?: AbortSignal },
) => Promise<DeepSeekTransportResponse>;

export interface DeepSeekAdapterDependencies {
  readonly broker: CredentialBroker;
  readonly slotBinding: CredentialSlotBinding;
  readonly tickets: TransmitTicketSource;
  readonly attribution: () => Readonly<Record<string, string>>;
  readonly promptContractDigest: string;
  readonly codes: DshFailureCodes;
  /** Defaults to the global `fetch`, which the product interval denies. */
  readonly transport?: DeepSeekTransport;
  /** The route this adapter serves; the unchanged production route when absent. */
  readonly profile?: ProviderRouteProfile;
  /** The model this adapter speaks to; the production model when absent. Must belong to the bound route. */
  readonly modelProfile?: ProviderModelProfile;
  /** The technical Session id of the turn in flight; required by a profile that sends the Session header. */
  readonly sessionId?: () => string;
}

export class DeepSeekOpenAiCompatibleAdapter implements LlmAdapter {
  readonly #deps: DeepSeekAdapterDependencies;
  readonly #profile: ProviderRouteProfile;
  readonly #modelProfile: ProviderModelProfile;
  readonly #requestDigests: string[] = [];
  #transmissions = 0;
  #lastResult: CanonicalModelResult | null = null;

  constructor(deps: DeepSeekAdapterDependencies) {
    this.#deps = deps;
    this.#profile = deps.profile ?? DEEPSEEK_ROUTE_PROFILE;
    this.#modelProfile = deps.modelProfile ?? DEEPSEEK_V4_PRO_PROFILE;
    if (this.#profile.credentialSlot !== deps.slotBinding.slot) throw new Error('PROVIDER_ROUTE_SLOT_MISMATCH');
    if (this.#profile.sessionHeader && deps.sessionId === undefined) throw new Error('PROVIDER_ROUTE_SESSION_SOURCE_ABSENT');
    // A model profile belongs to exactly one route: the capabilities of a model behind one gateway
    // say nothing about the same model id behind another.
    if (this.#modelProfile.route !== this.#profile.route) throw new Error('PROVIDER_MODEL_ROUTE_MISMATCH');
  }

  /** The route profile this adapter serves. */
  get profile(): ProviderRouteProfile {
    return this.#profile;
  }

  /** The model profile this adapter speaks to. */
  get modelProfile(): ProviderModelProfile {
    return this.#modelProfile;
  }

  /** Request digests assembled so far, whether or not a transmission followed. */
  get assembledRequestDigests(): ReadonlyArray<string> {
    return this.#requestDigests;
  }

  /** Transmit attempts that reached the transport; zero for every v1 Run. */
  get transmissions(): number {
    return this.#transmissions;
  }

  /**
   * The canonical result of the turn in flight, out of band, cleared at the start of every turn and
   * `null` whenever the turn produced no response at all. It travels beside the stream rather than
   * inside it because a `StreamChunk` cannot carry the distinction: the harness projects an assistant
   * message into one string, and an empty answer and an answer of `''` are that same string. The
   * execution owner reads this immediately after each `submitUnit`, exactly as it reads
   * `assembledRequestDigests` and `transmissions`.
   */
  get lastCanonicalResult(): CanonicalModelResult | null {
    return this.#lastResult;
  }

  providerInfo(provider: string): LlmProviderInfo {
    return { id: provider, name: this.#profile.displayName };
  }

  providerRetryPolicy(): undefined {
    return undefined;
  }

  listModels(): Promise<readonly never[]> {
    return Promise.resolve([]);
  }

  resolveModel(provider: string, model: string): Promise<LlmResolvedModelInfo> {
    return Promise.resolve({ provider, id: model, name: this.#modelProfile.displayName, inputModalities: ['text'] });
  }

  async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    const fail = (code: string, message: string, status?: number): StreamChunk => ({
      type: 'finish',
      reason: { kind: code === AI7_FAILURE_CODES.INTERRUPTED ? 'aborted' : 'error', failure: { code, message, ...(status === undefined ? {} : { status }) } },
    });
    // Cleared here so a reader after this turn never sees the previous turn's result: a turn that
    // fails before any response arrives has no canonical result, and must not appear to have one.
    this.#lastResult = null;
    if (options.provider !== this.#profile.route || options.model !== this.#modelProfile.model) {
      yield fail(AI7_FAILURE_CODES.INVALID_RESPONSE, '适配器只服务其绑定路由与模型。');
      return;
    }
    let assembly: DeepSeekRequestAssembly;
    try {
      assembly = assembleProviderRequest(this.#profile, this.#modelProfile, options, {
        attribution: this.#deps.attribution(),
        promptContractDigest: this.#deps.promptContractDigest,
        ...(this.#deps.sessionId === undefined ? {} : { sessionId: this.#deps.sessionId() }),
      });
    } catch {
      yield fail(AI7_FAILURE_CODES.INVALID_RESPONSE, '无法为本步骤组装请求；未发送任何内容。');
      return;
    }
    this.#requestDigests.push(assembly.requestDigest);
    const ticket = this.#deps.tickets.take();
    if (ticket === null || ticket.bindingDigest !== this.#deps.slotBinding.bindingDigest) {
      yield fail(AI7_FAILURE_CODES.TRANSMIT_TICKET_ABSENT, '没有本步骤的 transmit-remote 决定；未发送任何内容。');
      return;
    }
    let outcome: ProviderResponseOutcome;
    try {
      outcome = await this.#deps.broker.releaseTo(this.#deps.slotBinding, ticket, async (secret) => {
        this.#transmissions += 1;
        const transport = this.#deps.transport ?? ((url, init) => fetch(url, init));
        const response = await transport(assembly.url, {
          method: assembly.method,
          headers: { ...assembly.headers, ...authorizationHeader(secret) },
          body: assembly.body,
          ...(options.signal === undefined ? {} : { signal: options.signal }),
        });
        let body: unknown = null;
        try {
          body = await response.json();
        } catch {
          body = null;
        }
        return parseProviderResponse(response.status, body, this.#deps.codes, this.#profile, this.#modelProfile);
      });
    } catch (error) {
      const classified = classifyTransportError(error);
      yield fail(classified.code, classified.message);
      return;
    }
    if (outcome.kind === 'failure') {
      yield fail(outcome.code, outcome.message, outcome.status);
      return;
    }
    this.#lastResult = outcome;
    // A response that matched no declared channel is this route's `INVALID_RESPONSE`, exactly as it
    // was before the channels were declared; the canonical result records which channel was missing.
    if (outcome.kind === 'malformed') {
      yield fail(AI7_FAILURE_CODES.INVALID_RESPONSE, '模型服务响应不含可用内容。', 200);
      return;
    }
    // An empty answer streams exactly what it streamed before — the harness composition and every
    // Journey above it see an unchanged event shape — and the fact that the answer channel was empty
    // travels out of band, where a string cannot lose it.
    const text = outcome.kind === 'answer' ? outcome.text : '';
    yield { type: 'block-start', index: 0, blockType: 'text' };
    yield { type: 'text-delta', index: 0, text };
    yield { type: 'block-end', index: 0, block: { type: 'text', text } };
    if (outcome.usage !== null) yield { type: 'usage', usage: { ...outcome.usage } };
    yield { type: 'finish', reason: { kind: 'stop' } };
  }
}
