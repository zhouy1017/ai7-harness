import type { CallId, GenerateOptions, LlmAdapter, LlmProviderInfo, LlmResolvedModelInfo, StreamChunk } from '@deepseek-ai/dsh-llm';
import { canonicalJson, isRecord, sha256Hex } from '../analysis/canonical.js';
import { DIALOGUE_PROMPT_CONTRACT, DIALOGUE_PROMPT_CONTRACT_DIGEST, DIALOGUE_RETRIEVAL_PROMPT_CONTRACT, DIALOGUE_RETRIEVAL_PROMPT_CONTRACT_DIGEST, parseDialogueMessage } from '../dialogue/contract.js';
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
  DEEPSEEK_V4_PRO_PROFILE,
  type CapabilityEvidence,
  type ProviderModelProfile,
} from './model-profile.js';
import { assistantToolCalls, messageText, toolResultOf, type AssembledModelPayload } from './payload.js';
import { GENERATED_ROUTE_PROFILES } from './provider-profiles.generated.js';
import { LOCAL_TOOL_NAMES, LOCAL_TOOL_SCHEMAS, toolSetEqualsPlatformSchemas } from './platform-tools.js';
import { normalizeModelResponse, type CanonicalModelResult, type NormalizeOptions } from './response-normalization.js';

/**
 * The AI7-owned Provider adapter, revision 1. One adapter serves every remote route and all four
 * implemented request shapes, composed from two profiles: a **route profile** — endpoint, credential
 * slot, header policy, limit reading, output cap — says how to reach a model, and a **model profile**
 * (`./model-profile.ts`) says how to speak to one. They are separate because one route serves many
 * models, so a model's capabilities cannot hang off the route that carries it.
 * Every route profile is generated from the provider documents under `config/providers/` (ADR 0073
 * §2, Issue #435): the endpoint, the credential slot and its header form, the limit reading and the
 * output cap are configuration, never constants of this module. `deepseek-open-platform` is the
 * unchanged production route (model `deepseek-v4-pro`, thinking enabled at high reasoning effort).
 * `opencode-go` is the developer-live route of Provider Processing v9 (bare model id
 * `deepseek-v4.1-flash`, a standard chat-completions body with no DeepSeek-specific parameters, and the
 * technical Session id in `x-opencode-session` for the gateway's prompt cache). Every other
 * configured route — the Go plan's `/messages` and `/responses` paths and every provider document's
 * route — is declared and inert: no Provider Resolution Plan may bind it (`ExecutionRoute` in
 * `./egress-gate.ts`) until a Provider Processing revision names its exact binding.
 *
 * No route exposes provider-native tools. The adapter assembles a deterministic request from the
 * frozen prompt contract, records the request digest, and transmits only after a `transmit-remote`
 * decision the gate issued for the same binding. The credential enters only the one header the route's
 * declared form names, inside the broker's release callback; the assembled request and its digest
 * never contain it.
 */
export const DEEPSEEK_ADAPTER_REVISION = 1 as const;
export const DEEPSEEK_CONFIGURATION_REVISION = 1 as const;
export const DEEPSEEK_REASONING_EFFORT = 'high' as const;
/** The opaque per-request Session header the gateway uses for prompt caching; it carries the Session id and nothing else. */
export const OPENCODE_GO_SESSION_HEADER = 'x-opencode-session' as const;
/** The specific User-Agent the developer-live route sends: the product and the trusted scope, no host or user detail. */
export const OPENCODE_GO_USER_AGENT = 'AI7-Harness/1.0 (developer-live)' as const;
/** The method the generateContent shape appends to the model id it addresses in the path. */
const GOOGLE_GENERATE_CONTENT_METHOD = ':generateContent' as const;
/** A model id that stands in a URL path segment as it is written; the shape that addresses one refuses anything else. */
const URL_ADDRESSABLE_MODEL_ID = /^[A-Za-z0-9._-]+$/u;

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
  const tools = payload.tools ?? [];
  // Function tools travel only for a model whose profile declares `toolCalling: 'function'` with evidence (ADR 0080 §2);
  // every other model refuses to assemble a payload that carries them, so nothing is sent (Issue #473).
  const toolCalling = model.capabilities.toolCalling === 'function';
  if (tools.length > 0 && !toolCalling) throw new Error('PROVIDER_TOOL_CALLING_UNSUPPORTED');
  const system = systemPromptOf(payload);
  const conversation = toolCalling ? chatCompletionsConversation(payload) : conversationMessages(payload);
  const messages = system === null ? conversation : [{ role: 'system', content: system }, ...conversation];
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
    // The same rule for tools: a payload without tools sends no `tools` key, so no request that carries none moves a byte.
    ...(tools.length > 0 ? { tools: tools.map(chatCompletionsTool) } : {}),
  });
}

