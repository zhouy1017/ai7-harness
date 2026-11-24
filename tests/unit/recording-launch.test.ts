import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { expect, it, vi } from 'vitest';
import { ModelRequestGovernor } from '../../src/service/analysis/execution.js';
import { dialogueLiveRoute, dialogueRouteRefusal } from '../../src/service/dialogue/dialogue-execution.js';
import { fastRoleLiveRoutes, FastRoleExecutionOwner } from '../../src/service/fast-role/fast-role-execution.js';
import { standardsTable } from '../../src/service/fast-role/flash-task-contract.js';
import { developerLiveBindingFor, resolveDeveloperLiveLaunch, resolveSourceCheckoutLaunchPolicySync, type DeveloperLiveLaunch } from '../../src/service/launch-policy.js';
import { PROVIDER_ROUTE_PROFILES } from '../../src/service/provider/deepseek-adapter.js';
import { recordingProviderFor, type RecordingProvider } from '../../src/service/recording-launch.js';
import { CONFIGURED_RUNTIME_MODEL_TABLE } from '../../src/shared/provider-configuration.generated.js';
import { SAMPLE1_PUBLIC_SAMPLEBOOK } from '../../src/shared/public-samplebooks.js';
import { isModelCallLine, ProviderResultCache } from '../../src/service/provider/provider-result-cache.js';
import { transmitOnce } from '../../src/service/provider/live-transmission.js';
import { parseValidationCase } from '../../src/shared/protocol.js';
import { liveNonWebReviewAllowed } from '../../src/service/analysis/live-kind-admission.js';

const root = process.cwd();
const providers = CONFIGURED_RUNTIME_MODEL_TABLE.recordingProviders;
const launchOf = (id: RecordingProvider, caseId: string, providerCacheRoot = root): DeveloperLiveLaunch => {
  const named = parseValidationCase(`four-provider-recording-${id}/${caseId}`);
  if (named === null) throw new Error('Invalid recording case');
  const validation = { ...named, delta: null };
  return { validation, recordingProvider: recordingProviderFor(validation, {})!, providerCacheRoot,
    runBudgetCeiling: { kind: 'tokens', maxTotalTokens: 20000 } };
};
const policyFor = (launch: DeveloperLiveLaunch) =>
  resolveSourceCheckoutLaunchPolicySync(root, 'developer-live', null, null, undefined, launch);

it.each(Object.keys(providers) as RecordingProvider[])('freezes %s by the product task roles', id => {
  const launch = launchOf(id, 'standards-table-formatting');
  const rules = policyFor(launch).providerProcessing.admittedRules;
  const model = (kind: string) => rules.find(rule => rule.taskKinds.includes(kind))?.model;
  expect(model('baseline-manuscript-analysis')).toBe(providers[id].pro.model);
  expect(model('editorial-dialogue')).toBe(providers[id].flash.model);
  expect(model('standards-table-formatting')).toBe(providers[id].flash.model);
  expect(model('retrieval-query-expansion')).toBeUndefined();
  expect(developerLiveBindingFor(launch, 'learning-curation').model).toBe(providers[id].pro.model);
  const effort = id === 'openai-platform' || id === 'anthropic-claude' ? 'high' : undefined;
  expect(developerLiveBindingFor(launch, 'learning-curation').reasoningEffort).toBe(effort);
  expect(developerLiveBindingFor(launch, 'standards-table-formatting').reasoningEffort).toBe(effort);
  expect(PROVIDER_ROUTE_PROFILES[providers[id].pro.route].credentialSlot).toBe(providers[id].pro.credentialSlot);
});

it('refuses CI and unknown selections, with no recording admission under development-ci or the old launch', () => {
  const launch = launchOf('openai-platform', 'standards-table-formatting');
  for (const key of ['CI', 'GITHUB_ACTIONS', 'AI7_E2E_JOURNEY']) {
    expect(() => recordingProviderFor(launch.validation!, { [key]: '' })).toThrow('RECORDING_LAUNCH_NOT_ADMITTED');
  }
  expect(() => recordingProviderFor({ ...launch.validation!, family: 'four-provider-recording-unconfigured' }, {})).toThrow('RECORDING_LAUNCH_NOT_ADMITTED');
  const ci = resolveSourceCheckoutLaunchPolicySync(root, 'development-ci', null, null, undefined, launch);
  expect(ci.providerProcessing.admittedRules).toEqual([]);
  const legacy = resolveSourceCheckoutLaunchPolicySync(root, 'developer-live');
  expect(legacy.providerProcessing.admittedRules.every(rule => rule.model === CONFIGURED_RUNTIME_MODEL_TABLE.developerLive.model)).toBe(true);
  expect(legacy.providerProcessing.admittedRules.some(rule => rule.taskKinds.includes('standards-table-formatting'))).toBe(false);
});

it('selects the provider through the trusted launch form and keeps the cache outside the checkout', () => {
  const { validation } = launchOf('anthropic-claude', 'learning-curation');
  const form = { trustedOperationalScope: 'developer-live' as const, runBudgetCeiling: 20000, validation,
    providerCacheRoot: join(dirname(root), 'synthetic-cache') };
  expect(resolveDeveloperLiveLaunch(form, root).recordingProvider).toBe('anthropic-claude');
  expect(() => resolveDeveloperLiveLaunch({ ...form, providerCacheRoot: join(root, 'synthetic-cache') }, root))
    .toThrow('PROVIDER_CACHE_ROOT_INSIDE_CHECKOUT');
});

