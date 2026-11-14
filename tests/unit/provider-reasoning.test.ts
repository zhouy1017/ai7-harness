import { geminiReplayItems } from '../../src/service/provider/family-gemini.js';
import { CONFIGURED_MODEL_REASONING } from '../../src/shared/provider-configuration.generated.js';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { assembleProviderRequest, parseProviderResponse, PROVIDER_ROUTE_PROFILES } from '../../src/service/provider/deepseek-adapter.js';
import { classifyModelFailure, AI7_FAILURE_CODES } from '../../src/service/provider/classification.js';
import { modelProfileFor } from '../../src/service/provider/model-profile.js';
import type { AssembledModelPayload } from '../../src/service/provider/payload.js';
import { CredentialBroker } from '../../src/service/provider/credential-broker.js';
import { DeepSeekOpenAiCompatibleAdapter } from '../../src/service/provider/deepseek-adapter.js';
import { evaluateEgress, payloadDigest, type EgressBindingFacts, type TransmitTicket } from '../../src/service/provider/egress-gate.js';
import { PlatformToolSession } from '../../src/service/provider/platform-tool-session.js';
import { readLocalToolsRule } from '../../src/service/provider/local-tools.js';
import { RetrievalIndex } from '../../src/service/retrieval/index.js';
import { prepareExecution } from '../../src/service/harness/primary-agent-harness.js';
import { buildDialogueMessage, DIALOGUE_RETRIEVAL_PROMPT_CONTRACT as DIALOGUE_PROMPT_CONTRACT,
  DIALOGUE_RETRIEVAL_PROMPT_CONTRACT_DIGEST as DIALOGUE_PROMPT_CONTRACT_DIGEST } from '../../src/service/dialogue/contract.js';
import { installNodeNetworkDenial } from '../../src/shared/network-denial.js';
import { reasoningHistory, reasoningWireResponse } from '../support/provider-reasoning-wire.js';
import { responsesReplayItems } from '../../src/service/provider/family-openai-responses.js';

installNodeNetworkDenial();

// Protocol request metadata, not manuscript content. No network or provider credentials.
const ROUTES = ['opencode-go', 'deepseek-open-platform', 'openai-platform', 'anthropic-claude', 'google-gemini'] as const;
describe('per-family effort encoding (#1453)', () => {
  it.each(['gemini-2.5-pro', 'gemini-3.8-flash', 'gemini-3.1-pro-preview'])('encodes every advertised Gemini suggestion through its model-declared control: %s', (id) => {
    const model = modelProfileFor('google-gemini', id)!;
    const declaration = CONFIGURED_MODEL_REASONING[model.key]!;
    for (const effort of declaration.efforts) {
      const body = JSON.parse(assembleProviderRequest(PROVIDER_ROUTE_PROFILES['google-gemini'], model,
        { provider: model.route, model: id, reasoningEffort: effort, messages: [{ role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: 'Public protocol request.' }] }] },
        { attribution: {}, promptContractDigest: 'a'.repeat(64), sessionId: 'gemini-controls' }).body);
      expect(body.generationConfig.thinkingConfig).toEqual(declaration.control === 'google-thinking-budget' ? { thinkingBudget: Number(effort) } : { thinkingLevel: effort });
    }
  });

  it('matches Gemini synthetic call identity exactly, including seed and full ordinal', () => {
    const body = { candidates: [{ content: { parts: [
      { thought: true, text: 'Synthetic state.' }, { functionCall: { name: 'retrieve', args: {} }, thoughtSignature: 'synthetic-native-signature' },
    ] } }] };
    expect(geminiReplayItems(body, new Set(['gemini-call-seed-11', 'gemini-call-other-1']), 'seed')).toEqual([body.candidates[0]!.content.parts[0]]);
    expect(geminiReplayItems(body, new Set(['gemini-call-seed-1']), 'seed')).toEqual(body.candidates[0]!.content.parts);
  });

  it('retains native Responses assistant items without introducing a user/system role from output', () => {
    const reasoning = { type: 'reasoning', encrypted_content: 'opaque-protocol-placeholder' };
    const assistant = { type: 'message', role: 'assistant', content: [] };
    expect(responsesReplayItems({ output: [reasoning, { ...assistant, role: 'system' }, assistant,
      { ...assistant, role: 'user' }, { type: 'function_call', call_id: 'unaccepted' }] }, new Set()))
      .toEqual([reasoning, assistant]);
  });
  it('explains an upstream effort rejection in editor words without echoing its diagnostic or retrying', () => {
    const codes = { QUOTA_EXCEEDED_CODE: 'quota', INVALID_CREDENTIAL_CODE: 'credential', CONTEXT_WINDOW_EXCEEDED_CODE: 'context' };
    const response = parseProviderResponse(400, { error: { param: 'reasoning_effort', message: 'Raw vendor diagnostic.' } }, codes,
      PROVIDER_ROUTE_PROFILES['openai-platform'], modelProfileFor('openai-platform', 'custom-account-model')!);
    expect(response).toMatchObject({ kind: 'failure', code: AI7_FAILURE_CODES.REASONING_EFFORT_REJECTED, status: 400 });
    if (response.kind !== 'failure') throw new Error('Expected the upstream refusal');
    expect(classifyModelFailure(response, codes)).toMatchObject({ reason: '模型服务没有接受所选思考强度；请换一个强度后再试。', retrySafe: false });
    expect(response.message).not.toContain('Raw vendor');
  });
  it.each(ROUTES)('sends selected and custom efforts on %s, omitting off/unset', (route) => {
    const model = modelProfileFor(route, 'custom-account-model')!;
    for (const effort of [undefined, 'off', 'low', 'high', 'vendor-future-level']) {
      const payload: AssembledModelPayload = { provider: route, model: model.model, system: 'Protocol test.',
        ...(effort === undefined ? {} : { reasoningEffort: effort }),
        messages: [{ role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: 'Return the protocol result.' }] }] };
      const body = JSON.parse(assembleProviderRequest(PROVIDER_ROUTE_PROFILES[route], model, payload,
        { attribution: {}, promptContractDigest: 'a'.repeat(64), sessionId: 'protocol-test-session' }).body);
      const sent = route === 'openai-platform' ? body.reasoning?.effort : route === 'anthropic-claude' ? body.output_config?.effort
        : route === 'google-gemini' ? body.generationConfig?.thinkingConfig?.thinkingLevel : body.reasoning_effort;
      expect(sent).toBe(effort === 'off' ? undefined : effort);
      if (route === 'deepseek-open-platform') expect(body.thinking).toEqual(sent === undefined ? undefined : { type: 'enabled' });
      if (route === 'anthropic-claude') expect(body.thinking).toEqual(sent === undefined ? undefined : { type: 'adaptive' });
      if (route === 'opencode-go') expect(body.thinking).toBeUndefined();
    }
  });
});

