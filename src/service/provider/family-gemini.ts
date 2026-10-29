import { canonicalJson, isRecord } from '../analysis/canonical.js';
import type { DeepSeekTransportResponse, DialogueStreamEvent, ProviderRouteProfile } from './deepseek-adapter.js';
import { conversationMessages, strictFunctionTools, systemPromptOf } from './family-payload.js';
import type { ProviderModelProfile } from './model-profile.js';
import { assistantToolCalls, messageText, toolResultOf, type AssembledModelPayload } from './payload.js';
import { sseFrames, streamFailure } from './stream-frames.js';

/** The methods the generateContent family appends to the model id it addresses in the path. */
const GENERATE_CONTENT_METHOD = ':generateContent' as const;
const STREAM_GENERATE_CONTENT_METHOD = ':streamGenerateContent?alt=sse' as const;
/** A model id that stands in a URL path segment as it is written; the shape that addresses one refuses anything else. */
const URL_ADDRESSABLE_MODEL_ID = /^[A-Za-z0-9._-]+$/u;
/**
 * The id AI7 gives a function call the service returned without one (Issue #1180): Gemini's `functionCall.id` is
 * optional, and the platform-tool session correlates by id. A call whose id carries this prefix was named by AI7, so its
 * `functionResponse` is sent by name alone; a provider-issued id is sent back as it came.
 */
export const GEMINI_SYNTHETIC_CALL_PREFIX = 'gemini-call-' as const;

/**
 * The Gemini generateContent family, from Google's published SDK contract read on 2026-09-08 — the source of record is
 * `googleapis/js-genai` `src/types.ts` at commit `3e1d923ef914812c1d209aa2e5461a717d03a081` (2026-08-31), with the method
 * and path from `https://ai.google.dev/api/generate-content` — and its function declarations and stream (Issue #1180).
 * The body is `{ systemInstruction?, contents, generationConfig?, tools? }`.
 *
 * The system prompt is the top-level `systemInstruction` with one text part and never a `contents` entry. `assistant` is
 * `model` here, mapped in this arm alone. `generationConfig` travels only when the route declares a cap. The model id is
 * not in the body: this shape addresses it in the URL. Function tools travel as one `functionDeclarations` tool whose
 * schemas are the payload's JSON Schemas as `parametersJsonSchema`; structured output and reasoning control refuse, as on
 * the two shapes before it.
 */
export function googleGenerateContentBody(profile: ProviderRouteProfile, model: ProviderModelProfile, payload: AssembledModelPayload): string {
  if (model.capabilities.structuredOutput !== 'none') throw new Error('PROVIDER_STRUCTURED_OUTPUT_UNSUPPORTED');
  if (model.capabilities.reasoningControl !== 'none') throw new Error('PROVIDER_REASONING_CONTROL_UNSUPPORTED');
  const toolCalling = model.capabilities.toolCalling === 'function';
  if ((payload.tools ?? []).length > 0 && !toolCalling) throw new Error('PROVIDER_TOOL_CALLING_UNSUPPORTED');
  const tools = strictFunctionTools(payload, 64);
  const systemInstruction = systemPromptOf(payload);
  return canonicalJson({
    contents: toolCalling ? geminiConversation(payload, tools.map((tool) => tool.name)) : conversationMessages(payload).map((message) => ({
      role: message.role === 'assistant' ? 'model' : message.role,
      parts: [{ text: message.content }],
    })),
    ...(systemInstruction === null ? {} : { systemInstruction: { parts: [{ text: systemInstruction }] } }),
    ...(profile.maxOutputTokens === null ? {} : { generationConfig: { maxOutputTokens: profile.maxOutputTokens } }),
    ...(tools.length > 0 ? { tools: [{ functionDeclarations: tools.map(({ name, description, parameters }) =>
      ({ name, description, parametersJsonSchema: parameters })) }] } : {}),
  });
}

/**
 * The URL of one request on this shape: the route's `endpoint` is the models collection, and the method is appended to
 * the id — `:streamGenerateContent?alt=sse` for the streamed variant. A model id that cannot stand in a path segment
 * refuses rather than being escaped into one: percent encoding an id would send a request for a model nobody declared.
 */
export function googleGenerateContentUrl(profile: ProviderRouteProfile, model: ProviderModelProfile, stream: boolean): string {
  if (!URL_ADDRESSABLE_MODEL_ID.test(model.model)) throw new Error('PROVIDER_MODEL_ID_UNADDRESSABLE');
  return `${profile.endpoint}/${model.model}${stream ? STREAM_GENERATE_CONTENT_METHOD : GENERATE_CONTENT_METHOD}`;
}

/**
 * The conversation of a function-calling model: text turns as the text-only shape writes them, a call turn as one `model`
 * entry of its leading text and `functionCall` parts, and exactly the results of that batch, in order, as the next `user`
 * entry of `functionResponse` parts. Reasoning cannot travel back — Gemini's thought signatures are opaque — so a call
 * turn carrying any refuses, and an orphan or out-of-order result refuses as on the Messages shape.
 */
