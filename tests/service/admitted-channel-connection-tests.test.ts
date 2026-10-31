import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ModelRequestGovernor } from '../../src/service/analysis/execution.js';
import { testModelServiceConnection } from '../../src/service/fast-role/fast-role-execution.js';
import { EditorialStore } from '../../src/service/store.js';
import type { ModelServiceRouteId } from '../../src/shared/protocol.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';

// Issue #1225: the explicit synthetic text connection test on the channels W22b-A2 makes usable. A stub transport answers in each
// family's own shape; the resolver returns a public placeholder, never a credential value, and no live provider is called.
let roots: ServiceTestRoots;
let store: EditorialStore | undefined;
let requestGovernor: ModelRequestGovernor;
beforeEach(async () => { roots = await createServiceTestRoots('ai7-channel-tests-'); requestGovernor = new ModelRequestGovernor(); });
afterEach(async () => { store?.close(); store = undefined; requestGovernor.close(); await requestGovernor.whenIdle(); await roots.dispose(); });

async function saved(route: ModelServiceRouteId): Promise<EditorialStore> {
  store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
  store.saveModelServiceConnection(`Synthetic ${route}`, null, 'ready', route);
  return store;
}

/** A family fixture case's recorded response, served once for the one request the test sends. */
function fixtureTransport(family: string, name: string, answer?: string): ReturnType<typeof vi.fn> {
  const response = JSON.parse(readFileSync(`tests/fixtures/model/provider-families/${family}.json`, 'utf8')).cases.find((entry: { name: string }) => entry.name === name).response;
  const body = answer === undefined ? response.body : JSON.parse(JSON.stringify(response.body).replace('合成回答。', answer));
  return vi.fn(async () => ({ status: response.status, headers: new Headers(), json: async () => body, text: async () => JSON.stringify(body) }));
}

describe('the connection test on the admitted channels', () => {
  it.each([['anthropic-claude', 'claude-opus-5', 'anthropic-messages'], ['google-gemini', 'gemini-3.8-flash', 'google-generate-content']] as const)(
    'passes %s %s through its own family adapter, which then serves both roles (#1225)', async (route, modelId, family) => {
      const target = await saved(route);
      const nativeFetch = fixtureTransport(family, 'text', 'AI7_OK');
      const status = await testModelServiceConnection(target, roots.codeRoot, { scope: 'ordinary-production', nativeFetch: nativeFetch as unknown as typeof fetch },
        { route, modelId }, { resolve: async () => 'public-placeholder' }, { requestGovernor });
      expect(status).toMatchObject({ modelId, outcome: 'passed', code: null, verified: 'buffered-text-only', provenance: { route, model: modelId, policyVersion: 'v32' } });
      expect(nativeFetch).toHaveBeenCalledTimes(1);
      expect(String(nativeFetch.mock.calls[0]![0])).toContain(route === 'anthropic-claude' ? 'https://api.anthropic.com/v1/messages' : `/models/${modelId}:generateContent`);
      target.selectModelServiceRoute(route);
      target.selectFastRoleModel(route, modelId);
      expect([target.getConfiguredModelRoleBinding('main-editorial')?.model, target.getConfiguredModelRoleBinding('fast-interaction')?.model]).toEqual([modelId, modelId]);
    });

  it.each([['anthropic-claude', 'claude-opus-5', 'anthropic-messages'], ['google-gemini', 'gemini-3.8-flash', 'google-generate-content']] as const)(
    'records %s %s account limit as a failed test, sent once and never retried (#1225)', async (route, modelId, family) => {
      const target = await saved(route);
      const nativeFetch = fixtureTransport(family, 'account-limit');
      const status = await testModelServiceConnection(target, roots.codeRoot, { scope: 'ordinary-production', nativeFetch: nativeFetch as unknown as typeof fetch },
        { route, modelId }, { resolve: async () => 'public-placeholder' }, { requestGovernor });
      expect([status.outcome, typeof status.code, nativeFetch.mock.calls.length]).toEqual(['failed', 'string', 1]);
      expect(target.getModelServiceRouteConnection(route)?.connectionTest).toEqual(status);
      expect(() => target.selectModelServiceRoute(route)).toThrow(expect.objectContaining({ code: 'MODEL_CONNECTION_TEST_REQUIRED' }));
    });

  it.each([['opencode-zen', 'minimax-m3', 'untested:text'], ['google-gemini', 'gemini-0-unknown', 'not-declared']] as const)(
    'refuses %s %s by its disposition (%s) before any secret, ticket or transport', async (route, modelId, reason) => {
      const target = await saved(route);
      const resolver = { resolve: vi.fn(async () => 'public-placeholder') };
      const nativeFetch = vi.fn();
      await expect(testModelServiceConnection(target, roots.codeRoot, { scope: 'ordinary-production', nativeFetch: nativeFetch as unknown as typeof fetch },
        { route, modelId }, resolver, { requestGovernor })).rejects.toThrow(`（${reason}）`);
      expect([resolver.resolve.mock.calls.length, nativeFetch.mock.calls.length]).toEqual([0, 0]);
      expect(target.getModelServiceRouteConnection(route)?.connectionTest).toBeNull();
    });
});
