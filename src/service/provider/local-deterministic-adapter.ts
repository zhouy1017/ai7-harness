import type { LlmAdapter, LlmProviderInfo, LlmResolvedModelInfo, StreamChunk, GenerateOptions } from '@deepseek-ai/dsh-llm';
import { parseUnitMessageHeader, unitRequestDigest } from '../analysis/contract.js';
import { AI7_FAILURE_CODES, type DshFailureCodes } from './classification.js';
import { LOCAL_DETERMINISTIC_MODEL, LOCAL_DETERMINISTIC_ROUTE } from './egress-gate.js';
import { lastUserMessageText } from './payload.js';
import type { ResolvedModelFixture } from './model-fixture.js';

/**
 * The AI7 local deterministic model adapter: replays a hand-written synthetic fixture in-process and
 * transmits nothing. It is the bound adapter in every supported development launch and in the E2E
 * Gate. Each request is matched by the unit ordinal parsed from the unit message header and the
 * request digest recomputed from the frozen prompt contract and the manifest unit digest; a request
 * the fixture does not describe fails closed as a fixture mismatch, which the Run records as a gap.
 *
 * Structurally an `LlmAdapter`; the class is not extended so that no DSH runtime value is imported
 * before the service installs network denial.
 */
export class Ai7LocalDeterministicAdapter implements LlmAdapter {
  readonly #fixture: ResolvedModelFixture;
  readonly #promptContractDigest: string;
  readonly #codes: DshFailureCodes;
  #served = 0;

  constructor(fixture: ResolvedModelFixture, promptContractDigest: string, codes: DshFailureCodes) {
    this.#fixture = fixture;
    this.#promptContractDigest = promptContractDigest;
    this.#codes = codes;
  }

  /** Replayed requests so far; there is never a transmission count. */
  get servedRequests(): number {
    return this.#served;
  }

  providerInfo(provider: string): LlmProviderInfo {
    return { id: provider, name: 'AI7 本地确定性模型适配器' };
  }

  providerRetryPolicy(): undefined {
    return undefined;
  }

  listModels(): Promise<readonly never[]> {
    return Promise.resolve([]);
  }

  resolveModel(provider: string, model: string): Promise<LlmResolvedModelInfo> {
    return Promise.resolve({ provider, id: model, name: 'AI7 确定性夹具', inputModalities: ['text'] });
  }

  async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    this.#served += 1;
    const failure = (code: string, message: string, status?: number): StreamChunk => ({
      type: 'finish',
      reason: { kind: code === AI7_FAILURE_CODES.INTERRUPTED ? 'aborted' : 'error', failure: { code, message, ...(status === undefined ? {} : { status }) } },
    });
    if (options.provider !== LOCAL_DETERMINISTIC_ROUTE || options.model !== LOCAL_DETERMINISTIC_MODEL) {
      yield failure(AI7_FAILURE_CODES.FIXTURE_MISMATCH, '确定性适配器只服务本地确定性路由。');
      return;
    }
    const text = lastUserMessageText(options);
    const header = text === null ? null : parseUnitMessageHeader(text);
    if (header === null) {
      yield failure(AI7_FAILURE_CODES.FIXTURE_MISMATCH, '请求不含可识别的分析单元消息头。');
      return;
    }
    const entry = this.#fixture.entries.get(header.ordinal);
    const expectedDigest = unitRequestDigest(this.#promptContractDigest, header.ordinal, header.unitDigest);
    if (entry === undefined || entry.requestDigest !== expectedDigest) {
      yield failure(AI7_FAILURE_CODES.FIXTURE_MISMATCH, `夹具 ${this.#fixture.identity} 没有单元 ${header.ordinal} 的对应响应。`);
      return;
    }
    const response = entry.response;
    switch (response.kind) {
      case 'unit-result':
        yield { type: 'block-start', index: 0, blockType: 'text' };
        yield { type: 'text-delta', index: 0, text: response.text };
        yield { type: 'block-end', index: 0, block: { type: 'text', text: response.text } };
        yield { type: 'usage', usage: { inputTokens: response.usage.inputTokens, outputTokens: response.usage.outputTokens } };
        yield { type: 'finish', reason: { kind: 'stop' } };
        return;
      case 'adapter-failure':
        yield failure(response.code, response.message, response.status ?? undefined);
        return;
      case 'quota-exceeded':
        yield failure(this.#codes.QUOTA_EXCEEDED_CODE, response.message, response.status);
        return;
      case 'interrupted':
        yield failure(AI7_FAILURE_CODES.INTERRUPTED, response.message);
        return;
    }
  }
}
