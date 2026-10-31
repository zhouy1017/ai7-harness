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

describe('the connection test on the admitted channels', () => {
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
