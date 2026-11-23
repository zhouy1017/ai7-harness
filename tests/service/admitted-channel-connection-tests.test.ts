import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ModelRequestGovernor } from '../../src/service/analysis/execution.js';
import { testModelServiceConnection } from '../../src/service/fast-role/fast-role-execution.js';
import { modelRequestNotSent } from '../../src/service/provider/deepseek-adapter.js';
import { proxyAwareFetch } from '../../src/service/provider/proxy-setting.js';
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
function fixtureTransport(family: string, name: string, answer?: string, returnedModel?: string | null): ReturnType<typeof vi.fn> {
  const response = JSON.parse(readFileSync(`tests/fixtures/model/provider-families/${family}.json`, 'utf8')).cases.find((entry: { name: string }) => entry.name === name).response;
  const body = answer === undefined ? response.body : JSON.parse(JSON.stringify(response.body).replace('合成回答。', answer));
  const modelField = family === 'google-generate-content' ? 'modelVersion' : 'model';
  if (returnedModel === null) delete body[modelField];
  else if (returnedModel !== undefined) body[modelField] = returnedModel;
  return vi.fn(async () => ({ status: response.status, headers: new Headers(), json: async () => body, text: async () => JSON.stringify(body) }));
}

describe('the connection test on the admitted channels', () => {
  it('retains a passing answer without splitting a Unicode code point at the storage limit (#1311)', async () => {
    const target = await saved('google-gemini');
    const nativeFetch = fixtureTransport('google-generate-content', 'text', 'a'.repeat(3999) + '😀', 'account-new-model');
    const status = await testModelServiceConnection(target, roots.codeRoot, { scope: 'ordinary-production', nativeFetch: nativeFetch as unknown as typeof fetch },
      { route: 'google-gemini', modelId: 'account-new-model' }, { resolve: async () => 'public-placeholder' }, { requestGovernor });
    expect(status.outcome).toBe('passed');
    const kept = target.getModelServiceRouteConnection('google-gemini')?.connectionTest;
    expect(kept?.outcome).toBe('passed');
    expect(kept?.responseText).toBe('a'.repeat(3999));
    expect(kept?.responseText?.isWellFormed()).toBe(true);
    expect(nativeFetch).toHaveBeenCalledTimes(1);
  });
  it.each(['`AI7_OK`。', '"ai7-ok"!', '模型连接成功。'])('accepts and retains a nonempty probe answer: %s (#1311)', async (answer) => {
    const target = await saved('google-gemini');
    const nativeFetch = fixtureTransport('google-generate-content', 'text', answer.replaceAll('"', '\\"'), 'account-new-model');
    const status = await testModelServiceConnection(target, roots.codeRoot, { scope: 'ordinary-production', nativeFetch: nativeFetch as unknown as typeof fetch },
      { route: 'google-gemini', modelId: 'account-new-model' }, { resolve: async () => 'public-placeholder' }, { requestGovernor });
    expect(status).toMatchObject({ outcome: 'passed', code: null, responseText: answer });
    expect(target.getModelServiceRouteConnection('google-gemini')?.connectionTest?.responseText).toBe(answer);
    expect(nativeFetch).toHaveBeenCalledTimes(1);
  });
  it.each(['MODEL_SERVICE_UNREACHABLE', 'AI7_PROXY_UNREACHABLE'])('records %s as a failed connection test, preserving no-send proof (#1305)', async (code) => {
    const target = await saved('google-gemini');
    const nativeFetch = code === 'MODEL_SERVICE_UNREACHABLE'
      ? proxyAwareFetch(globalThis.fetch, async () => ({ mode: 'direct' }), undefined, undefined,
        (_options, callback) => callback(new Error('observed connector failure'), null))
      : async (_url: unknown, init?: RequestInit) => { throw modelRequestNotSent(init!, Object.assign(new Error('proxy connection refused'), { code })); };
    const status = await testModelServiceConnection(target, roots.codeRoot, { scope: 'ordinary-production', nativeFetch },
      { route: 'google-gemini', modelId: 'account-new-model' }, { resolve: async () => 'public-placeholder' }, { requestGovernor });
    expect(status).toMatchObject({ outcome: 'failed', code });
    expect(target.getModelServiceRouteConnection('google-gemini')?.connectionTest).toEqual(status);
  });

  it.each([['anthropic-claude', 'claude-opus-5', 'anthropic-messages'], ['google-gemini', 'gemini-3.8-flash', 'google-generate-content']] as const)(
    'passes %s %s through its own family adapter, which then serves both roles (#1225)', async (route, modelId, family) => {
      const target = await saved(route);
      const nativeFetch = fixtureTransport(family, 'text', 'AI7_OK', modelId);
      const status = await testModelServiceConnection(target, roots.codeRoot, { scope: 'ordinary-production', nativeFetch: nativeFetch as unknown as typeof fetch },
        { route, modelId }, { resolve: async () => 'public-placeholder' }, { requestGovernor });
      expect(status).toMatchObject({ modelId, outcome: 'passed', code: null, verified: 'buffered-text-only', provenance: { route, model: modelId, policyVersion: 'v36' } });
      expect(nativeFetch).toHaveBeenCalledTimes(1);
      expect(String(nativeFetch.mock.calls[0]![0])).toContain(route === 'anthropic-claude' ? 'https://api.anthropic.com/v1/messages' : `/models/${modelId}:generateContent`);
      target.selectModelServiceRoute(route);
      target.selectFastRoleModel(route, modelId);
      expect([target.getConfiguredModelRoleBinding('main-editorial')?.model, target.getConfiguredModelRoleBinding('foreground-flash')?.model]).toEqual([modelId, modelId]);
    });

  it.each([['anthropic-claude', 'claude-opus-5', 'anthropic-messages'], ['google-gemini', 'gemini-3.8-flash', 'google-generate-content']] as const)(
    'records %s %s account limit as a failed test, sent once and never retried (#1225)', async (route, modelId, family) => {
      const target = await saved(route);
      const nativeFetch = fixtureTransport(family, 'account-limit');
      const status = await testModelServiceConnection(target, roots.codeRoot, { scope: 'ordinary-production', nativeFetch: nativeFetch as unknown as typeof fetch },
        { route, modelId }, { resolve: async () => 'public-placeholder' }, { requestGovernor });
      expect([status.outcome, typeof status.code, nativeFetch.mock.calls.length]).toEqual(['failed', 'string', 1]);
      expect(target.getModelServiceRouteConnection(route)?.connectionTest).toEqual(status);
      expect(() => target.selectModelServiceRoute(route)).not.toThrow();
    });

  // #1582: a Zen model declared on its Messages or Responses route only is sent there with that route's encoder, never as Chat Completions.
  it.each([['claude-opus-5', 'anthropic-messages', 'https://opencode.ai/inference/anthropic/v1/messages'],
    ['gpt-6-sol', 'openai-responses', 'https://opencode.ai/inference/openai/v1/responses']] as const)(
    'sends OpenCode Zen %s on its declared %s route (#1582)', async (modelId, family, endpoint) => {
      const target = await saved('opencode-zen');
      const nativeFetch = fixtureTransport(family, 'text', 'AI7_OK', modelId);
      const status = await testModelServiceConnection(target, roots.codeRoot, { scope: 'ordinary-production', nativeFetch: nativeFetch as unknown as typeof fetch },
        { route: 'opencode-zen', modelId }, { resolve: async () => 'public-placeholder' }, { requestGovernor });
      expect(status).toMatchObject({ modelId, outcome: 'passed', provenance: { model: modelId, endpoint } });
      expect(nativeFetch).toHaveBeenCalledTimes(1);
      const [url, init] = nativeFetch.mock.calls[0]! as [string, RequestInit];
      const body = JSON.parse(String(init.body)) as Record<string, unknown>;
      expect(String(url)).toBe(endpoint);
      expect(body.model).toBe(modelId);
      if (family === 'anthropic-messages') expect([Array.isArray(body.messages), typeof body.max_tokens, 'input' in body]).toEqual([true, 'number', false]);
      else expect([Array.isArray(body.input) || typeof body.input === 'string', typeof body.max_output_tokens, 'messages' in body]).toEqual([true, 'number', false]);
    });

  it.each([['google-generate-content', 'google-gemini', 'requested', 'unrelated', 'failed'],
    ['google-generate-content', 'google-gemini', 'requested', 'models/requested-001', 'passed'],
    ['openai-responses', 'openai-platform', 'requested', 'unrelated', 'failed'],
    ['openai-responses', 'openai-platform', 'requested', 'requested-2026-11-20', 'passed'],
    ['anthropic-messages', 'anthropic-claude', 'claude-haiku-4-5', 'claude-haiku-4-5-20251001', 'passed'],
    ['openai-chat-completions', 'opencode-go', 'requested', null, 'failed'],
    ['openai-chat-completions', 'opencode-go', 'requested', 'requested', 'passed'],
    ['openai-chat-completions', 'opencode-go', 'requested', 'unrelated', 'failed']] as const)(
    'checks %s response identity %s/%s against %s', async (family, route, modelId, returned, outcome) => {
      const target = await saved(route);
      const nativeFetch = fixtureTransport(family, 'text', 'AI7_OK', returned);
      const result = await testModelServiceConnection(target, roots.codeRoot, { scope: 'ordinary-production', nativeFetch: nativeFetch as typeof fetch },
        { route, modelId }, { resolve: async () => 'synthetic-placeholder' }, { requestGovernor });
      expect(result).toMatchObject({ outcome, code: outcome === 'failed' ? 'MODEL_CONNECTION_TEST_RESPONSE_INVALID' : null });
      if (outcome === 'failed') expect(result.responseText).toBeUndefined();
      expect(target.getModelServiceRouteConnection(route)?.connectionTest).toEqual(result);
      expect(nativeFetch).toHaveBeenCalledTimes(1);
    });

  it('tests a dynamic Gemini model ID through its channel adapter', async () => {
    const target = await saved('google-gemini');
    const nativeFetch = fixtureTransport('google-generate-content', 'text', 'AI7_OK', 'account-new-model');
    const status = await testModelServiceConnection(target, roots.codeRoot, { scope: 'ordinary-production', nativeFetch: nativeFetch as unknown as typeof fetch },
      { route: 'google-gemini', modelId: 'account-new-model' }, { resolve: async () => 'public-placeholder' }, { requestGovernor });
    expect(status.outcome).toBe('passed');
    expect(nativeFetch).toHaveBeenCalledTimes(1);
    target.selectFastRoleModel('google-gemini', 'account-new-model');
    target.selectModelServiceRoute('google-gemini');
    expect(target.getConfiguredModelRoleBinding('foreground-flash')?.model).toBe('account-new-model');
    expect(target.getConfiguredModelRoleBinding('main-editorial')?.model).toBe('gemini-3.8-flash');
  });
});
