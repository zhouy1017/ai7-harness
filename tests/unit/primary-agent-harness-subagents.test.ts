import { randomUUID } from 'node:crypto';
import type { GenerateOptions, LlmAdapter, StreamChunk } from '@deepseek-ai/dsh-llm';
import { describe, expect, it } from 'vitest';
import { prepareExecution, STOCK_TYPOS_LEAF, type HarnessRequestIdentity } from '../../src/service/harness/primary-agent-harness.js';
import { LOCAL_DETERMINISTIC_MODEL, LOCAL_DETERMINISTIC_ROUTE } from '../../src/service/provider/egress-gate.js';
import { installNodeNetworkDenial } from '../../src/shared/network-denial.js';

installNodeNetworkDenial();
const system = '合成单元审校：保持原始输入。';
const digest = 'a'.repeat(64);

async function* answer(): AsyncIterable<StreamChunk> {
  yield { type: 'block-start', index: 0, blockType: 'text' };
  yield { type: 'text-delta', index: 0, text: '合成结果' };
  yield { type: 'block-end', index: 0, block: { type: 'text', text: '合成结果' } };
  yield { type: 'usage', usage: { inputTokens: 3, outputTokens: 2 } };
  yield { type: 'finish', reason: { kind: 'stop' } };
}

async function prepare(stream: (options: GenerateOptions) => AsyncIterable<StreamChunk>, identities: HarnessRequestIdentity[]) {
  const adapter: LlmAdapter = {
    providerInfo: (provider) => ({ id: provider, name: '合成模型' }),
    providerRetryPolicy: () => undefined,
    listModels: async () => [],
    resolveModel: async (provider, model) => ({ provider, id: model, name: '合成模型', inputModalities: ['text'] }),
    stream,
  };
  const harness = await prepareExecution({ sessionId: randomUUID(), route: LOCAL_DETERMINISTIC_ROUTE, model: LOCAL_DETERMINISTIC_MODEL,
    systemPrompt: system, promptContractDigest: digest, compositionOptions: { version: 3, subagents: STOCK_TYPOS_LEAF },
    adapterFactory: () => adapter,
    gate: (payload, identity) => {
      expect(payload.system).toBe(system);
      expect(payload.tools ?? []).toEqual([]);
      identities.push(identity);
      return { decision: 'transmit-local', payloadDigest: digest };
    }, onTransmitTicket: () => { throw new Error('CI never transmits'); } });
  harness.bindExecution({ harnessSessionId: harness.sessionId, behaviorCompositionDigest: harness.composition.digest, promptContractDigest: digest });
  return harness;
}

describe('parent-attempt native unit leaves', () => {
  it('uses fresh native children for units and keeps later stages on the parent with exact payloads', async () => {
    const identities: HarnessRequestIdentity[] = [];
    const messages: GenerateOptions[] = [];
    const harness = await prepare((options) => { messages.push(options); return answer(); }, identities);
    try {
      const first = await harness.submitUnit('合成单元一');
      const second = await harness.submitUnit('合成单元二');
      const stage = await harness.submitStage('合成父阶段');
      expect([first.terminal, second.terminal, stage.terminal]).toEqual(['completed', 'completed', 'completed']);
      expect(new Set(identities.map((identity) => identity.sessionId)).size).toBe(3);
      expect(identities.map((identity) => identity.child)).toEqual([true, true, false]);
      expect(identities.every((identity) => identity.parentSessionId === harness.sessionId)).toBe(true);
      expect(stage.span.sessionId).toBe(harness.sessionId);
      expect(messages.slice(0, 2).map((options) => options.messages.length)).toEqual([1, 1]);
      expect(first.signals.filter((signal) => signal.kind === 'usage')).toEqual([{ kind: 'usage', usage: { inputTokens: 3, outputTokens: 2 } }]);
      expect((await harness.finish()).map((span) => span.sessionId)).toEqual(identities.map((identity) => identity.sessionId));
    } finally { await harness.finish(); }
  });

  it('holds one slot through cancellation and quiescent disposal, then permits a fresh child', async () => {
    const identities: HarnessRequestIdentity[] = [];
    let started!: () => void;
    const entering = new Promise<void>((resolve) => { started = resolve; });
    let hold = true;
    const harness = await prepare(async function* (options) {
      if (hold) { started(); await new Promise<void>((resolve) => options.signal!.addEventListener('abort', () => resolve(), { once: true })); }
      yield* answer();
    }, identities);
    try {
      const pending = harness.submitUnit('合成待取消单元');
      await entering;
      await expect(harness.submitUnit('重叠单元')).rejects.toThrow('上一个回合');
      harness.interrupt();
      expect((await pending).terminal).toBe('interrupted');
      hold = false;
      expect((await harness.submitUnit('新的合成单元')).terminal).toBe('completed');
      expect(identities).toHaveLength(2);
      expect(identities[0]!.sessionId).not.toBe(identities[1]!.sessionId);
    } finally { await harness.finish(); }
  });
});
