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

  it('lets a dialogue excerpt of the editor\'s manuscript reach only the local deterministic route (Issue #52, S17a)', () => {
    const excerpt = { ...binding(), outboundDataCategory: 'editor-selected-manuscript-excerpt' as const };
    expect(evaluateEgress(payload(), excerpt, scope())).toEqual({ decision: 'transmit-local', payloadDigest: payloadDigest(payload()) });
    const remote = { ...binding(DEEPSEEK_ROUTE), outboundDataCategory: 'editor-selected-manuscript-excerpt' as const };
    const remotePayload = payload({ provider: DEEPSEEK_ROUTE, model: DEEPSEEK_MODEL, messages: [user(UNIT_1)] });
    expect(evaluateEgress(remotePayload, remote, scope())).toMatchObject({ decision: 'refuse', reason: 'outbound-category-mismatch' });
  });

  it('lets the excerpt reach a remote route only under a rule that names it, with no Run ceiling (Issue #52, S17c)', () => {
    const live = {
      ...binding(DEEPSEEK_ROUTE),
      outboundDataCategory: 'editor-selected-manuscript-excerpt' as const,
      policy: { operationalScope: 'developer-live' as const, providerProcessingVersion: 'v9' as const, liveTransmissionAllowed: true as const, authorizedLiveTransmissionCount: 'bounded-by-run' as const },
    };
    const remotePayload = payload({ provider: DEEPSEEK_ROUTE, model: DEEPSEEK_MODEL, messages: [user(UNIT_1)] });
    const dialogueScope = { ...scope(), ceilingState: () => 'not-applicable' as const };
    // A rule that names only public or synthetic material — every baseline and review binding — admits no excerpt.
    expect(evaluateEgress(remotePayload, live, dialogueScope)).toMatchObject({ decision: 'refuse', reason: 'outbound-category-mismatch' });
    expect(evaluateEgress(remotePayload, { ...live, ruleOutboundCategories: new Set(['public-or-synthetic'] as const) }, dialogueScope))
      .toMatchObject({ decision: 'refuse', reason: 'outbound-category-mismatch' });
    const admitted = { ...live, ruleOutboundCategories: new Set(['editor-selected-manuscript-excerpt'] as const) };
    expect(evaluateEgress(remotePayload, admitted, dialogueScope)).toMatchObject({
      decision: 'transmit-remote',
      ticket: { decision: 'transmit-remote', bindingDigest: BINDING_DIGEST, payloadDigest: payloadDigest(remotePayload) },
    });
    // The dialogue still needs the exact one message it was admitted for.
    expect(evaluateEgress(payload({ provider: DEEPSEEK_ROUTE, model: DEEPSEEK_MODEL, messages: [user('另一段文字')] }), admitted, dialogueScope))
      .toMatchObject({ decision: 'refuse', reason: 'payload-out-of-scope' });
    // `not-applicable` belongs to the excerpt rule alone: a public-or-synthetic binding reads it as an unset ceiling.
    const analysis = { ...live, outboundDataCategory: 'public-or-synthetic' as const };
    expect(evaluateEgress(remotePayload, analysis, dialogueScope)).toMatchObject({ decision: 'refuse', reason: 'run-budget-ceiling-unset' });
    expect(evaluateEgress(remotePayload, analysis, { ...scope(), ceilingState: () => 'within' as const })).toMatchObject({ decision: 'transmit-remote' });
  });

  it('reads a conflict region as it reads the selected excerpt, each category under a rule naming exactly it (Issue #842)', () => {
    const region = { ...binding(), outboundDataCategory: 'manuscript-conflict-region-excerpt' as const };
    expect(evaluateEgress(payload(), region, scope())).toEqual({ decision: 'transmit-local', payloadDigest: payloadDigest(payload()) });
    const live = {
      ...region,
      ...binding(DEEPSEEK_ROUTE),
      outboundDataCategory: 'manuscript-conflict-region-excerpt' as const,
      policy: { operationalScope: 'developer-live' as const, providerProcessingVersion: 'v10' as const, liveTransmissionAllowed: true as const, authorizedLiveTransmissionCount: 'bounded-by-run' as const },
    };
    const remotePayload = payload({ provider: DEEPSEEK_ROUTE, model: DEEPSEEK_MODEL, messages: [user(UNIT_1)] });
    const fastScope = { ...scope(), ceilingState: () => 'not-applicable' as const };
    expect(evaluateEgress(remotePayload, live, fastScope)).toMatchObject({ decision: 'refuse', reason: 'outbound-category-mismatch' });
    // The selected-excerpt rule does not name a conflict region, nor the other way round.
    expect(evaluateEgress(remotePayload, { ...live, ruleOutboundCategories: new Set(['editor-selected-manuscript-excerpt'] as const) }, fastScope))
      .toMatchObject({ decision: 'refuse', reason: 'outbound-category-mismatch' });
    const excerpt = { ...live, outboundDataCategory: 'editor-selected-manuscript-excerpt' as const };
    expect(evaluateEgress(remotePayload, { ...excerpt, ruleOutboundCategories: new Set(['manuscript-conflict-region-excerpt'] as const) }, fastScope))
      .toMatchObject({ decision: 'refuse', reason: 'outbound-category-mismatch' });
    const admitted = { ...live, ruleOutboundCategories: new Set(['manuscript-conflict-region-excerpt'] as const) };
    expect(evaluateEgress(remotePayload, admitted, fastScope)).toMatchObject({ decision: 'transmit-remote' });
    // Its not-applicable ceiling, like the dialogue's, holds only under the rule that names its own category.
    expect(evaluateEgress(remotePayload, { ...admitted, ruleOutboundCategories: new Set(['public-or-synthetic'] as const) }, fastScope))
      .toMatchObject({ decision: 'refuse', reason: 'outbound-category-mismatch' });
  });

  it('sends an evaluation contract\'s further categories remotely only under a rule naming each, within the Run ceiling (Issue #429)', () => {
    const live = {
      ...binding(DEEPSEEK_ROUTE),
      policy: { operationalScope: 'developer-live' as const, providerProcessingVersion: 'v10' as const, liveTransmissionAllowed: true as const, authorizedLiveTransmissionCount: 'bounded-by-run' as const },
      contractCategories: new Set(['editor-authored-evaluation-text', 'house-exemplar-excerpt'] as const),
    };
    const remotePayload = payload({ provider: DEEPSEEK_ROUTE, model: DEEPSEEK_MODEL, messages: [user(UNIT_1)] });
    const within = { ...scope(), ceilingState: () => 'within' as const };
    // No rule categories, or a rule missing one the contract carries, sends nothing.
    expect(evaluateEgress(remotePayload, live, within)).toMatchObject({ decision: 'refuse', reason: 'outbound-category-mismatch' });
    expect(evaluateEgress(remotePayload, { ...live, ruleOutboundCategories: new Set(['public-or-synthetic', 'editor-authored-evaluation-text'] as const) }, within))
      .toMatchObject({ decision: 'refuse', reason: 'outbound-category-mismatch' });
    const admitted = { ...live, ruleOutboundCategories: new Set(['public-or-synthetic', 'editor-authored-evaluation-text', 'house-exemplar-excerpt'] as const) };
    expect(evaluateEgress(remotePayload, admitted, within)).toMatchObject({ decision: 'transmit-remote' });
    // Their bound is the Run's: `not-applicable` is the dialogue's alone and reads as unset, and a spent ceiling refuses.
    expect(evaluateEgress(remotePayload, admitted, { ...scope(), ceilingState: () => 'not-applicable' as const }))
      .toMatchObject({ decision: 'refuse', reason: 'run-budget-ceiling-unset' });
    expect(evaluateEgress(remotePayload, admitted, { ...scope(), ceilingState: () => 'reached' as const }))
      .toMatchObject({ decision: 'refuse', reason: 'run-budget-ceiling-reached' });
    // The deterministic route sends nothing out, so development-ci evaluation reads exactly as before.
    expect(evaluateEgress(payload(), { ...binding(), contractCategories: live.contractCategories }, scope()))
      .toEqual({ decision: 'transmit-local', payloadDigest: payloadDigest(payload()) });
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
