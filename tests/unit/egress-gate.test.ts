import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  DEEPSEEK_MODEL,
  DEEPSEEK_ROUTE,
  LOCAL_DETERMINISTIC_MODEL,
  LOCAL_DETERMINISTIC_ROUTE,
  evaluateEgress,
  payloadDigest,
  type EgressAttemptScope,
  type EgressBindingFacts,
} from '../../src/service/provider/egress-gate.js';
import type { AssembledModelPayload } from '../../src/service/provider/payload.js';

// The gate must see the complete assembled payload and compare every datum with the binding. These
// payloads are synthetic: fixed system text, two admitted unit messages, and one accepted output.

const SYSTEM = '合成系统提示。';
const UNIT_1 = `分析单元 1/2 · 单元摘要 ${'1'.repeat(64)}\n[blk_${'a'.repeat(24)}] (paragraph) 合成段落。`;
const UNIT_2 = `分析单元 2/2 · 单元摘要 ${'2'.repeat(64)}\n[blk_${'b'.repeat(24)}] (paragraph) 合成段落二。`;
const OUTPUT_1 = '{"schema":"ai7.baseline-manuscript-analysis.unit-result/1"}';
const BINDING_DIGEST = 'c'.repeat(64);

function binding(route: EgressBindingFacts['route'] = LOCAL_DETERMINISTIC_ROUTE): EgressBindingFacts {
  return {
    bindingDigest: BINDING_DIGEST,
    route,
    model: route === LOCAL_DETERMINISTIC_ROUTE ? LOCAL_DETERMINISTIC_MODEL : DEEPSEEK_MODEL,
    systemPrompt: SYSTEM,
    outboundDataCategory: 'public-or-synthetic',
    policy: { operationalScope: 'development-ci', providerProcessingVersion: 'v1', liveTransmissionAllowed: false, authorizedLiveTransmissionCount: 0 },
    admittedUserMessages: new Set([UNIT_1, UNIT_2]),
  };
}

function scope(current: string | null = BINDING_DIGEST, outputs: string[] = [OUTPUT_1]): EgressAttemptScope {
  return {
    currentBindingDigest: () => current,
    acceptedOutputDigests: new Set(outputs.map((text) => createHash('sha256').update(text).digest('hex'))),
  };
}

function user(text: string): AssembledModelPayload['messages'][number] {
  return { role: 'user', content: [{ type: 'text', text }], source: { kind: 'user' } };
}

function assistant(text: string, route: string = LOCAL_DETERMINISTIC_ROUTE, model: string = LOCAL_DETERMINISTIC_MODEL): AssembledModelPayload['messages'][number] {
  return { role: 'assistant', content: [{ type: 'text', text }], source: { kind: 'model', provider: route, model } };
}

function payload(overrides: Partial<AssembledModelPayload> = {}): AssembledModelPayload {
  return {
    provider: LOCAL_DETERMINISTIC_ROUTE,
    model: LOCAL_DETERMINISTIC_MODEL,
    system: SYSTEM,
    tools: [],
    messages: [user(UNIT_1), assistant(OUTPUT_1), user(UNIT_2)],
    ...overrides,
  };
}

describe('evaluateEgress', () => {
  it('admits the complete in-scope local-route payload as transmit-local with a payload digest', () => {
    const decision = evaluateEgress(payload(), binding(), scope());
    expect(decision).toEqual({ decision: 'transmit-local', payloadDigest: payloadDigest(payload()) });
    expect(payloadDigest(payload())).toMatch(/^[0-9a-f]{64}$/);
  });

  it('refuses an out-of-scope block in a user message and sends nothing', () => {
    const foreign = `分析单元 2/2 · 单元摘要 ${'2'.repeat(64)}\n[blk_${'f'.repeat(24)}] (paragraph) 越界段落。`;
    expect(evaluateEgress(payload({ messages: [user(UNIT_1), assistant(OUTPUT_1), user(foreign)] }), binding(), scope()))
      .toMatchObject({ decision: 'refuse', reason: 'payload-out-of-scope' });
    // A user message carried by a plugin source is not the editor's authorized input either.
    expect(evaluateEgress(payload({ messages: [{ role: 'user', content: [{ type: 'text', text: UNIT_1 }], source: { kind: 'plugin' } }] }), binding(), scope()))
      .toMatchObject({ decision: 'refuse', reason: 'payload-out-of-scope' });
  });

  it('refuses a stale binding', () => {
    expect(evaluateEgress(payload(), binding(), scope('d'.repeat(64)))).toMatchObject({ decision: 'refuse', reason: 'binding-stale' });
    expect(evaluateEgress(payload(), binding(), scope(null))).toMatchObject({ decision: 'refuse', reason: 'binding-stale' });
  });

  it('refuses the remote route under Provider Processing v1 even when every datum is in scope', () => {
    const remote = payload({
      provider: DEEPSEEK_ROUTE,
      model: DEEPSEEK_MODEL,
      messages: [user(UNIT_1), assistant(OUTPUT_1, DEEPSEEK_ROUTE, DEEPSEEK_MODEL), user(UNIT_2)],
    });
    expect(evaluateEgress(remote, binding(DEEPSEEK_ROUTE), scope())).toMatchObject({ decision: 'refuse', reason: 'remote-route-denied-under-v1' });
  });

  it('refuses route, model, tool, system-prompt, prior-output, and role deviations', () => {
    expect(evaluateEgress(payload({ provider: DEEPSEEK_ROUTE }), binding(), scope())).toMatchObject({ reason: 'route-mismatch' });
    expect(evaluateEgress(payload({ model: 'other' }), binding(), scope())).toMatchObject({ reason: 'model-mismatch' });
    expect(evaluateEgress(payload({ tools: [{ name: 'shell' }] }), binding(), scope())).toMatchObject({ reason: 'tools-present' });
    expect(evaluateEgress(payload({ system: `${SYSTEM} 附加` }), binding(), scope())).toMatchObject({ reason: 'system-prompt-mismatch' });
    expect(evaluateEgress(payload(), binding(), scope(BINDING_DIGEST, []))).toMatchObject({ reason: 'payload-out-of-scope' });
    expect(evaluateEgress(payload({ messages: [user(UNIT_1), assistant(OUTPUT_1, DEEPSEEK_ROUTE, DEEPSEEK_MODEL), user(UNIT_2)] }), binding(), scope()))
      .toMatchObject({ reason: 'payload-out-of-scope' });
    expect(evaluateEgress(payload({ messages: [{ role: 'system', content: [{ type: 'text', text: 'x' }], source: { kind: 'user' } }, user(UNIT_1)] }), binding(), scope()))
      .toMatchObject({ reason: 'unknown-message-role' });
    expect(evaluateEgress(payload({ messages: [user(UNIT_1), assistant(OUTPUT_1)] }), binding(), scope())).toMatchObject({ reason: 'payload-out-of-scope' });
    expect(evaluateEgress(payload({ messages: [{ role: 'user', content: [{ type: 'image' }], source: { kind: 'user' } }] }), binding(), scope()))
      .toMatchObject({ reason: 'payload-out-of-scope' });
    expect(evaluateEgress(payload({ messages: [] }), binding(), scope())).toMatchObject({ reason: 'payload-out-of-scope' });
  });
});
