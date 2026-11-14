import net from 'node:net';
import tls from 'node:tls';
import { describe, expect, it, vi } from 'vitest';
import { ModelRequestGovernor } from '../../src/service/analysis/execution.js';
import { resolveSourceCheckoutLaunchPolicySync } from '../../src/service/launch-policy.js';
import { testModelServiceConnection } from '../../src/service/fast-role/fast-role-execution.js';
import { CredentialBroker } from '../../src/service/provider/credential-broker.js';
import { DeepSeekOpenAiCompatibleAdapter, DEEPSEEK_ROUTE_PROFILE } from '../../src/service/provider/deepseek-adapter.js';
import { EgressTicketBook, evaluateEgress, evaluatePublicSourceFetch, DEEPSEEK_ROUTE, type EgressBindingFacts } from '../../src/service/provider/egress-gate.js';
import { refreshModelServiceModels } from '../../src/service/provider/model-discovery.js';
import { toolArgumentsDigest } from '../../src/service/provider/platform-tools.js';
import { fetchPublicSource } from '../../src/service/provider/public-source-fetch.js';
import { probeProxy } from '../../src/service/provider/proxy-setting.js';
import { composeSearchCandidateProbe, platformToolsFromProjection, probeConfiguredSearchBackend } from '../../src/service/provider/search-service.js';
import { SEARCH_BACKEND_CANDIDATES, SEARCH_BACKENDS } from '../../src/service/provider/search-backends.js';
import { installNodeNetworkDenial, admitTicketHost, hostAllowanceSet } from '../../src/shared/network-denial.js';
import type { EditorialStore } from '../../src/service/store.js';
import type { GenerateOptions } from '@deepseek-ai/dsh-llm';

// Observe the primitives beneath the real process denial. Even a regression cannot open a real socket.
const socket = vi.fn(() => { throw new Error('unexpected socket'); });
Object.defineProperty(net, 'connect', { configurable: true, writable: true, value: socket });
Object.defineProperty(tls, 'connect', { configurable: true, writable: true, value: socket });
installNodeNetworkDenial();
const ci = resolveSourceCheckoutLaunchPolicySync('/absent', 'development-ci');
const developer = resolveSourceCheckoutLaunchPolicySync('/absent', 'developer-live');
const readSecret = vi.fn(async () => null);
const broker = new CredentialBroker({ resolve: readSecret });
const send = vi.fn(async (): Promise<never> => { throw new Error('unexpected sender'); });
const readConnection = vi.fn((): never => { throw new Error('unexpected connection read'); });
const store = { getModelServiceRouteConnection: readConnection } as unknown as EditorialStore;
const digest = 'a'.repeat(64);
const binding: EgressBindingFacts = { bindingDigest: digest, route: DEEPSEEK_ROUTE,
  model: 'synthetic-model', systemPrompt: '', admittedUserMessages: new Set(['公开合成测试']), outboundDataCategory: 'public-or-synthetic',
  policy: { operationalScope: 'development-ci', providerProcessingVersion: 'v1', liveTransmissionAllowed: false, authorizedLiveTransmissionCount: 0 },
  platformTools: platformToolsFromProjection(developer.providerProcessing.admittedRules.find((recipe) => recipe.platformTools !== null)) };
const scope = { currentBindingDigest: () => digest, acceptedOutputDigests: new Set<string>() };

function untouched(): void {
  expect(socket).not.toHaveBeenCalled(); expect(send).not.toHaveBeenCalled();
  expect(readSecret).not.toHaveBeenCalled(); expect(readConnection).not.toHaveBeenCalled();
  expect(hostAllowanceSet()).toEqual([]);
}