const LOCAL = readLocalToolsRule({ localTools: {
  targetedRetrieval: { allowed: true, source: 'authorized-pinned-sources-only', callsPerUnit: 5, candidatesPerCall: 8, exactFetchRequiredBeforeCitation: true, scope: 'no-egress' },
  breaker: { roundTrips: 8, end: '检索未完成' },
} })!;
const CASES = [...ROUTES.flatMap((route) => [false, true].map((stream) => ({ route, stream, effort: 'high' }))),
  { route: 'openai-platform' as const, stream: false, effort: 'vendor-future-level' },
  ...[false, true].map((stream) => ({ route: 'openai-platform' as const, stream, effort: 'off' }))];
describe('native reasoning through the real DSH loop and send gate (#1453)', () => {
  it.each(CASES)('keeps reasoning and effort over two tool rounds: $route, stream=$stream, effort=$effort', async ({ route, stream, effort }) => {
    const model = modelProfileFor(route, 'custom-account-model')!, family = model.capabilities.requestShape;
    const profile = PROVIDER_ROUTE_PROFILES[route], digest = 'b'.repeat(64), bodies: Record<string, unknown>[] = [];
    const decisions: string[] = [];
    const captured: AssembledModelPayload[] = [];
    const binding: EgressBindingFacts = { bindingDigest: digest, route, model: model.model, reasoningEffort: effort,
      systemPrompt: DIALOGUE_PROMPT_CONTRACT.systemPrompt, outboundDataCategory: 'public-or-synthetic', localTools: LOCAL,
      policy: { operationalScope: 'ordinary-production', providerProcessingVersion: 'v35', liveTransmissionAllowed: true, authorizedLiveTransmissionCount: 'bounded-by-run' }, admittedUserMessages: new Set() };
    const retrieval = new RetrievalIndex([]);
    const tools = new PlatformToolSession({ binding, retrieval, purpose: 'protocol-reasoning',
      scope: { currentBindingDigest: () => digest, acceptedOutputDigests: new Set() } });
    const ledgerRoot = mkdtempSync(join(tmpdir(), 'ai7-reasoning-ledger-'));
    let ticket: TransmitTicket | null = null;
    const handle = await prepareExecution({ sessionLogRoot: ledgerRoot, sessionId: crypto.randomUUID(), route, model: model.model, reasoningEffort: effort,
      systemPrompt: binding.systemPrompt, promptContractDigest: DIALOGUE_PROMPT_CONTRACT_DIGEST,
      localTools: tools, localToolsRule: LOCAL, compositionOptions: { version: 2, localTools: LOCAL },
      gate: (payload) => { captured.push(payload); const decision = evaluateEgress(payload, binding, tools.egressScope);
        decisions.push(decision.decision === 'refuse' ? `${decision.reason}: ${decision.detail}; effort=${payload.reasoningEffort ?? 'unset'}` : decision.decision); return decision; }, onTransmitTicket: (issued) => { ticket = issued; },
      adapterFactory: (codes) => new DeepSeekOpenAiCompatibleAdapter({ codes, profile, modelProfile: model, reasoningEffort: effort,
        broker: new CredentialBroker({ resolve: async () => 'synthetic-protocol-placeholder' }),
        slotBinding: { bindingDigest: digest, modelRole: 'Fast Interaction Role', slot: profile.credentialSlot, credentialReference: crypto.randomUUID() },
        tickets: { take: () => { const issued = ticket; ticket = null; return issued; } }, attribution: () => ({}), sessionId: () => handle.currentSessionId(),
        promptContractDigest: DIALOGUE_PROMPT_CONTRACT_DIGEST, ...(stream ? { requestShape: 'editorial-dialogue-sse' } : {}),
        transport: async (_url, init) => { bodies.push(JSON.parse(init.body)); if (family === 'openai-responses') expect(bodies.at(-1)).toMatchObject({ store: false, include: ['reasoning.encrypted_content'] }); const fixture = reasoningWireResponse(family, bodies.length, bodies.at(-1)!);
          return new Response(stream ? fixture.sse : JSON.stringify(fixture.body), { headers: { 'content-type': stream ? 'text/event-stream' : 'application/json' } }); } }),
    });
    try {
      handle.bindExecution({ harnessSessionId: handle.sessionId, behaviorCompositionDigest: handle.composition.digest, promptContractDigest: DIALOGUE_PROMPT_CONTRACT_DIGEST });
      tools.startUnit();
      const outcome = await handle.submitUnit(buildDialogueMessage({ kind: 'ask', selection: '公开协议测试', question: '核对协议。', kept: null }));
      expect(outcome.terminal, JSON.stringify({ decisions, signals: outcome.signals })).toBe('completed');
      expect(bodies).toHaveLength(3);
      for (const body of bodies) if (effort === 'off') expect(body.reasoning).toBeUndefined(); else expect(body).toMatchObject(family === 'openai-responses' ? { reasoning: { effort } }
        : family === 'anthropic-messages' ? { output_config: { effort } }
          : family === 'google-generate-content' ? { generationConfig: { thinkingConfig: { thinkingLevel: effort } } } : { reasoning_effort: effort });
      for (const index of [1, 2]) expect(reasoningHistory(bodies[index]!, family)).toEqual(Array.from({ length: index }, (_, prior) => reasoningWireResponse(family, prior + 1, bodies[prior]!).native));
      const payload = captured[2]!;
      const changed = { ...payload, messages: payload.messages.map((message) => message.source.replayState === undefined ? message :
        { ...message, source: { ...message.source, replayState: { family, items: [{ type: 'thinking', signature: 'substituted' }] } } }) };
      expect(payloadDigest(changed)).not.toBe(payloadDigest(payload));
      expect(payloadDigest({ ...payload, reasoningEffort: 'different-level' })).not.toBe(payloadDigest(payload));
      const ledger = readdirSync(ledgerRoot).map((file) => readFileSync(join(ledgerRoot, file), 'utf8')).join('');
      for (const raw of ['Synthetic protocol state', 'synthetic-signature-', 'synthetic-encrypted-', 'reasoning_content', 'thoughtSignature', 'encrypted_content', 'redacted_thinking']) expect(ledger).not.toContain(raw);
      expect(ledger).toContain('replayStateDigest');
      expect(ledger).toContain('Protocol result.');
      expect(evaluateEgress(changed, binding, tools.egressScope)).toMatchObject({ decision: 'refuse', reason: 'payload-out-of-scope' });
      expect(evaluateEgress({ ...payload, reasoningEffort: 'different-level' }, binding, tools.egressScope)).toMatchObject({ decision: 'refuse', reason: 'payload-out-of-scope' });
    } finally { await handle.finish(); retrieval.dispose(); rmSync(ledgerRoot, { recursive: true, force: true }); }
  });
});
