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