describe('development-ci entry points block every live path without a socket (#1453)', () => {
  it('blocks the model adapter before credential release or transport', async () => {
    const request: GenerateOptions = { provider: binding.route, model: binding.model, system: '',
      messages: [{ id: 'synthetic' as never, role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: '公开合成测试' }] }] };
    expect(evaluateEgress(request, binding, scope)).toMatchObject({ decision: 'refuse', reason: 'remote-route-denied-under-v1' });
    const adapter = new DeepSeekOpenAiCompatibleAdapter({ broker, slotBinding: { bindingDigest: digest,
      modelRole: 'Main Editorial Role', slot: DEEPSEEK_ROUTE_PROFILE.credentialSlot, credentialReference: '11111111-1111-4111-8111-111111111111' },
      tickets: { take: () => null }, attribution: () => ({}), promptContractDigest: digest,
      codes: { QUOTA_EXCEEDED_CODE: 'quota', INVALID_CREDENTIAL_CODE: 'credential', CONTEXT_WINDOW_EXCEEDED_CODE: 'context' }, transport: send });
    const chunks = [];
    for await (const chunk of adapter.stream(request)) chunks.push(chunk);
    expect(chunks.at(-1)).toMatchObject({ type: 'finish', reason: { kind: 'error' } });
    expect(adapter.transmissions).toBe(0);
    untouched();
  });

  it.each(SEARCH_BACKEND_CANDIDATES.filter((candidate) => candidate.fetch === null))
    ('blocks native search $backendId before model/search credential reads', async (candidate) => {
      await expect(composeSearchCandidateProbe({ backendId: candidate.backendId, candidateId: candidate.candidateId,
        operationalScope: 'development-ci', launchPolicy: ci, connection: readConnection, modelConnection: readConnection,
        broker, fetch: send, admitHost: admitTicketHost })).rejects.toMatchObject({ code: 'SEARCH_CANDIDATE_PROBE_SCOPE_REFUSED' });
      untouched();
    });

  it('blocks public-fetch admission and rejects an unissued ticket at the fetch entry point', async () => {
    const book = EgressTicketBook.open({ ...binding, policy: { operationalScope: 'developer-live', providerProcessingVersion: 'v24', liveTransmissionAllowed: true, authorizedLiveTransmissionCount: 'bounded-by-run' } }, scope);
    const url = 'https://example.org/';
    expect(evaluatePublicSourceFetch({ arguments: { tool: 'webfetch', url } }, binding, scope, book))
      .toMatchObject({ decision: 'refuse', reason: 'remote-route-denied-under-v1' });
    await expect(fetchPublicSource({ book, ticket: { decision: 'fetch-public-source', ticketId: 'unissued',
      bindingDigest: digest, host: 'example.org', url, argumentsDigest: toolArgumentsDigest({ tool: 'webfetch', url }) },
      fetch: send, admitHost: admitTicketHost })).rejects.toMatchObject({ code: 'PLATFORM_TOOL_TICKET_REFUSED' });
    untouched();
  });

  it('blocks model discovery with the CI null runtime before inspecting a connection', async () => {
    expect(await refreshModelServiceModels(store, null, 'opencode-go', { resolve: readSecret }))
      .toMatchObject({ status: 'failure', code: 'MODEL_SERVICE_UNREACHABLE' });
    untouched();
  });

  it('blocks the explicit model connection test with the CI null runtime', async () => {
    const governor = new ModelRequestGovernor();
    try {
      await expect(testModelServiceConnection(store, '/absent', null, { route: 'opencode-go', modelId: 'synthetic-model' },
        { resolve: readSecret }, { requestGovernor: governor })).rejects.toMatchObject({ code: 'MODEL_CONNECTION_TEST_UNAVAILABLE' });
      untouched();
    } finally { governor.close(); await governor.whenIdle(); }
  });

  it('blocks every shipped search-backend probe and the real proxy CONNECT probe', async () => {
    for (const backend of SEARCH_BACKENDS.filter((entry) => entry.shipped))
      await expect(probeConfiguredSearchBackend({ backendId: backend.id, policy: ci, connection: undefined,
        broker, fetch: send, admitHost: admitTicketHost })).rejects.toMatchObject({ code: 'SEARCH_PROBE_NOT_ADMITTED' });
    expect(await probeProxy({ mode: 'proxy', protocol: 'http', hostPort: 'proxy.invalid:8080' }, DEEPSEEK_ROUTE_PROFILE.endpoint))
      .toMatchObject({ status: 'unreachable' });
    untouched();
  });
});
