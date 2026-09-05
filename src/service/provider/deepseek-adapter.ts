import type { GenerateOptions, LlmAdapter, LlmProviderInfo, LlmResolvedModelInfo, StreamChunk } from '@deepseek-ai/dsh-llm';
import { canonicalJson, isRecord, sha256Hex } from '../analysis/canonical.js';
import { AI7_FAILURE_CODES, type DshFailureCodes } from './classification.js';
import type { CredentialBroker, CredentialSlotBinding } from './credential-broker.js';
import { DEEPSEEK_MODEL, DEEPSEEK_ROUTE, type TransmitTicket } from './egress-gate.js';
import { messageText, type AssembledModelPayload } from './payload.js';

/**
 * The AI7-owned DeepSeek OpenAI-compatible adapter, revision 1: `POST https://api.deepseek.com/chat/completions`,
 * model `deepseek-v4-pro`, thinking enabled at high reasoning effort, no provider-native tools. It
 * assembles a deterministic request from the frozen prompt contract, records the request digest, and
 * transmits only after a `transmit-remote` decision the gate issued for the same binding — which
 * never happens under Provider Processing v1. The credential enters only the `authorization` header
 * inside the broker's release callback; the assembled request and its digest never contain it.
 */
export const DEEPSEEK_ADAPTER_REVISION = 1 as const;
export const DEEPSEEK_CONFIGURATION_REVISION = 1 as const;
export const DEEPSEEK_ENDPOINT = 'https://api.deepseek.com/chat/completions' as const;
export const DEEPSEEK_REASONING_EFFORT = 'high' as const;

export interface DeepSeekRequestAssembly {
  readonly url: typeof DEEPSEEK_ENDPOINT;
  readonly method: 'POST';
  /** Headers without the credential: content type and the mandatory DSH attribution. */
  readonly headers: Readonly<Record<string, string>>;
  /** Canonical JSON body; the digest is over exactly these bytes. */
  readonly body: string;
  readonly requestDigest: string;
  readonly promptContractDigest: string;
}

export function assembleDeepSeekRequest(
  payload: AssembledModelPayload,
  attribution: Readonly<Record<string, string>>,
  promptContractDigest: string,
): DeepSeekRequestAssembly {
  const messages: Array<{ role: string; content: string }> = [];
  if (payload.system !== undefined && payload.system.length > 0) messages.push({ role: 'system', content: payload.system });
  for (const message of payload.messages) {
    const text = messageText(message);
    if (text === null) throw new Error('DEEPSEEK_REQUEST_NON_TEXT_CONTENT');
    if (message.role !== 'user' && message.role !== 'assistant') throw new Error('DEEPSEEK_REQUEST_ROLE_INVALID');
    messages.push({ role: message.role, content: text });
  }
  const body = canonicalJson({
    model: DEEPSEEK_MODEL,
    messages,
    stream: false,
    thinking: { type: 'enabled' },
    reasoning_effort: DEEPSEEK_REASONING_EFFORT,
  });
  return {
    url: DEEPSEEK_ENDPOINT,
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json', ...attribution },
    body,
    requestDigest: sha256Hex(body),
    promptContractDigest,
  };
}

export function authorizationHeader(secret: string): Readonly<Record<string, string>> {
  return { authorization: `Bearer ${secret}` };
}

export interface DeepSeekUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheReadTokens?: number;
  readonly reasoningTokens?: number;
}

export type DeepSeekParsedResponse =
  | { readonly kind: 'success'; readonly text: string; readonly reasoningText: string | null; readonly usage: DeepSeekUsage | null }
  | { readonly kind: 'failure'; readonly code: string; readonly message: string; readonly status: number };

function nonNegativeInteger(value: unknown): number | null {
  return Number.isSafeInteger(value) && (value as number) >= 0 ? (value as number) : null;
}