it('refuses a non-SampleBook editorial dialogue on the selected route', () => {
  const launch = launchOf('google-gemini', 'editorial-dialogue');
  const resolver = { resolve: vi.fn(async () => null) };
  const runtime = { launch, nativeFetch: vi.fn<typeof fetch>() };
  const live = dialogueLiveRoute(runtime, policyFor(launch), resolver);
  expect(live.route?.profile.route).toBe(providers['google-gemini'].flash.route);
  expect(dialogueRouteRefusal({ fixture: null, live }, 'a'.repeat(64))).not.toBeNull();
  expect(dialogueRouteRefusal({ fixture: null, live }, SAMPLE1_PUBLIC_SAMPLEBOOK.sha256)).toBeNull();
  expect(runtime.nativeFetch).not.toHaveBeenCalled();
  expect(resolver.resolve).not.toHaveBeenCalled();
});

it.each(['publication-risk', 'plot-consistency'])('admits the %s review only under its named recording case', category => {
  const kind = 'editorial-review/' + category;
  const launch = launchOf('openai-platform', category);
  const route = policyFor(launch).providerProcessing.admittedRules.find(rule => rule.taskKinds.includes(kind));
  expect(route).toMatchObject({ ruleId: 'recording-080-review', taskKinds: [kind], model: providers['openai-platform'].pro.model });
  expect(liveNonWebReviewAllowed(policyFor(launch), kind)).toBe(true);
  expect(liveNonWebReviewAllowed(policyFor(launchOf('openai-platform', 'review')), kind)).toBe(false);
  expect(liveNonWebReviewAllowed(resolveSourceCheckoutLaunchPolicySync(root, 'development-ci'), kind)).toBe(false);
});

it('keeps a recording-only Flash request on the once-only cache and refuses unapproved material', async () => {
  const directory = await mkdtemp(join(await realpath(tmpdir()), 'ai7-recording-launch-'));
  try {
    const launch = launchOf('anthropic-claude', 'standards-table-formatting', directory);
    const nativeFetch = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({
      content: [{ type: 'text', text: '{"items":[{"paragraph":1,"recommended":"样例甲","discouraged":["样例乙"]}]}' }],
      stop_reason: 'end_turn', usage: { input_tokens: 11, output_tokens: 7 },
    })));
    const resolver = { resolve: vi.fn(async () => 'synthetic-value') };
    const owner = new FastRoleExecutionOwner({ requestGovernor: new ModelRequestGovernor(), fixture: null,
      live: fastRoleLiveRoutes({ launch, nativeFetch }, policyFor(launch), resolver) });
    try {
      expect((await owner.execute(standardsTable, ['未经核对的材料'], 'preview')).state).toBe('fallback');
      expect(resolver.resolve).not.toHaveBeenCalled();
      const source = ['统一写作「样例甲」，不用「样例乙」。'];
      expect((await owner.execute(standardsTable, source, 'preview')).state).toBe('checked');
      expect((await owner.execute(standardsTable, source, 'preview')).state).toBe('checked');
      expect(nativeFetch).toHaveBeenCalledTimes(1);
      expect(JSON.parse(String(nativeFetch.mock.calls[0]?.[1]?.body))).toMatchObject({ thinking: { type: 'adaptive' }, output_config: { effort: 'high' } });
    } finally { owner.dispose(); }
  } finally { await rm(directory, { recursive: true, force: true }); }
});

it('pauses a second recording call before its durable claim and keeps exact cache replay available', async () => {
  const directory = await mkdtemp(join(await realpath(tmpdir()), 'ai7-probe-limit-'));
  const observer = Symbol.for('ai7.manual-recording.send-observer');
  try {
    const launch = launchOf('openai-platform', 'publication-risk', directory);
    const model = providers['openai-platform'].pro.model;
    const profile = PROVIDER_ROUTE_PROFILES['openai-platform'];
    const cache = new ProviderResultCache(directory);
    await cache.open();
    const settled = vi.fn();
    const enter = vi.fn().mockResolvedValueOnce(settled).mockResolvedValue(null);
    Object.defineProperty(globalThis, observer, { value: { enter, refuse: vi.fn() }, configurable: true });
    const nativeFetch = vi.fn(async () => new Response(JSON.stringify({ status: 'completed', output: [{ type: 'message', role: 'assistant',
      content: [{ type: 'output_text', text: '合成答复。' }] }], usage: { input_tokens: 20, output_tokens: 5 } })));
    const send = (step: string) => transmitOnce(cache, nativeFetch, { purpose: 'review-first', promptContractDigest: 'a'.repeat(64) },
      { intent: launch.validation!, step, requestShape: 'openai-responses' }, profile, model, profile.endpoint,
      { method: 'POST', headers: {}, body: JSON.stringify({ model, reasoning: { effort: 'high' }, input: [{ role: 'user', content: step }] }) });
    await expect(send('unit-1')).resolves.toMatchObject({ status: 200 });
    await expect(send('unit-1')).resolves.toMatchObject({ replayed: true });
    await expect(send('unit-2')).rejects.toMatchObject({ code: 'RECORDING_RUNBOOK_PAUSED' });
    expect(enter.mock.calls.map(([facts]) => [facts.step, facts.effort])).toEqual([['unit-1', 'high'], ['unit-2', 'high']]);
    expect(nativeFetch).toHaveBeenCalledTimes(1);
    expect(settled).toHaveBeenCalledExactlyOnceWith('answered', 'OK');
    expect(cache.lines.filter(isModelCallLine).map(line => line.outcome)).toEqual(['transmitted', 'replayed']);
  } finally {
    Reflect.deleteProperty(globalThis, observer);
    await rm(directory, { recursive: true, force: true });
  }
});