/** One function tool in the chat-completions spelling: `{ type: 'function', function: { name, description, parameters } }`. */
function chatCompletionsTool(tool: unknown): { type: 'function'; function: { name: string; description: string; parameters: unknown } } {
  if (!isRecord(tool) || typeof tool.name !== 'string' || typeof tool.description !== 'string' || !isRecord(tool.parameters)) {
    throw new Error('PROVIDER_TOOL_SCHEMA_INVALID');
  }
  return { type: 'function', function: { name: tool.name, description: tool.description, parameters: tool.parameters } };
}

/**
 * The chat-completions conversation of a tool-calling model (Issue #473): every text message exactly as
 * `conversationMessages` writes it, an assistant tool-call message as `{ role: 'assistant', content, tool_calls }`, and a
 * tool result as `{ role: 'tool', tool_call_id, content }`. Anything else refuses, as it does for every other model.
 */
function chatCompletionsConversation(payload: AssembledModelPayload): Array<Record<string, unknown>> {
  const messages: Array<Record<string, unknown>> = [];
  for (const message of payload.messages) {
    const calls = assistantToolCalls(message);
    if (calls !== null) {
      messages.push({
        role: 'assistant',
        content: calls.text.length > 0 ? calls.text : null,
        ...(calls.reasoning.length > 0 ? { reasoning_content: calls.reasoning } : {}),
        tool_calls: calls.calls.map((call) => ({ id: call.id, type: 'function', function: { name: call.name, arguments: call.arguments } })),
      });
      continue;
    }
    const result = toolResultOf(message);
    if (result !== null) {
      messages.push({ role: 'tool', tool_call_id: result.callId, content: result.text });
      continue;
    }
    const text = messageText(message);
    if (text === null) throw new Error('DEEPSEEK_REQUEST_NON_TEXT_CONTENT');
    if (message.role !== 'user' && message.role !== 'assistant') throw new Error('DEEPSEEK_REQUEST_ROLE_INVALID');
    messages.push({ role: message.role, content: text });
  }
  return messages;
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
 * The OpenAI Responses text/function body, rechecked against the official function-calling guide and
 * Create Response reference on 2026-10-22 (Issue #1038):
 * https://developers.openai.com/api/docs/guides/function-calling
 * https://developers.openai.com/api/reference/resources/responses/methods/create
 * Flat functions explicitly retain non-strict schemas; call_id correlates calls and outputs.
 *
 * Two facts of this shape are worth stating where they are implemented. The system prompt is the
 * top-level `instructions` and never an input item — the third spelling of the one thing the
 * `AssembledModelPayload` carries, and the third time nothing above the adapter learns which. And
 * `max_output_tokens` is *optional* here, unlike the mandatory `max_tokens` of the shape before it,
 * so the route's declaration decides: a number sends the field, `null` sends nothing, and no cap is
 * invented for a route that declares none.
 *
 * This shape has mechanisms of its own for the two capabilities that refuse here —
 * `text.format: { type: 'json_object' }` for a required JSON answer and `reasoning.effort` for
 * reasoning control. They are named as the documented spellings for the live item that first needs
 * one, and neither is assembled: the spellings this adapter implements are the chat-completions
 * ones, so a profile declaring either on this shape refuses rather than sending a field on a guess.
 */
function openaiResponsesBody(
  profile: ProviderRouteProfile,
  model: ProviderModelProfile,
  payload: AssembledModelPayload,
): string {
  if (model.capabilities.structuredOutput !== 'none') throw new Error('PROVIDER_STRUCTURED_OUTPUT_UNSUPPORTED');
  if (model.capabilities.reasoningControl !== 'none') throw new Error('PROVIDER_REASONING_CONTROL_UNSUPPORTED');
  const tools = payload.tools ?? [];
  const toolCalling = model.capabilities.toolCalling === 'function';
  if (tools.length > 0 && !toolCalling) throw new Error('PROVIDER_TOOL_CALLING_UNSUPPORTED');
  const instructions = systemPromptOf(payload);
  return canonicalJson({
    model: model.model,
    ...(instructions === null ? {} : { instructions }),
    input: toolCalling ? openaiResponsesConversation(payload) : conversationMessages(payload),
    ...(profile.maxOutputTokens === null ? {} : { max_output_tokens: profile.maxOutputTokens }),
    // Responses defaults can tighten the existing schemas; retain their non-strict semantics explicitly.
    ...(tools.length > 0 ? { tools: tools.map((tool) => ({ type: 'function', ...chatCompletionsTool(tool).function, strict: false })) } : {}),
  });
}

/** Text and function items only; opaque Responses reasoning cannot round-trip through this payload. */
function openaiResponsesConversation(payload: AssembledModelPayload): Array<Record<string, unknown>> {
  const items: Array<Record<string, unknown>> = [];
  for (const message of payload.messages) {
    const calls = assistantToolCalls(message);
    if (calls !== null) {
      if (message.content.some((block) => block.type === 'reasoning')) throw new Error('PROVIDER_REASONING_CONTINUATION_UNSUPPORTED');
      if (calls.text.length > 0) items.push({ role: 'assistant', content: calls.text });
      for (const call of calls.calls) {
        items.push({ type: 'function_call', call_id: call.id, name: call.name, arguments: call.arguments });
      }
      continue;
    }
    const result = toolResultOf(message);
    if (result !== null) {
      items.push({ type: 'function_call_output', call_id: result.callId, output: result.text });
      continue;
    }
    const text = messageText(message);
    if (text === null) throw new Error('DEEPSEEK_REQUEST_NON_TEXT_CONTENT');
    if (message.role !== 'user' && message.role !== 'assistant') throw new Error('DEEPSEEK_REQUEST_ROLE_INVALID');
    items.push({ role: message.role, content: text });
  }
  return items;
}

/**
 * The generateContent body, from Google's published SDK contract read on 2026-09-08 — the source of
 * record is `googleapis/js-genai` `src/types.ts` at commit
 * `3e1d923ef914812c1d209aa2e5461a717d03a081` (2026-08-31), with the method and path from
 * `https://ai.google.dev/api/generate-content`. The body is
 * `{ systemInstruction?, contents, generationConfig? }`.
 *
 * Three facts of this shape are worth stating where they are implemented. The system prompt is the
 * top-level `systemInstruction` with one text part and never a `contents` entry — the fourth spelling
 * of the one thing the `AssembledModelPayload` carries. The roles are this shape's own: `assistant`
 * is `model` here, mapped in this arm alone so that `conversationMessages` keeps saying what every
 * other shape means by a turn. And `generationConfig` travels only when the route declares something
 * to put in it, exactly as the optional cap of the shape before it does, so a route declaring `null`
 * sends no such key at all.
 *
 * The model id is not in the body: this shape addresses it in the URL, which `providerRequestUrl`
 * derives. The credential is not here either, and unlike the three shapes before it this endpoint
 * takes it in `x-goog-api-key` rather than `authorization: Bearer`
 * (`https://ai.google.dev/gemini-api/docs/api-key`, read the same day). The `google-gemini` provider
 * document declares that form, and `credentialHeaders` sends it; the route is inert and binds nothing
 * until the shape review its document records.
 *
 * Structured output and reasoning control refuse, as they do on the two shapes before it. This shape
 * spells them `generationConfig.responseMimeType: 'application/json'` with `responseSchema`, and
 * `generationConfig.thinkingConfig`; they are named as the documented spellings for the live item
 * that first needs one, and neither is assembled. Nothing else travels either — no `safetySettings`,
 * no `tools`, no `temperature`.
 */
function googleGenerateContentBody(
  profile: ProviderRouteProfile,
  model: ProviderModelProfile,
  payload: AssembledModelPayload,
): string {
  if (model.capabilities.structuredOutput !== 'none') throw new Error('PROVIDER_STRUCTURED_OUTPUT_UNSUPPORTED');
  if (model.capabilities.reasoningControl !== 'none') throw new Error('PROVIDER_REASONING_CONTROL_UNSUPPORTED');
  const systemInstruction = systemPromptOf(payload);
  return canonicalJson({
    contents: conversationMessages(payload).map((message) => ({
      role: message.role === 'assistant' ? 'model' : message.role,
      parts: [{ text: message.content }],
    })),
    ...(systemInstruction === null ? {} : { systemInstruction: { parts: [{ text: systemInstruction }] } }),
    ...(profile.maxOutputTokens === null ? {} : { generationConfig: { maxOutputTokens: profile.maxOutputTokens } }),
  });
}

/**
 * The body of one request, chosen by the declared request shape and by nothing else — no route,
 * model id, or endpoint is consulted, which is what makes a model behind a second or third vendor's
 * endpoint a row in the profile table rather than a branch above the provider layer.
 *
 * All three shapes ADR 0067 documents behind the Go gateway's paths are implemented as of this
 * revision, and the fourth beside them, and the `default` still stands: a profile is data, so the
 * union cannot rule out at runtime a shape that no profile in the table declares.
 */
function providerRequestBody(
  profile: ProviderRouteProfile,
  model: ProviderModelProfile,
  payload: AssembledModelPayload,
): string {
  // Function tools are spelled only for chat completions and the text/function Responses subset; other shapes refuse them
  // rather than dropping them silently.
  if ((payload.tools ?? []).length > 0 && model.capabilities.requestShape !== 'openai-chat-completions' &&
      model.capabilities.requestShape !== 'openai-responses') {
    throw new Error('PROVIDER_TOOL_CALLING_UNSUPPORTED');
  }
  switch (model.capabilities.requestShape) {
    case 'openai-chat-completions': return chatCompletionsBody(model, payload);
    case 'anthropic-messages': return anthropicMessagesBody(profile, model, payload);
    case 'openai-responses': return openaiResponsesBody(profile, model, payload);
    case 'google-generate-content': return googleGenerateContentBody(profile, model, payload);
    default: throw new Error('PROVIDER_REQUEST_SHAPE_UNSUPPORTED');
  }
}

/**
 * The URL of one request: the route's endpoint, except on the one shape that addresses the model in
 * the path instead of naming it in the body. There the route's `endpoint` is the models collection
 * — `https://generativelanguage.googleapis.com/v1beta/models` for the official service — and the
 * method is appended to the id, which is the whole of what the shape's REST contract asks for
 * (`POST .../{model=models/*}:generateContent`). No route-profile field is added for it: a route
 * already says where it is reached, and this shape reads that one field differently.
 *
 * A model id that cannot stand in a path segment refuses rather than being escaped into one. Percent
 * encoding an id would send a request for a model nobody declared, and a declared id that needs
 * encoding is a row this table should not have; the check is scoped to this shape because on the
 * three where the id is a body field it is a string like any other, and refusing there would move
 * requests that are pinned byte for byte.
 */
function providerRequestUrl(profile: ProviderRouteProfile, model: ProviderModelProfile): string {
  if (model.capabilities.requestShape !== 'google-generate-content') return profile.endpoint;
  if (!URL_ADDRESSABLE_MODEL_ID.test(model.model)) throw new Error('PROVIDER_MODEL_ID_UNADDRESSABLE');
  return `${profile.endpoint}/${model.model}${GOOGLE_GENERATE_CONTENT_METHOD}`;
}

/** A /2 dialogue carries its one admitted question followed only by complete local function-call rounds. */
function isRetrievalDialogue(payload: AssembledModelPayload): boolean {
  const first = payload.messages[0];
  if (payload.system !== DIALOGUE_RETRIEVAL_PROMPT_CONTRACT.systemPrompt ||
    !toolSetEqualsPlatformSchemas(payload.tools ?? [], LOCAL_TOOL_SCHEMAS) || first?.role !== 'user' ||
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

/**
 * Assemble one request. The header set comes from the route profile, the body from the model
 * profile's declared capabilities, and nothing is read from anywhere else — which is what makes a
 * new model a new row in the profile table rather than a new branch here.
 */
export function assembleProviderRequest(
  profile: ProviderRouteProfile,
  model: ProviderModelProfile,
  payload: AssembledModelPayload,
  context: ProviderRequestContext,
): DeepSeekRequestAssembly {
  if (model.route !== profile.route) throw new Error('PROVIDER_MODEL_ROUTE_MISMATCH');
  // The address before the payload: a model that cannot be reached has no request to assemble.
  const url = providerRequestUrl(profile, model);
  let body = providerRequestBody(profile, model, payload);
  const dialogueStream = context.requestShape === 'editorial-dialogue-sse';
  if (dialogueStream) {
    const message = payload.messages[0];
    const predecessor = context.promptContractDigest === DIALOGUE_PROMPT_CONTRACT_DIGEST &&
      payload.system === DIALOGUE_PROMPT_CONTRACT.systemPrompt && payload.messages.length === 1 &&
      message?.role === 'user' && parseDialogueMessage(messageText(message) ?? '') !== null && (payload.tools ?? []).length === 0;
    const retrieval = context.promptContractDigest === DIALOGUE_RETRIEVAL_PROMPT_CONTRACT_DIGEST && isRetrievalDialogue(payload);
    if (profile.route !== OPENCODE_GO_ROUTE || model.capabilities.requestShape !== 'openai-chat-completions' ||
      model.capabilities.streaming !== 'chat-completions-sse' ||
      (!predecessor && !retrieval)) throw new Error('PROVIDER_DIALOGUE_STREAM_SHAPE_INVALID');
    body = canonicalJson({ ...JSON.parse(body), stream: true, stream_options: { include_usage: true } });
  }
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
  return normalizeModelResponse(model, body, options);
}

/** Classify a transport-level rejection (network denial, abort, other) into failure facts. */
export function classifyTransportError(error: unknown): { code: string; message: string } {
  const code = isRecord(error) && typeof error.code === 'string' ? error.code : null;
  const name = isRecord(error) && typeof error.name === 'string' ? error.name : null;
  if (code === 'AI7_PROXY_UNREACHABLE') return { code, message: '代理不可达：请检查网络代理设置。' };
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
  | { readonly kind: 'complete'; readonly response: unknown };

/**
 * Read the chat-completions SSE wire without exposing reasoning. UTF-8 and event boundaries may fall
 * anywhere in a network chunk. Only [DONE] after a finish marker proves a whole response; EOF,
 * malformed data and an aborted reader remain outcome-unknown (Issue #833).
 */
export async function* dialogueSseEvents(response: DeepSeekTransportResponse, model: string): AsyncIterable<DialogueStreamEvent> {
  if (response.body == null || !response.headers?.get('content-type')?.toLowerCase().startsWith('text/event-stream')) {
    throw new Error('AI7_OUTCOME_UNKNOWN');
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let pending = '';
  let content = '';
  let finish: string | null = null;
  let usage: unknown = null;
  let done = false;
  const calls = new Map<number, { id: string; type: string; name: string; arguments: string }>();
  let callBytes = 0;
  const readEvent = (event: string): DialogueStreamEvent | null => {
    const data = event.split(/\r?\n/u).filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).replace(/^ /u, '')).join('\n');
    if (data.length === 0) return null;
    if (data === '[DONE]') {
      if (finish === null) throw new Error('AI7_OUTCOME_UNKNOWN');
      const toolCalls = [...calls.entries()].sort(([a], [b]) => a - b).map(([index, call], ordinal) => {
        if (index !== ordinal || call.id.length === 0 || call.type !== 'function' || call.name.length === 0) throw new Error('AI7_OUTCOME_UNKNOWN');
        return { id: call.id, type: call.type, function: { name: call.name, arguments: call.arguments } };
      });
      if ((toolCalls.length > 0) !== (finish === 'tool_calls') || new Set(toolCalls.map((call) => call.id)).size !== toolCalls.length) throw new Error('AI7_OUTCOME_UNKNOWN');
      done = true;
      return { kind: 'complete', response: { model, choices: [{ message: { content, ...(toolCalls.length === 0 ? {} : { tool_calls: toolCalls }) }, finish_reason: finish }], usage } };
    }
    const value: unknown = JSON.parse(data);
    if (!isRecord(value) || (value.model !== undefined && value.model !== model) || !Array.isArray(value.choices)) {
      throw new Error('AI7_OUTCOME_UNKNOWN');
    }
    if (value.usage !== undefined && value.usage !== null) usage = value.usage;
    if (value.choices.length === 0) return null;
    if (value.choices.length !== 1 || !isRecord(value.choices[0])) throw new Error('AI7_OUTCOME_UNKNOWN');
    const choice = value.choices[0];
    if (choice.index !== undefined && choice.index !== 0) throw new Error('AI7_OUTCOME_UNKNOWN');
    const alreadyFinished = finish !== null;
    if (choice.finish_reason !== undefined && choice.finish_reason !== null) {
      if (typeof choice.finish_reason !== 'string') throw new Error('AI7_OUTCOME_UNKNOWN');
      finish = choice.finish_reason;
    }
    if (!isRecord(choice.delta)) throw new Error('AI7_OUTCOME_UNKNOWN');
    if (choice.delta.tool_calls !== undefined) {
      if (alreadyFinished || !Array.isArray(choice.delta.tool_calls)) throw new Error('AI7_OUTCOME_UNKNOWN');
      for (const delta of choice.delta.tool_calls) {
        if (!isRecord(delta) || typeof delta.index !== 'number' || !Number.isSafeInteger(delta.index) || delta.index < 0 || delta.index >= 128) throw new Error('AI7_OUTCOME_UNKNOWN');
        const index = delta.index;
        const call = calls.get(index) ?? { id: '', type: '', name: '', arguments: '' };
        for (const key of ['id', 'type'] as const) {
          if (delta[key] === undefined) continue;
          if (typeof delta[key] !== 'string' || call[key].length > 0) throw new Error('AI7_OUTCOME_UNKNOWN');
          call[key] = delta[key];
          callBytes += delta[key].length;
        }
        if (delta.function !== undefined) {
          if (!isRecord(delta.function)) throw new Error('AI7_OUTCOME_UNKNOWN');
          for (const key of ['name', 'arguments'] as const) {
            const fragment = delta.function[key];
            if (fragment === undefined) continue;
            if (typeof fragment !== 'string') throw new Error('AI7_OUTCOME_UNKNOWN');
            call[key] += fragment;
            callBytes += fragment.length;
          }
        }
        if (callBytes > 1024 * 1024) throw new Error('AI7_OUTCOME_UNKNOWN');
        calls.set(index, call);
      }
    }
    const text = choice.delta.content;
    if (text === undefined || text === null || text === '') return null;
    if (typeof text !== 'string' || alreadyFinished) throw new Error('AI7_OUTCOME_UNKNOWN');
    content += text;
    return { kind: 'text', text };
  };
  try {
    while (!done) {
      const chunk = await reader.read();
      pending += chunk.done ? decoder.decode() : decoder.decode(chunk.value, { stream: true });
      if (pending.length > 1024 * 1024) throw new Error('AI7_OUTCOME_UNKNOWN');
      let boundary: RegExpExecArray | null;
      while ((boundary = /\r?\n\r?\n/u.exec(pending)) !== null) {
        const event = readEvent(pending.slice(0, boundary.index));
        pending = pending.slice(boundary.index + boundary[0].length);
        if (event !== null) yield event;
        if (done) break;
      }
      if (chunk.done && !done) throw new Error('AI7_OUTCOME_UNKNOWN');
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error;
    throw new Error('AI7_OUTCOME_UNKNOWN');
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
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
  readonly requestShape?: 'editorial-dialogue-sse';
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
        ...(this.#deps.requestShape === undefined ? {} : { requestShape: this.#deps.requestShape }),
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
    let streamed = '';
    let blockStarted = false;
    try {
      const response: DeepSeekTransportResponse = await this.#deps.broker.releaseTo(this.#deps.slotBinding, ticket, async (secret) => {
        this.#transmissions += 1;
        const transport = this.#deps.transport ?? ((url, init) => fetch(url, init));
        return transport(assembly.url, {
          method: assembly.method,
          headers: { ...assembly.headers, ...credentialHeaders(this.#profile, secret) },
          body: assembly.body,
          ...(options.signal === undefined ? {} : { signal: options.signal }),
        });
      });
      let body: unknown = null;
      const dialogueStream = this.#deps.requestShape === 'editorial-dialogue-sse';
      if (dialogueStream && response.status === 200 && response.replayed !== true) {
        let completed = false;
        // Nothing is yielded before the stream reads: a stop that ends this turn at any chunk then ends a stream already
        // reading, so the transmission still records its possibly billed request as unknown.
        for await (const event of response.stream?.() ?? dialogueSseEvents(response, this.#modelProfile.model)) {
          if (event.kind === 'text') {
            if (!blockStarted) yield { type: 'block-start', index: 0, blockType: 'text' };
            blockStarted = true;
            streamed += event.text;
            yield { type: 'text-delta', index: 0, text: event.text };
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
      const parsed = parseProviderResponse(response.status, body, this.#deps.codes, this.#profile, this.#modelProfile,
        { toolCallsOffered: (options.tools ?? []).length > 0 });
      outcome = response.replayed === true ? withoutIncurredUsage(parsed) : parsed;
    } catch (error) {
      const classified = error instanceof Error && error.message === 'AI7_OUTCOME_UNKNOWN'
        ? { code: AI7_FAILURE_CODES.OUTCOME_UNKNOWN, message: '模型服务已接受请求，但回答没有完整传回。' }
        : classifyTransportError(error);
      yield fail(classified.code, classified.message, classified.code === AI7_FAILURE_CODES.OUTCOME_UNKNOWN ? 200 : undefined);
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
