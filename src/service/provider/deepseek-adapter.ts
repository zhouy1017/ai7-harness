import type { CallId, GenerateOptions, LlmAdapter, LlmProviderInfo, LlmResolvedModelInfo, StreamChunk } from '@deepseek-ai/dsh-llm';
import { isRecord, sha256Hex } from '../analysis/canonical.js';
import { DIALOGUE_PROMPT_CONTRACT, DIALOGUE_PROMPT_CONTRACT_DIGEST, DIALOGUE_RETRIEVAL_PROMPT_CONTRACT, DIALOGUE_RETRIEVAL_PROMPT_CONTRACT_DIGEST, parseDialogueMessage } from '../dialogue/contract.js';
import { GLOBAL_AGENT_PROMPT_CONTRACT, GLOBAL_AGENT_PROMPT_CONTRACT_DIGEST } from '../dialogue/global-agent-session.js';
import { AI7_FAILURE_CODES, retryBackoffMs, type DshFailureCodes } from './classification.js';
import type { CredentialBroker, CredentialSlotBinding } from './credential-broker.js';
import {
  DEEPSEEK_ROUTE,
  OPENCODE_GO_ROUTE,
  type CredentialSlot,
  type RemoteExecutionRoute,
  type TransmitTicket,
} from './egress-gate.js';
import { anthropicMessagesBody, anthropicMessagesStreamBody, messagesSseEvents } from './family-anthropic-messages.js';
import { chatCompletionsBody, chatCompletionsStreamBody, dialogueSseEvents } from './family-chat-completions.js';
import { providerPreflight, streamingDeclared } from './family-dispositions.js';
import { generateContentSseEvents, googleGenerateContentBody, googleGenerateContentUrl } from './family-gemini.js';
import { openaiResponsesBody, openaiResponsesStreamBody, responsesSseEvents } from './family-openai-responses.js';
import {
  DEEPSEEK_V4_PRO_PROFILE,
  type CapabilityEvidence,
  type ProviderModelProfile,
} from './model-profile.js';
import { assistantToolCalls, messageText, toolResultOf, type AssembledModelPayload } from './payload.js';
import { GENERATED_ROUTE_PROFILES } from './provider-profiles.generated.js';
import { LOCAL_TOOL_NAMES, LEGACY_LOCAL_TOOL_SCHEMAS, toolSetEqualsPlatformSchemas } from './platform-tools.js';
import { normalizeModelResponse, type CanonicalModelResult, type ModelUsage, type NormalizeOptions } from './response-normalization.js';

export { DEEPSEEK_REASONING_EFFORT, dialogueSseEvents } from './family-chat-completions.js';
export { streamingDeclared } from './family-dispositions.js';

/**
 * The AI7-owned Provider adapter, revision 1. One adapter serves every remote route and all four
 * protocol families, composed from two profiles: a **route profile** — endpoint, credential slot,
 * header policy, limit reading, output cap — says how to reach a model, and a **model profile**
 * (`./model-profile.ts`) says how to speak to one. They are separate because one route serves many
 * models, so a model's capabilities cannot hang off the route that carries it.
 * Every route profile is generated from the provider documents under `config/providers/` (ADR 0073
 * §2, Issue #435): the endpoint, the credential slot and its header form, the limit reading and the
 * output cap are configuration, never constants of this module. `deepseek-open-platform` is the
 * unchanged production route (model `deepseek-v4-pro`, thinking enabled at high reasoning effort).
 * `opencode-go` is the developer-live route of Provider Processing v9 (bare model id
 * `deepseek-v4.1-flash`, a standard chat-completions body with no DeepSeek-specific parameters, and the
 * technical Session id in `x-opencode-session` for the gateway's prompt cache).
 *
 * Each family's request, stream and tool spelling lives in its own module beside this one (Issue #1180):
 * `family-chat-completions.ts`, `family-openai-responses.ts`, `family-anthropic-messages.ts` and
 * `family-gemini.ts`; `family-dispositions.ts` states what each family and each declared model is
 * supported for, and the adapter refuses every other demand by name before any ticket, credential or
 * transport is touched. This module keeps the one loop: preflight, assembly, the ticket, the broker's
 * release, the transport, classification and the canonical result, the same for every family.
 *
 * No route exposes provider-native tools. The adapter assembles a deterministic request from the
 * frozen prompt contract, records the request digest, and transmits only after a `transmit-remote`
 * decision the gate issued for the same binding. The credential enters only the one header the route's
 * declared form names, inside the broker's release callback; the assembled request and its digest
 * never contain it.
 */
