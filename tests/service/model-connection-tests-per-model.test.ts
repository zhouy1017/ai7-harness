import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EditorialStore, StoreError } from '../../src/service/store.js';
import type { ModelConnectionTestStatus, ModelServiceConnectionProjection } from '../../src/shared/protocol.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';

// Issue #1671 B: the two connection tests of 模型服务 do not overwrite each other. The main model's result keeps the one stored
// slot every build reads; the chosen lighter model's result is held for the life of the service. No provider is called: a result
// is handed to the store as the test would hand it.
const ROUTE = 'google-gemini' as const;
const LIGHTER = 'account-new-model';
let roots: ServiceTestRoots;
let store: EditorialStore;
let clock = Date.parse('2026-11-22T00:00:00.000Z');

beforeEach(async () => {
  roots = await createServiceTestRoots('ai7-connection-tests-per-model-');
  store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
  store.saveModelServiceConnection('Synthetic google-gemini', null, 'ready', ROUTE);
  store.selectFastRoleModel(ROUTE, LIGHTER);
});

afterEach(async () => {
  store.close();
  await roots.dispose();
});

const connection = (): ModelServiceConnectionProjection => store.getModelServiceRouteConnection(ROUTE)!;
const mainModel = (): string => connection().binding.modelId;

function result(modelId: string, answer?: string, credentialUpdatedAt = connection().credentialUpdatedAt): ModelConnectionTestStatus {
  clock += 1_000;
  return { modelId, credentialUpdatedAt, testedAt: new Date(clock).toISOString(), outcome: 'failed', code: 'MODEL_CONNECTION_TEST_UNAVAILABLE',
    verified: 'buffered-text-only', ...(answer === undefined ? {} : { responseText: answer }) };
}

const models = (): Array<string | undefined> => (connection().connectionTests ?? []).map((entry) => entry.modelId);

async function reopen(): Promise<void> {
  store.markCleanShutdown();
  store.close();
  store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
}

describe('one stored result per model, as far as the service lives (Issue #1671)', () => {
  it('keeps both results when the main model and then the lighter model are tested, and the main one when the lighter is tested again', () => {
    expect(mainModel()).not.toBe(LIGHTER);
    expect([connection().connectionTest, connection().connectionTests]).toEqual([null, []]);
    const main = result(mainModel());
    store.recordModelConnectionTest(connection(), main);
    const lighter = result(LIGHTER);
    store.recordModelConnectionTest(connection(), lighter);
    expect(connection().connectionTests).toEqual([lighter, main]);
    // `connectionTest` is still the newest result, as the renderer reads it today.
    expect(connection().connectionTest).toEqual(lighter);
    const again = result(LIGHTER, 'second');
    store.recordModelConnectionTest(connection(), again);
    expect(connection().connectionTests).toEqual([again, main]);
  });

  it('stores the main model\'s result and holds the lighter model\'s only in memory, so a restart reads back the stored one', async () => {
    const main = result(mainModel(), '主模型回答');
    store.recordModelConnectionTest(connection(), main);
    store.recordModelConnectionTest(connection(), result(LIGHTER));
    await reopen();
    expect([connection().connectionTest, connection().connectionTests]).toEqual([main, [main]]);
    // Testing the lighter model first and the main model after: the stored slot is the main model's all the same.
    store.recordModelConnectionTest(connection(), result(LIGHTER));
    await reopen();
    expect(connection().connectionTests).toEqual([main]);
  });

  it('stores a model tested before it was chosen as the single value does today, and holds every model\'s newest result', () => {
    const before = result('some-other-model');
    store.recordModelConnectionTest(connection(), before);
    const main = result(mainModel());
    store.recordModelConnectionTest(connection(), main);
    const lighter = result(LIGHTER);
    store.recordModelConnectionTest(connection(), lighter);
    expect(models()).toEqual([LIGHTER, mainModel(), 'some-other-model']);
    expect(connection().connectionTests).toEqual([lighter, main, before]);
  });

  it('clears every result when the credential changes, and refuses a result for a connection that changed meanwhile', () => {
    const stale = connection();
    store.recordModelConnectionTest(stale, result(mainModel()));
    store.recordModelConnectionTest(stale, result(LIGHTER));
    expect(models()).toHaveLength(2);
    store.saveModelServiceConnection('Synthetic google-gemini', stale.credentialReference, 'ready', ROUTE);
    expect([connection().connectionTest, connection().connectionTests]).toEqual([null, []]);
    for (const modelId of [mainModel(), LIGHTER]) {
      let code = '';
      try { store.recordModelConnectionTest(stale, result(modelId, undefined, stale.credentialUpdatedAt)); } catch (error) { code = error instanceof StoreError ? error.code : String(error); }
      expect(code).not.toBe('');
      expect(connection().connectionTests).toEqual([]);
    }
    // A result the new generation brings is kept again.
    store.recordModelConnectionTest(connection(), result(LIGHTER));
    expect(models()).toEqual([LIGHTER]);
  });

  it('refuses a lighter-model result whose connection is no longer ready, as it does for any other', () => {
    const stale = connection();
    store.setModelServiceCredentialState(stale.credentialReference, 'needs-attention');
    expect(() => store.recordModelConnectionTest(stale, result(LIGHTER))).toThrow(StoreError);
    expect(connection().connectionTests).toEqual([]);
  });

  it('bounds what is held: eight models and four thousand characters of each reply', async () => {
    const reply = 'a'.repeat(3999) + '😀';
    for (let index = 0; index < 10; index += 1) store.recordModelConnectionTest(connection(), result(`synthetic-model-${index}`, reply));
    store.recordModelConnectionTest(connection(), result(LIGHTER, reply));
    const kept = connection().connectionTests!;
    expect(kept).toHaveLength(8);
    expect(kept[0]!.modelId).toBe(LIGHTER);
    expect(kept.every((entry) => (entry.responseText ?? '').length === 3999 && entry.responseText!.isWellFormed())).toBe(true);
    expect(JSON.stringify(kept[0]).length).toBeLessThan(8_192);
    // What is stored is the newest of the others, and the store opens on it.
    await reopen();
    expect(models()).toEqual(['synthetic-model-9']);
  });
});