function geminiConversation(payload: AssembledModelPayload, offeredNames: ReadonlyArray<string>): Array<Record<string, unknown>> {
  const contents: Array<Record<string, unknown>> = [];
  for (let index = 0; index < payload.messages.length; index += 1) {
    const message = payload.messages[index]!;
    const calls = assistantToolCalls(message);
    if (calls !== null) {
      if (calls.reasoning.length > 0 || message.content.some((block) => block.type === 'reasoning')) throw new Error('PROVIDER_REASONING_CONTINUATION_UNSUPPORTED');
      const parts: Array<Record<string, unknown>> = calls.text.length > 0 ? [{ text: calls.text }] : [];
      const pending = new Map<string, string>();
      for (const call of calls.calls) {
        let args: unknown;
        try { args = JSON.parse(call.arguments) as unknown; } catch { throw new Error('PROVIDER_TOOL_CALLS_INVALID'); }
        if (!isRecord(args) || !offeredNames.includes(call.name) || pending.has(call.id)) throw new Error('PROVIDER_TOOL_CALLS_INVALID');
        pending.set(call.id, call.name);
        parts.push({ functionCall: { name: call.name, args, ...(providerIssued(call.id) ? { id: call.id } : {}) } });
      }
      contents.push({ role: 'model', parts });
      const responses: Array<Record<string, unknown>> = [];
      while (pending.size > 0) {
        index += 1;
        const next = payload.messages[index];
        const result = next === undefined ? null : toolResultOf(next);
        const name = result === null ? undefined : pending.get(result.callId);
        if (result === null || name === undefined) throw new Error('PROVIDER_TOOL_CORRELATION_INVALID');
        pending.delete(result.callId);
        responses.push({ functionResponse: { name, response: result.isError ? { error: result.text } : { output: result.text },
          ...(providerIssued(result.callId) ? { id: result.callId } : {}) } });
      }
      contents.push({ role: 'user', parts: responses });
      continue;
    }
    if (message.source.kind === 'tool' || message.content.some((block) => block.type === 'tool-result')) throw new Error('PROVIDER_TOOL_CORRELATION_INVALID');
    const text = messageText(message);
    if (text === null) throw new Error('DEEPSEEK_REQUEST_NON_TEXT_CONTENT');
    if (message.role !== 'user' && message.role !== 'assistant') throw new Error('DEEPSEEK_REQUEST_ROLE_INVALID');
    contents.push({ role: message.role === 'assistant' ? 'model' : message.role, parts: [{ text }] });
  }
  return contents;
}

function providerIssued(callId: string): boolean {
  return !callId.startsWith(GEMINI_SYNTHETIC_CALL_PREFIX);
}

/**
 * Read the generateContent SSE wire (`alt=sse`): every frame is one partial response whose first candidate carries the
 * next parts, the last one its `finishReason`, and `usageMetadata` the running totals. Adjacent text parts of the same
 * kind merge, a thought part keeps its flag and never its text, and every other part — a function call, or a part
 * carrying a thought signature — is kept whole for the buffered reading to accept or refuse. The stream has no terminal
 * marker: only the end of the body after a finish reason proves a whole response. A frame carrying `error` is the
 * service's refusal after acceptance, read with the status it names.
 */
export async function* generateContentSseEvents(response: DeepSeekTransportResponse): AsyncIterable<DialogueStreamEvent> {
  const parts: Array<Record<string, unknown>> = [];
  let finishReason: unknown = null;
  let usageMetadata: unknown;
  let promptFeedback: unknown;
  let candidateSeen = false;
  try {
    for await (const { data } of sseFrames(response)) {
      const value: unknown = JSON.parse(data);
      if (!isRecord(value)) throw new Error('AI7_OUTCOME_UNKNOWN');
      if (isRecord(value.error)) {
        const status = Number.isSafeInteger(value.error.code) ? value.error.code as number : 500;
        yield { kind: 'error', status, body: { error: { status: value.error.status, message: value.error.message } } };
        return;
      }
      if (finishReason !== null) throw new Error('AI7_OUTCOME_UNKNOWN');
      if (value.usageMetadata !== undefined) usageMetadata = value.usageMetadata;
      if (value.promptFeedback !== undefined) promptFeedback = value.promptFeedback;
      if (!Array.isArray(value.candidates) || value.candidates.length === 0) continue;
      const candidate: unknown = value.candidates[0];
      if (value.candidates.length !== 1 || !isRecord(candidate)) throw new Error('AI7_OUTCOME_UNKNOWN');
      candidateSeen = true;
      const incoming: unknown[] = isRecord(candidate.content) && Array.isArray(candidate.content.parts) ? candidate.content.parts : [];
      for (const part of incoming) {
        if (!isRecord(part)) throw new Error('AI7_OUTCOME_UNKNOWN');
        const last = parts[parts.length - 1];
        const keys = Object.keys(part).sort().join(',');
        if (keys === 'text' && typeof part.text === 'string') {
          if (last !== undefined && Object.keys(last).join(',') === 'text') last.text = `${last.text as string}${part.text}`;
          else parts.push({ text: part.text });
          if (part.text.length > 0) yield { kind: 'text', text: part.text };
        } else if (keys === 'text,thought' && part.thought === true) {
          // Presence only: the reasoning text is never kept.
          if (last === undefined || last.thought !== true || Object.keys(last).length !== 2) parts.push({ text: '', thought: true });
        } else {
          parts.push(part.thought === true ? { ...part, text: '' } : { ...part });
        }
      }
      if (candidate.finishReason !== undefined && candidate.finishReason !== null) finishReason = candidate.finishReason;
    }
  } catch (error) {
    throw streamFailure(error);
  }
  // A blocked prompt ends with prompt feedback and no candidate; it is as whole as the buffered body that says the same.
  if (finishReason === null && (candidateSeen || promptFeedback === undefined)) throw new Error('AI7_OUTCOME_UNKNOWN');
  yield { kind: 'complete', response: {
    candidates: candidateSeen ? [{ content: { role: 'model', parts }, finishReason }] : [],
    ...(usageMetadata === undefined ? {} : { usageMetadata }),
    ...(promptFeedback === undefined ? {} : { promptFeedback }),
  } };
}