export const DEEPSEEK_ADAPTER_REVISION = 1 as const;
export const DEEPSEEK_CONFIGURATION_REVISION = 1 as const;
/** Pre-v26 launch fallback. */
export const MODEL_REQUEST_DEADLINE_MS = 180_000;
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
   * The header the credential travels in, as the vendor documents it (ADR 0073 §2): `authorization:
   * Bearer` for every route before this field existed, `x-api-key` beside `anthropic-version` for
   * Anthropic's own endpoint, `x-goog-api-key` for Google's. The credential enters exactly this one
   * header inside the broker's release callback and no other.
   */
  readonly credentialHeader: CredentialHeaderForm;
  /** The `anthropic-version` value the `x-api-key` form travels with, and `null` for every other form. Not a secret. */
  readonly anthropicVersion: string | null;
  /**
   * How this route's credential header form was established. A model profile says the provenance of
   * every capability it declares; a route says the provenance of the one fact that decides whether a
   * credential reaches the endpoint at all, so that a new route cannot be added without stating where
   * its header form came from.
   */
  readonly credentialHeaderEvidence: CapabilityEvidence;
  readonly displayName: string;
}

/** The three credential header forms ADR 0073 §2 names. */
export type CredentialHeaderForm = 'authorization-bearer' | 'x-api-key' | 'x-goog-api-key';

/**
 * Every route the provider documents declare, generated (ADR 0073 §2). The documents carry what each
 * route's comment here used to say: why the production route alone sends DSH attribution, why the Go
 * plan reads a 429 as its account limit, why `/messages` declares 32,768 and `/responses` no cap.
 */
export const PROVIDER_ROUTE_PROFILES: Readonly<Record<RemoteExecutionRoute, ProviderRouteProfile>> = GENERATED_ROUTE_PROFILES;

/** The production connection's route, as `config/providers/deepseek-open-platform.json` declares it. */
export const DEEPSEEK_ROUTE_PROFILE: ProviderRouteProfile = PROVIDER_ROUTE_PROFILES[DEEPSEEK_ROUTE];
/** Provider Processing v9's developer-live route, as `config/providers/opencode-go.json` declares it. */
export const OPENCODE_GO_ROUTE_PROFILE: ProviderRouteProfile = PROVIDER_ROUTE_PROFILES[OPENCODE_GO_ROUTE];

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
  /** Only the frozen editorial dialogue contract may select SSE (Issue #833). */
  readonly requestShape?: 'editorial-dialogue-sse';
}

/**
 * The body of one request, chosen by the declared request shape and by nothing else — no route,
 * model id, or endpoint is consulted, which is what makes a model behind a second or third vendor's
 * endpoint a row in the profile table rather than a branch above the provider layer. Each family
 * refuses what it does not implement; the `default` still stands, because a profile is data.
 */
function providerRequestBody(profile: ProviderRouteProfile, model: ProviderModelProfile, payload: AssembledModelPayload, stream: boolean): string {
  switch (model.capabilities.requestShape) {
    case 'openai-chat-completions': {
      const body = chatCompletionsBody(model, payload);
      return stream ? chatCompletionsStreamBody(body) : body;
    }
    case 'anthropic-messages': {
      const body = anthropicMessagesBody(profile, model, payload);
      return stream ? anthropicMessagesStreamBody(body) : body;
    }
    case 'openai-responses': {
      const body = openaiResponsesBody(profile, model, payload);
      return stream ? openaiResponsesStreamBody(body) : body;
    }
    // This family streams by method, not by a body field.
    case 'google-generate-content': return googleGenerateContentBody(profile, model, payload);
    default: throw new Error('PROVIDER_REQUEST_SHAPE_UNSUPPORTED');
  }
}

/**
 * The URL of one request: the route's endpoint, except on the one shape that addresses the model in
 * the path instead of naming it in the body (`family-gemini.ts`). No route-profile field is added for
 * it: a route already says where it is reached, and that shape reads that one field differently.
 */
