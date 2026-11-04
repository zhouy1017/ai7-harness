import { fileURLToPath } from 'node:url';
import { loadModelFixture } from '../../src/service/provider/model-fixture.js';
import { Ai7LocalDeterministicAdapter } from '../../src/service/provider/local-deterministic-adapter.js';
import { SAMPLE1_PUBLIC_SAMPLEBOOK } from '../../src/shared/public-samplebooks.js';
import { LOCAL_DETERMINISTIC_ROUTE, LOCAL_DETERMINISTIC_MODEL } from '../../src/service/provider/egress-gate.js';
import { expect, it } from 'vitest';
import { fixtureEntryKey, fixtureReplayContentKey, resolveFixtureEntry, resolveReplayCompatibleFixtureEntry, type ResolvedModelFixture } from '../../src/service/provider/model-fixture.js';

it('resolves only an explicitly indexed downstream stage/content key and leaves exact request keys intact', () => {
  const source = 'a'.repeat(64), prompt = 'b'.repeat(64), requestDigest = 'c'.repeat(64);
  const contentKey = fixtureReplayContentKey(source, prompt, { stageContractDigest: 'd'.repeat(64) });
  const entry = { unitOrdinal: 0, requestDigest, attempt: null, contentDigest: null,
    response: { kind: 'unit-result' as const, text: '{"items":[]}', usage: { inputTokens: 1, outputTokens: 2 } } };
  const fixture: ResolvedModelFixture = { identity: 'synthetic', description: '', provenance: 'authored', lineage: [], sha256: 'e'.repeat(64),
    entries: new Map([[fixtureEntryKey(0, requestDigest), entry]]),
    replayCompatibility: [{ mode: 'replay-compat', stage: 'reflection', contentKey, requestDigest, reason: 'Synthetic dependency result changed.' }] };
  expect(resolveFixtureEntry(fixture.entries, 0, 'f'.repeat(64), 1)).toBeUndefined();
  expect(resolveReplayCompatibleFixtureEntry(fixture, 'reflection', contentKey)).toBe(entry);
  expect(resolveReplayCompatibleFixtureEntry(fixture, 'reduction', contentKey)).toBeUndefined();
  expect(resolveReplayCompatibleFixtureEntry(fixture, 'reflection', fixtureReplayContentKey('f'.repeat(64), prompt))).toBeUndefined();
  expect(resolveReplayCompatibleFixtureEntry({ ...fixture, replayCompatibility: [] }, 'reflection', contentKey)).toBeUndefined();
  expect(entry.requestDigest).toBe(requestDigest);
});

it.each(['sample1-recorded-v41-writing-draft', 'sample1-recorded-v41-editorial-writing-draft'])('replays %s synthesis after its closed-unit set changes under the same source and prompt', async (identity) => {
  const fixture = await loadModelFixture(fileURLToPath(new URL('../fixtures/model/', import.meta.url)), identity);
  const recording = [...fixture.entries.values()].find((entry) => entry.capture?.subject === 'task-synthesis')!;
  const prompt = recording.capture!.taskPromptContractDigest!;
  const stage = fixture.replayCompatibility?.find((entry) => entry.stage === 'writing-synthesis');
  expect(stage?.contentKey).toBe(fixtureReplayContentKey(SAMPLE1_PUBLIC_SAMPLEBOOK.sha256, prompt, { stageContractDigest: prompt }));
  const adapter = new Ai7LocalDeterministicAdapter(fixture, prompt, { QUOTA_EXCEEDED_CODE: 'QUOTA_EXCEEDED', INVALID_CREDENTIAL_CODE: 'INVALID_CREDENTIAL', CONTEXT_WINDOW_EXCEEDED_CODE: 'CONTEXT_WINDOW_EXCEEDED' }, { replaySourceDigest: SAMPLE1_PUBLIC_SAMPLEBOOK.sha256 });
  let content = false;
  for await (const chunk of adapter.stream({ provider: LOCAL_DETERMINISTIC_ROUTE, model: LOCAL_DETERMINISTIC_MODEL,
    messages: [{ role: 'user', content: [{ type: 'text', text: `写作综合 8/8 · 段落摘要 ${'f'.repeat(64)}` }] }] } as Parameters<Ai7LocalDeterministicAdapter['stream']>[0])) {
    if (chunk.type === 'text-delta') content = true;
  }
  expect(adapter.servedRequests).toBe(1);
  expect(content).toBe(true);
});