/** Parse one OpenAI-compatible completion response into the closed AI7 signal set. */
export function parseDeepSeekResponse(status: number, body: unknown, codes: DshFailureCodes): DeepSeekParsedResponse {
  const errorRecord = isRecord(body) && isRecord(body.error) ? body.error : null;
  const errorText = errorRecord === null
    ? ''
    : [errorRecord.code, errorRecord.type, errorRecord.message].filter((part) => typeof part === 'string').join(' ').toLocaleLowerCase('en-US');
  if (status === 401 || status === 403) return { kind: 'failure', code: codes.INVALID_CREDENTIAL_CODE, message: '模型服务拒绝了凭据。', status };
  if (status === 402 || /insufficient[_ ]?(balance|quota)|quota|balance/u.test(errorText)) {
    return { kind: 'failure', code: codes.QUOTA_EXCEEDED_CODE, message: '模型服务账户限额或余额不足。', status };
  }
  if (status === 429) return { kind: 'failure', code: AI7_FAILURE_CODES.RATE_LIMIT, message: '模型服务速率限制。', status };
  if (status === 400 && /context|maximum length|too long|tokens/u.test(errorText)) {
    return { kind: 'failure', code: codes.CONTEXT_WINDOW_EXCEEDED_CODE, message: '请求超出模型上下文窗口。', status };
  }
  if (status >= 500) return { kind: 'failure', code: AI7_FAILURE_CODES.PROVIDER_ERROR, message: '模型服务返回服务端错误。', status };
  if (status !== 200) return { kind: 'failure', code: AI7_FAILURE_CODES.INVALID_RESPONSE, message: '模型服务返回了无法分类的状态。', status };
  if (!isRecord(body) || !Array.isArray(body.choices) || body.choices.length === 0 || !isRecord(body.choices[0]) ||
      !isRecord(body.choices[0].message) || typeof body.choices[0].message.content !== 'string') {
    return { kind: 'failure', code: AI7_FAILURE_CODES.INVALID_RESPONSE, message: '模型服务响应不含可用内容。', status };
  }
  const message = body.choices[0].message;
  const content = message.content;
  if (typeof content !== 'string') return { kind: 'failure', code: AI7_FAILURE_CODES.INVALID_RESPONSE, message: '模型服务响应不含可用内容。', status };
  const reasoning = typeof message.reasoning_content === 'string' ? message.reasoning_content : null;
  let usage: DeepSeekUsage | null = null;
  if (isRecord(body.usage)) {
    const promptTokens = nonNegativeInteger(body.usage.prompt_tokens);
    const completionTokens = nonNegativeInteger(body.usage.completion_tokens);
    const cacheHit = nonNegativeInteger(body.usage.prompt_cache_hit_tokens) ?? 0;
    const reasoningTokens = isRecord(body.usage.completion_tokens_details)
      ? nonNegativeInteger(body.usage.completion_tokens_details.reasoning_tokens)
      : null;
    if (promptTokens !== null && completionTokens !== null) {
      usage = {
        inputTokens: Math.max(0, promptTokens - cacheHit),
        outputTokens: completionTokens,
        ...(cacheHit > 0 ? { cacheReadTokens: cacheHit } : {}),
        ...(reasoningTokens === null ? {} : { reasoningTokens }),
      };
    }
  }
  return { kind: 'success', text: content, reasoningText: reasoning, usage };
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
}

export class DeepSeekOpenAiCompatibleAdapter implements LlmAdapter {
  readonly #deps: DeepSeekAdapterDependencies;
  readonly #requestDigests: string[] = [];
  #transmissions = 0;

  constructor(deps: DeepSeekAdapterDependencies) {
    this.#deps = deps;
  }

  /** Request digests assembled so far, whether or not a transmission followed. */
  get assembledRequestDigests(): ReadonlyArray<string> {
    return this.#requestDigests;
  }

  /** Transmit attempts that reached the transport; zero for every v1 Run. */
  get transmissions(): number {
    return this.#transmissions;
  }

  providerInfo(provider: string): LlmProviderInfo {
    return { id: provider, name: 'DeepSeek 开放平台（官方）' };
  }

  providerRetryPolicy(): undefined {
    return undefined;
  }

  listModels(): Promise<readonly never[]> {
    return Promise.resolve([]);
  }

  resolveModel(provider: string, model: string): Promise<LlmResolvedModelInfo> {
    return Promise.resolve({ provider, id: model, name: 'DeepSeek V4 Pro High', inputModalities: ['text'] });
  }

  async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    const fail = (code: string, message: string, status?: number): StreamChunk => ({
      type: 'finish',
      reason: { kind: code === AI7_FAILURE_CODES.INTERRUPTED ? 'aborted' : 'error', failure: { code, message, ...(status === undefined ? {} : { status }) } },
    });
    if (options.provider !== DEEPSEEK_ROUTE || options.model !== DEEPSEEK_MODEL) {
      yield fail(AI7_FAILURE_CODES.INVALID_RESPONSE, 'DeepSeek 适配器只服务其固定路由与模型。');
      return;
    }
    const assembly = assembleDeepSeekRequest(options, this.#deps.attribution(), this.#deps.promptContractDigest);
    this.#requestDigests.push(assembly.requestDigest);
    const ticket = this.#deps.tickets.take();
    if (ticket === null || ticket.bindingDigest !== this.#deps.slotBinding.bindingDigest) {
      yield fail(AI7_FAILURE_CODES.TRANSMIT_TICKET_ABSENT, '没有本步骤的 transmit-remote 决定；未发送任何内容。');
      return;
    }
    let outcome: DeepSeekParsedResponse;
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
        return parseDeepSeekResponse(response.status, body, this.#deps.codes);
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
    yield { type: 'block-start', index: 0, blockType: 'text' };
    yield { type: 'text-delta', index: 0, text: outcome.text };
    yield { type: 'block-end', index: 0, block: { type: 'text', text: outcome.text } };
    if (outcome.usage !== null) yield { type: 'usage', usage: { ...outcome.usage } };
    yield { type: 'finish', reason: { kind: 'stop' } };
  }
}