function providerRequestUrl(profile: ProviderRouteProfile, model: ProviderModelProfile, stream: boolean): string {
  if (model.capabilities.requestShape !== 'google-generate-content') return profile.endpoint;
  return googleGenerateContentUrl(profile, model, stream);
}

/** The stream reader of one model's family, aggregating to that family's buffered body. */
function familyStreamEvents(response: DeepSeekTransportResponse, model: ProviderModelProfile): AsyncIterable<DialogueStreamEvent> {
  switch (model.capabilities.requestShape) {
    case 'openai-responses': return responsesSseEvents(response);
    case 'anthropic-messages': return messagesSseEvents(response);
    case 'google-generate-content': return generateContentSseEvents(response);
    default: return dialogueSseEvents(response, model.model);
  }
}

/** A /2 dialogue carries its one admitted question followed only by complete local function-call rounds. */
function isRetrievalDialogue(payload: AssembledModelPayload): boolean {
  const first = payload.messages[0];
  if (payload.system !== DIALOGUE_RETRIEVAL_PROMPT_CONTRACT.systemPrompt ||
    !toolSetEqualsPlatformSchemas(payload.tools ?? [], LEGACY_LOCAL_TOOL_SCHEMAS) || first?.role !== 'user' ||
    parseDialogueMessage(messageText(first) ?? '') === null) return false;
  const issued = new Set<string>();
  const pending = new Set<string>();
  for (const message of payload.messages.slice(1)) {
    const calls = assistantToolCalls(message);
    if (calls !== null) {
      if (pending.size > 0 || calls.calls.length === 0) return false;
      for (const call of calls.calls) {
        if (!LOCAL_TOOL_NAMES.some((name) => name === call.name) || issued.has(call.id)) return false;
        issued.add(call.id);
        pending.add(call.id);
      }
    } else {
      const result = toolResultOf(message);
      if (result === null || !pending.delete(result.callId)) return false;
    }
  }
  return pending.size === 0;
}

/** Whether a stream request carries one of the frozen dialogue contracts the SSE shape is admitted for. */
function isStreamedDialogue(payload: AssembledModelPayload, context: ProviderRequestContext): boolean {
  const message = payload.messages[0];
  const predecessor = context.promptContractDigest === DIALOGUE_PROMPT_CONTRACT_DIGEST &&
    payload.system === DIALOGUE_PROMPT_CONTRACT.systemPrompt && payload.messages.length === 1 &&
    message?.role === 'user' && parseDialogueMessage(messageText(message) ?? '') !== null && (payload.tools ?? []).length === 0;
  const retrieval = context.promptContractDigest === DIALOGUE_RETRIEVAL_PROMPT_CONTRACT_DIGEST && isRetrievalDialogue(payload);
  const global = context.promptContractDigest === GLOBAL_AGENT_PROMPT_CONTRACT_DIGEST &&
    payload.system === GLOBAL_AGENT_PROMPT_CONTRACT.systemPrompt && payload.messages.length === 1 && message?.role === 'user' &&
    parseDialogueMessage(messageText(message) ?? '')?.globalSources !== undefined && (payload.tools ?? []).length === 0;
  return predecessor || retrieval || global;
}

/**
 * Assemble one request. The header set comes from the route profile, the body from the model
 * profile's declared capabilities, and nothing is read from anywhere else — which is what makes a
 * new model a new row in the profile table rather than a new branch here. A stream is assembled only
 * for a frozen dialogue contract on a model that declares its own family's stream.
 */
export function assembleProviderRequest(
  profile: ProviderRouteProfile,
  model: ProviderModelProfile,
  payload: AssembledModelPayload,
  context: ProviderRequestContext,
): DeepSeekRequestAssembly {
  if (model.route !== profile.route) throw new Error('PROVIDER_MODEL_ROUTE_MISMATCH');
  const dialogueStream = context.requestShape === 'editorial-dialogue-sse';
  // The address before the payload: a model that cannot be reached has no request to assemble.
  const url = providerRequestUrl(profile, model, dialogueStream);
  const body = providerRequestBody(profile, model, payload, dialogueStream);
  if (dialogueStream && (!streamingDeclared(model) || !isStreamedDialogue(payload, context))) throw new Error('PROVIDER_DIALOGUE_STREAM_SHAPE_INVALID');
  if (profile.sessionHeader && (context.sessionId === undefined || context.sessionId.length === 0)) {
    throw new Error('PROVIDER_REQUEST_SESSION_ABSENT');
  }
  return {
    url,
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: dialogueStream ? 'text/event-stream' : 'application/json',
      ...(profile.dshAttribution ? context.attribution : {}),
      ...(profile.sessionHeader ? { [OPENCODE_GO_SESSION_HEADER]: context.sessionId!, 'user-agent': OPENCODE_GO_USER_AGENT } : {}),
      // Only the `x-api-key` form names a version beside the key; every other route sends no such header,
      // so no request of a route that predates the field moves a header.
      ...(profile.anthropicVersion === null ? {} : { 'anthropic-version': profile.anthropicVersion }),
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
 * The one header the credential travels in, by the route's declared form (ADR 0073 §2). Called only
 * inside the broker's release callback; nothing it returns is assembled, digested, logged or kept.
 */
export function credentialHeaders(profile: ProviderRouteProfile, secret: string): Readonly<Record<string, string>> {
  switch (profile.credentialHeader) {
    case 'authorization-bearer': return authorizationHeader(secret);
    case 'x-api-key': return { 'x-api-key': secret };
    case 'x-goog-api-key': return { 'x-goog-api-key': secret };
    default: throw new Error('PROVIDER_CREDENTIAL_HEADER_UNSUPPORTED');
  }
}

/**
 * One response as everything above the adapter may see it: either this route's transport-level
 * failure, or the canonical result the model profile's declared channels yielded. No caller learns
 * the vendor's body shape, and none of them ever receives an empty answer disguised as an answer.
 */
export type ProviderResponseOutcome =
  | CanonicalModelResult
  | (Extract<CanonicalModelResult, { kind: 'malformed' }> & { readonly usage: ModelUsage | null })
  | { readonly kind: 'failure'; readonly code: string; readonly message: string; readonly status: number; readonly usage?: ModelUsage | null };

/** The error text of one response, lowercased, for the limit and context-window shapes to be read from. */
function errorTextOf(body: unknown): string {
  const errorRecord = isRecord(body) && isRecord(body.error) ? body.error : null;
  return errorRecord === null
    ? ''
    // Gemini names its class in `status` (`RESOURCE_EXHAUSTED`) where the other families name it in `code` or `type`.
    : [errorRecord.code, errorRecord.type, errorRecord.status, errorRecord.message].filter((part) => typeof part === 'string').join(' ').toLocaleLowerCase('en-US');
}

/**
 * Whether one response is this route's Provider Account Limit. Only a route whose `limitPolicy` is
 * `account-limit-terminal` reads a 429 this way; on the production route a 429 stays a retry-safe
 * rate limit, exactly as it was.
 */
export function isProviderAccountLimit(profile: ProviderRouteProfile, status: number, body: unknown): boolean {
  // The words of a limit count only in a refusal of the request (4xx): a server error that mentions a quota, a balance or a
  // credit is the server's failure, never the account's limit.
  const limitText = status >= 400 && status < 500 && /insufficient[_ ]?(balance|quota)|quota|balance|usage limit|credit/u.test(errorTextOf(body));
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
  options: NormalizeOptions = {},
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
  const normalized = normalizeModelResponse(model, body, options);
  if (model.route === 'openai-platform' && model.capabilities.requestShape === 'openai-responses' && isRecord(body)) {
    // A malformed output may still report billed usage. Reuse the existing usage reader without retaining its body.
    const usageOnly = normalized.kind === 'malformed' ? normalizeModelResponse(model, { ...body, output: [] }, options) : normalized;
    const usage = 'usage' in usageOnly ? usageOnly.usage : null;
    const refusal = Array.isArray(body.output) && body.output.some((item) => isRecord(item) && Array.isArray(item.content) && item.content.some((part) => isRecord(part) && part.type === 'refusal'));
    if (refusal) return { kind: 'failure', code: 'PROVIDER_REFUSAL', message: '模型拒绝了本次文本请求。', status, usage };
    if (body.status !== undefined && body.status !== 'completed') return { kind: 'failure', code: AI7_FAILURE_CODES.INVALID_RESPONSE, message: '模型服务没有返回完整的文本结果。', status, usage };
    if (normalized.kind === 'malformed') return { ...normalized, usage };
  }
  return normalized;
}

const MODEL_REQUEST_NO_SEND = new WeakMap<Error, { readonly request: object; readonly cause: unknown }>();

/** A trusted transport wrapper observed that this exact invocation never entered its native sender. */
export function modelRequestNotSent(request: object, cause: unknown): Error {
  const refusal = new Error('AI7_MODEL_REQUEST_NOT_SENT');
  MODEL_REQUEST_NO_SEND.set(refusal, { request, cause });
  return refusal;
}

/** After transport admission, names/codes and caller requestSent hints cannot prove no send. */
export function classifyTransportError(error: unknown, sent = false, request?: object): { code: string; message: string } {
  const proof = error instanceof Error ? MODEL_REQUEST_NO_SEND.get(error) : undefined;
  if (proof !== undefined && proof.request === request) { error = proof.cause; sent = false; }
  if (sent) return { code: AI7_FAILURE_CODES.OUTCOME_UNKNOWN, message: '请求可能已经发出，但未能核对完整结果；不会自动重发。' };
  const code = isRecord(error) && typeof error.code === 'string' ? error.code : null;
  const cause = isRecord(error) && isRecord(error.cause) ? error.cause : null;
  const timeoutCode = code ?? (typeof cause?.code === 'string' ? cause.code : null);
  const name = isRecord(error) && typeof error.name === 'string' ? error.name : null;
  if (code === 'AI7_PROXY_UNREACHABLE') return { code, message: '代理不可达：请检查网络代理设置。' };
  if (code === AI7_FAILURE_CODES.NETWORK_DENIED) return { code, message: '出站网络在当前产品区间内被禁用。' };
  if (timeoutCode === 'UND_ERR_CONNECT_TIMEOUT') return { code: AI7_FAILURE_CODES.TRANSPORT_FAILED, message: '连接在发送请求前超时。' };
  if (name === 'AbortError' || name === 'TimeoutError' || timeoutCode === 'UND_ERR_HEADERS_TIMEOUT' || timeoutCode === 'UND_ERR_BODY_TIMEOUT' || timeoutCode === 'ETIMEDOUT') {
    return { code: AI7_FAILURE_CODES.TRANSPORT_FAILED, message: '请求在发送前已中止，未发送任何内容。' };
  }
  return { code: AI7_FAILURE_CODES.TRANSPORT_FAILED, message: '模型服务传输失败。' };
}

export interface TransmitTicketSource {
  /** Take the single-use `transmit-remote` ticket the gate issued for this exact step, or `null`. */
  take(): TransmitTicket | null;
}

export interface DeepSeekTransportResponse {
  readonly status: number;
  json(): Promise<unknown>;
  /** Native fetch's SSE body; absent on the unchanged JSON transport. */
  readonly body?: ReadableStream<Uint8Array> | null;
  readonly headers?: { get(name: string): string | null };
  /** Dialogue-only parsed deltas followed by one JSON-equivalent aggregate. */
  stream?(): AsyncIterable<DialogueStreamEvent>;
  /**
   * Set only by a development validation transport whose Provider Result Cache answered (Issue #808): the body is a captured
   * response replayed, nothing was sent, and the turn incurred no usage — the usage the body records is the capture's own,
   * which the Provider Test Ledger keeps, so it is never reported as this Run's.
   */
  readonly replayed?: true;
}

export type DialogueStreamEvent =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'complete'; readonly response: unknown }
  /**
   * The service's refusal after it accepted the request (Issue #1180): the status the family's error names and the error
   * body in that family's buffered form. The request may have been processed and billed, so only an account limit reads
   * as itself; every other in-stream refusal is outcome-unknown and never resent on its own.
   */
  | { readonly kind: 'error'; readonly status: number; readonly body: unknown };


export type DeepSeekTransport = (
  url: string,
  init: { method: 'POST'; headers: Record<string, string>; body: string; signal?: AbortSignal },
) => Promise<DeepSeekTransportResponse>;

export interface DeepSeekAdapterDependencies {
  readonly transportSettings?: {
    readonly requestDeadlineSeconds: number;
    readonly rateLimitRetry: { readonly honourRetryAfter: boolean; readonly maxRetries: number };
  };
  readonly broker: CredentialBroker;
  readonly slotBinding: CredentialSlotBinding;
  readonly tickets: TransmitTicketSource;
  readonly attribution: () => Readonly<Record<string, string>>;
  readonly promptContractDigest: string;
  readonly codes: DshFailureCodes;
  /** Defaults to the global `fetch`, which the product interval denies. */
  readonly transport?: DeepSeekTransport;
  /** Recheck the consumer/source generation inside the broker callback, before transport admission. */
  readonly beforeSend?: () => void;
  /** Exact-call observation from inside the adapter, before any native sender was entered. */
  readonly onRequestNotSent?: () => void;
  /** The route this adapter serves; the unchanged production route when absent. */
  readonly profile?: ProviderRouteProfile;
  /** The model this adapter speaks to; the production model when absent. Must belong to the bound route. */
  readonly modelProfile?: ProviderModelProfile;
  /** The technical Session id of the turn in flight; required by a profile that sends the Session header. */
  readonly sessionId?: (request: GenerateOptions) => string;
  readonly requestShape?: 'editorial-dialogue-sse';
  /** The execution owner's pause/cancel signal; combined with the harness signal and request deadline. */
  readonly signal?: AbortSignal;
}

/** A replayed outcome as this turn incurred it: the same answer, and no usage spent sending it. */
function withoutIncurredUsage(outcome: ProviderResponseOutcome): ProviderResponseOutcome {
  if (!('usage' in outcome) || outcome.usage === null) return outcome;
  return { ...outcome, usage: { inputTokens: 0, outputTokens: 0 } } as ProviderResponseOutcome;
}

export class DeepSeekOpenAiCompatibleAdapter implements LlmAdapter {
  readonly #deps: DeepSeekAdapterDependencies;
  readonly #profile: ProviderRouteProfile;
  readonly #modelProfile: ProviderModelProfile;
  readonly #requestDigests: string[] = [];
  #transmissions = 0;
  #lastResult: CanonicalModelResult | null = null;
  #lastUsage: ModelUsage | null = null;
  #lastRetryDelayMs: number | null = null;
  #lastRequestNotSent = false;

  get lastUsage(): ModelUsage | null { return this.#lastUsage; }
  get lastRetryDelayMs(): number | null { return this.#lastRetryDelayMs; }
  /** Transport-local observation for the exact last request; server responses never set it. */
  get lastRequestNotSent(): boolean { return this.#lastRequestNotSent; }

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
    this.#lastRequestNotSent = false;
    this.#lastUsage = null;
    this.#lastRetryDelayMs = null;
    if (options.provider !== this.#profile.route || options.model !== this.#modelProfile.model) {
      this.#deps.onRequestNotSent?.();
      yield fail(AI7_FAILURE_CODES.INVALID_RESPONSE, '适配器只服务其绑定路由与模型。');
      return;
    }
    // Preflight: a demand this family or this model is not `supported` for is refused by name and never attempted.
    const refusal = providerPreflight(this.#modelProfile, { stream: this.#deps.requestShape === 'editorial-dialogue-sse', functionTools: (options.tools ?? []).length > 0 });
    if (refusal !== null) {
      this.#deps.onRequestNotSent?.();
      yield fail(AI7_FAILURE_CODES.INVALID_RESPONSE, refusal.message);
      return;
    }
    let assembly: DeepSeekRequestAssembly;
    try {
      assembly = assembleProviderRequest(this.#profile, this.#modelProfile, options, {
        attribution: this.#deps.attribution(),
        promptContractDigest: this.#deps.promptContractDigest,
        ...(this.#deps.sessionId === undefined ? {} : { sessionId: this.#deps.sessionId(options) }),
        ...(this.#deps.requestShape === undefined ? {} : { requestShape: this.#deps.requestShape }),
      });
    } catch {
      this.#deps.onRequestNotSent?.();
      yield fail(AI7_FAILURE_CODES.INVALID_RESPONSE, '无法为本步骤组装请求；未发送任何内容。');
      return;
    }
    this.#requestDigests.push(assembly.requestDigest);
    const ticket = this.#deps.tickets.take();
    if (ticket === null || ticket.bindingDigest !== this.#deps.slotBinding.bindingDigest) {
      this.#deps.onRequestNotSent?.();
      yield fail(AI7_FAILURE_CODES.TRANSMIT_TICKET_ABSENT, '没有本步骤的 transmit-remote 决定；未发送任何内容。');
      return;
    }
    let outcome: ProviderResponseOutcome;
    let streamed = '';
    let blockStarted = false;
    let sent = false;
    let transportRequest: Parameters<DeepSeekTransport>[1] | undefined;
    let responseStatus: number | undefined;
    const deadline = new AbortController();
    const timer = setTimeout(() => deadline.abort(new DOMException('模型请求超过时限。', 'TimeoutError')),
      this.#deps.transportSettings === undefined ? MODEL_REQUEST_DEADLINE_MS : this.#deps.transportSettings.requestDeadlineSeconds * 1000);
    const signal = AbortSignal.any([deadline.signal, ...(options.signal === undefined ? [] : [options.signal]),
      ...(this.#deps.signal === undefined ? [] : [this.#deps.signal])]);
    // The transport owns its send/cache settlement. Abort it through the signal and await its result so a possibly billed
    // request is durably held before the caller sees completion; racing ahead would leave a cache writer behind.
    try {
      const response: DeepSeekTransportResponse = await this.#deps.broker.releaseTo(this.#deps.slotBinding, ticket, async (secret) => {
        signal.throwIfAborted();
        this.#deps.beforeSend?.();
        // Live owners supply their captured transport explicitly. An uncomposed adapter has no
        // native sender: refuse here, where no-send is observed, without trusting an error's code
        // after some arbitrary transport has already been entered.
        const transport = this.#deps.transport;
        if (transport === undefined) throw Object.assign(new Error('出站网络在当前产品区间内被禁用。'), { code: AI7_FAILURE_CODES.NETWORK_DENIED });
        sent = true;
        this.#transmissions += 1;
        transportRequest = {
          method: assembly.method,
          headers: { ...assembly.headers, ...credentialHeaders(this.#profile, secret) },
          body: assembly.body,
          signal,
        };
        return transport(assembly.url, transportRequest);
      });
      responseStatus = response.status;
      let body: unknown = null;
      // An in-stream account limit is read under the status its error names; every other response under its own.
      let bodyStatus = response.status;
      const dialogueStream = this.#deps.requestShape === 'editorial-dialogue-sse';
      if (dialogueStream && response.status === 200 && response.replayed !== true) {
        let completed = false;
        // Nothing is yielded before the stream reads: a stop that ends this turn at any chunk then ends a stream already
        // reading, so the transmission still records its possibly billed request as unknown.
        for await (const event of response.stream?.() ?? familyStreamEvents(response, this.#modelProfile)) {
          if (event.kind === 'text') {
            if (!blockStarted) yield { type: 'block-start', index: 0, blockType: 'text' };
            blockStarted = true;
            streamed += event.text;
            yield { type: 'text-delta', index: 0, text: event.text };
          } else if (event.kind === 'error') {
            const refused = parseProviderResponse(event.status, event.body, this.#deps.codes, this.#profile, this.#modelProfile);
            if (refused.kind !== 'failure' || refused.code !== this.#deps.codes.QUOTA_EXCEEDED_CODE) throw new Error('AI7_OUTCOME_UNKNOWN');
            bodyStatus = event.status;
            body = event.body;
            completed = true;
          } else { body = event.response; completed = true; }
        }
        if (!completed) throw new Error('AI7_OUTCOME_UNKNOWN');
      } else {
        try {
          body = await response.json();
        } catch {
          // 结果待确认 (Issue #51, S16c): the service accepted the request and its answer never came back whole — the
          // connection dropped mid-answer, or what arrived does not read — so whether it was processed and billed cannot be
          // known. It is no failure to retry and no answer to read. A refusal's unreadable body is still that refusal.
          if (response.status === 200) {
            throw new Error('AI7_OUTCOME_UNKNOWN');
          }
          body = null;
        }
      }
      // Tool calls are read only for a request that offered tools (Issue #473); to any other the response reads as before.
      const shape = this.#modelProfile.capabilities.requestShape;
      const parsed = parseProviderResponse(bodyStatus, body, this.#deps.codes, this.#profile, this.#modelProfile,
        { toolCallsOffered: (options.tools ?? []).length > 0,
          ...(shape === 'anthropic-messages' || shape === 'google-generate-content'
            ? { offeredToolNames: (options.tools ?? []).map((tool) => tool.name) } : {}),
          ...(shape === 'google-generate-content' ? { callIdSeed: assembly.requestDigest.slice(0, 16) } : {}),
        });
      outcome = response.replayed === true ? withoutIncurredUsage(parsed) : parsed;
      if (outcome.kind === 'failure' && this.#profile.limitPolicy === 'rate-limit-retryable' &&
          (outcome.code === AI7_FAILURE_CODES.RATE_LIMIT || (outcome.code === AI7_FAILURE_CODES.PROVIDER_ERROR && outcome.status >= 500 && outcome.status <= 599))) {
        this.#lastRetryDelayMs = retryBackoffMs(response.headers?.get('retry-after') ?? null);
      }
    } catch (error) {
      this.#lastRequestNotSent = !sent || error instanceof Error && MODEL_REQUEST_NO_SEND.get(error)?.request === transportRequest;
      if (this.#lastRequestNotSent) this.#deps.onRequestNotSent?.();
      const classified = error instanceof Error && error.message === 'AI7_OUTCOME_UNKNOWN'
        ? { code: AI7_FAILURE_CODES.OUTCOME_UNKNOWN, message: '模型服务已接受请求，但回答没有完整传回。' }
        : classifyTransportError(signal.aborted && !(error instanceof Error && MODEL_REQUEST_NO_SEND.get(error)?.request === transportRequest)
          ? new DOMException('请求已中止。', deadline.signal.aborted ? 'TimeoutError' : 'AbortError') : error, sent, transportRequest);
      yield fail(classified.code, classified.message, classified.code === AI7_FAILURE_CODES.OUTCOME_UNKNOWN ? responseStatus : undefined);
      return;
    } finally {
      clearTimeout(timer);
    }
    this.#lastUsage = 'usage' in outcome ? outcome.usage ?? null : null;
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
    if (outcome.kind === 'tool-calls') {
      // The reasoning and the text the model wrote beside its calls, then each call as one assembled block, in order; the
      // loop executes them, and the reasoning travels back with the calls in the next request.
      let index = 0;
      if (outcome.reasoningText !== null) {
        yield { type: 'block-start', index, blockType: 'reasoning' };
        yield { type: 'reasoning-delta', index, text: outcome.reasoningText };
        yield { type: 'block-end', index, block: { type: 'reasoning', text: outcome.reasoningText } };
        index += 1;
      }
      if (outcome.text.length > 0) {
        yield { type: 'block-start', index, blockType: 'text' };
        yield { type: 'text-delta', index, text: outcome.text };
        yield { type: 'block-end', index, block: { type: 'text', text: outcome.text } };
        index += 1;
      }
      for (const call of outcome.calls) {
        const id = call.id as CallId;
        yield { type: 'block-start', index, blockType: 'tool-call' };
        yield { type: 'tool-call-delta', index, id, name: call.name, argumentsDelta: call.arguments };
        yield { type: 'block-end', index, block: { type: 'tool-call', id, name: call.name, arguments: call.arguments } };
        index += 1;
      }
      if (outcome.usage !== null) yield { type: 'usage', usage: { ...outcome.usage } };
      yield { type: 'finish', reason: { kind: 'tool-calls' } };
      return;
    }
    // An empty answer streams exactly what it streamed before — the harness composition and every
    // Journey above it see an unchanged event shape — and the fact that the answer channel was empty
    // travels out of band, where a string cannot lose it.
    const text = outcome.kind === 'answer' ? outcome.text : '';
    if (!blockStarted) yield { type: 'block-start', index: 0, blockType: 'text' };
    if (streamed.length === 0) yield { type: 'text-delta', index: 0, text };
    yield { type: 'block-end', index: 0, block: { type: 'text', text } };
    if (outcome.usage !== null) yield { type: 'usage', usage: { ...outcome.usage } };
    yield { type: 'finish', reason: { kind: 'stop' } };
  }
}
